// 管理者用「UID移行・重複修復」の計画を作る純粋関数群（2026-09-22新設・本人指示 第8回）。Firebase には触れない。
//
// 【目的】匿名UIDが差し替わった友達の端末を触らずに、管理者が Firebase 上のデータだけで
//   ①バックアップの持ち主（backups/{id}/currentUid）を 旧UID → 新UID へ付け替える（payload は一切変えない）
//   ②旧UID名義のランキング記録のうち「新UID側に同等以上の記録がある」ものだけを消す
//   ③旧UID名義の公開プロフィールを「新UID側が存在する」場合だけ消す
// を安全に行えるよう、「候補の検出 → 証拠 → 計画（dry-run）」をここで作る。実際の読み書きは js/adminUidRepair.js。
//
// 【同一人物の判定原則（本人指示）】表示名が同じことは「検索の手がかり」に使っても、判定の唯一の根拠にしない。
// 次の「本人以外には揃えられない一致」を組み合わせる：
//   ・ランキング記録の完全一致（同じ区分で clearTimeMs が浮動小数まで一致・missCount 一致）
//   ・バックアップ payload 内の自己ベスト（rankingCandidateBest）が新UID側のランキング記録と一致
//   ・公開プロフィールの称号一覧が完全一致
//   ・時系列（旧UIDの最終活動 ≤ 新UIDの最初の活動）
//   ・新UIDがどのバックアップの currentUid でもない（＝UIDが差し替わった端末の特徴）
// 1つでも矛盾（新UIDが別のバックアップの持ち主、時系列の逆転、候補が複数）があれば「実行不可」にする。
//
// 【2026-09-22 第9回：実機 dry-run で見つかった問題への追加ガード】
// 管理者が 08-31 に作った「予防バックアップ」（publicProfiles の称号・推しだけを payload に持つ、端末由来ではない
// backups）が、称号一覧の一致（初心者称号3個は多くの人が同じ）だけで別人（abekun）の backup と Olkya の新UIDを
// 結び付けかけた（表示名不一致と保留で実行不可にはなっていた）。以後：
//   ・候補になる条件は「本人以外には揃えられない一致（ランキングの完全一致／payload 内自己ベストの一致）が1件以上」。
//     称号一覧の一致だけでは候補にしない（レポートに「参考」として出すだけ）。
//   ・backups の出自を分類する（端末の自動バックアップ／管理者が作った予防・復旧用）。管理者作成分は本人端末が
//     その backupId を知らないため、currentUid の付け替えは行わない（旧記録・旧プロフィールの整理だけ）。
//   ・旧UIDが「まだ生きている」（新UIDの出現後にも活動がある）なら候補にしない。
//   ・同じ新UIDが、別々の旧UIDの移行先として現れたら、その新UIDに関わる候補は全て実行不可。
//   ・実行直前に全体を再スキャンし、dry-run 時の計画の指紋（fingerprint）と一致しなければ中止する。

const LEADERBOARD_DIVISION_SEPARATOR = "/";

// JSON をキー順で安定して文字列化する（payload の前後比較・ハッシュ用）。
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

// 文字列の FNV-1a（32bit）16進。crypto.subtle が無い環境の予備。
function fnv1aHex(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// payload のハッシュ（SHA-256 16進。使えなければ FNV-1a）。前後比較にだけ使う。
export async function hashPayload(payload, subtle = globalThis.crypto?.subtle) {
  const text = stableStringify(payload ?? null);
  if (subtle && typeof subtle.digest === "function") {
    try {
      const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // 予備へ
    }
  }
  return `fnv-${fnv1aHex(text)}-${text.length}`;
}

export function shortUid(uid) {
  return typeof uid === "string" && uid.length > 6 ? `…${uid.slice(-6)}` : String(uid ?? "");
}

function sortedIds(list) {
  return Array.isArray(list) ? [...list].filter((id) => typeof id === "string").sort() : [];
}

// backups/{id}/payload（Firebase 用にキーのドットを "~" に置換した { 論理キー: JSON文字列 }）から
// rankingCandidateBest（{ schemaVersion, bestsByCombo: { "variant.count.category": {...} } }）を取り出す。
export function extractRankingCandidateBests(payload) {
  if (!payload || typeof payload !== "object") return {};
  const raw = payload["rankingCandidateBest"] ?? payload["rankingCandidateBest".replace(/\./g, "~")];
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.bestsByCombo === "object" && parsed.bestsByCombo ? parsed.bestsByCombo : {};
  } catch {
    return {};
  }
}

