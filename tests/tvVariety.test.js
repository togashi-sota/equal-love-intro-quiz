// 【2026-11-01新設】「テレビ出演（バラエティ・情報番組）」の回帰テスト。
// データの整合（確認済みだけ・重複なし・メンバーの id・出演の形・音楽番組やレギュラーと混ざっていない・要約を持ち込まない）、
// 絞り込み・検索（かな・カナ・全角・半角）、画面（年ごとにたたむ・続き・リンク・メンバーで開く）、
// 行き先（ホーム・年表タブ・音楽番組・メンバーのページ・全体検索・ガイド）を確かめる。
import { TV_VARIETY_RECORDS, TV_VARIETY_REGULARS, TV_VARIETY_STATION_FILTERS, TV_VARIETY_CHECKED_DATE } from "../js/data/tvVariety.js";
import { TV_APPEARANCE_RECORDS } from "../js/data/tvAppearances.js";
import { MEMBERS } from "../js/data/members.js";
import {
  TV_VARIETY_FORMS,
  availableTvVarietyStations,
  availableTvVarietyYears,
  countTvVarietyByMember,
  filterTvVariety,
  filterTvVarietyRegulars,
  formatRegularPeriod,
  formatTvVarietyDate,
  groupTvVarietyByProgram,
  groupTvVarietyByYear,
  isDefaultTvVarietyFilter,
} from "../js/tvVarietyModel.js";
import { initTvVarietyScreen, openTvVarietyScreen, TV_VARIETY_YEAR_PAGE_SIZE } from "../js/tvVarietyScreen.js";
import { buildAppSearchEntries, searchAppEntries } from "../js/appSearchIndex.js";
import { APP_SEARCH_FEATURES } from "../js/data/appSearchFeatures.js";
import { GUIDE_SECTIONS, GUIDE_CATEGORIES } from "../js/data/guideContent.js";
import { GUIDE_RETURN_HUBS_OF_SCREEN } from "../js/appNavigationStack.js";
import { normalizeSearchText } from "../js/searchNormalize.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const memberIds = MEMBERS.map((member) => member.id);
const count = (filter) => filterTvVariety(TV_VARIETY_RECORDS, filter).length;

