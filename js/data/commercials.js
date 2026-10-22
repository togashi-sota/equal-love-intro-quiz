// 【2026-10-23新設・本人指示】CM・広告出演のデータ（個人ページ「CM・広告出演」と、
// 「＝LOVEについて」の「CM・広告・企業タイアップ」の両方から参照する、1件＝1作品の正規データ）。
//
// ■ 構造
//   1つのCMに複数メンバーが出ていても、作品ごとに1件だけ書き、出演者は memberIds に並べる
//   （例：ソフトバンク Galaxy Z は大谷映美里・佐々木舞香・野口衣織の3人 → 3人の個人ページに同じ1件が出る）。
//   ＝LOVE全員の出演は isGroup: true にし、個人ページには複製せず「＝LOVEについて」に1か所だけ載せる
//   （同じ情報が10か所に散らばって更新が大変になるのを防ぐため）。
//
// ■ 掲載ルール（本人指示）
//   ・＝LOVE公式／企業公式／公式プレスリリースで出演が確認できたものだけ載せる。推測では足さない。
//   ・kind は「テレビCM」「WebCM」「テレビCM・WebCM」「企業タイアップ」「キャンペーン」を区別して書く
//     （CMでないものをCMと断定しない）。
//   ・放送・公開が終わっても「出演実績」として残す。「放送中」とは書かない（確認できないため）。
//   ・date が未来なら、画面上は自動で「〜開始予定」と表示する（js/commercialsSection.js）。
//
// ■ 新しいCMが決まったとき
//   この配列に1件足すだけでよい（並びは date の新しい順に自動で決まる）。

const ID = {
  otani: "otani-emiri",
  sasaki: "sasaki-maika",
  takamatsu: "takamatsu-hitomi",
  saito: "saito-kiara",
  noguchi: "noguchi-iori",
  yamamoto: "yamamoto-anna",
};

export const COMMERCIAL_KIND = {
  TV: "テレビCM",
  WEB: "WebCM",
  TV_WEB: "テレビCM・WebCM",
  REGIONAL_TV: "テレビCM（地域限定）",
  TIE_UP: "企業タイアップ",
  CAMPAIGN: "キャンペーン",
};

const EL = "＝LOVE公式情報";
const VERIFIED = "2026-10-23";