// backups の出自を分類する。
//   "device"        … 端末の自動バックアップ（js/backupSync.js buildBackupPayload：publicProfile.enabled 等を含む）
//   "admin-created" … 管理者が publicProfiles から作った予防／復旧用（payload が achievements と oshiMembers だけ。
//                     js/backupAdmin.js adminCreatePreventiveBackup／adminRestoreAchievementsFromPublicProfile）
//   "empty"         … payload が無い・空
export function classifyBackupOrigin(backup) {
  const payload = backup?.payload;
  if (!payload || typeof payload !== "object") return "empty";
  const keys = Object.keys(payload);
  if (keys.length === 0) return "empty";
  const adminOnlyKeys = new Set(["achievements", "oshiMembers"]);
  return keys.every((key) => adminOnlyKeys.has(key)) ? "admin-created" : "device";
}

export function describeBackupOrigin(origin) {
  if (origin === "admin-created") return "管理者作成（予防／復旧用。端末のデータではない）";
  if (origin === "device") return "端末の自動バックアップ";
  return "内容なし";
}

// 旧UIDの「最後の活動時刻」と新UIDの「最初の活動時刻」を、公開プロフィール・presence・ランキング記録から求める。
function resolveActivityWindow({ oldUid, newUid, backup, publicProfiles, leaderboards, presence }) {
  const oldTimes = [presence?.[oldUid]?.lastSeen, publicProfiles?.[oldUid]?.updatedAt];
  const newTimes = [presence?.[newUid]?.lastSeen, publicProfiles?.[newUid]?.updatedAt];
  // 端末バックアップの updatedAt は旧UID端末の活動時刻。管理者作成分は管理者の操作時刻なので含めない
  if (classifyBackupOrigin(backup) === "device") oldTimes.push(backup?.updatedAt);
  Object.values(leaderboards ?? {}).forEach((entries) => {
    const oldEntry = entries?.[oldUid];
    const newEntry = entries?.[newUid];
    if (typeof oldEntry?.achievedAt === "number") oldTimes.push(oldEntry.achievedAt);
    if (typeof newEntry?.achievedAt === "number") newTimes.push(newEntry.achievedAt);
  });
  return { oldLast: maxNumber(oldTimes), newFirst: minNumber(newTimes) };
}

// 候補の「計画の指紋」。dry-run と実行直前の再スキャンで同じでなければ実行しない（本人指示 G）。
export function computeCandidateFingerprint(candidate) {
  if (!candidate) return null;
  return stableStringify({
    backupId: candidate.backupId,
    oldUid: candidate.oldUid,
    newUid: candidate.newUid,
    rebind: candidate.rebindPlan?.action ?? null,
    currentUid: candidate.backup?.currentUid ?? null,
    updatedAt: candidate.backup?.updatedAt ?? null,
    leaderboard: (candidate.leaderboardPlan ?? []).map((p) => [p.division, p.action, p.oldEntry?.clearTimeMs ?? null, p.newEntry?.clearTimeMs ?? null]),
    profile: candidate.profilePlan?.action ?? null,
    executable: Boolean(candidate.executable),
  });
}

function divisionKeyToComboKey(divisionKey) {
  // "intro/5/title-track" → "intro.5.title-track"（rankingCandidateStore の combo キー）
  return divisionKey.split(LEADERBOARD_DIVISION_SEPARATOR).join(".");
}

function isSameRecord(a, b) {
  return (
    a &&
    b &&
    typeof a.clearTimeMs === "number" &&
    typeof b.clearTimeMs === "number" &&
    a.clearTimeMs === b.clearTimeMs &&
    (a.missCount ?? 0) === (b.missCount ?? 0)
  );
}

function maxNumber(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  return nums.length ? Math.max(...nums) : null;
}
function minNumber(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  return nums.length ? Math.min(...nums) : null;
}

