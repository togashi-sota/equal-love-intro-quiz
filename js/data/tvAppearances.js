// 自動生成ファイル（手で編集しない）。生成元：tools/feature-research/2026-10-29/history-pages/build_tv.py
// 【2026-10-29新設・本人の要望】「音楽番組出演・披露曲アーカイブ」のデータ。1件＝1回の放送（事実と出典URLだけ）。
// 【2026-10-30 再調査】確度を「出演」（confidence）と「曲」（songs の各曲の confidence）に分けた。
//   confidence：確認済み（番組公式・＝LOVE公式・放送局・複数の報道）／準確認（報道1件）／要確認（ファンの記録だけ）。
//   publish：出演が要確認の回は false（データには残すが、普段は画面・全体検索に出さない）。
//   songs：確認できた持ち歌だけ。unverifiedSongs：ファンの記録・会場のセットリストだけの曲（「要確認の記録も表示」のときだけ出す）。
//   broadcastType：original（初回放送）／rebroadcast（再放送）／digest（再編集・総集編・完全版・ハイライト）。
//   collabs：カバー・コラボ（kind：cover／collab／medley／joint。アプリの曲IDは付けない）。
// 全部の記録（要確認を含む）
export const TV_APPEARANCE_RECORDS = [
  {
    "date": "2017-08-29",
    "program": "ライブB♪",
    "station": "TBSテレビ",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": "テレビ初披露（デビュー前）。サイズ不明",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "8/29(火)深夜1:58〜放送（時計上は8/30未明）。曲名はファンまとめのみ。",
    "verificationNote": "出演は公式で確認。公式本文に曲名はなく、曲名はファンまとめのみ。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/53",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 8/29(火)TBS「ライブB」出演！"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/54",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: TBS「ライブB」"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/5197410.html",
        "type": "fan",
        "title": "イコラブ＠プレス「2017.08.29 ♪=LOVE テレビ初披露＠TBS『ライブB♪』」"
      }
    ]
  },
  {
    "date": "2017-09-03",
    "program": "シブヤノオト",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": "生放送。デビュー3日前の披露",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "初生出演（公式告知「初生出演」）。指原莉乃も出演。",
    "verificationNote": "出演は公式告知で確認済みに引き上げ。曲名はWikipediaとファンまとめのみで報道・公式の裏付けがなく要確認のまま（番組公式Xの転載投稿でも曲名なし）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/55",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 9/3(日)NHK「シブヤノオト」に初生出演！"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/56",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: NHK「シブヤノオト」"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/シブヤノオト",
        "type": "fan",
        "title": "Wikipedia「シブヤノオト」放送リスト（第15回 =LOVE「=LOVE」）"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/5208759.html",
        "type": "fan",
        "title": "イコラブ＠プレス「2017.09.03 NHK総合『シブヤノオト』」"
      },
      {
        "url": "https://twisoku.ldblog.jp/archives/52001450.html",
        "type": "fan",
        "title": "ついトレ速報（番組公式X @nhk_oto の当日投稿「パフォーマンス終了後の『大好き！』」等を転載。曲名なし）"
      }
    ]
  },
  {
    "date": "2017-09-16",
    "program": "AKB48SHOW!特別版「さしはらSHOW!」",
    "station": "NHK BSプレミアム",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": "スタジオ生ライブ",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "公式告知は「＝LOVEのスタジオ生ライブ」（曲名なし）。曲名はファンまとめ。",
    "verificationNote": "出演（スタジオ生ライブ）は公式で確認。曲名はファンまとめのみ。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/101",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 9/16(土)「さしはらSHOW!」出演！"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/102",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: NHK BSプレミアム「さしはらSHOW!」"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/5236742.html",
        "type": "fan",
        "title": "イコラブ＠プレス「2017.09.16 ♪=LOVE＠さしはらSHOW!」"
      }
    ]
  },
  {
    "date": "2017-09-19",
    "program": "FULL CHORUS〜音楽は、フルコーラス〜 #96",
    "station": "BSスカパー!",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "公式告知に「＝LOVEのフルコーラス歌唱はもちろん、司会のハマ・オカモトさん、ベッキーさんともお話」。歌唱曲名は未確認（デビュー曲の可能性が高いが記録なし）。共演ゲスト：フェアリーズ、あゆみくりかまき。",
    "verificationNote": "番組公式アーカイブ（#96・2017年9月19日）に＝LOVEのセットリスト「1：=LOVE」が載っていることを検索結果の抜粋で確認。1曲のみの記載。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/106",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 9/19(火)BSスカパー!「フルコーラス」出演！"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/5334314.html",
        "type": "fan",
        "title": "イコラブ＠プレス「2017.09.19 BSスカパー!『FULL CHORUS』」"
      },
      {
        "url": "https://www.bs-sptv.com/fullchorus/archive/",
        "type": "program",
        "title": "BSスカパー!「FULL CHORUS」公式アーカイブ（検索結果の抜粋で確認。現在ドメインはDNS解決不可）"
      }
    ]
  },
  {
    "date": "2017-09-25",
    "program": "月〜金お昼のソングショー ひるソン!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "第120回。5分番組で1曲歌唱の形式。歌唱曲は公式に記載なし。ファンブログは「[=LOVE]初出演」と記載するが一次資料未確認のため曲は空欄。",
    "verificationNote": "出演は公式で確認（公式本文に曲名なし）。テレ東のバックナンバーは取得できず、曲名は見つからなかった。デビュー曲「＝LOVE」の可能性が高いが証拠なし。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/103",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 9/25(月)テレビ東京「ひるソン！」出演！"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/104",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: テレビ東京「ひるソン！」"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/月〜金お昼のソングショー_ひるソン!",
        "type": "fan",
        "title": "Wikipedia「月〜金お昼のソングショー ひるソン!」出演歌手一覧（出演日のみ・曲名なし）"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      }
    ]
  },
  {
    "date": "2017-09-29",
    "program": "バズリズム",
    "station": "日本テレビ",
    "broadcastType": "original",
    "confidence": "要確認",
    "publish": false,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": "ファンまとめの記事題のみが根拠",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "公式スケジュール・ニュースに掲載なし。ファンまとめに「=LOVE『♪=LOVE』＠バズリズム」の記事があるのみ。番組名は2017年9月末まで「バズリズム」（10月から「バズリズム02」）。フル出演か曲紹介コーナーかも不明。",
    "verificationNote": "ファンまとめの見出しのみで、本文は空。タグが「#フルコーラス」で、9/19のFULL CHORUSとの取り違えやランキングコーナーでのMV紹介の可能性もある。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equallove-2017.blog.jp/archives/5334378.html",
        "type": "fan",
        "title": "イコラブ＠プレス「2017.09.29 =LOVE『♪=LOVE』＠バズリズム」"
      }
    ]
  },
  {
    "date": "2017-12-12",
    "program": "FULL CHORUS〜音楽は、フルコーラス〜 #107",
    "station": "BSスカパー!",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "僕らの制服クリスマス",
        "songId": "bokura-no-seifuku-christmas",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "公式に出演（フルメンバー）の記載あり。歌唱曲名は未確認。",
    "verificationNote": "番組公式アーカイブ（#107、共演：THEイナズマ戦隊、黒猫チェルシー、加川明）に＝LOVEのセットリスト「1：僕らの制服クリスマス」を確認。なお#108（2018-01-23）は総集編「アイドルパレード2017」で、＝LOVEの映像が含まれたかは未確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/298",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】BSスカパー！「FULL CHORUS」 #107"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/299",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: BSスカパー！「FULL CHORUS」 #107"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/5667980.html",
        "type": "fan",
        "title": "イコラブ＠プレス「2017.12.12『FULL CHORUS』」"
      },
      {
        "url": "https://www.bs-sptv.com/fullchorus/archive/",
        "type": "program",
        "title": "BSスカパー!「FULL CHORUS」公式アーカイブ（検索結果の抜粋で確認。現在ドメインはDNS解決不可）"
      }
    ]
  },
  {
    "date": "2017-12-19",
    "program": "ライブB♪",
    "station": "TBSテレビ",
    "broadcastType": "original",
    "confidence": "要確認",
    "publish": false,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "僕らの制服クリスマス",
        "songId": "bokura-no-seifuku-christmas",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "公式スケジュールには掲載なし。ファンまとめのみ。",
    "verificationNote": "ファンまとめの実況記事のみ（タイトルで「地上波初披露」と記載）。公式・TBSの記録は見つからない。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equallove-2017.blog.jp/archives/5836016.html",
        "type": "fan",
        "title": "イコラブ＠プレス「2017.12.19『ライブB♪』（コメント欄に「♪僕らの制服クリスマス」）」"
      }
    ]
  },
  {
    "date": "2017-12-25",
    "program": "月〜金お昼のソングショー ひるソン!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "僕らの制服クリスマス",
        "songId": "bokura-no-seifuku-christmas",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "第181回。公式に「歌唱曲：『僕らの制服クリスマス』」「出演者：フルメンバー」と明記。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/305",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/306",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/月〜金お昼のソングショー_ひるソン!",
        "type": "fan",
        "title": "Wikipedia「月〜金お昼のソングショー ひるソン!」出演歌手一覧（出演日のみ・曲名なし）"
      }
    ]
  },
  {
    "date": "2018-03-14",
    "program": "スカパー!音楽祭2018",
    "station": "BSスカパー!",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "僕らの制服クリスマス",
        "songId": "bokura-no-seifuku-christmas",
        "note": "6番目に出演。番組はフルコーラス歌唱が基本",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "19:00〜23:30生放送。MC：ベッキー、ハマ・オカモト。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/425",
        "type": "official",
        "title": "＝LOVE公式 NEWS: BSスカパー！「スカパー！音楽祭 2018」出演決定！"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/426",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: BSスカパー！「スカパー！音楽祭 2018」"
      },
      {
        "url": "https://www.bs-sptv.com/ongakusai2018/",
        "type": "broadcaster",
        "title": "BSスカパー!「スカパー!音楽祭2018」セットリスト"
      },
      {
        "url": "https://news.livedoor.com/article/detail/14610313/",
        "type": "press",
        "title": "ライブドアニュース「スカパー！音楽祭」全33組52曲・個別詳報レポート"
      },
      {
        "url": "http://equallove-2017.blog.jp/archives/7742241.html",
        "type": "fan",
        "title": "イコラブ＠プレス「スカパー！音楽祭2018のセトリを発表！『僕らの制服クリスマス』を披露」"
      }
    ]
  },
  {
    "date": "2018-03-31",
    "program": "MTV LIVE MATCH（放送）",
    "station": "MTV",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "僕らの制服クリスマス",
        "songId": "bokura-no-seifuku-christmas",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "記憶のどこかで",
        "songId": "kioku-no-dokoka-de",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "スタート！",
        "songId": "start",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "届いてLOVE YOU♡",
        "songId": "todoite-love-you",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "ようこそ！イコラブ沼",
        "songId": "youkoso-ikorabu-numa",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2018-02-24 パシフィコ横浜でのイベントにオープニングアクトとして出演した模様の放送（公式に「放送日」と記載）。放送された曲は未確認。",
    "verificationNote": "MTV公式リリースで、2018-02-24パシフィコ横浜公演（＝LOVEはオープニングアクト）の模様を3/31放送と確認。会場セトリ6曲を追加したが、1時間枠で3組のため放送された曲は不明。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/schedule/detail/489",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 「MTV LIVE MATCH」 放送日"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000000084.000023241.html",
        "type": "broadcaster",
        "title": "MTV公式プレスリリース（PR TIMES）「MTV LIVE MATCH第三弾…3月31日（土）22:30より放送」"
      }
    ]
  },
  {
    "date": "2018-05-15",
    "program": "FULL CHORUS〜音楽は、フルコーラス〜 #113",
    "station": "BSスカパー!",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "手遅れcaution",
        "songId": "teokure-caution",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "公式に出演（全員）の記載あり。3rdシングル発売前日。歌唱曲名は未確認。",
    "verificationNote": "番組公式アーカイブ（#113、共演：前野健太、平川のおじさん、CYNHN）に＝LOVEのセットリスト「1：手遅れcaution」を確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/619",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】FULL CHORUS～音楽は、フルコーラス～"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/620",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: FULL CHORUS～音楽は、フルコーラス～"
      },
      {
        "url": "https://www.bs-sptv.com/fullchorus/archive/",
        "type": "program",
        "title": "BSスカパー!「FULL CHORUS」公式アーカイブ（検索結果の抜粋で確認。現在ドメインはDNS解決不可）"
      }
    ]
  },
  {
    "date": "2018-05-29",
    "program": "月〜金お昼のソングショー ひるソン!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "手遅れcaution",
        "songId": "teokure-caution",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "第278回。公式に「※歌唱曲『手遅れcaution』」と明記。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/654",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】テレビ東京「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/655",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: テレビ東京「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/月〜金お昼のソングショー_ひるソン!",
        "type": "fan",
        "title": "Wikipedia「月〜金お昼のソングショー ひるソン!」出演歌手一覧（出演日のみ・曲名なし）"
      }
    ]
  },
  {
    "date": "2018-07-14",
    "program": "@JAM 2018 Day1（スカパー!放送）",
    "station": "スカパー!",
    "broadcastType": "original",
    "confidence": "要確認",
    "publish": false,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2018-05-26開催「@JAM 2018」Day1のライブ放送（インタビュー企画を新収録）とファンまとめに記載。公式スケジュールでは未確認。放送曲は不明。",
    "verificationNote": "ファンまとめのみ。放送局はスカパー!「アイドル専門チャンネルPigoo」（ch.663）の「@JAM 2018 Day1～前編」と推定されるが、＝LOVEが前編に入ったかは公式で未確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equallove-2017.blog.jp/archives/10629495.html",
        "type": "fan",
        "title": "イコラブ＠プレス「20180714 スカパー『@JAM 2018 Day1 前編(2018/5/26)』ライブ＋インタビュー企画も新たに収録」"
      },
      {
        "url": "https://taskhavefun.net/contents/187589",
        "type": "other",
        "title": "Task have Fun公式「2018/8/11 スカパー!ch.663 アイドル専門チャンネルPigoo『@JAM 2018 Day1～後編』」（＝LOVEの記載なし。前後編の存在のみ）"
      }
    ]
  },
  {
    "date": "2018-10-25",
    "program": "月〜金お昼のソングショー ひるソン!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "Want you！Want you！",
        "songId": "want-you-want-you",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "第381回。公式に「※歌唱曲『Want you！Want you！』」と明記。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/1059",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】テレビ東京「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/1113",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: テレビ東京「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/月〜金お昼のソングショー_ひるソン!",
        "type": "fan",
        "title": "Wikipedia「月〜金お昼のソングショー ひるソン!」出演歌手一覧（出演日のみ・曲名なし）"
      }
    ]
  },
  {
    "date": "2019-03-31",
    "program": "JOKER DX ファン感謝祭",
    "station": "OAB大分朝日放送",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "Want you！Want you！",
        "songId": "want-you-want-you",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "「部活中に目が合うなって思ってたんだ」",
        "songId": "bukatsuchu-ni-megaau-natte-omotteta-nda",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "手遅れcaution",
        "songId": "teokure-caution",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "探せ ダイヤモンドリリー",
        "songId": "sagase-diamond-lily",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "12:00〜12:55生放送（大分ローカル）。曲目はファンまとめのコメント欄にある会場（駅前）ライブのセトリで、どこまで放送されたかは未確認。",
    "verificationNote": "出演（生放送）は公式で確認。曲目は会場（大分駅前）ライブのファン証言のみで、放送された範囲は不明。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/1474",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】OAB大分朝日放送「JOKER DX ファン感謝祭」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/1475",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: OAB大分朝日放送「JOKER DX ファン感謝祭」"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/16709435.html",
        "type": "fan",
        "title": "イコラブ＠プレス「=LOVE出演 OAB大分朝日放送『JOKER DX ファン感謝祭』まとめ」"
      }
    ]
  },
  {
    "date": "2019-05-02",
    "program": "月〜金お昼のソングショー ひるソン!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "探せ ダイヤモンドリリー",
        "songId": "sagase-diamond-lily",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "第501回。公式に「※歌唱曲『探せ ダイヤモンドリリー』」と明記。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/1624",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】テレビ東京「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/1625",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: テレビ東京「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/月〜金お昼のソングショー_ひるソン!",
        "type": "fan",
        "title": "Wikipedia「月〜金お昼のソングショー ひるソン!」出演歌手一覧（出演日のみ・曲名なし）"
      }
    ]
  },
  {
    "date": "2019-10-12",
    "program": "六本木アイドルフェスティバル2019",
    "station": "テレ朝チャンネル1（CS）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "Want you！Want you！",
        "songId": "want-you-want-you",
        "note": "M1",
        "confidence": "要確認"
      },
      {
        "title": "届いてLOVE YOU♡",
        "songId": "todoite-love-you",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "手遅れcaution",
        "songId": "teokure-caution",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "いらない ツインテール",
        "songId": "iranai-twintail",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "探せ ダイヤモンドリリー",
        "songId": "sagase-diamond-lily",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2019-07-26 六本木ヒルズアリーナ公演の放送（11:00〜19:00の8時間枠）。曲目はイベント当日のライブレポートから（他に曲名不明の1曲あり、全曲の記載とは限らない）。放送で全曲流れたかは未確認。",
    "verificationNote": "放送は公式とナタリーで確認（チャンネル名はテレ朝チャンネル1）。曲目は会場ライブレポートで、2曲目は曲名不明のまま。放送でどこまで流れたかは不明。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2073",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】CSテレビ朝日「六本木アイドルフェスティバル2019」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2074",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: CSテレビ朝日「六本木アイドルフェスティバル2019」"
      },
      {
        "url": "https://popnroll.tv/articles/3762",
        "type": "press",
        "title": "Pop'n'Roll「＝LOVE［ライブレポート］…六本木アイドルフェスティバル2019」"
      },
      {
        "url": "https://natalie.mu/music/news/350830",
        "type": "press",
        "title": "音楽ナタリー「3日間にわたり繰り広げられた『六本木アイドルフェスティバル』8時間一挙オンエア」"
      }
    ]
  },
  {
    "date": "2019-10-19",
    "program": "真夏のアイドル大博覧会 @JAM EXPO 2019 ストロベリーステージ 完全版スペシャル!!",
    "station": "CS日テレプラス",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "探せ ダイヤモンドリリー",
        "songId": "sagase-diamond-lily",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "「部活中に目が合うなって思ってたんだ」",
        "songId": "bukatsuchu-ni-megaau-natte-omotteta-nda",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "届いてLOVE YOU♡",
        "songId": "todoite-love-you",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "いらない ツインテール",
        "songId": "iranai-twintail",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "手遅れcaution",
        "songId": "teokure-caution",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "Want you！Want you！",
        "songId": "want-you-want-you",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2019-08-25 横浜アリーナ公演（DAY2）の放送。DAY2枠は10/19 20:00〜29:00。曲目は会場セトリ（ファンブログ）で、放送版の内容は未確認。",
    "verificationNote": "放送は公式で確認。曲目は会場セトリ（ファン）のみ。題名が「完全版」なので digest としたが、先行するテレビ放送は見つかっておらず、実質はイベント映像の初放送。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2248",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】真夏のアイドル大博覧会 @ JAM EXPO 2019 ストロベリーステージ 完全版スペシャル！！"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2249",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://ameblo.jp/ryanryan1975/entry-12520900756.html",
        "type": "fan",
        "title": "ファンブログ「8/25 ＠JAM EXPO 2019 Day2＠横浜アリーナその2」"
      },
      {
        "url": "https://dempagumi.tokyo/2019/10/17/2019-10-19_atjamexpo_live_media/",
        "type": "other",
        "title": "でんぱ組.inc公式（同番組の放送告知）"
      }
    ]
  },
  {
    "date": "2019-10-19",
    "program": "＝LOVE in テレビ朝日・六本木ヒルズ夏祭り SUMMER STATION 音楽LIVE 2019",
    "station": "CSテレビ朝日",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2019-08-10 六本木ヒルズアリーナでの＝LOVE単独ステージの放送（18:00〜19:00）。セットリストは未確認。",
    "verificationNote": "放送は公式で確認。2019年8月10日公演のセトリは公式・報道とも見つからず（同日付のBARKS記事は2022年公演）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2071",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】＝LOVE in テレビ朝日・六本木ヒルズ夏祭り SUMMER STATION 音楽LIVE 2019"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2072",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/1825",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: コカ・コーラ SUMMER STATION 音楽LIVE（8/10公演）"
      }
    ]
  },
  {
    "date": "2019-11-08",
    "program": "バズリズム02",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": "同曲は番組の2019年11月オープニングテーマ",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "24:59〜25:59（時計上は11/9未明）。公式は出演のみ告知。歌唱はファン動画（「Live+Talk」）とファンブログで確認。",
    "verificationNote": "出演は公式で確認。歌唱曲はファン動画・ファンブログのみ（同曲が11月OPテーマである点は公式X）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2280",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】日本テレビ系「バズリズム02」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2281",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 日本テレビ系「バズリズム02」"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1187584957360693249",
        "type": "official",
        "title": "＝LOVE公式X：『ズルいよ ズルいね』バズリズム02 11月オープニングテーマ決定"
      },
      {
        "url": "https://www.bilibili.com/video/BV1NE411v7FV/",
        "type": "fan",
        "title": "bilibili「2019.11.09 =LOVE『ズルいよ ズルいね』@バズリズム02」"
      },
      {
        "url": "https://ameblo.jp/kazchan345/entry-12543616434.html",
        "type": "fan",
        "title": "ファンブログ「昨日のバズリズム02を見た人━━━？」"
      }
    ]
  },
  {
    "date": "2019-11-21",
    "program": "月〜金お昼のソングショー ひるソン!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "第636回。公式は出演のみ（曲名なし）。曲名はファンブログ（翌日投稿「『ズルいよ ズルいね』を披露しました」）。",
    "verificationNote": "出演は公式で確認（公式本文に曲名なし）。曲名はファンブログのみ。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2295",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】テレビ東京「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2296",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/月〜金お昼のソングショー_ひるソン!",
        "type": "fan",
        "title": "Wikipedia「月〜金お昼のソングショー ひるソン!」出演歌手一覧（出演日のみ・曲名なし）"
      },
      {
        "url": "https://ameblo.jp/nukuida/entry-12547623189.html",
        "type": "fan",
        "title": "ファンブログ「本物の力」"
      }
    ]
  },
  {
    "date": "2019-12-07",
    "program": "Uta-Tube",
    "station": "NHK総合（東海・北陸ローカル）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": "ファンまとめによる。放送曲の一次資料なし",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "NHK名古屋の音楽番組。2019-11-08 NHK名古屋放送局で公開収録。公式は「スタジオライブ＆トーク出演」。ファンまとめは収録では他に探せ ダイヤモンドリリー／僕らの制服クリスマス／＝LOVEも歌ったと記載（それらの放送は未確認）。",
    "verificationNote": "放送は公式で確認。曲名はファン一覧のみ。収録時の他曲（探せ ダイヤモンドリリー等）が放送されたかも不明。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2246",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】NHK名古屋「Uta-Tube」※公開収録"
      },
      {
        "url": "https://equal-love.jp/news/detail/2421",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】NHK総合「Uta-Tube」 ※スタジオライブ＆トーク出演"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2422",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: NHK総合「Uta-Tube」"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      }
    ]
  },
  {
    "date": "2020-03-01",
    "program": "Uta-Tube「=LOVE／Info-Tube でんぱ組.inc」",
    "station": "NHK BSプレミアム",
    "broadcastType": "rebroadcast",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2019-12-07放送回の全国放送版（ファンまとめでは21分版）。放送曲は未確認。",
    "verificationNote": "公式に3/1(日)23:40〜BSプレミアム全国放送とあるが、曲名は公式・報道とも見つからない。2019-12-07中部ローカル回の全国放送版（尺が違う可能性あり）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2704",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】NHK BSプレミアム「Uta-Tube」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2705",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: NHK BSプレミアム「Uta-Tube」"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      }
    ]
  },
  {
    "date": "2020-03-28",
    "program": "RAGAZZE!〜少女たちよ!〜",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "手遅れcaution",
        "songId": "teokure-caution",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2020-02-28 NHKホールで無観客収録（新型コロナのため）。出演：＝LOVE、AKB48、たこやきレインボー、BEYOOOOONDS、フィロソフィーのダンス、モーニング娘。'20、ももいろクローバーZ。",
    "verificationNote": "Real Sound・Billboard JAPAN・TVLIFE の3媒体が＝LOVEの2曲を掲載（Real Soundは3/28総合放送の詳細として掲載）。2/28 NHKホールで無観客収録。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2706",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】NHK総合／NHK BSプレミアム「RAGAZZE！～少女たちよ！～」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2707",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: NHK総合「RAGAZZE！～少女たちよ！～」"
      },
      {
        "url": "https://www.billboard-japan.com/d_news/detail/86411/2",
        "type": "press",
        "title": "Billboard JAPAN「AKB48、ももクロ、モー娘。ら共演『RAGAZZE！～少女たちよ！～』セットリスト」"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      },
      {
        "url": "https://realsound.jp/2020/03/post-529627.html",
        "type": "press",
        "title": "Real Sound『RAGAZZE！』3/28放送の詳細・セットリスト（＝LOVE 2曲）"
      },
      {
        "url": "https://www.tvlife.jp/entame/270015",
        "type": "press",
        "title": "TVLIFE『RAGAZZE!!』セットリスト（＝LOVE 2曲）"
      }
    ]
  },
  {
    "date": "2020-04-11",
    "program": "RAGAZZE!〜少女たちよ!〜（2時間拡大版）",
    "station": "NHK BSプレミアム",
    "broadcastType": "digest",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "準確認",
    "songs": [
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "手遅れcaution",
        "songId": "teokure-caution",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": "拡大版で追加",
        "confidence": "準確認"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "総合版より各グループのライブを長く収録した拡大版。",
    "verificationNote": "Pop'n'Rollが拡大版の＝LOVEの曲を3曲（「＝LOVE」が追加）と掲載。3/28総合版に未公開映像を加えた2時間版なので broadcastType は digest（再編集の拡大版）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/schedule/detail/2708",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: NHK BSプレミアム「RAGAZZE！～少女たちよ！～」"
      },
      {
        "url": "https://popnroll.tv/articles/7690",
        "type": "press",
        "title": "Pop'n'Roll「『RAGAZZE!〜少女たちよ！』2時間拡大版、番組内容公開！」"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      },
      {
        "url": "https://realsound.jp/2020/03/post-529627.html",
        "type": "press",
        "title": "Real Sound『RAGAZZE！』3/28放送の詳細・セットリスト（＝LOVE 2曲）"
      },
      {
        "url": "https://www.billboard-japan.com/d_news/detail/86411/2",
        "type": "press",
        "title": "Billboard JAPAN『RAGAZZE！』セットリスト（＝LOVE 2曲）"
      }
    ]
  },
  {
    "date": "2020-04-17",
    "program": "アイドルのチカラ（第3回）",
    "station": "TBSチャンネル1（CS）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "CAMEO",
        "songId": "cameo",
        "note": "新曲（当時発売延期中）",
        "confidence": "確認済み"
      },
      {
        "title": "「君と私の歌」",
        "songId": "kimi-to-watashi-no-uta",
        "note": "初披露（7thシングル カップリング）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "21:30〜22:40。マイナビBLITZ赤坂で無観客収録、ライブとバラエティの二部構成。全8曲を披露したと報道されているが、判明しているのは4曲のみ（残り4曲は未確認）。",
    "verificationNote": "TBSチャンネル公式ページで4/17(金)21:30〜22:40・CAMEOなど全8曲を確認。判明は4曲で、残り4曲は不明のまま。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2767",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【お知らせ】CS放送TBSチャンネル1「アイドルのチカラ」に=LOVEが出演！"
      },
      {
        "url": "https://equal-love.jp/news/detail/2807",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【お知らせ】CS放送TBSチャンネル1「アイドルのチカラ」放送日時が決定！"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2823",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: TBSチャンネル1『アイドルのチカラ』"
      },
      {
        "url": "https://hominis.media/category/idol/post5580/",
        "type": "press",
        "title": "HOMINIS「＝LOVE・齊藤なぎさは自他共に認める小悪魔」（全8曲、4曲名を記載）"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000001011.000003065.html",
        "type": "press",
        "title": "PR TIMES（TBS）「特別音楽番組『アイドルのチカラ』放送決定！」"
      },
      {
        "url": "https://ameblo.jp/nukuida/entry-12590325104.html",
        "type": "fan",
        "title": "ファンブログ「今晩21:30より『アイドルのチカラ』放送」"
      },
      {
        "url": "https://www.tbs.co.jp/tbs-ch/item/o2409/",
        "type": "broadcaster",
        "title": "TBSチャンネル番組ページ「アイドルのチカラ」（第3回 4/17 21:30〜22:40、CAMEOなど全8曲）"
      },
      {
        "url": "https://thetv.jp/news/detail/230344/",
        "type": "press",
        "title": "ザテレビジョン「＝LOVEが最新シングルのカップリング曲を初披露！」（＝LOVE/ズルいよ/君と私の歌）"
      }
    ]
  },
  {
    "date": "2020-04-26",
    "program": "@JAM TV powered by LIVE DAM Ai #19",
    "station": "日テレプラス ドラマ・アニメ・音楽ライブ（CS）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "初回放送24:00〜25:00。共演：アキシブproject、DEAR KISS、ラストアイドル、イケてるハーツ、さくらシンデレラ、notall。放送曲は未確認。",
    "verificationNote": "出演は公式で確認。番組はフル尺歌唱が特徴だが、＝LOVEの曲名はどこにも見つからなかった。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2814",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】「@JAM TV powered by LIVE DAM Ai 」出演決定！"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2815",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: @JAM TV powered by LIVE DAM Ai"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/@JAM_TV_powered_by_LIVE_DAM_Ai",
        "type": "other",
        "title": "Wikipedia（#19 2020年4月26日の出演者一覧）"
      }
    ]
  },
  {
    "date": "2020-06-13",
    "program": "Uta-Tube「=LOVE蔵出しSP」",
    "station": "NHK総合（中部7県）",
    "broadcastType": "digest",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2019-11-08収録の未放送分を中心とした特番と考えられるが、放送曲は未確認。",
    "verificationNote": "公式は6/13(土)10:55〜・中部7県のみと告知。内容・曲名の記載なし。蔵出しSPは他組の例から未公開曲・未公開トーク中心の特番（digest）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/2946",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】NHK「Uta-tube =LOVE蔵出しSP」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/2947",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      }
    ]
  },
  {
    "date": "2020-07-18",
    "program": "RAGAZZE!〜少女たちよ!〜（再放送）",
    "station": "NHK総合",
    "broadcastType": "rebroadcast",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "手遅れcaution",
        "songId": "teokure-caution",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "24:05〜26:05（時計上は7/19未明）の2時間枠の再放送。4/11拡大版と同内容と思われるが未確認のため曲は空欄。",
    "verificationNote": "公式告知の枠が2時間（24:05〜26:05）で4/11 BS 2時間版と一致し、個人ブログもBS版の地上波再放送と記述。同じ内容なら曲は4/11と同じ3曲だが、同一と示す公式資料はないので要確認として追加。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": true,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/3054",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】NHK総合「RAGAZZE！～少女たちよ！～」再放送"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/3055",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://popnroll.tv/articles/7690",
        "type": "press",
        "title": "Pop'n'Roll 2時間拡大版の内容（＝LOVE 3曲、総合版未公開映像を追加）"
      },
      {
        "url": "https://simokitazawa.hatenablog.com/entry/2020/07/20/001341",
        "type": "fan",
        "title": "個人ブログ（7月の地上波はBS 2時間版の再放送との記述）"
      }
    ]
  },
  {
    "date": "2020-07-28",
    "program": "PLAYLIST",
    "station": "TBSテレビ",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "深夜1:58〜。公式は「出演」のみ。番組内容（歌唱の有無・曲）は未確認。",
    "verificationNote": "番組公式バックナンバーに＝LOVEが掲載（出演確定）。番組形式はMVを交えた紹介→白いスタジオでのトーク→基本フルサイズのライブ（Wikipedia）だが、この回の曲名は公式に記載なし。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/3083",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】TBS「PLAYLIST」※=LOVE"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/3084",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      },
      {
        "url": "https://www.tbs.co.jp/playlist-tbs/artist/index.html",
        "type": "program",
        "title": "TBS「PLAYLIST」公式バックナンバー一覧"
      },
      {
        "url": "https://www.tbs.co.jp/playlist-tbs/artist/a20200728_01.html",
        "type": "program",
        "title": "PLAYLIST公式「2020年7月のPLAYLIST」＝LOVEページ"
      }
    ]
  },
  {
    "date": "2020-10-03",
    "program": "アイドルのチカラ ＝LOVEスペシャルライブエディション",
    "station": "TBSチャンネル1（CS）",
    "broadcastType": "digest",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "CAMEO",
        "songId": "cameo",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "「君と私の歌」",
        "songId": "kimi-to-watashi-no-uta",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "23:30〜24:00。4/17放送分のライブ部分を再編集した版と考えられる（≠ME版はライブ部分のみの特別編集）。放送曲は未確認。10/10にも放送。",
    "verificationNote": "TBSチャンネル公式で「2020年4月放送回からライブパートのみの特別編集版、CAMEOなど全8曲」と確認。本編（26）の全8曲を収録するので、本編で確認済みの曲はこの版でも放送されたと扱った。 31（10/3）・10/10・32（10/21）は同じ特別編集版（同一内容）の別放送。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/schedule/detail/3327",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: TBSチャンネル1「アイドルのチカラ　＝LOVEスペシャルライブエディション」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/3328",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上（10/10）"
      },
      {
        "url": "https://www.tbs.co.jp/tbs-ch/item/o2456/",
        "type": "broadcaster",
        "title": "TBSチャンネル番組ページ「=LOVE『アイドルのチカラ』スペシャルライブエディション」（ライブパートのみの特別編集、CAMEOなど全8曲）"
      },
      {
        "url": "https://hominis.media/category/idol/post5580/",
        "type": "press",
        "title": "HOMINIS「＝LOVE・齊藤なぎさは自他共に認める小悪魔」（全8曲、＝LOVE/ズルいよ/CAMEOを名指し、野口の「君と私の歌」初披露コメント）"
      },
      {
        "url": "https://thetv.jp/news/detail/230344/",
        "type": "press",
        "title": "ザテレビジョン「＝LOVEが最新シングルのカップリング曲を初披露！」（＝LOVE/ズルいよ/君と私の歌）"
      }
    ]
  },
  {
    "date": "2020-10-21",
    "program": "アイドルのチカラ ＝LOVEスペシャルライブエディション",
    "station": "TBSチャンネル1（CS）",
    "broadcastType": "digest",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "CAMEO",
        "songId": "cameo",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "「君と私の歌」",
        "songId": "kimi-to-watashi-no-uta",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "24:00〜24:30。公式ページの曜日表記は「10月21日（土）」だが2020-10-21は水曜（一覧では水曜扱い）。10/3・10/10と同内容と思われる。",
    "verificationNote": "TBSチャンネル公式で「2020年4月放送回からライブパートのみの特別編集版、CAMEOなど全8曲」と確認。本編（26）の全8曲を収録するので、本編で確認済みの曲はこの版でも放送されたと扱った。 31と同一内容。公式本文「10月21日（土）」と見出し「10.21 WED」が矛盾（2020-10-21は水曜）。10/3・10/10が土23:30枠なので10/24(土)の誤記の可能性もあるが、放送局側の放送日資料が取れず未解決。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": "2020-10-03",
    "sources": [
      {
        "url": "https://equal-love.jp/schedule/detail/3329",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: TBSチャンネル1「アイドルのチカラ　＝LOVEスペシャルライブエディション」"
      },
      {
        "url": "https://www.tbs.co.jp/tbs-ch/item/o2456/",
        "type": "broadcaster",
        "title": "TBSチャンネル番組ページ「=LOVE『アイドルのチカラ』スペシャルライブエディション」（ライブパートのみの特別編集、CAMEOなど全8曲）"
      },
      {
        "url": "https://hominis.media/category/idol/post5580/",
        "type": "press",
        "title": "HOMINIS「＝LOVE・齊藤なぎさは自他共に認める小悪魔」（全8曲、＝LOVE/ズルいよ/CAMEOを名指し、野口の「君と私の歌」初披露コメント）"
      },
      {
        "url": "https://thetv.jp/news/detail/230344/",
        "type": "press",
        "title": "ザテレビジョン「＝LOVEが最新シングルのカップリング曲を初披露！」（＝LOVE/ズルいよ/君と私の歌）"
      }
    ]
  },
  {
    "date": "2020-11-24",
    "program": "PLAYLIST",
    "station": "TBSテレビ",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "深夜1:58〜。公式は「出演」のみ。番組内容は未確認。",
    "verificationNote": "番組公式バックナンバーで出演確定（7月に続く2回目）。曲名は公式に記載がなく、他の資料も見つからない。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/3428",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】TBS「PLAYLIST」※=LOVE"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/3429",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      },
      {
        "url": "https://www.tbs.co.jp/playlist-tbs/artist/index.html",
        "type": "program",
        "title": "TBS「PLAYLIST」公式バックナンバー一覧"
      },
      {
        "url": "https://www.tbs.co.jp/playlist-tbs/artist/a20201124_02.html",
        "type": "program",
        "title": "PLAYLIST公式「2020年11月のPLAYLIST」＝LOVEページ（7月出演回へのリンクあり）"
      }
    ]
  },
  {
    "date": "2020-12-08",
    "program": "月〜金お昼のソングショー ひるソン!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "第888回。公式は出演のみ。直前発売の8thシングルの可能性があるが資料未確認のため空欄。",
    "verificationNote": "公式は12/8(火)11:35〜11:40の出演のみで曲名なし。8th「青春\"サブリミナル\"」の可能性はあるが資料なし。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/3521",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】テレビ東京「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/3520",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/月〜金お昼のソングショー_ひるソン!",
        "type": "fan",
        "title": "Wikipedia「月〜金お昼のソングショー ひるソン!」出演歌手一覧（出演日のみ・曲名なし）"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      }
    ]
  },
  {
    "date": "2020-12-23",
    "program": "スカパー!みんなのファン祭り アイドルクリスマスフェス",
    "station": "BSスカパー!",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "準確認",
    "songs": [
      {
        "title": "僕らの制服クリスマス",
        "songId": "bokura-no-seifuku-christmas",
        "note": null,
        "confidence": "準確認"
      },
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": null,
        "confidence": "準確認"
      },
      {
        "title": "青春\"サブリミナル\"",
        "songId": "seishun-subliminal",
        "note": null,
        "confidence": "準確認"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "19:00〜21:00生放送。共演：つばきファクトリー、26時のマスカレイド、BEYOOOOONDS、ラストアイドル、わーすた。フル尺中心。",
    "verificationNote": "生放送で、出演は放送局番組表・公式・報道で確定。曲はHOMINISの1媒体のみ（3曲）。HOMINISには再放送 2021-02-07(日)22:00〜BSスカパー！の記載もある（別エントリー候補）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/3430",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】BSスカパー！「アイドルクリスマスフェス」※＝LOVE"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/3431",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://hominis.media/category/idol/post6898/",
        "type": "press",
        "title": "HOMINIS「2020年の集大成を魅せる！=LOVE、つばきファクトリーらアイドル6組が夢の共演」"
      },
      {
        "url": "https://natalie.mu/music/news/405692",
        "type": "press",
        "title": "音楽ナタリー「スカパー！生番組に=LOVE、つばき、ニジマス、BEYOOOOONDS、ラスアイ、わーすた」"
      },
      {
        "url": "https://bangumi.skyperfectv.co.jp/S/?uid=c20101063",
        "type": "broadcaster",
        "title": "スカパー!番組表「[生]【生放送】スカパー！みんなのファン祭り アイドルクリスマスフェス」（検索結果で確認）"
      },
      {
        "url": "https://www.tvlife.jp/music/332437",
        "type": "press",
        "title": "TVLIFE 生放送の告知"
      }
    ]
  },
  {
    "date": "2021-07-12",
    "program": "プレミアMelodiX!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "要確認",
    "publish": false,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "桜の咲く音がした",
        "songId": "sakura-no-saku-oto-ga-shita",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "26:35〜（時計上は7/13未明）。MC南海キャンディーズとのトークあり（ファン情報）。公式スケジュール・ニュースには掲載が見つからない。",
    "verificationNote": "ファンブログ2件のみ。番組公式バックナンバーは直近分しか残っておらず、＝LOVE公式にも2021年7月の告知は見つからない。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      },
      {
        "url": "https://ameblo.jp/tanmen2021/entry-12952099968.html",
        "type": "fan",
        "title": "ファンブログ（tanmen2021）MelodiX出演回一覧"
      }
    ]
  },
  {
    "date": "2021-08-06",
    "program": "スカパー!アイドルフェス!〜2021夏〜",
    "station": "BSスカパー!",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "ウィークエンドシトロン",
        "songId": "weekend-citron",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "しゅきぴ",
        "songId": "shukipi",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "Oh!Darling",
        "songId": "oh-darling",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "青春\"サブリミナル\"",
        "songId": "seishun-subliminal",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "19:00〜22:00生放送。共演：≠ME、SKE48、つばきファクトリー、BEYOOOOONDS。曲目はファンまとめのみ（曲順は未確認）。",
    "verificationNote": "生放送で出演確定。Pop'n'Rollの「各4曲」はファンまとめの4曲と数が合うが、曲名はファンまとめのみ。完全版はテレ朝ch1 9/4のほか BSスカパー! 2021-10-20 にも放送（thetv番組ページ）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4289",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】BSスカパー！「スカパー!アイドルフェス！～2021夏～」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4290",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://thetv.jp/program/0001005360/",
        "type": "press",
        "title": "ザテレビジョン 番組ページ（出演者のみ）"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      },
      {
        "url": "https://bangumi.skyperfectv.co.jp/S/?uid=c21323879",
        "type": "broadcaster",
        "title": "スカパー!番組表「[生]【生放送】スカパー! アイドルフェス！～2021夏～」（検索結果で確認）"
      },
      {
        "url": "https://popnroll.tv/articles/19850",
        "type": "press",
        "title": "Pop'n'Roll 完全版放送決定（5組が各4曲を生披露）"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/27103485.html",
        "type": "fan",
        "title": "イコラブ＠プレス 8/6 実況＆セットリスト"
      }
    ]
  },
  {
    "date": "2021-08-31",
    "program": "PLAYLIST",
    "station": "TBSテレビ",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ウィークエンドシトロン",
        "songId": "weekend-citron",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "26:03〜27:13（5分押し）。公式は出演のみ。番組内容は未確認。",
    "verificationNote": "番組公式バックナンバーの＝LOVE欄に曲名「ウィークエンドシトロン」。番組はトーク＋基本フルサイズのスタジオライブだが、同じ回にエド・シーランも曲名付きで載っており、この欄が生歌唱かMV紹介かはページ上で区別されない。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4433",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】TBS「PLAYLIST」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4436",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      },
      {
        "url": "https://www.tbs.co.jp/playlist-tbs/artist/a20210831_01.html",
        "type": "program",
        "title": "PLAYLIST公式「2021年8月のPLAYLIST」＝LOVEページ（曲名欄：ウィークエンドシトロン）"
      }
    ]
  },
  {
    "date": "2021-09-04",
    "program": "スカパー!アイドルフェス!〜2021夏〜【完全版】",
    "station": "テレ朝チャンネル1（CS）",
    "broadcastType": "digest",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "8/6生放送に舞台裏を加えた完全版（15:00〜）。歌唱内容は8/6と同じと考えられるが未確認のため空欄。",
    "verificationNote": "生放送にリハーサル・舞台裏の映像を加えた完全版（Pop'n'Roll）。公式スケジュールの曜日「金」は誤記で、9/4は土曜。曲は8/6と同じと考えられるが資料なし。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4289",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】BSスカパー！「スカパー!アイドルフェス！～2021夏～」（完全版の告知を含む）"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4291",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: テレ朝チャンネル１「スカパー !アイドルフェス！～ 2021夏～ 【完全版】」"
      },
      {
        "url": "https://popnroll.tv/articles/19850",
        "type": "press",
        "title": "Pop'n'Roll『スカパー！アイドルフェス！〜2021夏』完全版放送決定（9/4(土)15:00〜CSテレ朝チャンネル1）"
      }
    ]
  },
  {
    "date": "2021-09-17",
    "program": "MUSIC STATION",
    "station": "テレビ朝日系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ウィークエンドシトロン",
        "songId": "weekend-citron",
        "note": "Mステ用の新衣装",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "初出演（21:00〜21:54生放送）。11人体制。ファンまとめでは指原莉乃もトーク出演。",
    "verificationNote": null,
    "milestone": "Mステ初出演",
    "milestoneConfidence": "確認済み",
    "milestoneSources": [
      {
        "url": "https://x.com/Equal_LOVE_12/status/1438860219925159942",
        "type": "official",
        "title": "＝LOVE公式X：「ミュージックステーション 初出演ありがとうございました」"
      },
      {
        "url": "https://www.oricon.co.jp/news/2207459/full/",
        "type": "press",
        "title": "ORICON：＝LOVE、4年目で『Mステ』初出演"
      },
      {
        "url": "https://www.musicman.co.jp/artist/426947",
        "type": "press",
        "title": "Musicman：初登場のMステで「ウィークエンドシトロン」を披露"
      }
    ],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4482",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】テレビ朝日系「MUSIC STATION」出演決定!"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4483",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: テレビ朝日系「MUSIC STATION」"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1438860219925159942",
        "type": "official",
        "title": "＝LOVE公式X「#ミュージックステーション 初出演ありがとうございました」#ウィークエンドシトロン"
      },
      {
        "url": "https://www.musicman.co.jp/artist/426947",
        "type": "press",
        "title": "Musicman「=LOVE、初登場のMステで指原×フワちゃん作詞の楽曲『ウィークエンドシトロン』を披露」"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/%3DLOVE",
        "type": "fan",
        "title": "Wikipedia「=LOVE」略歴（2021-09-17 MUSIC STATION初出演）"
      }
    ]
  },
  {
    "date": "2021-09-17",
    "program": "バズリズム02",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ウィークエンドシトロン",
        "songId": "weekend-citron",
        "note": "スタジオライブ（ファン情報）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "24:59〜25:59（時計上は9/18未明）。公式は出演のみ告知。曲名はファンまとめのみ。Mステ初出演と同日。",
    "verificationNote": "番組公式の放送内容（バックナンバー）に「スタジオライブ =LOVE『ウィークエンドシトロン』」と明記。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4479",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】日本テレビ系「バズリズム02」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4480",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 日本テレビ系「バズリズム02」"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      },
      {
        "url": "https://www.ntv.co.jp/buzzrhythm/oa/20210917.html",
        "type": "program",
        "title": "バズリズム02 公式 放送内容 2021/9/17（スタジオライブ =LOVE「ウィークエンドシトロン」）"
      }
    ]
  },
  {
    "date": "2021-09-22",
    "program": "月〜金お昼のソングショー ひるソン!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "第1076回。公式・テレビ東京番組表とも出演のみ（曲名なし）。直前発売の9thシングルの可能性があるが未確認のため空欄。",
    "verificationNote": "公式は9/22(水)11:35〜11:40の出演のみ。9th「ウィークエンドシトロン」の可能性は高いが曲名の資料なし。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4476",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】テレビ東京「月～金お昼のソングショー ひるソン！」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4477",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://www.tv-tokyo.co.jp/broad_tvtokyo/program/detail/202109/24488_202109221135.html",
        "type": "broadcaster",
        "title": "テレビ東京 番組情報「ひるソン！【＝ＬＯＶＥ】2021/9/22」"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/月〜金お昼のソングショー_ひるソン!",
        "type": "fan",
        "title": "Wikipedia「月〜金お昼のソングショー ひるソン!」出演歌手一覧（出演日のみ・曲名なし）"
      }
    ]
  },
  {
    "date": "2021-11-21",
    "program": "TOKYO IDOL FESTIVAL 2021 VTR 4時間SP",
    "station": "フジテレビTWO ドラマ・アニメ（CS）／TWOsmart",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "手遅れcaution",
        "songId": "teokure-caution",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "いらない ツインテール",
        "songId": "iranai-twintail",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "Oh!Darling",
        "songId": "oh-darling",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "「君と私の歌」",
        "songId": "kimi-to-watashi-no-uta",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "青春\"サブリミナル\"",
        "songId": "seishun-subliminal",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "夏祭り恋慕う",
        "songId": "natsumatsuri-koishitau",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "20:00〜24:00。2021-10-03 TIF2021 DAY3 HOT STAGE（＝LOVEの持ち時間18:00〜18:30）の放送。曲目は当日のセットリスト（ファンwiki）で、放送でどこまで流れたかは未確認。",
    "verificationNote": "会場のセットリストはザテレビジョンで確認できたが、4時間SPで何曲流れたかは不明。別番組として 12/30(木)23:40〜24:10 フジテレビTWO『TIF2021 DAY3 =LOVE ステージ』があり、局ページに「ステージをフルバージョン、ノーカット」と明記（入力データ未収録の可能性）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4531",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】フジテレビTWO『TOKYO IDOL FESTIVAL 2021 VTR 4時間SP』"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4532",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://www.fujitv-view.jp/article/post-389359/",
        "type": "broadcaster",
        "title": "フジテレビュー!!「TIF2021 放送・配信内容が決定！」"
      },
      {
        "url": "https://equal-love.fandom.com/wiki/Tokyo_Idol_Festival_2021",
        "type": "fan",
        "title": "＝LOVE fandom wiki「Tokyo Idol Festival 2021」セットリスト"
      },
      {
        "url": "https://thetv.jp/news/detail/1053110/p3/",
        "type": "press",
        "title": "WEBザテレビジョン TIF2021 ＝LOVE 10/3 HOT STAGE セットリスト（会場のステージ）"
      }
    ]
  },
  {
    "date": "2021-12-20",
    "program": "プレミアMelodiX!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "The 5th",
        "songId": "the-5th",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "26:50〜27:20（時計上は12/21未明）。諸橋沙夏は収録日にスケジュールの都合で休演し10人でのパフォーマンス（公式告知）。MC南海キャンディーズとのトークあり。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4795",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】テレビ東京「プレミアMelodiX!」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4796",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: テレビ東京「プレミアMelodiX!」"
      },
      {
        "url": "https://www.tv-tokyo.co.jp/melodix_premium/backnumber/202112.html",
        "type": "broadcaster",
        "title": "テレビ東京「プレミアMelodiX!」バックナンバー 2021年12月"
      },
      {
        "url": "http://equallove-2017.blog.jp/archives/28207070.html",
        "type": "fan",
        "title": "イコラブ＠プレス「12/20放送、プレミアMelodiX! で『The 5th』を披露!」"
      }
    ]
  },
  {
    "date": "2021-12-30",
    "program": "めざましライブ 2021完全版",
    "station": "フジテレビTWO（CS）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "ウィークエンドシトロン",
        "songId": "weekend-citron",
        "note": "M1",
        "confidence": "要確認"
      },
      {
        "title": "しゅきぴ",
        "songId": "shukipi",
        "note": "M2",
        "confidence": "要確認"
      },
      {
        "title": "夏祭り恋慕う",
        "songId": "natsumatsuri-koishitau",
        "note": "M3",
        "confidence": "要確認"
      },
      {
        "title": "「部活中に目が合うなって思ってたんだ」",
        "songId": "bukatsuchu-ni-megaau-natte-omotteta-nda",
        "note": "M4",
        "confidence": "要確認"
      },
      {
        "title": "「君と私の歌」",
        "songId": "kimi-to-watashi-no-uta",
        "note": "M5",
        "confidence": "要確認"
      },
      {
        "title": "探せ ダイヤモンドリリー",
        "songId": "sagase-diamond-lily",
        "note": "M6",
        "confidence": "要確認"
      },
      {
        "title": "＝LOVE",
        "songId": "love",
        "note": "M7",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "23:00〜23:40。2021-08-24にアプリ「バーチャル冒険アイランド」で配信された『めざましライブ』のCS放送。曲目は配信時のセットリスト（フジテレビュー!!）で、放送版と同一かは未確認。",
    "verificationNote": "局の番組ページの番組名は『めざましライブ 2021完全版』で、8月のバーチャル配信ライブをCSで初放送し未公開オフショットを追加（出演者に＝LOVE）。7曲は配信時のセットリストで、放送版に全曲入ったかを示す資料がないため要確認。同日23:40〜は別番組『TIF2021 DAY3 =LOVE ステージ』。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4658",
        "type": "official",
        "title": "＝LOVE公式 NEWS: CSフジテレビTWO 『めざましライブ』"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4659",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://www.fujitv-view.jp/article/post-362155/",
        "type": "broadcaster",
        "title": "フジテレビュー!!「＝LOVEには河童がいた！？…」（めざましライブのセットリスト）"
      },
      {
        "url": "http://equallove-2017.blog.jp/archives/27923673.html",
        "type": "fan",
        "title": "イコラブ＠プレス「フジテレビTWOにて、=LOVE出演の『めざましライブ2021』12月30日放送決定!!」"
      },
      {
        "url": "https://otn.fujitv.co.jp/mezamashi21/",
        "type": "broadcaster",
        "title": "フジテレビONE TWO NEXT「めざましライブ 2021完全版」番組ページ"
      }
    ]
  },
  {
    "date": "2021-12-31",
    "program": "CDTV ライブ!ライブ! 年越しスペシャル!2021→2022",
    "station": "TBSテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ズルいよ ズルいね",
        "songId": "zurui-yo-zurui-ne",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "23:45〜。番組名は公式告知の表記（報道では『CDTVスペシャル！年越しプレミアライブ2021→2022』の表記もあり）。ファンまとめでは同番組への初出演。",
    "verificationNote": null,
    "milestone": "CDTV初出演（年越しスペシャル）",
    "milestoneConfidence": "準確認",
    "milestoneSources": [
      {
        "url": "https://equal-love.jp/news/detail/4898",
        "type": "official",
        "title": "【出演情報】TBS「CDTV ライブ!ライブ! 年越しスペシャル!2021→2022」"
      },
      {
        "url": "https://realsound.jp/2020/12/post-682079.html",
        "type": "press",
        "title": "Real Sound：年越しスペシャル2020→2021 出演61組（＝LOVEなし）"
      },
      {
        "url": "https://land-island.com/?page_id=7654",
        "type": "fan",
        "title": "CDTV年越し歴代セットリスト：＝LOVEは2021→2022が最初"
      },
      {
        "url": "https://x.com/equal_maika_121/status/2074491099176108287",
        "type": "fan",
        "title": "ファン：「イコラブちゃんのCDTV初出演はこれかな？」"
      }
    ],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4898",
        "type": "official",
        "title": "＝LOVE公式 NEWS: 【出演情報】TBS「CDTV ライブ!ライブ! 年越しスペシャル!2021→2022」"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/4899",
        "type": "official",
        "title": "＝LOVE公式 SCHEDULE: 同上"
      },
      {
        "url": "https://realsound.jp/2021/12/post-936176.html",
        "type": "press",
        "title": "Real Sound『CDTVスペシャル！年越しプレミアライブ 2021→2022』総勢73組出演者発表"
      },
      {
        "url": "https://utaten.com/specialArticle/index/7140",
        "type": "press",
        "title": "UtaTen【CDTVスペシャル！】年越しプレミアライブ2021→2022のタイムテーブルや出演者"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブ アーカイブ（nix52）「イコラブと音楽番組」"
      }
    ]
  },
  {
    "date": "2022-01-28",
    "program": "smash. presents MUSIC BLOOD",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "準確認",
    "songs": [
      {
        "title": "The 5th",
        "songId": "the-5th",
        "note": "BLOOD STAGE（新曲として披露。TVサイズ）",
        "confidence": "準確認"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "恋するフォーチュンクッキー",
        "with": "AKB48（原曲）",
        "note": null,
        "kind": "cover",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "23:00〜23:30。指原莉乃もトークに出演。",
    "verificationNote": "恋チュンのカバーは報道3件で確定。「The 5th」はORICONのみ明記（マイナビ記事は放送日を「21日」と誤記）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/4972",
        "type": "official",
        "title": "【出演情報】日本テレビ系「smash. presents MUSIC BLOOD」出演決定!"
      },
      {
        "url": "https://www.rbbtoday.com/article/2022/01/29/195681.html",
        "type": "press",
        "title": "イコラブ、『恋するフォーチュンクッキー』をカバー！本家AKBの衣装でパフォーマンス"
      },
      {
        "url": "https://ja.wikipedia.org/wiki/MUSIC_BLOOD",
        "type": "other",
        "title": "MUSIC BLOOD（Wikipedia 放送リスト #43）"
      },
      {
        "url": "https://www.oricon.co.jp/news/2222789/full/",
        "type": "press",
        "title": "ORICON：イコラブ、「恋チュン」を本家AKB48衣装でカバー"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/28527584.html",
        "type": "fan",
        "title": "イコラブ＠プレス：MUSIC BLOOD 実況（髙松瞳の投稿引用あり）"
      },
      {
        "url": "https://news.mynavi.jp/article/20220128-2259273/",
        "type": "press",
        "title": "マイナビニュース：BLOOD SONGはAKB48「恋するフォーチュンクッキー」"
      }
    ]
  },
  {
    "date": "2022-06-20",
    "program": "月～金お昼のソングショー ひるソン！",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "準確認",
    "songs": [
      {
        "title": "あの子コンプレックス",
        "songId": "ano-ko-complex",
        "note": "5分番組",
        "confidence": "準確認"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "11:35〜11:40。曲名は放送当日のメンバー（齊藤なぎさ）のX投稿による（ファンまとめ経由で確認）。",
    "verificationNote": "出演は公式で確定。曲名はメンバー本人の当日投稿（ファンまとめに埋め込まれた本文で確認、放送前の予告）による準確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/5487",
        "type": "official",
        "title": "【出演情報】テレビ東京「月～金お昼のソングショー ひるソン！」=LOVE出演決定！"
      },
      {
        "url": "http://equallove-2017.blog.jp/archives/29519632.html",
        "type": "fan",
        "title": "6/20放送、ひるソン！『あの子コンプレックス』披露! 実況など…"
      }
    ]
  },
  {
    "date": "2022-07-10",
    "program": "Love music",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "あの子コンプレックス",
        "songId": "ano-ko-complex",
        "note": "ファン記録のみ。同曲は同番組7月度オープニングテーマ。他の曲も歌った可能性あり",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "24:30〜（日付上は7/11 0:30。Wikipediaの放送リストは7月11日表記）。LIVEゲスト出演（公式）。披露曲は公式・報道で未確認。",
    "verificationNote": "出演は公式で確定、曲はファン記録のみ。番組表上の日付は7/10（24:30＝7/11 0:30）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/5514",
        "type": "official",
        "title": "【出演情報】フジテレビ系「Love music」※＝LOVE（LIVEゲスト出演）"
      },
      {
        "url": "https://equal-love.jp/news/detail/5516",
        "type": "official",
        "title": "「あの子コンプレックス」が7月度オープニングテーマに決定"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブと音楽番組memo"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1538484237350760448",
        "type": "official",
        "title": "＝LOVE公式X：「Love music」LIVEゲスト出演告知"
      }
    ]
  },
  {
    "date": "2022-09-26",
    "program": "プレミアMelodiX!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "準確認",
    "songs": [
      {
        "title": "Be Selfish",
        "songId": "be-selfish",
        "note": "TV初披露。ショートver.",
        "confidence": "準確認"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "26:50〜27:20（日付上は9/27未明）。トーク＆歌唱。曲名はメンバー投稿・ファン記録による。",
    "verificationNote": "出演は公式で確定。曲はメンバー本人の投稿（ファンまとめ経由で本文確認）とファン記録で準確認のまま。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/5807",
        "type": "official",
        "title": "【出演情報】テレビ東京「プレミアMelodiX!」"
      },
      {
        "url": "https://ameblo.jp/tanmen2021/entry-12766490717.html",
        "type": "fan",
        "title": "=LOVE / Be Selfish (9月26日 プレミアMelodiX! ショートver.)"
      },
      {
        "url": "http://equallove-2017.blog.jp/archives/30376881.html",
        "type": "fan",
        "title": "9/26放送、プレミアMelodiX!「=LOVE トーク＆歌唱」見逃し配信スタート"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/30376881.html",
        "type": "fan",
        "title": "イコラブ＠プレス：大場花菜・野口衣織の投稿「テレビでBe Selfish初披露」を引用"
      }
    ]
  },
  {
    "date": "2022-10-14",
    "program": "歌のサンセット（第1回）",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "Be Selfish",
        "songId": "be-selfish",
        "note": "ファン記録のみ",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "17:30〜17:55。番組初回。大谷映美里は体調不良で欠席（公式）。",
    "verificationNote": "出演は公式で確定、曲はファン記録のみ。「第1回」は今回の調査で裏付けを取れていない。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/5930",
        "type": "official",
        "title": "【出演情報】テレビ東京「歌のサンセット」=LOVE出演決定！"
      },
      {
        "url": "https://www.tv-tokyo.co.jp/broad_tvtokyo/program/detail/202210/27238_202210141730.html",
        "type": "broadcaster",
        "title": "歌のサンセット 2022/10/14 番組ページ（出演者のみ）"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブと音楽番組memo"
      }
    ]
  },
  {
    "date": "2022-10-29",
    "program": "MUSIC FAIR",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "Be Selfish",
        "songId": "be-selfish",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "18:00〜18:30。初出演。トークあり。同回ゲスト：THE ALFEE、蒼井翔太、SixTONES。",
    "verificationNote": "番組公式Xで曲名まで確定。入力のOTOTOY出典URLは404なので差し替え推奨。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": "これより前の出演記録は見つかっていない（「初出演」と書いた公式・報道は未確認）",
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/5952",
        "type": "official",
        "title": "【出演情報】フジテレビ系「MUSIC FAIR」=LOVEの出演が決定！"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブと音楽番組memo"
      },
      {
        "url": "https://x.com/MUSICFAIR_Fuji/status/1583752520488259585",
        "type": "broadcaster",
        "title": "MUSIC FAIR公式X：10/29放送ゲスト4組と曲目（Be Selfish）"
      },
      {
        "url": "https://aramajapan.com/news/tvmovie/musicaward-show/sixtones-love-and-more-perform-on-music-fair-for-october-29/119931/",
        "type": "press",
        "title": "ARAMA! JAPAN：10/29 MUSIC FAIR 出演者と曲目"
      }
    ]
  },
  {
    "date": "2022-11-23",
    "program": "テレ東音楽祭2022冬 ～思わず歌いたくなる！最強ヒットソング100連発～",
    "station": "テレビ東京系（6局ネット）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "あの子コンプレックス",
        "songId": "ano-ko-complex",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "17:30〜21:54、＝LOVEは18時台。同番組初登場（ナタリー）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/6009",
        "type": "official",
        "title": "【出演情報】テレ東音楽祭2022冬 ※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/502433",
        "type": "press",
        "title": "今夜放送「テレ東音楽祭」タイムテーブル公開"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1595348119650455552",
        "type": "official",
        "title": "＝LOVE_official X（本日披露した「#あの子コンプレックス」… #テレ東音楽祭）"
      }
    ]
  },
  {
    "date": "2022-12-14",
    "program": "2022FNS歌謡祭 第2夜",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "あの子コンプレックス",
        "songId": "ano-ko-complex",
        "note": "21時台",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "真冬の帰り道",
        "with": "広瀬香美",
        "note": null,
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "18:30〜23:03 生放送。前々日・前日の「FNS歌謡祭直前SP」はコメント出演のみ（対象外）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/5996",
        "type": "official",
        "title": "【出演情報】フジテレビ系列「2022FNS 歌謡祭 第2夜」※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/504984",
        "type": "press",
        "title": "今夜放送「FNS歌謡祭」第2夜のタイムテーブル＆歌唱曲発表"
      }
    ]
  },
  {
    "date": "2022-12-31",
    "program": "CDTV ライブ！ライブ！年越しスペシャル！2022→2023",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "青春\"サブリミナル\"",
        "songId": "seishun-subliminal",
        "note": "MV衣装で披露（佐々木舞香の投稿）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "23:45〜翌5:00。＝LOVEは27時台「2023年 最初のフェスSP」＝実際の披露は2023-01-01 3時頃。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/6128",
        "type": "official",
        "title": "【出演情報】TBS「CDTV ライブ！ライブ！年越しスペシャル！2022→2023」※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/507322",
        "type": "press",
        "title": "年越し「CDTV」5時間超えのタイムテーブル公開"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1609263967335231488",
        "type": "official",
        "title": "＝LOVE_official X（出演報告 #青春サブリミナル）"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/31203760.html",
        "type": "fan",
        "title": "CDTV年越しSP！2022→2023『青春”サブリミナル”』披露! 実況など"
      }
    ]
  },
  {
    "date": "2023-02-18",
    "program": "Venue101",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "この空がトリガー",
        "songId": "kono-sora-ga-trigger",
        "note": "TVサイズ（超ショート）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "ビートDEトーヒ",
        "with": "（ハマいく原曲）佐々木舞香・野口衣織",
        "note": null,
        "kind": "cover",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "23:00〜23:30 生放送。初出演。",
    "verificationNote": null,
    "milestone": "Venue101初出演",
    "milestoneConfidence": "確認済み",
    "milestoneSources": [
      {
        "url": "https://natalie.mu/music/news/513489",
        "type": "press",
        "title": "音楽ナタリー：＝LOVE初登場の「Venue101」今夜放送"
      },
      {
        "url": "https://lp.p.pia.jp/article/news/263490/index.html",
        "type": "press",
        "title": "ぴあ：＝LOVE初登場の「Venue101」今夜放送"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1622158086994817026",
        "type": "official",
        "title": "＝LOVE公式X：「この空がトリガー」を披露"
      }
    ],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/6346",
        "type": "official",
        "title": "【出演情報】NHK「Venue101」に=LOVEの出演が決定！（「この空がトリガー」を披露）"
      },
      {
        "url": "https://natalie.mu/music/news/513489",
        "type": "press",
        "title": "＝LOVE初登場の「Venue101」今夜放送"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1626960490512666630",
        "type": "official",
        "title": "＝LOVE_official X（佐々木・野口がカバーしたハマいくさんの『ビートDEトーヒ』）"
      }
    ]
  },
  {
    "date": "2023-02-24",
    "program": "歌のサンセット",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "この空がトリガー",
        "songId": "kono-sora-ga-trigger",
        "note": "ファン記録のみ",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "17:30〜17:55（放送予定として告知）。第10回。",
    "verificationNote": "出演は公式で確定、曲はファン記録のみ。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/6301",
        "type": "official",
        "title": "【出演情報】テレビ東京「歌のサンセット」=LOVE出演決定！"
      },
      {
        "url": "http://equallove-2017.blog.jp/archives/31546645.html",
        "type": "fan",
        "title": "2/24放送のテレビ東京「歌のサンセット」に、＝LOVE が出演！（関連記事『この空がトリガー』披露）"
      },
      {
        "url": "https://ameblo.jp/tanmen2021/entry-12790912301.html",
        "type": "fan",
        "title": "=LOVE / この空がトリガー 2/24 歌のサンセット ショートバージョン（歌割）"
      }
    ]
  },
  {
    "date": "2023-03-18",
    "program": "SHIONOGI MUSIC FAIR",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "この空がトリガー",
        "songId": "kono-sora-ga-trigger",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "18:00〜18:30。トークあり。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/6493",
        "type": "official",
        "title": "【出演情報】フジテレビ系「MUSIC FAIR」=LOVEの出演が決定！"
      },
      {
        "url": "https://natalie.mu/music/news/517142",
        "type": "press",
        "title": "明日「MUSIC FAIR」にスカパラ feat. 長屋晴子、JUJU、＝LOVE、Snow Manが登場"
      }
    ]
  },
  {
    "date": "2023-07-21",
    "program": "バズリズム02",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ナツマトペ",
        "songId": "natsumatope",
        "note": "スタジオライブ",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "25:49〜26:49（日付上は7/22未明）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/6923",
        "type": "official",
        "title": "【出演情報】日本テレビ系「バズリズム02」※＝LOVE（新曲「ナツマトぺ」を披露）"
      },
      {
        "url": "https://natalie.mu/music/news/533757",
        "type": "press",
        "title": "工藤静香が今夜「バズリズム02」で料理トーク　スタジオライブにキタニタツヤ、＝LOVE、CENT"
      }
    ]
  },
  {
    "date": "2023-08-14",
    "program": "プレミアMelodiX!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ナツマトペ",
        "songId": "natsumatope",
        "note": "ショートver.",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "26:50〜27:20（日付上は8/15未明）。トークあり。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7052",
        "type": "official",
        "title": "【出演情報】テレビ東京「プレミアMelodiX!」※＝LOVE（「ナツマトぺ」を披露）"
      },
      {
        "url": "https://ameblo.jp/tanmen2021/entry-12816343335.html",
        "type": "fan",
        "title": "=LOVE / ナツマトベ 8/14 プレミアMelodiX! ショートver. 歌割"
      }
    ]
  },
  {
    "date": "2023-09-04",
    "program": "CDTVライブ！ライブ！2時間スペシャル",
    "station": "TBS",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ナツマトペ",
        "songId": "natsumatope",
        "note": "フルサイズでTV初歌唱",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "19:00〜21:00 生放送。プロデューサー指原莉乃も出演。月曜の通常回への出演はこれが初とみられる（年越しSPには2021→2022から出演済み）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7091",
        "type": "official",
        "title": "【出演情報】TBS『「CDTVライブ！ライブ！」2時間スペシャル』※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/536900",
        "type": "press",
        "title": "「CDTVライブ」に菅田将暉、Snow Man、なにわ男子、＝LOVE、指原莉乃"
      }
    ]
  },
  {
    "date": "2023-10-13",
    "program": "歌のサンセット",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "ナツマトペ",
        "songId": "natsumatope",
        "note": "ファン記録のみ。ショートver.",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "17:30〜17:55。第25回。齋藤樹愛羅は収録日スケジュールの都合で休演、9人で出演（公式）。",
    "verificationNote": "出演と9人出演は公式で確定、曲はファン記録のみ。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7286",
        "type": "official",
        "title": "【出演情報】テレビ東京「歌のサンセット」=LOVE出演決定！"
      },
      {
        "url": "https://ameblo.jp/tanmen2021/entry-12824471550.html",
        "type": "fan",
        "title": "=LOVE / ナツマトベ 23/10/13 歌のサンセット 樹愛羅休演9人のショートver."
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/33397759.html",
        "type": "fan",
        "title": "10/13放送のテレビ東京「歌のサンセット」に、＝LOVE が出演！"
      }
    ]
  },
  {
    "date": "2023-10-17",
    "program": "あのちゃんの電電電波♪",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ナツマトペ",
        "songId": "natsumatope",
        "note": "庭で披露（番組ページ）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "26:00〜26:30（日付上は10/18未明）。音楽バラエティ内のパフォーマンス。ファンの記録（ameblo nix52）では11/17と誤記されている。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7377",
        "type": "official",
        "title": "【出演情報】テレビ東京「あのちゃんの電電電波♪」＝LOVE出演決定！"
      },
      {
        "url": "https://www.tv-tokyo.co.jp/dendendenpa/lineup/202310/27545_202310172600.html",
        "type": "broadcaster",
        "title": "あのちゃんの電電電波♪ 反抗期モードで裏イコラブ解禁！（2023/10/17）"
      },
      {
        "url": "https://x.com/tx_dendendenpa/status/1714191013039022367",
        "type": "broadcaster",
        "title": "番組公式X（「#ナツマトペ」披露）"
      }
    ]
  },
  {
    "date": "2023-10-28",
    "program": "CDTVライブ！ライブ！フェスティバル！2023（放送）",
    "station": "CS TBSチャンネル1",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [
      {
        "title": "ズルいよ ズルいね（アコースティック）",
        "with": "AKB48・≠ME（選抜メンバー）",
        "note": "会場公演でのコラボ。放送された範囲は未確認",
        "kind": "collab",
        "confidence": "要確認"
      },
      {
        "title": "恋するフォーチュンクッキー",
        "with": "AKB48・≠ME（全員）",
        "note": "会場公演でのコラボ。放送された範囲は未確認",
        "kind": "cover",
        "confidence": "要確認"
      }
    ],
    "notes": "14:00〜17:00。2023-09-16 東京ガーデンシアター公演（Day1）の放送。会場では11曲を披露（PR TIMES）が、放送でどの曲が流れたかは未確認のため songs は空。",
    "verificationNote": "出演（放送）は公式で確定。会場でのコラボ（AKB48・≠ME）は会場の記録で、放送されたかは要確認のまま。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7381",
        "type": "official",
        "title": "【出演情報】CS放送TBSチャンネル1「CDTVライブ！ライブ！フェスティバル！2023」※＝LOVE"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000003888.000013546.html",
        "type": "press",
        "title": "本日「ＣＤＴＶライブ！ライブ！フェスティバル２０２３」に出演！（ソニー・ミュージック発表、会場セットリスト）"
      }
    ]
  },
  {
    "date": "2023-11-15",
    "program": "テレ東60祭！ミュージックフェスティバル2023 〜一生聞きたい！昭和・平成・令和ヒット曲100連発〜",
    "station": "テレビ東京系（6局）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ラストノートしか知らない",
        "songId": "last-note-shika-shiranai",
        "note": "発売前のTV披露",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "17:30〜21:54 生放送（一部事前収録）。＝LOVEは18時台。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7448",
        "type": "official",
        "title": "【出演情報】テレビ東京「テレ東60祭！ミュージックフェスティバル2023」＝LOVE出演決定！"
      },
      {
        "url": "https://natalie.mu/music/news/549078",
        "type": "press",
        "title": "「テレ東60祭Mフェス」タイムテーブル発表"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000003966.000013546.html",
        "type": "press",
        "title": "「ラストノートしか知らない」初日1位（ソニー・ミュージック発表。発売前にテレ東60祭・CDTV等で披露と記載）"
      },
      {
        "url": "https://puranote.net/tvtokyo-musicfestival2023-setlist/",
        "type": "fan",
        "title": "テレ東60祭 セットリストまとめ"
      }
    ]
  },
  {
    "date": "2023-11-20",
    "program": "CDTVライブ！ライブ！2時間スペシャル",
    "station": "TBS",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ラストノートしか知らない",
        "songId": "last-note-shika-shiranai",
        "note": "フルサイズでTV初披露",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "19:00〜21:00 生放送。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7564",
        "type": "official",
        "title": "【出演情報】TBS『「CDTVライブ！ライブ！」2時間スペシャル』※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/548884",
        "type": "press",
        "title": "「CDTV」2時間SPになにわ男子、A.B.C-Z、＝LOVE…追加"
      }
    ]
  },
  {
    "date": "2023-11-27",
    "program": "プレミアMelodiX!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "ラストノートしか知らない",
        "songId": "last-note-shika-shiranai",
        "note": "ファン記録のみ",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "26:50〜27:20（日付上は11/28未明）。トーク部分含め約12分（ファン記録）。",
    "verificationNote": "出演は公式で確定、曲はファン記録のみ（発売2日前の放送で可能性は高い）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7604",
        "type": "official",
        "title": "【出演情報】テレビ東京「プレミアMelodiX!」※＝LOVE"
      },
      {
        "url": "https://ameblo.jp/tanmen2021/entry-12952099968.html",
        "type": "fan",
        "title": "プレミアMelodiX! イコノイジョイ出演回一覧（⑦）"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブと音楽番組memo"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/7605",
        "type": "official",
        "title": "公式スケジュール：プレミアMelodiX!"
      }
    ]
  },
  {
    "date": "2023-12-13",
    "program": "2023 FNS歌謡祭 第2夜",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ラストノートしか知らない",
        "songId": "last-note-shika-shiranai",
        "note": "21時台",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "18:30〜23:03 生放送。＝LOVEのコラボ企画は確認できず。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7574",
        "type": "official",
        "title": "【出演情報】フジテレビ系列「2023 FNS歌謡祭 第2夜」※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/552780",
        "type": "press",
        "title": "「FNS歌謡祭」第2夜タイムテーブル発表"
      },
      {
        "url": "https://www.oricon.co.jp/news/2306406/full/",
        "type": "press",
        "title": "今夜放送『FNS歌謡祭』第2夜タイムテーブル＆全曲発表"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1733679175985164739",
        "type": "official",
        "title": "＝LOVE_official X（『ラストノートしか知らない』を歌唱）"
      }
    ]
  },
  {
    "date": "2023-12-31",
    "program": "CDTVライブ！ライブ！年越しスペシャル2023→2024",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ラストノートしか知らない",
        "songId": "last-note-shika-shiranai",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "23:45〜翌5:00 生放送。＝LOVEは26時台＝実際の披露は2024-01-01 2時頃。≠ME・≒JOYも同夜出演（3グループ初）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/7683",
        "type": "official",
        "title": "【出演情報】TBS「CDTVライブ！ライブ！年越しスペシャル2023→2024」※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/555423",
        "type": "press",
        "title": "年越し「CDTV」タイムテーブル公開"
      },
      {
        "url": "https://x.com/TBSCDTV/status/1741505495121252386",
        "type": "broadcaster",
        "title": "CDTV公式X（このあとは＝LOVEが登場「ラストノートしか知らない」を披露）"
      }
    ]
  },
  {
    "date": "2024-03-11",
    "program": "CDTVライブ！ライブ！2時間スペシャル",
    "station": "TBS",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "呪って呪って",
        "songId": "norotte-norotte",
        "note": "フルサイズでTV初披露",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "19:00〜21:00。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/8264",
        "type": "official",
        "title": "【出演情報】TBS『「CDTVライブ！ライブ！」２時間スペシャル』※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/562642",
        "type": "press",
        "title": "「CDTV」に大泉洋初登場！次回2時間SPにイコラブ…"
      }
    ]
  },
  {
    "date": "2024-03-15",
    "program": "バズリズム02",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "呪って呪って",
        "songId": "norotte-norotte",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "青春\"サブリミナル\"",
        "songId": "seishun-subliminal",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "24:59〜25:59（日付上は3/16未明）。メインゲスト。公開収録（公式に観覧募集あり）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/8303",
        "type": "official",
        "title": "【出演情報】日本テレビ系「バズリズム02」※＝LOVE（「呪って呪って」「青春”サブリミナル”」をパフォーマンス）"
      },
      {
        "url": "https://equal-love.jp/news/detail/8231",
        "type": "official",
        "title": "日本テレビ「バズリズム02」公開収録観覧ご招待のお知らせ"
      }
    ]
  },
  {
    "date": "2024-05-06",
    "program": "プレミアMelodiX!",
    "station": "テレビ東京",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "呪って呪って",
        "songId": "norotte-norotte",
        "note": "ファン記録のみ",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "26:50〜27:20（日付上は5/7未明）。スタジオトークあり（6名、ファン記録）。",
    "verificationNote": "出演は公式で確定、曲はファン記録のみ。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/8420",
        "type": "official",
        "title": "【出演情報】テレビ東京「プレミアMelodiX!」※＝LOVE"
      },
      {
        "url": "https://ameblo.jp/tanmen2021/entry-12952099968.html",
        "type": "fan",
        "title": "プレミアMelodiX! イコノイジョイ出演回一覧（⑨）"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブと音楽番組memo"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1782756309160341635",
        "type": "official",
        "title": "＝LOVE公式X：5/6(月) 26:50〜 出演告知（曲名なし）"
      }
    ]
  },
  {
    "date": "2024-06-26",
    "program": "テレビ東京開局60周年特別企画 テレ東ミュージックフェス2024夏",
    "station": "テレビ東京系（6局）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": "TV初披露（発売前）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "17:30〜21:54、＝LOVEは18時台。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/8571",
        "type": "official",
        "title": "【出演情報】テレ東ミュージックフェス2024夏 ※＝LOVE（【歌唱曲】絶対アイドル辞めないで）"
      },
      {
        "url": "https://natalie.mu/music/news/579353",
        "type": "press",
        "title": "「テレ東ミュージックフェス」タイムテーブル公開"
      }
    ]
  },
  {
    "date": "2024-08-21",
    "program": "週刊ナイナイミュージック お台場冒険SP LIVE",
    "station": "フジテレビ",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": "ファン記録のみ",
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "23:00〜23:40。2024-08-07 お台場冒険王 ISLAND♡STADIUMでの公開収録。※2024-02-14の同番組はコメント出演のみ（対象外）。",
    "verificationNote": "出演は公式で確定。公開収録の映像を使った回で、放送曲はファン記録のみ。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/8777",
        "type": "official",
        "title": "【出演情報】フジテレビ「週刊ナイナイミュージックお台場冒険SP LIVE」※＝LOVE"
      },
      {
        "url": "https://equal-love.jp/news/detail/8712",
        "type": "official",
        "title": "「週刊ナイナイミュージック」の公開収録に＝LOVEの出演が決定"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12889087208.html",
        "type": "fan",
        "title": "イコラブと音楽番組memo"
      },
      {
        "url": "https://equal-love.jp/schedule/detail/8778",
        "type": "official",
        "title": "公式スケジュール：同番組"
      }
    ]
  },
  {
    "date": "2024-09-30",
    "program": "CDTVライブ！ライブ！",
    "station": "TBS",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": "フルサイズでTV初披露",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "18:30〜21:00（3時間SP枠）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/8958",
        "type": "official",
        "title": "【出演情報】TBS「CDTVライブ！ライブ！」※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/592161",
        "type": "press",
        "title": "「CDTV」に中島健人のHITOGOTO、日向坂46、Perfume…"
      }
    ]
  },
  {
    "date": "2024-12-31",
    "program": "CDTV ライブ！ライブ！年越しスペシャル！2024→2025",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": "メドレー企画「2025 新春かわいいメドレー」内（年明け後の時間帯）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "2025 新春かわいいメドレー",
        "with": "CUTIE STREET、超ときめき♡宣伝部、≠ME、FRUITS ZIPPER ほか（アイドル5組）",
        "note": "各組が自分の曲を歌うリレー形式。合同歌唱ではない",
        "kind": "medley",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "23:45〜 生放送。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/9451",
        "type": "official",
        "title": "【出演情報】TBS「CDTV ライブ！ライブ！年越しスペシャル！2024→2025」※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/606044",
        "type": "press",
        "title": "「CDTV ライブ！ライブ！年越しスペシャル」タイムテーブル公開"
      },
      {
        "url": "https://land-island.com/?page_id=7654",
        "type": "fan",
        "title": "CDTV年越し 歴代セットリスト"
      }
    ]
  },
  {
    "date": "2025-03-01",
    "program": "Venue101",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/9636",
        "type": "official",
        "title": "【出演情報】NHK「Venue101」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-03-05",
    "program": "週刊ナイナイミュージック",
    "station": "フジテレビ",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/9638",
        "type": "official",
        "title": "【出演情報】フジテレビ「週刊ナイナイミュージック」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-03-14",
    "program": "バズリズム02",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "25:09〜の深夜放送（表記は番組上の放送日）。地域により放送日時が異なる。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/9644",
        "type": "official",
        "title": "【出演情報】日本テレビ系「バズリズム02」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-03-29",
    "program": "MUSIC FAIR",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "How many いい顔",
        "with": "郷ひろみ",
        "note": "郷ひろみ×＝LOVE のコラボ（郷ひろみの楽曲）",
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "公式告知に曲名なし。曲目は報道1件＋ファンブログによる。",
    "verificationNote": "＝LOVE公式の放送後投稿で2曲とも確定（準確認→確認済み）。郷ひろみとのコラボ曲は郷ひろみの楽曲。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/9714",
        "type": "official",
        "title": "【出演情報】フジテレビ系「MUSIC FAIR」※＝LOVE"
      },
      {
        "url": "https://news.goo.ne.jp/article/ggtnews/entertainment/ggtnews-zoo61.html",
        "type": "press",
        "title": "3.29「MUSIC FAIR」今夜放送！出演者＆披露曲一覧（ググットニュース）"
      },
      {
        "url": "https://ameblo.jp/tanmen2021/entry-12891841158.html",
        "type": "fan",
        "title": "3/29 フジTV MUSIC FAIR ＝LOVE / 『とくべチュ、して』歌割"
      },
      {
        "url": "https://www.tiktok.com/@equal_love_12/video/7487169621963918647",
        "type": "official",
        "title": "＝LOVE公式TikTok：MUSIC FAIR出演報告（とくべチュ、して／郷ひろみと How many いい顔）"
      },
      {
        "url": "https://jpfiles.se/japanese/japanese-tv-music/music-fair-2025-03-29",
        "type": "other",
        "title": "JPFILES：2025-03-29 MUSIC FAIR 曲目（M2 とくべチュ、して）"
      }
    ]
  },
  {
    "date": "2025-04-27",
    "program": "SBS人気歌謡 UNICON in 東京ドーム（INGALIVE \"UNI-CON\" in TOKYO DOME powered by SBS INKIGAYO）",
    "station": "SBS（韓国）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "海外放送。東京ドーム公演（2025-04-13）の模様。公演では「絶対アイドル辞めないで」も歌ったが、放送は「とくべチュ、して」のみと公式告知。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/9914",
        "type": "official",
        "title": "【出演情報】SBS「SBS人気歌謡UNICON in 東京ドーム」※＝LOVE"
      },
      {
        "url": "https://e.usen.com/news/news-event/loveingalive-uni-con-in-tokyo-dome-powered-by-sbs-inkigayo.html",
        "type": "press",
        "title": "USEN：＝LOVE、「INGALIVE \"UNI-CON\" in TOKYO DOME powered by SBS INKIGAYO」に出演！"
      }
    ]
  },
  {
    "date": "2025-05-12",
    "program": "CDTVライブ！ライブ！",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": "フルサイズ（フルサイズでのTV初披露）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/9934",
        "type": "official",
        "title": "【出演情報】TBS「CDTV ライブ！ライブ！」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-05-23",
    "program": "ミュージックステーション 2時間スペシャル",
    "station": "テレビ朝日系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/9954",
        "type": "official",
        "title": "【出演情報】テレビ朝日系「ミュージックステーション 2時間スペシャル」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-07-02",
    "program": "週刊ナイナイミュージックプレゼンツ FNS後夜祭",
    "station": "フジテレビ",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "生放送。番組公式Xが歌唱曲を事前発表。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10018",
        "type": "official",
        "title": "【出演情報】フジテレビ「週刊ナイナイミュージックプレゼンツ FNS後夜祭」※＝LOVE"
      },
      {
        "url": "https://x.com/99music_fujitv/status/1940002447810076771",
        "type": "broadcaster",
        "title": "週刊ナイナイミュージック公式X：歌唱曲解禁"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/38879064.html",
        "type": "fan",
        "title": "イコラブ＠プレス：FNS後夜祭『とくべチュ、して』披露！実況まとめ"
      }
    ]
  },
  {
    "date": "2025-07-07",
    "program": "CDTVライブ！ライブ！",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": "フルサイズ（おかわりライブ）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10049",
        "type": "official",
        "title": "【出演情報】TBS系「CDTV ライブ！ライブ！」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-07-25",
    "program": "バズリズム02",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "25:09〜の深夜放送。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10097",
        "type": "official",
        "title": "【出演情報】日本テレビ系「バズリズム02」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-08-01",
    "program": "コネクト スペシャル「いのちのうたフェス2025 平和がいいに決まっている！」",
    "station": "NHK総合（中国地方向け）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2025-07-18 広島国際会議場フェニックスホールで公開収録。8/3に中国・九州沖縄地方向け、8/6深夜（8/7 1:25〜）に全国放送あり。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/9968",
        "type": "official",
        "title": "【出演情報】「いのちのうたフェス２０２５ 平和がいいに決まっている！」に＝LOVEの出演が決定！"
      },
      {
        "url": "https://www.web.nhk/tv/pl/series-tep-L1Z6VNNQ6P/ep/83853NNNJP",
        "type": "broadcaster",
        "title": "NHK番組ページ：いのちのうたフェス2025 平和がいいに決まっている！"
      },
      {
        "url": "https://www.musicvoice.jp/news/297086/",
        "type": "press",
        "title": "MusicVoice：NHK「いのちのうたフェス2025」未公開・歌唱パフォーマンスを放送"
      }
    ]
  },
  {
    "date": "2025-08-22",
    "program": "いのちのうたフェス2025【延長戦】",
    "station": "NHK総合（中国地方向け）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": "本編に入らなかった歌唱を全編放送",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "8/23 朝に再放送（中国地方向け）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": true,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10210",
        "type": "official",
        "title": "【出演情報】NHK総合（中国地方向け）「いのちのうたフェス２０２５ 【延長戦】 平和がいいに決まっている！」※＝LOVE"
      },
      {
        "url": "https://www.musicvoice.jp/news/297086/",
        "type": "press",
        "title": "MusicVoice：NHK「いのちのうたフェス2025」未公開・歌唱パフォーマンスを放送"
      }
    ]
  },
  {
    "date": "2025-08-22",
    "program": "ミュージックステーション",
    "station": "テレビ朝日系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      },
      {
        "title": "内緒バナシ",
        "songId": "naisho-banashi",
        "note": "スペシャルメドレー（新曲）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10233",
        "type": "official",
        "title": "【出演情報】テレビ朝日系「ミュージックステーション」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-08-26",
    "program": "うたコン",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10239",
        "type": "official",
        "title": "【出演情報】NHK「うたコン」 ※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-09-06",
    "program": "with MUSIC",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": "テレビ初披露",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "番組初出演。公式告知に曲名なし、放送後の公式Xで曲名を確認。",
    "verificationNote": null,
    "milestone": "with MUSIC初出演",
    "milestoneConfidence": "確認済み",
    "milestoneSources": [
      {
        "url": "https://x.com/ntv_withmusic/status/1963919918120010151",
        "type": "broadcaster",
        "title": "with MUSIC公式X：＝LOVE 初出演＆最新曲を披露"
      }
    ],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10279",
        "type": "official",
        "title": "【出演情報】日本テレビ系「with MUSIC」※＝LOVE"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1964326689883750615",
        "type": "official",
        "title": "＝LOVE公式X：『ラブソングに襲われる』をテレビ初披露"
      },
      {
        "url": "https://equallove-2017.blog.jp/archives/39247998.html",
        "type": "fan",
        "title": "イコラブ＠プレス：『with MUSIC』新曲“ラブソングに襲われる”TV初披露！実況まとめ"
      }
    ]
  },
  {
    "date": "2025-09-27",
    "program": "MUSIC FAIR",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": "スペシャルメドレー（新曲）",
        "confidence": "確認済み"
      },
      {
        "title": "内緒バナシ",
        "songId": "naisho-banashi",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "秋のニッポンお祭りメドレー：お祭りマンボ（美空ひばり）／長く短い祭（椎名林檎）／まつり（藤井風）／まつり（北島三郎）",
        "with": "山内惠介",
        "note": "公式告知の表記は「山内恵介」",
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10379",
        "type": "official",
        "title": "【出演情報】フジテレビ系「MUSIC FAIR」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-09-29",
    "program": "CDTVライブ！ライブ！ 3時間スペシャル",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "超特急逃走中",
        "songId": "chotokkyu-tousouchu",
        "note": "メドレー",
        "confidence": "確認済み"
      },
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": "メドレー（新曲）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10377",
        "type": "official",
        "title": "【出演情報】TBS系「CDTV ライブ！ライブ！」3時間スペシャル※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-10-10",
    "program": "バズリズム02",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "25:39〜の深夜放送（表記は番組上の放送日）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10601",
        "type": "official",
        "title": "【出演情報】日本テレビ系「バズリズム02」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-10-10",
    "program": "音道楽√「イナズマロック フェス 2025」SP前編",
    "station": "読売テレビ（関西ローカル）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "25:15〜。2025-09-20 イナズマロック フェス 2025 DAY1（雷神STAGE）の映像。＝LOVE の出演は番組公式X・番組表で確認できたが、放送された曲は未確認（ファンのメモでは「ラブソングに襲われる」）。中京テレビで10/21深夜にも放送。",
    "verificationNote": "出演は番組公式Xで確定。放送曲は未確認（会場のセットリストは放送の証明にならない。ファンのメモの「ラブソングに襲われる」も裏付けなし）。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://inazumarock.com/2025/cms/news/472/",
        "type": "broadcaster",
        "title": "イナズマロック フェス公式：読売テレビ「音道楽√」にて「イナズマロック フェス 2025」スペシャル 二週連続オンエア！"
      },
      {
        "url": "https://x.com/otodoraku/status/1976618716738490768",
        "type": "broadcaster",
        "title": "音道楽√公式X：今夜の音道楽は『イナズマロック フェス2025』SP前編（#イコラブ）"
      },
      {
        "url": "https://thetv.jp/program/0001049308/65/",
        "type": "press",
        "title": "WEBザテレビジョン番組表：音道楽√「イナズマロック フェスSP前編」"
      },
      {
        "url": "https://ameblo.jp/nix52/entry-12963166642.html",
        "type": "fan",
        "title": "イコラブと音楽番組（更新）"
      }
    ]
  },
  {
    "date": "2025-10-24",
    "program": "ミュージックステーション",
    "station": "テレビ朝日系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "超特急逃走中",
        "songId": "chotokkyu-tousouchu",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      },
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10821",
        "type": "official",
        "title": "【出演情報】テレビ朝日系「ミュージックステーション」※＝LOVE"
      },
      {
        "url": "https://e.usen.com/news/news-event/lovemusic-station.html",
        "type": "press",
        "title": "USEN：＝LOVE「MUSIC STATION」で『超特急逃走中』『ラブソングに襲われる』をスペシャルメドレーにて披露"
      }
    ]
  },
  {
    "date": "2025-10-27",
    "program": "CDTVライブ！ライブ！",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": "フルサイズ",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10823",
        "type": "official",
        "title": "【出演情報】TBS系「CDTVライブ！ライブ！」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-10-28",
    "program": "うたコン",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10835",
        "type": "official",
        "title": "【出演情報】NHK「うたコン」 ※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-11-13",
    "program": "ベストヒット歌謡祭2025",
    "station": "読売テレビ・日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "初恋サイダー（Buono!）",
        "with": "井上和（乃木坂46）×吉川ひより（超ときめき♡宣伝部）×櫻井優衣（FRUITS ZIPPER）×TSUZUMI（ME:I）",
        "note": "＝LOVEからは佐々木舞香のみ（ベストヒットSPユニット）",
        "kind": "collab",
        "confidence": "確認済み"
      },
      {
        "title": "気まぐれロマンティック（いきものがかり）",
        "with": "Kis-My-Ft2、JO1（選抜）、FRUITS ZIPPER ほか",
        "note": "ヒットダンスメドレー内で＝LOVEが担当",
        "kind": "medley",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "番組初出演。大阪城ホールから生放送。",
    "verificationNote": null,
    "milestone": "ベストヒット歌謡祭 初出演",
    "milestoneConfidence": "確認済み",
    "milestoneSources": [
      {
        "url": "https://x.com/besthitskayosai/status/1985467061246837009",
        "type": "broadcaster",
        "title": "ベストヒット歌謡祭公式X：初出演 ＝LOVE から意気込み動画"
      },
      {
        "url": "https://realsound.jp/2025/10/post-2204963.html",
        "type": "press",
        "title": "Real Sound：出演25組発表（＝LOVE 初出演）"
      },
      {
        "url": "https://www.thefirsttimes.jp/news/0000711891/",
        "type": "press",
        "title": "THE FIRST TIMES：25組発表、初出演は9組"
      }
    ],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10860",
        "type": "official",
        "title": "【出演情報】読売テレビ・日本テレビ系全国ネット「ベストヒット歌謡祭2025」※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/647811",
        "type": "press",
        "title": "音楽ナタリー：「ベストヒット歌謡祭2025」タイムテーブル発表"
      },
      {
        "url": "https://e.usen.com/news/news-event/love2025spbuono.html",
        "type": "press",
        "title": "USEN：＝LOVE「ベストヒット歌謡祭2025」に初出演、佐々木舞香は『初恋サイダー／Buono!』も披露"
      }
    ]
  },
  {
    "date": "2025-11-22",
    "program": "イナズマロック フェス 2025（DAY1）",
    "station": "フジテレビTWO（CS）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "21:00〜24:00の3時間番組。フェス当日（2025-09-20）の＝LOVEのセットリストは 絶対アイドル辞めないで／超特急逃走中／内緒バナシ／いらない ツインテール／Oh！Darling／この空がトリガー／ラブソングに襲われる／とくべチュ、して（報道）だが、放送で何曲流れたかは未確認。",
    "verificationNote": "出演は公式で確定。3時間のフェス中継番組で、＝LOVEの何曲が放送されたかは未確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10369",
        "type": "official",
        "title": "【出演情報】フジテレビTWO「イナズマロック フェス 2025」オンエア決定！※＝LOVE"
      },
      {
        "url": "https://e.usen.com/news/news-event/love-2025.html",
        "type": "press",
        "title": "USEN：＝LOVEが７年振りに「イナズマロック フェス2025」に出演（セットリスト）"
      },
      {
        "url": "https://x.com/irf_official/status/1969212414391423097",
        "type": "broadcaster",
        "title": "イナズマロック フェス公式X：フジテレビTWOでオンエア決定（DAY1 11/22）"
      }
    ]
  },
  {
    "date": "2025-11-29",
    "program": "ベストアーティスト 2025（第1部）",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "第1部（16:00台）での歌唱と公式が事前告知。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10946",
        "type": "official",
        "title": "【出演情報】日本テレビ系「ベストアーティスト 2025」※＝LOVE"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/1994674733686952298",
        "type": "official",
        "title": "＝LOVE公式X：「#ベストアーティスト2025」にて「とくべチュ、して」を披露"
      }
    ]
  },
  {
    "date": "2025-12-03",
    "program": "2025 FNS歌謡祭 第1夜",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": "中島健人とのスペシャルコラボ（中島健人がセンター）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "絶対アイドル辞めないで",
        "with": "中島健人",
        "note": "＝LOVEの持ち歌を一夜限りのコラボで",
        "kind": "collab",
        "confidence": "確認済み"
      },
      {
        "title": "ラヴ・イズ・オーヴァー（欧陽菲菲）",
        "with": "水谷千重子",
        "note": "野口衣織のみ。「昭和100年名曲カバー」企画",
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10934",
        "type": "official",
        "title": "【出演情報】フジテレビ系列「2025 FNS歌謡祭 第1夜」※＝LOVE"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004704.000013546.html",
        "type": "press",
        "title": "PR TIMES：＝LOVE「2025 FNS歌謡祭 第1夜」にて中島健人と『絶対アイドル辞めないで』を披露"
      },
      {
        "url": "https://realsound.jp/2025/12/post-2239493.html",
        "type": "press",
        "title": "Real Sound：『FNS歌謡祭』イコラブケンティーに大反響"
      }
    ]
  },
  {
    "date": "2025-12-22",
    "program": "CDTVライブ！ライブ！クリスマス年間ランキングFes.",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      },
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "大谷映美里はスケジュールの都合で休演（9名で出演）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11016",
        "type": "official",
        "title": "【出演情報】TBS系「CDTVライブ！ライブ！クリスマス年間ランキングFes.」※＝LOVE"
      }
    ]
  },
  {
    "date": "2025-12-26",
    "program": "MUSIC STATION SUPER LIVE 2025",
    "station": "テレビ朝日系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      },
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "なんてったってアイドル（小泉今日子）",
        "with": "高橋みなみ・小嶋陽菜・指原莉乃×AKB48×乃木坂46×超ときめき♡宣伝部×KAWAII LAB.（FRUITS ZIPPER、CANDY TUNE、SWEET STEADY、CUTIE STREET）",
        "note": "「最強アイドル8組80名！夢コラボ」",
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "Wikipedia「ラブソングに襲われる」はメドレー相手を「とくべチュ、して」と記すが、公式告知・音楽ナタリーは「絶対アイドル辞めないで」。公式に従った。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/10964",
        "type": "official",
        "title": "【出演情報】テレビ朝日系「MUSIC STATION SUPER LIVE 2025」※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/652922",
        "type": "press",
        "title": "音楽ナタリー：Mステ「スーパーライブ」全65組の歌唱曲発表"
      }
    ]
  },
  {
    "date": "2025-12-30",
    "program": "第67回 輝く！日本レコード大賞",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "指原莉乃が「とくべチュ、して」で作詩賞を受賞。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11003",
        "type": "official",
        "title": "【出演情報】TBS系「第67回 輝く！日本レコード大賞」に＝LOVEの出演が決定！"
      },
      {
        "url": "https://mdpr.jp/music/detail/4705168",
        "type": "press",
        "title": "モデルプレス：指原莉乃、作詩賞受賞の＝LOVE「とくべチュ、して」ステージ見守り涙"
      }
    ]
  },
  {
    "date": "2025-12-31",
    "program": "CDTVライブ！ライブ！年越しカウントダウン Fes.2025→2026",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "超特急逃走中",
        "songId": "chotokkyu-tousouchu",
        "note": "2曲スペシャルメドレー（24時台）",
        "confidence": "確認済み"
      },
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": "2曲スペシャルメドレー（24時台）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "トリプルデート",
        "with": "≠ME、≒JOY",
        "note": "イコノイジョイ名義の3グループ合同曲",
        "kind": "joint",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "23:45〜翌5:00の生放送。メドレーは日付上 2026-01-01 0時台、「トリプルデート」は 2026-01-01 2時台。一部記事の「とくベチュ」表記は誤記。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11034",
        "type": "official",
        "title": "【出演情報】TBS系「CDTVライブ！ライブ！年越しカウントダウン Fes.2025→2026」※＝LOVE"
      },
      {
        "url": "https://www.oricon.co.jp/news/2428357/full/",
        "type": "press",
        "title": "ORICON NEWS：年越し『CDTVライブ！ライブ！』タイムテーブル発表"
      },
      {
        "url": "https://natalie.mu/music/news/654593",
        "type": "press",
        "title": "音楽ナタリー：「CDTV」年越しスペシャルのタイムテーブル公開"
      },
      {
        "url": "https://x.com/otoshima_risa/status/2006436625614815576",
        "type": "official",
        "title": "音嶋莉沙（メンバー）X：「超特急逃走中」「とくべチュ、して」メドレー、イコノイジョイで『トリプルデート』"
      }
    ]
  },
  {
    "date": "2026-01-01",
    "program": "大正製薬presents プレミアMelodiX!スペシャル2026",
    "station": "テレビ東京系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "24:40〜の深夜放送（日付上は 2026-01-02）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11027",
        "type": "official",
        "title": "【出演情報】テレビ東京系「大正製薬presents プレミアMelodiX!スペシャル2026」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-02-13",
    "program": "イナズマロック フェス 2025",
    "station": "フジテレビ（関東ローカル）",
    "broadcastType": "digest",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "26:50〜27:50の深夜放送。2025-09-20 出演分の映像と思われるが、放送された曲は未確認。",
    "verificationNote": "フジテレビ関東ローカルの1時間ダイジェスト（局は「フジテレビ（関東ローカル）」が正確）。放送曲は未確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11214",
        "type": "official",
        "title": "【出演情報】フジテレビ系「イナズマロック フェス 2025」※＝LOVE"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/2022098392697258052",
        "type": "official",
        "title": "＝LOVE公式X：本日放送「＝LOVEが出演いたしました映像が放送されます」"
      },
      {
        "url": "https://x.com/_7mp_official_/status/2018678772682150123",
        "type": "other",
        "title": "IMP. 公式X：フジテレビ（関東ローカル）にてダイジェスト放送"
      }
    ]
  },
  {
    "date": "2026-02-16",
    "program": "CDTVライブ！ライブ！",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "劇薬中毒",
        "songId": "gekiyaku-chudoku",
        "note": "テレビ初披露（新衣装）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "公式告知は「最新曲をテレビ初披露」。曲名は放送当日の公式リリースで確認。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": true,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11201",
        "type": "official",
        "title": "【出演情報】TBS系「CDTVライブ！ライブ！」※＝LOVE"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004771.000013546.html",
        "type": "press",
        "title": "PR TIMES：＝LOVE「CD TVライブ！ライブ！」に生出演し、新曲『劇薬中毒』を新衣装で初披露"
      }
    ]
  },
  {
    "date": "2026-03-30",
    "program": "CDTVライブ！ライブ！（春フェス4時間スペシャル）",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "劇薬中毒",
        "songId": "gekiyaku-chudoku",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": "フルサイズ（報道による）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11277",
        "type": "official",
        "title": "【出演情報】TBS系「CDTVライブ！ライブ！」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-04-07",
    "program": "うたコン",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "劇薬中毒",
        "songId": "gekiyaku-chudoku",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "少女A（中森明菜）",
        "with": "市川由紀乃",
        "note": "市川由紀乃×＝LOVE のカバー",
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "2026-08-22（土）24:10〜に再放送。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": true,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11328",
        "type": "official",
        "title": "【出演情報】NHK「うたコン」 ※＝LOVE"
      },
      {
        "url": "https://equal-love.jp/news/detail/11861",
        "type": "official",
        "title": "【出演情報】NHK総合「うたコン」再放送※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-04-10",
    "program": "バズリズム02",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "劇薬中毒",
        "songId": "gekiyaku-chudoku",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "25:19〜の深夜放送（20分押し）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11275",
        "type": "official",
        "title": "【出演情報】日本テレビ系「バズリズム02」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-04-18",
    "program": "MUSIC FAIR",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "劇薬中毒",
        "songId": "gekiyaku-chudoku",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11366",
        "type": "official",
        "title": "【出演情報】フジテレビ系「MUSIC FAIR」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-04-29",
    "program": "CDTVライブ！ライブ！春の大感謝祭2026 DAY1",
    "station": "TBSチャンネル1（CS）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2026-03-07 Kアリーナ横浜公演のテレビ初放送（21:00〜）。＝LOVE の歌唱曲は未確認。",
    "verificationNote": "出演（DAY1・3/7公演）は公式と報道で確定。放送曲は未確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/schedule/detail/11335",
        "type": "official",
        "title": "公式スケジュール：CS放送TBSチャンネル1「CDTVライブ！ライブ！春の大感謝祭 2026」※＝LOVE"
      },
      {
        "url": "https://www.thefirsttimes.jp/news/0000778717/",
        "type": "press",
        "title": "THE FIRST TIMES：『CDTVライブ！ライブ！春の大感謝祭2026』CS放送TBSチャンネル1でテレビ初独占放送決定"
      }
    ]
  },
  {
    "date": "2026-04-30",
    "program": "STAR",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "お姫様の作り方",
        "songId": "ohimesama-no-tsukurikata",
        "note": "スペシャルメドレー（地上波初披露）",
        "confidence": "確認済み"
      },
      {
        "title": "劇薬中毒",
        "songId": "gekiyaku-chudoku",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11400",
        "type": "official",
        "title": "【出演情報】フジテレビ系「STAR」 ※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-05-08",
    "program": "ミュージックステーション",
    "station": "テレビ朝日系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "劇薬中毒",
        "songId": "gekiyaku-chudoku",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      },
      {
        "title": "お姫様の作り方",
        "songId": "ohimesama-no-tsukurikata",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "8周年ツアー衣装で歌唱。公式ニュースには曲名なし、当日の公式Xと報道で確認。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11397",
        "type": "official",
        "title": "【出演情報】テレビ朝日系「ミュージックステーション」※＝LOVE"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/2052542748084031978",
        "type": "official",
        "title": "＝LOVE公式X：新曲『劇薬中毒』と『お姫様の作り方』をスペシャルメドレーにて披露"
      },
      {
        "url": "https://www.oricon.co.jp/news/2453522/",
        "type": "press",
        "title": "ORICON NEWS：＝LOVE、8周年ツアー衣装での新曲2曲をメドレーに反響"
      }
    ]
  },
  {
    "date": "2026-06-11",
    "program": "STAR",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "お姫様の作り方",
        "songId": "ohimesama-no-tsukurikata",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      },
      {
        "title": "モラトリアム",
        "songId": "moratorium",
        "note": "スペシャルメドレー（地上波初披露）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11547",
        "type": "official",
        "title": "【出演情報】フジテレビ系「STAR」 ※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-06-26",
    "program": "ミュージックステーション",
    "station": "テレビ朝日系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "お姫様の作り方",
        "songId": "ohimesama-no-tsukurikata",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      },
      {
        "title": "あの子コンプレックス",
        "songId": "ano-ko-complex",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11570",
        "type": "official",
        "title": "【出演情報】テレビ朝日系「ミュージックステーション」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-06-26",
    "program": "音道楽√（100回記念 1時間SP「音道楽LIVE2026～初夏の宴～」）",
    "station": "読売テレビ（関西ローカル）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "準確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "恋のつぼみ",
        "with": "倖田來未（原曲）",
        "note": null,
        "kind": "cover",
        "confidence": "準確認"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "24:50〜。5月のGLION ARENA KOBE公演の映像（INI、GANと共演）。放送曲は未確認（ファンのメモに「恋のつぼみ」などの記載があるが裏付けなし）。",
    "verificationNote": "TVガイドの番組紹介記事（放送内容の紹介）に「恋のつぼみ」カバーの記載あり。他の曲は「SNSで話題の人気曲を次々と披露」とあるだけで曲名なし。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11604",
        "type": "official",
        "title": "【出演情報】読売テレビ「音道楽√」※＝LOVE"
      },
      {
        "url": "https://www.tvguide.or.jp/news/news-4944747/",
        "type": "press",
        "title": "TVガイド：INI、＝LOVE、岩田剛典による「音道楽√」熱いライブ＆爆笑トークを大公開！"
      }
    ]
  },
  {
    "date": "2026-06-29",
    "program": "CDTVライブ！ライブ！",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "お姫様の作り方",
        "songId": "ohimesama-no-tsukurikata",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "ファンのメモでは「TV初フルサイズ」。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11559",
        "type": "official",
        "title": "【出演情報】TBS系「CDTVライブ！ライブ！」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-07-03",
    "program": "イナズマロック フェス 2025 ハイライト！",
    "station": "読売テレビ（関西ローカル）",
    "broadcastType": "digest",
    "confidence": "準確認",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "25:20〜26:22（日付上は 2026-07-04）。＝LOVE の出演映像が放送されると番組側が告知したとファンブログが紹介。放送曲は未確認。",
    "verificationNote": "番組表（ザテレビジョン）に＝LOVEの名前あり、公式告知はファンまとめの転載でしか見られず準確認。関西ローカルのダイジェスト番組で、放送曲は未確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equallove-2017.blog.jp/archives/40563826.html",
        "type": "fan",
        "title": "イコラブ＠プレス：読売テレビ「イナズマロック フェス 2025 ハイライト！」本日7/3放送"
      },
      {
        "url": "https://thetv.jp/program/0001076821/",
        "type": "press",
        "title": "WEBザテレビジョン番組表：出演者に＝LOVE"
      },
      {
        "url": "https://fest-inazuma.com/2026/cms/news/64/",
        "type": "broadcaster",
        "title": "FEST.INAZUMA公式：読売テレビでダイジェスト番組 7/3 25:20〜26:22（出演者一覧なし）"
      }
    ]
  },
  {
    "date": "2026-07-04",
    "program": "THE MUSIC DAY 2026",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      },
      {
        "title": "ラブソングに襲われる",
        "songId": "love-song-ni-osowareru",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "とくべチュ、して／ラブソングに襲われる",
        "with": "ポケモン（ポケパーク カントー）",
        "note": "ポケパーク カントーからポケモンたちと披露",
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11637",
        "type": "official",
        "title": "【出演情報】日本テレビ系「THE MUSIC DAY 2026」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-07-04",
    "program": "Venue101 EXTRA（Day1）",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "劇薬中毒",
        "songId": "gekiyaku-chudoku",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2026-06-27 NHKホール公開収録分。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11517",
        "type": "official",
        "title": "【出演情報】NHK「Venue101 EXTRA」公開収録※＝LOVE"
      },
      {
        "url": "https://www.thefirsttimes.jp/news/0000837549/",
        "type": "press",
        "title": "THE FIRST TIMES：NHK『Venue101 EXTRA (Day1)』の詳細発表"
      }
    ]
  },
  {
    "date": "2026-07-18",
    "program": "Venue101 EXTRA（Day2）",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "どりーむじゃんぼ！（超ときめき♡宣伝部）",
        "with": "超ときめき♡宣伝部、FRUITS ZIPPER",
        "note": "超とき宣のライブに＝LOVEとFRUITS ZIPPERが参加したコラボ",
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "＝LOVE単独の歌唱はなし（コラボ企画のみ）。6/27公開収録分。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11761",
        "type": "official",
        "title": "【出演情報】NHK総合「Venue101 EXTRA」※＝LOVE"
      },
      {
        "url": "https://www.oricon.co.jp/news/2468186/full/",
        "type": "press",
        "title": "ORICON NEWS：NHK『Venue101 EXTRA』DAY2放送 超とき宣×＝LOVE×FRUITS ZIPPERコラボ"
      }
    ]
  },
  {
    "date": "2026-07-18",
    "program": "音楽の日2026",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": "スペシャルメドレー（「億超えソングメドレー」企画内）",
        "confidence": "確認済み"
      },
      {
        "title": "超特急逃走中",
        "songId": "chotokkyu-tousouchu",
        "note": "スペシャルメドレー",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "15時台。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11553",
        "type": "official",
        "title": "【出演情報】TBS系「音楽の日2026」※＝LOVE"
      },
      {
        "url": "https://natalie.mu/music/news/681292",
        "type": "press",
        "title": "音楽ナタリー：「音楽の日2026」タイムテーブル発表"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004933.000013546.html",
        "type": "press",
        "title": "PR TIMES：＝LOVE「音楽の日2026」で『とくべチュ、して』と『超特急逃走中』をスペシャルメドレーで生歌唱"
      }
    ]
  },
  {
    "date": "2026-08-03",
    "program": "CDTVライブ！ライブ！",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "ナツマトペ",
        "songId": "natsumatope",
        "note": "番組冒頭の夏メガヒットメドレー内",
        "confidence": "確認済み"
      },
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": "フルサイズでのテレビ初披露（曲名もこの放送で解禁）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11791",
        "type": "official",
        "title": "【出演情報】TBS系「CDTVライブ！ライブ！」※＝LOVE"
      },
      {
        "url": "https://www.cdjournal.com/news/equal-love/128564",
        "type": "press",
        "title": "CDJournal：＝LOVE『CD TVライブ！ライブ！』にて新曲「恋、はじめました。」をフル尺初披露"
      },
      {
        "url": "https://mdpr.jp/music/detail/4823985",
        "type": "press",
        "title": "モデルプレス：＝LOVE、新曲「恋、はじめました。」生放送で初披露"
      }
    ]
  },
  {
    "date": "2026-08-06",
    "program": "STAR",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "公式告知は「最新曲を披露」。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11802",
        "type": "official",
        "title": "【出演情報】フジテレビ系「STAR」※＝LOVE"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004955.000013546.html",
        "type": "press",
        "title": "PR TIMES：＝LOVE フジテレビ系「STAR」に生出演し、新曲『恋、はじめました。』を生歌唱"
      }
    ]
  },
  {
    "date": "2026-08-09",
    "program": "EIGHT-JAM（「EIGHT-JAM FES 2026」特別オンエア）",
    "station": "テレビ朝日系",
    "broadcastType": "digest",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "要確認"
      },
      {
        "title": "あの子コンプレックス",
        "songId": "ano-ko-complex",
        "note": null,
        "confidence": "要確認"
      }
    ],
    "collabs": [],
    "unverifiedCollabs": [
      {
        "title": "あの子コンプレックス",
        "with": "SUPER EIGHT 村上信五・大倉忠義（フェス会場で実施。放送されたかは要確認）",
        "note": null,
        "kind": "collab",
        "confidence": "要確認"
      }
    ],
    "notes": "23:45頃〜。2026-07-11 ノエビアスタジアム神戸出演分の一部。各アーティスト少しずつの放送で、＝LOVEの放送曲は未確認。フェスではSUPER EIGHTの村上信五・大倉忠義と「あの子コンプレックス」をコラボ。",
    "verificationNote": "出演は公式で確定。放送開始は公式23:45、OTOTOY記事は23:15と食い違う（公式の「予定」を優先）。曲はKKBOXの抜粋のみで3曲とも要確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11806",
        "type": "official",
        "title": "【出演情報】テレビ朝日系「EIGHT-JAM」※＝LOVE"
      },
      {
        "url": "https://ototoy.jp/news/131274",
        "type": "press",
        "title": "OTOTOY：〈EIGHT-JAM〉8/9は「EIGHT-JAM FES 2026」"
      },
      {
        "url": "https://www.kkbox.com/tw/en/playlist/HZtpnTizzAH67Fug8F",
        "type": "other",
        "title": "KKBOX「EIGHT-JAM」プレイリスト：FES 2026特集＜Day-1＞の＝LOVE曲（検索結果の抜粋のみ）"
      }
    ]
  },
  {
    "date": "2026-08-15",
    "program": "NHK 夏の音楽祭 うたであえたら 2026",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "絶対アイドル辞めないで",
        "songId": "zettai-idol-yamenaide",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "ムーンライト伝説",
        "with": "FRUITS ZIPPER（松本かれん、真中まな）",
        "note": "＝LOVEからは齋藤樹愛羅・髙松瞳・野口衣織",
        "kind": "collab",
        "confidence": "確認済み"
      },
      {
        "title": "男の子女の子（郷ひろみ）",
        "with": "郷ひろみ",
        "note": "郷ひろみの歌唱に＝LOVE全員がダンスとコーラスで参加",
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": "2026-08-29 に再放送。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": true,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11668",
        "type": "official",
        "title": "【出演情報】NHK「NHK 夏の音楽祭 うたであえたら 2026」※＝LOVE"
      },
      {
        "url": "https://www.oricon.co.jp/news/2473834/full/",
        "type": "press",
        "title": "ORICON NEWS：『うたであえたら 2026』豪華コラボ続々決定 郷ひろみ×＝LOVE"
      },
      {
        "url": "https://www.thefirsttimes.jp/report/0000863458/",
        "type": "press",
        "title": "THE FIRST TIMES：『うたであえたら 2026』公開収録レポート(2)"
      }
    ]
  },
  {
    "date": "2026-08-18",
    "program": "夜の音 -TOKYO MIDNIGHT MUSIC-",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "とくべチュ、して",
        "songId": "tokubechu-shite",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "青春\"サブリミナル\"",
        "songId": "seishun-subliminal",
        "note": null,
        "confidence": "確認済み"
      },
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "24:24〜の深夜放送。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11832",
        "type": "official",
        "title": "【出演情報】日本テレビ系「夜の音 -TOKYO MIDNIGHT MUSIC-」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-08-23",
    "program": "인기가요（人気歌謡）",
    "station": "SBS（韓国）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": "Korean ver.（韓国語での初歌唱）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "番組初出演（レギュラー回）。日本語字幕版が J:COM STREAM で 2026-09-07 から配信（配信のため別項目にしない）。",
    "verificationNote": null,
    "milestone": "SBS「人気歌謡」通常回に初出演",
    "milestoneConfidence": "確認済み",
    "milestoneSources": [
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004972.000013546.html",
        "type": "official",
        "title": "ソニー・ミュージック PR TIMES：SBS「인기가요(人気歌謡)」に初出演が決定"
      },
      {
        "url": "https://mdpr.jp/music/4833875",
        "type": "press",
        "title": "モデルプレス：韓国人気音楽番組SBS「人気歌謡」初出演"
      },
      {
        "url": "https://kstyle.com/article.ksn?articleNo=2283006",
        "type": "press",
        "title": "Kstyle：「人気歌謡」に初登場"
      },
      {
        "url": "https://equal-love.jp/news/detail/9914",
        "type": "official",
        "title": "【出演情報】SBS「SBS人気歌謡UNICON in 東京ドーム」（2025/4/27放送）"
      }
    ],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11870",
        "type": "official",
        "title": "【出演情報】SBS「인기가요(人気歌謡)」※＝LOVE"
      },
      {
        "url": "https://prtimes.jp/main/html/rd/p/000004976.000013546.html",
        "type": "press",
        "title": "PR TIMES：＝LOVE SBS「인기가요(人気歌謡)」に初出演！"
      }
    ]
  },
  {
    "date": "2026-08-28",
    "program": "ミュージックステーション",
    "station": "テレビ朝日系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11825",
        "type": "official",
        "title": "【出演情報】テレビ朝日系「ミュージックステーション」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-08-29",
    "program": "Venue101",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11877",
        "type": "official",
        "title": "【出演情報】NHK総合「Venue101」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-09-03",
    "program": "STAR",
    "station": "フジテレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": "野口衣織・大谷映美里（いおみり）による今回限りの特別バージョンあり",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "公式ニュースに曲名なし、当日の公式Xで確認。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11842",
        "type": "official",
        "title": "【出演情報】フジテレビ系「STAR」※＝LOVE"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/2095338491282702788",
        "type": "official",
        "title": "＝LOVE公式X：新曲『恋、はじめました。』を披露いたします"
      },
      {
        "url": "https://news.yahoo.co.jp/articles/89d49eae58ac575737efe6215eb945d06699bd57",
        "type": "press",
        "title": "日刊スポーツ（Yahoo!ニュース）：＝LOVE、新曲「恋、はじめました。」をフジ「STAR」で披露"
      }
    ]
  },
  {
    "date": "2026-09-04",
    "program": "バズリズム02",
    "station": "日本テレビ系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "25:04〜の深夜放送（5分押し）。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11901",
        "type": "official",
        "title": "【出演情報】日本テレビ系「バズリズム02」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-09-08",
    "program": "うたコン",
    "station": "NHK総合",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [
      {
        "title": "UFO（ピンク・レディー）",
        "with": "未唯mie",
        "note": "野口衣織のみ",
        "kind": "collab",
        "confidence": "確認済み"
      }
    ],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11905",
        "type": "official",
        "title": "【出演情報】NHK「うたコン」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-09-20",
    "program": "EIGHT-JAM FES 2026（独占放送）",
    "station": "CSテレ朝チャンネル1（CS）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "未確認",
    "songs": [],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [
      {
        "title": "あの子コンプレックス",
        "with": "SUPER EIGHT 村上信五・大倉忠義（会場では＝LOVE公式Xで確認済み。放送されたかは要確認）",
        "note": null,
        "kind": "collab",
        "confidence": "要確認"
      }
    ],
    "notes": "12:00〜19:30。フェス当日（2026-07-11）の＝LOVEのセットリストは 絶対アイドル辞めないで／呪って呪って（ワンハーフ）／あの子コンプレックス（村上信五・大倉忠義とコラボ）／仲直りシュークリーム／だからとて／この空がトリガー／青春\"サブリミナル\"／とくべチュ、して（ファン・まとめサイト）だが、放送で何曲流れたかは未確認。",
    "verificationNote": "出演は公式で確定。7時間半のフェス独占放送だが、＝LOVEの放送曲は未確認。",
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/11752",
        "type": "official",
        "title": "【出演情報】CSテレ朝チャンネル１「EIGHT-JAM FES 2026」※＝LOVE"
      },
      {
        "url": "https://x.com/Equal_LOVE_12/status/2075931544385196352",
        "type": "official",
        "title": "＝LOVE公式X：SUPER EIGHTの村上信五さん、大倉忠義さんと「あの子コンプレックス」を披露"
      },
      {
        "url": "https://report-newage.com/50510",
        "type": "fan",
        "title": "新時代レポ：EIGHT-JAM FES 2026 全出演者セットリストまとめ"
      }
    ]
  },
  {
    "date": "2026-10-05",
    "program": "2026 SBS 인기가요 Live In Tokyo",
    "station": "SBS（韓国）",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": "Korean Ver.（ライブ映像）",
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": "2026-09-22 ベルーナドーム「INKIGAYO LIVE in TOKYO」出演分。",
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/12243",
        "type": "official",
        "title": "【出演情報】SBS「2026 SBS 인기가요 Live In Tokyo」※＝LOVE"
      }
    ]
  },
  {
    "date": "2026-10-19",
    "program": "CDTVライブ！ライブ！",
    "station": "TBS系",
    "broadcastType": "original",
    "confidence": "確認済み",
    "publish": true,
    "songsConfidence": "確認済み",
    "songs": [
      {
        "title": "恋、はじめました。",
        "songId": "koi-hajimemashita",
        "note": null,
        "confidence": "確認済み"
      }
    ],
    "unverifiedSongs": [],
    "collabs": [],
    "unverifiedCollabs": [],
    "notes": null,
    "verificationNote": null,
    "milestone": null,
    "milestoneConfidence": null,
    "milestoneSources": [],
    "milestoneCandidate": null,
    "tvPremiere": false,
    "rebroadcastNote": false,
    "sameContentAs": null,
    "sources": [
      {
        "url": "https://equal-love.jp/news/detail/12261",
        "type": "official",
        "title": "【出演情報】TBS系「CDTVライブ！ライブ！」※＝LOVE"
      }
    ]
  }
];

// 公開する記録（出演が 確認済み・準確認）。画面・全体検索・周年ヒストリーのリンクはこちらを使う
export const TV_APPEARANCES = TV_APPEARANCE_RECORDS.filter((entry) => entry.publish);
