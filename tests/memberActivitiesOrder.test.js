// 【2026-09-30新設・本人指示】メンバー個人紹介の「活動一覧」について、
//   ・新しい活動ほど上、古い活動ほど下（全メンバー共通の日付降順）
//   ・今回追加した野口衣織（tocco closet）・大場花菜（REDYAZEL）が正しいリンクで載っている
//   ・日付データが壊れていても画面が落ちない
// ことを固定する回帰テスト。今後どの位置にデータを追記しても表示順が崩れないようにするのが目的。
import { MEMBER_ACTIVITIES, ACTIVITY_STATUS } from "../js/data/memberActivities.js";
import { GROUP_ACTIVITIES } from "../js/data/groupActivities.js";
import { MEMBERS } from "../js/data/members.js";
import { getMemberActivities } from "../js/memberUtils.js";
import { sortActivitiesByDateDesc, getActivitySortDate, buildActivityCard } from "../js/membersScreen.js";
import { assertEqual } from "./test-utils.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function findActivity(id) {
  return MEMBER_ACTIVITIES.find((activity) => activity.id === id) ?? null;
}

export function runMemberActivitiesOrderTests() {
  // ---- A. 野口衣織に 2026-09-30 の tocco closet 項目がある ----
  const tocco = findActivity("noguchi-tocco-closet");
  assertEqual(tocco !== null, true, "A: 野口衣織の tocco closet 活動が登録されている");
  assertEqual(tocco.memberId, "noguchi-iori", "A: memberId が野口衣織");
  assertEqual(tocco.startDate, "2026-09-30", "A: 公式発表・公開日 2026-09-30 が基準日");
  assertEqual(tocco.type, "model", "A: 種別はモデル");
  assertEqual(tocco.title.includes("tocco closet") && tocco.title.includes("2026 AW"), true, "A: タイトルにブランド名とコレクション名が入る");

  // ---- B. 大場花菜に 2026-09-30 の REDYAZEL 項目がある ----
  const redyazel = findActivity("oba-redyazel");
  assertEqual(redyazel !== null, true, "B: 大場花菜の REDYAZEL 活動が登録されている");
  assertEqual(redyazel.memberId, "oba-hana", "B: memberId が大場花菜");
  assertEqual(redyazel.startDate, "2026-09-30", "B: 公式発表日 2026-09-30 が基準日");
  assertEqual(redyazel.type, "model", "B: 種別はモデル");
  assertEqual(redyazel.title.includes("REDYAZEL") && redyazel.title.includes("Azely"), true, "B: タイトルにブランド名とコレクション名が入る");

  // ---- C. 両方のリンクが「本人が掲載されている公式ページ」そのもの ----
  assertEqual(
    tocco.url,
    "https://www.tocco-closet.co.jp/catalog/20260930/20260930_sp.html",
    "C: tocco closet は本人掲載のWEBカタログ本体へ直接飛ぶ（ブランドのトップページや＝LOVEニュースではない）"
  );
  assertEqual(
    redyazel.url,
    "https://www.burnedestrose.com/shop/e/e260930Ra/",
    "C: REDYAZEL は本人掲載の特設ページへ直接飛ぶ"
  );
  [tocco, redyazel].forEach((activity) => {
    assertEqual(activity.url.startsWith("https://"), true, `C: ${activity.id} の主リンクは https`);
    assertEqual(activity.url.includes("equal-love.jp"), false, `C: ${activity.id} の主リンクは＝LOVEニュースではない`);
    assertEqual(activity.sourceType, "official", `C: ${activity.id} は公式情報として登録`);
    assertEqual(activity.sourceUrls.some((url) => url.includes("equal-love.jp/news/detail/")), true, `C: ${activity.id} は＝LOVE公式ニュースを根拠に持つ`);
  });

  // ---- D／E／F. 全メンバーで活動一覧が日付降順（新しいものが一番上・古いものが一番下） ----
  let memberWithActivities = 0;
  MEMBERS.forEach((member) => {
    const activities = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, member.id));
    if (activities.length === 0) return;
    memberWithActivities += 1;
    const dates = activities.map((activity) => getActivitySortDate(activity));
    const dated = dates.filter((date) => date !== null);
    // E/F: 日付のあるものは必ず降順、日付が無いものは必ず後ろ
    const sortedDesc = [...dated].sort().reverse();
    assertEqual(dated, sortedDesc, `D/E/F: ${member.name} の活動が日付の新しい順に並ぶ`);
    const firstNullIndex = dates.indexOf(null);
    assertEqual(
      firstNullIndex === -1 || dates.slice(firstNullIndex).every((date) => date === null),
      true,
      `D: ${member.name} は日付不明の活動が末尾にまとまる`
    );
  });
  assertEqual(memberWithActivities > 0, true, "D: 活動を持つメンバーが存在する（テストが空振りしていない）");

  // 今回追加した2件が、それぞれのメンバーの先頭（＝一番新しい）に来る
  const noguchiSorted = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, "noguchi-iori"));
  assertEqual(noguchiSorted[0].id, "noguchi-tocco-closet", "E: 野口衣織は 2026-09-30 の tocco closet が一番上");
  const obaSorted = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, "oba-hana"));
  // 2026-10-02：さいたま観光大使（2026-10-01）が加わったため、REDYAZEL（2026-09-30）は2番目になる
  assertEqual(obaSorted[1].id, "oba-redyazel", "E: 大場花菜は 2026-09-30 の REDYAZEL が（さいたま観光大使の次の）2番目");
  assertEqual(
    obaSorted.map((activity) => activity.id),
    ["oba-saitama-tourism-ambassador", "oba-redyazel", "oba-manga", "oba-artistspoken"],
    "F: 大場花菜は 2026-10-01 → 2026-09-30 → 2026-03-30（終了）→ 2024-06-14（継続中）の順（＝継続中でも日付が古ければ下）"
  );

  // 旧仕様（status優先）なら上に来ていた継続中の古い活動が、新しい活動より下になる
  const otaniSorted = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, "otani-emiri"));
  const otaniIds = otaniSorted.map((activity) => activity.id);
  assertEqual(
    otaniIds.indexOf("otani-jins-midface") < otaniIds.indexOf("otani-rose-muse"),
    true,
    "E: 2026年の新しい活動が、priority付きの2022年の活動より上に来る（日付が主キー）"
  );
  const takamatsuIds = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, "takamatsu-hitomi")).map((a) => a.id);
  assertEqual(takamatsuIds[0], "takamatsu-heather", "E: 髙松瞳は 2026-09-04 の Heather が一番上");
  assertEqual(takamatsuIds[takamatsuIds.length - 1], "takamatsu-hamburger-club", "F: 日付の無い活動が一番下");

  // グループ活動（ディスコグラフィ画面）も同じ関数で日付降順になる
  const groupDates = sortActivitiesByDateDesc(GROUP_ACTIVITIES).map((activity) => getActivitySortDate(activity));
  const groupDated = groupDates.filter((date) => date !== null);
  assertEqual(groupDated, [...groupDated].sort().reverse(), "D: グループ活動一覧も日付の新しい順");

  // ---- G. 同日データでも安定した順序（何度並べ替えても同じ／priority→登録順） ----
  const sameDay = [
    { id: "x1", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-09-30", endDate: null },
    { id: "x2", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-09-30", endDate: null, priority: 1 },
    { id: "x3", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-09-30", endDate: null },
  ];
  assertEqual(sortActivitiesByDateDesc(sameDay).map((a) => a.id), ["x2", "x1", "x3"], "G: 同日は priority→登録順の決定的な並び");
  assertEqual(
    sortActivitiesByDateDesc(sortActivitiesByDateDesc(sameDay)).map((a) => a.id),
    ["x2", "x1", "x3"],
    "G: 何度並べ替えても順番が変わらない（再描画で入れ替わらない）"
  );
  assertEqual(
    sortActivitiesByDateDesc(MEMBER_ACTIVITIES).map((a) => a.id),
    sortActivitiesByDateDesc(MEMBER_ACTIVITIES).map((a) => a.id),
    "G: 実データでも並びが毎回同じ"
  );

  // ---- H. 不正日付・欠損があっても壊れない ----
  assertEqual(getActivitySortDate({ startDate: "2026-09-30" }), "2026-09-30", "H: 正常な日付はそのまま基準日になる");
  assertEqual(getActivitySortDate({ startDate: "2026-09-30", endDate: "2026-10-05" }), "2026-10-05", "H: 終了日があれば終了日が基準日（最新の動き）");
  assertEqual(getActivitySortDate({ startDate: null, endDate: null }), null, "H: 日付が無ければ null");
  assertEqual(getActivitySortDate({ startDate: "2026/09/30" }), null, "H: YYYY/MM/DD 表記は不正として null（並びを壊さない）");
  assertEqual(getActivitySortDate({ startDate: "2026-02-31" }), null, "H: 存在しない日付は null");
  assertEqual(getActivitySortDate({ startDate: "" }), null, "H: 空文字は null");
  assertEqual(getActivitySortDate({ startDate: 20260930 }), null, "H: 数値は null");
  assertEqual(getActivitySortDate(null), null, "H: 活動自体が無くても落ちない");
  const broken = [
    { id: "b1", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-01-01", endDate: null },
    { id: "b2", status: ACTIVITY_STATUS.ONGOING, startDate: "こわれた日付", endDate: null },
    { id: "b3", status: ACTIVITY_STATUS.PAST, startDate: null, endDate: "2026-05-05" },
  ];
  assertEqual(sortActivitiesByDateDesc(broken).map((a) => a.id), ["b3", "b1", "b2"], "H: 壊れた日付が混ざっても例外にならず、末尾にまとまる");

  // ---- 全データの日付監査（書式・欠損・未来日・重複ID） ----
  const ids = MEMBER_ACTIVITIES.map((activity) => activity.id);
  assertEqual(new Set(ids).size, ids.length, "監査: 活動IDに重複が無い");
  const badDates = [];
  const futureDates = [];
  // 2026-10-02：基準日を更新。終了日(endDate)だけは「任期の満了日」など未来の予定日が正しい場合があるため対象外にする
  //（開始日・確認日が未来なら入力ミスの疑い）。
  const today = "2026-10-02";
  [...MEMBER_ACTIVITIES, ...GROUP_ACTIVITIES].forEach((activity) => {
    ["startDate", "endDate", "lastVerifiedDate"].forEach((key) => {
      const value = activity[key];
      if (value === null || value === undefined) return;
      if (typeof value !== "string" || !DATE_PATTERN.test(value)) badDates.push(`${activity.id}.${key}=${value}`);
      else if (key !== "endDate" && value > today) futureDates.push(`${activity.id}.${key}=${value}`);
    });
    if (activity.startDate && activity.endDate) {
      assertEqual(activity.startDate <= activity.endDate, true, `監査: ${activity.id} は開始日 ≦ 終了日`);
    }
  });
  assertEqual(badDates, [], "監査: 日付は全て YYYY-MM-DD 形式（YYYY/MM/DD 等の混在なし）");
  assertEqual(futureDates, [], "監査: 未来日付の誤入力が無い");

  // ---- K. 外部リンクの体裁（全活動） ----
  const badLinks = [];
  MEMBER_ACTIVITIES.forEach((activity) => {
    const urls = [activity.url, ...(activity.links ?? []).map((link) => link.url), ...(activity.sourceUrls ?? [])].filter(Boolean);
    urls.forEach((url) => {
      if (!/^https:\/\//.test(url)) badLinks.push(`${activity.id}: ${url}`);
    });
  });
  assertEqual(badLinks, [], "K: 全てのリンクが https で始まる");
}

// ---- I／J／K／L. 実DOM：カードの体裁・375px でのはみ出し・外部リンク属性 ----
export function runMemberActivityCardLayoutTests() {
  const container = document.createElement("div");
  container.className = "activity-list";
  container.style.cssText = "position:absolute;left:-9999px;top:0;width:375px;box-sizing:border-box;";
  document.body.appendChild(container);
  try {
    const noguchi = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, "noguchi-iori"));
    const oba = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, "oba-hana"));
    [...noguchi, ...oba].forEach((activity) => container.appendChild(buildActivityCard(activity)));

    const cards = [...container.querySelectorAll(".activity-card")];
    assertEqual(cards.length, noguchi.length + oba.length, "I: 既存UIのまま全活動のカードが作られる");
    assertEqual(container.scrollWidth <= container.clientWidth + 1, true, "J: 375px 幅で横にはみ出さない");
    assertEqual(cards.every((card) => card.scrollWidth <= card.clientWidth + 1), true, "J: 各カードも横にはみ出さない");

    const toccoCard = cards[0];
    assertEqual(toccoCard.textContent.includes("tocco closet"), true, "I: 野口衣織の先頭カードが tocco closet");
    const links = [...container.querySelectorAll("a")];
    const toccoLink = links.find((link) => link.href.includes("tocco-closet.co.jp"));
    const redyazelLink = links.find((link) => link.href.includes("burnedestrose.com"));
    assertEqual(toccoLink?.href, "https://www.tocco-closet.co.jp/catalog/20260930/20260930_sp.html", "K: tocco closet のリンク先がカタログ本体");
    assertEqual(redyazelLink?.href, "https://www.burnedestrose.com/shop/e/e260930Ra/", "K: REDYAZEL のリンク先が特設ページ");
    [toccoLink, redyazelLink].forEach((link) => {
      assertEqual(link.target, "_blank", "K: 外部リンクは新しいタブで開く");
      assertEqual(link.rel.includes("noopener") && link.rel.includes("noreferrer"), true, "K: rel=noopener noreferrer が付く");
    });
  } finally {
    container.remove();
  }
}