function runDataTests() {
  const records = TV_VARIETY_RECORDS;
  assertEqual(records.length, 380, "データ：単発・少数回の出演は380件（調査の381件から、同じ日・同じ番組の告知2件を1件にまとめた）");
  assertEqual(new Set(records.map((r) => r.id)).size, records.length, "データ：id が重ならない");
  const urls = records.flatMap((r) => r.officialUrls);
  assertEqual(new Set(urls).size, urls.length, "データ：同じ公式の告知が2件に入っていない");
  assertEqual(records.every((r) => r.officialUrls.length > 0 && r.officialUrls.every((u) => /^https:\/\/equal-love\.jp\/schedule\/detail\/\d+$/.test(u))), true, "データ：全部に＝LOVE 公式の告知（詳細ページ）の URL");
  const sameBroadcast = new Set(records.map((r) => `${r.date}|${normalizeSearchText(r.program)}|${r.station}`));
  assertEqual(sameBroadcast.size, records.length, "データ：同じ日・同じ番組・同じ局の回が2件ない（二重に数えない）");
  assertEqual(records.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date <= TV_VARIETY_CHECKED_DATE && (!r.dateEnd || r.dateEnd > r.date)), true, "データ：日付の形・確かめた日より前・まとめた回の終わりの日");
  assertEqual(records.every((r, i) => i === 0 || records[i - 1].date >= r.date), true, "データ：新しい順");
  assertEqual(records.every((r) => r.checkedDate === TV_VARIETY_CHECKED_DATE && /^\d{4}-\d{2}-\d{2}$/.test(r.checkedDate)), true, "データ：全部に確かめた日");
  assertEqual(records.every((r) => r.memberIds.every((id) => memberIds.includes(id)) && new Set(r.memberIds).size === r.memberIds.length), true, "データ：メンバーは members.js の id（重なりなし）");
  assertEqual(
    records.every((r) => r.form === (r.memberIds.length === 0 ? "group" : r.memberIds.length === 1 ? "solo" : "multiple")),
    true,
    "データ：出演の形は人数と合う（名前なし＝＝LOVE 名義・1人＝個人・2人以上＝複数人）"
  );
  assertEqual(
    [records.filter((r) => r.form === "group").length, records.filter((r) => r.form === "solo").length, records.filter((r) => r.form === "multiple").length],
    [45, 254, 81],
    "データ：＝LOVE 名義45・個人254・複数人81"
  );
  const filterIds = TV_VARIETY_STATION_FILTERS.map((s) => s.id);
  assertEqual(records.every((r) => filterIds.includes(r.stationFilter)), true, "データ：放送局の区分は決まった中のどれか");
  assertEqual(records.every((r) => Boolean(r.streaming) === (r.stationFilter === "streaming")), true, "データ：配信番組の印と、放送局の区分「配信」が同じ");
  assertEqual(records.filter((r) => r.commentOnly).length, 44, "データ：コメント出演44件");
  // 持ち込まないもの
  const text = JSON.stringify(records);
  assertEqual(/"summary"|"genre"|"status"/.test(text), false, "データ：告知から作った短文（summary）・推定のジャンルを持ち込まない（確認済みだけなので状態も持たない）");
  assertEqual(/志村どうぶつ園/.test(text + JSON.stringify(TV_VARIETY_REGULARS)), false, "データ：「志村どうぶつ園」は入れない（出演が見つかっていない）");
  assertEqual(records.some((r) => (r.announcementSongIds ?? []).includes("love")), false, "データ：曲名「＝LOVE」はグループ名と区別できないので、告知の曲名に入れない");
  // 調べた例（本人が挙げた大谷映美里の出演）
  const otani = records.filter((r) => r.memberIds.includes("otani-emiri"));
  assertEqual(
    ["2025-04-13", "2026-08-02", "2026-10-27"].every((date) => otani.some((r) => r.date === date)),
    true,
    "データ：大谷映美里の例（バカリ山里の操縦AWARD・家、ついて行ってイイですか？・ヒルナンデス！）が入っている"
  );
  // 音楽番組のページと二重にしない
  const music = new Set(TV_APPEARANCE_RECORDS.map((r) => `${r.date}|${normalizeSearchText(r.program)}`));
  assertEqual(records.filter((r) => music.has(`${r.date}|${normalizeSearchText(r.program)}`)).map((r) => r.id), [], "データ：音楽番組のページと同じ日・同じ番組の回は無い");
  assertEqual(records.filter((r) => /ミュージックステーション|CDTV|うたコン|FNS歌謡祭|MUSIC FAIR|バズリズム/.test(r.program)).map((r) => r.id), [], "データ：歌番組（Mステ・CDTV・うたコンなど）は入れない");
  // レギュラーは別枠：シーズンレギュラーの期間のラヴィット！は単発に入れない
  const inSeason = records.filter(
    (r) => /ラヴィット/.test(r.program) && ((r.memberIds.includes("otani-emiri") && r.date >= "2024-10-08" && r.date <= "2024-12-25") || (r.memberIds.includes("noguchi-iori") && r.date >= "2025-10-07" && r.date <= "2025-12-23"))
  );
  assertEqual(inSeason.map((r) => r.id), [], "データ：ラヴィット！のシーズンレギュラーの期間の回は単発に入れない");
  const regularNames = /^(キミは.*＝LOVE.*を愛せるか|イコノイ、どーですか|アイ[=＝]ラブ！げーみんぐ|超無敵クラス$|ジャパコン|夜な夜なプロジェクト|プロ野球ニュース$|Lemino Football|スナック沙夏|イコラブコッコッコー)/;
  assertEqual(records.filter((r) => regularNames.test(r.program)).map((r) => r.id), [], "データ：冠番組・レギュラー番組は単発の一覧に入れない");

  // レギュラー番組（別枠）
  assertEqual(TV_VARIETY_REGULARS.length, 25, "レギュラー：25番組（表記ゆれ・シリーズをまとめた）");
  assertEqual(TV_VARIETY_REGULARS.every((g) => g.program && g.kind && g.firstDate <= g.lastDate && g.memberIds.every((id) => memberIds.includes(id))), true, "レギュラー：番組名・区分・期間・メンバー");
  assertEqual(new Set(TV_VARIETY_REGULARS.map((g) => `${g.program}|${g.memberIds.join(",")}`)).size, TV_VARIETY_REGULARS.length, "レギュラー：同じ番組が2回出てこない（ラヴィット！は大谷映美里・野口衣織のシーズンで別）");
  assertEqual(TV_VARIETY_REGULARS.filter((g) => g.program.startsWith("ラヴィット")).map((g) => g.memberIds).sort(), [["noguchi-iori"], ["otani-emiri"]], "レギュラー：ラヴィット！のシーズンレギュラーは2人分");
}

