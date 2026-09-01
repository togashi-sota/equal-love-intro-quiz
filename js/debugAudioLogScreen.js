// 音源診断ログ画面（管理者専用）を担当するファイル（2026-09-23新設、本人指示：
// 「新規プレイのたびに第1問だけ無音になる」バグを、iPhone実機で確認できるようにするため）。
//
// js/audioDiagnosticLog.jsに溜まっている記録を、その場で読める形（textarea）で表示し、
// 「コピー」ボタン1つでクリップボードへコピーできるようにするだけの、シンプルな画面。
// Firebaseや外部通信は一切行わない（この端末のメモリ上の記録を、そのまま画面に出すだけ）。

import { formatAudioDiagnosticLogText, clearAudioDiagnosticLog, getAudioDiagnosticLogCount } from "./audioDiagnosticLog.js";

let elements = null;

// elements: { backButton, refreshButton, copyButton, clearButton, status, count, textarea, onBack }
export function initDebugAudioLogScreen(newElements) {
  elements = newElements;

  elements.backButton.addEventListener("click", () => elements.onBack());
  elements.refreshButton.addEventListener("click", () => renderDebugAudioLog());
  elements.clearButton.addEventListener("click", () => {
    // 【本人指示にはないが安全側の配慮】誤操作で記録を消してしまうと、実機で再現させた
    // 直後の貴重な記録が失われてしまうため、既存の他の破壊的操作（バックアップ削除等）と
    // 同じくwindow.confirm()で一度確認する。
    if (!window.confirm("これまでの記録をすべて消去しますか？（実機で再現させた直後は、先にコピーしてからクリアしてください）")) return;
    clearAudioDiagnosticLog();
    renderDebugAudioLog();
  });
  elements.copyButton.addEventListener("click", handleCopyClick);
}

// この画面を表示するたびに、main.js側から呼ぶ（最新の記録を反映するため）。
export function renderDebugAudioLog() {
  if (!elements) return;
  const text = formatAudioDiagnosticLogText();
  elements.textarea.value = text;
  elements.count.textContent = `記録件数：${getAudioDiagnosticLogCount()}件`;
  elements.status.hidden = true;
}

async function handleCopyClick() {
  const text = elements.textarea.value;
  try {
    // 【なぜnavigator.clipboardを優先するか】PWA（ホーム画面追加後の独立ウィンドウ）でも
    // 動作する標準API。ただしiOSの一部バージョン・非HTTPS環境では使えないことがあるため、
    // 失敗時はtextarea自体を選択状態にして「手動でコピーしてください」に切り替える
    // （安全側のフォールバック。エラーで止まってしまうことを避ける）。
    await navigator.clipboard.writeText(text);
    showStatus("コピーしました。そのまま貼り付けてください。");
  } catch {
    elements.textarea.focus();
    elements.textarea.select();
    showStatus("自動コピーに失敗しました。テキスト欄が選択状態になっているので、手動でコピーしてください。");
  }
}

function showStatus(message) {
  elements.status.textContent = message;
  elements.status.hidden = false;
}
