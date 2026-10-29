// 新しいライブコール（第3版：控えめ）と新しいカラオケの演出のテスト（2026-10-30 夜）。本物の歌詞・コールは使わない（ダミーの文字だけ）。
//   A. 名前コールのメンバーカラー：メンバーのデータとまるごと1人に一致したときだけ（迷ったら通常の色）
//   B. ライブコールの「つぎ」の残り時間（控えめ・1秒単位）
//   C. カラオケの背景の色の決め方（センターのメンバーカラー／曲の id）
//   D. カラオケの時刻での状態（同じ t なら同じ・シーク・一時停止・曲の終わり・コールを書き換えない）
//   E. カラオケの演出の部品（作る・外す・始まりの光は始まった直後だけ・名前の色）
//   F. 前の「カラオケ同期」（options.calls なし）には演出が付かない（本物の画面の部品で確かめる）
//   G. CSS・読み込み・本人の決まりのソース確認
import { assertEqual } from "./test-utils.js";
import { buildMemberNameIndex, memberIdForCallText, normalizeNameCallText, visualStateAt, prepareVisual } from "../js/callEffects.js";
import { MEMBERS } from "../js/data/members.js";
import { MEMBER_PROFILES } from "../js/data/memberProfiles.js";
import { getSongById } from "../js/data/songs.js";
import { formatNextWait, memberColorForCallText, NEXT_SOON_SEC } from "../js/liveCallScreen.js";
import {
  karaokePaletteForSong,
  karaokeStageStateAt,
  enableKaraokeStage,
  disableKaraokeStage,
  updateKaraokeStage,
  resetKaraokeStage,
  setKaraokeStagePaused,
  showKaraokeStageFinale,
  isKaraokeStageEnabled,
  stableHash,
  KX_SONG_PALETTES,
  KX_BURST_WINDOW_SEC,
  KX_COUNTDOWN_SEC,
} from "../js/karaokeStage.js";
// js/karaokeSyncScreen.js は読み込んだ時点で「ほかの音が始まったら止める」部品を登録する（画面の部品を渡す前に呼ばれると落ちる）。
// アプリでは起動時にすぐ部品を渡すが、テストのページでは渡さないので、F のテストの中で読み込んで、すぐに部品を渡す

const base = new URL("../", import.meta.url);
const fetchText = async (file) => (await fetch(new URL(file, base), { cache: "no-store" })).text();

function runMemberNameTests() {
  console.log("--- ライブコール夜 A：名前コールのメンバーカラー ---");
  const index = buildMemberNameIndex(MEMBERS, MEMBER_PROFILES);
  const maika = MEMBERS.find((m) => m.id === "sasaki-maika");
  assertEqual(memberIdForCallText("まいか！", index), "sasaki-maika", "A: 愛称（データの「まいか」）とまるごと一致すればそのメンバー");
  assertEqual(memberIdForCallText("さなつん！×２", index), "morohashi-sana", "A: 末尾の繰り返しの印（×２）は外して比べる");
  assertEqual(memberIdForCallText("  まいか!! ", index), "sasaki-maika", "A: 前後の空白・半角の！もそろえる");
  assertEqual(memberIdForCallText(maika.name, index), "sasaki-maika", "A: フルネームも一致");
  assertEqual(memberIdForCallText("超絶かわいい！まいか！", index), null, "A: ほかの言葉を含むものは一致にしない（迷ったら通常の色）");
  assertEqual(memberIdForCallText("まいか！ or あんな！", index), null, "A: 2人の名前のどちらか、は一致にしない");
  assertEqual(memberIdForCallText("さーなつん！", index), null, "A: データに無い言い方（伸ばし棒を途中に入れた）は推測で広げない");
  assertEqual(memberIdForCallText("姫！", index), null, "A: 1文字の愛称は、ふつうの言葉と区別できないので使わない");
  assertEqual(memberIdForCallText("Hey！", index), null, "A: 掛け声は一致しない");
  assertEqual(memberIdForCallText("", index), null, "A: 空の文字列は一致しない");
  const dup = buildMemberNameIndex([{ id: "a", name: "ダミー太郎", reading: "だみー" }, { id: "b", name: "ダミー次郎", reading: "だみー" }]);
  assertEqual(memberIdForCallText("だみー！", dup), null, "A: 2人が同じ言い方を持つときは使わない");
  assertEqual(normalizeNameCallText("ダミー！×3"), "ダミ", "A: そろえるのは末尾の記号・伸ばし棒・繰り返しの印だけ");
  const color = memberColorForCallText("まいか！");
  assertEqual([color?.memberId, color?.color], ["sasaki-maika", maika.memberColor.hex], "A: ライブコールの画面はメンバーのデータの色を使う");
  assertEqual(memberColorForCallText("まいか！ or いおり！"), null, "A: 画面でも、迷うものは通常の色");
}

