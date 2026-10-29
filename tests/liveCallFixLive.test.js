// 独立レビューの指摘の直し（2026-10-30 fix-live）のテスト。本物の歌詞・コールは使わない（ダミーの文字だけ）。
//   A. ライブコール：終わったコールは板（黄色の地）・光の枠を外し、くすんだ色の文字だけ（一時停止しても「光っている」ように残らない）
//   B. カラオケ：光の輪・火花はカードの縁から外側だけ（中央の円を出さない）。「0に戻す」の印。予告に「固有コール」を出さない
//   C. 3つの入口の見出し（押したカードの名前）と、そのモードが何かの1行
//   D. ライブコールの上の部分の折りたたみ（コール表の箱の高さの計算）
//   E. 前の「カラオケ同期」（options.calls なし）には、今回の直しが1つも効かない（本物の画面の部品で確かめる）
//   F. ソース確認（前の版のライブコールモードの空の案内・iPad の幅の決まりが、この画面だけ・カラオケで歌うの直接の開き方）
import { assertEqual } from "./test-utils.js";
import { prepareVisual, visualStateAt } from "../js/callEffects.js";
import { decorateCallSpan, applyVisualState } from "../js/callEffectsRenderer.js";
import { classifyReleasedCalls } from "../js/liveCallData.js";
import { getCallPreviewLabel } from "../js/karaokeSync.js";
import {
  enableKaraokeStage,
  disableKaraokeStage,
  setKaraokeStageOffset,
  karaokePreviewLabel,
  isKaraokeStageEnabled,
  KX_SPARK_POINTS,
  KX_SPARK_COUNT,
  KX_PREVIEW_MAX_CHARS,
} from "../js/karaokeStage.js";
import {
  liveCallListHeading,
  LIVE_CALL_ENTRY_TITLES,
  LIVE_CALL_ENTRY_LEADS,
  computeLiveStageHeight,
  LIVE_STAGE_MIN_PX,
} from "../js/liveCallScreen.js";

const base = new URL("../", import.meta.url);
const fetchText = async (file) => (await fetch(new URL(file, base), { cache: "no-store" })).text();
const STD = { intensity: "std", reduced: false };

// ---- ダミーのコール（本物のコールではない） ----
const SHORT = { key: "s", text: "ダミー！", start: 10, end: 10.4 };
const NORMAL = { key: "n", text: "ダミーのコール", start: 20, end: 22 };
const LONG = { key: "l", text: "ダミーの長い\nコール", start: 30, end: 37 };