export const COMMERCIALS = [
  // ===================== ＝LOVE全員 =====================
  {
    id: "cm-group-hotpepper-beauty-2026",
    isGroup: true,
    brand: "ホットペッパービューティー",
    title: "【＝LOVE×ホットペッパービューティー】〜一緒に、ラブな自分になろ？篇〜",
    kind: COMMERCIAL_KIND.WEB,
    date: "2026-09-09",
    description: "＝LOVEの『超特急逃走中』をBGMに、メンバーが楽屋でヘアを整えてステージに立つまでを描いた60秒のWebCM。メイキング・インタビュー動画も公開。",
    links: [
      { label: EL, url: "https://equal-love.jp/news/detail/11930" },
      { label: "CMを見る", url: "https://youtu.be/-Xnk1H9gHMQ" },
    ],
    sourceUrls: ["https://equal-love.jp/news/detail/11930", "https://www.atpress.ne.jp/news/630669"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-group-mcdonalds-viva-world-mac-2026",
    isGroup: true,
    brand: "日本マクドナルド「VIVA！ワールドマック」",
    title: "「VIVA！ワールドマックを食べられる」",
    kind: COMMERCIAL_KIND.WEB,
    date: "2026-06-17",
    description: "＝LOVE全員でのマクドナルド初出演。『ラブソングに襲われる』を替え歌でセルフカバーし、限定ユニフォーム姿でMVをオマージュした。",
    // 動画URLは公開状態を確認できなかった（ログイン要求）ため載せず、＝LOVE公式情報から辿る形にしている
    links: [{ label: EL, url: "https://equal-love.jp/news/detail/11599" }],
    sourceUrls: ["https://equal-love.jp/news/detail/11599", "https://www.thefirsttimes.jp/news/0000829545/"],
    lastVerifiedDate: VERIFIED,
  },
  {
    // 以前は js/data/groupActivities.js（グループ活動）にあったものを、CM・広告欄へ移した（同じ作品の二重表示を避けるため）。
    id: "cm-group-mynumber-card-2026",
    isGroup: true,
    brand: "政府広報（内閣府大臣官房政府広報室・デジタル庁）",
    title: "「まだまだマイナー？マイナカード」",
    kind: COMMERCIAL_KIND.TV_WEB,
    date: "2026-03-02",
    description: "マイナンバーカード利用促進キャンペーンのオリジナルソング・CMで、＝LOVEにとってグループ初のテレビCM。PRキャラクター「マイナちゃん」と共演し、3月9日からは動画配信サービスでWebCMも展開。作詞：服部隆幸、作曲：小池竜暉・菊池博人、編曲：菊池博人、振付：槙田紗子。",
    links: [
      { label: "PVを見る", url: "https://www.youtube.com/watch?v=93iIH0_e1QM" },
      { label: "特設サイト", url: "https://www.gov-online.go.jp/tokusyu/mynumber/" },
    ],
    sourceUrls: [
      "https://www.gov-online.go.jp/tokusyu/mynumber/",
      "https://equal-love.jp/news/detail/11249",
      "https://www.youtube.com/watch?v=93iIH0_e1QM",
      "https://www.oricon.co.jp/news/2439020/full/",
      "https://prtimes.jp/main/html/rd/p/000000001.000178844.html",
    ],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "tieup-group-rohto-lycee-2024",
    isGroup: true,
    brand: "ロート製薬「ロートリセ」",
    title: "ロートリセ×＝LOVE「ときめくアイドルアイムービー」",
    kind: COMMERCIAL_KIND.TIE_UP,
    date: "2024-12-24",
    description: "目薬ブランド「ロートリセ」とのタイアップ。メンバー全員分の「ときめくアイドルアイムービー」が公開された。",
    links: [{ label: EL, url: "https://equal-love.jp/news/detail/9504" }],
    sourceUrls: ["https://equal-love.jp/news/detail/9504", "https://x.com/Equal_LOVE_12/status/1871406102208024846"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "tieup-group-ululis-2024",
    isGroup: true,
    brand: "ululis（ウルリス）「Water in Matomake」",
    title: "ululis「Water in Matomake」タイアップ",
    kind: COMMERCIAL_KIND.TIE_UP,
    date: "2024-07-10",
    description: "ヘアケアブランドululisの新作まとめ髪スティックとのタイアップ。2024年8月1日の全国発売に合わせ、SNSでのWEB CMなどの特別コンテンツ公開が告知された。",
    links: [{ label: EL, url: "https://equal-love.jp/news/detail/8632" }],
    sourceUrls: ["https://equal-love.jp/news/detail/8632", "https://x.com/ululis_pr/status/1810952074202599683"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-group-meiji-essel-supercup-2024",
    isGroup: true,
    brand: "明治 エッセル スーパーカップ",
    title: "「スーパーカップがある瞬間＝LOVE」",
    kind: COMMERCIAL_KIND.WEB,
    date: "2024-07-08",
    description: "メンバーが“アイドルではない世界のもう1人のわたし”を演じるオリジナルWEB CMと、対象商品から見られるAR動画のコラボ企画（2024年7月8日〜8月30日）。",
    links: [
      { label: EL, url: "https://equal-love.jp/news/detail/8617" },
      { label: "明治の発表", url: "https://www.meiji.co.jp/corporate/pressrelease/2024/0704_02/index.html" },
    ],
    sourceUrls: ["https://equal-love.jp/news/detail/8617", "https://www.meiji.co.jp/corporate/pressrelease/2024/0704_02/index.html"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "campaign-group-acecook-harusame-2023",
    isGroup: true,
    brand: "エースコック「スープはるさめ」",
    title: "スープはるさめ＝LOVEキャンペーン（2023年）・はるさめ＝LOVEキャンペーン（2024年）",
    kind: COMMERCIAL_KIND.CAMPAIGN,
    date: "2023-05-01",
    description: "対象商品を買って応募すると＝LOVEのサイン入りチェキやグッズが当たるコラボキャンペーン。2023年5月と2024年5〜6月の2回実施。",
    links: [
      { label: "＝LOVE公式（2023年）", url: "https://equal-love.jp/news/detail/6592" },
      { label: "＝LOVE公式（2024年）", url: "https://equal-love.jp/news/detail/8419" },
    ],
    sourceUrls: [
      "https://equal-love.jp/news/detail/6592",
      "https://equal-love.jp/news/detail/8419",
      "https://www.acecook.co.jp/news/002812/",
    ],
    lastVerifiedDate: VERIFIED,
  },

  // ===================== メンバー個人・数人 =====================
  {
    id: "cm-sasaki-mcdonalds-momo-chicken-2026",
    memberIds: [ID.sasaki],
    brand: "日本マクドナルド",
    title: "「ザクザクジューシーももチキン篇」",
    kind: COMMERCIAL_KIND.TV,
    date: "2026-10-27",
    description: "新レギュラーチキンのサイドメニュー「ザクザクジューシーももチキン」の新CM（全国・一部地域を除く）。",
    links: [{ label: EL, url: "https://equal-love.jp/news/detail/12248" }],
    sourceUrls: ["https://equal-love.jp/news/detail/12248"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-sasaki-mcdonalds-zakuzaku-mac-2026",
    memberIds: [ID.sasaki],
    brand: "日本マクドナルド",
    title: "『ザクザクジューシーマック』WebCM",
    kind: COMMERCIAL_KIND.WEB,
    date: "2026-10-21",
    description: "マクドナルド公式X・Instagramで公開されたWebCM。",
    links: [{ label: EL, url: "https://equal-love.jp/news/detail/12286" }],
    sourceUrls: ["https://equal-love.jp/news/detail/12286"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-takamatsu-mcdonalds-390-pair-2026",
    memberIds: [ID.takamatsu],
    brand: "日本マクドナルド",
    title: "『390ペア』WebCM",
    kind: COMMERCIAL_KIND.WEB,
    date: "2026-10-20",
    coStars: "さや香 新山",
    description: "午後2時以降にサイドとドリンクを390円で楽しめる新レギュラーメニュー『390ペア』のWebCM。",
    links: [{ label: EL, url: "https://equal-love.jp/news/detail/12283" }],
    sourceUrls: ["https://equal-love.jp/news/detail/12283", "https://x.com/takamatsuhitomi/status/2112484913614291196"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-saito-mcdonalds-tsukimi-sweets-2026",
    memberIds: [ID.saito],
    brand: "日本マクドナルド 月見スイーツ",
    title: "月見スイーツ WebCM",
    kind: COMMERCIAL_KIND.WEB,
    date: "2026-09-05",
    description: "キャラクター「月見パイもち子」（CV：齋藤樹愛羅）が歌うテーマソング『ちゅきミー！』に合わせて踊り、月見スイーツを楽しむWebCM。",
    links: [{ label: EL, url: "https://equal-love.jp/news/detail/11914" }],
    sourceUrls: ["https://equal-love.jp/news/detail/11914", "https://x.com/Equal_LOVE_12/status/2095436639967629380"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-sasaki-mcdonalds-tsukimi-pie-2026",
    memberIds: [ID.sasaki],
    brand: "日本マクドナルド 月見スイーツ",
    title: "「北海道産バターとあんことおもちの月見パイ」新CM",
    kind: COMMERCIAL_KIND.TV,
    date: "2026-09-01",
    description: "35周年の月見ファミリーより、月見スイーツの新CM（全国・一部地域を除く）。",
    links: [{ label: EL, url: "https://equal-love.jp/news/detail/11883" }],
    sourceUrls: ["https://equal-love.jp/news/detail/11883", "https://equal-love.jp/schedule/detail/11884"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-softbank-galaxy-z-2026",
    memberIds: [ID.otani, ID.sasaki, ID.noguchi],
    brand: "ソフトバンク「Samsung Galaxy Z シリーズ」",
    title: "「アルパカ族・高原にて」篇 ほか",
    kind: COMMERCIAL_KIND.TV_WEB,
    date: "2026-07-23",
    coStars: "白戸家のお父さん",
    description: "佐々木舞香がアルパカ役、野口衣織が“アルパカ語”の通訳役で、新しい折りたたみGalaxyを紹介するテレビCM（全国）。WebCM「アルパカ族・山小屋にて」篇も公開。大谷映美里・野口衣織はソフトバンクCM初出演。",
    links: [
      { label: EL, url: "https://equal-love.jp/news/detail/11776" },
      { label: "ソフトバンクの発表", url: "https://prtimes.jp/main/html/rd/p/000000112.000041498.html" },
    ],
    sourceUrls: [
      "https://equal-love.jp/news/detail/11776",
      "https://prtimes.jp/main/html/rd/p/000000112.000041498.html",
      "https://www.advertimes.com/20260728/article551875/",
    ],
    lastVerifiedDate: VERIFIED,
  },
  {
    // 以前は js/data/memberActivities.js（個人活動）にあったものを、CM・広告欄へ移した（二重表示を避けるため）。
    id: "cm-sasaki-mcdonalds-samurai-mac-2026",
    memberIds: [ID.sasaki],
    brand: "日本マクドナルド「サムライマック」",
    title: "「普通のマックじゃ物足んねえ。」篇",
    kind: COMMERCIAL_KIND.TV,
    date: "2026-05-06",
    coStars: "堺雅人",
    description: "5周年を迎えた「サムライマック」の新CM（全国・一部地域を除く）。佐々木舞香にとって初のマクドナルドCM出演。",
    links: [{ label: EL, url: "https://equal-love.jp/news/detail/11421" }],
    sourceUrls: [
      "https://equal-love.jp/news/detail/11421",
      "https://www.mcdonalds.co.jp/company/news/2026/0430a/",
      "https://tower.jp/article/news/2026/05/07/tg003",
    ],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-yamamoto-yumetown-kenmin-2025",
    memberIds: [ID.yamamoto],
    brand: "ゆめタウン×秘密のケンミンSHOW極",
    title: "『ケンミン熱愛！広島グルメ総選挙』CM",
    kind: COMMERCIAL_KIND.REGIONAL_TV,
    date: "2025-06-27",
    coStars: "≠ME 河口夏音・永田詩央里",
    description: "広島県出身の3人が広島弁でキャンペーンを紹介した地域限定CM（広島テレビ・福岡放送・熊本県民テレビ、2025年7月31日まで）。7月からはゆめタウン・ゆめマートの店内放送も担当。",
    links: [
      { label: EL, url: "https://equal-love.jp/news/detail/10031" },
      { label: "キャンペーンの発表", url: "https://prtimes.jp/main/html/rd/p/000000207.000018483.html" },
    ],
    sourceUrls: ["https://equal-love.jp/news/detail/10031", "https://prtimes.jp/main/html/rd/p/000000207.000018483.html"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-sasaki-softbank-oppo-2023",
    memberIds: [ID.sasaki],
    brand: "ソフトバンク「OPPO Reno10 Pro 5G」",
    title: "「せかさんといて」篇",
    kind: COMMERCIAL_KIND.WEB,
    date: "2023-10-06",
    coStars: "≠ME 鈴木瞳美",
    description: "約28分で充電できる“神ジューデン”スマホのWebCM。充電を待つ間の“謎ダンス”が話題に。佐々木舞香にとって初のソフトバンクCM。",
    links: [
      { label: "ソフトバンクの発表", url: "https://kyodonewsprwire.jp/release/202310050693" },
      { label: "ニュース記事", url: "https://natalie.mu/music/news/543896" },
    ],
    sourceUrls: ["https://kyodonewsprwire.jp/release/202310050693", "https://natalie.mu/music/news/543896"],
    lastVerifiedDate: VERIFIED,
  },
  {
    id: "cm-sasaki-yoani-2020",
    memberIds: [ID.sasaki],
    brand: "代々木アニメーション学院",
    title: "「手に入れる勇気もその先も篇」",
    kind: COMMERCIAL_KIND.TV,
    date: "2020-02-15",
    description: "森の中で“心の声”を聞きながら将来を考える少女を演じたテレビCM（2020年2月15日〜29日、テレビ朝日・朝日放送）。CMソングは天月-あまつき-『アイビー』。",
    links: [
      { label: EL, url: "https://equal-love.jp/news/detail/2651" },
      { label: "CMを見る", url: "https://youtu.be/Krc9F2fh_MA" },
    ],
    sourceUrls: ["https://equal-love.jp/news/detail/2651"],
    lastVerifiedDate: VERIFIED,
  },
];