// 旧UID→新UID のペアについて証拠を集める（純粋）。
export function collectPairEvidence({ backupId, backup, oldUid, newUid, publicProfiles, leaderboards, presence, backupCurrentUids }) {
  const oldProfile = publicProfiles?.[oldUid] ?? null;
  const newProfile = publicProfiles?.[newUid] ?? null;
  const evidence = [];
  const risks = [];

  if (backupCurrentUids.has(newUid)) {
    risks.push(`新ID ${shortUid(newUid)} は別のバックアップの持ち主です（別人の可能性）`);
  }

  // ランキング記録の完全一致
  const leaderboardMatches = [];
  const leaderboardDivisions = [];
  Object.entries(leaderboards ?? {}).forEach(([division, entries]) => {
    const oldEntry = entries?.[oldUid] ?? null;
    const newEntry = entries?.[newUid] ?? null;
    if (!oldEntry && !newEntry) return;
    leaderboardDivisions.push({ division, oldEntry, newEntry, exactMatch: isSameRecord(oldEntry, newEntry) });
    if (isSameRecord(oldEntry, newEntry)) leaderboardMatches.push(division);
  });
  if (leaderboardMatches.length > 0) {
    evidence.push(`ランキング記録が完全一致（${leaderboardMatches.length}区分：${leaderboardMatches.join("、")}）`);
  }

  // バックアップ payload の自己ベスト（旧UID端末の中身）と、新UID名義のランキング記録の一致
  const bests = extractRankingCandidateBests(backup?.payload);
  const payloadMatches = [];
  Object.entries(leaderboards ?? {}).forEach(([division, entries]) => {
    const newEntry = entries?.[newUid] ?? null;
    const best = bests[divisionKeyToComboKey(division)] ?? null;
    if (newEntry && best && typeof best.clearTimeMs === "number" && best.clearTimeMs === newEntry.clearTimeMs) {
      payloadMatches.push(division);
    }
  });
  if (payloadMatches.length > 0) {
    evidence.push(`バックアップ内の自己ベストが新IDのランキング記録と一致（${payloadMatches.length}区分）`);
  }

  // 公開プロフィールの称号一覧
  let profileAchievementsEqual = false;
  if (oldProfile && newProfile) {
    const oldIds = sortedIds(oldProfile.unlockedAchievementIds);
    const newIds = sortedIds(newProfile.unlockedAchievementIds);
    const flagsEqual =
      Boolean(oldProfile.hasEqualLoveComplete) === Boolean(newProfile.hasEqualLoveComplete) &&
      Boolean(oldProfile.hasEqualLoveMaster) === Boolean(newProfile.hasEqualLoveMaster) &&
      Boolean(oldProfile.hasNoMissMaster) === Boolean(newProfile.hasNoMissMaster);
    profileAchievementsEqual = flagsEqual && JSON.stringify(oldIds) === JSON.stringify(newIds);
    if (profileAchievementsEqual) evidence.push(`公開プロフィールの称号一覧が完全一致（${newIds.length}個）`);
    else risks.push("公開プロフィールの称号一覧が一致しません");
  }
  if (newProfile && typeof backup?.achievementCount === "number") {
    const count = sortedIds(newProfile.unlockedAchievementIds).length;
    if (count === backup.achievementCount) evidence.push(`バックアップの称号数（${count}）が新IDの公開プロフィールと一致`);
  }

  // 表示名（手がかりのみ）
  const backupName = typeof backup?.displayName === "string" ? backup.displayName : null;
  const newName = typeof newProfile?.displayName === "string" ? newProfile.displayName : null;
  if (backupName && newName) {
    if (backupName === newName) evidence.push(`表示名が一致（「${newName}」※単独では根拠にしない）`);
    else risks.push(`表示名が異なります（バックアップ「${backupName}」／新ID「${newName}」）`);
  }

  // 時系列：旧UIDの最終活動（公開プロフィール・presence・旧ランキング記録・端末バックアップ）≤ 新UIDの最初の活動。
  // 逆なら「旧UIDはまだ生きている別人」の可能性が高い（第9回追加：旧記録の achievedAt も含める）。
  const { oldLast, newFirst } = resolveActivityWindow({ oldUid, newUid, backup, publicProfiles, leaderboards, presence });
  if (oldLast !== null && newFirst !== null) {
    if (oldLast <= newFirst) evidence.push("時系列が自然（旧IDの最終活動 → その後に新IDが出現）");
    else risks.push("時系列が不自然（旧IDに新IDの出現後の活動があります＝旧IDはまだ使われている別人の可能性）");
  }

  const backupOrigin = classifyBackupOrigin(backup);
  const hardEvidenceCount = leaderboardMatches.length + payloadMatches.length;
  const strong =
    risks.length === 0 &&
    hardEvidenceCount >= 1 &&
    (profileAchievementsEqual || (!oldProfile && payloadMatches.length >= 1));
  if (!strong && risks.length === 0) {
    risks.push("同一人物と断定できる証拠が不足しています（ランキング／バックアップの一致と称号一覧の一致が必要）");
  }

  return {
    backupId,
    oldUid,
    newUid,
    evidence,
    risks,
    strong,
    backupOrigin,
    hardEvidenceCount,
    oldLastActivityAt: oldLast,
    newFirstActivityAt: newFirst,
    leaderboardDivisions,
    leaderboardMatchCount: leaderboardMatches.length,
    payloadMatchCount: payloadMatches.length,
    profileAchievementsEqual,
    oldProfileExists: Boolean(oldProfile),
    newProfileExists: Boolean(newProfile),
    oldPresenceExists: Boolean(presence?.[oldUid]),
  };
}

