// 「コールを覚える」の統合（2026-10-31 live-unify）のテスト。本物の歌詞・コールは使わない（ダミーの文字だけ）。
//   A. コール1件は1件のまま：どのモードでも、画面のコールの部品の数＝データのコールの数。文字列も1文字も変えない
//   B. 時刻は本人の開始・終了のまま（光る時間を延ばさない・開始を早めない）
//   C. 短いコールの3段階（0.3秒以下・0.5秒以下・それより長い）
//   D. 名前コールの見え方（1人・複数・or・なし。文字の装飾だけ。判定の結果が壊れていたら「なし」に倒す）
//   E. カラオケ：コール表示 ON／OFF（再生の位置・調整を変えない・保存する）・コールの無い曲・+54.5秒の直し
//   F. 演出 あり／なし の保存・ホームの入口が1つ・前の版を消さない（ソース確認）
import { assertEqual } from "./test-utils.js";
import { buildCallTextLayout } from "../js/callTextLayout.js";
import { renderCallTextView } from "../js/callTextView.js";
import { layoutCallsInOrder } from "../js/liveCallData.js";
import { classifyReleasedCalls } from "../js/liveCallData.js";
import { prepareVisual, visualStateAt, shortCallTier, classifyVisualKind, VISUAL_KINDS, VIS_FLASH_MAX_SEC, VIS_SHORT_MAX_SEC } from "../js/callEffects.js";
import { decorateCallSpan, applyVisualState } from "../js/callEffectsRenderer.js";
import { describeNameCall, normalizeNameCallResult, nameCallAccent, renderNameCallText, NAME_KINDS, NAME_CALL_SOURCE } from "../js/liveCallNames.js";
import {
  buildKaraokeCallPlacement,
  karaokeCallRowStateAt,
  karaokeCallTier,
  enableKaraokeStage,
  disableKaraokeStage,
  mountKaraokeCallRows,
  setKaraokeCallsVisible,
  updateKaraokeStage,
  isKaraokeOffsetSuspicious,
  KX_CALLS_VISIBLE_KEY,
  KX_OFFSET_WARN_MS,
} from "../js/karaokeStage.js";
import { applyNameCallDecoration, resolveLiveEffectsPref, LIVE_EFFECTS_LABELS } from "../js/liveCallScreen.js";
import { buildModeTabs, LIVE_CALL_MODE_TABS } from "../js/liveCallModeTabs.js";
import { MEMBERS } from "../js/data/members.js";
import { CALL_NAME_ENTRIES } from "../js/data/callNameDictionary.js";

const base = new URL("../", import.meta.url);
const fetchText = async (file) => (await fetch(new URL(file, base), { cache: "no-store" })).text();
const STD = { intensity: "std", reduced: false };

// ---- ダミーの歌詞・コール（本物ではない） ----
const LINES = [
  { line: 1, text: "ダミーの一行目", start: 10, end: 13 },
  { line: 2, text: "ダミーの二行目", start: 13.5, end: 16 },
  { line: 3, text: "ダミーの三行目", start: 16.5, end: 19 },
  { line: 4, text: "ダミーの四行目", start: 30, end: 33 },
];
// 開始の早い順（buildCallTextLayout の callIndex と同じ順）
const RAW_CALLS = [
  { text: "オイ！", start: 8, end: 8.2, type: "call" }, // 前奏・0.2秒＝瞬間
  { text: "ダミー！ ダミー！", start: 13.1, end: 13.5, type: "call" }, // 0.4秒＝短い
  { text: "ダミーのコール", start: 16.1, end: 17.3, type: "call" }, // ふつう
  { text: "ダミーの長いコール！\nダミーの長いコール！", start: 20, end: 28, type: "call" }, // 長い（間に歌詞が無い）
  { text: "おーはい！×４", start: 30.5, end: 36, type: "call" }, // 長いコールの間に歌詞の行が進む
];

function dummySheet() {
  const layout = buildCallTextLayout(LINES, RAW_CALLS);
  const calls = layoutCallsInOrder(layout).map((c) => ({ key: c.key, text: c.text, type: c.type, start: RAW_CALLS[c.callIndex].start, end: RAW_CALLS[c.callIndex].end }));
  return { layout, calls };
}

