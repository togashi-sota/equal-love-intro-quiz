// 「以前のあなた」と「現在のあなた」のデータ比較と、整理（統合）の計画を作る純粋関数（2026-10-28新設）。
// Firebase・DOM・localStorage には一切触れない（tests/accountPermanentFix.test.js から直接検証する）。
//
// 【どのデータがどこにあるか（設計どおりの分担）】
//   ・称号・プレイ履歴・自己ベスト・推しメン・苦手曲の集計・お気に入り等（個人の記録）
//       → この端末の localStorage が正本。UIDではなく backupId 単位で backups/{backupId}/payload にバックアップされる。
//         つまり「UIDが変わった」だけでは個人の記録は分かれない（端末に残っている）。分かれるのは
//         「端末の記録が消えた・別の端末／Safari とホーム画面アプリで別々に遊んだ」ときで、そのとき
//         クラウドのバックアップ（以前のあなた）とこの端末（現在のあなた）の中身が食い違う。
//   ・フレンドのカード（publicProfiles/{UID}）・ランキング（timeAttackLeaderboardsV3/…/{UID}）・
//     オンライン表示（presence/{UID}）・管理者（admins/{UID}）
//       → UIDごとに保存される。UIDが変わると旧UID名義の分が残る（＝「以前のID」と「今のID」に分かれる）。
// このファイルは前者（バックアップ⇔端末）の比較・統合計画を作る。後者のランキングは js/backupOwnership.js の
// planLeaderboardMerge（区分ごとに速い方を1件）と同じ考え方で比較する（compareLeaderboardDivisions）。
//
// 【統合の決まり（本人指示）】
//   ・称号 … 両方の和集合。取得日は早い方
//   ・自己ベスト … 区分ごとに良い方（合計はしない）
//   ・プレイ履歴 … 両方の和集合（同じ記録は id で1件に。id が無ければ日時＋内容で判定）。新しい順、各履歴の上限は既存と同じ
//   ・累積の回数（苦手曲の集計など） … 1回ずつの記録が無く二重に数えてしまうため足さない。曲ごとに回数が多い方を採用
//   ・推しメン … 現在の選択を優先（以前の選択は計画・スナップショットに残す）
//   ・設定に近いもの（お気に入り・公開設定など） … 現在を優先。現在に無いときだけ以前の値を入れる
//   ・自作のもの（プレイリスト・オリジナル問題のセット） … id ごとの和集合（同じ id は現在を優先）
//   ・壊れていて読めない値 … 触らない（現在を残す）

export const HISTORY_LIMITS = Object.freeze({ playHistory: 100, unifiedPlayHistory: 2000, timeAttackHistory: 100 });

const LOWER_IS_BETTER_PREFIXES = ["normalQuizTimeBest.", "outroQuizTimeBest.", "timeAttackBest.", "randomPlaybackBest."];
const REACH_PREFIXES = ["timeAttackBestReach.", "randomPlaybackBestReach."];
const COUNTER_KEYS = ["weakSongStats", "shuffleWeakSongStats", "outroWeakSongStats", "lyricsQuizWeakSongStats", "instantChallengeWeakSongStats"];
const HISTORY_KEYS = Object.keys(HISTORY_LIMITS);

// 論理キー（js/backupSync.js の BACKUP_KEY_* と同じ名前）をデータの種類に分ける。
export function classifyBackupKey(key) {
  if (key === "achievements") return "achievements";
  if (HISTORY_KEYS.includes(key)) return "history";
  if (key.startsWith("highScore.")) return "best-higher";
  if (REACH_PREFIXES.some((p) => key.startsWith(p))) return "best-reach"; // timeAttackBest. より先に判定する
  if (LOWER_IS_BETTER_PREFIXES.some((p) => key.startsWith(p))) return "best-lower";
  if (key.startsWith("lyricsQuizBest.")) return "best-custom";
  if (key === "rankingCandidateBest") return "ranking-candidates";
  if (COUNTER_KEYS.includes(key)) return "counters";
  if (key === "instantChallengeClears") return "clears";
  if (key === "oshiMembers") return "oshi";
  if (key === "playlists" || key === "customQuizPresets") return "creations";
  return "setting";
}

