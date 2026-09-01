// 「🔇 音が出ない」救済ボタン（js/main.js・js/audio.js参照）の、
// タイムシビア／非タイムシビア判定だけを切り出した、DOM操作を一切行わない純粋関数モジュール
// （2026-09-16新設、本人指示）。
//
// 【なぜ切り出すか】js/main.jsはトップレベルでdocument.getElementById()を大量に呼び出しており、
// tests.html（ユニットテスト用の簡易ページ）には#quiz-screen等の実DOMが存在しないため、
// js/main.jsをそのままテストからimportすることができない。判定ロジックだけをこの独立した
// ファイルに切り出すことで、js/responseTime.js・js/randomPlaybackEngine.js等、既存の
// DOM非依存モジュールと同じ方針でtests/audioTroubleClassification.test.jsから安全に
// テストできるようにする。js/main.js側は、この関数の結果をそのままボタンの挙動分岐に使う。
//
// 【判定根拠（実際のスコア計算・記録保存コードを確認したうえでの結論）】
// ・タイムアタック（playMode:"timeAttack"、イントロ・ランダム再生の両variant）：
//   js/timeAttackScreen.jsのrecordTimeAttackAnswer()がelapsedMsをtotalElapsedMsへそのまま
//   加算し、そのtotalElapsedMsがrenderTimeAttackResult()内でsaveTimeAttackBestIfBetter()
//   （自己ベスト）・submitTimeAttackScoreIfBetter()（グローバルランキング）の判定材料になる。
//   回答時間そのものが記録＝タイムシビア。
// ・ランダム再生クイズ（playMode:"randomPlayback"、スタンドアロン版）：
//   js/randomPlaybackScreen.jsのstartRandomPlaybackRun()が、上と全く同じ
//   js/timeAttackScreen.jsの記録エンジン（recordTimeAttackAnswer等）をそのまま再利用して
//   いるため、タイムアタックと全く同じ理由でタイムシビア。
// ・通常イントロクイズ（playMode:"normal"）：一見「正誤だけが記録に影響する」ように
//   見えるが、実際にはjs/main.jsのhandleChoiceClick内で
//   `calculateScore(gameState.elapsedSec)`（js/score.js、経過秒数が短いほど高得点になる
//   段階式スコア）を使って1問ごとの得点を決めており、①その合計得点がハイスコア自己ベスト
//   （js/highscore.jsのsaveHighScoreIfBetter）に、②合計思考時間が専用の自己ベスト
//   （js/normalQuizTimeScore.jsのsaveNormalQuizTimeBestIfBetter）に、③ノーミス完走時の
//   セッション所要時間（quizStartedAtMs〜quizFinishedAtMs）がグローバルランキング
//   （submitTimeAttackScoreIfBetter、variant:"intro"）にそれぞれ直接反映される。
//   回答時間が記録に何重にも影響するため、タイムシビアに分類する。
// ・アウトロクイズ（通常導線、playMode:"special"かつspecialModeId:"outroQuiz"）：
//   js/outroQuizTimeScore.jsの専用自己ベスト・グローバルランキング（variant:"outro"）ともに、
//   通常イントロクイズと全く同じ理由でタイムシビア。
// ・復習プレイ（playMode:"review"）・特別モード（playMode:"special"、outroQuiz以外＝
//   苦手曲モードA・オリジナル問題作成モード等）：js/main.jsのrenderResult()の
//   isReview||isSpecial分岐が示すとおり、自己ベスト・称号・ランキングのいずれにも
//   一切反映されない（統一プレイ履歴〈js/playHistory.js〉へのログ以外に「記録」が残らない）。
//   正誤だけが実質的な記録であるため、非タイムシビアに分類する。
//
// playMode: gameState.playModeの値（"normal"|"review"|"special"|"timeAttack"|"randomPlayback"等）。
// specialModeId: gameState.specialModeIdの値（playModeが"special"のときだけ意味を持つ）。
export function isAudioTroubleTimeSevere({ playMode, specialModeId = null }) {
  if (playMode === "timeAttack" || playMode === "randomPlayback") return true;
  if (playMode === "normal") return true;
  if (playMode === "special" && specialModeId === "outroQuiz") return true;
  return false;
}
