// 【2026-10-25新設】ライブコール文字モードの「本人が編集・承認した内容」を当てはめる部品の回帰テスト。
// 実在の歌詞・コールは使わず、テスト用のダミーだけで行う。
import { buildCallTextLayout, callKey } from "../js/callTextLayout.js";
import { applyCallTextEntry, computeCallsFingerprint, hashText, resolveApprovedCallText } from "../js/callTextEdits.js";
import { assertEqual } from "./test-utils.js";

const LINES = [
  { line: 1, text: "ダミー一行目", start: 10, end: 13 },
  { line: 2, text: "ダミー二行目", start: 13.2, end: 16 },
  { line: 3, text: "ダミー三行目", start: 16.5, end: 19 },
];
const call = (start, type = "callback", text = `C${start}`) => ({ text, start, end: start + 1.5, type });
const CALLS = [call(2, "mix", "ダミーMIX"), call(11, "callback", "ダミーA"), call(11.5, "member-call", "ダミーB"), call(17)];
const keyOf = (c) => callKey(c);
const record = (c, extra) => ({ lineNo: 1, position: "inline", originalTextHash: hashText(c.text), ...extra });
const order = (layout) => layout.items.flatMap((i) => (i.kind === "block" ? i.calls : [...i.before, ...i.inline, ...i.after])).map((c) => c.text);

export function runCallTextEditsTests() {
  console.log("--- ライブコール文字モード（編集・承認データ） ---");

  // 指紋
  assertEqual(hashText("abc"), hashText("abc"), "指紋：同じ文字列は同じ");
  assertEqual(hashText("abc") === hashText("abd"), false, "指紋：違う文字列は違う");
  assertEqual(computeCallsFingerprint(CALLS), computeCallsFingerprint([...CALLS].reverse()), "指紋：コールの並び順に左右されない");
  assertEqual(computeCallsFingerprint(CALLS) === computeCallsFingerprint(CALLS.map((c, i) => (i === 1 ? { ...c, text: "別" } : c))), false, "指紋：本文が変われば変わる");

  // キーと順番（エンジン側の対応）
  assertEqual(callKey({ key: "added-x", type: "callback", start: 1 }), "added-x", "キー：追加コールは key をそのまま使う");
  assertEqual(callKey(CALLS[1]), "callback@11.00", "キー：既存コールは種類＋開始時刻");
  const reordered = buildCallTextLayout(LINES, CALLS, { overrides: { [keyOf(CALLS[1])]: { lineNo: 1, position: "inline", order: 2 }, [keyOf(CALLS[2])]: { lineNo: 1, position: "inline", order: 1 } } });
  assertEqual(reordered.items.find((i) => i.kind === "line" && i.lineNo === 1).inline.map((c) => c.text), ["ダミーB", "ダミーA"], "順番：同じ場所の中は order の順");

  // 位置・文章・非表示・追加を当てはめる
  const entry = {
    baseFingerprint: computeCallsFingerprint(CALLS),
    calls: {
      [keyOf(CALLS[1])]: record(CALLS[1], { lineNo: 2, position: "after", editedText: "直した文章" }),
      [keyOf(CALLS[2])]: record(CALLS[2], { hidden: true }),
    },
    added: [{ key: "added-1", text: "本人追加の文章", type: "callback", lineNo: 3, position: "before", order: 16 }],
  };
  const applied = applyCallTextEntry(CALLS, entry);
  assertEqual(applied.mismatches, [], "当てはめ：食い違いなし");
  assertEqual(applied.fingerprintMatches, true, "当てはめ：コール一式の指紋が一致");
  assertEqual(applied.hiddenKeys, [keyOf(CALLS[2])], "当てはめ：非表示のコール");
  assertEqual(applied.calls.find((c) => c.start === 11).text, "直した文章", "当てはめ：文章の修正（文字モードだけ）");
  assertEqual(CALLS[1].text, "ダミーA", "当てはめ：元のコールデータは書き換えない");
  const layout = buildCallTextLayout(LINES, applied.calls, { overrides: applied.overrides });
  assertEqual(layout.items.find((i) => i.kind === "line" && i.lineNo === 2).after.map((c) => c.text), ["直した文章"], "当てはめ：位置の修正");
  assertEqual(layout.items.find((i) => i.kind === "line" && i.lineNo === 3).before.map((c) => c.text), ["本人追加の文章"], "当てはめ：本人追加のコール");
  assertEqual(layout.placements.find((p) => p.key === "added-1").added, true, "当てはめ：本人追加と分かる");
  assertEqual(layout.stats.shownCalls, CALLS.length, "当てはめ：非表示1件・追加1件で件数が合う");
  assertEqual(order(layout).includes("ダミーB"), false, "当てはめ：非表示のコールは出さない");

  // 端末のコールが別の版のときは当てはめない
  const otherVersion = CALLS.map((c, i) => (i === 1 ? { ...c, text: "別の版" } : c));
  const mismatch = applyCallTextEntry(otherVersion, entry);
  assertEqual(mismatch.mismatches.map((m) => m.key), [keyOf(CALLS[1])], "照合：本文が違うコールを検出");
  assertEqual(mismatch.calls.find((c) => c.start === 11).text, "別の版", "照合：本文が違うコールには当てはめない");
  assertEqual(applyCallTextEntry(CALLS.slice(0, 2), entry).mismatches.map((m) => m.reason), ["端末のコールに見つからない"], "照合：端末に無いコールを検出");

  // アプリ本体用：承認済みデータの解決
  assertEqual(resolveApprovedCallText(CALLS, null), { calls: CALLS, overrides: null, approved: false, mismatch: false }, "承認：データが無い曲は未確認");
  const legacy = { placements: { [keyOf(CALLS[1])]: { lineNo: 2, position: "after" } } };
  assertEqual(resolveApprovedCallText(CALLS, legacy).overrides, legacy.placements, "承認：旧形式（位置だけ）も使える");
  const resolved = resolveApprovedCallText(CALLS, entry);
  assertEqual([resolved.approved, resolved.mismatch, resolved.calls.length], [true, false, CALLS.length], "承認：新形式を当てはめる");
  const refused = resolveApprovedCallText(otherVersion, entry);
  assertEqual([refused.approved, refused.mismatch, refused.overrides, refused.calls], [false, true, null, otherVersion], "承認：別の版のコールには何も当てはめず未確認に戻す");
  const extraCall = resolveApprovedCallText([...CALLS, call(30)], entry);
  assertEqual([extraCall.approved, extraCall.mismatch], [false, true], "承認：コールが増えた端末にも当てはめない（指紋の違い）");
}
