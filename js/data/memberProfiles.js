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
//
// 【2026-11-03 R10 メンバー紹介2（本人の依頼：紹介文を深掘りし、最新の情報にする）】
// - 本人のインタビュー・発言を調べ直し、確かさを A 公式・本人／B 信頼できる報道／C 確定できない／D 未確認 に分けて、A・B を中心に書いた。
//   比較の書類：renewal-notes/r10-members-before-after-2.md（git の対象外）。
// - ページの役割を分けた（同じ話を2か所に書かない）：
//     homeLead（ホームのカードのひとこと）→ introduction（紹介：人柄・加入後の変化・2026年11月の時点の主な活動）→
//     preDebutActivity（＝LOVE加入前の活動）→ auditionMotivation（＝LOVEを目指したきっかけ・オーディション）→
//     memberActivities.js（個人活動の詳しい履歴。継続中／期間限定／単発／終了を区別）。
// - 以前の紹介文の要点（2026-08-03 に本人が確かめた方向性）は、この3つの文のどこかに残している。
//   根拠が確かめられなかった言い方（大谷映美里「指原莉乃プロデュースに強く惹かれて」、山本杏奈「上京後にオーディション」）は、本人の発言に合わせて直した。
// - いじめ・不登校など私的なことは、本人が公表した範囲（大場花菜：タウンワーク 2020・NACK5 2023）だけを、悲劇的に飾らずに書く。
// - introductionNotes：紹介文と出典の種類が違う補足を別のカードにするときに使う（今は使っていない。表示の仕組みは js/membersScreen.js に残す）。
// - 公式プロフィールの趣味・特技・資格は、公式の表記のまま（2026-11-03 確認）。
// - 【2026-11-03 第3版】本人が番組で公表した慎重な話（諸橋沙夏・髙松瞳の「辞めることを考えた」、佐々木舞香の学校生活）は、
//   本人の言葉と文脈のまま、今の活動につながる流れとして書く（感動的に飾らない・心理を分析しない・診断を推測しない）。
// - 【2026-11-03 R11-A・本人の依頼】ホームのひとことは「今どういうメンバーか・特徴・今の活動・＝LOVE での役割」を短く。
//   苦労話・加入の経緯は個人ページ（紹介・加入前の活動・きっかけ）に残す。「・」の後と「|」（表示しない）の所だけで改行する（言葉の途中で切らない。ホームの画面の setPhrasedText と同じ決まり）。
// - homeLead は2列のカードで2行まで。1人ずつ違う、初めて見る人に印象に残る事実を選ぶ。褒め言葉・性格の断定は書かない。