function runModelTests() {
  const all = TV_VARIETY_RECORDS.length;
  assertEqual(count({}), all, "絞り込み：初めは全部");
  assertEqual(TV_VARIETY_FORMS.map((f) => f.label), ["全部", "＝LOVE 名義", "個人", "複数人"], "絞り込み：出演の形の4つ");
  assertEqual([count({ form: "group" }), count({ form: "solo" }), count({ form: "multiple" })], [45, 254, 81], "絞り込み：出演の形");
  assertEqual(count({ memberId: "otani-emiri" }), 105, "絞り込み：メンバー（大谷映美里105件）");
  assertEqual(count({ memberId: "otani-emiri", form: "group" }), 0, "絞り込み：メンバーで絞ると＝LOVE 名義は出ない");
  assertEqual(countTvVarietyByMember(TV_VARIETY_RECORDS, "yamamoto-anna"), count({ memberId: "yamamoto-anna" }), "絞り込み：メンバーの件数とメンバーのページの数が同じ");
  assertEqual(count({ year: "2026" }), 72, "絞り込み：年（2026年72件）");
  assertEqual(count({ station: "nhk" }) + count({ station: "ntv" }) + count({ station: "ex" }) + count({ station: "tbs" }) + count({ station: "tx" }) + count({ station: "cx" }) + count({ station: "bscs" }) + count({ station: "streaming" }) + count({ station: "local" }), all, "絞り込み：放送局の区分を足すと全部（どこにも入らない回が無い）");
  assertEqual(count({ memberId: "otani-emiri", year: "2025", station: "tbs" }), 13, "絞り込み：メンバー・年・放送局を重ねられる");
  assertEqual([count({ includeComment: false }), count({ includeStreaming: false }), count({ includeComment: false, includeStreaming: false })], [all - 44, all - 14, all - 44 - 14 + TV_VARIETY_RECORDS.filter((r) => r.commentOnly && r.streaming).length], "切り替え：コメント出演・配信番組を除ける");
  // 番組名の検索：ひらがな・カタカナ・全角・半角を揃える
  const hiru = count({ query: "ヒルナンデス" });
  assertEqual(hiru, 9, "検索：番組名（ヒルナンデス 9件）");
  assertEqual([count({ query: "ひるなんです" }), count({ query: "ﾋﾙﾅﾝﾃﾞｽ" }), count({ query: "ヒルナンデス！" })], [hiru, hiru, hiru], "検索：ひらがな・半角カナ・記号つきでも同じ");
  assertEqual(count({ query: "ＡＢＥＭＡ" }), count({ query: "abema" }), "検索：全角・半角の英字も同じ");
  assertEqual([count({ query: "らびっと" }), count({ query: "ラビット" })], [count({ query: "ラヴィット" }), count({ query: "ラヴィット" })], "検索：「ヴ」の書き方の揺れ（らびっと・ラビット）も同じ");
  assertEqual(count({ query: "ヒルナンデス 2026" }) <= hiru && count({ query: "存在しない番組名" }) === 0, true, "検索：言葉をすべて含む回だけ・無い言葉は0件");
  assertEqual([isDefaultTvVarietyFilter({}), isDefaultTvVarietyFilter({ query: "  " }), isDefaultTvVarietyFilter({ memberId: "oba-hana" }), isDefaultTvVarietyFilter({ includeComment: false })], [true, true, false, false], "「条件を戻す」を出すかどうか");
  // 並べ方・年
  const groups = groupTvVarietyByYear(TV_VARIETY_RECORDS);
  assertEqual(groups.map((g) => g.year), availableTvVarietyYears(TV_VARIETY_RECORDS), "年：新しい年から順");
  assertEqual(groups[0].year, "2026", "年：いちばん上は2026年");
  assertEqual(groups.every((g) => g.records.every((r, i) => i === 0 || g.records[i - 1].date >= r.date)), true, "年：年の中も新しい順");
  assertEqual(availableTvVarietyStations(TV_VARIETY_RECORDS, TV_VARIETY_STATION_FILTERS).reduce((sum, s) => sum + s.count, 0), TV_VARIETY_RECORDS.length, "放送局の選択肢：件数の合計が全部");
  // 表示の文字
  assertEqual(formatTvVarietyDate({ date: "2026-10-27" }), "2026年10月27日（火）", "日付：曜日つき");
  assertEqual(formatTvVarietyDate({ date: "2019-11-18", dateEnd: "2019-11-22" }), "2019年11月18日（月）〜11月22日（金）", "日付：まとめた回は終わりの日まで");
  assertEqual(formatTvVarietyDate({ date: "2025-12-31", dateEnd: "2026-01-01" }), "2025年12月31日（水）〜2026年1月1日（木）", "日付：年をまたぐときは年も");
  assertEqual([formatRegularPeriod({ firstDate: "2020-09-13", lastDate: "2026-03-24" }), formatRegularPeriod({ firstDate: "2022-03-08", lastDate: "2022-03-20" })], ["2020年9月〜2026年3月", "2022年3月"], "レギュラーの期間");
  assertEqual(filterTvVarietyRegulars(TV_VARIETY_REGULARS, { memberId: "noguchi-iori" }).every((g) => g.memberIds.includes("noguchi-iori")), true, "レギュラー：メンバーで絞る");
  assertEqual(filterTvVarietyRegulars(TV_VARIETY_REGULARS, { query: "ラヴィット" }).length, 2, "レギュラー：番組名で探せる");
  // 全体検索用の番組のまとめ
  const programs = groupTvVarietyByProgram(TV_VARIETY_RECORDS);
  assertEqual(programs.reduce((sum, g) => sum + g.count, 0), TV_VARIETY_RECORDS.length, "番組ごと：回数の合計が全部");
  assertEqual(new Set(programs.map((g) => g.key)).size, programs.length, "番組ごと：同じ番組は1つ");
  assertEqual(programs.find((g) => g.program === "ヒルナンデス！")?.count, 9, "番組ごと：ヒルナンデス！は9回");
}

