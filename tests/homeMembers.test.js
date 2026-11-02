// 【2026-11-03新設・本人の依頼 R10-3】ホームの「メンバーを知る」・＝LOVE の3つのまとまり・メンバーの個人ページの点検と回遊の回帰テスト。
// - 「メンバーを知る」：現役10人・正式な順（出席番号順）・名前・メンバーカラー・ひとこと紹介・プロフィールへ移る表示・写真なし
// - ひとこと紹介・紹介文：出典がある・公式プロフィールの趣味／特技が埋まっている・紹介文が「きっかけ」と同じ話を繰り返さない
// - 個人ページの「このメンバーをもっと見る」：YouTube・テレビ・個人活動・センター曲／ユニット曲（増やしすぎない。同じ行き先を2か所に置かない）
// - 行き先：ホームのカード → 個人ページ →［戻る］→ ホーム（元の位置）
import { MEMBERS, MEMBER_STATUS } from "../js/data/members.js";
import { MEMBER_PROFILES } from "../js/data/memberProfiles.js";
import { MEMBER_ACTIVITIES, ACTIVITY_STATUS } from "../js/data/memberActivities.js";
import { SONGS } from "../js/data/songs.js";
import { buildHomeMemberCardModels, buildHomeMemberCard, renderHomeMembers } from "../js/homeMembersSection.js";
import { initMembersScreen, openMemberDetail, buildGraduatedYoutubeButton, getActivityGroupRank, ACTIVITY_STATUS_LABELS, sortActivitiesByDateDesc, buildMemberActivitySections, isCurrentActivity, getActivityStatusLabel, CURRENT_ACTIVITY_LIMIT } from "../js/membersScreen.js";
import { assertEqual } from "./test-utils.js";
import { YOUTUBE_DATA_STATE, setYoutubeAppearanceSnapshotForTest } from "../js/youtubeAppearanceData.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const activeMembers = MEMBERS.filter((member) => member.status === MEMBER_STATUS.ACTIVE).sort((a, b) => a.attendanceNumber - b.attendanceNumber);

