// ＝LOVEメンバーの基本プロフィール・固定情報を保持するデータファイル。
// 掲載方針・情報源のルール（公式情報優先、未確認項目は推測で埋めずnull/空のままにする等）は
// docs/HANDOFF.md の2-2章を参照。根拠URL・確認日の詳細はdocs/member-research-notes.md（非公開）参照。
//
// 現役メンバー（status: MEMBER_STATUS.ACTIVE）と卒業メンバー（status: MEMBER_STATUS.GRADUATED）を
// 同じ配列・同じスキーマで管理する。ただし卒業メンバーは掲載する項目自体が少ないため、
// 現役メンバー向けの項目（出席番号・身長・SNS等）を無理に埋める必要はない（HANDOFF 2026-08-02の方針）。
//
// 【ファイル分割方針（2026-08-02）】このファイルは「ほぼ不変の核となる事実」だけを持つ。
// 紹介文・趣味・特技・愛称・ファンネーム・加入前の活動・志望動機は js/data/memberProfiles.js、
// YouTube/SHOWROOM等の活動記録は js/data/memberActivities.js に分離している
// （更新頻度・性質が異なる情報を1ファイルに詰め込まないため）。
//
// センター曲・参加ユニットはこのファイルには一切持たせない。songs.jsのcenter/membersフィールドから
// js/memberUtils.js が都度算出する（songs.jsを唯一の情報源にする、5-1章の設計方針を踏襲）。
//
// memberColor/penlightColorsは { name: "表示用の色名", hex: "スウォッチ・バッジに使うCSSカラー" }
// という形で持たせる（色名テキストと実描画色は別物のため分離）。公式サイトに個人単位の指定が
// 見つからなかったため、SHOWROOM配信・公式ペンライト商品・ライブでの使用状況・ファンの間の定着度を
// 踏まえた代表色を採用している（他の項目とは情報源の性質が異なる、詳細はHANDOFF 2-2章参照）。
//
// profileSourceは、生年月日・出身地・身長・血液型・星座・加入日など、このファイルの大半の項目の
// 根拠となる公式プロフィールページのURLと確認日をまとめて持たせたもの（項目ごとに同じURLを
// 繰り返し書かないための共通化）。個別に異なる根拠が必要な項目（卒業日等）は、
// officialLinks.others に個別のリンクを追加している。
//
// readingは公式サイトのローマ字表記から機械的に変換したもので、厳密には「公式に確認した
// 文字表記」ではない。joinDateは公式ABOUTページの結成発表日「4月29日」に、外部で広く確認できる
// 2017年を組み合わせて採用しており、他の項目より確実性が一段低い（詳細はmember-research-notes.md）。

export const MEMBER_STATUS = {
  ACTIVE: "active",
  GRADUATED: "graduated",
};

const PROFILE_LAST_VERIFIED_DATE = "2026-08-02";