function runNextWaitTests() {
  console.log("--- ライブコール夜 B：つぎ の残り時間 ---");
  assertEqual([formatNextWait(12.2), formatNextWait(3), formatNextWait(1.01), formatNextWait(0.99), formatNextWait(0)], ["あと13秒", "あと3秒", "あと2秒", "まもなく", "まもなく"], "B: 1秒単位で切り上げ・1秒を切ったら「まもなく」");
  assertEqual([formatNextWait(Number.NaN), formatNextWait(-1), formatNextWait(undefined)], ["", "", ""], "B: 読めない値は何も出さない");
  assertEqual(NEXT_SOON_SEC, 3, "B: 少し目立たせるのは3秒を切ってから（カラオケの「もうすぐ！」と同じ）");
  // 第3版：光は一定（呼吸しない）・「ポン」は控えめ
  const n = prepareVisual({ key: "n", text: "ダミー", start: 10, end: 12 });
  const glows = [10.3, 10.8, 11.3, 11.9].map((t) => visualStateAt(n, t, { intensity: "std" }).glowO);
  assertEqual(new Set(glows).size, 1, "B: ライブコール第3版：光っている間の光は一定（読むときに揺れない）");
  assertEqual(visualStateAt(prepareVisual({ key: "s", text: "ダミー", start: 1, end: 1.3 }), 1, { intensity: "std" }).scale <= 1.08, true, "B: ライブコール第3版：短いコールの「ポン」は 1.08 倍まで");
}

function runPaletteTests() {
  console.log("--- カラオケ夜 C：背景の色 ---");
  const members = [
    { id: "a", name: "ダミーA", memberColor: { hex: "#111111" } },
    { id: "b", name: "ダミーB", memberColor: { hex: "#222222" } },
  ];
  assertEqual(karaokePaletteForSong({ id: "x", center: ["ダミーA"] }, members), { basis: "center", colors: ["#111111", "#ff6fa8"], memberIds: ["a"] }, "C: センターが1人：そのメンバーカラーとグループのピンク");
  assertEqual(karaokePaletteForSong({ id: "x", center: ["ダミーA", "ダミーB"] }, members).colors, ["#111111", "#222222"], "C: Wセンター：2人のメンバーカラー");
  const all = karaokePaletteForSong({ id: "song-1", center: ["全員"] }, members);
  assertEqual([all.basis, KX_SONG_PALETTES.some((p) => p.join() === all.colors.join())], ["song", true], "C: 全員センター・センターなし：曲の id から決めた色の組");
  assertEqual(karaokePaletteForSong({ id: "song-1", center: [] }, members), karaokePaletteForSong({ id: "song-1" }, members), "C: 同じ曲はいつも同じ色");
  assertEqual(stableHash("abc"), stableHash("abc"), "C: ハッシュは同じ文字列なら同じ");
  const love = getSongById("love");
  const p = karaokePaletteForSong(love);
  const center = MEMBERS.find((m) => m.name === love.center[0]);
  assertEqual([p.basis, p.colors[0]], ["center", center.memberColor.hex], "C: 本物の曲のデータ（＝LOVE）：センターのメンバーカラー");
}

const CALLS = [
  { key: "c1", text: "ダミー", start: 10, end: 10.5 },
  { key: "c2", text: "ダミーの長いコール", start: 20, end: 26 },
  { key: "c3", text: "まいか！", start: 30, end: 31 },
];
const LINES = [
  { start: 5, end: 9 },
  { start: 9, end: 15 },
  { start: 15, end: 28 },
];