// 旧UID名義のランキング記録1件について「安全に消せるか」を決める（純粋）。
//   deleteOld … 新UID側に同等以上（同タイム以下・ミス0）の記録がある → 消しても最良記録は失われない
//   hold      … それ以外（新側が無い／旧の方が速い／比較できない）→ 絶対に自動削除しない（要個別対応）
export function planOldLeaderboardEntry(oldEntry, newEntry) {
  if (!oldEntry || typeof oldEntry.clearTimeMs !== "number") return { action: "none", reason: "旧IDの記録なし" };
  if (!newEntry || typeof newEntry.clearTimeMs !== "number") return { action: "hold", reason: "新IDに記録が無い（管理者は新ID名義で書けないため保留）" };
  if ((newEntry.missCount ?? 0) !== 0) return { action: "hold", reason: "新IDの記録のミス数が0ではない" };
  if (newEntry.clearTimeMs < oldEntry.clearTimeMs) return { action: "deleteOld", reason: "新IDの方が速い（旧を消しても最良記録は残る）" };
  if (newEntry.clearTimeMs === oldEntry.clearTimeMs) return { action: "deleteOld", reason: "同一タイム（旧を消しても最良記録は残る）" };
  return { action: "hold", reason: "旧IDの方が速い（管理者は新ID名義へ複製できないため保留）" };
}

