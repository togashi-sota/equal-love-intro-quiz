// 指原莉乃プロデュースの姉妹グループ（＝LOVE以外の2グループ）を紹介するための最小限のデータ。
// メンバー一覧・SNS一覧・楽曲一覧などは今回は対象外とし、グループ名・一言紹介・公式リンクのみを持たせる
// （2026-08-06新設、本人指示：指原莉乃プロデューサー欄の近くに姉妹グループ紹介を追加）。
//
// description（一言紹介）は、各グループの公式サイト「ABOUT」ページを確認したうえで
// 自分たちの言葉でまとめた要約であり、公式サイトの文章をそのまま転載したものではない
// （js/data/groupInfo.jsの方針を踏襲）。
export const SISTER_GROUPS = [
  {
    id: "not-equal-me",
    name: "≠ME",
    reading: "ノットイコールミー",
    description:
      "指原莉乃が＝LOVEに続いてプロデュースする2番目のグループ。2019年2月24日にグループ名が発表され、2021年4月にメジャーデビューした。",
    // 【2026-08-23追加】2020年7月25日、無観客ライブ「次に会えた時 何を話そうかな」の中で
    // 蟹沢萌子のリーダー就任が発表された（Wikipedia「蟹沢萌子」、出典：音楽ナタリー）。
    leader: "蟹沢萌子",
    officialLinks: {
      website: "https://not-equal-me.jp/",
      youtube: "https://www.youtube.com/channel/UCBmvHfXdGCvi_b6lFeU-E1Q",
    },
    sourceType: "official",
    sourceUrls: ["https://not-equal-me.jp/feature/about", "https://ja.wikipedia.org/wiki/蟹沢萌子"],
    lastVerifiedDate: "2026-08-23",
  },
  {
    id: "nearly-equal-joy",
    name: "≒JOY",
    reading: "ニアリーイコールジョイ",
    description:
      "指原莉乃が代々木アニメーション学院とタッグを組んでプロデュースする3番目のグループ。2022年3月29日にグループ名が発表された。",
    // 【2026-08-23追加】2023年9月3日、「≒JOY 1stコンサート」にて小澤愛実のリーダー就任が
    // 発表された（RealSound、Wikipedia「小澤愛実」出典：BARKS）。
    leader: "小澤愛実",
    officialLinks: {
      website: "https://nearly-equal-joy.jp/",
      youtube: "https://www.youtube.com/@nearlyequaljoy5843",
    },
    sourceType: "reliable",
    sourceUrls: [
      "https://nearly-equal-joy.jp/feature/about",
      "https://realsound.jp/2023/09/post-1430690_2.html",
      "https://ja.wikipedia.org/wiki/小澤愛実",
    ],
    lastVerifiedDate: "2026-08-23",
  },
];
