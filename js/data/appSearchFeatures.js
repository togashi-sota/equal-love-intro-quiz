// 全体検索（アプリ内検索）で「機能」「設定」として見つけられる項目（2026-10-23新設）。
// 他のデータファイル（曲・メンバー・CM等）から組み立てられない「アプリの機能そのもの」だけをここに書く。
// 特別モード（苦手曲モード等）は js/specialModesScreen.js の SPECIAL_MODES から自動で組み立てるため、
// ここには書かない（名前・説明の二重管理を避けるため）。
//
// action（「この機能を開く」ボタンで何をするか）：
//   { type: "click", selector }        … ホーム画面の既存ボタンを押したのと同じ動きをする（画面の準備処理を共通化するため）
//   { type: "homeSection", selector }  … ホーム画面の該当欄（折りたたみ）を開いてその位置へ移動する
//   { type: "specialMode", modeId }    … 特別モードを開く（ホームのモードカードを押したのと同じ）
//   { type: "lyricsSearch" }           … 歌詞検索を開く（歌詞データの読み込みを待ってから画面を判定するため専用）
// aliases：利用者が入力しそうな別の言い方（表記揺れ・略称）。

export const APP_SEARCH_FEATURE_CATEGORY = {
  FEATURE: "feature",
  SETTING: "setting",
};

const FEATURE = APP_SEARCH_FEATURE_CATEGORY.FEATURE;
const SETTING = APP_SEARCH_FEATURE_CATEGORY.SETTING;

