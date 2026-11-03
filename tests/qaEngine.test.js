// 【R11-qa 2026-11-03新設】「質問AI」の仕組みと画面のテスト（正確性の独立テストは tests/qaAccuracy.test.js）。
// 文字の正規化・番号・TYPE・辞書（取り違えの防止）・おすすめ質問がすべて答えられること・画面・入口・オフライン・
// 外へ送らない／保存しない・古い iPhone の Safari で読めない書き方をしていないことを確かめる。
import { normalizeQuestion, kanjiNumberToInt, extractWorkNumber, extractYear, extractTypeLetter } from "../js/qaText.js";
import { answerQuestion, parseQaQuestion, prepareQaSearch, QA_STATUS, QA_NOT_FOUND_TEXT } from "../js/qaEngine.js";
import { setQaNewsProvider, getQaNewsSnapshot } from "../js/qaNewsBridge.js";
import { setYoutubeAppearanceSnapshotForTest } from "../js/youtubeAppearanceData.js";
import { QA_SUGGESTION_CATEGORIES } from "../js/data/qaSuggestions.js";
import { initQaScreen, openQaScreen, askQaForTest, getQaScreenState, resetQaScreenForTest, QA_DISCLAIMER } from "../js/qaScreen.js";
import { isFloatingBackScreen } from "../js/floatingBack.js";
import { MEMBERS } from "../js/data/members.js";
import { MEMBER_PROFILES } from "../js/data/memberProfiles.js";
import { MEMBER_ACTIVITIES } from "../js/data/memberActivities.js";
import { splitJapaneseSentences } from "../js/qaEngine.js";
import { isCurrentActivity, sortActivitiesByDateDesc } from "../js/membersScreen.js";
import { getMemberActivities } from "../js/memberUtils.js";
import { assertEqual } from "./test-utils.js";

const TODAY = "2026-11-03";
const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const FAKE_YOUTUBE = {
  state: "ready",
  data: { fetchedAt: "2026-11-01T00:00:00Z" },
  error: null,
  videos: [
    { id: "testvideo01", title: "（テスト用の仮の動画）A", publishedAt: "2020-06-01", kind: "video", status: "cast-list", memberIds: ["noguchi-iori", "yamamoto-anna"], footageMemberIds: [] },
    { id: "testvideo02", title: "（テスト用の仮の動画）B", publishedAt: "2024-03-01", kind: "video", status: "title-name", memberIds: ["yamamoto-anna"], footageMemberIds: [] },
  ],
};
const FAKE_NEWS = { state: "ready", items: [{ id: "n", title: "（テスト用）22ndシングル発売決定", publishedOn: "2026-11-02", category: "release", memberIds: [], url: "https://equal-love.jp/news/detail/test", source: "test", fetchedAt: "2026-11-03T00:00:00Z" }] };

function runTextTests() {
  assertEqual([kanjiNumberToInt("十六"), kanjiNumberToInt("二十一"), kanjiNumberToInt("三"), kanjiNumberToInt("十")], [16, 21, 3, 10], "文字：漢数字");
  assertEqual(["16枚目", "十六枚目", "16番目", "16th", "16作目", "第16弾"].map((text) => extractWorkNumber(normalizeQuestion(text))), [16, 16, 16, 16, 16, 16], "文字：番号の言い方（何枚目・何番目・th・第○弾）");
  assertEqual(extractWorkNumber(normalizeQuestion("一瞬で十分")), null, "文字：普通の言葉の漢数字は数字にしない");
  assertEqual([extractYear(normalizeQuestion("2024年のライブ")), extractYear(normalizeQuestion("24/7の発売日"))], [2024, null], "文字：年（曲名の 24/7 と取り違えない）");
  assertEqual(["TypeB", "Type-B", "タイプB", "type b", "Bタイプ"].map((text) => extractTypeLetter(normalizeQuestion(text))), ["B", "B", "B", "B", "B"], "文字：TYPE の言い方");
  assertEqual(normalizeQuestion("髙松瞳") === normalizeQuestion("高松瞳"), true, "文字：髙／高");
  assertEqual(normalizeQuestion("齋藤") === normalizeQuestion("斎藤"), true, "文字：齋／斎（そろえた形）");
  assertEqual(normalizeQuestion("齋藤", { loose: false }) === normalizeQuestion("齊藤", { loose: false }), false, "文字：異体字をそろえない形では、齋藤と齊藤は別");
  assertEqual(normalizeQuestion("イコラブに入った").includes("いこらぶ"), false, "文字：イコラブ／＝LOVE（グループ名）は、聞き方の判定から外す");
}