function runScreenTests() {
  const container = document.createElement("div");
  container.hidden = true;
  document.body.appendChild(container);
  const opened = [];
  try {
    initTvVarietyScreen({ container }, { onOpenMusicShows: () => opened.push("music") });
    openTvVarietyScreen();
    assertEqual(container.querySelector(".tvv-count").textContent, `全${TV_VARIETY_RECORDS.length}件`, "画面：初めは全部の件数");
    const years = [...container.querySelectorAll(".tvv-year")];
    assertEqual([years.length, years[0].dataset.year, years[0].open, years.slice(1).some((d) => d.open)], [10, "2026", true, false], "画面：年の見出しで区切り、いちばん新しい年だけ開く");
    assertEqual(years[0].querySelectorAll(".tvv-item").length, TV_VARIETY_YEAR_PAGE_SIZE, "画面：1つの年は初め20件");
    const more = years[0].querySelector(".tvv-more");
    assertEqual(more?.textContent, `2026年のあと${72 - TV_VARIETY_YEAR_PAGE_SIZE}件を見る`, "画面：年の続きのボタン");
    more.click();
    const year2026 = container.querySelector('.tvv-year[data-year="2026"]');
    assertEqual([year2026.open, year2026.querySelectorAll(".tvv-item").length], [true, 40], "画面：続きを押すと20件足す（開いたまま）");
    container.querySelector('.tvv-year[data-year="2019"]').open = true;
    container.querySelector('.tvv-year[data-year="2019"]').dispatchEvent(new Event("toggle"));
    container.querySelector('.tvv-year[data-year="2026"] .tvv-more').click();
    assertEqual(container.querySelector('.tvv-year[data-year="2019"]').open, true, "画面：ほかの年の続きを押しても、自分で開いた年は閉じない");
    // 1件の中身
    const first = container.querySelector(".tvv-item");
    const record = TV_VARIETY_RECORDS[0];
    const link = first.querySelector("a.tvv-source-link");
    assertEqual([link.textContent, link.getAttribute("href"), link.target, link.rel], ["公式の告知", record.officialUrls[0], "_blank", "noopener noreferrer"], "画面：1件ごとに［公式の告知］（新しいタブ）");
    assertEqual(first.querySelector(".tvv-item-program").textContent, record.program, "画面：番組名");
    assertEqual([...first.querySelectorAll(".tvv-member")].map((m) => m.textContent), record.memberIds.map((id) => MEMBERS.find((m) => m.id === id).name), "画面：メンバーは members.js の表記");
    assertEqual(Boolean(first.querySelector(".tvv-member-dot")?.style.background), true, "画面：メンバーカラーの点");
    assertEqual(/が出演。|がコメントで出演。/.test(container.textContent), false, "画面：告知から作った短文（要約に見えるもの）を出さない");
    assertEqual(container.querySelector(".tvv-hint").textContent.includes("全員とは限りません"), true, "画面：＝LOVE 名義は全員とは限らない、と短く書く");
    assertEqual([...container.querySelectorAll(".tvv-chips--members .tvv-chip")].map((chip) => chip.textContent), ["指定なし", ...MEMBERS.map((m) => m.name)], "画面：メンバーは12人（members.js の順と表記）");
    assertEqual(container.querySelectorAll(".tvv-chips--members .tvv-member-dot").length, MEMBERS.length, "画面：メンバーの札にメンバーカラー");
    // 上の案内（音楽番組へ）
    container.querySelector(".tvv-music-link").click();
    assertEqual([container.querySelector(".tvv-music-link").textContent.includes("歌の披露は［音楽番組］へ"), opened], [true, ["music"]], "画面：上に「歌の披露は［音楽番組］へ」");
    // 形の札・切り替え・戻す
    container.querySelector('.tvv-chips--forms .tvv-chip[data-value="group"]').click();
    assertEqual([container.querySelector(".tvv-count").textContent, container.querySelectorAll(".tvv-badge.is-group").length > 0, container.querySelector(".tvv-reset").hidden], [`45件（全${TV_VARIETY_RECORDS.length}件中）`, true, false], "画面：＝LOVE 名義で絞る・［条件を戻す］が出る");
    container.querySelector(".tvv-reset").click();
    assertEqual([container.querySelector(".tvv-count").textContent, container.querySelector(".tvv-reset").hidden], [`全${TV_VARIETY_RECORDS.length}件`, true], "画面：［条件を戻す］で初めに戻る");
    const comment = container.querySelector(".tvv-toggle input");
    comment.checked = false;
    comment.dispatchEvent(new Event("change"));
    assertEqual(container.querySelector(".tvv-count").textContent, `${TV_VARIETY_RECORDS.length - 44}件（全${TV_VARIETY_RECORDS.length}件中）`, "画面：「コメント出演を含む」を外す");
    // 検索：結果の年は全部開く
    const search = container.querySelector(".tvv-search");
    search.value = "ﾋﾙﾅﾝﾃﾞｽ";
    search.dispatchEvent(new Event("input"));
    assertEqual([...container.querySelectorAll(".tvv-year")].every((d) => d.open), true, "画面：番組名で探したときは、結果の年を全部開く");
    search.value = "見つからない番組";
    search.dispatchEvent(new Event("input"));
    assertEqual(Boolean(container.querySelector(".tvv-empty")), true, "画面：0件のときの案内");
    // メンバーで開く（メンバーのページ・全体検索から）
    openTvVarietyScreen({ memberId: "yamamoto-anna" });
    assertEqual(
      [container.querySelector(".tvv-chips--members .is-active")?.textContent, container.querySelector(".tvv-count").textContent.startsWith(`${countTvVarietyByMember(TV_VARIETY_RECORDS, "yamamoto-anna")}件`), container.querySelector(".tvv-search").value, container.querySelector(".tvv-toggle input").checked],
      ["山本杏奈", true, "", true],
      "画面：メンバーで絞って開く（前の検索・切り替えは戻す）"
    );
    assertEqual(container.querySelectorAll(".tvv-hint:not([hidden])").length, 2, "画面：メンバーで絞ると「＝LOVE 名義は出ない」の注意");
    const regulars = container.querySelector(".tvv-regulars");
    assertEqual([regulars.tagName, regulars.open], ["DETAILS", false], "画面：レギュラー番組は下にたたんで出す");
    assertEqual([...regulars.querySelectorAll(".tvv-regular-program")].every((p) => TV_VARIETY_REGULARS.some((g) => g.program === p.textContent && g.memberIds.includes("yamamoto-anna"))), true, "画面：レギュラーもメンバーで絞る");
    assertEqual(regulars.querySelector(".tvv-regular-meta")?.textContent.includes("年"), true, "画面：レギュラーは番組名と期間");
    openTvVarietyScreen({ query: "ヒルナンデス！" });
    assertEqual(container.querySelector(".tvv-count").textContent, `9件（全${TV_VARIETY_RECORDS.length}件中）`, "画面：番組名で開く（全体検索から）");
    openTvVarietyScreen();
    assertEqual(container.querySelector(".tvv-count").textContent, `全${TV_VARIETY_RECORDS.length}件`, "画面：入口から開き直すと条件は初めに戻る");
  } finally {
    container.remove();
  }
}

