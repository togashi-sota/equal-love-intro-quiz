// 自動生成ファイル（手で編集しない）。生成元：tools/feature-research/2026-10-29/history-pages/build_anniversary.py
// 【2026-10-29新設・本人の要望】「＝LOVEの歩み・周年ヒストリー」のデータ。1件＝1つの出来事（事実と出典URLだけ。歌詞・音源は含まない）。
// 周年の区切り：「N周年」＝前の周年記念公演の翌日〜N周年記念公演の日。0＝結成・デビュー、10＝これから（予定）。
// 確度：確認済み（公式・放送局・複数の報道）／準確認（報道1件）。要確認の出来事は載せていない。
export const ANNIVERSARY_PERIODS = [
  {
    "period": 0,
    "label": "結成・デビュー",
    "from": null,
    "to": null,
    "anniversaryVenue": null
  },
  {
    "period": 1,
    "label": "1周年",
    "from": "2017-09-06",
    "to": "2018-09-06",
    "anniversaryVenue": "Zepp DiverCity（TOKYO）"
  },
  {
    "period": 2,
    "label": "2周年",
    "from": "2018-09-06",
    "to": "2019-09-12",
    "anniversaryVenue": "中野サンプラザホール"
  },
  {
    "period": 3,
    "label": "3周年",
    "from": "2019-09-12",
    "to": "2020-09-06",
    "anniversaryVenue": "パシフィコ横浜"
  },
  {
    "period": 4,
    "label": "4周年",
    "from": "2020-09-06",
    "to": "2021-09-20",
    "anniversaryVenue": "幕張メッセ イベントホール"
  },
  {
    "period": 5,
    "label": "5周年",
    "from": "2021-09-20",
    "to": "2022-09-25",
    "anniversaryVenue": "国立代々木競技場 第一体育館"
  },
  {
    "period": 6,
    "label": "6周年",
    "from": "2022-09-25",
    "to": "2023-10-19",
    "anniversaryVenue": "さいたまスーパーアリーナ"
  },
  {
    "period": 7,
    "label": "7周年",
    "from": "2023-10-19",
    "to": "2024-09-08",
    "anniversaryVenue": "Kアリーナ横浜"
  },
  {
    "period": 8,
    "label": "8周年",
    "from": "2024-09-08",
    "to": "2025-09-07",
    "anniversaryVenue": "8周年ツアー開幕（広島）"
  },
  {
    "period": 9,
    "label": "9周年",
    "from": "2025-09-07",
    "to": "2026-10-16",
    "anniversaryVenue": "TOYOTA ARENA TOKYO"
  },
  {
    "period": 10,
    "label": "これから（10周年へ）",
    "from": "2026-10-16",
    "to": null,
    "anniversaryVenue": null
  }
];