function runParseTests() {
  const parsed = parseQaQuestion("呪って呪っては何枚目？");
  assertEqual(parsed.songIds, ["norotte-norotte"], "辞書：曲名を見つける");
  assertEqual(parseQaQuestion("衣織の誕生日").memberIds, ["noguchi-iori"], "辞書：名だけ（衣織）");
  assertEqual(parseQaQuestion("いおりの誕生日").memberIds, ["noguchi-iori"], "辞書：名の読み（いおり）");
  assertEqual(parseQaQuestion("みりにゃの誕生日").memberIds, ["otani-emiri"], "辞書：愛称（みりにゃ）");
  assertEqual(parseQaQuestion("高松の誕生日").memberIds, ["takamatsu-hitomi"], "辞書：高松（髙松）");
  assertEqual(parseQaQuestion("齋藤の誕生日").memberIds, ["saito-kiara"], "辞書：「齋藤」とぴったり書けば齋藤樹愛羅");
  assertEqual(parseQaQuestion("齊藤の誕生日").memberIds, ["saito-nagisa"], "辞書：「齊藤」とぴったり書けば齊藤なぎさ");
  assertEqual(parseQaQuestion("さいとうの誕生日").ambiguousMembers.length, 1, "辞書：「さいとう」は2人に当たるので決めない");
  assertEqual(parseQaQuestion("樹愛羅、助けに来たぞのセンター").songIds, ["kiara-tasuke-ni-kita-zo"], "辞書：曲名の中のメンバー名より、長い曲名を先に");
  assertEqual(parseQaQuestion("あんなに好きな曲").memberIds, [], "辞書：普通の言葉の「あんな」を山本杏奈にしない");
  assertEqual(parseQaQuestion("＝LOVEのリーダー").songIds, [], "辞書：グループ名の＝LOVE を曲にしない");
  assertEqual(parseQaQuestion("「＝LOVE」のセンター").songIds, ["love"], "辞書：「」で囲めば曲の＝LOVE");
}

function runAnswerShapeTests() {
  const answer = answerQuestion("呪って呪っては何枚目？", { today: TODAY });
  assertEqual(answer.status, QA_STATUS.ANSWER, "答え：状態");
  assertEqual(answer.evidence.length > 0 && answer.links.length > 0, true, "答え：根拠と開く先がある");
  assertEqual(answer.links.every((link) => link.url || (link.target && typeof link.target.kind === "string")), true, "答え：開く先は全体検索と同じ形（kind）か公式の URL");
  assertEqual(answer.note.includes("登録された情報だけ"), true, "答え：アプリの情報だけで答えていると書く");
  const unknown = answerQuestion("あいうえおかきくけこ", { today: TODAY });
  assertEqual([QA_STATUS.UNKNOWN, QA_STATUS.CANDIDATES].includes(unknown.status), true, "答え：読み取れないときは答えを作らない");
  assertEqual(answerQuestion("富士山の特典映像は？", { today: TODAY }).text.startsWith(QA_NOT_FOUND_TEXT), true, "答え：無いときは「現在登録されている情報では確認できません」");
  assertEqual(answerQuestion("", { today: TODAY }).status, QA_STATUS.UNKNOWN, "答え：空の質問");
  const long = answerQuestion("あ".repeat(500), { today: TODAY });
  assertEqual(typeof long.text, "string", "答え：長い文字でも壊れない");
  const html = answerQuestion("<img src=x onerror=alert(1)>呪って呪っては何枚目", { today: TODAY });
  assertEqual(html.status, QA_STATUS.ANSWER, "答え：記号の混ざった質問でも答える（HTML としては扱わない）");
}

