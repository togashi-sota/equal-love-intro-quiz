// 【2026-11-01 R8・本人の依頼 3】歴代センターの「1枚表」（js/centerSheet.js・js/centerSheetView.js）の回帰テスト。
// 確かめること：表の行の数（シングル21枚＋アルバム＋他）、曲の漏れ・重複、センターの名前と色の対応、2人センター、
// 22nd を songs.js に足したときに自動で行が増えること、1段／2段の選び方、画面（タブ・曲名を押した行き先・凡例）、入口。
import { assertEqual } from "./test-utils.js";
import { SONGS, CATEGORY } from "../js/data/songs.js";
import { MEMBERS } from "../js/data/members.js";
import { DISCOGRAPHY } from "../js/data/discography.js";
import { buildCenterTableModel } from "../js/centerTable.js";
import { classifyCenter, pickReadableTextColor } from "../js/centerChart.js";
import {
  CENTER_SHEET_SIZE,
  membersAtDate,
  resolveSingingMembers,
  buildCenterSheetModel,
  describeSheetCell,
  fitSheetFontSize,
  splitSheetRows,
  estimateSheetSize,
  pickSheetLayout,
  fitSheetScale,
} from "../js/centerSheet.js";
import { renderCenterSheet, createCenterSheetPanel } from "../js/centerSheetView.js";
import { initCentersScreen, openCentersScreen } from "../js/centersScreen.js";
import { HOME_ACTIONS, buildHomeInfoStats, formatOrdinal } from "../js/homeScreen.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const memberColor = new Map(MEMBERS.map((member) => [member.name, member.memberColor.hex]));
const allEntries = (model) => model.rows.flatMap((row) => ["title", "group", "unit"].flatMap((key) => row.columns[key]));

