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
  // 【2026-08-23追加】＝LOVE Official Fan Club。2026年5月25日付の公式告知
  // （equal-love.jp/news/detail/11499）により、2026年6月23日12:00から会費が改定された。
  // 新規入会は550円コースのみで、以前からの継続会員は440円コースのまま利用できるが、
  // 価格改定後開始のFC限定チケット先行の対象は550円コースの会員のみ、という制限がある
  // （古い440円だけを表示しないよう、料金は必ずこの2本立てで説明すること）。
  // 「会員限定チケプラTrade」はFAQカテゴリの存在は確認できたが、具体的なサービス内容は
  // 文言レベルで確認できなかったため、特典一覧には含めていない。
  officialFanClub: {
    name: "＝LOVE Official Fan Club",
    description: {
      text: "＝LOVEをもっと楽しみたいファン向けの公式ファンクラブ。＝LOVE公演やメンバーが出演する舞台・イベントのFC先行に申し込めるほか、会員限定コンテンツ「MOMENT」やイコラブ占い、＝LOVE CHECKなど、会員だけが楽しめる様々なサービスが用意されている。",
      sourceType: "official",
      sourceUrls: ["https://sp.equal-love.jp/", "https://equal-love.jp/news/detail/11499"],
      lastVerifiedDate: "2026-08-23",
    },
    pricingNote: {
      text: "新規入会：Web決済コース 月額550円（税込）／アプリ内課金コース 月額650円（税込）。2026年6月23日12:00に会費が改定され、それ以前から継続している会員は440円コースのまま利用できるが、価格改定後に始まったFC限定チケット先行の対象は550円コースの会員のみとなる。",
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/news/detail/11499"],
      lastVerifiedDate: "2026-08-23",
    },
    benefits: [
      "＝LOVE公演・メンバー出演の舞台やイベントのFC先行チケット",
      "会員限定コンテンツ「MOMENT」（メンバーの24時間限定投稿）",
      "ライブ・公演連動企画",
      "FC限定グッズ",
      "イコラブ占い／＝LOVE CHECK",
      "1年以上継続した会員向けの継続特典（毎年11月頃）",
      "期間限定企画",
    ],
    officialLinks: {
      website: "https://sp.equal-love.jp/",
      join: "https://sp.equal-love.jp/feature/introduction",
    },
  },
  // 【2026-08-23追加】officialLinks.storeと同じURL（グッズ購入サイトであることを実際に
  // アクセスして確認済み）。ファンクラブ紹介の近くに、説明文付きで改めて紹介する
  // （本人指示：具体的な商品を大量に書く必要はなく、公式ショップへの導線があればよい）。
  officialShop: {
    description: "ペンライト、ライブグッズ、メンバーグッズなど＝LOVEの公式グッズを購入できる公式オンラインショップ。",
    url: "https://store.plusmember.jp/equallove/",
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
  // 【2026-08-23追加】＝LOVEと姉妹グループ（≠ME・≒JOY）による合同楽曲。年代順（2020年→2022年）に
  // 並べることで、姉妹グループが増えるにつれ合同楽曲の規模も広がっていった流れが自然に伝わる構成にした
  // （本人指示）。
  collaborationSongs: [
    {
      id: "collab-tsugi-ni-aeta-toki",
      title: "次に会えた時 何を話そうかな",
      participatingGroups: ["＝LOVE", "≠ME"],
      year: "2020年",
      description:
        "2020年、新型コロナウイルスの影響でツアー中止・CD延期が相次ぎ、ライブなどファンと直接会える活動が難しくなった時期に発表された、＝LOVEと≠MEによる合同楽曲。メンバー24人それぞれが自宅からリモートで歌唱・撮影に参加して制作されており、特定の1人が立つセンターは設けられていない。会えない時間の中でもファンとのつながりを大切にしたいという思いが込められている。",
      credits: null,
      mvUrl: "https://www.youtube.com/watch?v=aC4CdVDFzB4",
      sourceType: "official",
      sourceUrls: ["https://www.youtube.com/watch?v=aC4CdVDFzB4"],
      lastVerifiedDate: "2026-08-23",
    },
    {
      id: "collab-triple-date",
      title: "トリプルデート",
      participatingGroups: ["＝LOVE", "≠ME", "≒JOY"],
      year: "2022年",
      description:
        "＝LOVE・≠ME・≒JOYの3グループがそろって歌う、指原莉乃プロデュース3グループ（イコノイジョイ）初の合同楽曲。2022年6月26日にMVを公開、7月20日から配信をスタートした。＝LOVE11名・≠ME12名・≒JOY13名、総勢36名で歌唱している。",
      credits: "作詞：指原莉乃／作曲：本多友紀／編曲：脇眞富",
      mvUrl: "https://www.youtube.com/watch?v=gkabNNfTjX4",
      sourceType: "official",
      sourceUrls: [
        "https://equal-love.jp/news/detail/5638",
        "https://natalie.mu/music/news/483126",
        "https://www.youtube.com/watch?v=gkabNNfTjX4",
      ],
      lastVerifiedDate: "2026-08-23",
    },
  ],
  // 【2026-08-24追加、本人指示】＝LOVE公式YouTubeチャンネル・イコノイジョイチャンネルの
  // 紹介と、主な再生リスト。再生リストの名称・本数は、本人から共有されたURLを1件ずつ
  // 実際にYouTubeで開いて確認したもの（oEmbed APIまたは直接アクセスで再生リスト名を取得。
  // 2026-08-24確認）。本人が事前に想定していたテーマ名（History・ゲーム実況関連など）と
  // 実際の再生リスト名が異なるものもあったため、推測で名前を当てはめず、必ず確認できた
  // 正式名称をそのまま採用している。
  youtubeChannels: [
    {
      id: "equallove-official-youtube",
      name: "＝LOVE公式YouTubeチャンネル",
      url: "https://www.youtube.com/@equallove_",
      description:
        "＝LOVEの公式YouTubeチャンネル。歴代シングルのミュージックビデオをはじめ、メンバーの素顔を追ったドキュメンタリー、ライブ映像、CD特典映像など、さまざまな公式映像をまとめて見ることができる。",
      // 【2026-08-24改訂・本人指示】先頭（Music Video）と末尾（GASHIOの限定公開MV再生リスト）
      // 以外は、＝LOVE公式チャンネルの「再生リスト」タブを開いたときの既定の並び順
      // （新しい順）に合わせている。
      playlists: [
        {
          name: "イコラブ Music Video",
          description: "1st Singleから最新シングルまで、歴代楽曲のミュージックビデオをまとめて見られる再生リスト。",
          url: "https://www.youtube.com/playlist?list=PLADr7aFJj-bpK0HT4m93gJt3OTXmaQYUY",
        },
        {
          name: "イコラブ 特典映像",
          description:
            "CDに封入される特典映像などをまとめた再生リスト。シングルにはType B・Type Cなど複数の仕様が用意されることがあり、そうした盤に特典映像が収録されることがあるが、収録内容は作品によって異なる。",
          url: "https://www.youtube.com/playlist?list=PLADr7aFJj-bp-_C8J4k5mULLgAlmz0jZz",
        },
        {
          // 本人は「History」に該当すると想定していたURLだが、実際に開いて確認したところ
          // 正式名称は「LIVE・CONCERT」だったため、推測で名前を当てはめずそのまま採用している
          // （History自体は下の別の再生リストとして存在する）。
          name: "LIVE・CONCERT",
          description: "コンサート・ライブイベントの映像をまとめた再生リスト。",
          url: "https://www.youtube.com/playlist?list=PLADr7aFJj-brRmGyphllZZL_XzY8K7pLk",
        },
        {
          name: "Documentary of ＝LOVE",
          description: "メンバーの素顔や活動の裏側に迫るドキュメンタリー映像をまとめた再生リスト。",
          url: "https://www.youtube.com/playlist?list=PLADr7aFJj-brEewq0fBUNcZx53GZ6f2T8",
        },
        {
          name: "＝LOVE(イコールラブ) History",
          description: "結成からこれまでの＝LOVEの歩みを、当時の映像で振り返ることができる再生リスト。",
          url: "https://www.youtube.com/playlist?list=PLADr7aFJj-boJ3hF1d44ou7M43_3nmeJX",
        },
        {
          // 【2026-09-05追加・本人指示】＝LOVE公式チャンネルの再生リストではなく、SBS
          // （韓国の放送局）の音楽番組公式サブチャンネル「SBSKPOP ZOOM」が
          // アップロードしている再生リスト（本人がこの再生リストのURLを共有）。
          // 実際にYouTubeを開いて確認済み（2026-09-05）：本数「10 本の動画」、
          // メンバー10人分（佐々木舞香・野口衣織・大谷映美里・大場花菜・乙嶋りさ・
          // 齋藤きあら・髙松瞳・瀧脇笙古・諸橋沙夏・山本杏奈）が1本ずつ含まれることを確認。
          name: "SBS「인기가요(人気歌謡)」個人チッケム集",
          description:
            "＝LOVEは2026年8月23日、韓国SBSの音楽番組「인기가요（Inkigayo／人気歌謡）」に初出演し、21stシングル「恋、はじめました。」の韓国語バージョンを披露した。「인기가요」は1991年開始・韓国の主要な週間音楽ランキング番組の一つ。この再生リストは、その出演時にメンバー1人ずつを個別のカメラで追い続けた「チッケム（직캠）」——日本の「顔ドアップ映像」に近いが、複数人が映る通常のステージ映像とは違い、1人だけを画面いっぱいに映し続ける韓国の音楽番組ならではの映像形式——を10人分まとめたもの。誰か1人を最初から最後まで自分のペースでじっくり見られるのが魅力。",
          url: "https://www.youtube.com/playlist?list=PLFV80l5evUk8",
        },
        {
          // 公式の再生リストではなく、本人（GASHIO）がこのクイズアプリ用にまとめた限定公開の
          // 再生リスト（本人指示：公式再生リストと誤解されないよう説明文に必ず明記する）。
          name: "イコラブ MV",
          description:
            "このクイズアプリ製作者GASHIOが、＝LOVEのMVを聴くとき用にまとめた限定公開の再生リスト（＝LOVE公式が作成したものではありません）。公式チャンネルのMVだけをまとめて見たい・聴きたいときに。",
          url: "https://www.youtube.com/playlist?list=PLqDsKdChnb0OEYszf7NUFP83-PESkDCjj",
          isUnofficial: true,
        },
      ],
    },
    {
      id: "ikonoijoy-youtube",
      name: "イコラブ ノイミー ニアジョイ チャンネル（イコノイジョイ）",
      url: "https://www.youtube.com/@ikonoijoy",
      description:
        "＝LOVE・≠ME・≒JOYの3グループ合同の公式YouTubeチャンネル。バラエティ企画や食べ歩き、ゲーム、ダンスなど、ミュージックビデオとはまた違ったメンバーの素顔を楽しめる。",
      // 【2026-08-24改訂・本人指示】先頭（＝LOVE）以外は、イコノイジョイチャンネルの
      // 「再生リスト」タブを開いたときの既定の並び順（新しい順）に合わせている。
      // 部活動・企画系の再生リストは、本人（ファンとして把握している情報）から共有された
      // 出演メンバーを紹介文に明記している。
      playlists: [
        {
          name: "＝LOVE",
          description: "3グループ合同チャンネルの中から、＝LOVEメンバーが登場する動画をまとめた再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqG5bhMvLKzqIALxiGjZZHhg",
        },
        {
          name: "「イコノイジョイがやってやんよ！」",
          description: "＝LOVE・≠ME・≒JOYの3グループ合同企画に挑戦する様子が見られる再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqEatHE36i7t4W3YZexLIk8P",
        },
        {
          name: "イコラブハンバーガー部",
          description: "髙松瞳・瀧脇笙古が色々なハンバーガーを食べ歩く企画の再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqG9lNpB1B5UoIMQ9zxrSo74",
        },
        {
          name: "はしご酒",
          description: "諸橋沙夏がお店をはしごする企画の再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqEQ5dXpujGY9qLtH0M7X1WP",
        },
        {
          // 本人が「サンドの飯より＝LOVE」と伝えていた再生リストだが、実際の正式名称は
          // 「三度の飯より=LOVE」だったため、確認できた正式名称をそのまま採用している。
          name: "三度の飯より＝LOVE",
          description: "メンバーが食事を楽しむ様子が見られる企画の再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqGNuJLYgGB7VsWi5cTUCusL",
        },
        {
          name: "ゲーム実況",
          description:
            "部長：野口衣織、副部長：齋藤樹愛羅（Kiara）が務める「イコラブゲーム部」の活動を中心に、メンバーが様々なゲームで盛り上がる様子を楽しめる再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqEcPq3AzuL4Loh2FegF_tSc",
        },
        {
          // 本人が想定していたテーマ名には該当が無かったURLだが、実際に確認できた正式名称
          // 「ドッキリ」をそのまま採用している。
          name: "ドッキリ",
          description: "メンバーにドッキリを仕掛ける企画の再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqHjzjCH_n3677W1vJtJg61y",
        },
        {
          // 本人が「Oシリーズ」と伝えていた再生リストだが、実際の正式名称は「王シリーズ」
          // だったため、確認できた正式名称をそのまま採用している。
          name: "王シリーズ",
          description: "メンバー同士で色々な「王」を決める企画の再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqGTBthvwf8NmKdO6RqhlqD1",
        },
        {
          // 本人指示（2026-08-24追加）：部長が髙松瞳であることを紹介文に明記。URLは本人からの
          // 直接指定ではなく、再生リスト名から本人が言及した「イコラブボートレース部」に該当する
          // ものを本人からのYouTubeチャンネル情報をもとに確認して特定した。
          name: "ボートレース部",
          description: "部長：髙松瞳が務める「イコラブボートレース部」の活動を楽しめる再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqH5MDFjEHZXblGycslwnzFU",
        },
        {
          // 本人が想定していたテーマ名には該当が無かったURLだが、実際に確認できた正式名称
          // 「イコラブふたり旅」をそのまま採用している。
          name: "イコラブふたり旅",
          description: "＝LOVEメンバー2人が旅をする企画の再生リスト。",
          url: "https://www.youtube.com/playlist?list=PL4CXxHAJyaqEvS2eUZzRV3i0NNt7ZbN6h",
        },
      ],
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
