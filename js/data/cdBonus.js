// CD・特典映像図鑑のデータ（2026-11-02新設。js/cdBonusModel.js・js/cdBonusScreen.js が使う）。
//
// 【元にした情報（2026-11-02 に確認）】
//   ・＝LOVE 公式サイト DISCOGRAPHY の各 TYPE のページ（https://equal-love.jp/discography/detail/<番号>/）… 主な出典
//   ・ソニーミュージックの商品ページ（https://www.sonymusic.co.jp/artist/equal-love/discography/<品番>）… 照らし合わせ
//   1st〜21st シングルとアルバム「全部、内緒。」の全 TYPE（96）。公式の表記をそのまま写し、言い換えていない。
//   調べ方・食い違いの一覧は renewal-notes/r10-cd.md（git の対象外）。作り直すときは同じ手順で公式のページを読む。
//
// 【持たないもの】
//   ・ジャケットの画像：権利者の利用の許可が確かめられないため、画像の URL も含めて持たない（画面では TYPE 名と色の札で表す）。
//     入れ物（types[].jacket）だけは用意してある（2026-11-03 本人の決定）
//   ・価格：税率の変更などで変わるため持たない（公式のページで確かめてもらう）
//   ・作品の番号・作品名・発売日は js/data/songs.js（workId）と同じ値（tests/cdBonus.test.js で食い違いが無いか確かめる）
//
// 【項目】
//   types[].format       … 公式の題名の [ ] の中の形（CD+DVD／CD+Blu-ray／CD のみ）
//   types[].edition      … 初回仕様限定盤・通常盤など。公式（editionSource: "official"）かソニー（"sony"）に書いてあるものだけ。書いていなければ null
//   types[].jacket       … ジャケットの画像の入れ物（2026-11-03 本人の決定：今は全部 null＝画像なし。画面は TYPE の色の札を出す）。
//                          将来、公式が許す表示の方法が見つかったときだけ、次の形で入れる：
//                          { imageUrl, sourceUrl（画像のある公式のページ）, terms（利用条件の要約）, termsUrl（利用条件のページ）, checkedAt }
//                          terms と termsUrl が無いものは画面に出さない（js/cdBonusModel.js の canShowCdBonusJacket）
//   types[].check        … "both"＝公式サイトとソニーの両方で確かめた／"official"＝公式サイトだけ（ソニーのページに記載が無い）
//   types[].notes        … 公式どうし・ソニーとの食い違いと、どちらを採ったか
//   types[].tracks       … CD の曲順。songId は js/data/songs.js の曲。artist は ≠ME・≒JOY の曲（公式の表記に名義があるものだけ）
//   types[].insertsHeading・inserts … 封入特典（公式の見出しと項目。公式の文のまま）
//   types[].videos       … DVD／Blu-ray の中身を、公式の記載の1行ずつ1件にしたもの
//     categories … 分類（CD_BONUS_CATEGORIES の id。公式の題名から分かる範囲だけ。最初が主な分類）
//     keywords   … 全体検索・図鑑の検索で「言葉ぴったり」で当たる関連の言葉。公式の題名に出てくる言葉だけ（地名・企画名など）。
//                  例：富士急ハイランドの映像には「富士急」は付くが「富士山」は付かない（公式に書いていないので）
//     group      … 1枚の Blu-ray の中の見出し（『キミは＝LOVEを愛せるか!!!』・富士急のライブなど）
//     songId     … その曲の MV・メイキング・パフォーマンス・ライブのときの曲（題名に曲名があるものだけ）
//     memberIds・membersBasis … 題名に名前（愛称）が出てくるときだけ、そのメンバーと根拠
//     series     … 前編・後編など、TYPE をまたいで続く映像のまとまり（CD_BONUS_SERIES）
//     alsoOn     … 再収録・同じ映像の別の入れ物。match："stated"＝公式に再収録と書いてある／"sameTitle"＝公式の題名が同じ MV／
//                  "unverified"＝同じ曲の MV メイキングだが、同じ映像かは公式に書いていない
//
// 【新しいシングルを足すとき】公式サイトの各 TYPE のページを見て、CD_BONUS_WORKS の最後に1作を足す。
//   映像は1行1件。分類・関連の言葉は公式の題名にある言葉だけにする。tests/cdBonus.test.js が形と songs.js との一致を確かめる。

export const CD_BONUS_CHECKED_AT = "2026-11-02";

// 映像の分類（「特典映像から探す」の並び順。2026-11-03 本人の決定で作り直し：名前だけで中身が分かるように）
//   1本に複数の分類が付くことがある（例：『キミは＝LOVEを愛せるか!!!』のパフォーマンス＝ライブ・パフォーマンス＋テレビ番組）。
//   lead は画面に出す短い説明。分類は公式の題名から分かる範囲だけで付ける（題名は変えない）
export const CD_BONUS_CATEGORIES = [
  { id: "trip", label: "ロケ・旅行", lead: "社員旅行・旅行記・キャンプ・登山・河口湖など、外へ出かけた映像" },
  { id: "variety", label: "ゲーム・企画", lead: "人狼ゲーム・鬼ごっこなどの社員研修、運動会・チャレンジ・最強ペア決定戦などの企画" },
  { id: "making", label: "メイキング", lead: "MV などの撮影の裏側" },
  { id: "live", label: "ライブ・パフォーマンス", lead: "富士急ハイランドのライブ・番組のライブ／パフォーマンス・ソロコンサート" },
  { id: "tv", label: "テレビ番組", lead: "『キミは＝LOVEを愛せるか!!!』の放送のダイジェストと番組の歌、TVアニメのオープニング映像" },
  { id: "event", label: "イベント", lead: "イコノイジョイ大感謝祭の映像" },
  { id: "mv", label: "MV", lead: "ミュージックビデオ（≠ME・≒JOY の MV を含む）" },
  { id: "other", label: "その他", lead: "ドキュメンタリーの総集編・メンバーひとりずつの「○○の制服クリスマス」など、公式の題名だけでは分けられない映像" },
];

// TYPE をまたいで続く映像のまとまり（名前は画面の「続きの映像」に出す）
export const CD_BONUS_SERIES = {
  "jinro": "イコラブ社員研修 人狼ゲーム（Ⅰ・Ⅱ）",
  "onigokko": "イコラブ社員研修 鬼ごっこ（激走編・対決編）",
  "eleven-house": "イコラブ社員研修 イレブンHOUSE（前編・後編）",
  "okinawa": "イコラブ社員旅行 in 沖縄（DAY-1・DAY-2）",
  "hokkaido": "イコラブ社員旅行 in 北海道（前編・後編）",
  "noryo": "イコラブ社員旅行 夏先取り！納涼（流しそうめん編・屋形船party編）",
  "hiroshima": "イコラブ社員旅行 広島満喫ツアー（前編・後編）",
  "saitama": "イコラブ社員旅行 in 埼玉（川越・西武園）",
  "houston": "イコラブ社員旅行 in ヒューストン（前編・後編）",
  "kawaguchiko": "イコラブ最強ペア決定戦 in 河口湖（前編・後編）",
  "tokyo-premium": "樹愛羅presents 東京プレミアムツアー（前編・後編）",
  "kagai": "＝LOVE / ≠ME 夏の課外研修",
  "kanshasai2023": "イコノイジョイ大感謝祭（ラストノートしか知らない Type-B・C・D）",
  "kimilove": "『キミは＝LOVEを愛せるか!!!』（Type-D の Blu-ray）",
  "fujiq": "8th ANNIVERSARY PREMIUM TOUR 山梨県＠富士急ハイランドコニファーフォレスト",
};

// 図鑑の対象の外だが、特典映像の再収録先として結びつける作品（公式サイトのページで中身を確かめたものだけ）
export const CD_BONUS_OTHER_RELEASES = {
  "mv-kakosaijo-kyun": {
    title: "Music Video集「過去最上キュン」",
    releaseDate: "2023-01-25",
    officialUrl: "https://equal-love.jp/discography/detail/74/",
    // 公式の説明：「1stアルバム、9thシングル～12thシングルに収録されている特典映像をBlu-rayの高画質でお届け！」（完全生産限定盤）
    editions: [
      { name: "完全生産限定盤", format: "Blu-ray 5枚組", catalog: "VVXL-120〜124", content: "MV 全50曲・MV メイキング 13本・特典映像 9本" },
      { name: "通常盤", format: "Blu-ray", catalog: "VVXL-125", content: "MV 全50曲" },
      { name: "通常盤", format: "DVD 2枚組", catalog: "VVBL-176〜177", content: "MV 全50曲" },
    ],
  },
};

