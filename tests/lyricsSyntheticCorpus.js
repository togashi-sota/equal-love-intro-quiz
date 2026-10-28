// テスト・計測用の「ダミー歌詞」を作る道具（2026-10-28新設）。
//
// 【重要・著作権】ここで作る文字列は、乱数で並べたひらがな・カタカナ・英字だけの、意味のない
// ダミーの文。実在の楽曲の歌詞は一切含まない（実データから使うのは「行数・1行の文字数」という
// 大きさの情報だけで、それも呼び出し側が数値として渡す。このファイル自身は実データを読まない）。
//
// 実データと似た「重なり方」を再現する：
//   ・曲の中の繰り返し（サビ）… 同じ曲の中で同じ行が何度も出る（除外しない行）
//   ・別の曲と全く同じ行         … 数％の行が、共通のフレーズ集から丸ごと選ばれる（除外される行）
//   ・別の曲の一部に含まれる行   … 数％の行に、共通の短いかけらが埋め込まれる（除外されうる行）
//   ・短すぎる行                 … 文字数の分布に1〜3文字の行が含まれる
// 同じseedなら必ず同じ内容になる（端末ごとの比較・キャッシュの有無の比較に使うため）。

const HIRAGANA = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ";
const KATAKANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
const LATIN = "abcdefghijklmnopqrstuvwxyz";

// 再現性のある乱数（mulberry32）。
export function createSyntheticRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomText(random, length) {
  let text = "";
  for (let i = 0; i < length; i += 1) {
    const roll = random();
    const alphabet = roll < 0.8 ? HIRAGANA : roll < 0.95 ? KATAKANA : LATIN;
    text += alphabet[Math.floor(random() * alphabet.length)];
    // ときどき空白・記号を入れる（正規化で消える文字）
    if (random() < 0.05) text += random() < 0.5 ? " " : "、";
  }
  return text;
}

// 実データの大きさを知らない場面（テスト）向けの、実データに近い大きさの分布
// （83曲・1曲37〜103行・1行平均約11文字。計測ではsizes.jsonの実際の大きさを使う）。
export function makeSyntheticSizes({ songCount = 83, seed = 1 } = {}) {
  const random = createSyntheticRandom(seed);
  const lengthChoices = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25, 30];
  const sizes = [];
  for (let i = 0; i < songCount; i += 1) {
    const lineCount = 37 + Math.floor(random() * 67);
    const lineLengths = [];
    for (let j = 0; j < lineCount; j += 1) lineLengths.push(lengthChoices[Math.floor(random() * lengthChoices.length)]);
    sizes.push(lineLengths);
  }
  return sizes;
}

// songIds[i] の曲に sizes[i]（1行ごとの文字数の配列）の大きさのダミー歌詞を作る。
// 戻り値: { songId, lines: [{ line, text, start, end }] }[]
export function makeSyntheticLyricsRecords({
  songIds,
  sizes,
  seed = 1,
  sharedLineRate = 0.02,
  sharedFragmentRate = 0.035,
  chorusRate = 0.14,
}) {
  const random = createSyntheticRandom(seed);
  const sharedPhrases = Array.from({ length: 60 }, () => randomText(random, 6 + Math.floor(random() * 10)));
  const sharedFragments = Array.from({ length: 40 }, () => randomText(random, 5));
  return songIds.map((songId, songIndex) => {
    const lineLengths = sizes[songIndex % sizes.length];
    const chorus = Array.from({ length: 6 }, () => randomText(random, 8 + Math.floor(random() * 10)));
    let time = 5;
    const lines = lineLengths.map((length, lineIndex) => {
      const roll = random();
      let text;
      if (roll < chorusRate) {
        text = chorus[lineIndex % chorus.length];
      } else if (roll < chorusRate + sharedLineRate) {
        text = sharedPhrases[Math.floor(random() * sharedPhrases.length)];
      } else if (roll < chorusRate + sharedLineRate + sharedFragmentRate && length >= 7) {
        const fragment = sharedFragments[Math.floor(random() * sharedFragments.length)];
        const head = randomText(random, Math.max(1, Math.floor((length - 5) / 2)));
        text = `${head}${fragment}${randomText(random, Math.max(1, length - 5 - head.length))}`;
      } else {
        text = randomText(random, Math.max(1, length));
      }
      const start = Math.round(time * 100) / 100;
      const end = Math.round((time + 2.5) * 100) / 100;
      time += 3 + random() * 0.4;
      return { line: lineIndex + 1, text, start, end };
    });
    return { songId, lines };
  });
}

// 文字列（JSON化した値など）に、ダミー歌詞の行（6文字以上のもの）が1つでも含まれていればtrue。
// 「Firebaseへ送る値・保存するキャッシュに歌詞本文が入っていない」ことの確認に使う。
export function containsAnySyntheticLyricLine(value, records) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const record of records) {
    for (const line of record.lines) {
      if (typeof line.text === "string" && line.text.length >= 6 && text.includes(line.text)) return true;
    }
  }
  return false;
}
