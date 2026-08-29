// 「プレイ履歴」画面（全モード共通のタイムライン）のためのデータ層。
//
// 【設計方針：既存の履歴保存はそのまま】js/history.js（通常イントロクイズ）・
// js/timeAttackHistory.js（タイムアタック、ランダム再生variant込み）は、苦手曲モードの判定
// （computeWeakSongs・computeTimeAttackWeakSongs）が中身の形に依存しているため、保存形式を
// 一切変更しない。この2つは「読み取り時に統一表示形式へ変換するアダプター」
// （adaptIntroHistoryEntry・adaptTimeAttackHistoryEntry）だけを新設し、書き込みは今までどおり
// 各モードのファイルに任せる。
//
// このファイル（js/playHistory.js）は、今まで履歴を保存していなかったモード
// （ランダム再生クイズ・歌詞クイズ・苦手曲モード・オリジナル問題作成モード・ローカル対戦・
// オンライン対戦）専用の、新しい共通保存先を1つ追加する。
//
// 【共通表示形式】どのモードの結果も、最終的には以下の形にそろえてから履歴画面へ渡す
// （画面側がモードごとの分岐を大量に持たずに済むようにするため）：
//   { id, schemaVersion, playedAt, modeId, modeLabel, questionCount, isAllSongsMode,
//     correctCount, wrongCount, skippedCount, score, averageResponseMs, completed, details }
// details には、モード固有の情報（対戦順位・ルール名・ヒント数など）を自由に持たせてよい
// （画面側はdetailsの中身をモードごとに出し分けて表示する）。

import { getPlayerKeyPrefix } from "./playerProfile.js";
import { getHistoryEntries } from "./history.js";
import { getTimeAttackHistoryEntries } from "./timeAttackHistory.js";
import { calculateAverageResponseMs, formatResponseSeconds } from "./responseTime.js";
import { scheduleBackupSync } from "./backupSync.js";

function buildPlayHistoryKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}unifiedPlayHistory`;
}
const CURRENT_SCHEMA_VERSION = 1;

// 保存する履歴の最大件数。js/history.js・js/timeAttackHistory.jsと同じ考え方。
// オンライン対戦は参加者全員分のスナップショットを持つため1件が大きくなりうるが、
// 曲ごとの全回答ログまでは持たせない設計にしているため、200件でも十分な余裕がある。
export const MAX_PLAY_HISTORY_ENTRIES = 200;

function generateEntryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadPlayHistoryData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, entries: [] };
  try {
    const stored = localStorage.getItem(buildPlayHistoryKey());
    if (!stored) return empty;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed.entries)) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function savePlayHistoryData(data) {
  try {
    localStorage.setItem(buildPlayHistoryKey(), JSON.stringify(data));
    scheduleBackupSync(); // クラウドバックアップも更新する（2026-08-29追加、js/backupSync.js参照）
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする。
    // プレイ履歴の保存に失敗しても、自己ベスト・称号・ゲーム結果そのものには一切影響しない
    // （呼び出し側でこの関数の戻り値を待たずに進める設計にしているため）。
  }
}

// 1人用モード（ランダム再生クイズ・歌詞クイズ・苦手曲モード・オリジナル問題作成モード）用。
// 呼ぶたびに必ず新しい1件として保存する（idは自動採番）。
export function savePlayHistoryEntry(entryFields) {
  const entry = { id: generateEntryId(), schemaVersion: CURRENT_SCHEMA_VERSION, ...entryFields };
  const data = loadPlayHistoryData();
  data.entries.unshift(entry);
  if (data.entries.length > MAX_PLAY_HISTORY_ENTRIES) {
    data.entries.length = MAX_PLAY_HISTORY_ENTRIES;
  }
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  savePlayHistoryData(data);
  return entry;
}

// オンライン対戦用。matchIdから組み立てたidをそのまま使い、同じidが既にあれば何もしない
// （リロード・再接続・画面再描画で結果画面へ何度到達しても、1試合＝1件だけになるようにするため）。
// 戻り値：実際に新規保存した場合はtrue、既に保存済みで何もしなかった場合はfalse。
export function savePlayHistoryEntryIfNew(entry) {
  const data = loadPlayHistoryData();
  if (data.entries.some((existing) => existing.id === entry.id)) return false;
  data.entries.unshift({ schemaVersion: CURRENT_SCHEMA_VERSION, ...entry });
  if (data.entries.length > MAX_PLAY_HISTORY_ENTRIES) {
    data.entries.length = MAX_PLAY_HISTORY_ENTRIES;
  }
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  savePlayHistoryData(data);
  return true;
}

// この新しい保存先（他の2つの既存履歴は含まない）だけを読み取る。
export function getNativePlayHistoryEntries() {
  return loadPlayHistoryData().entries;
}

export function clearNativePlayHistoryEntries() {
  savePlayHistoryData({ schemaVersion: CURRENT_SCHEMA_VERSION, entries: [] });
}

// ===== 既存2ストアの読み取りアダプター（保存形式は一切変更しない、表示用の変換のみ） =====

const QUESTION_COUNT_VALUE_LABELS = { "5": 5, "10": 10, "20": 20, "50": 50 };

function resolveQuestionCountFromValue(questionCountValue, fallbackActualCount) {
  if (questionCountValue in QUESTION_COUNT_VALUE_LABELS) return QUESTION_COUNT_VALUE_LABELS[questionCountValue];
  return fallbackActualCount ?? null;
}

// entry.answers[]（曲ごとの内訳、result:"correct"|"wrong"|"skip"|"reveal"、elapsedMs）から、
// 正解した問題だけの平均回答時間を計算し直す（js/main.jsの称号判定と同じ定義・同じ
// calculateAverageResponseMs()を使うことで、値がずれないようにする）。
// answers配列が無い/空の古い履歴だけ、保存時点のaverageCorrectElapsedMsへフォールバックする
// （それも無ければnull＝「記録なし」として項目ごと非表示にする。推測値は出さない）。
function computeIntroAverageResponseMs(entry) {
  if (Array.isArray(entry.answers) && entry.answers.length > 0) {
    const elapsedList = entry.answers
      .filter((answer) => answer.result === "correct" && answer.elapsedMs !== null && answer.elapsedMs !== undefined)
      .map((answer) => answer.elapsedMs);
    if (elapsedList.length > 0) return calculateAverageResponseMs(elapsedList);
  }
  return entry.averageCorrectElapsedMs ?? null;
}

// js/history.js（通常イントロクイズ）の1件を、統一表示形式へ変換する。
export function adaptIntroHistoryEntry(entry) {
  return {
    id: `intro:${entry.id}`,
    schemaVersion: 1,
    playedAt: entry.playedAt,
    modeId: "intro",
    modeLabel: "イントロクイズ",
    questionCount: entry.questionCount,
    isAllSongsMode: entry.categoryFilterValue === "all",
    correctCount: entry.correctCount,
    wrongCount: entry.questionCount - entry.correctCount,
    skippedCount: null,
    score: entry.score,
    averageResponseMs: computeIntroAverageResponseMs(entry),
    completed: true,
    details: {
      rank: entry.rank,
      maxScore: entry.maxScore,
      isNewRecord: entry.isNewRecord,
      categoryFilterValue: entry.categoryFilterValue,
      titleResults: entry.titleResults,
    },
  };
}

const TIME_ATTACK_VARIANT_META = {
  intro: { modeId: "timeAttack", modeLabel: "タイムアタック" },
  randomPlayback: { modeId: "timeAttackRandomPlayback", modeLabel: "タイムアタック（ランダム再生）" },
};

// entry.questions[]（問題ごとの内訳、isCorrect・elapsedMs）から、正解した問題だけの
// 平均回答時間を計算する（js/timeAttackScreen.jsのbuildAchievementResultInput()と
// 完全に同じ定義・同じcalculateAverageResponseMs()を使う）。この値は保存時に
// 別フィールドとして持たせず、常にここで算出し直す設計にしている（保存値と算出値が
// 将来ズレる余地をなくすため）。questions配列が無い/空の古い履歴はnull＝「記録なし」。
function computeTimeAttackAverageResponseMs(entry) {
  if (!Array.isArray(entry.questions) || entry.questions.length === 0) return null;
  const elapsedList = entry.questions
    .filter((question) => question.isCorrect && question.elapsedMs !== null && question.elapsedMs !== undefined)
    .map((question) => question.elapsedMs);
  return calculateAverageResponseMs(elapsedList);
}

// js/timeAttackHistory.js（タイムアタック、ランダム再生variant込み）の1件を、
// 統一表示形式へ変換する。
export function adaptTimeAttackHistoryEntry(entry) {
  const variant = entry.variant ?? "intro";
  const variantMeta = TIME_ATTACK_VARIANT_META[variant] ?? TIME_ATTACK_VARIANT_META.intro;
  return {
    id: `timeAttack:${entry.id}`,
    schemaVersion: 1,
    playedAt: entry.playedAt,
    modeId: variantMeta.modeId,
    modeLabel: variantMeta.modeLabel,
    questionCount: resolveQuestionCountFromValue(entry.questionCountValue, entry.questions?.length),
    isAllSongsMode: entry.categoryFilterValue === "all",
    correctCount: entry.correctCount,
    wrongCount: entry.missCount,
    skippedCount: null,
    score: null,
    averageResponseMs: computeTimeAttackAverageResponseMs(entry),
    completed: entry.completed,
    details: {
      rule: entry.rule,
      totalElapsedMs: entry.totalElapsedMs,
      failedAtQuestionNumber: entry.failedAtQuestionNumber,
      isNewRecord: entry.isNewRecord,
      categoryFilterValue: entry.categoryFilterValue,
    },
  };
}

// ===== 統一タイムライン =====

// 3つの保存先（通常イントロ・タイムアタック・その他モード用の新しい保存先）をすべて合わせて、
// 新しい順に並べた1本のタイムラインとして返す。履歴画面はこの関数だけを呼べばよい。
export function getUnifiedPlayHistoryEntries() {
  const introEntries = getHistoryEntries().map(adaptIntroHistoryEntry);
  const timeAttackEntries = getTimeAttackHistoryEntries().map(adaptTimeAttackHistoryEntry);
  const nativeEntries = getNativePlayHistoryEntries();
  return [...introEntries, ...timeAttackEntries, ...nativeEntries].sort((a, b) => b.playedAt - a.playedAt);
}

// 履歴画面のフィルターチップ用に、modeIdをどのチップに属させるかを決める対応表。
// 「対戦」チップには、ローカル対戦・オンライン対戦（3種）をまとめる（本人指示どおり）。
export const HISTORY_FILTER_CATEGORY = {
  intro: "intro",
  weakSongs: "intro",
  // 2026-08-29追加：苦手曲モードB（歌詞クイズ版）。エンジン自体が歌詞クイズのため、
  // 既存のweakSongs（イントロ側）とは別に"lyricsQuiz"フィルターへ分類する。
  weakSongsLyrics: "lyricsQuiz",
  customQuiz: "intro",
  // 2026-08-29追加：オリジナル問題作成モードのランダム再生タイプ・歌詞クイズタイプ
  // （⑭）。エンジンに応じてそれぞれのフィルターへ分類する。
  customQuizRandomPlayback: "randomPlayback",
  customQuizLyrics: "lyricsQuiz",
  timeAttack: "timeAttack",
  timeAttackRandomPlayback: "timeAttack",
  randomPlayback: "randomPlayback",
  lyricsQuiz: "lyricsQuiz",
  localBattle: "battle",
  onlineTimeAttack: "battle",
  onlineRandomPlayback: "battle",
  onlineLyricsQuiz: "battle",
};

export const HISTORY_FILTER_LABELS = {
  all: "すべて",
  intro: "イントロ",
  randomPlayback: "ランダム",
  lyricsQuiz: "歌詞",
  timeAttack: "タイムアタック",
  battle: "対戦",
};
export const HISTORY_FILTER_ORDER = ["all", "intro", "randomPlayback", "lyricsQuiz", "timeAttack", "battle"];

// filterId（HISTORY_FILTER_ORDERのいずれか）で、統一タイムラインを絞り込む。"all"は絞り込まない。
export function filterUnifiedPlayHistoryEntries(entries, filterId) {
  if (!filterId || filterId === "all") return entries;
  return entries.filter((entry) => HISTORY_FILTER_CATEGORY[entry.modeId] === filterId);
}

// modeIdごとの表示名・アイコン用キー（js/specialModeIcons.jsのbuildSpecialModeIcon()にそのまま渡せる値）。
// ホームの特別モードカードと同じアイコン・配色を再利用することで、「同じモードなのに
// ホームと履歴で見た目が違う」状態を避ける（本人指示）。
export const HISTORY_MODE_DISPLAY = {
  intro: { label: "イントロクイズ", iconKey: "intro" },
  randomPlayback: { label: "ランダム再生クイズ", iconKey: "randomPlayback" },
  lyricsQuiz: { label: "歌詞クイズ", iconKey: "lyricsQuiz" },
  weakSongs: { label: "苦手曲モード", iconKey: "weakSongs" },
  // 2026-08-29追加：苦手曲モードB（歌詞クイズ版）。専用アイコンは作らず、歌詞クイズと
  // 同じiconKeyを再利用する（本人指示：既存のデザインを再利用し、新しい意匠を増やさない）。
  weakSongsLyrics: { label: "苦手曲モード（歌詞）", iconKey: "lyricsQuiz" },
  // 2026-08-29追加：オリジナル問題作成モードのランダム再生タイプ・歌詞クイズタイプ（⑭）。
  // 専用アイコンは作らず、それぞれ対応するエンジンのiconKeyを再利用する。
  customQuizRandomPlayback: { label: "オリジナル問題（ランダム再生）", iconKey: "randomPlayback" },
  customQuizLyrics: { label: "オリジナル問題（歌詞）", iconKey: "lyricsQuiz" },
  customQuiz: { label: "オリジナル問題", iconKey: "originalQuiz" },
  timeAttack: { label: "タイムアタック", iconKey: "timeAttack" },
  timeAttackRandomPlayback: { label: "タイムアタック（ランダム再生）", iconKey: "timeAttack" },
  localBattle: { label: "1台対戦", iconKey: "localBattle" },
  onlineTimeAttack: { label: "オンライン対戦（イントロ）", iconKey: "onlineBattle" },
  onlineRandomPlayback: { label: "オンライン対戦（ランダム再生）", iconKey: "onlineBattle" },
  onlineLyricsQuiz: { label: "オンライン対戦（歌詞）", iconKey: "onlineBattle" },
};

// ===== 一覧カード・サマリー用の表示ヘルパー（純粋関数） =====

const BATTLE_RULE_LABELS = { normal: "ノーマル", hard: "ハード", loveChain: "LOVE連チャン" };
const LYRICS_BATTLE_RULE_LABELS = { classic: "クラシック", steal: "奪い取り", combo: "コンボ" };
const MEDAL_BY_RANK = { 1: "🥇", 2: "🥈", 3: "🥉" };

function formatRank(rank) {
  if (rank === null || rank === undefined) return null;
  return `${MEDAL_BY_RANK[rank] ?? `${rank}位`}`;
}

function formatSecondsFromMs(ms) {
  return `${(ms / 1000).toFixed(2)}秒`;
}

// 履歴1件を、一覧カードに出す1〜2行程度の要約テキストへ変換する（純粋関数。DOMに触れない）。
// モードごとに持っている情報がまるで違うため、ここで出し分ける（画面側はモード分岐を持たない）。
export function describeEntrySummaryLines(entry) {
  const lines = [];
  const scopeLabel = entry.isAllSongsMode === null ? null : entry.isAllSongsMode ? "全曲" : "絞り込みあり";
  const questionCountLabel = entry.questionCount !== null ? `${entry.questionCount}問` : null;

  switch (entry.modeId) {
    case "intro":
    case "weakSongs":
    case "customQuiz": {
      lines.push([questionCountLabel, scopeLabel].filter(Boolean).join("・"));
      const scoreText = entry.score !== null ? `・${entry.score}点` : "";
      const averageText = formatResponseSeconds(entry.averageResponseMs);
      lines.push(
        `${entry.correctCount}/${entry.questionCount}問正解${scoreText}${averageText ? `・平均${averageText}` : ""}`
      );
      break;
    }
    case "randomPlayback": {
      lines.push(
        [questionCountLabel, scopeLabel, BATTLE_RULE_LABELS[entry.details?.rule]].filter(Boolean).join("・")
      );
      const averageText = formatResponseSeconds(entry.averageResponseMs);
      lines.push(
        entry.completed
          ? `${entry.correctCount}/${entry.questionCount}問正解${averageText ? `・平均${averageText}` : ""}`
          : "途中で終了"
      );
      break;
    }
    case "lyricsQuiz": {
      lines.push([questionCountLabel, scopeLabel].filter(Boolean).join("・"));
      const hintText =
        entry.details?.averageHintsUsed !== undefined ? `・平均ヒント${entry.details.averageHintsUsed.toFixed(1)}` : "";
      lines.push(`${entry.correctCount}/${entry.questionCount}問正解${hintText}`);
      break;
    }
    case "timeAttack":
    case "timeAttackRandomPlayback": {
      lines.push([questionCountLabel, scopeLabel, BATTLE_RULE_LABELS[entry.details?.rule]].filter(Boolean).join("・"));
      const averageLabel = formatResponseSeconds(entry.averageResponseMs);
      lines.push(
        entry.completed
          ? [`クリア ${formatSecondsFromMs(entry.details?.totalElapsedMs ?? 0)}`, averageLabel ? `平均${averageLabel}` : null]
              .filter(Boolean)
              .join("・")
          : `${entry.details?.failedAtQuestionNumber ?? "?"}問目で失敗`
      );
      break;
    }
    case "localBattle":
    case "onlineTimeAttack":
    case "onlineRandomPlayback": {
      const ruleLabel = BATTLE_RULE_LABELS[entry.details?.rule];
      lines.push(
        [ruleLabel, entry.details?.participantCount ? `${entry.details.participantCount}人対戦` : null]
          .filter(Boolean)
          .join("・")
      );
      if (!entry.completed) {
        lines.push("途中終了（DNF）");
      } else {
        const rankText = formatRank(entry.details?.myRank);
        lines.push([rankText, `正解${entry.correctCount}／ミス${entry.wrongCount}`].filter(Boolean).join(" / "));
      }
      break;
    }
    case "onlineLyricsQuiz": {
      const ruleLabel = LYRICS_BATTLE_RULE_LABELS[entry.details?.battleRuleId] ?? entry.details?.battleRuleId;
      lines.push(
        [`歌詞対戦・${ruleLabel}`, entry.details?.participantCount ? `${entry.details.participantCount}人対戦` : null]
          .filter(Boolean)
          .join(" / ")
      );
      if (!entry.completed) {
        lines.push("途中退出（DNF）");
      } else {
        const rankText = formatRank(entry.details?.myRank);
        lines.push([rankText, entry.score !== null ? `${entry.score}pt` : null].filter(Boolean).join(" / "));
      }
      break;
    }
    default:
      if (questionCountLabel) lines.push(questionCountLabel);
  }

  return lines.filter((line) => line !== "");
}

// playedAt（Date.now()のミリ秒）を「7/28 14:32」のような表示用文字列にする。
export function formatPlayedAt(playedAt) {
  const date = new Date(playedAt);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

// 履歴詳細モーダル用に、entry 1件を { label, value } の配列へ変換する（純粋関数）。
// 存在しない項目（null・undefined）は配列に含めない＝画面側は無理に「0」や「―」を出さず、
// その項目ごと表示しない（本人指示）。
export function describeEntryDetailFields(entry) {
  const fields = [];
  const push = (label, value) => {
    if (value === null || value === undefined || value === "") return;
    fields.push({ label, value });
  };

  push("日時", formatPlayedAt(entry.playedAt));
  push("モード", entry.modeLabel);
  push("問題数", entry.questionCount !== null ? `${entry.questionCount}問` : null);
  push("出題範囲", entry.isAllSongsMode === null ? null : entry.isAllSongsMode ? "全曲" : "絞り込みあり");
  push("正解数", entry.correctCount !== null ? `${entry.correctCount}問` : null);
  push("誤答数", entry.wrongCount !== null ? `${entry.wrongCount}問` : null);
  push("未回答・スキップ数", entry.skippedCount !== null ? `${entry.skippedCount}問` : null);
  push("スコア", entry.score !== null ? `${entry.score}点` : null);
  push("平均回答時間", formatResponseSeconds(entry.averageResponseMs));

  const details = entry.details ?? {};
  push("ルール", BATTLE_RULE_LABELS[details.rule] ?? null);
  push(
    "対戦ルール",
    details.battleRuleId ? (LYRICS_BATTLE_RULE_LABELS[details.battleRuleId] ?? details.battleRuleId) : null
  );
  push("経過時間", details.totalElapsedMs !== undefined ? formatSecondsFromMs(details.totalElapsedMs) : null);
  push("到達した問題", details.failedAtQuestionNumber ? `${details.failedAtQuestionNumber}問目` : null);
  push("使用ヒント合計", details.totalHintsUsed !== undefined ? `${details.totalHintsUsed}回` : null);
  push(
    "平均ヒント段階",
    details.averageHintsUsed !== undefined ? `${details.averageHintsUsed.toFixed(1)}` : null
  );
  push("初手正解数", details.firstHintCorrectCount !== undefined ? `${details.firstHintCorrectCount}問` : null);
  push("新記録", details.isNewRecord ? "🎉 新記録" : null);

  if (details.participantCount) {
    push("参加人数", `${details.participantCount}人`);
    push("あなたの順位", details.isDnf ? "途中終了（DNF）" : details.myRank ? `${formatRank(details.myRank)}` : null);
    if (Array.isArray(details.standings)) {
      const standingsText = details.standings
        .map((standing) => {
          const name = standing.playerName ?? standing.displayName ?? "";
          if (standing.isDnf) return `${name}：DNF${standing.isYou ? "（あなた）" : ""}`;
          const rankText = standing.rank ? `${standing.rank}位` : "";
          return `${rankText} ${name}${standing.isYou ? "（あなた）" : ""}`.trim();
        })
        .join(" / ");
      push("参加者・順位", standingsText);
    }
  }

  return fields;
}

// 統一タイムライン全体のサマリー（総プレイ回数・正答率が計算できる範囲での全体正答率）。
// correctCount・questionCountがnullの記録（DNF等）は正答率の計算から除外する。
export function computeUnifiedHistorySummary(entries) {
  const totalPlayCount = entries.length;
  const countable = entries.filter((entry) => entry.correctCount !== null && entry.questionCount !== null);
  const totalQuestionCount = countable.reduce((sum, entry) => sum + entry.questionCount, 0);
  const totalCorrectCount = countable.reduce((sum, entry) => sum + entry.correctCount, 0);
  const overallAccuracy = totalQuestionCount > 0 ? totalCorrectCount / totalQuestionCount : null;
  return { totalPlayCount, totalQuestionCount, overallAccuracy };
}
