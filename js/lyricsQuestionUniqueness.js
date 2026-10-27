// 歌詞クイズの「答えが1曲に決まらない問題」を防ぐ、共通の一意性フィルター。
//
// 【何を防ぐか】歌詞クイズは歌詞の1行（ヒント）を見せて曲名を答えさせる。ところが、
// 同じフレーズ（グループ名を歌う部分・よくある言い回し等）が別の曲にも出てくると、
// 正解が複数ある問題になってしまう。このファイルは、各曲の歌詞の行ごとに
// 「この行は、この曲以外の歌詞にも（正規化したうえで部分一致でも）出てくるか」を調べ、
// 出てくる行をヒント候補から外す（＝その行は二度と出題されない）。
//
// 【どのモードが使うか】1人用の歌詞クイズ・オンライン歌詞クイズ対戦・パーティーの
// 歌詞クイズは、すべてjs/lyricsQuizQuestionBuilder.jsのbuildLyricsQuizQuestions()を
// 通って問題を作る。このフィルターはその共通の入口の中で働くため、モードごとに
// 別々の重複対策を書く必要がない（どれか1つだけ守られていない、という事故を防ぐ）。
//
// 【重要・著作権】このファイルは歌詞本文を一切保持しない・保存しない・送信しない。
// 呼び出し側が渡した（端末内にある）歌詞データをその場で比較するだけ。
// 端末に無い曲の歌詞との重複は、js/data/lyricsAmbiguityIndex.js（歌詞本文を含まない、
// 「曲ID・行番号・内容ハッシュ」だけの一覧）で補う。
//
// 【純粋関数】DOM・IndexedDB・Firebaseには触れない（tests/lyricsQuestionUniqueness.test.jsで
// ダミー歌詞だけを使ってテストする）。

import { computeLyricsContentHash } from "./lyricsSegmentEngine.js";
import { LYRICS_AMBIGUITY_INDEX } from "./data/lyricsAmbiguityIndex.js";
import { LYRICS_UNIQUENESS_MANUAL_EXCLUSIONS } from "./data/lyricsUniquenessManualList.js";

// 一意性フィルターのルールの版。オンライン対戦では、ルームの設定
// （settings.lyricsUniquenessRulesVersion）にこの番号を入れ、全端末が同じルールで
// 問題を作ることを確認する（js/battleModes/lyricsQuizBattleMode.js参照）。
// 【番号を上げるとき】判定方法・正規化・最短文字数を変えたとき、または
// js/data/lyricsAmbiguityIndex.js・js/data/lyricsUniquenessManualList.jsの中身を
// 変えたとき（どれも「どの行が出題されるか」が変わり、端末間で問題がずれる原因になるため）。
export const LYRICS_UNIQUENESS_RULES_VERSION = 1;

// 正規化後の文字数がこれ未満の行は、短すぎて曲を特定できないとみなし出題しない
// （例：かけ声・相づちだけの行）。
export const MIN_UNIQUE_FRAGMENT_LENGTH = 4;

// 行を出題しない理由（画面・ログ・分析ツールで使う識別子。歌詞本文は含めない）。
export const AMBIGUITY_REASON = {
  EMPTY: "empty", // 正規化すると文字が残らない
  TOO_SHORT: "too-short", // MIN_UNIQUE_FRAGMENT_LENGTH未満
  CROSS_SONG_EXACT: "cross-song-exact", // 別の曲に全く同じ行がある
  CROSS_SONG_SUBSTRING: "cross-song-substring", // 別の曲の歌詞の一部として出てくる
  INDEX: "index", // 事前計算の一覧（端末に無い曲との重複を含む）で除外
  MANUAL: "manual", // 本人が手作業で除外した行
};

// 一意性判定のための正規化。js/lyricsSegmentEngine.jsのnormalizeLyricsQuizText()より
// 強めにそろえる（判定を「重複を見逃さない」側に倒すため）：
//   ・NFKC（全角英数→半角、半角カナ→全角カナ、互換文字の統一）
//   ・英字の大文字小文字を統一（小文字）
//   ・カタカナ→ひらがな
//   ・文字（\p{L}）・数字（\p{N}）以外（空白・句読点・記号・絵文字）をすべて除去
// 長音「ー」は文字（\p{L}）なので残す（「ー」の有無で別の言葉になるため）。
export function normalizeForLyricsUniqueness(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[^\p{L}\p{N}]/gu, "");
}

// 比較用の曲ごとのデータ（正規化した行の一覧と、全行をつなげた文字列）を作る。
// 全行をつなげるのは、「別の曲で2行にまたがって歌われているフレーズ」も見逃さないため。
// corpusEntries: { song, lines }[]（同じ曲IDが複数あれば最初のものを使う）
// 戻り値: Map<songId, { normalizedLines: string[], joined: string }>
export function buildUniquenessCorpus(corpusEntries) {
  const corpus = new Map();
  for (const entry of corpusEntries ?? []) {
    const songId = entry?.song?.id;
    if (!songId || corpus.has(songId) || !Array.isArray(entry.lines)) continue;
    const normalizedLines = entry.lines.map((line) => normalizeForLyricsUniqueness(line?.text));
    corpus.set(songId, { normalizedLines, joined: normalizedLines.join("") });
  }
  return corpus;
}

