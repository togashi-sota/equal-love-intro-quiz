// 「遊び方・機能ガイド」（アプリ全体の使い方。js/guideScreen.js が描く）の中身（2026-08-15新設）。
//
// 【2026-10-31 全面改訂・本人の依頼 C】アプリ全体の説明書として作り直した。
//   構成：概要 → はじめての人の流れ → カテゴリ別の目次 → 各機能 → 検索の使い分け → よくある質問
//         → データの保存と引き継ぎ → 困ったとき。
//   ・画面の名前・ボタンの名前は、今の画面（index.html・各画面の js）と同じものを書く。
//   ・数（曲数・称号の数など）は文に書かず、画面が今のデータから数えて差し込む（{count:all} など。js/guideScreen.js）。
//   ・ゲームの説明は js/data/gameGuideContent.js だけに書く（同じ説明を2か所に持たない）。
//     このファイルのゲームの項目は、そこから短い紹介を作る（buildGameSection）。詳しくは「ゲームの遊び方・記録」へ。
//   ・管理者だけの機能・開発中の機能（バックアップ管理・音源診断ログ・URL の切り替え・開発者・上級者向けの読み込み・
//     アカウントの保護〈一部の人にだけ出る〉など）は載せない。
//   ・全体検索（js/appSearchIndex.js）は GUIDE_SECTIONS の全項目を「ガイド」として検索に出す。id は以前のものを残している
//     （検索結果の「ガイドで詳しく見る」が壊れないように）。
//
// 1項目の形：
//   id       … 項目の名前（目次から・検索から開くときに使う）
//   icon     … 見出しに添える絵文字
//   title    … 見出し（よくある質問では質問そのもの）
//   tagline  … 一言の説明（よくある質問では省略可）
//   where    … どこから開くか（画面の名前とボタンの名前）。無い項目もある
//   steps    … 手順・説明（上から順に表示。よくある質問では答え）
//   point    … 補足（コツ・注意）
//   kind     … "faq"（質問と答え）／"search"（検索の使い分け。search に表の中身）／"game"（ゲームの短い紹介）
//   actions  … 「開く」ボタン（{ label, open }。open の形は js/guideScreen.js の runGuideOpen を参照）
//   gameModeId … kind:"game" のとき、js/data/gameGuideContent.js のモードの id
import { GAME_GUIDE_MODES, LYRICS_BATTLE_RULES, ONLINE_BATTLE_MODES, getGameGuideModeById } from "./gameGuideContent.js";

// 【2026-09-15新設・本人指示：アプリ紹介動画への導線】ガイドの上の「アプリ紹介動画」カードのデータ。
// 動画はポートフォリオ制作用の別チャットで完成した5分44秒版（V6_15_FULL_FINAL・2026-09-17に差し替え）で、
// YouTubeへ限定公開したもの。動画自体はこのリポジトリでは編集・管理しない（勝手に消さない）。
// URLはここに1箇所だけ持ち、カードのhrefはjs/guideScreen.jsがこの値から設定する。
// 【2026-10-31】動画は2026年9月の画面。その後ホーム（案F）・コールを覚える（3つのモード）・データの入れ方（最新版データ）が
// 変わったので、注意書きを今の違いに合わせた（差し替えの候補として本人へ報告済み）。
export const GUIDE_VIDEO = {
  url: "https://www.youtube.com/watch?v=2__t1a39MTg",
  title: "アプリ紹介動画",
  durationLabel: "約5分44秒",
  description: "約5分44秒で主な機能をひと通り見られます。",
  note: "※2026年9月の画面です。ホームの見た目・「コールを覚える」・データの入れ方などは今と違います。後半は制作の裏側です。",
  ctaLabel: "動画を見る",
  externalLabel: "YouTube・新しいタブで開きます",
  offlineMessage: "オフラインのため動画を開けません",
};

// アプリの概要（ガイドのいちばん上）。{count:…} は画面が今のデータから数えて入れる
export const GUIDE_OVERVIEW = {
  lead: "＝LOVEの曲で遊ぶイントロクイズと、ライブ・楽曲・メンバーの情報をまとめたファンアプリです。",
  points: [
    { icon: "🎮", title: "ゲーム", text: "イントロクイズほか、1人用・対戦・問題づくり・コール練習（{count:all}曲から出題）" },
    { icon: "📣", title: "ライブ", text: "コールを覚える（コール表・ライブコール・カラオケ）、ライブ履歴・セトリ、はじめてのライブ" },
    { icon: "🎵", title: "楽曲", text: "曲を聴く・歌詞を読む・歌詞から探す・プレイリスト" },
    { icon: "💗", title: "＝LOVE情報", text: "メンバー・歴代センター・周年ヒストリー・CD売上・音楽番組・CM" },
    { icon: "🛡", title: "マイ・データ", text: "プレイ履歴・称号（{count:achievements}個）・データの追加と引き継ぎ" },
  ],
  storageNote:
    "音源・歌詞・コールは、配られたデータをこの端末に入れて使います（アプリの公開ページには入っていません）。端末の中だけに保存されるので、ほかの人に送られることはありません。",
};

// はじめての友達の流れ（順番どおりに表示する）
export const GUIDE_FIRST_STEPS = [
  {
    title: "アプリを開く",
    text: "配られたURLを、iPhone は Safari、Android は Chrome で開きます。",
  },
  {
    title: "ホーム画面に追加する",
    text: "iPhone：Safari の共有ボタン →「ホーム画面に追加」。Android：Chrome のメニュー →「ホーム画面に追加」または「アプリをインストール」。次からはホーム画面のアイコンで開けます。",
  },
  {
    title: "名前と推しメンを登録する",
    text: "はじめて開くと「はじめにプロフィールを設定しよう！」が出ます。プレイヤー名（20文字まで）と推しメンを選んで［このプロフィールでゲームを始める］。あとからホームの上の名前を押すと変えられます。",
    open: { click: "player-name-chip" },
    openLabel: "プレイヤー設定を開く",
  },
  {
    title: "データを入れる",
    text: "配られた ZIP をまず端末に保存します。ホームの「マイページ・データ」→［データを追加・更新］→ ZIP の種類に合ったボタンで選びます（「最新版データ」なら［最新版データを読み込む］、full.zip・21st.zip などなら［追加データパックを読み込む］）。",
    open: { home: "data-update" },
    openLabel: "データを追加・更新へ",
    link: { href: "guide-data-pack.html", label: "画像つきの入れ方" },
  },
  {
    title: "入ったか確かめる",
    text: "［データの状態を確かめる］で、音源・歌詞・コール表が何曲入ったか、足りない曲はどれかが分かります（何も変えません）。",
    open: { home: "data-status" },
    openLabel: "データの状態を確かめる",
  },
  {
    title: "イントロクイズで遊ぶ",
    text: "ホームの「イントロクイズ」で出題数とカテゴリを選んで［この設定でスタート］。",
    open: { intro: true },
    openLabel: "イントロクイズへ",
  },
  {
    title: "ほかのモードも遊ぶ",
    text: "「ゲームで遊ぶ」に、ほかのゲームも並んでいます。ルールは［ゲームの遊び方・記録］で1つずつ見られます。",
    open: { gameGuide: "" },
    openLabel: "ゲームの遊び方・記録",
  },
  {
    title: "オンライン対戦をする",
    text: "「オンライン対戦」→［ルームを作る］で出た6文字のコードを友達に伝え、友達は［ルームに参加する］で入れます。",
    open: { gameGuide: "onlineBattle" },
    openLabel: "オンライン対戦の遊び方",
  },
  {
    title: "履歴・称号を見る",
    text: "ホームの［プレイ履歴］で今までの結果、上の［実績］で称号が見られます。",
    open: { home: "history" },
    openLabel: "プレイ履歴を見る",
  },
  {
    title: "データが消えたとき",
    text: "記録・称号などは自動でバックアップされ、［引き継ぎ・復旧］で戻せます。音源・歌詞・コールはバックアップされないので、配られたデータを入れ直します。",
    open: { guideSection: "storageWhere" },
    openLabel: "保存の仕組みを読む",
  },
];

