// ライブコールモードの「MIX・口上」タブで案内する、MIX・口上の一覧データファイル
// （js/data/mixTypes.jsを置き換え、対象をMIXだけでなく口上まで広げたもの。2026-08-06）。
//
// 【著作権方針・2026-08-17改訂（本人指示）】基本MIX（英語MIX・日本語MIX・アイヌ語MIX）は、
// 特定の一人の作者による創作物ではなく、多くのアイドル現場で広く共有されている定型の
// 掛け声（複数の独立した情報源で内容が一致することを確認済み）であるため、本人の判断により
// textLines・pronunciationLinesをこのファイルへ直接含める方針に変更した。一方、以下は
// 引き続き本文を含めない：
//   ・ガチ恋口上／ガチ恋キャンセル：内容が長く、個人の創作性がより強いと考えられるため。
//   ・曲専用口上（海レモ口上・推しセカ口上）：メンバー本人／メンバーとファンが独自に考案した
//     内容のため、著作権保護の観点から掲載を見送る（使われる場面・きっかけ等の事実情報のみ
//     このファイルで案内し、掛け声本文自体は本人がdev/callGuideEditor.htmlから
//     端末ローカルにのみ追加する運用を維持する）。
// 上記いずれも、js/callGuideStorage.js経由でユーザーが端末へ個別に読み込むことは今までどおり可能。
// 画面側は「このファイルの内容（アプリ標準）」を優先表示しつつ、端末に読み込み済みのデータが
// あればそちらを優先する（js/callGuidePanel.jsのbuildGuideTextSection参照）。
//
// 【掲載方針】js/data/songPenlightGuide.js等と同じsourceType（official/reliable/self/fan）を使う。
// official=公式サイト・公式グループSNS・公式動画、self=メンバー本人のSNS・本人出演動画、
// reliable=音楽メディア等の報道、fan=ファンサイト・ファン動画・現場での定着情報。
// fanのみで確認した項目を「使用確認済み」と断定せず、「確認できる」「とされている」等の
// 正直な表現にとどめる（本人指示、2026-08-06）。
// usedInEqualLoveは、＝LOVEのライブでの使用が確認できた場合true、一般的なアイドル文化としては
// 存在するが＝LOVEでの使用が確認できなかった場合はfalseまたはnull（未確認）とし、
// 断定できない旨をusageNoteに必ず書く。
//
// category: "mix"（基本MIX） | "koujou"（口上・キャンセル等の応用） | "special"（＝LOVEでの使用が
// 未確認・使われない例として掲載するもの） | "song-specific-koujou"（特定の曲専用の口上）
export const MIX_AND_KOUJOU_GUIDE = [
  {
    id: "english-mix",
    name: "英語MIX",
    category: "mix",
    aliases: [],
    songIds: null,
    difficulty: "beginner",
    frequency: "common",
    usageScene: "サビ前後の間奏など、決まった長さの合いの手区間で使われる、MIXの基本形です。",
    startCue: "曲の間奏に入ったタイミングで、周りのファンに合わせて始めるのが一般的です。",
    usageNote: "多くのアイドル現場で使われる定番のMIXで、ファン向け資料で＝LOVEのライブでの使用例も確認できます。掛け声の細部（末尾に「ファイボ」「ワイパー」等を続けるかどうか）は会場・世代によって差があるようです。",
    differenceFromStandard: null,
    creditNote: null,
    beginnerNote: "全部を一気に覚えなくても大丈夫です。まずは最後の「ジャージャー」だけでも周りに合わせて声を出せると、それだけで一体感が出ます。",
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: ["https://ikorabucall.com/"],
    lastVerifiedDate: "2026-08-17",
    recommendedPriority: "must-know",
    textLines: ["タイガー", "ファイヤー", "サイバー", "ファイバー", "ダイバー", "バイバー", "ジャージャー"],
    pronunciationLines: [],
  },
  {
    id: "japanese-mix",
    name: "日本語MIX",
    category: "mix",
    aliases: [],
    songIds: null,
    difficulty: "beginner",
    frequency: "common",
    usageScene: "英語MIXと同じ場面・構成で使われる、漢字の音読みに置き換えたバージョンです。",
    startCue: "英語MIXと同様、曲の間奏に入ったタイミングで始めます。",
    usageNote: "英語MIXと対になる定番のMIXで、ファン向け資料で＝LOVEのライブでの使用例も確認できます。「海女」を「海人」と表記する資料もあり、細かな表記には揺れがあります。",
    differenceFromStandard: "英語MIXの発音に、音の響きが近い漢字を当てはめたバージョンです。",
    creditNote: null,
    beginnerNote: "英語MIXに慣れてきたら、対になるこちらにも挑戦してみましょう。読み方に自信が無い漢字があっても、周りの声に合わせるだけで十分楽しめます。",
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: ["https://ikorabucall.com/"],
    lastVerifiedDate: "2026-08-17",
    recommendedPriority: "must-know",
    textLines: ["虎", "火", "人造", "繊維", "海女", "振動", "化繊"],
    pronunciationLines: [],
  },
  {
    id: "variable-mix",
    name: "可変MIX",
    category: "mix",
    aliases: [],
    songIds: null,
    difficulty: "intermediate",
    frequency: "situational",
    usageScene: "英語MIX・日本語MIXの一部を、曲や場面に合わせて変化させる応用形として使われます。",
    startCue: "基本のMIXに慣れたうえで、その場のファンの掛け声に合わせて入ることが多いです。",
    usageNote: "基本の型を覚えたあとのステップアップとして位置づけられるMIXです。",
    differenceFromStandard: null,
    creditNote: null,
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: ["https://ikorabucall.com/"],
    lastVerifiedDate: "2026-08-06",
    recommendedPriority: "must-know",
    textLines: [],
    pronunciationLines: [],
  },
  {
    id: "gachikoi-koujou",
    name: "ガチ恋口上",
    category: "koujou",
    aliases: ["ガチ恋"],
    songIds: null,
    difficulty: "advanced",
    frequency: "situational",
    usageScene: "曲中の間奏やアウトロなど、長めの空白がある区間で使われることが多い、長文の口上です。",
    startCue: "決まった導入フレーズから始まり、最後まで通して唱えるのが基本とされています。",
    usageNote:
      "地下アイドル文化全般で広く使われる形式で、＝LOVEの現場でも使用例が確認できます。最後まで通して言い切るのが難しいとされる、上級者向けの口上です。",
    differenceFromStandard: null,
    creditNote: null,
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: ["https://ikorabucall.com/"],
    lastVerifiedDate: "2026-08-06",
    recommendedPriority: "advanced",
    textLines: [],
    pronunciationLines: [],
  },
  {
    id: "gachikoi-cancel",
    name: "ガチ恋キャンセル",
    category: "koujou",
    aliases: [],
    songIds: null,
    difficulty: "advanced",
    frequency: "situational",
    usageScene: "ガチ恋口上の途中で、あえて最後まで言い切らずに別のMIXへ切り替える、応用的な使い方です。",
    startCue: "ガチ恋口上を唱えている途中、決まったタイミングで周りに合わせて切り替えます。",
    usageNote:
      "＝LOVEの現場情報として、倍速ではなく通常の速さのMIXへ切り替える運用になっている、という情報をファン向け情報アカウントの投稿で確認しています。",
    differenceFromStandard: null,
    creditNote: null,
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: [
      "https://x.com/equallove_bot/status/1973710678868586806",
      "https://www.youtube.com/watch?v=b_pthvQ0j4s",
    ],
    lastVerifiedDate: "2026-08-06",
    recommendedPriority: "advanced",
    textLines: [],
    pronunciationLines: [],
  },
  {
    id: "danchou-mix",
    name: "園長MIX",
    category: "special",
    aliases: [],
    songIds: null,
    difficulty: "advanced",
    frequency: "rare",
    usageScene: null,
    startCue: null,
    usageNote:
      "一般的なアイドル現場で使われるMIXの一種として複数の情報源で確認できましたが、＝LOVEのライブで使われているという情報は今回確認できませんでした。参考として掲載しています。",
    differenceFromStandard: null,
    creditNote: null,
    usedInEqualLove: false,
    sourceType: "fan",
    sourceUrls: [],
    lastVerifiedDate: "2026-08-06",
    recommendedPriority: null,
    textLines: [],
    pronunciationLines: [],
  },
  {
    id: "ainu-mix",
    name: "アイヌ語MIX",
    category: "special",
    aliases: [],
    songIds: null,
    difficulty: "advanced",
    frequency: "rare",
    usageScene: "英語MIX・日本語MIXと同じような、間奏の合いの手区間で使われることがあります。",
    startCue: null,
    usageNote:
      "アイドル現場で「アイヌ語MIX」と呼ばれ定着している掛け声です。個々の単語はアイヌ語に由来するとされていますが、全体としては文法的に正しいアイヌ語の文章ではないという指摘もあり、実際のアイヌ語・アイヌ文化とは切り離した「アイドル現場独自の定型句」として扱うのが安全です。＝LOVEのライブでの使用例は今回確認できませんでした。参考として掲載しています。",
    differenceFromStandard: null,
    creditNote: null,
    usedInEqualLove: null,
    sourceType: "fan",
    sourceUrls: [],
    lastVerifiedDate: "2026-08-17",
    recommendedPriority: null,
    textLines: ["チャペ", "アペ", "カラ", "キナ", "ララ", "トゥスケ", "ミョーホントゥスケ"],
    pronunciationLines: [],
  },
  {
    id: "umi-lemon-koujou",
    name: "海レモ口上",
    category: "song-specific-koujou",
    aliases: [],
    songIds: ["umi-to-lemon-tea"],
    difficulty: "advanced",
    frequency: "situational",
    usageScene: "Dメロ後の長い間奏（曲の3分10秒あたり）で使用します。",
    startCue: "間奏に入ったタイミングで唱え始めます。",
    usageNote:
      "歌唱メンバーの大場花菜が、自身のSHOWROOM配信でファンと一緒に内容を考える「ガチ恋会議」を行い、その後X（旧Twitter）で使ってほしい位置と合わせてファンへ呼びかけたことが確認できます。通常のガチ恋口上とは別に、この曲だけのために作られた専用の口上です。掛け声本文はメンバー本人が考えた創作性の高い内容のため、この画面には掲載していません（本人がdev/callGuideEditor.htmlから端末に個別に読み込むことは可能です）。",
    differenceFromStandard: "通常のガチ恋口上とは別に、この曲の間奏専用に作られた、曲固有の口上です。",
    creditNote: "歌唱メンバー本人（大場花菜）が、この位置で使ってほしいとXで呼びかけています。",
    usedInEqualLove: true,
    sourceType: "self",
    sourceUrls: ["https://x.com/hana_oba/status/1828444068747321601"],
    lastVerifiedDate: "2026-08-17",
    recommendedPriority: null,
    textLines: [],
    pronunciationLines: [],
  },
  {
    id: "oshi-no-iru-sekai-koujou",
    name: "推しセカ口上",
    category: "song-specific-koujou",
    aliases: ["推しのいる世界 専用口上"],
    songIds: ["oshi-no-iru-sekai"],
    difficulty: "advanced",
    frequency: "situational",
    usageScene: "曲中の口上区間（曲の3分56秒あたり）で、推しメンバーへの気持ちを伝える専用の口上として使われます。",
    startCue: "曲中の決まった区間で、通常のガチ恋口上の代わりに唱えます。",
    usageNote:
      "メンバー数名がSHOWROOM配信でファンと一緒に内容を考えていった、と伝えるファンサイトの記録があります。特定の1人だけが単独で考案したと断定できる情報は確認できていません。掛け声本文は創作性の高い内容のため、この画面には掲載していません（本人がdev/callGuideEditor.htmlから端末に個別に読み込むことは可能です）。",
    differenceFromStandard: "通常のガチ恋口上とは別に、この曲専用に作られた、曲固有の口上です。",
    // 画面には「特定の1人だけが単独で考案したと断定できる情報は確認できていません」とだけ表示し、
    // 個々の人物名は出さない（本人指示）。
    // 内部記録（2026-08-17再調査）：ファンサイトの記録（一次ソースのSHOWROOM配信・関連ツイートを
    // 参照した二次情報）によれば、大場花菜・山本杏奈・野口衣織・佐々木舞香ら複数メンバーが
    // 配信内でファンの声も交えて共同で内容を考えていった、という経緯が示されている。
    // 「卒業メンバーの佐竹のん乃が考案」とする記述をするファンサイトも見られるが、本人単独の
    // 考案と断定できる一次ソースは今回確認できなかったため、画面上は人物名を出さない方針を維持する。
    creditNote: null,
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: ["https://ikorabucall.com/oshi-no-iru-sekai-call/"],
    lastVerifiedDate: "2026-08-17",
    recommendedPriority: null,
    textLines: [],
    pronunciationLines: [],
  },
];