// 【R12】「どんな人？」：個人ページの情報から作る。ひとこと紹介（homeLead）に頼らない・データに無い性格を足さない・個人ページと食い違わない
function runMemberIntroductionTests() {
  const fabricated = ["明るく", "明るい", "優しい", "天然", "クール", "しっかり者", "努力家", "負けず嫌い", "ムードメーカー", "おっとり"];
  MEMBERS.forEach((member) => {
    const answer = answerQuestion(`${member.name}はどんな人？`, { today: TODAY });
    const profile = MEMBER_PROFILES.find((entry) => entry.memberId === member.id);
    const source = JSON.stringify([profile, MEMBER_ACTIVITIES.filter((activity) => activity.memberId === member.id || (activity.relatedMemberIds ?? []).includes(member.id))]);
    assertEqual(answer.status, QA_STATUS.ANSWER, `人物：${member.name}に答える`);
    assertEqual(answer.links.at(-1)?.label, "詳しいプロフィールを見る", `人物：${member.name}の答えの最後に［詳しいプロフィールを見る］`);
    if (profile?.homeLead?.text) assertEqual(answer.text.includes(profile.homeLead.text.replaceAll("|", "")), false, `人物：${member.name}はホームのひとこと紹介（homeLead）をそのまま使わない`);
    assertEqual(fabricated.filter((word) => answer.text.includes(word) && !source.includes(word)), [], `人物：${member.name}の答えに、データに無い性格の言葉が無い`);
    // 紹介文・加入前から使った文は、データの文そのまま（文の単位）
    const used = splitJapaneseSentences(answer.text).filter((sentence) => !/^(.+?（.+?）は、＝LOVE の|今の主な活動には、)/.test(sentence)).map((sentence) => sentence.replace(/^＝LOVE 加入前(は)?、/, ""));
    const pool = [...splitJapaneseSentences(profile?.introduction?.text), ...splitJapaneseSentences(profile?.preDebutActivity?.text)];
    assertEqual(used.filter((sentence) => !pool.includes(sentence)), [], `人物：${member.name}の答えの文は、紹介文・加入前の活動の文そのまま`);
    const sentenceCount = splitJapaneseSentences(answer.text).length;
    assertEqual(sentenceCount >= 2 && sentenceCount <= 5, true, `人物：${member.name}は2〜5文（${sentenceCount}文）`);
    // 今の主な活動は、個人ページの「今の主な活動」の先頭3つと同じ
    const current = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, member.id)).filter((activity) => isCurrentActivity(activity, TODAY)).slice(0, 3);
    assertEqual(current.every((activity) => answer.text.includes(activity.title)), true, `人物：${member.name}の「今の主な活動」は個人ページと同じ`);
  });
}

function runSuggestionTests() {
  setYoutubeAppearanceSnapshotForTest(FAKE_YOUTUBE);
  setQaNewsProvider(() => FAKE_NEWS);
  try {
    assertEqual(QA_SUGGESTION_CATEGORIES.map((category) => category.label), ["楽曲", "メンバー", "CD・特典映像", "テレビ・CM", "YouTube", "ライブ", "最新情報"], "おすすめ：カテゴリ");
    QA_SUGGESTION_CATEGORIES.forEach((category) => {
      category.questions.forEach((question) => {
        const answer = answerQuestion(question, { today: TODAY });
        assertEqual(answer.status, QA_STATUS.ANSWER, `おすすめ［${category.label}］「${question}」は答えられる（${answer.text.slice(0, 40)}）`);
      });
    });
  } finally {
    setYoutubeAppearanceSnapshotForTest(null);
    setQaNewsProvider(null);
  }
  assertEqual(getQaNewsSnapshot(), { state: "unavailable", items: [] }, "最新情報：つながっていないときは unavailable");
  setQaNewsProvider(() => {
    throw new Error("壊れた");
  });
  assertEqual(getQaNewsSnapshot().state, "error", "最新情報：読み込みで失敗しても壊れない");
  setQaNewsProvider(() => ({ state: "ready", items: [{ title: 1 }, null, { title: "ok" }] }));
  assertEqual(getQaNewsSnapshot().items.length, 1, "最新情報：形の違う項目は使わない");
  setQaNewsProvider(null);
}

