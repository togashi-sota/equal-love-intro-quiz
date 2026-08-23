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
