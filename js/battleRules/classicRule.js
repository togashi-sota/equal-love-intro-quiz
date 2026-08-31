// 歌詞クイズ オンライン対戦「クラシックルール」。
//
// 全員が同じ問題・同じヒントを見て、各自1回だけ回答する基本ルール。
// 正解すればそのときのヒント段階に応じたポイントを獲得し（早押し要素はなく、
// 全員が同じ問題で同時に加点され得る）、全問終了後の合計ポイントで順位を決める。
//
// このファイルの関数は、Firebaseや画面のことを一切知らない純粋関数だけで構成する
// （設計方針：追記⑥0章「完全プラグイン方式」）。呼び出し元（今後実装する
// js/battleModes/lyricsQuizBattleMode.js等）が、Firebaseから読んだ生データを
// このファイルが期待する形に整えてから渡す。
//
// 【設計⑪②・配点テーブルはFirebaseへ保存しない】DEFAULT_HINT_POINT_TABLEは
// このファイル内部の定数として直接使い、settings.pointTableのような
// 外部から注入可能な値にはしない。ホストが不正な配点を送ってきたり、端末ごとに
// 配点が食い違ったりする事故を防ぐため、「同じruleId・ruleVersionなら、
// 全端末が必ず同じコードから同じ配点を得る」という設計にしている。
// settingsに残すのはhintIntervalSecのみ（本人の好みで変えてよい、公平性に
// 影響しない項目のため）。

import {
  DEFAULT_HINT_POINT_TABLE,
  DEFAULT_HINT_INTERVAL_SEC,
  MAX_HINT_LEVEL,
  ANSWER_POOL_SIZE_ALL_MODES,
  HINT_INTERVAL_SETTINGS_FIELD,
  deriveAnswerOutcome,
  computeResponseMs,
  validateHintIntervalSec,
} from "./sharedDefaults.js";

export const ruleId = "classic";
// 配点・タイブレーク順など、採点方法に影響する変更をしたら必ず1つ上げること。
// 結果に添えて保存することで、将来ルールを調整したときに、古い結果と新しい結果が
// 混ざらないようにする（設計⑩③）。
export const ruleVersion = 1;
export const label = "クラシック";
export const description = "全員が同じヒントを見て、正解すればヒント段階に応じたポイントを獲得します。";

// このルールで選べる回答方式（回答候補の数）。ルーム設定画面はこの配列だけを見て
// 選択肢を絞り込む（「クラシックのときは〜」という個別分岐をUI側に書かないため）。
export const allowedAnswerPoolSizes = ANSWER_POOL_SIZE_ALL_MODES;

export function defaultSettings() {
  return { hintIntervalSec: DEFAULT_HINT_INTERVAL_SEC };
}

export function validateSettings(settings) {
  if (!settings || typeof settings !== "object") return "設定が不正です。";
  return validateHintIntervalSec(settings.hintIntervalSec);
}

// 1問分・全員の回答から、参加者ごとの結果を導出する。
//
// answersByUid: { [uid]: { selectedSongId, hintLevel, submittedAt } }
//   （Firebase上の生の回答事実ログをそのまま渡す想定。answeredAtは採点に使わないため
//    このルールの入力には含めない）
// correctSongId: この問題の正解songId（呼び出し元が、全端末共通の決定論的な
//   問題生成結果から渡す。このルール自身は問題データを一切知らない）
// questionStartedAt / settings.hintIntervalSec: responseMsの逆算に使う
//
// 返り値: { [uid]: { outcome, hintLevel, responseMs, pointsAwarded, wonQuestion, nextComboCount } }
//   wonQuestionは常にfalse（クラシックには「奪い取り」の概念が無いため）。
//   nextComboCountは常に0（クラシックはコンボを持たないため）。
export function resolveQuestionAnswers({ answersByUid, correctSongId, questionStartedAt, settings }) {
  const outcomesByUid = {};
  for (const [uid, answer] of Object.entries(answersByUid)) {
    const outcome = deriveAnswerOutcome(correctSongId, answer.selectedSongId);
    const responseMs = computeResponseMs({
      submittedAt: answer.submittedAt,
      questionStartedAt,
      hintLevel: answer.hintLevel,
      hintIntervalSec: settings.hintIntervalSec,
    });
    outcomesByUid[uid] = {
      outcome,
      hintLevel: answer.hintLevel,
      responseMs,
      pointsAwarded: outcome === "correct" ? (DEFAULT_HINT_POINT_TABLE[answer.hintLevel] ?? 0) : 0,
      wonQuestion: false,
      nextComboCount: 0,
    };
  }
  return outcomesByUid;
}

// 全参加者が回答済み、またはヒント4の受付時間が終わっていれば問題終了。
export function shouldEndQuestion({ answersByUid, allPlayerUids, questionStartedAt, nowMs, settings }) {
  const allAnswered = allPlayerUids.every((uid) => uid in answersByUid);
  const deadlineMs = questionStartedAt + MAX_HINT_LEVEL * settings.hintIntervalSec * 1000;
  return allAnswered || nowMs >= deadlineMs;
}

