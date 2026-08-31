// 歌詞クイズ オンライン対戦「正解数バトル」（旧名：クラシック）。
//
// 【2026-08-31全面改訂・本人指示】以前は「ヒント段階に応じた配点＋5段階タイブレーク」の
// ルールだったが、本人とChatGPTで整理し直し、以下の新仕様に変更した：
//   ・ヒントは時間経過で自動送りせず、本人が「ヒントNを見る」ボタンで手動で開く。
//   ・「わからない」ボタンで、その場で0点確定・回答済み扱いにできる。
//   ・配点はヒント段階に関係なく、正解=+1pt・不正解/わからない=+0ptの一律配点。
//   ・ヒント使用数・回答時間は記録・表示してよいが、順位には一切使わない
//     （同点の場合は同じ順位にする。回答時間などで無理に差をつけない）。
// ruleId（"classic"）・ruleVersionは内部値のため変更していない（本人指示：
// 「内部IDやFirebase上の値まで変更すると既存機能への影響が大きい場合は、内部値は
// 既存のまま維持して表示名だけ変更して構わない」）。
//
// このファイルの関数は、Firebaseや画面のことを一切知らない純粋関数だけで構成する
// （設計方針：追記⑥0章「完全プラグイン方式」）。

import {
  ANSWER_POOL_SIZE_ALL_MODES,
  deriveAnswerOutcome,
  computeElapsedSinceQuestionStart,
} from "./sharedDefaults.js";

export const ruleId = "classic";
// 配点・タイブレーク順など、採点方法に影響する変更をしたら必ず1つ上げること。
// 結果に添えて保存することで、将来ルールを調整したときに、古い結果と新しい結果が
// 混ざらないようにする（設計⑩③）。
// 【2026-08-31・v1→v2】配点方式（ヒント段階別→正解一律1pt）とタイブレーク方式
// （5段階タイブレーク→完全同順位）を変更したため、バージョンを上げた。
export const ruleVersion = 2;
export const label = "正解数バトル";
export const description = "全員が同じ問題に挑戦し、正解した数を競います。ヒントは自分のペースで開けます。";

// このルールで選べる回答方式（回答候補の数）。ルーム設定画面はこの配列だけを見て
// 選択肢を絞り込む（「正解数バトルのときは〜」という個別分岐をUI側に書かないため）。
export const allowedAnswerPoolSizes = ANSWER_POOL_SIZE_ALL_MODES;

// 【2026-08-31改訂】ヒント表示時間はヒントを手動で開く方式になったため不要になった。
// ルール固有の設定項目は無くなったため空オブジェクトを返す。
export function defaultSettings() {
  return {};
}

export function validateSettings() {
  return null;
}

// 1問分・全員の回答から、参加者ごとの結果を導出する。
//
// answersByUid: { [uid]: { selectedSongId, hintLevel, submittedAt } }
//   hintLevelは「回答した時点で本人が開いていたヒント段階」の自己申告値（採点には使わず、
//   結果画面の参考情報としてのみ使う）。
// correctSongId: この問題の正解songId（呼び出し元が、全端末共通の決定論的な
//   問題生成結果から渡す。このルール自身は問題データを一切知らない）
// questionStartedAt: 参考情報の経過時間の逆算に使う
//
// 返り値: { [uid]: { outcome, hintLevel, responseMs, pointsAwarded, wonQuestion, nextComboCount } }
//   pointsAwardedは正解なら常に1、不正解・わからないなら常に0（ヒント段階は無関係）。
//   wonQuestionは常にfalse（正解数バトルには「奪い取り」の概念が無いため）。
//   nextComboCountは常に0（正解数バトルはコンボを持たないため）。
export function resolveQuestionAnswers({ answersByUid, correctSongId, questionStartedAt }) {
  const outcomesByUid = {};
  for (const [uid, answer] of Object.entries(answersByUid)) {
    const outcome = deriveAnswerOutcome(correctSongId, answer.selectedSongId);
    const responseMs = computeElapsedSinceQuestionStart({
      submittedAt: answer.submittedAt,
      questionStartedAt,
    });
    outcomesByUid[uid] = {
      outcome,
      hintLevel: answer.hintLevel,
      responseMs,
      pointsAwarded: outcome === "correct" ? 1 : 0,
      wonQuestion: false,
      nextComboCount: 0,
    };
  }
  return outcomesByUid;
}