function runSheetModelTests() {
  console.log("--- R8：センターの1枚表（データ） ---");
  const model = buildCenterSheetModel(SONGS, { discography: DISCOGRAPHY });
  const singleCount = DISCOGRAPHY.filter((work) => work.type === "single").length;

  // ---- 行の数と並び ----
  assertEqual(singleCount, 21, "今のデータはシングル21枚（21st まで）");
  assertEqual(model.rows.length, singleCount + 1 + 1, "行は シングル21枚 ＋ アルバム ＋ 他 の23行");
  assertEqual(
    model.rows.map((row) => row.label),
    ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "アルバム", "9th", "10th", "11th", "12th", "13th", "14th", "15th", "16th", "17th", "18th", "19th", "20th", "21st", "他"],
    "並び：1st〜8th → アルバム（発売日どおり 8th と 9th の間。参考画像と同じ）→ 9th〜21st → 他"
  );
  assertEqual(model.rows.find((row) => row.kind === "album").subLabel, "全部、内緒。", "アルバムの行にアルバム名を添える");
  assertEqual(model.rows.at(-1).workIds.slice().sort(), ["digital-01", "digital-02", "digital-03", "digital-04", "special-866"], "「他」＝配信限定4作＋特別曲（866）");
  assertEqual(model.rows.slice(0, -1).every((row, index, rows) => index === 0 || rows[index - 1].releaseDate <= row.releaseDate), true, "他 より上の行は発売日の古い順");
  assertEqual(model.lineCount, model.rows.reduce((sum, row) => sum + row.lineCount, 0), "行の高さの合計");

  // ---- 曲の漏れ・重複 ----
  const ids = allEntries(model).map((entry) => entry.song.id);
  const expected = SONGS.filter((song) => song.category !== CATEGORY.SPECIAL).map((song) => song.id);
  assertEqual(new Set(ids).size, ids.length, "同じ曲を2回出さない");
  assertEqual(ids.slice().sort(), expected.slice().sort(), "Overture（特別収録曲）以外の全曲（83曲）が1回ずつ入る");
  assertEqual(ids.length, 83, "1枚表の曲は83曲");
  assertEqual(ids.includes("overture"), false, "Overture は出さない");
  const titleOf = (row) => row.columns.title.map((entry) => entry.song.title);
  assertEqual(titleOf(model.rows.find((row) => row.label === "18th")), ["とくべチュ、して", "恋人以上、好き未満"], "18th は表題曲が2曲");
  assertEqual(
    model.rows.find((row) => row.label === "21st").columns.group.map((entry) => entry.song.title),
    ["夏名残サマーチューン", "夢の続き"],
    "21st（参考画像に無い行）は アプリのデータから：全員曲2曲"
  );
  const other = model.rows.at(-1);
  assertEqual(
    [other.columns.title.length, other.columns.group.map((entry) => [entry.song.id, entry.tag]), other.columns.unit.map((entry) => [entry.song.id, entry.tag])],
    [0, [["866", "特別"], ["naisho-banashi", "配信"]], [["kimi-dake-no-hanamichi", "配信"], ["okaeri-hanadayori", "配信"], ["takaramono-wa-green", "配信"]]],
    "他：全員曲＝866（特別）・内緒バナシ（配信）、ユニット曲＝配信限定3曲。列の中は発売日順"
  );
  assertEqual(model.rows.slice(0, -1).every((row) => allEntries({ rows: [row] }).every((entry) => entry.tag === null)), true, "他 以外の行には札を付けない");

  // ---- 列（曲の種類）が songs.js の category と同じ ----
  const columnOf = { title: CATEGORY.TITLE_TRACK, group: CATEGORY.GROUP_SONG, unit: CATEGORY.UNIT_SONG };
  assertEqual(
    model.rows.every((row) => Object.entries(columnOf).every(([key, category]) => row.columns[key].every((entry) => entry.song.category === category))),
    true,
    "表題曲／全員曲／ユニット曲の列は songs.js の category どおり"
  );

  // ---- センターの名前と色 ----
  const entries = allEntries(model);
  const mismatched = entries.filter((entry) => {
    const center = classifyCenter(entry.song);
    if (entry.cell.basis === "center") return JSON.stringify(entry.cell.names) !== JSON.stringify(center.centerNames);
    return false;
  });
  assertEqual(mismatched.map((entry) => entry.song.id), [], "センターが決まっている曲の名前は、歴代センター一覧（classifyCenter）と同じ");
  const colorMismatch = entries.filter((entry) => entry.cell.swatches.some((swatch) => swatch.hex !== memberColor.get(swatch.name)));
  assertEqual(colorMismatch.map((entry) => entry.song.id), [], "マスの色は members.js のメンバーカラー");
  assertEqual(entries.every((entry) => entry.cell.swatches.every((swatch) => swatch.textColor === pickReadableTextColor(swatch.hex).color)), true, "文字の色は背景から読みやすい方（黒／白）");
  const byId = (id) => entries.find((entry) => entry.song.id === id);
  assertEqual([byId("love").cell.tone, byId("love").cell.names, byId("love").cell.swatches[0].hex], ["members", ["髙松瞳"], "#ff5c5c"], "＝LOVE：髙松瞳（赤）");
  assertEqual(byId("cameo").cell.swatches.map((swatch) => [swatch.name, swatch.hex]), [["大谷映美里", "#c9a8e8"], ["齊藤なぎさ", "#ff8fc0"]], "CAMEO：2人センター → 2色（大谷映美里・齊藤なぎさ）");
  assertEqual(byId("natsumatope").cell.swatches.map((swatch) => swatch.name), ["佐々木舞香", "野口衣織"], "ナツマトペ：佐々木舞香・野口衣織の2色");
  // 【R8 本人の決定】センターが決まっていない曲は、歌っている全員をセンターとして全員分の色で
  const activeTen = MEMBERS.filter((member) => member.status === "active").map((member) => member.name);
  assertEqual(activeTen.length, 10, "members.js の現役は10人");
  const koi = byId("koi-hajimemashita").cell;
  assertEqual([koi.tone, koi.basis, koi.shortLabel, koi.names, koi.swatches.map((swatch) => swatch.hex)], ["members", "group", "全員", activeTen, activeTen.map((name) => memberColor.get(name))], "恋、はじめました。（全員）：発売時（2026-08-26）の在籍10人の色・短い名前「全員」");
  assertEqual(byId("koi-hajimemashita").cell.names.some((name) => ["佐竹のん乃", "齊藤なぎさ"].includes(name)), false, "21st：卒業したメンバー（佐竹のん乃・齊藤なぎさ）は入れない");
  assertEqual([byId("yume-no-tsuzuki").cell.basis, byId("yume-no-tsuzuki").cell.names.length], ["group", 10], "夢の続き（全員）：在籍10人");
  const doko = byId("doko-ga-suki-ka-itte").cell;
  assertEqual([doko.tone, doko.basis, doko.shortLabel, doko.names], ["members", "unit", "4人", ["大谷映美里", "佐々木舞香", "野口衣織", "諸橋沙夏"]], "どこが好きか言って：ユニットの4人の色・短い名前「4人」");
  assertEqual([byId("genneki-idol-chu").cell.tone, byId("genneki-idol-chu").cell.basis, byId("genneki-idol-chu").cell.names, byId("genneki-idol-chu").cell.shortLabel], ["members", "unit", ["齊藤なぎさ"], null], "現役アイドルちゅ〜（ソロ）：歌う人をセンターとして色・名前");
  assertEqual([byId("queens").cell.basis, byId("queens").cell.swatches.map((swatch) => swatch.name)], ["unit", ["齋藤樹愛羅", "野口衣織"]], "Queens（2人の曲）：2人の2色");
  assertEqual([byId("866").cell.tone, byId("866").cell.names], ["all", []], "866：在籍が決められない人（加入日の無い佐竹のん乃）がいるので、今の表示（全員）のまま");
  assertEqual(model.unresolved.map((song) => song.id), ["866"], "データで決められない曲は 866 だけ（報告に一覧で書く）");
  assertEqual(entries.filter((entry) => entry.cell.tone === "singers").length, 0, "センターの区別が無いユニット曲は、すべて歌う人の色になる（斜線の表示は残らない）");
  assertEqual(entries.filter((entry) => entry.cell.basis !== "center" && entry.cell.tone === "members").every((entry) => Array.isArray(entry.song.members) || ["表題曲", "全員曲"].includes(entry.song.category)), true, "歌う人は songs.js の members か、全員の曲の在籍メンバーからだけ決める");

  // 在籍の判定（members.js の加入日・卒業日だけ）
  const testMembers = [
    { name: "A", joinDate: "2017-04-29" },
    { name: "B", joinDate: "2017-04-29", graduationDate: "2021-03-06" },
    { name: "C", joinDate: "2024-01-01" },
    { name: "D", graduationDate: "2020-01-01" },
  ];
  assertEqual(membersAtDate(testMembers, "2022-01-01"), { names: ["A"], isCertain: true, unknownNames: [] }, "在籍：卒業した人・まだ加入していない人・加入日が無くても卒業済みの人は数えない");
  assertEqual(membersAtDate(testMembers, "2019-01-01").isCertain, false, "在籍：加入日が無く、まだ卒業していない人がいると決められない");
  assertEqual(resolveSingingMembers({ category: CATEGORY.UNIT_SONG, releaseDate: "2020-01-01" }, testMembers), null, "メンバーの書かれていないユニット曲は決めない（推測しない）");
  assertEqual(resolveSingingMembers({ category: CATEGORY.GROUP_SONG, releaseDate: null }, testMembers), null, "発売日の無い曲は決めない");

  // 2人センター：songs.js でセンターが2人の曲は、すべて2色のマス
  const doubleIds = SONGS.filter((song) => song.category !== CATEGORY.SPECIAL && classifyCenter(song).state === "double").map((song) => song.id);
  const sheetDoubleIds = entries.filter((entry) => entry.cell.basis === "center" && entry.cell.swatches.length === 2).map((entry) => entry.song.id);
  assertEqual(sheetDoubleIds.slice().sort(), doubleIds.slice().sort(), "センターが決まっている曲：2人センターはすべて2色（ほかは1色）");
  assertEqual(doubleIds.length, 12, "2人センターは12曲（記憶のどこかで・CAMEO・ナツマトペ・劇薬中毒 など）");

  // 凡例：表に出るメンバーだけ（members.js の並び）。センターの回数は表のマスと同じ
  assertEqual(model.legend.map((item) => item.name), MEMBERS.filter((member) => model.legend.some((item) => item.name === member.name)).map((member) => member.name), "凡例は members.js の並び");
  assertEqual(model.legend.every((item) => item.hex === memberColor.get(item.name)), true, "凡例の色はメンバーカラー");
  const takamatsu = model.legend.find((item) => item.name === "髙松瞳");
  assertEqual(takamatsu.centerCount, entries.filter((entry) => entry.cell.tone === "members" && entry.cell.names.includes("髙松瞳")).length, "凡例の回数＝表のマスの数");
  assertEqual(model.legend.find((item) => item.name === "佐竹のん乃")?.isGraduated, true, "卒業メンバーには印");

  // ---- describeSheetCell ----
  const memberByName = new Map(MEMBERS.map((member) => [member.name, member]));
  assertEqual(describeSheetCell({ type: "unknown", names: [] }, memberByName), { tone: "unknown", swatches: [], names: [], basis: null, shortLabel: null }, "未確認（歌う人も分からない）は色を付けない（推測で埋めない）");
  assertEqual(describeSheetCell({ type: "members", names: ["存在しない人"] }, memberByName).swatches[0].hex, "#eeeeee", "知らない名前は灰色");
}

