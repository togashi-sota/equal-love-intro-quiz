// 「質問AI」の聞き方の言葉の表（2026-11-03新設・R11-C）。
// ここには「聞き方」（何枚目・センター・いつ…）と、名前の分け方だけを書く。曲名・メンバー・作品・映像などの中身は
// 既存のデータ（js/data/*.js）から js/qaEngine.js が組み立てる（書き写さない）。
// 言葉は自然な書き方で書く（読み込むときに js/qaText.js の normalizePhrases で、ひらがな・全角半角・異体字をそろえる）。

// メンバーの姓・名（members.js の name・reading を分けたもの。「野口」「衣織」「いおり」だけでも分かるように）
// givenReadingSafe：名の読みだけで探してよいか（「はな」「さな」「りさ」「あんな」は普通の言葉にも出てくるので使わない）
export const QA_MEMBER_NAME_PARTS = {
  "otani-emiri": { family: "大谷", given: "映美里", familyReading: "おおたに", givenReading: "えみり", givenReadingSafe: true },
  "oba-hana": { family: "大場", given: "花菜", familyReading: "おおば", givenReading: "はな", givenReadingSafe: false },
  "otoshima-risa": { family: "音嶋", given: "莉沙", familyReading: "おとしま", givenReading: "りさ", givenReadingSafe: false },
  "saito-kiara": { family: "齋藤", given: "樹愛羅", familyReading: "さいとう", givenReading: "きあら", givenReadingSafe: true },
  "sasaki-maika": { family: "佐々木", given: "舞香", familyReading: "ささき", givenReading: "まいか", givenReadingSafe: true },
  "takamatsu-hitomi": { family: "髙松", given: "瞳", familyReading: "たかまつ", givenReading: "ひとみ", givenReadingSafe: true },
  "takiwaki-shoko": { family: "瀧脇", given: "笙古", familyReading: "たきわき", givenReading: "しょうこ", givenReadingSafe: true },
  "noguchi-iori": { family: "野口", given: "衣織", familyReading: "のぐち", givenReading: "いおり", givenReadingSafe: true },
  "morohashi-sana": { family: "諸橋", given: "沙夏", familyReading: "もろはし", givenReading: "さな", givenReadingSafe: false },
  "yamamoto-anna": { family: "山本", given: "杏奈", familyReading: "やまもと", givenReading: "あんな", givenReadingSafe: false },
  "satake-nonno": { family: "佐竹", given: "のん乃", familyReading: "さたけ", givenReading: "のんの", givenReadingSafe: true },
  "saito-nagisa": { family: "齊藤", given: "なぎさ", familyReading: "さいとう", givenReading: "なぎさ", givenReadingSafe: true },
};

