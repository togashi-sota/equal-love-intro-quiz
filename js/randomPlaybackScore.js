// ランダム再生クイズの自己ベスト（合計タイム）を、ブラウザのlocalStorageに保存・読み込みするファイル。
// js/timeAttackScore.jsと全く同じ設計パターン（出題数・カテゴリ・ルールの組み合わせごとに
// キーを分ける、プレイヤーごとの接頭辞を付ける、タイムは短いほど良い）を踏襲しつつ、
// 保存先のキー名を完全に分けることで、タイムアタックの自己ベストとは一切混ざらないようにしている
// （本人の要望：「自己ベストについては、既存タイムアタックと記録を混ぜず、モード別に保存する」）。
import { getPlayerKeyPrefix } from "./playerProfile.js";

function buildRandomPlaybackKey(rule, questionCountValue, categoryFilterValue) {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}randomPlaybackBest.${rule}.${questionCountValue}.${categoryFilterValue}`;
}

// 指定したルール・出題数・カテゴリの組み合わせにおける自己ベスト（合計タイム、ミリ秒）を取得する。
// 未保存、または読み込みに失敗した場合はnullを返す（0秒ではなく「記録なし」を明示するため）。
export function getRandomPlaybackBest(rule, questionCountValue, categoryFilterValue) {
  try {
    const stored = localStorage.getItem(buildRandomPlaybackKey(rule, questionCountValue, categoryFilterValue));
    return stored ? Number(stored) : null;
  } catch {
    return null;
  }
}

// 今回の合計タイムが、同じルール・出題数・カテゴリの組み合わせでの自己ベストより短ければ保存する。
// 新記録だったかどうかを返す（自己ベストが無い状態からの初記録も、新記録として扱う）。
export function saveRandomPlaybackBestIfBetter(totalElapsedMs, rule, questionCountValue, categoryFilterValue) {
  const currentBest = getRandomPlaybackBest(rule, questionCountValue, categoryFilterValue);
  if (currentBest !== null && totalElapsedMs >= currentBest) {
    return false;
  }

  try {
    localStorage.setItem(
      buildRandomPlaybackKey(rule, questionCountValue, categoryFilterValue),
      String(totalElapsedMs)
    );
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
  return true;
}

// ===== LOVE連チャンの「最高到達記録」（js/timeAttackScore.jsと同じ考え方） =====
function buildRandomPlaybackBestReachKey(questionCountValue, categoryFilterValue) {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}randomPlaybackBestReach.${questionCountValue}.${categoryFilterValue}`;
}

// 保存されている最高到達記録（{ questionsReached, elapsedMs }）を取得する。
export function getRandomPlaybackBestReach(questionCountValue, categoryFilterValue) {
  try {
    const stored = localStorage.getItem(buildRandomPlaybackBestReachKey(questionCountValue, categoryFilterValue));
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// 今回の到達記録が、保存済みの記録より良ければ保存する。
// 比較は「①到達問題数が多い方が良い、②同じ到達問題数なら経過時間が短い方が良い」の2段階。
export function saveRandomPlaybackBestReachIfBetter(questionsReached, elapsedMs, questionCountValue, categoryFilterValue) {
  const current = getRandomPlaybackBestReach(questionCountValue, categoryFilterValue);
  const isBetter =
    current === null ||
    questionsReached > current.questionsReached ||
    (questionsReached === current.questionsReached && elapsedMs < current.elapsedMs);

  if (!isBetter) {
    return false;
  }

  try {
    localStorage.setItem(
      buildRandomPlaybackBestReachKey(questionCountValue, categoryFilterValue),
      JSON.stringify({ questionsReached, elapsedMs })
    );
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
  return true;
}
