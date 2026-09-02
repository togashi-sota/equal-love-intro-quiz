// 歌詞クイズモード用の「ヒントとして出す範囲」を、既存の同期歌詞データ
// （js/lyricsStorage.jsが保持する { line, text, start, end } の配列）から自動生成する
// 純粋関数群。UI・IndexedDBアクセスは一切行わない（js/randomPlaybackEngine.jsと同じ設計方針）。
//
// 【重要・著作権】このファイルは歌詞本文を一切保持しない。呼び出し側が渡したlinesデータ
// （本人がすでに用意・保存済みの歌詞）をその場で処理して区間候補を返すだけで、
// 区間データを新たにファイルへ保存する設計にはしていない。
//
// 【設計の経緯（2026-08-09、実機プレイ後に全面書き換え）】
// 旧方式は「1〜4行の全パターンを総当たりで事前生成し、質の高い区間を選んでは
// 前後1行ずつ広げ、広げられなくなったら質の高い未使用区間へジャンプする」方式だったが、
// 実際にプレイすると次の問題があった：
//   ・ヒント1の時点で複数行の区間が選ばれることがあり、段階ごとの差が分かりにくい
//   ・1つの区間の最大行数（4行）に達すると、次のヒントで必ず無関係な場所へジャンプし、
//     「ヒントを増やしたのに情報が減った」ように見える
// そのため、「基準行を1つ選び、必ずその基準行を含む範囲を1行ずつ広げる」方式へ変更した。
// ヒントは常に単調に増え、別の場所へジャンプすることが構造的に起こらない。
//
// 【オンライン対戦の公平性について】区間そのものをFirebaseへ送らず、
// computeLyricsContentHash()で作った内容ハッシュだけを送って、全端末のlinesデータが
// 一致しているかどうかを確認する設計にする（歌詞本文をFirebaseへ送らないという
// 本人の方針どおり）。

import { computeQuestionRandomValue } from "./randomPlaybackEngine.js";
import { createSeededRandom } from "./seededRandom.js";

// minTextLength      : 正規化後の文字数がこれ未満の行は短すぎるとみなし品質を下げる
// idealMaxTextLength : 正規化後の文字数がこれ以下ならヒントとして読みやすい長さとみなす
// maxLineGapSec      : 前の行のendから次の行のstartまでの間隔がこれを超える場合、
//                      間奏・場面転換とみなしてその方向には広げない
export const SEGMENT_GENERATION_DEFAULTS = {
  minTextLength: 6,
  idealMaxTextLength: 40,
  maxLineGapSec: 3,
};

// 基準行（ヒント1）として選ぶ際に優先する最低品質。これを満たす行が無い曲でも、
// quality>0（0点=曲名を含む・文字数0）でありさえすれば基準行として使えるように、
// pickPrimarySegment()側で段階的にゆるめる（極端に短い歌詞しかない曲を出題対象から
// 不必要に除外しないため）。
export const MIN_ANCHOR_QUALITY = 50;

