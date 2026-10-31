// nx-live（2026-11-01）のテスト。本物の歌詞・コールは使わない（ダミーの文字だけ）。
//   A. 曲のページのカードの見本：コール表は静止画、ライブコール・カラオケは静止画＋数秒の無音ループ（見えている間だけ再生・視差効果を減らす設定では動かさない）
//   B. Overture（歌詞の無い曲）のカラオケ：コールだけ（歌詞なし・コールのみ）。ライブコールと同じコールのデータ・時刻。歌詞は作らない
//   C. 前のまま：歌詞のある曲のカラオケ・コール表示 ON／OFF・歌詞が端末に無いだけの曲
import { assertEqual } from "./test-utils.js";
import { buildCallTextLayout } from "../js/callTextLayout.js";
import { layoutCallsInOrder, computeModeAvailability, SHEET_STATE, KARAOKE_CALLS_ONLY_CARD_NOTE } from "../js/liveCallData.js";
import { previewMotionAllowed, shouldPlayPreview, mountModePreview } from "../js/liveCallPreviewMotion.js";
import { LIVE_CALL_MODE_PREVIEWS, PREVIEW_IMAGE_SIZE, songPageGuidance } from "../js/liveCallScreen.js";
import {
  enableKaraokeStage,
  disableKaraokeStage,
  mountKaraokeCallRows,
  setKaraokeCallsVisible,
  areKaraokeCallsVisible,
  updateKaraokeStage,
  isKaraokeCallsOnly,
  buildKaraokeCallsOnlyRows,
  karaokeCallsOnlyFocusKey,
  KX_CALLS_ONLY_LABEL,
  KX_CALLS_ONLY_NOTE,
} from "../js/karaokeStage.js";

const base = new URL("../", import.meta.url);
const fetchText = async (file) => (await fetch(new URL(file, base), { cache: "no-store" })).text();

// ---- ダミーの「歌詞の無い曲」のコール（すべて前奏＝本物の Overture のコール表と同じ形。文字はダミー） ----
const NO_LYRICS_RAW = [
  { text: "Hey！", start: 4, end: 4.3, type: "call" },
  { text: "オイ！ オイ！", start: 6, end: 9.5, type: "call" },
  { text: "ダミーの長いコール！\nダミーの長いコール！", start: 15, end: 21, type: "call" },
  { text: "せーの！", start: 20.5, end: 21.5, type: "call" }, // 前のコールと重なる（本人の時刻のまま）
];
function noLyricsSheet() {
  const layout = buildCallTextLayout([], NO_LYRICS_RAW);
  const calls = layoutCallsInOrder(layout).map((c) => ({ key: c.key, text: c.text, type: c.type, start: NO_LYRICS_RAW[c.callIndex].start, end: NO_LYRICS_RAW[c.callIndex].end }));
  return { layout, calls };
}

// 偽の窓（IntersectionObserver・matchMedia を自分で動かす）
function fakeWindow({ reduced = false } = {}) {
  const observers = [];
  const listeners = [];
  const mq = {
    matches: reduced,
    addEventListener: (type, fn) => listeners.push(fn),
    removeEventListener: (type, fn) => listeners.splice(listeners.indexOf(fn), 1),
  };
  class IO {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(target) {
      this.targets.push(target);
    }
    disconnect() {
      this.disconnected = true;
    }
    fire(visible) {
      this.callback(this.targets.map((target) => ({ target, isIntersecting: visible, intersectionRatio: visible ? 1 : 0 })));
    }
  }
  return {
    win: { IntersectionObserver: IO, matchMedia: () => mq, navigator: {} },
    observers,
    setReduced(value) {
      mq.matches = value;
      listeners.forEach((fn) => fn());
    },
  };
}