// 新しいカラオケの歌詞の部品（js/lyricsSync.js が描くのと同じ .synced-lyrics-line）を作る
function buildKaraokeDom() {
  const screen = document.createElement("section");
  screen.className = "screen";
  const panel = screen.appendChild(document.createElement("div"));
  LINES.forEach((line) => {
    const p = panel.appendChild(document.createElement("p"));
    p.className = "synced-lyrics-line";
    p.textContent = line.text;
  });
  const hudCard = screen.appendChild(document.createElement("div"));
  const hudText = hudCard.appendChild(document.createElement("p"));
  document.body.appendChild(screen);
  return { screen, panel, hudCard, hudText };
}

function runCountAndTextTests() {
  console.log("--- live-unify A：1件は1件のまま・文字を変えない ---");
  const { layout, calls } = dummySheet();
  assertEqual(calls.length, RAW_CALLS.length, "A: ダミーのコールは5件（並びに全部入る）");
  if (typeof document === "undefined") return;
  // コール表（js/callTextView.js）
  const sheetBox = document.createElement("div");
  renderCallTextView(sheetBox, layout, { showReview: false });
  assertEqual(sheetBox.querySelectorAll(".call-text-call").length, calls.length, "A: コール表：画面のコール＝データのコール");
  // ライブコール（コール表の部品＋演出の飾り＋名前の飾り）
  const liveBox = document.createElement("div");
  const spans = new Map();
  renderCallTextView(liveBox, layout, { showReview: false, unitHook: (node, unit) => unit.kind === "call" && spans.set(unit.call.key, node) });
  const preps = classifyReleasedCalls(calls, Object.fromEntries(calls.map((c) => [c.key, { type: "normal" }])));
  const fx = preps.map((prep) => {
    const span = spans.get(prep.key);
    prep.vis = prepareVisual(calls.find((c) => c.key === prep.key), { hasBreak: span.classList.contains("has-break") });
    const decorated = decorateCallSpan(span, prep);
    applyNameCallDecoration(span, prep.text);
    return decorated;
  });
  assertEqual(liveBox.querySelectorAll(".cx-call").length, calls.length, "A: ライブコール：画面のコール＝データのコール（区切って増やさない）");
  assertEqual([liveBox.querySelectorAll(".cx-seg").length, liveBox.querySelectorAll(".cx-badge").length], [0, 0], "A: ライブコール：区切り（1語ずつ）・札を作らない");
  assertEqual(calls.map((c) => spans.get(c.key).querySelector(".cx-text").textContent), calls.map((c) => c.text), "A: ライブコール：どのコールも文字は元のまま（改行・×４ も）");
  // 時刻を進めても、光るのは1件ずつ・部品の数は変わらない
  for (const t of [8.1, 13.2, 16.5, 25, 31, 34]) {
    fx.forEach((c) => applyVisualState(c, visualStateAt(c.prep.vis, t, STD), t));
  }
  assertEqual(liveBox.querySelectorAll(".cx-call").length, calls.length, "A: ライブコール：再生しても部品の数は変わらない");
  // カラオケ（コール表示 ON：歌詞の間の赤いコール）
  const dom = buildKaraokeDom();
  enableKaraokeStage({ screen: dom.screen, hudCard: dom.hudCard, lyricsPanel: dom.panel, hudText: dom.hudText }, { song: { id: "x" }, calls, lines: LINES, layout, callsVisible: true });
  const mounted = mountKaraokeCallRows();
  assertEqual([mounted, dom.panel.querySelectorAll(".kx-call").length], [calls.length, calls.length], "A: カラオケ：歌詞の間のコール＝データのコール");
  assertEqual(calls.map((c) => dom.panel.querySelector(`.kx-call[data-call-key="${CSS.escape(c.key)}"]`).textContent), calls.map((c) => c.text), "A: カラオケ：文字は元のまま");
  assertEqual(dom.panel.querySelectorAll(".synced-lyrics-line").length, LINES.length, "A: カラオケ：歌詞の行は増えも減りもしない（コールは別の行に置く）");
  for (const t of [8.1, 13.2, 16.5, 25, 31, 34]) updateKaraokeStage(t);
  assertEqual(dom.panel.querySelectorAll(".kx-call").length, calls.length, "A: カラオケ：再生しても部品の数は変わらない");
  disableKaraokeStage();
  assertEqual(dom.panel.querySelectorAll(".kx-call").length, 0, "A: カラオケ：閉じたら置いたコールを外す");
  dom.screen.remove();
}