export const CD_BONUS_WORKS = [
  {
    workId: "single-01", number: 1, kind: "single", title: "＝LOVE", releaseDate: "2017-09-06",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1108〜1109",
        officialUrl: "https://equal-love.jp/discography/detail/1/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1108", check: "both", jacket: null,
        notes: ["生写真の種類の数：公式サイトは「全24種のうち1種」、ソニーは「Type-A（12種）のうち1種」"],
        tracks: [
          { title: "＝LOVE", songId: "love" },
          { title: "記憶のどこかで", songId: "kioku-no-dokoka-de" },
          { title: "＝LOVE instrumental", songId: "love", instrumental: true },
          { title: "記憶のどこかで instrumental", songId: "kioku-no-dokoka-de", instrumental: true },
        ],
        insertsHeading: "【初回限定仕様】", inserts: ["＝LOVEメンバー生写真1枚（全24種のうち1種ランダム封入）", "全国イベント参加券 or スペシャルプレゼント応募券1枚"],
        disc: "DVD",
        videos: [
          { id: "single-01-A-1", title: "＝LOVE Music Video", categories: ["mv"], songId: "love", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 2曲目", match: "sameTitle"}, {videoId: "album-01-A-2", match: "sameTitle"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1110〜1111",
        officialUrl: "https://equal-love.jp/discography/detail/2/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1110", check: "both", jacket: null,
        notes: ["生写真の種類の数：公式サイトは「全24種のうち1種」、ソニーは「Type-B（12種）のうち1種」"],
        tracks: [
          { title: "＝LOVE", songId: "love" },
          { title: "スタート！", songId: "start" },
          { title: "＝LOVE instrumental", songId: "love", instrumental: true },
          { title: "スタート！ instrumental", songId: "start", instrumental: true },
        ],
        insertsHeading: "【初回限定仕様】", inserts: ["＝LOVEメンバー生写真1枚（全24種のうち1種ランダム封入）", "全国イベント参加券 or スペシャルプレゼント応募券1枚"],
        disc: "DVD",
        videos: [
          { id: "single-01-B-1", title: "＝LOVE メイキング映像", categories: ["making"], songId: "love", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 2（MV メイキング）の 1本目", match: "unverified"}] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-1112",
        officialUrl: "https://equal-love.jp/discography/detail/3/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1112", check: "both", jacket: null,
        tracks: [
          { title: "＝LOVE", songId: "love" },
          { title: "記憶のどこかで", songId: "kioku-no-dokoka-de" },
          { title: "スタート！", songId: "start" },
          { title: "＝LOVE instrumental", songId: "love", instrumental: true },
          { title: "記憶のどこかで instrumental", songId: "kioku-no-dokoka-de", instrumental: true },
          { title: "スタート！ instrumental", songId: "start", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-02", number: 2, kind: "single", title: "僕らの制服クリスマス", releaseDate: "2017-12-06",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1135〜1136",
        officialUrl: "https://equal-love.jp/discography/detail/4/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1135", check: "both", jacket: null,
        tracks: [
          { title: "僕らの制服クリスマス", songId: "bokura-no-seifuku-christmas" },
          { title: "ようこそ！イコラブ沼", songId: "youkoso-ikorabu-numa" },
          { title: "僕らの制服クリスマス(instrumental)", songId: "bokura-no-seifuku-christmas", instrumental: true },
          { title: "ようこそ！イコラブ沼(instrumental)", songId: "youkoso-ikorabu-numa", instrumental: true },
        ],
        insertsHeading: "【初回限定仕様】", inserts: ["全国イベント参加券 or スペシャルプレゼント応募券+生写真封入"],
        disc: "DVD",
        videos: [
          { id: "single-02-A-1", title: "僕らの制服クリスマス", categories: ["mv"], songId: "bokura-no-seifuku-christmas", note: "公式の表記は曲名だけ（次の行がその曲のメイキング映像）", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 5曲目", match: "sameTitle"}, {videoId: "album-01-A-3", match: "sameTitle"}] },
          { id: "single-02-A-2", title: "僕らの制服クリスマス メイキング映像", categories: ["making"], songId: "bokura-no-seifuku-christmas", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 2（MV メイキング）の 2本目", match: "unverified"}] },
          { id: "single-02-A-3", title: "はなの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["oba-hana"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-A-4", title: "きあらの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["saito-kiara"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-A-5", title: "いおりの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["noguchi-iori"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-A-6", title: "まいかの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["sasaki-maika"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-A-7", title: "ひとみの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["takamatsu-hitomi"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-A-8", title: "さなの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["morohashi-sana"], membersBasis: "題名の名前（ひらがな）" },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1137〜1138",
        officialUrl: "https://equal-love.jp/discography/detail/5/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1137", check: "both", jacket: null,
        tracks: [
          { title: "僕らの制服クリスマス", songId: "bokura-no-seifuku-christmas" },
          { title: "届いてLOVE YOU♡", songId: "todoite-love-you" },
          { title: "僕らの制服クリスマス(instrumental)", songId: "bokura-no-seifuku-christmas", instrumental: true },
          { title: "届いてLOVE YOU♡(instrumental)", songId: "todoite-love-you", instrumental: true },
        ],
        insertsHeading: "【初回限定仕様】", inserts: ["全国イベント参加券 or スペシャルプレゼント応募券+生写真封入"],
        disc: "DVD",
        videos: [
          { id: "single-02-B-1", title: "届いてLOVE YOU♡", categories: ["mv"], songId: "todoite-love-you", note: "公式の表記は曲名だけ（次の行がその曲のメイキング映像）", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 6曲目", match: "sameTitle"}] },
          { id: "single-02-B-2", title: "届いてLOVE YOU♡メイキング映像", categories: ["making"], songId: "todoite-love-you" },
          { id: "single-02-B-3", title: "りさの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["otoshima-risa"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-B-4", title: "あんなの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["yamamoto-anna"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-B-5", title: "しょうこの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["takiwaki-shoko"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-B-6", title: "のんのの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["satake-nonno"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-B-7", title: "えみりの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["otani-emiri"], membersBasis: "題名の名前（ひらがな）" },
          { id: "single-02-B-8", title: "なぎさの制服クリスマス", categories: ["other"], keywords: ["制服クリスマス"], memberIds: ["saito-nagisa"], membersBasis: "題名の名前（ひらがな）" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-1139",
        officialUrl: "https://equal-love.jp/discography/detail/6/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1139", check: "both", jacket: null,
        tracks: [
          { title: "僕らの制服クリスマス", songId: "bokura-no-seifuku-christmas" },
          { title: "届いてLOVE YOU♡", songId: "todoite-love-you" },
          { title: "ようこそ！イコラブ沼", songId: "youkoso-ikorabu-numa" },
          { title: "僕らの制服クリスマス(instrumental)", songId: "bokura-no-seifuku-christmas", instrumental: true },
          { title: "届いてLOVE YOU♡(instrumental)", songId: "todoite-love-you", instrumental: true },
          { title: "ようこそ！イコラブ沼(instrumental)", songId: "youkoso-ikorabu-numa", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-03", number: 3, kind: "single", title: "手遅れcaution", releaseDate: "2018-05-16",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1237〜1238",
        officialUrl: "https://equal-love.jp/discography/detail/7/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1237", check: "both", jacket: null,
        tracks: [
          { title: "手遅れcaution", songId: "teokure-caution" },
          { title: "「部活中に目が合うなって思ってたんだ」", songId: "bukatsuchu-ni-megaau-natte-omotteta-nda" },
          { title: "手遅れcaution (instrumental)", songId: "teokure-caution", instrumental: true },
          { title: "「部活中に目が合うなって思ってたんだ」(instrumental)", songId: "bukatsuchu-ni-megaau-natte-omotteta-nda", instrumental: true },
        ],
        insertsHeading: "【初回限定仕様】", inserts: ["＝LOVEメンバー生写真1枚 ランダム封入予定", "全国イベント参加券 or スペシャルプレゼント応募券1枚"],
        disc: "DVD",
        videos: [
          { id: "single-03-A-1", title: "手遅れcaution Music Video", categories: ["mv"], songId: "teokure-caution", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 8曲目", match: "sameTitle"}, {videoId: "album-01-A-4", match: "sameTitle"}] },
          { id: "single-03-A-2", title: "手遅れcaution Making Video", categories: ["making"], songId: "teokure-caution", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 2（MV メイキング）の 3本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1239〜1240",
        officialUrl: "https://equal-love.jp/discography/detail/8/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1239", check: "both", jacket: null,
        tracks: [
          { title: "手遅れcaution", songId: "teokure-caution" },
          { title: "樹愛羅、助けに来たぞ", songId: "kiara-tasuke-ni-kita-zo" },
          { title: "手遅れcaution (instrumental)", songId: "teokure-caution", instrumental: true },
          { title: "樹愛羅、助けに来たぞ(instrumental)", songId: "kiara-tasuke-ni-kita-zo", instrumental: true },
        ],
        insertsHeading: "【初回限定仕様】", inserts: ["＝LOVEメンバー生写真1枚 ランダム封入予定", "全国イベント参加券 or スペシャルプレゼント応募券1枚"],
        disc: "DVD",
        videos: [
          { id: "single-03-B-1", title: "『Documentary of ＝LOVE』総集編", categories: ["other"], keywords: ["Documentary of ＝LOVE", "総集編"] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-1241",
        officialUrl: "https://equal-love.jp/discography/detail/9/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1241", check: "both", jacket: null,
        tracks: [
          { title: "手遅れcaution", songId: "teokure-caution" },
          { title: "「部活中に目が合うなって思ってたんだ」", songId: "bukatsuchu-ni-megaau-natte-omotteta-nda" },
          { title: "樹愛羅、助けに来たぞ", songId: "kiara-tasuke-ni-kita-zo" },
          { title: "手遅れcaution (instrumental)", songId: "teokure-caution", instrumental: true },
          { title: "「部活中に目が合うなって思ってたんだ」(instrumental)", songId: "bukatsuchu-ni-megaau-natte-omotteta-nda", instrumental: true },
          { title: "樹愛羅、助けに来たぞ(instrumental)", songId: "kiara-tasuke-ni-kita-zo", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-04", number: 4, kind: "single", title: "Want you！Want you！", releaseDate: "2018-10-17",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1300〜1301",
        officialUrl: "https://equal-love.jp/discography/detail/10/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1300", check: "both", jacket: null,
        tracks: [
          { title: "Want you！Want you！", songId: "want-you-want-you" },
          { title: "今、この船に乗れ！", songId: "ima-kono-fune-ni-nore" },
          { title: "Want you！Want you！ (instrumental)", songId: "want-you-want-you", instrumental: true },
          { title: "今、この船に乗れ！ (instrumental)", songId: "ima-kono-fune-ni-nore", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["全国イベント参加券兼応募券", "生写真封入"],
        disc: "DVD",
        videos: [
          { id: "single-04-A-1", title: "Want you！Want you！ Music Video", categories: ["mv"], songId: "want-you-want-you", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 11曲目", match: "sameTitle"}, {videoId: "album-01-A-5", match: "sameTitle"}] },
          { id: "single-04-A-2", title: "Want you！Want you！ Making Video", categories: ["making"], songId: "want-you-want-you", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 2（MV メイキング）の 4本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1302〜1303",
        officialUrl: "https://equal-love.jp/discography/detail/11/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1302", check: "both", jacket: null,
        tracks: [
          { title: "Want you！Want you！", songId: "want-you-want-you" },
          { title: "アイカツハッピーエンド", songId: "aikatsu-happy-end" },
          { title: "Want you！Want you！ (instrumental)", songId: "want-you-want-you", instrumental: true },
          { title: "アイカツハッピーエンド(instrumental)", songId: "aikatsu-happy-end", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["全国イベント参加券兼応募券", "生写真封入"],
        disc: "DVD",
        videos: [
          { id: "single-04-B-1", title: "イコラブ おフランス旅行記", categories: ["trip"], keywords: ["フランス", "旅行記"] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-1304",
        officialUrl: "https://equal-love.jp/discography/detail/12/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1304", check: "both", jacket: null,
        tracks: [
          { title: "Want you！Want you！", songId: "want-you-want-you" },
          { title: "今、この船に乗れ！", songId: "ima-kono-fune-ni-nore" },
          { title: "アイカツハッピーエンド", songId: "aikatsu-happy-end" },
          { title: "Want you！Want you！ (instrumental)", songId: "want-you-want-you", instrumental: true },
          { title: "今、この船に乗れ！ (instrumental)", songId: "ima-kono-fune-ni-nore", instrumental: true },
          { title: "アイカツハッピーエンド(instrumental)", songId: "aikatsu-happy-end", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-05", number: 5, kind: "single", title: "探せ ダイヤモンドリリー", releaseDate: "2019-04-24",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1435〜1436",
        officialUrl: "https://equal-love.jp/discography/detail/13/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1435", check: "both", jacket: null,
        tracks: [
          { title: "探せ ダイヤモンドリリー", songId: "sagase-diamond-lily" },
          { title: "いらない ツインテール", songId: "iranai-twintail" },
          { title: "探せ ダイヤモンドリリー (instrumental)", songId: "sagase-diamond-lily", instrumental: true },
          { title: "いらない ツインテール (instrumental)", songId: "iranai-twintail", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["＝LOVEメンバー生写真1枚 ランダム封入予定＆全国イベント参加券 or スペシャルプレゼント応募券1枚"],
        disc: "DVD",
        videos: [
          { id: "single-05-A-1", title: "探せ ダイヤモンドリリー Music Video", categories: ["mv"], songId: "sagase-diamond-lily", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 14曲目", match: "sameTitle"}, {videoId: "album-01-A-6", match: "sameTitle"}] },
          { id: "single-05-A-2", title: "Making of 探せ ダイヤモンドリリー ～探せ!! イコラブ探検隊～", categories: ["making"], keywords: ["探検隊"], songId: "sagase-diamond-lily", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 2（MV メイキング）の 5本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1437〜1438",
        officialUrl: "https://equal-love.jp/discography/detail/14/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1437", check: "both", jacket: null,
        tracks: [
          { title: "探せ ダイヤモンドリリー", songId: "sagase-diamond-lily" },
          { title: "虹の素", songId: "niji-no-moto" },
          { title: "探せ ダイヤモンドリリー (instrumental)", songId: "sagase-diamond-lily", instrumental: true },
          { title: "虹の素 (instrumental)", songId: "niji-no-moto", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["＝LOVEメンバー生写真1枚 ランダム封入予定＆全国イベント参加券 or スペシャルプレゼント応募券1枚"],
        disc: "DVD",
        videos: [
          { id: "single-05-B-1", title: "イコラブ社員旅行2019 ～三浦半島・鎌倉篇～", categories: ["trip"], keywords: ["三浦半島", "鎌倉", "社員旅行"] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-1439",
        officialUrl: "https://equal-love.jp/discography/detail/15/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1439", check: "both", jacket: null,
        tracks: [
          { title: "探せ ダイヤモンドリリー", songId: "sagase-diamond-lily" },
          { title: "いらない ツインテール", songId: "iranai-twintail" },
          { title: "虹の素", songId: "niji-no-moto" },
          { title: "探せ ダイヤモンドリリー (instrumental)", songId: "sagase-diamond-lily", instrumental: true },
          { title: "いらない ツインテール (instrumental)", songId: "iranai-twintail", instrumental: true },
          { title: "虹の素 (instrumental)", songId: "niji-no-moto", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-06", number: 6, kind: "single", title: "ズルいよ ズルいね", releaseDate: "2019-10-30",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1560〜1561",
        officialUrl: "https://equal-love.jp/discography/detail/16/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1560", check: "both", jacket: null,
        tracks: [
          { title: "ズルいよ ズルいね", songId: "zurui-yo-zurui-ne" },
          { title: "Sweetest girl（＝LOVE）", songId: "sweetest-girl" },
          { title: "ズルいよ ズルいね instrumental", songId: "zurui-yo-zurui-ne", instrumental: true },
          { title: "Sweetest girl instrumental", songId: "sweetest-girl", instrumental: true },
        ],
        insertsHeading: "《封入特典》", inserts: ["＝LOVE生写真1枚ランダム封入", "全握参加券兼スペシャルプレゼント応募券"],
        disc: "DVD",
        videos: [
          { id: "single-06-A-1", title: "ズルいよ ズルいね Music Video", categories: ["mv"], songId: "zurui-yo-zurui-ne", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 17曲目", match: "sameTitle"}, {videoId: "album-01-A-7", match: "sameTitle"}] },
          { id: "single-06-A-2", title: "ズルいよ ズルいね メイキング映像", categories: ["making"], songId: "zurui-yo-zurui-ne", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 2（MV メイキング）の 6本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1562〜1563",
        officialUrl: "https://equal-love.jp/discography/detail/17/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1562", check: "both", jacket: null,
        tracks: [
          { title: "ズルいよ ズルいね", songId: "zurui-yo-zurui-ne" },
          { title: "推しのいる世界（＝LOVE）", songId: "oshi-no-iru-sekai" },
          { title: "ズルいよ ズルいね instrumental", songId: "zurui-yo-zurui-ne", instrumental: true },
          { title: "推しのいる世界 instrumental", songId: "oshi-no-iru-sekai", instrumental: true },
        ],
        insertsHeading: "《封入特典》", inserts: ["＝LOVE生写真1枚ランダム封入", "全握参加券兼スペシャルプレゼント応募券"],
        disc: "DVD",
        videos: [
          { id: "single-06-B-1", title: "＝LOVE×≠ME大運動会", categories: ["variety"], keywords: ["運動会", "大運動会", "≠ME"] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1564〜1565",
        officialUrl: "https://equal-love.jp/discography/detail/18/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1564", check: "both", jacket: null,
        tracks: [
          { title: "ズルいよ ズルいね", songId: "zurui-yo-zurui-ne" },
          { title: "「君の音だったんだ」（≠ME）", artist: "≠ME" },
          { title: "ズルいよ ズルいね instrumental", songId: "zurui-yo-zurui-ne", instrumental: true },
          { title: "「君の音だったんだ」instrumental", artist: "≠ME", instrumental: true },
        ],
        insertsHeading: "《封入特典》", inserts: ["≠ME生写真1枚ランダム封入", "≠MEアナザージャケット封入", "全握参加券兼スペシャルプレゼント応募券"],
        disc: "DVD",
        videos: [
          { id: "single-06-C-1", title: "「君の音だったんだ」 Music Video", categories: ["mv"], artist: "≠ME" },
          { id: "single-06-C-2", title: "「君の音だったんだ」メイキング映像", categories: ["making"], artist: "≠ME" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-1566",
        officialUrl: "https://equal-love.jp/discography/detail/19/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1566", check: "both", jacket: null,
        tracks: [
          { title: "ズルいよ ズルいね", songId: "zurui-yo-zurui-ne" },
          { title: "Sweetest girl（＝LOVE）", songId: "sweetest-girl" },
          { title: "推しのいる世界（＝LOVE）", songId: "oshi-no-iru-sekai" },
          { title: "「君の音だったんだ」（≠ME）", artist: "≠ME" },
          { title: "ズルいよ ズルいね instrumental", songId: "zurui-yo-zurui-ne", instrumental: true },
          { title: "Sweetest girl instrumental", songId: "sweetest-girl", instrumental: true },
          { title: "推しのいる世界 instrumental", songId: "oshi-no-iru-sekai", instrumental: true },
          { title: "「君の音だったんだ」instrumental", artist: "≠ME", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-07", number: 7, kind: "single", title: "CAMEO", releaseDate: "2020-07-08",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1650〜1651",
        officialUrl: "https://equal-love.jp/discography/detail/20/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1650", check: "both", jacket: null,
        notes: ["公式サイトの品番の表記は「VVCL-VVCL-1650～1651」（VVCL が重なっている）。ソニーの表記 VVCL-1650〜1651 を採用"],
        tracks: [
          { title: "CAMEO", songId: "cameo" },
          { title: "「君と私の歌」", songId: "kimi-to-watashi-no-uta" },
          { title: "CAMEO instrumental", songId: "cameo", instrumental: true },
          { title: "「君と私の歌」 instrumental", songId: "kimi-to-watashi-no-uta", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["全国イベント参加券兼応募券", "生写真封入"],
        disc: "DVD",
        videos: [
          { id: "single-07-A-1", title: "CAMEO Music Video", categories: ["mv"], songId: "cameo", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 20曲目", match: "sameTitle"}, {videoId: "album-01-A-8", match: "sameTitle"}] },
          { id: "single-07-A-2", title: "CAMEOメイキング映像", categories: ["making"], songId: "cameo", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 2（MV メイキング）の 7本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1652〜1653",
        officialUrl: "https://equal-love.jp/discography/detail/21/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1652", check: "both", jacket: null,
        tracks: [
          { title: "CAMEO", songId: "cameo" },
          { title: "My Voice Is For You", songId: "my-voice-is-for-you" },
          { title: "CAMEO instrumental", songId: "cameo", instrumental: true },
          { title: "My Voice Is For You instrumental", songId: "my-voice-is-for-you", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["全国イベント参加券兼応募券", "生写真封入"],
        disc: "DVD",
        videos: [
          { id: "single-07-B-1", title: "「イコラブ＆ノイミー社員旅行2020 in 雪山」", categories: ["trip"], keywords: ["雪山", "社員旅行", "ノイミー"] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1654〜1655",
        officialUrl: "https://equal-love.jp/discography/detail/22/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1654", check: "both", jacket: null,
        tracks: [
          { title: "CAMEO", songId: "cameo" },
          { title: "「君と僕の歌」（≠ME）", artist: "≠ME" },
          { title: "CAMEO instrumental", songId: "cameo", instrumental: true },
          { title: "「君と僕の歌」instrumental", artist: "≠ME", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["全国イベント参加券兼応募券", "生写真封入", "≠MEアナザージャケット封入"],
        disc: "DVD",
        videos: [
          { id: "single-07-C-1", title: "「君と僕の歌」 Music Video", categories: ["mv"], artist: "≠ME" },
          { id: "single-07-C-2", title: "「君と僕の歌」メイキング映像", categories: ["making"], artist: "≠ME" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-1656",
        officialUrl: "https://equal-love.jp/discography/detail/23/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1656", check: "both", jacket: null,
        tracks: [
          { title: "CAMEO", songId: "cameo" },
          { title: "「君と私の歌」", songId: "kimi-to-watashi-no-uta" },
          { title: "My Voice Is For You", songId: "my-voice-is-for-you" },
          { title: "「君と僕の歌」", artist: "≠ME" },
          { title: "CAMEO instrumental", songId: "cameo", instrumental: true },
          { title: "「君と私の歌」 instrumental", songId: "kimi-to-watashi-no-uta", instrumental: true },
          { title: "My Voice Is For You instrumental", songId: "my-voice-is-for-you", instrumental: true },
          { title: "「君と僕の歌」instrumental", artist: "≠ME", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-08", number: 8, kind: "single", title: "青春”サブリミナル”", releaseDate: "2020-11-25",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1780〜1781",
        officialUrl: "https://equal-love.jp/discography/detail/24/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1780", check: "both", jacket: null,
        tracks: [
          { title: "青春”サブリミナル”", songId: "seishun-subliminal" },
          { title: "しゅきぴ", songId: "shukipi" },
          { title: "青春”サブリミナル” instrumental", songId: "seishun-subliminal", instrumental: true },
          { title: "しゅきぴ instrumental", songId: "shukipi", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["スペシャルイベント・プレゼント応募券封入", "生写真封入"],
        disc: "DVD",
        videos: [
          { id: "single-08-A-1", title: "青春”サブリミナル” Music Video", categories: ["mv"], songId: "seishun-subliminal", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 23曲目", match: "sameTitle"}, {videoId: "album-01-A-9", match: "sameTitle"}] },
          { id: "single-08-A-2", title: "青春”サブリミナル”メイキング映像", categories: ["making"], songId: "seishun-subliminal", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 2（MV メイキング）の 8本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1782〜1783",
        officialUrl: "https://equal-love.jp/discography/detail/25/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1782", check: "both", jacket: null,
        notes: ["映像の題名：ソニーは「＝LOVEの夏キャンプ」「≠MEの赤岳登山」と表記"],
        tracks: [
          { title: "青春”サブリミナル”", songId: "seishun-subliminal" },
          { title: "流星群", songId: "ryuseigun" },
          { title: "青春”サブリミナル” instrumental", songId: "seishun-subliminal", instrumental: true },
          { title: "流星群 instrumental", songId: "ryuseigun", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["スペシャルイベント・プレゼント応募券封入", "生写真封入"],
        disc: "DVD",
        videos: [
          { id: "single-08-B-1", title: "イコラブの夏キャンプ（＝LOVE / ≠ME夏の課外研修）", categories: ["trip"], keywords: ["キャンプ", "夏キャンプ", "課外研修"], series: "kagai" },
          { id: "single-08-B-2", title: "ノイミーの赤岳登山（＝LOVE / ≠ME夏の課外研修）", categories: ["trip"], keywords: ["赤岳", "登山", "課外研修", "ノイミー", "≠ME"], artist: "≠ME", series: "kagai" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1784〜1785",
        officialUrl: "https://equal-love.jp/discography/detail/26/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1784", check: "both", jacket: null,
        tracks: [
          { title: "青春”サブリミナル”", songId: "seishun-subliminal" },
          { title: "P.I.C" },
          { title: "青春”サブリミナル” instrumental", songId: "seishun-subliminal", instrumental: true },
          { title: "P.I.C. instrumental", instrumental: true },
        ],
        insertsHeading: "【初回プレス特典】", inserts: ["スペシャルイベント・プレゼント応募券封入", "生写真封入", "≠MEアザージャケット封入"],
        disc: "DVD",
        videos: [
          { id: "single-08-C-1", title: "P.I.C. Music Video", categories: ["mv"] },
          { id: "single-08-C-2", title: "P.I.C. メイキング映像", categories: ["making"] },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-1786",
        officialUrl: "https://equal-love.jp/discography/detail/27/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1786", check: "both", jacket: null,
        tracks: [
          { title: "青春”サブリミナル”", songId: "seishun-subliminal" },
          { title: "しゅきぴ", songId: "shukipi" },
          { title: "流星群", songId: "ryuseigun" },
          { title: "P.I.C" },
          { title: "青春”サブリミナル” instrumental", songId: "seishun-subliminal", instrumental: true },
          { title: "しゅきぴ instrumental", songId: "shukipi", instrumental: true },
          { title: "流星群 instrumental", songId: "ryuseigun", instrumental: true },
          { title: "P.I.C. instrumental", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "album-01", number: 1, kind: "album", title: "全部、内緒。", releaseDate: "2021-05-12",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+Blu-ray", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1856〜1857",
        officialUrl: "https://equal-love.jp/discography/detail/31/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1856", check: "both", jacket: null,
        notes: ["ミュージックビデオ集の1曲目：ソニーは「Overture (1st album ver.)」と表記"],
        tracks: [
          { title: "Overture", songId: "overture" },
          { title: "桜の咲く音がした", songId: "sakura-no-saku-oto-ga-shita" },
          { title: "探せ ダイヤモンドリリー", songId: "sagase-diamond-lily" },
          { title: "Oh！Darling", songId: "oh-darling" },
          { title: "青春”サブリミナル”", songId: "seishun-subliminal" },
          { title: "セノビーインラブ", songId: "senobi-in-love" },
          { title: "CAMEO", songId: "cameo" },
          { title: "手遅れcaution", songId: "teokure-caution" },
          { title: "ズルいよ ズルいね", songId: "zurui-yo-zurui-ne" },
          { title: "現役アイドルちゅ～", songId: "genneki-idol-chu" },
          { title: "24/7", songId: "24-7" },
          { title: "お姉さんじゃダメですか？", songId: "oneesan-ja-dame-desuka" },
          { title: "Want you！Want you！", songId: "want-you-want-you" },
          { title: "cinema", songId: "cinema" },
          { title: "僕らの制服クリスマス", songId: "bokura-no-seifuku-christmas" },
          { title: "＝LOVE", songId: "love" },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A オリジナルフォトブック", "Type A 生写真1枚ランダム", "スペシャルプレゼント応募券"],
        disc: "Blu-ray",
        videos: [
          { id: "album-01-A-1", title: "Overture", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "overture", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 1曲目", match: "sameTitle"}] },
          { id: "album-01-A-2", title: "＝LOVE", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "love", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 2曲目", match: "sameTitle"}, {videoId: "single-01-A-1", match: "sameTitle"}] },
          { id: "album-01-A-3", title: "僕らの制服クリスマス", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "bokura-no-seifuku-christmas", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 5曲目", match: "sameTitle"}, {videoId: "single-02-A-1", match: "sameTitle"}] },
          { id: "album-01-A-4", title: "手遅れcaution", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "teokure-caution", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 8曲目", match: "sameTitle"}, {videoId: "single-03-A-1", match: "sameTitle"}] },
          { id: "album-01-A-5", title: "Want you！Want you！", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "want-you-want-you", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 11曲目", match: "sameTitle"}, {videoId: "single-04-A-1", match: "sameTitle"}] },
          { id: "album-01-A-6", title: "探せ ダイヤモンドリリー", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "sagase-diamond-lily", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 14曲目", match: "sameTitle"}, {videoId: "single-05-A-1", match: "sameTitle"}] },
          { id: "album-01-A-7", title: "ズルいよ ズルいね", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "zurui-yo-zurui-ne", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 17曲目", match: "sameTitle"}, {videoId: "single-06-A-1", match: "sameTitle"}] },
          { id: "album-01-A-8", title: "CAMEO", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "cameo", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 20曲目", match: "sameTitle"}, {videoId: "single-07-A-1", match: "sameTitle"}] },
          { id: "album-01-A-9", title: "青春”サブリミナル”", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "seishun-subliminal", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 23曲目", match: "sameTitle"}, {videoId: "single-08-A-1", match: "sameTitle"}] },
          { id: "album-01-A-10", title: "桜の咲く音がした", group: "=LOVE ミュージックビデオ集", categories: ["mv"], keywords: ["ミュージックビデオ集"], songId: "sakura-no-saku-oto-ga-shita", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 26曲目", match: "sameTitle"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+Blu-ray", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1858〜1859",
        officialUrl: "https://equal-love.jp/discography/detail/32/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1858", check: "both", jacket: null,
        tracks: [
          { title: "Overture", songId: "overture" },
          { title: "桜の咲く音がした", songId: "sakura-no-saku-oto-ga-shita" },
          { title: "探せ ダイヤモンドリリー", songId: "sagase-diamond-lily" },
          { title: "Oh！Darling", songId: "oh-darling" },
          { title: "青春”サブリミナル”", songId: "seishun-subliminal" },
          { title: "セノビーインラブ", songId: "senobi-in-love" },
          { title: "CAMEO", songId: "cameo" },
          { title: "手遅れcaution", songId: "teokure-caution" },
          { title: "ズルいよ ズルいね", songId: "zurui-yo-zurui-ne" },
          { title: "拝啓 貴方様", songId: "haikei-anata-sama" },
          { title: "24/7", songId: "24-7" },
          { title: "お姉さんじゃダメですか？", songId: "oneesan-ja-dame-desuka" },
          { title: "Want you！Want you！", songId: "want-you-want-you" },
          { title: "cinema", songId: "cinema" },
          { title: "僕らの制服クリスマス", songId: "bokura-no-seifuku-christmas" },
          { title: "＝LOVE", songId: "love" },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B オリジナルフォトブック", "Type B 生写真1枚ランダム", "スペシャルプレゼント応募券"],
        disc: "Blu-ray",
        videos: [
          { id: "album-01-B-1", title: "イコラブ初体験チャレンジ ～何をやるかは全部、内緒。～", categories: ["variety"], keywords: ["初体験チャレンジ"], alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 4（特典映像）の 1本目", match: "stated", officialTitle: "イコラブ初体験チャレンジ ～何をやるかは全部、内緒。～"}] },
          { id: "album-01-B-2", title: "桜の咲く音がした メイキング", categories: ["making"], songId: "sakura-no-saku-oto-ga-shita", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 3（MV メイキング）の 1本目", match: "unverified"}] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-1860",
        officialUrl: "https://equal-love.jp/discography/detail/33/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1860", check: "both", jacket: null,
        tracks: [
          { title: "Overture", songId: "overture" },
          { title: "桜の咲く音がした", songId: "sakura-no-saku-oto-ga-shita" },
          { title: "探せ ダイヤモンドリリー", songId: "sagase-diamond-lily" },
          { title: "Oh！Darling", songId: "oh-darling" },
          { title: "青春”サブリミナル”", songId: "seishun-subliminal" },
          { title: "セノビーインラブ", songId: "senobi-in-love" },
          { title: "CAMEO", songId: "cameo" },
          { title: "手遅れcaution", songId: "teokure-caution" },
          { title: "ズルいよ ズルいね", songId: "zurui-yo-zurui-ne" },
          { title: "24/7", songId: "24-7" },
          { title: "お姉さんじゃダメですか？", songId: "oneesan-ja-dame-desuka" },
          { title: "Want you！Want you！", songId: "want-you-want-you" },
          { title: "cinema", songId: "cinema" },
          { title: "僕らの制服クリスマス", songId: "bokura-no-seifuku-christmas" },
          { title: "＝LOVE", songId: "love" },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-09", number: 9, kind: "single", title: "ウィークエンドシトロン", releaseDate: "2021-08-25",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1926〜1927",
        officialUrl: "https://equal-love.jp/discography/detail/35/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1926", check: "both", jacket: null,
        tracks: [
          { title: "ウィークエンドシトロン", songId: "weekend-citron" },
          { title: "ズッ友案件", songId: "zuttomo-anken" },
          { title: "ウィークエンドシトロン instrumental", songId: "weekend-citron", instrumental: true },
          { title: "ズッ友案件 instrumental", songId: "zuttomo-anken", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A 生写真11種のうち1枚ランダム", "スペシャルプレゼント応募券"],
        disc: "DVD",
        videos: [
          { id: "single-09-A-1", title: "ウィークエンドシトロン Music Video", categories: ["mv"], songId: "weekend-citron", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 35曲目", match: "sameTitle"}] },
          { id: "single-09-A-2", title: "ウィークエンドシトロン メイキング映像", categories: ["making"], songId: "weekend-citron", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 3（MV メイキング）の 2本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1928〜1929",
        officialUrl: "https://equal-love.jp/discography/detail/36/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1928", check: "both", jacket: null,
        tracks: [
          { title: "ウィークエンドシトロン", songId: "weekend-citron" },
          { title: "夏祭り恋慕う", songId: "natsumatsuri-koishitau" },
          { title: "ウィークエンドシトロン instrumental", songId: "weekend-citron", instrumental: true },
          { title: "夏祭り恋慕う instrumental", songId: "natsumatsuri-koishitau", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B 生写真11種のうち1枚ランダム", "スペシャルプレゼント応募券"],
        disc: "DVD",
        videos: [
          { id: "single-09-B-1", title: "イコラブ社員研修 人狼ゲーム Ⅰ 嘘つき編", categories: ["variety"], keywords: ["人狼", "人狼ゲーム", "社員研修"], series: "jinro", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 4（特典映像）の 2本目", match: "stated", officialTitle: "イコラブ社員研修 ～人狼ゲーム～ Ⅰ 嘘つき編"}] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1930〜1931",
        officialUrl: "https://equal-love.jp/discography/detail/37/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1930", check: "both", jacket: null,
        tracks: [
          { title: "ウィークエンドシトロン", songId: "weekend-citron" },
          { title: "祝祭", songId: "shukusai" },
          { title: "ウィークエンドシトロン instrumental", songId: "weekend-citron", instrumental: true },
          { title: "祝祭 instrumental", songId: "shukusai", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C 生写真11種のうち1枚ランダム", "スペシャルプレゼント応募券"],
        disc: "DVD",
        videos: [
          { id: "single-09-C-1", title: "イコラブ社員研修 人狼ゲーム Ⅱ 騙し合い編", categories: ["variety"], keywords: ["人狼", "人狼ゲーム", "社員研修"], series: "jinro", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 4（特典映像）の 3本目", match: "stated", officialTitle: "イコラブ社員研修 ～人狼ゲーム～ Ⅱ 騙し合い編"}] },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD のみ", edition: "通常盤", editionSource: "sony", catalog: "VVCL-1932",
        officialUrl: "https://equal-love.jp/discography/detail/38/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1932", check: "both", jacket: null,
        tracks: [
          { title: "ウィークエンドシトロン", songId: "weekend-citron" },
          { title: "ズッ友案件", songId: "zuttomo-anken" },
          { title: "夏祭り恋慕う", songId: "natsumatsuri-koishitau" },
          { title: "祝祭", songId: "shukusai" },
          { title: "ウィークエンドシトロン instrumental", songId: "weekend-citron", instrumental: true },
          { title: "ズッ友案件 instrumental", songId: "zuttomo-anken", instrumental: true },
          { title: "夏祭り恋慕う instrumental", songId: "natsumatsuri-koishitau", instrumental: true },
          { title: "祝祭 instrumental", songId: "shukusai", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-10", number: 10, kind: "single", title: "The 5th", releaseDate: "2021-12-15",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1976〜1977",
        officialUrl: "https://equal-love.jp/discography/detail/39/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1976", check: "both", jacket: null,
        tracks: [
          { title: "The 5th", songId: "the-5th" },
          { title: "お姫様にしてよ！", songId: "ohimesama-ni-shiteyo" },
          { title: "The 5th(instrumental)", songId: "the-5th", instrumental: true },
          { title: "お姫様にしてよ！(instrumental)", songId: "ohimesama-ni-shiteyo", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真11種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-10-A-1", title: "The 5th Music Video", categories: ["mv"], songId: "the-5th", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 39曲目", match: "sameTitle"}] },
          { id: "single-10-A-2", title: "The 5th メイキング映像", categories: ["making"], songId: "the-5th", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 3（MV メイキング）の 3本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1978〜1979",
        officialUrl: "https://equal-love.jp/discography/detail/40/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1978", check: "both", jacket: null,
        tracks: [
          { title: "The 5th", songId: "the-5th" },
          { title: "Poison Girl", songId: "poison-girl" },
          { title: "The 5th(instrumental)", songId: "the-5th", instrumental: true },
          { title: "Poison Girl(instrumental)", songId: "poison-girl", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真11種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-10-B-1", title: "イコラブ社員研修～鬼ごっこ激走編～", categories: ["variety"], keywords: ["鬼ごっこ", "社員研修"], series: "onigokko", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 4（特典映像）の 4本目", match: "stated", officialTitle: "イコラブ社員研修 ～鬼ごっこ激走編～"}] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: "初回仕様限定盤", editionSource: "sony", catalog: "VVCL-1980〜1981",
        officialUrl: "https://equal-love.jp/discography/detail/41/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1980", check: "both", jacket: null,
        tracks: [
          { title: "The 5th", songId: "the-5th" },
          { title: "BPM170の君へ", songId: "bpm170-no-kimi-e" },
          { title: "The 5th(instrumental)", songId: "the-5th", instrumental: true },
          { title: "BPM170の君へ(instrumental)", songId: "bpm170-no-kimi-e", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真11種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-10-C-1", title: "イコラブ社員研修～鬼ごっこ対決編～", categories: ["variety"], keywords: ["鬼ごっこ", "社員研修"], series: "onigokko", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 4（特典映像）の 5本目", match: "stated", officialTitle: "イコラブ社員研修 ～鬼ごっこ対決編～"}] },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD のみ", edition: "通常盤", editionSource: "sony", catalog: "VVCL-1982",
        officialUrl: "https://equal-love.jp/discography/detail/42/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-1982", check: "both", jacket: null,
        tracks: [
          { title: "The 5th", songId: "the-5th" },
          { title: "お姫様にしてよ！", songId: "ohimesama-ni-shiteyo" },
          { title: "Poison Girl", songId: "poison-girl" },
          { title: "BPM170の君へ", songId: "bpm170-no-kimi-e" },
          { title: "The 5th(instrumental)", songId: "the-5th", instrumental: true },
          { title: "お姫様にしてよ！(instrumental)", songId: "ohimesama-ni-shiteyo", instrumental: true },
          { title: "Poison Girl(instrumental)", songId: "poison-girl", instrumental: true },
          { title: "BPM170の君へ(instrumental)", songId: "bpm170-no-kimi-e", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-11", number: 11, kind: "single", title: "あの子コンプレックス", releaseDate: "2022-05-25",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2033〜2034",
        officialUrl: "https://equal-love.jp/discography/detail/43/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2033", check: "both", jacket: null,
        tracks: [
          { title: "あの子コンプレックス", songId: "ano-ko-complex" },
          { title: "笑顔のレシピ", songId: "egao-no-recipe" },
          { title: "あの子コンプレックス（instrumental）", songId: "ano-ko-complex", instrumental: true },
          { title: "笑顔のレシピ（instrumental）", songId: "egao-no-recipe", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真11種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-11-A-1", title: "あの子コンプレックス Music Video", categories: ["mv"], songId: "ano-ko-complex", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 43曲目", match: "sameTitle"}] },
          { id: "single-11-A-2", title: "あの子コンプレックス メイキング映像", categories: ["making"], songId: "ano-ko-complex", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 3（MV メイキング）の 4本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2035〜2036",
        officialUrl: "https://equal-love.jp/discography/detail/44/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2035", check: "both", jacket: null,
        tracks: [
          { title: "あの子コンプレックス", songId: "ano-ko-complex" },
          { title: "知らんけど", songId: "shiran-kedo" },
          { title: "あの子コンプレックス（instrumental）", songId: "ano-ko-complex", instrumental: true },
          { title: "知らんけど（instrumental）", songId: "shiran-kedo", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真11種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-11-B-1", title: "イコラブ社員研修～イレブンHOUSE～前編", categories: ["variety"], keywords: ["イレブンHOUSE", "社員研修"], series: "eleven-house", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 5（特典映像）の 1本目", match: "stated", officialTitle: "イコラブ社員研修 ～イレブンHOUSE・前編～"}] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2037〜2038",
        officialUrl: "https://equal-love.jp/discography/detail/45/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2037", check: "both", jacket: null,
        tracks: [
          { title: "あの子コンプレックス", songId: "ano-ko-complex" },
          { title: "僕のヒロイン", songId: "boku-no-heroine" },
          { title: "あの子コンプレックス（instrumental）", songId: "ano-ko-complex", instrumental: true },
          { title: "僕のヒロイン（instrumental）", songId: "boku-no-heroine", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真11種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-11-C-1", title: "イコラブ社員研修～イレブンHOUSE～後編", categories: ["variety"], keywords: ["イレブンHOUSE", "社員研修"], series: "eleven-house", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 5（特典映像）の 2本目", match: "stated", officialTitle: "イコラブ社員研修 ～イレブンHOUSE・後編～"}] },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-2039",
        officialUrl: "https://equal-love.jp/discography/detail/46/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2039", check: "both", jacket: null,
        tracks: [
          { title: "あの子コンプレックス", songId: "ano-ko-complex" },
          { title: "笑顔のレシピ", songId: "egao-no-recipe" },
          { title: "知らんけど", songId: "shiran-kedo" },
          { title: "僕のヒロイン", songId: "boku-no-heroine" },
          { title: "あの子コンプレックス（instrumental）", songId: "ano-ko-complex", instrumental: true },
          { title: "笑顔のレシピ（instrumental）", songId: "egao-no-recipe", instrumental: true },
          { title: "知らんけど（instrumental）", songId: "shiran-kedo", instrumental: true },
          { title: "僕のヒロイン（instrumental）", songId: "boku-no-heroine", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-12", number: 12, kind: "single", title: "Be Selfish", releaseDate: "2022-09-28",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2110〜2111",
        officialUrl: "https://equal-love.jp/discography/detail/47/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2110", check: "both", jacket: null,
        tracks: [
          { title: "Be Selfish", songId: "be-selfish" },
          { title: "好きって、言えなかった", songId: "sukitte-ienakatta" },
          { title: "Be Selfish（Instrumental）", songId: "be-selfish", instrumental: true },
          { title: "好きって、言えなかった（Instrumental）", songId: "sukitte-ienakatta", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真11種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-12-A-1", title: "Be Selfish Music Video", categories: ["mv"], songId: "be-selfish", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤（Disc 1）・通常盤 Blu-ray・通常盤 DVD", place: "MV 全50曲の 47曲目", match: "sameTitle"}] },
          { id: "single-12-A-2", title: "Be Selfish メイキング映像", categories: ["making"], songId: "be-selfish", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 3（MV メイキング）の 5本目", match: "unverified"}] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2112〜2113",
        officialUrl: "https://equal-love.jp/discography/detail/48/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2112", check: "both", jacket: null,
        tracks: [
          { title: "Be Selfish", songId: "be-selfish" },
          { title: "わたし、魔法使い", songId: "watashi-mahoutsukai" },
          { title: "Be Selfish（Instrumental）", songId: "be-selfish", instrumental: true },
          { title: "わたし、魔法使い（Instrumental）", songId: "watashi-mahoutsukai", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真11種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-12-B-1", title: "イコラブ社員旅行 in 沖縄 DAY-1 ～さなつんドッキリＭＶ撮影編", categories: ["trip"], keywords: ["沖縄", "社員旅行", "ドッキリ", "さなつん"], memberIds: ["morohashi-sana"], membersBasis: "題名の「さなつん」", series: "okinawa", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 5（特典映像）の 3本目", match: "stated", officialTitle: "イコラブ社員旅行 in 沖縄 DAY-1 ～さなつんドッキリMV撮影編"}] },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2114〜2115",
        officialUrl: "https://equal-love.jp/discography/detail/49/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2114", check: "both", jacket: null,
        tracks: [
          { title: "Be Selfish", songId: "be-selfish" },
          { title: "真夜中マーメイド", songId: "mayonaka-mermaid" },
          { title: "Be Selfish（Instrumental）", songId: "be-selfish", instrumental: true },
          { title: "真夜中マーメイド（Instrumental）", songId: "mayonaka-mermaid", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真11種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-12-C-1", title: "イコラブ社員旅行 in 沖縄 DAY-2 ～海と山！大自然満喫編", categories: ["trip"], keywords: ["沖縄", "社員旅行", "海", "山", "大自然"], series: "okinawa", alsoOn: [{release: "mv-kakosaijo-kyun", edition: "完全生産限定盤", place: "Disc 5（特典映像）の 4本目", match: "stated", officialTitle: "イコラブ社員旅行 in 沖縄 DAY-2 ～海と山！大自然満喫編"}] },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2116〜2117",
        officialUrl: "https://equal-love.jp/discography/detail/50/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2116", check: "both", jacket: null,
        tracks: [
          { title: "Be Selfish", songId: "be-selfish" },
          { title: "笑って フラジール（≒JOY）", artist: "≒JOY" },
          { title: "Be Selfish（Instrumental）", songId: "be-selfish", instrumental: true },
          { title: "笑って フラジール（Instrumental）", artist: "≒JOY", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D（≒JOY）生写真13種のうち1枚ランダム", "≒JOYアナザージャケット封入", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-12-D-1", title: "笑って フラジール Music Video（≒JOY）", categories: ["mv"], artist: "≒JOY" },
          { id: "single-12-D-2", title: "笑って フラジール メイキング映像", categories: ["making"], artist: "≒JOY" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-2118",
        officialUrl: "https://equal-love.jp/discography/detail/51/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2118", check: "both", jacket: null,
        tracks: [
          { title: "Be Selfish", songId: "be-selfish" },
          { title: "好きって、言えなかった", songId: "sukitte-ienakatta" },
          { title: "わたし、魔法使い", songId: "watashi-mahoutsukai" },
          { title: "真夜中マーメイド", songId: "mayonaka-mermaid" },
          { title: "Be Selfish（Instrumental）", songId: "be-selfish", instrumental: true },
          { title: "好きって、言えなかった（Instrumental）", songId: "sukitte-ienakatta", instrumental: true },
          { title: "わたし、魔法使い（Instrumental）", songId: "watashi-mahoutsukai", instrumental: true },
          { title: "真夜中マーメイド（Instrumental）", songId: "mayonaka-mermaid", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-13", number: 13, kind: "single", title: "この空がトリガー", releaseDate: "2023-02-22",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2188〜2189",
        officialUrl: "https://equal-love.jp/discography/detail/52/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2188", check: "both", jacket: null,
        tracks: [
          { title: "この空がトリガー", songId: "kono-sora-ga-trigger" },
          { title: "Junkies", songId: "junkies" },
          { title: "この空がトリガー -Instrumental-", songId: "kono-sora-ga-trigger", instrumental: true },
          { title: "Junkies -Instrumental-", songId: "junkies", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真10種（＝LOVE）のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-13-A-1", title: "この空がトリガー Music Video", categories: ["mv"], songId: "kono-sora-ga-trigger" },
          { id: "single-13-A-2", title: "この空がトリガー メイキング映像", categories: ["making"], songId: "kono-sora-ga-trigger" },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2190〜2191",
        officialUrl: "https://equal-love.jp/discography/detail/53/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2190", check: "both", jacket: null,
        tracks: [
          { title: "この空がトリガー", songId: "kono-sora-ga-trigger" },
          { title: "ラブクリエイト", songId: "love-create" },
          { title: "この空がトリガー -Instrumental-", songId: "kono-sora-ga-trigger", instrumental: true },
          { title: "ラブクリエイト -Instrumental-", songId: "love-create", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真10種（＝LOVE）のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-13-B-1", title: "イコラブ社員旅行 in 北海道 -前編-", categories: ["trip"], keywords: ["北海道", "社員旅行"], series: "hokkaido" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2192〜2193",
        officialUrl: "https://equal-love.jp/discography/detail/54/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2192", check: "both", jacket: null,
        tracks: [
          { title: "この空がトリガー", songId: "kono-sora-ga-trigger" },
          { title: "Kiara Tiara", songId: "kiara-tiara" },
          { title: "この空がトリガー -Instrumental-", songId: "kono-sora-ga-trigger", instrumental: true },
          { title: "Kiara Tiara -Instrumental-", songId: "kiara-tiara", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真10種（＝LOVE）のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-13-C-1", title: "イコラブ社員旅行 in 北海道 -後編-", categories: ["trip"], keywords: ["北海道", "社員旅行"], series: "hokkaido" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2194〜2195",
        officialUrl: "https://equal-love.jp/discography/detail/55/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2194", check: "both", jacket: null,
        tracks: [
          { title: "この空がトリガー", songId: "kono-sora-ga-trigger" },
          { title: "スイートシックスティーン（≒JOY）", artist: "≒JOY" },
          { title: "この空がトリガー -Instrumental-", songId: "kono-sora-ga-trigger", instrumental: true },
          { title: "スイートシックスティーン -Instrumental-", artist: "≒JOY", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D生写真12種（≒JOY）のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-13-D-1", title: "スイートシックスティーン Music Video（≒JOY）", categories: ["mv"], artist: "≒JOY" },
          { id: "single-13-D-2", title: "スイートシックスティーン メイキング映像", categories: ["making"], artist: "≒JOY" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-2196",
        officialUrl: "https://equal-love.jp/discography/detail/56/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2196", check: "both", jacket: null,
        tracks: [
          { title: "この空がトリガー", songId: "kono-sora-ga-trigger" },
          { title: "Junkies", songId: "junkies" },
          { title: "ラブクリエイト", songId: "love-create" },
          { title: "Kiara Tiara", songId: "kiara-tiara" },
          { title: "この空がトリガー -Instrumental-", songId: "kono-sora-ga-trigger", instrumental: true },
          { title: "Junkies -Instrumental-", songId: "junkies", instrumental: true },
          { title: "ラブクリエイト -Instrumental-", songId: "love-create", instrumental: true },
          { title: "Kiara Tiara -Instrumental-", songId: "kiara-tiara", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-14", number: 14, kind: "single", title: "ナツマトペ", releaseDate: "2023-07-19",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2302〜2303",
        officialUrl: "https://equal-love.jp/discography/detail/78/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2302", check: "both", jacket: null,
        tracks: [
          { title: "ナツマトペ", songId: "natsumatope" },
          { title: "だからとて", songId: "dakaratote" },
          { title: "ナツマトペ -Instrumental-", songId: "natsumatope", instrumental: true },
          { title: "だからとて -Instrumental-", songId: "dakaratote", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真10種（＝LOVE）のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-14-A-1", title: "ナツマトぺ Music Video", categories: ["mv"], songId: "natsumatope" },
          { id: "single-14-A-2", title: "ナツマトぺ メイキング映像", categories: ["making"], songId: "natsumatope" },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2304〜2305",
        officialUrl: "https://equal-love.jp/discography/detail/79/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2304", check: "both", jacket: null,
        tracks: [
          { title: "ナツマトペ", songId: "natsumatope" },
          { title: "ヒロインズ", songId: "heroines" },
          { title: "ナツマトペ -Instrumental-", songId: "natsumatope", instrumental: true },
          { title: "ヒロインズ -Instrumental-", songId: "heroines", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真10種（＝LOVE）のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-14-B-1", title: "イコラブ社員旅行 〜夏先取り！納涼・流しそうめん編", categories: ["trip"], keywords: ["流しそうめん", "そうめん", "納涼", "社員旅行"], series: "noryo" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2306〜2307",
        officialUrl: "https://equal-love.jp/discography/detail/80/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2306", check: "both", jacket: null,
        tracks: [
          { title: "ナツマトペ", songId: "natsumatope" },
          { title: "ラブロケ", songId: "love-locke" },
          { title: "ナツマトペ -Instrumental-", songId: "natsumatope", instrumental: true },
          { title: "ラブロケ -Instrumental-", songId: "love-locke", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真10種（＝LOVE）のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-14-C-1", title: "イコラブ社員旅行 〜夏先取り！納涼・屋形船party編", categories: ["trip"], keywords: ["屋形船", "納涼", "社員旅行"], series: "noryo" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2308〜2309",
        officialUrl: "https://equal-love.jp/discography/detail/81/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2308", check: "both", jacket: null,
        tracks: [
          { title: "ナツマトペ", songId: "natsumatope" },
          { title: "大空、ビュンと（≒JOY）", artist: "≒JOY" },
          { title: "ナツマトペ -Instrumental-", songId: "natsumatope", instrumental: true },
          { title: "大空、ビュンと（≒JOY）-Instrumental-", artist: "≒JOY", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D生写真12種（≒JOY）のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-14-D-1", title: "大空、ビュンと Music Video（≒JOY）", categories: ["mv"], artist: "≒JOY" },
          { id: "single-14-D-2", title: "大空、ビュンと メイキング映像", categories: ["making"], artist: "≒JOY" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-2310",
        officialUrl: "https://equal-love.jp/discography/detail/82/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2310", check: "both", jacket: null,
        tracks: [
          { title: "ナツマトペ", songId: "natsumatope" },
          { title: "だからとて", songId: "dakaratote" },
          { title: "ヒロインズ", songId: "heroines" },
          { title: "ラブロケ", songId: "love-locke" },
          { title: "ナツマトペ -Instrumental-", songId: "natsumatope", instrumental: true },
          { title: "だからとて -Instrumental-", songId: "dakaratote", instrumental: true },
          { title: "ヒロインズ -Instrumental-", songId: "heroines", instrumental: true },
          { title: "ラブロケ -Instrumental-", songId: "love-locke", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-15", number: 15, kind: "single", title: "ラストノートしか知らない", releaseDate: "2023-11-29",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2360〜2361",
        officialUrl: "https://equal-love.jp/discography/detail/83/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2360", check: "both", jacket: null,
        tracks: [
          { title: "ラストノートしか知らない", songId: "last-note-shika-shiranai" },
          { title: "「ドライブ デート 都内」", songId: "drive-date-tonai" },
          { title: "ラストノートしか知らない ‐instrumentalｰ", songId: "last-note-shika-shiranai", instrumental: true },
          { title: "「ドライブ デート 都内」ｰinstrumentalｰ", songId: "drive-date-tonai", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-15-A-1", title: "ラストノートしか知らない Music Video", categories: ["mv"], songId: "last-note-shika-shiranai" },
          { id: "single-15-A-2", title: "ラストノートしか知らない メイキング映像", categories: ["making"], songId: "last-note-shika-shiranai" },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2362〜2363",
        officialUrl: "https://equal-love.jp/discography/detail/84/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2362", check: "both", jacket: null,
        tracks: [
          { title: "ラストノートしか知らない", songId: "last-note-shika-shiranai" },
          { title: "狂想カタストロフィ", songId: "kyousou-catastrophe" },
          { title: "ラストノートしか知らない ‐instrumentalｰ", songId: "last-note-shika-shiranai", instrumental: true },
          { title: "狂想カタストロフィ -instrumental-", songId: "kyousou-catastrophe", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-15-B-1", title: "イコノイジョイ大感謝祭「＝LOVEパジャマゲームパーティー」", categories: ["event"], keywords: ["イコノイジョイ大感謝祭", "大感謝祭", "パジャマ", "パジャマゲームパーティー"], series: "kanshasai2023" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2364〜2365",
        officialUrl: "https://equal-love.jp/discography/detail/85/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2364", check: "both", jacket: null,
        tracks: [
          { title: "ラストノートしか知らない", songId: "last-note-shika-shiranai" },
          { title: "どこが好きか言って", songId: "doko-ga-suki-ka-itte" },
          { title: "ラストノートしか知らない ‐instrumentalｰ", songId: "last-note-shika-shiranai", instrumental: true },
          { title: "どこが好きか言って -instrumental-", songId: "doko-ga-suki-ka-itte", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-15-C-1", title: "イコノイジョイ大感謝祭「＝LOVE秋祭り」", categories: ["event"], keywords: ["イコノイジョイ大感謝祭", "大感謝祭", "秋祭り"], series: "kanshasai2023" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2366〜2367",
        officialUrl: "https://equal-love.jp/discography/detail/86/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2366", check: "both", jacket: null,
        tracks: [
          { title: "ラストノートしか知らない", songId: "last-note-shika-shiranai" },
          { title: "「ドライブ デート 都内」", songId: "drive-date-tonai" },
          { title: "ラストノートしか知らない ‐instrumentalｰ", songId: "last-note-shika-shiranai", instrumental: true },
          { title: "「ドライブ デート 都内」ｰinstrumentalｰ", songId: "drive-date-tonai", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D生写真10種のうち1枚ランダム", "諸橋沙夏アナザージャケット", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-15-D-1", title: "イコノイジョイ大感謝祭「＝LOVE諸橋沙夏 ソロコンサート」", categories: ["event", "live"], keywords: ["イコノイジョイ大感謝祭", "大感謝祭", "ソロコンサート"], memberIds: ["morohashi-sana"], membersBasis: "題名の「諸橋沙夏」", series: "kanshasai2023" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-2368",
        officialUrl: "https://equal-love.jp/discography/detail/87/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2368", check: "both", jacket: null,
        tracks: [
          { title: "ラストノートしか知らない", songId: "last-note-shika-shiranai" },
          { title: "「ドライブ デート 都内」", songId: "drive-date-tonai" },
          { title: "狂想カタストロフィ", songId: "kyousou-catastrophe" },
          { title: "どこが好きか言って", songId: "doko-ga-suki-ka-itte" },
          { title: "ラストノートしか知らない ‐instrumentalｰ", songId: "last-note-shika-shiranai", instrumental: true },
          { title: "「ドライブ デート 都内」ｰinstrumentalｰ", songId: "drive-date-tonai", instrumental: true },
          { title: "狂想カタストロフィ -instrumental-", songId: "kyousou-catastrophe", instrumental: true },
          { title: "どこが好きか言って -instrumental-", songId: "doko-ga-suki-ka-itte", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-16", number: 16, kind: "single", title: "呪って呪って", releaseDate: "2024-03-06",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2450〜2451",
        officialUrl: "https://equal-love.jp/discography/detail/88/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2450", check: "both", jacket: null,
        tracks: [
          { title: "呪って呪って", songId: "norotte-norotte" },
          { title: "誰にもバレずに", songId: "darenimo-barezuni" },
          { title: "君の第3ボタン", songId: "kimi-no-dai-3-button" },
          { title: "呪って呪って -Instrumental-", songId: "norotte-norotte", instrumental: true },
          { title: "誰にもバレずに -Instrumental-", songId: "darenimo-barezuni", instrumental: true },
          { title: "君の第3ボタン -Instrumental-", songId: "kimi-no-dai-3-button", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-16-A-1", title: "呪って呪って Music Video", categories: ["mv"], songId: "norotte-norotte" },
          { id: "single-16-A-2", title: "呪って呪って メイキング映像", categories: ["making"], songId: "norotte-norotte" },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2452〜2453",
        officialUrl: "https://equal-love.jp/discography/detail/89/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2452", check: "both", jacket: null,
        tracks: [
          { title: "呪って呪って", songId: "norotte-norotte" },
          { title: "誰にもバレずに", songId: "darenimo-barezuni" },
          { title: "君の第3ボタン", songId: "kimi-no-dai-3-button" },
          { title: "呪って呪って -Instrumental-", songId: "norotte-norotte", instrumental: true },
          { title: "誰にもバレずに -Instrumental-", songId: "darenimo-barezuni", instrumental: true },
          { title: "君の第3ボタン -Instrumental-", songId: "kimi-no-dai-3-button", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-16-B-1", title: "イコラブ社員旅行 広島満喫ツアー 前編", categories: ["trip"], keywords: ["広島", "社員旅行"], series: "hiroshima" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2454〜2455",
        officialUrl: "https://equal-love.jp/discography/detail/90/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2454", check: "both", jacket: null,
        tracks: [
          { title: "呪って呪って", songId: "norotte-norotte" },
          { title: "誰にもバレずに", songId: "darenimo-barezuni" },
          { title: "君の第3ボタン", songId: "kimi-no-dai-3-button" },
          { title: "呪って呪って -Instrumental-", songId: "norotte-norotte", instrumental: true },
          { title: "誰にもバレずに -Instrumental-", songId: "darenimo-barezuni", instrumental: true },
          { title: "君の第3ボタン -Instrumental-", songId: "kimi-no-dai-3-button", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-16-C-1", title: "イコラブ社員旅行 広島満喫ツアー 後編", categories: ["trip"], keywords: ["広島", "社員旅行"], series: "hiroshima" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2456〜2457",
        officialUrl: "https://equal-love.jp/discography/detail/91/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2456", check: "both", jacket: null,
        tracks: [
          { title: "呪って呪って", songId: "norotte-norotte" },
          { title: "誰にもバレずに", songId: "darenimo-barezuni" },
          { title: "君の第3ボタン", songId: "kimi-no-dai-3-button" },
          { title: "呪って呪って -Instrumental-", songId: "norotte-norotte", instrumental: true },
          { title: "誰にもバレずに -Instrumental-", songId: "darenimo-barezuni", instrumental: true },
          { title: "君の第3ボタン -Instrumental-", songId: "kimi-no-dai-3-button", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-16-D-1", title: "「 ナツマトペ」パフォーマンス映像", group: "「キミは＝LOVEを愛せるか!!!」(全103分収録", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "natsumatope", series: "kimilove" },
          { id: "single-16-D-2", title: "「キミは＝LOVEを愛せるか!!!」2023年9月放送分ダイジェスト映像", group: "「キミは＝LOVEを愛せるか!!!」(全103分収録", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-16-D-3", title: "「だからとて」パフォーマンス映像", group: "「キミは＝LOVEを愛せるか!!!」(全103分収録", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "dakaratote", series: "kimilove" },
          { id: "single-16-D-4", title: "「キミは＝LOVEを愛せるか!!!」2023年10月放送分ダイジェスト映像", group: "「キミは＝LOVEを愛せるか!!!」(全103分収録", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-16-D-5", title: "「ヒロインズ」パフォーマンス映像", group: "「キミは＝LOVEを愛せるか!!!」(全103分収録", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "heroines", series: "kimilove" },
          { id: "single-16-D-6", title: "「キミは＝LOVEを愛せるか!!!」2023年11月放送分ダイジェスト映像", group: "「キミは＝LOVEを愛せるか!!!」(全103分収録", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-16-D-7", title: "「ラストノートしか知らない」パフォーマンス映像", group: "「キミは＝LOVEを愛せるか!!!」(全103分収録", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "last-note-shika-shiranai", series: "kimilove" },
          { id: "single-16-D-8", title: "「キミは＝LOVEを愛せるか!!!」2023年12月放送分ダイジェスト映像", group: "「キミは＝LOVEを愛せるか!!!」(全103分収録", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-2458",
        officialUrl: "https://equal-love.jp/discography/detail/92/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2458", check: "both", jacket: null,
        tracks: [
          { title: "呪って呪って", songId: "norotte-norotte" },
          { title: "誰にもバレずに", songId: "darenimo-barezuni" },
          { title: "君の第3ボタン", songId: "kimi-no-dai-3-button" },
          { title: "呪って呪って -Instrumental-", songId: "norotte-norotte", instrumental: true },
          { title: "誰にもバレずに -Instrumental-", songId: "darenimo-barezuni", instrumental: true },
          { title: "君の第3ボタン -Instrumental-", songId: "kimi-no-dai-3-button", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-17", number: 17, kind: "single", title: "絶対アイドル辞めないで", releaseDate: "2024-07-31",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2518〜2519",
        officialUrl: "https://equal-love.jp/discography/detail/96/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2518", check: "both", jacket: null,
        tracks: [
          { title: "絶対アイドル辞めないで", songId: "zettai-idol-yamenaide" },
          { title: "仲直りシュークリーム", songId: "nakanaori-shu-cream" },
          { title: "海とレモンティー", songId: "umi-to-lemon-tea" },
          { title: "絶対アイドル辞めないで -Instrumental-", songId: "zettai-idol-yamenaide", instrumental: true },
          { title: "仲直りシュークリーム -Instrumental-", songId: "nakanaori-shu-cream", instrumental: true },
          { title: "海とレモンティー -Instrumental-", songId: "umi-to-lemon-tea", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-17-A-1", title: "絶対アイドル辞めないで Music Video", categories: ["mv"], songId: "zettai-idol-yamenaide" },
          { id: "single-17-A-2", title: "絶対アイドル辞めないで メイキング映像", categories: ["making"], songId: "zettai-idol-yamenaide" },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2520〜2521",
        officialUrl: "https://equal-love.jp/discography/detail/97/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2520", check: "both", jacket: null,
        tracks: [
          { title: "絶対アイドル辞めないで", songId: "zettai-idol-yamenaide" },
          { title: "仲直りシュークリーム", songId: "nakanaori-shu-cream" },
          { title: "海とレモンティー", songId: "umi-to-lemon-tea" },
          { title: "絶対アイドル辞めないで -Instrumental-", songId: "zettai-idol-yamenaide", instrumental: true },
          { title: "仲直りシュークリーム -Instrumental-", songId: "nakanaori-shu-cream", instrumental: true },
          { title: "海とレモンティー -Instrumental-", songId: "umi-to-lemon-tea", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-17-B-1", title: "イコラブ社員旅行 in 埼玉 〜川越・大正ロマン編", categories: ["trip"], keywords: ["埼玉", "川越", "大正ロマン", "社員旅行"], series: "saitama" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2522〜2523",
        officialUrl: "https://equal-love.jp/discography/detail/98/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2522", check: "both", jacket: null,
        notes: ["公式サイトの封入物の表記は「C生写真10種のうち1枚ランダム」（「Type」が抜けている）"],
        tracks: [
          { title: "絶対アイドル辞めないで", songId: "zettai-idol-yamenaide" },
          { title: "仲直りシュークリーム", songId: "nakanaori-shu-cream" },
          { title: "海とレモンティー", songId: "umi-to-lemon-tea" },
          { title: "絶対アイドル辞めないで -Instrumental-", songId: "zettai-idol-yamenaide", instrumental: true },
          { title: "仲直りシュークリーム -Instrumental-", songId: "nakanaori-shu-cream", instrumental: true },
          { title: "海とレモンティー -Instrumental-", songId: "umi-to-lemon-tea", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["C生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-17-C-1", title: "イコラブ社員旅行 in 埼玉 〜西武園・昭和レトロ編", categories: ["trip"], keywords: ["埼玉", "西武園", "昭和レトロ", "社員旅行"], series: "saitama" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2524〜2525",
        officialUrl: "https://equal-love.jp/discography/detail/99/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2524", check: "both", jacket: null,
        tracks: [
          { title: "絶対アイドル辞めないで", songId: "zettai-idol-yamenaide" },
          { title: "仲直りシュークリーム", songId: "nakanaori-shu-cream" },
          { title: "海とレモンティー", songId: "umi-to-lemon-tea" },
          { title: "絶対アイドル辞めないで -Instrumental-", songId: "zettai-idol-yamenaide", instrumental: true },
          { title: "仲直りシュークリーム -Instrumental-", songId: "nakanaori-shu-cream", instrumental: true },
          { title: "海とレモンティー -Instrumental-", songId: "umi-to-lemon-tea", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-17-D-1", title: "『「ドライブ デート 都内」』パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "drive-date-tonai", series: "kimilove" },
          { id: "single-17-D-2", title: "『キミは＝LOVEを愛せるか!!!』2024年1月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-17-D-3", title: "『狂想カタストロフィ』パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "kyousou-catastrophe", series: "kimilove" },
          { id: "single-17-D-4", title: "『キミは＝LOVEを愛せるか!!!』2024年2月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-17-D-5", title: "『キミは＝LOVEを愛せるか!!!』2024年3月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-17-D-6", title: "『呪って 呪って』パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "norotte-norotte", series: "kimilove" },
          { id: "single-17-D-7", title: "『キミは＝LOVEを愛せるか!!!』2024年4月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-2526",
        officialUrl: "https://equal-love.jp/discography/detail/100/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2526", check: "both", jacket: null,
        tracks: [
          { title: "絶対アイドル辞めないで", songId: "zettai-idol-yamenaide" },
          { title: "仲直りシュークリーム", songId: "nakanaori-shu-cream" },
          { title: "海とレモンティー", songId: "umi-to-lemon-tea" },
          { title: "絶対アイドル辞めないで -Instrumental-", songId: "zettai-idol-yamenaide", instrumental: true },
          { title: "仲直りシュークリーム -Instrumental-", songId: "nakanaori-shu-cream", instrumental: true },
          { title: "海とレモンティー -Instrumental-", songId: "umi-to-lemon-tea", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-18", number: 18, kind: "single", title: "とくべチュ、して／恋人以上、好き未満", releaseDate: "2025-02-26",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2601〜2602",
        officialUrl: "https://equal-love.jp/discography/detail/110/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2601", check: "both", jacket: null,
        tracks: [
          { title: "とくべチュ、して", songId: "tokubechu-shite" },
          { title: "恋人以上、好き未満", songId: "koibito-ijou-suki-miman" },
          { title: "超特急逃走中", songId: "chotokkyu-tousouchu" },
          { title: "とくべチュ、して -Instrumental-", songId: "tokubechu-shite", instrumental: true },
          { title: "恋人以上、好き未満 -Instrumental-", songId: "koibito-ijou-suki-miman", instrumental: true },
          { title: "超特急逃走中 -Instrumental-", songId: "chotokkyu-tousouchu", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-18-A-1", title: "イコノイジョイ大感謝祭2024「イコラブハロウィンパーティー」", categories: ["event"], keywords: ["イコノイジョイ大感謝祭", "大感謝祭", "ハロウィン", "ハロウィンパーティー"] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2603〜2604",
        officialUrl: "https://equal-love.jp/discography/detail/111/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2603", check: "both", jacket: null,
        tracks: [
          { title: "とくべチュ、して", songId: "tokubechu-shite" },
          { title: "恋人以上、好き未満", songId: "koibito-ijou-suki-miman" },
          { title: "超特急逃走中", songId: "chotokkyu-tousouchu" },
          { title: "とくべチュ、して -Instrumental-", songId: "tokubechu-shite", instrumental: true },
          { title: "恋人以上、好き未満 -Instrumental-", songId: "koibito-ijou-suki-miman", instrumental: true },
          { title: "超特急逃走中 -Instrumental-", songId: "chotokkyu-tousouchu", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-18-B-1", title: "イコラブ社員旅行 in ヒューストン 前編", categories: ["trip"], keywords: ["ヒューストン", "社員旅行"], series: "houston" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2605〜2606",
        officialUrl: "https://equal-love.jp/discography/detail/112/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2605", check: "both", jacket: null,
        notes: ["CD の2曲目：ソニーは「恋人以上、好き未満 (Full Size)」と表記"],
        tracks: [
          { title: "とくべチュ、して", songId: "tokubechu-shite" },
          { title: "恋人以上、好き未満", songId: "koibito-ijou-suki-miman" },
          { title: "超特急逃走中", songId: "chotokkyu-tousouchu" },
          { title: "とくべチュ、して -Instrumental-", songId: "tokubechu-shite", instrumental: true },
          { title: "恋人以上、好き未満 -Instrumental-", songId: "koibito-ijou-suki-miman", instrumental: true },
          { title: "超特急逃走中 -Instrumental-", songId: "chotokkyu-tousouchu", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-18-C-1", title: "イコラブ社員旅行 in ヒューストン 後編", categories: ["trip"], keywords: ["ヒューストン", "社員旅行"], series: "houston" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2607〜2608",
        officialUrl: "https://equal-love.jp/discography/detail/113/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2607", check: "both", jacket: null,
        notes: ["ソニーの商品ページの説明は「CD+DVD」だが、公式サイトの題名・映像の見出しは「Blu-ray」。CD+Blu-ray として載せる"],
        tracks: [
          { title: "とくべチュ、して", songId: "tokubechu-shite" },
          { title: "恋人以上、好き未満", songId: "koibito-ijou-suki-miman" },
          { title: "超特急逃走中", songId: "chotokkyu-tousouchu" },
          { title: "とくべチュ、して -Instrumental-", songId: "tokubechu-shite", instrumental: true },
          { title: "恋人以上、好き未満 -Instrumental-", songId: "koibito-ijou-suki-miman", instrumental: true },
          { title: "超特急逃走中 -Instrumental-", songId: "chotokkyu-tousouchu", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-18-D-1", title: "『「君の第３ボタン」』パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "kimi-no-dai-3-button", series: "kimilove" },
          { id: "single-18-D-2", title: "『キミは＝LOVEを愛せるか!!!』2024年5月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-18-D-3", title: "『誰にもバレずに』パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "darenimo-barezuni", series: "kimilove" },
          { id: "single-18-D-4", title: "『キミは＝LOVEを愛せるか!!!』2024年6月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-18-D-5", title: "『キミは＝LOVEを愛せるか!!!』2024年7月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-18-D-6", title: "『キミは＝LOVEを愛せるか!!!』2024年8月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD+Blu-ray", edition: "期間生産限定盤", editionSource: "official", catalog: "VVCL-2658〜2659",
        officialUrl: "https://equal-love.jp/discography/detail/114/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2658", check: "both", jacket: null,
        tracks: [
          { title: "恋人以上、好き未満", songId: "koibito-ijou-suki-miman" },
          { title: "とくべチュ、して", songId: "tokubechu-shite" },
          { title: "超特急逃走中", songId: "chotokkyu-tousouchu" },
          { title: "恋人以上、好き未満 -TV ver-", songId: "koibito-ijou-suki-miman", version: "TV ver" },
          { title: "恋人以上、好き未満 -Instrumental-", songId: "koibito-ijou-suki-miman", instrumental: true },
          { title: "とくべチュ、して -Instrumental-", songId: "tokubechu-shite", instrumental: true },
          { title: "超特急逃走中 -Instrumental-", songId: "chotokkyu-tousouchu", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["TVアニメ「クラスの大嫌いな女子と結婚することになった。」書き下ろしイラストA3ポスター", "Type E生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-18-E-1", title: "TVアニメ 「クラスの大嫌いな女子と結婚することになった。」ノンクレジットオープニング映像", categories: ["tv"], keywords: ["アニメ", "ノンクレジットオープニング", "クラスの大嫌いな女子と結婚することになった。"] },
        ],
      },
      {
        id: "F", name: "Type-F", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-2609",
        officialUrl: "https://equal-love.jp/discography/detail/115/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2609", check: "both", jacket: null,
        tracks: [
          { title: "とくべチュ、して", songId: "tokubechu-shite" },
          { title: "恋人以上、好き未満", songId: "koibito-ijou-suki-miman" },
          { title: "超特急逃走中", songId: "chotokkyu-tousouchu" },
          { title: "とくべチュ、して -Instrumental-", songId: "tokubechu-shite", instrumental: true },
          { title: "恋人以上、好き未満 -Instrumental-", songId: "koibito-ijou-suki-miman", instrumental: true },
          { title: "超特急逃走中 -Instrumental-", songId: "chotokkyu-tousouchu", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-19", number: 19, kind: "single", title: "ラブソングに襲われる", releaseDate: "2025-10-08",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2800〜2801",
        officialUrl: "https://equal-love.jp/discography/detail/122/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2800", check: "both", jacket: null,
        tracks: [
          { title: "ラブソングに襲われる", songId: "love-song-ni-osowareru" },
          { title: "Queens", songId: "queens" },
          { title: "木漏れ日メゾフォルテ", songId: "komorebi-mezzoforte" },
          { title: "ラブソングに襲われる -Instrumental-", songId: "love-song-ni-osowareru", instrumental: true },
          { title: "Queens -Instrumental-", songId: "queens", instrumental: true },
          { title: "木漏れ日メゾフォルテ -Instrumental-", songId: "komorebi-mezzoforte", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-19-A-1", title: "ラブソングに襲われる Music Video", categories: ["mv"], songId: "love-song-ni-osowareru" },
          { id: "single-19-A-2", title: "ラブソングに襲われる メイキング映像", categories: ["making"], songId: "love-song-ni-osowareru" },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2802〜2803",
        officialUrl: "https://equal-love.jp/discography/detail/123/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2802", check: "official", jacket: null,
        notes: ["映像の内容：ソニーの商品ページに記載が無い（公式サイトだけで確認）"],
        tracks: [
          { title: "ラブソングに襲われる", songId: "love-song-ni-osowareru" },
          { title: "Queens", songId: "queens" },
          { title: "木漏れ日メゾフォルテ", songId: "komorebi-mezzoforte" },
          { title: "ラブソングに襲われる -Instrumental-", songId: "love-song-ni-osowareru", instrumental: true },
          { title: "Queens -Instrumental-", songId: "queens", instrumental: true },
          { title: "木漏れ日メゾフォルテ -Instrumental-", songId: "komorebi-mezzoforte", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-19-B-1", title: "イコラブ最強ペア決定戦 in 河口湖 前編", categories: ["variety", "trip"], keywords: ["河口湖", "最強ペア決定戦"], series: "kawaguchiko" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2804〜2805",
        officialUrl: "https://equal-love.jp/discography/detail/124/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2804", check: "both", jacket: null,
        tracks: [
          { title: "ラブソングに襲われる", songId: "love-song-ni-osowareru" },
          { title: "Queens", songId: "queens" },
          { title: "木漏れ日メゾフォルテ", songId: "komorebi-mezzoforte" },
          { title: "ラブソングに襲われる -Instrumental-", songId: "love-song-ni-osowareru", instrumental: true },
          { title: "Queens -Instrumental-", songId: "queens", instrumental: true },
          { title: "木漏れ日メゾフォルテ -Instrumental-", songId: "komorebi-mezzoforte", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-19-C-1", title: "イコラブ最強ペア決定戦 in 河口湖 後編", categories: ["variety", "trip"], keywords: ["河口湖", "最強ペア決定戦"], series: "kawaguchiko" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2806〜2807",
        officialUrl: "https://equal-love.jp/discography/detail/125/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2806", check: "both", jacket: null,
        tracks: [
          { title: "ラブソングに襲われる", songId: "love-song-ni-osowareru" },
          { title: "Queens", songId: "queens" },
          { title: "木漏れ日メゾフォルテ", songId: "komorebi-mezzoforte" },
          { title: "ラブソングに襲われる -Instrumental-", songId: "love-song-ni-osowareru", instrumental: true },
          { title: "Queens -Instrumental-", songId: "queens", instrumental: true },
          { title: "木漏れ日メゾフォルテ -Instrumental-", songId: "komorebi-mezzoforte", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-19-D-1", title: "『キミは＝LOVEを愛せるか!!!』 2024年9月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-19-D-2", title: "『絶対アイドル辞めないで』 パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "zettai-idol-yamenaide", series: "kimilove" },
          { id: "single-19-D-3", title: "『キミは＝LOVEを愛せるか!!!』 2024年10月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-19-D-4", title: "『海とレモンティー』 パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "umi-to-lemon-tea", series: "kimilove" },
          { id: "single-19-D-5", title: "『キミは＝LOVEを愛せるか!!!』 2024年11月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-19-D-6", title: "『仲直りシュークリーム』 パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "nakanaori-shu-cream", series: "kimilove" },
          { id: "single-19-D-7", title: "『キミは＝LOVEを愛せるか!!!』 2024年12月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD のみ", edition: "完全生産限定盤", editionSource: "official", catalog: "VVCL-2808〜2809",
        officialUrl: "https://equal-love.jp/discography/detail/126/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2808", check: "both", jacket: null,
        tracks: [
          { title: "ラブソングに襲われる", songId: "love-song-ni-osowareru" },
          { title: "Queens", songId: "queens" },
          { title: "木漏れ日メゾフォルテ", songId: "komorebi-mezzoforte" },
          { title: "ラブソングに襲われる -Instrumental-", songId: "love-song-ni-osowareru", instrumental: true },
          { title: "Queens -Instrumental-", songId: "queens", instrumental: true },
          { title: "木漏れ日メゾフォルテ -Instrumental-", songId: "komorebi-mezzoforte", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["LPサイズの20Pフォトブックレット（メンバー全員のソロカットあり）", "B2ポスター", "Type E生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: null, videos: [],
      },
      {
        id: "F", name: "Type-F", format: "CD のみ", edition: null, editionSource: null, catalog: "VVCL-2810",
        officialUrl: "https://equal-love.jp/discography/detail/127/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2810", check: "both", jacket: null,
        notes: ["CD の5曲目：ソニーの商品ページは「カップリングA -Instrumental-」のまま（仮の名前が残っている）。公式サイトの「Queens -Instrumental-」を採用"],
        tracks: [
          { title: "ラブソングに襲われる", songId: "love-song-ni-osowareru" },
          { title: "Queens", songId: "queens" },
          { title: "木漏れ日メゾフォルテ", songId: "komorebi-mezzoforte" },
          { title: "ラブソングに襲われる -Instrumental-", songId: "love-song-ni-osowareru", instrumental: true },
          { title: "Queens -Instrumental-", songId: "queens", instrumental: true },
          { title: "木漏れ日メゾフォルテ -Instrumental-", songId: "komorebi-mezzoforte", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-20", number: 20, kind: "single", title: "劇薬中毒", releaseDate: "2026-04-01",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+DVD", edition: null, editionSource: null, catalog: "VVCL-2870〜2871",
        officialUrl: "https://equal-love.jp/discography/detail/135/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2870", check: "both", jacket: null,
        tracks: [
          { title: "劇薬中毒", songId: "gekiyaku-chudoku" },
          { title: "モラトリアム", songId: "moratorium" },
          { title: "お姫様の作り方", songId: "ohimesama-no-tsukurikata" },
          { title: "劇薬中毒 -Instrumental-", songId: "gekiyaku-chudoku", instrumental: true },
          { title: "モラトリアム -Instrumental-", songId: "moratorium", instrumental: true },
          { title: "お姫様の作り方 -Instrumental-", songId: "ohimesama-no-tsukurikata", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "DVD",
        videos: [
          { id: "single-20-A-1", title: "イコノイジョイ大感謝祭2025 「今日は、全部『内緒バナシ』」", categories: ["event"], keywords: ["イコノイジョイ大感謝祭", "大感謝祭", "内緒バナシ"] },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2872〜2873",
        officialUrl: "https://equal-love.jp/discography/detail/136/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2872", check: "both", jacket: null,
        notes: ["公式サイトの題名は「CD+DVD」だが、同じページの映像の見出しとソニーの表記は「Blu-ray」。CD+Blu-ray として載せる"],
        tracks: [
          { title: "劇薬中毒", songId: "gekiyaku-chudoku" },
          { title: "モラトリアム", songId: "moratorium" },
          { title: "お姫様の作り方", songId: "ohimesama-no-tsukurikata" },
          { title: "劇薬中毒 -Instrumental-", songId: "gekiyaku-chudoku", instrumental: true },
          { title: "モラトリアム -Instrumental-", songId: "moratorium", instrumental: true },
          { title: "お姫様の作り方 -Instrumental-", songId: "ohimesama-no-tsukurikata", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-20-B-1", title: "ウィークエンドシトロン", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 前編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "weekend-citron", series: "fujiq" },
          { id: "single-20-B-2", title: "ヒロインズ", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 前編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "heroines", series: "fujiq" },
          { id: "single-20-B-3", title: "内緒バナシ", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 前編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "naisho-banashi", series: "fujiq" },
          { id: "single-20-B-4", title: "祝祭", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 前編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "shukusai", series: "fujiq" },
          { id: "single-20-B-5", title: "呪って呪って", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 前編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "norotte-norotte", series: "fujiq" },
          { id: "single-20-B-6", title: "Junkies", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 前編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "junkies", series: "fujiq" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2874〜2875",
        officialUrl: "https://equal-love.jp/discography/detail/137/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2874", check: "both", jacket: null,
        notes: ["公式サイトの題名は「CD+DVD」だが、同じページの映像の見出しとソニーの表記は「Blu-ray」。CD+Blu-ray として載せる"],
        tracks: [
          { title: "劇薬中毒", songId: "gekiyaku-chudoku" },
          { title: "モラトリアム", songId: "moratorium" },
          { title: "お姫様の作り方", songId: "ohimesama-no-tsukurikata" },
          { title: "劇薬中毒 -Instrumental-", songId: "gekiyaku-chudoku", instrumental: true },
          { title: "モラトリアム -Instrumental-", songId: "moratorium", instrumental: true },
          { title: "お姫様の作り方 -Instrumental-", songId: "ohimesama-no-tsukurikata", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-20-C-1", title: "ナツマトぺ", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 後編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "natsumatope", series: "fujiq" },
          { id: "single-20-C-2", title: "夏祭り恋慕う", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 後編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "natsumatsuri-koishitau", series: "fujiq" },
          { id: "single-20-C-3", title: "青春″サブリミナル″", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 後編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "seishun-subliminal", series: "fujiq" },
          { id: "single-20-C-4", title: "866", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 後編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "866", series: "fujiq" },
          { id: "single-20-C-5", title: "探せ ダイヤモンドリリー", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 後編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "sagase-diamond-lily", series: "fujiq" },
          { id: "single-20-C-6", title: "絶対アイドル辞めないで", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト 後編", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "zettai-idol-yamenaide", series: "fujiq" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2876〜2877",
        officialUrl: "https://equal-love.jp/discography/detail/138/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2876", check: "both", jacket: null,
        tracks: [
          { title: "劇薬中毒", songId: "gekiyaku-chudoku" },
          { title: "モラトリアム", songId: "moratorium" },
          { title: "お姫様の作り方", songId: "ohimesama-no-tsukurikata" },
          { title: "劇薬中毒 -Instrumental-", songId: "gekiyaku-chudoku", instrumental: true },
          { title: "モラトリアム -Instrumental-", songId: "moratorium", instrumental: true },
          { title: "お姫様の作り方 -Instrumental-", songId: "ohimesama-no-tsukurikata", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-20-D-1", title: "『仲直りシュークリーム』 ライブ映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "nakanaori-shu-cream", series: "kimilove" },
          { id: "single-20-D-2", title: "『キミは＝LOVEを愛せるか!!!』 2025年1月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-20-D-3", title: "『絶対アイドル辞めないで』 ライブ映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "zettai-idol-yamenaide", series: "kimilove" },
          { id: "single-20-D-4", title: "『キミは＝LOVEを愛せるか!!!』 2025年2月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-20-D-5", title: "『ようこそ！イコラブ沼』 ライブ映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "youkoso-ikorabu-numa", series: "kimilove" },
          { id: "single-20-D-6", title: "『キミは＝LOVEを愛せるか!!!』 2025年3月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-20-D-7", title: "『呪って呪って』 ライブ映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "norotte-norotte", series: "kimilove" },
          { id: "single-20-D-8", title: "『キミは＝LOVEを愛せるか!!!』 2025年4月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD のみ", edition: "完全生産限定盤", editionSource: "official", catalog: "VVCL-2878〜2879",
        officialUrl: "https://equal-love.jp/discography/detail/139/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2878", check: "both", jacket: null,
        tracks: [
          { title: "劇薬中毒", songId: "gekiyaku-chudoku" },
          { title: "モラトリアム", songId: "moratorium" },
          { title: "お姫様の作り方", songId: "ohimesama-no-tsukurikata" },
          { title: "劇薬中毒 -Instrumental-", songId: "gekiyaku-chudoku", instrumental: true },
          { title: "モラトリアム -Instrumental-", songId: "moratorium", instrumental: true },
          { title: "お姫様の作り方 -Instrumental-", songId: "ohimesama-no-tsukurikata", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["LPサイズの20Pフォトブックレット（メンバー全員のソロカットあり）", "B2ポスター", "Type E生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: null, videos: [],
      },
      {
        id: "F", name: "Type-F", format: "CD のみ", edition: "通常盤", editionSource: "sony", catalog: "VVCL-2880",
        officialUrl: "https://equal-love.jp/discography/detail/140/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2880", check: "both", jacket: null,
        tracks: [
          { title: "劇薬中毒", songId: "gekiyaku-chudoku" },
          { title: "モラトリアム", songId: "moratorium" },
          { title: "お姫様の作り方", songId: "ohimesama-no-tsukurikata" },
          { title: "劇薬中毒 -Instrumental-", songId: "gekiyaku-chudoku", instrumental: true },
          { title: "モラトリアム -Instrumental-", songId: "moratorium", instrumental: true },
          { title: "お姫様の作り方 -Instrumental-", songId: "ohimesama-no-tsukurikata", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
  {
    workId: "single-21", number: 21, kind: "single", title: "恋、はじめました。", releaseDate: "2026-08-26",
    types: [
      {
        id: "A", name: "Type-A", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2970〜2971",
        officialUrl: "https://equal-love.jp/discography/detail/144/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2970", check: "both", jacket: null,
        tracks: [
          { title: "恋、はじめました。", songId: "koi-hajimemashita" },
          { title: "夏名残サマーチューン", songId: "natsunagori-summer-tune" },
          { title: "夢の続き", songId: "yume-no-tsuzuki" },
          { title: "恋、はじめました。(instrumental)", songId: "koi-hajimemashita", instrumental: true },
          { title: "夏名残サマーチューン (instrumental)", songId: "natsunagori-summer-tune", instrumental: true },
          { title: "夢の続き (instrumental)", songId: "yume-no-tsuzuki", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type A生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-21-A-1", title: "樹愛羅presents 東京プレミアムツアー 前編", categories: ["trip"], keywords: ["東京", "東京プレミアムツアー", "樹愛羅presents"], memberIds: ["saito-kiara"], membersBasis: "題名の「樹愛羅presents」", series: "tokyo-premium" },
        ],
      },
      {
        id: "B", name: "Type-B", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2972〜2973",
        officialUrl: "https://equal-love.jp/discography/detail/145/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2972", check: "both", jacket: null,
        tracks: [
          { title: "恋、はじめました。", songId: "koi-hajimemashita" },
          { title: "夏名残サマーチューン", songId: "natsunagori-summer-tune" },
          { title: "夢の続き", songId: "yume-no-tsuzuki" },
          { title: "恋、はじめました。(instrumental)", songId: "koi-hajimemashita", instrumental: true },
          { title: "夏名残サマーチューン (instrumental)", songId: "natsunagori-summer-tune", instrumental: true },
          { title: "夢の続き (instrumental)", songId: "yume-no-tsuzuki", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type B生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-21-B-1", title: "樹愛羅presents 東京プレミアムツアー 後編", categories: ["trip"], keywords: ["東京", "東京プレミアムツアー", "樹愛羅presents"], memberIds: ["saito-kiara"], membersBasis: "題名の「樹愛羅presents」", series: "tokyo-premium" },
        ],
      },
      {
        id: "C", name: "Type-C", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2974〜2975",
        officialUrl: "https://equal-love.jp/discography/detail/146/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2974", check: "both", jacket: null,
        tracks: [
          { title: "恋、はじめました。", songId: "koi-hajimemashita" },
          { title: "夏名残サマーチューン", songId: "natsunagori-summer-tune" },
          { title: "夢の続き", songId: "yume-no-tsuzuki" },
          { title: "恋、はじめました。(instrumental)", songId: "koi-hajimemashita", instrumental: true },
          { title: "夏名残サマーチューン (instrumental)", songId: "natsunagori-summer-tune", instrumental: true },
          { title: "夢の続き (instrumental)", songId: "yume-no-tsuzuki", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type C生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-21-C-1", title: "Want you！Want you！", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "want-you-want-you", series: "fujiq" },
          { id: "single-21-C-2", title: "お姫様にしてよ！", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "ohimesama-ni-shiteyo", series: "fujiq" },
          { id: "single-21-C-3", title: "Oh！Darling", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "oh-darling", series: "fujiq" },
          { id: "single-21-C-4", title: "恋人以上、好き未満", group: "「8th ANNIVERSARY PREMIUM TOUR」山梨県＠富士急ハイランドコニファーフォレスト", categories: ["live"], keywords: ["富士急ハイランド", "富士急", "コニファーフォレスト", "山梨県", "8th ANNIVERSARY PREMIUM TOUR"], songId: "koibito-ijou-suki-miman", series: "fujiq" },
        ],
      },
      {
        id: "D", name: "Type-D", format: "CD+Blu-ray", edition: null, editionSource: null, catalog: "VVCL-2976〜2977",
        officialUrl: "https://equal-love.jp/discography/detail/147/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2976", check: "both", jacket: null,
        tracks: [
          { title: "恋、はじめました。", songId: "koi-hajimemashita" },
          { title: "夏名残サマーチューン", songId: "natsunagori-summer-tune" },
          { title: "夢の続き", songId: "yume-no-tsuzuki" },
          { title: "恋、はじめました。(instrumental)", songId: "koi-hajimemashita", instrumental: true },
          { title: "夏名残サマーチューン (instrumental)", songId: "natsunagori-summer-tune", instrumental: true },
          { title: "夢の続き (instrumental)", songId: "yume-no-tsuzuki", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["Type D生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: "Blu-ray",
        videos: [
          { id: "single-21-D-1", title: "『「ドライブ デート 都内」』ライブ映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "drive-date-tonai", series: "kimilove" },
          { id: "single-21-D-2", title: "「キミは＝LOVEを愛せるか!!!」2025年5月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-21-D-3", title: "『とくべチュ、して』パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "tokubechu-shite", series: "kimilove" },
          { id: "single-21-D-4", title: "「キミは＝LOVEを愛せるか!!!」2025年6月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-21-D-5", title: "『超特急逃走中』パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "chotokkyu-tousouchu", series: "kimilove" },
          { id: "single-21-D-6", title: "「キミは＝LOVEを愛せるか!!!」2025年7月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
          { id: "single-21-D-7", title: "『恋人以上、好き未満』パフォーマンス映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["live", "tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], songId: "koibito-ijou-suki-miman", series: "kimilove" },
          { id: "single-21-D-8", title: "「キミは＝LOVEを愛せるか!!!」2025年8月放送分ダイジェスト映像", group: "『キミは＝LOVEを愛せるか!!!』", categories: ["tv"], keywords: ["キミは＝LOVEを愛せるか!!!"], series: "kimilove" },
        ],
      },
      {
        id: "E", name: "Type-E", format: "CD のみ", edition: "完全生産限定盤", editionSource: "official", catalog: "VVCL-2978〜2979",
        officialUrl: "https://equal-love.jp/discography/detail/148/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2978", check: "both", jacket: null,
        tracks: [
          { title: "恋、はじめました。", songId: "koi-hajimemashita" },
          { title: "夏名残サマーチューン", songId: "natsunagori-summer-tune" },
          { title: "夢の続き", songId: "yume-no-tsuzuki" },
          { title: "恋、はじめました。(instrumental)", songId: "koi-hajimemashita", instrumental: true },
          { title: "夏名残サマーチューン (instrumental)", songId: "natsunagori-summer-tune", instrumental: true },
          { title: "夢の続き (instrumental)", songId: "yume-no-tsuzuki", instrumental: true },
        ],
        insertsHeading: "【封入物】", inserts: ["LPサイズの20Pフォトブックレット（メンバー全員のソロカットあり）", "B2ポスター", "Type E生写真10種のうち1枚ランダム", "スペシャルプレゼント抽選応募シリアルナンバー"],
        disc: null, videos: [],
      },
      {
        id: "F", name: "Type-F", format: "CD のみ", edition: "通常盤", editionSource: "sony", catalog: "VVCL-2980",
        officialUrl: "https://equal-love.jp/discography/detail/149/", sonyUrl: "https://www.sonymusic.co.jp/artist/equal-love/discography/VVCL-2980", check: "both", jacket: null,
        tracks: [
          { title: "恋、はじめました。", songId: "koi-hajimemashita" },
          { title: "夏名残サマーチューン", songId: "natsunagori-summer-tune" },
          { title: "夢の続き", songId: "yume-no-tsuzuki" },
          { title: "恋、はじめました。(instrumental)", songId: "koi-hajimemashita", instrumental: true },
          { title: "夏名残サマーチューン (instrumental)", songId: "natsunagori-summer-tune", instrumental: true },
          { title: "夢の続き (instrumental)", songId: "yume-no-tsuzuki", instrumental: true },
        ],
        insertsHeading: null, inserts: [],
        disc: null, videos: [],
      },
    ],
  },
];