async function runPreviewTests() {
  console.log("--- nx-live A：カードの見本（静止画・動く見本） ---");
  assertEqual(previewMotionAllowed({}), true, "A: ふつうは動かしてよい");
  assertEqual([previewMotionAllowed({ reducedMotion: true }), previewMotionAllowed({ saveData: true })], [false, false], "A: 視差効果を減らす・データ節約では動かさない");
  assertEqual(
    [
      shouldPlayPreview({ allowed: true, visible: true }),
      shouldPlayPreview({ allowed: true, visible: false }),
      shouldPlayPreview({ allowed: true, visible: true, pageHidden: true }),
      shouldPlayPreview({ allowed: false, visible: true }),
    ],
    [true, false, false, false],
    "A: 再生するのは「見えている・表に出ている・動かしてよい」ときだけ",
  );
  assertEqual(Boolean(LIVE_CALL_MODE_PREVIEWS.sheet.video), false, "A: コール表は静止画（黒い歌詞と赤いコールが1枚で読める）");
  assertEqual(["live", "karaoke"].map((id) => LIVE_CALL_MODE_PREVIEWS[id].video), ["./assets/images/live-call-previews/live.mp4", "./assets/images/live-call-previews/karaoke.mp4"], "A: ライブコール・カラオケは動く見本（mp4）");
  assertEqual(["sheet", "live", "karaoke"].every((id) => LIVE_CALL_MODE_PREVIEWS[id].alt.includes("ダミー")), true, "A: 代わりの文字に「文字はダミー」");
  assertEqual(PREVIEW_IMAGE_SIZE.width / PREVIEW_IMAGE_SIZE.height, 1.5, "A: 見本は 3:2");
  const sw = await fetchText("sw.js");
  assertEqual(["live", "karaoke"].map((id) => sw.includes(LIVE_CALL_MODE_PREVIEWS[id].video)), [false, false], "A: mp4 は APP_SHELL に入れない（Safari の範囲つきの読み込みに、キャッシュの全体の応答を返さない）");
  assertEqual(["sheet", "live", "karaoke"].map((id) => sw.includes(`"${LIVE_CALL_MODE_PREVIEWS[id].src}"`)), [true, true, true], "A: 静止画は APP_SHELL（オフラインでも見本が出る）");
  const sizes = await Promise.all(
    ["live", "karaoke"].map(async (id) => {
      const res = await fetch(new URL(LIVE_CALL_MODE_PREVIEWS[id].video, base), { cache: "no-store" });
      return res.ok ? (await res.blob()).size : -1;
    }),
  );
  assertEqual(sizes.map((size) => size > 0 && size <= 300 * 1024), [true, true], "A: 動く見本のファイルがあり、どれも 300KB 以下");
  if (typeof document === "undefined") return;

  // 静止画だけ（コール表）
  const sheetBox = document.body.appendChild(document.createElement("div"));
  const fake0 = fakeWindow();
  mountModePreview(sheetBox, LIVE_CALL_MODE_PREVIEWS.sheet, PREVIEW_IMAGE_SIZE, { win: fake0.win }).destroy();
  assertEqual([sheetBox.querySelectorAll("img").length, sheetBox.querySelectorAll("video").length, fake0.observers.length], [1, 0, 0], "A: コール表は静止画1枚（見張りも作らない）");
  sheetBox.remove();

  // 動く見本：見えるまで動画を作らない → 見えたら再生 → 見えなくなったら止める → 片付け
  const box = document.body.appendChild(document.createElement("div"));
  const fake = fakeWindow();
  const preview = { ...LIVE_CALL_MODE_PREVIEWS.live, video: "./assets/images/live-call-previews/live.mp4" };
  const handle = mountModePreview(box, preview, PREVIEW_IMAGE_SIZE, { win: fake.win });
  const img = box.querySelector("img");
  assertEqual([img.getAttribute("src"), img.alt, box.classList.contains("has-motion"), box.querySelectorAll("video").length], [preview.src, preview.alt, true, 0], "A: 最初は静止画だけ（見える前は動画を読み込まない）");
  fake.observers[0].fire(true);
  const video = box.querySelector("video");
  assertEqual(
    [Boolean(video), video?.muted, video?.hasAttribute("muted"), video?.playsInline, video?.hasAttribute("playsinline"), video?.loop, video?.preload, video?.autoplay, video?.getAttribute("aria-hidden"), video?.paused],
    [true, true, true, true, true, true, "none", false, "true", false],
    "A: 見えたら動画を作って再生（muted・playsinline・loop・自動再生の属性は使わず自分で play・読み上げは静止画の alt だけ）",
  );
  assertEqual(box.classList.contains("is-playing"), false, "A: 実際に再生が始まる（playing）までは静止画を見せる");
  fake.observers[0].fire(false);
  assertEqual(video.paused, true, "A: 見えなくなったら止める");
  fake.observers[0].fire(true);
  assertEqual(video.paused, false, "A: また見えたら続きから");
  fake.setReduced(true);
  assertEqual([video.paused, box.classList.contains("is-playing")], [true, false], "A: 視差効果を減らす設定に変わったら止めて静止画へ");
  fake.setReduced(false);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
  assertEqual(video.paused, true, "A: ページが裏に回っている間は再生しない");
  delete document.hidden;
  handle.destroy();
  assertEqual([box.querySelectorAll("video").length, fake.observers[0].disconnected, video.paused], [0, true, true], "A: 片付けると動画を外し、見張りも止める");
  box.remove();

  // 視差効果を減らす設定：見えても動画を作らない
  const box2 = document.body.appendChild(document.createElement("div"));
  const fake2 = fakeWindow({ reduced: true });
  const handle2 = mountModePreview(box2, preview, PREVIEW_IMAGE_SIZE, { win: fake2.win });
  fake2.observers[0].fire(true);
  assertEqual([box2.querySelectorAll("img").length, box2.querySelectorAll("video").length], [1, 0], "A: 視差効果を減らす設定では、静止画だけ（動画を作らない）");
  handle2.destroy();
  box2.remove();

  // 使えないモードのカード（video: null）：静止画だけ
  const box3 = document.body.appendChild(document.createElement("div"));
  const fake3 = fakeWindow();
  mountModePreview(box3, { ...preview, video: null }, PREVIEW_IMAGE_SIZE, { win: fake3.win });
  assertEqual([box3.classList.contains("has-motion"), fake3.observers.length], [false, 0], "A: 使えないモードのカードは動かさない");
  box3.remove();

  // ソース：カードは片付けを必ず呼ぶ・CSS は視差効果を減らす設定で動画を出さない
  const [screen, css] = await Promise.all([fetchText("js/liveCallScreen.js"), fetchText("css/liveCall.css")]);
  assertEqual(/function show\(next\) \{[\s\S]{0,200}destroyModePreviews\(\);/.test(screen), true, "A: 画面を作り直すとき、見本の見張り・動画を片付ける");
  assertEqual(/@media \(prefers-reduced-motion: reduce\) \{\s*\.lc-mode-preview-video \{\s*display: none;/.test(css), true, "A: 視差効果を減らす設定では、CSS でも動画を出さない");
  assertEqual(/\.lc-mode-preview \{[^}]*aspect-ratio: 3 \/ 2;/.test(css), true, "A: 見本の枠は 3:2（画像が届く前も高さが決まっていて、画面が跳ねない）");
}

function buildKaraokeDom({ withLines = false } = {}) {
  const screen = document.createElement("section");
  screen.className = "screen";
  const panel = screen.appendChild(document.createElement("div"));
  panel.style.cssText = "height: 120px; overflow: auto;";
  panel.hidden = true; // 歌詞が無い曲では、js/lyricsSync.js が何も描かず隠れたまま
  if (withLines) {
    panel.hidden = false;
    ["ダミーの一行目", "ダミーの二行目"].forEach((text) => {
      const p = panel.appendChild(document.createElement("p"));
      p.className = "synced-lyrics-line";
      p.textContent = text;
    });
  }
  const hudCard = screen.appendChild(document.createElement("div"));
  const hudText = hudCard.appendChild(document.createElement("p"));
  document.body.appendChild(screen);
  return { screen, panel, hudCard, hudText };
}

function runCallsOnlyTests() {
  console.log("--- nx-live B：歌詞の無い曲のカラオケ（歌詞なし・コールのみ） ---");
  const { layout, calls } = noLyricsSheet();
  const sheet = { ok: true, state: SHEET_STATE.READY, calls, layout };
  // 使えるか
  const withAudio = computeModeAvailability({ sheet, hasAudio: true, lyricsRecord: { lines: [] } });
  assertEqual([withAudio.karaoke.ok, withAudio.karaoke.callsOnly, withAudio.karaoke.note], [true, true, KARAOKE_CALLS_ONLY_CARD_NOTE], "B: 歌詞の無い曲（コール表が歌詞0行）でも、カラオケはコールだけで使える");
  assertEqual(KARAOKE_CALLS_ONLY_CARD_NOTE.startsWith("歌詞なし・コールのみ"), true, "B: カードに「歌詞なし・コールのみ」");
  const noAudio = computeModeAvailability({ sheet, hasAudio: false, lyricsRecord: null });
  assertEqual([noAudio.karaoke.ok, noAudio.karaoke.callsOnly, noAudio.karaoke.note.includes("［曲スタート］")], [true, true, true], "B: 音源が無ければ［曲スタート］で合わせる（前のカラオケと同じ）");
  assertEqual([withAudio.sheet.ok, withAudio.live.ok], [true, true], "B: コール表・ライブコールは今までどおり");
  // 歌詞が端末に無いだけの曲（コール表が ok にならない）は、今までどおり使えない（コールだけのカラオケにしない）
  const missing = computeModeAvailability({ sheet: { ok: false, state: SHEET_STATE.LYRICS_MISSING, message: "歌詞が無い", calls: [] }, hasAudio: true, lyricsRecord: { lines: [] } });
  assertEqual([missing.karaoke.ok, Boolean(missing.karaoke.callsOnly)], [false, false], "C: 歌詞が端末に無いだけの曲は、今までどおり使えない（歌詞を作らない・コールだけにしない）");
  const noSheetNoLyrics = computeModeAvailability({ sheet: { ok: false, state: SHEET_STATE.NO_SHEET, calls: [] }, hasAudio: true, lyricsRecord: null });
  assertEqual(noSheetNoLyrics.karaoke.ok, false, "C: コール表も歌詞も無い曲は使えない");
  const lyricsSong = computeModeAvailability({ sheet, hasAudio: true, lyricsRecord: { lines: [{ line: 1, text: "ダミー", start: 1, end: 2 }] } });
  assertEqual([lyricsSong.karaoke.ok, Boolean(lyricsSong.karaoke.callsOnly)], [true, false], "C: 歌詞のある曲は、今までどおり歌詞のカラオケ");
  // 曲のページの案内：歌詞の無い曲に「データを追加」を出さない
  const guide = songPageGuidance({ sheetOk: true, sheetState: SHEET_STATE.READY, sheetMessage: "", releasedCount: 46, hasAudio: true, lineCount: 0 });
  assertEqual(guide.showDataButton, false, "B: 歌詞の無い曲に、歌詞を入れる案内（データを追加）を出さない");
  assertEqual(songPageGuidance({ sheetOk: false, sheetState: SHEET_STATE.LYRICS_MISSING, sheetMessage: "x", releasedCount: 46, hasAudio: true, lineCount: 0 }).showDataButton, true, "C: 歌詞が端末に無い曲には、今までどおり出す");

  // 並び：コール表の並びの順に1件ずつ。全件ちょうど1回
  const rows = buildKaraokeCallsOnlyRows(layout, calls);
  assertEqual(rows.map((row) => row.keys), calls.map((c) => [c.key]), "B: 並びはコール表の順・コール1件＝1行");
  assertEqual(buildKaraokeCallsOnlyRows(null, [...calls].reverse()).map((row) => row.keys[0]), [...calls].sort((a, b) => a.start - b.start).map((c) => c.key), "B: 並びが無いときは時刻の順（どのコールも1回だけ）");
  // 真ん中に置くコール：光っている → 次 → 最後
  assertEqual(
    [karaokeCallsOnlyFocusKey(rows, calls, 1), karaokeCallsOnlyFocusKey(rows, calls, 4.1), karaokeCallsOnlyFocusKey(rows, calls, 12), karaokeCallsOnlyFocusKey(rows, calls, 20.7), karaokeCallsOnlyFocusKey(rows, calls, 99)],
    [calls[0].key, calls[0].key, calls[2].key, calls[2].key, calls[3].key],
    "B: 枠の真ん中には、光っているコール（無ければ次・曲の終わりは最後）",
  );
  if (typeof document === "undefined") return;

  // 画面：歌詞の枠にコールだけを並べる・文字は元のまま・時刻は本人の開始〜終了
  const dom = buildKaraokeDom();
  enableKaraokeStage({ screen: dom.screen, hudCard: dom.hudCard, lyricsPanel: dom.panel, hudText: dom.hudText }, { song: { id: "overture" }, calls, lines: [], layout, callsVisible: false, callsOnly: true });

  assertEqual([isKaraokeCallsOnly(), dom.screen.classList.contains("kx-calls-only"), areKaraokeCallsVisible()], [true, true, true], "B: コールだけのカラオケ（保存が OFF でも、コールは出す）");
  const mounted = mountKaraokeCallRows();
  assertEqual([mounted, dom.panel.querySelectorAll(".kx-call").length, dom.panel.querySelectorAll(".kx-call-row.is-calls-only").length], [calls.length, calls.length, calls.length], "B: コールの部品＝データのコール（1件ずつ1行）");
  assertEqual(calls.map((c) => dom.panel.querySelector(`.kx-call[data-call-key="${CSS.escape(c.key)}"]`).textContent), calls.map((c) => c.text), "B: 文字は元のまま（改行も）");
  assertEqual([dom.panel.querySelectorAll(".synced-lyrics-line").length, dom.panel.hidden, dom.panel.querySelector(".kx-calls-only-label")?.textContent], [0, false, KX_CALLS_ONLY_LABEL], "B: 歌詞は作らない・枠を出して「歌詞なし・コールのみ」の札");
  assertEqual(setKaraokeCallsVisible(false), true, "B: コール表示 OFF にはできない（何も出なくなるため）");
  const litAt = (t) => {
    updateKaraokeStage(t, { playing: false });
    return [...dom.panel.querySelectorAll(".kx-call.is-lit")].map((n) => n.dataset.callKey);
  };
  const wrong = [];
  for (let i = 0; i <= 500; i++) {
    const t = Math.round(i * 5) / 100;
    const want = calls.filter((c) => c.start <= t && t < c.end).map((c) => c.key);
    const got = litAt(t);
    if (JSON.stringify(got.sort()) !== JSON.stringify(want.sort())) wrong.push(t);
  }
  assertEqual(wrong, [], "B: 0.05秒ごと：光るのは本人の「開始 ≦ t ＜ 終了」のコールだけ（重なりも本人の時刻のまま）");
  updateKaraokeStage(3, { playing: false });
  assertEqual([...dom.panel.querySelectorAll(".kx-call.is-next")].map((n) => n.dataset.callKey), [calls[0].key], "B: 次のコールは枠でうっすら");
  disableKaraokeStage();
  assertEqual([dom.panel.querySelectorAll(".kx-call, .kx-calls-only-label").length, dom.panel.hidden, dom.screen.classList.contains("kx-calls-only")], [0, true, false], "B: 閉じたら元に戻す（枠は隠れる・札も外す）");
  dom.screen.remove();

  // 前のまま：歌詞のある曲は、歌詞の間の赤いコール（コールだけにしない）
  const dom2 = buildKaraokeDom({ withLines: true });
  const lines = [
    { line: 1, start: 1, end: 3 },
    { line: 2, start: 30, end: 32 },
  ];
  enableKaraokeStage({ screen: dom2.screen, hudCard: dom2.hudCard, lyricsPanel: dom2.panel, hudText: dom2.hudText }, { song: { id: "x" }, calls, lines, layout: null, callsVisible: false, callsOnly: true });
  assertEqual([isKaraokeCallsOnly(), areKaraokeCallsVisible(), dom2.screen.classList.contains("kx-calls-off")], [false, false, true], "C: 歌詞のある曲は、コール表示 OFF のまま（今までどおり）");
  mountKaraokeCallRows();
  assertEqual([dom2.panel.querySelectorAll(".kx-calls-only-label").length, dom2.panel.querySelectorAll(".is-calls-only").length], [0, 0], "C: 歌詞のある曲に「コールのみ」の札は出ない");
  disableKaraokeStage();
  assertEqual(dom2.panel.hidden, false, "C: 歌詞のある曲の枠は隠さない");
  dom2.screen.remove();

  // 歌詞が読めなかっただけ（呼ぶ側が callsOnly を渡さない）：コールだけにしない（前の決まりのまま。コールの演出だけで続ける）
  const dom3 = buildKaraokeDom();
  enableKaraokeStage({ screen: dom3.screen, hudCard: dom3.hudCard, lyricsPanel: dom3.panel, hudText: dom3.hudText }, { song: { id: "x" }, calls, lines: [], layout, callsVisible: false });
  assertEqual([isKaraokeCallsOnly(), areKaraokeCallsVisible(), mountKaraokeCallRows(), dom3.panel.hidden], [false, false, 0, true], "C: 呼ぶ側が「コールだけ」と言わなければ、今までどおり（OFF は OFF・枠は出さない）");
  disableKaraokeStage();
  dom3.screen.remove();
}

async function runSourceTests() {
  console.log("--- nx-live B・C：画面の言葉・前の版 ---");
  // js/karaokeSyncScreen.js は、読み込んだ時点で「ほかの音が始まったら止める」の登録をする（画面の部品は init のあと）。
  // tests.html の先頭で静的に読み込むと、init の前に別のテスト（パーティーの音）がその登録を呼んで止まるので、ここで（init の済んだあとに）読み込む
  const { KARAOKE_CALLS_SWITCH_LABELS } = await import("../js/karaokeSyncScreen.js");
  assertEqual([KARAOKE_CALLS_SWITCH_LABELS.callsOnly, KX_CALLS_ONLY_LABEL], ["コールのみ", "歌詞なし・コールのみ"], "B: 下の帯は「コールのみ」（押せない）・枠の札は「歌詞なし・コールのみ」");
  assertEqual(KX_CALLS_ONLY_NOTE.includes("歌詞がありません"), true, "B: 始める前の短い説明");
  const [kscreen, guide, gameGuide, sw] = await Promise.all([fetchText("js/karaokeSyncScreen.js"), fetchText("js/data/guideContent.js"), fetchText("js/data/gameGuideContent.js"), fetchText("sw.js")]);
  assertEqual(/followDeviceAudio = Array\.isArray\(options\.calls\);[\s\S]*if \(followDeviceAudio\) \{[\s\S]*enableKaraokeStage/.test(kscreen), true, "C: 前のカラオケ同期（コールを渡さない）には、新しい部品を作らない（今までどおり）");
  assertEqual([guide.includes("Overture は、コールだけのカラオケ"), gameGuide.includes("Overture は、コールだけのカラオケ")], [true, true], "B: ガイドの「使えない」を直した（Overture はコールだけのカラオケ）");
  assertEqual(sw.includes("./js/liveCallPreviewMotion.js"), true, "A: 新しい部品を APP_SHELL に入れた");
  assertEqual(Number(/CACHE_VERSION = "v(\d+)"/.exec(sw)?.[1]) >= 407, true, "A: CACHE_VERSION は v407 以上（この担当では変えない）");
}

export async function runLiveCallPreviewNxTests() {
  await runPreviewTests();
  runCallsOnlyTests();
  await runSourceTests();
}