export const CATEGORY_LABELS = Object.freeze({
  achievements: "称号",
  history: "プレイ履歴",
  "best-higher": "自己ベスト（得点）",
  "best-lower": "自己ベスト（タイム）",
  "best-reach": "自己ベスト（到達記録）",
  "best-custom": "自己ベスト（歌詞クイズ）",
  "ranking-candidates": "ランキング候補の記録",
  counters: "苦手曲の集計（累積の回数）",
  clears: "一瞬チャレンジのクリア記録",
  oshi: "推しメン",
  creations: "自作のプレイリスト・問題セット",
  setting: "設定・お気に入り",
});

function parseJson(raw) {
  if (typeof raw !== "string") return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

function parseNumber(raw) {
  const n = Number(raw);
  return typeof raw === "string" && raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

function isoMin(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta)) return b;
  if (!Number.isFinite(tb)) return a;
  return ta <= tb ? a : b;
}

// 履歴1件の同一判定キー（id があれば id、無ければ日時＋内容）。
function historyEntryKey(entry) {
  if (entry && typeof entry.id === "string" && entry.id) return `id:${entry.id}`;
  return `t:${entry?.playedAt ?? ""}|${entry?.modeId ?? entry?.questionCountValue ?? ""}|${entry?.score ?? entry?.totalElapsedMs ?? ""}`;
}

// ---- 種類ごとの「比較」と「統合」 ----
// 戻り値：{ onlyPrevious: number, onlyCurrent: number, conflicts: [{ item, previous, current, chosen }], same: number,
//          mergedRaw: string|null（統合後に保存する値。null＝現在のまま）, notes: string[] }

function mergeAchievements(prevRaw, curRaw) {
  const p = parseJson(prevRaw);
  const c = parseJson(curRaw);
  if (!c.ok && curRaw !== undefined) return { unreadable: true };
  const prev = p.ok && p.value ? p.value : { unlockedAchievementIds: [], unlockedAtById: {} };
  const cur = c.ok && c.value ? c.value : { schemaVersion: prev.schemaVersion ?? 1, unlockedAchievementIds: [], unlockedAtById: {} };
  const prevIds = Array.isArray(prev.unlockedAchievementIds) ? prev.unlockedAchievementIds.filter((id) => typeof id === "string") : [];
  const curIds = Array.isArray(cur.unlockedAchievementIds) ? cur.unlockedAchievementIds.filter((id) => typeof id === "string") : [];
  const prevAt = prev.unlockedAtById && typeof prev.unlockedAtById === "object" ? prev.unlockedAtById : {};
  const curAt = cur.unlockedAtById && typeof cur.unlockedAtById === "object" ? cur.unlockedAtById : {};
  const onlyPrevious = prevIds.filter((id) => !curIds.includes(id));
  const onlyCurrent = curIds.filter((id) => !prevIds.includes(id));
  const conflicts = [];
  const mergedAt = { ...curAt };
  [...new Set([...prevIds, ...curIds])].forEach((id) => {
    const chosen = isoMin(prevAt[id] ?? null, curAt[id] ?? null);
    if (prevAt[id] && curAt[id] && prevAt[id] !== curAt[id]) conflicts.push({ item: id, previous: prevAt[id], current: curAt[id], chosen });
    if (chosen) mergedAt[id] = chosen;
  });
  const mergedIds = [...curIds, ...onlyPrevious];
  const changed = onlyPrevious.length > 0 || conflicts.some((x) => x.chosen !== x.current);
  return {
    onlyPrevious: onlyPrevious.length,
    onlyCurrent: onlyCurrent.length,
    conflicts,
    same: curIds.length - onlyCurrent.length,
    mergedRaw: changed ? JSON.stringify({ ...cur, unlockedAchievementIds: mergedIds, unlockedAtById: mergedAt }) : null,
    notes: onlyPrevious.length ? [`以前だけにある称号 ${onlyPrevious.length}個を加えます（取得日は早い方）`] : [],
  };
}

