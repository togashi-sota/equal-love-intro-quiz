// メンバーの編集的な補足コンテンツ（紹介文・趣味・特技・愛称・ファンネーム・加入前の活動・
// 志望動機）を保持するデータファイル。members.js（ほぼ不変の核となる事実）とは分離し、
// 取材・確認が必要な性質のコンテンツをまとめている（2026-08-02、ファイル分割方針）。
//
// 各項目は { text/items, sourceType, sourceUrls, lastVerifiedDate } という形で持たせ、
// 情報源と確度を追跡できるようにしている。sourceTypeは以下の5段階：
//   official   … 公式サイト・運営公式・所属事務所公式
//   self       … 本人の公式SNS・本人配信・本人インタビュー
//   reliable   … 出版社・大手メディア等の信頼できるインタビュー記事
//   fan        … ファンの間で定着している情報（公式ではない）
//   unverified … 確認不足（このファイルでは未使用。確認不足の項目はそもそも掲載しない）
//
// 詳しい調査経緯・掲載を見送った項目とその理由は docs/member-research-notes.md（非公開）参照。
//
// 【2026-08-02時点の注意】12名全員、introduction/preDebutActivity/auditionMotivationまで
// 入力済み（まずパイロット6名で画面の動作確認を行ってから、残り6名を追加した）。
// ただし、根拠不十分と判断した項目（齋藤樹愛羅の志望動機・瀧脇笙古の加入前の活動/志望動機等）は
// 意図的にnullのまま残している（掲載を見送った理由の詳細はdocs/member-research-notes.md参照）。
// 画面側は該当データが無いセクションを自動的に非表示にするため、一部null項目があっても表示は崩れない。
//
// 【2026-08-03追加】introductionは「加入前・人物像・得意分野・代表的な実績」など変わりにくい
// 内容を中心にする方針とし、番組名・放送頻度・継続状況など変わりやすい情報は
// memberActivities.js側（個人活動・レギュラー企画）に分離する（本人方針）。
//
// 【2026-08-03追加】任意項目episodeNote（{ text, sourceType, sourceUrls, lastVerifiedDate } | null）を
// 新設。活動休止・復帰・センター交代など、紹介文に入れると重くなる一度きりの転機的なエピソードを
// 分けて持たせるためのもの（現時点では髙松瞳のみ使用、他メンバーはnull）。

