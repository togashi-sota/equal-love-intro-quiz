// 【2026-10-23新設】CM・広告出演セクション／フレンド画面の並び替え／ランキングカードの内部情報非表示 の回帰テスト。
import { COMMERCIALS, COMMERCIAL_KIND } from "../js/data/commercials.js";
import { MEMBERS } from "../js/data/members.js";
import { MEMBER_ACTIVITIES } from "../js/data/memberActivities.js";
import { GROUP_ACTIVITIES } from "../js/data/groupActivities.js";
import {
  getMemberCommercials,
  getGroupCommercials,
  formatCommercialDate,
  describeCoStars,
  buildMemberCommercialsSection,
  buildGroupCommercialsSection,
  COMMERCIAL_INITIAL_VISIBLE_COUNT,
} from "../js/commercialsSection.js";
import { buildLeaderboardRow } from "../js/timeAttackLeaderboardScreen.js";
import { normalizeLeaderboardEntry } from "../js/timeAttackLeaderboard.js";
import { assertEqual } from "./test-utils.js";

const TODAY = "2026-10-23";

function mount(node, width = 375) {
  const host = document.createElement("div");
  host.style.cssText = `position:absolute;left:-9999px;top:0;width:${width}px;box-sizing:border-box;`;
  host.appendChild(node);
  document.body.appendChild(host);
  return host;
}

