// アウトロクイズ（通常導線、js/main.jsのbeginOutroQuiz()経由）専用の、
// 合計タイム（回答の思考時間だけを全問分合計した値）の自己ベストを、ブラウザの
// localStorageに保存・読み込みするファイル（2026-08-30新設、本人指示・後半③）。
//
// js/normalQuizTimeScore.jsと全く同じ設計パターン（出題数・カテゴリの組み合わせごとに
// キーを分ける、プレイヤーごとの接頭辞を付ける、タイムは短いほど良い）を踏襲しつつ、
// 保存先のキー名を完全に分けている。
//
// 【なぜ既存のjs/normalQuizTimeScore.jsを再利用しないか】通常イントロクイズと
// アウトロクイズは出題内容（曲の頭出し/最後5秒）が違い、客観的にどちらが速いとは
// 言えない（js/normalQuizTimeScore.jsの「通常クイズとタイムアタックはテンポが違う」と
// 同じ理由）。同じキーへ相乗りすると、性質の異なる記録が混ざってしまうため、
// アウトロクイズ専用の保存領域を新設する。
//
// 【オリジナル問題作成モード・アウトロタイプ（customQuizOutro）との関係】このファイルは
// アウトロクイズの「通常導線」（specialModeId:"outroQuiz"、js/main.jsのbeginOutroQuiz()）
// からしか呼ばれない。customQuizOutro（好きな曲だけのセット）は、他モードのオリジナル
// 問題作成モードと同じく自己ベスト・ランキングの対象外のまま（本人方針：カスタム選曲
// プレイを判定に混ぜない）。
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { scheduleBackupSync } from "./backupSync.js";

function buildOutroQuizTimeKey(questionCountValue, categoryFilterValue) {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}outroQuizTimeBest.${questionCountValue}.${categoryFilterValue}`;
}

// 指定した出題数・カテゴリの組み合わせにおける自己ベスト（合計タイム、ミリ秒）を取得する。
// 未保存、または読み込みに失敗した場合はnullを返す（0秒ではなく「記録なし」を明示するため）。
export function getOutroQuizTimeBest(questionCountValue, categoryFilterValue) {
  try {
    const stored = localStorage.getItem(buildOutroQuizTimeKey(questionCountValue, categoryFilterValue));
    return stored ? Number(stored) : null;
  } catch {
    return null;
  }
}

// 今回の合計タイムが、同じ出題数・カテゴリの組み合わせでの自己ベストより短ければ保存する。
// 新記録だったかどうかを返す（自己ベストが無い状態からの初記録も、新記録として扱う）。
export function saveOutroQuizTimeBestIfBetter(totalThinkTimeMs, questionCountValue, categoryFilterValue) {
  const currentBest = getOutroQuizTimeBest(questionCountValue, categoryFilterValue);
  if (currentBest !== null && totalThinkTimeMs >= currentBest) {
    return false;
  }

  try {
    localStorage.setItem(buildOutroQuizTimeKey(questionCountValue, categoryFilterValue), String(totalThinkTimeMs));
    scheduleBackupSync(); // クラウドバックアップも更新する（js/backupSync.js参照）
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
  return true;
}