function runStateTests() {
  console.log("--- カラオケ夜 D：時刻での状態 ---");
  const before = JSON.stringify(CALLS);
  const s0 = karaokeStageStateAt(CALLS, 8.5, LINES);
  assertEqual([s0.activeIndex, s0.next.key, s0.nextIn, s0.countdown, s0.nextLineIndex], [-1, "c1", 1.5, 0.5, 1], "D: コールの前：次のコールまで1.5秒（3秒のバーの半分）・次の行");
  assertEqual(karaokeStageStateAt(CALLS, 6.9, LINES).countdown, 0, "D: 3秒より前はバーを出さない");
  const s1 = karaokeStageStateAt(CALLS, 10.1, LINES);
  assertEqual([s1.activeIndex, s1.justStarted, s1.long, s1.countdown], [0, true, false, 0], "D: 始まった直後：始まりの光を出す");
  assertEqual(karaokeStageStateAt(CALLS, 10 + KX_BURST_WINDOW_SEC + 0.01, LINES).justStarted, false, "D: 始まって 0.4 秒を過ぎたら（途中へシークしても）始まりの光は出さない");
  assertEqual(karaokeStageStateAt(CALLS, 10.5, LINES).activeIndex, -1, "D: 終了時刻ちょうどで光る時間は終わり（本人の終了どおり）");
  const s2 = karaokeStageStateAt(CALLS, 23, LINES);
  assertEqual([s2.active.key, s2.long, s2.progress], ["c2", true, 0.5], "D: 長いコール（4秒以上）：進み具合はちょうど半分");
  assertEqual(karaokeStageStateAt(CALLS, 31.5, LINES).allCallsDone, true, "D: 最後のコールの後：コールは以上");
  assertEqual(karaokeStageStateAt(CALLS, 40, LINES).nextLineIndex, -1, "D: 最後の行の後：次の行は無い");
  const times = [];
  for (let t = 0; t < 35; t += 0.29) times.push(Math.round(t * 100) / 100);
  const sum = (t) => JSON.stringify(karaokeStageStateAt(CALLS, t, LINES));
  const forward = times.map(sum);
  const shuffled = [...times].reverse();
  const map = new Map(shuffled.map((t) => [t, sum(t)]));
  assertEqual(times.map((t) => map.get(t)), forward, "D: 前後にシークしても（逆の順番でも）同じ時刻なら同じ状態");
  assertEqual(JSON.stringify(CALLS), before, "D: コール（文字・開始・終了）を1つも書き換えない");
  assertEqual(karaokeStageStateAt([], 5, []).active, null, "D: コールが無くても壊れない");
  assertEqual(karaokeStageStateAt(CALLS, Number.NaN, LINES).activeIndex, -1, "D: 時刻が読めないときは 0 秒として扱う（壊れない）");
  assertEqual(KX_COUNTDOWN_SEC, 3, "D: 次のコールまでのバーは3秒（「もうすぐ！」の 3・2・1 と同じ長さ）");
}

function buildFakeStage() {
  const screen = document.createElement("section");
  screen.className = "screen";
  const hudCard = document.createElement("div");
  hudCard.className = "karaoke-call-hud-card";
  const hudText = document.createElement("p");
  hudText.className = "karaoke-call-hud-text";
  hudCard.appendChild(hudText);
  const lyricsPanel = document.createElement("div");
  LINES.forEach(() => lyricsPanel.appendChild(Object.assign(document.createElement("p"), { className: "synced-lyrics-line", textContent: "〜〜歌詞〜〜" })));
  screen.append(lyricsPanel, hudCard);
  document.body.appendChild(screen);
  return { screen, hudCard, hudText, lyricsPanel };
}

