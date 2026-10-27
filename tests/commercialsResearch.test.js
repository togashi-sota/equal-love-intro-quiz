// 【2026-10-23新設】CM・広告・企業コラボの過去全期間（2017年〜）再調査で追加・修正したデータの回帰テスト。
// 企業名・日付・出演者・種別・出典を確認し、「当時の12人体制を今の10人全員と扱わない」「CMでないものをCMと書かない」
// 「確認できない動画URLを載せない」「見送った案件を載せていない」ことを固定する。
import { COMMERCIALS, COMMERCIAL_KIND, GROUP_PARTICIPATION } from "../js/data/commercials.js";
import { MEMBER_ACTIVITIES } from "../js/data/memberActivities.js";
import { GROUP_ACTIVITIES } from "../js/data/groupActivities.js";
import {
  getMemberCommercials,
  getGroupCommercials,
  countMembersOnDate,
  describeGroupParticipation,
  formatCommercialPeriod,
  buildMemberCommercialsSection,
  buildGroupCommercialsSection,
} from "../js/commercialsSection.js";
import { buildAppSearchEntries, searchAppEntries } from "../js/appSearchIndex.js";
import { assertEqual } from "./test-utils.js";

const TODAY = "2026-10-23";

const ORIGINAL_17_IDS = [
  "cm-group-hotpepper-beauty-2026",
  "cm-group-mcdonalds-viva-world-mac-2026",
  "cm-group-mynumber-card-2026",
  "tieup-group-rohto-lycee-2024",
  "tieup-group-ululis-2024",
  "cm-group-meiji-essel-supercup-2024",
  "campaign-group-acecook-harusame-2023",
  "cm-sasaki-mcdonalds-momo-chicken-2026",
  "cm-sasaki-mcdonalds-zakuzaku-mac-2026",
  "cm-takamatsu-mcdonalds-390-pair-2026",
  "cm-saito-mcdonalds-tsukimi-sweets-2026",
  "cm-sasaki-mcdonalds-tsukimi-pie-2026",
  "cm-softbank-galaxy-z-2026",
  "cm-sasaki-mcdonalds-samurai-mac-2026",
  "cm-yamamoto-yumetown-kenmin-2025",
  "cm-sasaki-softbank-oppo-2023",
  "cm-sasaki-yoani-2020",
];

function find(id) {
  return COMMERCIALS.find((cm) => cm.id === id);
}

function mount(node, width = 375) {
  const host = document.createElement("div");
  host.style.cssText = `position:absolute;left:-9999px;top:0;width:${width}px;box-sizing:border-box;`;
  host.appendChild(node);
  document.body.appendChild(host);
  return host;
}