// スナップショット全体から修復候補を作る（純粋）。
//   snapshot = { backups: {id: raw}, publicProfiles: {uid: profile}, leaderboards: {division: {uid: entry}}, presence: {uid: {...}} }
// 戻り値: candidates[]（各 { ...evidence, backup: 概要, leaderboardPlan, profilePlan, presencePlan, executable, blockers }）
export function buildUidRepairCandidates(snapshot) {
  const backups = snapshot?.backups ?? {};
  const publicProfiles = snapshot?.publicProfiles ?? {};
  const leaderboards = snapshot?.leaderboards ?? {};
  const presence = snapshot?.presence ?? {};
  const backupCurrentUids = new Set(
    Object.values(backups)
      .map((b) => b?.currentUid)
      .filter((uid) => typeof uid === "string" && uid)
  );
  // 「UIDが差し替わった端末」の特徴：公開プロフィール（または ランキング記録）はあるのに、どのバックアップの持ち主でもない
  const leaderboardUids = new Set();
  Object.values(leaderboards).forEach((entries) => Object.keys(entries ?? {}).forEach((uid) => leaderboardUids.add(uid)));
  const unboundUids = [...new Set([...Object.keys(publicProfiles), ...leaderboardUids])].filter((uid) => !backupCurrentUids.has(uid));

  const candidates = [];
  Object.entries(backups).forEach(([backupId, backup]) => {
    const oldUid = backup?.currentUid;
    if (typeof oldUid !== "string" || !oldUid) return;
    // 【第9回】候補になる条件＝本人以外には揃えられない一致（ランキング完全一致／payload 内自己ベスト一致）が1件以上。
    // 称号一覧の一致だけ（初心者称号は多くの人が同じ）では候補にしない（レポートの「参考」にのみ残す）。
    const pairs = unboundUids
      .filter((newUid) => newUid !== oldUid)
      .map((newUid) =>
        collectPairEvidence({ backupId, backup, oldUid, newUid, publicProfiles, leaderboards, presence, backupCurrentUids })
      )
      .filter((pair) => pair.hardEvidenceCount > 0);
    if (pairs.length === 0) return;

    const strongPairs = pairs.filter((pair) => pair.strong);
    // 有力な候補が複数あれば（同じ人が3つのUIDを経た等）曖昧＝実行不可。1つだけなら採用。
    const chosen = strongPairs.length === 1 ? strongPairs[0] : pairs.sort((a, b) => b.evidence.length - a.evidence.length)[0];
    const blockers = [...chosen.risks];
    if (strongPairs.length > 1) blockers.push(`同一人物の候補が複数あります（${strongPairs.map((p) => shortUid(p.newUid)).join("、")}）`);
    if (!chosen.strong && strongPairs.length === 0 && chosen.risks.length === 0) blockers.push("証拠不足");

    const leaderboardPlan = chosen.leaderboardDivisions
      .filter((d) => d.oldEntry)
      .map((d) => ({ division: d.division, oldEntry: d.oldEntry, newEntry: d.newEntry, ...planOldLeaderboardEntry(d.oldEntry, d.newEntry) }));
    const holdCount = leaderboardPlan.filter((p) => p.action === "hold").length;
    if (holdCount > 0) blockers.push(`ランキング${holdCount}区分が保留（要個別対応）のため、この候補は一括実行できません`);

    // 【第9回】backups の出自で付け替えの扱いを変える。管理者作成（予防／復旧用）は本人端末が backupId を知らないため、
    // 付け替えても本人端末の同期は復旧しない（別の backupId を新規に作るだけ）。付け替えはせず、旧記録・旧プロフィールの整理だけ行う。
    const rebindPlan =
      chosen.backupOrigin === "device"
        ? { action: "rebind", reason: "端末の自動バックアップ。currentUid を新IDへ付け替えると本人端末の同期が復旧する" }
        : { action: "skip", reason: `${describeBackupOrigin(chosen.backupOrigin)}のため付け替えない（本人端末はこの backupId を持たない）` };

    let profilePlan = { action: "none", reason: "旧IDの公開プロフィールなし" };
    if (chosen.oldProfileExists) {
      profilePlan = chosen.newProfileExists
        ? { action: "deleteOld", reason: "新IDの公開プロフィールが存在する" }
        : { action: "hold", reason: "新IDの公開プロフィールが無い（消すと一覧から消える）" };
      if (profilePlan.action === "hold") blockers.push("旧IDの公開プロフィールを消せない（新ID側が無い）");
    }
    const presencePlan = chosen.oldPresenceExists
      ? { action: "successor", reason: "管理者は presence を消せない（Rules）。付け替え後、本人の端末が次に起動したときに後継者として自動で消える" }
      : { action: "none", reason: "旧IDの presence なし" };

    candidates.push({
      ...chosen,
      backup: {
        backupId,
        currentUid: oldUid,
        origin: chosen.backupOrigin,
        originLabel: describeBackupOrigin(chosen.backupOrigin),
        displayName: backup?.displayName ?? null,
        oshiMemberId: backup?.oshiMemberId ?? null,
        achievementCount: backup?.achievementCount ?? null,
        updatedAt: backup?.updatedAt ?? null,
        schemaVersion: backup?.schemaVersion ?? null,
        hasOwnerSecret: typeof backup?.ownerSecret === "string" && backup.ownerSecret.length > 0,
        previousUids: backup?.previousUids && typeof backup.previousUids === "object" ? Object.keys(backup.previousUids) : [],
        payloadKeyCount: backup?.payload && typeof backup.payload === "object" ? Object.keys(backup.payload).length : 0,
      },
      newProfile: publicProfiles[chosen.newUid] ?? null,
      rebindPlan,
      leaderboardPlan,
      profilePlan,
      presencePlan,
      blockers,
      executable: blockers.length === 0,
    });
  });

  // 【第9回】候補どうしの整合性：同じ新UIDが「別々の旧UID」の移行先に現れたら、その新UIDに関わる候補は全て実行不可
  // （1人の現在UIDが、独立した複数人のバックアップの持ち主候補になっている＝別人を混ぜる危険）。
  // 同じ旧UIDの backups が複数（端末バックアップ＋予防バックアップ）は同一人物なので許容する。
  const oldUidsByNewUid = new Map();
  candidates.forEach((c) => {
    if (!oldUidsByNewUid.has(c.newUid)) oldUidsByNewUid.set(c.newUid, new Set());
    oldUidsByNewUid.get(c.newUid).add(c.oldUid);
  });
  candidates.forEach((c) => {
    const oldUids = oldUidsByNewUid.get(c.newUid);
    if (oldUids && oldUids.size > 1) {
      c.blockers.push(`新ID ${shortUid(c.newUid)} が別々の旧ID（${[...oldUids].map(shortUid).join("、")}）の移行先として現れています（別人を混ぜる危険）`);
      c.executable = false;
    }
  });
  candidates.forEach((c) => {
    c.fingerprint = computeCandidateFingerprint(c);
  });
  return candidates;
}