export const MEMBER_PROFILES = [
  {
    memberId: "otani-emiri",
    introduction: {
      text: "アイドルグループ「アキシブproject」での活動を経て、指原莉乃プロデュースに惹かれて＝LOVEのオーディションに応募した。個人YouTubeチャンネルのほか、ファッション・コスメ関連のブランド活動にも取り組んでいる。",
      sourceType: "reliable",
      sourceUrls: ["https://bisweb.jp/interview/124154"],
      lastVerifiedDate: "2026-08-03",
    },
    hobbies: { items: [], sourceType: "official", sourceUrls: [], lastVerifiedDate: null },
    skills: { items: [], sourceType: "official", sourceUrls: [], lastVerifiedDate: null },
    favoriteThings: null,
    nicknames: [{ text: "みりにゃ", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "みりにゃ甘やかし隊", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "アイドルグループ「アキシブproject」に所属していたとされる（2013年〜2016年）。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/大谷映美里"],
      lastVerifiedDate: "2026-08-02",
    },
    auditionMotivation: {
      text: "アキシブproject卒業後もアイドルという夢を諦めきれず、指原莉乃プロデュースに強く惹かれて＝LOVEのオーディションに応募した。",
      sourceType: "reliable",
      sourceUrls: ["https://bisweb.jp/interview/124154"],
      lastVerifiedDate: "2026-08-02",
    },
  },
  {
    memberId: "oba-hana",
    introduction: {
      text: "中学時代の経験を経て、指原莉乃プロデューサーの「変わりたい子に受けてほしい」という言葉に動かされ、＝LOVEのオーディションに応募した。宝塚歌劇をこよなく愛し、元AKB48・高橋みなみのファンとしても知られる。",
      sourceType: "self",
      sourceUrls: ["https://townwork.net/magazine/job/workstyle/99678/"],
      lastVerifiedDate: "2026-08-03",
    },
    hobbies: {
      items: ["舞台・ミュージカル観劇", "レトロなファッション・スポット巡り・収集", "動物の赤ちゃんを見ること"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/oba_hana"],
      lastVerifiedDate: "2026-08-02",
    },
    skills: {
      items: ["イラスト（#はなすと）", "書道"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/oba_hana"],
      lastVerifiedDate: "2026-08-02",
    },
    favoriteThings: {
      items: ["宝塚歌劇（推し：望海風斗）", "高橋みなみ（元AKB48）"],
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/大場花菜", "https://mdpr.jp/news/detail/4807831"],
      lastVerifiedDate: "2026-08-03",
    },
    nicknames: [
      { text: "はなちゃん", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
      { text: "はなまる", sourceType: "self", sourceUrls: ["https://ameblo.jp/equal-oba/"], lastVerifiedDate: "2026-08-02" },
    ],
    fanName: { text: "花菜まる", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "AKB48のオーディションに挑戦した経験があるとされる。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/大場花菜"],
      lastVerifiedDate: "2026-08-02",
    },
    auditionMotivation: {
      text: "中学時代に不登校を経験し、変わりたいという思いを抱えていたところ、指原莉乃プロデューサーの「変わりたい子に受けてほしい」という言葉に動かされて応募した。",
      sourceType: "self",
      sourceUrls: ["https://townwork.net/magazine/job/workstyle/99678/"],
      lastVerifiedDate: "2026-08-02",
    },
  },
  {
    memberId: "otoshima-risa",
    introduction: {
      text: "幼い頃からアイドルを目指し、数多くのオーディションに挑戦した末に＝LOVEへ加入した。グループ内では『姫』の愛称で親しまれ、楽曲やファン文化を通して『＝LOVEの公式彼女』『お姫様』のようなイメージでも支持されている。ファッション誌のレギュラーモデルも務めている。",
      sourceType: "reliable",
      sourceUrls: ["https://townwork.net/magazine/job/workstyle/123879/", "https://ja.wikipedia.org/wiki/音嶋莉沙"],
      lastVerifiedDate: "2026-08-03",
    },
    hobbies: {
      items: ["人間観察", "コスメを集めること", "食べ歩き"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/otoshima_risa"],
      lastVerifiedDate: "2026-08-02",
    },
    skills: {
      items: ["フラフープ", "ファンの方の名前を覚えること", "福岡愛を語ること"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/otoshima_risa"],
      lastVerifiedDate: "2026-08-02",
    },
    favoriteThings: null,
    nicknames: [
      { text: "りさちゃん", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
      { text: "姫", sourceType: "reliable", sourceUrls: ["https://ja.wikipedia.org/wiki/音嶋莉沙"], lastVerifiedDate: "2026-08-03" },
    ],
    // ファンネームは確認できなかったため掲載しない（項目自体を非表示にする方針、画面側で対応）
    fanName: null,
    preDebutActivity: {
      text: "アイドルグループ「iDOL Street」に所属していたとされる（2015年〜2016年）。また、HKT48の4期生オーディションに合格したものの、他事務所との契約が判明し取り消しになったとされる。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/音嶋莉沙"],
      lastVerifiedDate: "2026-08-02",
    },
    auditionMotivation: {
      text: "幼稚園の頃からアイドルを目指し、5年生の頃から数多くのオーディションに挑戦していたという。＝LOVEのオーディションを、それまでで最後の挑戦と決めて臨んだ。",
      sourceType: "self",
      sourceUrls: ["https://townwork.net/magazine/job/workstyle/123879/"],
      lastVerifiedDate: "2026-08-02",
    },
  },
  {
    memberId: "saito-kiara",
    introduction: {
      text: "中学生で＝LOVEのメンバーとしてデビューした、グループ最年少メンバー。「Kiara Tiara」「Queens」などのダンスナンバーで存在感のあるパフォーマンスを見せ、ファンの間でも屈指のダンスメンバーとして知られている。",
      sourceType: "fan",
      sourceUrls: [],
      lastVerifiedDate: "2026-08-03",
    },
    hobbies: {
      items: ["ゲーム", "カラオケに行くこと", "メイク動画を見て真似すること"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/saito_kiara"],
      lastVerifiedDate: "2026-08-02",
    },
    skills: {
      items: ["立ちブリッジ", "秒数を頭の中で測ること", "ドラえもんとまさおくんのモノマネ"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/saito_kiara"],
      lastVerifiedDate: "2026-08-02",
    },
    favoriteThings: null,
    nicknames: [{ text: "きゃーたん", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "きあら部", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "アイドルユニット「amorecarina」に所属していたとされる（2014年〜2016年）。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/齋藤樹愛羅"],
      lastVerifiedDate: "2026-08-02",
    },
    // 志望動機は根拠が不十分（記事タイトルのみで本文未確認）のため、現時点では掲載を見送っている。
    auditionMotivation: null,
  },
  {
    memberId: "sasaki-maika",
    introduction: {
      text: "愛知のご当地アイドルとしての活動や声優養成所への通学を経て、「声優アイドル」という言葉に惹かれ＝LOVEのオーディションに応募した。山本杏奈とのYouTube「イコラブのあんまい」をはじめ、テレビ番組などでも活動の幅を広げている。",
      sourceType: "reliable",
      sourceUrls: ["https://ray-web.jp/55752"],
      lastVerifiedDate: "2026-08-03",
    },
    hobbies: { items: ["寝ること"], sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/sasaki_maika"], lastVerifiedDate: "2026-08-02" },
    skills: {
      items: ["絡まったネックレスを絶対に解くこと"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/sasaki_maika"],
      lastVerifiedDate: "2026-08-02",
    },
    favoriteThings: null,
    nicknames: [{ text: "まいか", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "もちごころ", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "ご当地アイドルグループ「穂の国娘。」に所属していたとされる（2016年〜2017年、＝LOVE合格に伴い卒業）。声優養成所にも在籍していたとされる。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/佐々木舞香"],
      lastVerifiedDate: "2026-08-02",
    },
    auditionMotivation: {
      text: "小学5年生の頃から声優を志し、オーディションの募集要項にあった「声優アイドル」という言葉に惹かれて応募した。",
      sourceType: "reliable",
      sourceUrls: ["https://ray-web.jp/55752"],
      lastVerifiedDate: "2026-08-02",
    },
  },
  {
    memberId: "takamatsu-hitomi",
    introduction: {
      text: "デビュー曲でセンターを務め、グループ初期を象徴する存在として多くの表題曲のセンターを担当した。他グループのオーディションに挑戦した経験を経て、指原莉乃プロデューサーの言葉に背中を押され＝LOVEのオーディションに応募した。",
      sourceType: "reliable",
      sourceUrls: ["https://mdpr.jp/interview/detail/1782949", "https://www.oricon.co.jp/news/2142700/"],
      lastVerifiedDate: "2026-08-03",
    },
    hobbies: {
      items: ["映画・ドラマ鑑賞"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/takamatsu_hitomi"],
      lastVerifiedDate: "2026-08-02",
    },
    skills: {
      items: ["バトントワリング"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/takamatsu_hitomi"],
      lastVerifiedDate: "2026-08-02",
    },
    favoriteThings: null,
    nicknames: [{ text: "ひとみん", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "eye's（アイズ）", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "他グループのオーディションに挑戦した経験があるとされる。",
      sourceType: "self",
      sourceUrls: ["https://mdpr.jp/interview/detail/1782949"],
      lastVerifiedDate: "2026-08-02",
    },
    auditionMotivation: {
      text: "他グループのオーディション不合格を経て一度はアイドルを諦めかけていたが、指原莉乃プロデューサーの「今の自分を変えたい子に応募してほしい」という言葉をテレビで見て、応募を決めた。",
      sourceType: "self",
      sourceUrls: ["https://mdpr.jp/interview/detail/1782949"],
      lastVerifiedDate: "2026-08-02",
    },
    episodeNote: {
      text: "2019年秋から約1年間活動を休止し、2020年に復帰。2022年、11thシングルからのセンター交代を自ら発表した。",
      sourceType: "reliable",
      sourceUrls: [
        "https://www.oricon.co.jp/news/2142700/",
        "https://www.oricon.co.jp/news/2233370/",
        "https://natalie.mu/music/pp/equallove13",
      ],
      lastVerifiedDate: "2026-08-03",
    },
  },
  {
    memberId: "takiwaki-shoko",
    introduction: {
      text: "運動能力の高さで知られ、フルマラソンでは東京マラソン2023でサブ4（3時間57分06秒）を達成。SASUKEなどのスポーツ番組にも挑戦してきたほか、大の横浜DeNAベイスターズファンとしても知られる。",
      sourceType: "reliable",
      sourceUrls: [
        "https://www.fmyokohama.jp/r847/2023/12/jog-station-3310.html",
        "https://ja.wikipedia.org/wiki/瀧脇笙古",
      ],
      lastVerifiedDate: "2026-08-03",
    },
    hobbies: {
      items: ["料理", "ヘアアレンジ", "横浜散策", "カフェ巡り"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/takiwaki_shoko"],
      lastVerifiedDate: "2026-08-02",
    },
    skills: {
      items: ["マラソン"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/takiwaki_shoko"],
      lastVerifiedDate: "2026-08-02",
    },
    favoriteThings: null,
    nicknames: [{ text: "しょこ", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "しょこら", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: null,
    auditionMotivation: null,
  },
  {
    memberId: "noguchi-iori",
    introduction: {
      text: "幼い頃からアニメ作品をきっかけに声優を志しており、＝LOVEのオーディション募集要項にあった「声優アイドル」という言葉に惹かれて応募した。現在はテレビ番組でMCを務めるなど、活動の幅を広げている。",
      sourceType: "self",
      sourceUrls: ["https://townwork.net/magazine/job/workstyle/89011/"],
      lastVerifiedDate: "2026-08-02",
    },
    hobbies: {
      items: ["アニメ・漫画・ゲーム", "動画鑑賞"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/noguchi_iori"],
      lastVerifiedDate: "2026-08-02",
    },
    skills: { items: [], sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/noguchi_iori"], lastVerifiedDate: "2026-08-02" },
    favoriteThings: null,
    nicknames: [
      { text: "いおり", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
      { text: "いーちゃん", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-03" },
    ],
    fanName: { text: "いおりんぐ", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "幼い頃からアニメ作品（『うたの☆プリンスさまっ♪』『ラブライブ!』）をきっかけに声優を志しており、代々木アニメーション学院への進学も検討していたとされる。",
      sourceType: "self",
      sourceUrls: ["https://townwork.net/magazine/job/workstyle/89011/"],
      lastVerifiedDate: "2026-08-02",
    },
    auditionMotivation: {
      text: "代々木アニメーション学院を調べる中で、同校が関わる＝LOVEのオーディション募集要項にあった「声優アイドル」という言葉に惹かれて応募した。",
      sourceType: "self",
      sourceUrls: ["https://townwork.net/magazine/job/workstyle/89011/"],
      lastVerifiedDate: "2026-08-02",
    },
  },
  {
    memberId: "morohashi-sana",
    introduction: {
      text: "モデルオーディションやアイドルユニットでの活動など、＝LOVE加入前から豊富な歌唱・芸能経験を持つ現役メンバー最年長。グループ活動に加え、ソロで歌唱ステージへ出演する機会も多い。",
      sourceType: "reliable",
      sourceUrls: [
        "https://ja.wikipedia.org/wiki/諸橋沙夏",
        "https://news.yahoo.co.jp/articles/2dafb0983410885431c3e6145f23de1079cdf6cc",
      ],
      lastVerifiedDate: "2026-08-03",
    },
    hobbies: { items: [], sourceType: "official", sourceUrls: [], lastVerifiedDate: null },
    skills: { items: [], sourceType: "official", sourceUrls: [], lastVerifiedDate: null },
    favoriteThings: null,
    nicknames: [{ text: "さなつん", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "つん族", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "モデルオーディション「Miss Seventeen 2010」ファイナリストや、ヤマハ主催オーディションでの受賞、アニソンユニットでの活動、震災復興支援アイドルユニット「Baby Tiara」への所属など、複数の芸能活動歴があるとされる。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/諸橋沙夏"],
      lastVerifiedDate: "2026-08-02",
    },
    auditionMotivation: {
      text: "大学3年生で進路に悩んでいた際、母と友人の勧めで＝LOVEのオーディションに応募した。",
      sourceType: "self",
      sourceUrls: ["https://townwork.net/magazine/serial/idol/49229/"],
      lastVerifiedDate: "2026-08-02",
    },
  },
  {
    memberId: "yamamoto-anna",
    introduction: {
      text: "＝LOVEのリーダー。広島のご当地アイドルグループでリーダーを務めた経験を経て上京し、数々のオーディションへの挑戦を重ねた末に＝LOVEへ加入した。広島東洋カープの熱心なファンとしても知られ、SHOWROOMなどでも活動している。",
      sourceType: "reliable",
      sourceUrls: ["https://suumo.jp/town/entry/hiroshima-yamamotoanna/"],
      lastVerifiedDate: "2026-08-03",
    },
    hobbies: { items: [], sourceType: "official", sourceUrls: [], lastVerifiedDate: null },
    skills: { items: [], sourceType: "official", sourceUrls: [], lastVerifiedDate: null },
    favoriteThings: null,
    nicknames: [{ text: "あんにゃ", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "杏zoo（アンズー）", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "広島のご当地アイドルグループ「SPL∞ASH」の初代メンバー・リーダーを務めていたとされる（2010年〜2016年）。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/山本杏奈"],
      lastVerifiedDate: "2026-08-02",
    },
    auditionMotivation: {
      text: "小学校高学年でアイドルに憧れ、卒業文集に「アイドルになりたい」と書いたという。上京後は東京のオーディションに挑戦を重ね、その末に＝LOVEへ合格した。",
      sourceType: "self",
      sourceUrls: ["https://suumo.jp/town/entry/hiroshima-yamamotoanna/"],
      lastVerifiedDate: "2026-08-02",
    },
  },
  // ---- 卒業メンバー ----
  {
    memberId: "satake-nonno",
    introduction: null,
    hobbies: null,
    skills: null,
    favoriteThings: null,
    nicknames: [{ text: "のんの", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "佐竹のん乃を俺たちが守る会", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "アイドルグループ「GALDOLL」の候補生を務めていたとされる。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/佐竹のん乃"],
      lastVerifiedDate: "2026-08-02",
    },
    auditionMotivation: null,
  },
  {
    memberId: "saito-nagisa",
    introduction: null,
    hobbies: null,
    skills: null,
    favoriteThings: null,
    nicknames: [{ text: "なーたん", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    // ファンネーム「なーたん's」は単一情報源で確度が低いため掲載を見送り
    fanName: null,
    preDebutActivity: null,
    auditionMotivation: {
      text: "いじめを経験した時期にAKB48に励まされ、自身もアイドルとして人を元気づけたいと考えるようになった。指原莉乃プロデューサーによる新しいオーディションを知り、応募したとされる。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/齊藤なぎさ"],
      lastVerifiedDate: "2026-08-02",
    },
  },
];
