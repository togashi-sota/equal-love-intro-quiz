// 【2026-09-22新設・本人指示】ランキング画面「記録日（○月○日）」表示の回帰テスト。
// 表示専用の変更であり、順位・タイム・identityKey 統合・引き継ぎ・管理者修復には影響しないことも固定する。
import {
  formatLeaderboardAchievedDate,
  normalizeLeaderboardEntry,
  resolveLeaderboardWritePlan,
  buildLeaderboardEntryPayload,
  sortLeaderboardEntries,
  dedupeLeaderboardEntriesByIdentity,
} from "../js/timeAttackLeaderboard.js";
import { buildCopiedLeaderboardEntry, planLeaderboardMerge } from "../js/backupOwnership.js";
import { buildBackupRebindWrites, planOldLeaderboardEntry } from "../js/uidRepairPlanner.js";
import { assertEqual } from "./test-utils.js";

const KEY_A = "a".repeat(64);
// JST の日付を UTC ミリ秒に（例：2026-09-22 10:00 JST = 2026-09-22T01:00:00Z）
const jst = (iso) => Date.parse(`${iso}+09:00`);

export function runLeaderboardAchievedDateTests() {
  // ---- A. 2026-09-22 JST → 「9月22日」 ----
  assertEqual(formatLeaderboardAchievedDate(jst("2026-09-22T10:00:00")), "9月22日", "A: 9/22 JST の記録は「9月22日」");
  assertEqual(formatLeaderboardAchievedDate(jst("2026-09-22T00:00:30")), "9月22日", "A: JST 0時台も 9月22日（UTC では前日）");
  assertEqual(formatLeaderboardAchievedDate(jst("2026-09-22T23:59:00")), "9月22日", "A: JST 23:59 も 9月22日");
  assertEqual(formatLeaderboardAchievedDate(Date.parse("2026-09-21T20:00:00Z")), "9月22日", "A: UTC 9/21 20:00 = JST 9/22 05:00 → 端末の時差に関係なく 9月22日");

  // ---- B. 年末年始境界（Asia/Tokyo 基準） ----
  assertEqual(formatLeaderboardAchievedDate(Date.parse("2025-12-31T15:30:00Z")), "1月1日", "B: UTC 12/31 15:30 = JST 1/1 00:30 → 1月1日");
  assertEqual(formatLeaderboardAchievedDate(Date.parse("2025-12-31T14:59:00Z")), "12月31日", "B: UTC 12/31 14:59 = JST 12/31 23:59 → 12月31日");
  assertEqual(formatLeaderboardAchievedDate(jst("2026-01-05T09:00:00")), "1月5日", "B: 1月5日（0埋めしない）");
  assertEqual(formatLeaderboardAchievedDate(jst("2026-03-31T23:30:00")), "3月31日", "B: 月末");
  assertEqual(formatLeaderboardAchievedDate(Date.parse("2026-02-28T15:00:00Z")), "3月1日", "B: JST では翌月の1日");
  assertEqual(formatLeaderboardAchievedDate(jst("2026-09-22T10:00:00"), { timeZone: "America/Los_Angeles" }), "9月21日", "B: タイムゾーンを変えると日が変わる＝既定は Asia/Tokyo 固定であることの裏付け");

  // ---- C. 既存ランキングレコード（Firebase の形）→ achievedAt から表示 ----
  const existingRaw = { displayName: "じゅ", oshiMemberId: "takiwaki-shoko", clearTimeMs: 8114, missCount: 0, source: "normal", achievedAt: jst("2026-09-17T19:33:05"), actualQuestionCount: 5 };
  const existing = normalizeLeaderboardEntry("uid-ju", existingRaw);
  assertEqual(formatLeaderboardAchievedDate(existing.achievedAt), "9月17日", "C: 既存レコードの achievedAt からそのまま表示できる（再プレイ不要）");
  const legacyRaw = { displayName: "いくみ", clearTimeMs: 117970, missCount: 0, achievedAt: jst("2026-08-16T15:14:36") };
  assertEqual(formatLeaderboardAchievedDate(normalizeLeaderboardEntry("uid-ikumi", legacyRaw).achievedAt), "8月16日", "C: identityKey も actualQuestionCount も無い旧形式でも日付は出る");

  // ---- D. 自己ベスト更新 → set（achievedAt は新しい serverTimestamp）→ 新しい日付 ----
  {
    const plan = resolveLeaderboardWritePlan({ existingEntry: existing, candidate: { clearTimeMs: 7000, missCount: 0, actualQuestionCount: 5 }, identityKey: KEY_A });
    assertEqual(plan.action, "set", "D: 速い記録は set（記録全体を置き換える）");
    const newAchievedAt = jst("2026-09-25T20:00:00"); // serverTimestamp() の代わり
    const payload = buildLeaderboardEntryPayload({ displayName: "じゅ", oshiMemberId: null, clearTimeMs: 7000, missCount: 0, rule: null, source: "normal", achievedAt: newAchievedAt, actualQuestionCount: 5, identityKey: KEY_A });
    assertEqual(formatLeaderboardAchievedDate(payload.achievedAt), "9月25日", "D: 新記録の日付は新しい達成日になる");
  }

  // ---- E. 遅い記録 → none（achievedAt 維持） ----
  {
    const plan = resolveLeaderboardWritePlan({ existingEntry: { ...existing, identityKey: KEY_A, actualQuestionCount: 5 }, candidate: { clearTimeMs: 9000, missCount: 0, actualQuestionCount: 5 }, identityKey: KEY_A });
    assertEqual(plan, { action: "none" }, "E: 遅い記録は何も書かない＝achievedAt も日付もそのまま");
  }

  // ---- F. identityKey／actualQuestionCount だけ backfill → update に achievedAt を含めない ----
  {
    const plan = resolveLeaderboardWritePlan({ existingEntry: existing, candidate: { clearTimeMs: 8114, missCount: 0, actualQuestionCount: 5 }, identityKey: KEY_A });
    assertEqual(plan.action, "update", "F: 同タイム再送信は後追い付与だけ");
    assertEqual("achievedAt" in plan.fields, false, "F: 後追い付与の update に achievedAt は含まれない（今日の日付にならない）");
    const merged = { ...existingRaw, ...plan.fields };
    assertEqual(formatLeaderboardAchievedDate(merged.achievedAt), "9月17日", "F: 表示日は元のまま");
  }

  // ---- G. UID migration（旧→新への複製）→ 元の achievedAt を維持 ----
  {
    const oldEntry = { displayName: "旧", clearTimeMs: 8000, missCount: 0, achievedAt: jst("2026-08-28T17:03:31"), source: "normal" };
    assertEqual(planLeaderboardMerge(oldEntry, { clearTimeMs: 8114, missCount: 0 }), "copyThenDeleteOld", "G: 旧の方が速いので複製");
    const copied = buildCopiedLeaderboardEntry(oldEntry, { displayName: "新", oshiMemberId: null });
    assertEqual(copied.achievedAt, oldEntry.achievedAt, "G: 複製は元の achievedAt を保つ");
    assertEqual(formatLeaderboardAchievedDate(copied.achievedAt), "8月28日", "G: 引き継ぎ後も元の達成日が表示される");
  }

  // ---- H. admin repair → 旧記録の削除だけで、残る新記録の achievedAt に触らない ----
  {
    const oldEntry = { clearTimeMs: 8114, missCount: 0, achievedAt: jst("2026-08-28T17:03:31") };
    const newEntry = { clearTimeMs: 8114, missCount: 0, achievedAt: jst("2026-09-17T19:33:05") };
    assertEqual(planOldLeaderboardEntry(oldEntry, newEntry).action, "deleteOld", "H: 管理者修復は旧の削除だけ（新側は書かない）");
    const writes = buildBackupRebindWrites({ backupId: "b", oldUid: "o", newUid: "n", serverTimestampValue: "TS" });
    assertEqual(Object.keys(writes).some((k) => k.includes("timeAttackLeaderboards") || k.includes("achievedAt")), false, "H: 付け替えの書き込みはランキング記録に触れない＝achievedAt は修復日にならない");
    assertEqual(formatLeaderboardAchievedDate(newEntry.achievedAt), "9月17日", "H: 残る記録の日付は元のまま");
  }

  // ---- I. achievedAt 欠損 legacy → crash せず fallback（null＝日付欄を出さない） ----
  assertEqual(formatLeaderboardAchievedDate(undefined), null, "I: undefined → null");
  assertEqual(formatLeaderboardAchievedDate(null), null, "I: null → null");
  assertEqual(formatLeaderboardAchievedDate(0), null, "I: 0（normalize のフォールバック値）→ null");
  assertEqual(formatLeaderboardAchievedDate("2026-09-22"), null, "I: 文字列 → null（推測しない）");
  assertEqual(formatLeaderboardAchievedDate(NaN), null, "I: NaN → null");
  assertEqual(normalizeLeaderboardEntry("u", { clearTimeMs: 100, missCount: 0 }).achievedAt, 0, "I: achievedAt 欠損の正規化は 0（表示側は null 扱い）");

  // ---- 順位・統合に影響しない（表示専用） ----
  const a = normalizeLeaderboardEntry("a", { clearTimeMs: 5000, missCount: 0, achievedAt: jst("2026-09-01T00:00:00"), identityKey: KEY_A });
  const b = normalizeLeaderboardEntry("b", { clearTimeMs: 5000, missCount: 0, achievedAt: jst("2026-08-01T00:00:00"), identityKey: KEY_A });
  assertEqual(dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries([a, b])).map((e) => e.uid), ["b"], "同タイムは登録日時が早い方が残る（既存の tie-break は不変）");
}