// 正規化済みのフレーズが、ownSongId以外のどの曲に出てくるかを返す（曲IDの配列）。
// 同じ曲の中での繰り返し（サビ等）は、答えが変わらないので問題にしない。
export function findOtherSongsContainingFragment(normalizedFragment, corpus, ownSongId) {
  if (!normalizedFragment) return [];
  const songIds = [];
  for (const [songId, data] of corpus) {
    if (songId === ownSongId) continue;
    if (data.joined.includes(normalizedFragment)) songIds.push(songId);
  }
  return songIds;
}

// 事前計算の一覧（js/data/lyricsAmbiguityIndex.js）のうち、この曲に使ってよい行番号を返す。
// 一覧を作ったときの歌詞と、端末にある歌詞の内容ハッシュが一致するときだけ使う
// （歌詞が修正されて行番号がずれていると、関係ない行を消してしまうため）。
// 戻り値: { verified: boolean, lineNumbers: number[] }
//   verified=false … 一覧に無い曲、または内容が違う（一覧の行番号は信用しない）
export function resolveIndexedAmbiguousLines(songId, lines, ambiguityIndex = LYRICS_AMBIGUITY_INDEX) {
  const indexed = ambiguityIndex?.songs?.[songId];
  if (!indexed) return { verified: false, lineNumbers: [] };
  if (indexed.contentHash !== computeLyricsContentHash(lines)) return { verified: false, lineNumbers: [] };
  return { verified: true, lineNumbers: [...(indexed.ambiguousLines ?? [])] };
}

// 1曲分の歌詞について、出題してはいけない行を理由つきで返す。
// entry   : { song, lines }（判定したい曲）
// corpus  : buildUniquenessCorpus()の戻り値（比較相手。entry自身が含まれていてもよい）
// options.ambiguityIndex / options.manualExclusions : テスト用に差し替え可能
// 戻り値: Map<行番号, 理由（AMBIGUITY_REASONの値）>。理由が複数あれば、より根本的なもの
//         （空・短すぎ → 別の曲と完全一致 → 部分一致 → 手作業 → 事前一覧）を優先する。
export function computeAmbiguousLinesForSong(entry, corpus, options = {}) {
  const ambiguityIndex = options.ambiguityIndex ?? LYRICS_AMBIGUITY_INDEX;
  const manualExclusions = options.manualExclusions ?? LYRICS_UNIQUENESS_MANUAL_EXCLUSIONS;
  const minLength = options.minFragmentLength ?? MIN_UNIQUE_FRAGMENT_LENGTH;
  const songId = entry?.song?.id;
  const lines = Array.isArray(entry?.lines) ? entry.lines : [];
  const result = new Map();
  if (!songId) return result;

  // 他の曲の「行」と完全一致するかを素早く調べるための一覧。
  const otherLineSet = new Set();
  for (const [otherSongId, data] of corpus) {
    if (otherSongId === songId) continue;
    data.normalizedLines.forEach((normalizedLine) => otherLineSet.add(normalizedLine));
  }

  for (const line of lines) {
    const normalized = normalizeForLyricsUniqueness(line?.text);
    if (normalized.length === 0) {
      result.set(line.line, AMBIGUITY_REASON.EMPTY);
    } else if (normalized.length < minLength) {
      result.set(line.line, AMBIGUITY_REASON.TOO_SHORT);
    } else if (otherLineSet.has(normalized)) {
      result.set(line.line, AMBIGUITY_REASON.CROSS_SONG_EXACT);
    } else if (findOtherSongsContainingFragment(normalized, corpus, songId).length > 0) {
      result.set(line.line, AMBIGUITY_REASON.CROSS_SONG_SUBSTRING);
    }
  }

  for (const lineNumber of manualExclusions?.[songId] ?? []) {
    if (!result.has(lineNumber)) result.set(lineNumber, AMBIGUITY_REASON.MANUAL);
  }

  const indexed = resolveIndexedAmbiguousLines(songId, lines, ambiguityIndex);
  for (const lineNumber of indexed.lineNumbers) {
    if (!result.has(lineNumber)) result.set(lineNumber, AMBIGUITY_REASON.INDEX);
  }
  return result;
}

// 出題対象の曲一覧（targetEntries）それぞれについて、出題してはいけない行番号の集合を返す。
// corpusEntries を省略すると targetEntries 自身だけを比較相手にする
// （オンライン対戦はこちら：全員が同じ曲の歌詞を持っていることが保証されている範囲だけで
// 比べるため、どの端末でも同じ結果になる。端末に無い曲との重複は事前一覧が補う）。
// 戻り値: Map<songId, Set<行番号>>
export function computeLyricsUniquenessExclusions(targetEntries, options = {}) {
  const corpusEntries = options.corpusEntries ?? targetEntries;
  // 判定対象の曲は、比較相手にも必ず入れる（同じ曲どうしを比べるため。重複は自動で除かれる）。
  const corpus = buildUniquenessCorpus([...(targetEntries ?? []), ...(corpusEntries ?? [])]);
  const exclusions = new Map();
  for (const entry of targetEntries ?? []) {
    if (!entry?.song?.id) continue;
    const reasons = computeAmbiguousLinesForSong(entry, corpus, options);
    exclusions.set(entry.song.id, new Set(reasons.keys()));
  }
  return exclusions;
}
