// タイムアタックの出題タイプ「🎬アウトロ」（2026-09-15追加、本人指示）の回帰テスト。
//
// 【仕様（本人確定）】
// ・出題タイプをイントロ／ランダム再生／アウトロの3種類にする。アウトロは通常アウトロクイズと
//   同じ「曲の最後5秒」を再生する（js/main.jsの既存のアウトロ再生分岐をそのまま共用し、
//   タイムアタック側へ再生ロジックを二重実装しない）。
// ・3ルール（タイムアタック／正解数バトル／ノーミスチャレンジ）・出題数・カテゴリは既存と同じ。
// ・自己ベスト・最高到達記録・履歴は variant:"outro" として独立に記録し、イントロ／ランダム再生の
//   既存記録と混ざらない。
// ・正誤は「アウトロ」系統の苦手曲統計（js/outroWeakSongStats.js）へ反映する。
// ・称号はアウトロ系（アウトロビギナー/チャレンジャー/エース、アウトロマスター・完全終曲）の
//   対象に含める（modeId:"timeAttackOutro"）。イントロ系（ノーミスマスター・電光石火）には乗らない。
// ・ランキングは既存の🎬アウトロ区分（通常アウトロクイズと共用）を使う。区分は増やさない。
//
// このテストは、
// 1) js/timeAttackScreen.js の記録エンジンを実際に動かし（DOM要素だけ差し替え）、上記の
//    「独立した記録」「苦手曲の集計先」「称号の対象」を確認する。
// 2) DOM直結で直接importできない js/main.js・index.html の配線を、ソース構造検証で確認する
//    （既存の tests/weakSongsAnswerPoolRegression.test.js と同じ方式）。特に、アウトロ再生の
//    呼び出し（playSongFromRandomPosition＋OUTRO_QUIZ_PLAY_DURATION_SEC）がタイムアタック用に
//    増えていない＝二重実装が無いことを検証する。

import {
  TIME_ATTACK_VARIANT,
  startTimeAttackRun,
  getCurrentTimeAttackVariant,
  getCurrentTimeAttackSeed,
  recordTimeAttackAnswer,
  markTimeAttackRunFailed,
  initTimeAttackResultScreen,
  renderTimeAttackResult,
  getLastTimeAttackSelection,
} from "../js/timeAttackScreen.js";
import { getTimeAttackBest, getTimeAttackBestReach } from "../js/timeAttackScore.js";
import { getTimeAttackHistoryEntries, clearTimeAttackHistoryEntries, saveTimeAttackHistoryEntry } from "../js/timeAttackHistory.js";
import { getAchievementListSnapshot } from "../js/achievementProgress.js";
import { getOutroWeakSongStats } from "../js/outroWeakSongStats.js";
import { getWeakSongStats } from "../js/weakSongStats.js";
import { getShuffleWeakSongStats } from "../js/shuffleWeakSongStats.js";
import { gameState } from "../js/state.js";
import { assertEqual } from "./test-utils.js";

const ACHIEVEMENTS_KEY = "equalLoveIntroQuiz.achievements";
const RELATED_KEYS = [
  "equalLoveIntroQuiz.timeAttackBest.normal.5.all",
  "equalLoveIntroQuiz.timeAttackBest.randomPlayback.normal.5.all",
  "equalLoveIntroQuiz.timeAttackBest.outro.normal.5.all",
  "equalLoveIntroQuiz.timeAttackBest.outro.loveChain.5.all",
  "equalLoveIntroQuiz.timeAttackBestReach.outro.5.all",
  "equalLoveIntroQuiz.weakSongStats",
  "equalLoveIntroQuiz.shuffleWeakSongStats",
  "equalLoveIntroQuiz.outroWeakSongStats",
];

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

