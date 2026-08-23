// ＝LOVEグループ全体の紹介情報（名前の由来・結成の経緯・プロデューサー紹介・
// リーダー・グループ公式リンク）を保持するデータファイル。
// メンバー個人の情報（members.js等）とは別に管理する（2026-08-02新設）。
//
// nameOrigin/formationSummaryは、公式情報を確認したうえで自分たちの言葉でまとめた要約であり、
// 公式サイトの文章をそのまま転載したものではない（HANDOFF 2-2章の方針を踏襲）。
// foundingMemberCountは固定値（歴史的事実）。現役メンバー数は画面側でMEMBERSから都度
// 自動集計し、ここには持たせない（二重管理を避けるため）。

export const GROUP_INFO = {
  introduction: {
    text: "＝LOVEは、指原莉乃がプロデュースするアイドルグループ。2017年に声優アイドルオーディションを経て結成され、同年9月にメジャーデビューした。",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/feature/about"],
    lastVerifiedDate: "2026-08-02",
  },
  nameOrigin: {
    text: "＝LOVEという名前には、アイドルはファンから愛されるべきであると同時に、アイドル自身もその仕事を愛するべきだ、という指原莉乃の思いが込められている。",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/feature/about", "https://www.sonymusic.co.jp/artist/equal-love/profile/"],
    lastVerifiedDate: "2026-08-02",
  },
  formationSummary: {
    text: "2017年1月28日、指原莉乃が記者会見で声優アイドルオーディションの開催を発表。同年4月29日の最終審査でメンバーが決定し、その場でグループ名「＝LOVE」が発表された。12人体制でスタートし、同年9月6日、1stシングル「＝LOVE」でメジャーデビューを果たした。",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/feature/about"],
    lastVerifiedDate: "2026-08-02",
  },
  foundingMemberCount: 12,
  producer: {
    name: "指原莉乃",
    role: "＝LOVEプロデューサー",
    facts: [
      "AKB48グループ選抜総選挙で通算3回1位を獲得（2013年・2015年・2016年）。2016年は史上初の2連覇、2017年は史上初の3連覇を達成した。",
      "2012年にAKB48からHKT48へ移籍。2013年4月には現役メンバーとして活動しながら劇場支配人を兼任した（グループ史上初）。",
      "2019年4月28日にHKT48を卒業した。",
      "＝LOVEのプロデューサーとして、公式サイト・所属レコード会社のプロフィールページ双方に明記されている。",
      "2017年4月29日の最終審査合格発表の場で、自らグループ名「＝LOVE」を発表した。",
    ],
    officialLinks: {
      x: "https://x.com/345__chan",
      instagram: "https://www.instagram.com/345insta/",
      youtube: "https://www.youtube.com/channel/UCfnSEB4atVWATf6vzepHzqw",
      others: [],
    },
    sourceType: "reliable",
    sourceUrls: [
      "https://equal-love.jp/feature/about",
      "https://www.sonymusic.co.jp/artist/equal-love/profile/",
      "https://ja.wikipedia.org/wiki/指原莉乃",
      "https://www.instagram.com/345insta/",
      "https://oricon.co.jp/news/2180917/",
    ],
    lastVerifiedDate: "2026-08-03",
  },
  leaderMemberId: "yamamoto-anna",
  leaderSource: {
    sourceType: "reliable",
    sourceUrls: ["https://magazine.showroom-live.com/interview/4251"],
    lastVerifiedDate: "2026-08-02",
  },
  officialLinks: {
    website: "https://equal-love.jp/",
    x: "https://twitter.com/equal_love_12",
    instagram: "https://www.instagram.com/equal_love.official/",
    tiktok: "https://www.tiktok.com/@equal_love_12",
    youtube: "https://www.youtube.com/channel/UCv7VutirxDn3RWIJXI68n_A",
    showroom: null, // 公式サイトからの直接リンクが未確認のため、要再確認まで非掲載
    store: "https://store.plusmember.jp/equallove/",
  },
  // 【2026-08-23追加】オサレカンパニーのクリエイティブディレクターで、＝LOVEのライブ衣装・
  // MV衣装を数多く手がけている人物。指原莉乃と並ぶ重要な裏方として紹介してほしいという
  // 本人指示により、プロデューサーカードのすぐ近くに専用カードを設ける。
  // 「東京ドームに行けると信じている」等、確認できない具体的発言は本人の言葉として書かない
  // （本人指示・調査結果ともに未確認のため）。
  costumeCreativeDirector: {
    name: "茅野しのぶ",
    role: "オサレカンパニー クリエイティブディレクター",
    introduction: {
      text: "オサレカンパニーの取締役・クリエイティブディレクターで、AKB48グループの衣装に加え、＝LOVEのライブ衣装・MV衣装なども数多く手がけている。本人のXやnoteでは、楽曲ごとの衣装への思いや＝LOVEというグループそのものへの愛着を発信しており、2025年には初の著書『アイドル衣装のひみつ〜カワイイの方程式』（学研）を刊行、同書には＝LOVE大谷映美里との鼎談も収録された。ファンから見れば、メンバー一人ひとりや楽曲・ライブの世界観を大切にしながら、長く＝LOVEの成長を衣装を通して支えてきた存在の一人と言える。",
      sourceType: "reliable",
      sourceUrls: [
        "https://x.com/shinobukayano",
        "https://note.com/shinobukayano/n/n4b49ff82334e",
        "https://note.com/shinobukayano/n/n1fd13674d3c1",
        "https://prtimes.jp/main/html/rd/p/000007453.000002535.html",
        "https://natalie.mu/music/news/626638",
        "https://ja.wikipedia.org/wiki/茅野しのぶ",
      ],
      lastVerifiedDate: "2026-08-23",
    },
    officialLinks: {
      x: "https://x.com/shinobukayano",
      website: "https://osarecompany.com",
    },
  },
  // 【2026-08-23追加】＝LOVE・≠MEメンバーが出演した過去のドラマ・映像作品。
  // 出演者全員のリストは公式サイト（equal-love.jp/schedule/detail/5667）に掲載がなく、
  // 本人（利用者）から伺った名前を「など」の形で記載している（断定的な全員リストにはしない）。
  // ドラマ公式サイト（asahi.co.jp）は自動アクセスツールからの取得がブロックされたため、
  // URL自体は本人から伺ったものをそのまま採用し、実在の最終確認は本人にお願いしたい。
  dramaAppearances: [
    {
      id: "drama-moshikoi",
      title: "もしも、この気持ちを恋と呼ぶなら…。",
      broadcastYear: "2022年",
      broadcastDetail: "2022年9月23日(金) 深夜0時24分〜 ABCテレビ（関西）放送",
      summary: "＝LOVE・≠MEのオーディションで選ばれたメンバーが出演する、ABCテレビのオリジナルスペシャルドラマ。バドミントン部を舞台にした高校生の物語で、両グループプロデューサーの指原莉乃が書き下ろした楽曲の歌詞をベースに制作された。",
      castNote: {
        text: "＝LOVEからは野口衣織・佐々木舞香・齊藤なぎさ・諸橋沙夏などが出演。出演者全員の正式なリストは確認できていないため、詳細はABCテレビ公式サイトを参照。",
        sourceType: "reliable",
      },
      themeSongs: [
        { group: "＝LOVE", title: "好きって、言えなかった", note: "センター：野口衣織 / 作詞：指原莉乃" },
        { group: "≠ME", title: "僕たちのイマージュ", note: null },
      ],
      officialLinks: {
        website: "https://www.asahi.co.jp/moshikoi/",
        news: "https://equal-love.jp/schedule/detail/5667",
      },
      sourceType: "official",
      sourceUrls: [
        "https://equal-love.jp/schedule/detail/5667",
        "https://natalie.mu/music/news/494180",
      ],
      lastVerifiedDate: "2026-08-23",
    },
    {
      id: "drama-yanten",
      title: "ヤンキー激戦区の四天王がアイドルグループに転生したら？",
      broadcastYear: "2026年",
      broadcastDetail: "2026年6月10日(水)スタート 日本テレビ（関東ローカル） 毎週水曜25:09〜",
      summary: "≠ME主演の日本テレビ連続ドラマ。＝LOVEからは野口衣織・大場花菜がゲスト出演し、劇中のトップアイドルグループ「Aurora5」のメンバーを演じる（野口衣織：一ノ瀬星羅役／大場花菜：九条リオ役）。TVer・日テレTADA・Huluで見逃し配信あり。",
      castNote: null,
      themeSongs: null,
      officialLinks: {
        website: "https://www.ntv.co.jp/yanten/",
        news: "https://equal-love.jp/news/detail/11509",
      },
      sourceType: "official",
      sourceUrls: [
        "https://equal-love.jp/news/detail/11509",
        "https://www.oricon.co.jp/news/2456450/full/",
        "https://mdpr.jp/drama/detail/4786046",
      ],
      lastVerifiedDate: "2026-08-23",
    },
  ],
  // 【2026-08-23追加】＝LOVE・≠ME・≒JOYの3グループ合同で展開している公式スマホゲーム等。
  // 事前登録用ページのタイトルは今も「事前登録受付中」の表示のままだが、実際は2023年12月26日
  // から正式サービス開始済み・現在も運営中であることを複数の情報源（運営会社ニュース欄・
  // App Store/Google Playのレビュー推移・公式Xの継続投稿）で確認済み（配信中の表記で掲載する）。
  relatedGames: [
    {
      id: "ikonoijoy-puzzle",
      name: "IKONOIJOY Puzzle（イコノイジョイパズル）",
      description: {
        text: "指原莉乃がプロデュースする＝LOVE・≠ME・≒JOYの3グループを起用した協力パズルゲーム。推しメンを設定してオンラインで協力プレイができ、オリジナルカードやムービーも収録されている。基本無料（一部アイテム課金あり）。2023年12月26日にiOS/Android向け正式サービスを開始し、現在も運営中。",
        sourceType: "official",
        sourceUrls: [
          "https://apps.apple.com/jp/app/ikonoijoy-puzzle-イコノイジョイパズル/id6470139422",
          "https://play.google.com/store/apps/details?id=jp.co.superblife.PRJ001",
          "https://superblife.co.jp/",
          "https://x.com/IKONOIJOY_Puzz",
        ],
        lastVerifiedDate: "2026-08-23",
      },
      officialLinks: {
        website: "https://ikonoijoy-puzzle-preregistration.superblife.co.jp/",
        x: "https://x.com/IKONOIJOY_Puzz",
        appStore: "https://apps.apple.com/jp/app/ikonoijoy-puzzle-イコノイジョイパズル/id6470139422",
        googlePlay: "https://play.google.com/store/apps/details?id=jp.co.superblife.PRJ001",
      },
    },
  ],
  // 【2026-08-23追加】＝LOVE公式の個人ファンクラブアプリ。メンバーごとのトークルーム購読・
  // レター送信・モーニングコールなどの機能を持つ（メンバー個別のURLはmembers.jsの
  // officialLinks.othersに「＝LOVE LINK」として追加している。COSM社が提供するプラットフォーム上で
  // 運営されており、運営会社は2026年7月21日付で株式会社コズムから株式会社ネッキョウへ、
  // 事業譲渡により変更されている（サービス自体はそのまま継続）。
  fanClubApp: {
    name: "＝LOVE LINK",
    description: {
      text: "＝LOVEメンバーと1対1でメッセージ・写真・動画・音声のやり取りができる、公式の個人ファンクラブアプリ。メンバーへのレター送信やモーニングコールなどの機能もある。",
      sourceType: "official",
      sourceUrls: ["https://equal-love.link.cosm.jp/", "https://equal-love.jp/news/detail/8841"],
      lastVerifiedDate: "2026-08-23",
    },
    officialLinks: {
      website: "https://equal-love.link.cosm.jp/",
      appStore: "https://apps.apple.com/jp/app/6695731709",
      googlePlay: "https://play.google.com/store/apps/details?id=io.cosm.fc.user.equal.love",
    },
  },
};
