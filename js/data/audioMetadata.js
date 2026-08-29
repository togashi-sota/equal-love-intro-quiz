// 音源ファイルから機械的に計測した、曲ごとの長さ（durationSec、秒・小数第3位）のデータ。
// dev/generate_audio_metadata.py により自動生成される。
// 【手で編集しないこと】音源を追加・差し替えたときは、このファイルを直接編集せず、
// 生成スクリプトを再実行すること。
//
// 【用途】ランダム再生クイズの「曲のどこから再生を始めるか」の乱数計算は、
// 端末ごとにブレうるaudioElement.durationではなく、必ずこの固定値を使う
// （詳細はjs/randomPlaybackEngine.js・HANDOFF.md 10-64章参照）。
//
// outroStartSec：アウトロクイズ（曲の最後5秒を聞いて当てるモード）用に、
// 「実際に音が鳴っている状態で終わる5秒間」の開始位置を機械計測した値。
// フェードアウト・末尾の無音を自動検出し、それを避けた位置になっている
// （ffmpegのsilencedetectフィルターで解析。詳細はこのスクリプト内のコメント参照）。
// 末尾の無音が検出されなかった曲は durationSec - 5 がそのまま入っている。
export const AUDIO_METADATA = {
  "love": { durationSec: 247.211, outroStartSec: 238.677 },
  "kioku-no-dokoka-de": { durationSec: 260.659, outroStartSec: 252.313 },
  "start": { durationSec: 291.126, outroStartSec: 283.366 },
  "zurui-yo-zurui-ne": { durationSec: 283.829, outroStartSec: 273.888 },
  "bokura-no-seifuku-christmas": { durationSec: 268.269, outroStartSec: 259.918 },
  "todoite-love-you": { durationSec: 253.648, outroStartSec: 245.521 },
  "youkoso-ikorabu-numa": { durationSec: 242.989, outroStartSec: 235.392 },
  "sakura-no-saku-oto-ga-shita": { durationSec: 273.977, outroStartSec: 265.890 },
  "oh-darling": { durationSec: 277.860, outroStartSec: 268.626 },
  "senobi-in-love": { durationSec: 188.805, outroStartSec: 180.690 },
  "cinema": { durationSec: 252.997, outroStartSec: 246.367 },
  "genneki-idol-chu": { durationSec: 283.750, outroStartSec: 275.732 },
  "haikei-anata-sama": { durationSec: 241.424, outroStartSec: 232.364 },
  "24-7": { durationSec: 214.659, outroStartSec: 207.413 },
  "oneesan-ja-dame-desuka": { durationSec: 211.088, outroStartSec: 203.334 },
  "seishun-subliminal": { durationSec: 308.458, outroStartSec: 298.392 },
  "shukipi": { durationSec: 233.893, outroStartSec: 223.308 },
  "ryuseigun": { durationSec: 280.675, outroStartSec: 272.241 },
  "teokure-caution": { durationSec: 255.551, outroStartSec: 246.321 },
  "bukatsuchu-ni-megaau-natte-omotteta-nda": { durationSec: 282.942, outroStartSec: 274.856 },
  "kiara-tasuke-ni-kita-zo": { durationSec: 248.983, outroStartSec: 240.647 },
  "want-you-want-you": { durationSec: 235.795, outroStartSec: 225.370 },
  "ima-kono-fune-ni-nore": { durationSec: 225.449, outroStartSec: 217.289 },
  "aikatsu-happy-end": { durationSec: 261.441, outroStartSec: 253.565 },
  "sagase-diamond-lily": { durationSec: 295.088, outroStartSec: 285.135 },
  "iranai-twintail": { durationSec: 224.119, outroStartSec: 216.398 },
  "niji-no-moto": { durationSec: 290.944, outroStartSec: 282.928 },
  "sweetest-girl": { durationSec: 272.570, outroStartSec: 263.726 },
  "oshi-no-iru-sekai": { durationSec: 300.509, outroStartSec: 291.723 },
  "cameo": { durationSec: 255.056, outroStartSec: 246.851 },
  "kimi-to-watashi-no-uta": { durationSec: 322.375, outroStartSec: 312.658 },
  "my-voice-is-for-you": { durationSec: 242.024, outroStartSec: 234.111 },
  "the-5th": { durationSec: 291.778, outroStartSec: 283.364 },
  "ohimesama-ni-shiteyo": { durationSec: 234.649, outroStartSec: 227.804 },
  "poison-girl": { durationSec: 179.526, outroStartSec: 172.023 },
  "bpm170-no-kimi-e": { durationSec: 233.293, outroStartSec: 224.569 },
  "ano-ko-complex": { durationSec: 276.896, outroStartSec: 269.935 },
  "egao-no-recipe": { durationSec: 230.010, outroStartSec: 223.000 },
  "shiran-kedo": { durationSec: 210.828, outroStartSec: 202.817 },
  "boku-no-heroine": { durationSec: 250.860, outroStartSec: 243.296 },
  "takaramono-wa-green": { durationSec: 276.689, outroStartSec: 268.986 },
  "kimi-dake-no-hanamichi": { durationSec: 251.559, outroStartSec: 242.273 },
  "okaeri-hanadayori": { durationSec: 281.313, outroStartSec: 274.358 },
  "naisho-banashi": { durationSec: 238.184, outroStartSec: 231.136 },
  "weekend-citron": { durationSec: 243.614, outroStartSec: 234.088 },
  "zuttomo-anken": { durationSec: 209.915, outroStartSec: 200.387 },
  "natsumatsuri-koishitau": { durationSec: 287.686, outroStartSec: 280.893 },
  "shukusai": { durationSec: 291.804, outroStartSec: 281.397 },
  "kono-sora-ga-trigger": { durationSec: 292.325, outroStartSec: 282.458 },
  "junkies": { durationSec: 276.375, outroStartSec: 267.933 },
  "love-create": { durationSec: 193.887, outroStartSec: 186.151 },
  "kiara-tiara": { durationSec: 198.370, outroStartSec: 190.481 },
  "natsumatope": { durationSec: 240.799, outroStartSec: 232.041 },
  "dakaratote": { durationSec: 303.402, outroStartSec: 295.907 },
  "heroines": { durationSec: 249.296, outroStartSec: 241.904 },
  "love-locke": { durationSec: 207.283, outroStartSec: 199.962 },
  "last-note-shika-shiranai": { durationSec: 313.384, outroStartSec: 304.275 },
  "drive-date-tonai": { durationSec: 245.986, outroStartSec: 238.362 },
  "kyousou-catastrophe": { durationSec: 284.689, outroStartSec: 274.012 },
  "doko-ga-suki-ka-itte": { durationSec: 223.338, outroStartSec: 215.220 },
  "norotte-norotte": { durationSec: 203.426, outroStartSec: 196.236 },
  "darenimo-barezuni": { durationSec: 280.414, outroStartSec: 272.448 },
  "kimi-no-dai-3-button": { durationSec: 245.595, outroStartSec: 237.473 },
  "zettai-idol-yamenaide": { durationSec: 233.215, outroStartSec: 226.021 },
  "nakanaori-shu-cream": { durationSec: 241.086, outroStartSec: 234.050 },
  "umi-to-lemon-tea": { durationSec: 260.268, outroStartSec: 250.642 },
  "tokubechu-shite": { durationSec: 238.402, outroStartSec: 230.791 },
  "koibito-ijou-suki-miman": { durationSec: 268.764, outroStartSec: 261.752 },
  "chotokkyu-tousouchu": { durationSec: 228.967, outroStartSec: 220.674 },
  "love-song-ni-osowareru": { durationSec: 217.760, outroStartSec: 210.119 },
  "komorebi-mezzoforte": { durationSec: 196.024, outroStartSec: 188.577 },
  "queens": { durationSec: 176.686, outroStartSec: 168.220 },
  "gekiyaku-chudoku": { durationSec: 276.114, outroStartSec: 269.501 },
  "moratorium": { durationSec: 265.950, outroStartSec: 258.236 },
  "ohimesama-no-tsukurikata": { durationSec: 232.824, outroStartSec: 225.077 },
  "koi-hajimemashita": { durationSec: 217.604, outroStartSec: 209.972 },
  "natsunagori-summer-tune": { durationSec: 235.795, outroStartSec: 227.564 },
  "yume-no-tsuzuki": { durationSec: 226.986, outroStartSec: 219.666 },
  "866": { durationSec: 217.992, outroStartSec: 208.691 },
  "overture": { durationSec: 83.147, outroStartSec: 76.161 },
  "be-selfish": { durationSec: 206.084, outroStartSec: 196.813 },
  "sukitte-ienakatta": { durationSec: 301.838, outroStartSec: 292.364 },
  "watashi-mahoutsukai": { durationSec: 209.524, outroStartSec: 200.952 },
  "mayonaka-mermaid": { durationSec: 246.794, outroStartSec: 238.911 },
};

// この曲の音源が実際に存在するかどうか（2026-08-17追加、本人指示）。
// 「この端末が音源を読み込み済みか」（js/audioStorage.jsのgetAudioBlob、IndexedDBの
// 話）とは別で、こちらは「そもそも音源という実体がこの世に存在するか」を表す。
// AUDIO_METADATAはdev/generate_audio_metadata.pyが実際の音源ファイルから機械生成する
// ため、ここに載っていない＝まだ音源自体が存在しない曲、と機械的に判定できる。
// 表題曲だけ先行登録されていて音源がまだ無い21st以降のシングルのような曲を、
// 曲名のハードコードなしに自動判定するために使う（js/songlist.js・js/customQuizScreen.js参照）。
export function hasAudioSource(song) {
  return Boolean(AUDIO_METADATA[song.id]);
}