// ゲームの項目：js/data/gameGuideContent.js のモードから短い紹介を作る（説明の本体はそちらだけに書く）
const GAME_SECTION_ICONS = {
  intro: "🎧",
  randomPlayback: "🔀",
  lyricsQuiz: "📝",
  outroQuiz: "🎼",
  instantChallenge: "⚡",
  timeAttack: "⏱️",
  weakSongs: "🎯",
  onlineBattle: "🌐",
  partyBattle: "🎉",
  originalQuiz: "✏️",
  liveCallMode: "📣",
};

function buildGameSection(modeId, overrides = {}) {
  const mode = getGameGuideModeById(modeId);
  return {
    id: modeId,
    kind: "game",
    gameModeId: modeId,
    icon: GAME_SECTION_ICONS[modeId] ?? "🎮",
    title: mode.title,
    tagline: mode.catch,
    where: mode.items.start[0],
    steps: [...mode.keyPoints],
    point: "ルール・点数・記録の場所は「ゲームの遊び方・記録」で詳しく見られます。",
    actions: [
      { label: "このゲームを遊ぶ", open: mode.play.type === "intro" ? { intro: true } : { mode: mode.play.modeId }, primary: true },
      { label: "詳しい遊び方", open: { gameGuide: modeId } },
    ],
    ...overrides,
  };
}

export const GUIDE_CATEGORIES = [
  {
    id: "games",
    label: "ゲーム",
    icon: "🎮",
    lead: "1人で遊ぶクイズ。ルールの詳しい説明は「ゲームの遊び方・記録」にまとめています。",
    sectionIds: ["intro", "randomPlayback", "lyricsQuiz", "outroQuiz", "instantChallenge", "timeAttack", "weakSongs", "originalQuiz"],
  },
  {
    id: "online",
    label: "オンライン・交流",
    tocLabel: "オンライン・|交流",
    icon: "🌐",
    lead: "友達との対戦と、フレンド・ランキング・称号。",
    sectionIds: ["onlineBattle", "onlineBattleModes", "partyBattle", "roomInvite", "fanProfiles", "onlineStatus", "timeAttackLeaderboard", "achievements"],
  },
  {
    id: "live",
    label: "ライブ",
    icon: "📣",
    lead: "コールの練習と、ライブの記録・はじめての人向けの案内。",
    sectionIds: ["liveCallMode", "liveCallSheet", "liveCallLive", "liveCallKaraoke", "callGuide", "liveHub", "liveGuide"],
  },
  {
    id: "music",
    label: "楽曲",
    icon: "🎵",
    lead: "曲を聴く・歌詞を読む・まとめる。",
    sectionIds: ["songlist", "lyricsView", "favorites", "playlists", "offlinePlayer", "miniPlayer", "works"],
  },
  {
    id: "info",
    label: "＝LOVE情報",
    tocLabel: "＝LOVE|情報",
    icon: "💗",
    lead: "メンバーとグループの歩み。音源が無くても見られます。",
    sectionIds: ["members", "centers", "anniversary", "cdSales", "tvAppearances", "commercials", "aboutGroup"],
  },
  {
    id: "mydata",
    label: "マイ・データ",
    tocLabel: "マイ・|データ",
    icon: "🛡",
    lead: "記録を見る・データを入れる・設定する。",
    sectionIds: ["playHistory", "selfBest", "players", "dataPackImport", "dataStatus", "settings"],
  },
  {
    id: "search",
    label: "検索の使い分け",
    tocLabel: "検索の|使い分け",
    icon: "🔍",
    lead: "探したいものによって、使う検索が違います。",
    sectionIds: ["searchApp", "searchLyrics", "searchSongs", "searchLive", "searchHistory", "searchInPage"],
  },
  {
    id: "faq",
    label: "よくある質問",
    tocLabel: "よくある|質問",
    icon: "❓",
    lead: "",
    sectionIds: ["faqWhatData", "faqReady", "faqLeaveVsHome", "faqRematch", "faqProfilePublic", "faqTieBreak", "faqDataMismatch", "faqDataPack"],
  },
  {
    id: "storage",
    label: "データの保存と引き継ぎ",
    tocLabel: "データの保存と|引き継ぎ",
    icon: "💾",
    lead: "どこに何が保存されるか、機種変更のときどうするか。",
    sectionIds: ["storageWhere", "faqBackup", "deviceTransfer", "backupRestore"],
  },
  {
    id: "trouble",
    label: "困ったとき",
    icon: "🆘",
    lead: "",
    sectionIds: ["faqNoSound", "troubleNoLyrics", "troubleNoCalls", "faqDisconnect", "troubleDataGone", "troubleBack"],
  },
];

// 検索の使い分けの表の行（kind:"search" の search の key と見出し）
export const GUIDE_SEARCH_FIELDS = [
  { key: "where", label: "どこから開く" },
  { key: "input", label: "入れるもの" },
  { key: "target", label: "探す対象" },
  { key: "notTarget", label: "対象ではないもの" },
  { key: "results", label: "結果とできること" },
  { key: "filter", label: "絞り込み" },
  { key: "fuzzy", label: "表記の揺れ・打ち間違い" },
  { key: "device", label: "どこで探すか" },
  { key: "needs", label: "必要なデータ" },
];

// 検索の項目：表の中身から、全体検索用の文（steps）も作る
function buildSearchSection(section) {
  const steps = GUIDE_SEARCH_FIELDS.filter((field) => section.search[field.key]).map((field) => `${field.label}：${section.search[field.key]}`);
  return { kind: "search", ...section, steps };
}