function runStageDomTests() {
  console.log("--- カラオケ夜 E：演出の部品 ---");
  if (typeof document === "undefined") return;
  const els = buildFakeStage();
  enableKaraokeStage(els, { song: { id: "dummy", center: [] }, calls: CALLS, lines: LINES });
  assertEqual([isKaraokeStageEnabled(), els.screen.classList.contains("kx-on"), Boolean(els.screen.querySelector(".kx-fx")), Boolean(els.hudCard.querySelector(".kx-hud-fx")), Boolean(els.hudCard.querySelector(".kx-progress"))], [true, true, true, true, true], "E: 作る：背景・カードの光・進み具合のバー");
  assertEqual(els.hudText.textContent, "", "E: コールの文字の部品には何も足さない（文字はそのまま）");
  updateKaraokeStage(10.05);
  assertEqual([els.screen.classList.contains("kx-call-now"), els.hudCard.classList.contains("kx-burst"), els.hudCard.classList.contains("kx-member")], [true, true, false], "E: コールの始まり：発光と弾み（通常の色）");
  updateKaraokeStage(10.2);
  assertEqual(els.hudCard.classList.contains("kx-burst"), true, "E: 同じコールの間は付け直さない（毎フレーム最初からやり直さない）");
  updateKaraokeStage(23);
  assertEqual([els.hudCard.classList.contains("kx-burst"), els.screen.classList.contains("kx-long"), els.hudCard.querySelector(".kx-progress-fill").style.transform], [false, true, "scaleX(0.5)"], "E: 長いコールの途中へシーク：始まりの光は出さず、進み具合は半分");
  updateKaraokeStage(30.1);
  assertEqual([els.hudCard.classList.contains("kx-member"), els.hudCard.style.getPropertyValue("--kx-call")], [true, MEMBERS.find((m) => m.id === "sasaki-maika").memberColor.hex], "E: 名前コール（データと確かに一致）はメンバーカラー");
  updateKaraokeStage(28.5);
  assertEqual([els.hudCard.classList.contains("kx-member"), els.screen.classList.contains("kx-soon"), els.hudCard.querySelector(".kx-countdown-fill").style.transform], [false, true, "scaleX(0.5)"], "E: 戻ったら通常の色に戻す・次のコールまでのバー");
  updateKaraokeStage(8);
  assertEqual([...els.lyricsPanel.children].map((n) => n.classList.contains("kx-next-line")), [false, true, false], "E: 次の行だけ控えめに目立たせる（行単位の時刻）");
  setKaraokeStagePaused(true);
  assertEqual(els.screen.classList.contains("kx-paused"), true, "E: 一時停止中の印（CSS のアニメーションを止める）");
  setKaraokeStagePaused(false);
  showKaraokeStageFinale();
  updateKaraokeStage(31.9, { ended: true });
  assertEqual([els.screen.classList.contains("kx-finale"), els.screen.classList.contains("kx-done")], [true, true], "E: 曲の終わり：紙吹雪（1回）");
  updateKaraokeStage(12, { ended: false });
  assertEqual(els.screen.classList.contains("kx-finale"), false, "E: 終わりの後に戻したら、終わりの演出は消す");
  resetKaraokeStage();
  assertEqual([els.screen.classList.contains("kx-call-now"), els.screen.classList.contains("kx-paused"), els.hudCard.classList.contains("kx-burst")], [false, false, false], "E: 最初からやり直す：演出の状態を戻す");
  disableKaraokeStage();
  assertEqual(
    [isKaraokeStageEnabled(), els.screen.querySelectorAll("[class*='kx-']").length, [...els.screen.classList].filter((c) => c.startsWith("kx-")), [...els.hudCard.classList].filter((c) => c.startsWith("kx-")), els.screen.style.cssText, els.hudCard.style.cssText],
    [false, 0, [], [], "", ""],
    "E: 外す：部品・クラス・色の指定を1つも残さない",
  );
  updateKaraokeStage(10.05);
  assertEqual(els.screen.classList.contains("kx-call-now"), false, "E: 外したあとは何もしない");
  els.screen.remove();
}

// 本物の画面の部品（index.html の id）をダミーで作って、カラオケ同期の画面を動かす
function buildKaraokeScreenElements() {
  const screen = document.createElement("section");
  screen.className = "screen";
  screen.id = "test-karaoke-night-screen";
  const make = (tag = "div") => screen.appendChild(document.createElement(tag));
  const els = {
    songTitle: make("h2"),
    noCallsNotice: make("p"),
    moreMenuButton: make("button"),
    startPanel: make(),
    startButton: make("button"),
    deviceAudioNotice: make("p"),
    syncPanel: make(),
    lyricsContextPanel: make(),
    callHudCard: make(),
    callHudEyebrow: make("p"),
    callHudText: make("p"),
    callHudCountdown: make("p"),
    callHudPreviewRow: make("p"),
    callHudPreviewItem1: make("span"),
    callHudPreviewItem2: make("span"),
    songEndBanner: make(),
    songEndRestartButton: make("button"),
    songEndChooseButton: make("button"),
    deviceAudio: make("audio"),
    footerZone: make(),
    toast: make("p"),
    pauseResumeButton: make("button"),
    pauseResumeLabel: make("span"),
    offsetMinus05Button: make("button"),
    offsetMinus01Button: make("button"),
    offsetResetButton: make("button"),
    offsetPlus01Button: make("button"),
    offsetPlus05Button: make("button"),
    offsetLabel: make("span"),
    moreMenuModal: make(),
    moreMenuCloseButton: make("button"),
    nowButton: make("button"),
    syncPointLabel: make("span"),
    beginnerNavToggleButton: make("button"),
    beginnerNavToggleLabel: make("span"),
    restartSongButton: make("button"),
  };
  document.body.appendChild(screen);
  return { screen, els };
}

