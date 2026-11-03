// r7-live（2026-11-01）のテスト。本物の歌詞・コールは使わない（ダミーの文字だけ）。
//   T. コール表とライブコールの組版が同じ：320・375・390・430・768（iPad 縦の狭い方）・1024（iPad 縦）の幅で、
//      同じ幅のとき、段落ごとの「何文字目で改行したか」が一致する（本物の CSS を読み込んだ iframe の中で描いて測る）
//   S. 大きな演出（js/callSpectacle.js）：種類はデータだけで決まる・時刻は本人の開始〜終了のまま・一時停止／シーク／OFF で残らない
//   P. タップで移動（js/callTapSeek.js）：時刻がある所だけ・コールは1秒前・スクロールの指の動きはタップにしない
//   N. 名前コールのオーロラ（全員の色。文字は変えない）
//   X. 【r8-fx】ド派手な演出：始まりから終わりまで出し続ける（長いコールでも弱くならない）・終わったら消える・
//      短いコールは爆発してすぐ消える・続けて来るコールの間は点滅させない（1秒に3回まで）・ペンライトの色・部品の数・一時停止・シーク
import { assertEqual } from "./test-utils.js";
import { buildCallTextLayout } from "../js/callTextLayout.js";
import { hashText } from "../js/callTextEdits.js";
import { layoutCallsInOrder } from "../js/liveCallData.js";
import { buildSheetStage, buildLiveStage } from "../js/liveCallScreen.js";
import {
  planSpectacle,
  spectacleStateAt,
  createSpectacle,
  spectacleSizeClass,
  SP_KINDS,
  SP_TAIL_SEC,
  SP_SHORT_MAX_SEC,
  SP_LONG_MIN_SEC,
  SP_BRIDGE_SEC,
  SP_BRIDGE_LEVEL,
  SP_CROWD_COUNT,
  SP_VENUE_COLORS,
  SP_FOLLOW_SEC,
  spectacleCrowdColors,
  spectacleRays,
  chooseSpectacleY,
} from "../js/callSpectacle.js";
import { lyricTapSeekTime, callTapSeekTime, isTapGesture, bindTapSeek, CALL_TAP_PRE_ROLL_SEC } from "../js/callTapSeek.js";
import { describeNameCall, nameCallAccent, nameCallAurora, NAME_KINDS } from "../js/liveCallNames.js";
import { enableKaraokeStage, disableKaraokeStage, mountKaraokeCallRows, updateKaraokeStage, setKaraokeCallsVisible } from "../js/karaokeStage.js";

const base = new URL("../", import.meta.url);
const fetchText = async (file) => (await fetch(new URL(file, base), { cache: "no-store" })).text();

// ---- ダミーの歌詞・コール（本物ではない。名前はメンバーの呼び名だけ） ----
// 本人の画面の崩れ方（行の途中の文字位置にコール・行末にもコール）を、ダミーの文字で作る
const LINES = [
  { line: 1, text: "ダミーの一行目です", start: 10, end: 13 },
  { line: 2, text: "さけべ！　　もっと！", start: 13.5, end: 16 },
  { line: 3, text: "いきろ！　　つよく！", start: 16.5, end: 19 },
  { line: 4, text: "ダミーの四行目のすこし長い歌詞の行です", start: 30, end: 33 },
  { line: 5, text: "ダミーの五行目", start: null, end: null }, // 時刻の無い行（タップで動かない）
];
const RAW_CALLS = [
  { text: "オイ！ オイ！ オイ！ オイ！", start: 8, end: 9.6, type: "call" }, // 前奏
  { text: "オイ！", start: 14.2, end: 14.5, type: "call" }, // 行2 の途中（さけべ！ の後）
  { text: "オイ！", start: 15.2, end: 15.5, type: "call" }, // 行2 の行末
  { text: "オイ！", start: 17.2, end: 17.5, type: "call" }, // 行3 の途中
  { text: "オイ！", start: 18.2, end: 18.5, type: "call" }, // 行3 の行末
  { text: "はなちゃん！", start: 19.2, end: 20.4, type: "call" }, // 1人
  { text: "えみり！ or りさちゃん！ or きあら！", start: 21, end: 23, type: "call" }, // or（3人）
  { text: "ダミーの長いコール！ ダミーの長いコール！\nダミーの長いコール！", start: 24, end: 29.5, type: "call", edited: true }, // 本人が改行を入れたコール
  { text: "ダミーのとても長いコールの文章で一行に入らないかもしれない", start: 31, end: 32.5, type: "call" },
];

function dummySheet() {
  const keyOf = (c) => `${c.type}@${c.start.toFixed(2)}`;
  const overrides = {
    [keyOf(RAW_CALLS[1])]: { lineNo: 2, position: "inline", offset: 4, lineTextHash: hashText(LINES[1].text) },
    [keyOf(RAW_CALLS[3])]: { lineNo: 3, position: "inline", offset: 4, lineTextHash: hashText(LINES[2].text) },
    [keyOf(RAW_CALLS[2])]: { lineNo: 2, position: "inline" },
    [keyOf(RAW_CALLS[4])]: { lineNo: 3, position: "inline" },
  };
  const layout = buildCallTextLayout(LINES, RAW_CALLS, { overrides });
  const calls = layoutCallsInOrder(layout).map((c) => ({ key: c.key, text: c.text, type: c.type, start: RAW_CALLS[c.callIndex].start, end: RAW_CALLS[c.callIndex].end }));
  return { layout, calls };
}

// ---- T：組版 ----
const CSS_FILES = ["css/style.css", "css/callText.css", "css/liveCall.css", "css/karaokeStage.css", "css/callSpectacle.css"];
async function makeFrame(width) {
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:absolute;left:-9999px;top:0;width:${width}px;height:900px;border:0;`;
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head>${CSS_FILES.map((f) => `<link rel="stylesheet" href="${new URL(f, base)}">`).join("")}</head><body style="margin:0"></body></html>`);
  doc.close();
  await Promise.all([...doc.querySelectorAll("link")].map((link) => (link.sheet ? null : new Promise((resolve) => ((link.onload = resolve), (link.onerror = resolve))))));
  await new Promise((resolve) => setTimeout(resolve, 30));
  return frame;
}