function mergeHistory(key, prevRaw, curRaw) {
  const p = parseJson(prevRaw);
  const c = parseJson(curRaw);
  if (!c.ok && curRaw !== undefined) return { unreadable: true };
  const prevEntries = p.ok && Array.isArray(p.value?.entries) ? p.value.entries : [];
  const cur = c.ok && c.value && Array.isArray(c.value.entries) ? c.value : { schemaVersion: p.value?.schemaVersion ?? 1, entries: [] };
  const curKeys = new Set(cur.entries.map(historyEntryKey));
  const prevKeys = new Set(prevEntries.map(historyEntryKey));
  const onlyPrevious = prevEntries.filter((e) => !curKeys.has(historyEntryKey(e)));
  const onlyCurrent = cur.entries.filter((e) => !prevKeys.has(historyEntryKey(e)));
  const limit = HISTORY_LIMITS[key] ?? 100;
  const merged = [...cur.entries, ...onlyPrevious]
    .map((e, index) => ({ e, index }))
    .sort((a, b) => (Number(b.e?.playedAt) || 0) - (Number(a.e?.playedAt) || 0) || a.index - b.index)
    .map((x) => x.e)
    .slice(0, limit);
  const willDrop = cur.entries.length + onlyPrevious.length - merged.length;
  return {
    onlyPrevious: onlyPrevious.length,
    onlyCurrent: onlyCurrent.length,
    conflicts: [],
    same: cur.entries.length - onlyCurrent.length,
    mergedRaw: onlyPrevious.length ? JSON.stringify({ ...cur, entries: merged }) : null,
    notes: [
      ...(onlyPrevious.length ? [`以前だけにある履歴 ${onlyPrevious.length}件を加えます（同じ記録は1件に）`] : []),
      ...(willDrop > 0 ? [`保存できる件数（${limit}件）を超えるため、古い ${willDrop}件は入りません`] : []),
    ],
  };
}

function mergeScalarBest(prevRaw, curRaw, betterIsLower) {
  const prev = parseNumber(prevRaw);
  const cur = parseNumber(curRaw);
  if (prev === null) return { onlyPrevious: 0, onlyCurrent: cur !== null ? 1 : 0, conflicts: [], same: 0, mergedRaw: null, notes: [] };
  if (cur === null) {
    if (curRaw !== undefined) return { unreadable: true };
    return { onlyPrevious: 1, onlyCurrent: 0, conflicts: [], same: 0, mergedRaw: String(prev), notes: [] };
  }
  if (prev === cur) return { onlyPrevious: 0, onlyCurrent: 0, conflicts: [], same: 1, mergedRaw: null, notes: [] };
  const prevBetter = betterIsLower ? prev < cur : prev > cur;
  const chosen = prevBetter ? prev : cur;
  return { onlyPrevious: 0, onlyCurrent: 0, conflicts: [{ item: "best", previous: prev, current: cur, chosen }], same: 0, mergedRaw: prevBetter ? String(prev) : null, notes: [] };
}

function mergeReach(prevRaw, curRaw) {
  const p = parseJson(prevRaw);
  const c = parseJson(curRaw);
  const valid = (v) => v && typeof v.questionsReached === "number" && typeof v.elapsedMs === "number";
  if (!p.ok || !valid(p.value)) return { onlyPrevious: 0, onlyCurrent: c.ok && valid(c.value) ? 1 : 0, conflicts: [], same: 0, mergedRaw: null, notes: [] };
  if (!c.ok || !valid(c.value)) {
    if (curRaw !== undefined) return { unreadable: true };
    return { onlyPrevious: 1, onlyCurrent: 0, conflicts: [], same: 0, mergedRaw: prevRaw, notes: [] };
  }
  const a = p.value;
  const b = c.value;
  if (a.questionsReached === b.questionsReached && a.elapsedMs === b.elapsedMs) return { onlyPrevious: 0, onlyCurrent: 0, conflicts: [], same: 1, mergedRaw: null, notes: [] };
  const prevBetter = a.questionsReached > b.questionsReached || (a.questionsReached === b.questionsReached && a.elapsedMs < b.elapsedMs);
  return { onlyPrevious: 0, onlyCurrent: 0, conflicts: [{ item: "reach", previous: a, current: b, chosen: prevBetter ? a : b }], same: 0, mergedRaw: prevBetter ? prevRaw : null, notes: [] };
}