// ---- J／K／L. 実際の行 DOM：全カードに日付・スマホ幅で崩れない・管理者情報ありでも崩れない ----
export async function runLeaderboardAchievedDateLayoutTests() {
  const { buildLeaderboardRow } = await import("../js/timeAttackLeaderboardScreen.js");
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:0;width:375px;box-sizing:border-box;";
  container.className = "leaderboard-list";
  document.body.appendChild(container);
  try {
    const entries = Array.from({ length: 10 }, (_, i) =>
      normalizeLeaderboardEntry(`uid-${i}`, {
        displayName: i === 3 ? "とても長い長い長い名前のプレイヤーさん" : `プレイヤー${i}`,
        oshiMemberId: null,
        clearTimeMs: 7000 + i * 1234.5,
        missCount: 0,
        rule: i % 3 === 0 ? "loveChain" : null,
        source: i % 2 === 0 ? "timeAttack" : "normal",
        achievedAt: jst("2026-09-22T10:00:00") + i * 86400000,
        actualQuestionCount: 5,
        identityKey: i % 4 === 0 ? undefined : KEY_A,
      })
    );
    const render = (isAdmin) => {
      container.innerHTML = "";
      entries.forEach((entry, i) => {
        container.appendChild(buildLeaderboardRow(entry, i + 1, { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false }, i === 2, "intro", "5", "title-track", { isAdmin }));
      });
    };
    render(false);
    const metas = [...container.querySelectorAll(".leaderboard-row-meta")].map((m) => m.textContent);
    assertEqual(metas.length, 10, "J: TOP10 の全カードに補助行がある");
    assertEqual(metas.every((t) => /記録日 \d{1,2}月\d{1,2}日/.test(t)), true, "J: 全カードに「記録日 ○月○日」が表示される");
    assertEqual(metas[0], "TA ・ ノーミスチャレンジ ・ 記録日 9月22日", "J: 既存のプレイ方法・ルール表示と同じ行に同居する");
    assertEqual(metas[1], "通常 ・ 記録日 9月23日", "J: ルール無しの記録は「通常 ・ 記録日」");
    const rows = [...container.querySelectorAll(".leaderboard-row")];
    assertEqual(rows.every((row) => row.scrollWidth <= row.clientWidth + 1), true, "K: 375px 幅で横にはみ出す行が無い");
    assertEqual(container.scrollWidth <= container.clientWidth + 1, true, "K: 一覧全体も横スクロールしない");
    const heights = rows.map((row) => row.getBoundingClientRect().height);
    assertEqual(Math.max(...heights) <= 130, true, `K: 行の高さが大きくなりすぎない（最大 ${Math.max(...heights).toFixed(0)}px）`);

    render(true);
    const adminRows = [...container.querySelectorAll(".leaderboard-row")];
    assertEqual(container.querySelectorAll(".leaderboard-row-admin-meta").length, 10, "L: 管理者の追加情報（ID末尾・登録日時）が全行に出る");
    assertEqual(container.querySelectorAll(".leaderboard-row-meta").length, 10, "L: 管理者表示でも記録日の行は残る");
    assertEqual(adminRows.every((row) => row.scrollWidth <= row.clientWidth + 1), true, "L: 管理者情報ありでも横にはみ出さない");

    // 日付が無い旧記録：記録日だけ省き、他の補助情報は残す（crash しない）
    container.innerHTML = "";
    const noDate = normalizeLeaderboardEntry("uid-legacy", { displayName: "旧", clearTimeMs: 9000, missCount: 0, source: "normal" });
    container.appendChild(buildLeaderboardRow(noDate, 1, { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false }, false, "intro", "5", "title-track"));
    assertEqual(container.querySelector(".leaderboard-row-meta")?.textContent, "通常", "I: achievedAt 欠損の記録は日付欄を出さず「通常」だけ");
    container.innerHTML = "";
    const nothing = normalizeLeaderboardEntry("uid-legacy2", { displayName: "旧2", clearTimeMs: 9000, missCount: 0 });
    container.appendChild(buildLeaderboardRow(nothing, 1, { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false }, false, "intro", "5", "title-track"));
    assertEqual(container.querySelector(".leaderboard-row-meta"), null, "I: 補助情報が何も無ければ行自体を出さない（従来どおり）");
  } finally {
    container.remove();
  }
}