export const MEMBERS = [
  {
    id: "otani-emiri",
    name: "大谷映美里",
    reading: "おおたにえみり",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 1,
    roles: [],
    memberColor: { name: "薄紫", hex: "#c9a8e8" },
    penlightColors: [
      { name: "白", hex: "#e0e0e0" },
      { name: "紫", hex: "#9d6fe0" },
    ],
    birthday: "1998-03-15",
    birthplace: "東京都",
    heightCm: 155,
    bloodType: "O型",
    zodiacSign: "うお座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/otani_emiri"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/otani_emiri",
      x: "https://twitter.com/otani_emiri",
      instagram: "https://www.instagram.com/otani_emiri/",
      tiktok: "https://www.tiktok.com/@equal_love_emiri",
      others: [{ label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_EMIRI_OTANI" }],
    },
  },
  {
    id: "oba-hana",
    name: "大場花菜",
    reading: "おおばはな",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 2,
    roles: [],
    memberColor: { name: "オレンジ", hex: "#ff9f4d" },
    penlightColors: [
      { name: "オレンジ", hex: "#ff9f4d" },
      { name: "青", hex: "#5b9bd9" },
    ],
    birthday: "2000-02-04",
    birthplace: "埼玉県",
    heightCm: 160,
    bloodType: "A型",
    zodiacSign: "みずがめ座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/oba_hana"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/oba_hana",
      x: "https://twitter.com/hana_oba",
      instagram: "https://instagram.com/oba_hana_",
      tiktok: "https://www.tiktok.com/@equal_love_hana_",
      others: [
        { label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_HANA_OBA" },
        { label: "Ameba Blog", url: "https://ameblo.jp/equal-oba/" },
      ],
    },
  },
  {
    id: "otoshima-risa",
    name: "音嶋莉沙",
    reading: "おとしまりさ",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 3,
    roles: [],
    memberColor: { name: "水色", hex: "#7dd3f0" },
    penlightColors: [
      { name: "水色", hex: "#7dd3f0" },
      { name: "濃いピンク", hex: "#e0559a" },
    ],
    birthday: "1998-08-11",
    birthplace: "福岡県",
    heightCm: 160,
    bloodType: "B型",
    zodiacSign: "しし座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/otoshima_risa"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/otoshima_risa",
      x: "https://twitter.com/otoshima_risa",
      instagram: "https://www.instagram.com/otoshima_risa/",
      tiktok: "https://www.tiktok.com/@equal_love_risa_",
      others: [{ label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_RISA_OTOSHIMA" }],
    },
  },
  {
    id: "saito-kiara",
    name: "齋藤樹愛羅",
    reading: "さいとうきあら",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 4,
    roles: [],
    memberColor: { name: "薄ピンク", hex: "#ffb3d1" },
    penlightColors: [{ name: "薄ピンク", hex: "#ffb3d1" }],
    birthday: "2004-11-26",
    birthplace: "栃木県",
    heightCm: 156.2,
    bloodType: "B型",
    zodiacSign: "いて座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/saito_kiara"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/saito_kiara",
      x: "https://twitter.com/saitou_kiara",
      instagram: "https://www.instagram.com/saito_kiara_/",
      tiktok: "https://www.tiktok.com/@equal_love_kiara",
      others: [{ label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_KIARA_SAITO" }],
    },
  },
  {
    id: "sasaki-maika",
    name: "佐々木舞香",
    reading: "ささきまいか",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 5,
    roles: [],
    memberColor: { name: "白", hex: "#e0e0e0" },
    penlightColors: [{ name: "白", hex: "#e0e0e0" }],
    birthday: "2000-01-21",
    birthplace: "愛知県",
    heightCm: 157,
    bloodType: "A型",
    zodiacSign: "みずがめ座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/sasaki_maika"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/sasaki_maika",
      x: "https://twitter.com/sasaki_maika",
      instagram: "https://www.instagram.com/maika_sasaki_",
      tiktok: null,
      others: [
        { label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_MAIKA_SASAKI" },
        { label: "公式トークアプリ", url: "https://portal.web.link.cosm.jp/t/equal-love/talk-rooms/5" },
      ],
    },
  },
  {
    id: "takamatsu-hitomi",
    name: "髙松瞳",
    reading: "たかまつひとみ",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 6,
    roles: [],
    memberColor: { name: "赤", hex: "#ff5c5c" },
    penlightColors: [{ name: "赤", hex: "#ff5c5c" }],
    birthday: "2001-01-19",
    birthplace: "東京都",
    heightCm: 163,
    bloodType: "AB型",
    zodiacSign: "やぎ座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/takamatsu_hitomi"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/takamatsu_hitomi",
      x: "https://twitter.com/takamatsuhitomi",
      instagram: "https://www.instagram.com/takamatsu__hitomi",
      tiktok: null,
      others: [
        { label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_HITOMI_TAKAMATSU" },
        { label: "公式トークアプリ", url: "https://portal.web.link.cosm.jp/t/equal-love/talk-rooms/6" },
      ],
    },
  },
  {
    id: "takiwaki-shoko",
    name: "瀧脇笙古",
    reading: "たきわきしょうこ",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 7,
    roles: [],
    memberColor: { name: "黄色", hex: "#ffd93d" },
    penlightColors: [
      { name: "黄色", hex: "#ffd93d" },
      { name: "オレンジ", hex: "#ff9f4d" },
    ],
    birthday: "2001-07-09",
    birthplace: "神奈川県",
    heightCm: 158,
    bloodType: "O型",
    zodiacSign: "かに座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/takiwaki_shoko"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/takiwaki_shoko",
      x: "https://twitter.com/shoko_takiwaki",
      instagram: "https://www.instagram.com/takiwaki_shoko_/",
      tiktok: null,
      others: [
        { label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_SHOKO_TAKIWAKI" },
        { label: "公式トークアプリ", url: "https://portal.web.link.cosm.jp/t/equal-love/talk-rooms/7" },
      ],
    },
  },
  {
    id: "noguchi-iori",
    name: "野口衣織",
    reading: "のぐちいおり",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 8,
    roles: [],
    memberColor: { name: "紫", hex: "#9d6fe0" },
    penlightColors: [{ name: "紫", hex: "#9d6fe0" }],
    birthday: "2000-04-26",
    birthplace: "茨城県",
    heightCm: 161,
    bloodType: "O型",
    zodiacSign: "おうし座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/noguchi_iori"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/noguchi_iori",
      x: "https://twitter.com/noguchi_iori",
      instagram: "https://www.instagram.com/noguchi_iori_",
      tiktok: null,
      others: [
        { label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_IORI_NOGUCHI" },
        { label: "公式トークアプリ", url: "https://portal.web.link.cosm.jp/t/equal-love/talk-rooms/8" },
      ],
    },
  },
  {
    id: "morohashi-sana",
    name: "諸橋沙夏",
    reading: "もろはしさな",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 9,
    roles: [],
    memberColor: { name: "黄緑", hex: "#b5d94a" },
    penlightColors: [{ name: "黄緑", hex: "#b5d94a" }],
    birthday: "1996-08-03",
    birthplace: "福島県",
    heightCm: 158,
    bloodType: "B型",
    zodiacSign: "しし座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/morohashi_sana"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/morohashi_sana",
      x: "https://twitter.com/morohashi_sana",
      instagram: "https://instagram.com/morohashi_sana/",
      tiktok: null,
      others: [
        { label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_SANA_MOROHASHI" },
        { label: "公式トークアプリ", url: "https://portal.web.link.cosm.jp/t/equal-love/talk-rooms/9" },
      ],
    },
  },
  {
    id: "yamamoto-anna",
    name: "山本杏奈",
    reading: "やまもとあんな",
    status: MEMBER_STATUS.ACTIVE,
    attendanceNumber: 10,
    roles: ["リーダー"],
    memberColor: { name: "青", hex: "#5b9bd9" },
    penlightColors: [
      { name: "黄色", hex: "#ffd93d" },
      { name: "青", hex: "#5b9bd9" },
    ],
    birthday: "1997-11-30",
    birthplace: "広島県",
    heightCm: 149.5,
    bloodType: "A型",
    zodiacSign: "いて座",
    joinDate: "2017-04-29",
    profileSource: { urls: ["https://equal-love.jp/feature/yamamoto_anna"], lastVerifiedDate: PROFILE_LAST_VERIFIED_DATE },
    officialLinks: {
      profile: "https://equal-love.jp/feature/yamamoto_anna",
      x: "https://twitter.com/yamamoto_anna_",
      instagram: "https://instagram.com/yamamoto_anna_/",
      tiktok: "https://www.tiktok.com/@equal_love_anna",
      others: [
        { label: "SHOWROOM", url: "https://www.showroom-live.com/LOVE_ANNA_YAMAMOTO" },
        { label: "公式トークアプリ", url: "https://portal.web.link.cosm.jp/t/equal-love/talk-rooms/10" },
      ],
    },
  },
  // ---- ここから卒業メンバー（簡易プロフィールのみ、13章参照） ----
  {
    id: "satake-nonno",
    name: "佐竹のん乃",
    reading: "さたけのんの",
    status: MEMBER_STATUS.GRADUATED,
    memberColor: { name: "青", hex: "#5b9bd9" },
    activePeriod: { start: "2017-04-29", end: "2021-03-06" },
    graduationDate: "2021-03-06",
    officialLinks: {
      others: [
        { label: "卒業のご報告（公式サイト）", url: "https://equal-love.jp/news/detail/3733" },
        { label: "卒業コンサート告知（公式サイト）", url: "https://equal-love.jp/news/detail/3768" },
      ],
    },
  },
  {
    id: "saito-nagisa",
    name: "齊藤なぎさ",
    reading: "さいとうなぎさ",
    status: MEMBER_STATUS.GRADUATED,
    memberColor: { name: "ピンク", hex: "#ff8fc0" },
    activePeriod: { start: "2017-04-29", end: "2023-01-13" },
    graduationDate: "2023-01-13",
    // 卒業後も芸能活動を継続しているため、現在の所属・公式リンクを追加で持たせている
    // （13章参照：他の卒業メンバーより情報量を増やす方針。事務所は変わりうるため要再確認日を保持）。
    currentAffiliation: "エヴァーグリーン・エンタテイメント",
    currentInfoSource: { urls: ["https://www.evergreen-e.com/feature/saito_nagisa"], lastVerifiedDate: "2026-08-02" },
    officialLinks: {
      profile: "https://www.evergreen-e.com/feature/saito_nagisa",
      x: "https://x.com/saito_nagisa",
      instagram: "https://www.instagram.com/saitou_nagisa",
      tiktok: "https://www.tiktok.com/@equal_love_nagisa",
      others: [
        { label: "卒業コンサート特設サイト（公式サイト）", url: "https://equal-love.jp/feature/specialsite_graduation_concert" },
      ],
    },
  },
];