async function runScreenTests() {
  const box = document.createElement("div");
  box.style.position = "absolute";
  box.style.left = "-9999px";
  document.body.appendChild(box);
  const opened = [];
  try {
    resetQaScreenForTest();
    initQaScreen({ container: box }, { onOpenTarget: (target) => opened.push(target) });
    openQaScreen();
    assertEqual(box.querySelector(".qa-disclaimer")?.textContent, QA_DISCLAIMER, "画面：生成AIではないと書く");
    assertEqual(QA_DISCLAIMER.includes("生成AIではありません") && QA_DISCLAIMER.includes("外に送らず"), true, "画面：説明の文");
    assertEqual(box.querySelectorAll(".qa-suggest-tab").length, QA_SUGGESTION_CATEGORIES.length, "画面：おすすめのカテゴリのタブ");
    assertEqual(box.querySelectorAll(".qa-suggest").length, QA_SUGGESTION_CATEGORIES[0].questions.length, "画面：おすすめの質問");
    box.querySelector('.qa-suggest-tab[data-category="cd"]').click();
    assertEqual(getQaScreenState().category, "cd", "画面：カテゴリを切り替える");
    box.querySelector(".qa-suggest").click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assertEqual(getQaScreenState().question, QA_SUGGESTION_CATEGORIES.find((category) => category.id === "cd").questions[0], "画面：例を押すと、その質問で答える");
    assertEqual(box.querySelector(".qa-card")?.classList.contains("is-answer"), true, "画面：答えのカード");
    assertEqual(Boolean(box.querySelector(".qa-evidence summary")), true, "画面：根拠を開ける");
    box.querySelector(".qa-link")?.click();
    assertEqual(opened.at(-1)?.kind, "cdBonus", "画面：答えのボタンで、そのページ（CD・特典映像図鑑）を開く");
    await askQaForTest("さいとうの誕生日は？");
    const candidates = [...box.querySelectorAll(".qa-candidate")];
    assertEqual(candidates.length, 2, "画面：あいまいなときは候補");
    candidates[0].click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assertEqual([getQaScreenState().question.includes("齋藤樹愛羅"), getQaScreenState().status], [true, "answer"], "画面：候補を押すと、その名前で聞き直して答える");
    await askQaForTest("次のセンターは誰？");
    assertEqual(box.querySelector(".qa-badge")?.textContent, "答えられません", "画面：推測の質問には「答えられません」");
    await askQaForTest("<b>太字</b>");
    assertEqual(box.querySelectorAll(".qa-card b").length, 0, "画面：質問の文字を HTML として出さない");
    // 開き直しても、最後の質問と答えを保つ
    openQaScreen();
    assertEqual(box.querySelector(".qa-card-question")?.textContent, "Q. <b>太字</b>", "画面：戻ったとき、最後の質問と答えのまま");
  } finally {
    resetQaScreenForTest();
    box.remove();
  }
}

async function runMarkupTests() {
  const [html, sw, main, screens, engine, screen, text, bridge] = await Promise.all(
    ["index.html", "sw.js", "js/main.js", "js/screens.js", "js/qaEngine.js", "js/qaScreen.js", "js/qaText.js", "js/qaNewsBridge.js"].map(fetchText)
  );
  const doc = new DOMParser().parseFromString(html, "text/html");
  assertEqual(doc.querySelector("#qa-home-link .home-qa-entry-label")?.textContent, "質問AIに聞く", "入口：ホームに［質問AIに聞く］");
  assertEqual(Boolean(doc.querySelector("#app-search-link")), true, "入口：全体検索は残す");
  assertEqual(doc.querySelector("#qa-home-link .home-qa-entry-sub")?.textContent, "アプリ内の情報から答えます", "入口：生成AIと誤認させない一言");
  assertEqual(Boolean(doc.querySelector("#qa-screen #qa-back-button.back-link")) && Boolean(doc.querySelector("#qa-content")), true, "画面：戻るボタンと入れ物（浮く戻るは .back-link）");
  assertEqual(doc.querySelector("#qa-screen h2")?.textContent, "質問AI", "画面：題名");
  assertEqual(Boolean(doc.querySelector('link[href="css/qa.css"]')), true, "画面：CSS");
  assertEqual(screens.includes('qa: document.getElementById("qa-screen")'), true, "画面の一覧");
  assertEqual(main.includes("【R11-qa】") && main.includes('navigateWithScrollMemory("qa")') && main.includes("openSearchTarget(target)"), true, "行き先：ホーム → 質問AI → 答えのボタンは全体検索と同じ開き方");
  assertEqual(["./css/qa.css", "./js/qaScreen.js", "./js/qaEngine.js", "./js/qaText.js", "./js/qaNewsBridge.js", "./js/data/qaPhrases.js", "./js/data/qaSuggestions.js"].every((file) => sw.includes(`"${file}"`)), true, "オフライン：新しいファイルを APP_SHELL に");
  const all = [engine, screen, text, bridge].join("\n");
  assertEqual(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(all), false, "外に送らない：質問AIのファイルに通信の処理が無い");
  assertEqual(/localStorage|sessionStorage|indexedDB/.test(all), false, "保存しない：質問の履歴を持たない");
  assertEqual(/\(\?<[=!]/.test(all), false, "古い iPhone：後ろを見る正規表現を使わない");
  assertEqual(/innerHTML/.test(screen), false, "安全：答えは textContent だけで作る");
  assertEqual(isFloatingBackScreen("qa"), true, "浮く戻る：質問AIでも出る");
}

export async function runQaEngineTests() {
  console.log("--- 質問AI（R11-qa 2026-11-03） ---");
  await prepareQaSearch();
  runTextTests();
  runParseTests();
  runAnswerShapeTests();
  runMemberIntroductionTests();
  runSuggestionTests();
  await runScreenTests();
  await runMarkupTests();
}