// 聞き方の言葉（意図ごと）
export const QA_INTENT_PHRASES = {
  // 推測・主観になる質問（答えない）
  speculation: ["次のセンター", "次センター", "卒業しそう", "卒業する予定", "解散する", "解散しそう", "恋人", "彼氏", "彼女いる", "結婚", "一番かわいい", "いちばんかわいい", "一番人気", "人気順", "予想", "どうなる", "嫌い", "仲が悪い", "おすすめの曲", "一番いい曲"],
  workNumberQuestion: ["何枚目", "何番目", "何作目", "何thシングル", "何枚め", "なんまいめ", "なんばんめ", "何枚目のシングル", "何番目のシングル"],
  single: ["シングル", "枚目", "番目", "作目"],
  album: ["アルバム"],
  center: ["センター"],
  tracks: ["収録曲", "カップリング", "入っている曲", "入ってる曲", "何曲", "曲目", "収録されている曲", "どんな曲が"],
  releaseDate: ["いつ発売", "発売日", "いつ出た", "いつリリース", "リリース日", "発売はいつ", "いつ", "発売", "リリース"],
  joinReason: ["なぜ", "どうして", "なんで", "理由", "きっかけ", "入った", "加入した", "加入の", "オーディション", "応募"],
  joinDate: ["いつ加入", "加入日", "いつ入った", "加入はいつ", "いつから", "いつに入った", "いつ入"],
  radio: ["ラジオ"],
  preDebut: ["加入前", "入る前", "以前", "前は何", "デビュー前", "前職", "昔は何"],
  color: ["メンバーカラー", "カラー", "何色", "色は", "ペンライト"],
  birthday: ["誕生日", "生年月日", "何歳", "年齢", "いつ生まれ"],
  birthplace: ["出身", "どこ生まれ"],
  height: ["身長"],
  bloodType: ["血液型"],
  profile: ["どんな人", "プロフィール", "について", "紹介", "教えて", "って誰", "とは", "どういう人", "特徴", "人物"],
  tv: ["テレビ", "番組", "バラエティ", "出演番組", "tv"],
  regular: ["レギュラー", "冠番組", "mc", "ナビゲーター"],
  musicTv: ["音楽番組", "歌番組", "披露", "歌った", "テレビで歌"],
  cm: ["cm", "シーエム", "広告", "企業コラボ", "コラボ", "タイアップ"],
  recent: ["最近", "最新", "新しい", "直近", "今年"],
  past: ["昔", "初期", "古い", "最初", "はじめ", "初めて"],
  stage: ["舞台", "ミュージカル", "朗読劇"],
  voice: ["声優", "アニメ", "吹き替え", "ナレーション"],
  drama: ["ドラマ", "映画", "出演作品", "出演作"],
  activities: ["個人活動", "活動", "ラジオ", "モデル", "アンバサダー", "観光大使", "連載"],
  youtube: ["youtube", "ユーチューブ", "ようつべ", "動画"],
  live: ["ライブ", "公演", "コンサート", "ツアー", "単独"],
  bonus: ["特典映像", "特典", "映像", "dvd", "blu-ray", "ブルーレイ", "bd", "円盤"],
  whichCd: ["どれに入ってる", "何に入ってる", "どこに入ってる", "どのcd", "どのシングル", "どの作品", "どのtype", "何に入って", "どれに入って", "どこに入って", "どこで見られる", "どこに収録", "収録先", "入っている", "入ってる", "見られる"],
  cd: ["cd", "シングル", "アルバム"],
  liveVideo: ["ライブ映像"],
  lyricist: ["作詞", "作曲", "編曲", "振り付け", "振付"],
  news: ["最新情報", "発表", "ニュース", "お知らせ", "告知", "決定", "新曲"],
  leader: ["リーダー", "キャプテン"],
  memberCount: ["何人", "人数", "メンバーは誰", "メンバー一覧", "今のメンバー", "メンバーを教えて", "メンバー全員", "のメンバーは"],
  graduated: ["卒業したメンバー", "卒業メンバー", "元メンバー"],
  feature: ["どこで", "どこにある", "やり方", "使い方", "練習", "できる", "どうやって", "見方", "遊び方"],
  now: ["今の", "現在の", "今も", "いま"],
};

// 分類の言葉（特典映像の分類を、質問の言葉で選ぶ。分類の id は js/data/cdBonus.js の CD_BONUS_CATEGORIES）
export const QA_BONUS_CATEGORY_WORDS = {
  trip: ["旅行", "ロケ", "社員旅行"],
  variety: ["ゲーム", "企画", "社員研修"],
  making: ["メイキング"],
  live: ["ライブ映像", "パフォーマンス"],
  tv: ["番組", "ダイジェスト"],
  event: ["イベント", "大感謝祭"],
  mv: ["mv", "ミュージックビデオ"],
};

// 答えから外す、質問に出てくるだけの言葉（特典映像の言葉探しで残りの言葉にしない）
export const QA_FILLER_WORDS = [
  "特典映像", "特典", "映像", "どのcd", "どの", "cd", "dvd", "blu-ray", "ブルーレイ", "bd", "円盤", "入っている", "入ってる", "収録", "見られる", "見たい",
  "どこ", "何", "なに", "です", "ですか", "ます", "ました", "か", "は", "の", "が", "を", "に", "で", "って", "教えて", "ください", "について", "どれ", "シングル", "作品",
];