async function runOldKaraokeUnaffectedTests() {
  console.log("--- カラオケ夜 F：前のカラオケ同期には演出を付けない ---");
  if (typeof document === "undefined") return;
  const { initKaraokeSyncScreen, openKaraokeSyncScreen, closeKaraokeSyncScreen } = await import("../js/karaokeSyncScreen.js");
  const { screen, els } = buildKaraokeScreenElements();
  initKaraokeSyncScreen(els);
  const kxCount = () => screen.querySelectorAll("[class*='kx-']").length + [...screen.classList].filter((c) => c.startsWith("kx-")).length;
  await openKaraokeSyncScreen("love");
  assertEqual([kxCount(), screen.style.cssText], [0, ""], "F: options.calls なし（前のカラオケ同期）：演出の部品・クラス・色を1つも付けない");
  await openKaraokeSyncScreen("love", { calls: CALLS.map((c) => ({ ...c })) });
  assertEqual([screen.classList.contains("kx-on"), Boolean(screen.querySelector(".kx-fx")), Boolean(els.callHudCard.querySelector(".kx-hud-fx"))], [true, true, true], "F: options.calls 付き（新しいカラオケ）：演出の部品を作る");
  await openKaraokeSyncScreen("love");
  assertEqual(kxCount(), 0, "F: 新しいカラオケのあとに前のカラオケ同期を開いても、演出は残らない");
  await openKaraokeSyncScreen("love", { calls: CALLS.map((c) => ({ ...c })) });
  closeKaraokeSyncScreen();
  assertEqual([kxCount(), isKaraokeStageEnabled()], [0, false], "F: 画面を閉じたら演出の部品を外す");
  screen.remove();
}

async function runSourceTests() {
  console.log("--- ライブコール夜 G：CSS・読み込み・本人の決まり ---");
  const [css, html, sw, kScreen, stageJs, liveCss] = await Promise.all(["css/karaokeStage.css", "index.html", "sw.js", "js/karaokeSyncScreen.js", "js/karaokeStage.js", "css/liveCall.css"].map(fetchText));
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...noComments.matchAll(/(^|\})\s*([^{}@][^{}]*)\{/g)].map((m) => m[2].trim()).filter((sel) => !/^(from|to|\d+%|@)/.test(sel));
  const outside = selectors.flatMap((sel) => sel.split(",").map((x) => x.trim())).filter((x) => !x.startsWith("#live-call-mode-karaoke-screen.kx-on"));
  assertEqual(outside, [], "G: 新しいカラオケの CSS は全部 #live-call-mode-karaoke-screen.kx-on の中だけ（前のカラオケ同期に効かない）");
  assertEqual(/@media \(prefers-reduced-motion: reduce\)/.test(css) && /kx-paused[^{]*\{\s*animation-play-state: paused;/.test(noComments), true, "G: 視差効果を減らす設定・一時停止中はアニメーションを止める");
  assertEqual(/animation:[^;]*infinite/.test(noComments.replace(/kxDrift[AB][^;]*;|kxRise[^;]*;/g, "")), false, "G: 繰り返すアニメーションは背景の光と粒だけ（コール・文字には使わない）");
  assertEqual(html.includes('<link rel="stylesheet" href="css/karaokeStage.css">') && sw.includes('"./css/karaokeStage.css"') && sw.includes('"./js/karaokeStage.js"'), true, "G: 読み込み・APP_SHELL に入れた");
  // 演出の呼び出しは、すべて「新しいカラオケ（followDeviceAudio）」の中だけ
  const stageCalls = kScreen.split("\n").filter((line) => /(updateKaraokeStage|setKaraokeStagePaused|showKaraokeStageFinale|resetKaraokeStage)\(/.test(line) && !line.trim().startsWith("//") && !line.includes("import"));
  assertEqual(stageCalls.length > 0 && stageCalls.every((line) => line.includes("if (followDeviceAudio)")), true, "G: カラオケ同期の画面は、演出を followDeviceAudio（options.calls 付き）のときだけ呼ぶ");
  assertEqual(kScreen.includes("tickTimerId = window.setInterval(tick, TICK_INTERVAL_MS);") && kScreen.includes("const TICK_INTERVAL_MS = 150;"), true, "G: 前のカラオケ同期は今までどおり 0.15 秒ごと（setInterval）");
  assertEqual(/segments|splitCall|perWord/.test(stageJs.replace(/\/\/.*$/gm, "")), false, "G: 新しいカラオケは区切り・1語ずつの演出を作らない");
  assertEqual(/@keyframes|animation\s*:/.test(liveCss.replace(/\/\*[\s\S]*?\*\//g, "")), false, "G: ライブコールの CSS には今までどおりアニメーションを使わない（控えめ）");
}

export async function runLiveCallNightTests() {
  runMemberNameTests();
  runNextWaitTests();
  runPaletteTests();
  runStateTests();
  runStageDomTests();
  await runOldKaraokeUnaffectedTests();
  await runSourceTests();
}
