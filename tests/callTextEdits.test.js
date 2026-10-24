// 【2026-10-25新設】ライブコール文字モードの「本人が編集・承認した内容」を当てはめる部品の回帰テスト。
// 実在の歌詞・コールは使わず、テスト用のダミーだけで行う。
import { buildCallTextLayout, callKey, isValidLineOffset } from "../js/callTextLayout.js";
import { applyCallTextEntry, applyDisplayLyrics, computeCallsFingerprint, hashText, resolveApprovedCallText, splitTextAt } from "../js/callTextEdits.js";
import { renderCallTextView } from "../js/callTextView.js";
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

  // 【2026-10-25追加】行の途中の文字位置
  const WORD_LINE = [{ line: 1, text: "ダミーA！　ダミーB！", start: 10, end: 14 }];
  const shouts = [call(10.5, "callback", "掛け声1"), call(12.5, "callback", "掛け声2")];
  const anchor = (offset) => ({ lineNo: 1, position: "inline", offset, lineTextHash: hashText(WORD_LINE[0].text) });
  const wordLayout = buildCallTextLayout(WORD_LINE, shouts, { overrides: { [keyOf(shouts[0])]: anchor(5), [keyOf(shouts[1])]: anchor(WORD_LINE[0].text.length) } });
  assertEqual(wordLayout.items[0].anchored.map((g) => [g.offset, g.calls.map((c) => c.text)]), [[5, ["掛け声1"]], [WORD_LINE[0].text.length, ["掛け声2"]]], "文字位置：フレーズの後ろに1件ずつ");
  assertEqual([wordLayout.items[0].inline.length, wordLayout.stats.shownCalls], [0, 2], "文字位置：行末に残らず、件数も合う");
  const otherLyrics = [{ ...WORD_LINE[0], text: "違う歌詞" }];
  const fallback = buildCallTextLayout(otherLyrics, shouts, { overrides: { [keyOf(shouts[0])]: anchor(4) } });
  assertEqual([fallback.items[0].anchored.length, fallback.items[0].inline.length, fallback.stats.anchorFallbacks], [0, 2, 1], "文字位置：歌詞が違えば文字位置を使わず行の横へ");
  assertEqual([isValidLineOffset({ text: "あ😀い" }, 2, hashText("あ😀い")), isValidLineOffset({ text: "あ😀い" }, 3, hashText("あ😀い"))], [false, true], "文字位置：絵文字の途中には置けない");
  if (typeof document !== "undefined") {
    const box = document.createElement("div");
    renderCallTextView(box, wordLayout, {});
    const line = box.querySelector(".call-text-line");
    assertEqual([...line.querySelectorAll(".call-text-lyric")].map((n) => n.textContent).join(""), WORD_LINE[0].text, "文字位置の表示：歌詞をつなげると元の行（文字を足さない・消さない）");
    assertEqual(line.textContent.replace(/\s/g, ""), "ダミーA！掛け声1ダミーB！掛け声2", "文字位置の表示：黒と赤が交互");
  }

  // 【2026-10-25追加】1件のコールの分割（文字モードだけ）
  assertEqual(splitTextAt("A！　B！　C！", [2, 5]), ["A！", "　B！", "　C！"], "分割：区切った文章");
  assertEqual(splitTextAt("A！　B！", [2, 3]), null, "分割：空白だけの部分は作れない");
  assertEqual(splitTextAt("A！B", [0]), null, "分割：先頭では区切れない");
  const multi = call(40, "callback", "A！　B！　C！");
  const splitEntry = {
    calls: { [keyOf(multi)]: { lineNo: 1, position: "after", originalTextHash: hashText(multi.text), split: { at: [2, 5], parts: [{ lineNo: 1, position: "after" }, { lineNo: 2, position: "after" }, { lineNo: 3, position: "inline" }] } } },
  };
  const splitApplied = applyCallTextEntry([multi], splitEntry);
  assertEqual(splitApplied.calls.map((c) => [c.key, c.text]), [[`${keyOf(multi)}#1`, "A！"], [`${keyOf(multi)}#2`, "B！"], [`${keyOf(multi)}#3`, "C！"]], "分割：表示単位に分ける");
  assertEqual(multi.text, "A！　B！　C！", "分割：元のコールデータは変えない");
  const splitLayout = buildCallTextLayout(LINES, splitApplied.calls, { overrides: splitApplied.overrides });
  assertEqual([2, 3].map((n) => splitLayout.items.find((i) => i.kind === "line" && i.lineNo === n)[n === 2 ? "after" : "inline"].map((c) => c.text)), [["B！"], ["C！"]], "分割：それぞれ別の位置に置ける");
  const badSplit = applyCallTextEntry([multi], { calls: { [keyOf(multi)]: { ...splitEntry.calls[keyOf(multi)], split: { at: [2], parts: [{ lineNo: 1, position: "after" }] } } } });
  assertEqual([badSplit.mismatches.map((m) => m.reason), badSplit.calls.length], [["分割の位置が本文と合わない"], 1], "分割：区切りと表示単位の数が合わなければ分けない");
  assertEqual(resolveApprovedCallText([multi], { ...splitEntry, calls: { [keyOf(multi)]: { ...splitEntry.calls[keyOf(multi)], originalTextHash: hashText("別の本文") } } }).mismatch, true, "分割：本文が違う端末には当てはめない");

  // 【2026-10-25追加2】表示用の歌詞・空白と改行を保つ表示
  const shownLines = applyDisplayLyrics(LINES, { 2: { text: "ダミー　二行目", originalTextHash: hashText("ダミー二行目") }, 3: { text: "別", originalTextHash: hashText("違う元の歌詞") } });
  assertEqual(shownLines.map((l) => l.text), ["ダミー一行目", "ダミー　二行目", "ダミー三行目"], "表示用の歌詞：元の歌詞が同じ行だけ置き換える");
  assertEqual([shownLines[1].displayEdited, Boolean(shownLines[0].displayEdited), LINES[1].text], [true, false, "ダミー二行目"], "表示用の歌詞：元の歌詞データは書き換えない");
  assertEqual(applyDisplayLyrics(LINES, null), LINES, "表示用の歌詞：無ければそのまま");
  const preLayout = buildCallTextLayout(shownLines, [{ ...call(14, "callback", "　　　ダミー"), edited: true }, call(17, "callback", "元の  まま")]);
  assertEqual([preLayout.items[1].displayEdited, preLayout.items[0].displayEdited], [true, false], "表示用の歌詞の行に印");
  if (typeof document !== "undefined") {
    const box = document.createElement("div");
    renderCallTextView(box, preLayout, {});
    const calls = [...box.querySelectorAll(".call-text-call")];
    assertEqual(calls.map((c) => c.classList.contains("is-pre")), [true, false], "空白の表示：直した文章だけ空白・改行をそのまま見せる（元のコールは今までどおり）");
    assertEqual(box.querySelector('.call-text-group[data-line-no="2"] .call-text-lyric').classList.contains("is-pre"), true, "空白の表示：表示用の歌詞は空白・改行をそのまま見せる");
    assertEqual(box.querySelector('.call-text-group[data-line-no="1"] .call-text-lyric').classList.contains("is-pre"), false, "空白の表示：元の歌詞の行は今までどおり");
  }
}
