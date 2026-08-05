// 歌詞クイズモード用の「歌詞区間（ヒントとして出す範囲）」を、既存の同期歌詞データ
// （js/lyricsStorage.jsが保持する { line, text, start, end } の配列）から自動生成する
// 純粋関数群。UI・IndexedDBアクセスは一切行わない（js/randomPlaybackEngine.jsと同じ設計方針）。
//
// 【重要・著作権】このファイルは歌詞本文を一切保持しない。呼び出し側が渡したlinesデータ
// （本人がすでに用意・保存済みの歌詞）をその場で処理して区間候補を返すだけで、
// 区間データを新たにファイルへ保存する設計にはしていない（次の「設計方針」も参照）。
//
// 【設計方針：区間は保存せず、常にlinesから計算し直す】
// 本人からの依頼では `lyricsSegments/{songId}/segments` のような専用ストアへ区間を
// 事前生成・保存する案が示されていたが、実装時に次の理由から「区間は保存せず、
// linesさえあれば毎回同じ区間候補を再現する」方式へ変更した（無駄なデータ複製が
// 増える場合は別案を提案してよい、という依頼どおりの判断）。
//   1. 区間のtext・normalizedTextは、既存のlinesデータから100%再構成できる
//      （区間だけを別ストアに保存すると、歌詞本文の複製が単純に2倍に増える）。
//   2. 歌詞データ（lines）を読み込み直した場合、区間側も自動的に最新の内容に追従する
//      （保存された古い区間データが残り続ける、というズレの心配がない）。
//   3. 区間のidをstartLine-endLineから決定論的に作っているため、人間が確認・除外した
//      結果（どのidを除外したか等）だけを軽量なオーバーレイとして別途保存すれば、
//      区間本体を複製せずに人間の確認結果を反映できる
//      （オーバーレイのデータ層はjs/lyricsQuizStorage.js側で扱う想定。未実装）。
//
// 【オンライン対戦の公平性について】区間そのものをFirebaseへ送らず、
// computeLyricsContentHash()で作った内容ハッシュだけを送って、全端末のlinesデータが
// 一致しているかどうかを確認する設計にする（歌詞本文をFirebaseへ送らないという
// 本人の方針どおり）。

import { computeQuestionRandomValue } from "./randomPlaybackEngine.js";

// 区間候補を作るときの既定値。
// maxWindowLines   : 1つの区間に含める最大行数（1〜この値の範囲で候補を作る）
// maxLineGapSec    : 前の行のendから次の行のstartまでの間隔がこれを超える場合、
//                    間奏・場面転換とみなして区間をまたがない（「空行」に相当するデータが
//                    このスキーマには存在しないため、代わりに時間の空白を区切りの目安にする）
// minTextLength    : 正規化後の文字数がこれ未満の区間は短すぎるとみなし品質を下げる
// idealMaxTextLength: 正規化後の文字数がこれ以下ならヒントとして読みやすい長さとみなす
export const SEGMENT_GENERATION_DEFAULTS = {
  maxWindowLines: 4,
  maxLineGapSec: 3,
  minTextLength: 6,
  idealMaxTextLength: 40,
};

// 文の区切りとみなす記号。この記号で終わる行に達したら、それ以上windowを広げない
// （「文章として不自然になる」ことを避けるための、句読点を使った区切り判定）。
const TERMINAL_PUNCTUATION_PATTERN = /[。！？!?…]$/;

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
// 同じ範囲の行なら、何度計算し直しても必ず同じidになる（人間による除外設定を
// 「id一覧」として別途保存する際に、区間本体を保存し直さずに済むようにするため）。
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
// 減点はするが0点にはしない（1回だけなら出題候補として使ってよいため、呼び出し側が
// 「同じセリフの繰り返し」をどこまで許容するかを選べるようにしている）。
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

// 歌詞の行データ（lines）から、ヒント候補となる区間を自動生成する。
//
// 【生成方法】各行を起点に、1行〜maxWindowLines行までの「連続する行のまとまり」を
// すべて候補として作る（行の途中で切ることは絶対にしない＝常に行の境界で区切るため、
// 「単語の途中で切れる」問題は構造的に発生しない）。ただし次の場合はwindowをそこで止める：
//   ・前の行との間隔がmaxLineGapSecを超える（間奏等の区切りをまたがない）
//   ・行の末尾が句読点等（。！？…）で終わっている（文の区切りを尊重する）
//
// 【戻り値】{ id, startLine, endLine, text, normalizedText, containsTitle, quality, isRepeat }[]
// 呼び出し側（js/lyricsSegmentEngine.jsのpickPrimarySegment・buildHintSequence、または
// UI側）が、quality・containsTitleを見て実際に使う区間を選ぶ想定。
//
// options.title・options.titleAliases を渡すと曲名含有判定を行う（省略時はcontainsTitleは
// 常にfalseになる＝呼び出し側で別途曲名判定をしたい場合に対応）。
export function generateLyricsSegments(lines, options = {}) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  const maxWindowLines = options.maxWindowLines ?? SEGMENT_GENERATION_DEFAULTS.maxWindowLines;
  const maxLineGapSec = options.maxLineGapSec ?? SEGMENT_GENERATION_DEFAULTS.maxLineGapSec;
  const minTextLength = options.minTextLength ?? SEGMENT_GENERATION_DEFAULTS.minTextLength;
  const idealMaxTextLength =
    options.idealMaxTextLength ?? SEGMENT_GENERATION_DEFAULTS.idealMaxTextLength;
  const title = options.title ?? null;
  const titleAliases = options.titleAliases ?? [];

  const segments = [];
  const firstOccurrenceByNormalizedText = new Map();

  for (let startIndex = 0; startIndex < lines.length; startIndex += 1) {
    for (let windowSize = 1; windowSize <= maxWindowLines; windowSize += 1) {
      const endIndex = startIndex + windowSize - 1;
      if (endIndex >= lines.length) break;

      if (windowSize > 1) {
        const previousLine = lines[endIndex - 1];
        const currentLine = lines[endIndex];
        if (hasLargeGap(previousLine, currentLine, maxLineGapSec)) break;
      }

      const windowLines = lines.slice(startIndex, endIndex + 1);
      const text = windowLines.map((line) => line.text).join("\n");
      const normalizedText = normalizeLyricsQuizText(text);
      const containsTitle = title ? containsSongTitle(normalizedText, title, titleAliases) : false;
      const isRepeat = firstOccurrenceByNormalizedText.has(normalizedText);
      if (!isRepeat) {
        firstOccurrenceByNormalizedText.set(normalizedText, true);
      }

      const segment = {
        id: buildSegmentId(windowLines[0].line, windowLines[windowLines.length - 1].line),
        startLine: windowLines[0].line,
        endLine: windowLines[windowLines.length - 1].line,
        text,
        normalizedText,
        containsTitle,
        isRepeat,
        quality: 0,
      };
      segment.quality = scoreSegmentQuality(segment, { minTextLength, idealMaxTextLength });

      segments.push(segment);

      const lastLineText = windowLines[windowLines.length - 1].text.trim();
      if (TERMINAL_PUNCTUATION_PATTERN.test(lastLineText)) break;
    }
  }

  return segments;
}