// 段落ごとに「何文字目で改行したか」（空白・飾りの部品・行番号は数えない）
function measureBreaks(stage) {
  const doc = stage.ownerDocument;
  const range = doc.createRange();
  return [...stage.querySelectorAll(".call-text-line, .call-text-calls, .call-text-extra, .call-text-block-label")].map((p) => {
    const walker = doc.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest("[aria-hidden=true], .call-text-review-mark, .call-text-line-no") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let idx = 0;
    let lastTop = null;
    const breaks = [];
    let node;
    while ((node = walker.nextNode())) {
      const s = node.textContent;
      for (let i = 0; i < s.length; i++) {
        if (/\s/.test(s[i])) {
          idx++;
          continue;
        }
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getClientRects()[0];
        if (r) {
          if (lastTop !== null && r.top > lastTop + r.height * 0.5) breaks.push(idx);
          if (lastTop === null || r.top > lastTop + r.height * 0.5) lastTop = r.top;
        }
        idx++;
      }
    }
    return { len: idx, breaks };
  });
}

async function runTypesetTests() {
  console.log("--- r7 T：コール表とライブコールの組版（改行の位置） ---");
  if (typeof document === "undefined") return;
  const { layout, calls } = dummySheet();
  const results = [];
  for (const width of [320, 375, 390, 430, 768, 1024]) {
    const frame = await makeFrame(width);
    const doc = frame.contentDocument;
    const wrap = doc.body.appendChild(doc.createElement("div"));
    wrap.style.cssText = "padding:0 16px;";
    const sheet = buildSheetStage(layout);
    const live = buildLiveStage(layout, calls, { lines: LINES });
    wrap.append(sheet, live.stage);
    // ライブコールの光（いちばん大きく光る状態）を付けても、組版は変わらないことも見る
    live.stage.querySelectorAll(".cx-call").forEach((c) => c.classList.add("is-active", "is-on"));
    const a = measureBreaks(sheet);
    const b = measureBreaks(live.stage);
    const textW = (stage) => stage.querySelector(".call-text-view").clientWidth;
    assertEqual(b.length, a.length, `T: 幅 ${width}：段落の数が同じ`);
    assertEqual(b, a, `T: 幅 ${width}：段落ごとの改行の位置が、コール表とライブコールで一致`);
    assertEqual(textW(live.stage), textW(sheet), `T: 幅 ${width}：文字の入る幅が同じ`);
    // 前と同じ崩れ方（行の途中のコールの後ろで落ちる）が起きていない：さけべ！ の段落は、コール表で1行なら、ライブコールも1行
    results.push({ width, paras: a.length, breaks: a.reduce((n, p) => n + p.breaks.length, 0) });
    // 1件は1件のまま・文字は変えない
    assertEqual(live.stage.querySelectorAll(".cx-call").length, calls.length, `T: 幅 ${width}：ライブコールのコールの部品＝データのコール`);
    assertEqual(
      calls.map((c) => live.callSpans.get(c.key).querySelector(".cx-text").textContent),
      calls.map((c) => c.text),
      `T: 幅 ${width}：ライブコールの文字は元のまま`,
    );
    frame.remove();
  }
  // どこかの幅では実際に折り返している（テストが「全部1行」で空振りしていない）
  assertEqual(results.some((r) => r.breaks > 0), true, "T: ダミーの文章は、狭い幅では実際に折り返す（比べる意味がある）");
  // 組版の約束がソースに残っている（光の部品が余白を足して幅を変えない）
  const liveCss = await fetchText("css/liveCall.css");
  const block = liveCss.match(/\.lc-stage \.cx-call \{[^}]*\}/)?.[0] ?? "";
  assertEqual(/padding:\s*0;/.test(block), true, "T: ソース：.cx-call の左右の余白は 0（光の板は外へはみ出して描く）");
  const src = await fetchText("js/liveCallScreen.js");
  assertEqual(/export function buildLiveStage[\s\S]*?buildStage\(layout/.test(src) && /export function buildSheetStage[\s\S]*?buildStage\(layout\)/.test(src), true, "T: ソース：コール表とライブコールは同じ buildStage（renderCallTextView）で描く");
}

// ---- S：大きな演出 ----
const SP_CALLS = [
  { key: "a", text: "Hey！", start: 5, end: 5.3 }, // A 短い
  { key: "b1", text: "オイ！", start: 10, end: 10.3 }, // B 連続
  { key: "b2", text: "オイ！", start: 10.5, end: 10.8 },
  { key: "b3", text: "オイ！", start: 11, end: 11.3 },
  { key: "b4", text: "オイ！", start: 11.5, end: 11.8 },
  { key: "b5", text: "オイ！", start: 12, end: 12.3 },
  { key: "c", text: "ダミーの長いコール！", start: 20, end: 26 }, // C 長い
  { key: "d", text: "はなちゃん！", start: 30, end: 31 }, // D 名前
  { key: "n", text: "ダミーのふつう", start: 40, end: 42 }, // ふつう
  { key: "x", text: "ダミー", start: 50, end: 49 }, // 終了が開始より前（入れない）
];