function buildFakeResultElements() {
  return {
    newRecordBadge: document.createElement("p"),
    failStatus: document.createElement("p"),
    totalTime: document.createElement("p"),
    correctCount: document.createElement("p"),
    missCount: document.createElement("p"),
    ruleLabel: document.createElement("p"),
    bestTime: document.createElement("p"),
    achievementChipContainer: document.createElement("div"),
    achievementListLink: document.createElement("button"),
  };
}

function cleanup() {
  localStorage.removeItem(ACHIEVEMENTS_KEY);
  RELATED_KEYS.forEach((key) => localStorage.removeItem(key));
  clearTimeAttackHistoryEntries();
}

// 5問すべてノーミス正解のタイムアタックを実行し、結果画面まで描画する。
function playCleanFiveQuestionRun(variant, rule = "normal") {
  const resultElements = buildFakeResultElements();
  initTimeAttackResultScreen(resultElements);
  startTimeAttackRun(rule, "5", "all", variant);
  for (let i = 0; i < 5; i++) {
    recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion(`song-${i}`) });
  }
  renderTimeAttackResult();
  return resultElements;
}

export function runTimeAttackOutroVariantTests() {
  const previousPlayMode = gameState.playMode;
  // 苦手曲の集計先はgameState.playModeも見るため、本番と同じ"timeAttack"にそろえる。
  gameState.playMode = "timeAttack";
  cleanup();

  // ---- 1) variantの保持 ----
  startTimeAttackRun("normal", "5", "all", TIME_ATTACK_VARIANT.OUTRO);
  assertEqual(getCurrentTimeAttackVariant(), "outro", "アウトロvariantを指定して開始すると、そのまま保持される");
  assertEqual(getCurrentTimeAttackSeed(), 0, "アウトロは再生位置が曲ごとに固定のため、ランダム再生用の種は発行しない（0のまま）");
  assertEqual(getLastTimeAttackSelection().variant, "outro", "「もう一度挑戦する」用の直前条件にアウトロvariantが含まれる");

  // ---- 2) 自己ベスト・履歴が outro として独立に記録される ----
  const outroResult = playCleanFiveQuestionRun(TIME_ATTACK_VARIANT.OUTRO);
  assertEqual(getTimeAttackBest("normal", "5", "all", "outro"), 5000, "アウトロvariantの自己ベストが outro 用のキーに保存される");
  assertEqual(getTimeAttackBest("normal", "5", "all"), null, "イントロ（variant省略）の自己ベストには影響しない");
  assertEqual(getTimeAttackBest("normal", "5", "all", "randomPlayback"), null, "ランダム再生の自己ベストにも影響しない");
  assertEqual(
    localStorage.getItem("equalLoveIntroQuiz.timeAttackBest.outro.normal.5.all") !== null,
    true,
    "保存先のlocalStorageキーは timeAttackBest.outro.{rule}.{出題数}.{カテゴリ} の形"
  );
  assertEqual(outroResult.ruleLabel.textContent, "🎬タイムアタック", "結果画面のルール表示に🎬の目印が付く");
  const history = getTimeAttackHistoryEntries();
  assertEqual(history.length, 1, "タイムアタック履歴に1件記録される");
  assertEqual(history[0].variant, "outro", "履歴の出題タイプが outro として残る");

  // ---- 3) 苦手曲の集計先は「アウトロ」系統だけ ----
  const outroStats = getOutroWeakSongStats();
  assertEqual(Object.keys(outroStats).length, 5, "アウトロvariantの5問分がアウトロ系統の苦手曲統計に記録される");
  assertEqual(outroStats["song-0"], { attempts: 1, correct: 1 }, "1問ごとにattempts/correctが積み上がる");
  assertEqual(Object.keys(getWeakSongStats()).length, 0, "イントロ系統の苦手曲統計には記録されない");
  assertEqual(Object.keys(getShuffleWeakSongStats()).length, 0, "シャッフル系統の苦手曲統計には記録されない");

  // ---- 4) 称号：アウトロ系の成長段階に乗り、イントロ系には乗らない ----
  const snapshot = getAchievementListSnapshot();
  const find = (id) => snapshot.find((a) => a.id === id);
  assertEqual(find("outro_beginner").isUnlocked, true, "アウトロタイムアタックの5問ノーミスクリアで「アウトロビギナー」が解放される");
  assertEqual(find("intro_beginner").isUnlocked, false, "イントロ系の「イントロビギナー」は解放されない");
  assertEqual(find("shuffle_beginner").isUnlocked, false, "シャッフル系の「シャッフルビギナー」は解放されない");
  cleanup();

  // ---- 5) ノーミスチャレンジ（loveChain）失敗時の最高到達記録も outro で独立 ----
  initTimeAttackResultScreen(buildFakeResultElements());
  startTimeAttackRun("loveChain", "5", "all", TIME_ATTACK_VARIANT.OUTRO);
  recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion("song-0") });
  recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion("song-1") });
  markTimeAttackRunFailed();
  recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: false, question: buildFakeQuestion("song-2") });
  renderTimeAttackResult();
  assertEqual(getTimeAttackBest("loveChain", "5", "all", "outro"), null, "ノーミスチャレンジ失敗時は自己ベストを保存しない（既存ルールどおり）");
  const reach = getTimeAttackBestReach("5", "all", "outro");
  assertEqual(reach, { questionsReached: 3, elapsedMs: 3000 }, "最高到達記録は outro 用に独立して保存される（3問目で失敗＝到達3問・合計3秒）");
  assertEqual(getTimeAttackBestReach("5", "all"), null, "イントロの最高到達記録には影響しない");

  cleanup();

  // ---- 6) イントロ系統の苦手曲統計の「初回移行処理」（js/weakSongStats.jsの
  //      buildInitialStatsFromExistingHistory）が、variant付きの履歴を合算しない ----
  //      イントロ系統の集計をまだ一度も保存していない端末で、履歴にアウトロ／ランダム再生の
  //      タイムアタックだけがある場合、それらがイントロ系統の苦手曲に混ざってはいけない。
  saveTimeAttackHistoryEntry({
    rule: "normal", questionCountValue: "5", categoryFilterValue: "all",
    totalElapsedMs: 5000, correctCount: 5, missCount: 0, completed: true,
    failedAtQuestionNumber: null, isNewRecord: false,
    perQuestionResults: [{ questionNumber: 1, songId: "outro-only", missCountThisQuestion: 0 }],
    variant: "outro",
  });
  saveTimeAttackHistoryEntry({
    rule: "normal", questionCountValue: "5", categoryFilterValue: "all",
    totalElapsedMs: 5000, correctCount: 5, missCount: 0, completed: true,
    failedAtQuestionNumber: null, isNewRecord: false,
    perQuestionResults: [{ questionNumber: 1, songId: "intro-legacy", missCountThisQuestion: 0 }],
  });
  localStorage.removeItem("equalLoveIntroQuiz.weakSongStats");
  const migrated = getWeakSongStats();
  assertEqual(migrated["outro-only"], undefined, "初回移行処理は、アウトロvariantのタイムアタック履歴をイントロ系統へ合算しない");
  assertEqual(migrated["intro-legacy"], { attempts: 1, correct: 1 }, "variantの無い（＝イントロ）履歴は従来どおりイントロ系統へ移行される");

  cleanup();
  gameState.playMode = previousPlayMode;
}

export async function runTimeAttackOutroVariantWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

  // ---- index.html：3枚目の出題タイプカード ----
  const html = await fetchText("index.html");
  const variantInputs = html.match(/name="time-attack-variant" value="([a-zA-Z]+)"/g) ?? [];
  assertEqual(
    variantInputs.map((m) => m.match(/value="([a-zA-Z]+)"/)[1]),
    ["intro", "randomPlayback", "outro"],
    "タイムアタック設定画面の出題タイプが intro / randomPlayback / outro の3つ（この順）になっている"
  );
  assertEqual(html.includes("🎬 アウトロ"), true, "アウトロカードの見出しに🎬が付いている");
  assertEqual(html.includes("曲の最後5秒を聴いて当てます"), true, "アウトロカードの説明文が通常アウトロクイズと同じ「曲の最後5秒」になっている");

  // ---- js/main.js：既存のアウトロ再生分岐を共用し、二重実装していない ----
  const main = await fetchText("js/main.js");
  const outroBranchCondition =
    '(gameState.playMode === "timeAttack" && getCurrentTimeAttackVariant() === TIME_ATTACK_VARIANT.OUTRO)';
  assertEqual(main.includes(outroBranchCondition), true, "showQuestion()のアウトロ再生分岐の条件にタイムアタック＋OUTROが含まれている");
  const showQuestionStart = main.indexOf("const outroStartSec = AUDIO_METADATA[question.song.id]?.outroStartSec;");
  assertEqual(showQuestionStart > 0, true, "オンライン対戦用のアウトロ再生分岐が残っている（前提条件）");
  const outroPlayCalls = main.split("OUTRO_QUIZ_PLAY_DURATION_SEC,").length - 1;
  assertEqual(outroPlayCalls, 2, "アウトロ再生（OUTRO_QUIZ_PLAY_DURATION_SEC を渡す呼び出し）はオンライン用とオフライン共用の2箇所だけ＝タイムアタック用に増えていない");
  const branchIndex = main.indexOf(outroBranchCondition);
  const offlineOutroCommentIndex = main.indexOf("【2026-08-30新設、本人指示】アウトロクイズ：曲の最後5秒（無音・フェードアウトを");
  assertEqual(branchIndex > 0 && branchIndex < offlineOutroCommentIndex, true, "タイムアタック＋OUTROの条件が、オフライン用アウトロ再生分岐（specialModeId outroQuiz 等）と同じ if 文に入っている");

  // ---- js/timeAttackScreen.js：称号modeId・苦手曲の集計先 ----
  const screen = await fetchText("js/timeAttackScreen.js");
  assertEqual(screen.includes('[TIME_ATTACK_VARIANT.OUTRO]: "timeAttackOutro"'), true, "アウトロvariantの称号用modeIdは timeAttackOutro");
  assertEqual(screen.includes("recordOutroWeakSongAttempt(question.song.id, missCountThisQuestion === 0)"), true, "アウトロvariantの正誤はアウトロ系統の苦手曲統計へ記録する");

  // ---- 履歴表示・統一履歴・称号判定・ガイドの配線 ----
  for (const file of ["js/timeAttackHistoryScreen.js", "js/timeAttackHistoryDetailScreen.js"]) {
    const source = await fetchText(file);
    assertEqual(source.includes('outro: "🎬アウトロ"'), true, `${file} の出題タイプ表示にアウトロが追加されている`);
  }
  const playHistory = await fetchText("js/playHistory.js");
  assertEqual(playHistory.includes('outro: { modeId: "timeAttackOutro", modeLabel: "タイムアタック（アウトロ）" }'), true, "統一プレイ履歴で outro variant が専用modeIdへ変換される");
  assertEqual(playHistory.includes('timeAttackOutro: "timeAttack"'), true, "統一プレイ履歴の絞り込みで timeAttackOutro がタイムアタック枠に入る");
  const evaluation = await fetchText("js/achievementEvaluation.js");
  assertEqual(evaluation.includes('timeAttackOutro: "outro"'), true, "成長段階系の判定で timeAttackOutro がアウトロ系に属する");
  assertEqual(evaluation.includes('result.modeId === "outroQuiz" || result.modeId === "timeAttackOutro"'), true, "アウトロマスター・完全終曲の判定に timeAttackOutro が含まれる");
  const guide = await fetchText("js/data/guideContent.js");
  assertEqual(guide.includes("🎧イントロ／🔀ランダム再生／🎬アウトロ"), true, "遊び方ガイドの出題タイプ説明にアウトロが追加されている");
}