function runSheetGrowthAndLayoutTests() {
  console.log("--- R8：センターの1枚表（22nd・大きさ） ---");
  // 22nd を songs.js に足したら（テストの中だけ）、21st の下・他 の上に行が増える
  const newSongs = [
    { id: "test-22-title", workId: "single-22", title: "テスト表題曲", category: CATEGORY.TITLE_TRACK, releaseDate: "2027-02-01", single: "22ndシングル「テスト表題曲」", center: ["瀧脇笙古", "音嶋莉沙"], centerType: "double" },
    { id: "test-22-group", workId: "single-22", title: "テスト全員曲", category: CATEGORY.GROUP_SONG, releaseDate: "2027-02-01", single: "22ndシングル「テスト表題曲」", center: ["山本杏奈"], centerType: "single" },
  ];
  const grown = buildCenterSheetModel([...SONGS, ...newSongs], { discography: DISCOGRAPHY });
  const labels = grown.rows.map((row) => row.label);
  assertEqual([grown.rows.length, labels.at(-3), labels.at(-2), labels.at(-1)], [24, "21st", "22nd", "他"], "22nd：自動で 21st の下・他 の上に1行増える");
  const row22 = grown.rows.at(-2);
  assertEqual([row22.columns.title[0].cell.swatches.map((swatch) => swatch.name), row22.columns.group[0].cell.names], [["瀧脇笙古", "音嶋莉沙"], ["山本杏奈"]], "22nd：2人センターも2色で出る");
  assertEqual(renderCenterSheet(grown).querySelector(".cs-caption").textContent.includes("1st〜22nd"), true, "22nd：表の題名も「1st〜22nd」");
  assertEqual(buildHomeInfoStats({ discography: [...DISCOGRAPHY, { workId: "single-22", type: "single" }] }).centerSheetSub, "1st〜22ndを|1枚で", "22nd：ホームの説明も自動");
  assertEqual(buildHomeInfoStats({ discography: DISCOGRAPHY }).centerSheetSub, "1st〜21stを|1枚で", "今：ホームの説明は「1st〜21stを1枚で」");
  assertEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(formatOrdinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"], "序数（1st・11th・21st・22nd）");

  // 曲名の文字の大きさ
  assertEqual(fitSheetFontSize("＝LOVE", 158), 12, "短い曲名は 12px のまま");
  const long = "「部活中に目が合うなって思ってたんだ」";
  assertEqual([fitSheetFontSize(long, 158) < 12, fitSheetFontSize(long, 158) >= CENTER_SHEET_SIZE.minFontSize], [true, true], "長い曲名は小さく（7px より小さくしない）");
  assertEqual(fitSheetFontSize("Want you！Want you！", 158) > fitSheetFontSize("ラストノートしか知らない＋＋＋＋＋＋＋", 158), true, "半角は全角より狭く見積もる");

  // 2段に分ける：作品の途中で切らない・順番を変えない・左右の行数がなるべく同じ
  const model = buildCenterSheetModel(SONGS, { discography: DISCOGRAPHY });
  const [left, right] = splitSheetRows(model.rows);
  assertEqual([...left, ...right].map((row) => row.key), model.rows.map((row) => row.key), "2段：順番どおりに左右へ分ける");
  const lines = (rows) => rows.reduce((sum, row) => sum + row.lineCount, 0);
  assertEqual(Math.abs(lines(left) - lines(right)) <= 4, true, "2段：左右の行数の差は小さい");

  // 1段／2段の選び方
  assertEqual(pickSheetLayout(model, { width: 358, height: 600 }).layout, "single", "スマホ縦（幅 390）：1段");
  assertEqual(pickSheetLayout(model, { width: 990, height: 1100 }).layout, "single", "iPad 縦：1段");
  assertEqual(pickSheetLayout(model, { width: 1350, height: 560 }).layout, "double", "PC（1440×900）：横に広く低いので2段");
  const phone = pickSheetLayout(model, { width: 358, height: 600 });
  assertEqual(Math.abs(phone.scale - 358 / estimateSheetSize(model.lineCount, 1, 2).width) < 0.05, true, "スマホ縦：幅に合わせて縮小");
  assertEqual(pickSheetLayout(model, { width: 5000, height: 5000 }).scale, 1.4, "大きな画面でも 1.4 倍まで");
  assertEqual(fitSheetScale({ width: 1000, height: 1000 }, { width: 500, height: 800 }), 0.5, "倍率＝幅・高さの小さいほう");
  assertEqual(fitSheetScale({ width: 0, height: 0 }, { width: 500, height: 800 }), 1, "大きさが測れないときは 1");
}

// tests.html は画面の CSS を読み込まないので、大きさを確かめる間だけ 1枚表の CSS を足す
async function withSheetStylesheet(run) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/centerSheet.css";
  const loaded = new Promise((resolve) => {
    link.onload = resolve;
    link.onerror = resolve;
  });
  document.head.appendChild(link);
  await loaded;
  try {
    await run();
  } finally {
    link.remove();
  }
}

