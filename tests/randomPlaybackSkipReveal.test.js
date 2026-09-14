// 通常ランダム再生クイズの「スキップ」「答えを見る」（2026-09-15追加、本人指示）の回帰テスト。
//
// 【仕様（本人確定）】
// ・通常のランダム再生クイズ（playMode:"randomPlayback"）にだけ「スキップ」「答えを見る」を表示する。
//   タイムアタック（イントロ／ランダム再生／アウトロ）・1台対戦・オンライン対戦では今までどおり非表示。
// ・押した問題は「不正解として確定し、ミス数＋1」（Q1）。skippedCount として別に数える。
//   → ランキング対象外・自己ベスト対象外・称号の対象外・苦手曲では不正解扱い。
// ・（2026-09-15改訂）通常ランダム再生の内部ルールは normal 固定（ルール選択は廃止、tests/randomPlaybackNormalQuiz.test.js）。
//   エンジン自体はノーミスチャレンジでも成立する（失敗終了は呼び出し側の markTimeAttackRunFailed）ため、
//   エンジン単体のケースとして残している。
// ・「答えを見る」は正解の選択肢を表示し、自動では進まず「次へ」を押すまで待つ（Q2＝(b)。通常イントロ／アウトロと同じ）。
// ・ランキング候補の判定は missCount===0 だけに頼らず skippedCount===0 も明示的に確認する。
//
// 1) は js/timeAttackScreen.js の記録エンジン＋js/randomPlaybackScreen.js の結果処理を実際に動かして確認、
// 2) は DOM直結の js/main.js をソース構造検証で確認する（既存テストと同じ方式）。

import {
  TIME_ATTACK_VARIANT,
  startTimeAttackRun,
  recordTimeAttackAnswer,
  recordTimeAttackSkip,
  registerTimeAttackMiss,
  markTimeAttackRunFailed,
  getCurrentTimeAttackStats,
  buildAchievementResultInput,
} from "../js/timeAttackScreen.js";
import { initRandomPlaybackResultScreen, renderRandomPlaybackResult } from "../js/randomPlaybackScreen.js";
import { getRandomPlaybackBest, getRandomPlaybackBestReach } from "../js/randomPlaybackScore.js";
import { getNativePlayHistoryEntries, clearNativePlayHistoryEntries } from "../js/playHistory.js";
import { getShuffleWeakSongStats } from "../js/shuffleWeakSongStats.js";
import { getAchievementListSnapshot } from "../js/achievementProgress.js";
import { gameState } from "../js/state.js";
import { assertEqual } from "./test-utils.js";

const RELATED_KEYS = [
  "equalLoveIntroQuiz.achievements",
  "equalLoveIntroQuiz.shuffleWeakSongStats",
  "equalLoveIntroQuiz.randomPlaybackBest.normal.5.all",
  "equalLoveIntroQuiz.randomPlaybackBest.loveChain.5.all",
  "equalLoveIntroQuiz.randomPlaybackBestReach.5.all",
  "equalLoveIntroQuiz.rankingCandidateBest",
];

function cleanup() {
  RELATED_KEYS.forEach((key) => localStorage.removeItem(key));
  clearNativePlayHistoryEntries();
}

function buildFakeQuestion(songId) {
  return {
    song: { id: songId, title: `テスト曲${songId}` },
    choices: [
      { id: "c1", title: "A" },
      { id: "c2", title: "B" },
      { id: "c3", title: "C" },
      { id: "c4", title: "D" },
    ],
  };
}

function buildFakeResultElements(callbacks) {
  return {
    newRecordBadge: document.createElement("p"),
    failStatus: document.createElement("p"),
    skippedStatus: document.createElement("p"),
    ruleStat: document.createElement("div"),
    totalTime: document.createElement("p"),
    correctCount: document.createElement("p"),
    missCount: document.createElement("p"),
    ruleLabel: document.createElement("p"),
    averageTime: document.createElement("p"),
    speedProgressContainer: document.createElement("div"),
    bestTime: document.createElement("p"),
    achievementChipContainer: document.createElement("div"),
    achievementListLink: document.createElement("button"),
    leaderboardStatus: document.createElement("p"),
    ...callbacks,
  };
}