// 歌詞クイズの自己ベストは比べ方が複雑（js/lyricsQuizEngine.js の compareLyricsQuizResults）なので、比較関数を受け取る。
// 無ければ「現在を残し、現在に無いときだけ以前を入れる」。
function mergeCustomBest(prevRaw, curRaw, compare) {
  const p = parseJson(prevRaw);
  const c = parseJson(curRaw);
  if (!p.ok || !p.value) return { onlyPrevious: 0, onlyCurrent: c.ok && c.value ? 1 : 0, conflicts: [], same: 0, mergedRaw: null, notes: [] };
  if (!c.ok || !c.value) {
    if (curRaw !== undefined) return { unreadable: true };
    return { onlyPrevious: 1, onlyCurrent: 0, conflicts: [], same: 0, mergedRaw: prevRaw, notes: [] };
  }
  if (prevRaw === curRaw) return { onlyPrevious: 0, onlyCurrent: 0, conflicts: [], same: 1, mergedRaw: null, notes: [] };
  let prevBetter = false;
  if (typeof compare === "function") {
    try {
      prevBetter = compare(p.value, c.value) < 0; // 負＝前の引数の方が良い（compareLyricsQuizResults と同じ向き）
    } catch {
      prevBetter = false;
    }
  }
  return {
    onlyPrevious: 0,
    onlyCurrent: 0,
    conflicts: [{ item: "lyrics", previous: p.value, current: c.value, chosen: prevBetter ? p.value : c.value }],
    same: 0,
    mergedRaw: prevBetter ? prevRaw : null,
    notes: typeof compare === "function" ? [] : ["比べ方が分からないため現在の記録を残します"],
  };
}

function mergeRankingCandidates(prevRaw, curRaw) {
  const p = parseJson(prevRaw);
  const c = parseJson(curRaw);
  if (!c.ok && curRaw !== undefined) return { unreadable: true };
  const prev = p.ok && p.value?.bestsByCombo && typeof p.value.bestsByCombo === "object" ? p.value.bestsByCombo : {};
  const cur = c.ok && c.value?.bestsByCombo && typeof c.value.bestsByCombo === "object" ? c.value : { schemaVersion: p.value?.schemaVersion ?? 1, bestsByCombo: {} };
  const merged = { ...cur.bestsByCombo };
  let onlyPrevious = 0;
  let same = 0;
  const conflicts = [];
  let changed = false;
  Object.entries(prev).forEach(([combo, entry]) => {
    if (!entry || typeof entry.clearTimeMs !== "number") return;
    const mine = cur.bestsByCombo[combo];
    if (!mine || typeof mine.clearTimeMs !== "number") {
      onlyPrevious += 1;
      merged[combo] = entry;
      changed = true;
    } else if (entry.clearTimeMs < mine.clearTimeMs) {
      conflicts.push({ item: combo, previous: entry.clearTimeMs, current: mine.clearTimeMs, chosen: entry.clearTimeMs });
      merged[combo] = entry;
      changed = true;
    } else if (entry.clearTimeMs > mine.clearTimeMs) {
      conflicts.push({ item: combo, previous: entry.clearTimeMs, current: mine.clearTimeMs, chosen: mine.clearTimeMs });
    } else same += 1;
  });
  const onlyCurrent = Object.keys(cur.bestsByCombo).filter((k) => !prev[k]).length;
  return { onlyPrevious, onlyCurrent, conflicts, same, mergedRaw: changed ? JSON.stringify({ ...cur, bestsByCombo: merged }) : null, notes: [] };
}

function counterTotal(record) {
  if (!record || typeof record !== "object") return 0;
  return Object.values(record).reduce((sum, v) => sum + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0);
}

