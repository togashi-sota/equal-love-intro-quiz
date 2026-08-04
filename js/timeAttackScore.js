// タイムアタックの自己ベスト（合計タイム）を、ブラウザのlocalStorageに保存・読み込みするファイル。
// js/highscore.jsと全く同じ設計パターン（出題数・カテゴリの組み合わせごとにキーを分ける、
// プレイヤーごとの接頭辞を付ける）を踏襲しつつ、保存先のキー名を完全に分けることで、
// 既存の通常クイズの自己ベスト（highscore.js）とは一切混ざらないようにしている。
//
// highscore.jsとの違いは1点だけ：スコアは「高いほど良い」だが、タイムアタックの
// 合計タイムは「短いほど良い」ため、比較の向きが逆になる。
//
// ルール（ノーマル／ハード／LOVE連チャン）ごとに、そもそも進み方が違うため単純に
// タイムだけ比べても意味がない（2026-08-06追加）。そのため、キーに出題数・カテゴリだけでなく
// ルールも含めて、3ルールそれぞれ完全に別々の自己ベストとして扱う。
import { getPlayerKeyPrefix } from "./playerProfile.js";

function buildTimeAttackKey(rule, questionCountValue, categoryFilterValue) {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}timeAttackBest.${rule}.${questionCountValue}.${categoryFilterValue}`;
}

// 指定したルール・出題数・カテゴリの組み合わせにおける自己ベスト（合計タイム、ミリ秒）を取得する。
// 未保存、または読み込みに失敗した場合はnullを返す（0秒ではなく「記録なし」を明示するため）。
export function getTimeAttackBest(rule, questionCountValue, categoryFilterValue) {
  try {
    const stored = localStorage.getItem(buildTimeAttackKey(rule, questionCountValue, categoryFilterValue));
    return stored ? Number(stored) : null;
  } catch {
    return null;
  }
}

// 今回の合計タイムが、同じルール・出題数・カテゴリの組み合わせでの自己ベストより短ければ保存する。
// 新記録だったかどうかを返す（自己ベストが無い状態からの初記録も、新記録として扱う）。
export function saveTimeAttackBestIfBetter(totalElapsedMs, rule, questionCountValue, categoryFilterValue) {
  const currentBest = getTimeAttackBest(rule, questionCountValue, categoryFilterValue);
  if (currentBest !== null && totalElapsedMs >= currentBest) {
    return false;
  }

  try {
    localStorage.setItem(
      buildTimeAttackKey(rule, questionCountValue, categoryFilterValue),
      String(totalElapsedMs)
    );
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
  return true;
}

// ===== LOVE連チャンの「最高到達記録」（2026-08-06追加） =====
// LOVE連チャンは1回間違えたら即終了するため、全問クリアできなかった回のタイムは
// 上のsaveTimeAttackBestIfBetter()の対象にならない。そのぶん「どこまで進めたか」を
// 別の記録として残したい、という要望に応えるためのもの。
// ルールはLOVE連チャンでしか意味を持たないため、キーにルールは含めない
// （出題数・カテゴリの組み合わせごとに1つだけ）。
function buildTimeAttackBestReachKey(questionCountValue, categoryFilterValue) {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}timeAttackBestReach.${questionCountValue}.${categoryFilterValue}`;
}

// 保存されている最高到達記録（{ questionsReached, elapsedMs }）を取得する。
// questionsReachedは「何問目まで到達したか」（全問クリアならその出題数と同じ値になる）。
export function getTimeAttackBestReach(questionCountValue, categoryFilterValue) {
  try {
    const stored = localStorage.getItem(buildTimeAttackBestReachKey(questionCountValue, categoryFilterValue));
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// 今回の到達記録が、保存済みの記録より良ければ保存する。
// 比較は「①到達問題数が多い方が良い、②同じ到達問題数なら経過時間が短い方が良い」の2段階。
// 新記録だったかどうかを返す。
export function saveTimeAttackBestReachIfBetter(questionsReached, elapsedMs, questionCountValue, categoryFilterValue) {
  const current = getTimeAttackBestReach(questionCountValue, categoryFilterValue);
  const isBetter =
    current === null ||
    questionsReached > current.questionsReached ||
    (questionsReached === current.questionsReached && elapsedMs < current.elapsedMs);

  if (!isBetter) {
    return false;
  }

  try {
    localStorage.setItem(
      buildTimeAttackBestReachKey(questionCountValue, categoryFilterValue),
      JSON.stringify({ questionsReached, elapsedMs })
    );
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
  return true;
}