// songlist.jsのnormalizeForSearch()と同じ考え方（全角→半角・カタカナ→ひらがな・
// 空白除去・記号除去）で、歌詞クイズ専用に正規化する関数。
// あえてsonglist.js側の関数を直接importせず、この関数を独立して持たせている理由：
// songlist.jsはDOM要素（<audio>等）をモジュール読み込み時に取得する作りのため、
// 歌詞クイズのテスト・ロジックをDOMに依存させたくない（js/randomPlaybackEngine.js等、
// このプロジェクトの「純粋関数ファイル」が一貫してDOM非依存にしている設計方針を踏襲）。
// 正規化のルール自体はsonglist.jsのnormalizeForSearch()を踏襲しつつ、全角英字にも対応させている。
export function normalizeLyricsQuizText(text) {
  return text
    .toLowerCase()
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/\s/g, "")
    .replace(/[・！？!?「」『』"'’〜~。、,.…]/g, "");
}

// startLine・endLineから、区間の一意なidを決定論的に作る。
function buildSegmentId(startLine, endLine) {
  return `${startLine}-${endLine}`;
}

// 前の行の終わりから次の行の始まりまでの間隔が、既定値を超えていないか判定する。
function hasLargeGap(previousLine, nextLine, maxLineGapSec) {
  if (!previousLine || !nextLine) return false;
  return nextLine.start - previousLine.end > maxLineGapSec;
}

// 正規化済みテキスト・曲名（正規化前）・別名一覧（songs.jsのsearchAliases形式）から、
// その区間が曲名をそのまま含んでいるかどうかを判定する。
// aliasesの要素は文字列、または { text, reading } オブジェクトのどちらでもよい
// （songs.jsのsearchAliasesと同じ形）。
export function containsSongTitle(normalizedSegmentText, title, aliases = []) {
  const normalizedTitle = normalizeLyricsQuizText(title ?? "");
  if (normalizedTitle.length > 0 && normalizedSegmentText.includes(normalizedTitle)) {
    return true;
  }
  return (aliases ?? []).some((alias) => {
    const aliasTexts =
      typeof alias === "string" ? [alias] : [alias?.text, alias?.reading].filter(Boolean);
    return aliasTexts.some((aliasText) => {
      const normalizedAlias = normalizeLyricsQuizText(aliasText);
      return normalizedAlias.length > 0 && normalizedSegmentText.includes(normalizedAlias);
    });
  });
}

// 区間1件分の「ヒントとしての使いやすさ」を0〜100点で評価する。
// 0点は「候補として使わない」ことを示す（曲名を含む区間は問答無用で0点）。
// isRepeat（同じ曲内に全く同じ正規化テキストの区間が既にある＝サビの繰り返し等）は
// 減点はするが0点にはしない。
// 【評価しているもの】文字数と繰り返しだけ。行数・無音区間・句読点・時間間隔は
// 区間をどこまで広げるかの境界判定にのみ使い、quality自体には反映しない。
// 意味的な難易度（サビだから有名／簡単等）は一切判定していない。
function scoreSegmentQuality(segment, { minTextLength, idealMaxTextLength }) {
  if (segment.containsTitle) return 0;

  const length = segment.normalizedText.length;
  if (length === 0) return 0;

  let score;
  if (length < minTextLength) {
    score = Math.round((length / minTextLength) * 40);
  } else if (length <= idealMaxTextLength) {
    score = 100;
  } else {
    const overLength = length - idealMaxTextLength;
    score = Math.max(20, 100 - overLength * 2);
  }

  if (segment.isRepeat) {
    score = Math.round(score * 0.5);
  }

  return score;
}

// 歌詞の行データ（lines）から、「ヒント1の基準行」として使える1行ずつの候補を作る。
// 【戻り値】{ id, index, startLine, endLine, text, normalizedText, containsTitle, quality, isRepeat }[]
// indexはlines配列内での位置（0始まり）。buildHintSequence()へそのまま渡せる。
// startLine・endLineは常に同じ値（1行だけの候補のため）。
//
// options.title・options.titleAliases を渡すと曲名含有判定を行う（省略時はcontainsTitleは
// 常にfalseになる）。
export function generateAnchorLineCandidates(lines, options = {}) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  const minTextLength = options.minTextLength ?? SEGMENT_GENERATION_DEFAULTS.minTextLength;
  const idealMaxTextLength =
    options.idealMaxTextLength ?? SEGMENT_GENERATION_DEFAULTS.idealMaxTextLength;
  const title = options.title ?? null;
  const titleAliases = options.titleAliases ?? [];

  const firstOccurrenceByNormalizedText = new Set();

  return lines.map((line, index) => {
    const normalizedText = normalizeLyricsQuizText(line.text);
    const containsTitle = title ? containsSongTitle(normalizedText, title, titleAliases) : false;
    const isRepeat = firstOccurrenceByNormalizedText.has(normalizedText);
    if (!isRepeat) firstOccurrenceByNormalizedText.add(normalizedText);

    const segment = {
      id: buildSegmentId(line.line, line.line),
      index,
      startLine: line.line,
      endLine: line.line,
      text: line.text,
      normalizedText,
      containsTitle,
      isRepeat,
      quality: 0,
    };
    segment.quality = scoreSegmentQuality(segment, { minTextLength, idealMaxTextLength });
    return segment;
  });
}