function mergeCounters(prevRaw, curRaw) {
  const p = parseJson(prevRaw);
  const c = parseJson(curRaw);
  if (!c.ok && curRaw !== undefined) return { unreadable: true };
  const prevSongs = p.ok && p.value?.songs && typeof p.value.songs === "object" ? p.value.songs : {};
  const cur = c.ok && c.value?.songs && typeof c.value.songs === "object" ? c.value : { schemaVersion: p.value?.schemaVersion ?? 1, songs: {} };
  const merged = { ...cur.songs };
  let onlyPrevious = 0;
  let same = 0;
  const conflicts = [];
  let changed = false;
  Object.entries(prevSongs).forEach(([songId, record]) => {
    const mine = cur.songs[songId];
    if (!mine) {
      onlyPrevious += 1;
      merged[songId] = record;
      changed = true;
      return;
    }
    const a = counterTotal(record);
    const b = counterTotal(mine);
    if (a === b) {
      same += 1;
      return;
    }
    // 足さない（同じ回答を二重に数えてしまうため）。回数が多い方の記録をそのまま採用する
    conflicts.push({ item: songId, previous: record, current: mine, chosen: a > b ? record : mine });
    if (a > b) {
      merged[songId] = record;
      changed = true;
    }
  });
  const onlyCurrent = Object.keys(cur.songs).filter((k) => !prevSongs[k]).length;
  return {
    onlyPrevious,
    onlyCurrent,
    conflicts,
    same,
    mergedRaw: changed ? JSON.stringify({ ...cur, songs: merged }) : null,
    notes: conflicts.length ? ["回数は足し算しません（同じ回答を二重に数えないため）。曲ごとに回数が多い方を採用します"] : [],
  };
}

function mergeClears(prevRaw, curRaw) {
  const p = parseJson(prevRaw);
  const c = parseJson(curRaw);
  if (!c.ok && curRaw !== undefined) return { unreadable: true };
  const prev = p.ok && p.value?.clearedCombos && typeof p.value.clearedCombos === "object" ? p.value.clearedCombos : {};
  const cur = c.ok && c.value?.clearedCombos && typeof c.value.clearedCombos === "object" ? c.value : { schemaVersion: p.value?.schemaVersion ?? 2, clearedCombos: {} };
  const missing = Object.keys(prev).filter((k) => !(k in cur.clearedCombos));
  const merged = { ...cur.clearedCombos };
  missing.forEach((k) => {
    merged[k] = prev[k];
  });
  return {
    onlyPrevious: missing.length,
    onlyCurrent: Object.keys(cur.clearedCombos).filter((k) => !(k in prev)).length,
    conflicts: [],
    same: Object.keys(prev).length - missing.length,
    mergedRaw: missing.length ? JSON.stringify({ ...cur, clearedCombos: merged }) : null,
    notes: [],
  };
}

function mergeOshi(prevRaw, curRaw) {
  const p = parseJson(prevRaw);
  const c = parseJson(curRaw);
  const prevMost = p.ok ? p.value?.mostOshiMemberId ?? null : null;
  const curMost = c.ok ? c.value?.mostOshiMemberId ?? null : null;
  if (curRaw === undefined && prevRaw !== undefined && p.ok) {
    return { onlyPrevious: 1, onlyCurrent: 0, conflicts: [], same: 0, mergedRaw: prevRaw, notes: ["現在は推しメンが未設定のため、以前の設定を入れます"] };
  }
  if (prevRaw === undefined || prevRaw === curRaw) return { onlyPrevious: 0, onlyCurrent: curRaw !== undefined && prevRaw === undefined ? 1 : 0, conflicts: [], same: prevRaw === curRaw ? 1 : 0, mergedRaw: null, notes: [] };
  return {
    onlyPrevious: 0,
    onlyCurrent: 0,
    conflicts: [{ item: "mostOshiMemberId", previous: prevMost, current: curMost, chosen: curMost }],
    same: 0,
    mergedRaw: null,
    notes: prevMost !== curMost ? ["推しメンは今の選択を残します（以前の選択は整理前の控えに残ります）"] : [],
  };
}