function runPlacementTests() {
  console.log("--- live-unify A2：カラオケの赤いコールの並び（コール表に近い並び） ---");
  const { layout, calls } = dummySheet();
  const rows = buildKaraokeCallPlacement(layout, calls, LINES);
  const keysInRows = rows.flatMap((row) => row.keys);
  assertEqual([keysInRows.length, new Set(keysInRows).size], [calls.length, calls.length], "A2: どのコールもちょうど1回だけ入る");
  assertEqual(keysInRows, layoutCallsInOrder(layout).map((c) => c.key), "A2: 並びの順は、コール表の並び（上から）と同じ");
  assertEqual([rows[0].anchor, rows[0].place, rows[0].block], [0, "before", true], "A2: 前奏のコールは、最初の行の前に1行");
  // 並びが無い曲（コール表の並びを渡さない）でも、時刻で置いて1回ずつ
  const byTime = buildKaraokeCallPlacement(null, calls, LINES);
  assertEqual(byTime.flatMap((row) => row.keys).sort(), calls.map((c) => c.key).sort(), "A2: 並びが無くても、時刻で置いて1回ずつ");
  assertEqual(buildKaraokeCallPlacement(layout, [], LINES), [], "A2: コールが無い曲は何も置かない");
}

function runTimingTests() {
  console.log("--- live-unify B：時刻は本人の開始・終了のまま ---");
  const { calls } = dummySheet();
  const times = [];
  for (let t = 7; t <= 37; t += 0.05) times.push(Math.round(t * 1000) / 1000);
  let ok = true;
  for (const t of times) {
    const { lit } = karaokeCallRowStateAt(calls, t);
    for (const c of calls) if (lit.has(c.key) !== (c.start <= t && t < c.end)) ok = false;
  }
  assertEqual(ok, true, "B: カラオケの赤いコールが光るのは、開始 ≦ t ＜ 終了 のときだけ（0.05秒ごとに確かめた）");
  let liveOk = true;
  for (const c of calls) {
    const vis = prepareVisual(c);
    if (vis.start !== c.start || vis.end !== c.end) liveOk = false;
    for (const t of times) {
      const v = visualStateAt(vis, t, STD);
      const active = v.phase === "active";
      if (active !== (c.start <= t && t < c.end)) liveOk = false;
      if (!active && (v.plateO > 0 || v.flashO > 0 || v.glowO > 0)) liveOk = false;
    }
  }
  assertEqual(liveOk, true, "B: ライブコール：板・光・フラッシュは本人の開始〜終了の間だけ（前後に延ばさない・早めない）");
  const offState = visualStateAt(prepareVisual(calls[0]), 8.1, { intensity: "off" });
  assertEqual([offState.phase, offState.plateO], ["active", 1], "B: 演出なしでも、光る時間（コール全体の強調）は同じ");
  // 長いコールの間に歌詞が進む（おーはい！×４ のような）：光り続けるのは1件
  const long = calls.find((c) => c.text.startsWith("おーはい"));
  const during = [30.6, 32, 33.5, 35.9].map((t) => [...karaokeCallRowStateAt(calls, t).lit]);
  assertEqual(during.every((keys) => keys.length === 1 && keys[0] === long.key), true, "B: 長いコールの間に歌詞の行が進んでも、光っているのはそのコール1件だけ");
}

function runTierTests() {
  console.log("--- live-unify C：短いコールの3段階 ---");
  assertEqual([shortCallTier(0.1), shortCallTier(VIS_FLASH_MAX_SEC), shortCallTier(0.31), shortCallTier(VIS_SHORT_MAX_SEC), shortCallTier(0.51), shortCallTier(3)], ["flash", "flash", "short", "short", "normal", "normal"], "C: 0.3秒以下＝瞬間・0.5秒以下＝短い・それより長い＝ふつう");
  assertEqual([shortCallTier(Number.NaN), shortCallTier(undefined)], ["normal", "normal"], "C: 長さが読めないものはふつう（安全側）");
  assertEqual(classifyVisualKind({ start: 0, end: 0.2, hasBreak: true }), VISUAL_KINDS.LONG, "C: 改行のある塊は、短くても長いの扱い（膨らませない）");
  assertEqual([karaokeCallTier({ start: 1, end: 1.2 }), karaokeCallTier({ start: 1, end: 1.45 }), karaokeCallTier({ start: 1, end: 2 }), karaokeCallTier({ start: 1, end: 6 })], ["flash", "short", "normal", "long"], "C: カラオケの赤いコールも同じ3段階＋長い");
  // 続けて来る短いコールは混ざらない：前のコールの板は次のコールの開始までに消えている
  const a = prepareVisual({ key: "a", start: 5, end: 5.2 });
  const b = prepareVisual({ key: "b", start: 5.2, end: 5.45 });
  assertEqual([visualStateAt(a, 5.2, STD).plateO, visualStateAt(b, 5.2, STD).plateO, visualStateAt(a, 5.2, STD).flashO], [0, 1, 0], "C: 続けて来る短いコールは混ざらない（次が始まった瞬間、前の光・フラッシュは 0）");
}

