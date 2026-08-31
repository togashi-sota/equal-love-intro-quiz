// 回答確認モーダルの共有コントローラ（2026-09-06新設、本人指示：実機フィードバック②）。
//
// 【対象モード】タイムアタック系・早押し系（回答速度そのものが勝敗・得点に直接関係する
// モード）以外の、選択肢をタップしてから確定するまでに1回の確認を挟みたいモード
// （一瞬チャレンジ・一瞬バトル・一瞬協力・歌詞クイズ「正解数バトル」「ポイントバトル」）が
// 共通で使う。js/onlineBattleLobbyReturnPrompt.jsと同じ考え方（4つの画面ファイルが
// 互いを直接importしない設計方針を崩さないよう、モーダルの仲介だけを担う独立した
// 葉モジュールとして新設した）。
//
// 【安全性について】このモジュール自身はFirebase・進行状態を一切知らない。「今の状態で
// 本当に回答してよいか」の最終確認は、呼び出し元がonConfirmコールバックの中で必ず
// 再確認する設計にしている（本人指示：確認画面を開いている間に問題状態が変わった場合の
// 安全性は、既存の安全機構に合わせて呼び出し元が担保する）。このモジュールは「確定操作を
// 1回はさむ」というUI上の役割だけに徹する。

let promptElements = null;
let pendingOnConfirm = null;

// modal・songTitleElement・confirmButton・cancelButtonを渡して1度だけ呼ぶ
// （js/main.js参照）。
export function initAnswerConfirmPrompt({ modal, songTitleElement, confirmButton, cancelButton }) {
  promptElements = { modal, songTitleElement, confirmButton, cancelButton };

  confirmButton.addEventListener("click", () => {
    const callback = pendingOnConfirm;
    closeAnswerConfirmPrompt();
    callback?.();
  });
  cancelButton.addEventListener("click", () => {
    closeAnswerConfirmPrompt();
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeAnswerConfirmPrompt();
  });
  document.addEventListener("keydown", (event) => {
    if (modal.hidden) return;
    if (event.key === "Escape") closeAnswerConfirmPrompt();
  });
}

// songTitle（確認文言に出す曲名）とonConfirm（「回答する」を押したときだけ呼ばれる
// コールバック）を渡す。確認画面を開いただけでは、まだ何も確定・送信しない
// （本人指示：「確認画面を開いただけではFirebase上の回答確定・write-once等を
// 発生させないでください」）。
export function promptAnswerConfirm(songTitle, onConfirm) {
  if (!promptElements) return;
  promptElements.songTitleElement.textContent = songTitle;
  pendingOnConfirm = onConfirm;
  promptElements.modal.hidden = false;
}

export function closeAnswerConfirmPrompt() {
  if (!promptElements) return;
  promptElements.modal.hidden = true;
  pendingOnConfirm = null;
}
