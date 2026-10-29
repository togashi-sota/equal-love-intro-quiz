// 新しいライブコールの光り方（第2版）と、曲のページのカードの見本画像のテスト（2026-10-30）。本物の歌詞・コールは使わない。
//   A. 見た目の種類（短い／長い／ふつう。区切り・1語ずつの光り方はしない）
//   B. 時刻 t での見た目（種類ごと・演出の強さ・視差効果を減らす設定）
//   C. 一時停止・シークに強い（同じ t なら同じ見た目。順番を変えても同じ）
//   D. 次のコールの知らせ（始まる 1.5 秒前から、うっすら最大 0.4）
//   E. 画面の部品への反映（区切り・札を作らない・「改行をそのまま見せる」印を消さない）
//   F. 見本画像（APP_SHELL・ファイルがある・小さい・代わりの文字）と、本人の決まりのソース確認
import { assertEqual } from "./test-utils.js";
import {
  classifyVisualKind,
  prepareVisual,
  visualStateAt,
  ambientAt,
  summarizeVisual,
  VISUAL_KINDS,
  ANTICIPATE_SEC,
  ANTICIPATE_MAX,
  VIS_FADE_SEC,
} from "../js/callEffects.js";
import { classifyReleasedCalls } from "../js/liveCallData.js";
import { decorateCallSpan, applyVisualState } from "../js/callEffectsRenderer.js";
import { LIVE_CALL_MODE_PREVIEWS, PREVIEW_IMAGE_SIZE } from "../js/liveCallScreen.js";

const base = new URL("../", import.meta.url);
const fetchText = async (file) => (await fetch(new URL(file, base), { cache: "no-store" })).text();
const STD = { intensity: "std", reduced: false };

// ---- ダミーのコール（本物のコールではない） ----
const SHORT = { key: "s", text: "ダミー", start: 10, end: 10.4 };
const SHORT_WORD = { key: "w", text: "Hey！", start: 20, end: 22 };
const NORMAL = { key: "n", text: "ダミーのコール", start: 30, end: 32 };
const LONG = { key: "l", text: "ダミーの長いコール", start: 40, end: 46 };

function runKindTests() {
  console.log("--- ライブコール第2版 A：見た目の種類 ---");
  assertEqual(classifyVisualKind(SHORT), VISUAL_KINDS.SHORT, "A: 1.2秒以下は短い");
  assertEqual(classifyVisualKind({ text: "ダミー", start: 0, end: 1.2 }), VISUAL_KINDS.SHORT, "A: ちょうど1.2秒も短い");
  assertEqual(classifyVisualKind(SHORT_WORD), VISUAL_KINDS.SHORT, "A: 確定の短い掛け声（Hey！）で2.5秒以下は短い");
  assertEqual(classifyVisualKind({ text: "Hey！", start: 0, end: 3 }), VISUAL_KINDS.NORMAL, "A: 掛け声でも2.5秒を超えればふつう（言葉と長さの両方で決める）");
  assertEqual(classifyVisualKind({ text: "フゥフー", start: 0, end: 2 }), VISUAL_KINDS.NORMAL, "A: 近い書き方（要確認）の言葉は自動では短いにしない");
  assertEqual(classifyVisualKind(NORMAL), VISUAL_KINDS.NORMAL, "A: それ以外はふつう");
  assertEqual(classifyVisualKind(LONG), VISUAL_KINDS.LONG, "A: 4秒以上は長い");
  assertEqual(classifyVisualKind({ text: "ダミー\nダミー", start: 0, end: 1.5, hasBreak: true }), VISUAL_KINDS.LONG, "A: 改行のある長いコール（has-break）は長い");
  assertEqual(classifyVisualKind({ text: "ダミー\nダミー", start: 0, end: 0.5, hasBreak: true }), VISUAL_KINDS.LONG, "A: 改行のある塊は、短くても膨らませない（長いを先に見る）");
  assertEqual(classifyVisualKind({ text: "x", start: Number.NaN, end: 1 }), VISUAL_KINDS.NORMAL, "A: 時刻が読めないものはふつう（安全側）");
  const vis = prepareVisual(LONG);
  assertEqual([vis.start, vis.end, vis.kind, "segments" in vis, "groups" in vis], [40, 46, "long", false, false], "A: 下ごしらえは開始・終了をそのまま持ち、区切り（segments）を作らない");
  // 新しいライブコールの流れと同じ：全部「ふつう」の演出データ → MIX の目安の区切りは1つも作られない
  const mixLike = [{ key: "m", text: "タイガー！ファイヤー！サイバー！", start: 1, end: 7 }];
  const preps = classifyReleasedCalls(mixLike, { m: { type: "normal" } });
  assertEqual([preps[0].type, preps[0].segments, preps[0].groups, preps[0].start, preps[0].end], ["normal", undefined, undefined, 1, 7], "A: 全部ふつうにすると、MIX らしい文面でも区切らない（時刻もそのまま）");
}