function runDoneCallTests() {
  console.log("--- fix-live A：終わったコール ---");
  for (const [name, call] of [["短い", SHORT], ["ふつう", NORMAL], ["長い", LONG]]) {
    const vis = prepareVisual(call);
    const justAfter = visualStateAt(vis, call.end + 0.05, STD);
    assertEqual(
      [justAfter.phase, justAfter.plateO, justAfter.glowO, justAfter.barO, justAfter.scale, justAfter.liftY, justAfter.ambient],
      ["post", 0, 0, 0, 1, 0, 0],
      `A: ${name}：終了の直後（一時停止しても同じ）に、板・光の枠・バー・浮き・舞台の光を外す`,
    );
    const active = visualStateAt(vis, call.start + 0.05, STD);
    assertEqual([active.phase, active.plateO], ["active", 1], `A: ${name}：光っている間（本人の開始〜終了）は今までどおり板が出る`);
  }
  assertEqual(visualStateAt(prepareVisual(LONG), 36.999, STD).plateO, 1, "A: 終了の直前までは光ったまま（時刻は本人の終了のまま）");
  if (typeof document === "undefined") return;
  // 画面の部品：終わった直後は is-done（くすんだ色）で、is-on（光っている間の濃い赤）は付けない
  const span = document.createElement("span");
  span.className = "call-text-call is-pre";
  span.textContent = LONG.text;
  const [prep] = classifyReleasedCalls([LONG], { l: { type: "normal" } });
  prep.vis = prepareVisual(LONG, { hasBreak: true });
  const c = decorateCallSpan(span, prep);
  applyVisualState(c, visualStateAt(prep.vis, 33, STD), 33);
  assertEqual([span.classList.contains("is-active"), span.classList.contains("is-on"), span.classList.contains("is-done")], [true, true, false], "A: 光っている間：is-active・is-on");
  applyVisualState(c, visualStateAt(prep.vis, 37.1, STD), 37.1);
  assertEqual(
    [span.classList.contains("is-post"), span.classList.contains("is-on"), span.classList.contains("is-done"), c.parts.plate.style.opacity, c.parts.glow.style.opacity],
    [true, false, true, "0", "0"],
    "A: 終わった直後：板・光の枠を外し、終わったコールの色（is-done）に",
  );
  applyVisualState(c, visualStateAt(prep.vis, 40, STD), 40);
  assertEqual([span.classList.contains("is-post"), span.classList.contains("is-done")], [false, true], "A: そのあと：終わったコールのまま");
  applyVisualState(c, visualStateAt(prep.vis, 31, STD), 31);
  assertEqual([span.classList.contains("is-active"), span.classList.contains("is-done"), c.parts.plate.style.opacity], [true, false, "1"], "A: 前へシークしたら、また光る");
  assertEqual([span.classList.contains("is-pre"), span.textContent], [true, LONG.text], "A: 改行をそのまま見せる印・コールの文字は変えない");
}

function runKaraokeTests() {
  console.log("--- fix-live B：カラオケの輪・予告・0に戻す ---");
  assertEqual(KX_SPARK_POINTS.length, KX_SPARK_COUNT, "B: 火花の数はそのまま（8）");
  assertEqual(KX_SPARK_POINTS.every(([x, y]) => [0, 100].includes(x) || [0, 100].includes(y)), true, "B: 火花はカードの縁の上からだけ出る（中央・文字の上から出さない）");
  assertEqual(
    KX_SPARK_POINTS.every(([x, y, dx, dy]) => (x === 0 ? dx < 0 : x === 100 ? dx > 0 : true) && (y === 0 ? dy < 0 : y === 100 ? dy > 0 : true)),
    true,
    "B: 火花は外側へだけ飛ぶ",
  );
  // 予告の文字：新しいカラオケでは「固有コール」などの種類の名前を出さない
  const longUnique = { text: "ダミーダミー！ ダミーダミー！\nダミーちゃん 大好き！ せーの！", type: "unique", start: 1, end: 8 };
  assertEqual(getCallPreviewLabel(longUnique), "固有コール", "B: 前のカラオケ同期の予告は今までどおり（種類の名前）");
  const label = karaokePreviewLabel(longUnique);
  assertEqual([label.includes("固有"), label.endsWith("…"), [...label].length], [false, true, KX_PREVIEW_MAX_CHARS + 1], "B: 新しいカラオケは長いコールの文字の始めの部分（10文字＋…）");
  assertEqual(longUnique.text.replace(/\s+/g, " ").startsWith(label.slice(0, -1)), true, "B: 文字は変えない（省くだけ）");
  assertEqual([karaokePreviewLabel({ text: "ダミー！", type: "unique" }), karaokePreviewLabel({ text: "" })], ["ダミー！", ""], "B: 短いコールはそのままの文字");
  if (typeof document === "undefined") return;
  const screen = document.createElement("section");
  const hudCard = screen.appendChild(document.createElement("div"));
  document.body.appendChild(screen);
  enableKaraokeStage({ screen, hudCard }, { song: { id: "dummy", center: [] }, calls: [{ start: 1, end: 2, text: "ダミー！" }] });
  const fx = hudCard.querySelector(".kx-hud-fx");
  assertEqual([fx.querySelectorAll(".kx-ring").length, fx.querySelectorAll(".kx-sparks i").length], [2, KX_SPARK_COUNT], "B: 輪2つ・火花8つ（数はそのまま）");
  assertEqual([...fx.querySelectorAll(".kx-sparks i")].every((i) => i.style.getPropertyValue("--x") && i.style.getPropertyValue("--dx")), true, "B: 火花の位置・向きは番号から（乱数なし）");
  setKaraokeStageOffset(0);
  assertEqual(screen.classList.contains("kx-offset-set"), false, "B: 調整なし（0）：「0に戻す」は普通の見た目");
  setKaraokeStageOffset(100);
  assertEqual(screen.classList.contains("kx-offset-set"), true, "B: 調整しているとき：「0に戻す」を目立たせる印");
  setKaraokeStageOffset(-500);
  assertEqual(screen.classList.contains("kx-offset-set"), true, "B: 遅らせる方の調整でも印");
  setKaraokeStageOffset(0);
  assertEqual(screen.classList.contains("kx-offset-set"), false, "B: 0に戻したら印を外す");
  setKaraokeStageOffset(100);
  disableKaraokeStage();
  assertEqual([screen.classList.contains("kx-offset-set"), isKaraokeStageEnabled()], [false, false], "B: 閉じたら印も外す");
  setKaraokeStageOffset(100);
  assertEqual(screen.classList.contains("kx-offset-set"), false, "B: 演出を作っていないときは何もしない");
  screen.remove();
}