export const MEMBER_PROFILES = [
  {
    memberId: "otani-emiri",
    homeLead: { text: "ファッションブランドを|手がける", sourceType: "self", sourceUrls: ["https://x.com/otani_emiri/status/2075542926420258943", "https://x.com/otani_emiri/status/2083469801931096467"], lastVerifiedDate: "2026-11-03" },
    introduction: {
      text: "子どもの頃はとても人見知りで、アニメ『きらりん☆レボリューション』の月島きらりのまねをするうちに友だちができたという。一度アイドルの活動をやめたあと、＝LOVEで再びステージに立った。加入後は、苦手な部分を隠さずに自分から話すようにしたことで気持ちが楽になったと語り、「人と比べない」ことを大切にしている。メイクやファッションを楽しむことが趣味で、自身がプロデュースするアパレルブランド「Rosé Muse」（2026年9月にルミネエスト新宿に常設店）やカラーコンタクト「melady」、指原莉乃のコスメブランド「Ririmew」の商品プロデュース、個人YouTube「みりにゃと申します。」など、ファッション・コスメの分野で活動している。",
      sourceType: "self",
      sourceUrls: [
        "https://bisweb.jp/interview/124154",
        "https://www.daily.co.jp/society/life/2023/09/21/0016834675.shtml",
        "https://equal-love.jp/feature/otani_emiri",
        "https://bunnyapartment.com/rosemuse/",
        "https://www.melady.jp/",
        "https://prtimes.jp/main/html/rd/p/000000875.000025517.html",
        "https://www.youtube.com/channel/UCGxaJ2y2Le9jST3Me2aMPrw"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    hobbies: {
      items: ["メイクやファッションを楽しむこと", "ラーメン巡り"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/otani_emiri"],
      lastVerifiedDate: "2026-11-03",
    },
    skills: { items: ["ジョッキ持ち"], sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/otani_emiri"], lastVerifiedDate: "2026-11-03" },
    favoriteThings: null,
    nicknames: [{ text: "みりにゃ", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "みりにゃ甘やかし隊", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "中学時代、全寮制の学校の食堂で見たテレビCMでSUPER☆GiRLSの前島亜美に一目ぼれし、ライブや握手会に通ううちにアイドルを目指した。自分でオーディションを探し、中学3年でアイドルグループ「アキシブproject」のメンバーになり（2013年）、2016年4月に卒業した。高校卒業と同時に活動をやめ、しばらくアルバイト生活を送った。",
      sourceType: "self",
      sourceUrls: [
        "https://www.tokyoidol.net/?p=15948",
        "https://bisweb.jp/interview/124154",
        "https://www.billboard-japan.com/d_news/detail/9665/2",
        "https://ja.wikipedia.org/wiki/大谷映美里"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    auditionMotivation: {
      text: "大きなステージに立つ夢を諦めきれず、アルバイトをしながらオーディションを調べていたところ、指原莉乃のTwitterで＝LOVEのオーディションを知り、すぐに応募した。",
      sourceType: "self",
      sourceUrls: [
        "https://bisweb.jp/interview/124154"
      ],
      lastVerifiedDate: "2026-11-03",
    },
  },
  {
    memberId: "oba-hana",
    homeLead: { text: "イラストや漫画も描く", sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/oba_hana", "https://www.kadokawa.co.jp/product/322310001490/"], lastVerifiedDate: "2026-11-03" },
    introduction: {
      text: "中学時代に学校でいじめを受けて不登校になり、そのころ見たAKB48の姿をきっかけにアイドルを目指した。本人はこの経験を、今のアイドル人生につながった出来事として振り返っている。加入後は、すぐに結果が出なくても積み重ねた努力がいつか輝くと考えるようになり、マイナス思考だった自分を「もっと褒めてあげよう」と思えるようになったと話す。宝塚歌劇をこよなく愛し、元AKB48・高橋みなみのファンとしても知られる。特技のイラスト（#はなすと）を生かした漫画「はなコミ！～となりにアイドル～」は2026年にKADOKAWAから単行本になり、2026年10月からは地元の「さいたま観光大使」、11月からはFM NACK5の冠ラジオ番組『＝LOVE大場花菜の「はなまる！」』を担当している。",
      sourceType: "self",
      sourceUrls: [
        "https://www.nack5.co.jp/blog/up_your_life/11177/",
        "https://townwork.net/magazine/job/workstyle/99678/",
        "https://www.tvlife.jp/pickup/439483",
        "https://mdpr.jp/news/detail/4807831",
        "https://www.kadokawa.co.jp/product/322310001490/",
        "https://www.city.saitama.lg.jp/006/014/008/003/015/007/p133595.html",
        "https://equal-love.jp/news/detail/12292"
      ],
      lastVerifiedDate: "2026-11-03",
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
      text: "アイドルを目指して最初に受けたAKB48のオーディションは書類で落ち、次に応募した「ドラフト会議」は2次審査まで進んだものの、ほかの候補者に圧倒されたという。毎年の初詣で合格を願っても、なかなか受からなかった。",
      sourceType: "self",
      sourceUrls: [
        "https://townwork.net/magazine/job/workstyle/99678/"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    auditionMotivation: {
      text: "小学生のころ、テレビの『週刊AKB』でアイドルに興味を持った。中学の頃にAKB48のドキュメンタリーを観て、キャプテンだった高橋みなみの姿に「こんな人がそばにいてくれたら」と心強さを感じたという。変わりたいという思いを抱えていたところ、指原莉乃プロデューサーの「変わりたい子に受けてほしい」という言葉に動かされ、＝LOVEのオーディションに応募した。審査では「自分が嫌いだから変わりたい」という思いをひたすら伝えたと話している。",
      sourceType: "self",
      sourceUrls: [
        "https://townwork.net/magazine/job/workstyle/99678/",
        "https://www.nack5.co.jp/blog/up_your_life/11177/"
      ],
      lastVerifiedDate: "2026-11-03",
    },
  },
  {
    memberId: "otoshima-risa",
    homeLead: { text: "「姫」の愛称で|親しまれる", sourceType: "reliable", sourceUrls: ["https://townwork.net/magazine/job/workstyle/123879/"], lastVerifiedDate: "2026-11-03" },
    introduction: {
      text: "幼稚園のころからアイドルを夢見て、＝LOVEに入るまでに約40回オーディションを受けた。落ちるたびに自分を否定されたように感じたが、自分らしさを生かせばよいと気づいたという。グループ内では『姫』の愛称で親しまれ、楽曲やファン文化を通して『＝LOVEの公式彼女』『お姫様』のようなイメージでも支持されている。「諦めたら終わり」を大切にし、目標は紙に書く。「アイドルになりたい」「お姫様になりたい」と書いて、実際にかなえたと話している。2023年からファッション誌『S Cawaii!』のレギュラーモデルを務め、ブランド「evelyn」のシーズンモデルや、2026年8月に開設した個人YouTube「音嶋莉沙の様子がおかしいチャンネル」でも活動している。",
      sourceType: "reliable",
      sourceUrls: [
        "https://ananweb.jp/categories/entertainment/23473",
        "https://townwork.net/magazine/job/workstyle/123879/",
        "https://www.hkt48.jp/news/2016/07/3772",
        "https://ja.wikipedia.org/wiki/音嶋莉沙",
        "https://equal-love.jp/news/detail/7216",
        "https://equal-love.jp/news/detail/12272",
        "https://www.youtube.com/@risa_yousugaokashii"
      ],
      lastVerifiedDate: "2026-11-03",
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
      text: "2015年7月、iDOL Streetの8期ストリート生（福岡）に選ばれ、2016年3月に卒業した。同じ年にHKT48の4期生として発表されたが、応募の条件（プロダクションに所属していないこと）に合わず、合格は取り消された（2016年7月21日、HKT48の公式発表）。その後も挑戦を続け、2017年4月に＝LOVEのオーディションに合格した。",
      sourceType: "reliable",
      sourceUrls: [
        "https://girls-street.jp/expo2015/audition/",
        "https://ameblo.jp/w-street-fukuoka/entry-12139583025.html",
        "https://ja.wikipedia.org/wiki/音嶋莉沙",
        "https://www.hkt48.jp/news/2016/07/3772"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    auditionMotivation: {
      text: "幼稚園の年長のころから「アイドルになりたい」と書いていた。小学校高学年でAKB48を知り、震災の復興支援コンサートを観て、パフォーマンスで人を元気にできることに感動したという。憧れは元AKB48の渡辺麻友。小学5年生のころからオーディションを受け続け、書類や最終審査で何度も落ちた。年齢制限のある最後の機会にあと一歩で落ちたときは大学受験も考えたが、「人生は一度きり」と思い直した。＝LOVEは、指原莉乃のプロデュースならいろいろな景色が見られると考え、それまでで最後の挑戦と決めて臨んだ。指原の目に留まるよう、AKB48の曲をダンスも含めて覚えて審査に臨んだという。",
      sourceType: "self",
      sourceUrls: [
        "https://townwork.net/magazine/job/workstyle/123879/",
        "https://realsound.jp/2024/08/post-1737889.html"
      ],
      lastVerifiedDate: "2026-11-03",
    },
  },
  {
    memberId: "saito-kiara",
    homeLead: { text: "グループ最年少・ゲーム好き", sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/saito_kiara"], lastVerifiedDate: "2026-11-03" },
    // 【2026-08-03 本人の方向性】紹介文はダンスメンバー路線（「ファンの間で定着」）。最年少は members.js の公式の生年月日（2004年11月26日）から。
    introduction: {
      text: "中学1年で＝LOVEに加入した、グループ最年少メンバー。加入当初は年上のメンバーに自分から話しかけられなかったという。「Kiara Tiara」（13thシングル収録の初ソロ曲）「Queens」などのダンスナンバーで存在感のあるパフォーマンスを見せ、ファンの間でも屈指のダンスメンバーとして知られている。2023年の「ラストノートしか知らない」で初めて表題曲のセンターを務め、自分と向き合って自信がついたと振り返る。人と比べすぎず「自分のペースで」頑張りたいと話す。2024年に地元・栃木県の「とちぎ未来大使」に就任。趣味のゲームを生かしたテレビ朝日「アイ＝ラブ！げーみんぐ」に佐々木舞香とレギュラー出演し、文化放送では≠MEの櫻井ももとラジオ番組を担当している。",
      sourceType: "reliable",
      sourceUrls: [
        "https://natalie.mu/music/pp/equallove17",
        "https://realsound.jp/2023/05/post-1336139.html",
        "https://mdpr.jp/news/detail/4468205",
        "https://equal-love.jp/feature/saito_kiara",
        "https://www.shimotsuke.co.jp/articles/-/882798",
        "https://www.oricon.co.jp/news/2445201/full/",
        "https://www.joqr.co.jp/qr/program/km/"
      ],
      lastVerifiedDate: "2026-11-03",
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
      text: "小中学生のアイドルユニット「amorecarina」で活動し、2016年11月に卒業した（加入は2014年とされる）。",
      sourceType: "reliable",
      sourceUrls: ["https://ja.wikipedia.org/wiki/齋藤樹愛羅"],
      lastVerifiedDate: "2026-08-02",
    },
    // 志望動機は根拠が不十分（記事タイトルのみで本文未確認）のため、現時点では掲載を見送っている。
    auditionMotivation: {
      text: "小学生のころ、音楽番組で歌って踊るAKB48や『ラブライブ！』のμ'sを見て、自分もやりたいと思ったのが、アイドルを目指したきっかけ。",
      sourceType: "self",
      sourceUrls: [
        "https://ameblo.jp/amorecarina-tokyo/entry-12215308018.html",
        "https://realsound.jp/2024/08/post-1737890.html"
      ],
      lastVerifiedDate: "2026-11-03",
    },
  },
  {
    memberId: "sasaki-maika",
    homeLead: { text: "表題曲センターや|ドラマ出演も", sourceType: "official", sourceUrls: ["https://equal-love.jp/discography/", "https://equal-love.jp/news/detail/9754"], lastVerifiedDate: "2026-11-03" },
    introduction: {
      text: "人前が苦手で学校を休みがちだった子どもの頃、アニメに夢中になったことが、声優を目指すきっかけになった。愛知のご当地声優アイドルとしての活動や声優養成所を経て、「声優アイドル」という言葉にひかれて＝LOVEのオーディションを受けた。加入後に初めて本格的なダンスに取り組み、振り入れのたびに泣きながら、「できなくて悔しい」と感じたのは初めてだったと話す。2020年の「しゅきぴ」で初めてセンターを務めて恥ずかしさを振り切れるようになり、2022年の11thシングル「あの子コンプレックス」で表題曲のセンターに。ファンと友達のように対等な関係でいることを理想にしている。山本杏奈とのYouTube「イコラブのあんまい」や、齋藤樹愛羅とレギュラー出演するゲーム番組「アイ＝ラブ！げーみんぐ」のほか、日曜劇場「キャスター」（2025年）などのドラマ、日本マクドナルドのCM（2026年）にも出演している。",
      sourceType: "self",
      sourceUrls: [
        "https://ray-web.jp/55752",
        "https://townwork.net/magazine/job/workstyle/118140/",
        "https://realsound.jp/2024/08/post-1742167.html",
        "https://realsound.jp/2022/05/post-1033363.html",
        "https://www.youtube.com/@ikorabunohutari",
        "https://www.oricon.co.jp/news/2445201/full/",
        "https://equal-love.jp/news/detail/9754",
        "https://equal-love.jp/news/detail/12248"
      ],
      lastVerifiedDate: "2026-11-03",
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
      text: "小学校のころから学校という枠組みになじめず、休みがちだった。人前が苦手で、中学もあまり通わず、卒業するころにはアニメ中心の生活だったという。小学5年生のころ『イナズマイレブン』のキャラクターソングで、少年の役を女性の声優が演じていると知り、声優になりたいと思うようになった。高校に入って気持ちがはっきりし、オーディションを経て声優養成所に入った。高校の3年間はうどん屋・居酒屋・カフェでアルバイトを続け、知らない人と話すのは苦手だと思っていたが、居酒屋で客と話せる自分に気づいたという。高校2年からは、愛知・東三河のご当地声優アイドル「穂の国娘。」に参加し、駅前のイベントなどに出ていた（2017年5月に卒業）。",
      sourceType: "self",
      sourceUrls: [
        "https://wpb.shueisha.co.jp/gravure/news/20180126-98648/",
        "https://wpb.shueisha.co.jp/gravure/news/20180127-98715/",
        "https://news.nicovideo.jp/watch/nw3249210",
        "https://ja.wikipedia.org/wiki/佐々木舞香"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    auditionMotivation: {
      text: "もともとアイドル志望ではなく、声優の仕事を探していろいろなオーディションを受けていた。代々木アニメーション学院から声優も頑張るアイドルが生まれると聞いたが、指原莉乃がプロデュースすると聞いて最初は気が進まなかった。それでも、募集要項の「声優アイドル」という言葉にひかれ、知人の勧めもあって応募した。合格したときは、嬉しさより戸惑いの方が強かったという。",
      sourceType: "self",
      sourceUrls: [
        "https://wpb.shueisha.co.jp/gravure/news/20180127-98715/",
        "https://mdpr.jp/interview/detail/1783163",
        "https://ray-web.jp/55752",
        "https://townwork.net/magazine/job/workstyle/118140/"
      ],
      lastVerifiedDate: "2026-11-03",
    },
  },
  {
    memberId: "takamatsu-hitomi",
    homeLead: { text: "デビュー曲|「＝LOVE」のセンター", sourceType: "official", sourceUrls: ["https://equal-love.jp/discography/"], lastVerifiedDate: "2026-11-03" },
    introduction: {
      text: "デビュー曲「＝LOVE」でセンターを務め、グループ初期を象徴する存在として多くの表題曲のセンターを担当した。その責任をひとりで感じ、アイドルを辞めることも考えたと、2026年8月の番組で振り返っている。幼い頃から続けたバトントワリングでは日本代表としてロサンゼルスの大会に出た経験があり、振付や立ち位置を覚える力は今のアイドル活動にも生きているという。目指すのは、ライブでは圧倒的に、SNSやイベントでは身近にいる「近くて遠い存在」。北海道日本ハムファイターズのファンで、イコラブボートレース部の部長としても知られる。2026年11月は、フジテレビ『めざましテレビ』のマンスリーエンタメプレゼンターを務める。",
      sourceType: "self",
      sourceUrls: [
        "https://news.mynavi.jp/article/20260818-4831562/",
        "https://www.thefirsttimes.jp/news/0000866052/",
        "https://www.oricon.co.jp/news/2142700/",
        "https://www.thefirsttimes.jp/news/0000056898/",
        "https://realsound.jp/2024/08/post-1742168.html",
        "https://equal-love.jp/news/detail/9983",
        "https://equal-love-boatrace.jp/",
        "https://equal-love.jp/news/detail/12380"
      ],
      lastVerifiedDate: "2026-11-03",
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
      text: "中学1年で乃木坂46のライブを観てファンになり、神宮球場で花道を走るメンバーに憧れた。乃木坂46の3期生オーディションを受けたが途中で落ち、一度はアイドルを諦めた。",
      sourceType: "self",
      sourceUrls: [
        "https://mdpr.jp/interview/detail/1782949"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    auditionMotivation: {
      text: "＝LOVEのオーディションは知っていたものの、最初は受けるつもりがなかった。テレビのニュースで、指原莉乃プロデューサーが「今の自分を変えたい子に応募してほしい」と話すのを見て心が動き、応募を決めた。",
      sourceType: "self",
      sourceUrls: [
        "https://mdpr.jp/interview/detail/1782949"
      ],
      lastVerifiedDate: "2026-11-03",
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
    homeLead: { text: "マラソンで|サブ4を達成", sourceType: "reliable", sourceUrls: ["https://store.alpen-group.jp/Page/Feature/running_260619_02.aspx", "https://www.fmyokohama.jp/r847/2023/12/jog-station-3310.html"], lastVerifiedDate: "2026-11-03" },
    introduction: {
      text: "最終審査ではエントリー1番として、指原莉乃の前で長渕剛の曲を歌った。ダンス未経験で加入し、振り入れについていけず朝5時まで練習したこともあった。できない分「誰よりも大きく踊る」ことを心がけるうちに、体力のあるメンバーとして知られるようになった。大切にしているのは「まずやってみる」「続ける」こと。運動能力の高さで知られ、フルマラソンは東京マラソン2022で初めて完走（4時間19分26秒）し、翌年の東京マラソン2023でサブ4（3時間57分06秒）を達成。SASUKEにも2020年・2021年の本戦に出場した。大の横浜DeNAベイスターズファンとしても知られ、応援紙『BAY☆スタ』でコラムを連載し、2026年4月からはフジテレビONE「プロ野球ニュース」の木曜MCを（山本杏奈と隔週で）務めている。",
      sourceType: "reliable",
      sourceUrls: [
        "https://tresen.fmyokohama.jp/17415/",
        "https://townwork.net/magazine/job/workstyle/134308/",
        "https://store.alpen-group.jp/Page/Feature/running_260619_02.aspx",
        "https://www.fmyokohama.jp/r847/2023/12/jog-station-3310.html",
        "https://ja.wikipedia.org/wiki/瀧脇笙古",
        "https://equal-love.jp/news/detail/11837",
        "https://equal-love.jp/news/detail/11301"
      ],
      lastVerifiedDate: "2026-11-03",
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
    preDebutActivity: {
      text: "小さい頃から、フルマラソンに出ていた父と家族でキッズマラソンに出ていた。中学ではソフトテニス部。小学6年のころから矢吹奈子（当時HKT48）に憧れていたが、ライブにはあまり行かず、家で応援するファンだったという。",
      sourceType: "self",
      sourceUrls: [
        "https://store.alpen-group.jp/Page/Feature/running_260619_02.aspx",
        "https://realsound.jp/2024/08/post-1749652.html",
        "https://townwork.net/magazine/job/workstyle/134308/"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    auditionMotivation: {
      text: "オーディションのころから「人を笑顔にしたい」という夢を言葉にしてきた。高校に入った2017年に＝LOVEに加入したが、合格したあとも、自分にファンが付くのか半信半疑だったという。",
      sourceType: "self",
      sourceUrls: [
        "https://realsound.jp/2024/08/post-1749652.html",
        "https://townwork.net/magazine/job/workstyle/134308/"
      ],
      lastVerifiedDate: "2026-11-03",
    },
  },
  {
    memberId: "noguchi-iori",
    homeLead: { text: "アニメ好き・声優としても活動", sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/noguchi_iori", "https://equal-love.jp/news/detail/12162"], lastVerifiedDate: "2026-11-03" },
    introduction: {
      text: "アニメが大好きで、歌も演技もダンスもできる声優を夢見て＝LOVEに加入した。2022年の「Be Selfish」で初めて表題曲のセンターを務め、「呪って呪って」（2024年）では本人から指原莉乃に姫カットを提案した。メンバーからは、加入前からのダンス経験で初期から振りを教えていたと言われている。二次元の作品に救われて夢をもらったので、今度は自分がステージで誰かに夢を与えたいと話す。声優としてテレビアニメへの出演が続き、マヂカルラブリーとの番組「マヂラブ・野口衣織のマヂでラブになるTV」ではMCを務める。アニメの名ゼリフを語る連載は『いおはにほへと。』（2024年）として書籍になった。",
      sourceType: "self",
      sourceUrls: [
        "https://natalie.mu/music/pp/equallove14",
        "https://natalie.mu/music/pp/equallove18",
        "https://realsound.jp/2024/08/post-1754495.html",
        "https://animeanime.jp/article/2026/02/09/95897.html",
        "https://equal-love.jp/news/detail/8330",
        "https://equal-love.jp/news/detail/8379"
      ],
      lastVerifiedDate: "2026-11-03",
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
      text: "兄2人と一緒にアニメを観て育ち、小学生のころ『うたの☆プリンスさまっ♪』で声優という仕事を知り、『ラブライブ!』で歌って踊れる声優を志すようになった。幼い頃から歌が好きでヒップホップダンスを習い、中学では陸上部で走り幅跳びをしていた。代々木アニメーション学院への入学も考えていた。",
      sourceType: "self",
      sourceUrls: [
        "https://townwork.net/magazine/job/workstyle/89011/",
        "https://animeanime.jp/article/2026/02/09/95897.html",
        "https://www.rikujyokyogi.co.jp/archives/58987"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    auditionMotivation: {
      text: "尊敬する声優・谷山紀章の出身校として代々木アニメーション学院を調べていたときに、同校が関わる＝LOVEのオーディションを知り、募集要項の「声優アイドル」という言葉に惹かれて応募した。審査では、緊張で声が震えると分かったうえで、自分らしく思い切り歌ったという。",
      sourceType: "self",
      sourceUrls: [
        "https://townwork.net/magazine/job/workstyle/89011/"
      ],
      lastVerifiedDate: "2026-11-03",
    },
  },
  {
    memberId: "morohashi-sana",
    homeLead: { text: "ソロコンサートも開く|最年長メンバー", sourceType: "official", sourceUrls: ["https://equal-love.jp/news/detail/12171", "https://equal-love.jp/feature/morohashi_sana"], lastVerifiedDate: "2026-11-03" },
    introduction: {
      text: "地元でのタレントオーディションのグランプリや合唱団のリーダーなど、＝LOVE加入前から歌や芸能の経験を持つ現役メンバー最年長。加入後、指原莉乃に歌を褒められたことで「もっと上手くなりたい」と思うようになったと話す。山本杏奈がリーダーになってからは、メンバーを笑顔にする役に回ってきた。不遇の時期が続いたころには、年齢のことも考えて「グループを離れよう」と両親に相談したこともあったと、2026年8月の番組で明かしている。番組のあとには、最年長としてリーダーを支えるとXに投稿した。グループ活動に加え、ソロで歌唱ステージへ出演する機会も多く、2023年には「長年の夢」だった初のソロコンサートを開き、2026年11月14日には2回目のソロコンサートを開く。地元・福島県いわき市の新聞「いわき民報」でのコラム連載（2019年〜）や、TOKYO FM「Hand in Hand」での福島の現地取材など、故郷に関わる仕事も続けている。",
      sourceType: "reliable",
      sourceUrls: [
        "http://www.iwaki-minpo.co.jp/app/wp-content/uploads/2012/06/JUNC-080.pdf",
        "https://news.mynavi.jp/article/20260818-4831562/",
        "https://www.thefirsttimes.jp/news/0000866052/",
        "https://x.com/morohashi_sana/status/2089747606918578441",
        "https://ja.wikipedia.org/wiki/諸橋沙夏",
        "https://townwork.net/magazine/serial/idol/49229/",
        "https://ananweb.jp/categories/entertainment/23469",
        "https://www.thefirsttimes.jp/report/0000326233/",
        "https://equal-love.jp/news/detail/12171",
        "https://equal-love.jp/news/detail/3008",
        "https://www.tfm.co.jp/hand/"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    // 【2026-11-03 R10-3】公式プロフィールの「資格」欄（表記のまま。認定団体は公式に書かれていない）
    qualifications: { items: ["水泳泳力検定2級"], sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/morohashi_sana"], lastVerifiedDate: "2026-11-03" },
    hobbies: { items: ["映画鑑賞"], sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/morohashi_sana"], lastVerifiedDate: "2026-11-03" },
    skills: {
      items: ["フラダンス", "タヒチアンダンス"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/morohashi_sana"],
      lastVerifiedDate: "2026-11-03",
    },
    favoriteThings: null,
    nicknames: [{ text: "さなつん", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "つん族", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "昔からタヒチアンダンスやフラダンス、歌が大好きで、人に喜んでもらうことが好きだったという。2011年4月、ヤマハミュージックパブリッシングのタレントオーディションでグランプリを受賞し、同年に1stDVD『15years』を発売した。地元・いわき市の「聖☆少女合唱団」のリーダーも務めた。モデルオーディション「Miss Seventeen 2010」のファイナリストや、震災復興支援アイドルユニット「Baby Tiara」への所属もあったとされる。",
      sourceType: "reliable",
      sourceUrls: [
        "http://www.iwaki-minpo.co.jp/app/wp-content/uploads/2012/06/JUNC-080.pdf",
        "https://townwork.net/magazine/serial/idol/49229/",
        "https://ja.wikipedia.org/wiki/諸橋沙夏"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    auditionMotivation: {
      text: "大学3年生で進路に悩んでいた際、母と友人の勧めで＝LOVEのオーディションに応募した。二次審査に通ったあと、顔を出すことへのためらいから一度は辞退を決めたが、家族で話し合い、母の言葉に背中を押されて受け続け、合格した。",
      sourceType: "self",
      sourceUrls: [
        "https://townwork.net/magazine/serial/idol/49229/"
      ],
      lastVerifiedDate: "2026-11-03",
    },
  },
  {
    memberId: "yamamoto-anna",
    homeLead: { text: "＝LOVEのリーダー", sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/yamamoto_anna"], lastVerifiedDate: "2026-11-03" },
    introduction: {
      text: "＝LOVEのリーダー。完璧なリーダーを目指したがすぐに無理だと気づき、全員が横一列で始まったグループだからこそ、メンバーと「1列になって進む」リーダー像を大切にしている。指原莉乃の「まずメンバーを尊敬できる人に」という言葉をきっかけに、公演の反省やメンバーの好きなところを書く「イコラブノート」を付けている。広島東洋カープの熱心なファンとしても知られ、2019年に夢として語ったマツダスタジアムでの始球式を2025年に果たした。2026年4月からはフジテレビONE「プロ野球ニュース」の木曜MCを瀧脇笙古と隔週で務め、SHOWROOMの企画「教えて、花便り」も続けている。",
      sourceType: "self",
      sourceUrls: [
        "https://townwork.net/magazine/job/workstyle/129243/",
        "https://ananweb.jp/categories/entertainment/23469",
        "https://suumo.jp/town/entry/hiroshima-yamamotoanna/",
        "https://equal-love.jp/news/detail/10286",
        "https://equal-love.jp/news/detail/11301",
        "https://equal-love.jp/schedule/detail/6558"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    hobbies: {
      items: ["スポーツ観戦（野球、サッカー、バレー）", "ダンス", "料理"],
      sourceType: "official",
      sourceUrls: ["https://equal-love.jp/feature/yamamoto_anna"],
      lastVerifiedDate: "2026-11-03",
    },
    skills: { items: ["目分量料理"], sourceType: "official", sourceUrls: ["https://equal-love.jp/feature/yamamoto_anna"], lastVerifiedDate: "2026-11-03" },
    favoriteThings: null,
    nicknames: [{ text: "あんにゃ", sourceType: "self", sourceUrls: [], lastVerifiedDate: "2026-08-02" }],
    fanName: { text: "杏zoo（アンズー）", sourceType: "fan", sourceUrls: [], lastVerifiedDate: "2026-08-02" },
    preDebutActivity: {
      text: "5歳でダンスを始め、小学3年からアクターズスクール広島に通った。中学生のころから地元・広島でアイドルとして活動した。広島のアイドルグループ「SPL∞ASH」のメンバーとして約6年4か月活動し、リーダーも務めて2016年12月に卒業した（初代メンバーとされる）。2014〜2016年には、サンフレッチェ広島のアイドルグループ「サンフレッチェ・レディース」にも所属した。",
      sourceType: "reliable",
      sourceUrls: [
        "https://about-ash.com/10interview_splash/",
        "https://ameblo.jp/spl-ash/entry-12229784923.html",
        "https://townwork.net/magazine/job/workstyle/129243/",
        "https://ja.wikipedia.org/wiki/山本杏奈",
        "https://www.soccer-king.jp/news/japan/jl/20180525/762448.html"
      ],
      lastVerifiedDate: "2026-11-03",
    },
    auditionMotivation: {
      text: "小学校高学年でAKB48に憧れ、小学校の卒業文集に「アイドルになりたい」と書いた。高校生のころから、広島から東京のオーディションに通ったが、書類や最終審査で落ちることが多く、一度は料理の大学に進んだ。19歳で「本当の本当にこれが最後」と覚悟して受けたのが＝LOVEで、オーディションには父が広島から車で12時間ほどかけて連れて行ってくれたという。合格と同時に上京した。",
      sourceType: "self",
      sourceUrls: [
        "https://suumo.jp/town/entry/hiroshima-yamamotoanna/",
        "https://magazine.showroom-live.com/interview/4251"
      ],
      lastVerifiedDate: "2026-11-03",
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
