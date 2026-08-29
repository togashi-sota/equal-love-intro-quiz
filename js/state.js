// ゲーム全体の「状態」をひとまとめに管理するファイル。
// フレームワークを使わないので、gameState という1つのオブジェクトに全部の情報を持たせ、
// 状態を変えたいときは必ずこのファイルの関数を通して変更する、というルールにする。

import { recordWeakSongAttempt } from "./weakSongStats.js";

export const gameState = {
  screen: "start",               // "start" | "quiz" | "result"
  questions: [],                 // このプレイで出題する問題の配列（{ song, choices } の形）
  currentIndex: 0,               // 今何問目か（0始まり）
  score: 0,                      // 合計得点
  answerLog: [],                 // 結果画面で使う、1問ごとの回答記録
  elapsedSec: 0,                 // 出題開始からの経過秒数（採点に使う。1秒単位で上限なしに数え上げる）
  timerId: null,                 // setIntervalのID（止めるときに使う）
  isAnswered: false,             // 今の問題にすでに回答済みかどうか
  answerTimerStartMs: null,      // 曲が実際に鳴り始めた時刻（performance.now()のミリ秒）。
                                  // 結果画面の回答時間表示・将来の記録機能用で、採点には使わない
  questionCountValue: null,      // 選択された出題数（"5" | "10" | "all"）。自己ベストを
                                  // モードごとに分けて保存するために結果画面まで持ち回す
  categoryFilterValue: null,     // 選択されたカテゴリ（"all" | "title-and-group" | "title-track"）。同上
  playMode: "normal",            // "normal" | "review" | "special"。"special"は苦手曲モードなど、
                                  // 通常プレイとは別の遊び方（特別モード）をまとめて表す値。
                                  // 文字列にしているのは、将来タイムアタック等のモードが増えたときに
                                  // 値を1つ増やすだけで拡張できるようにするため（bool併用だと
                                  // 本来ありえない組み合わせを構造上防げなくなる）。
  specialModeId: null,            // "special"のときだけ使う、どの特別モードかを表す値
                                  // （例:"weakSongs"）。特別モードが増えるたびに値が1つ増えるだけで、
                                  // playMode自体を増やす必要がないようにするための分離。
  reviewSongs: [],                    // 復習で出題する曲（間違えた曲。結果画面から復習を始める際に使う）
  reviewCategoryFilterValue: null,    // 復習のダミー選択肢を選ぶ際に絞り込むカテゴリ。
                                       // 元になったプレイのcategoryFilterValueをそのままコピーして持つ
                                       // （gameState.categoryFilterValue自体は復習中も書き換えないが、
                                       // 将来、履歴の別プレイなど「今とは違うカテゴリ」から復習を始める
                                       // 入口が増えることを見越して、あえて独立したフィールドにしている）。
  quizStartedAtMs: null,         // 【2026-08-16追加】通常プレイ（playMode:"normal"）がstartQuiz()で
                                  // 開始した瞬間のperformance.now()。ランキング参加のための
                                  // セッション所要時間計測に使う（タイムアタックとは別の、
                                  // 「ゲーム開始→最後の問題に正解」までの通しタイム）。
  quizFinishedAtMs: null,        // 最後の問題に正解した瞬間のperformance.now()。「次へ」ボタンで
                                  // 結果画面へ移動する操作の時間は含めない（本人指示：クイズを
                                  // 解く行為そのものだけを計測する）。js/main.jsのhandleChoiceClick
                                  // が、最終問題への正解を検知した時点で設定する。
};

// ゲームを最初の状態に戻す。リトライ時にも使う。
export function resetGameState() {
  gameState.screen = "start";
  gameState.questions = [];
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.elapsedSec = 0;
  gameState.timerId = null;
  gameState.isAnswered = false;
  gameState.answerTimerStartMs = null;
  gameState.questionCountValue = null;
  gameState.categoryFilterValue = null;
  gameState.playMode = "normal";
  gameState.specialModeId = null;
  gameState.reviewSongs = [];
  gameState.reviewCategoryFilterValue = null;
  gameState.quizStartedAtMs = null;
  gameState.quizFinishedAtMs = null;
}

// 生成済みの問題配列を受け取ってクイズを開始する。
// questionCountValue・categoryFilterValueは、結果画面で自己ベストをモードごとに
// 分けて扱うために保持しておく（採点そのものには使わない）。
export function startQuiz(questions, questionCountValue, categoryFilterValue) {
  gameState.questions = questions;
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.screen = "quiz";
  gameState.questionCountValue = questionCountValue;
  gameState.categoryFilterValue = categoryFilterValue;
  gameState.playMode = "normal"; // 復習・特別モードからの「通常プレイに戻る/始める」経由も含め、
  // 必ずここでnormalに戻す。
  gameState.specialModeId = null;
  // 「もう一度挑戦する」はresetGameState()を経由せずここへ直接来るため、
  // 前回プレイ最後の回答済み状態が残らないよう、ここで確実にリセットする。
  gameState.isAnswered = false;
  // 【2026-08-16追加】ランキング参加用のセッション計測を、ここで必ず開始し直す
  // （「もう一度挑戦する」も含め、通常プレイが始まる場所は必ずstartQuiz()を通るため）。
  gameState.quizStartedAtMs = performance.now();
  gameState.quizFinishedAtMs = null;
}