function mergeCreations(key, prevRaw, curRaw) {
  const p = parseJson(prevRaw);
  const c = parseJson(curRaw);
  if (!c.ok && curRaw !== undefined) return { unreadable: true };
  // playlists は配列、customQuizPresets は { presets: [...] }
  const listOf = (v) => (Array.isArray(v) ? v : Array.isArray(v?.presets) ? v.presets : []);
  const prevList = p.ok ? listOf(p.value) : [];
  const curValue = c.ok ? c.value : null;
  const curList = listOf(curValue);
  const curIds = new Set(curList.map((x) => x?.id).filter(Boolean));
  const onlyPrevious = prevList.filter((x) => x && x.id && !curIds.has(x.id));
  const prevIds = new Set(prevList.map((x) => x?.id).filter(Boolean));
  const mergedList = [...curList, ...onlyPrevious];
  let mergedRaw = null;
  if (onlyPrevious.length) {
    if (Array.isArray(curValue) || (curValue === null && Array.isArray(p.value))) mergedRaw = JSON.stringify(mergedList);
    else mergedRaw = JSON.stringify({ ...(curValue ?? p.value ?? {}), presets: mergedList });
  }
  return {
    onlyPrevious: onlyPrevious.length,
    onlyCurrent: curList.filter((x) => x?.id && !prevIds.has(x.id)).length,
    conflicts: [],
    same: curList.filter((x) => x?.id && prevIds.has(x.id)).length,
    mergedRaw,
    notes: onlyPrevious.length ? [`以前だけにある${key === "playlists" ? "プレイリスト" : "問題セット"} ${onlyPrevious.length}件を加えます`] : [],
  };
}

function mergeSetting(prevRaw, curRaw) {
  if (prevRaw === undefined) return { onlyPrevious: 0, onlyCurrent: curRaw !== undefined ? 1 : 0, conflicts: [], same: 0, mergedRaw: null, notes: [] };
  if (curRaw === undefined) return { onlyPrevious: 1, onlyCurrent: 0, conflicts: [], same: 0, mergedRaw: prevRaw, notes: [] };
  if (prevRaw === curRaw) return { onlyPrevious: 0, onlyCurrent: 0, conflicts: [], same: 1, mergedRaw: null, notes: [] };
  return { onlyPrevious: 0, onlyCurrent: 0, conflicts: [{ item: "value", previous: prevRaw, current: curRaw, chosen: curRaw }], same: 0, mergedRaw: null, notes: [] };
}

function mergeOne(key, prevRaw, curRaw, options) {
  const category = classifyBackupKey(key);
  switch (category) {
    case "achievements":
      return mergeAchievements(prevRaw, curRaw);
    case "history":
      return mergeHistory(key, prevRaw, curRaw);
    case "best-higher":
      return mergeScalarBest(prevRaw, curRaw, false);
    case "best-lower":
      return mergeScalarBest(prevRaw, curRaw, true);
    case "best-reach":
      return mergeReach(prevRaw, curRaw);
    case "best-custom":
      return mergeCustomBest(prevRaw, curRaw, options.compareLyricsQuizResults);
    case "ranking-candidates":
      return mergeRankingCandidates(prevRaw, curRaw);
    case "counters":
      return mergeCounters(prevRaw, curRaw);
    case "clears":
      return mergeClears(prevRaw, curRaw);
    case "oshi":
      return mergeOshi(prevRaw, curRaw);
    case "creations":
      return mergeCreations(key, prevRaw, curRaw);
    default:
      return mergeSetting(prevRaw, curRaw);
  }
}