// 【2026-10-02追加】大場花菜「さいたま観光大使」（さいたま市公式発表 2026-10-01）の回帰テスト。
export function runSaitamaAmbassadorTests() {
  const activity = findActivity("oba-saitama-tourism-ambassador");
  assertEqual(activity !== null, true, "S: さいたま観光大使が登録されている");
  assertEqual(activity.memberId, "oba-hana", "S: 大場花菜の活動");
  assertEqual(activity.type, "ambassador", "S: 種別は観光大使（汎用のAMBASSADOR）");
  assertEqual(activity.status, ACTIVITY_STATUS.ONGOING, "S: 継続中");
  assertEqual([activity.startDate, activity.endDate], ["2026-10-01", "2028-03-31"], "S: 就任日と任期末が公式どおり");
  assertEqual(activity.url, "https://www.city.saitama.lg.jp/006/014/008/003/015/007/p133595.html", "S: 主リンクは就任発表ページ");
  assertEqual(activity.sourceType, "official", "S: 公式情報");

  const sorted = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, "oba-hana"));
  assertEqual(sorted[0].id, "oba-saitama-tourism-ambassador", "S: 大場花菜の活動一覧で一番上");
  assertEqual(sorted[1].id, "oba-redyazel", "S: 2番目はREDYAZEL（既存の並びを壊さない）");
  assertEqual(sorted.some((entry) => entry.id === "oba-manga") && sorted.some((entry) => entry.id === "oba-artistspoken"), true, "S: はなコミ！・イマフレランチも残っている");

  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:0;width:375px;box-sizing:border-box;";
  const card = buildActivityCard(activity);
  container.appendChild(card);
  document.body.appendChild(container);
  try {
    assertEqual(card.querySelector(".activity-card-type").textContent, "観光・PR大使", "S: タグ「観光・PR大使」");
    assertEqual(card.querySelector(".activity-card-status").textContent, "継続中", "S: タグ「継続中」");
    assertEqual(card.querySelector(".activity-card-status").classList.contains("is-ongoing"), true, "S: 継続中は既存の緑タグ");
    const link = card.querySelector("a");
    assertEqual([link.textContent, link.target, link.rel.includes("noopener")], ["公式ページ", "_blank", true], "S: 「公式ページ」ボタンが別タブで開く");
    assertEqual(card.textContent.includes("2028年3月31日まで"), true, "S: 任期が説明文にある");
    assertEqual(container.scrollWidth <= container.clientWidth + 1, true, "S: 375px幅で横にはみ出さない");
  } finally {
    container.remove();
  }
}