function runHeadingTests() {
  console.log("--- fix-live C：3つの入口の見出し ---");
  assertEqual([liveCallListHeading("sheet"), liveCallListHeading("live"), liveCallListHeading("karaoke")], ["コール表を読む", "ライブ中に見る", "カラオケで歌う"], "C: 見出しは押したカードの名前");
  assertEqual([liveCallListHeading(null), liveCallListHeading(undefined), liveCallListHeading("x")], ["ライブコール", "ライブコール", "ライブコール"], "C: 遊び方を選んでいなければ今までどおり「ライブコール」");
  assertEqual(Object.keys(LIVE_CALL_ENTRY_LEADS), Object.keys(LIVE_CALL_ENTRY_TITLES), "C: どの入口にも、そのモードが何かの1行がある");
  assertEqual(Object.values(LIVE_CALL_ENTRY_LEADS).every((text) => text.length > 0 && text.length <= 40 && !text.includes("\n")), true, "C: 1行の短い説明（40文字以内）");
}

function runStageHeightTests() {
  console.log("--- fix-live D：ライブコールの上の部分を折りたたんだときの箱の高さ ---");
  assertEqual(computeLiveStageHeight({ viewportH: 844, stageTop: 289, playerH: 91 }), 456, "D: 再生の操作のすぐ上まで（844 − 289 − 91 − 8）");
  assertEqual(computeLiveStageHeight({ viewportH: 620, stageTop: 400, playerH: 91 }), LIVE_STAGE_MIN_PX, "D: 背の低い画面でも最低の高さは保つ");
  assertEqual(computeLiveStageHeight({ viewportH: Number.NaN, stageTop: 1, playerH: 1 }), null, "D: 測れないときは何もしない（CSS の高さのまま）");
}

function buildKaraokeScreenElements() {
  const screen = document.createElement("section");
  screen.className = "screen";
  const make = (tag = "div") => screen.appendChild(document.createElement(tag));
  const names = [
    ["songTitle", "h2"], ["noCallsNotice", "p"], ["moreMenuButton", "button"], ["startPanel"], ["startButton", "button"], ["deviceAudioNotice", "p"],
    ["syncPanel"], ["lyricsContextPanel"], ["callHudCard"], ["callHudEyebrow", "p"], ["callHudText", "p"], ["callHudCountdown", "p"],
    ["callHudPreviewRow", "p"], ["callHudPreviewItem1", "span"], ["callHudPreviewItem2", "span"], ["songEndBanner"], ["songEndRestartButton", "button"],
    ["songEndChooseButton", "button"], ["deviceAudio", "audio"], ["footerZone"], ["toast", "p"], ["pauseResumeButton", "button"], ["pauseResumeLabel", "span"],
    ["offsetMinus05Button", "button"], ["offsetMinus01Button", "button"], ["offsetResetButton", "button"], ["offsetPlus01Button", "button"],
    ["offsetPlus05Button", "button"], ["offsetLabel", "span"], ["moreMenuModal"], ["moreMenuCloseButton", "button"], ["nowButton", "button"],
    ["syncPointLabel", "span"], ["beginnerNavToggleButton", "button"], ["beginnerNavToggleLabel", "span"], ["restartSongButton", "button"],
  ];
  const els = Object.fromEntries(names.map(([name, tag]) => [name, make(tag)]));
  document.body.appendChild(screen);
  return { screen, els };
}