function runLinkTests() {
  // ガイド
  const guide = GUIDE_SECTIONS.find((section) => section.id === "tvVariety");
  assertEqual(guide?.actions?.[0]?.open, { click: "tv-variety-home-link" }, "ガイド：テレビ出演の項目から開ける");
  assertEqual(GUIDE_CATEGORIES.find((category) => category.id === "info").sectionIds.includes("tvVariety"), true, "ガイド：＝LOVE情報の目次にある");
  assertEqual(GUIDE_RETURN_HUBS_OF_SCREEN.tvVariety, ["guide"], "ガイドから開いたら、戻るでガイドへ");
  // 全体検索
  const entries = buildAppSearchEntries();
  const hiru = searchAppEntries(entries, "ヒルナンデス").results;
  assertEqual(hiru[0]?.entry.action.target, { kind: "tvVariety", query: "ヒルナンデス！" }, "検索：番組名で出て、テレビ出演の一覧（その番組）へ");
  assertEqual(searchAppEntries(entries, "ひるなんです").results[0]?.entry.key, hiru[0]?.entry.key, "検索：番組名はひらがなでも");
  const otani = searchAppEntries(entries, "大谷映美里").results;
  assertEqual(otani[0]?.entry.key, "member:otani-emiri", "検索：メンバー名の先頭は今までどおりメンバー本人");
  assertEqual(otani.find((r) => r.entry.key === "tvVarietyMember:otani-emiri")?.entry.action.target, { kind: "tvVariety", memberId: "otani-emiri" }, "検索：メンバー名で「○○のテレビ出演」が出て、そのメンバーで絞った一覧へ");
  assertEqual(otani.filter((r) => r.entry.key.startsWith("tvVariety:")).length, 0, "検索：メンバー名だけでは番組の結果を並べない（結果が番組で埋まらないように）");
  assertEqual(searchAppEntries(entries, "山本杏奈 テレビ").results.some((r) => r.entry.key === "tvVarietyMember:yamamoto-anna"), true, "検索：「山本杏奈 テレビ」でも出る");
  assertEqual(searchAppEntries(entries, "バラエティ").results[0]?.entry.key, "feature:feature-tv-variety", "検索：「バラエティ」でテレビ出演のページが先頭");
  assertEqual(APP_SEARCH_FEATURES.find((feature) => feature.id === "feature-tv-variety")?.action, { type: "click", selector: "#tv-variety-home-link" }, "検索：機能の入口はホームのボタン");
  assertEqual(searchAppEntries(entries, "Mステ").results[0]?.entry.action.target.kind, "tvAppearances", "検索：歌番組（Mステ）は今までどおり音楽番組へ");
  assertEqual(entries.filter((e) => e.key.startsWith("tvVariety")).every((e) => e.category === "program"), true, "検索：テレビ出演は「番組・活動」の分類");
}