export const ANNIVERSARY_EVENTS = [
  {
    "id": "anv-2017-group-formed",
    "date": "2017-04-29",
    "endDate": null,
    "period": 0,
    "title": "メンバー12人決定・グループ名「＝LOVE」発表",
    "description": "声優アイドルオーディションの最終審査でメンバーが決まり、グループ名「＝LOVE」が発表された。12人体制でスタート。",
    "category": "milestone",
    "highlight": true,
    "status": "held",
    "related": {
      "historyEvent": "2017-04-29 最終審査でメンバー決定、グループ名「＝LOVE」を発表"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/feature/about",
        "type": "official",
        "label": "公式ABOUT"
      }
    ]
  },
  {
    "id": "anv-2017-tif-first-stage",
    "date": "2017-08-05",
    "endDate": null,
    "period": 0,
    "title": "TOKYO IDOL FESTIVAL 2017で初ステージ",
    "description": "お台場のTIF2017（HOT STAGE）で、メンバーとして初めて観客の前に立った。",
    "category": "concert",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-tif2017-first-stage"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/241232",
        "type": "press",
        "label": "音楽ナタリー"
      }
    ]
  },
  {
    "id": "anv-2017-debut-single",
    "date": "2017-09-06",
    "endDate": null,
    "period": 0,
    "title": "1stシングル「＝LOVE」でデビュー",
    "description": "SACRA MUSICからデビューシングル「＝LOVE」を発売。センターは髙松瞳。この日が周年の起点（9月6日）になっている。",
    "category": "release",
    "highlight": true,
    "status": "held",
    "related": {
      "songId": "love",
      "workId": "single-01"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.oricon.co.jp/prof/705208/rank/single/",
        "type": "press",
        "label": "オリコン シングル売上一覧"
      }
    ]
  },
  {
    "id": "anv-2017-daitokkun",
    "date": "2017-09-25",
    "endDate": null,
    "period": 1,
    "title": "初期レギュラー番組「イコラブ大特訓中！」配信開始",
    "description": "SHOWROOMでのレギュラー番組（MC：アンタッチャブル柴田英嗣）。デビュー直後のメンバーの成長を見守る番組。",
    "category": "tv",
    "highlight": false,
    "status": "held",
    "related": {
      "groupActivityId": "group-showroom-daitokkun",
      "tvAppearanceDate": "2017-09-25"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/249828",
        "type": "press",
        "label": "音楽ナタリー"
      }
    ]
  },
  {
    "id": "anv-2018-first-overseas-taiwan",
    "date": "2018-03-25",
    "endDate": null,
    "period": 1,
    "title": "初の海外単独ライブ（台湾・台北）",
    "description": "「＝LOVE×#きっと君だ！presents ＝LOVEスペシャルライブ in 台湾」を台北のclapper studioで開催（約350人）。前日3月24日には高雄の「メガポートフェス」にも出演した。",
    "category": "milestone",
    "highlight": true,
    "status": "held",
    "related": {},
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/431",
        "type": "official",
        "label": "公式NEWS（台湾ライブ告知）"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/977888736338833409",
        "type": "official",
        "label": "公式X 3/25台湾レポート"
      },
      {
        "url": "https://times.abema.tv/articles/-/4046601",
        "type": "press",
        "label": "ABEMA TIMES（海外初の単独ライブ）"
      }
    ]
  },
  {
    "id": "anv-2018-1st-anniv-event",
    "date": "2018-09-06",
    "endDate": null,
    "period": 1,
    "title": "デビュー1周年記念プレミアムイベント",
    "description": "Zepp DiverCity（TOKYO）で1周年記念イベントを開催。4thシングル表題曲「Want you! Want you!」の初披露とMV初公開があった。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "historyEvent": "2018-09-06 1周年記念プレミアムイベント",
      "songId": "want-you-want-you"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/776",
        "type": "official",
        "label": "公式NEWS"
      },
      {
        "url": "https://www.musicman.co.jp/artist/181751",
        "type": "press",
        "label": "Musicman レポート"
      }
    ]
  },
  {
    "id": "anv-2019-1st-concert",
    "date": "2019-02-16",
    "endDate": null,
    "period": 2,
    "title": "初の単独コンサート「初めまして、＝LOVEです。」",
    "description": "昭和女子大学人見記念講堂で1stコンサート（昼夜計4,000人）。公演中に初ツアーの開催がサプライズ発表された。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "setlistIds": [
        "perf-1st-concert-2019"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/1262",
        "type": "official",
        "label": "公式NEWS"
      },
      {
        "url": "https://natalie.mu/music/news/320299",
        "type": "press",
        "label": "音楽ナタリー ライブレポート"
      }
    ]
  },
  {
    "id": "anv-2019-first-tour",
    "date": "2019-04-11",
    "endDate": "2019-04-19",
    "period": 2,
    "title": "ファーストツアー「今、この船に乗れ！」",
    "description": "初のツアー。4/11 Zepp Nagoya、4/13 大阪BIGCAT、4/19 Zepp Tokyo（ファイナル）の東名阪3公演。公式表記は「全国ツアー」ではなく「ファーストツアー」。",
    "category": "concert",
    "highlight": false,
    "status": "held",
    "related": {},
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/1358",
        "type": "official",
        "label": "公式NEWS"
      },
      {
        "url": "https://natalie.mu/music/news/320299",
        "type": "press",
        "label": "音楽ナタリー"
      }
    ]
  },
  {
    "id": "anv-2019-takamatsu-hiatus",
    "date": "2019-08-20",
    "endDate": null,
    "period": 2,
    "title": "髙松瞳、一時活動休止を発表",
    "description": "体調不良による療養のため、9月12日の2周年記念コンサートを区切りに当面の間活動休止すると公式発表。6thシングルは不参加。",
    "category": "member",
    "highlight": false,
    "status": "held",
    "related": {
      "memberId": "takamatsu-hitomi"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2047",
        "type": "official",
        "label": "公式NEWS"
      },
      {
        "url": "https://mdpr.jp/music/detail/1862058",
        "type": "press",
        "label": "モデルプレス"
      }
    ]
  },
  {
    "id": "anv-2019-2nd-anniv-concert",
    "date": "2019-09-12",
    "endDate": null,
    "period": 2,
    "title": "デビュー2周年記念コンサート（中野サンプラザ）",
    "description": "中野サンプラザホールで2周年記念コンサートを開催。髙松瞳はこの公演を最後に休養に入った。同日付で楽曲「866」もリリースされている（アプリの songs.js より）。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-2nd-anniversary",
      "setlistIds": [
        "perf-2nd-anniversary"
      ],
      "songId": "866"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/3257",
        "type": "official",
        "label": "公式NEWS"
      },
      {
        "url": "https://natalie.mu/music/news/347277",
        "type": "press",
        "label": "音楽ナタリー"
      }
    ]
  },
  {
    "id": "anv-2019-first-oricon-no1",
    "date": "2019-10-30",
    "endDate": null,
    "period": 3,
    "title": "「ズルいよ ズルいね」で初のオリコン週間1位",
    "description": "6thシングル（センター齊藤なぎさ）が初週14.3万枚で11/11付オリコン週間シングルランキング1位。6作目で自身初のシングル1位。",
    "category": "release",
    "highlight": true,
    "status": "held",
    "related": {
      "songId": "zurui-yo-zurui-ne",
      "workId": "single-06"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.oricon.co.jp/news/2148002/full/",
        "type": "press",
        "label": "オリコン（自身初のシングル1位）"
      }
    ]
  },
  {
    "id": "anv-2019-winter-tour-866",
    "date": "2019-12-25",
    "endDate": "2020-01-17",
    "period": 3,
    "title": "初の5都市全国ツアー Winter Tour「866」",
    "description": "仙台Rensaから福岡・名古屋・大阪を回り、2020/1/17 Zepp Tokyoでファイナル。",
    "category": "concert",
    "highlight": false,
    "status": "held",
    "related": {},
    "confidence": "準確認",
    "sources": [
      {
        "url": "https://mdpr.jp/music/detail/1878670",
        "type": "press",
        "label": "モデルプレス（初の5都市全国ツアー決定）"
      },
      {
        "url": "https://equal-love.jp/news/detail/2322",
        "type": "official",
        "label": "公式FC企画告知（ツアー名のみ）"
      }
    ]
  },
  {
    "id": "anv-2020-ikonoijoy-youtube",
    "date": "2020-05",
    "endDate": null,
    "period": 3,
    "title": "＝LOVE・≠ME合同YouTubeチャンネル開設（現イコノイジョイ）",
    "description": "2020年5月に＝LOVE・≠MEの合同チャンネルとして開設。後に≒JOYも加わった3グループ合同チャンネル。",
    "category": "other",
    "highlight": false,
    "status": "held",
    "related": {
      "groupActivityId": "group-ikonoijoy-youtube"
    },
    "confidence": "準確認",
    "sources": [
      {
        "url": "https://www.cyberagent-adagency.com/news/648/",
        "type": "press",
        "label": "CyberAgent"
      }
    ]
  },
  {
    "id": "anv-2020-3rd-anniv-concert",
    "date": "2020-09-06",
    "endDate": null,
    "period": 3,
    "title": "3周年記念コンサート（パシフィコ横浜）・髙松瞳復帰",
    "description": "パシフィコ横浜 国立大ホールで「3rd ANNIVERSARY PREMIUM CONCERT」を開催（有観客と配信）。約1年休養していた髙松瞳がサプライズで復帰し、12人で「＝LOVE」を歌った。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-3rd-anniversary",
      "setlistIds": [
        "perf-3rd-anniversary"
      ],
      "memberId": "takamatsu-hitomi"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/395284",
        "type": "press",
        "label": "音楽ナタリー（高松瞳が復帰）"
      },
      {
        "url": "https://equal-love.jp/news/detail/3737",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2020-kimiha-tv",
    "date": "2020-09-13",
    "endDate": null,
    "period": 4,
    "title": "初の冠バラエティ「キミは＝LOVEを愛せるか！！」放送開始",
    "description": "フジテレビTWOでのパイロット放送から始まり、2021年からレギュラー化。2026年3月に終了。",
    "category": "tv",
    "highlight": false,
    "status": "held",
    "related": {
      "groupActivityId": "group-tv-kimi-ha-love"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/3266",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2021-first-budokan",
    "date": "2021-01-16",
    "endDate": "2021-01-17",
    "period": 4,
    "title": "初の日本武道館公演（2DAYS）",
    "description": "冬ツアー「You all are \"My ideal\"」のファイナルとして初めて日本武道館に立った。当初1日の予定が、ツアー初日に1/16・17の2日間へ拡大された（感染対策の制限付き開催）。",
    "category": "milestone",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-winter-tour-2021-budokan",
      "setlistIds": [
        "perf-winter-tour-2021-budokan"
      ],
      "historyEvent": "2021-01-17 初の日本武道館公演"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/412879",
        "type": "press",
        "label": "音楽ナタリー（1/17レポート）"
      },
      {
        "url": "https://natalie.mu/music/news/406525",
        "type": "press",
        "label": "音楽ナタリー（武道館2DAYSに）"
      }
    ]
  },
  {
    "id": "anv-2021-satake-graduation",
    "date": "2021-03-06",
    "endDate": null,
    "period": 4,
    "title": "佐竹のん乃 卒業（グループ初の卒業）",
    "description": "2021年2月1日に卒業を発表し、3月6日のさいたま市文化センターでの卒業コンサート（配信形式）でグループを卒業。結成以来初の卒業メンバー。",
    "category": "member",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-satake-graduation",
      "memberId": "satake-nonno",
      "setlistIds": [
        "perf-satake-graduation"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/414580",
        "type": "press",
        "label": "音楽ナタリー（卒業発表）"
      },
      {
        "url": "https://www.oricon.co.jp/news/2183374/full/",
        "type": "press",
        "label": "オリコン（イコラブ初の卒業者）"
      },
      {
        "url": "https://equal-love.jp/news/detail/3768",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2021-first-album",
    "date": "2021-05-12",
    "endDate": null,
    "period": 4,
    "title": "1stアルバム『全部、内緒。』発売・オリコン週間1位",
    "description": "初のアルバム。初週4.4万枚で5/24付オリコン週間アルバムランキング1位。同時期に全国ツアー「全部、内緒。」（9会場）を開催。",
    "category": "release",
    "highlight": true,
    "status": "held",
    "related": {
      "workId": "album-01",
      "songId": "sakura-no-saku-oto-ga-shita"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.oricon.co.jp/news/2193694/full/",
        "type": "press",
        "label": "オリコン（1stアルバムが1位）"
      }
    ]
  },
  {
    "id": "anv-2021-zenbunaisho-yokoari",
    "date": "2021-07-07",
    "endDate": null,
    "period": 4,
    "title": "全国ツアー「全部、内緒。」横浜アリーナでファイナル",
    "description": "5/8茨城から始まった9会場のツアーの最終公演。「ウィークエンドシトロン」（フワちゃん作詞参加）を初披露。",
    "category": "concert",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-zenbu-naisho-tour-2021",
      "setlistIds": [
        "perf-zenbu-naisho-tour-2021"
      ],
      "songId": "weekend-citron"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/435973",
        "type": "press",
        "label": "音楽ナタリー ライブレポート"
      },
      {
        "url": "https://natalie.mu/music/news/425229",
        "type": "press",
        "label": "音楽ナタリー（ツアー発表）"
      }
    ]
  },
  {
    "id": "anv-2021-first-mstation",
    "date": "2021-09-17",
    "endDate": null,
    "period": 4,
    "title": "「ミュージックステーション」初出演",
    "description": "デビュー4年目でテレビ朝日系「ミュージックステーション」に初出演し、「ウィークエンドシトロン」を披露。指原莉乃も応援に駆けつけた。",
    "category": "tv",
    "highlight": true,
    "status": "held",
    "related": {
      "songId": "weekend-citron",
      "tvAppearanceDate": "2021-09-17"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.oricon.co.jp/news/2207459/full/",
        "type": "press",
        "label": "オリコン（4年目でMステ初出演）"
      },
      {
        "url": "https://www.galpo.info/news/3550",
        "type": "press",
        "label": "ガルポ"
      }
    ]
  },
  {
    "id": "anv-2021-4th-anniv-concert",
    "date": "2021-09-20",
    "endDate": null,
    "period": 4,
    "title": "4周年記念コンサート（幕張メッセ イベントホール）",
    "description": "幕張メッセ イベントホールで昼夜2公演の「4th ANNIVERSARY PREMIUM CONCERT」を開催（生配信あり）。佐竹のん乃卒業後、11人で迎えた初の周年コンサート。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-4th-anniversary",
      "setlistIds": [
        "perf-4th-anniversary"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4518",
        "type": "official",
        "label": "公式NEWS（物販情報・会場名）"
      },
      {
        "url": "https://equal-love.jp/feature/specialsite_4thconcert",
        "type": "official",
        "label": "公式特設サイト"
      },
      {
        "url": "https://lp.p.pia.jp/article/news/200804/index.html",
        "type": "press",
        "label": "ぴあ ライブレポート"
      }
    ]
  },
  {
    "id": "anv-2022-nationwide-tour",
    "date": "2022-04-03",
    "endDate": null,
    "period": 5,
    "title": "全国ツアー2022「どう考えても、君ってイコラブのこと好きじゃん」",
    "description": "苫小牧市民会館を初日に全国10都市を回ったツアー。",
    "category": "concert",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-nationwide-tour-2022",
      "setlistIds": [
        "perf-nationwide-tour-2022"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4971",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2022-takamatsu-center-change",
    "date": "2022-04-29",
    "endDate": null,
    "period": 5,
    "title": "髙松瞳、センター交代を自ら発表",
    "description": "公式YouTubeのビデオメッセージで、11thシングル「あの子コンプレックス」からセンターを退くことを本人が発表。新センターは佐々木舞香。",
    "category": "member",
    "highlight": false,
    "status": "held",
    "related": {
      "historyEvent": "2022-04-29 髙松瞳、センター交代を発表",
      "memberId": "takamatsu-hitomi",
      "songId": "ano-ko-complex"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.oricon.co.jp/news/2233370/",
        "type": "press",
        "label": "オリコン"
      },
      {
        "url": "https://natalie.mu/music/pp/equallove13",
        "type": "press",
        "label": "音楽ナタリー 特集"
      }
    ]
  },
  {
    "id": "anv-2022-5th-anniv-concert",
    "date": "2022-09-25",
    "endDate": null,
    "period": 5,
    "title": "5周年記念コンサート（国立代々木競技場 第一体育館・約2万人）",
    "description": "周年コンサート史上最大の会場で昼夜2公演、計約2万人を動員（生配信あり）。12thシングル「Be Selfish」を初披露。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-5th-anniversary",
      "setlistIds": [
        "perf-5th-anniversary"
      ],
      "songId": "be-selfish"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/495012",
        "type": "press",
        "label": "音楽ナタリー ライブレポート"
      },
      {
        "url": "https://www.oricon.co.jp/news/2250677/full/",
        "type": "press",
        "label": "オリコン（2公演2万人動員）"
      },
      {
        "url": "https://equal-love.jp/feature/specialsite_5thconcert",
        "type": "official",
        "label": "公式特設サイト"
      }
    ]
  },
  {
    "id": "anv-2022-nagisa-grad-announce",
    "date": "2022-09-25",
    "endDate": null,
    "period": 5,
    "title": "齊藤なぎさ、卒業を発表",
    "description": "5周年コンサート夜の部で、齊藤なぎさがグループからの卒業を発表（時期は後日発表）。演技の仕事を新しい夢に挙げた。",
    "category": "member",
    "highlight": true,
    "status": "held",
    "related": {
      "memberId": "saito-nagisa"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/5841",
        "type": "official",
        "label": "公式NEWS「齊藤なぎさ 卒業のご報告」"
      },
      {
        "url": "https://www.oricon.co.jp/news/2250674/full/",
        "type": "press",
        "label": "オリコン"
      }
    ]
  },
  {
    "id": "anv-2022-ikorafu-radio",
    "date": "2022-10-03",
    "endDate": null,
    "period": 6,
    "title": "冠ラジオ「＝LOVEのイコラフ」（ニッポン放送）開始",
    "description": "毎週月曜のグループ冠レギュラーラジオ。メンバーが週替わりでパーソナリティ。",
    "category": "tv",
    "highlight": false,
    "status": "held",
    "related": {
      "groupActivityId": "group-radio-ikorafu"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/schedule/detail/5816",
        "type": "official",
        "label": "公式SCHEDULE"
      }
    ]
  },
  {
    "id": "anv-2023-nagisa-graduation",
    "date": "2023-01-13",
    "endDate": null,
    "period": 6,
    "title": "齊藤なぎさ 卒業コンサート（パシフィコ横浜）",
    "description": "「現役アイドルちゅ～ みんなのこと大好きだよ♡」と題した卒業コンサートで、グループを卒業。以後10人体制。",
    "category": "member",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-nagisa-graduation",
      "memberId": "saito-nagisa",
      "setlistIds": [
        "perf-nagisa-graduation"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/508688",
        "type": "press",
        "label": "音楽ナタリー"
      },
      {
        "url": "https://equal-love.jp/news/detail/5963",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2023-budokan-return",
    "date": "2023-03-02",
    "endDate": null,
    "period": 6,
    "title": "2年ぶりの日本武道館（全国ツアー2023 追加公演）",
    "description": "全国ツアー2023「Today is your Trigger」の追加公演として、制限なしの超満員で2度目の武道館公演（昼夜2公演）。",
    "category": "concert",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-nationwide-tour-2023-budokan",
      "setlistIds": [
        "perf-nationwide-tour-2023-budokan-night"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/515042",
        "type": "press",
        "label": "音楽ナタリー（2年ぶり武道館は超満員）"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/6259",
        "type": "official",
        "label": "公式SCHEDULE"
      }
    ]
  },
  {
    "id": "anv-2023-first-cdtv",
    "date": "2023-09-04",
    "endDate": null,
    "period": 6,
    "title": "「CDTVライブ！ライブ！」初出演",
    "description": "TBS系「CDTVライブ！ライブ！」に初出演し「ナツマトぺ」を披露。9/16には「CDTVライブ！ライブ！フェスティバル2023」にも初出演。",
    "category": "tv",
    "highlight": false,
    "status": "held",
    "related": {
      "songId": "natsumatope",
      "tvAppearanceDate": "2023-09-04"
    },
    "confidence": "準確認",
    "sources": [
      {
        "url": "https://www.thefirsttimes.jp/report/0000326879/",
        "type": "press",
        "label": "THE FIRST TIMES（フェス初出演レポート）"
      }
    ]
  },
  {
    "id": "anv-2023-6th-anniv-ssa",
    "date": "2023-10-18",
    "endDate": "2023-10-19",
    "period": 6,
    "title": "6周年記念コンサート（さいたまスーパーアリーナ・約2万8000人）",
    "description": "初のさいたまスーパーアリーナ2DAYSで約2万8000人を動員（当時の過去最大規模）。新曲「ラストノートしか知らない」を初披露し、翌年の初アリーナツアー開催を発表。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-6th-anniversary",
      "setlistIds": [
        "perf-6th-anniversary-day1",
        "perf-6th-anniversary-day2"
      ],
      "songId": "last-note-shika-shiranai"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/545595",
        "type": "press",
        "label": "音楽ナタリー（SSAに2万8000人）"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000003922.000013546.html",
        "type": "official",
        "label": "PR TIMES（ソニー・ミュージック）"
      },
      {
        "url": "https://equal-love.jp/feature/specialsite_6thconcert",
        "type": "official",
        "label": "公式特設サイト"
      }
    ]
  },
  {
    "id": "anv-2024-first-arena-tour",
    "date": "2024-02-03",
    "endDate": "2024-04-14",
    "period": 7,
    "title": "初のアリーナツアー2024「Tell me what's more than \"LOVE\"」",
    "description": "神戸ワールド記念ホールから有明アリーナ（4/14）まで回った自身初のアリーナツアー。ファイナルは9月の7周年Kアリーナ公演と位置づけられた。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-arena-tour-2024",
      "setlistIds": [
        "perf-arena-tour-2024-day2"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004153.000013546.html",
        "type": "official",
        "label": "PR TIMES（ソニー・ミュージック）"
      },
      {
        "url": "https://natalie.mu/music/news/545595",
        "type": "press",
        "label": "音楽ナタリー（初アリーナツアー発表）"
      }
    ]
  },
  {
    "id": "anv-2024-zettai-idol",
    "date": "2024-07-31",
    "endDate": null,
    "period": 7,
    "title": "「絶対アイドル辞めないで」発売・ロングヒットに",
    "description": "17thシングル（センター佐々木舞香、作詞 指原莉乃）。6/22公開のMVは24時間で100万回再生（自身最速）、発売日にストリーミング累計1,000万回を突破し、その後もTikTok等でロングヒット。",
    "category": "release",
    "highlight": true,
    "status": "held",
    "related": {
      "songId": "zettai-idol-yamenaide",
      "workId": "single-17"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004286.000013546.html",
        "type": "official",
        "label": "PR TIMES（ストリーミング1,000万回）"
      },
      {
        "url": "https://natalie.mu/music/pp/equallove19",
        "type": "press",
        "label": "音楽ナタリー 特集"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004254.000013546.html",
        "type": "official",
        "label": "PR TIMES（MV 11日で500万回）"
      }
    ]
  },
  {
    "id": "anv-2024-first-take",
    "date": "2024-08-28",
    "endDate": null,
    "period": 7,
    "title": "「THE FIRST TAKE」にメンバー全員で初登場",
    "description": "「絶対アイドル辞めないで」を一発撮りで披露（#471）。以前の3人での出演（「あの子コンプレックス」）に続き、全員では初。11/13には音源も配信された。",
    "category": "tv",
    "highlight": false,
    "status": "held",
    "related": {
      "songId": "zettai-idol-yamenaide"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.oricon.co.jp/news/2342259/full/",
        "type": "press",
        "label": "オリコン"
      },
      {
        "url": "https://natalie.mu/music/news/599228",
        "type": "press",
        "label": "音楽ナタリー（音源配信）"
      }
    ]
  },
  {
    "id": "anv-2024-7th-anniv-k-arena",
    "date": "2024-09-07",
    "endDate": "2024-09-08",
    "period": 7,
    "title": "7周年記念コンサート（Kアリーナ横浜・約3万6000人）",
    "description": "Kアリーナ横浜2DAYSで「7th ANNIVERSARY PREMIUM CONCERT」を開催。初のアリーナツアーのファイナルも兼ね、当時のグループ史上最大の約3万6000人を動員。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-7th-anniversary",
      "setlistIds": [
        "perf-7th-anniversary-day1",
        "perf-7th-anniversary-day2"
      ],
      "historyEvent": "2024-09-07 7周年記念コンサート、初のアリーナツアーファイナル"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004314.000013546.html",
        "type": "official",
        "label": "PR TIMES"
      },
      {
        "url": "https://natalie.mu/music/news/569362",
        "type": "press",
        "label": "音楽ナタリー"
      }
    ]
  },
  {
    "id": "anv-2024-zettai-mv-10m",
    "date": "2024-11-12",
    "endDate": null,
    "period": 8,
    "title": "「絶対アイドル辞めないで」MVが1,000万回再生を突破",
    "description": "公開から約5か月でMV再生数1,000万回を突破（その後2025年12月に2,000万回）。",
    "category": "release",
    "highlight": false,
    "status": "held",
    "related": {
      "songId": "zettai-idol-yamenaide"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.thefirsttimes.jp/news/0000516765/",
        "type": "press",
        "label": "THE FIRST TIMES"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1998972258833019170",
        "type": "official",
        "label": "公式X（2,000万回）"
      }
    ]
  },
  {
    "id": "anv-2025-timeless-tales",
    "date": "2025-02-02",
    "endDate": "2025-07-13",
    "period": 8,
    "title": "ARENA TOUR 2025「～Timeless Tales～」",
    "description": "2度目のアリーナツアー。5/5・6の国立代々木競技場第一体育館を経て、7月に有明アリーナで追加公演。報道では過去最多の約9万人動員（追加公演前の時点）。",
    "category": "concert",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-arena-tour-2025",
      "setlistIds": [
        "perf-arena-tour-2025-saitama-night",
        "perf-arena-tour-2025-day2",
        "perf-arena-tour-2025-ariake-day2"
      ]
    },
    "confidence": "準確認",
    "sources": [
      {
        "url": "https://www.thefirsttimes.jp/report/0000612633/",
        "type": "press",
        "label": "THE FIRST TIMES"
      },
      {
        "url": "https://natalie.mu/music/news/622810",
        "type": "press",
        "label": "音楽ナタリー（有明追加公演決定）"
      },
      {
        "url": "https://oshigoto.fan/news/118640/",
        "type": "press",
        "label": "推しごと（約9万人）"
      }
    ]
  },
  {
    "id": "anv-2025-tokubechu-release",
    "date": "2025-02-26",
    "endDate": null,
    "period": 8,
    "title": "「とくべチュ、して」発売",
    "description": "18thシングル（両A面「とくべチュ、して／恋人以上、好き未満」）。春ごろからTikTokのダンス動画で広がり、グループ最大のヒット曲になった。",
    "category": "release",
    "highlight": true,
    "status": "held",
    "related": {
      "songId": "tokubechu-shite",
      "workId": "single-18"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://news.yahoo.co.jp/articles/0f306fab3a07fe2903f788d31cec9abdcb5e9502",
        "type": "press",
        "label": "Billboard JAPAN（Yahoo!）"
      }
    ]
  },
  {
    "id": "anv-2025-7th-movie",
    "date": "2025-04-04",
    "endDate": null,
    "period": 8,
    "title": "映画『＝LOVE 7th ANNIVERSARY PREMIUM CONCERT THE MOVIE』公開",
    "description": "Kアリーナ横浜での7周年コンサート（2024/9/8）を収めたライブ映画が全国公開。ScreenX・4DXでも上映。",
    "category": "tv",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-7th-anniversary"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love-movie2025.jp/",
        "type": "official",
        "label": "映画公式サイト"
      },
      {
        "url": "https://natalie.mu/eiga/news/614456",
        "type": "press",
        "label": "映画ナタリー"
      },
      {
        "url": "https://ototoy.jp/news/122185",
        "type": "press",
        "label": "OTOTOY（公開日決定）"
      }
    ]
  },
  {
    "id": "anv-2025-tokubechu-tiktok-1b",
    "date": "2025-06",
    "endDate": null,
    "period": 8,
    "title": "「とくべチュ、して」TikTok総再生10億回を突破",
    "description": "TikTokでの楽曲総再生回数が10億回を突破。同時点でCD売上36.4万枚、ストリーミング3,500万回超え。",
    "category": "release",
    "highlight": false,
    "status": "held",
    "related": {
      "songId": "tokubechu-shite"
    },
    "confidence": "準確認",
    "sources": [
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004547.000013546.html",
        "type": "official",
        "label": "PR TIMES（ソニー・ミュージック）"
      }
    ]
  },
  {
    "id": "anv-2025-8th-tour-start",
    "date": "2025-09-06",
    "endDate": "2026-04-19",
    "period": 8,
    "title": "8周年ツアー「8th ANNIVERSARY PREMIUM TOUR」開幕（広島）",
    "description": "デビュー記念日に広島サンプラザホールで開幕。富士急・沖縄・仙台・千葉・愛知IGアリーナ・北海道・大阪城ホールを回り、2026年4月の横浜スタジアムまで全18公演。",
    "category": "concert",
    "highlight": false,
    "status": "held",
    "related": {
      "historyEvent": "2025-09-06 8周年記念ツアースタート",
      "liveHistoryId": "live-8th-anniversary-tour-ig-arena"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/feature/specialsite_8thconcert",
        "type": "official",
        "label": "公式特設サイト（全日程）"
      }
    ]
  },
  {
    "id": "anv-2025-lovesong-record",
    "date": "2025-10-08",
    "endDate": null,
    "period": 9,
    "title": "「ラブソングに襲われる」初週33.0万枚で自己最高・オリコン1位",
    "description": "19thシングルが初週33.0万枚（自身初の30万枚超え）で10/20付オリコン週間1位。通算6作目の1位。",
    "category": "release",
    "highlight": false,
    "status": "held",
    "related": {
      "songId": "love-song-ni-osowareru",
      "workId": "single-19"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.oricon.co.jp/news/2412088/full/",
        "type": "press",
        "label": "オリコン"
      }
    ]
  },
  {
    "id": "anv-2025-stadium-announce",
    "date": "2025-11-16",
    "endDate": null,
    "period": 9,
    "title": "初のスタジアム公演（横浜スタジアム）開催を発表",
    "description": "8周年ツアー愛知・IGアリーナ公演DAY2のアンコールで、ツアーファイナルを横浜スタジアム2DAYSで行うと発表。",
    "category": "milestone",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-8th-anniversary-tour-ig-arena",
      "setlistIds": [
        "perf-8th-anniversary-tour-ig-arena-day2"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/648384",
        "type": "press",
        "label": "音楽ナタリー"
      },
      {
        "url": "https://equal-love.jp/news/detail/10928",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2025-record-award-lyrics",
    "date": "2025-12-30",
    "endDate": null,
    "period": 9,
    "title": "第67回日本レコード大賞で「とくべチュ、して」が作詩賞",
    "description": "作詞の指原莉乃が「とくべチュ、して」で作詩賞を受賞（2025年11月発表）。12/30の放送に＝LOVEが出演し同曲を披露。",
    "category": "award",
    "highlight": true,
    "status": "held",
    "related": {
      "songId": "tokubechu-shite"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://x.com/Equal_LOVE_12/status/1991535932047286494",
        "type": "official",
        "label": "公式X（作詩賞受賞・2025-11-21投稿）"
      },
      {
        "url": "https://equal-love.jp/news/detail/11003",
        "type": "official",
        "label": "公式NEWS（レコード大賞出演決定）"
      },
      {
        "url": "https://mora.jp/topics/news/recordaward2025/",
        "type": "press",
        "label": "mora 各賞まとめ"
      }
    ]
  },
  {
    "id": "anv-2026-tokubechu-100m",
    "date": "2026-01-08",
    "endDate": null,
    "period": 9,
    "title": "「とくべチュ、して」ストリーミング累積1億回突破（自身初）",
    "description": "オリコンの累積再生数で自身初の1億回を突破（Billboard JAPANでも1億回）。",
    "category": "release",
    "highlight": false,
    "status": "held",
    "related": {
      "songId": "tokubechu-shite"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.cdjournal.com/news/equal-love/123705",
        "type": "press",
        "label": "CDJournal"
      },
      {
        "url": "https://x.com/oricon/status/2008977223890673774",
        "type": "press",
        "label": "オリコンニュース公式X"
      },
      {
        "url": "https://news.yahoo.co.jp/articles/0f306fab3a07fe2903f788d31cec9abdcb5e9502",
        "type": "press",
        "label": "Billboard JAPAN（Yahoo!）"
      }
    ]
  },
  {
    "id": "anv-2026-kokkokko",
    "date": "2026-01-28",
    "endDate": null,
    "period": 9,
    "title": "日本テレビ「イコラブコッコッコー!!」放送",
    "description": "相席スタートMCの期間限定冠バラエティ（全8週）。",
    "category": "tv",
    "highlight": false,
    "status": "held",
    "related": {
      "groupActivityId": "group-tv-kokkokko"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11092",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2026-yokohama-stadium",
    "date": "2026-04-18",
    "endDate": "2026-04-19",
    "period": 9,
    "title": "初のスタジアム公演・横浜スタジアム2DAYS（約7万人）",
    "description": "8周年ツアーFINALとして自身初のスタジアム公演。2日間で約7万人を動員し、新曲「モラトリアム」「お姫様の作り方」を初披露。",
    "category": "milestone",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-8th-anniversary-tour-yokohama-final",
      "setlistIds": [
        "perf-8th-anniversary-tour-yokohama-final-day1",
        "perf-8th-anniversary-tour-yokohama-final-day2"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/668885",
        "type": "press",
        "label": "音楽ナタリー ライブレポート"
      },
      {
        "url": "https://www.oricon.co.jp/news/2449888/full/",
        "type": "press",
        "label": "オリコン（7万人動員）"
      }
    ]
  },
  {
    "id": "anv-2026-national-stadium",
    "date": "2026-06-20",
    "endDate": "2026-06-21",
    "period": 9,
    "title": "国立競技場（MUFGスタジアム）2DAYS・13万2千人",
    "description": "STADIUM LIVE「Beyond \"KYUN\"♡」で2日間計13万2千人を動員（グループ史上最大、両日完売）。6/20に9周年コンサート、6/21に初の東京ドーム公演の開催を発表。",
    "category": "milestone",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-stadium-beyond-kyun",
      "setlistIds": [
        "perf-stadium-beyond-kyun-day1",
        "perf-stadium-beyond-kyun-day2"
      ],
      "historyEvent": "2026-06-20 国立競技場公演でグループ史上最大動員を記録"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004904.000013546.html",
        "type": "official",
        "label": "PR TIMES（ソニー・ミュージック）"
      }
    ]
  },
  {
    "id": "anv-2026-tokyo-dome-announce",
    "date": "2026-06-21",
    "endDate": null,
    "period": 9,
    "title": "初の東京ドーム公演を発表",
    "description": "国立競技場公演2日目に、2027年1月19日・20日の東京ドーム単独公演「＝LOVE in TOKYO DOME」を発表。",
    "category": "milestone",
    "highlight": false,
    "status": "held",
    "related": {
      "liveHistoryId": "live-tokyo-dome-announced"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004904.000013546.html",
        "type": "official",
        "label": "PR TIMES"
      },
      {
        "url": "https://equal-love.jp/news/detail/11613",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2026-kimimotto-tv",
    "date": "2026-07-06",
    "endDate": null,
    "period": 9,
    "title": "「キミはもっと＝LOVEを愛せるか!!!」放送開始",
    "description": "前番組のリニューアル版としてフジテレビで月2回放送。",
    "category": "tv",
    "highlight": false,
    "status": "held",
    "related": {
      "groupActivityId": "group-tv-kimi-motto"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11633",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2026-inkigayo",
    "date": "2026-08-23",
    "endDate": null,
    "period": 9,
    "title": "韓国SBS「人気歌謡」に初出演",
    "description": "韓国の音楽番組「인기가요（人気歌謡）」に初出演し、「恋、はじめました。」の韓国語バージョンを初披露。",
    "category": "tv",
    "highlight": false,
    "status": "held",
    "related": {
      "songId": "koi-hajimemashita",
      "tvAppearanceDate": "2026-08-23"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/686117",
        "type": "press",
        "label": "音楽ナタリー"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004972.000013546.html",
        "type": "official",
        "label": "PR TIMES"
      },
      {
        "url": "https://mdpr.jp/music/4833875",
        "type": "press",
        "label": "モデルプレス"
      }
    ]
  },
  {
    "id": "anv-2026-koihaji-500k",
    "date": "2026-08-26",
    "endDate": null,
    "period": 9,
    "title": "「恋、はじめました。」初週51.5万枚・自身初の50万枚超え",
    "description": "21stシングルが初週51.5万枚で9/7付オリコン週間1位（3作連続・通算8作目）。デビューから21作連続TOP10入り。",
    "category": "release",
    "highlight": false,
    "status": "held",
    "related": {
      "songId": "koi-hajimemashita",
      "workId": "single-21"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://www.oricon.co.jp/news/2477365/full/",
        "type": "press",
        "label": "オリコン"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004991.000013546.html",
        "type": "official",
        "label": "PR TIMES"
      }
    ]
  },
  {
    "id": "anv-2026-9th-anniv-concert",
    "date": "2026-10-15",
    "endDate": "2026-10-16",
    "period": 9,
    "title": "9周年記念コンサート（TOYOTA ARENA TOKYO・約2万人）",
    "description": "TOYOTA ARENA TOKYO 2DAYSで約2万人を動員。DAY1は1stコンサート、DAY2は2周年コンサートの衣装で登場するなど9年間を振り返る構成。",
    "category": "concert",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-9th-anniversary-premium-concert",
      "setlistIds": [
        "perf-9th-anniversary-premium-concert-day1",
        "perf-9th-anniversary-premium-concert-day2"
      ]
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://natalie.mu/music/news/693925",
        "type": "press",
        "label": "音楽ナタリー ライブレポート"
      },
      {
        "url": "https://equal-love.jp/news/detail/11612",
        "type": "official",
        "label": "公式NEWS"
      },
      {
        "url": "https://entameclip.com/news/491354/",
        "type": "press",
        "label": "日刊エンタメクリップ（2万人動員）"
      }
    ]
  },
  {
    "id": "anv-2026-nagoya-dome-announce",
    "date": "2026-10-16",
    "endDate": null,
    "period": 9,
    "title": "名古屋ドーム追加公演を発表・東京ドーム公演名「全ては＝LOVE」",
    "description": "9周年コンサートで、2027年2月24日・25日のバンテリンドーム ナゴヤ公演「＝LOVE DOME LIVE in NAGOYA『全ては＝LOVE』」を発表。東京ドーム公演のタイトルも「全ては＝LOVE」と発表された。",
    "category": "milestone",
    "highlight": true,
    "status": "held",
    "related": {
      "liveHistoryId": "live-nagoya-dome-announced"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/12275",
        "type": "official",
        "label": "公式NEWS"
      },
      {
        "url": "https://natalie.mu/music/news/693925",
        "type": "press",
        "label": "音楽ナタリー"
      }
    ]
  },
  {
    "id": "anv-2026-tokubechu-200m",
    "date": "2026-10-21",
    "endDate": null,
    "period": 10,
    "title": "「とくべチュ、して」ストリーミング累積2億回突破（自身初）",
    "description": "オリコン週間ストリーミングランキングで累積2億63.7万回となり、自身初の2億回突破作品に。",
    "category": "release",
    "highlight": false,
    "status": "held",
    "related": {
      "songId": "tokubechu-shite"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://news.yahoo.co.jp/articles/c2ebde0aa18e78cb2ea1606d17a70263f2fc832b",
        "type": "press",
        "label": "オリコン（Yahoo!）"
      }
    ]
  },
  {
    "id": "anv-2027-tokyo-dome",
    "date": "2027-01-19",
    "endDate": "2027-01-20",
    "period": 10,
    "title": "初の東京ドーム公演「＝LOVE in TOKYO DOME」（開催予定）",
    "description": "＝LOVE初の東京ドーム単独公演。2027年1月19日・20日開催予定。",
    "category": "concert",
    "highlight": true,
    "status": "announced",
    "related": {
      "liveHistoryId": "live-tokyo-dome-announced",
      "historyEvent": "2027-01-19 初の東京ドーム公演（開催予定）"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11613",
        "type": "official",
        "label": "公式NEWS"
      },
      {
        "url": "https://equal-love.jp/news/detail/12269",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  },
  {
    "id": "anv-2027-nagoya-dome",
    "date": "2027-02-24",
    "endDate": "2027-02-25",
    "period": 10,
    "title": "初の名古屋ドーム公演（開催予定）",
    "description": "バンテリンドーム ナゴヤでの「＝LOVE DOME LIVE in NAGOYA『全ては＝LOVE』」。2027年2月24日・25日開催予定。",
    "category": "concert",
    "highlight": false,
    "status": "announced",
    "related": {
      "liveHistoryId": "live-nagoya-dome-announced"
    },
    "confidence": "確認済み",
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/12275",
        "type": "official",
        "label": "公式NEWS"
      }
    ]
  }
];
