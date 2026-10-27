// 曲ごとのセンター情報の「根拠」をまとめたデータファイル（2026-10-27新設）。
// センターが誰か（center／centerType）は js/data/songs.js が唯一の情報源で、このファイルでは変えない。
// ここには「その情報がどこまで確かめられているか」だけを持つ（歴代センター一覧・収録曲一覧の表示に使う）。
//
// kind（根拠の種類。強い順）：
//   "official" … 公式（公式YouTubeのMV説明欄・公式X など）
//   "press"    … 報道（音楽ナタリー・Real Sound のインタビュー・記事）
//   "member"   … メンバー本人の発言（報道に掲載されたもの）
//   "fan"      … ファンのまとめにしか無い（公式とは扱わない。参考表と一致していても公式確認にはならない）
//   "user"     … アプリ作成者の指定（公式の記載は無い）
//   "unknown"  … 根拠が見つかっていない
// ソロ曲・2人の曲（センターの区別が無い曲）と Overture はここに載せない。
//
// 元データ：tools/feature-research/centers-check.json（2026-10-27調査、Git管理外）。
// 【2026-10-28再調査】tools/feature-research/2026-10-28/centers-proposal.json。センターの名前の誤りは0件。
//   根拠を強められた3曲（記憶のどこかで・推しのいる世界・恋、はじめました。）のラベルを上げた。
export const CENTER_SOURCES_RESEARCHED_AT = "2026-10-28";