export async function runCommercialsAndFriendsUiTests() {
  // ===== A. データの整合性 =====
  const ids = COMMERCIALS.map((cm) => cm.id);
  assertEqual(new Set(ids).size, ids.length, "A: CM・広告のIDが重複しない");
  const memberIds = new Set(MEMBERS.map((member) => member.id));
  const kinds = new Set(Object.values(COMMERCIAL_KIND));
  COMMERCIALS.forEach((cm) => {
    assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(cm.date), true, `A: ${cm.id} の日付が YYYY-MM-DD`);
    assertEqual(kinds.has(cm.kind), true, `A: ${cm.id} の種別が決められた区分（テレビCM/WebCM/タイアップ等）`);
    assertEqual(cm.isGroup === true ? !cm.memberIds : (cm.memberIds ?? []).length > 0 && cm.memberIds.every((id) => memberIds.has(id)), true, `A: ${cm.id} は全員出演か、実在メンバーの出演`);
    assertEqual((cm.links ?? []).length > 0 && cm.links.every((link) => link.url.startsWith("https://")), true, `A: ${cm.id} は公式系リンクが1つ以上（https）`);
    assertEqual((cm.sourceUrls ?? []).length > 0, true, `A: ${cm.id} は根拠URLを持つ`);
  });
  assertEqual(COMMERCIALS.some((cm) => (cm.description ?? "").includes("放送中")), false, "A: 「放送中」とは書かない（確認できないため）");

  // ===== B. 既存データとの重複が無い（CM・広告欄へ移した2件は元の場所から外した） =====
  assertEqual(MEMBER_ACTIVITIES.some((activity) => activity.id === "sasaki-mcdonalds-samurai-mac"), false, "B: サムライマックCMは個人活動から外れている（CM欄と二重表示しない）");
  assertEqual(GROUP_ACTIVITIES.some((activity) => activity.id === "group-cm-mynumber-card"), false, "B: マイナカードCMはグループ活動から外れている");
  assertEqual(COMMERCIALS.some((cm) => cm.id === "cm-sasaki-mcdonalds-samurai-mac-2026"), true, "B: サムライマックCMはCM欄に引き継がれている");
  assertEqual(COMMERCIALS.some((cm) => cm.id === "cm-group-mynumber-card-2026" && cm.links.some((link) => link.url.includes("93iIH0_e1QM"))), true, "B: マイナカードCMはPVリンクごと引き継がれている");
  assertEqual(GROUP_ACTIVITIES.some((activity) => activity.id === "group-ririmew-muse"), true, "B: Ririmew ブランドミューズ（商品プロデュース寄り）はグループ活動に残している");

  // ===== C. メンバーごとの振り分け =====
  const count = (id) => getMemberCommercials(id).length;
  // 【2026-10-23再調査で更新】とくべチューハイ（大谷・佐々木・野口・諸橋）、メイプルストーリー（音嶋・佐々木・野口）、koe×2（音嶋・野口）、
  // ひざつき製菓（＝LOVE名義・大場花菜がパッケージイラスト）を追加
  assertEqual(count("sasaki-maika"), 9, "C: 佐々木舞香は9件（代アニ・メイプル・OPPO・サムライマック・Galaxy・月見パイ・とくべチューハイ・ザクザクマック・ももチキン）");
  assertEqual(["otani-emiri", "noguchi-iori"].map(count), [2, 5], "C: 大谷映美里2件（Galaxy・とくべ）／野口衣織5件（koe×2・メイプル・Galaxy・とくべ）");
  assertEqual([count("takamatsu-hitomi"), count("saito-kiara"), count("yamamoto-anna")], [1, 1, 1], "C: 髙松瞳・齋藤樹愛羅・山本杏奈は各1件");
  assertEqual(["oba-hana", "otoshima-risa", "takiwaki-shoko", "morohashi-sana"].map(count), [1, 3, 0, 1], "C: 大場1件（ひざつき製菓のイラスト）・音嶋3件・瀧脇0件・諸橋1件（とくべ）");
  assertEqual(getMemberCommercials("sasaki-maika").map((cm) => cm.date), [...getMemberCommercials("sasaki-maika").map((cm) => cm.date)].sort().reverse(), "C: 新しい順");
  assertEqual(getGroupCommercials().length, 21, "C: ＝LOVE名義の CM・広告・コラボは21件");
  assertEqual(getGroupCommercials().every((cm) => cm.isGroup === true), true, "C: グループ欄には＝LOVE名義の案件だけ");
  const galaxy = COMMERCIALS.find((cm) => cm.id === "cm-softbank-galaxy-z-2026");
  assertEqual(describeCoStars(galaxy, "sasaki-maika"), "大谷映美里・野口衣織・白戸家のお父さん", "C: 共演者に他のメンバー名と共演者が出る");

  // ===== D. 日付表示 =====
  assertEqual(formatCommercialDate("2026-10-27", TODAY), "2026年10月27日開始予定", "D: 放送前は「開始予定」");
  assertEqual(formatCommercialDate("2026-10-21", TODAY), "2026年10月21日", "D: 公開済みは日付だけ（放送中とは書かない）");
  assertEqual(formatCommercialDate("不正", TODAY), "", "D: 不正な日付でも落ちない");

  // ===== E. 個人ページの描画（10人・もっと見る・リンク・375px） =====
  MEMBERS.filter((member) => member.status === "active").forEach((member) => {
    const host = mount(buildMemberCommercialsSection(member.id, COMMERCIALS, TODAY));
    try {
      assertEqual(host.querySelector('[data-section="cm"]') !== null, true, `E: ${member.name} にCM・広告セクションがある`);
      assertEqual(host.querySelector(".commercial-group-note-button") !== null, true, `E: ${member.name} は全員出演のCMへの案内がある`);
      assertEqual(host.scrollWidth <= host.clientWidth + 1, true, `E: ${member.name} は375px幅で横にはみ出さない`);
      assertEqual([...host.querySelectorAll("a")].every((link) => link.target === "_blank" && link.rel.includes("noopener")), true, `E: ${member.name} の外部リンクは別タブ`);
    } finally {
      host.remove();
    }
  });
  const sasakiHost = mount(buildMemberCommercialsSection("sasaki-maika", COMMERCIALS, TODAY));
  try {
    const cards = [...sasakiHost.querySelectorAll(".commercial-card")];
    assertEqual(cards.length, 9, "E: 佐々木舞香のカードは9枚");
    assertEqual(cards.filter((card) => !card.hidden).length, COMMERCIAL_INITIAL_VISIBLE_COUNT, "E: 最初は5件だけ見える");
    assertEqual(cards[0].textContent.includes("開始予定"), true, "E: 先頭は放送開始前のももチキン（開始予定）");
    const more = sasakiHost.querySelector('[data-section="cm"] > .stage-voice-more-button:not(.commercial-group-note-button)');
    more.click();
    assertEqual(cards.every((card) => !card.hidden), true, "E: もっと見るで全件表示");
    more.click();
    assertEqual(cards.filter((card) => !card.hidden).length, COMMERCIAL_INITIAL_VISIBLE_COUNT, "E: たたむで5件に戻る");
  } finally {
    sasakiHost.remove();
  }

  // ===== F. ＝LOVEについての描画 =====
  const groupHost = mount(buildGroupCommercialsSection(COMMERCIALS, TODAY));
  try {
    assertEqual(groupHost.querySelector("#group-cm-section") !== null, true, "F: 個人ページから飛べるよう id=group-cm-section を持つ");
    const cards = [...groupHost.querySelectorAll(".group-commercial-card")];
    assertEqual(cards.length, 21, "F: 21件");
    assertEqual(cards[0].dataset.commercialId, "cm-group-hotpepper-beauty-2026", "F: 新しい順（2026-09-09 が先頭）");
    assertEqual(cards.filter((card) => !card.hidden).length, 5, "F: 最初は5件");
    assertEqual(groupHost.scrollWidth <= groupHost.clientWidth + 1, true, "F: 375px幅で横にはみ出さない");
  } finally {
    groupHost.remove();
  }
  const wideHost = mount(buildGroupCommercialsSection(COMMERCIALS, TODAY), 820);
  assertEqual(wideHost.scrollWidth <= wideHost.clientWidth + 1, true, "F: タブレット幅（820px）でも横にはみ出さない");
  wideHost.remove();

  // ===== G. フレンド画面：フレンド一覧が主役（index.html の並び） =====
  const html = await (await fetch("index.html", { cache: "no-store" })).text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const screen = doc.getElementById("fan-profiles-screen");
  const order = (id) => [...screen.querySelectorAll("*")].findIndex((element) => element.id === id);
  assertEqual(order("fan-profiles-list") < order("fan-profiles-sharing-toggle"), true, "G: フレンド一覧が公開設定より上");
  assertEqual(order("fan-profiles-list") < order("fan-profiles-my-uid"), true, "G: フレンド一覧が「あなたのID」より上");
  assertEqual(order("fan-profiles-list") < order("fan-profiles-presence-diag"), true, "G: フレンド一覧が接続診断より上");
  assertEqual(doc.getElementById("fan-profiles-details")?.tagName, "DETAILS", "G: ID・診断は折りたたみ（details）の中");
  assertEqual(doc.getElementById("fan-profiles-details").contains(doc.getElementById("fan-profiles-my-uid")), true, "G: あなたのID は詳細情報の中に残っている（削除していない）");
  assertEqual(doc.getElementById("fan-profiles-details").contains(doc.getElementById("fan-profiles-presence-diag")), true, "G: 接続診断は詳細情報の中に残っている");
  assertEqual(order("fan-profiles-uid-merge-card") < order("fan-profiles-list"), true, "G: 本当に引き継ぎが必要なときの案内は一覧の上（重要な案内は隠さない）");
  assertEqual(doc.getElementById("fan-profiles-uid-merge-card").hasAttribute("hidden"), true, "G: 引き継ぎ案内は必要なときだけ表示（初期は非表示）");
  assertEqual(doc.getElementById("fan-profiles-private-note") !== null, true, "G: 公開OFFの人への短い案内がある");
  assertEqual(doc.getElementById("admin-backup-link").hasAttribute("hidden"), true, "G: 管理者用ボタンは初期非表示（正式な管理者判定で表示）");

  // ===== H. ランキング：カードに内部情報を出さない／管理者の削除は内部キーで =====
  const entry = normalizeLeaderboardEntry("uid-test-123456789", {
    displayName: "テスト", clearTimeMs: 7460, missCount: 0, achievedAt: Date.UTC(2026, 8, 3, 11, 10), source: "normal",
  });
  let deleted = null;
  const adminRow = buildLeaderboardRow(entry, 1, { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false }, false, "intro", "5", "title-track", {
    isAdmin: true,
    onAdminDeleteRequest: (target) => { deleted = target; },
  });
  assertEqual(adminRow.textContent.includes("ID …"), false, "H: 管理者でもカードにID末尾を出さない");
  assertEqual(adminRow.textContent.includes("旧形式"), false, "H: カードに「旧形式（本人キー無し）」を出さない");
  assertEqual(adminRow.textContent.includes("20:10") || adminRow.textContent.includes("2026/09/03"), false, "H: カードに秒・分単位の登録時刻を出さない");
  assertEqual(adminRow.textContent.includes("記録日 9月3日"), true, "H: 記録日（月日）は表示する");
  adminRow.querySelector(".leaderboard-admin-delete-button").click();
  assertEqual(deleted?.uid, "uid-test-123456789", "H: 削除ボタンは表示名ではなく内部キー（uid）を持った記録を渡す");
  const userRow = buildLeaderboardRow(entry, 1, { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false }, false, "intro", "5", "title-track");
  assertEqual(userRow.querySelector(".leaderboard-admin-delete-button"), null, "H: 一般ユーザーには削除ボタンが無い");
  assertEqual(doc.getElementById("time-attack-leaderboard-admin-delete-uid") !== null && doc.getElementById("time-attack-leaderboard-admin-delete-format") !== null, true, "H: 削除確認ではID末尾・記録の形式を確認できる");
}