// 1問分の「基準行（ヒント1）」を、候補の中から決定論的に選ぶ。
// seed・songId・questionIndexが同じなら常に同じ行が選ばれる
// （オンライン対戦で全端末が同じ問題を出題するために必須。
// js/randomPlaybackEngine.jsのcomputeRandomStartTimeSec()と同じ設計方針）。
//
// 【選び方】MIN_ANCHOR_QUALITY以上の候補（曲名を含まない）の中から、seedベースの
// 乱数で均等に1件選ぶ。基準になる行を曲全体からまんべんなく選べるようにするため、
// 上位N件に絞る方式（旧実装）はやめた（1行だけの候補は文字数の差が付きにくく、
// 大半が同点になるため、上位数件に絞ると曲の冒頭付近に偏ってしまう）。
// MIN_ANCHOR_QUALITY以上の候補が無い曲では、quality>0の候補全体まで条件をゆるめる
// （極端に短い歌詞しかない曲を出題対象から不必要に除外しないため）。
export function pickPrimarySegment(candidates, seed, songId, questionIndex, options = {}) {
  const minQuality = options.minQuality ?? MIN_ANCHOR_QUALITY;

  const preferred = candidates.filter((c) => !c.containsTitle && c.quality >= minQuality);
  const fallback = candidates.filter((c) => !c.containsTitle && c.quality > 0);
  const pool = preferred.length > 0 ? preferred : fallback;
  if (pool.length === 0) return null;

  // idの文字列比較だと"10-10"が"9-9"より前に来てしまう（桁数違いの数値を
  // 文字列として比較してしまうバグ）ため、startLineの数値比較で安定した順序にする。
  const sorted = [...pool].sort((a, b) => a.startLine - b.startLine);

  // 回答候補の並び替え（js/lyricsQuizEngine.js）と乱数の出どころが混ざらないよう、
  // songIdに用途を表す文字列を足してからハッシュ化する。
  const randomValue = computeQuestionRandomValue(seed, `${songId}:hint`, questionIndex);
  const index = Math.min(Math.floor(randomValue * sorted.length), sorted.length - 1);
  return sorted[index];
}