export const GUIDE_SECTIONS = [
  // ===== ゲーム（説明の本体は js/data/gameGuideContent.js） =====
  buildGameSection("intro"),
  buildGameSection("randomPlayback"),
  buildGameSection("lyricsQuiz"),
  buildGameSection("outroQuiz"),
  buildGameSection("instantChallenge"),
  buildGameSection("timeAttack"),
  buildGameSection("weakSongs"),
  buildGameSection("originalQuiz"),

  // ===== オンライン・交流 =====
  buildGameSection("onlineBattle", { title: "オンライン対戦：ルームの基本" }),
  {
    id: "onlineBattleModes",
    icon: "🎮",
    title: "オンライン対戦：モード・ルール一覧",
    tagline: "ロビーの「対戦モード」で、6つの対戦モードから選べます（ホストが待っている間・結果の画面で変えられる）。",
    where: "オンライン対戦のロビー →「対戦モード」。ロビーの［ルール・遊び方］で詳しいルールが見られます",
    steps: ONLINE_BATTLE_MODES.map((mode) => `${mode.name}：${mode.text}`),
    // 全体検索・テストが読む文。歌詞クイズ対戦の3ルールは js/data/gameGuideContent.js の LYRICS_BATTLE_RULES から作る（同じ説明を2か所に書かない）
    point: `歌詞クイズ対戦の3ルール — ${LYRICS_BATTLE_RULES.map((rule) => `${rule.name}：${rule.text}。`).join("")}`,
    actions: [{ label: "詳しい遊び方", open: { gameGuide: "onlineBattle" } }],
  },
  buildGameSection("partyBattle"),
  {
    id: "roomInvite",
    icon: "📨",
    title: "フレンドを招待する",
    tagline: "コードを伝えなくても、フレンドを対戦に誘えます。",
    where: "オンライン対戦のロビー［友達を招待］（ホストだけ）／ホームの上の「フレンド」→ 相手のカードの［一緒に遊ぶ］",
    steps: [
      "ロビーの［友達を招待］：ホストが、フレンドに今のルームへの招待を送る。招待された人はコードを入れずに参加できる（招待は5分有効）",
      "フレンドの［一緒に遊ぶ］：相手がオンライン・プレイ中のときだけ出る。相手が［参加する］を押すとルームができる（招待は5分有効・1度に1人）",
      "相手が遊んでいる最中なら、終わってから知らせが出る",
    ],
    point: "招待を使うには、自分も相手もフレンドの公開設定を ON にしておきます。",
    actions: [{ label: "フレンドを開く", open: { click: "fan-profiles-link" } }],
  },
  {
    id: "fanProfiles",
    icon: "👥",
    title: "フレンド・公開プロフィール",
    tagline: "このアプリで遊んでいるほかの人の、表示名・推し・称号を見られます。",
    where: "ホームのいちばん上の「フレンド」",
    steps: [
      "一覧の下の「公開設定」を ON にすると、自分の表示名・推し・称号・入れた曲の数（音源・歌詞・コール表の数だけ）が、ほかの人に見えるようになる",
      "ほかの人のカードを押すと詳しく見られる",
      "OFF にすると、公開プロフィールとオンライン状態の公開は消える",
    ],
    point: "メールアドレスなどの個人情報は公開されません。",
    actions: [{ label: "フレンドを開く", open: { click: "fan-profiles-link" } }],
  },
  {
    id: "onlineStatus",
    icon: "🟢",
    title: "オンライン状態",
    tagline: "フレンドが今アプリを開いているかが分かります。",
    where: "ホームの上の「フレンド」の一覧",
    steps: ["プレイ中・オンライン・通信不明・最後に見た時刻、のどれかが出る", "オンライン・プレイ中の人には［一緒に遊ぶ］で招待できる"],
    point: "公開設定が ON の人だけが表示されます。",
    actions: [{ label: "フレンドを開く", open: { click: "fan-profiles-link" } }],
  },
  {
    id: "timeAttackLeaderboard",
    icon: "🏆",
    title: "ランキング",
    tagline: "全問正解・ミス0のクリアタイムを、ほかの人と比べられます（上位10位まで）。",
    where: "ホームのいちばん上の「ランキング」／タイムアタックの設定画面の［ランキングを見る］",
    steps: [
      "出題タイプ（イントロ・ランダム再生・アウトロ）・出題数・カテゴリで表を切り替える",
      "対象：イントロクイズ・アウトロクイズ・ランダム再生クイズ・タイムアタック（ルールは問わない）で、全問正解・ミス0（スキップ・答えを見るも使わない）の回",
      "歌詞クイズ・一瞬チャレンジ・対戦は対象外",
    ],
    point: "フレンドの公開設定が ON のときだけ載ります。OFF の間の記録は端末に残り、ON にしたときに送られます。",
    actions: [{ label: "ランキングを開く", open: { click: "home-leaderboard-link" } }],
  },
  {
    id: "achievements",
    icon: "🏅",
    title: "称号（実績）",
    tagline: "決まった条件を達成すると称号がもらえます（全{count:achievements}個）。",
    where: "ホームのいちばん上の「実績」",
    steps: [
      "3つのまとまり：ステップアップ（5つの系統 × ビギナー・チャレンジャー・エース）／＝LOVEマスターへの道／裏チャレンジ",
      "それぞれの称号を押すと、達成の条件が見られる",
      "条件を満たすと自動でもらえる",
    ],
    point: "ステップアップは、イントロ・アウトロ・シャッフル（ランダム再生）・リリック（歌詞）・一瞬の5系統です。対戦・苦手曲・問題をつくるの結果は称号に入りません。",
    actions: [{ label: "実績を開く", open: { click: "title-list-link" } }],
  },

  // ===== ライブ（2026-10-31 live-unify の仕様） =====
  buildGameSection("liveCallMode", {
    tagline: "曲を選んで、コール表・ライブコール・カラオケの3つでコールを練習します。入口は1つ（ゲームの欄とライブの欄の両方にある）。",
    where: "ホームの「ライブを楽しむ」→［コールを覚える］（「ゲームで遊ぶ」の「コールを覚える」も同じ）",
    point: "前の版（同期モード・カラオケ同期）は、曲の一覧のいちばん下の［今までの版を開く］から使えます。",
  }),
  {
    id: "liveCallSheet",
    icon: "📄",
    title: "コール表",
    tagline: "歌詞（黒）とコール（赤）を1枚の表で、自分のペースで読みます。",
    where: "コールを覚える → 曲 → コール表",
    steps: ["上から下へスクロールして読む", "［A−］［A＋］で文字の大きさを変えられる"],
    point: "その曲のコール表（完成版コール）と歌詞が、この端末に入っているときに使えます。",
    actions: [{ label: "コールを覚えるへ", open: { mode: "liveCallMode" } }],
  },
  {
    id: "liveCallLive",
    icon: "✨",
    title: "ライブコール",
    tagline: "音源に合わせて、今言うコールが光ります。",
    where: "コールを覚える → 曲 → ライブコール",
    steps: [
      "再生すると、そのコールの始まりから終わりまでの間だけ光る",
      "画面の上の［演出 あり／なし］：あり＝光・動き・次のコールの予告・名前コールのメンバーカラー。なし＝光や動きを出さず、言うコールを板で強調するだけ",
      "−5秒・＋5秒・位置のバーで移動。コールを押すと少し前から流れる。［A−］［A＋］で文字の大きさ",
    ],
    point: "コール表とその時刻、その曲の音源が要ります。演出の設定はこの端末に保存されます。",
    actions: [{ label: "コールを覚えるへ", open: { mode: "liveCallMode" } }],
  },
  {
    id: "liveCallKaraoke",
    icon: "🎤",
    title: "カラオケ",
    tagline: "歌詞を大きく出して歌います。歌詞の行の間に赤いコールが出ます。",
    where: "コールを覚える → 曲 → カラオケ",
    steps: [
      "上の［コール表示 ON／OFF］：OFF にすると歌詞だけ（再生中も切り替えられる）",
      "歌詞の行を押すと、その位置へ移る",
      "音源が無い曲は、カラオケ店などで曲が始まった瞬間に［曲スタート］を押して合わせる",
      "ずれたときは［タイミング調整］で直す。［0に戻す］で元どおり",
    ],
    point: "時刻つきの歌詞があれば使えます。コール表の無い曲は、歌詞だけのカラオケになります。歌詞の無い Overture は、コールだけのカラオケ（歌詞なし・コールのみ）です。",
    actions: [{ label: "コールを覚えるへ", open: { mode: "liveCallMode" } }],
  },
  {
    id: "callGuide",
    icon: "📖",
    title: "コールガイド",
    tagline: "メンバーコール・曲指定コール・ペンライト指定曲・MIX・口上をまとめた一覧です。",
    where: "コールを覚えるの曲の一覧・曲のページの［コールガイド］",
    steps: ["4つの札（メンバーコール／曲指定コール／ペンライト指定曲／MIX・口上）を切り替えて見る", "曲のページから開くと、その曲を選んだ状態で開く"],
    point: "",
    actions: [{ label: "コールを覚えるへ", open: { mode: "liveCallMode" } }],
  },
  {
    id: "liveHub",
    icon: "🎫",
    title: "ライブ履歴・セットリスト",
    tagline: "過去の公演とセットリスト、曲からライブを探す、ライブ映像を探す。",
    where: "ホームの「ライブを楽しむ」→［ライブ履歴・セトリ］",
    steps: [
      "過去のライブを調べる・セットリストを見る：公演ごとの曲順",
      "曲からライブを探す：曲名を入れると、その曲を披露した公演（何曲目か）と、その曲が入ったライブ映像の数が出る",
      "ライブ映像を探す：Blu-ray・DVD などの映像を新しい順・古い順で",
      "次のライブが決まっているときは、ホームの「ライブを楽しむ」に［次のライブ］が出る",
    ],
    point: "",
    actions: [{ label: "ライブ履歴・セトリへ", open: { click: "live-hub-link" } }],
  },
  {
    id: "liveGuide",
    icon: "🔰",
    title: "はじめてのライブ（ライブ初心者ガイド）",
    tagline: "準備・持ち物・ペンライト・マナー・当日の流れ。",
    where: "ホームの「ライブを楽しむ」→［はじめてのライブ］",
    steps: ["持ち物のチェックリストは、この端末だけに保存される"],
    point: "",
    actions: [{ label: "はじめてのライブへ", open: { home: "live-guide" } }],
  },

  // ===== 楽曲 =====
  {
    id: "songlist",
    icon: "🎵",
    title: "楽曲一覧・曲を聴く",
    tagline: "全{count:all}曲の情報と、1曲ずつの再生。",
    where: "ホームの「楽曲・歌詞を楽しむ」→［楽曲一覧］",
    steps: [
      "曲を押すと、歌っているメンバー・センター・MV などの情報が開く",
      "再生ボタンで聴ける（音源が入っている曲だけ）。再生中は10秒戻る・進む・位置のバー",
      "♡でお気に入り、［プレイリストに追加］で好きなプレイリストへ",
      "上の［曲名で検索］で曲名・よみ・愛称から探せる",
    ],
    point: "曲の情報と歌詞は、音源が無くても見られます（歌詞は歌詞のデータが要る）。",
    actions: [{ label: "楽曲一覧を開く", open: { home: "songlist" } }],
  },
  {
    id: "lyricsView",
    icon: "📜",
    title: "歌詞を読む",
    tagline: "曲ごとの歌詞を表示します。全画面でも読めます。",
    where: "楽曲一覧 → 曲 →［歌詞を見る］（全画面のボタンもある）",
    steps: ["曲の情報の中の［歌詞を見る］で開く", "全画面のボタンで大きく読める"],
    point: "歌詞のデータが端末に入っている曲だけです。Overture には歌詞がありません。",
    actions: [{ label: "楽曲一覧を開く", open: { home: "songlist" } }],
  },
  {
    id: "favorites",
    icon: "♡",
    title: "お気に入り",
    tagline: "好きな曲に♡を付けて、まとめて見られます。",
    where: "ホームの「楽曲・歌詞を楽しむ」→［お気に入り］",
    steps: ["楽曲一覧で曲の♡を押す", "［お気に入り］で♡を付けた曲だけが並ぶ"],
    point: "お気に入りの曲だけをオフラインプレイヤーで続けて聴けます。オンライン対戦・1台で対戦の出題にも使えます。",
    actions: [{ label: "お気に入りを開く", open: { home: "favorites" } }],
  },
  {
    id: "playlists",
    icon: "📃",
    title: "プレイリスト",
    tagline: "好きな曲を自由にまとめます。いくつでも作れます。",
    where: "ホームの「楽曲・歌詞を楽しむ」→［プレイリスト］",
    steps: ["［＋ 作成］で名前（20文字まで）を付けて作る", "曲を追加（曲名で検索できる）・並べ替え・外す・名前の変更・削除ができる"],
    point: "プレイリストから続けて再生したり、対戦の出題に使ったりできます。",
    actions: [{ label: "プレイリストを開く", open: { home: "playlists" } }],
  },
  {
    id: "offlinePlayer",
    icon: "🔁",
    title: "曲を聴く（オフラインプレイヤー）",
    tagline: "全曲・お気に入り・プレイリストから、曲を続けて再生します。通信は使いません。",
    where: "ホームの「楽曲・歌詞を楽しむ」→［曲を聴く］",
    steps: [
      "再生元（全曲／お気に入り／プレイリスト）と順番（順番どおり／シャッフル）を選んで［この内容で再生］",
      "くり返し（なし・全体・1曲）、前の曲・次の曲、位置のバー、全画面の歌詞",
      "再生キューの画面で、押した曲へ飛ぶ・並べ替える",
    ],
    point: "端末に入っている音源なら、電波が無い場所でも聴けます。",
    actions: [{ label: "曲を聴くへ", open: { home: "continuous-play" } }],
  },
  {
    id: "miniPlayer",
    icon: "▶️",
    title: "ミニプレイヤー",
    tagline: "曲を聴いたままほかの画面へ移ると、画面の下に小さな再生の帯が出ます。",
    where: "曲を聴く（オフラインプレイヤー）で再生中に、ほかの画面へ移ったとき",
    steps: ["曲名・再生／一時停止・停止のボタン", "帯を押すとプレイヤーの画面に戻る"],
    point: "",
    actions: [],
  },
  {
    id: "works",
    icon: "💿",
    title: "シングル・アルバム",
    tagline: "作品ごとの収録曲を見られます。",
    where: "ホームの「楽曲・歌詞を楽しむ」→［シングル・アルバム］",
    steps: ["作品を押すと収録曲が並ぶ"],
    point: "",
    actions: [{ label: "シングル・アルバムへ", open: { home: "works" } }],
  },

  // ===== ＝LOVE情報 =====
  {
    id: "members",
    icon: "👤",
    title: "メンバー・個人のページ",
    tagline: "プロフィールとメンバーカラー。押すと個人のページ（紹介・活動・センター曲・個人活動・出演など）。",
    where: "ホームの「＝LOVEをもっと知る」→［メンバー］",
    steps: ["メンバーを押すと個人のページが開く", "個人のページには、個人活動・舞台や声の出演・CM なども並ぶ", "一覧で推し・最推しを選べる"],
    point: "",
    actions: [{ label: "メンバーを開く", open: { click: "members-link" } }],
  },
  {
    id: "centers",
    icon: "👑",
    // 題名を機能の名前とまったく同じにすると、全体検索で「歴代センター」の機能より上に出てしまうので、少し変えている
    title: "歴代センターの一覧",
    tagline: "どの曲で誰がセンターだったかの一覧。",
    where: "ホームの「＝LOVEをもっと知る」→［歴代センター］",
    steps: ["曲名で検索、メンバーで絞り込みができる"],
    point: "",
    actions: [{ label: "歴代センターを開く", open: { home: "centers" } }],
  },
  {
    id: "anniversary",
    icon: "📅",
    title: "周年ヒストリー",
    tagline: "デビューから1年ずつ振り返ります。",
    where: "ホームの「＝LOVEをもっと知る」→［周年ヒストリー］",
    steps: ["「周年で見る」「年表で見る」を切り替える"],
    point: "",
    actions: [{ label: "周年ヒストリーを開く", open: { click: "anniversary-home-link" } }],
  },
  {
    // 【2026-10-31追加】CD売上・チャート記録
    id: "cdSales",
    icon: "📊",
    title: "CD売上・チャート記録",
    tagline: "シングルの初週の CD 売上をグラフで。作品ごとの最高順位・累計・認定も。",
    where: "ホームの「＝LOVEをもっと知る」→［CD売上・チャート］",
    steps: [
      "グラフの棒を押すと、作品名と初週の枚数が出る（Billboard JAPAN の数）",
      "下の一覧の作品を押すと、オリコンの初週・最高順位・累計・RIAJ の認定・出典が出る",
      "アルバム・楽曲の記録（Hot 100 の1位・ストリーミングの認定など）は上の切り替えから",
    ],
    point: "売上・出荷・認定は別の数字です。確かめられなかった数は「未確認」と出します。",
    actions: [{ label: "CD売上・チャート記録を開く", open: { click: "cd-sales-home-link" } }],
  },
  {
    id: "tvAppearances",
    icon: "📺",
    title: "音楽番組",
    tagline: "出演した音楽番組と、披露した曲。",
    where: "ホームの「＝LOVEをもっと知る」→［音楽番組］",
    steps: ["番組名・曲名などの言葉で探せる。年・シリーズで絞り込める"],
    point: "",
    actions: [{ label: "音楽番組を開く", open: { click: "tv-appearances-home-link" } }],
  },
  {
    id: "commercials",
    icon: "📣",
    title: "CM・企業コラボ",
    tagline: "＝LOVE名義の CM・広告・企業コラボ。",
    where: "ホームの「＝LOVEをもっと知る」→［CM・企業コラボ］",
    steps: ["メンバー個人の CM は、それぞれの個人のページに並ぶ"],
    point: "",
    actions: [{ label: "CM・企業コラボへ", open: { home: "commercials" } }],
  },
  {
    id: "aboutGroup",
    icon: "ℹ️",
    title: "＝LOVEについて",
    tagline: "結成・名前の由来・年表・作品一覧。",
    where: "ホームの「＝LOVEをもっと知る」→［＝LOVEについて］",
    steps: ["札で「＝LOVEについて／年表／作品一覧／ライブ」を切り替える"],
    point: "",
    actions: [{ label: "＝LOVEについてへ", open: { home: "about-group" } }],
  },

  // ===== マイ・データ =====
  {
    id: "playHistory",
    icon: "📊",
    title: "プレイ履歴",
    tagline: "今までに遊んだ結果を振り返れます。",
    where: "ホームの「イントロクイズ」のすぐ下の［プレイ履歴］",
    steps: [
      "3つの札：オフライン（1人用）／オンライン（オンライン対戦）／パーティー（1台で対戦）",
      "オフラインは「すべて・イントロ・ランダム・歌詞・タイムアタック」で絞り込める（アウトロは「イントロ」、一瞬チャレンジは「ランダム」に入る。苦手曲・問題をつくるは元のモードの札に入る。例：苦手曲のリリック＝「歌詞」）",
      "上に、その札の総プレイ回数・総回答数・全体の正答率",
      "結果を押すと詳しく：日時・モード・出題数・正解数・点数・平均回答時間・順位など。オンライン対戦は問題ごとの正誤も",
    ],
    point: "新しい順に並びます（検索・並べ替えはありません）。［間違えた曲だけ復習する］の回は残りません。［履歴をすべて削除］は自己ベストを消しません。",
    actions: [{ label: "プレイ履歴を見る", open: { home: "history" } }],
  },
  {
    id: "selfBest",
    icon: "🥇",
    title: "自己ベスト",
    tagline: "モード・条件ごとのいちばん良い記録です。",
    where: "各モードの設定画面（イントロクイズはホームの箱の右上）",
    steps: [
      "イントロクイズ：出題数×カテゴリごとの点数",
      "アウトロクイズ・ランダム再生クイズ：出題数×カテゴリごとの合計タイム（アウトロは結果の画面に出る）",
      "タイムアタック：出題タイプ×ルール×出題数×カテゴリごとの合計タイム",
      "歌詞クイズ：出題数×回答方式ごと（正解数・ヒントの少なさで比べる）",
    ],
    point: "対戦・苦手曲・問題をつくるの結果は自己ベストになりません。",
    actions: [{ label: "ゲームの遊び方・記録", open: { gameGuide: "" } }],
  },
  {
    id: "players",
    icon: "🙋",
    title: "名前・推し・プレイヤーの切り替え",
    tagline: "名前の変更、推しメンの変更、家族などで別のプレイヤーを作れます。",
    where: "ホームのいちばん上の名前（プレイヤー設定）／推しの名前",
    steps: ["名前を押すと「プレイヤー」：［✎ 名前を変える］で今のプレイヤーの名前を変える（名前がまだ無いときは［✎ 名前を付ける］）", "［新しいプレイヤーを追加］は、記録を分けて別の人を作るときだけ使う", "推しの名前を押すとメンバー紹介が開く"],
    point: "プレイヤーごとに記録は別々です。名前を変えるだけなら記録はそのまま残ります。",
    actions: [{ label: "プレイヤー設定を開く", open: { click: "player-name-chip" } }],
  },
  {
    id: "dataPackImport",
    icon: "📦",
    title: "データを追加・更新",
    tagline: "音源・歌詞・コールを端末に入れます。音を鳴らすには、まずこれが必要です。",
    where: "ホームの「マイページ・データ」→［データを追加・更新］（設定・データ管理の「データ管理」が開く）",
    steps: [
      "配られた ZIP を、まず端末に保存しておく",
      "「最新版データ」の ZIP：［最新版データを読み込む］。中身を確かめて見せてから、［この内容で読み込む］を押したときだけ入る。足りないもの・新しくなったものだけが入り、曲ごとに元に戻せる",
      "全曲パック（full.zip）・追加パック（21st.zip など）：［追加データパックを読み込む］",
      "入れたら［データの状態を確かめる］で確認する",
    ],
    point: "プレイヤーの記録（履歴・称号など）は変わりません。iPhone・Android の画面つきの手順は「画像つきの入れ方」へ。",
    actions: [
      { label: "データを追加・更新へ", open: { home: "data-update" }, primary: true },
      { label: "画像つきの入れ方", open: { url: "guide-data-pack.html" } },
    ],
  },
  {
    id: "dataStatus",
    icon: "✅",
    title: "データの状態を確かめる",
    tagline: "音源・歌詞・コール表が何曲入っているか、足りない曲はどれかが分かります。",
    where: "ホームの「マイページ・データ」→［データの状態を確かめる］",
    steps: ["押すとすぐ確かめて結果が出る（何も変えない）", "足りない曲の名前も出る"],
    point: "",
    actions: [{ label: "データの状態を確かめる", open: { home: "data-status" } }],
  },
  {
    id: "settings",
    icon: "⚙️",
    title: "設定",
    tagline: "効果音、データの読み込み、引き継ぎ・復旧。",
    where: "ホームの「マイページ・データ」→［設定］",
    steps: ["効果音の ON／OFF と［詳細設定］（操作音・クイズの音の切り替え、サウンドテーマ、効果音と楽曲の音量）", "データ管理（音源・歌詞の読み込み）", "機種変更・データ引き継ぎ／データを復旧する"],
    point: "",
    actions: [{ label: "設定を開く", open: { home: "settings" } }],
  },

  // ===== 検索の使い分け =====
  buildSearchSection({
    id: "searchApp",
    icon: "🔍",
    title: "アプリ内検索（全体検索）",
    tagline: "メンバー・曲・ライブ・番組・CM・機能をまとめて探します。",
    search: {
      where: "ホームの上の「曲・メンバー・ライブ・番組を検索」",
      input: "名前・曲名・番組名・機能の名前など（スペースで区切ると、すべてを含むものだけ）",
      target: "メンバー・楽曲・作品・CM・ライブと映像・周年・音楽番組・個人活動・このガイド・機能・設定",
      notTarget: "歌詞の本文・プレイ履歴・苦手曲・フレンド",
      results: "10件ずつ（［もっと見る］で続き）。押すと詳しく開き、「メンバーページで詳しく見る」「この機能を開く」などのボタンでその画面へ",
      filter: "すべて／メンバー／楽曲／CM・広告／ライブ／出演作品／番組・活動／ガイド／機能／設定（それぞれの件数つき）",
      fuzzy: "ひらがな・カタカナ、全角・半角、大文字・小文字の違いは同じに扱う。0件のときだけ「もしかして」で近い言葉を出す",
      device: "この端末の中だけ。検索した言葉は保存しない",
      needs: "要らない（音源・歌詞が無くても使える）",
    },
    actions: [{ label: "アプリ内検索を開く", open: { click: "app-search-link" } }],
  }),
  buildSearchSection({
    id: "searchLyrics",
    icon: "🎼",
    title: "歌詞検索",
    tagline: "覚えている歌詞の一部から、曲を探します。",
    search: {
      where: "ホームの「楽曲・歌詞を楽しむ」→［歌詞検索］／アプリ内検索の［歌詞検索へ］",
      input: "歌詞の一部（2文字以上。行をまたいでもよい）",
      target: "端末に入っている歌詞の本文",
      notTarget: "曲の情報・メンバーなど（それはアプリ内検索）",
      results: "曲ごとに、一致した数と最初の3か所。［歌詞全文を表示］で全部、［曲を聴く］で楽曲一覧のその曲へ",
      filter: "なし（一致した数が多い順）",
      fuzzy: "全角・半角・かなの違いは同じに扱う。「＝LOVE」「イコールラブ」「イコラブ」も同じ。0件のときは「似ている歌詞の候補」。曲名・愛称で一致した曲も別に出る",
      device: "この端末の中だけ。歌詞も検索した言葉も外へ送らない",
      needs: "歌詞のデータ（音源は要らない）",
    },
    actions: [{ label: "歌詞検索を開く", open: { home: "lyrics-search" } }],
  }),
  buildSearchSection({
    id: "searchSongs",
    icon: "🎵",
    title: "曲名の検索（楽曲一覧・曲を選ぶ画面）",
    tagline: "曲名から1曲を探します。",
    search: {
      where: "楽曲一覧の［曲名で検索］。プレイリストに追加・問題をつくる・対戦の「曲を選んで出題」・全曲検索で答える画面も同じ探し方",
      input: "曲名の始めの部分・よみ・愛称",
      target: "曲名とそのよみ（始めから一致）、愛称（ぴったり一致）",
      notTarget: "歌詞・メンバー",
      results: "一致した曲だけが一覧に残る",
      filter: "曲を選ぶ画面では「選択中の曲だけ表示」、全曲検索で答える画面では50音の移動",
      fuzzy: "ひらがな・カタカナ・大文字・小文字の違いは同じに扱う。打ち間違いには対応しない",
      device: "この端末の中だけ",
      needs: "要らない",
    },
    actions: [{ label: "楽曲一覧を開く", open: { home: "songlist" } }],
  }),
  buildSearchSection({
    id: "searchLive",
    icon: "🎫",
    title: "曲からライブを探す",
    tagline: "その曲を披露したライブと映像を探します。",
    search: {
      where: "ライブ履歴・セトリ →［曲からライブを探す］／［ライブ映像を探す］",
      input: "曲名（入れると候補が出る）",
      target: "セットリストのある公演と、ライブ映像",
      notTarget: "未確認のセットリスト・テレビの披露（それは音楽番組）",
      results: "一致した曲（最大5曲）ごとに、披露した公演（何曲目か）と、その曲が入った映像の数。［この曲のライブ映像を見る］",
      filter: "映像は新しい順・古い順",
      fuzzy: "曲名・よみの一部が一致すればよい。カタカナとひらがなの違い・愛称・打ち間違いには対応しない",
      device: "この端末の中だけ",
      needs: "要らない",
    },
    actions: [{ label: "ライブ履歴・セトリへ", open: { click: "live-hub-link" } }],
  }),
  buildSearchSection({
    id: "searchHistory",
    icon: "📊",
    title: "プレイ履歴の絞り込み",
    tagline: "履歴は言葉の検索ではなく、札で絞り込みます。",
    search: {
      where: "ホームの［プレイ履歴］",
      input: "なし（押して選ぶ）",
      target: "自分の記録（この端末のプレイヤー）",
      notTarget: "ほかの人の記録",
      results: "絞り込んだ結果が新しい順に並ぶ。押すと詳しく見られる",
      filter: "オフライン／オンライン／パーティーの札と、その中の種類（例：イントロ・ランダム・歌詞・タイムアタック）",
      fuzzy: "—",
      device: "この端末の中だけ",
      needs: "要らない",
    },
    actions: [{ label: "プレイ履歴を見る", open: { home: "history" } }],
  }),
  buildSearchSection({
    id: "searchInPage",
    icon: "🔎",
    title: "画面の中の検索",
    tagline: "画面ごとの小さな検索。その画面の中だけを探します。",
    search: {
      where: "歴代センター（曲名で検索・メンバーで絞り込み）／音楽番組（番組名・曲名など・年・シリーズ）／コールを覚えるの曲の一覧（曲名・よみ・コール表あり・音源あり）／問題をつくるのセット一覧（セット名・メモで検索）",
      input: "その画面に書いてある言葉",
      target: "その画面の一覧だけ",
      notTarget: "ほかの画面の中身",
      results: "一致したものだけが一覧に残る",
      filter: "画面ごとの札・選択肢",
      fuzzy: "画面によって違う。打ち間違いには対応しない",
      device: "この端末の中だけ",
      needs: "要らない",
    },
    actions: [],
  }),

  // ===== よくある質問 =====
  {
    id: "faqWhatData",
    icon: "❓",
    kind: "faq",
    title: "音源・歌詞・コールは、どこにあるの？",
    steps: [
      "アプリの公開ページには、音源・歌詞・コールは入っていません（権利があるため公開しません）。",
      "配られたデータを、自分の端末に入れて使います。入れたデータはこの端末の中だけに保存され、ほかの人には送られません。",
      "曲の情報・メンバー・ライブ・番組などは、データを入れなくても見られます。",
    ],
  },
  {
    id: "faqReady",
    icon: "❓",
    kind: "faq",
    title: "「準備完了」とは？",
    steps: [
      "オンライン対戦のロビーで、ホスト以外の人が「始めてよい」と知らせるボタンです（［準備完了にする］）。",
      "ホストは［対戦を開始する］を押すことが合図になるので、このボタンはありません。全員が準備完了になると開始できます。",
      "設定やモードが変わっても準備完了は続きます（歌詞クイズ対戦で、データが合うか確かめられないときは外れることがあります）。",
    ],
  },
  {
    id: "faqLeaveVsHome",
    icon: "❓",
    kind: "faq",
    title: "結果の画面の「ホームへ戻る」と「ルームから退出」の違いは？（ホスト以外）",
    steps: [
      "［ホームへ戻る］：ルームに入ったまま、画面だけホームへ移ります。",
      "［ルームから退出］：ルームから抜けます。もう一度入るにはコードが要ります。",
    ],
  },
  {
    id: "faqRematch",
    icon: "❓",
    kind: "faq",
    title: "結果のあと、もう一度遊ぶには？",
    steps: [
      "ホストの［同じ条件でもう一度］：全員が［準備OK］を押すと始まります（ホストは取り消せる）。",
      "［ルーム設定に戻る］：それぞれが押してロビーへ戻り、設定を選び直します。誰が戻ったかは「結果確認の状況」に出ます。",
      "対戦中にホストが［ルーム設定へ戻る］を押すと、その対戦は全員分止まります。",
    ],
  },
  {
    id: "faqProfilePublic",
    icon: "❓",
    kind: "faq",
    title: "公開設定を OFF にすると、何が見える？",
    steps: [
      "フレンドの一覧に出なくなり、ランキングにも載りません。",
      "オンライン対戦のロビーでは、一緒にいる人の名前・推しは見えます（対戦のための表示）。",
      "いつでも ON・OFF を変えられます。",
    ],
  },
  {
    id: "faqTieBreak",
    icon: "❓",
    kind: "faq",
    title: "一瞬協力で同じ票数になったら？",
    steps: ["対戦ごとに決まった抽選で1つに決まります。毎回同じ結果になり、誰かが得や損をすることはありません。"],
  },
  {
    id: "faqDataMismatch",
    icon: "❓",
    kind: "faq",
    title: "友達と入っている曲が違うときは？",
    steps: [
      "オンライン対戦では、参加者全員の端末に入っている曲だけが出題されます。",
      "曲が絞られたときは、ロビーにその数が出ます。出題数に足りないときは開始できず、理由が出ます。",
    ],
  },
  {
    id: "faqDataPack",
    icon: "❓",
    kind: "faq",
    title: "「最新版データ」と「データパック」の違いは？",
    steps: [
      "最新版データ：歌詞・完成版コール・表示用の歌詞・音源（入っていれば）を1つにまとめた ZIP。端末に足りないもの・新しいものだけを入れます。［最新版データを読み込む］から。",
      "データパック：全曲パック（full.zip）と、新しいシングルの追加パック（21st.zip など）。［追加データパックを読み込む］から。",
      "どちらも、配られたものを使います（アプリの公開ページには入っていません）。",
    ],
  },

  // ===== データの保存と引き継ぎ =====
  {
    id: "storageWhere",
    icon: "💾",
    title: "どこに何が保存されるか",
    tagline: "記録はバックアップされますが、音源・歌詞・コールはこの端末だけです。",
    where: "ホームの「マイページ・データ」に、バックアップの状態が出ます",
    steps: [
      "この端末だけ：音源・歌詞・コール・コールガイド・効果音の設定（バックアップされない。消えたら入れ直す）",
      "自動でバックアップ：称号・プレイ履歴・自己ベスト・苦手曲の記録・推し・お気に入り・プレイリスト・問題のセット・公開設定（変わってから数秒後、起動したとき、ホームに戻ったとき）",
      "ホームの「マイページ・データ」の「記録・称号などは〇〇にバックアップできました」で、最後にバックアップできた時刻が分かる",
    ],
    point: "機種変更のときは［引き継ぎ・復旧］の「機種変更・データ引き継ぎ」を使います。",
    actions: [{ label: "引き継ぎ・復旧へ", open: { home: "data-transfer" } }],
  },
  {
    id: "faqBackup",
    icon: "☁️",
    kind: "faq",
    title: "バックアップとは？",
    steps: [
      "称号・プレイ履歴・自己ベストなどの記録が、自動でインターネット上に保存される仕組みです。特別な操作は要りません。",
      "機種変更では、バックアップではなく「機種変更・データ引き継ぎ」（24時間有効のコード）を使います。",
      "バックアップは、旧端末が使えないときの「データを復旧する」に使われます。",
    ],
  },
  {
    id: "deviceTransfer",
    icon: "📲",
    title: "機種変更・データ引き継ぎ",
    tagline: "称号・履歴・自己ベスト・お気に入り・推しなどを、新しい端末へ移します。",
    where: "ホームの「マイページ・データ」→［引き継ぎ・復旧］→「機種変更・データ引き継ぎ」",
    steps: [
      "今の端末で［引き継ぎコードを発行する］（コードは発行から24時間有効。ほかの人には送らない）",
      "新しい端末で同じ画面を開き、「② 新しい端末にデータを入れる方」にコードを貼り付けて［コードを送信する］",
      "新しい端末で、音源・歌詞・コールのデータを入れ直す",
    ],
    point: "音源・歌詞・コールは引き継がれません（権利があるため、各端末で入れる作りです）。管理者の確認は要りません。",
    actions: [{ label: "引き継ぎ・復旧へ", open: { home: "data-transfer" } }],
  },
  {
    id: "backupRestore",
    icon: "🛟",
    title: "データを復旧する（旧端末が使えないとき）",
    tagline: "端末の紛失・故障などで引き継ぎコードを出せないときの方法です。",
    where: "ホームの「マイページ・データ」→［引き継ぎ・復旧］→「データを復旧する」",
    steps: ["［復旧を依頼する］を押し、出た番号を管理者へ LINE などで伝える", "管理者が対応したら［確認する］を押す"],
    point: "ふつうの機種変更では「機種変更・データ引き継ぎ」を使ってください。",
    actions: [{ label: "引き継ぎ・復旧へ", open: { home: "data-transfer" } }],
  },

  // ===== 困ったとき =====
  {
    id: "faqNoSound",
    icon: "🔇",
    kind: "faq",
    title: "音が出ない・「音源が読み込まれていません」と出る",
    steps: [
      "［データの状態を確かめる］で、その曲の音源が入っているか確かめてください。入っていなければ［データを追加・更新］から入れます。",
      "入っているのに鳴らないときは、画面を触った直後にもう一度試してください（スマホのブラウザは、操作した直後でないと音を出せないことがあります）。端末の消音・音量も確かめてください。",
      "クイズ中の［音が出ない］ボタンで、その回を終える（イントロクイズなど）か、聞き直せます（苦手曲・問題をつくる）。",
      "オンライン対戦のイントロ・ランダム再生・アウトロ対戦で［音が出ない］を押すと、その試合は無効になり、全員ロビーへ戻ります。",
    ],
  },
  {
    id: "troubleNoLyrics",
    icon: "📝",
    kind: "faq",
    title: "歌詞クイズ・歌詞検索が使えない",
    steps: [
      "歌詞のデータが端末に入っていないと使えません。［データの状態を確かめる］で歌詞の数を確かめてください。",
      "歌詞は「最新版データ」やデータパックに入っています。［データを追加・更新］から入れます。",
    ],
  },
  {
    id: "troubleNoCalls",
    icon: "📣",
    kind: "faq",
    title: "コールを覚えるで、モードが使えない",
    steps: [
      "曲のページに、使えない理由が出ます（コール表がまだ無い・音源が無い・歌詞が無い など）。",
      "コール表とライブコールは、完成版コールが入っている曲だけです。カラオケは時刻つきの歌詞があれば使えます。",
      "データを入れたら、［データの状態を確かめる］でコール表の数を確かめてください。",
    ],
  },
  {
    id: "faqDisconnect",
    icon: "📶",
    kind: "faq",
    title: "オンライン対戦で通信が切れたら？",
    steps: [
      "通信が戻れば、多くの場合そのまま続けられます。切れている人には「切断中」の印が出ます。",
      "ホストの通信が8秒ほど切れると、残った人の誰かがホストになります。",
      "終わっていない人がいるときは、ホストが［結果を確定する］で結果を決められます（終わっていない人は途中までの扱い）。",
    ],
  },
  {
    id: "troubleDataGone",
    icon: "🧹",
    kind: "faq",
    title: "データが消えた・新しい端末で始めたい",
    steps: [
      "記録・称号など：旧端末があれば「機種変更・データ引き継ぎ」、無ければ「データを復旧する」で戻せます。",
      "音源・歌詞・コール：バックアップされないので、配られたデータを［データを追加・更新］から入れ直します。",
      "ブラウザの「履歴とデータを消去」などをすると、端末の中のデータが消えることがあります。",
    ],
  },
  {
    id: "troubleBack",
    icon: "↩️",
    kind: "faq",
    title: "戻りたい画面に戻れない",
    steps: [
      "画面の左上の［戻る］／［ホーム］で、1つ前の画面かホームへ戻ります。スマホの「戻る」も同じように使えます。",
      "オンライン対戦の最中など、うっかり抜けると困る画面では、スマホの「戻る」は使えません。画面のボタン（［ルームを退出する］など）を使ってください。",
    ],
  },
];

export function getGuideSectionById(sectionId) {
  return GUIDE_SECTIONS.find((section) => section.id === sectionId) ?? null;
}

// 項目が入っているカテゴリ（無ければ null）
export function getGuideCategoryOfSection(sectionId) {
  return GUIDE_CATEGORIES.find((category) => category.sectionIds.includes(sectionId)) ?? null;
}

// テスト・確認用：ゲームの項目が、共通のデータ（js/data/gameGuideContent.js）の全モードを載せているか
export function listGameModeIdsInGuide() {
  return GUIDE_SECTIONS.filter((section) => section.kind === "game").map((section) => section.gameModeId);
}

export { GAME_GUIDE_MODES };
