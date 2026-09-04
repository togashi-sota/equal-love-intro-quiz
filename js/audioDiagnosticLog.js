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

// 【2026-11-XX新設・本人指示：一瞬協力Q1のNotSupportedError再調査、次回への備え】
// 通常はページのリロードだけで記録が失われる（performance.now()由来のelapsedMsも
// メモリ上のentries配列もリセットされるため）。本人からの明示的な要望
// 「リロード程度では消えにくくする方法を検討してほしい。ただし古いログと混ざって
// 誤診する方が危険なら無理に行わなくて良い」を受け、sessionStorage（同じタブ・
// 同じ起動セッションの間だけ残る、アプリを完全に終了すれば消える）へも保存する。
// 【誤診対策】リロードをまたぐと、performance.now()基準のelapsedMsは前回の記録と
// 連続しない（新しいログはゼロから数え直す）ため、時系列を誤解しないよう、
// 各記録に絶対時刻（atIso）を必ず付け、復元時には目立つ区切り行を1本挿入する。
const SESSION_STORAGE_KEY = "equalLoveIntroQuiz.audioDiagnosticLog.v1";
// sessionStorageの容量を圧迫しない範囲で、直近の記録だけを保存する
// （本文の表示・コピー自体はメモリ上のMAX_ENTRIES件をそのまま使うため、ここを絞っても
// 「今のページ表示」には影響しない。あくまで次回リロード直後に復元する分の上限）。
const SESSION_STORAGE_MAX_ENTRIES = 300;

function loadPersistedEntriesOnce() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const restored = JSON.parse(raw);
    if (!Array.isArray(restored) || restored.length === 0) return;
    entries.push(...restored);
    entries.push({
      elapsedMs: 0,
      label: "===== ここでページが再読み込みされました（この行より上は前回の読み込み時の記録・下の経過msは0からやり直し） =====",
      detail: { restoredAt: new Date().toISOString() },
    });
  } catch {
    // sessionStorageが使えない環境（プライベートブラウジング等）でも、通常のメモリ上の
    // ログ記録自体は問題なく続行できるため、ここでの失敗は無視してよい。
  }
}
loadPersistedEntriesOnce();

function persistEntries() {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(entries.slice(-SESSION_STORAGE_MAX_ENTRIES)));
  } catch {
    // 容量超過・プライベートブラウジング等での失敗は無視する（あくまで保険的な機能のため、
    // 失敗してもメモリ上の記録・アプリの動作自体には一切影響させない）。
  }
}

// tag: "[UNLOCK]" 等の分類タグ（無くても良い）。label: 内容の説明。detail: 任意の追加情報。
export function recordAudioDiagnostic(label, detail) {
  const elapsedMs = Math.round(performance.now() - logStartTime);
  entries.push({ elapsedMs, label, detail, atIso: new Date().toISOString() });
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
  persistEntries();
}

// 現在の記録全体を、コピー&ペーストしやすい1つのテキストへ整形する。
export function formatAudioDiagnosticLogText() {
  if (entries.length === 0) {
    return "（まだ記録がありません。クイズを1回プレイしてから、もう一度この画面を開いてください）";
  }
  const lines = entries.map((entry) => {
    const timeLabel = `+${String(entry.elapsedMs).padStart(7, " ")}ms`;
    const timeIso = entry.atIso ? ` (${entry.atIso})` : "";
    let line = `${timeLabel}${timeIso}  ${entry.label}`;
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
  persistEntries();
}

// 今何件記録されているか（デバッグ画面の見出し表示用）。
export function getAudioDiagnosticLogCount() {
  return entries.length;
}