// 【第9回】管理者が読んだスナップショット全体の「調査レポート」（UID・backupId は末尾6文字だけ）。
// 実行判断の材料として、候補にならなかった弱い一致（称号一覧だけ等）も「参考」として載せる。
export function buildUidRepairInvestigationReport(snapshot, candidates = buildUidRepairCandidates(snapshot)) {
  const backups = snapshot?.backups ?? {};
  const publicProfiles = snapshot?.publicProfiles ?? {};
  const leaderboards = snapshot?.leaderboards ?? {};
  const presence = snapshot?.presence ?? {};
  const fmt = (ms) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + "Z" : "—");
  const lines = [];
  lines.push(`# UID修復 調査レポート（${new Date().toISOString().slice(0, 16)}Z、IDは末尾6文字のみ）`);
  lines.push(`backups ${Object.keys(backups).length} 件 / publicProfiles ${Object.keys(publicProfiles).length} 件 / presence ${Object.keys(presence).length} 件 / ランキング区分 ${Object.keys(leaderboards).length}`);

  const backupCurrentUids = new Set(Object.values(backups).map((b) => b?.currentUid).filter(Boolean));
  lines.push("");
  lines.push("## backups（backupId末尾 | currentUid末尾 | 出自 | updatedAt | 称号数 | payloadキー数 | ownerSecret | previousUids | 名前）");
  Object.entries(backups)
    .sort((a, b) => (b[1]?.updatedAt ?? 0) - (a[1]?.updatedAt ?? 0))
    .forEach(([id, b]) => {
      const prev = b?.previousUids && typeof b.previousUids === "object" ? Object.keys(b.previousUids).map(shortUid).join("+") : "—";
      lines.push(`- ${shortUid(id)} | ${shortUid(b?.currentUid)} | ${classifyBackupOrigin(b)} | ${fmt(b?.updatedAt)} | ${b?.achievementCount ?? "?"} | ${b?.payload ? Object.keys(b.payload).length : 0} | ${typeof b?.ownerSecret === "string" ? "あり" : "なし"} | ${prev} | ${b?.displayName ?? "—"}`);
    });

  lines.push("");
  lines.push("## publicProfiles（uid末尾 | 名前 | 推し | 称号数 | updatedAt | presence lastSeen | backupあり）");
  Object.entries(publicProfiles)
    .sort((a, b) => (b[1]?.updatedAt ?? 0) - (a[1]?.updatedAt ?? 0))
    .forEach(([uid, p]) => {
      lines.push(`- ${shortUid(uid)} | ${p?.displayName ?? "—"} | ${p?.oshiMemberId ?? "—"} | ${Array.isArray(p?.unlockedAchievementIds) ? p.unlockedAchievementIds.length : 0} | ${fmt(p?.updatedAt)} | ${fmt(presence?.[uid]?.lastSeen)} | ${backupCurrentUids.has(uid) ? "はい" : "いいえ"}`);
    });

  lines.push("");
  lines.push("## ランキング（区分 | uid末尾:秒 …）");
  Object.entries(leaderboards).forEach(([division, entries]) => {
    const cells = Object.entries(entries ?? {})
      .sort((a, b) => (a[1]?.clearTimeMs ?? 0) - (b[1]?.clearTimeMs ?? 0))
      .map(([uid, e]) => `${shortUid(uid)}:${typeof e?.clearTimeMs === "number" ? (e.clearTimeMs / 1000).toFixed(2) : "?"}${e?.identityKey ? "(k)" : ""}`);
    lines.push(`- ${division} | ${cells.join(" ")}`);
  });

  lines.push("");
  lines.push("## 逆引き：新UID → 候補（backupId末尾 / 旧UID末尾 / 実行可否）");
  const byNew = new Map();
  candidates.forEach((c) => {
    if (!byNew.has(c.newUid)) byNew.set(c.newUid, []);
    byNew.get(c.newUid).push(c);
  });
  byNew.forEach((list, newUid) => {
    lines.push(`- ${shortUid(newUid)} ← ${list.map((c) => `${shortUid(c.backupId)}/${shortUid(c.oldUid)}/${c.executable ? "可" : "不可"}`).join("、")}${list.length > 1 && new Set(list.map((c) => c.oldUid)).size > 1 ? "  ※別々の旧UIDから同じ新UIDへ（全て実行不可）" : ""}`);
  });

  lines.push("");
  lines.push("## 候補の詳細");
  candidates.forEach((c) => {
    lines.push(`### ${c.backup.displayName ?? "—"}：旧 ${shortUid(c.oldUid)} → 新 ${shortUid(c.newUid)}（backup ${shortUid(c.backupId)}、${c.backup.originLabel}）${c.executable ? "✅実行可能" : "⛔実行不可"}`);
    lines.push(`- 旧IDの最終活動 ${fmt(c.oldLastActivityAt)} / 新IDの最初の活動 ${fmt(c.newFirstActivityAt)}`);
    c.evidence.forEach((e) => lines.push(`- ✔ ${e}`));
    c.blockers.forEach((b) => lines.push(`- ✖ ${b}`));
    lines.push(`- ① 付け替え：${c.rebindPlan.action}（${c.rebindPlan.reason}）`);
    c.leaderboardPlan.forEach((p) => lines.push(`- ② ${p.division}：${p.action}（旧 ${p.oldEntry?.clearTimeMs ?? "—"} / 新 ${p.newEntry?.clearTimeMs ?? "—"}）`));
    lines.push(`- ③ 旧公開プロフィール：${c.profilePlan.action}`);
    lines.push(`- ④ 旧presence：${c.presencePlan.action}`);
  });

  // 参考：候補にならなかった弱い一致（称号一覧だけ一致など）
  lines.push("");
  lines.push("## 参考：候補外の弱い一致（称号一覧の一致だけ等。実行対象にはしない）");
  const unbound = Object.keys(publicProfiles).filter((uid) => !backupCurrentUids.has(uid));
  Object.entries(backups).forEach(([backupId, backup]) => {
    const oldUid = backup?.currentUid;
    if (!oldUid) return;
    unbound
      .filter((newUid) => newUid !== oldUid)
      .forEach((newUid) => {
        const pair = collectPairEvidence({ backupId, backup, oldUid, newUid, publicProfiles, leaderboards, presence, backupCurrentUids });
        if (pair.hardEvidenceCount === 0 && pair.profileAchievementsEqual) {
          lines.push(`- backup ${shortUid(backupId)}（${backup?.displayName ?? "—"}、旧 ${shortUid(oldUid)}）× 新 ${shortUid(newUid)}（${publicProfiles[newUid]?.displayName ?? "—"}）：称号一覧のみ一致（強い証拠なし）`);
        }
      });
  });
  return lines.join("\n");
}

