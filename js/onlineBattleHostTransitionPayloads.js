// オンライン対戦のホスト自動移譲・キック等に関する、Firebaseに一切触れない純粋関数群
// （2026-08-30新設、本人指示：オンライン対戦全面アップデート）。
// js/onlineBattleSongAvailability(Payloads).js等と同じ設計方針で、判定ロジックだけを
// このファイルへ切り出し、js/onlineBattle.js（Firebase I/O層）から呼ぶ。
// このファイルを恒久テスト（tests.html）へ直接importできるようにするため。

// 残っている参加者の中から、次のホストを選ぶ。
// 【ルール】joinedAtが最も早い（＝最初から一緒にいる）参加者を優先する
// （本人指示「参加順等、技術的に安定する方法で構わない」に基づく決定論的な選び方）。
// 対象がいなければnullを返す（＝ルームを削除すべき、という呼び出し側への合図）。
export function pickNextHostUid(players, excludeUid) {
  const candidates = Object.entries(players ?? {}).filter(([playerUid]) => playerUid !== excludeUid);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a[1]?.joinedAt ?? 0) - (b[1]?.joinedAt ?? 0));
  return candidates[0][0];
}