// 1問分の「ヒント1として最初に見せる区間」を、候補の中から決定論的に選ぶ。
// seed・songId・questionIndexが同じなら常に同じ区間が選ばれる
// （オンライン対戦で全端末が同じ問題を出題するために必須。
// js/randomPlaybackEngine.jsのcomputeRandomStartTimeSec()と同じ設計方針）。
//
// 【選び方】quality上位topN件（既定5件）に絞り、その中からseedベースの乱数で1件選ぶ。
// 「常に一番qualityが高い区間だけが毎回選ばれ続けて単調にならない」ための工夫。
// containsTitleがtrueの区間、quality0の区間は最初から候補に含めない。
export function pickPrimarySegment(segments, seed, songId, questionIndex, options = {}) {
  const topN = options.topN ?? 5;
  const usable = segments.filter((segment) => !segment.containsTitle && segment.quality > 0);
  if (usable.length === 0) return null;

  const sorted = [...usable].sort(
    (a, b) => b.quality - a.quality || a.id.localeCompare(b.id)
  );
  const pool = sorted.slice(0, Math.min(topN, sorted.length));

  // 回答候補の並び替え（js/lyricsQuizEngine.js）と乱数の出どころが混ざらないよう、
  // songIdに用途を表す文字列を足してからハッシュ化する。
  const randomValue = computeQuestionRandomValue(seed, `${songId}:hint`, questionIndex);
  const index = Math.min(Math.floor(randomValue * pool.length), pool.length - 1);
  return pool[index];
}

// currentSegmentの前後どちらかに1行だけ広げた区間を、既存の候補一覧から探す。
// 前後両方に候補がある場合は、qualityが高い方を優先する。見つからなければnull。
function findExpandedSegment(segments, currentSegment) {
  const candidates = segments.filter((segment) => {
    const expandsForward =
      segment.startLine === currentSegment.startLine && segment.endLine === currentSegment.endLine + 1;
    const expandsBackward =
      segment.startLine === currentSegment.startLine - 1 && segment.endLine === currentSegment.endLine;
    return (expandsForward || expandsBackward) && segment.quality > 0 && !segment.containsTitle;
  });
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.quality - a.quality)[0];
}

// まだ使っていない区間の中から、次に使う候補（qualityが最も高いもの）を1件返す。
// なければnull。
function findNextBestUnusedSegment(segments, usedIds) {
  const candidates = segments.filter(
    (segment) => !usedIds.has(segment.id) && segment.quality > 0 && !segment.containsTitle
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.quality - a.quality)[0];
}

function toHintEntry(segment, hintLevel) {
  return { hintLevel, segmentId: segment.id, startLine: segment.startLine, endLine: segment.endLine };
}

// 1問分のヒント進行（最大maxHints段階、既定4段階）を決定論的に生成する。
//
// 【方式】同じ区間を広げる（前後に1行ずつ足す）ことを基本とし、これ以上広げられない
// （曲の端に達した・間奏をまたぐ等で「1行広い版」の候補が存在しない）場合だけ、
// 別の高品質な未使用区間へ切り替える（本人の指示どおりのフォールバック方式）。
//
// segments        : generateLyricsSegments()の戻り値（1曲分、全候補）
// primarySegmentId: ヒント1として使う区間のid（pickPrimarySegment()の戻り値のid）
// 戻り値: { hintLevel, segmentId, startLine, endLine }[]（要素数は1〜maxHints、
// 候補が尽きた場合はmaxHintsより少なくなることがある）
export function buildHintSequence(segments, primarySegmentId, maxHints = 4) {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const primary = byId.get(primarySegmentId);
  if (!primary || primary.containsTitle) return [];

  const hints = [toHintEntry(primary, 1)];
  const usedIds = new Set([primary.id]);
  let currentSegment = primary;

  for (let level = 2; level <= maxHints; level += 1) {
    const expanded = findExpandedSegment(segments, currentSegment);
    const next =
      expanded && !usedIds.has(expanded.id) ? expanded : findNextBestUnusedSegment(segments, usedIds);
    if (!next) break;

    currentSegment = next;
    usedIds.add(currentSegment.id);
    hints.push(toHintEntry(currentSegment, level));
  }

  return hints;
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
