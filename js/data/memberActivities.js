// メンバー個人の活動・レギュラー企画（YouTube・ラジオ・SHOWROOM企画・出演番組等）を保持する
// データファイル。members.js・memberProfiles.jsとは分離している（活動情報は始まったり
// 終わったりと更新頻度が高いため、性質の異なる情報として別ファイルで管理する。2026-08-02）。
//
// ＝LOVE全体（メンバー全員・グループ冠番組）としての活動は、ここではなく
// js/data/groupActivities.jsに登録する（「＝LOVEのイコラフ」等、2026-08-03に分離）。
// このファイルにはメンバー1〜数名の個人的な活動だけを登録する。
//
// 共同活動（2名程度によるもの）は、片方のmemberIdを主とし、もう片方をrelatedMemberIdsに
// 入れる形で1件だけ登録する（二重登録しない。js/memberUtils.jsのgetMemberActivities()が
// memberId/relatedMemberIdsのどちらかに一致する活動をまとめて返す）。
//
// status（ACTIVITY_STATUS）で活動の現況を表す。「継続中」表示の根拠はlastVerifiedDateとする。
// 登録者数など頻繁に変わる数字はここに含めない（更新管理が大変なため、方針により非掲載）。
//
// 【2026-08-03時点の注意】代表的な活動が確認できたメンバー分を入力している
// （確認できなかった、または一度きりの出演等で「代表的」と言えないメンバーは未掲載のまま）。
// 詳細な調査経緯はdocs/member-research-notes.md参照。
//
// 【2026-10-04改訂・本人指示】表示順は全メンバー共通で「継続中を必ず上 → 継続中は開始日の新しい順 →
// 終了をその下 → 終了は終了日の新しい順」（membersScreen.jsのsortActivitiesByDateDesc）。
// 年次開催・不定期は終了ではないので継続中の下・終了の上に置く。日付が無い活動は各グループの末尾。
// 新しい活動を足すときは startDate と status を入れるだけで自動的に正しい位置へ並ぶ。
// 任意項目priority（数値、省略可）は、同じ日付の活動どうしの並びを固定したいときだけ使う
// （例: 大谷映美里のブランド関連カード）。日付が違えば日付の新しい方が必ず上に来る。
//
// 【2026-08-03追加】任意項目links（配列、省略可）：[{ label, url, sourceType }]。
// 1つの活動に複数のリンク（例: 連載ページと単行本の購入ページ）を持たせたい場合に使う。
// linksが無ければ、従来通りurlから「公式ページ」ボタンを1つだけ自動生成する
// （membersScreen.jsのbuildActivityCard()参照）。

export const ACTIVITY_TYPE = {
  YOUTUBE: "youtube",
  RADIO: "radio",
  SHOWROOM: "showroom",
  TV: "tv",
  MODEL: "model",
  STAGE: "stage",
  VOICE: "voice",
  SPORTS: "sports",
  // 観光大使・アンバサダー・公的なPR大使など（2026-10-02追加。大場花菜のさいたま観光大使が最初の例）
  AMBASSADOR: "ambassador",
  OTHER: "other",
};

// 活動の現況。「継続中/終了」の2値だけでは表現しきれない現況（年次開催・不定期・過去の
// 一度きりの活動）を区別するために導入（2026-08-03、本人要望）。
export const ACTIVITY_STATUS = {
  ONGOING: "ongoing", // 現在も定期的に継続中
  ANNUAL: "annual", // 年に1回程度、定例で開催されるもの
  IRREGULAR: "irregular", // 継続してはいるが、開催頻度が不定期なもの
  ENDED: "ended", // かつて継続していたが、既に終了したもの
  PAST: "past", // 一度きりの出演など、そもそも「継続」を前提としない過去の活動
  UNKNOWN: "unknown", // 現況が確認できないもの
  // 【2026-10-23追加】公式に開始日が発表済みで、まだ始まっていないもの（例：放送開始前のレギュラー番組）。
  // startDate を過ぎると表示上は自動で「継続中」として扱う（membersScreen.js の getEffectiveActivityStatus）。
  // 開始が延期・中止になった場合は、データ側の status を直す。
  UPCOMING: "upcoming",
};

