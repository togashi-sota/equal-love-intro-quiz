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
    officialLinks: {
      website: "https://not-equal-me.jp/",
      youtube: "https://www.youtube.com/channel/UCBmvHfXdGCvi_b6lFeU-E1Q",
    },
    sourceType: "official",
    sourceUrls: ["https://not-equal-me.jp/feature/about"],
    lastVerifiedDate: "2026-08-06",
  },
  {
    id: "nearly-equal-joy",
    name: "≒JOY",
    reading: "ニアリーイコールジョイ",
    description:
      "指原莉乃が代々木アニメーション学院とタッグを組んでプロデュースする3番目のグループ。2022年3月29日にグループ名が発表された。",
    officialLinks: {
      website: "https://nearly-equal-joy.jp/",
      youtube: "https://www.youtube.com/@nearlyequaljoy5843",
    },
    sourceType: "official",
    sourceUrls: ["https://nearly-equal-joy.jp/feature/about"],
    lastVerifiedDate: "2026-08-06",
  },
];