async function runSheetDomTests() {
  if (typeof document === "undefined") return;
  console.log("--- R8：センターの1枚表（画面） ---");
  const model = buildCenterSheetModel(SONGS, { discography: DISCOGRAPHY });
  const sheet = renderCenterSheet(model);
  assertEqual(sheet.querySelectorAll(".cs-row").length, 23, "画面：23行（作品ごとの tbody）");
  assertEqual(sheet.querySelectorAll(".cs-table").length, 1, "1段のときは表が1つ");
  assertEqual([...sheet.querySelectorAll(".cs-label-main")].map((node) => node.textContent).join(","), model.rows.map((row) => row.label).join(","), "左端の列：1st〜21st・アルバム・他");
  assertEqual(sheet.querySelectorAll(".cs-song[data-song-id]").length, 83, "曲名のマスは83");
  assertEqual([...sheet.querySelectorAll(".cs-head")].map((node) => node.textContent), ["", "表題曲", "全員曲", "ユニット曲"], "列の見出し：表題曲／全員曲／ユニット曲");
  // 行の高さが崩れていない：各行の tr の数＝行の高さ（曲の数の多い列）
  assertEqual([...sheet.querySelectorAll(".cs-row")].map((tbody) => tbody.rows.length), model.rows.map((row) => row.lineCount), "各行の tr の数＝その作品の曲の多い列の数");
  // 各行の中で、どの列も行の高さぶん埋まる：曲名のマス（空きのマスを含む）の rowSpan の合計＝ 3列 × 行の高さ
  const filled = [...sheet.querySelectorAll(".cs-row")].every((tbody) => {
    const total = [...tbody.querySelectorAll("td.cs-song")].reduce((sum, cell) => sum + cell.rowSpan, 0);
    const centers = [...tbody.querySelectorAll("td.cs-center")].reduce((sum, cell) => sum + cell.rowSpan, 0);
    return total === 3 * tbody.rows.length && centers === total;
  });
  assertEqual(filled, true, "どの列も行の高さぶんのマスがある（表が崩れない）");
  const cameo = sheet.querySelector('.cs-song[data-song-id="cameo"]').nextElementSibling;
  assertEqual([cameo.classList.contains("is-multi"), [...cameo.querySelectorAll(".cs-swatch")].map((node) => node.textContent)], [true, ["大谷映美里", "齊藤なぎさ"]], "画面：CAMEO のセンターは2色・2人の名前");
  assertEqual(cameo.querySelector(".cs-swatch").style.backgroundColor, "rgb(201, 168, 232)", "画面：大谷映美里のマスは薄紫（#c9a8e8）");
  const koiCell = sheet.querySelector('.cs-song[data-song-id="koi-hajimemashita"]').nextElementSibling;
  assertEqual([koiCell.classList.contains("is-band"), koiCell.querySelectorAll(".cs-band").length, koiCell.querySelector(".cs-band-label")?.textContent], [true, 10, "全員"], "画面：恋、はじめました。は10色の細い帯＋「全員」");
  assertEqual(koiCell.querySelector(".cs-swatches").getAttribute("aria-label").includes("佐々木舞香"), true, "画面：帯の一人ひとりの名前は読み上げの説明に入る");
  const dokoCell = sheet.querySelector('.cs-song[data-song-id="doko-ga-suki-ka-itte"]').nextElementSibling;
  assertEqual([dokoCell.querySelectorAll(".cs-band").length, dokoCell.querySelector(".cs-band-label")?.textContent, dokoCell.dataset.names], [4, "4人", "大谷映美里,佐々木舞香,野口衣織,諸橋沙夏"], "画面：どこが好きか言って は4色の帯＋「4人」");
  assertEqual(sheet.querySelector('.cs-song[data-song-id="866"]').nextElementSibling.textContent, "全員", "画面：866 は今の表示（全員）のまま");
  assertEqual(sheet.querySelector(".cs-legend").textContent.includes("細い色の帯"), true, "凡例：細い色の帯の説明");
  assertEqual(sheet.querySelector(".cs-legend").textContent.includes("斜線"), false, "凡例：斜線の説明は無くなった");
  assertEqual(sheet.querySelectorAll(".cs-legend-member").length, model.legend.length, "凡例：メンバーの数");
  assertEqual(sheet.querySelector(".cs-legend").textContent.includes("2人センター"), true, "凡例：2色＝2人センター の説明");
  assertEqual(renderCenterSheet(model, { layout: "double" }).querySelectorAll(".cs-table").length, 2, "2段のときは表が2つ");
  assertEqual(renderCenterSheet(model, { layout: "double" }).querySelectorAll(".cs-row").length, 23, "2段でも23行");

  // 部品：曲名を押す → onOpenSong、凡例を押す → その人のマスだけ目立たせる
  const opened = [];
  const panel = createCenterSheetPanel(model, { onOpenSong: (songId) => opened.push(songId) });
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-10000px;top:0;width:390px;";
  document.body.appendChild(host);
  host.appendChild(panel.element);
  panel.fit();
  panel.element.querySelector('.cs-song-button[data-song-id="be-selfish"]').click();
  assertEqual(opened, ["be-selfish"], "曲名を押すと、その曲のページへ（onOpenSong）");
  panel.element.querySelector('.cs-legend-member[data-name="野口衣織"]').click();
  const hits = [...panel.element.querySelectorAll(".cs-center.is-hit")];
  assertEqual([panel.getState().highlight, hits.length > 0, hits.every((td) => td.dataset.names.split(",").includes("野口衣織"))], ["野口衣織", true, true], "凡例の名前を押すと、その人のマスだけ目立つ");
  panel.element.querySelector('.cs-legend-member[data-name="野口衣織"]').click();
  assertEqual([panel.getState().highlight, panel.element.querySelectorAll(".cs-center.is-hit").length], [null, 0], "もう一度押すと元に戻る");
  const state = panel.getState();
  assertEqual([state.scale < 1, state.natural.width > 900], [true, true], "幅 390 の枠では縮小して全体を入れる");
  assertEqual(panel.element.querySelector(".cs-frame-cover").hidden, state.scale >= 0.75, "小さいときは「押すと拡大」の覆いを出す");
  // 拡大ビューア
  panel.openViewer({ x: 100, y: 200 });
  const viewer = document.querySelector(".cs-viewer");
  assertEqual([Boolean(viewer), viewer?.getAttribute("role"), viewer?.querySelectorAll(".cs-row").length], [true, "dialog", 23], "拡大ビューア：全体の表を開く");
  assertEqual(panel.getState().viewerZoom, 1, "拡大ビューア：最初は等倍（12px の文字）");
  viewer.querySelector(".cs-viewer-zoom-in").click();
  assertEqual(panel.getState().viewerZoom > 1, true, "［＋］で拡大");
  viewer.querySelector(".cs-viewer-fit").click();
  assertEqual(panel.getState().viewerZoom <= 1, true, "［全体］で全体の大きさへ");
  viewer.querySelector('.cs-song-button[data-song-id="love"]').click();
  assertEqual([opened.at(-1), document.querySelector(".cs-viewer"), panel.getState().isViewerOpen], ["love", null, false], "ビューアの曲名を押すと、閉じてから曲のページへ");
  panel.openViewer(null);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  assertEqual(document.querySelector(".cs-viewer"), null, "Esc で閉じる");
  host.remove();
}