// 復習用に生成済みの問題配列を受け取って、復習クイズを開始する。
// questionCountValue・categoryFilterValueは、デフォルトではあえて変更しない。これにより、
// 結果画面から「今回のプレイ」を復習する場合、復習後に「通常プレイに戻る」を選んだときも
// 復習前と同じ出題数・カテゴリのまま再開できる。
//
// modeOverride（省略可）: { questionCountValue, categoryFilterValue }
// プレイ履歴から、今のgameStateとは違うモードだったプレイを復習する場合に使う。
// 指定すると、この2つの値をそのモードに合わせて上書きする。
export function startReviewQuiz(questions, modeOverride = null) {
  gameState.questions = questions;
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.screen = "quiz";
  gameState.playMode = "review";
  gameState.isAnswered = false;
  if (modeOverride !== null) {
    gameState.questionCountValue = modeOverride.questionCountValue;
    gameState.categoryFilterValue = modeOverride.categoryFilterValue;
  }
}

// 特別モード（苦手曲モードなど）用に生成済みの問題配列を受け取って、クイズを開始する。
// 曲を選ぶロジック自体はこの関数の外（各モードの確認画面）が担当し、ここでは
// 「選ばれた問題でクイズを始める」ことだけに専念する。将来オリジナル問題作成モード等が
// 増えても、specialModeIdの値を変えて呼ぶだけでそのまま使える想定。
// review・特別モードのどちらも自己ベスト・称号・プレイ履歴には反映しないため、
// categoryFilterValueは特に意味を持たずnullにしている。
export function startSpecialQuiz(questions, questionCountValue, specialModeId) {
  gameState.questions = questions;
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.screen = "quiz";
  gameState.playMode = "special";
  gameState.specialModeId = specialModeId;
  gameState.questionCountValue = questionCountValue;
  gameState.categoryFilterValue = null;
  gameState.isAnswered = false;
}

// タイムアタック用に生成済みの問題配列を受け取って、クイズを開始する。
// タイムアタック専用の実行中の記録（合計タイム・ミス数など）はgameStateには持たせず、
// js/timeAttackScreen.js側で完結させている（既存のスコア・称号・履歴の仕組みと
// 混ざらないようにするため。2026-08-06新設）。ここではreview・特別モードと同じく
// 「選ばれた問題でクイズを始める」ことだけに専念する。
// review・特別モードと違い、questionCountValue・categoryFilterValueの両方とも
// 自己ベストの保存キーとして実際に使うため、categoryFilterValueもnullにしない。
export function startTimeAttackQuiz(questions, questionCountValue, categoryFilterValue) {
  gameState.questions = questions;
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.screen = "quiz";
  gameState.playMode = "timeAttack";
  gameState.specialModeId = null;
  gameState.questionCountValue = questionCountValue;
  gameState.categoryFilterValue = categoryFilterValue;
  gameState.isAnswered = false;
}

// 対戦モード（ローカル対戦）のクイズを開始する。startTimeAttackQuiz()と全く同じパターンで、
// playModeだけ"localBattle"にする。実行中の記録（合計タイム・ミス数等）は、タイムアタックと
// 同じくjs/timeAttackScreen.jsのモジュール内変数で完結させる（gameStateには持たせない）。
export function startLocalBattleQuiz(questions, questionCountValue, categoryFilterValue) {
  gameState.questions = questions;
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.screen = "quiz";
  gameState.playMode = "localBattle";
  gameState.specialModeId = null;
  gameState.questionCountValue = questionCountValue;
  gameState.categoryFilterValue = categoryFilterValue;
  gameState.isAnswered = false;
}

// オンライン対戦（Firebase）のクイズを開始する。startLocalBattleQuiz()と全く同じパターンで、
// playModeだけ"onlineBattle"にする（Step3新設）。実行中の記録もローカル対戦と同じく
// js/timeAttackScreen.jsのモジュール内変数で完結させ、進捗・結果の送信はjs/onlineBattleScreen.js
// （js/onlineBattle.js経由）が別途Firebaseへ行う。
export function startOnlineBattleQuiz(questions, questionCountValue, categoryFilterValue) {
  gameState.questions = questions;
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.screen = "quiz";
  gameState.playMode = "onlineBattle";
  gameState.specialModeId = null;
  gameState.questionCountValue = questionCountValue;
  gameState.categoryFilterValue = categoryFilterValue;
  gameState.isAnswered = false;
}

