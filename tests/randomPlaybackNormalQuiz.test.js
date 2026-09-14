// 通常ランダム再生クイズを「通常クイズ」に揃える改修（2026-09-15、本人指示）の回帰テスト。
//
// 【仕様（本人確定）】
// ・通常ランダム再生の設定画面は「出題数・カテゴリ」だけ（ルール選択は廃止）。
//   タイムアタック／正解数バトル／ノーミスチャレンジは、タイムアタック側の出題タイプ「ランダム再生」でのみ選べる。
// ・内部の進行ルールは normal 固定（js/randomPlaybackScreen.js の RANDOM_PLAYBACK_RULE）。これは互換のための内部値で、
//   ユーザー向けには「タイムアタックルールで遊んでいる」ように見せない：
//     結果画面のルール欄は非表示／履歴にルールを残さない／ランキング送信は rule:null・source:"normal"
// ・自己ベストは既存の randomPlaybackBest.normal.* をそのまま使う（過去の記録と連続）。hard／loveChain の過去データは消さない。
// ・スキップ／答えを見るを使わずミス0で完走した回は、これまでどおり同じ randomPlayback のランキング枠へ参加する。

import {
  TIME_ATTACK_RULE,
  TIME_ATTACK_VARIANT,
  recordTimeAttackAnswer,
  getCurrentTimeAttackRule,
  getLastTimeAttackSelection,
  getCurrentTimeAttackStats,
} from "../js/timeAttackScreen.js";
import {
  RANDOM_PLAYBACK_RULE,
  startRandomPlaybackRun,
  initRandomPlaybackResultScreen,
  renderRandomPlaybackResult,
} from "../js/randomPlaybackScreen.js";
import { getRandomPlaybackBest, saveRandomPlaybackBestIfBetter } from "../js/randomPlaybackScore.js";
import { getNativePlayHistoryEntries, clearNativePlayHistoryEntries } from "../js/playHistory.js";
import { gameState } from "../js/state.js";
import { assertEqual } from "./test-utils.js";

const RELATED_KEYS = [
  "equalLoveIntroQuiz.achievements",
  "equalLoveIntroQuiz.shuffleWeakSongStats",
  "equalLoveIntroQuiz.randomPlaybackBest.normal.5.all",
  "equalLoveIntroQuiz.randomPlaybackBest.hard.5.all",
  "equalLoveIntroQuiz.randomPlaybackBest.loveChain.5.all",
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

export function runRandomPlaybackNormalQuizTests() {
  const previousPlayMode = gameState.playMode;
  gameState.playMode = "randomPlayback";
  cleanup();

  // ---- 内部ルールは normal 固定 ----
  assertEqual(RANDOM_PLAYBACK_RULE, TIME_ATTACK_RULE.NORMAL, "通常ランダム再生の内部ルールは normal（既存の自己ベストと同じキー）");
  startRandomPlaybackRun("5", "all");
  assertEqual(getCurrentTimeAttackRule(), TIME_ATTACK_RULE.NORMAL, "開始時にエンジンへ渡るルールは normal");
  assertEqual(getLastTimeAttackSelection().rule, TIME_ATTACK_RULE.NORMAL, "リトライ用の直前条件も normal（出題数・カテゴリはそのまま）");
  assertEqual(getLastTimeAttackSelection().questionCountValue, "5", "リトライ用の出題数");
  assertEqual(getLastTimeAttackSelection().categoryFilterValue, "all", "リトライ用のカテゴリ");

  // ---- 自己ベストは既存キー（normal）に連続、hard／loveChain の過去データには触らない ----
  localStorage.setItem("equalLoveIntroQuiz.randomPlaybackBest.hard.5.all", "4321");
  localStorage.setItem("equalLoveIntroQuiz.randomPlaybackBest.loveChain.5.all", "5432");
  saveRandomPlaybackBestIfBetter(9000, "normal", "5", "all"); // 過去の normal 自己ベスト
  for (let i = 0; i < 5; i += 1) {
    recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion(`c${i}`) });
  }
  const calls = { newRecord: [], cleanClear: [] };
  const elements = buildFakeResultElements({
    onNewRecord: (payload) => calls.newRecord.push(payload),
    onCleanClear: (payload) => calls.cleanClear.push(payload),
  });
  initRandomPlaybackResultScreen(elements);
  renderRandomPlaybackResult("5", "all");
  assertEqual(getRandomPlaybackBest("normal", "5", "all"), 5000, "自己ベストは randomPlaybackBest.normal.* に保存され、過去の記録（9000）を更新する");
  assertEqual(localStorage.getItem("equalLoveIntroQuiz.randomPlaybackBest.hard.5.all"), "4321", "hard の過去データは消さない・触らない");
  assertEqual(localStorage.getItem("equalLoveIntroQuiz.randomPlaybackBest.loveChain.5.all"), "5432", "loveChain の過去データは消さない・触らない");
  assertEqual(elements.bestTime.textContent, "自己ベストを更新しました（前回: 9.00秒）", "結果画面の自己ベスト表示は従来どおり");

  // ---- ランキング：同じ randomPlayback 区分へ、rule:null で参加 ----
  assertEqual(calls.cleanClear.length, 1, "ミス0・スキップ0で完走した回はランキング候補（onCleanClear）になる");
  assertEqual(calls.cleanClear[0].variant, TIME_ATTACK_VARIANT.RANDOM_PLAYBACK, "区分は randomPlayback（タイムアタック側と同じ枠）");
  assertEqual(calls.cleanClear[0].rule, null, "ランキングへ送る rule は null（通常イントロ／アウトロと同じ）");
  assertEqual(calls.cleanClear[0].questionCountValue, "5", "出題数はそのまま");
  assertEqual(calls.cleanClear[0].categoryFilterValue, "all", "カテゴリはそのまま");
  assertEqual(calls.newRecord.length, 1, "自己ベスト更新時はランキング送信（onNewRecord）も呼ばれる");
  assertEqual(calls.newRecord[0].rule, null, "ランキング送信の rule も null");

  // ---- 結果画面・履歴：内部ルールを見せない ----
  assertEqual(elements.ruleStat.hidden, true, "結果画面のルール欄は非表示");
  assertEqual(elements.ruleLabel.textContent, "", "結果画面にルール名を書き込まない");
  const historyEntry = getNativePlayHistoryEntries()[0];
  assertEqual(historyEntry.modeId, "randomPlayback", "統一プレイ履歴に記録される");
  assertEqual("rule" in (historyEntry.details ?? {}), false, "履歴の details にルールを残さない（履歴詳細に「ルール」行が出ない）");
  assertEqual(historyEntry.details.totalElapsedMs, 5000, "履歴の合計タイムは残る");
  assertEqual(getCurrentTimeAttackStats().skippedCount, 0, "スキップ／答えを見るを使わなければ skippedCount は0");

  cleanup();
  gameState.playMode = previousPlayMode;
}

export async function runRandomPlaybackNormalQuizWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

  // ---- 設定画面：ルール選択が無い。タイムアタック側の3ルールは残っている ----
  const html = await fetchText("index.html");
  assertEqual(html.includes('name="random-playback-rule"'), false, "通常ランダム再生の設定画面にルール選択（random-playback-rule）が無い");
  assertEqual((html.match(/name="random-playback-question-count"/g) ?? []).length, 5, "出題数の選択肢は5種類のまま");
  assertEqual((html.match(/name="random-playback-category-filter"/g) ?? []).length, 3, "カテゴリの選択肢は3種類のまま");
  assertEqual(
    ["normal", "hard", "loveChain"].every((value) => html.includes(`name="time-attack-rule" value="${value}"`)),
    true,
    "タイムアタック側のルール選択（タイムアタック／正解数バトル／ノーミスチャレンジ）は3種類とも残っている"
  );
  assertEqual(html.includes('id="random-playback-result-rule-stat" hidden'), true, "結果画面のルール欄はHTMLでも非表示");
  assertEqual(html.includes("タイムアタック／正解数バトル／ノーミスチャレンジで遊ぶには、タイムアタックの出題タイプで「ランダム再生」を選んでください"), true, "設定画面の説明文が3ルールをタイムアタック側へ案内している");
  assertEqual(html.includes("タイムアタックの上級者向けバリエーション"), false, "説明モーダルから「タイムアタックの上級者向け」の表現が消えている");

  // ---- コード配線 ----
  const screen = await fetchText("js/randomPlaybackScreen.js");
  assertEqual(screen.includes("export const RANDOM_PLAYBACK_RULE = TIME_ATTACK_RULE.NORMAL;"), true, "内部ルールは定数 RANDOM_PLAYBACK_RULE（normal）");
  assertEqual(screen.includes("export function startRandomPlaybackRun(questionCountValue, categoryFilterValue) {"), true, "開始関数はルール引数を取らない");
  assertEqual(screen.includes('input[name="random-playback-rule"]'), false, "ルールのラジオを読むコードが残っていない");
  assertEqual(screen.includes("saveRandomPlaybackBestReachIfBetter"), false, "ノーミスチャレンジ用の最高到達記録の保存は通常ランダム再生から外れている");
  assertEqual(screen.includes("rule: null,"), true, "ランキング送信の rule は null");
  assertEqual(screen.includes("if (resultElements.ruleStat) resultElements.ruleStat.hidden = true;"), true, "結果画面のルール欄を隠す");

  const main = await fetchText("js/main.js");
  assertEqual(main.includes("getRandomPlaybackBest(RANDOM_PLAYBACK_RULE, questionCountValue, categoryFilterValue)"), true, "設定画面の自己ベストは固定ルール（normal）で読む");
  assertEqual(main.includes('input[name="random-playback-rule"]'), false, "main.js にもルールのラジオを読むコードが残っていない");
  assertEqual(main.includes("startRandomPlaybackRun(questionCountValue, categoryFilterValue);"), true, "開始時にルール引数を渡さない");
  assertEqual((main.match(/beginRandomPlaybackQuiz\(questionCountValue, categoryFilterValue\)/g) ?? []).length >= 3, true, "開始・リトライ（結果画面／クイズ画面）の呼び出しがルール引数なしに統一されている");
  // タイムアタック側は無変更
  assertEqual(main.includes("beginTimeAttackQuiz(questionCountValue, categoryFilterValue, rule, variant);"), true, "タイムアタック側のリトライはルール付きのまま");
  assertEqual(main.includes("function handleTimedChoiceClick(selectedChoice, { onAdvance, onRunEnd }) {"), true, "タイムアタックの回答処理は無変更");
  const guide = await fetchText("js/data/guideContent.js");
  assertEqual(guide.includes("出題数・カテゴリを選ぶ（タイムアタック／正解数バトル／ノーミスチャレンジで遊ぶときは、タイムアタックの出題タイプ「ランダム再生」から）"), true, "遊び方ガイドの手順からルール選択が消え、タイムアタック側へ案内している");
}
