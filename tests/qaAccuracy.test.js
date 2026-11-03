// 【R11-qa 2026-11-03新設】「質問AI」の正確性のテスト（独立した質問 105問）。
//
// 【期待結果の作り方】質問AIのロジック（js/qaEngine.js）を使わず、データ（js/data/songs.js・members.js・liveHistory.js・
// cdBonus.js など）を人が読んで、答えに含まれるべき言葉を書いた。数（「15曲」など）も一覧を数えて書いた。
//   expect：答えの状態（answer＝答える／candidates＝候補を出す／notFound＝「確認できません」／refuse＝答えない）
//   has：答え（短い答え＋詳しい行）に必ず入る言葉／not：入ってはいけない言葉（取り違え・作り話の検出）
// 【測るもの】正答率（状態も中身も合う）・誤回答率（答えたが間違い／答えてはいけないのに答えた）・回答不能の率（答えるべきなのに答えられない）・回答時間
// YouTube と最新情報は、テスト用の仮のデータ（実在の動画のタイトルは書かない）で確かめる。
import { answerQuestion, prepareQaSearch } from "../js/qaEngine.js";
import { setQaNewsProvider } from "../js/qaNewsBridge.js";
import { setYoutubeAppearanceSnapshotForTest } from "../js/youtubeAppearanceData.js";
import { assertEqual } from "./test-utils.js";

export const QA_ACCURACY_TODAY = "2026-11-03";

// テスト用の仮の YouTube のデータ（タイトルは架空。実際の動画の情報は入れない）
const FAKE_YOUTUBE = {
  state: "ready",
  data: { fetchedAt: "2026-11-01T00:00:00Z" },
  error: null,
  videos: [
    { id: "testvideo01", title: "（テスト用の仮の動画）企画A", publishedAt: "2020-06-01", kind: "video", status: "cast-list", memberIds: ["noguchi-iori", "yamamoto-anna"], footageMemberIds: [] },
    { id: "testvideo02", title: "（テスト用の仮の動画）企画B", publishedAt: "2023-03-01", kind: "video", status: "title-name", memberIds: ["noguchi-iori"], footageMemberIds: [] },
    { id: "testvideo03", title: "（テスト用の仮の動画）企画C", publishedAt: "2025-08-01", kind: "short", status: "manual", memberIds: ["sasaki-maika"], footageMemberIds: [] },
    { id: "testvideo04", title: "（テスト用の仮の動画）未確認", publishedAt: "2025-09-01", kind: "video", status: "unconfirmed", memberIds: [], footageMemberIds: [] },
  ],
};
// テスト用の仮の最新情報（r11-news の形を想定）
const FAKE_NEWS = {
  state: "ready",
  fetchedAt: "2026-11-03T00:00:00Z",
  items: [
    { id: "n-1", title: "（テスト用）22ndシングル発売決定のお知らせ", publishedOn: "2026-11-02", category: "release", memberIds: [], url: "https://equal-love.jp/news/detail/test-1", source: "official-news", fetchedAt: "2026-11-03T00:00:00Z" },
    { id: "n-2", title: "（テスト用）佐々木舞香 雑誌出演のお知らせ", publishedOn: "2026-10-30", category: "media", memberIds: ["sasaki-maika"], url: "https://equal-love.jp/news/detail/test-2", source: "official-news", fetchedAt: "2026-11-03T00:00:00Z" },
  ],
};

