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

  // 時系列：旧UIDの最終活動 ≤ 新UIDの最初の活動
  const oldLast = maxNumber([presence?.[oldUid]?.lastSeen, oldProfile?.updatedAt, backup?.updatedAt]);
  const newFirst = minNumber([
    newProfile?.updatedAt,
    ...leaderboardDivisions.map((d) => d.newEntry?.achievedAt),
    presence?.[newUid]?.lastSeen,
  ]);
  if (oldLast !== null && newFirst !== null) {
    if (oldLast <= newFirst) evidence.push("時系列が自然（旧IDの最終活動 → その後に新IDが出現）");
    else risks.push("時系列が不自然（新IDの活動が旧IDの最終活動より前にあります）");
  }

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
    const pairs = unboundUids
      .filter((newUid) => newUid !== oldUid)
      .map((newUid) =>
        collectPairEvidence({ backupId, backup, oldUid, newUid, publicProfiles, leaderboards, presence, backupCurrentUids })
      )
      .filter((pair) => pair.leaderboardMatchCount + pair.payloadMatchCount > 0 || pair.profileAchievementsEqual);
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
        displayName: backup?.displayName ?? null,
        oshiMemberId: backup?.oshiMemberId ?? null,
        achievementCount: backup?.achievementCount ?? null,
        updatedAt: backup?.updatedAt ?? null,
        schemaVersion: backup?.schemaVersion ?? null,
        payloadKeyCount: backup?.payload && typeof backup.payload === "object" ? Object.keys(backup.payload).length : 0,
      },
      newProfile: publicProfiles[chosen.newUid] ?? null,
      leaderboardPlan,
      profilePlan,
      presencePlan,
      blockers,
      executable: blockers.length === 0,
    });
  });
  return candidates;
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
