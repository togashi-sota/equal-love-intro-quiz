// ライブコールモードの「MIX・口上」タブで案内する、MIX・口上の一覧データファイル
// （js/data/mixTypes.jsを置き換え、対象をMIXだけでなく口上まで広げたもの。2026-08-06）。
//
// 【著作権方針・2026-08-15三度目の改訂（本人指示）】
// 本人から「長い文章だから一律非公開、ではなく、以下の基準で項目ごとに判断してほしい」
// という具体的な基準を提示された：
//   ①本人がファン向けに公開したものか　②ライブでファンが使う目的で作られたものか
//   ③本人発信の元情報が見つかるか　④公開・使用を促していた事実が確認できるか
// この基準を実際に情報源へ当たって1件ずつ検証し、以下の判断とした。
//
//   ・基本MIX（英語MIX・日本語MIX・可変MIX・アイヌ語MIX）／うりゃおい：
//     特定の一人の作者による創作物ではなく、多くのアイドル現場で広く共有されている
//     定型の掛け声（複数の独立した情報源で内容が一致することを確認済み）のため、
//     textLines・pronunciationLinesを直接含める。
//   ・ガチ恋口上：一般的な「ガチ恋口上」の基本形は＝LOVE固有の創作物ではなく、多くの
//     アイドル現場で広く使われている定型文だと、複数の独立した一般アイドル文化解説
//     サイト（choconono.com・kukoshakaku.com等、特定のアイドルグループに紐づかない
//     一般的な用語解説サイト）で内容が一致することを直接確認できたため含める。
//   ・海レモ口上：歌唱メンバー本人（大場花菜）がSHOWROOM配信で手書きして紹介し、
//     X（旧Twitter）でも「ぜひ覚えてコールして頂けたら嬉しいです」とファンへ公開・
//     使用を明確に呼びかけている事実を、独立した複数の情報源（本人のX投稿、
//     その内容を引用するファンブログ）で直接確認できたため、上記4基準をいずれも
//     満たすと判断し、本人考案の明記とあわせて本文を含める。
//   ・「内緒バナシ」「部活中に目が合うなって思ってたんだ」専用ガチ恋キャンセル：
//     内容を分解すると「ガチ恋口上の冒頭（上記の理由で既に公開済み）＋うりゃおい
//     （同上）＋英語MIX（同上）」という、いずれも既に個別に掲載可否を判断済みの
//     一般的なパーツの組み合わせであり、この2曲について新たに個人の創作物を追加する
//     わけではないため、曲ごとの具体的な流れとして本文を含める。「内緒バナシ」版は
//     本人（アプリ利用者）から大谷映美里さん考案という情報提供があった。
//   ・「君の第3ボタン」専用ガチ恋キャンセル：本文はガチ恋口上の定型文とほぼ同じだが、
//     冒頭1行だけ「やっぱり君には言えないよ」という、齋藤樹愛羅さん考案とされる
//     曲専用の短いアレンジが入る。この1行は非常に短い引用のため、考案者を明記した
//     うえで含める。
//   ・推しセカ口上：本人（アプリ利用者）からは佐竹のん乃さん考案・全文の情報提供が
//     あったが、2026-08-15に全文の直接確認を試みたところ、「ライブ会場でプリントが
//     配布された」という事実を報告するファンブログ記事までは見つかったものの、
//     その記事自体には文面が写真のみで文字起こしされておらず、他に全文を直接確認
//     できる情報源も見つからなかった（検索エンジンの要約には文面らしきものが
//     出てくることがあったが、実際に元のページを直接確認すると載っていなかった）。
//     上記②③の基準（本人発信の元情報が見つかるか）をこの項目だけクリアできな
//     かったため、推測で埋めることはせず、この項目のみ本文を含めていない
//     （本人にも状況を説明し、追加の出典があれば再検討する前提で合意済み）。
// 上記のうち本文を含めない項目についても、js/callGuideStorage.js経由でユーザーが
// 端末へ個別に読み込むことは可能（画面側は端末に読み込み済みのデータを優先表示する。
// js/callGuidePanel.jsのbuildGuideTextSection参照）。
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
// 【2026-08-24追加・本人指示】confidenceフィールド（"high"|"medium"|"single-source"）を
// 追加した。複数の独立ソースで内容が一致していればhigh、定番のファンサイト1件でも
// 内容が具体的で矛盾がなければmedium、根拠が弱い・情報源が1つだけで揺れがある場合は
// single-sourceとする。画面には出さず、将来情報を見直すときの内部記録として使う
// （本人指示：「将来情報が変わった時に、どこから確認した情報か追跡できるように」）。
//
// category: "mix"（基本MIX） | "koujou"（口上・キャンセル等の応用の“概念”説明） | "special"（＝LOVEでの
// 使用が未確認・使われない例として掲載するもの） | "song-specific-koujou"（特定の曲専用の口上・
// 曲専用アレンジ。曲ごとに具体的な本文を持つものはこちら）
//
// 【2026-08-24改訂】「園長MIX」（旧danchou-mix）は、一般的なアイドル現場での存在は複数ソースで
// 確認できたが、＝LOVEでの使用実績が今回の再調査でも確認できなかったため削除した
// （本人指示：「一般アイドル現場には存在するから」という理由だけでは＝LOVEガイドに残さない）。
// 他のコードからこのidを参照している箇所が無いことを確認済み（js/callGuideStorage.jsの
// バリデーションはentry一覧を動的に見るだけで、特定のidをハードコードしていない）。
export const MIX_AND_KOUJOU_GUIDE = [
  {
    id: "english-mix",
    name: "英語MIX",
    category: "mix",
    aliases: ["スタンダードMIX"],
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
    sourceUrls: ["https://ikorabucall.com/", "https://choconono.com/idol-call-dictionary/"],
    lastVerifiedDate: "2026-08-24",
    confidence: "high",
    recommendedPriority: "must-know",
    textLines: ["タイガー", "ファイヤー", "サイバー", "ファイバー", "ダイバー", "バイバー", "ジャージャー"],
    pronunciationLines: [],
    continuousText: "タイガー→ファイヤー→サイバー→ファイバー→ダイバー→バイバー→ジャージャー！",
    continuousNote: "区切らず、テンポよく続けて一気に唱えます。最後の「ジャージャー」は特に強く声を出すのが定番です。",
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
    usageNote: "英語MIXと対になる定番のMIXで、ファン向け資料で＝LOVEのライブでの使用例も確認できます。「海女」を「海人」と表記する資料もあり、細かな表記には揺れがあります。曲や会場によって、最後に「飛（とび）」「除去（じょきょ）」を続けるパターンもあるようですが、揺れが大きいためこのアプリでは基本の7語のみを掲載しています（拡張形は「可変MIX」を参照）。",
    differenceFromStandard: "英語MIXの発音に、音の響きが近い漢字を当てはめたバージョンです。",
    creditNote: null,
    beginnerNote: "英語MIXに慣れてきたら、対になるこちらにも挑戦してみましょう。読み方に自信が無い漢字があっても、周りの声に合わせるだけで十分楽しめます。",
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: ["https://ikorabucall.com/", "https://choconono.com/call-practice-japanese-mix/"],
    lastVerifiedDate: "2026-08-24",
    confidence: "high",
    recommendedPriority: "must-know",
    textLines: ["虎", "火", "人造", "繊維", "海女", "振動", "化繊"],
    pronunciationLines: [],
    continuousText: "虎→火→人造→繊維→海女→振動→化繊！",
    continuousNote: "英語MIXと同じテンポで、区切らず続けて唱えます。",
  },
  {
    id: "urya-oi",
    name: "うりゃおい",
    category: "mix",
    aliases: [],
    songIds: null,
    difficulty: "beginner",
    frequency: "common",
    usageScene: "曲の冒頭や、コールとコールの合間など、勢いをつけたいタイミングで使われる、最も基本的な掛け声の一つです。",
    startCue: "MCの終わりや曲が始まる直前、他のコールの区切りなどで自然に始まります。",
    usageNote: "多くのアイドル現場で使われる、最初に覚えるのに向いた掛け声です。「うりゃ！」「おい！」を交互に繰り返したあと、手拍子（パン・パパン・パン）を入れるのが定番です。",
    differenceFromStandard: null,
    creditNote: null,
    beginnerNote: "他のコールに比べて言葉が短くシンプルなので、初めての方はここから挑戦してみるのがおすすめです。",
    usedInEqualLove: true,
    sourceType: "fan",
    // 2026-08-15追加：本人の元指示（コールガイド大規模改修セクション16）で
    // 「①まず覚えたい」の代表例として名前が挙がっていたが、これまで正式なエントリーが
    // 無かったため今回追加した。他のガチ恋キャンセルの説明（うりゃおい×4→手拍子）とも
    // 内容が一致しており、多くのアイドル現場で共有される一般的な掛け声。
    sourceUrls: ["https://ikorabucall.com/"],
    lastVerifiedDate: "2026-08-15",
    confidence: "high",
    recommendedPriority: "must-know",
    textLines: ["うりゃ！", "おい！"],
    pronunciationLines: [],
    continuousText: "うりゃ！おい！　うりゃ！おい！　うりゃ！おい！　うりゃ！おい！　（パン　パパン　パン）",
    continuousNote: "「うりゃ！おい！」を4回繰り返したあと、手拍子（パン・パパン・パン）を入れるのが定番です。",
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
    usageNote:
      "基本の型を覚えたあとのステップアップとして位置づけられるMIXです。日本語MIXの最後に「飛（とび）除去（じょきょ）」を続けたり、英語MIXの最後に「ファイボー」「ワイパー」を続けたりと、他のMIXの一部を組み合わせて変化させる使い方が中心です。",
    differenceFromStandard: "英語MIX・日本語MIX・アイヌ語MIXそれぞれの一部を組み合わせた応用パターンです。単語自体は他のMIXと共通です。",
    creditNote: null,
    usedInEqualLove: true,
    sourceType: "fan",
    // 2026-08-15追加：本人からの報告により、実際に組み合わせて使われるパターンの
    // 一例を確認できたため本文を追加した。単語自体はアイヌ語MIX（ミョーホントゥスケ）・
    // 日本語MIX（化繊+飛除去の拡張形）・英語MIX（ジャージャー+ファイボーワイパーの拡張形）
    // それぞれで既に個別に確認済みのもので、新しく個人の創作物を追加したわけではない。
    sourceUrls: ["https://ikorabucall.com/"],
    lastVerifiedDate: "2026-08-15",
    confidence: "medium",
    recommendedPriority: "must-know",
    textLines: ["ミョーホントゥスケ", "化繊飛除去", "ジャージャー", "ファイボーワイパー"],
    pronunciationLines: [],
    continuousText: "ミョーホントゥスケ！化繊飛除去！ジャージャー！ファイボーワイパー！",
    continuousNote: "アイヌ語MIX・日本語MIX・英語MIXそれぞれの一部をつなげて唱える組み合わせパターンの一例です。",
  },
  {
    id: "gachikoi-koujou",
    name: "ガチ恋口上",
    category: "koujou",
    aliases: ["ガチ恋"],
    songIds: null,
    // 2026-08-24改訂・本人指示：「初心者でも知っておくとライブを楽しみやすい定番コール」として
    // 扱うため、難易度分類を上級者向けから初心者向けへ見直した（実際に最後まで唱えきるのは
    // 難しいコールだが、「知っておく」ことのハードルは低いという位置づけ）。
    difficulty: "beginner",
    frequency: "situational",
    usageScene: "曲中の間奏やアウトロなど、長めの空白がある区間で使われることが多い、長文の口上です。",
    startCue: "決まった導入フレーズから始まり、最後まで通して唱えるのが基本とされています。",
    usageNote:
      "地下アイドル文化全般で広く使われる形式で、＝LOVEの現場でも使用例が確認できます。長めの口上ですが、全部を暗記できていなくても、周りに合わせて雰囲気を楽しむだけで十分です。無理に言わなくても、聞いているだけでもOKです。",
    differenceFromStandard: null,
    creditNote: null,
    // 2026-08-24追加・本人指示：口上中の「○○」部分に何を入れるのか分からない、という
    // 初心者の疑問に答えるための説明文。js/callGuidePanel.jsで、可能であれば現在設定中の
    // 推しメンバー名を添えて表示する。
    placeholderNote: "口上の中には「○○」のように名前を入れる部分があります。そこには、あなたの推しメンバーの名前を入れて唱えます。",
    beginnerNote: "コールは強制ではありません。「知っている」だけでもライブが数倍楽しくなります。まずは周りの様子を見て、雰囲気だけでも味わってみてください。",
    usedInEqualLove: true,
    sourceType: "fan",
    // 2026-08-15追加：ガチ恋口上の基本形が＝LOVE固有の創作物ではなく、多くのアイドル現場で
    // 共有されている定型文であることを、特定のアイドルグループに紐づかない一般的な
    // アイドル文化解説サイト2件（choconono.com・kukoshakaku.com）を直接確認して
    // 内容が一致することを確認したうえで追加した（ファイル冒頭のコメント参照）。
    sourceUrls: ["https://ikorabucall.com/", "https://choconono.com/call-practice-gachikoi-koujyou/", "https://kukoshakaku.com/archives/1914.html"],
    lastVerifiedDate: "2026-08-15",
    confidence: "high",
    // 2026-08-24：difficultyは「初心者向け」に見直したが（本人指示）、recommendedPriorityは
    // must-knowにはしない。「まず覚えたい」は短時間で覚えられるMIX中心の構成のままにし、
    // 長い口上であるガチ恋口上は③口上セクションで案内する（本人が示した6段階構成の意図を尊重）。
    recommendedPriority: null,
    textLines: [
      "言いたいことがあるんだよ",
      "やっぱり○○はかわいいよ",
      "好き好き大好き",
      "やっぱ好き",
      "やっと見つけたお姫様",
      "俺が生まれてきた理由",
      "それはお前に出会うため",
      "俺と一緒に人生歩もう",
      "世界で一番愛してる",
      "ア・イ・シ・テ・ルーーー！！",
    ],
    pronunciationLines: [],
    continuousText:
      "言いたいことがあるんだよ　やっぱり○○はかわいいよ　好き好き大好き　やっぱ好き　やっと見つけたお姫様　俺が生まれてきた理由　それはお前に出会うため　俺と一緒に人生歩もう　世界で一番愛してる　ア・イ・シ・テ・ルーーー！！",
    continuousNote: "「○○」の部分にだけ推しの名前を入れ、それ以外は区切らず一気に唱えます。",
  },
  {
    // 2026-08-15改訂：以前はこのエントリー自体に「内緒バナシ」「部活中に目が合うなって
    // 思ってたんだ」のsongIdsとガチ恋口上と同じ本文を持たせていたが、実際には曲ごとに
    // 途中のフレーズ・切り替え後のMIXの速さが異なることが分かったため、「ガチ恋キャンセルとは
        // 何か」という概念の説明役に整理し、曲ごとの具体的な本文はsong-specific-koujouカテゴリの
    // 個別エントリー（naisho-banashi-cancel／bukatsuchu-cancel／kimi-no-dai-3-button-cancel）
    // に分離した。findSongRelatedGuideEntries()はsongIdsを持つエントリーを横断的に拾うため、
    // 曲別のコールガイドからはそれら個別エントリーの方が表示される。
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
      "曲によって、切り替えるタイミング・そのあとに続けるMIXの速さが異なります。「内緒バナシ」「部活中に目が合うなって思ってたんだ」「君の第3ボタン」では、それぞれの曲専用の具体的な流れを③のカードで案内しています。",
    differenceFromStandard: "通常のガチ恋口上を最後まで唱えず、途中で切り上げてMIXに合流する応用技です。",
    creditNote: null,
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: [
      "https://x.com/equallove_bot/status/1973710678868586806",
      "https://www.youtube.com/watch?v=b_pthvQ0j4s",
      "https://ikorabucall.com/bukatsuchu-ni-megaaunatte-omotteta-call/",
    ],
    lastVerifiedDate: "2026-08-15",
    confidence: "medium",
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
    confidence: "single-source",
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
      "歌唱メンバーの大場花菜が、初めて全体曲でソロセンターを務めた「海とレモンティー」用に自身のSHOWROOM配信で手書きして紹介し、その後X（旧Twitter）でも「ぜひ覚えてコールして頂けたら嬉しいです」と使ってほしい位置とあわせてファンへ公開・使用を呼びかけたことを、本人のX投稿・その内容を引用するファンブログの両方で直接確認できたため、本人考案の明記とあわせて本文を掲載しています。ファンの間では通常のガチ恋口上とは違う「独自の口上」として案内されており、通常版の亜種と呼ばれることもあります。",
    differenceFromStandard: "通常のガチ恋口上とは別に、この曲の間奏専用に大場花菜が考えた、曲固有の口上です。",
    creditNote: "歌唱メンバー本人（大場花菜）が考案し、この位置で使ってほしいとSHOWROOM配信・Xで呼びかけています。",
    // 2026-08-15追加：「○○」部分の説明（ガチ恋口上と同じ仕組み）。
    placeholderNote: "口上の中の「○○」には、あなたの推しメンバーの名前を入れて唱えます。",
    usedInEqualLove: true,
    sourceType: "self",
    sourceUrls: ["https://x.com/hana_oba/status/1828444068747321601", "https://equallove-2017.blog.jp/archives/36623970.html"],
    lastVerifiedDate: "2026-08-15",
    confidence: "high",
    recommendedPriority: null,
    textLines: [
      "言いたいことがあるけれど",
      "うまく言葉に出来なくて",
      "好きだと目を見て言えたなら",
      "こんなに苦しくないのかな",
      "大人になった今だって",
      "○○ずっと想ってる",
      "世界で一番愛してる",
      "ア・イ・シ・テ・ル",
    ],
    pronunciationLines: [],
    continuousText:
      "言いたいことがあるけれど　うまく言葉に出来なくて　好きだと目を見て言えたなら　こんなに苦しくないのかな　大人になった今だって　○○ずっと想ってる　世界で一番愛してる　ア・イ・シ・テ・ル",
    continuousNote: "「○○」の部分にだけ推しの名前を入れ、それ以外は区切らず唱えます。",
  },
  {
    id: "oshi-no-iru-sekai-koujou",
    name: "推しセカ口上",
    category: "song-specific-koujou",
    aliases: ["推しのいる世界 専用口上", "推せか口上"],
    songIds: ["oshi-no-iru-sekai"],
    difficulty: "advanced",
    frequency: "situational",
    usageScene: "曲中の口上区間（曲の3分56秒あたり）で、推しメンバーへの気持ちを伝える専用の口上として使われます。",
    startCue: "曲中の決まった区間で、通常のガチ恋口上の代わりに唱えます。",
    usageNote:
      "ファンの間では「推せか口上」とも呼ばれています。ファン向け情報サイトでは、卒業メンバーの佐竹のん乃さんを中心に生まれたと紹介されています。一方で、メンバー数名がSHOWROOM配信でファンと一緒に内容を考えていった、と伝えるファンサイトの記録もあり、情報源によって伝え方に幅があります。特定の1人だけが単独で考案したと断定できる一次情報（本人発信・公式発表）は今回確認できなかったため、「ファン間で定着している非公式コール」という扱いにとどめます。ライブ会場で手書きの口上プリントが配布されたことがある、という報告はファンブログで確認できましたが、そのプリントの文面自体を直接確認できる情報源が見つからなかったため、本文はこの画面には掲載していません（本人がdev/callGuideEditor.htmlから端末に個別に読み込むことは可能です）。",
    differenceFromStandard: "通常のガチ恋口上とは別に、この曲専用に作られた、曲固有の口上です。",
    // 画面には人物名を出典付きで案内するが、「確定した考案者」としては書かない（本人指示）。
    // 内部記録：
    //   ・ikorabucall.com（このアプリで既存の情報源として使用中のファンサイト）は
    //     「佐竹のん乃さんを中心に生まれた『推しセカ口上』」と明記。SHOWROOM配信等への
    //     直接の言及はページ内に見当たらなかった。
    //   ・2026-08-17時点の調査記録では、大場花菜・山本杏奈・野口衣織・佐々木舞香ら複数
    //     メンバーがSHOWROOM配信内でファンの声も交えて共同で内容を考えていった、という
    //     経緯を示す別の記録（一次ソースのSHOWROOM配信・関連ツイートを参照した二次情報）があった。
    //   ・この2つの記録は「中心人物」の有無について食い違いがあるため、画面上は
    //     「佐竹のん乃さんを中心に生まれたとされる」という緩やかな表現にとどめ、
    //     単独考案と断定する書き方はしない。
    //   ・2026-08-15再調査：全文の掲載を目的に改めて調査したが、ライブ会場で配布された
    //     プリントを報告するファンブログ記事（equallove-2017.blog.jp/archives/21066874.html、
    //     会場で紙が配布された事実の報告のみで、文面自体は写真のみ・文字起こしなし）以外に、
    //     全文を直接確認できる情報源は見つからなかった。検索エンジンの要約には具体的な
    //     文面らしきものが出てくることがあったが、実際に元のページを直接確認すると全文は
    //     掲載されておらず、出典を特定できない内容だったため、本人（アプリ利用者）から
    //     文面の提供を受けたものの、推測で埋めることはせず掲載を見送った
    //     （本人にも状況を説明し、追加の出典があれば再検討する前提で合意済み）。
    creditNote: "ファン向け情報サイトでは、卒業メンバーの佐竹のん乃さんを中心に生まれたと紹介されています（断定情報ではありません）。",
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: ["https://ikorabucall.com/oshi-no-iru-sekai-call/", "https://equallove-2017.blog.jp/archives/21066874.html"],
    lastVerifiedDate: "2026-08-15",
    confidence: "single-source",
    recommendedPriority: null,
    textLines: [],
    pronunciationLines: [],
  },
  {
    // 2026-08-15新規：以前は「gachikoi-cancel」1件のsongIdsにこの曲を含めて、ガチ恋口上と
    // 同じ本文を持たせていたが、本人からの情報提供で、実際にはこの曲では通常速度のMIXへ
    // 切り替える運用であることが分かったため、曲専用エントリーとして分離した。
    id: "naisho-banashi-cancel",
    name: "「内緒バナシ」専用 ガチ恋キャンセル",
    category: "song-specific-koujou",
    aliases: [],
    songIds: ["naisho-banashi"],
    difficulty: "advanced",
    frequency: "situational",
    usageScene: "ガチ恋口上の冒頭部分のあと、うりゃおいを経て英語MIX（通常速度）へ合流する、この曲専用の流れです。",
    startCue: "ガチ恋口上の冒頭4行を唱えたあと、周りに合わせて切り替えます。",
    usageNote:
      "ガチ恋口上の冒頭（言いたいことがあるんだよ〜やっぱ好き）を唱えたあと、最後まで続けずに「あ〜ふふっふー！」を挟み、うりゃおいを4回、手拍子を入れてから「しゃ〜いくぞ！」の合図で英語MIXへ合流します。ここでの英語MIXは通常の速さで唱える運用です。",
    differenceFromStandard: "ガチ恋口上を最後まで唱えず、冒頭だけで切り上げて英語MIX（通常速度）に合流する、この曲専用のアレンジです。",
    creditNote: "大谷映美里さんが考案したとされる、この曲専用の流れです。",
    placeholderNote: "「○○」には、あなたの推しメンバーの名前を入れて唱えます。",
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: [
      "https://x.com/equallove_bot/status/1973710678868586806",
      "https://ikorabucall.com/naisho-banashi-call/",
    ],
    lastVerifiedDate: "2026-08-15",
    confidence: "medium",
    recommendedPriority: null,
    textLines: [
      "言いたいことが、あるんだよ！",
      "やっぱり○○はかわいいよ！",
      "好き好き大好き！やっぱ好き！",
      "あ〜ふふっふー！",
      "うりゃ！おい！（×4、手拍子付き）",
      "しゃ〜いくぞ！",
      "タイガー！ファイヤー！サイバー！ファイバー！ダイバー！バイバー！ジャージャー！",
    ],
    pronunciationLines: [],
    continuousText:
      "言いたいことが、あるんだよ！やっぱり○○はかわいいよ！好き好き大好き！やっぱ好き！あ〜ふふっふー！　うりゃ！おい！×4（手拍子）　しゃ〜いくぞ！　タイガー！ファイヤー！サイバー！ファイバー！ダイバー！バイバー！ジャージャー！",
    continuousNote: "最後の英語MIX部分は通常の速さで唱えます。",
  },
  {
    id: "bukatsuchu-cancel",
    name: "「部活中に目が合うなって思ってたんだ」専用 ガチ恋キャンセル",
    category: "song-specific-koujou",
    aliases: [],
    songIds: ["bukatsuchu-ni-megaau-natte-omotteta-nda"],
    difficulty: "advanced",
    frequency: "situational",
    usageScene: "ガチ恋口上の冒頭部分のあと、うりゃおいを経て英語MIX（倍速）へ合流する、この曲専用の流れです。",
    startCue: "ガチ恋口上の冒頭4行を唱えたあと、周りに合わせて切り替えます。",
    usageNote:
      "ガチ恋口上の冒頭（言いたいことがあるんだよ〜やっぱ好き）を唱えたあと、最後まで続けずに「あーフフッフー！」を挟み、うりゃおいを4回、手拍子を入れてから「しゃー！いくぞー！」の合図で英語MIXへ合流します。ここでの英語MIXは早口（倍速）で唱え、最後に「イエッタイガー！」を付ける運用です。",
    differenceFromStandard: "ガチ恋口上を最後まで唱えず、冒頭だけで切り上げて英語MIX（倍速）に合流する、この曲専用のアレンジです。",
    creditNote: null,
    placeholderNote: "「○○」には、あなたの推しメンバーの名前を入れて唱えます。",
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: [
      "https://x.com/equallove_bot/status/1973710678868586806",
      "https://www.youtube.com/watch?v=b_pthvQ0j4s",
      "https://ikorabucall.com/bukatsuchu-ni-megaaunatte-omotteta-call/",
    ],
    lastVerifiedDate: "2026-08-15",
    confidence: "medium",
    recommendedPriority: null,
    textLines: [
      "言いたいことがあるんだよ！",
      "やっぱり○○はかわいいよ！",
      "好き好き大好き！やっぱ好き！",
      "あーフフッフー！",
      "うりゃ！おい！（×4、手拍子付き）",
      "しゃー！いくぞー！",
      "タイガー！ファイヤー！サイバー！ファイバー！ダイバー！バイバー！ジャージャー！（早口）",
      "イエッタイガー！",
    ],
    pronunciationLines: [],
    continuousText:
      "言いたいことがあるんだよ！やっぱり○○はかわいいよ！好き好き大好き！やっぱ好き！あーフフッフー！　うりゃ！おい！×4（手拍子）　しゃー！いくぞー！　（早口で）タイガー！ファイヤー！サイバー！ファイバー！ダイバー！バイバー！ジャージャー！　イエッタイガー！",
    continuousNote: "最後の英語MIX部分は倍速（早口）で唱え、「イエッタイガー！」まで続けます。",
  },
  {
    id: "kimi-no-dai-3-button-cancel",
    name: "「君の第3ボタン」専用 ガチ恋キャンセル",
    category: "song-specific-koujou",
    aliases: [],
    songIds: ["kimi-no-dai-3-button"],
    difficulty: "advanced",
    frequency: "situational",
    usageScene: "ガチ恋口上のごく冒頭だけを、この曲専用のアレンジで唱える短いバージョンです。",
    startCue: "曲中のガチ恋口上の位置で、この曲専用の短いバージョンを唱えます。",
    usageNote:
      "通常のガチ恋口上とほぼ同じ形ですが、2行目だけ「やっぱり○○はかわいいよ」ではなく「やっぱり君には言えないよ」という、この曲専用のアレンジになっています。齋藤樹愛羅さんが考案したとされています。",
    differenceFromStandard: "冒頭の短いフレーズだけを唱える、この曲専用の短縮・アレンジ版です。2行目のフレーズが通常のガチ恋口上と異なります。",
    creditNote: "齋藤樹愛羅さんが考案したとされる、この曲専用のアレンジです。",
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: ["https://ikorabucall.com/kimi-no-daisan-button-call/"],
    lastVerifiedDate: "2026-08-15",
    confidence: "single-source",
    recommendedPriority: null,
    textLines: [
      "言いたいことがあるんだよ！",
      "やっぱり君には言えないよ！",
      "好き好き大好きやっぱ好き！",
      "あーフフッフー！",
    ],
    pronunciationLines: [],
    continuousText: "言いたいことがあるんだよ！やっぱり君には言えないよ！好き好き大好きやっぱ好き！あーフフッフー！",
    continuousNote: "通常のガチ恋口上との違いは2行目だけです。",
  },
];
