// ライブコールモードの「MIX・口上」タブで案内する、MIX・口上の一覧データファイル
// （js/data/mixTypes.jsを置き換え、対象をMIXだけでなく口上まで広げたもの。2026-08-06）。
//
// 【著作権方針・2026-08-15再改訂（本人指示）】
//   ・基本MIX（英語MIX・日本語MIX・アイヌ語MIX）：特定の一人の作者による創作物ではなく、
//     多くのアイドル現場で広く共有されている定型の掛け声（複数の独立した情報源で内容が
//     一致することを確認済み）のため、textLines・pronunciationLinesを直接含める。
//   ・ガチ恋口上／ガチ恋キャンセル：2026-08-15に改めて調査した結果、一般的な「ガチ恋口上」の
//     基本形は＝LOVE固有の創作物ではなく、多くのアイドル現場で広く使われている定型文だと
//     複数の独立した一般アイドル文化解説サイト（choconono.com・kukoshakaku.com等、
//     いずれも特定のアイドルグループに紐づかない一般的な用語解説サイト）で内容が一致する
//     ことを確認できたため、基本MIXと同じ扱いとしてtextLinesを含めることにした
//     （本人指示：「イコラブのコールはみんなに広まってほしいという意図がある」を踏まえつつ、
//     内容そのものが個人の創作物ではなく一般的な定型文であることを実際に複数ソースで
//     確認したうえでの判断）。ガチ恋キャンセルは、このガチ恋口上と同じ本文を、曲によって
//     決まった位置で打ち切りMIXへ切り替えるという「使い方の違い」のため、同じtextLinesを持つ。
//   ・曲専用口上（海レモ口上・推しセカ口上）：引き続き本文を含めない。
//     海レモ口上は、歌唱メンバー本人（大場花菜）のSHOWROOM配信・X投稿を根拠に内容を
//     確認できており、本人が「ぜひ覚えてコールして頂けたら嬉しいです」と公に呼びかけている
//     ことも確認したが、内容自体はメンバー個人が考えた創作性の高い文章（一般的な定型文とは
//     性質が異なる）であるため、Git管理された公開リポジトリへの掲載は見送り、本人（アプリ
//     利用者）へ確認済みの文面と出典を直接共有し、必要ならdev/callGuideEditor.htmlから
//     端末ローカルに追加してもらう運用とした。
//     推しセカ口上は、2026-08-15に改めて全文の確認を試みたが、考案者・正確な文面のいずれも
//     信頼できる情報源から直接確認できなかった（検索エンジンの要約に文面らしきものが
//     出てくることはあったが、実際に情報源のページを直接確認すると全文は掲載されていなかった）
//     ため、推測で埋めることはせず、引き続き本文を一切含めない。
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
// 【2026-08-24追加・本人指示】confidenceフィールド（"high"|"medium"|"single-source"）を
// 追加した。複数の独立ソースで内容が一致していればhigh、定番のファンサイト1件でも
// 内容が具体的で矛盾がなければmedium、根拠が弱い・情報源が1つだけで揺れがある場合は
// single-sourceとする。画面には出さず、将来情報を見直すときの内部記録として使う
// （本人指示：「将来情報が変わった時に、どこから確認した情報か追跡できるように」）。
//
// category: "mix"（基本MIX） | "koujou"（口上・キャンセル等の応用） | "special"（＝LOVEでの使用が
// 未確認・使われない例として掲載するもの） | "song-specific-koujou"（特定の曲専用の口上）
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
    // 2026-08-24追加：単語を1つずつではなく「実際に続けて唱えるとこうなる」を示す1本の流れ。
    // 本人指示：「単語は分かったけど、どういう順番で全部言うの？とならないUIにしてください」への対応。
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
    usageNote: "英語MIXと対になる定番のMIXで、ファン向け資料で＝LOVEのライブでの使用例も確認できます。「海女」を「海人」と表記する資料もあり、細かな表記には揺れがあります。曲や会場によって、最後に「飛（とび）」「除去（じょきょ）」を続けるパターンもあるようですが、揺れが大きいためこのアプリでは基本の7語のみを掲載しています。",
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
    confidence: "medium",
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
    // 初心者の疑問に答えるための説明文。掛け声本文自体は掲載しないため、あくまで
    // 「仕組み」の説明にとどめる（js/callGuidePanel.jsで、可能であれば現在設定中の
    // 推しメンバー名を添えて表示する）。
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
    id: "gachikoi-cancel",
    name: "ガチ恋キャンセル",
    category: "koujou",
    aliases: [],
    // 2026-08-24改訂：確認できた2曲分の使用例をsongIdsに追加し、曲別のコールガイドからも
    // このカードへ辿れるようにした（本人指示）。他機能はcategory:"koujou"のsongIdsを
    // 参照していないため、追加による既存機能への影響はない。
    songIds: ["naisho-banashi", "bukatsuchu-ni-megaau-natte-omotteta-nda"],
    difficulty: "advanced",
    frequency: "situational",
    usageScene: "ガチ恋口上の途中で、あえて最後まで言い切らずに別のMIXへ切り替える、応用的な使い方です。",
    startCue: "ガチ恋口上を唱えている途中、決まったタイミングで周りに合わせて切り替えます。",
    usageNote:
      "切り替え後の速さは曲によって異なることが確認できています。「内緒バナシ」では倍速ではなく通常の速さのMIXへ切り替える運用、「部活中に目が合うなって思ってたんだ」では英語MIXを倍速で唱える運用、という情報をそれぞれ確認しています。どちらもファンの間で定着している運用のため、その場の周りの様子に合わせるのが安心です。",
    differenceFromStandard: "通常のガチ恋口上を最後まで唱えず、途中で切り上げてMIXに合流する応用技です。",
    creditNote: null,
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: [
      "https://x.com/equallove_bot/status/1973710678868586806",
      "https://www.youtube.com/watch?v=b_pthvQ0j4s",
      "https://ikorabucall.com/bukatsuchu-ni-megaaunatte-omotteta-call/",
    ],
    lastVerifiedDate: "2026-08-24",
    confidence: "medium",
    recommendedPriority: "advanced",
    // 2026-08-15追加：ガチ恋キャンセルは新しい文章を使うわけではなく、上のガチ恋口上と
    // 同じ本文を曲ごとに決まった位置で打ち切り、MIXへ合流するという「使い方の違い」のため、
    // 本文（textLines/continuousText）はガチ恋口上と共通のものを持たせている。
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
    continuousNote: "実際には曲ごとに決まった位置で最後まで言わず打ち切り、MIXへ切り替えます（上のusageNote参照）。",
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
      "歌唱メンバーの大場花菜が、自身のSHOWROOM配信でファンと一緒に内容を考える「ガチ恋会議」を行い、その後X（旧Twitter）で「ぜひ覚えてコールして頂けたら嬉しいです」と使ってほしい位置と合わせてファンへ呼びかけたことが確認できます。ファンの間では通常のガチ恋口上とは違う「独自の口上」として案内されており、通常版の亜種と呼ばれることもあります。2026-08-15に本人が公に呼びかけている事実を複数の情報源（本人のSHOWROOM配信・X投稿、ファンブログでの引用）を直接確認したうえで、内容は本人が個人的に考えた創作性の高い文章であることに変わりはないと判断し、この画面（Git管理された公開リポジトリ）には掲載していません。本人が確認済みの文面をお持ちの場合は、dev/callGuideEditor.htmlから端末ローカルに個別に読み込むことができます。",
    differenceFromStandard: "通常のガチ恋口上とは別に、この曲の間奏専用に作られた、曲固有の口上です。",
    creditNote: "歌唱メンバー本人（大場花菜）が、この位置で使ってほしいとXで呼びかけています。",
    usedInEqualLove: true,
    sourceType: "self",
    sourceUrls: ["https://x.com/hana_oba/status/1828444068747321601", "https://equallove-2017.blog.jp/archives/36623970.html"],
    lastVerifiedDate: "2026-08-15",
    confidence: "high",
    recommendedPriority: null,
    textLines: [],
    pronunciationLines: [],
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
      "ファンの間では「推せか口上」とも呼ばれています。ファン向け情報サイトでは、卒業メンバーの佐竹のん乃さんを中心に生まれたと紹介されています。一方で、メンバー数名がSHOWROOM配信でファンと一緒に内容を考えていった、と伝えるファンサイトの記録もあり、情報源によって伝え方に幅があります。特定の1人だけが単独で考案したと断定できる一次情報（本人発信・公式発表）は今回確認できなかったため、「ファン間で定着している非公式コール」という扱いにとどめます。掛け声本文は創作性の高い内容のため、この画面には掲載していません（本人がdev/callGuideEditor.htmlから端末に個別に読み込むことは可能です）。",
    differenceFromStandard: "通常のガチ恋口上とは別に、この曲専用に作られた、曲固有の口上です。",
    // 画面には人物名を出典付きで案内するが、「確定した考案者」としては書かない（本人指示）。
    // 内部記録（2026-08-24再調査）：
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
    //     プリントを報告するファンブログ記事（会場で紙が配布された事実の報告のみで、
    //     文面自体は写真のみ・文字起こしなし）以外に、全文を直接確認できる情報源は
    //     見つからなかった。検索エンジンの要約には具体的な文面らしきものが出てくることが
    //     あったが、実際に元のページを直接確認すると全文は掲載されておらず、出典を
    //     特定できない内容だったため、推測で埋めることはせず掲載を見送った。
    creditNote: "ファン向け情報サイトでは、卒業メンバーの佐竹のん乃さんを中心に生まれたと紹介されています（断定情報ではありません）。",
    usedInEqualLove: true,
    sourceType: "fan",
    sourceUrls: ["https://ikorabucall.com/oshi-no-iru-sekai-call/"],
    lastVerifiedDate: "2026-08-24",
    confidence: "single-source",
    recommendedPriority: null,
    textLines: [],
    pronunciationLines: [],
  },
];
