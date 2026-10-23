// 【2026-10-24新設】ライブコール「文字モード」の回帰テスト。実在の歌詞・コールは使わず、テスト用のダミーだけで行う。
import { CALL_POSITION, buildCallTextLayout, callKey, estimateCallPlacement } from "../js/callTextLayout.js";
import { renderCallTextView } from "../js/callTextView.js";
import { APPROVED_CALL_TEXT_PLACEMENTS } from "../js/data/callTextPlacements.js";
import { isLiveCallTextModeEnabled, setLiveCallTextModeEnabled, LIVE_CALL_TEXT_MODE_FLAG_KEY } from "../js/liveCallTextModeFlag.js";
import { assertEqual } from "./test-utils.js";

const LINES = [
  { line: 1, text: "ダミー一行目", start: 10, end: 13 },
  { line: 2, text: "ダミー二行目", start: 13.2, end: 16 },
  { line: 3, text: "ダミー三行目", start: 16.5, end: 19 },
  { line: 4, text: "ダミー四行目", start: 30, end: 33 },
];
const call = (start, type = "callback", text = `C${start}`) => ({ text, start, end: start + 1.5, type });

export function runCallTextModeTests() {
  console.log("--- ライブコール文字モード ---");

  // 時刻からの位置の推定
  assertEqual(estimateCallPlacement(LINES, call(2)).position, CALL_POSITION.INTRO, "推定：1行目より前はイントロ");
  assertEqual(estimateCallPlacement(LINES, call(11)), { lineNo: 1, position: CALL_POSITION.INLINE, needsReview: false, reason: "行と同時" }, "推定：行の最中は同時（横）");
  assertEqual(estimateCallPlacement(LINES, call(16.1)).position, CALL_POSITION.AFTER, "推定：行が終わった後は直後");
  assertEqual(estimateCallPlacement(LINES, call(16.3)), { lineNo: 3, position: CALL_POSITION.BEFORE, needsReview: true, reason: "次の行の直前（行の境目）" }, "推定：次の行の直前は前・要確認");
  assertEqual(estimateCallPlacement(LINES, call(22)).position, CALL_POSITION.INTERLUDE, "推定：長い間は間奏");
  assertEqual(estimateCallPlacement(LINES, call(40)).position, CALL_POSITION.OUTRO, "推定：最後の行の後はアウトロ");
  assertEqual(estimateCallPlacement([], call(5)).position, CALL_POSITION.INTRO, "推定：歌詞が無い曲（インスト）はイントロにまとめる");
  assertEqual(estimateCallPlacement(LINES, call(13.3)).needsReview, true, "推定：行の始まりと重なるものは要確認");

  // 全件が1回ずつ・順番どおり表示される
  const calls = [call(2, "mix"), call(11), call(11.5, "member-call"), call(16.1), call(16.3), call(22, "mix"), call(31), call(40)];
  const layout = buildCallTextLayout(LINES, calls);
  assertEqual(layout.stats.shownCalls, calls.length, "並び：コールが1件も欠けない");
  const shownOrder = layout.items.flatMap((item) => (item.kind === "block" ? item.calls : [...item.before, ...item.inline, ...item.after]).map((c) => c.text));
  assertEqual(new Set(shownOrder).size, calls.length, "並び：同じコールが重複しない");
  assertEqual(shownOrder, calls.map((c) => c.text), "並び：コールの順番が入れ替わらない");
  assertEqual(layout.items.filter((i) => i.kind === "line").map((i) => i.lineNo), [1, 2, 3, 4], "並び：歌詞の全行が順番どおり");
  assertEqual(layout.items[0].kind === "block" && layout.items[0].position === "intro", true, "並び：イントロが先頭");
  assertEqual(layout.items.some((i) => i.kind === "block" && i.position === "interlude" && i.lineNo === 3), true, "並び：間奏は3行目の後に独立");
  assertEqual(layout.items[layout.items.length - 1].position, "outro", "並び：アウトロが最後");
  assertEqual(calls.map((c) => c.text).join(), layout.placements.map((p) => p.text).join(), "並び：本文を変えない");

  // ランダムなデータでも欠落しない
  let random = 7;
  const next = () => (random = (random * 1103515245 + 12345) % 2147483648) / 2147483648;
  let allShown = true;
  for (let trial = 0; trial < 40; trial += 1) {
    const lines = [];
    let t = next() * 10;
    for (let i = 1; i <= 20; i += 1) {
      const len = 0.3 + next() * 4;
      lines.push({ line: i, text: `L${i}`, start: t, end: t + len });
      t += len + next() * (next() < 0.2 ? 8 : 0.6);
    }
    const randomCalls = Array.from({ length: 25 }, () => call(next() * (t + 10)));
    const result = buildCallTextLayout(lines, randomCalls);
    if (result.stats.shownCalls !== randomCalls.length) allShown = false;
  }
  assertEqual(allShown, true, "並び：ランダムな歌詞・コールでも全件表示（40通り）");

  // 位置情報（承認済み）を優先、不正な位置情報は無視して推定に戻す
  const overridden = buildCallTextLayout(LINES, [call(16.3)], { overrides: { [callKey(call(16.3))]: { lineNo: 2, position: "after" } } });
  assertEqual([overridden.placements[0].lineNo, overridden.placements[0].position, overridden.placements[0].needsReview, overridden.placements[0].source], [2, "after", false, "override"], "位置情報：承認済みの位置を優先");
  const invalid = buildCallTextLayout(LINES, [call(11)], { overrides: { [callKey(call(11))]: { lineNo: 99, position: "after" } } });
  assertEqual(invalid.placements[0].source, "estimate", "位置情報：存在しない行は使わない");
  const uncertain = buildCallTextLayout(LINES, [call(11)], { uncertainLineNos: new Set([1]) });
  assertEqual(uncertain.placements[0].needsReview, true, "位置情報：歌詞の時刻が不確かな行は要確認");
  assertEqual(callKey(call(11, "mix", "ひみつの本文")).includes("ひみつ"), false, "キーにコール本文を含めない");

  // 公開する承認済みデータに歌詞・コール本文を含めない
  assertEqual(JSON.stringify(APPROVED_CALL_TEXT_PLACEMENTS).includes('"text"'), false, "公開データ：本文を持たない");
  assertEqual(
    Object.values(APPROVED_CALL_TEXT_PLACEMENTS).every((song) =>
      Object.values(song.placements ?? {}).every((p) => Object.keys(p).every((k) => k === "lineNo" || k === "position"))
    ),
    true,
    "公開データ：行番号と位置だけ"
  );

  // 表示（歌詞＝黒の行、コール＝赤の要素。要確認の印は指定したときだけ）
  const container = document.createElement("div");
  renderCallTextView(container, layout, { showTypes: true, showReview: true });
  assertEqual(container.querySelectorAll(".call-text-line").length, LINES.length, "表示：歌詞の全行を表示");
  assertEqual(container.querySelectorAll(".call-text-call").length, calls.length, "表示：コールを全件表示");
  assertEqual(container.querySelectorAll(".call-text-review-mark").length, layout.stats.reviewCalls, "表示：要確認の印");
  const plain = document.createElement("div");
  renderCallTextView(plain, layout, { showReview: false });
  assertEqual(plain.querySelectorAll(".call-text-review-mark").length, 0, "表示：確認済みなら要確認の印を出さない");
  assertEqual(container.querySelector(".call-text-block.is-interlude .call-text-block-label")?.textContent, "【間奏】", "表示：間奏の見出し");

  // 文字モードの有効化（この端末だけ）
  let saved = null;
  try {
    saved = localStorage.getItem(LIVE_CALL_TEXT_MODE_FLAG_KEY);
  } catch {
    saved = null;
  }
  setLiveCallTextModeEnabled(false);
  assertEqual(isLiveCallTextModeEnabled(), false, "有効化：オフ");
  setLiveCallTextModeEnabled(true);
  assertEqual(isLiveCallTextModeEnabled(), true, "有効化：オン");
  setLiveCallTextModeEnabled(saved === "on");
}

export async function runCallTextModeMarkupTests() {
  const html = await (await fetch("./index.html", { cache: "no-store" })).text();
  assertEqual(/id="live-call-mode-tabs"[^>]*hidden/.test(html), true, "画面：切り替えタブは初期状態で隠す（承認前は一般の利用者に出さない）");
  assertEqual(html.includes('id="live-call-text-panel"') && html.includes('href="css/callText.css"'), true, "画面：文字モードの表示場所と見た目");
  const sw = await (await fetch("./sw.js", { cache: "no-store" })).text();
  assertEqual(
    ["./js/callTextLayout.js", "./js/callTextView.js", "./js/data/callTextPlacements.js", "./css/callText.css"].every((f) => sw.includes(f)),
    true,
    "オフライン：文字モードのファイルをキャッシュ対象に入れる"
  );
}
