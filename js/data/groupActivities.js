// ＝LOVE全体（メンバー個人ではなくグループ全体）の冠テレビ・ラジオ番組を保持する
// データファイル。メンバー1〜数名の個人的な活動はjs/data/memberActivities.jsに登録する
// （2026-08-03新設。「＝LOVEのイコラフ」がメンバー個人ページに誤って登録されていたのを機に分離）。
//
// ACTIVITY_TYPE・ACTIVITY_STATUSはmemberActivities.jsのものをそのまま使う（個人・グループで
// 種別/現況の考え方を分ける必要がないため）。

import { ACTIVITY_TYPE, ACTIVITY_STATUS } from "./memberActivities.js";

export { ACTIVITY_TYPE, ACTIVITY_STATUS };

export const GROUP_ACTIVITIES = [
  {
    id: "group-radio-ikorafu",
    priority: 2,
    title: "R&D presents ＝LOVEのイコラフ",
    type: ACTIVITY_TYPE.RADIO,
    description: "ニッポン放送のグループ冠レギュラーラジオ番組（毎週月曜19:40〜20:00）。メンバーが週替わりでパーソナリティを務める。",
    url: "https://equal-love.jp/schedule/detail/5816",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2022-10-03",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/schedule/detail/5816", "https://www.thefirsttimes.jp/news/0000185183/"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "group-tv-kimi-motto",
    title: "キミはもっと＝LOVEを愛せるか!!!",
    type: ACTIVITY_TYPE.TV,
    description: "「キミは＝LOVEを愛せるか！！」のリニューアル版。フジテレビ（関東ローカル）で月2回放送し、直後にFODプレミアムで未公開映像付き版を独占配信。メンバー10人全員がMCを務める。",
    url: "https://equal-love.jp/news/detail/11633",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-07-06",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/11633"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "group-tv-kimi-ha-love",
    title: "キミは＝LOVEを愛せるか！！",
    type: ACTIVITY_TYPE.TV,
    description: "＝LOVE初の冠バラエティ。2020年にフジテレビTWOでパイロット放送後、2021年から月1回レギュラー化。2023年からは地上波（フジテレビ）でも放送していたが、約5年間の放送を経て2026年3月に終了した（最終回の正確な日付は未確認）。",
    url: "https://equal-love.jp/schedule/detail/6986",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2020-09-13",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/3266", "https://equal-love.jp/schedule/detail/6986"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "group-tv-kokkokko",
    title: "イコラブコッコッコー!!",
    type: ACTIVITY_TYPE.TV,
    description: "日本テレビの期間限定冠バラエティ。お笑いコンビ「相席スタート」がMC。2026年1月28日から全8週にわたり放送され、3月中旬ごろに終了。放送終了後、続編・レギュラー化の発表は確認できていない。",
    url: "https://equal-love.jp/news/detail/11092",
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2026-01-28",
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/11092"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "group-ikonoijoy-youtube",
    priority: 1,
    title: "イコラブ ノイミー ニアジョイ チャンネル（イコノイジョイ）",
    type: ACTIVITY_TYPE.YOUTUBE,
    description: "指原莉乃プロデュースの＝LOVE・≠ME・≒JOYの3グループによる企画動画やバラエティ企画などを公開している公式YouTubeチャンネル。",
    url: "https://www.youtube.com/@ikonoijoy",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: null,
    endDate: null,
    sourceType: "official",
    sourceUrls: ["https://www.youtube.com/@ikonoijoy"],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "group-ririmew-muse",
    title: "Ririmew ブランドミューズ",
    type: ACTIVITY_TYPE.OTHER,
    description: "指原莉乃プロデュースのコスメブランド「Ririmew」の「ブランドミューズ」に＝LOVE全体で就任（公式表記は「アンバサダー」ではなく「ブランドミューズ」）。",
    url: "https://prtimes.jp/main/html/rd/p/000000920.000025517.html",
    status: ACTIVITY_STATUS.ONGOING,
    startDate: "2026-07-03",
    endDate: null,
    sourceType: "official",
    sourceUrls: [
      "https://prtimes.jp/main/html/rd/p/000000920.000025517.html",
      "https://mdpr.jp/news/detail/4808104",
    ],
    lastVerifiedDate: "2026-08-03",
  },
  {
    id: "group-tv-love-cross-love",
    title: "＝LOVExLOVE（イコールラブクロスラブ）",
    type: ACTIVITY_TYPE.TV,
    description: "日本テレビの期間限定コラボ企画番組。毎週異なるアーティストとのコラボレーション企画を展開した（全6回）。",
    url: null,
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2024-03-19",
    endDate: "2024-04-23",
    sourceType: "reliable",
    sourceUrls: [],
    lastVerifiedDate: "2026-08-03",
  },
];