// 1問分のヒント進行（最大maxHints段階、既定4段階）を決定論的に生成する。
//
// 【方式（2026-11-XX、本人指示：ヒント生成の再設計・第2版）】前回（2026-10-01）は
// 「使える行を歌詞の登場順に並べ、maxHints個のグループへほぼ均等に分割し、各グループから
// 1件ずつ選ぶ」方式にしたが、これだと逆に機械的な均等配置になり、本人からもっとランダム性の
// ある結果にしてほしいという指示があった。今回は、使える行（曲名を含まない・quality>0）
// 全体から、seedベースの乱数でmaxHints個を「完全にランダムに」選ぶ。
// 【重複防止】正規化テキストが完全に一致する行（サビの再登場等）は選ばない。
// 【近さの扱い】2つのヒントが歌詞の近い位置から選ばれるのは許容する（ランダム性として
// 自然）。ただし、選ばれたmaxHints個の全部が曲のごく狭い範囲（歌詞全体の30%未満の幅）に
// 集中してしまう極端な結果だけは避けたいため、範囲が狭すぎる場合は同じ乱数列の続きを使って
// 再抽選する（最大6回まで。それでも改善しなければ、それまでで最も範囲が広かった結果を使う。
// 使える行がmaxHints個以下の曲では、全部を使うため再抽選の余地が無く、この判定自体を行わない）。
// 【一度決めたら再抽選しない】この関数は1問につき1回だけ呼ぶ想定（呼び出し側
// 〈js/lyricsQuizQuestionBuilder.js〉が問題生成時に1回だけ呼び、以後は結果を使い回す）。
//
// 【hintLevelと画面表示順は別物（重要）】ここでのhintLevelは「抽選された順番（開放順）」
// であり、歌詞の時系列（startLine）とは無関係。例えばhintLevel1が2番の歌詞、hintLevel2が
// 1番の歌詞、ということが普通に起こる。画面上でどの順に並べて見せるか（時系列順など）は
// 呼び出し側の責務とし、この関数はソートしない（並べ替えるとhintLevelと中身の対応が
// 崩れるため、あえて何もしない）。
//
// lines           : 歌詞の行データ全体（{ line, text, start, end }[]）
// primaryLineIndex: 基準行のlines配列内でのインデックス（generateAnchorLineCandidates()の
//                   戻り値のindexフィールドをそのまま渡す。「この曲に有効な基準行が
//                   1つも無い」場合の安全ガードとしてのみ使う。選ばれる4行の内容には
//                   もう影響しない）。
// options.seed / options.songId / options.questionIndex : 抽選用の乱数の種
//                   （js/lyricsQuizEngine.jsのcreateAnswerPoolRandom()と同じ考え方で、
//                   全端末が同じ入力から同じ4行を再現できるようにする）。
// 戻り値: { hintLevel, segmentId, startLine, endLine, segment }[]（要素数は1〜maxHints、
// 曲名を含まない使える行がmaxHints未満しか無い曲では、それより少なくなることがある）。
// maxHints未満で打ち切られた場合のみ、最後の要素に打ち切り理由stopReason:
// "insufficient-candidates"が付く。maxHintsまで到達できた場合はstopReason:null。
export function buildHintSequence(lines, primaryLineIndex, options = {}) {
  const maxHints = options.maxHints ?? 4;
  const minTextLength = options.minTextLength ?? SEGMENT_GENERATION_DEFAULTS.minTextLength;
  const idealMaxTextLength =
    options.idealMaxTextLength ?? SEGMENT_GENERATION_DEFAULTS.idealMaxTextLength;
  const title = options.title ?? null;
  const titleAliases = options.titleAliases ?? [];
  const seed = options.seed ?? 0;
  const songId = options.songId ?? "";
  const questionIndex = options.questionIndex ?? 0;

  if (!Array.isArray(lines) || lines.length === 0 || primaryLineIndex < 0 || primaryLineIndex >= lines.length) {
    return [];
  }

  const candidates = generateAnchorLineCandidates(lines, { title, titleAliases, minTextLength, idealMaxTextLength });
  const primaryCandidate = candidates[primaryLineIndex];
  if (!primaryCandidate || primaryCandidate.containsTitle) return [];

  // 曲名を含まない・quality>0（0点=曲名を含む・文字数0）の行だけを、歌詞の登場順のまま使う。
  const usable = candidates.filter((c) => !c.containsTitle && c.quality > 0);
  if (usable.length === 0) return [];

  const count = Math.min(maxHints, usable.length);
  const random = createHintSelectionRandom(seed, songId, questionIndex);
  const chosen = pickRandomHintCandidates(usable, random, count);

  // 抽選された順（＝配列の並び順）をそのままhintLevelにする。歌詞の時系列では並べ替えない
  // （並べ替えは呼び出し側の責務。hintLevelと中身の対応を崩さないため、ここでは何もしない）。
  const hints = chosen.map((segment, i) => ({
    hintLevel: i + 1,
    segmentId: segment.id,
    startLine: segment.startLine,
    endLine: segment.endLine,
    segment,
  }));

  // 曲名を含まない使える行がmaxHints未満しか無い曲だけ、打ち切り理由を最後の要素に記録する
  // （js/lyricsQuizScreen.jsのDEBUGログ表示用。歌詞本文は含まない）。
  if (hints.length > 0) {
    hints[hints.length - 1].stopReason = hints.length < maxHints ? "insufficient-candidates" : null;
  }

  return hints;
}

// buildHintSequence()専用の、seed・songId・questionIndexから作る決定論的な乱数生成器。
// js/lyricsQuizEngine.jsのcreateAnswerPoolRandom()と全く同じ考え方（用途を表す文字列
// ":hintSelect"を足してからハッシュ化することで、回答候補の乱数・基準行選びの乱数と
// 出どころが混ざらないようにする）。
function createHintSelectionRandom(seed, songId, questionIndex) {
  const seedSourceValue = computeQuestionRandomValue(seed, `${songId}:hintSelect`, questionIndex);
  const integerSeed = Math.floor(seedSourceValue * 0xffffffff) >>> 0;
  return createSeededRandom(integerSeed);
}