function runNameTests() {
  console.log("--- live-unify D：名前コール ---");
  const [m1, m2] = MEMBERS;
  const c1 = m1.memberColor.hex;
  const c2 = m2.memberColor.hex;
  const single = normalizeNameCallResult("ダミー！", { kind: "single", parts: [{ text: "ダミー", memberId: m1.id }, { text: "！" }] });
  assertEqual([single.kind, single.members, single.parts[0].color, single.parts[1].color], ["single", [m1.id], c1, undefined], "D: 1人：名前の部分だけその人の色");
  const multi = normalizeNameCallResult("ダミーA！ダミーB！", { kind: "multi", parts: [{ text: "ダミーA", memberId: m1.id }, { text: "！" }, { text: "ダミーB", memberId: m2.id }, { text: "！" }] });
  assertEqual([multi.kind, multi.members], ["multi", [m1.id, m2.id]], "D: 複数：名前ごとにそれぞれの色");
  const accent = nameCallAccent(multi);
  assertEqual([accent.primary, accent.colors, accent.gradient.startsWith("linear-gradient(90deg")], [c1, [c1, c2], true], "D: 複数：枠の色は全員の色を横につないだもの（順番に光らせない）");
  const orResult = normalizeNameCallResult("ダミーA！ or ダミーB！", { kind: "or", parts: [{ text: "ダミーA！", memberId: m1.id }, { text: " or " }, { text: "ダミーB！", memberId: m2.id }] });
  assertEqual(orResult.kind, "or", "D: or：そのまま「or」（同時に叫ぶ扱いにしない）");
  assertEqual(normalizeNameCallResult("わーわー！", { kind: "none", parts: [{ text: "わーわー！" }] }).kind, NAME_KINDS.NONE, "D: 名前ではない言葉は通常");
  assertEqual(normalizeNameCallResult("ダミー！", { kind: "single", parts: [{ text: "ダミ", memberId: m1.id }] }).kind, NAME_KINDS.NONE, "D: つなげて元の文字列に戻らない結果は使わない（通常に倒す）");
  assertEqual(normalizeNameCallResult("ダミー！", { kind: "huh", parts: [{ text: "ダミー！" }] }).kind, NAME_KINDS.NONE, "D: 種類が分からない結果は使わない");
  assertEqual(normalizeNameCallResult("ダミー！", { kind: "single", parts: [{ text: "ダミー！", memberId: "no-such-member" }] }).kind, NAME_KINDS.NONE, "D: 色の分からない名前は通常");
  assertEqual(nameCallAccent(normalizeNameCallResult("x", null)), null, "D: なしのときは色を付けない");
  if (typeof document !== "undefined") {
    const box = document.createElement("span");
    const count = renderNameCallText(box, "ダミーA！ダミーB！", multi);
    assertEqual([count, box.textContent, [...box.querySelectorAll(".cx-name-part")].map((n) => n.style.getPropertyValue("--name-color"))], [2, "ダミーA！ダミーB！", [c1, c2]], "D: 描くと、名前ごとに色の付いた部品。文字はつなげると元のまま");
    const orBox = document.createElement("span");
    renderNameCallText(orBox, "ダミーA！ or ダミーB！", orResult);
    assertEqual([orBox.textContent, orBox.querySelectorAll(".cx-name-sep").length], ["ダミーA！ or ダミーB！", 1], "D: or：あいだの言葉に印（控えめに見せる）。文字は元のまま");
    const plain = document.createElement("span");
    renderNameCallText(plain, "オイ！", describeNameCall("オイ！"));
    assertEqual([plain.textContent, plain.children.length], ["オイ！", 0], "D: 名前でないコールは文字だけ（飾りなし）");
  }
  assertEqual(NAME_CALL_SOURCE, "callNameColors", "D: 判定は call-names の表（js/callNameColors.js）を使う");
  // 本物の判定で：名前の表にある書き方を2つ使った「or」と「並べて呼ぶ」（名前だけ。歌詞・コール本文ではない）
  const [e1, e2] = CALL_NAME_ENTRIES.filter((entry) => MEMBERS.some((m) => m.id === entry.memberId)).slice(0, 2);
  const nameA = e1.forms[0];
  const nameB = e2.forms[0];
  const orReal = describeNameCall(`${nameA}！ or ${nameB}！`);
  assertEqual([orReal.kind, orReal.members], ["or", [e1.memberId, e2.memberId]], "D: 本物の判定：「A！ or B！」は or（候補）");
  const multiReal = describeNameCall(`${nameA}！${nameB}！`);
  assertEqual([multiReal.kind, multiReal.members.length], ["multi", 2], "D: 本物の判定：2人を並べて呼ぶと multi");
  assertEqual(describeNameCall("わーわー！").kind, "none", "D: 本物の判定：名前ではない言葉は none");
  if (typeof document !== "undefined") {
    const box = document.createElement("span");
    renderNameCallText(box, `${nameA}！ or ${nameB}！`, orReal);
    assertEqual([box.textContent, [...box.querySelectorAll(".cx-name-sep")].map((n) => n.textContent), box.querySelectorAll(".cx-name-part").length], [`${nameA}！ or ${nameB}！`, ["or"], 2], "D: or：「or」の所だけ控えめに（「！」はそのまま）。名前は2つとも色");
  }
}