function runStateTests() {
  console.log("--- ライブコール第2版 B：時刻での見た目 ---");
  const s = prepareVisual(SHORT);
  const atStart = visualStateAt(s, 10, STD);
  assertEqual([atStart.phase, atStart.scale, atStart.glowO, atStart.plateO], ["active", 1.15, 1, 1], "B: 短い：始まった瞬間は 1.15 倍・光が一番強い");
  const afterPop = visualStateAt(s, 10.3, STD);
  assertEqual([afterPop.scale, afterPop.glowO], [1, 0.7], "B: 短い：0.28秒で 1.0 倍に戻り、光は落ち着く");
  const sPost = visualStateAt(s, 10.4 + VIS_FADE_SEC / 2, STD);
  assertEqual([sPost.phase, sPost.plateO > 0 && sPost.plateO < 1, sPost.scale], ["post", true, 1], "B: 短い：終わったら静かに消える（膨らませない）");
  assertEqual(visualStateAt(s, 10.4 + VIS_FADE_SEC, STD).phase, "idle", "B: 消え終わったら何もしない");
  const s2 = prepareVisual({ key: "s2", text: "ダミー", start: 10.5, end: 10.8 });
  assertEqual([visualStateAt(s, 10.5, STD).phase, visualStateAt(s2, 10.5, STD).scale], ["post", 1.15], "B: 続けて来る短いコールも、それぞれ「ポン」");

  const l = prepareVisual(LONG);
  const mid = visualStateAt(l, 43, STD);
  assertEqual([mid.phase, mid.barO, mid.barP, mid.scale, mid.plateO], ["active", 1, 0.5, 1, 1], "B: 長い：全体が光り、バーは開始〜終了の半分（大きな塊は膨らませない）");
  assertEqual(visualStateAt(l, 45.999, STD).barP, 1, "B: 長い：終わりの直前でバーはほぼいっぱい");
  assertEqual(visualStateAt(l, 46, STD).phase, "post", "B: 長い：終了時刻ちょうどで光る時間は終わり（本人の終了どおり）");
  assertEqual(visualStateAt(l, 39.99, STD).barO, 0, "B: 長い：始まる前はバーを出さない");

  const n = prepareVisual(NORMAL);
  const nm = visualStateAt(n, 31, STD);
  assertEqual([nm.phase, nm.liftY, nm.scale, nm.glowO > 0.5], ["active", -1.5, 1.03, true], "B: ふつう：少し浮いて（-1.5px・1.03倍）光る");
  const pulse = [30.2, 30.6, 31, 31.4, 31.8].map((t) => visualStateAt(n, t, STD).glowO);
  assertEqual(new Set(pulse).size > 1 && pulse.every((v) => v >= 0.6 && v <= 0.9), true, "B: ふつう：光はゆっくり呼吸する（t から計算・0.6〜0.9 の間）");

  const reduced = visualStateAt(s, 10, { intensity: "std", reduced: true });
  assertEqual([reduced.scale, reduced.liftY, reduced.plateO], [1, 0, 1], "B: 視差効果を減らす設定：動かさない（光るだけ）");
  const reducedN = [30.2, 30.6, 31].map((t) => visualStateAt(n, t, { intensity: "std", reduced: true }).glowO);
  assertEqual(new Set(reducedN).size, 1, "B: 視差効果を減らす設定：呼吸も止める");
  const low = visualStateAt(s, 10, { intensity: "low", reduced: false });
  assertEqual(low.scale, 1.06, "B: 控えめ：動きは 0.4 倍");
  const off = visualStateAt(l, 43, { intensity: "off", reduced: false });
  assertEqual([off.plateO, off.glowO, off.scale, off.liftY, off.barO, off.ambient], [1, 0, 1, 0, 1, 0], "B: 演出オフ：板とバー（情報）だけ。光・動き・背景の光は出さない");
  assertEqual(visualStateAt(s, 10.41, { intensity: "off", reduced: false }).phase, "idle", "B: 演出オフ：終わったらすぐ消える（余韻なし）");

  assertEqual(ambientAt([mid, nm]), Math.max(mid.ambient, nm.ambient), "B: 舞台の背景の光は、光っているコールの一番強いもの");
  assertEqual([ambientAt([]), ambientAt([mid], "off"), ambientAt([mid], "low") < ambientAt([mid])], [0, 0, true], "B: 背景の光：無ければ 0・オフは 0・控えめは弱く");
  assertEqual(ambientAt([visualStateAt(s, 10, STD)]) <= 0.8, true, "B: 背景の光は最大でも 0.8（うっすら）");
}