export const CENTER_SOURCES = {
  // ＝LOVE
  "love": { kind: "press", url: "https://natalie.mu/music/pp/equallove/page/2", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // 記憶のどこかで
  "kioku-no-dokoka-de": { kind: "official", url: "https://prtimes.jp/main/html/rd/p/000003370.000013546.html", note: "ソニー・ミュージックレーベルズの公式プレスリリース（2022-08-14）に「野口衣織と諸橋沙夏がWセンター」と記載。メンバー本人の発言（音楽ナタリー）とも一致" },
  // スタート！
  "start": { kind: "fan", url: null, note: "ファンのまとめにだけ記載。公式・報道でのセンターの記載は見つかっていない" },
  // ズルいよ ズルいね
  "zurui-yo-zurui-ne": { kind: "press", url: "https://natalie.mu/music/news/350182", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // 僕らの制服クリスマス
  "bokura-no-seifuku-christmas": { kind: "press", url: "https://natalie.mu/music/pp/equallove03", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // 届いてLOVE YOU♡
  "todoite-love-you": { kind: "official", url: "https://www.youtube.com/watch?v=RxcNhst20uw", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // ようこそ！イコラブ沼
  "youkoso-ikorabu-numa": { kind: "fan", url: null, note: "ファンのまとめにだけ記載。公式・報道でのセンターの記載は見つかっていない" },
  // 桜の咲く音がした
  "sakura-no-saku-oto-ga-shita": { kind: "press", url: "https://natalie.mu/music/pp/equallove09", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // Oh!Darling
  "oh-darling": { kind: "press", url: "https://natalie.mu/music/pp/equallove09", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // セノビーインラブ
  "senobi-in-love": { kind: "official", url: "https://www.youtube.com/watch?v=9SX3F0LDdQc", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // cinema
  "cinema": { kind: "official", url: "https://www.youtube.com/watch?v=evMRqRppb5w", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 24/7
  "24-7": { kind: "press", url: "https://natalie.mu/music/pp/equallove09", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // お姉さんじゃダメですか？
  "oneesan-ja-dame-desuka": { kind: "press", url: "https://natalie.mu/music/pp/equallove09", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // 青春"サブリミナル"
  "seishun-subliminal": { kind: "press", url: "https://natalie.mu/music/pp/equallove08", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // しゅきぴ
  "shukipi": { kind: "press", url: "https://natalie.mu/music/pp/equallove11", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // 手遅れcaution
  "teokure-caution": { kind: "press", url: "https://natalie.mu/music/pp/equallove03", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // 「部活中に目が合うなって思ってたんだ」
  "bukatsuchu-ni-megaau-natte-omotteta-nda": { kind: "fan", url: null, note: "ファンのまとめにだけ記載。公式・報道でのセンターの記載は見つかっていない" },
  // 樹愛羅、助けに来たぞ
  "kiara-tasuke-ni-kita-zo": { kind: "press", url: "https://natalie.mu/music/pp/equallove03", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // Want you！Want you！
  "want-you-want-you": { kind: "press", url: "https://natalie.mu/music/pp/equallove04", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // 今、この船に乗れ！
  "ima-kono-fune-ni-nore": { kind: "press", url: "https://natalie.mu/music/news/478262", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // アイカツハッピーエンド
  "aikatsu-happy-end": { kind: "fan", url: null, note: "ファンのまとめにだけ記載。公式・報道でのセンターの記載は見つかっていない" },
  // 探せ ダイヤモンドリリー
  "sagase-diamond-lily": { kind: "press", url: "https://natalie.mu/music/pp/equallove06", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // いらない ツインテール
  "iranai-twintail": { kind: "press", url: "https://natalie.mu/music/pp/equallove05", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // Sweetest girl
  "sweetest-girl": { kind: "official", url: "https://x.com/Equal_LOVE_12/status/1185796350912282624", note: "公式Xの投稿で確認（検索結果の抜粋のみ・本文は未読）" },
  // 推しのいる世界
  "oshi-no-iru-sekai": { kind: "official", url: "https://x.com/Equal_LOVE_12/status/1185796350912282624", note: "＝LOVE公式X（2019-10-20）の本文に「センター:佐竹のん乃」と記載。音楽ナタリーの記事とも一致" },
  // CAMEO
  "cameo": { kind: "press", url: "https://natalie.mu/music/pp/equallove07", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // 「君と私の歌」
  "kimi-to-watashi-no-uta": { kind: "press", url: "https://natalie.mu/music/pp/equallove07", note: "音楽ナタリーの記事・インタビューにセンターの記載あり" },
  // The 5th
  "the-5th": { kind: "press", url: "https://realsound.jp/2021/11/post-902400.html", note: "Real Soundの記事・インタビューにセンターの記載あり" },
  // お姫様にしてよ！
  "ohimesama-ni-shiteyo": { kind: "official", url: "https://www.youtube.com/watch?v=oCb89c0MDVk", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // Poison Girl
  "poison-girl": { kind: "official", url: "https://www.youtube.com/watch?v=2l7yxbJ2Eqc", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // BPM170の君へ
  "bpm170-no-kimi-e": { kind: "official", url: "https://www.youtube.com/watch?v=TCTylb6qGdw", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // あの子コンプレックス
  "ano-ko-complex": { kind: "official", url: "https://www.youtube.com/watch?v=ShbfYtAPXuI", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 笑顔のレシピ
  "egao-no-recipe": { kind: "official", url: "https://www.youtube.com/watch?v=LKwERkGBiog", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 知らんけど
  "shiran-kedo": { kind: "official", url: "https://www.youtube.com/watch?v=IplzPaWoFXo", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 内緒バナシ
  "naisho-banashi": { kind: "official", url: "https://www.youtube.com/watch?v=1Cy9oaBAxns", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // ウィークエンドシトロン
  "weekend-citron": { kind: "official", url: "https://x.com/Equal_LOVE_12/status/1412743420838178823", note: "公式Xの投稿で確認（検索結果の抜粋のみ・本文は未読）" },
  // ズッ友案件
  "zuttomo-anken": { kind: "official", url: "https://www.youtube.com/watch?v=L7QUReMgJBY", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 夏祭り恋慕う
  "natsumatsuri-koishitau": { kind: "official", url: "https://www.youtube.com/watch?v=8VBDO8ZQyDo", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 祝祭
  "shukusai": { kind: "official", url: "https://www.youtube.com/watch?v=m8WtzVPXxwU", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // この空がトリガー
  "kono-sora-ga-trigger": { kind: "official", url: "https://www.youtube.com/watch?v=20QJax8CwQo", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // Junkies
  "junkies": { kind: "official", url: "https://www.youtube.com/watch?v=POBlJq_P8os", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // ラブクリエイト
  "love-create": { kind: "official", url: "https://www.youtube.com/watch?v=11SXnMJKljk", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // ナツマトペ
  "natsumatope": { kind: "official", url: "https://www.youtube.com/watch?v=Y1Bboo5KXL4", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // だからとて
  "dakaratote": { kind: "official", url: "https://www.youtube.com/watch?v=zKkx-rtOIPo", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // ヒロインズ
  "heroines": { kind: "official", url: "https://www.youtube.com/watch?v=B2teLF9l4aI", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // ラブロケ
  "love-locke": { kind: "official", url: "https://www.youtube.com/watch?v=u_Y91a-uILM", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // ラストノートしか知らない
  "last-note-shika-shiranai": { kind: "official", url: "https://www.youtube.com/watch?v=C8WMX7dEH7Y", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 「ドライブ デート 都内」
  "drive-date-tonai": { kind: "official", url: "https://www.youtube.com/watch?v=Y3aRUM8ebKE", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 狂想カタストロフィ
  "kyousou-catastrophe": { kind: "official", url: "https://www.youtube.com/watch?v=RG_B3gfOzLo", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // どこが好きか言って
  "doko-ga-suki-ka-itte": { kind: "unknown", url: null, note: "「センターなし」と書かれた公式・報道の資料は見つかっていない（センターの記載が無いことだけ確認）" },
  // 呪って呪って
  "norotte-norotte": { kind: "official", url: "https://www.youtube.com/watch?v=cyRZGtNx_a4", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 誰にもバレずに
  "darenimo-barezuni": { kind: "official", url: "https://www.youtube.com/watch?v=E4PVynHrfp8", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 君の第3ボタン
  "kimi-no-dai-3-button": { kind: "official", url: "https://www.youtube.com/watch?v=xmo-UbsUZE4", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 絶対アイドル辞めないで
  "zettai-idol-yamenaide": { kind: "official", url: "https://www.youtube.com/watch?v=17NBPoc78oM", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 仲直りシュークリーム
  "nakanaori-shu-cream": { kind: "official", url: "https://www.youtube.com/watch?v=D0SfIi-0Zpo", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 海とレモンティー
  "umi-to-lemon-tea": { kind: "official", url: "https://www.youtube.com/watch?v=i024yWd9oiI", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // とくべチュ、して
  "tokubechu-shite": { kind: "official", url: "https://www.youtube.com/watch?v=F3P8vcZkIh4", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 恋人以上、好き未満
  "koibito-ijou-suki-miman": { kind: "official", url: "https://www.youtube.com/watch?v=p-jc9qMpBb4", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 超特急逃走中
  "chotokkyu-tousouchu": { kind: "official", url: "https://www.youtube.com/watch?v=d20dEAtbL08", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // ラブソングに襲われる
  "love-song-ni-osowareru": { kind: "official", url: "https://www.youtube.com/watch?v=_cf4UTe1qrY", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 木漏れ日メゾフォルテ
  "komorebi-mezzoforte": { kind: "official", url: "https://www.youtube.com/watch?v=4xBmuiQNGdc", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 劇薬中毒
  "gekiyaku-chudoku": { kind: "official", url: "https://www.youtube.com/watch?v=Bco8bY9r_H4", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // モラトリアム
  "moratorium": { kind: "official", url: "https://www.youtube.com/watch?v=ZROuG57QGls", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // お姫様の作り方
  "ohimesama-no-tsukurikata": { kind: "official", url: "https://www.youtube.com/watch?v=2udLA8-QuD8", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 恋、はじめました。
  "koi-hajimemashita": { kind: "press", url: "https://natalie.mu/music/pp/equallove-koihajimemashita", note: "音楽ナタリーの21stシングル特集（2026-08-28）に「今作は特定のセンターを置かない構成」とある（諸橋沙夏も同じ趣旨の発言）。資料の言い方は「全員センター」ではなく「特定のセンターなし」" },
  // 夏名残サマーチューン
  "natsunagori-summer-tune": { kind: "official", url: "https://www.youtube.com/watch?v=_Bm66BRnM1A", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 夢の続き
  "yume-no-tsuzuki": { kind: "user", url: null, note: "アプリの設定。2026-10-28に再調査したが、公式MV説明欄・報道にセンター（全員を含む）の記載は見つからなかった" },
  // 866
  "866": { kind: "unknown", url: null, note: "「センターなし」と書かれた公式・報道の資料は見つかっていない（センターの記載が無いことだけ確認）" },
  // Be Selfish
  "be-selfish": { kind: "official", url: "https://www.youtube.com/watch?v=suf7S4AKdmY", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
  // 好きって、言えなかった
  "sukitte-ienakatta": { kind: "official", url: "https://www.youtube.com/watch?v=Jsz-Hzb4fyY", note: "公式YouTubeのMV説明欄にセンターの記載あり" },
};