// 【2026-10-02追加】齋藤樹愛羅「とちぎ未来大使」（栃木県公式名簿・令和8年3月31日現在で確認）の回帰テスト。
export function runTochigiAmbassadorTests() {
  const activity = findActivity("saito-tochigi-future-ambassador");
  assertEqual(activity !== null, true, "T: とちぎ未来大使が登録されている");
  assertEqual(activity.memberId, "saito-kiara", "T: 齋藤樹愛羅の活動");
  assertEqual(activity.type, "ambassador", "T: さいたま観光大使と同じ汎用種別AMBASSADOR");
  assertEqual(activity.status, ACTIVITY_STATUS.ONGOING, "T: 継続中");
  assertEqual([activity.startDate, activity.endDate], ["2024-04-17", null], "T: 就任日は2024-04-17、終了日なし");
  assertEqual(activity.description.includes("2024年4月17日") && activity.description.includes("とちぎ＝LOVE♡") && activity.description.includes("とちブラ"), true, "T: 就任日・担当名・とちブラが説明文にある");
  assertEqual(activity.links[0].url, "https://www.pref.tochigi.lg.jp/c05/pref/kihon/sonota/1285545941380.html", "T: 主リンクは栃木県公式のとちぎ未来大使ページ");
  assertEqual(activity.links.every((link) => link.url.startsWith("https://www.pref.tochigi.lg.jp/")), true, "T: リンクは全て栃木県公式");
  assertEqual(activity.type !== "stage" && activity.type !== "voice", true, "T: STAGE/VOICEの種別ではない（個人活動・レギュラー企画の扱い）");

  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:0;width:375px;box-sizing:border-box;";
  const card = buildActivityCard(activity);
  container.appendChild(card);
  document.body.appendChild(container);
  try {
    assertEqual(card.querySelector(".activity-card-type").textContent, "観光・PR大使", "T: さいたま観光大使と同じタグ「観光・PR大使」");
    assertEqual(card.querySelector(".activity-card-status").textContent, "継続中", "T: 「継続中」");
    assertEqual(card.querySelector(".activity-card-status").classList.contains("is-ongoing"), true, "T: 既存の緑タグ");
    const anchors = [...card.querySelectorAll("a")];
    assertEqual(anchors.length, 2, "T: ボタンは2つ");
    assertEqual(anchors.every((link) => link.target === "_blank" && link.rel.includes("noopener")), true, "T: 別タブ・安全属性");
    assertEqual(container.scrollWidth <= container.clientWidth + 1, true, "T: 375px幅で横にはみ出さない");
  } finally {
    container.remove();
  }
  const ids = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, "saito-kiara")).map((entry) => entry.id);
  assertEqual(ids.indexOf("saito-kiara-berippichi-radio") < ids.indexOf("saito-tochigi-future-ambassador"), true, "T: 2026年開始のラジオより下（日付降順）");
  assertEqual(ids.indexOf("saito-tochigi-future-ambassador") < ids.indexOf("saito-sasaki-einstein-tv"), true, "T: 2022年開始のTVより上（日付降順）");
}