// 【2026-08-31改訂→2026-09-06再改訂、本人指示】ヒントを手動で開く方式になったため、
// 「ヒント4の受付時間が終わったら強制終了」という自動デッドラインは意味を持たなくなり、
// 全員が回答済みになるまで待つ（設計の核心：先に回答した人にだけ正解を先に見せないための
// 全員同期）。一度は「誰かが操作をやめても対戦が止まらないように」固定60秒の安全網
// （MANUAL_PROGRESS_QUESTION_TIMEOUT_MS）を残していたが、実機で「考えている途中なのに
// 勝手に問題が終了する」という明確な問題が発生したため、本人指示によりこの固定時間の
// 安全網を完全に撤廃した。代わりに、本人が回答するまで問題は無期限に続く。長時間
// 無操作なプレイヤーへの対処は、固定時間で自動的に0点にするのではなく、ホストが
// 判断して個別に「わからない」扱いにできる救済機能（js/onlineLyricsQuizBattleScreen.jsの
// 3分無操作通知＋forcedSkips、実体はrecordAnswer()へのSKIP_SELECTION回答と同じ）に置き換えた。
export function shouldEndQuestion({ answersByUid, allPlayerUids }) {
  return allPlayerUids.every((uid) => uid in answersByUid);
}

// 1人分・全問のresolveQuestionAnswers結果（questionOutcomes）から、最終結果を組み立てる。
// questionOutcomes: resolveQuestionAnswers()が返す1人分のオブジェクトを、
//   出題順に並べた配列（{ outcome, hintLevel, responseMs, pointsAwarded }[]）。
// 【missCountとskippedCountを分ける理由・2026-08-06】選択肢を選んで間違えた（wrongAnswer）
// ことと、「わからない」を押した／時間切れで未回答のまま終わった（skipped）ことは、
// このエンジンでは元々別のoutcome値として区別されており、missCountには意図的に
// wrongAnswerだけを数えている（本人の設計方針：「選んで間違えた」と「わからなかった」は
// 別の失敗として扱う）。
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

// 【2026-08-31改訂・本人指示】「同点の場合に回答時間などで無理に順位を分けないでください」
// という明確な指示により、タイブレークを完全に撤廃した。合計ポイントだけで比較し、
// 同点なら0（＝同順位）を返す。同順位の実際の表示（1位・1位・3位、のように次の順位を
// 飛ばす方式）はjs/lyricsQuizBattleUi.jsのdescribeResultTable()が担当する
// （この関数はあくまで2者間の大小比較だけを返す）。
export function compareResults(resultA, resultB) {
  return resultB.detail.totalPoints - resultA.detail.totalPoints;
}

export function getRuleDescription() {
  return "全員が同じ問題に挑戦し、正解した数（ポイント）を競います。ヒントは自分のペースで手動で開けます（ヒント段階は得点に影響しません）。同点の場合は同じ順位になります。";
}

// 【Phase6.5新設】画面層が「回答を送信するときに何を送るか」をruleIdで分岐せずに
// 決められるようにする窓口（js/battleRules/index.jsのgetAnswerSubmissionPlan()経由）。
// 正解数バトルには奪い取りclaimの概念が無いため、常に回答ログだけを送る。
export function getAnswerSubmissionPlan() {
  return { submitAnswer: true, submitWinnerClaim: false };
}

// 【2026-08-31改訂】ヒント表示時間の選択が無くなったため空配列にした
// （ルーム設定画面はsettingsFieldsが空なら何も描画しない、既存の挙動）。
export const settingsFields = [];

// 対戦中HUDが自動生成するための宣言（追記⑦12章）。
// 【2026-08-31改訂・本人指示】「対戦中は自分の現在ポイントだけを見せ、順位や他人の
// ポイントとの比較は最終結果画面まで見せない」という明確な指示により、対戦中HUDは
// 自分の現在ポイントのみに簡略化した（以前あったヒント1正解数・総使用ヒント数・
// 総回答時間は結果画面（resultColumns）にのみ残す）。
export const hudFields = [{ key: "totalPoints", label: "現在のポイント" }];

// 結果画面が自動生成するための宣言（追記⑥10章）。
export const resultColumns = [
  { key: "totalPoints", label: "獲得ポイント" },
  { key: "totalHintsUsed", label: "使用ヒント数" },
  { key: "totalElapsedMs", label: "回答時間", unit: "ms" },
  { key: "missCount", label: "ミス回数" },
  { key: "skippedCount", label: "わからない回数" },
];