function runSpectaclePlanTests() {
  console.log("--- r7 S：大きな演出の種類（データだけで決まる） ---");
  const plan = planSpectacle(SP_CALLS);
  const kinds = Object.fromEntries(plan.map((p) => [p.key, p.kind]));
  assertEqual(plan.length, 9, "S: 時刻のおかしいコールは入れない（光らせないのと同じ）");
  assertEqual(kinds.a, SP_KINDS.SHORT, `S: A 短いコール（${SP_SHORT_MAX_SEC}秒以下）`);
  assertEqual([kinds.b1, kinds.b2, kinds.b3, kinds.b4, kinds.b5], Array(5).fill(SP_KINDS.CHAIN), "S: B 続けて来るコール（0.8秒以内に次・3件以上）");
  assertEqual(plan.filter((p) => p.kind === SP_KINDS.CHAIN).map((p) => p.chainIndex), [0, 1, 2, 3, 4], "S: B 続けて来るコールは順番を持つ（置き場所を変える）");
  assertEqual(kinds.c, SP_KINDS.LONG, `S: C 長いコール（${SP_LONG_MIN_SEC}秒以上）`);
  assertEqual(kinds.d, SP_KINDS.NAME, "S: D 名前コール（確かめた名前の表で判定）");
  assertEqual(kinds.n, SP_KINDS.NORMAL, "S: それ以外はふつう");
  assertEqual(plan.find((p) => p.key === "b2").hot, true, "S: E 8秒の中にコールの始まりが5件以上＝盛り上がる区間（データの密度）");
  assertEqual(plan.find((p) => p.key === "c").hot, false, "S: E 密度が低い所は盛り上がる区間にしない");
  assertEqual(planSpectacle(SP_CALLS), plan, "S: 同じデータなら、いつも同じ結果");
  assertEqual(plan.find((p) => p.key === "d").colors.length >= 1, true, "S: 名前コールはメンバーカラーを持つ");
  assertEqual(plan.filter((p) => p.kind !== SP_KINDS.NAME).every((p) => p.colors.length === 0), true, "S: 名前でないコールに色を付けない");
  // 2件だけ続くものは「続けて来る」にしない
  const two = planSpectacle([
    { key: "p", text: "オイ！", start: 1, end: 1.3 },
    { key: "q", text: "オイ！", start: 1.6, end: 1.9 },
  ]);
  assertEqual(two.map((p) => p.kind), [SP_KINDS.SHORT, SP_KINDS.SHORT], "S: 2件だけ続くものは A のまま");
  assertEqual([spectacleSizeClass("Hey！"), spectacleSizeClass("はなちゃん！"), spectacleSizeClass("ダミーの長いコールです"), spectacleSizeClass("あ".repeat(30))], ["s", "m", "l", "xl"], "S: 文字の大きさの段階は文字数だけで決まる");
}

function runSpectacleTimingTests() {
  console.log("--- r7 S：大きな演出の時刻（開始を早めない・終わりで消える・次が来たら切り替える） ---");
  const plan = planSpectacle(SP_CALLS);
  const at = (t, opts) => spectacleStateAt(plan, t, opts);
  assertEqual(at(4.99).word.o, 0, "S: 始まる前は出ない（早めない）");
  assertEqual(at(4.99).key, null, "S: 始まる前は、どのコールも出ていない");
  assertEqual(at(5).key, "a", "S: 開始の時刻ちょうどで、そのコール");
  assertEqual(at(5.1).word.o, 1, "S: 始まってすぐ大きな文字が出る");
  assertEqual(at(5.3 + SP_TAIL_SEC + 0.001).word.o, 0, "S: 終わりから 0.35 秒で消える（延ばし続けない）");
  assertEqual(at(5.3 + SP_TAIL_SEC + 0.001).key, null, "S: 消えたあとは何も出ていない");
  // 続けて来るコール：次の始まりで、すぐ次の文字に切り替わる（前が残らない）
  assertEqual([at(10.49).key, at(10.5).key], ["b1", "b2"], "S: B 次のコールの始まりで切り替わる");
  assertEqual(at(10.501).word.x !== at(10.001).word.x || at(10.501).word.y !== at(10.001).word.y, true, "S: B 続けて来るコールは置き場所が変わる");
  assertEqual([at(10.01).wash > 0, at(10.51).wash, at(11.01).wash], [true, 0, 0], "S: B 画面全体の光は最初の1件だけ（激しい点滅にしない）");
  // 画面全体の光が強くなる回数：1秒に3回を超えない（全部のコールを 1/60 秒ごとに見る）
  let peaks = [];
  let prev = 0;
  for (let t = 0; t < 60; t += 1 / 60) {
    const w = at(t).wash;
    if (w > 0.2 && prev <= 0.2) peaks.push(t);
    prev = w;
  }
  const tooFast = peaks.some((t, i) => i >= 3 && t - peaks[i - 3] < 1);
  assertEqual(tooFast, false, "S: 画面全体の光は、1秒に3回を超えて強くならない");
  // 【r8-fx】長いコール：始まりから終わりまで、ずっと大きな文字と会場（途中で弱くならない）。終わったら消える
  assertEqual(at(20.5).word.o, 1, "S: C 長いコールの始まりは大きな文字");
  // r8-fx は下の runBlastTests で、長いコールの全区間を細かく確かめる
  assertEqual([at(23).word.o, at(25.9).word.o, at(25.9).stage], [1, 1, 1], "S: C 長いコールの途中・終わり際も、大きな文字と会場を出したまま");
  assertEqual(at(25).heat > at(21).heat, true, "S: C 長いコールは進むほど熱く（光線が濃く）なる");
  assertEqual([at(26 + SP_TAIL_SEC + 0.01).word.o, at(26 + SP_TAIL_SEC + 0.01).stage], [0, 0], "S: C 終わったら文字も会場も消える");
  const longName = planSpectacle([{ key: "ln", text: "はなちゃん！", start: 1, end: 5 }]);
  assertEqual([spectacleStateAt(longName, 2).word.o, spectacleStateAt(longName, 4.9).word.o, spectacleStateAt(longName, 5 + SP_TAIL_SEC + 0.01).word.o], [1, 1, 0], "S: D 長い名前コールも、終わるまで大きな文字（終わったら消える）");
  // 視差効果を減らす：拡大しない・揺れの元（光の輪）を出さない
  assertEqual([at(5.05, { reduced: true }).word.s, at(5.05, { reduced: true }).burst], [1, 0], "S: 視差効果を減らす：拡大・光の輪なし");
  // 同じ時刻なら同じ結果（シークしても、その時刻の正しい見た目）
  assertEqual(JSON.stringify(at(10.7)), JSON.stringify(spectacleStateAt(plan, 10.7)), "S: 見た目は時刻だけで決まる");
}