// 歴代センターのページ（タブ）と、入口
async function runSheetPageAndEntryTests() {
  if (typeof document === "undefined") return;
  console.log("--- R8：センターの1枚表（ページ・入口） ---");
  const storageKey = "equalLoveIntroQuiz.centersViewMode";
  let savedMode = null;
  try {
    savedMode = localStorage.getItem(storageKey);
  } catch {
    savedMode = null;
  }
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-10000px;top:0;width:390px;";
  document.body.appendChild(host);
  const openedSongs = [];
  initCentersScreen({ container: host }, { onOpenSong: (songId) => openedSongs.push(songId), onOpenMember: () => {} });
  openCentersScreen({ view: "sheet" });
  const tabs = [...host.querySelectorAll(".centers-view-tab")];
  assertEqual(tabs.map((tab) => tab.textContent), ["1枚表", "一覧カード", "センター表"], "歴代センターのページに［1枚表］のタブ（一覧カード・センター表はそのまま）");
  assertEqual(tabs[0].getAttribute("aria-selected"), "true", "楽曲の側の入口（view: sheet）からは1枚表で開く");
  const panel = host.querySelector(".cs-panel");
  assertEqual([panel.hidden, host.querySelector(".center-row-list").hidden, host.querySelector(".centers-table-panel").hidden, host.querySelector(".centers-controls").hidden], [false, true, true, true], "1枚表のときは一覧・表・検索を隠す");
  assertEqual(panel.querySelectorAll(".cs-row").length, 23, "ページの1枚表も23行");
  panel.querySelector('.cs-song-button[data-song-id="cameo"]').click();
  assertEqual(openedSongs, ["cameo"], "ページの1枚表の曲名 → ページの onOpenSong（一覧カードと同じ行き先）");
  host.querySelector('.centers-view-tab[data-view="cards"]').click();
  assertEqual([panel.hidden, host.querySelector(".center-row-list").hidden, host.querySelector(".centers-controls").hidden], [true, false, false], "一覧カードへ切り替えると、今までどおり");
  host.querySelector('.centers-view-tab[data-view="sheet"]').click();
  let stored = null;
  try {
    stored = localStorage.getItem(storageKey);
  } catch {
    stored = "sheet";
  }
  assertEqual(stored, "sheet", "1枚表も「最後に選んだ表示」として覚える");
  host.remove();
  try {
    if (savedMode === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, savedMode);
  } catch {
    // 保存できない環境では何もしない
  }

  // 入口
  assertEqual(HOME_ACTIONS["center-sheet"], { type: "callback", value: "openCenterSheet" }, "ホームの「センター1枚表」→ main.js の openCenterSheet");
  assertEqual(HOME_ACTIONS.centers, { type: "callback", value: "openCenters" }, "＝LOVE の側の「歴代センター」は今までどおり（補助の入口）");
  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const readButtons = [...doc.querySelectorAll("#home-card-music .home-music-col--read button")];
  assertEqual(readButtons.map((button) => button.dataset.homeAction), ["songlist", "works", "center-sheet"], "ホーム「楽曲・歌詞を楽しむ」→「読む・調べる」に「センター1枚表」");
  assertEqual(readButtons[2].querySelector("b").textContent, "センター1枚表", "入口の題名");
  assertEqual(Boolean(doc.querySelector("#music-hub-screen #center-sheet-hub-link")), true, "楽曲・歌詞の画面にも入口");
  assertEqual(Boolean(doc.querySelector("#discography-works-panel #centers-link")), true, "＝LOVE の側（作品一覧）の歴代センターへのリンクは残す");
  assertEqual(Boolean(doc.querySelector('#home-card-know [data-home-action="centers"]')), true, "＝LOVE をもっと知る の「歴代センター」も残す");
  assertEqual(Boolean(doc.querySelector('link[href="css/centerSheet.css"]')), true, "1枚表の CSS を読み込む");
  const main = await fetchText("js/main.js");
  assertEqual(main.includes('openCenterSheet: () => openCentersFrom("start", null, "sheet")'), true, "ホームの入口は1枚表で開き、戻る先はホーム");
  assertEqual(main.includes('openCentersFrom("musicHub", null, "sheet")'), true, "楽曲・歌詞の画面の入口は、戻る先が楽曲・歌詞の画面");
  const sw = await fetchText("sw.js");
  assertEqual(["./js/centerSheet.js", "./js/centerSheetView.js", "./css/centerSheet.css"].every((file) => sw.includes(`"${file}"`)), true, "新しいファイルを APP_SHELL に入れる（オフラインでも開ける）");
  const css = await fetchText("css/centerSheet.css");
  assertEqual(css.includes("prefers-reduced-motion"), true, "動きを減らす設定に対応");
  assertEqual(buildCenterTableModel(SONGS, { discography: DISCOGRAPHY }).groups.length, 27, "既存のセンター表（作品ごと27）は変えない");
}

export async function runCenterSheetTests() {
  runSheetModelTests();
  runSheetGrowthAndLayoutTests();
  if (typeof document === "undefined") return;
  await withSheetStylesheet(async () => {
    await runSheetDomTests();
    await runSheetPageAndEntryTests();
  });
}