async function runMarkupTests() {
  const [html, sw, main, membersScreen] = await Promise.all([fetchText("index.html"), fetchText("sw.js"), fetchText("js/main.js"), fetchText("js/membersScreen.js")]);
  const doc = new DOMParser().parseFromString(html, "text/html");
  assertEqual(doc.querySelector("#home-card-know #tv-variety-home-link b")?.textContent, "テレビ出演", "入口：ホームの「＝LOVEをもっと知る」に［テレビ出演］");
  assertEqual(Boolean(doc.querySelector("#tv-variety-home-link use[href='#hi-tv-smile']")) && Boolean(doc.querySelector("symbol#hi-tv-smile")), true, "入口：音楽番組と見分けられるアイコン");
  assertEqual(Boolean(doc.querySelector("#discography-history-panel #tv-variety-link")), true, "入口：「＝LOVEについて」の年表タブ（音楽番組の入口の隣）");
  assertEqual(Boolean(doc.querySelector("#tv-variety-screen #tv-variety-back-button.back-link")) && Boolean(doc.querySelector("#tv-variety-content")), true, "画面：戻るボタンと中身の入れ物");
  assertEqual(doc.querySelector("#tv-variety-screen h2")?.textContent, "テレビ出演", "画面：題名");
  assertEqual(Boolean(doc.querySelector('link[href="css/tvVariety.css"]')), true, "画面：CSS を読み込む");
  assertEqual(["./css/tvVariety.css", "./js/tvVarietyScreen.js", "./js/tvVarietyModel.js", "./js/data/tvVariety.js"].every((file) => sw.includes(`"${file}"`)), true, "オフライン：新しいファイルを APP_SHELL に入れた");
  assertEqual(
    main.includes('target.kind === "tvVariety"') && main.includes('openTvVarietyFrom("start")') && main.includes('openTvVarietyFrom("memberDetail", { memberId })') && main.includes("onOpenTvVariety"),
    true,
    "行き先：ホーム・年表タブ・メンバーのページ・音楽番組・全体検索から開く処理がある"
  );
  assertEqual(membersScreen.includes("member-tv-variety-link") && membersScreen.includes("countTvVarietyByMember"), true, "メンバーのページ：件数つきの導線");
}

export async function runTvVarietyTests() {
  console.log("--- テレビ出演（バラエティ・情報番組）（2026-11-01） ---");
  runDataTests();
  runModelTests();
  runScreenTests();
  runLinkTests();
  await runMarkupTests();
}