function runSpectacleDomTests() {
  console.log("--- r7 S：大きな演出の部品（一時停止・OFF で残らない・部品は1組だけ） ---");
  if (typeof document === "undefined") return;
  const host = document.body.appendChild(document.createElement("div"));
  const sp = createSpectacle(host, { variant: "live" });
  sp.setPlan(planSpectacle(SP_CALLS));
  assertEqual(host.querySelectorAll(".sp-layer").length, 2, "S: 層は前と後ろの2枚だけ（コールの数だけ作らない）");
  sp.update(30.5, { playing: true, enabled: true });
  const word = host.querySelector(".sp-word");
  assertEqual([sp.layer.hidden, word.style.opacity, sp.layer.dataset.kind], [false, "1", "name"], "S: 再生中は大きな文字が出る");
  assertEqual(host.querySelector(".sp-word-text").textContent, "はなちゃん！", "S: 大きな文字は、本人のコールの文字のまま");
  assertEqual(host.querySelectorAll(".sp-word-text .cx-name-part").length, 1, "S: 名前の部分に色の光の部品");
  sp.update(30.5, { playing: false, enabled: true });
  assertEqual([sp.layer.classList.contains("is-paused"), word.style.opacity], [true, "0"], "S: 一時停止：大きな文字を残さない");
  sp.update(30.5, { playing: true, enabled: false });
  assertEqual([sp.layer.hidden, sp.back.hidden], [true, true], "S: 演出なし・コール表示 OFF：層ごと出さない");
  sp.update(70, { playing: true, enabled: true });
  assertEqual(word.style.opacity, "0", "S: 曲の終わり（最後のコールのあと）は何も出さない");
  // 連続のシーク：前後に何度動かしても、その時刻の見た目
  for (const t of [11.2, 5.1, 25, 10.6, 30.4]) sp.update(t, { playing: true, enabled: true });
  assertEqual([sp.state().key, sp.layer.dataset.kind], ["d", "name"], "S: 連続のシークのあとも、最後の時刻のコール");
  sp.destroy();
  assertEqual(host.querySelectorAll(".sp-layer").length, 0, "S: 閉じたら部品を外す");
  host.remove();
}

async function runKaraokeSpectacleTests() {
  console.log("--- r7 S：カラオケの大きな演出（コール表示 ON／OFF・画面が見えている間だけ） ---");
  if (typeof document === "undefined") return;
  const { layout, calls } = dummySheet();
  const screen = document.body.appendChild(document.createElement("section"));
  screen.className = "screen is-active";
  const fxHost = screen.appendChild(document.createElement("div"));
  fxHost.className = "karaoke-middle-zone";
  const panel = fxHost.appendChild(document.createElement("div"));
  LINES.forEach((line) => {
    const p = panel.appendChild(document.createElement("p"));
    p.className = "synced-lyrics-line";
    p.textContent = line.text;
  });
  const hudCard = screen.appendChild(document.createElement("div"));
  const hudText = hudCard.appendChild(document.createElement("p"));
  enableKaraokeStage({ screen, hudCard, lyricsPanel: panel, hudText }, { song: { id: "x" }, calls, lines: LINES, layout, callsVisible: true });
  mountKaraokeCallRows();
  const front = () => screen.querySelector(".sp-front");
  assertEqual(screen.querySelectorAll(".sp-layer").length, 2, "S: カラオケにも層は2枚だけ");
  assertEqual(screen.querySelector(".sp-back").previousElementSibling?.classList.contains("kx-fx"), true, "S: カラオケ：ペンライトは背景のすぐ後ろ（歌詞の後ろ）");
  updateKaraokeStage(19.5, { playing: true });
  assertEqual([front().hidden, front().dataset.kind], [false, "name"], "S: カラオケ：再生中・コール表示 ON で大きな文字");
  updateKaraokeStage(19.5, { playing: false });
  assertEqual(front().classList.contains("is-paused"), true, "S: カラオケ：止まっている間は出さない");
  setKaraokeCallsVisible(false);
  updateKaraokeStage(19.5, { playing: true });
  assertEqual(front().hidden, true, "S: カラオケ：コール表示 OFF では出さない");
  setKaraokeCallsVisible(true);
  screen.classList.remove("is-active");
  updateKaraokeStage(19.5, { playing: true });
  assertEqual(front().hidden, true, "S: カラオケ：画面が隠れている間は出さない（別の画面に残らない）");
  disableKaraokeStage();
  assertEqual(screen.querySelectorAll(".sp-layer").length, 0, "S: カラオケ：閉じたら外す");
  screen.remove();
}

// ---- P：タップで移動 ----
function runTapTests() {
  console.log("--- r7 P：タップで移動（時刻がある所だけ） ---");
  assertEqual([lyricTapSeekTime({ start: 13.5 }), lyricTapSeekTime({ start: null }), lyricTapSeekTime({}), lyricTapSeekTime(null)], [13.5, null, null, null], "P: 歌詞の行：開始の時刻があるときだけ、その時刻");
  assertEqual([callTapSeekTime({ start: 14.2 }), callTapSeekTime({ start: 0.4 }), callTapSeekTime({ start: undefined })], [13.2, 0, null], `P: コール：開始の ${CALL_TAP_PRE_ROLL_SEC} 秒前（0 より前にはしない）`);
  assertEqual(
    [
      isTapGesture({ startX: 10, startY: 10, endX: 12, endY: 13 }),
      isTapGesture({ startX: 10, startY: 10, endX: 10, endY: 40 }),
      isTapGesture({ startX: 10, startY: 10, endX: 10, endY: 11, scrollBefore: 0, scrollAfter: 120 }),
    ],
    [true, false, false],
    "P: 指が動いた・箱がスクロールした ときはタップにしない",
  );
  if (typeof document === "undefined") return;
  const { layout, calls } = dummySheet();
  const seeks = [];
  const live = buildLiveStage(layout, calls, { lines: LINES, onSeek: (time, info) => seeks.push([info.kind, time]) });
  document.body.appendChild(live.stage);
  const lines = [...live.stage.querySelectorAll(".call-text-line")];
  const seekable = lines.filter((l) => l.classList.contains("is-seekable")).map((l) => Number(l.dataset.seekTime));
  assertEqual(seekable, [10, 13.5, 16.5, 30], "P: 押せる行は時刻のある行だけ（時刻の無い行は押せない）");
  // 行を押す → その行の開始へ
  lines[1].dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  assertEqual(seeks.pop(), ["lyric", 13.5], "P: 行を押すと、その行の開始へ");
  // 行の中のコールを押す → コールの1秒前だけ（行の移動はしない）
  seeks.length = 0;
  live.callSpans.get(calls[1].key).dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  assertEqual(seeks, [["call", 13.2]], "P: 行の中のコールを押すと、コールの1秒前だけ");
  // 時刻の無い行は押しても動かない
  seeks.length = 0;
  lines[4].dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  assertEqual(seeks, [], "P: 時刻の無い行は押しても動かない（推測で移動しない）");
  // スクロールの指の動き（pointerdown のあと離れた所で click）はタップにしない
  lines[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
  lines[0].dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1, clientX: 10, clientY: 60 }));
  assertEqual(seeks, [], "P: スクロールの指の動きは移動しない");
  live.unbind();
  lines[0].dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  assertEqual(seeks, [], "P: 画面を閉じたら（購読を外したら）押しても動かない");
  live.stage.remove();
  // bindTapSeek 単体：キーボードの Enter（detail 0）はタップ
  const button = document.createElement("span");
  let n = 0;
  const off = bindTapSeek(button, () => (n += 1));
  button.dispatchEvent(new MouseEvent("click", { detail: 0 }));
  off();
  assertEqual(n, 1, "P: キーボード・支援技術からの押下も使える");
}