function runHomeMemberCardTests() {
  const models = buildHomeMemberCardModels(MEMBERS, MEMBER_PROFILES);
  assertEqual(models.map((model) => model.name), activeMembers.map((member) => member.name), "メンバーを知る：現役メンバーだけを、正式な順（出席番号順）で");
  assertEqual(models.length, 10, "メンバーを知る：現役10人（スマホで2列×5行）");
  assertEqual(models.every((model) => /^#[0-9a-f]{6}$/i.test(model.colorHex ?? "") && model.colorName), true, "メンバーを知る：全員にメンバーカラー（色と色の名前）");
  assertEqual(models.every((model) => typeof model.lead === "string" && model.lead.length > 0 && model.lead.length <= 24), true, "メンバーを知る：全員にひとこと紹介（24文字以内。2列のカードで2行まで。英字のブランド名は幅が狭い）");
  assertEqual(models.find((model) => model.memberId === "yamamoto-anna")?.role, "リーダー", "メンバーを知る：役割（リーダー）を出す");

  // 押すと、そのメンバーの id で呼ばれる。押す所はカード全体の1つ
  let selected = null;
  const card = buildHomeMemberCard(models[0], (id) => {
    selected = id;
  });
  assertEqual(card.tagName, "BUTTON", "カード：ネイティブの button（キーボードでも押せる）");
  assertEqual(card.querySelectorAll("button, a, img").length, 0, "カード：中にボタン・リンク・写真を入れない");
  assertEqual(card.style.getPropertyValue("--member"), models[0].colorHex, "カード：メンバーカラーを CSS の変数で渡す（色の点・下の帯）");
  assertEqual(card.querySelector(".home-member-go")?.textContent.includes("プロフィール"), true, "カード：押すとプロフィールへ移ることが分かる表示");
  assertEqual(card.getAttribute("aria-label").startsWith(`${models[0].name}のプロフィールを見る`), true, "カード：読み上げは「○○のプロフィールを見る」");
  card.click();
  assertEqual(selected, models[0].memberId, "カード：押すと、そのメンバーの個人ページを開く");

  const host = document.createElement("div");
  renderHomeMembers(host, MEMBERS, MEMBER_PROFILES, () => {});
  assertEqual(host.querySelectorAll(".home-member").length, 10, "メンバーを知る：10枚を並べる");
  renderHomeMembers(host, MEMBERS, MEMBER_PROFILES, () => {});
  assertEqual(host.querySelectorAll(".home-member").length, 10, "メンバーを知る：描き直しても増えない");
}

function runProfileDataTests() {
  const activeProfiles = activeMembers.map((member) => MEMBER_PROFILES.find((profile) => profile.memberId === member.id));
  assertEqual(activeProfiles.every((profile) => profile?.homeLead?.sourceUrls?.length > 0 && profile.homeLead.lastVerifiedDate), true, "ひとこと紹介：全員に出典と確認日");
  // 出典：紹介文に出典があるか、ファンの評価の紹介文（齋藤樹愛羅。本人が 2026-08-03 に決めた方向性）なら、公式の事実を別のカードで添える
  assertEqual(
    activeProfiles.filter((profile) => !(profile.introduction?.sourceUrls?.length > 0) && !(profile.introduction?.sourceType === "fan" && profile.introductionNotes?.every((note) => note.sourceUrls.length > 0))).map((profile) => profile.memberId),
    [],
    "紹介文：全員に出典がある（ファンの評価の紹介文には、公式の事実のカードを添える）"
  );
  // ひとこと紹介：似た文にしない（「・」で分けた部分が、ほかの人と同じにならない）
  const leadParts = activeProfiles.flatMap((profile) => profile.homeLead.text.split("・"));
  assertEqual(leadParts.length, new Set(leadParts).size, "ひとこと紹介：1人ずつ違う（同じ言い回しを2人に使わない）");
  assertEqual(activeProfiles.some((profile) => /かわいい|可愛い|人気|大活躍|魅力|天使|最強|唯一無二/.test(profile.homeLead.text)), false, "ひとこと紹介：誰にでも当てはまる褒め言葉・大げさな宣伝を書かない");
  // 以前の紹介文（本人が 2026-08-03 に確かめた方向性）の要点を削っていない
  // 【2026-11-03 R10 メンバー紹介2】紹介文は「人柄・加入後・今の活動」、加入までの歩みは「加入前の活動」「目指したきっかけ」に分けた。
  // 以前の紹介文の要点は、個人ページのこの3つの文のどこかに残っていればよい（本人の方針：削らない。同じ話を2か所に書かない）
  const introOf = (memberId) => {
    const profile = MEMBER_PROFILES.find((candidate) => candidate.memberId === memberId);
    return [profile.introduction, profile.preDebutActivity, profile.auditionMotivation].map((item) => item?.text ?? "").join(" / ");
  };
  assertEqual(
    [
      introOf("otani-emiri").includes("アキシブproject"),
      introOf("oba-hana").includes("宝塚歌劇") && introOf("oba-hana").includes("高橋みなみ"),
      introOf("otoshima-risa").includes("公式彼女") && introOf("otoshima-risa").includes("姫"),
      introOf("saito-kiara").includes("ダンスメンバー") && introOf("saito-kiara").includes("最年少"),
      introOf("sasaki-maika").includes("ご当地声優アイドル") && introOf("sasaki-maika").includes("声優") && introOf("sasaki-maika").includes("イコラブのあんまい"),
      introOf("takamatsu-hitomi").includes("グループ初期を象徴する存在"),
      introOf("takiwaki-shoko").includes("サブ4") && introOf("takiwaki-shoko").includes("SASUKE"),
      introOf("noguchi-iori").includes("声優アイドル"),
      introOf("morohashi-sana").includes("最年長") && introOf("morohashi-sana").includes("ソロ"),
      introOf("yamamoto-anna").includes("リーダー") && introOf("yamamoto-anna").includes("カープ"),
    ],
    [true, true, true, true, true, true, true, true, true, true],
    "紹介文：以前の紹介文の要点（本人が確かめた方向性）を10人とも、個人ページの紹介・加入前の活動・きっかけのどこかに残している"
  );
  // 公式プロフィール（equal-love.jp/feature/…）に載っている趣味・特技が、空のままになっていない
  assertEqual(
    activeProfiles.filter((profile) => !(profile.hobbies?.items?.length > 0)).map((profile) => profile.memberId),
    [],
    "趣味：現役全員に公式プロフィールの趣味（大谷映美里・諸橋沙夏・山本杏奈を埋めた）"
  );
  const otani = MEMBER_PROFILES.find((profile) => profile.memberId === "otani-emiri");
  assertEqual([otani.hobbies.items, otani.skills.items], [["メイクやファッションを楽しむこと", "ラーメン巡り"], ["ジョッキ持ち"]], "大谷映美里：公式プロフィールの趣味・特技");
  // 既存の項目は消していない（きっかけ・加入前の活動の数は以前と同じ）
  assertEqual(MEMBER_PROFILES.filter((profile) => profile.auditionMotivation).length >= 9, true, "きっかけ：以前の9人分より減っていない（削除しない。2026-11-03 齋藤樹愛羅・瀧脇笙古を足した）");
  assertEqual(MEMBER_PROFILES.filter((profile) => profile.preDebutActivity).length >= 10, true, "加入前の活動：以前の10人分より減っていない（2026-11-03 瀧脇笙古を足した）");
  // 同じ話を2か所に書かない：紹介文と「きっかけ」で同じ文を繰り返さない
  const sentences = (text) => (text ?? "").split("。").map((part) => part.trim()).filter((part) => part.length >= 12);
  assertEqual(
    activeProfiles.filter((profile) => sentences(profile.introduction?.text).some((sentence) => sentences(profile.auditionMotivation?.text).includes(sentence) || sentences(profile.preDebutActivity?.text).includes(sentence))).map((profile) => profile.memberId),
    [],
    "紹介文：「加入前の活動」「きっかけ」と同じ文を繰り返さない"
  );
  // 【第3版】本人が公表した慎重な話は、出典つきで載せる。診断の言葉は使わない
  const textOf = (memberId) => {
    const profile = MEMBER_PROFILES.find((candidate) => candidate.memberId === memberId);
    return [profile.introduction, profile.preDebutActivity, profile.auditionMotivation].map((item) => item?.text ?? "").join(" / ");
  };
  assertEqual(textOf("morohashi-sana").includes("両親に相談") && textOf("takamatsu-hitomi").includes("辞めることも考えた") && textOf("sasaki-maika").includes("休みがち"), true, "第3版：諸橋沙夏・髙松瞳・佐々木舞香の、本人が公表した話");
  assertEqual(/恐怖症|障害|うつ|病気/.test(textOf("sasaki-maika") + textOf("morohashi-sana") + textOf("takamatsu-hitomi")), false, "第3版：病気などの診断を推測する言葉を使わない");
  assertEqual(textOf("morohashi-sana").includes("アニソンユニット"), false, "第3版：出典が見つからない経歴（アニソンユニット）は載せない");
  assertEqual(MEMBER_PROFILES.find((profile) => profile.memberId === "otoshima-risa").introduction.text.includes("HKT48"), false, "第3版：音嶋莉沙の紹介文は何度も挑戦した経緯を中心に（HKT48 の件は加入前の活動に公式の言い方で）");
  // 誤りの直し：山本杏奈は広島から東京のオーディションに通い、合格と同時に上京した（SUUMO 2019）
  const anna = MEMBER_PROFILES.find((profile) => profile.memberId === "yamamoto-anna");
  assertEqual([anna.auditionMotivation.text.includes("合格と同時に上京"), /上京後.*オーディション/.test(anna.auditionMotivation.text + anna.introduction.text)], [true, false], "山本杏奈：上京は＝LOVE合格の後（以前の「上京後にオーディション」の順番を直した）");
}

function runMemberDetailExploreTests(main) {
  const name = document.createElement("h2");
  const content = document.createElement("div");
  const opened = [];
  initMembersScreen({
    memberDetailName: name,
    memberDetailContent: content,
    onSelectMember: () => {},
    onOpenTvVariety: (id) => opened.push(["tv", id]),
    onOpenYoutubeAppearances: (id) => opened.push(["youtube", id]),
  });
  openMemberDetail(SONGS, MEMBERS, MEMBER_PROFILES, MEMBER_ACTIVITIES, "otani-emiri");
  const headings = [...content.querySelectorAll(".section-heading")].map((heading) => heading.textContent);
  assertEqual(headings.indexOf("このメンバーをもっと見る"), headings.indexOf("紹介") + 1, "個人ページ：紹介のすぐ下に「このメンバーをもっと見る」");
  const explore = content.querySelector(".member-explore");
  assertEqual(explore?.querySelectorAll("button").length, 4, "個人ページ：もっと見るは4つまで（YouTube・テレビ・個人活動・センター曲／ユニット曲）");
  assertEqual(content.querySelectorAll(".member-youtube-link").length, 1, "個人ページ：YouTube 出演の導線は1か所だけ（重複させない）");
  assertEqual(content.querySelectorAll(".member-tv-variety-link").length, 1, "個人ページ：テレビ出演の導線は1か所だけ");
  assertEqual(headings.includes("YouTube 出演") || headings.includes("テレビ出演"), false, "個人ページ：以前の下の方の見出し（YouTube 出演・テレビ出演）は「もっと見る」へ移した");
  content.querySelector(".member-youtube-link").click();
  content.querySelector(".member-tv-variety-link").click();
  assertEqual(opened, [["youtube", "otani-emiri"], ["tv", "otani-emiri"]], "個人ページ：YouTube・テレビは、そのメンバーで絞った一覧を開く");
  const jumps = [...explore.querySelectorAll(".member-explore-jump")].map((button) => button.dataset.jumpTo);
  assertEqual(jumps, ["activities", "songs"], "個人ページ：個人活動・センター曲へ、このページの中で移る");
  assertEqual(jumps.every((anchor) => content.querySelector(`[data-member-section="${anchor}"]`) !== null), true, "個人ページ：移る先の見出しがある");

  // 既存の内容を削らない：齋藤樹愛羅の以前の紹介文にあったファンの評価は、別のカード（「ファンの間で定着」の札）で残す
  openMemberDetail(SONGS, MEMBERS, MEMBER_PROFILES, MEMBER_ACTIVITIES, "saito-kiara");
  const kiaraCards = [...content.querySelectorAll(".text-card")].map((card) => card.textContent);
  assertEqual(kiaraCards.some((text) => text.includes("Kiara Tiara") && text.includes("ダンスメンバー")), true, "齋藤樹愛羅：以前のダンスメンバーの話を残す（2026-11-03 メンバーの発言・報道の出典を足し、紹介文にまとめた）");

    // 資格：公式プロフィールの表記のまま（諸橋沙夏）
  openMemberDetail(SONGS, MEMBERS, MEMBER_PROFILES, MEMBER_ACTIVITIES, "morohashi-sana");
  const factRows = [...content.querySelectorAll(".fact-row")].map((row) => row.textContent);
  assertEqual(factRows.includes("資格水泳泳力検定2級"), true, "諸橋沙夏：公式プロフィールの資格「水泳泳力検定2級」");

  // 卒業メンバーは個人ページを持たない（一覧の簡易カードのまま）。現役でも件数0の導線は出さない
  const counts = activeMembers.map((member) => {
    openMemberDetail(SONGS, MEMBERS, MEMBER_PROFILES, MEMBER_ACTIVITIES, member.id);
    return content.querySelectorAll(".member-explore button").length;
  });
  assertEqual(counts.every((count) => count >= 2 && count <= 4), true, `個人ページ：現役全員に2〜4の行き先（${counts.join("・")}）`);

  // 卒業メンバー：在籍していたころの YouTube 出演動画（そのメンバーで絞った一覧を開く）
  const graduatedOpened = [];
  initMembersScreen({
    memberDetailName: name,
    memberDetailContent: content,
    onSelectMember: () => {},
    onOpenGraduatedYoutubeAppearances: (id) => graduatedOpened.push(id),
  });
  // 【2026-11-03】YouTube のデータは起動のあとで読むファイルになったので、テストの動画を読めた状態にして確かめる
  // （読む前・期限切れのときは、卒業メンバーのボタンを出さない）
  setYoutubeAppearanceSnapshotForTest(null);
  assertEqual(buildGraduatedYoutubeButton(MEMBERS.find((member) => member.id === "saito-nagisa")), null, "卒業メンバー：YouTube のデータを読む前はボタンを出さない");
  setYoutubeAppearanceSnapshotForTest({
    state: YOUTUBE_DATA_STATE.READY,
    data: null,
    error: null,
    videos: [{ id: "testVideo01", title: "テストの動画", publishedAt: "2021-05-01", kind: "video", status: "confirmed", memberIds: ["saito-nagisa"], footageMemberIds: [] }],
  });
  const nagisa = MEMBERS.find((member) => member.id === "saito-nagisa");
  const nagisaButton = buildGraduatedYoutubeButton(nagisa);
  assertEqual(nagisaButton?.textContent.startsWith("在籍していたころの YouTube 出演動画"), true, "卒業メンバー：「在籍していたころの」出演と書く（今の在籍と混同させない）");
  assertEqual(nagisaButton.textContent.includes("2023年1月13日の卒業まで"), true, "卒業メンバー：卒業日を書く");
  nagisaButton.click();
  assertEqual(graduatedOpened, ["saito-nagisa"], "卒業メンバー：押すと、そのメンバーで絞った YouTube 出演図鑑");
  const afterGraduation = buildGraduatedYoutubeButton({ ...nagisa, graduationDate: "2020-01-01" });
  assertEqual(afterGraduation.textContent.startsWith("在籍していたころ"), false, "卒業メンバー：卒業後の日付の動画が混ざれば「在籍していたころ」とは書かない");
  assertEqual(buildGraduatedYoutubeButton({ id: "no-such-member", name: "x" }), null, "卒業メンバー：出演の記録が無ければ出さない");
  setYoutubeAppearanceSnapshotForTest(null);
  assertEqual(main.includes('openYoutubeAppearances({ memberIds: [memberId], returnScreen: "members" })'), true, "卒業メンバー：戻るとメンバー一覧");
}

async function runMarkupTests() {
  const [html, main, css, sw, guide] = await Promise.all(["index.html", "js/main.js", "css/homeMembers.css", "sw.js", "js/data/guideContent.js"].map(fetchText));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const home = doc.getElementById("start-screen");
  const members = home.querySelector("#home-card-members");
  const know = home.querySelector("#home-card-know");
  assertEqual(members?.nextElementSibling === know, true, "ホーム：「メンバーを知る」は「＝LOVEをもっと知る」のすぐ上");
  assertEqual(members.querySelector(".home-card-title")?.textContent, "メンバーを知る", "ホーム：見出し「メンバーを知る」");
  assertEqual(Boolean(members.querySelector("#home-member-grid")) && Boolean(members.querySelector("#members-link")), true, "ホーム：カードの入れ物と、メンバー一覧への入口");
  assertEqual(members.querySelector("#members-link")?.textContent.includes("卒業メンバー"), true, "ホーム：メンバー一覧で卒業メンバーも見られると分かる");
  assertEqual(Boolean(doc.querySelector('link[href="css/homeMembers.css"]')), true, "CSS を読み込む");
  assertEqual(["./css/homeMembers.css", "./js/homeMembersSection.js"].every((file) => sw.includes(`"${file}"`)), true, "オフライン：新しいファイルを APP_SHELL に入れた");
  assertEqual(Number(/const CACHE_VERSION = "v(\d+)";/.exec(sw)?.[1]) >= 411, true, "CACHE_VERSION は v411 以上（統合のときに上げる）");
  assertEqual(css.includes("grid-template-columns: repeat(2, minmax(0, 1fr));") && css.includes("grid-template-columns: repeat(5, minmax(0, 1fr));"), true, "CSS：スマホは2列、広いカードは5列");
  assertEqual(main.includes('memberDetailReturnScreen = "start";') && main.includes('if (memberDetailReturnScreen === "start") {'), true, "行き先：ホームから開いた個人ページの［戻る］はホームへ");
  assertEqual(main.includes('renderHomeMembers(document.getElementById("home-member-grid")'), true, "行き先：ホームのカードを作って、押すと個人ページ");
  assertEqual(guide.includes("ホームの「メンバーを知る」"), true, "ガイド：入口の案内を新しいホームに合わせた");
}

// 【2026-11-03 R10 メンバー紹介2】期間限定・単発の札と並び。2026年11月の時点の新しい活動・直した活動
function runActivityStatusTests() {
  assertEqual([ACTIVITY_STATUS_LABELS.limited?.text, ACTIVITY_STATUS_LABELS.single?.text], ["期間限定", "単発"], "活動の札：「期間限定」「単発」");
  const limited = { status: ACTIVITY_STATUS.LIMITED, startDate: "2026-11-04", endDate: "2026-11-24" };
  assertEqual([getActivityGroupRank(limited, "2026-11-10"), getActivityGroupRank(limited, "2026-12-01")], [0, 2], "期間限定：期間中は今の活動の並び、終わったら終了の並び（札は「期間限定」のまま）");
  const single = { status: ACTIVITY_STATUS.SINGLE, startDate: "2026-11-14", endDate: "2026-11-14" };
  assertEqual([getActivityGroupRank(single, "2026-11-03"), getActivityGroupRank(single, "2026-12-01")], [2, 2], "単発：日付の前後どちらも「継続中」にはしない");
  const byId = (id) => MEMBER_ACTIVITIES.find((activity) => activity.id === id);
  assertEqual([byId("takamatsu-mezamashi-2026-11")?.status, byId("takamatsu-mezamashi-2026-11")?.endDate], ["limited", "2026-11-24"], "髙松瞳：めざましテレビ 11月のマンスリーエンタメプレゼンターは期間限定");
  assertEqual(byId("morohashi-2nd-solo-concert-2026")?.status, "single", "諸橋沙夏：2nd Solo concert（2026-11-14）は単発");
  assertEqual([byId("noguchi-lovit-2025")?.status, byId("noguchi-lovit-2025")?.endDate], ["ended", "2025-12-23"], "野口衣織：ラヴィット！の火曜シーズンレギュラーは終了済み（2025-12-23）");
  assertEqual(byId("noguchi-tv")?.startDate, "2024-03-23", "野口衣織：マヂラブTV の開始日は配信開始日（＝LOVE公式8330）");
  // 並び：期間中の期間限定は、終了した活動より上
  const sorted = sortActivitiesByDateDesc([byId("noguchi-lovit-2025"), byId("takamatsu-mezamashi-2026-11")].filter(Boolean));
  assertEqual(sorted[0]?.id, "takamatsu-mezamashi-2026-11", "並び：期間限定（期間中）は終了済みより上");
  // 過去の活動は消していない（以前の件数以上）
  assertEqual(MEMBER_ACTIVITIES.length >= 72, true, `個人活動：以前の件数から減らしていない（${MEMBER_ACTIVITIES.length}件）`);
}

// 【2026-11-03 R10 メンバー紹介3】個人活動の3つの欄（今の主な活動／これまでの代表的な活動／詳しい活動履歴）
function runActivitySectionTests() {
  const today = "2026-11-03";
  const byId = (id) => MEMBER_ACTIVITIES.find((activity) => activity.id === id);
  // 今かどうか
  assertEqual(
    [
      isCurrentActivity(byId("takamatsu-mezamashi-2026-11"), today),
      isCurrentActivity(byId("takamatsu-mezamashi-2026-11"), "2026-12-01"),
      isCurrentActivity(byId("morohashi-2nd-solo-concert-2026"), today),
      isCurrentActivity(byId("morohashi-2nd-solo-concert-2026"), "2026-11-15"),
      isCurrentActivity(byId("noguchi-lovit-2025"), today),
      isCurrentActivity(byId("yamamoto-lemino-football"), today),
    ],
    [true, false, true, false, false, false],
    "今の主な活動：期間中の期間限定・これからの単発は入る。終わったもの・終了済み・継続状況未確認は入らない"
  );
  // 札：開催前の単発は「開催予定」、開催後は「単発」。継続状況が分からないものは「継続状況未確認」
  assertEqual(
    [getActivityStatusLabel(byId("morohashi-2nd-solo-concert-2026"), today)?.text, getActivityStatusLabel(byId("morohashi-2nd-solo-concert-2026"), "2026-11-15")?.text, getActivityStatusLabel(byId("takamatsu-mezamashi-2026-11"), today)?.text, getActivityStatusLabel(byId("yamamoto-lemino-football"), today)?.text],
    ["開催予定", "単発", "期間限定", "継続状況未確認"],
    "札：開催予定／単発／期間限定／継続状況未確認を区別する"
  );
  // 3つの欄（10人とも）
  const ids = activeMembers.map((member) => member.id);
  const highlightCounts = {};
  ids.forEach((memberId) => {
    const activities = MEMBER_ACTIVITIES.filter((activity) => activity.memberId === memberId || activity.relatedMemberIds?.includes(memberId));
    const host = document.createElement("div");
    host.appendChild(buildMemberActivitySections(activities, memberId, today));
    const current = [...host.querySelectorAll(".activity-list.is-current .activity-card")];
    const highlight = [...host.querySelectorAll(".activity-list.is-highlight .activity-card")];
    const history = [...host.querySelectorAll(".member-activity-history .activity-card")];
    assertEqual(history.length, activities.length, `${memberId}：詳しい活動履歴は全部（${activities.length}件）。代表に選ばなかったものも隠さない`);
    assertEqual(current.length <= CURRENT_ACTIVITY_LIMIT && current.every((card) => isCurrentActivity(byId(card.dataset.activityId), today)), true, `${memberId}：今の主な活動は今のものだけ・${CURRENT_ACTIVITY_LIMIT}件まで`);
    assertEqual(current.some((card) => ["終了", "過去の活動"].includes(card.querySelector(".activity-card-status")?.textContent)), false, `${memberId}：今の主な活動に終了済みを出さない`);
    assertEqual(highlight.length <= 4, true, `${memberId}：これまでの代表的な活動は4件まで（${highlight.length}件）`);
    // 【2026-11-03 本人の決定】今の主な活動に出ているものは、代表的な活動に重ねて出さない
    const currentIds = new Set(current.map((card) => card.dataset.activityId));
    assertEqual(highlight.some((card) => currentIds.has(card.dataset.activityId)), false, `${memberId}：今の主な活動と代表的な活動に同じ活動を重ねて出さない`);
    highlightCounts[memberId] = highlight.length;
    assertEqual(highlight.every((card) => byId(card.dataset.activityId)?.highlightFor?.[memberId]), true, `${memberId}：代表的な活動は、このメンバーの理由があるものだけ（共同の活動も、選んだメンバーだけ）`);
    assertEqual(host.querySelectorAll('[data-member-section="activities"]').length, 1, `${memberId}：［個人活動 ↓］の行き先は1つ`);
  });
  console.log("代表的な活動の件数（今の主な活動と重ねない）", JSON.stringify(highlightCounts));
  // 同じ活動を2つの欄に出すときも、データは1件（二重に持たない）
  const activityIds = MEMBER_ACTIVITIES.map((activity) => activity.id);
  assertEqual(activityIds.length, new Set(activityIds).size, "個人活動のデータに重複が無い（欄が違っても同じ1件を使う）");
  assertEqual(Object.values(byId("saito-sasaki-einstein-tv").highlightFor).length, 2, "共同の活動：選んだ理由はメンバーごと");
}

export async function runHomeMembersTests() {
  console.log("--- ホームの「メンバーを知る」・＝LOVE の3つのまとまり・個人ページの点検（2026-11-03 R10-3） ---");
  runHomeMemberCardTests();
  runProfileDataTests();
  runActivityStatusTests();
  runActivitySectionTests();
  runMemberDetailExploreTests(await fetchText("js/main.js"));
  await runMarkupTests();
}