export function runRandomPlaybackSkipRevealTests() {
  const previousPlayMode = gameState.playMode;
  gameState.playMode = "randomPlayback";
  cleanup();

  // ---- 1) エンジン：スキップ／答えを見るは「不正解・ミス＋1」として確定する ----
  startTimeAttackRun("normal", "5", "all", TIME_ATTACK_VARIANT.RANDOM_PLAYBACK);
  recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion("s1") });
  recordTimeAttackSkip({ elapsedMs: 800, question: buildFakeQuestion("s2"), resolution: "skip" });
  recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion("s3") });
  // 一度外してから「答えを見る」：外した分＋確定分でミス2
  registerTimeAttackMiss();
  recordTimeAttackSkip({ elapsedMs: 1500, question: buildFakeQuestion("s4"), resolution: "reveal" });
  recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion("s5") });

  const stats = getCurrentTimeAttackStats();
  assertEqual(stats.correctCount, 3, "スキップ／答えを見るした問題は正解数に入らない");
  assertEqual(stats.missCount, 3, "スキップ＝ミス＋1、外してから答えを見る＝外した分＋1（合計3）");
  assertEqual(stats.skippedCount, 2, "スキップと答えを見るの回数が skippedCount として数えられる");
  assertEqual(stats.totalElapsedMs, 5300, "経過時間は合計タイムに加算される（記録自体は残る）");
  assertEqual(stats.perQuestionResults[1].resolution, "skip", "問題別内訳にスキップの目印が残る");
  assertEqual(stats.perQuestionResults[1].isCorrect, false, "スキップした問題は不正解として確定する");
  assertEqual(stats.perQuestionResults[3].resolution, "reveal", "問題別内訳に答えを見るの目印が残る");
  assertEqual(stats.perQuestionResults[0].resolution, null, "普通に答えた問題には目印が付かない");
  assertEqual(stats.runFailed, false, "ノーマルルールではスキップしても終了しない");

  // 称号判定への入力：スキップ分は wrongCount ではなく skippedCount に分けられる（通常クイズと同じ形）
  const achievementInput = buildAchievementResultInput(stats, "randomPlayback", "5", "all");
  assertEqual(achievementInput.correctCount, 3, "称号判定：正解数3");
  assertEqual(achievementInput.wrongCount, 0, "称号判定：スキップ／答えを見るは誤答としては数えない");
  assertEqual(achievementInput.skippedCount, 2, "称号判定：skippedCount=2（成長段階などの対象外になる）");

  // 苦手曲（シャッフル系統）：スキップした曲は「答えて不正解」として積まれる
  const shuffle = getShuffleWeakSongStats();
  assertEqual(shuffle.s2, { attempts: 1, correct: 0 }, "スキップした曲は苦手曲統計で不正解1回として積まれる");
  assertEqual(shuffle.s4, { attempts: 1, correct: 0 }, "答えを見た曲も不正解1回として積まれる");
  assertEqual(shuffle.s1, { attempts: 1, correct: 1 }, "普通に正解した曲は正解1回");

  // ---- 2) 結果処理：自己ベスト・ランキング候補・称号の対象外、履歴には残る ----
  let cleanClearCalls = 0;
  let newRecordCalls = 0;
  const elements = buildFakeResultElements({
    onCleanClear: () => { cleanClearCalls += 1; },
    onNewRecord: () => { newRecordCalls += 1; },
  });
  initRandomPlaybackResultScreen(elements);
  renderRandomPlaybackResult("5", "all");
  assertEqual(getRandomPlaybackBest("normal", "5", "all"), null, "スキップ／答えを見るを使った回は自己ベストに保存されない");
  assertEqual(cleanClearCalls, 0, "スキップ／答えを見るを使った回はランキング候補（onCleanClear）にならない");
  assertEqual(newRecordCalls, 0, "スキップ／答えを見るを使った回はランキング送信（onNewRecord）されない");
  assertEqual(elements.newRecordBadge.hidden, true, "新記録バッジは出ない");
  assertEqual(elements.skippedStatus.hidden, false, "結果画面にスキップ／答えを見るの案内が出る");
  assertEqual(elements.skippedStatus.textContent, "スキップ・答えを見る：2回（この回は自己ベスト・ランキングの対象外です）", "案内文に回数と対象外の説明がある");
  assertEqual(elements.bestTime.hidden, true, "自己ベストが無い状態でスキップを使った回は「はじめての記録です」と出さない");
  assertEqual(elements.correctCount.textContent, "3 / 5問", "正解数の表示");
  assertEqual(elements.missCount.textContent, "3回", "ミス数の表示（スキップ分を含む）");
  const historyEntry = getNativePlayHistoryEntries()[0];
  assertEqual(historyEntry.modeId, "randomPlayback", "統一プレイ履歴に記録される");
  assertEqual(historyEntry.skippedCount, 2, "統一プレイ履歴の skippedCount に実数が入る（以前は null 固定）");
  assertEqual(historyEntry.correctCount, 3, "統一プレイ履歴の正解数");
  const shuffleBeginner = getAchievementListSnapshot().find((a) => a.id === "shuffle_beginner");
  assertEqual(shuffleBeginner.isUnlocked, false, "スキップ／答えを見るを使った5問クリアではシャッフルビギナーを獲得しない");
  cleanup();

  // ---- 3) 何も使わなければ今までどおり（回帰）----
  startTimeAttackRun("normal", "5", "all", TIME_ATTACK_VARIANT.RANDOM_PLAYBACK);
  for (let i = 0; i < 5; i += 1) {
    recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion(`c${i}`) });
  }
  cleanClearCalls = 0;
  newRecordCalls = 0;
  const cleanElements = buildFakeResultElements({
    onCleanClear: () => { cleanClearCalls += 1; },
    onNewRecord: () => { newRecordCalls += 1; },
  });
  initRandomPlaybackResultScreen(cleanElements);
  renderRandomPlaybackResult("5", "all");
  assertEqual(getCurrentTimeAttackStats().skippedCount, 0, "使わなければ skippedCount は0のまま");
  assertEqual(getRandomPlaybackBest("normal", "5", "all"), 5000, "使わなければ自己ベストは今までどおり保存される");
  assertEqual(cleanClearCalls, 1, "使わなければランキング候補（onCleanClear）は今までどおり1回呼ばれる");
  assertEqual(newRecordCalls, 1, "使わなければランキング送信（onNewRecord）は今までどおり呼ばれる");
  assertEqual(cleanElements.skippedStatus.hidden, true, "使わなければ案内は出ない");
  assertEqual(getNativePlayHistoryEntries()[0].skippedCount, 0, "使わなければ履歴の skippedCount は0");
  cleanup();

  // ---- 4) ノーミスチャレンジ：スキップ＝1ミス＝失敗終了、最高到達記録も対象外 ----
  startTimeAttackRun("loveChain", "5", "all", TIME_ATTACK_VARIANT.RANDOM_PLAYBACK);
  recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion("l1") });
  recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion("l2") });
  recordTimeAttackSkip({ elapsedMs: 700, question: buildFakeQuestion("l3"), resolution: "skip" });
  markTimeAttackRunFailed(); // js/main.js の handleRandomPlaybackSkip がノーミスチャレンジのときに行う処理
  const loveElements = buildFakeResultElements({ onCleanClear: () => { cleanClearCalls += 1; }, onNewRecord: () => { newRecordCalls += 1; } });
  cleanClearCalls = 0;
  newRecordCalls = 0;
  initRandomPlaybackResultScreen(loveElements);
  renderRandomPlaybackResult("5", "all");
  assertEqual(getCurrentTimeAttackStats().runFailed, true, "ノーミスチャレンジでスキップすると失敗として終了する");
  assertEqual(loveElements.failStatus.hidden, false, "失敗の表示が出る");
  assertEqual(getRandomPlaybackBestReach("5", "all"), null, "スキップを含む回は最高到達記録の対象外");
  assertEqual(getRandomPlaybackBest("loveChain", "5", "all"), null, "自己ベストも保存されない");
  assertEqual(cleanClearCalls + newRecordCalls, 0, "ランキング候補・送信のどちらも呼ばれない");

  cleanup();
  gameState.playMode = previousPlayMode;
}

export async function runRandomPlaybackSkipRevealWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const main = await fetchText("js/main.js");

  // ---- 表示条件：通常ランダム再生だけ表示、タイムアタック・対戦は非表示のまま ----
  assertEqual(
    main.includes('const hidesSkipAndReveal =\r\n    gameState.playMode === "timeAttack" ||\r\n    gameState.playMode === "localBattle" ||\r\n    gameState.playMode === "onlineBattle";') ||
      main.includes('const hidesSkipAndReveal =\n    gameState.playMode === "timeAttack" ||\n    gameState.playMode === "localBattle" ||\n    gameState.playMode === "onlineBattle";'),
    true,
    "renderQuestion：スキップ／答えを見るを隠すのは timeAttack・localBattle・onlineBattle の3つ（randomPlayback は表示）"
  );
  assertEqual(main.includes("skipButtonElement.hidden = hidesSkipAndReveal;") && main.includes("revealButtonElement.hidden = hidesSkipAndReveal;"), true, "renderQuestion：2ボタンの表示が同じ条件で切り替わる");
  assertEqual(/gameState\.playMode === "randomPlayback" \|\|\s*gameState\.playMode === "localBattle"/.test(main), false, "renderQuestion：randomPlayback を隠す条件は残っていない");

  // ---- 通常イントロ／アウトロ用の handleSkip／handleReveal は先頭で randomPlayback を分岐するだけ（本体は無変更）----
  assertEqual(main.includes('function handleSkip() {\r\n  if (gameState.playMode === "randomPlayback") {\r\n    handleRandomPlaybackSkip();\r\n    return;\r\n  }') || main.includes('function handleSkip() {\n  if (gameState.playMode === "randomPlayback") {\n    handleRandomPlaybackSkip();\n    return;\n  }'), true, "handleSkip：randomPlayback は専用処理へ分岐する");
  assertEqual(main.includes('recordAnswer("skip", 0, getElapsedMsSincePlaybackStart());'), true, "handleSkip：通常イントロ／アウトロの記録（recordAnswer）は無変更");
  assertEqual(main.includes('recordAnswer("reveal", 0, getElapsedMsSincePlaybackStart());'), true, "handleReveal：通常イントロ／アウトロの記録（recordAnswer）は無変更");

  // ---- 専用処理：記録エンジン・音源停止・ノーミスチャレンジの終了・答えを見るは自動で進まない ----
  const skipStart = main.indexOf("function handleRandomPlaybackSkip() {");
  const revealStart = main.indexOf("function handleRandomPlaybackReveal() {");
  const revealEnd = main.indexOf("function renderProgressDots() {");
  assertEqual(skipStart > 0 && revealStart > skipStart && revealEnd > revealStart, true, "handleRandomPlaybackSkip／Reveal が定義されている");
  const skipBody = main.slice(skipStart, revealStart);
  const revealBody = main.slice(revealStart, revealEnd);
  assertEqual(skipBody.includes('recordTimeAttackSkip({ elapsedMs: getElapsedMsSincePlaybackStart(), question, resolution: "skip" });'), true, "スキップ：タイムアタックエンジンへ『スキップ＝不正解・ミス＋1』として記録する");
  assertEqual(skipBody.includes("stopTimer();") && skipBody.includes("stopAudio();"), true, "スキップ：タイマーと音源を止める");
  assertEqual(skipBody.includes("markTimeAttackRunFailed();"), false, "スキップ：ルール選択廃止後は到達不能だったノーミスチャレンジ用の終了分岐を持たない");
  assertEqual(skipBody.includes("goToNextQuestionOrResult();"), true, "スキップ：すぐ次の問題へ");
  assertEqual(revealBody.includes('recordTimeAttackSkip({ elapsedMs: getElapsedMsSincePlaybackStart(), question, resolution: "reveal" });'), true, "答えを見る：『不正解・ミス＋1』として記録する");
  assertEqual(revealBody.includes("markChoiceButtons(null);") && revealBody.includes("nextButtonElement.hidden = false;"), true, "答えを見る：正解の選択肢を表示し『次へ』ボタンを出す");
  assertEqual(revealBody.includes("goToNextQuestionOrResult()") || revealBody.includes("scheduleTimeAttackAdvance("), false, "答えを見る：自動では次へ進まない（通常イントロ／アウトロと同じく『次へ』待ち）");
  assertEqual(revealBody.includes("playWrongSound();"), true, "答えを見る：不正解音を鳴らす");

  // ---- 「次へ」：通常ランダム再生専用の分岐は持たない（ルール選択廃止で不要になった）----
  assertEqual(main.includes('gameState.playMode === "randomPlayback" && getCurrentTimeAttackStats().runFailed'), false, "次へ：通常ランダム再生の失敗終了用分岐は残っていない");
  assertEqual(revealBody.includes("markTimeAttackRunFailed"), false, "答えを見る：ノーミスチャレンジ用の失敗記録は残っていない");

  // ---- タイムアタック側の処理（handleTimedChoiceClick）は無変更 ----
  assertEqual(main.includes("function handleTimedChoiceClick(selectedChoice, { onAdvance, onRunEnd }) {"), true, "タイムアタックの回答処理は残っている");
  assertEqual(main.split("recordTimeAttackSkip(").length - 1, 2, "recordTimeAttackSkip の呼び出しは通常ランダム再生の2箇所（スキップ／答えを見る）だけ");

  // ---- 結果処理側 ----
  const screen = await fetchText("js/randomPlaybackScreen.js");
  assertEqual(screen.includes("if (!stats.runFailed && stats.missCount === 0 && (stats.skippedCount ?? 0) === 0) {"), true, "ランキング候補は missCount===0 かつ skippedCount===0 を明示的に確認する");
  assertEqual(screen.includes("!usedSkipOrReveal &&\r\n    saveRandomPlaybackBestIfBetter(") || screen.includes("!usedSkipOrReveal &&\n    saveRandomPlaybackBestIfBetter("), true, "自己ベストはスキップ／答えを見るを使った回では更新しない");
  assertEqual(screen.includes("skippedCount: stats.skippedCount ?? 0,"), true, "履歴の skippedCount に実数を入れる");

  // ---- 説明文 ----
  const html = await fetchText("index.html");
  assertEqual(html.includes('id="random-playback-result-skipped-status"'), true, "結果画面に案内用の要素がある");
  assertEqual(html.includes("「スキップ」「答えを見る」も使えます"), true, "設定画面の説明文にスキップ／答えを見るの案内がある");
}