function runDeterminismTests() {
  console.log("--- ライブコール第2版 C：一時停止・シークに強い ---");
  const all = [SHORT, SHORT_WORD, NORMAL, LONG].map((c) => prepareVisual(c));
  const times = [];
  for (let t = 8; t <= 48; t += 0.37) times.push(Math.round(t * 100) / 100);
  const forward = times.map((t) => all.map((v) => summarizeVisual(visualStateAt(v, t, STD))).join(" "));
  const shuffled = [...times].map((t, i) => [t, (i * 7919) % times.length]).sort((a, b) => a[1] - b[1]);
  const seekMap = new Map(shuffled.map(([t]) => [t, all.map((v) => summarizeVisual(visualStateAt(v, t, STD))).join(" ")]));
  assertEqual(times.map((t) => seekMap.get(t)), forward, "C: 前後にシークしても（順番を入れ替えても）同じ時刻なら同じ見た目");
  const paused = [0, 1, 2, 3].map(() => summarizeVisual(visualStateAt(all[3], 43.21, STD)));
  assertEqual(new Set(paused).size, 1, "C: 一時停止中（同じ t を何度描いても）見た目は変わらない");
  // ループ（曲の最後 → 最初）でも、前の状態を持ち越さない
  const loopBack = summarizeVisual(visualStateAt(all[0], 10, STD));
  visualStateAt(all[0], 47, STD);
  assertEqual(summarizeVisual(visualStateAt(all[0], 10, STD)), loopBack, "C: ループして戻っても同じ見た目");
}

function runAnticipationTests() {
  console.log("--- ライブコール第2版 D：次のコールの知らせ ---");
  const n = prepareVisual(NORMAL);
  assertEqual(visualStateAt(n, 30 - ANTICIPATE_SEC - 0.01, STD).phase, "idle", "D: 1.5秒より前は何も出さない");
  assertEqual(visualStateAt(n, 30 - ANTICIPATE_SEC, STD).cueO, 0, "D: 1.5秒前から始まる（最初は 0）");
  const half = visualStateAt(n, 30 - ANTICIPATE_SEC / 2, STD);
  assertEqual([half.phase, half.cueO, half.plateO, half.scale], ["pre", ANTICIPATE_MAX / 2, 0, 1], "D: 途中はだんだん濃く（板・動きは出さない）");
  assertEqual(visualStateAt(n, 29.999, STD).cueO <= ANTICIPATE_MAX && visualStateAt(n, 29.999, STD).cueO > 0.39, true, "D: 始まる直前で最大 0.4（控えめ）");
  assertEqual(visualStateAt(n, 30, STD).cueO, 0, "D: 始まったら知らせは消えて、今ここの板に変わる");
  assertEqual(visualStateAt(n, 29.999, { intensity: "low" }).cueO < ANTICIPATE_MAX, true, "D: 控えめでは知らせも薄く");
  assertEqual(visualStateAt(n, 29.5, { intensity: "off" }).phase, "idle", "D: 演出オフでは知らせを出さない");
  assertEqual(visualStateAt(n, 29.5, { intensity: "std", reduced: true }).cueO > 0, true, "D: 視差効果を減らす設定でも知らせ（色だけ・動かない）は出す");
}