// 1人分・全問のresolveQuestionAnswers結果（questionOutcomes）から、最終結果を組み立てる。
// questionOutcomes: resolveQuestionAnswers()が返す1人分のオブジェクトを、
//   出題順に並べた配列（{ outcome, hintLevel, responseMs, pointsAwarded }[]）。
// 【missCountとskippedCountを分ける理由・2026-08-06】選択肢を選んで間違えた（wrongAnswer）
// ことと、時間切れで未回答のまま終わった（skipped。js/lyricsQuizMatchProgress.jsの
// fillMissingAnswersWithTimeoutSkip()が合成する）ことは、このエンジンでは元々別のoutcome値
// として区別されており、missCountには意図的にwrongAnswerだけを数えている（本人の設計方針：
// 「選んで間違えた」と「考える間もなく時間切れになった」は別の失敗として扱う）。
// ただし結果画面にはこれまでmissCountしか出ておらず、未回答が何回あったか本人からは
// 見えなかった（本人からの指摘）。skippedCountを追加して結果画面に表示できるようにする。
export function aggregateResult(questionOutcomes) {
  let totalPoints = 0;
  let firstHintCorrectCount = 0;
  let totalHintsUsed = 0;
  let totalElapsedMs = 0;
  let missCount = 0;
  let skippedCount = 0;
  let correctCount = 0;

  for (const outcome of questionOutcomes) {
    totalPoints += outcome.pointsAwarded;
    totalHintsUsed += outcome.hintLevel;
    totalElapsedMs += outcome.responseMs;
    if (outcome.outcome === "correct") {
      correctCount += 1;
      if (outcome.hintLevel === 1) firstHintCorrectCount += 1;
    } else if (outcome.outcome === "wrongAnswer") {
      missCount += 1;
    } else if (outcome.outcome === "skipped") {
      skippedCount += 1;
    }
  }

  return {
    ruleVersion,
    completed: true,
    common: { elapsedMs: totalElapsedMs, correctCount, missCount },
    detail: { totalPoints, firstHintCorrectCount, totalHintsUsed, totalElapsedMs, missCount, skippedCount, correctCount },
  };
}

// Array.sortの慣習どおり、負の値ならAが上位（既存compareBattleResultsと同じ形）。
// タイブレーク順：①合計ポイント②ヒント1正解数③総使用ヒント数④総回答時間⑤ミス数
export function compareResults(resultA, resultB) {
  const a = resultA.detail;
  const b = resultB.detail;
  if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  if (a.firstHintCorrectCount !== b.firstHintCorrectCount) return b.firstHintCorrectCount - a.firstHintCorrectCount;
  if (a.totalHintsUsed !== b.totalHintsUsed) return a.totalHintsUsed - b.totalHintsUsed;
  if (a.totalElapsedMs !== b.totalElapsedMs) return a.totalElapsedMs - b.totalElapsedMs;
  return a.missCount - b.missCount;
}

export function getRuleDescription() {
  return "全員が同じヒントを見て、正解すればヒント段階に応じたポイントを獲得します。ポイント合計、同点時はヒント1正解数→使用ヒント数→回答時間→ミス数の順で順位が決まります。";
}

// 【Phase6.5新設】画面層が「回答を送信するときに何を送るか」をruleIdで分岐せずに
// 決められるようにする窓口（js/battleRules/index.jsのgetAnswerSubmissionPlan()経由）。
// クラシックには奪い取りclaimの概念が無いため、常に回答ログだけを送る。
export function getAnswerSubmissionPlan() {
  return { submitAnswer: true, submitWinnerClaim: false };
}

// ルーム設定画面が自動生成するための宣言（追記⑥1.5章）。
export const settingsFields = [HINT_INTERVAL_SETTINGS_FIELD];

// 対戦中HUDが自動生成するための宣言（追記⑦12章）。
// 【2026-09-03修正・本人指摘】totalElapsedMsはミリ秒の生値のため、unit: "ms"を付けて
// js/lyricsQuizBattleUi.jsのformatDisplayValue()に「秒へ変換して表示する」と伝える
// （以前はunitが無く、9620のような生のミリ秒がそのまま画面に出てしまっていた）。
export const hudFields = [
  { key: "correctCount", label: "現在の正解数" },
  { key: "firstHintCorrectCount", label: "ヒント1正解数" },
  { key: "totalHintsUsed", label: "総使用ヒント数" },
  { key: "totalElapsedMs", label: "総回答時間", unit: "ms" },
];

// 結果画面が自動生成するための宣言（追記⑥10章）。
export const resultColumns = [
  { key: "totalPoints", label: "獲得ポイント" },
  { key: "totalHintsUsed", label: "使用ヒント数" },
  { key: "totalElapsedMs", label: "回答時間", unit: "ms" },
  { key: "missCount", label: "ミス回数" },
  { key: "skippedCount", label: "未回答" },
];