// [種類, 質問, 状態, 入るべき言葉, 入ってはいけない言葉]
export const QA_ACCURACY_CASES = [
  // ---- 簡単 ----
  ["簡単", "呪って呪っては何枚目のシングル？", "answer", ["16枚目"], []],
  ["簡単", "ナツマトペは何枚目？", "answer", ["14枚目"], []],
  ["簡単", "16枚目のシングルは？", "answer", ["呪って呪って"], []],
  ["簡単", "1枚目のシングルは何？", "answer", ["＝LOVE", "2017年9月6日"], []],
  ["簡単", "呪って呪ってのセンターは？", "answer", ["野口衣織"], []],
  ["簡単", "CAMEOのセンターは誰？", "answer", ["大谷映美里", "齊藤なぎさ"], []],
  ["簡単", "劇薬中毒の発売日は？", "answer", ["2026年4月1日"], []],
  ["簡単", "髙松瞳のメンバーカラーは？", "answer", ["赤"], []],
  ["簡単", "山本杏奈の誕生日は？", "answer", ["1997年11月30日"], []],
  ["簡単", "諸橋沙夏の出身は？", "answer", ["福島県"], []],
  ["簡単", "＝LOVEのリーダーは誰？", "answer", ["山本杏奈"], []],
  ["簡単", "今のメンバーは何人？", "answer", ["10人"], ["佐竹のん乃"]],
  ["簡単", "2024年に行われたライブは？", "answer", ["2件", "Tell me what's more than", "7th ANNIVERSARY"], ["CDTV"]],
  ["簡単", "大場花菜はどんな人？", "answer", ["大場花菜", "オレンジ"], []],
  ["簡単", "人狼の特典映像はどのCD？", "answer", ["ウィークエンドシトロン", "Type-B", "Type-C"], []],
  // ---- 言い換え・語順 ----
  ["言い換え", "何番目のシングルなの？呪って呪って", "answer", ["16枚目"], []],
  ["言い換え", "呪って呪ってって何thシングル？", "answer", ["16枚目"], []],
  ["言い換え", "十六枚目のシングルは？", "answer", ["呪って呪って"], []],
  ["言い換え", "16thシングルを教えて", "answer", ["呪って呪って"], []],
  ["言い換え", "第16弾シングルは？", "answer", ["呪って呪って"], []],
  ["言い換え", "センターが野口衣織の曲は？", "answer", ["15曲", "呪って呪って", "Be Selfish"], []],
  ["言い換え", "イコラブに佐々木舞香が入ったきっかけは？", "answer", ["声優"], []],
  ["言い換え", "高松瞳の誕生日", "answer", ["2001年1月19日"], []],
  ["言い換え", "いおりのメンバーカラー", "answer", ["野口衣織", "紫"], []],
  ["言い換え", "みりにゃのCMは？", "answer", ["大谷映美里"], []],
  ["言い換え", "斎藤樹愛羅のセンター曲", "answer", ["齋藤樹愛羅", "ラストノートしか知らない"], []],
  ["言い換え", "のろってのろっては何枚目", "answer", ["16枚目"], []],
  ["言い換え", "ノロッテノロッテのセンター", "answer", ["野口衣織"], []],
  ["言い換え", "人狼ゲームの映像が入ってるのはどれ？", "answer", ["ウィークエンドシトロン"], []],
  ["言い換え", "人狼のDVDは？", "answer", ["ウィークエンドシトロン"], []],
  // ---- 誤字 ----
  ["誤字", "呪って呪わっては何枚目？", "candidates", ["呪って呪って"], []],
  ["誤字", "ウィークエンドシトロソの発売日", "candidates", ["ウィークエンドシトロン"], []],
  ["誤字", "ラストノートしか知らなぃのセンター", "candidates", ["ラストノートしか知らない"], []],
  ["誤字", "野口依織のセンター曲は？", "answer", ["野口衣織", "15曲"], []],
  // ---- 複数条件 ----
  ["複数条件", "2024年のCDでライブ映像が入ったものは？", "answer", ["呪って呪って", "絶対アイドル辞めないで", "Type-D"], ["劇薬中毒"]],
  ["複数条件", "呪って呪ってのType-Dには何が入ってる？", "answer", ["Blu-ray", "VVCL-2456"], []],
  ["複数条件", "劇薬中毒 タイプB の中身", "answer", ["富士急ハイランド"], []],
  ["複数条件", "2023年のCDで旅行の特典映像は？", "answer", ["北海道", "ナツマトペ"], ["呪って呪って"]],
  ["複数条件", "野口衣織の2024年のテレビ出演は？", "answer", ["2024年", "野口衣織"], []],
  ["複数条件", "ウィークエンドシトロンのType-Dの映像", "answer", ["映像特典なし"], []],
  // ---- 経歴 ----
  ["経歴", "佐々木舞香はなぜイコラブに入ったの？", "answer", ["声優アイドル"], []],
  ["経歴", "大谷映美里の加入前は何をしていた？", "answer", ["アキシブproject"], []],
  ["経歴", "山本杏奈はどうしてオーディションを受けたの？", "answer", ["山本杏奈"], []],
  ["経歴", "瀧脇笙古はいつ加入した？", "answer", ["2017年4月29日"], []],
  ["経歴", "野口衣織の舞台は？", "answer", ["けものフレンズ"], []],
  // ---- 過去 ----
  ["過去", "2019年のライブは？", "answer", ["デビュー2周年記念コンサート"], []],
  ["過去", "2017年のライブは？", "answer", ["TOKYO IDOL FESTIVAL 2017"], []],
  ["過去", "1stアルバムの収録曲は？", "answer", ["16曲", "桜の咲く音がした", "Overture"], []],
  ["過去", "全部、内緒。の発売日は？", "answer", ["2021年5月12日"], []],
  ["過去", "卒業したメンバーは？", "answer", ["佐竹のん乃", "齊藤なぎさ"], ["山本杏奈"]],
  ["過去", "野口衣織の昔のYouTube動画は？", "answer", ["2本", "2020-06-01"], ["企画C"]],
  // ---- 最新 ----
  ["最新", "最近の企業コラボは？", "answer", ["日本マクドナルド"], []],
  ["最新", "今のメンバーのレギュラー番組は？", "answer", ["プロ野球ニュース", "アイ＝ラブ！げーみんぐ"], ["超無敵クラス"]],
  ["最新", "最近の公式の発表は？", "answer", ["22ndシングル発売決定"], []],
  ["最新", "佐々木舞香の最新情報は？", "answer", ["雑誌出演"], ["22nd"]],
  ["最新", "21枚目のシングルは？", "answer", ["恋、はじめました。"], []],
  ["最新", "佐々木舞香が出ているYouTubeの動画は？", "answer", ["1本"], []],
  // ---- 未発表（アプリに登録の無い番号）----
  ["未発表", "22枚目のシングルについて何か発表された？", "answer", ["22ndシングル発売決定", "まだ登録されていません"], []],
  ["未発表", "23枚目のシングルは？", "notFound", ["確認できません", "21stシングル"], []],
  ["未発表", "3枚目のアルバムは？", "notFound", ["確認できません"], []],
  // ---- 登録なし ----
  ["登録なし", "呪って呪っての作詞は誰？", "notFound", ["確認できません"], []],
  ["登録なし", "ナツマトペの作曲者は？", "notFound", ["確認できません"], []],
  ["登録なし", "富士山の特典映像は？", "notFound", ["確認できません"], ["富士急"]],
  ["登録なし", "温泉の特典映像は？", "notFound", ["確認できません"], []],
  ["登録なし", "2016年のライブは？", "notFound", ["確認できません"], []],
  ["登録なし", "佐竹のん乃の血液型は？", "notFound", ["確認できません"], []],
  // ---- 曖昧（候補を出す）----
  ["曖昧", "さいとうの誕生日は？", "candidates", ["齋藤樹愛羅", "齊藤なぎさ"], []],
  ["曖昧", "斎藤のセンター曲は？", "candidates", ["齋藤樹愛羅", "齊藤なぎさ"], []],
  ["曖昧", "ぽよよん", "unknown", [], []],
  // ---- 回帰：調整に使っていない20問（2026-11-03 に一度だけ流し、直す前は 19問中 正答14・誤回答2・回答不能3。直したあとに足した）----
  ["回帰", "恋、はじめました。のセンターは誰ですか", "answer", ["全員"], []],
  ["回帰", "ズルいよズルいねって何枚目", "answer", ["6枚目"], []],
  ["回帰", "瀧脇笙古の身長", "answer", ["158"], []],
  ["回帰", "音嶋莉沙ってどんなメンバー？", "answer", ["音嶋莉沙", "水色"], []],
  ["回帰", "大場花菜のラジオ番組は？", "answer", ["はなまる", "イマフレランチ"], ["単発の出演"]],
  ["回帰", "佐々木舞香の声優の仕事は？", "answer", ["イナズマイレブン"], []],
  ["回帰", "Be Selfishの収録曲", "answer", ["4曲", "真夜中マーメイド"], []],
  ["回帰", "20枚目のシングルの発売日", "answer", ["2026年4月1日"], []],
  ["回帰", "2026年のライブは？", "answer", ["横浜スタジアム", "9th ANNIVERSARY"], []],
  ["回帰", "沖縄の特典映像はどれに入ってる？", "answer", ["Be Selfish", "沖縄"], []],
  ["回帰", "メイキング映像が入っているCDは？", "answer", ["メイキング"], []],
  ["回帰", "とくべチュ、してのType-Eの中身", "answer", ["ノンクレジットオープニング"], []],
  ["回帰", "諸橋沙夏のソロコンサートの映像はどのCD？", "answer", ["ラストノートしか知らない", "Type-D"], []],
  ["回帰", "CAMEOを音楽番組で歌ったことある？", "answer", ["CAMEO", "音楽番組"], []],
  ["回帰", "アイ＝ラブ！げーみんぐに出ているのは誰？", "answer", ["大谷映美里", "諸橋沙夏"], []],
  ["回帰", "髙松瞳はいつイコラブに入った？", "answer", ["2017年4月29日"], ["きっかけ"]],
  ["回帰", "今の＝LOVEのメンバーを教えて", "answer", ["10人", "山本杏奈"], ["佐竹のん乃"]],
  ["回帰", "齋藤樹愛羅の個人活動", "answer", ["とちぎ未来大使"], []],
  ["回帰", "ライブ映像の特典映像", "answer", ["ソロコンサート"], []],
  ["回帰", "野口衣織と山本杏奈が出ている動画", "answer", ["1本"], []],
  // ---- 「どんな人？」（R12 2026-11-03：個人ページの紹介文・加入前の活動・役割・今の主な活動から。期待はデータを読んで書いた）----
  ["人物", "山本杏奈はどんな人？", "answer", ["リーダー", "1列になって進む", "SPL∞ASH", "プロ野球ニュース"], []],
  ["人物", "大谷映美里はどんな人？", "answer", ["人と比べない", "アキシブproject", "Ririmew"], []],
  ["人物", "大場花菜ってどんな人", "answer", ["宝塚歌劇", "ドラフト会議", "さいたま観光大使"], ["いじめ"]],
  ["人物", "音嶋莉沙はどんな人？", "answer", ["『姫』の愛称", "iDOL Street", "S Cawaii!"], []],
  ["人物", "齋藤樹愛羅はどんな人？", "answer", ["最年少", "ダンスメンバー", "amorecarina"], []],
  ["人物", "佐々木舞香はどんな人？", "answer", ["センター", "穂の国娘。", "イコラブのあんまい"], []],
  ["人物", "髙松瞳はどんな人？", "answer", ["デビュー曲「＝LOVE」", "乃木坂46", "めざましテレビ"], []],
  ["人物", "瀧脇笙古はどんな人？", "answer", ["体力のあるメンバー", "サブ4", "プロ野球ニュース"], []],
  ["人物", "野口衣織はどんな人？", "answer", ["声優", "Be Selfish", "マヂラブ・野口衣織のマヂでラブになるTV"], []],
  ["人物", "諸橋沙夏はどんな人？", "answer", ["最年長", "笑顔にする役", "ヤマハミュージックパブリッシング"], []],
  ["人物", "佐竹のん乃はどんな人？", "answer", ["元メンバー", "2021年3月6日卒業", "GALDOLL"], []],
  ["人物", "齊藤なぎさはどんな人？", "answer", ["元メンバー", "2023年1月13日卒業", "女優業"], []],
  // ---- 答えてはいけない推測・主観 ----
  ["推測", "次のセンターは誰？", "refuse", [], ["野口衣織", "佐々木舞香"]],
  ["推測", "一番かわいいメンバーは？", "refuse", [], []],
  ["推測", "＝LOVEは解散するの？", "refuse", [], []],
  ["推測", "野口衣織に彼氏はいる？", "refuse", [], []],
];