// ---- N：名前コールのオーロラ ----
function runAuroraTests() {
  console.log("--- r7 N：名前コールの色（1人・複数・or） ---");
  const one = nameCallAccent(describeNameCall("はなちゃん！"));
  const or3 = nameCallAccent(describeNameCall("えみり！ or りさちゃん！ or きあら！"));
  assertEqual(one?.kind, NAME_KINDS.SINGLE, "N: 1人");
  assertEqual(or3?.kind, NAME_KINDS.OR, "N: or（3人）");
  assertEqual(or3?.colors.length, 3, "N: or は全員の色");
  const g1 = nameCallAurora(one);
  const g3 = nameCallAurora(or3);
  assertEqual(or3.colors.every((c) => g3.includes(c)), true, "N: オーロラに全員の色が入る");
  assertEqual(g1.startsWith("linear-gradient(90deg, ") && g1.includes(one.colors[0]), true, "N: 1人はその色の光");
  assertEqual(nameCallAurora(null), "none", "N: 名前でないときは光らせない");
  assertEqual(nameCallAccent(describeNameCall("オイ！ わーわー！")), null, "N: 名前でないコールに色を付けない（確かめた名前だけ）");
  // 2人：A→B→A を2周（切れ目なく流れる）
  const two = nameCallAurora({ colors: ["#111111", "#222222"] });
  assertEqual(two, "linear-gradient(90deg, #111111, #222222, #111111, #222222, #111111)", "N: 2人は2色をなめらかに混ぜて流す");
}