async function runKaraokeTests() {
  console.log("--- live-unify E：カラオケ（コール表示 ON／OFF・コールの無い曲・+54.5秒） ---");
  assertEqual([isKaraokeOffsetSuspicious(0), isKaraokeOffsetSuspicious(KX_OFFSET_WARN_MS), isKaraokeOffsetSuspicious(54500), isKaraokeOffsetSuspicious(-10100)], [false, false, true, true], "E: ±10秒を超える調整にだけ注意を出す（値は消さない）");
  const { followedAudioSeekTarget } = await import("../js/karaokeSyncScreen.js");
  assertEqual([followedAudioSeekTarget(56, 0, 200), followedAudioSeekTarget(56, 500, 200), followedAudioSeekTarget(0.2, 1000, 200), followedAudioSeekTarget(300, 0, 200)], [56, 55.5, 0, 200], "E: 新しいカラオケの行・コールのタップは、音源の位置だけを動かす（音源＝表示の位置 − 調整）");
  if (typeof document === "undefined") return;
  const { initKaraokeSyncScreen, openKaraokeSyncScreen, closeKaraokeSyncScreen } = await import("../js/karaokeSyncScreen.js");
  const { screen, els } = buildFullKaraokeScreen();
  initKaraokeSyncScreen(els);
  let saved = null;
  try {
    saved = localStorage.getItem(KX_CALLS_VISIBLE_KEY);
    localStorage.removeItem(KX_CALLS_VISIBLE_KEY);
  } catch {
    // 保存できない環境
  }
  const { calls, layout } = dummySheet();
  await openKaraokeSyncScreen("love", { calls, layout, hasAudio: false, availability: { sheet: { ok: true }, live: { ok: false, reason: "音源なし" }, karaoke: { ok: true } } });
  const toolbar = screen.querySelector(".kx-toolbar");
  const sw = screen.querySelector(".kx-calls-switch");
  assertEqual([Boolean(toolbar), sw?.textContent, sw?.getAttribute("aria-checked")], [true, "コール表示 ON", "true"], "E: 上に［コール表示 ON］（はじめは ON）");
  assertEqual([...toolbar.querySelectorAll(".lc-mode-tab")].map((b) => [b.textContent, b.disabled, b.getAttribute("aria-current")]), [["コール表", false, null], ["ライブコール", true, null], ["カラオケ", false, "page"]], "E: モードの切り替え：今はカラオケ・使えないモードは押せない");
  els.startButton.click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  els.offsetPlus05Button.click();
  els.pauseResumeButton.click(); // 一時停止して位置を止める
  const before = [els.offsetLabel.textContent, els.deviceAudio.currentTime, els.startPanel.hidden, els.syncPanel.hidden];
  const partsBefore = screen.querySelectorAll(".kx-call, .synced-lyrics-line").length;
  sw.click();
  const afterOff = [els.offsetLabel.textContent, els.deviceAudio.currentTime, els.startPanel.hidden, els.syncPanel.hidden];
  assertEqual([screen.classList.contains("kx-calls-off"), sw.textContent, sw.getAttribute("aria-checked")], [true, "コール表示 OFF", "false"], "E: 押すと OFF（赤いコール・NEXT CALL を隠す印）");
  assertEqual(afterOff, before, "E: OFF にしても再生の位置・調整・画面の状態は変わらない");
  let stored = null;
  try {
    stored = localStorage.getItem(KX_CALLS_VISIBLE_KEY);
  } catch {
    stored = "false";
  }
  assertEqual(stored, "false", "E: OFF はこの端末に保存する");
  sw.click();
  assertEqual([screen.classList.contains("kx-calls-off"), [els.offsetLabel.textContent, els.deviceAudio.currentTime, els.startPanel.hidden, els.syncPanel.hidden]], [false, before], "E: もう一度押すと ON。位置・調整はそのまま");
  assertEqual(screen.querySelectorAll(".kx-call, .synced-lyrics-line").length, partsBefore, "E: ON／OFF を切り替えても、歌詞・コールの部品は作り直さない（見た目のクラスだけ）");
  // 開き直すと保存した値を使う
  sw.click();
  await openKaraokeSyncScreen("love", { calls, layout, hasAudio: false });
  assertEqual([screen.classList.contains("kx-calls-off"), screen.querySelector(".kx-calls-switch")?.textContent], [true, "コール表示 OFF"], "E: 開き直しても OFF のまま（保存した値）");
  screen.querySelector(".kx-calls-switch").click();
  // コールの無い曲：始められる。歌詞だけのカラオケ（OFF と同じ）
  await openKaraokeSyncScreen("love", { calls: [], layout: null, hasAudio: false });
  const noCallSwitch = screen.querySelector(".kx-calls-switch");
  assertEqual([els.startPanel.hidden, els.noCallsNotice.hidden, screen.classList.contains("kx-calls-off"), screen.classList.contains("kx-no-calls")], [false, true, true, true], "E: コールの無い曲：エラーにせず始められる（歌詞だけ＝OFF と同じ動き）");
  assertEqual([noCallSwitch.disabled, noCallSwitch.textContent], [true, "コール表なし"], "E: コールの無い曲：切り替えは押せず「コール表なし」");
  assertEqual(screen.querySelector(".kx-no-calls-note")?.hidden, false, "E: コールの無い曲：始める前に「歌詞だけで表示します」");
  // 前のカラオケ同期（options.calls なし）：コールの無い曲は今までどおり案内（部品は作らない）
  await openKaraokeSyncScreen("no-such-song-id-for-test");
  await openKaraokeSyncScreen("love");
  assertEqual([screen.querySelectorAll(".kx-toolbar, .kx-call, .kx-seek-row, .kx-offset-warning, .kx-no-calls-note").length, els.noCallsNotice.hidden], [0, false], "E: 前のカラオケ同期：新しい部品は作らない・コールの無い曲は今までどおりの案内");
  closeKaraokeSyncScreen();
  screen.remove();
  try {
    if (saved === null) localStorage.removeItem(KX_CALLS_VISIBLE_KEY);
    else localStorage.setItem(KX_CALLS_VISIBLE_KEY, saved);
  } catch {
    // 保存できない環境
  }
}

