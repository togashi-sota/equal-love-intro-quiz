// js/lobbyRenderDiagnosticLog.jsの恒久テスト。
// js/audioDiagnosticLog.jsと同じ設計（メモリ上のリングバッファ）のため、同じ手法で検証する。
import {
  nextLobbyRenderSequence,
  recordLobbyRenderEvent,
  countLobbyRenderStartsInLastSecond,
  formatLobbyRenderDiagnosticLogText,
  clearLobbyRenderDiagnosticLog,
  getLobbyRenderDiagnosticLogCount,
} from "../js/lobbyRenderDiagnosticLog.js";
import { assertEqual } from "./test-utils.js";

export function runLobbyRenderDiagnosticLogTests() {
  clearLobbyRenderDiagnosticLog();

  // ---- 記録が無い状態 ----
  assertEqual(getLobbyRenderDiagnosticLogCount(), 0, "クリア直後は記録0件");
  assertEqual(
    formatLobbyRenderDiagnosticLogText().includes("まだ記録がありません"),
    true,
    "記録が無いときは案内文を返す"
  );

  // ---- 連番が1から順に増える ----
  const seq1 = nextLobbyRenderSequence();
  const seq2 = nextLobbyRenderSequence();
  assertEqual(seq2, seq1 + 1, "nextLobbyRenderSequence()は呼ぶたびに1ずつ増える");

  // ---- 記録が件数どおり積まれ、フォーマット済みテキストに反映される ----
  recordLobbyRenderEvent("start", { seq: seq1, status: "waiting", gameMode: "timeAttack" });
  recordLobbyRenderEvent("complete", { seq: seq1, durationMs: 5 });
  assertEqual(getLobbyRenderDiagnosticLogCount(), 2, "記録した件数が正しく数えられる");
  const text = formatLobbyRenderDiagnosticLogText();
  assertEqual(text.includes("[LOBBY_RENDER:start]"), true, "start記録がテキストに含まれる");
  assertEqual(text.includes("[LOBBY_RENDER:complete]"), true, "complete記録がテキストに含まれる");
  assertEqual(text.includes("timeAttack"), true, "記録した詳細情報（gameMode等）がテキストに含まれる");

  // ---- 直近1秒間のstart件数を数えられる（「同一秒に何回呼ばれているか」の検知用） ----
  clearLobbyRenderDiagnosticLog();
  recordLobbyRenderEvent("start", { seq: 1 });
  recordLobbyRenderEvent("start", { seq: 2 });
  recordLobbyRenderEvent("start", { seq: 3 });
  assertEqual(
    countLobbyRenderStartsInLastSecond(),
    3,
    "直近1秒以内に記録されたstart件数を正しく数えられる（連続してrenderLobby()が呼ばれた場合の検知用）"
  );

  // ---- clearで完全にリセットされる ----
  clearLobbyRenderDiagnosticLog();
  assertEqual(getLobbyRenderDiagnosticLogCount(), 0, "clearLobbyRenderDiagnosticLog()で記録が0件に戻る");
  const seqAfterClear = nextLobbyRenderSequence();
  assertEqual(seqAfterClear, 1, "clearLobbyRenderDiagnosticLog()で連番も1から振り直される");

  // 後片付け：他のテストへ記録を持ち越さない。
  clearLobbyRenderDiagnosticLog();
}