// 付け替えの書き込み内容（root からの update 用。payload・updatedAt・schemaVersion には触れない）。
// ownerSecret は null にする：旧端末が持っていた（クラウドに保存済みの）ownerSecret を無効化し、
// 本人の端末が次回同期で自分の ownerSecret を新規保存できるようにする（復旧承認と同じ扱い）。
export function buildBackupRebindWrites({ backupId, oldUid, newUid, serverTimestampValue }) {
  return {
    [`backups/${backupId}/currentUid`]: newUid,
    [`backups/${backupId}/previousUids/${oldUid}`]: serverTimestampValue,
    [`backups/${backupId}/ownerSecret`]: null,
  };
}

// 付け替え後の読み戻し検証（純粋）。before/after は backups/{id} の生データ。
export function evaluateRebindReadBack({ before, after, oldUid, newUid, hashBefore, hashAfter }) {
  const problems = [];
  if (after?.currentUid !== newUid) problems.push(`currentUid が新IDになっていません（${shortUid(after?.currentUid)}）`);
  if (typeof after?.previousUids?.[oldUid] !== "number") problems.push("previousUids に旧IDが記録されていません");
  if (hashBefore !== hashAfter) problems.push("payload のハッシュが実行前後で一致しません");
  if ((before?.updatedAt ?? null) !== (after?.updatedAt ?? null)) problems.push("updatedAt が変わっています");
  if ((before?.schemaVersion ?? null) !== (after?.schemaVersion ?? null)) problems.push("schemaVersion が変わっています");
  if (after?.ownerSecret !== undefined && after?.ownerSecret !== null) problems.push("ownerSecret が残っています");
  return { ok: problems.length === 0, problems };
}