// usable（歌詞の登場順に並んだ、使える1行候補の配列）から、乱数でcount個を選ぶ
// （正規化テキストの重複は除く）。「4つ全部が曲のごく狭い範囲に集中する」極端な結果を
// 避けるため、usable.length > count のときだけ、範囲（startLineの最大-最小）が
// 歌詞全体の範囲の30%未満なら再抽選する（最大6回。改善しなければそれまでで最も
// 範囲が広かった結果を使う。usable.length <= countなら全件を使うだけなので判定不要）。
function pickRandomHintCandidates(usable, random, count) {
  if (count === 0) return [];
  if (usable.length <= count) {
    // 全件を使う。抽選順に意味を持たせるため、順番だけシャッフルする。
    return shuffleArrayInPlace([...usable], random);
  }

  const totalSpan = usable[usable.length - 1].startLine - usable[0].startLine;
  const MIN_SPAN_RATIO = 0.3;
  const MAX_ATTEMPTS = 6;

  let bestAttempt = null;
  let bestSpan = -1;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const picked = pickDistinctRandomCandidates(usable, random, count);
    const span = picked[picked.length - 1]
      ? Math.max(...picked.map((c) => c.startLine)) - Math.min(...picked.map((c) => c.startLine))
      : 0;
    if (span > bestSpan) {
      bestSpan = span;
      bestAttempt = picked;
    }
    if (totalSpan === 0 || span / totalSpan >= MIN_SPAN_RATIO) {
      return picked; // 曲全体に十分散らばっている
    }
  }
  return bestAttempt; // 妥協案：全試行の中で最も範囲が広かった組み合わせを使う
}

// usableをrandomでシャッフルし、先頭からcount件を「正規化テキストが重複しないように」拾う。
function pickDistinctRandomCandidates(usable, random, count) {
  const shuffled = shuffleArrayInPlace([...usable], random);
  const usedNormalizedTexts = new Set();
  const chosen = [];
  for (const candidate of shuffled) {
    if (chosen.length >= count) break;
    if (usedNormalizedTexts.has(candidate.normalizedText)) continue;
    usedNormalizedTexts.add(candidate.normalizedText);
    chosen.push(candidate);
  }
  return chosen;
}

// Fisher-Yatesシャッフル（配列を破壊的に並べ替えて返す）。
function shuffleArrayInPlace(array, random) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// hints（js/lyricsSegmentEngine.jsのbuildHintSequence()の戻り値）から、「今表示すべき
// レベルまでに開いた行」を取り出し、歌詞の登場順（行番号の昇順）に並べ替えたリストを作る。
// オフライン歌詞クイズ（js/lyricsQuizScreen.js）・オンライン正解数/ポイントバトル
// （js/onlineLyricsQuizBattleScreen.js）の両方が使う共通関数（本人指示：ヒント抽選・
// 表示順の並べ替えロジックは可能な範囲で共通化する）。
// 【hintLevelと画面表示順は別物】buildHintSequence()のhintLevelは「抽選された順
// （開放順）」であり、歌詞の時系列とは無関係。そのため画面表示の直前でstartLine昇順に
// 並べ替える。ただし各行が持つ「ヒント◯」のラベル（level）は抽選時のhintLevelのまま
// 変えない（並べ替えても番号は書き換えない）。
// 戻り値: { lineNumber, text, level }[]（levelは元のhintLevel、startLine昇順に整列済み）
export function computeRevealedHintLines(hints, uptoLevel) {
  return hints
    .slice(0, uptoLevel)
    .map((hint) => ({ lineNumber: hint.startLine, text: hint.segment.text, level: hint.hintLevel }))
    .sort((a, b) => a.lineNumber - b.lineNumber);
}

// linesデータ全体から、簡易的な内容ハッシュ（16進数文字列）を作る（FNV-1a、暗号強度は不要）。
// オンライン対戦で「全端末の歌詞データが同じかどうか」を確認する用途にのみ使う。
// 歌詞本文そのものをFirebaseへ送らず、この数値ハッシュだけを送って比較する設計にする
// （本人の指示：Firebaseへ送るのはsongId・segmentId・hintLevel・seed・
// lyricsSetVersionまたはhashだけ）。
export function computeLyricsContentHash(lines) {
  const source = lines.map((line) => `${line.line}:${line.text}:${line.start}:${line.end}`).join("|");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