function answerText(answer) {
  return [answer.text, ...answer.details, ...answer.candidates.map((candidate) => candidate.label)].join("\n");
}

export function measureQaAccuracy(cases = QA_ACCURACY_CASES) {
  const rows = cases.map(([kind, question, expect, has, not]) => {
    const answer = answerQuestion(question, { today: QA_ACCURACY_TODAY });
    const text = answerText(answer);
    const contentOk = has.every((word) => text.includes(word)) && not.every((word) => !text.includes(word));
    const correct = answer.status === expect && contentOk;
    const wrong = !correct && answer.status === "answer";
    const unanswered = expect === "answer" && answer.status !== "answer";
    return { kind, question, expect, actual: answer.status, correct, wrong, unanswered, tookMs: answer.tookMs, text };
  });
  const count = rows.length;
  const rate = (value) => Math.round((value / count) * 1000) / 10;
  return {
    rows,
    count,
    correctRate: rate(rows.filter((row) => row.correct).length),
    wrongRate: rate(rows.filter((row) => row.wrong).length),
    unansweredRate: rate(rows.filter((row) => row.unanswered).length),
    maxMs: Math.max(...rows.map((row) => row.tookMs)),
    averageMs: Math.round((rows.reduce((sum, row) => sum + row.tookMs, 0) / count) * 10) / 10,
  };
}