// 本物の画面に近い形（上の帯・下の帯の中にボタン）でカラオケの部品を作る（新しいカラオケの部品を置く場所があるように）
function buildFullKaraokeScreen() {
  const screen = document.createElement("section");
  screen.className = "screen";
  const header = screen.appendChild(document.createElement("div"));
  header.className = "karaoke-header-zone";
  const middle = screen.appendChild(document.createElement("div"));
  const footer = screen.appendChild(document.createElement("div"));
  const make = (parent, tag = "div", className = "") => {
    const node = parent.appendChild(document.createElement(tag));
    if (className) node.className = className;
    return node;
  };
  const startPanel = make(middle);
  const syncPanel = make(middle);
  const callHudCard = make(syncPanel);
  const els = {
    songTitle: make(header, "h2"),
    noCallsNotice: make(middle, "p"),
    moreMenuButton: make(header, "button"),
    startPanel,
    startButton: make(startPanel, "button"),
    deviceAudioNotice: make(syncPanel, "p"),
    syncPanel,
    lyricsContextPanel: make(syncPanel),
    callHudCard,
    callHudEyebrow: make(callHudCard, "p"),
    callHudText: make(callHudCard, "p"),
    callHudCountdown: make(callHudCard, "p"),
    callHudPreviewRow: make(callHudCard, "p"),
    callHudPreviewItem1: make(callHudCard, "span"),
    callHudPreviewItem2: make(callHudCard, "span"),
    songEndBanner: make(syncPanel),
    songEndRestartButton: make(syncPanel, "button"),
    songEndChooseButton: make(syncPanel, "button"),
    deviceAudio: make(screen, "audio"),
    footerZone: footer,
    toast: make(footer, "p"),
    pauseResumeButton: make(footer, "button"),
    pauseResumeLabel: make(footer, "span"),
    offsetMinus05Button: make(footer, "button"),
    offsetMinus01Button: make(footer, "button"),
    offsetResetButton: make(footer, "button"),
    offsetPlus01Button: make(footer, "button"),
    offsetPlus05Button: make(footer, "button"),
    offsetLabel: make(footer, "span"),
    moreMenuModal: make(screen),
    moreMenuCloseButton: make(screen, "button"),
    nowButton: make(screen, "button"),
    syncPointLabel: make(screen, "span"),
    beginnerNavToggleButton: make(screen, "button"),
    beginnerNavToggleLabel: make(screen, "span"),
    restartSongButton: make(screen, "button"),
  };
  make(startPanel, "p", "karaoke-start-instruction").textContent = "ダミーの案内";
  make(startPanel, "p", "karaoke-start-note").textContent = "ダミーの注意";
  document.body.appendChild(screen);
  return { screen, els };
}