async function runOldKaraokeUnaffectedTests() {
  console.log("--- fix-live E：前のカラオケ同期には効かない ---");
  if (typeof document === "undefined") return;
  const { initKaraokeSyncScreen, openKaraokeSyncScreen, closeKaraokeSyncScreen } = await import("../js/karaokeSyncScreen.js");
  const { screen, els } = buildKaraokeScreenElements();
  initKaraokeSyncScreen(els);
  const kx = () => [...screen.classList].filter((c) => c.startsWith("kx-")).length + screen.querySelectorAll("[class*='kx-']").length;
  await openKaraokeSyncScreen("love");
  els.offsetPlus01Button.click();
  assertEqual([kx(), screen.classList.contains("kx-offset-set")], [0, false], "E: 前のカラオケ同期：タイミング調整をしても印・演出の部品を付けない");
  els.offsetResetButton.click();
  await openKaraokeSyncScreen("love", { calls: [{ start: 1, end: 2, text: "ダミー！" }] });
  els.offsetPlus01Button.click();
  assertEqual(screen.classList.contains("kx-offset-set"), true, "E: 新しいカラオケ：調整したら印");
  els.offsetResetButton.click();
  assertEqual(screen.classList.contains("kx-offset-set"), false, "E: 新しいカラオケ：0に戻したら印を外す");
  await openKaraokeSyncScreen("love");
  assertEqual(kx(), 0, "E: 新しいカラオケのあとに前のカラオケ同期を開いても、何も残らない");
  closeKaraokeSyncScreen();
  screen.remove();
}