export async function runQaAccuracyTests() {
  console.log("--- 質問AI：正確性のテスト（独立の質問） ---");
  await prepareQaSearch();
  setYoutubeAppearanceSnapshotForTest(FAKE_YOUTUBE);
  setQaNewsProvider(() => FAKE_NEWS);
  try {
    const report = measureQaAccuracy();
    report.rows.forEach((row) => {
      assertEqual(row.correct, true, `正確性［${row.kind}］「${row.question}」：期待 ${row.expect}／実際 ${row.actual}${row.correct ? "" : `／答え：${row.text.slice(0, 120)}`}`);
    });
    assertEqual(report.count >= 50 && report.count <= 110, true, `正確性：独立の質問は ${report.count}問（50〜110問）`);
    assertEqual(report.wrongRate, 0, `正確性：誤回答率 ${report.wrongRate}%（間違った答え・答えてはいけないのに答えたもの）`);
    assertEqual(report.maxMs < 100, true, `正確性：いちばん遅い答えも 100ms 未満（${report.maxMs}ms・平均 ${report.averageMs}ms）`);
    console.log(`質問AI 正確性：${report.count}問・正答率 ${report.correctRate}%・誤回答率 ${report.wrongRate}%・回答不能の率 ${report.unansweredRate}%・平均 ${report.averageMs}ms・最大 ${report.maxMs}ms`);
    // 最新情報・YouTube のデータが無いときは、正直に「読み込めていない」と答える（作り話をしない）
    setQaNewsProvider(null);
    setYoutubeAppearanceSnapshotForTest(null);
    const news = answerQuestion("最近の公式の発表は？", { today: QA_ACCURACY_TODAY });
    assertEqual([news.status, news.text.includes("読み込めていない")], ["notFound", true], "正確性：最新情報が無いときは「読み込めていない」と答える");
    const next = answerQuestion("22枚目のシングルについて何か発表された？", { today: QA_ACCURACY_TODAY });
    assertEqual([next.status, next.details.join("").includes("読み込めていない")], ["notFound", true], "正確性：最新情報が無いとき、22枚目は「確認できません」＋読み込めていないと書く");
    const youtube = answerQuestion("野口衣織が出ているYouTubeの動画は？", { today: QA_ACCURACY_TODAY });
    assertEqual(youtube.status, "notFound", "正確性：YouTube のデータが無いときは答えない");
  } finally {
    setQaNewsProvider(null);
    setYoutubeAppearanceSnapshotForTest(null);
  }
}
