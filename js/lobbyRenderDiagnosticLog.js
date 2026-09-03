// オンライン対戦ロビーのrenderLobby()呼び出しを1本のタイムラインとして記録する
// 診断用モジュール（2026-11-XX新設、本人指示：「1人でも試合終了→ロビー→モード変更で
// 一部の操作だけ反応しなくなる」症状の実機診断用）。
//
// js/audioDiagnosticLog.js・js/viewportDiagnosticLog.jsと全く同じ設計方針
// （メモリ上のリングバッファに記録し、js/debugAudioLogScreen.jsの隠し画面から
// コピーできるようにする）を踏襲している。ユーザー向けの表示・ゲーム進行には
// 一切影響しない、完全に読み取り専用の記録係。
//
// 【記録する目的】js/onlineBattleScreen.jsのrenderLobby()は、ルームの状態が
// 少しでも変わるたびに全体を呼び直す設計のため、以下を実機で確認できるようにする：
//   ・render開始から終了までの所要時間
//   ・同一秒に何回呼ばれているか（過剰な再描画の兆候）
//   ・render中に例外が発生していないか（発生していた場合、その時点のroom状態・
//     JSのエラーメッセージ・スタック）
// 【意図的に「握り潰す」設計にしていない点】renderLobbyのラッパー
// （js/onlineBattleScreen.jsのwrapRenderLobbyWithDiagnostics参照）は、例外を
// ここへ記録した後、必ずそのまま再throwする。ブラウザのコンソールへの通常のエラー
// 表示・既存の挙動は一切変えず、「後から実機でも確認できる記録」を追加するだけ。

const MAX_ENTRIES = 400;
const entries = [];
const logStartTime = performance.now();
let sequenceCounter = 0;

// 呼び出し開始時に採番する。戻り値のseqを、対応する終了・エラー記録にも渡すことで
// 1回のrender呼び出しを追跡できるようにする。
export function nextLobbyRenderSequence() {
  sequenceCounter += 1;
  return sequenceCounter;
}

export function recordLobbyRenderEvent(phase, detail) {
  const elapsedMs = Math.round(performance.now() - logStartTime);
  entries.push({ elapsedMs, phase, detail });
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }
}

// 直近1秒間に記録されたrender開始件数（「同一秒に何回呼ばれているか」を実機ログの
// 末尾だけ見れば分かるように、記録のたびに集計しておく）。
export function countLobbyRenderStartsInLastSecond() {
  const nowMs = Math.round(performance.now() - logStartTime);
  return entries.filter((entry) => entry.phase === "start" && nowMs - entry.elapsedMs <= 1000).length;
}

export function formatLobbyRenderDiagnosticLogText() {
  if (entries.length === 0) {
    return "（まだ記録がありません。オンライン対戦のロビーを開いてから、もう一度この画面を開いてください）";
  }
  const lines = entries.map((entry) => {
    const timeLabel = `+${String(entry.elapsedMs).padStart(7, " ")}ms`;
    let line = `${timeLabel}  [LOBBY_RENDER:${entry.phase}]`;
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

export function clearLobbyRenderDiagnosticLog() {
  entries.length = 0;
  sequenceCounter = 0;
}

export function getLobbyRenderDiagnosticLogCount() {
  return entries.length;
}
