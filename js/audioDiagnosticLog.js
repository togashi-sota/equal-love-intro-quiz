// 「新規プレイのたびに第1問だけ無音になる」バグの原因調査のための、
// 音源まわりの操作を1本のタイムラインとして記録する共通モジュール（2026-09-23新設、本人指示）。
//
// 【なぜ必要か】これまでのブラウザコンソールへのconsole.log出力だけでは、本人がiPhone
// 実機のSafari/PWAの開発者コンソールに簡単にアクセスできないため、実機で見つかった症状の
// 証拠を確認する手段が無かった。このファイルは、js/audio.js・js/soundManager.js等が
// 記録するイベントを、時系列の1本のログ（テキスト）としてメモリ上に保持し、
// js/debugAudioLogScreen.jsの隠し画面から「コピー」できるようにするための土台。
//
// 【設計方針】既存のconsole.log出力（診断用途、開発者向け）は一切変更せず、それに
// "併せて"このモジュールへも記録する（呼び出し側の変更を最小限にするため、
// js/audio.jsのdiag()関数の中からこのモジュールを呼ぶだけで、他のファイルは無改修で済む
// 箇所が大半）。ユーザー向けの表示・ゲーム進行には一切影響しない、完全に読み取り専用の
// 記録係。

const MAX_ENTRIES = 1000; // 長時間触っても際限なく増え続けないよう、古いものから捨てる
const entries = [];
const logStartTime = performance.now();

// tag: "[UNLOCK]" 等の分類タグ（無くても良い）。label: 内容の説明。detail: 任意の追加情報。
export function recordAudioDiagnostic(label, detail) {
  const elapsedMs = Math.round(performance.now() - logStartTime);
  entries.push({ elapsedMs, label, detail });
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
}

// 現在の記録全体を、コピー&ペーストしやすい1つのテキストへ整形する。
export function formatAudioDiagnosticLogText() {
  if (entries.length === 0) {
    return "（まだ記録がありません。クイズを1回プレイしてから、もう一度この画面を開いてください）";
  }
  const lines = entries.map((entry) => {
    const timeLabel = `+${String(entry.elapsedMs).padStart(7, " ")}ms`;
    let line = `${timeLabel}  ${entry.label}`;
    if (entry.detail !== undefined) {
      try {
        line += `  ${JSON.stringify(entry.detail)}`;
      } catch {
        line += `  ${String(entry.detail)}`;
      }
    }
    return line;
  });
  return lines.join("\n");
}

// 記録をすべて消す（本人が「ここから新しく記録し直したい」ときに使う）。
export function clearAudioDiagnosticLog() {
  entries.length = 0;
}

// 今何件記録されているか（デバッグ画面の見出し表示用）。
export function getAudioDiagnosticLogCount() {
  return entries.length;
}
