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
    // 最終回の正確な日付は未確認だが、「2026年3月に終了」という情報を基に、並べ替え用の
    // 目安として月初日を仮置きしている（表示には使われない）。
    endDate: "2026-03-01",
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
    // 「3月中旬ごろに終了」という情報を基に、並べ替え用の目安として仮置きしている
    // （表示には使われない）。
    endDate: "2026-03-15",
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
    // 2020年5月に＝LOVE・≠MEの2グループ合同チャンネルとして開設。≒JOYは2022年3月結成のため、
    // 3グループ体制（現チャンネル名）への移行時期は未確認（開設月のみ、日までは未確認）。
    startDate: "2020-05-01",
    endDate: null,
    sourceType: "reliable",
    sourceUrls: ["https://www.youtube.com/@ikonoijoy", "https://www.cyberagent-adagency.com/news/648/"],
    lastVerifiedDate: "2026-08-23",
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
    id: "group-cm-mynumber-card",
    title: "政府広報「まだまだマイナー？マイナカード」CM",
    type: ACTIVITY_TYPE.TV,
    description: "内閣府大臣官房政府広報室（デジタル庁も連携）によるマイナンバーカード利用促進キャンペーンのオリジナルソング・CM。＝LOVE全員とマイナンバーPRキャラクター「マイナちゃん」が出演し、＝LOVEにとってグループ初のテレビCMとなった。作詞：服部隆幸、作曲：小池竜暉・菊池博人、編曲：菊池博人、振付：槙田紗子（政府広報オンライン公式YouTubeのPV概要欄で確認）。",
    url: null,
    links: [
      { label: "PVを見る", url: "https://www.youtube.com/watch?v=93iIH0_e1QM", sourceType: "official" },
      { label: "特設サイトを見る", url: "https://www.gov-online.go.jp/tokusyu/mynumber/", sourceType: "official" },
    ],
    status: ACTIVITY_STATUS.PAST,
    startDate: "2026-03-02",
    endDate: "2026-03-02",
    sourceType: "official",
    sourceUrls: [
      "https://www.gov-online.go.jp/tokusyu/mynumber/",
      "https://equal-love.jp/news/detail/11249",
      "https://www.youtube.com/watch?v=93iIH0_e1QM",
      "https://www.oricon.co.jp/news/2439020/full/",
    ],
    lastVerifiedDate: "2026-08-23",
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
  {
    // 【2026-08-23追加】＝LOVE初期を代表するSHOWROOMレギュラー番組。「みがく・超える・学ぶ」の
    // 3テーマという説明はequal-love.jp本体・信頼できるメディアいずれでも文言レベルの確認が
    // 取れなかったため、description本文には含めていない（確認できた「成長見守りバラエティ」
    // という位置づけのみ記載）。かつての配信URL（SHOWROOM）は現在別番組のページとして
    // 再利用されており、この番組専用のリンクとしては使えないため、リンクは付けていない。
    id: "group-showroom-daitokkun",
    title: "イコラブ大特訓中！",
    type: ACTIVITY_TYPE.SHOWROOM,
    description:
      "＝LOVEのデビュー初期を代表するレギュラー番組。2017年9月25日からSHOWROOMで配信され、MCはアンタッチャブルの柴田英嗣が担当した。デビューしたばかりのメンバーが様々な企画や課題に挑戦する「成長見守りバラエティ」。現在の＝LOVEへと成長していく初期メンバーの姿を見ることができる、グループの歴史を知るうえでも重要な番組の一つ。",
    url: null,
    status: ACTIVITY_STATUS.ENDED,
    startDate: "2017-09-25",
    endDate: null,
    sourceType: "reliable",
    sourceUrls: [
      "https://prtimes.jp/main/html/rd/p/000000017.000027285.html",
      "https://natalie.mu/music/news/249828",
      "https://equal-love.jp/schedule/detail/581",
    ],
    lastVerifiedDate: "2026-08-23",
  },
];