async function runSourceTests() {
  console.log("--- live-unify F：演出の保存・入口・前の版を残す（ソース確認） ---");
  assertEqual([resolveLiveEffectsPref(null), resolveLiveEffectsPref({ intensity: "std" }), resolveLiveEffectsPref({ intensity: "low" }), resolveLiveEffectsPref({ intensity: "off" }), resolveLiveEffectsPref({ effects: "off", intensity: "std" }), resolveLiveEffectsPref({ effects: "on", intensity: "off" })], ["on", "on", "on", "off", "off", "on"], "F: 演出 あり／なし：保存した値を使う。前の版の「オフ」は「なし」として引き継ぐ");
  assertEqual(LIVE_EFFECTS_LABELS, { on: "演出 あり", off: "演出 なし" }, "F: 切り替えの名前");
  assertEqual(LIVE_CALL_MODE_TABS.map((tab) => tab.label), ["コール表", "ライブコール", "カラオケ"], "F: 3つのモードの切り替えの名前");
  if (typeof document !== "undefined") {
    const picked = [];
    const nav = buildModeTabs("live", { sheet: { ok: true }, live: { ok: true }, karaoke: { ok: false, reason: "歌詞なし" } }, (mode) => picked.push(mode));
    nav.querySelectorAll("button").forEach((button) => button.click());
    assertEqual([picked, nav.querySelector(".is-karaoke").title], [["sheet"], "歌詞なし"], "F: 今のモード・使えないモードは押しても何もしない（理由は title に）");
  }
  const [screenJs, main, html, kScreen, liveCss, kCss, sw, tests] = await Promise.all(["js/liveCallScreen.js", "js/main.js", "index.html", "js/karaokeSyncScreen.js", "css/liveCall.css", "css/karaokeStage.css", "sw.js", "tests.html"].map(fetchText));
  assertEqual(/function setLiveEffects\(value, \{ save = true \} = \{\}\) \{[\s\S]{0,200}if \(save\) savePrefs\(\);/.test(screenJs), true, "F: 演出 あり／なし は押すたびに保存する");
  assertEqual(/intensity: prefs\.effects === "off" \? "off" : "std"/.test(screenJs), true, "F: 演出なし＝見た目の計算の「off」（板だけ）・ありは「標準」");
  assertEqual(screenJs.includes('"lc-select-label", "演出 "'), false, "F: 3段階（標準・控えめ・オフ）の選択は無くした（あり／なしの2つ）");
  // ホームの入口は「コールを覚える」の1つ。前の版の画面・保存データは残す
  assertEqual((html.match(/data-home-action="learn-calls"/g) ?? []).length, 2, "F: ホームの「コールを覚える」はゲーム欄とライブ欄の2か所（同じ行き先）");
  assertEqual(/data-home-action="live-call-(classic|sheet|live|karaoke)"/.test(html), false, "F: ホームに前の版・おためし版の入口は無い");
  assertEqual(["live-call-mode-list-screen", "live-call-mode-player-screen", "live-call-mode-karaoke-screen", "live-call-mode-play-type-screen"].every((id) => html.includes(`id="${id}"`)), true, "F: 前の版の画面（曲一覧・同期モード・カラオケ同期）は消していない");
  assertEqual(main.includes("openClassic: () => openClassicLiveCallMode()") && screenJs.includes('"今までの版を開く"'), true, "F: 前の版は新しい一覧のいちばん下の［今までの版を開く］から開ける");
  // +54.5秒の直し：新しいカラオケで音源が鳴っているときは、行のタップ・「今！」で調整の値を変えない
  const lyricTap = kScreen.slice(kScreen.indexOf("function handleLyricTapSeek("), kScreen.indexOf("function handleLyricTapSeek(") + 600);
  assertEqual(lyricTap.indexOf("isFollowingDeviceAudio()") > -1 && lyricTap.indexOf("isFollowingDeviceAudio()") < lyricTap.indexOf("resyncToPosition("), true, "F: 歌詞の行のタップ：新しいカラオケ（音源が時計）では、調整を引き直さず音源の位置だけ動かす");
  const nowTap = kScreen.slice(kScreen.indexOf("function handleResyncButtonClick("), kScreen.indexOf("function handleResyncButtonClick(") + 900);
  assertEqual(nowTap.indexOf("isFollowingDeviceAudio()") > -1 && nowTap.indexOf("isFollowingDeviceAudio()") < nowTap.indexOf("resyncToPosition("), true, "F: 「今！」：同じく、新しいカラオケでは音源の位置だけ動かす");
  assertEqual(/followDeviceAudio && syncState\.isSyncing && hasDeviceAudioLoaded\(\)/.test(kScreen), true, "F: 前のカラオケ同期（音源なし・外のカラオケに合わせる）は今までどおり調整を引き直す");
  // CSS：新しいカラオケの見た目は全部 .kx-on の中。ライブコールの新しい見た目は .lc-* / .lc-stage の中
  assertEqual(/kx-calls-off \.karaoke-call-hud-card/.test(kCss) && /kx-calls-off \.kx-call-row/.test(kCss), true, "F: コール表示 OFF：赤いコール・NEXT CALL のカードを隠す");
  assertEqual(/@media \(prefers-reduced-motion: reduce\)[\s\S]*kx-call\.is-lit\.kx-t-flash/.test(kCss) && /\.kx-paused \.kx-call \{\s*animation-play-state: paused;/.test(kCss), true, "F: 赤いコールの弾み：視差効果を減らす設定・一時停止中は止める");
  assertEqual(liveCss.includes(".lc-stage .cx-flash") && liveCss.includes(".lc-stage.intensity-off .cx-flash"), true, "F: 瞬間のフラッシュ（演出なしでは出さない）");
  assertEqual(sw.includes('"./js/liveCallNames.js"') && sw.includes('"./js/liveCallModeTabs.js"'), true, "F: 新しいファイルを APP_SHELL に入れた");
  assertEqual(tests.includes("runLiveCallUnifyTests"), true, "F: tests.html に登録");
  const namesJs = await fetchText("js/liveCallNames.js");
  assertEqual(/\(\?<[!=]/.test(namesJs.replace(/\/\/.*$/gm, "")), false, "F: 後読みの正規表現を使わない（古い iPhone の Safari で読み込めずアプリが止まるため）");
  if (typeof document !== "undefined") {
    const box = document.createElement("span");
    renderNameCallText(box, "ダミーA！ or Forever！", { kind: "or", parts: [{ text: "ダミーA！", memberId: MEMBERS[0].id, color: "#000000" }, { text: " or Forever！" }], members: [MEMBERS[0].id] });
    assertEqual([...box.querySelectorAll(".cx-name-sep")].map((n) => n.textContent), ["or"], "F: 英単語の中の「or」（Forever）には印を付けない");
  }
}

export async function runLiveCallUnifyTests() {
  runCountAndTextTests();
  runPlacementTests();
  runTimingTests();
  runTierTests();
  runNameTests();
  await runKaraokeTests();
  await runSourceTests();
}
