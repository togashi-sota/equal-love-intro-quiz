// 【2026-10-01新設】メンバー個人ページの STAGE／VOICE セクションの回帰テスト。
//   ・データの整合性（memberId実在・リンクがhttps・IDの重複なし・全員出演作の12人配役順）
//   ・正しいメンバーに正しいセクションが出る／該当なしなら出ない
//   ・多いメンバー（野口衣織）は折りたたまれ「もっと見る」で開閉できる／少ないメンバーは折りたたみなし
//   ・外部リンクの安全な開き方（target=_blank rel=noopener noreferrer）
//   ・375px幅で横にはみ出さない
import { STAGE_PRODUCTIONS, VOICE_APPEARANCES } from "../js/data/memberStageVoice.js";
import { MEMBERS } from "../js/data/members.js";
import {
  buildMemberStageVoiceSections,
  pickMemberWorks,
  formatCastRole,
  VOICE_INITIAL_VISIBLE_COUNT,
} from "../js/memberStageVoiceSection.js";
import { assertEqual } from "./test-utils.js";

const EXPECTED_12_ORDER = [
  "otani-emiri", "oba-hana", "otoshima-risa", "saito-kiara", "saito-nagisa", "sasaki-maika",
  "satake-nonno", "takamatsu-hitomi", "takiwaki-shoko", "noguchi-iori", "morohashi-sana", "yamamoto-anna",
];
const CURRENT_MEMBER_IDS = MEMBERS.filter((member) => member.status === "active").map((member) => member.id);

function renderSections(memberId) {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;width:375px;box-sizing:border-box;";
  host.appendChild(buildMemberStageVoiceSections(memberId));
  document.body.appendChild(host);
  return host;
}