function runRendererTests() {
  console.log("--- ライブコール第2版 E：画面の部品への反映 ---");
  if (typeof document === "undefined") return;
  const span = document.createElement("span");
  span.className = "call-text-call is-unique is-pre has-break";
  span.textContent = "ダミー\nダミー";
  const call = { key: "k", text: "ダミー\nダミー", start: 5, end: 7 };
  const [prep] = classifyReleasedCalls([call], { k: { type: "normal" } });
  prep.vis = prepareVisual(call, { hasBreak: true });
  const c = decorateCallSpan(span, prep);
  assertEqual([span.querySelectorAll(".cx-seg").length, span.querySelectorAll(".cx-badge").length, span.querySelectorAll(".cx-bar").length], [0, 0, 1], "E: 区切り・「MIX・進み方は目安」の札は作らない。長いコールの下にバーを1本");
  assertEqual(span.querySelector(".cx-text").textContent, "ダミー\nダミー", "E: 文章は1文字も変えない（改行もそのまま）");
  assertEqual([span.classList.contains("cx-v-long"), Boolean(span.querySelector(".cx-glow")), Boolean(span.querySelector(".cx-cue"))], [true, true, true], "E: 種類の印・外側の光・知らせの枠を足す");
  applyVisualState(c, visualStateAt(prep.vis, 5.5, STD), 5.5);
  applyVisualState(c, visualStateAt(prep.vis, 6, STD), 6);
  assertEqual([span.classList.contains("is-pre"), span.classList.contains("is-active"), span.querySelector(".cx-bar-fill").style.transform], [true, true, "scaleX(0.5)"], "E: 光っても「改行をそのまま見せる」印（is-pre）を消さない・バーは半分");
  applyVisualState(c, visualStateAt(prep.vis, 4, STD), 4);
  assertEqual([span.classList.contains("is-cue"), span.classList.contains("is-pre"), span.classList.contains("is-active")], [true, true, false], "E: 始まる前の知らせは is-cue（is-pre とは別の名前）");
  applyVisualState(c, visualStateAt(prep.vis, 9, STD), 9);
  assertEqual([span.classList.contains("is-done"), span.style.transform, span.querySelector(".cx-glow").style.opacity], [true, "", "0"], "E: 終わったコールは少し薄く、動き・光は元に戻す");
  // 値が同じなら書き込まない（同じ t をもう一度描いても style は同じ）
  const before = span.getAttribute("style");
  applyVisualState(c, visualStateAt(prep.vis, 9, STD), 9);
  assertEqual(span.getAttribute("style"), before, "E: 同じ値は書き込み直さない");
}

async function runPreviewAndSourceTests() {
  console.log("--- ライブコール第2版 F：見本画像・本人の決まり ---");
  const [sw, screen, css] = await Promise.all([fetchText("sw.js"), fetchText("js/liveCallScreen.js"), fetchText("css/liveCall.css")]);
  const ids = ["sheet", "live", "karaoke"];
  assertEqual(ids.map((id) => Boolean(LIVE_CALL_MODE_PREVIEWS[id]?.src)), [true, true, true], "F: 3つのモードのカードに見本画像");
  assertEqual(ids.filter((id) => !sw.includes(`"${LIVE_CALL_MODE_PREVIEWS[id].src}"`)), [], "F: 見本画像を APP_SHELL に入れた（オフラインでも出る）");
  assertEqual(ids.every((id) => LIVE_CALL_MODE_PREVIEWS[id].src.startsWith("./assets/images/live-call-previews/") && LIVE_CALL_MODE_PREVIEWS[id].alt.includes("ダミー")), true, "F: 置き場所と、代わりの文字（文字はダミーと書く）");
  const sizes = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(new URL(LIVE_CALL_MODE_PREVIEWS[id].src, base), { cache: "no-store" });
      return res.ok ? (await res.blob()).size : -1;
    }),
  );
  assertEqual(sizes.map((size) => size > 0 && size <= 60 * 1024), [true, true, true], "F: 見本画像のファイルがあり、どれも 60KB 以下");
  assertEqual([PREVIEW_IMAGE_SIZE.width, PREVIEW_IMAGE_SIZE.height], [280, 224], "F: 画像は 280×224（表示 140×112 の2倍）");
  assertEqual(Number(/CACHE_VERSION = "v(\d+)"/.exec(sw)?.[1]) >= 404, true, "F: CACHE_VERSION を上げた（v404 以上）");
  assertEqual(screen.includes('[call.key, { type: "normal" }]'), true, "F: 新しいライブコールは、今までどおり全部「ふつう」の演出データ（MIX の区切り・掛け声の分類を使わない）");
  assertEqual(screen.includes("previewLines"), false, "F: 棒グラフの見本はやめた");
  assertEqual(/@keyframes|animation\s*:/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), false, "F: ライブコールの CSS に無限アニメーション（@keyframes）は無い");
  assertEqual(/\.cx-call\.is-done \.cx-text \{\s*color: #b0585e;/.test(css) && !/\.cx-call\.is-done \{\s*opacity/.test(css), true, "F: 終わったコールは薄くせず、くすんだ赤（白地でコントラスト 4.5 以上）");
  assertEqual(css.includes(".lc-stage .call-text-calls .cx-call.has-break") && css.includes("#live-call-root .lc-player {") && css.includes("backdrop-filter: none;"), true, "F: 改行のある長いコールの塊・下に固定の再生の操作はそのまま");
}

export async function runLiveCallVisualsTests() {
  runKindTests();
  runStateTests();
  runDeterminismTests();
  runAnticipationTests();
  runRendererTests();
  await runPreviewAndSourceTests();
}