export const MEMBER_ACTIVITIES = [
  {
    id: "otani-emiri-youtube",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    title: "みりにゃと申します。",
    type: ACTIVITY_TYPE.YOUTUBE,
    description: "大谷映美里の個人YouTubeチャンネル。",
    url: "https://www.youtube.com/channel/UCGxaJ2y2Le9jST3Me2aMPrw",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2021-11-23",
    endDate: null,
    sourceType: "reliable",
    sourceUrls: [
      "https://x.com/otani_emiri/status/1946100842551259604",
      "https://ja.wikipedia.org/wiki/大谷映美里",
    ],
    lastVerifiedDate: "2026-08-23",
  },
  {
    id: "sasaki-yamamoto-youtube",
    memberId: "sasaki-maika",
    relatedMemberIds: ["yamamoto-anna"],
    title: "イコラブのあんまい",
    type: ACTIVITY_TYPE.YOUTUBE,
    description: "佐々木舞香・山本杏奈の2人によるYouTubeチャンネル。",
    url: "https://www.youtube.com/@ikorabunohutari",
    status: ACTIVITY_STATUS.ONGOING,
    // 開設が2023年4月であることは複数の情報源で一致しているが、正確な日までは確認できて
    // いないため、月初日を並べ替え用の目安として仮置きしている（表示には使われない）。
    startDate: "2023-04-01",
    endDate: null,
    sourceType: "reliable",
    sourceUrls: [
      "https://www.talenttuber.com/detail/ikorabunohutari.html",
      "https://ameblo.jp/nacc67/entry-12800002029.html",
    ],
    lastVerifiedDate: "2026-08-23",
  },
  {
    id: "sasaki-trailblazers",
    memberId: "sasaki-maika",
    relatedMemberIds: [],
    title: "Trailblazers～次なる日本の革新者たち～ ナビゲーター",
    type: ACTIVITY_TYPE.TV,
    description:
      "BSフジ・NHK WORLD-JAPAN/jibtvのドキュメンタリー番組ナビゲーターを務めた。2025年4月25日放送分から担当し、2026年6月7日放送分をもって卒業。後任ナビゲーターは≠MEの蟹沢萌子（2026年7月5日放送分から）。",
    url: "https://www.bsfuji.tv/trailblazers/",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2025-04-25",
    endDate: "2026-06-07",
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/9827",
      "https://x.com/Trailblazers_bf/status/2062096956315316599",
      "https://mezamashi.media/articles/-/315172",
    ],
    lastVerifiedDate: "2026-08-23",
  },
  {
    id: "yamamoto-showroom",
    memberId: "yamamoto-anna",
    relatedMemberIds: [],
    title: "教えて、花便り",
    type: ACTIVITY_TYPE.SHOWROOM,
    description: "山本杏奈がパーソナリティを務めるSHOWROOM企画。木曜19時に実施されることが多く、＝LOVE・≠ME・≒JOYのメンバー等をゲストに迎えている。",
    url: "https://equal-love.jp/schedule/detail/6558",
    status: ACTIVITY_STATUS.IRREGULAR,
    startDate: "2023-04-13",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/schedule/detail/6558", "https://x.com/Equal_LOVE_12"],
    lastVerifiedDate: "2026-08-23",
  },
  {
    // 【2026-10-02追加】さいたま市公式発表（2026-10-01付）で確認。委嘱式は2026年10月1日、任期は2028年3月31日まで。
    // 今後ほかのメンバーに観光大使・アンバサダーなどの継続的な活動が決まったときも、
    // この形（type: AMBASSADOR）で1件足すだけでよい。
    id: "oba-saitama-tourism-ambassador",
    memberId: "oba-hana",
    relatedMemberIds: [],
    title: "さいたま観光大使",
    type: ACTIVITY_TYPE.AMBASSADOR,
    description:
      "2026年10月1日、さいたま市の魅力を広く発信する「さいたま観光大使」に就任。埼玉県出身で、今後は日々の活動やメディアなどを通じて、さいたま市の特色や魅力をPRしていく。任期は2028年3月31日まで。",
    url: "https://www.city.saitama.lg.jp/006/014/008/003/015/007/p133595.html",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-10-01",
    endDate: "2028-03-31",
    sourceType: "official",
    sourceUrls: [
      "https://www.city.saitama.lg.jp/006/014/008/003/015/007/p133595.html",
      "https://www.city.saitama.lg.jp/004/001/001/p071091.html",
    ],
    lastVerifiedDate: "2026-10-02",
  },
  {
    id: "oba-manga",
    memberId: "oba-hana",
    relatedMemberIds: [],
    title: "はなコミ！～となりにアイドル～",
    type: ACTIVITY_TYPE.OTHER,
    description: "得意のイラストを生かし、ウォーカープラスで連載していた漫画。2026年8月7日にKADOKAWAより単行本が発売された。",
    url: null,
    links: [
      { label: "単行本情報を見る", url: "https://www.kadokawa.co.jp/product/322310001490/", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.ENDED,
    startDate: null,
    endDate: "2026-03-30",
    sourceType: "reliable",
    sourceUrls: [
      "https://www.walkerplus.com/trend/matome/article/1337005/",
      "https://www.kadokawa.co.jp/product/322310001490/",
    ],
    lastVerifiedDate: "2026-08-03",
  },
  {
    // 2026-09-30追加：＝LOVE公式ニュース（equal-love.jp/news/detail/12166）と、本人のビジュアルが
    // 掲載されているREDYAZELの特設ページ本体を確認して登録。urlは特設ページへ直接飛ばす（本人指示）。
    id: "oba-redyazel",
    memberId: "oba-hana",
    relatedMemberIds: [],
    title: "REDYAZEL「Azely ＆ Redyna collection」ビジュアルモデル",
    type: ACTIVITY_TYPE.MODEL,
    description:
      "ファッションブランド「REDYAZEL」の「Azely（アゼリー）＆Redyna（レディーナ）collection」でビジュアルモデルを務めることが2026年9月30日に発表され、同日ブランドの特設ページが公開された。",
    url: "https://www.burnedestrose.com/shop/e/e260930Ra/",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-09-30",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/12166",
      "https://www.burnedestrose.com/shop/e/e260930Ra/",
      "https://www.x.com/RedyAzel",
    ],
    lastVerifiedDate: "2026-09-30",
  },
  {
    // 【2026-10-23追加】FM NACK5公式（番組ページ・2026-10-21告知）・＝LOVE公式NEWS 12291・PR TIMESで確認。
    // 初回 2026年11月1日（日）25:00〜25:30（月曜 午前1:00〜1:30）、録音番組（PR TIMES）。
    // status は UPCOMING。初回放送日を迎えると表示上は自動で「継続中」になる。
    // 【2026-10-28更新】番組公式X（@hanamaru795）は、＝LOVE公式NEWS 12291の本文に「番組X：@hanamaru795」と
    // 明記されていることを確認したため、sourceType を "official" に格上げした（以前は本人提供のリンク扱い）。
    id: "oba-nack5-hanamaru",
    memberId: "oba-hana",
    relatedMemberIds: [],
    title: "＝LOVE 大場花菜の「はなまる！」",
    type: ACTIVITY_TYPE.RADIO,
    description:
      "FM NACK5の冠ラジオ番組。2026年11月1日（日）放送開始、毎週日曜25:00〜25:30（録音番組）。日々の出来事を募集し、大場花菜がリスナーに「はなまる」を届ける。",
    url: null,
    links: [
      { label: "番組公式ページ", url: "https://www.nack5.co.jp/program/love_oba_hanamaru/", sourceType: "official" },
      { label: "番組公式X", url: "https://x.com/hanamaru795", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.UPCOMING,
    startDate: "2026-11-01",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://www.nack5.co.jp/program/love_oba_hanamaru/",
      "https://www.nack5.co.jp/information/589/",
      "https://equal-love.jp/news/detail/12291",
      "https://prtimes.jp/main/html/rd/p/000000097.000123797.html",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    id: "oba-artistspoken",
    memberId: "oba-hana",
    relatedMemberIds: [],
    title: "イマフレランチ",
    type: ACTIVITY_TYPE.RADIO,
    description: "音声配信アプリ「Artistspoken」のレギュラー番組。毎週金曜12:00〜パーソナリティを務める。",
    url: "https://equal-love.jp/schedule/detail/7968",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2024-06-14",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/schedule/detail/7968",
      "https://x.com/hana_oba/status/1800121461677645915",
    ],
    lastVerifiedDate: "2026-08-23",
  },
  {
    id: "otoshima-model",
    memberId: "otoshima-risa",
    relatedMemberIds: [],
    title: "「S Cawaii!」レギュラーモデル",
    type: ACTIVITY_TYPE.MODEL,
    // 【2026-10-27修正】仮置きだった開始日（2023-01-01）を、＝LOVE公式ニュース7216で確認した
    // 「11月号（2023年9月15日発売）から」に直し、出典を追加した。現在も継続中かどうかは今回公式で再確認していない
    // （lastVerifiedDate は継続の確認日なので据え置き）。
    description: "イマジカインフォスのファッション誌『S Cawaii!』のレギュラーモデル。2023年11月号（2023年9月15日発売）から務めている。",
    url: null,
    links: [{ label: "＝LOVE公式情報", url: "https://equal-love.jp/news/detail/7216", sourceType: "official" }],
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2023-09-15",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/7216", "https://prtimes.jp/main/html/rd/p/000001140.000007785.html"],
    lastVerifiedDate: "2026-08-02",
  },
  {
    id: "otoshima-evelyn-model",
    memberId: "otoshima-risa",
    relatedMemberIds: [],
    title: "「evelyn」シーズンモデル",
    type: ACTIVITY_TYPE.MODEL,
    // 【2026-10-23更新】2026 Winter collection（＝LOVE公式 2026-10-17）を反映。シーズンごとに別カードへ
    // 分けず、ブランドの継続起用として1枚にまとめる（過去シーズンの履歴は説明文に残す）。
    // 【2026-10-28更新】＝LOVE公式ニュースで確認できた全シーズン（Spring/Summer・New season を含む）を説明文と出典に揃えた。
    description:
      "ファッションブランド「evelyn」のシーズンコレクションモデルを継続して務めている。2025 Winter collection（2025年8月25日発表）から、2026 Spring collection（2026年1月5日）・2026 Spring/Summer collection（4月5日）・2026 Autumn collection（5月29日）・2026 New season collection（8月13日）と続き、2026 Winter collection（10月17日発表）でも引き続きモデルを務める。",
    url: null,
    links: [
      { label: "ブランド公式サイト", url: "https://evelyn.tokyo.jp/", sourceType: "official" },
      { label: "＝LOVE公式情報", url: "https://equal-love.jp/news/detail/12272", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2025-08-25",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/10282",
      "https://equal-love.jp/news/detail/10833",
      "https://equal-love.jp/news/detail/11043",
      "https://equal-love.jp/news/detail/11353",
      "https://equal-love.jp/news/detail/11487",
      "https://equal-love.jp/news/detail/11817",
      "https://equal-love.jp/news/detail/12272",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    id: "otoshima-youtube",
    memberId: "otoshima-risa",
    relatedMemberIds: [],
    title: "音嶋莉沙の様子がおかしいチャンネル",
    type: ACTIVITY_TYPE.YOUTUBE,
    description:
      "音嶋莉沙の個人YouTubeチャンネル。「様子がおかしい音嶋莉沙」というグループ公式チャンネル発の人気ミームが由来のチャンネル名。2026年8月11日、28歳の誕生日を機に開設した。",
    url: "https://www.youtube.com/@risa_yousugaokashii",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-08-11",
    endDate: null,
    sourceType: "self",
    sourceUrls: ["https://www.youtube.com/@risa_yousugaokashii"],
    lastVerifiedDate: "2026-08-12",
  },
  {
    // 【2026-10-02追加】栃木県公式「とちぎ未来大使」名簿（令和8年3月31日現在・芸能分野）で
    // 「齋藤 樹愛羅／アイドル ＝LOVE／担当名 とちぎ＝LOVE♡／委嘱日 令和6年4月17日」を確認。
    // 県公式「魅せます！とちブラ」の出演者一覧（2026-10-01更新）にも掲載。退任・終了の情報は確認できないため継続中として扱う。
    // 大場花菜のさいたま観光大使と同じ type: AMBASSADOR（観光・PR大使）の仕組みで管理している。
    id: "saito-tochigi-future-ambassador",
    memberId: "saito-kiara",
    relatedMemberIds: [],
    title: "とちぎ未来大使",
    type: ACTIVITY_TYPE.AMBASSADOR,
    description:
      // 【2026-10-28更新】「とちブラ」は＝LOVE公式ニュース8279（2024-03-03）で「番組レポーター」と確認できたため、肩書きと開始時期を足した
      // （別カードにはせず、大使カードの説明文にまとめる）。
      "2024年4月17日、栃木県の魅力や地域資源を県内外へ発信する「とちぎ未来大使」に就任。栃木県出身で、担当名は「とちぎ＝LOVE♡」。それに先立つ2024年3月から、とちぎテレビの県広報番組「魅せます！とちブラ～とちぎブランド・ぶらり～」の番組レポーターも務めている。",
    url: null,
    links: [
      { label: "栃木県公式ページ", url: "https://www.pref.tochigi.lg.jp/c05/pref/kihon/sonota/1285545941380.html", sourceType: "official" },
      { label: "とちブラ（県公式）", url: "https://www.pref.tochigi.lg.jp/c05/pref/kouhou/terebi/newtv.html", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2024-04-17",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://www.pref.tochigi.lg.jp/c05/pref/kihon/sonota/1285545941380.html",
      "https://www.pref.tochigi.lg.jp/c05/pref/kihon/sonota/documents/02_geinou_20260331.pdf",
      "https://www.pref.tochigi.lg.jp/c05/pref/kouhou/terebi/newtv.html",
      "https://x.com/Equal_LOVE_12/status/1780472508275400783",
      "https://equal-love.jp/news/detail/8279",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // 【2026-10-10追加】＝LOVE公式NEWS（2026-10-09掲載）・MeloRia公式サイト・QUEEN EYES販売ページ（2026-10-21 12:00〜）で確認。
    // 終了が発表されたら status を ENDED にして endDate を入れるだけで、共通ソートにより終了グループへ移動する。
    id: "saito-meloria-image-model",
    memberId: "saito-kiara",
    relatedMemberIds: [],
    title: "MeloRia（メロリア）イメージモデル",
    type: ACTIVITY_TYPE.MODEL,
    description:
      "2026年10月9日、新カラーコンタクトブランド「MeloRia（メロリア）」のイメージモデルに就任。「瞳に魔法、心にティアラ」をコンセプトに、“お姫様の瞳”をテーマとした全6色を展開し、2026年10月21日（水）12:00に発売開始。",
    url: null,
    links: [
      { label: "ブランド公式サイト", url: "https://www.meloria.jp/", sourceType: "official" },
      { label: "＝LOVE公式情報", url: "https://equal-love.jp/news/detail/12240", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-10-09",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/12240",
      "https://www.meloria.jp/",
      "https://www.queen-eyes.com/c/meloria",
      "https://prtimes.jp/main/html/rd/p/000000145.000018275.html",
      "https://www.lilyanna.jp/c/brand/meloria",
    ],
    lastVerifiedDate: "2026-10-23",
  },
  {
    id: "saito-sasaki-einstein-tv",
    memberId: "saito-kiara",
    relatedMemberIds: ["sasaki-maika"],
    title: "アイ＝ラブ！げーみんぐ ～〇〇さんがオンラインになりました～",
    type: ACTIVITY_TYPE.TV,
    description: "テレビ朝日のレギュラー番組。お笑いコンビ「アインシュタイン」と共演している。2026年4月改編で30分・月1回放送に拡大し、配信版はTELASAで独占配信。",
    url: "https://www.telasa.jp/series/12928",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2022-10-08",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://x.com/Ilovegaming_ex", "https://www.telasa.jp/series/12928"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "saito-kiara-berippichi-radio",
    memberId: "saito-kiara",
    relatedMemberIds: [],
    title: "＝LOVE 齋藤樹愛羅・≠ME 櫻井ももの ♡べり～ぴ～ち♡さんで～♡",
    type: ACTIVITY_TYPE.RADIO,
    description:
      // 【2026-10-27追記】前身番組の名前を足した（＝LOVE公式スケジュール10349・ORICON NEWSで確認）。
      // 前身番組の休止・終了の理由は本人と関係が無いため書かない。開始日・最終放送日は公式で未確認のため書かない。
      "文化放送のレギュラー番組。≠MEの櫻井ももと2人でパーソナリティを務める（毎週日曜21:00〜21:30）。前身番組「#C-pla presents ＝LOVE齋藤樹愛羅・≠ME櫻井もものしーぷらじお」の終了を受けて2026年4月12日にスタートし、初回放送内で番組タイトルが決定した。",
    url: "https://www.joqr.co.jp/qr/program/km/",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-04-12",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://www.joqr.co.jp/qr/program/km/",
      "https://www.joqr.co.jp/ic/article/172455/",
      "https://equal-love.jp/news/detail/11315",
      "https://equal-love.jp/schedule/detail/10349",
      "https://www.oricon.co.jp/news/2445111/full/",
    ],
    lastVerifiedDate: "2026-08-23",
  },
  // 【2026-10-28】齋藤樹愛羅の「ステーションメモリーズ！」（旧id: saito-kiara-stage、出典はWikipediaのみ）は、
  // js/data/memberStageVoice.js の voice-ekimemo-game-2017（代々木アニメーション学院の公式発表つき）と同じ作品の
  // 二重登録だったため削除し、VOICE側に1か所でまとめた（黄陽レイカ役・2020年のボイスリニューアルはVOICE側に記載）。
  {
    id: "takiwaki-sasuke",
    memberId: "takiwaki-shoko",
    relatedMemberIds: [],
    title: "SASUKE",
    type: ACTIVITY_TYPE.TV,
    description: "2020年・2021年放送分の本戦に出場。2025年はアイドル予選会に初参戦したが、本戦の出場権は逃した。",
    url: null,
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2020-12-29",
    endDate: "2021-12-28",
    sourceType: "reliable",
    sourceUrls: [
      "https://ja.wikipedia.org/wiki/瀧脇笙古",
      "https://natalie.mu/music/news/645710",
      "https://encount.press/archives/841796/",
    ],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "takiwaki-marathon",
    memberId: "takiwaki-shoko",
    relatedMemberIds: [],
    title: "フルマラソン挑戦",
    type: ACTIVITY_TYPE.OTHER,
    description: "東京マラソン2023でフルマラソン自己ベスト3時間57分06秒（サブ4）を記録。駅伝やミニマラソン系イベントへの出演も続けている。",
    url: null,
    status: ACTIVITY_STATUS.IRREGULAR,
    startDate: "2023-03-05",
    endDate: null,
    sourceType: "reliable",
    sourceUrls: [
      "https://www.fmyokohama.jp/r847/2023/12/jog-station-3310.html",
      "https://store.alpen-group.jp/Page/Feature/running_260619_02.aspx",
    ],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "takiwaki-yamamoto-baseball",
    memberId: "takiwaki-shoko",
    relatedMemberIds: ["yamamoto-anna"],
    title: "プロ野球ニュース",
    type: ACTIVITY_TYPE.TV,
    description: "フジテレビONEの番組。木曜MCを瀧脇笙古・山本杏奈が隔週交代で担当している（解説者ではなくMC/司会）。",
    url: "https://equal-love.jp/news/detail/11301",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-04-02",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/11301", "https://natalie.mu/music/news/665296"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "takiwaki-fila",
    memberId: "takiwaki-shoko",
    relatedMemberIds: [],
    title: "FILA 2026秋冬シーズン スタイリングパートナー",
    type: ACTIVITY_TYPE.MODEL,
    description: "スポーツライフスタイルブランド「FILA」の2026秋冬シーズン スタイリングパートナーに就任。マラソン・テニスなどアクティブなライフスタイルが起用理由として挙げられている。「FILA×ELEY KISHIMOTO」のコラボレーションアイテムを含む全6ルックを着こなしている。",
    url: "https://www.fila.jp/contents/feature/fila_eley/",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-08-05",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://www.fila.jp/contents/feature/fila_eley/",
      "https://prtimes.jp/main/html/rd/p/000000100.000022172.html",
      "https://news.yahoo.co.jp/articles/c7706d400f38491a42485ceda692aafe263a2109",
    ],
    lastVerifiedDate: "2026-09-05",
  },
  {
    id: "morohashi-tsunhashigo",
    memberId: "morohashi-sana",
    relatedMemberIds: [],
    title: "つんはしご",
    type: ACTIVITY_TYPE.YOUTUBE,
    description:
      "イコノイジョイチャンネルの大人気企画だった「はしご酒」企画が、諸橋沙夏個人の企画として独立した「つんはしご」。愛称「さなつん」＋「はしご酒」が由来。2026年8月3日、30歳の誕生日を節目に、新しい自分を見つけるために開設した。",
    url: "https://www.youtube.com/watch?v=uerzc04ALGw",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-08-03",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://www.youtube.com/watch?v=uerzc04ALGw"],
    lastVerifiedDate: "2026-08-06",
  },
  {
    id: "morohashi-tv",
    memberId: "morohashi-sana",
    relatedMemberIds: [],
    title: "＝LOVE 諸橋沙夏の『スナック沙夏』",
    type: ACTIVITY_TYPE.TV,
    description: "BS日テレのレギュラーバラエティでママ役としてMCを務めた（毎週日曜24:30〜、全8回）。2024年12月22日放送の最終回をもって番組終了。",
    url: null,
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2024-10-06",
    endDate: "2024-12-22",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/8966", "https://x.com/morohashi_sana/status/1870813638044655919"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "morohashi-tif",
    memberId: "morohashi-sana",
    relatedMemberIds: [],
    title: "TOKYO IDOL FESTIVAL ソロステージ（SMILE GARDEN）",
    type: ACTIVITY_TYPE.STAGE,
    description: "TOKYO IDOL FESTIVALのSMILE GARDENステージに、2025年・2026年と2年連続でソロ出演している。",
    url: null,
    status: ACTIVITY_STATUS.ANNUAL,
    startDate: "2025-08-03",
    endDate: null,
    sourceType: "reliable",
    sourceUrls: ["https://news.yahoo.co.jp/articles/2dafb0983410885431c3e6145f23de1079cdf6cc"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    // 【2026-10-28追加】＝LOVE公式ニュース（2023-08〜2026-03に出演告知38件）・＝LOVE公式スケジュール11739（毎週火曜12:30〜として継続掲載）・
    // 番組側の説明（radikoポッドキャスト「現地取材は…福島県出身の諸橋沙夏さん」）で確認。単発ゲストではなく番組の取材担当。
    // 公式に「レギュラー」「リポーター」の語は無いため、番組説明の言葉どおり「現地取材」とした。
    // startDate は公式で確認できた最も古い放送日（2023-08-18、当時は金曜08:10〜08:17）。
    id: "morohashi-hand-in-hand",
    memberId: "morohashi-sana",
    relatedMemberIds: [],
    title: "復興支援プログラム「Hand in Hand」 現地取材",
    type: ACTIVITY_TYPE.RADIO,
    description:
      "TOKYO FMの復興支援プログラム「Hand in Hand」で、福島県出身として現地取材を担当し、東日本大震災からの復興に取り組む人たちの思いを伝えている。2023年8月から出演が告知されており、現在は毎週火曜12:30〜放送。",
    url: null,
    links: [
      { label: "番組公式ページ", url: "https://www.tfm.co.jp/hand/", sourceType: "official" },
      { label: "＝LOVE公式スケジュール", url: "https://equal-love.jp/schedule/detail/11739", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2023-08-18",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/7069",
      "https://equal-love.jp/schedule/detail/11739",
      "https://www.tfm.co.jp/hand/",
      "https://radiko.jp/podcast/channels/8e71da24-9c0c-43c1-878c-08e6b73a7543",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    id: "noguchi-tv",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "マヂラブ・野口衣織のマヂでラブになるTV",
    type: ACTIVITY_TYPE.TV,
    description: "アニメ専門チャンネル「AT-X」の番組で、マヂカルラブリーと共にMCを務めている（月次配信）。2026年6月10日付で現在の番組名に改題（略称「#マヂラブTV」は変更なし）。",
    url: null,
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2024-03-01",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/8330",
      "https://equal-love.jp/news/detail/11794",
      "https://x.com/madilovetv",
    ],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "otani-rose-muse",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    priority: 1,
    title: "Rosé Muse（ロゼミューズ）",
    type: ACTIVITY_TYPE.OTHER,
    description: "大谷映美里自身がプロデュースするアパレルブランド。2022年11月にECサイトとポップアップストアで始動し、各地で期間限定ポップアップを展開してきた。2026年9月1日、ルミネエスト新宿B1フロアに常設店舗をグランドオープン。",
    url: "https://bunnyapartment.com/rosemuse/",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2022-10-28",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/5974",
      "https://x.com/Equal_LOVE_12/status/2075535794509590708",
      "https://bunnyapartment.com/rosemuse/",
      "https://x.com/rosemuse_",
    ],
    lastVerifiedDate: "2026-09-05",
  },
  {
    id: "otani-appare-saturday-radio",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    title: "アッパレやってまーす！～土曜日です～",
    type: ACTIVITY_TYPE.RADIO,
    // 【2026-10-04更新】2026年10月3日放送分（番組から「大切なお知らせ」あり）をもって卒業。
    // 卒業の理由は公式に確認できていないため、説明文には書かない（秋の番組改編と結び付けて断定しない）。
    // 実際の放送終了は10月4日未明だが、放送日の「2026-10-03」を終了日にしている。
    description:
      "MBSラジオのレギュラー番組。2020年から「アッパレやってまーす！」（木曜版）に出演し、2021年秋から土曜版「～土曜日です～」に出演。2026年10月3日放送をもって卒業した。",
    url: null,
    links: [{ label: "番組公式ページ", url: "https://www.mbs1179.com/yaru/", sourceType: "official" }],
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2021-10-10",
    endDate: "2026-10-03",
    // 【2026-10-28更新】「2020年から（木曜版）に出演」は＝LOVE公式ニュース2847（2020-04-24、木曜レギュラーメンバー決定）で
    // 裏付けられたため、出典のWikipediaを公式2847に置き換え、sourceType を official にした。
    sourceType: "official",
    sourceUrls: [
      "https://www.mbs1179.com/yaru/",
      "https://equal-love.jp/news/detail/2847",
      "https://radioupdate.net/mbs/yaru/yarudo/20261003/",
      "https://equal-love.jp/schedule/detail/9234",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    id: "otani-jins-midface",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    title: "JINS「ヒロイン顔♡中顔面短縮メガネ」イメージモデル",
    type: ACTIVITY_TYPE.MODEL,
    description: "JINSの新作メガネ「ヒロイン顔♡中顔面短縮メガネ」のイメージモデルを務める。中顔面短縮効果を意識したボストン型フレームが特徴で、2026年8月20日発売。",
    url: "https://www.jins.com/jp/today/midface/",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-08-20",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://prtimes.jp/main/html/rd/p/000000396.000027384.html",
      "https://equal-love.jp/news/detail/11863",
    ],
    lastVerifiedDate: "2026-08-23",
  },
  {
    id: "otani-ririmew",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    priority: 2,
    title: "Ririmew（リリミュウ）プロダクトプロデューサー",
    type: ACTIVITY_TYPE.OTHER,
    description: "指原莉乃プロデュースのコスメブランド「Ririmew」に、2025年11月にイメージモデルとして参加。2026年7月からはプロダクトプロデューサーとして商品開発・監修を担当している（ブランド自体は指原莉乃が立ち上げたもので、大谷が立ち上げたブランドではない）。",
    url: "https://www.ririmew.com/",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2025-11-05",
    endDate: null,
    sourceType: "reliable",
    // 【2026-10-28】startDate（イメージモデル就任）を＝LOVE公式ニュース10857で確認し、出典に追加した。
    sourceUrls: [
      "https://prtimes.jp/main/html/rd/p/000000875.000025517.html",
      "https://www.ririmew.com/",
      "https://equal-love.jp/news/detail/10857",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    id: "otani-melady",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    priority: 3,
    title: "melady（ミレディ）プロデュース",
    type: ACTIVITY_TYPE.OTHER,
    description: "大谷映美里自身がプロデュースするカラーコンタクトレンズブランド。「いつだって、わたしがヒロイン」をコンセプトに2023年8月31日発売開始。1DAYタイプ・1MONTHタイプを展開しており、新色も順次追加されている。",
    url: null,
    links: [
      { label: "公式サイトを見る", url: "https://www.melady.jp/", sourceType: "official" },
      { label: "公式Xを見る", url: "https://x.com/meladyofficial", sourceType: "official" },
      { label: "公式Instagramを見る", url: "https://www.instagram.com/melady.official/", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2023-08-31",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://www.melady.jp/",
      "https://equal-love.jp/news/detail/7143",
      "https://x.com/meladyofficial",
      "https://www.instagram.com/melady.official/",
    ],
    lastVerifiedDate: "2026-08-23",
  },
  {
    // 【2026-10-28追加】＝LOVE公式ニュースで、2018秋〜2021summerの8シーズンのモデル起用とコラボ商品2回（1983・3976）を確認。
    // 2021summer以降の起用告知も終了の告知も無いため status は UNKNOWN。ブランド公式サイトは閉鎖の可能性があるため url は＝LOVE公式にした。
    id: "otani-honeycinnamon",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    title: "HoneyCinnamon（ハニーシナモン）コレクションモデル",
    type: ACTIVITY_TYPE.MODEL,
    description:
      "女性向けアパレルブランド「HoneyCinnamon」のシーズンコレクションモデルを、2018秋コレクションから2021summerコレクションまで継続して務めた。期間中には大谷映美里とのコラボ商品も発売された。",
    url: "https://equal-love.jp/news/detail/721",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2018-06-05",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/721",
      "https://equal-love.jp/news/detail/1011",
      "https://equal-love.jp/news/detail/1906",
      "https://equal-love.jp/news/detail/1983",
      "https://equal-love.jp/news/detail/2751",
      "https://equal-love.jp/news/detail/3244",
      "https://equal-love.jp/news/detail/3540",
      "https://equal-love.jp/news/detail/3871",
      "https://equal-love.jp/news/detail/3976",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // 【2026-10-28追加】＝LOVE公式ニュース1740（2019-05-08）・3716（2021-02-01）・3975（2021-04-29、スペシャルコラボ第3弾）で確認。
    // 第1・2弾のコラボは公式ニュースのメディア一覧で見つからなかったため、説明文は確認できた範囲だけにしている。
    // 瀧脇笙古の titty&Co.PETIT（takiwaki-titty-petit）とは別ブランドライン・別人なので別カード。
    id: "otani-titty-and-co",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    title: "titty&Co. モデル・コラボアイテム",
    type: ACTIVITY_TYPE.MODEL,
    description:
      "アパレルブランド「titty&Co.」の2019 SUMMER mini COLLECTION、2021 Spring Collectionのモデルを務め、スペシャルコラボ第3弾「白昼夢 - Daydream in the morning. -」（2021年）などのコラボアイテムも発売された。",
    url: "https://equal-love.jp/news/detail/3975",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2019-05-08",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/1740",
      "https://equal-love.jp/news/detail/3716",
      "https://equal-love.jp/news/detail/3975",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // 2026-09-30追加：＝LOVE公式ニュース（equal-love.jp/news/detail/12180）と、実際に本人が
    // 掲載されているWEBカタログ本体を確認して登録。urlはブランドのトップページではなく、
    // 本人が載っているカタログページそのものへ直接飛ばす（本人指示）。
    id: "noguchi-tocco-closet",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "tocco closet「2026 AW collection」モデル",
    type: ACTIVITY_TYPE.MODEL,
    description:
      "レディースファッションブランド「tocco closet」の秋冬コレクション「2026 AW collection - tocco closet」でモデルを務め、2026年9月30日にWEBカタログが公開された。同ブランドでは2024 AW collection・2026 SS collection（いずれも髙松瞳と2人）でもモデルを務めている。",
    url: "https://www.tocco-closet.co.jp/catalog/20260930/20260930_sp.html",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-09-30",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/12180",
      "https://www.tocco-closet.co.jp/catalog/20260930/20260930_sp.html",
      "https://equal-love.jp/news/detail/11260",
    ],
    lastVerifiedDate: "2026-09-30",
  },
  {
    id: "noguchi-first-pitch",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "始球式（千葉ロッテマリーンズ）",
    type: ACTIVITY_TYPE.SPORTS,
    description: "2023年9月25日、ZOZOマリンスタジアムでの千葉ロッテマリーンズ対福岡ソフトバンクホークス戦で始球式を担当した。",
    url: null,
    status: ACTIVITY_STATUS.PAST,
    startDate: "2023-09-25",
    endDate: "2023-09-25",
    sourceType: "reliable",
    sourceUrls: ["https://pacificleague.com/en/news/2023/9/10024203"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "yamamoto-first-pitch",
    memberId: "yamamoto-anna",
    relatedMemberIds: [],
    title: "始球式（広島東洋カープ）",
    type: ACTIVITY_TYPE.SPORTS,
    description: "2025年9月17日、マツダスタジアムでの広島東洋カープ対阪神タイガース戦で始球式を担当した。推し選手の背番号ユニフォームを着用して登板した。",
    url: "https://equal-love.jp/news/detail/10286",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2025-09-17",
    endDate: "2025-09-17",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/10286", "https://www.chugoku-np.co.jp/articles/-/713349"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "takiwaki-first-pitch",
    memberId: "takiwaki-shoko",
    relatedMemberIds: [],
    title: "始球式（横浜DeNAベイスターズ）",
    type: ACTIVITY_TYPE.SPORTS,
    description: "2025年6月18日、横浜スタジアムでの横浜DeNA対埼玉西武戦でセレモニアルピッチを担当した。",
    url: null,
    status: ACTIVITY_STATUS.PAST,
    startDate: "2025-06-18",
    endDate: "2025-06-18",
    sourceType: "reliable",
    sourceUrls: ["https://thefirsttimes.jp/report/0000638209", "https://full-count.jp/2025/06/18/post1776532"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "takamatsu-first-pitch",
    memberId: "takamatsu-hitomi",
    relatedMemberIds: [],
    title: "始球式（北海道日本ハムファイターズ）",
    type: ACTIVITY_TYPE.SPORTS,
    description: "2025年9月22日、エスコンフィールドHOKKAIDOでの北海道日本ハムファイターズ対千葉ロッテ戦で「ファーストピッチ」（球団の呼称）を担当した。",
    url: "https://equal-love.jp/news/detail/9983",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2025-09-22",
    endDate: "2025-09-22",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/9983"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "takamatsu-heather",
    memberId: "takamatsu-hitomi",
    relatedMemberIds: [],
    priority: 1,
    title: "Heather 25th Anniversary Collection",
    type: ACTIVITY_TYPE.MODEL,
    description:
      "2001年創業のレディースアパレルブランド「Heather」（運営：株式会社アダストリア）の25周年を記念したコレクションで、秋ビジュアルのモデルを務める。新宿ルミネエスト店限定で直筆サイン入りポスターが掲出されたほか、SNSでの着用コーディネートプレゼント企画も実施された。",
    url: "https://www.dot-st.com/heather/cp/heather25autumn0904",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-09-04",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://www.dot-st.com/heather/cp/heather25autumn0904",
      "https://prtimes.jp/main/html/rd/p/000003262.000001304.html",
    ],
    lastVerifiedDate: "2026-09-05",
  },
  {
    id: "takamatsu-boatrace-club",
    memberId: "takamatsu-hitomi",
    relatedMemberIds: [],
    title: "イコラブボートレース部",
    type: ACTIVITY_TYPE.OTHER,
    description: "髙松瞳が部長を務める企画。2022年11月頃に活動を開始し、現在もボートレース場とのコラボ企画などで継続的に活動している。",
    url: "https://equal-love-boatrace.jp/",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2022-11-01",
    endDate: null,
    sourceType: "reliable",
    sourceUrls: [
      "https://equal-love-boatrace.jp/",
      "https://www.youtube.com/playlist?list=PL4CXxHAJyaqH5MDFjEHZXblGycslwnzFU",
    ],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "noguchi-game-club",
    memberId: "noguchi-iori",
    relatedMemberIds: ["saito-kiara"],
    title: "イコラブゲーム部",
    type: ACTIVITY_TYPE.OTHER,
    description: "野口衣織が部長、齋藤樹愛羅が副部長を務めるとされる企画（3年以上活動していません）。",
    url: null,
    status: ACTIVITY_STATUS.IRREGULAR,
    startDate: null,
    endDate: null,
    sourceType: "fan",
    sourceUrls: [],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "takamatsu-hamburger-club",
    memberId: "takamatsu-hitomi",
    relatedMemberIds: ["takiwaki-shoko"],
    title: "イコラブハンバーガー部",
    type: ACTIVITY_TYPE.OTHER,
    description: "髙松瞳・瀧脇笙古がハンバーガー店巡りをする企画。部長は特に設けられていない。",
    url: null,
    status: ACTIVITY_STATUS.IRREGULAR,
    startDate: null,
    endDate: null,
    sourceType: "reliable",
    sourceUrls: ["https://x.com/takamatsuhitomi", "https://x.com/shoko_takiwaki"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "saito-nagisa-acting",
    memberId: "saito-nagisa",
    relatedMemberIds: [],
    title: "女優業（実写版『【推しの子】』星野ルビー役 ほか）",
    type: ACTIVITY_TYPE.TV,
    description: "＝LOVE卒業後、女優として活動中。ドラマ・映画への出演が継続している。",
    url: null,
    status: ACTIVITY_STATUS.ONGOING,
    // 卒業（2023-01-13）の8日後、新事務所エイジアクロスへの所属発表があった日を、
    // 女優業が本格的にスタートした目安の日付としている。
    startDate: "2023-01-21",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://www.evergreen-e.com/feature/saito_nagisa",
      "https://asiacross.jp/information/「齊藤-なぎさ」所属のお知らせ/",
    ],
    lastVerifiedDate: "2026-08-23",
  },

  // ===================== 【2026-10-27追加】個人活動の再調査で公式に確認できたもの =====================
  // 掲載ルール：＝LOVE公式（ニュース・スケジュール）／作品・番組・企業の公式／公式プレスリリースを
  // 実際に開いて確認できたものだけを足している。開始日・終了日が公式で確認できない場合は推測で埋めず、
  // status は UNKNOWN（画面では現況タグを出さない）にしている。
  // 【ドラマ・映画について】このファイルにはドラマ・映画の種別（type）が無いため、新しい種別は作らず、
  // ドラマは一番近い TV（テレビ）、映画は OTHER（活動）で登録している（ドラマ欄の作り方は本人判断の保留事項）。
  // 説明文に放送・公開時期を書いているのは、個人ページのカードには日付が表示されないため。
  {
    // ＝LOVE公式スケジュール2986（2020-07-03放送回）と、株式会社アルジーのPR TIMES 2本（2022-02-03・2022-09-16）で確認。
    // 肩書き「番組記者」「メインMC」はPR TIMESの表記どおり（2022年時点）。
    // 【2026-10-28修正】＝LOVE公式ニュース2864（2020-04-30）で「5/1(金)よりアシスタントとしてレギュラー出演」と確認できたため、
    // startDate を 2020-07-03（確認できた最も古い出演回）から 2020-05-01 に直し、初期の肩書き「アシスタント」を説明文に足した。
    // レギュラー放送の最終回は番組公式Xの投稿（検索結果の表示のみ・本文未読）でしか確認できていないため、status は UNKNOWN。
    // 番組発のVTuber「青龍（セイ）」「紫狼（シロ）」については、野口衣織の構想から生まれた企画であることだけを書く
    // （どのキャラクターの声を誰が担当したかは公式に明記が無いため、「声を担当」とは書かない）。
    id: "noguchi-nijitsu",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "ジャパコンProject 二次元領域拡大通信",
    type: ACTIVITY_TYPE.TV,
    description:
      "BSフジのアニメ・漫画・ゲーム情報番組（毎月第1金曜24:00〜）。2020年5月1日からアシスタントとしてレギュラー出演し、のちに番組記者・メインMCを務めた（番組編集長はニッポン放送の吉田尚記アナウンサー）。番組から生まれたVTuber「青龍（セイ）」「紫狼（シロ）」は、野口衣織の「理想の二次元男子を具現化したい」という構想が出発点となった番組企画。",
    url: null,
    links: [
      { label: "＝LOVE公式情報", url: "https://equal-love.jp/news/detail/2864", sourceType: "official" },
      { label: "番組のお知らせ（PR TIMES）", url: "https://prtimes.jp/main/html/rd/p/000000002.000094380.html", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2020-05-01",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/2864",
      "https://equal-love.jp/schedule/detail/2986",
      "https://prtimes.jp/main/html/rd/p/000000002.000094380.html",
      "https://prtimes.jp/main/html/rd/p/000000003.000094380.html",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // 【2026-10-28追加】＝LOVE公式ニュース11601（2026-07-17、参加決定）・11910（2026-09-01、劇中歌の先行配信）と作品公式サイトで確認。
    // 公式の表現は「アーティストとして参加」「劇中歌の歌唱」で、声優として役を演じるとは書かれていないため VOICE には入れない。
    // 公開日（2026-11-06）前なので UPCOMING。映画は一度きりなので、公開後は status を PAST・endDate を公開日に直すとよい
    // （UPCOMING のままだと開始日以降は自動で「継続中」表示になるため）。
    id: "noguchi-movie-grotesqque",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "映画『GROTESQQQUE-グロテスク-』第2部『夜露死駆★少女』アーティスト参加",
    type: ACTIVITY_TYPE.OTHER,
    description:
      "錦織敦史監督・CloverWorks制作のオリジナルアニメーション映画（2026年11月6日公開）の第2部『夜露死駆★少女』にアーティストとして参加。劇中歌『Tokyo Gals』（歌唱：野口衣織、MIRI）を2026年9月2日に先行配信。",
    url: null,
    links: [
      { label: "作品公式サイト", url: "https://movie-gtq123.com/", sourceType: "official" },
      { label: "＝LOVE公式情報", url: "https://equal-love.jp/news/detail/11601", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.UPCOMING,
    startDate: "2026-11-06",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/11601",
      "https://equal-love.jp/news/detail/11910",
      "https://movie-gtq123.com/",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // ＝LOVE公式ニュース6585（2023-04-20）でレギュラーメンバー4人を確認。放送開始日はPR TIMES（番組側の発表、2023-04-20）で確認。
    // 4人が出演するので1件だけ登録し、他の3人は relatedMemberIds で共有する（二重登録しない）。
    // 最終回は公式で確認できていないため status は UNKNOWN。野口衣織の「MC」表記は公式ニュースに無いため書かない。
    id: "noguchi-music-verse",
    memberId: "noguchi-iori",
    relatedMemberIds: ["takamatsu-hitomi", "otani-emiri", "saito-kiara"],
    title: "MUSIC VERSE",
    type: ACTIVITY_TYPE.TV,
    description:
      "日本テレビの音楽番組（毎月最終木曜24:59〜、2023年4月27日放送開始）。メタバース空間で収録する番組で、＝LOVEからは野口衣織・髙松瞳・大谷映美里・齋藤樹愛羅がレギュラーメンバーとして発表された。",
    url: "https://equal-love.jp/news/detail/6585",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2023-04-27",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/6585", "https://prtimes.jp/main/html/rd/p/000000021.000077859.html"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式スケジュール9016（2024-10-29放送回「火曜シーズンレギュラー」）と Real Sound（2024-10-04、「10〜12月」）で確認。
    // 正確な初回・最終回の日付は未確認のため、startDate は月初日を並べ替え用の目安として仮置きしている。
    id: "otani-lovit-2024",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    title: "ラヴィット！ 火曜シーズンレギュラー（2024年10〜12月）",
    type: ACTIVITY_TYPE.TV,
    description: "TBSの朝の情報バラエティ『ラヴィット！』で、2024年10〜12月の火曜シーズンレギュラー（ラヴィット！ファミリー）を務めた。",
    url: "https://equal-love.jp/schedule/detail/9016",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2024-10-01",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/schedule/detail/9016", "https://realsound.jp/2024/10/post-1799776.html"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース10564（2025-10-03）で確認。2025-10-07（火）放送回の告知で、シーズンの期間・終了日の記載は無いため status は UNKNOWN。
    id: "noguchi-lovit-2025",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "ラヴィット！ 火曜シーズンレギュラー",
    type: ACTIVITY_TYPE.TV,
    description: "TBSの朝の情報バラエティ『ラヴィット！』の火曜シーズンレギュラーとして、2025年10月7日放送回から出演。",
    url: "https://equal-love.jp/news/detail/10564",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2025-10-07",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/10564"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース3852（2021-03-27）で番組開始、文化放送の記事（2022-04-22）でレギュラー放送の最終回と
    // 2022年4月20日の1時間スペシャルでの締めくくりを確認。endDate はスペシャルの放送日。
    id: "sasaki-noguchi-oshiatsu-radio",
    memberId: "sasaki-maika",
    relatedMemberIds: ["noguchi-iori"],
    title: "＝LOVE 佐々木舞香・野口衣織の推しをあつめて",
    type: ACTIVITY_TYPE.RADIO,
    description:
      "文化放送のインターネットラジオ「超！A&G＋」のレギュラー番組（毎週土曜26:00〜26:30、2021年4月3日開始）。アニメ好きの2人が好きなアニメ・アニソンを語った。レギュラー放送終了後、2022年4月20日の「春の推し活1時間スペシャル」で2人そろって締めくくった。",
    url: "https://equal-love.jp/news/detail/3852",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2021-04-03",
    endDate: "2022-04-20",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/3852", "https://www.joqr.co.jp/ag/article/50584/"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース7244（2023-09-15）で確認。いつまで担当したかは公式で確認できないため status は UNKNOWN。
    // 大場花菜の「イマフレランチ」（oba-artistspoken、2024-06-14〜・金曜12:00）と同じ枠だが、引き継ぎかどうかは未確認なので書かない。
    id: "sasaki-imafure-lunch",
    memberId: "sasaki-maika",
    relatedMemberIds: [],
    title: "イマフレランチ",
    type: ACTIVITY_TYPE.RADIO,
    description: "音声配信アプリ「Artistspoken」の番組で、2023年9月22日から金曜12:00〜のパーソナリティを務めた。",
    url: "https://equal-love.jp/news/detail/7244",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2023-09-22",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/7244"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ドラマ（TVで代用）。＝LOVE公式ニュース9754（2025-03-16）・9858（2025-04-05）で確認。
    // 初回放送日は公式ニュースに「2025年4月スタート」とだけあるため、startDate は月初日を並べ替え用の目安として仮置き。
    id: "sasaki-drama-caster",
    memberId: "sasaki-maika",
    relatedMemberIds: [],
    title: "日曜劇場「キャスター」（ドラマ）",
    type: ACTIVITY_TYPE.TV,
    description: "TBS系日曜劇場（2025年4月期）に戸山紗矢役で出演。U-NEXTで配信されたサイドストーリー『恋するキャスター』にも出演した。",
    url: "https://equal-love.jp/news/detail/9754",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2025-04-01",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/9754", "https://equal-love.jp/news/detail/9858"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ドラマ（TVで代用）。＝LOVE公式ニュース7338（2023-10-06）で確認。最終回の日付は公式で未確認のため endDate は入れない。
    id: "sasaki-drama-maybe-koi",
    memberId: "sasaki-maika",
    relatedMemberIds: [],
    title: "よるおびドラマ「Maybe 恋が聴こえる」（ドラマ）",
    type: ACTIVITY_TYPE.TV,
    description: "TBSのよるおびドラマ（2023年10月16日放送開始）に橋口琴音役で出演した。",
    url: "https://equal-love.jp/news/detail/7338",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2023-10-16",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/7338"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ドラマ（TVで代用）。＝LOVE公式ニュース5618（2022-07-18）で確認。
    id: "sasaki-drama-ikinokotta-6nin",
    memberId: "sasaki-maika",
    relatedMemberIds: [],
    title: "ドラマイズム「生き残った6人によると」（ドラマ）",
    type: ACTIVITY_TYPE.TV,
    description: "MBS/TBSドラマイズム（2022年8月9日放送開始）に明美役で出演した。",
    url: "https://equal-love.jp/news/detail/5618",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2022-08-09",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/5618"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ドラマ（TVで代用）。＝LOVE公式ニュース692（2018-07-04）で確認。公式ページに役名の記載が無いため役名は書かない。
    // 齊藤なぎさは在籍当時（2018年）の共演なので relatedMemberIds に入れている（卒業メンバーは個人ページを持たないため、検索結果にだけ名前が出る）。
    id: "sasaki-drama-sachiiro",
    memberId: "sasaki-maika",
    relatedMemberIds: ["saito-nagisa"],
    title: "ドラマ「幸色のワンルーム」（ドラマ）",
    type: ACTIVITY_TYPE.TV,
    description: "ABCテレビの連続ドラマ（2018年7月8日放送開始、毎週日曜23:35〜）に齊藤なぎさとともに出演した。",
    url: "https://equal-love.jp/news/detail/692",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2018-07-08",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/692"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ドラマ（TVで代用）。＝LOVE公式ニュース6694（2023-05-28）で確認。
    id: "noguchi-drama-diy",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "ドラマイズム「DIY!!-どぅー・いっと・ゆあせるふ-」（ドラマ）",
    type: ACTIVITY_TYPE.TV,
    description: "MBS/TBSドラマイズム（2023年7月4日放送開始）に須理出未来役で出演した。",
    url: "https://equal-love.jp/news/detail/6694",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2023-07-04",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/6694"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // 映画（種別が無いため OTHER）。＝LOVE公式ニュース10399（2025-09-29）で確認。公開日はページの現在の表示（2026年6月12日）。
    id: "noguchi-movie-osomatsu",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "映画『おそ松さん 人類クズ化計画!!!!!?』",
    type: ACTIVITY_TYPE.OTHER,
    description: "実写映画（2026年6月12日公開）に橋本にゃー役で出演した。",
    url: "https://equal-love.jp/news/detail/10399",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2026-06-12",
    endDate: "2026-06-12",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/10399"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式スケジュール10826（2025-10-24）で確認（第3話のゲスト出演）。役名は公式ページに記載が無いため書かない。
    id: "takamatsu-drama-fake-mommy",
    memberId: "takamatsu-hitomi",
    relatedMemberIds: [],
    title: "金曜ドラマ『フェイクマミー』第3話（ドラマ）",
    type: ACTIVITY_TYPE.TV,
    description: "TBS系金曜ドラマ『フェイクマミー』第3話（2025年10月24日放送）にゲスト出演した。",
    url: "https://equal-love.jp/schedule/detail/10826",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2025-10-24",
    endDate: "2025-10-24",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/schedule/detail/10826", "https://www.crank-in.net/news/175359"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース3694（2021-01-17）で確認。書籍の種別は無いため OTHER。
    id: "otani-photobook-sukinahito",
    memberId: "otani-emiri",
    relatedMemberIds: [],
    title: "ファースト写真集『好きな人』",
    type: ACTIVITY_TYPE.OTHER,
    description: "2021年3月15日に集英社から発売されたファースト写真集。",
    url: "https://equal-love.jp/news/detail/3694",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2021-03-15",
    endDate: "2021-03-15",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/3694"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース4455（2021-09-07）で確認。
    id: "noguchi-photobook",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "ファースト写真集『君にしか教えない』",
    type: ACTIVITY_TYPE.OTHER,
    description: "2021年7月21日に白夜書房から発売されたファースト写真集。発売1か月半で重版が決定した。",
    url: "https://equal-love.jp/news/detail/4455",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2021-07-21",
    endDate: "2021-07-21",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/4455"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース8379（2024-04-12）で確認。WEB連載の期間は公式に記載が無いため書かない。
    id: "noguchi-iohanihoheto",
    memberId: "noguchi-iori",
    relatedMemberIds: [],
    title: "「いおはにほへと。～神アニメ×神セリフ＝♡～」",
    type: ACTIVITY_TYPE.OTHER,
    description: "『WEBザテレビジョン』の連載で、アニメの“神セリフ”を語る企画。2024年6月5日にKADOKAWAから書籍化された。",
    url: "https://equal-love.jp/news/detail/8379",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2024-06-05",
    endDate: "2024-06-05",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/8379"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース9747（2025-04-16）・11935（2026-09-15、「連載中」と明記）で確認。
    // 【2026-10-28更新】＝LOVE公式ニュース6288（2023-02-15発売号、旧題「教えて！クリエイティ部！」が「連載中」）を確認。
    // 連載の開始号そのものは不明なので、startDate は「公式で確認できた最も古い連載中の時点」として 2023-02-15 にした。
    // 改題の正確な時期は2023-11〜2024-09のあいだ（公式告知の間隔のため特定できない）なので、説明文では「告知されている」に留める。
    id: "oba-ex-taishu-creative-bu",
    memberId: "oba-hana",
    relatedMemberIds: [],
    title: "『EX大衆』連載「咲かせて！クリエイティ部」",
    type: ACTIVITY_TYPE.OTHER,
    description:
      "双葉社『EX大衆』でクリエイターに会ったり、クリエイティブの現場を体験したりする連載。2023年2月発売号の時点では「教えて！クリエイティ部！」の題名で連載中で、2024年9月発売号からは「咲かせて！クリエイティ部」として告知されている。",
    url: "https://equal-love.jp/news/detail/11935",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2023-02-15",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/9747",
      "https://equal-love.jp/news/detail/11935",
      "https://equal-love.jp/news/detail/6288",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // ＝LOVE公式ニュース5858（2022-09-29）と PR TIMES（2022-11-10、番組の告知）で確認。任期・現況は未確認のため UNKNOWN。
    id: "otoshima-utteco-golf",
    memberId: "otoshima-risa",
    relatedMemberIds: [],
    title: "utteco golf（ウッテコゴルフ）アンバサダー",
    type: ACTIVITY_TYPE.AMBASSADOR,
    description: "2022年9月29日、ゴルフ女子応援メディア「utteco golf」のアンバサダーに就任。スカイAのゴルフ番組『リサとサリーとuttecoちゃん』にも出演した。",
    url: "https://equal-love.jp/news/detail/5858",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2022-09-29",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/5858", "https://prtimes.jp/main/html/rd/p/000000054.000036277.html"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース10294（2025-09-05）・11357（2026-04-07）で確認。
    // 【2026-10-28更新】以前は公式Xの検索表示のみで保留していた2026年9月の2件を、＝LOVE公式ニュース11920・11921で確認できた。
    // 直近2026-09-15まで起用が続いているため status を ONGOING にした。2026年の告知のブランド表記「Suyunn」に題名を合わせた。
    id: "saito-suyunn-model",
    memberId: "saito-kiara",
    relatedMemberIds: [],
    title: "Suyunn（スユン）カタログモデル",
    type: ACTIVITY_TYPE.MODEL,
    description:
      "ファッションブランド「Suyunn（suyunn）」のカタログモデル。「suyunn 1st WEB カタログ 2025 AW collection」（2025年9月9日公開）、「2026 SS collection」（2026年4月7日公開）、「1st anniversary Sweet Mood by Suyunn collection」（2026年9月9日公開）、「Dear Suyunn」（2026年9月15日公開）に登場した。",
    url: "https://equal-love.jp/news/detail/11921",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2025-09-09",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/10294",
      "https://equal-love.jp/news/detail/11357",
      "https://equal-love.jp/news/detail/11920",
      "https://equal-love.jp/news/detail/11921",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // 【C修正の代わり】野口衣織の tocco closet カード（noguchi-tocco-closet）は「2026 AW」のカードで、公式ニュース12180では
    // 2026 AW のモデルは野口衣織1人。そのため relatedMemberIds に髙松瞳を足すと事実と合わなくなる。
    // 髙松瞳が野口衣織と2人で務めた回（公式ニュース9103・10313・11260で確認）を、髙松瞳の個人ページ用に1件だけ登録した。
    // 2026 AW 以降の起用は確認できないため status は UNKNOWN。
    id: "takamatsu-tocco-closet",
    memberId: "takamatsu-hitomi",
    relatedMemberIds: [],
    title: "tocco closet モデル",
    type: ACTIVITY_TYPE.MODEL,
    description:
      "レディースファッションブランド「tocco closet」で、野口衣織と2人でモデルを務めた。2024 AW collection（2024年11月13日公開）、LUMINE EST店リニューアルオープン（2025年9月4日公開）、2026 SS collection（2026年3月5日公開）。",
    url: "https://equal-love.jp/news/detail/11260",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2024-11-13",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/9103",
      "https://equal-love.jp/news/detail/10313",
      "https://equal-love.jp/news/detail/11260",
    ],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース11324（2026-04-02）で確認。期間限定のPOPUPなので PAST。
    id: "noguchi-takamatsu-wonjungyo",
    memberId: "noguchi-iori",
    relatedMemberIds: ["takamatsu-hitomi"],
    title: "Wonjungyo（ウォンジョンヨ）POPUP「ウォンジョンヨ展」メインモデル",
    type: ACTIVITY_TYPE.MODEL,
    description: "コスメブランド「Wonjungyo」のPOPUP「ウォンジョンヨ展」（2026年4月10日〜21日、東京・日本橋）で、髙松瞳・野口衣織の2人がメインモデルを務めた。",
    url: "https://equal-love.jp/news/detail/11324",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2026-04-10",
    endDate: "2026-04-21",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/11324"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式スケジュール8611（2024-07-08、就任挨拶）で確認。「超盛り上げ大使」への名称変更・ボイス機・現在の在任状況は
    // Xの検索表示のみで未確認のため書かず、status も UNKNOWN。
    id: "takamatsu-hamanako-ambassador",
    memberId: "takamatsu-hitomi",
    relatedMemberIds: [],
    title: "ボートレース浜名湖 レディース戦盛り上げ大使",
    type: ACTIVITY_TYPE.AMBASSADOR,
    description: "2024年7月8日、ボートレース浜名湖のオープニングセレモニーで「ボートレース浜名湖レディース戦盛り上げ大使」への就任挨拶を行った。",
    url: "https://equal-love.jp/schedule/detail/8611",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2024-07-08",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/schedule/detail/8611"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース3974（2021-04-29）で確認。いつまで続いたかは未確認のため UNKNOWN。
    id: "takiwaki-titty-petit",
    memberId: "takiwaki-shoko",
    relatedMemberIds: [],
    title: "titty&Co.PETIT モデル",
    type: ACTIVITY_TYPE.MODEL,
    description: "2021年4月29日、ファッションブランド「titty&Co.」の小柄な人向けライン「PETIT」のモデルへの起用が発表された。",
    url: "https://equal-love.jp/news/detail/3974",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2021-04-29",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/3974"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース5660（2022-08-01、第26号から連載開始）・11574（2026-06-17、第41号は「通常のコラム連載の代わりに」対談を掲載）で確認。
    id: "takiwaki-baysta-column",
    memberId: "takiwaki-shoko",
    relatedMemberIds: [],
    title: "サンケイスポーツ特別版『BAY☆スタ』コラム「BAYSTARS=LOVE」",
    type: ACTIVITY_TYPE.OTHER,
    description: "横浜DeNAベイスターズの応援タブロイド紙『BAY☆スタ』でのコラム連載。2022年8月2日発売の第26号から始まり、2026年6月発売の第41号では表紙と石田裕太郎投手との対談企画を担当した。",
    url: "https://equal-love.jp/news/detail/5660",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2022-08-02",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/5660", "https://equal-love.jp/news/detail/11574"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース9869（2025-04-07）で確認。終了は公式で未確認のため UNKNOWN（配信番組だが種別は TV で代用）。
    id: "yamamoto-lemino-football",
    memberId: "yamamoto-anna",
    relatedMemberIds: [],
    title: "Lemino Football MC",
    type: ACTIVITY_TYPE.TV,
    description: "映像配信サービス「Lemino」の欧州サッカー情報番組（毎週水曜12:00〜配信）。2025年4月9日配信回から新MCを務めた。",
    url: "https://equal-love.jp/news/detail/9869",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2025-04-09",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/9869"],
    lastVerifiedDate: "2026-10-27",
  },
  {
    // ＝LOVE公式ニュース3008（2020-07-22、「連載中」・毎月22日）と、いわき民報の記事一覧ページ
    // （2026-06-22掲載分まで確認、2025年10月以降は2か月ごとの掲載）で確認。連載名の表記は未確認のため書かない。
    // 【2026-10-28更新】＝LOVE公式ニュース2155（2019-09-25）の時点で既に「連載中」と告知されていた。連載開始日そのものは不明なので、
    // startDate は「公式で確認できた最も古い時点」として 2019-09-25 を入れた（並べ替え用）。
    id: "morohashi-iwaki-minpo",
    memberId: "morohashi-sana",
    relatedMemberIds: [],
    title: "いわき民報 連載コラム",
    type: ACTIVITY_TYPE.OTHER,
    description:
      "地元・福島県いわき市の新聞「いわき民報」でのコラム連載。毎月22日（つんつんの日）に掲載され、2019年9月の時点で連載中と告知されている。2026年6月22日掲載分まで続いている（最近は2か月に1回のペース）。",
    url: null,
    links: [
      { label: "＝LOVE公式情報", url: "https://equal-love.jp/news/detail/3008", sourceType: "official" },
      { label: "いわき民報の記事一覧", url: "https://iwaki-minpo.co.jp/category/sanatsun/", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2019-09-25",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/3008",
      "https://iwaki-minpo.co.jp/category/sanatsun/",
      "https://equal-love.jp/news/detail/2155",
    ],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // 【2026-10-28追加】＝LOVE公式ニュース6947（2023-07-24）で確認。コンテストの開催期間は公式文に無いので endDate は空、
    // 一度きりの就任なので status は PAST。髙松瞳の Season3（takamatsu-kyobijin-award-s3）とは別の回なので別カード。
    id: "sasaki-kyobijin-award-2024",
    memberId: "sasaki-maika",
    relatedMemberIds: [],
    title: "「京美人Award 2024」応援アンバサダー",
    type: ACTIVITY_TYPE.AMBASSADOR,
    description: "着物姿の女性を発掘するコンテスト「京美人Award」の2度目の開催（京美人Award 2024）で応援アンバサダーを務めた。",
    url: "https://equal-love.jp/news/detail/6947",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2023-07-24",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/6947", "https://www.kyoubijin-award.com/"],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // 【2026-10-28追加】＝LOVE公式ニュース8857（2024-08-23）で確認。開催期間は公式文に無いので endDate は空、status は PAST。
    id: "takamatsu-kyobijin-award-s3",
    memberId: "takamatsu-hitomi",
    relatedMemberIds: [],
    title: "「京美人Award Season3」応援アンバサダー",
    type: ACTIVITY_TYPE.AMBASSADOR,
    description: "着物姿の女性を発掘するコンテスト「京美人Award」の3度目の開催（Season3）で応援アンバサダーを務めた。",
    url: "https://equal-love.jp/news/detail/8857",
    status: ACTIVITY_STATUS.PAST,
    startDate: "2024-08-23",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/8857", "https://www.kyoubijin-award.com/"],
    lastVerifiedDate: "2026-10-28",
  },
  {
    // 【2026-10-28追加】＝LOVE公式ニュース2812（2020-04-13、新連載）・3332（2020-10-08、第3回）・3969（2021-04-27）で確認
    // （公式では2020-04〜2021-04に6回告知）。最終回は未確認なので UNKNOWN。utteco golf アンバサダー（2022）につながるゴルフ活動の出発点。
    id: "otoshima-popnroll-golf",
    memberId: "otoshima-risa",
    relatedMemberIds: [],
    title: "Pop'n'Roll 連載「＝LOVE 音嶋莉沙 ゴルフはじめました！」",
    type: ACTIVITY_TYPE.OTHER,
    description:
      "音楽・アイドルメディア「Pop'n'Roll」でのWeb連載。ゴルフの楽しさやウェアの可愛さを伝える企画で、2020年4月に第1回（PUMA訪問編）が公開され、本格レッスンなどの回が続いた。",
    url: "https://equal-love.jp/news/detail/2812",
    status: ACTIVITY_STATUS.UNKNOWN,
    startDate: "2020-04-13",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://equal-love.jp/news/detail/2812",
      "https://equal-love.jp/news/detail/3332",
      "https://equal-love.jp/news/detail/3969",
      "https://popnroll.tv/articles/7642",
    ],
    lastVerifiedDate: "2026-10-28",
  },
];
// 【2026-10-23】佐々木舞香「サムライマック」CMは js/data/commercials.js（CM・広告出演）へ移した。