export function runMemberStageVoiceTests() {
  const allWorks = [...STAGE_PRODUCTIONS, ...VOICE_APPEARANCES];
  const memberIds = new Set(MEMBERS.map((member) => member.id));

  // ---- A. データ整合性 ----
  assertEqual(new Set(allWorks.map((work) => work.id)).size, allWorks.length, "A: 作品IDが重複しない");
  assertEqual(
    allWorks.every((work) => work.casts.length > 0 && work.casts.every((entry) => memberIds.has(entry.memberId))),
    true,
    "A: 全配役のmemberIdがmembers.jsに実在する"
  );
  assertEqual(
    allWorks.every((work) => work.casts.every((entry, index, all) => all.findIndex((other) => other.memberId === entry.memberId) === index)),
    true,
    "A: 1作品内で同じメンバーが二重登録されていない"
  );
  assertEqual(
    allWorks.every((work) => (work.links ?? []).every((link) => link.url.startsWith("https://") || link.url.startsWith("http://"))),
    true,
    "A: 全リンクがhttp(s)"
  );
  assertEqual(allWorks.every((work) => (work.links ?? []).length > 0), true, "A: 全作品に最低1つ公式系リンクがある");
  assertEqual(allWorks.every((work) => /^\d{4}-\d{2}-\d{2}$/.test(work.sortKey)), true, "A: sortKeyがYYYY-MM-DD");

  // ---- B. 全員出演の2作品は12人が本人指定の順で1つの一覧になる ----
  ["stage-kemono-friends-2018", "stage-girlfriend-kari-2018"].forEach((id) => {
    const work = STAGE_PRODUCTIONS.find((entry) => entry.id === id);
    assertEqual(work?.casts.map((entry) => entry.memberId), EXPECTED_12_ORDER, `B: ${id} の12人の並びが指定どおり`);
    assertEqual(work?.showFullCast, true, `B: ${id} は全キャスト展開あり`);
  });
  const kemono = STAGE_PRODUCTIONS.find((entry) => entry.id === "stage-kemono-friends-2018");
  assertEqual(kemono.casts.find((entry) => entry.memberId === "noguchi-iori").role, "オーロックス", "B: 野口衣織＝オーロックス");
  assertEqual(kemono.casts.find((entry) => entry.memberId === "saito-nagisa").role, "ツチノコ", "B: 齊藤なぎさ＝ツチノコ");

  // ---- C. 10人全員のページ：STAGEは全員（2018年の全員出演）、VOICEは全員に出る ----
  assertEqual(CURRENT_MEMBER_IDS.length, 10, "C: 現役メンバーは10人");
  CURRENT_MEMBER_IDS.forEach((memberId) => {
    const host = renderSections(memberId);
    try {
      assertEqual(host.querySelector('[data-section="stage"]') !== null, true, `C: ${memberId} にSTAGEがある（2018年の全員出演）`);
      assertEqual(host.querySelector('[data-section="voice"]') !== null, true, `C: ${memberId} にVOICEがある`);
      assertEqual(host.scrollWidth <= host.clientWidth + 1, true, `C: ${memberId} は375px幅で横にはみ出さない`);
    } finally {
      host.remove();
    }
  });
  // 元メンバー（ページ表示はしないが関数が落ちない／該当ありなら出る）
  assertEqual(buildMemberStageVoiceSections("存在しないID").childNodes.length, 0, "C: 該当なしのIDでは何も出さない");

  // ---- D. 個別の出演が正しいメンバーにだけ付く ----
  const stageOf = (id) => pickMemberWorks(STAGE_PRODUCTIONS, id).map((entry) => entry.work.id);
  assertEqual(stageOf("sasaki-maika").includes("stage-tokyo-revengers-musical-2023"), true, "D: 佐々木舞香＝東京リベンジャーズ");
  assertEqual(stageOf("noguchi-iori").includes("stage-fruits-basket-2nd-2023"), true, "D: 野口衣織＝フルバ");
  assertEqual(stageOf("oba-hana").includes("stage-kimiuso-reading-2023"), true, "D: 大場花菜＝四月は君の嘘");
  assertEqual(stageOf("morohashi-sana").length, 2 + 5, "D: 諸橋沙夏は舞台7件（全員出演2＋個人5）");
  assertEqual(stageOf("otani-emiri").length, 2, "D: 大谷映美里は全員出演の2件のみ");
  assertEqual(stageOf("noguchi-iori").includes("stage-tokyo-revengers-musical-2023"), false, "D: 野口衣織に東リベが混ざらない");
  assertEqual(
    pickMemberWorks(STAGE_PRODUCTIONS, "morohashi-sana").map((entry) => entry.work.sortKey),
    [...pickMemberWorks(STAGE_PRODUCTIONS, "morohashi-sana").map((entry) => entry.work.sortKey)].sort().reverse(),
    "D: 新しい順に並ぶ"
  );
  assertEqual(formatCastRole({ role: "オーロックス", credit: null }), "オーロックス 役", "D: 役名には「役」が付く");
  assertEqual(formatCastRole({ role: null, credit: "ゲスト出演" }), "ゲスト出演", "D: 役名なしはcreditを出す");

  // ---- E. 野口衣織：VOICEは多いので折りたたみ、もっと見るで開閉できる ----
  const noguchiVoiceCount = pickMemberWorks(VOICE_APPEARANCES, "noguchi-iori").length;
  assertEqual(noguchiVoiceCount > VOICE_INITIAL_VISIBLE_COUNT, true, "E: 野口衣織のVOICEは初期表示件数より多い");
  const noguchiHost = renderSections("noguchi-iori");
  try {
    const voiceSection = noguchiHost.querySelector('[data-section="voice"]');
    const cards = [...voiceSection.querySelectorAll(".stage-voice-card")];
    assertEqual(cards.filter((card) => !card.hidden).length, VOICE_INITIAL_VISIBLE_COUNT, "E: 最初は代表の5件だけ見える");
    const button = voiceSection.querySelector(".stage-voice-more-button");
    assertEqual(button !== null, true, "E: 「もっと見る」ボタンがある");
    assertEqual(button.textContent.includes("もっと見る"), true, "E: ボタン文言");
    button.click();
    assertEqual(cards.every((card) => !card.hidden), true, "E: 押すと全件見える");
    assertEqual(button.getAttribute("aria-expanded"), "true", "E: aria-expandedがtrue");
    button.click();
    assertEqual(cards.filter((card) => !card.hidden).length, VOICE_INITIAL_VISIBLE_COUNT, "E: もう一度押すと畳まれる");
    assertEqual(noguchiHost.scrollWidth <= noguchiHost.clientWidth + 1, true, "E: 展開してもはみ出さない");
  } finally {
    noguchiHost.remove();
  }

  // ---- F. 件数が少ないメンバーは折りたたみボタンなし ----
  const otaniHost = renderSections("otani-emiri");
  try {
    assertEqual(otaniHost.querySelector(".stage-voice-more-button"), null, "F: 件数の少ない大谷映美里には「もっと見る」が出ない");
    assertEqual(otaniHost.querySelectorAll(".stage-voice-card").length > 0, true, "F: カードは出る");
  } finally {
    otaniHost.remove();
  }

  // ---- G. 全員出演の舞台：本人の役が目立ち、展開すると12人が1つの一覧で出る ----
  const noguchiStageHost = renderSections("noguchi-iori");
  try {
    const kemonoCard = noguchiStageHost.querySelector('[data-work-id="stage-kemono-friends-2018"]');
    assertEqual(kemonoCard.querySelector(".stage-voice-role").textContent, "野口衣織 ／ オーロックス 役", "G: 本人の役が「名前 ／ 役名 役」で出る");
    assertEqual(kemonoCard.textContent.includes("＝LOVE結成当時の12人全員が出演"), true, "G: 説明文が出る");
    const items = [...kemonoCard.querySelectorAll(".stage-voice-cast-item")];
    assertEqual(items.length, 12, "G: 展開部分は12人");
    assertEqual(
      items.map((item) => item.querySelector(".stage-voice-cast-name").textContent),
      ["大谷映美里", "大場花菜", "音嶋莉沙", "齋藤樹愛羅", "齊藤なぎさ", "佐々木舞香", "佐竹のん乃", "髙松瞳", "瀧脇笙古", "野口衣織", "諸橋沙夏", "山本杏奈"],
      "G: 12人が指定順の1つの一覧"
    );
    assertEqual(kemonoCard.querySelectorAll(".stage-voice-former-note").length, 2, "G: 「（元メンバー）」の注記は元メンバー2人だけ");
    assertEqual(items.filter((item) => item.classList.contains("is-self")).length, 1, "G: 本人の行だけ強調される");
  } finally {
    noguchiStageHost.remove();
  }

  // ---- H. 外部リンクは安全な開き方 ----
  const links = [];
  CURRENT_MEMBER_IDS.forEach((memberId) => {
    const host = renderSections(memberId);
    links.push(...host.querySelectorAll("a"));
    host.remove();
  });
  assertEqual(links.length > 0, true, "H: リンクが出る");
  assertEqual(
    links.every((link) => link.target === "_blank" && link.rel.includes("noopener") && link.rel.includes("noreferrer")),
    true,
    "H: 全リンクが target=_blank rel=noopener noreferrer"
  );
}