// 比較と統合の計画（純粋関数）。
//   previousEntries … 以前のあなた（クラウドのバックアップ payload を論理キーへ戻したもの）{ 論理キー: 生の文字列 }
//   currentEntries  … 現在のあなた（この端末。js/backupSync.js の collectLocalBackupEntries と同じ形）
//   options.compareLyricsQuizResults … 歌詞クイズの比較関数（任意）
// 戻り値：
//   { keys: [{ key, category, label, onlyPrevious, onlyCurrent, conflicts, same, willChange, notes, unreadable }],
//     categories: { [category]: { label, onlyPrevious, onlyCurrent, conflicts, willChangeKeys } },
//     writes: { [論理キー]: 統合後の生の文字列 }（この端末へ保存する値。空なら整理するものは無い）,
//     summary: { changedKeyCount, onlyPreviousTotal, conflictTotal, unreadableKeys } }
export function planBackupMerge(previousEntries, currentEntries, options = {}) {
  const prev = previousEntries && typeof previousEntries === "object" ? previousEntries : {};
  const cur = currentEntries && typeof currentEntries === "object" ? currentEntries : {};
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(cur)])].sort();
  const rows = [];
  const writes = {};
  const categories = {};
  keys.forEach((key) => {
    const prevRaw = typeof prev[key] === "string" ? prev[key] : undefined;
    const curRaw = typeof cur[key] === "string" ? cur[key] : undefined;
    const category = classifyBackupKey(key);
    const outcome = mergeOne(key, prevRaw, curRaw, options);
    const row = outcome.unreadable
      ? { key, category, label: CATEGORY_LABELS[category], onlyPrevious: 0, onlyCurrent: 0, conflicts: [], same: 0, willChange: false, notes: ["この端末の値が壊れていて読めないため、触りません"], unreadable: true }
      : {
          key,
          category,
          label: CATEGORY_LABELS[category],
          onlyPrevious: outcome.onlyPrevious,
          onlyCurrent: outcome.onlyCurrent,
          conflicts: outcome.conflicts,
          same: outcome.same,
          willChange: typeof outcome.mergedRaw === "string" && outcome.mergedRaw !== curRaw,
          notes: outcome.notes,
          unreadable: false,
        };
    if (row.willChange) writes[key] = outcome.mergedRaw;
    rows.push(row);
    const cat = (categories[category] ??= { label: CATEGORY_LABELS[category], onlyPrevious: 0, onlyCurrent: 0, conflicts: 0, willChangeKeys: 0 });
    cat.onlyPrevious += row.onlyPrevious;
    cat.onlyCurrent += row.onlyCurrent;
    cat.conflicts += row.conflicts.length;
    if (row.willChange) cat.willChangeKeys += 1;
  });
  return {
    keys: rows,
    categories,
    writes,
    summary: {
      changedKeyCount: Object.keys(writes).length,
      onlyPreviousTotal: rows.reduce((s, r) => s + r.onlyPrevious, 0),
      conflictTotal: rows.reduce((s, r) => s + r.conflicts.length, 0),
      unreadableKeys: rows.filter((r) => r.unreadable).map((r) => r.key),
    },
  };
}

// 計画を「この端末へ適用した後の entries」にする（純粋関数。テストで冪等性を確かめるため）。
export function applyBackupMergeWrites(currentEntries, writes) {
  return { ...(currentEntries ?? {}), ...(writes ?? {}) };
}

// ---------------------------------------------------------------------------
// 公開データ（UIDごとに分かれるもの）の比較：以前のID と 今のID
// ---------------------------------------------------------------------------
// input:
//   oldProfile / newProfile … publicProfiles/{UID} の中身（無ければ null）
//   leaderboardDivisions … js/uidSupersession.js planUidMerge() の divisions（無ければ []）
//   oldPresence … presence/{旧UID}（無ければ null）
//   adminOld / adminNew … true/false/null（null＝分からない）
export function comparePublicIdentity({ oldUid = null, newUid = null, oldProfile = null, newProfile = null, leaderboardDivisions = [], oldPresence = null, adminOld = null, adminNew = null } = {}) {
  const ids = (p) => (Array.isArray(p?.unlockedAchievementIds) ? p.unlockedAchievementIds : []);
  const oldIds = ids(oldProfile);
  const newIds = ids(newProfile);
  const divisions = Array.isArray(leaderboardDivisions) ? leaderboardDivisions : [];
  return {
    oldUid,
    newUid,
    profile: {
      oldExists: !!oldProfile,
      newExists: !!newProfile,
      oldName: oldProfile?.displayName ?? null,
      newName: newProfile?.displayName ?? null,
      achievementsOnlyOld: oldIds.filter((id) => !newIds.includes(id)).length,
      achievementsOnlyNew: newIds.filter((id) => !oldIds.includes(id)).length,
      oshiDiffers: !!oldProfile && !!newProfile && (oldProfile.oshiMemberId ?? null) !== (newProfile.oshiMemberId ?? null),
    },
    leaderboard: {
      onlyOld: divisions.filter((d) => d.bestOldCandidate && !d.newEntry).length,
      onlyNew: divisions.filter((d) => !d.bestOldCandidate && d.newEntry).length,
      both: divisions.filter((d) => d.bestOldCandidate && d.newEntry).length,
      oldFaster: divisions.filter((d) => d.bestOldCandidate && d.newEntry && d.bestOldCandidate.clearTimeMs < d.newEntry.clearTimeMs).length,
    },
    presence: { oldExists: !!oldPresence, oldLastSeen: typeof oldPresence?.lastSeen === "number" ? oldPresence.lastSeen : null },
    admin: { old: adminOld, current: adminNew },
  };
}