async function runSourceTests() {
  console.log("--- r7：ソースの確認（前の版を変えない・APP_SHELL） ---");
  const sw = await fetchText("sw.js");
  assertEqual(["./js/callSpectacle.js", "./js/callTapSeek.js", "./css/callSpectacle.css"].every((f) => sw.includes(`"${f}"`)), true, "R: 新しいファイルは APP_SHELL に入っている");
  const index = await fetchText("index.html");
  assertEqual(index.includes('href="css/callSpectacle.css"'), true, "R: index.html が演出の CSS を読む");
  const classic = await fetchText("js/callSync.js");
  assertEqual(classic.includes("callSpectacle") || classic.includes("callTapSeek"), false, "R: 前の版（同期モード）には新しい部品を入れていない");
  const kss = await fetchText("js/karaokeSyncScreen.js");
  assertEqual(kss.includes("if (followDeviceAudio) updateKaraokeStage(positionSec, { ended: elements.deviceAudio.ended, playing: kxPlaying });"), true, "R: カラオケの大きな演出は新しいカラオケ（followDeviceAudio）のときだけ");
  // 繰り返すアニメーション（名前の脈打ち・オーロラ・ペンライトの揺れ）は css/callSpectacle.css だけ。ライブコール・カラオケの元の CSS には足さない
  const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const [liveCss2, karaokeCss2, spCss] = await Promise.all(["css/liveCall.css", "css/karaokeStage.css", "css/callSpectacle.css"].map(fetchText));
  assertEqual(/@keyframes|animation\s*:/.test(strip(liveCss2)), false, "R: css/liveCall.css は今までどおりアニメーションを持たない");
  assertEqual(/cxNamePulse|cxAuroraFlow|spBeamSway/.test(strip(karaokeCss2)), false, "R: css/karaokeStage.css に新しい繰り返しのアニメーションを足していない");
  assertEqual(/prefers-reduced-motion: reduce/.test(spCss) && /is-paused[^{]*\{[^}]*animation-play-state: paused/.test(strip(spCss)), true, "R: 新しいアニメーションは、一時停止中・視差効果を減らす設定で止める");
}

// ---- F：演出中の読みやすさ（2026-11-01 r7-live-fix。独立レビューの指摘） ----
async function runReadabilityFixTests() {
  console.log("--- r7-fix F：大きな文字は、光っているコール・いま／つぎを避ける。カラオケはカードと二重にしない ---");
  const region = { top: 100, bottom: 700 };
  const overlaps = (y, h, r) => Math.min(y + h / 2, r.bottom) - Math.max(y - h / 2, r.top) > 0;
  // 光っているコールが下半分 → 上側に出す
  const low = { top: 480, bottom: 560 };
  const yLow = chooseSpectacleY(region, [low], 120);
  assertEqual([yLow < 400, overlaps(yLow, 120, low)], [true, false], "F: 光っているコールが下にあるときは、上側に出して重ねない");
  // 光っているコールが上半分 → 下側に出す
  const high = { top: 150, bottom: 260 };
  const yHigh = chooseSpectacleY(region, [high], 120);
  assertEqual([yHigh > 400, overlaps(yHigh, 120, high)], [true, false], "F: 光っているコールが上にあるときは、下側に出して重ねない");
  // 真ん中に光っているコールと「いま／つぎ」の札（上）→ 下側
  const mid = { top: 360, bottom: 440 };
  const panel = { top: 90, bottom: 160 };
  const yMid = chooseSpectacleY(region, [mid, panel], 120);
  assertEqual([overlaps(yMid, 120, mid), overlaps(yMid, 120, panel)], [false, false], "F: 光っているコールも、いま／つぎの札も避ける");
  assertEqual(chooseSpectacleY(region, [], 120), 400, "F: 避けるものが無ければ真ん中");
  assertEqual(chooseSpectacleY({ top: 10, bottom: 5 }, [], 10), null, "F: 範囲がおかしいときは決めない（いつもの位置）");
  // どこに置いても重なる（範囲いっぱいの長いコール）ときは、重なりが一番小さい所
  const yFull = chooseSpectacleY({ top: 0, bottom: 300 }, [{ top: 0, bottom: 200 }], 100);
  assertEqual(yFull >= 200, true, "F: 全部は避けられないときは、重なりが一番小さい所");
  if (typeof document === "undefined") return;
  // createSpectacle の place：コールが変わったときに位置を受け取り、層の --sp-y に入れる
  const host = document.body.appendChild(document.createElement("div"));
  const asked = [];
  const sp = createSpectacle(host, { variant: "live", place: (item) => (asked.push(item.key), { y: 123 }) });
  sp.setPlan(planSpectacle(SP_CALLS));
  sp.update(5.1, { playing: true, enabled: true });
  sp.update(5.2, { playing: true, enabled: true });
  assertEqual([asked, sp.layer.style.getPropertyValue("--sp-y"), sp.back.style.getPropertyValue("--sp-y")], [["a"], "123px", "123px"], "F: 位置はコールが変わったときに1回だけ決める（毎フレーム測らない）");
  sp.destroy();
  host.remove();
  // 【r8-fx】カラオケ：コールの間は、上下の操作の帯の間いっぱいに会場と超大きな文字（歌詞・カードは隠れてよい：本人の依頼）
  const { layout, calls } = dummySheet();
  const screen = document.body.appendChild(document.createElement("section"));
  screen.className = "screen is-active";
  const header = screen.appendChild(document.createElement("div"));
  header.className = "karaoke-header-zone";
  header.style.cssText = "position:fixed;left:0;top:0;width:300px;height:80px;";
  const panelEl = screen.appendChild(document.createElement("div"));
  LINES.forEach((line) => {
    const p2 = panelEl.appendChild(document.createElement("p"));
    p2.className = "synced-lyrics-line";
    p2.textContent = line.text;
  });
  const hudCard = screen.appendChild(document.createElement("div"));
  hudCard.style.cssText = "position:fixed;left:10px;top:300px;width:200px;height:100px;";
  const hudText = hudCard.appendChild(document.createElement("p"));
  const footer = screen.appendChild(document.createElement("div"));
  footer.className = "karaoke-footer-zone";
  footer.style.cssText = "position:fixed;left:0;top:600px;width:300px;height:100px;";
  enableKaraokeStage({ screen, hudCard, lyricsPanel: panelEl, hudText }, { song: { id: "x" }, calls, lines: LINES, layout, callsVisible: true });
  updateKaraokeStage(19.5, { playing: true });
  const front = screen.querySelector(".sp-front");
  const layerTop = front.getBoundingClientRect().top;
  const hb = header.getBoundingClientRect().bottom;
  const ft = footer.getBoundingClientRect().top;
  assertEqual([front.style.getPropertyValue("--sp-bt"), front.style.getPropertyValue("--sp-bh")], [`${Math.round(hb - layerTop)}px`, `${Math.round(ft - hb)}px`], "F: カラオケ：会場は上下の操作の帯の間いっぱい");
  assertEqual(front.style.getPropertyValue("--sp-y"), `${Math.round(hb + (ft - hb) * 0.44 - layerTop)}px`, "F: カラオケ：文字は会場の真ん中より少し上（下にペンライトの群れ）");
  assertEqual(parseFloat(front.style.getPropertyValue("--sp-fs")) > 0, true, "F: カラオケ：文字の大きさは会場に収まる値に決める");
  assertEqual(front.querySelector(".sp-word-text").textContent.length > 0 && front.querySelector(".sp-word").style.opacity, "1", "F: カラオケ：大きな文字を出す（全画面）");
  disableKaraokeStage();
  screen.remove();
  const spCss = (await fetchText("css/callSpectacle.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const word = spCss.match(/\.sp-word-text \{[^}]*\}/)?.[0] ?? "";
  assertEqual((word.match(/#1a0330/g) ?? []).length >= 8, true, "F: 大きな文字は太い縁取り（8方向。明るい地でも読める）");
  assertEqual(/\.sp-word-text \.cx-name-sep \{\s*color: #fff;/.test(spCss), true, "F: 「or」は灰色にしない");
}

// ---- X：【r8-fx】ド派手な演出（本人の依頼 REQUEST_R8 の 1） ----
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function runBlastTests() {
  console.log("--- r8-fx X：コールの始まりから終わりまで飛び出したまま・終わったら消える・点滅させない ---");
  const plan = planSpectacle(SP_CALLS);
  const at = (t, opts) => spectacleStateAt(plan, t, opts);
  // 長いコール（20〜26 秒）：始まって 0.1 秒から終わりまで 1/30 秒ごと、文字の濃さ 1・会場 1・拡大 0.98 以上（途中で弱くならない）
  let weak = [];
  for (let t = 20.1; t < 26; t += 1 / 30) {
    const v = at(t);
    if (v.key !== "c" || v.word.o !== 1 || v.stage !== 1 || (t > 20.5 && v.word.s < 0.98)) weak.push(Math.round(t * 100) / 100);
  }
  assertEqual(weak, [], "X: 長いコール：始まりから終わりまで、ずっと大きな文字と会場（途中で戻さない）");
  // 名前コール（30〜31 秒）も同じ
  weak = [];
  for (let t = 30.1; t < 31; t += 1 / 30) if (at(t).word.o !== 1 || at(t).stage !== 1) weak.push(t);
  assertEqual(weak, [], "X: 名前コール：終わるまで出したまま");
  // 長いコールは脈打つ（大きさだけ。終わりまで動き続ける）
  const scales = [];
  for (let t = 22; t < 25; t += 0.05) scales.push(at(t).word.s);
  assertEqual(Math.max(...scales) - Math.min(...scales) > 0.03, true, "X: 長いコール：途中もゆっくり脈打つ（今まさに叫んでいる）");
  // 終わり：最大 0.35 秒で消える（会場も）。始まる前は出ない
  assertEqual([at(26.2).word.o < 1, at(26 + SP_TAIL_SEC).word.o, at(26 + SP_TAIL_SEC).stage], [true, 0, 0], "X: 終わったら 0.35 秒で文字も会場も消える");
  const early = plan.filter((call) => spectacleStateAt(plan, call.start - 0.001).key === call.key).map((call) => call.key);
  assertEqual(early, [], "X: どのコールも、本人の開始より前には出ない");
  // 短いコール（おい！）：一気に飛び出して（1.2 倍以上）、すぐ消える（終わり＋0.35 秒で 0）
  const pops = [];
  for (let t = 5; t < 5.3; t += 0.01) pops.push(at(t).word.s);
  assertEqual([Math.max(...pops) >= 1.2, Math.min(...pops) <= 0.6, at(5.02).burst > 0.8, at(5.3 + SP_TAIL_SEC).word.o], [true, true, true, 0], "X: 短いコール：小さな点から爆発して飛び出し、すぐ消える");
  // 続けて来るコール（10〜12.3 秒）：間も会場を下ろしたまま（暗幕が上下に点滅しない）。画面全体の光は最初だけ
  const dips = [];
  for (let t = 10.06; t < 12.3; t += 1 / 60) if (at(t).stage < SP_BRIDGE_LEVEL - 0.001) dips.push(t);
  assertEqual(dips, [], "X: 続けて来るコールの間は、会場を下ろしたまま（点滅させない）");
  assertEqual([at(10.02).wash > 0, at(10.52).wash, at(11.02).wash], [true, 0, 0], "X: 続けて来るコール：画面全体の光は最初の1件だけ");
  // 画面全体の明るさの変化（会場が下りる・始まりの光）が、どの 1 秒の中でも 3 回まで（いろいろな間隔の短いコールで確かめる）
  const dense = [];
  let t0 = 1;
  for (let i = 0; i < 80; i++) {
    const dur = [0.25, 0.4, 0.3, 1.0, 0.2][i % 5];
    dense.push({ key: `z${i}`, text: "オイ！", start: t0, end: t0 + dur });
    t0 += dur + [0.15, 0.6, 0.95, 1.05, 1.4, 0.3, 2.2][i % 7];
  }
  const dplan = planSpectacle(dense);
  const rises = [];
  let prevStage = 0;
  let prevWash = 0;
  for (let t = 0; t < t0 + 1; t += 1 / 60) {
    const v = spectacleStateAt(dplan, t);
    if ((v.stage > 0.5 && prevStage <= 0.5) || (v.wash > 0.2 && prevWash <= 0.2)) rises.push(t);
    prevStage = v.stage;
    prevWash = v.wash;
  }
  const flashy = rises.some((t, i) => i >= 3 && t - rises[i - 3] < 1);
  assertEqual([flashy, rises.length > 10], [false, true], "X: 画面全体が明るくなる回数は、どの 1 秒の中でも 3 回まで");
  assertEqual(SP_BRIDGE_SEC >= 0.8, true, "X: 続けて来るコール（0.8 秒以内）は、必ず会場を下ろしたまま");
  // 視差効果を減らす：拡大・傾き・爆発なし。会場と文字は終わるまで静かに出す
  const rv = [at(20.03, { reduced: true }), at(24, { reduced: true }), at(10.6, { reduced: true })];
  assertEqual([rv[0].word.s, rv[1].word.s, rv[1].word.o, rv[1].stage, rv[2].word.r, rv[0].burst], [1, 1, 1, 1, 0, 0], "X: 視差効果を減らす：動かさず、終わるまで静かな大きな表示");
  // シーク：同じ時刻なら同じ見た目（前後に動かしても）
  assertEqual(JSON.stringify(at(24.2)), JSON.stringify(spectacleStateAt(plan, 24.2)), "X: 見た目は時刻だけで決まる（シークしても、その時刻の見た目）");
  // ペンライト・光線の色
  const nameItem = plan.find((p) => p.key === "d");
  assertEqual(new Set(spectacleCrowdColors(nameItem, 10)).size === 1 && spectacleCrowdColors(nameItem, 10)[0] === nameItem.colors[0], true, "X: 名前コール（1人）：その人の色のペンライトの群れ");
  const or3 = { colors: ["#111111", "#222222", "#333333"] };
  assertEqual(spectacleCrowdColors(or3, 6), ["#111111", "#222222", "#333333", "#111111", "#222222", "#333333"], "X: 複数・or：それぞれの色のペンライトが混ざる");
  assertEqual(spectacleCrowdColors(plan.find((p) => p.key === "a"), 4), SP_VENUE_COLORS, "X: 名前でないコール：会場の色（ピンク・紫・青・オレンジ）");
  assertEqual(["#111111", "#222222", "#333333"].every((c) => spectacleRays(or3.colors).includes(c)), true, "X: 光線にも全員の色");
  if (typeof document === "undefined") return;
  // 部品：一組だけ・数を抑える・会場が出ている間だけ動かす・一時停止で消える
  const host = document.body.appendChild(document.createElement("div"));
  const sp = createSpectacle(host, { variant: "karaoke" });
  sp.setPlan(plan);
  assertEqual(host.querySelectorAll(".sp-crowd i").length, SP_CROWD_COUNT.karaoke, `X: カラオケのペンライトは ${SP_CROWD_COUNT.karaoke} 本だけ（【r9-fx】太く本物の長さにしたので 14 → 12）`);
  // 【r9-fx】ペンライトを持ち手・発光部・光の広がり・残像の 4 つの部品にし、スポットライト・光の玉・暗転を足した。文字・回数の印を除いた部品の数で見る
  const parts = [...host.querySelectorAll(".sp-front *")].filter((n) => !n.closest(".sp-word-text") && !n.closest(".sp-pips"));
  assertEqual(parts.length <= 90, true, `X: 前の層の部品は 90 個以下（iPhone で重くしない。いま ${parts.length}）`);
  sp.update(3, { playing: true, enabled: true });
  assertEqual(sp.layer.classList.contains("is-on"), false, "X: コールの無い間は、ペンライト・光線を動かさない");
  sp.update(23, { playing: true, enabled: true });
  const box = host.querySelector(".sp-box");
  assertEqual([sp.layer.classList.contains("is-on"), box.style.opacity, host.querySelector(".sp-word").style.opacity], [true, "1", "1"], "X: 長いコールの途中：会場と大きな文字が出ている");
  sp.update(23, { playing: false, enabled: true });
  assertEqual([sp.layer.classList.contains("is-paused"), box.style.opacity, host.querySelector(".sp-word").style.opacity], [true, "0", "0"], "X: 一時停止：残さない");
  sp.update(70, { playing: true, enabled: true });
  assertEqual([box.style.opacity, host.querySelector(".sp-word").style.opacity, sp.layer.classList.contains("is-on")], ["0", "0", false], "X: 曲の終わり：残さない");
  sp.update(30.5, { playing: true, enabled: true });
  const sticks = [...host.querySelectorAll(".sp-crowd i")].map((i) => i.style.getPropertyValue("--c"));
  assertEqual(sticks.every((c) => c === nameItem.colors[0]), true, "X: 画面でも、名前コールはその人の色のペンライト");
  sp.destroy();
  host.remove();
  // ライブコール：帯の位置（place）を受け取る・コールの間は 0.5 秒ごとに位置だけ測り直す（文字の大きさは変えない）
  const host2 = document.body.appendChild(document.createElement("div"));
  const asked = [];
  const sp2 = createSpectacle(host2, {
    variant: "live",
    follow: true,
    place: (item, { fit }) => {
      const h = fit(300, 200, 80);
      asked.push(item.key);
      return { y: 200 + asked.length, x: 10, w: 320, h: Math.max(120, h + 40) };
    },
  });
  sp2.setPlan(plan);
  assertEqual(host2.querySelectorAll(".sp-crowd i").length, SP_CROWD_COUNT.live, `X: ライブコールのペンライトは ${SP_CROWD_COUNT.live} 本だけ`);
  sp2.update(21, { playing: true, enabled: true });
  const fs1 = sp2.layer.style.getPropertyValue("--sp-fs");
  assertEqual([sp2.layer.style.getPropertyValue("--sp-bx"), sp2.layer.style.getPropertyValue("--sp-bw"), sp2.layer.style.getPropertyValue("--sp-y")], ["10px", "320px", "201px"], "X: ライブコール：帯の位置・幅を受け取る");
  sp2.update(21.1, { playing: true, enabled: true });
  assertEqual(asked.length, 1, "X: 位置は毎フレーム測らない");
  await sleep(SP_FOLLOW_SEC * 1000 + 60);
  sp2.update(21.7, { playing: true, enabled: true });
  assertEqual([asked.length, sp2.layer.style.getPropertyValue("--sp-y"), sp2.layer.style.getPropertyValue("--sp-fs"), sp2.layer.classList.contains("is-follow")], [2, "202px", fs1, true], "X: ライブコール：コールの間は 0.5 秒ごとに位置だけ測り直す（文字の大きさは同じ・なめらかに移る）");
  sp2.update(30.2, { playing: true, enabled: true });
  assertEqual([asked.length, sp2.layer.classList.contains("is-follow")], [3, false], "X: 次のコールは、その場所にすぐ出す");
  sp2.destroy();
  host2.remove();
  // ソース：ライブコールは follow・光っている行と札を避ける。CSS：動きは .is-on の間だけ・会場の部品にぼかしを使わない
  const live = await fetchText("js/liveCallScreen.js");
  assertEqual(/createSpectacle\(root, \{\s*variant: "live",\s*follow: true,/.test(live) && live.includes("chooseSpectacleY(region, avoid, h)"), true, "X: ライブコール：帯は光っているコールの行・いま／つぎの札を避ける（位置を測り直す）");
  const css = (await fetchText("css/callSpectacle.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  // 【r9-fx】ペンライトの振りは JS（いまの時刻から決まる penlightPoseAt）。会場が出ていて、音が進んでいる間だけ書く
  const spSrc = await fetchText("js/callSpectacle.js");
  // 【R12】本人の依頼でペンライトは固定（update でペンライトの向きを書かない）。光線の回転は会場が出ている間だけ
  const updateSrc = spSrc.slice(spSrc.indexOf("    update(t, {"), spSrc.indexOf("    destroy() {"));
  assertEqual(!/sticks\.forEach|\.stick\.style\.transform/.test(updateSrc) && /\.sp-layer\.is-on \.sp-rays \{\s*animation:/.test(css), true, "X: ペンライトは毎フレーム動かさない・光線の回転は会場が出ている間だけ");
  const boxCss = css.slice(css.indexOf(".sp-box {"), css.indexOf(".sp-wash {"));
  assertEqual(/filter\s*:/.test(boxCss), false, "X: 会場の部品にぼかし（filter）を使わない");
  assertEqual(/prefers-reduced-motion: reduce\) \{[^@]*\.sp-layer\.is-on \.sp-rays/.test(css), true, "X: 視差効果を減らす設定では、光線の回転も止める（ペンライトはいつも固定）");
}

export async function runLiveCallTypesetTests() {
  await runTypesetTests();
  runSpectaclePlanTests();
  runSpectacleTimingTests();
  runSpectacleDomTests();
  await runKaraokeSpectacleTests();
  runTapTests();
  runAuroraTests();
  await runSourceTests();
  await runReadabilityFixTests();
  await runBlastTests();
}