async function runSourceTests() {
  console.log("--- fix-live F：ソース確認 ---");
  const [html, liveCss, kCss, styleCss, mainJs, screenJs, kScreen] = await Promise.all(
    ["index.html", "css/liveCall.css", "css/karaokeStage.css", "css/style.css", "js/main.js", "js/liveCallScreen.js", "js/karaokeSyncScreen.js"].map(fetchText),
  );
  // 見出しの名前はホームのカードと同じ
  assertEqual(Object.values(LIVE_CALL_ENTRY_TITLES).every((title) => html.includes(`<b>${title}</b>`)), true, "F: 見出しの名前は index.html のホームのカードの名前と同じ");
  // 前の版のライブコールモード：空のときの案内（文言はそのまま残し、ボタンを足す）
  const empty = html.match(/<div id="live-call-mode-list-empty-state"[^>]*hidden>([\s\S]*?)<\/div>\s*<\/div>/);
  assertEqual(Boolean(empty) && empty[1].includes("まだコールが登録された曲がありません。") && empty[1].includes('id="live-call-mode-empty-add-data-button"') && empty[1].includes('id="live-call-mode-empty-new-live-button"'), true, "F: 前の版の一覧が空のとき：今までの文言＋データを足す場所・新しいライブコールへのボタン");
  assertEqual(mainJs.includes('getElementById("data-pack-import-section")') && /live-call-mode-empty-add-data-button[\s\S]{0,300}openSettingsSection/.test(mainJs), true, "F: ［データを追加する］は設定・データ管理の「追加データパック」の欄へ（前の版のコールはここで入る）");
  // iPad の幅：この2つの画面だけ。カラオケは新しい方（.kx-on）だけ
  const noComments = liveCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const frameRules = [...noComments.matchAll(/([^{}]*\.game-frame[^{}]*)\{/g)].map((m) => m[1].trim());
  assertEqual(
    frameRules.every((sel) => sel.split(",").every((x) => /body\[data-screen="liveCall"\] \.game-frame|body\[data-screen="liveCallModeKaraoke"\]:has\(#live-call-mode-karaoke-screen\.kx-on\) \.game-frame/.test(x.trim()))),
    true,
    "F: 枠（.game-frame）の幅・見た目を変えるのは、新しいライブコールと新しいカラオケの画面だけ（ホーム・前のカラオケ同期は変えない）",
  );
  assertEqual(/animation\s*:|@keyframes/.test(noComments), false, "F: ライブコールの CSS は今までどおりアニメーションを使わない（終わりのフェードは transition だけ）");
  assertEqual(/prefers-reduced-motion[\s\S]{0,400}is-post[\s\S]{0,300}transition: none/.test(liveCss), true, "F: 視差効果を減らす設定では、終わりのフェードも出さない");
  // カラオケ：中央から広がる輪（left:50%・top:50% の円）をやめた
  const kNoComments = kCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const ring = kNoComments.match(/\.kx-on \.kx-ring \{([^}]*)\}/);
  assertEqual(Boolean(ring) && !/left: 50%|top: 50%|border-radius: 50%/.test(ring[1]), true, "F: カラオケの光の輪は、カードの縁に沿った形（中央の円ではない）");
  assertEqual(/\.kx-on \.karaoke-call-hud-card \{[^}]*max-height: 45dvh/.test(kNoComments), true, "F: コールのカードは画面の高さの約45%まで");
  assertEqual(/is-tier-long \.karaoke-call-hud-text \{[^}]*text-align: center/.test(kNoComments), true, "F: 長いコールは中央揃え");
  assertEqual(
    /\.kx-on:not\(\.kx-offset-set\) \.karaoke-timing-reset-button/.test(kNoComments) &&
      styleCss.includes([".karaoke-timing-reset-button {", "  min-height: 44px;", "  padding: 8px 3px;", "  border: none;", "  border-radius: 16px;", "  background: linear-gradient(120deg, var(--color-primary-dark), var(--color-primary));"].join(String.fromCharCode(10))),
    true,
    "F: 「0に戻す」の見た目を変えるのは新しいカラオケの中だけ（前のカラオケ同期のピンクの塗りはそのまま）",
  );
  // カラオケ同期の画面：今回の呼び出しも、新しいカラオケ（followDeviceAudio）のときだけ
  const offsetLines = kScreen.split("\n").filter((line) => line.includes("setKaraokeStageOffset(") && !line.includes("import"));
  assertEqual(offsetLines.length > 0 && offsetLines.every((line) => line.includes("if (followDeviceAudio)")), true, "F: 調整の印は、新しいカラオケのときだけ付ける");
  assertEqual(kScreen.includes("const previewLabel = followDeviceAudio ? karaokePreviewLabel : getCallPreviewLabel;"), true, "F: 予告の文字の変更は新しいカラオケだけ（前の版は getCallPreviewLabel のまま）");
  // 「カラオケで歌う」から曲を押したら、コール付きの新しいカラオケ（曲のページのカードと同じ）
  assertEqual(/direct === "karaoke" && callbacks\?\.openKaraokeWithCalls[\s\S]{0,200}callbacks\.openKaraokeWithCalls\(songId, calls\)/.test(screenJs), true, "F: 「カラオケで歌う」から曲を選んだら、完成版のコール付きの新しいカラオケを開く");
}

export async function runLiveCallFixLiveTests() {
  runDoneCallTests();
  runKaraokeTests();
  runHeadingTests();
  runStageHeightTests();
  await runOldKaraokeUnaffectedTests();
  await runSourceTests();
}