// ランダム再生クイズ（曲中のランダムな位置から再生するモード）用に生成済みの問題配列を
// 受け取って、クイズを開始する。startTimeAttackQuiz()と全く同じパターンで、
// playModeだけ"randomPlayback"にする（2026-08-08新設、HANDOFF.md 10-59章・10-61章参照）。
// 実行中の記録（合計タイム・ミス数等）も、タイムアタックと同じくjs/timeAttackScreen.jsの
// モジュール内変数で完結させる（gameStateには持たせない。既存エンジンをそのまま再利用する
// アダプター方式の一環）。
export function startRandomPlaybackQuiz(questions, questionCountValue, categoryFilterValue) {
  gameState.questions = questions;
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.screen = "quiz";
  gameState.playMode = "randomPlayback";
  gameState.specialModeId = null;
  gameState.questionCountValue = questionCountValue;
  gameState.categoryFilterValue = categoryFilterValue;
  gameState.isAnswered = false;
}

// 今出題中の問題（{ song, choices }）を取得する。
export function getCurrentQuestion() {
  return gameState.questions[gameState.currentIndex];
}

// 計測の起点を記録する。
// 曲の再生を試みる直前（暫定値。読み込みが一瞬で終わり、
// 「鳴り始めた瞬間」を待たずに超高速で回答された場合の保険）と、
// 曲が実際に鳴り始めた瞬間（audio.jsのplayingイベント。より正確な値で上書きする）の
// 2箇所から呼ばれる想定。
export function markPlaybackStarted() {
  gameState.answerTimerStartMs = performance.now();
}

// 曲が鳴り始めてから今までの経過ミリ秒を返す。
// 音源の再生に失敗するなどして計測が始まっていない場合は null を返す（＝時間データなし）。
export function getElapsedMsSincePlaybackStart() {
  if (gameState.answerTimerStartMs === null) return null;
  return performance.now() - gameState.answerTimerStartMs;
}

// 回答結果を記録し、得点を加算する。
// resultTypeは "correct" | "wrong" | "skip" | "reveal" の4種類。
// elapsedMsは結果画面の表示・プレイ履歴機能のためだけに使う値で、採点には影響しない。
export function recordAnswer(resultType, pointsEarned, elapsedMs) {
  const question = getCurrentQuestion();
  gameState.answerLog.push({
    song: question.song,
    resultType,
    pointsEarned,
    elapsedMs,
  });
  gameState.score += pointsEarned;

  // 【2026-08-16追加、本人指示】苦手曲判定用の記録は、通常プレイ（playMode:"normal"）
  // だけを対象にする。復習("review")・特別モード("special"。苦手曲モード自身を含む)は
  // ここでは対象外にする（苦手曲モード自身の結果が苦手曲判定にフィードバックされて
  // しまうのを防ぐため）。resultTypeが"skip"・"reveal"の場合も、getMissedSongs()と同じく
  // 「間違えた」扱いとしてattemptsだけを積む（correctは増やさない）。
  // 【2026-08-30追加、本人指示】アウトロクイズ（playMode:"special"・specialModeId:"outroQuiz"）は
  // 「通常クイズに近い」位置づけのため、既存の苦手曲モード（js/weakSongStats.js、
  // イントロ・ランダム再生と合算）へそのまま合流させる。一瞬チャレンジは、歌詞クイズと同様
  // gameStateを経由しない独立した進行のため（js/instantChallengeScreen.js参照）、ここでは扱わない。
  const isOutroQuiz = gameState.playMode === "special" && gameState.specialModeId === "outroQuiz";
  if (gameState.playMode === "normal" || isOutroQuiz) {
    recordWeakSongAttempt(question.song.id, resultType === "correct");
  }
}

// 次の問題に進む。まだ問題が残っていれば true、全問終わっていれば false を返す。
export function advanceToNextQuestion() {
  gameState.currentIndex += 1;
  gameState.isAnswered = false;
  gameState.elapsedSec = 0;
  return gameState.currentIndex < gameState.questions.length;
}

// answerLogから、間違えた曲（不正解・スキップ・答えを見た、のいずれか）を重複なく抽出する。
// 復習モードの出題対象を決めるのに使う関数で、通常プレイ直後の初回抽出にも、
// 復習ラウンド終了後の「まだ間違えた曲」の再抽出にも、同じ関数をそのまま使う。
// 同じ曲が複数回出てきた場合（将来、複数プレイ分のanswerLogをまとめて渡すようなケースを見越して）
// 重複を除いてsongIdごとに1件だけ残す。
export function getMissedSongs(answerLog) {
  const missedSongsById = new Map();
  answerLog
    .filter((entry) => entry.resultType !== "correct")
    .forEach((entry) => {
      missedSongsById.set(entry.song.id, entry.song);
    });
  return [...missedSongsById.values()];
}

// 復習で出題する曲と、ダミー選択肢を選ぶ際に使うカテゴリを保持する。
// 結果画面が描画されるたびに呼び、「間違えた曲だけ復習する」ボタンが押されたときに
// この内容を使って復習クイズを組み立てる。
export function setReviewSongs(songs, categoryFilterValue) {
  gameState.reviewSongs = songs;
  gameState.reviewCategoryFilterValue = categoryFilterValue;
}