// ---------------------------------------------------------------------------
// 画面に出す日本語（純粋関数）
// ---------------------------------------------------------------------------
export function describeBackupMergePlan(plan) {
  if (!plan) return [];
  const lines = [];
  const order = ["achievements", "history", "best-higher", "best-lower", "best-reach", "best-custom", "ranking-candidates", "counters", "clears", "oshi", "creations", "setting"];
  order.forEach((category) => {
    const c = plan.categories[category];
    if (!c) return;
    const parts = [];
    if (c.onlyPrevious) parts.push(`以前だけ ${c.onlyPrevious}`);
    if (c.onlyCurrent) parts.push(`現在だけ ${c.onlyCurrent}`);
    if (c.conflicts) parts.push(`食い違い ${c.conflicts}`);
    if (parts.length === 0) parts.push("同じ");
    lines.push(`${c.label}：${parts.join("・")}${c.willChangeKeys ? "（整理すると反映されます）" : ""}`);
  });
  const notes = [...new Set(plan.keys.flatMap((r) => r.notes))];
  notes.forEach((n) => lines.push(`・${n}`));
  if (plan.summary.changedKeyCount === 0) lines.push("整理が必要な違いはありません（この端末の記録がすべてを含んでいます）");
  return lines;
}

export function describePublicIdentityComparison(cmp) {
  if (!cmp) return [];
  const lines = [];
  const p = cmp.profile;
  if (p.oldExists || p.newExists) {
    lines.push(`フレンドのカード：以前のID ${p.oldExists ? `あり（${p.oldName ?? "名前なし"}）` : "なし"}／今のID ${p.newExists ? `あり（${p.newName ?? "名前なし"}）` : "なし"}`);
    if (p.oldExists && p.newExists && (p.achievementsOnlyOld || p.achievementsOnlyNew)) {
      lines.push(`　称号の表示：以前のIDだけ ${p.achievementsOnlyOld}個・今のIDだけ ${p.achievementsOnlyNew}個（称号の正本はこの端末の記録です）`);
    }
    if (p.oshiDiffers) lines.push("　推しメンの表示が違います（今の選択が正しい値です）");
  }
  const l = cmp.leaderboard;
  if (l.onlyOld || l.onlyNew || l.both) {
    lines.push(`ランキング：以前のIDだけ ${l.onlyOld}区分・今のIDだけ ${l.onlyNew}区分・両方 ${l.both}区分（うち以前の方が速い ${l.oldFaster}区分）`);
    lines.push("　整理すると、区分ごとに速い方の記録を今のIDで1件だけ残します（合計はしません）");
  }
  if (cmp.presence.oldExists) lines.push("オンライン表示：以前のIDの記録が残っています（整理で消えます）");
  if (cmp.admin.old === true && cmp.admin.current !== true) lines.push("管理者：以前のIDでは管理者でした。今のIDは未登録です（「管理者の復旧」を参照）");
  if (lines.length === 0) lines.push("以前のIDに残っている公開データはありません");
  return lines;
}