export const APP_SEARCH_FEATURES = [
  {
    id: "feature-intro-quiz",
    category: FEATURE,
    title: "イントロクイズ（通常プレイ）",
    aliases: ["クイズ", "スタート", "出題数", "カテゴリ"],
    description: "曲のイントロを聴いて曲名を4択から当てる、基本の遊び方です。ホームの「ゲームで遊ぶ」の「イントロクイズ」で出題数とカテゴリを選んで「この設定でスタート」を押します（前回の設定を覚えています）。",
    action: { type: "homeSection", selector: "#home-intro-panel" },
  },
  {
    id: "feature-songlist",
    category: FEATURE,
    title: "収録曲一覧",
    aliases: ["曲一覧", "曲を聴く", "試聴", "曲検索"],
    description: "全曲を作品ごとに一覧できます。曲名で探したり、試聴・お気に入り登録ができます。",
    action: { type: "click", selector: "#songlist-link" },
  },
  {
    id: "feature-lyrics-search",
    category: FEATURE,
    title: "歌詞検索",
    aliases: ["歌詞", "歌詞から探す", "歌詞を検索"],
    description: "歌詞の一部から曲を探せます。端末に読み込んだ歌詞データだけを使い、検索した言葉は外部へ送りません。",
    action: { type: "lyricsSearch" },
  },
  {
    id: "feature-favorites",
    category: FEATURE,
    title: "お気に入り",
    aliases: ["ハート", "好きな曲"],
    description: "♡を付けた曲をまとめて見られます。",
    action: { type: "click", selector: "#songlist-favorites-link" },
  },
  {
    id: "feature-playlist",
    category: FEATURE,
    title: "プレイリスト",
    aliases: ["プレイリスト作成", "曲をまとめる"],
    description: "好きな曲を集めたプレイリストを作れます。",
    action: { type: "click", selector: "#playlist-link" },
  },
  {
    id: "feature-offline-player",
    category: FEATURE,
    title: "オフラインプレイヤー",
    aliases: ["連続再生", "プレイヤー", "通信なし"],
    description: "端末に読み込んだ音源を、通信なしで続けて再生できます。",
    action: { type: "click", selector: "#continuous-play-link" },
  },
  {
    id: "feature-fan-profiles",
    category: FEATURE,
    title: "フレンド",
    aliases: ["友達", "フレンド一覧", "オンライン状態", "招待"],
    description: "同じアプリで遊んでいる人の一覧です。オンライン中の人を対戦に招待できます。",
    action: { type: "click", selector: "#fan-profiles-link" },
  },
  {
    id: "feature-leaderboard",
    category: FEATURE,
    title: "ランキング",
    aliases: ["順位", "タイムアタックランキング", "クリアタイム"],
    description: "タイムアタックのクリアタイムの順位を見られます。",
    action: { type: "click", selector: "#home-leaderboard-link" },
  },
  {
    id: "feature-achievements",
    category: FEATURE,
    title: "称号一覧",
    aliases: ["称号", "実績", "トロフィー"],
    description: "獲得した称号と、まだ獲得していない称号の条件を見られます。",
    action: { type: "click", selector: "#title-list-link" },
  },
  {
    id: "feature-play-history",
    category: FEATURE,
    title: "プレイ履歴",
    aliases: ["履歴", "記録", "成績"],
    description: "これまでに遊んだクイズの結果を振り返れます。",
    action: { type: "click", selector: "#history-link" },
  },
  {
    id: "feature-about",
    category: FEATURE,
    title: "＝LOVEについて",
    aliases: ["イコラブ", "イコールラブ", "年表", "作品一覧", "ディスコグラフィー"],
    description: "＝LOVEのプロフィール・年表・作品一覧・CM・広告をまとめたページです（ライブの記録は【ライブ】ページにまとめています）。",
    action: { type: "click", selector: "#discography-link" },
  },
  {
    // 【2026-10-28新設】【ライブ】ページ（js/liveHubScreen.js）
    id: "feature-live-hub",
    category: FEATURE,
    title: "ライブ（過去の公演・セットリスト・ライブ映像）",
    aliases: ["ライブ", "ライブ履歴", "過去のライブ", "公演", "セットリスト", "セトリ", "ライブ映像", "ブルーレイ", "Blu-ray", "DVD", "映像作品"],
    description: "過去の公演・セットリスト・曲からライブを探す・ライブ映像（Blu-ray／DVD・公式配信）を、目的から調べられるページです。",
    action: { type: "click", selector: "#live-hub-link" },
  },
  {
    id: "feature-members",
    category: FEATURE,
    title: "メンバー紹介",
    aliases: ["メンバー", "プロフィール", "ペンライトカラー", "メンバーカラー"],
    description: "メンバーのプロフィール・メンバーカラー・ペンライトカラー・個人活動を見られます。",
    action: { type: "click", selector: "#members-link" },
  },
  {
    // 【2026-10-27新設】歴代センター一覧（js/centersScreen.js）。入口は「＝LOVEについて」の作品一覧タブ
    id: "feature-centers",
    category: FEATURE,
    title: "歴代センター一覧",
    aliases: ["センター", "歴代センター", "センター一覧", "センター曲", "Wセンター", "ダブルセンター"],
    description: "シングル・アルバム・配信曲のセンターを発売順に一覧できます。メンバーで絞り込めて、根拠（公式・報道・ファン資料のみ 等）も表示します。",
    action: { type: "click", selector: "#centers-link" },
  },
  {
    id: "feature-call-guide",
    category: FEATURE,
    title: "コールガイド（ライブコールモード）",
    aliases: ["コール", "ミックス", "口上", "コール表"],
    description: "歌詞と一緒に、ライブでのコールのタイミングを確認できます（コールデータが必要です）。",
    action: { type: "specialMode", modeId: "liveCallMode" },
  },
  {
    // 【2026-10-24新設】ライブ初心者ガイド（js/liveGuideScreen.js）
    id: "feature-live-guide",
    category: FEATURE,
    title: "ライブ初心者ガイド",
    aliases: [
      "ライブ",
      "初ライブ",
      "初参戦",
      "ライブ初心者",
      "持ち物",
      "ペンライト",
      "メンバーカラー",
      "マナー",
      "注意事項",
      "モバイルオーダー",
      "グッズ",
      "物販",
      "何時に行く",
      "電子チケット",
      "本人確認",
      "レス",
      "ファンサ",
      "声出し",
    ],
    description: "初めて＝LOVEのライブに行く人向けのガイドです。準備・持ち物チェック・到着時間の目安・グッズとモバイルオーダー・ペンライト・コール・マナーをまとめています。",
    action: { type: "click", selector: "#live-guide-link" },
  },
  {
    id: "feature-guide",
    category: FEATURE,
    // 【2026-10-31】アプリ全体の説明書に作り直した（名前もホームの入口と同じ「遊び方・機能ガイド」）
    title: "遊び方・機能ガイド",
    aliases: ["ガイド", "使い方", "使い方ガイド", "遊び方ガイド", "ヘルプ", "説明書", "よくある質問", "FAQ", "困ったとき", "検索の使い分け"],
    description: "アプリ全体の使い方（はじめての人の流れ・各機能・検索の使い分け・よくある質問・データの保存と引き継ぎ・困ったとき）をまとめたページです。",
    action: { type: "click", selector: "#guide-link" },
  },
  {
    // 【2026-10-31新設】ゲームの遊び方・記録（js/gameGuideScreen.js）。ホームの［ゲームの遊び方・記録］と同じ処理
    id: "feature-game-guide",
    category: FEATURE,
    title: "ゲームの遊び方・記録",
    aliases: ["遊び方", "ルール", "点数", "ゲームの説明", "あそびかた"],
    description: "全部のゲームのモードについて、正解の条件・操作・設定・点数・記録される場所などをまとめたページです。",
    action: { type: "click", selector: '[data-home-action="all-games"]' },
  },
  {
    id: "feature-rules",
    category: FEATURE,
    title: "あそびかた・とくてんのルール",
    aliases: ["ルール", "得点", "点数", "ランク"],
    description: "イントロクイズの得点の付き方とランクの区切りを確認できます。",
    action: { type: "click", selector: "#rules-link" },
  },
  {
    id: "setting-sound",
    category: SETTING,
    title: "サウンド設定（効果音の詳細設定）",
    aliases: ["効果音", "音量", "サウンド", "テーマ", "ミュート", "設定"],
    description: "効果音のON/OFF・音量・テーマなどを変更できます。",
    action: { type: "click", selector: "#sfx-settings-open-button" },
  },
  {
    id: "setting-player-name",
    category: SETTING,
    title: "プレイヤー名の変更",
    aliases: ["名前", "ニックネーム", "表示名", "プレイヤー"],
    description: "ホーム上部のプレイヤー名を押すと変更できます。",
    action: { type: "click", selector: "#player-name-chip" },
  },
  {
    id: "setting-oshi",
    category: SETTING,
    title: "推しメンの登録",
    aliases: ["推し", "推しメン", "推し変"],
    description: "推しメンを登録すると、ホームやプロフィールに表示されます。",
    action: { type: "click", selector: "#oshi-summary-chip" },
  },
  {
    id: "setting-friend-public",
    category: SETTING,
    title: "フレンドへの公開設定",
    aliases: ["公開", "非公開", "公開設定", "プロフィール公開"],
    description: "フレンド画面の「公開設定」で、自分をフレンド一覧に表示するかを切り替えられます。",
    action: { type: "click", selector: "#fan-profiles-link" },
  },
  {
    id: "setting-data-import",
    category: SETTING,
    title: "音源・歌詞データの読み込み（データ管理）",
    aliases: ["データ管理", "音源", "歌詞データ", "データパック", "読み込み", "インポート"],
    description: "音源・歌詞・コールのデータを端末に読み込みます。ホームの「マイページ・データ」の「データを追加・更新」から開けます（設定・データ管理の画面）。",
    action: { type: "homeSection", selector: ".data-management-section" },
  },
  {
    id: "setting-device-transfer",
    category: SETTING,
    title: "機種変更・データ引き継ぎ",
    aliases: ["機種変更", "引き継ぎ", "移行", "バックアップ"],
    description: "新しい端末へプレイデータを引き継ぐ手順です。",
    action: { type: "homeSection", selector: "#device-transfer-section" },
  },
  {
    id: "setting-data-recovery",
    category: SETTING,
    title: "データの復旧",
    aliases: ["復旧", "復元", "データが消えた", "バックアップ"],
    description: "旧端末が使えない・データが消えてしまった場合の復旧方法です。",
    action: { type: "homeSection", selector: "#data-recovery-section" },
  },
];