export function runCommercialsResearchTests() {
  // ===== A. 既存17件を維持し、18件を追加して35件 =====
  assertEqual(ORIGINAL_17_IDS.filter((id) => !find(id)), [], "A: 既存の17件を1件も消していない");
  // 【2026-10-27】齋藤樹愛羅のUSJ「ユニハロ」WebCMを1件追加して36件
  // 【2026-10-28】大谷映美里のミスド福袋2026 WEB動画・＝LOVE名義のCoCo壱番屋「CoCo de オフカレー」を追加して38件
  assertEqual(COMMERCIALS.length, 38, "A: 登録総数は38件（17件＋新規18件＋2026-10-27追加1件＋2026-10-28追加2件）");
  assertEqual(new Set(COMMERCIALS.map((cm) => cm.id)).size, COMMERCIALS.length, "A: IDに重複が無い");
  const signature = (cm) => `${cm.brand}|${cm.title}|${cm.date}`;
  assertEqual(new Set(COMMERCIALS.map(signature)).size, COMMERCIALS.length, "A: 同じ企業・タイトル・日付の二重登録が無い");
  assertEqual(
    COMMERCIALS.filter((cm) => cm.isGroup).every((cm) => Object.values(GROUP_PARTICIPATION).includes(cm.groupParticipation)),
    true,
    "A: グループ案件はすべて参加範囲（全員／＝LOVE名義／特定できず）を持つ"
  );
  assertEqual(
    COMMERCIALS.every((cm) => cm.sourceUrls.every((url) => /^https:\/\/(equal-love\.jp|prtimes\.jp|www\.acecook\.co\.jp|hizatsuki\.com|www\.gov-online|www\.youtube\.com|x\.com|www\.atpress|www\.thefirsttimes|www\.oricon|www\.meiji|www\.mcdonalds|tower\.jp|kyodonewsprwire|natalie\.mu|www\.advertimes|www\.ichibanya)/.test(url))),
    true,
    "A: 出典は公式・報道の確認済みドメインのみ"
  );

  // ===== B. 追加した案件の企業・日付・出演者・種別・出典 =====
  const tokube = find("collab-asahi-tokube-chuhai-2026");
  assertEqual(
    [tokube.kind, tokube.date, tokube.memberIds],
    [COMMERCIAL_KIND.PRODUCT_DEVELOPMENT, "2026-10-06", ["otani-emiri", "sasaki-maika", "noguchi-iori", "morohashi-sana"]],
    "B: とくべチューハイは商品共同開発（CMではない）・2026-10-06・4人"
  );
  assertEqual([tokube.description.includes("発売日は未発表"), tokube.sourceUrls[0]], [true, "https://equal-love.jp/news/detail/12237"], "B: 発売済みと断定せず、＝LOVE公式が出典");

  const hanamaru = find("ambassador-group-hanamaru-udon-2018");
  assertEqual([hanamaru.kind, hanamaru.date, hanamaru.sourceUrls.length], [COMMERCIAL_KIND.AMBASSADOR, "2018-01-11", 4], "B: はなまるうどんはアンバサダー・2018-01-11・プレスリリース4本を1件にまとめる");
  assertEqual(["バレンタイン", "ハニーマスタードチキンサラダ", "1日アルバイト", "店内放送"].every((word) => hanamaru.description.includes(word)), true, "B: はなまるうどんの関連企画を説明にまとめる（別カードにしない）");
  assertEqual(describeGroupParticipation(hanamaru), "＝LOVE名義（当時12人体制）", "B: 2018年の案件は当時の12人体制として表示（今の10人全員とは扱わない）");

  const tetsujin = find("ambassador-group-karaoke-tetsujin-2019");
  assertEqual([tetsujin.kind, tetsujin.date, tetsujin.description.includes("曲間CM")], [COMMERCIAL_KIND.AMBASSADOR, "2019-04-01", true], "B: カラオケの鉄人は応援アンバサダー（曲間CMは説明に含める）");
  assertEqual(COMMERCIALS.filter((cm) => cm.brand.includes("鉄人")).length, 1, "B: カラオケの鉄人は1件だけ（関連企画を分割しない）");

  // 【2026-10-28追加】CoCo壱番屋はグループ名義の企業タイアップ（店頭広告）。掲出期間つき
  const cocoichi = find("tieup-group-cocoichi-off-curry-2019");
  assertEqual(
    [cocoichi?.isGroup, cocoichi?.groupParticipation, cocoichi?.kind, cocoichi?.date, cocoichi?.endDate, cocoichi?.sourceUrls[0]],
    [true, GROUP_PARTICIPATION.GROUP, COMMERCIAL_KIND.TIE_UP, "2019-03-01", "2019-05-31", "https://equal-love.jp/news/detail/1414"],
    "B: CoCo壱番屋「CoCo de オフカレー」は＝LOVE名義の企業タイアップ（2019-03-01〜05-31、＝LOVE公式が出典）"
  );
  // 【2026-10-28追加】大谷映美里のミスド福袋2026（公式表記「WEB動画」3本を1件にまとめる）
  const misdo = find("cm-otani-misdo-fukubukuro-2026");
  assertEqual([misdo?.memberIds, misdo?.kind, misdo?.date], [["otani-emiri"], COMMERCIAL_KIND.WEB, "2025-12-10"], "B: ミスド福袋2026は大谷映美里のWebCM（＝LOVE公式の告知日 2025-12-10）");
  assertEqual(COMMERCIALS.filter((cm) => cm.brand.includes("ミスド福袋")).length, 1, "B: ミスド福袋のWEB動画3本は1件にまとめる");
  // 【2026-10-28修正】ももチキンTVCMは阿部寛と共演（マクドナルド公式リリース）。同シリーズのWebCMとは別作品のまま
  const momo = find("cm-sasaki-mcdonalds-momo-chicken-2026");
  assertEqual([momo.coStars, momo.date, momo.sourceUrls.includes("https://www.mcdonalds.co.jp/company/news/2026/1008a/")], ["阿部寛", "2026-10-27", true], "B: ももチキンTVCMは阿部寛と共演・2026-10-27・マクドナルド公式が出典");
  assertEqual(find("cm-sasaki-mcdonalds-tsukimi-pie-2026").title, "月見スイーツ「月見でたでた」佐々木さん篇", "B: 月見パイCMの題名は公式の篇名");

  const joyo = find("image-group-joyo-bank-2020");
  assertEqual([joyo.kind, joyo.date, joyo.endDate, joyo.description.includes("ラジオCM")], [COMMERCIAL_KIND.IMAGE_CHARACTER, "2020-03-02", "2020-06-30", true], "B: 常陽銀行はイメージキャラクター（ラジオCM・店頭広告を含む）");

  const etax = COMMERCIALS.filter((cm) => cm.id.startsWith("pr-group-etax-"));
  assertEqual(etax.map((cm) => cm.date).sort(), ["2022-01-12", "2023-01-30", "2024-01-04", "2025-01-06", "2026-01-05"], "B: e-Tax PR動画は年ごとの別制作物として5件");
  assertEqual(etax.every((cm) => cm.kind === COMMERCIAL_KIND.PR_VIDEO && cm.brand.includes("国税庁")), true, "B: e-TaxはPR動画（国税庁）");
  assertEqual(etax.every((cm) => !cm.title.includes("マイナ")) && find("cm-group-mynumber-card-2026").brand.includes("政府広報"), true, "B: e-Taxはマイナカード（政府広報）とは別企画");
  assertEqual(
    etax.map((cm) => describeGroupParticipation(cm)).sort(),
    ["＝LOVE名義（当時10人体制）", "＝LOVE名義（当時10人体制）", "＝LOVE名義（当時10人体制）", "＝LOVE名義（当時10人体制）", "＝LOVE名義（当時11人体制）"],
    "B: 2022年は当時11人、2023年以降は10人として表示"
  );

  const koe = COMMERCIALS.filter((cm) => cm.brand === "koe");
  assertEqual(koe.map((cm) => [cm.kind, cm.date, cm.memberIds]), [
    [COMMERCIAL_KIND.WEB_MODEL, "2021-09-24", ["otoshima-risa", "noguchi-iori"]],
    [COMMERCIAL_KIND.WEB_MODEL, "2021-04-28", ["otoshima-risa", "noguchi-iori"]],
  ], "B: koeはCMではなくWebモデル（音嶋・野口、2021年春夏・秋）");

  const amu = find("campaign-character-group-amu-plaza-oita-2018");
  assertEqual([amu.kind, amu.date, amu.sourceUrls[0]], [COMMERCIAL_KIND.CAMPAIGN_CHARACTER, "2018-02-28", "https://equal-love.jp/news/detail/473"], "B: アミュプラザおおいたはキャンペーンキャラクター");
  const astra = find("image-group-astra-tale-2020");
  assertEqual([astra.kind, astra.date], [COMMERCIAL_KIND.IMAGE_CHARACTER, "2020-12-17"], "B: アストラ・テイルはゲームのイメージキャラクター");

  const hizatsuki = find("collab-group-hizatsuki-ebisen-2023");
  assertEqual([hizatsuki.kind, hizatsuki.date, hizatsuki.isGroup, hizatsuki.featuredMembers], [
    COMMERCIAL_KIND.COLLAB_PRODUCT,
    "2023-07-17",
    true,
    [{ memberId: "oba-hana", role: "パッケージイラストを描き下ろし" }],
  ], "B: ひざつき製菓はグループのコラボ商品で、大場花菜がパッケージイラスト");
  assertEqual(getMemberCommercials("oba-hana").map((cm) => cm.id), ["collab-group-hizatsuki-ebisen-2023"], "B: 同じ1件が大場花菜の個人ページからも参照される（カードを複製しない）");
  assertEqual(getGroupCommercials().some((cm) => cm.id === hizatsuki.id), true, "B: グループのコラボ実績にも出る");

  const jill = find("collab-group-jill-stuart-cinnamoroll-2023");
  assertEqual([jill.kind, jill.date, jill.endDate, describeGroupParticipation(jill)], [COMMERCIAL_KIND.COLLAB_CAMPAIGN, "2023-08-25", "2023-09-07", "＝LOVE全員（当時10人）"], "B: JILL STUART Beautyはコラボキャンペーン（全員・当時10人）");
  const kate = find("campaign-group-donki-kate-2023");
  assertEqual([kate.kind, kate.date, kate.endDate, describeGroupParticipation(kate)], [COMMERCIAL_KIND.SALES_CAMPAIGN, "2023-11-10", "2023-12-10", "＝LOVE全員（当時10人）"], "B: ドン・キホーテ×KATEは販促キャンペーン（全員10人と公式に明記）");

  const acecook1 = find("campaign-group-acecook-harusame-2023");
  const acecook2 = find("campaign-group-acecook-harusame-2024");
  assertEqual([acecook1.title.includes("第1弾"), acecook2.title.includes("第2弾"), acecook1.date, acecook2.date], [true, true, "2023-05-01", "2024-05-01"], "B: エースコックは第1弾・第2弾を別の企画として履歴が分かる");
  assertEqual(acecook2.sourceUrls, ["https://equal-love.jp/news/detail/8419", "https://www.acecook.co.jp/news/002812/"], "B: 第2弾の出典（＝LOVE公式・エースコック）");

  const maple = find("collab-maplestory-2021");
  assertEqual([maple.kind, maple.memberIds], [COMMERCIAL_KIND.COLLAB, ["otoshima-risa", "sasaki-maika", "noguchi-iori"]], "B: メイプルストーリーは企業コラボ（音嶋・佐々木・野口）");

  // ===== C. 既存データの修正（ululis） =====
  const ululis = find("tieup-group-ululis-2024");
  assertEqual(ululis.groupParticipation, GROUP_PARTICIPATION.UNSPECIFIED, "C: ululisは出演メンバーを特定できないため「全員出演」と断定しない");
  assertEqual(describeGroupParticipation(ululis), "＝LOVE名義（出演メンバーは公式発表では特定できず）", "C: ululisの参加範囲の表示");

  // ===== D. 確認できないもの・対象外を載せていない =====
  const unverifiedVideoIds = ["4guTwkWGIik", "ueUfhjYe9bs", "07INKmOipIE", "WXYKC-WH7hY", "eMJi5d34iJc", "4om5xThYcAk"];
  const allUrls = COMMERCIALS.flatMap((cm) => [...cm.links.map((link) => link.url), ...cm.sourceUrls]);
  assertEqual(unverifiedVideoIds.filter((id) => allUrls.some((url) => url.includes(id))), [], "D: 公開状態を確認できなかった動画URLを載せていない");
  const skippedWords = ["富士急", "よみうりランド", "Angel Heart", "モーリーファンタジー", "ららぽーと", "ハロウィン"];
  assertEqual(skippedWords.filter((word) => COMMERCIALS.some((cm) => `${cm.brand}${cm.title}`.includes(word))), [], "D: 会場コラボ・物販中心・一次資料不足で見送った案件は載せていない");
  assertEqual(COMMERCIALS.filter((cm) => cm.brand === "代々木アニメーション学院").map((cm) => cm.id), ["cm-sasaki-yoani-2020"], "D: 日付・出演者が一次資料で確定できない2018年の代アニのグループCMは追加していない");
  const nonCmKinds = [COMMERCIAL_KIND.PRODUCT_DEVELOPMENT, COMMERCIAL_KIND.WEB_MODEL, COMMERCIAL_KIND.COLLAB_PRODUCT, COMMERCIAL_KIND.COLLAB];
  assertEqual(COMMERCIALS.filter((cm) => nonCmKinds.includes(cm.kind)).every((cm) => !/CM出演|新CM/.test(cm.description)), true, "D: 商品開発・Webモデル・コラボをCM出演と書いていない");
  const otherBrands = ["はなまる", "鉄人", "常陽", "e-Tax", "koe", "アミュプラザ", "アストラ", "ひざつき", "JILL", "KATE", "とくべ", "メイプル"];
  // 大場花菜のラジオ番組「はなまる！」（oba-nack5-hanamaru）は、はなまるうどんとは無関係なので照合から外す
  const activityTextsForCheck = [...MEMBER_ACTIVITIES, ...GROUP_ACTIVITIES].filter((activity) => activity.id !== "oba-nack5-hanamaru").map((activity) => `${activity.title}${activity.description ?? ""}`);
  assertEqual(otherBrands.filter((word) => activityTextsForCheck.some((text) => text.includes(word))), [], "D: 個人活動・グループ活動に同じ案件が無い（二重管理しない）");

  // ===== E. 表示 =====
  assertEqual([countMembersOnDate("2018-01-11"), countMembersOnDate("2022-01-12"), countMembersOnDate("2026-10-23")], [12, 11, 10], "E: 当時の人数を加入日・卒業日から計算");
  assertEqual(formatCommercialPeriod(jill, TODAY), "2023年8月25日〜9月7日", "E: 期間は開始日〜終了日");
  assertEqual(COMMERCIALS.every((cm) => /^\d{4}-\d{2}-\d{2}$/.test(cm.date) && (cm.endDate === undefined || (/^\d{4}-\d{2}-\d{2}$/.test(cm.endDate) && cm.endDate > cm.date))), true, "E: 終了日は開始日より後の正しい日付");
  assertEqual(countMembersOnDate("2021-03-06"), 12, "E: 卒業公演の当日までは在籍として数える");
  const searchEntries = buildAppSearchEntries({ today: TODAY });
  const cmOnly = searchAppEntries(searchEntries, "CM", "cm").results.map(({ entry }) => entry.key);
  assertEqual(cmOnly.some((key) => key.includes("webmodel-koe") || key.includes("tokube")), false, "E: 「CM」で探してもWebモデル・商品開発は出ない");
  const collabOnly = searchAppEntries(searchEntries, "コラボ", "cm").results.map(({ entry }) => entry.key);
  assertEqual(collabOnly.includes("cm:cm-sasaki-mcdonalds-samurai-mac-2026"), false, "E: 「コラボ」で探してもテレビCMは出ない");
  assertEqual(searchEntries.find((entry) => entry.key === "member:oba-hana").lines.some((line) => line.includes("CM・広告・コラボ 1件")), true, "E: メンバーの検索結果の件数は個人ページと同じ数え方");
  assertEqual(formatCommercialPeriod({ date: "2021-12-28", endDate: "2022-01-10" }, TODAY), "2021年12月28日〜2022年1月10日", "E: 年をまたぐ期間は終了日にも年を付ける");
  const obaHost = mount(buildMemberCommercialsSection("oba-hana", COMMERCIALS, TODAY));
  try {
    assertEqual(obaHost.querySelector(".commercial-featured-role")?.textContent, "＝LOVE名義の企画でパッケージイラストを描き下ろし", "E: 大場花菜のページに役割つきで表示");
    assertEqual(obaHost.querySelector(".stage-voice-heading-sub")?.textContent, "　CM・広告・企業コラボ", "E: 個人ページの見出しは「CM・広告・企業コラボ」");
  } finally {
    obaHost.remove();
  }
  const groupHost = mount(buildGroupCommercialsSection(COMMERCIALS, TODAY));
  try {
    const hizatsukiCard = groupHost.querySelector('[data-commercial-id="collab-group-hizatsuki-ebisen-2023"]');
    assertEqual([...hizatsukiCard.querySelectorAll(".commercial-featured-role, .commercial-participation")].map((line) => line.textContent), ["参加：＝LOVE名義（当時10人体制）", "大場花菜：パッケージイラストを描き下ろし"], "E: グループ欄に参加範囲と担当を表示");
    assertEqual(groupHost.querySelector(".stage-voice-heading-sub").textContent, "　CM・広告・企業コラボ（＝LOVE名義）", "E: グループ欄の見出しは「＝LOVE名義」（全員出演とは限らない）");
    assertEqual(groupHost.querySelectorAll(".stage-voice-more-button").length, 1, "E: 22件でも「もっと見る」で折りたたむ");
    assertEqual(groupHost.scrollWidth <= groupHost.clientWidth + 1, true, "E: 375px幅で横にはみ出さない");
  } finally {
    groupHost.remove();
  }

  // ===== F. 全体検索にも自動で反映される =====
  const entries = buildAppSearchEntries({ today: TODAY });
  const titles = (query) => searchAppEntries(entries, query, "cm").results.map(({ entry }) => entry.title);
  assertEqual(titles("e-Tax").length, 5, "F: 「e-Tax」で5年分が見つかる");
  assertEqual(titles("はなまるうどん")[0], "はなまるうどん「美と健康プロジェクト」", "F: 過去の案件も検索できる");
  assertEqual(titles("おおば").includes("ひざつき製菓"), true, "F: 担当メンバーの読み仮名でグループ案件も見つかる");
  const tokubeEntry = entries.find((entry) => entry.key === "cm:collab-asahi-tokube-chuhai-2026");
  assertEqual(tokubeEntry.subtitle, "商品共同開発／大谷映美里・佐々木舞香・野口衣織・諸橋沙夏", "F: 検索結果でも種別と参加者が分かる");
}
