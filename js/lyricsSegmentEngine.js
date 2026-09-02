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
// 【方式（2026-10-01、本人指示：ヒント生成の全面再設計）】以前（2026-08-09〜）は
// 「基準行を1つ選び、必ずその基準行を含む範囲を1行ずつ広げる」方式だったが、実際に
// プレイすると「ヒント1〜4がほぼ同じ文章（前のヒントに数語足しただけ）で、4段階の
// 手掛かりというより1つの手掛かりを引き延ばしているだけ」に見える、という本人指摘が
// あった（本人の実機報告：ヒント3とヒント4がほぼ同じ文章で末尾に数語追加されただけ）。
// 新方式は、曲全体からできるだけ離れた（曲名を含まない・quality>0の）独立した1行を
// maxHints個選び、各ヒントを完全に別々の歌詞位置にする（同じ文章を伸ばさない・
// 前のヒントの内容を含まない）。
// 【選び方】使える1行候補（曲名を含まない・quality>0）を歌詞の登場順に並べ、
// maxHints個のグループへほぼ均等に分割し、各グループから1件ずつ選ぶ（曲全体から
// まんべんなく散らばる）。primaryLineIndex（pickPrimarySegment()が既にseedベースの
// 乱数で選んだ基準行）を選び始めの位置として使うことで、同じ曲でも問題ごとに
// （seedが変われば）選ばれる4行の組み合わせ自体も変わる。
// 【ヒント番号と歌詞内の登場順は別物】このプロジェクトの他の場所（画面表示・答え合わせ）
// では、必要に応じてstartLineで並べ替えて使う想定のため、ここではhintLevelを歌詞の
// 登場順（startLine昇順）に割り当てる（hintLevel＝表示順＝歌詞の時系列、という単純な
// 対応関係にしておくことで、呼び出し側が別途並べ替える必要をなくす）。
// 【重複防止】既に選んだ行と正規化テキストが完全に一致する行（サビの再登場等）は
// 選ばない（曲全体の中で、まだ使っていない位置を探す）。
//
// lines           : 歌詞の行データ全体（{ line, text, start, end }[]）
// primaryLineIndex: 基準行のlines配列内でのインデックス（generateAnchorLineCandidates()の
//                   戻り値のindexフィールドをそのまま渡す。開始位置の乱数種として使う）
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
  // primaryLineIndexをusable配列内での開始位置（見つからなければ0）に変換し、
  // そこを基準にmaxHints個のグループへ分割する開始オフセットとして使う
  // （同じ曲でも問題ごとに選ばれる行の組み合わせが変わるようにするため）。
  const startOffset = Math.max(
    0,
    usable.findIndex((c) => c.index === primaryLineIndex)
  );

  const chosen = [];
  const usedNormalizedTexts = new Set();
  const groupSize = usable.length / count;
  for (let group = 0; group < count; group += 1) {
    // グループ内の中央付近を狙い、開始位置ぶんだけ全体を巡回させる（曲の先頭に偏らせない）。
    const idealIndex = Math.floor(group * groupSize + groupSize / 2) + startOffset;
    const candidate = findNearestUnusedCandidate(usable, idealIndex, usedNormalizedTexts);
    if (!candidate) continue; // 全候補が既に使われている（=usable自体がcount未満）場合のみ起こりうる
    usedNormalizedTexts.add(candidate.normalizedText);
    chosen.push(candidate);
  }

  // 歌詞の登場順（startLine昇順）に並べ、その順にhintLevelを1から割り振る
  // （hintLevel＝画面表示順＝歌詞の時系列という単純な対応にする）。
  const sorted = [...chosen].sort((a, b) => a.startLine - b.startLine);
  const hints = sorted.map((segment, i) => ({
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

// usable（歌詞の登場順に並んだ、使える1行候補の配列）から、idealIndex（usable配列内での
// 目標位置、配列の範囲外・負数もありうる）に最も近い「まだ選んでいない（正規化テキストが
// 重複しない）」候補を探す。中心から外側へ交互に1つずつ広げながら探すことで、
// 目標位置から実際の距離が最も近い候補を確実に見つける（サビの繰り返し等で近くの候補が
// 軒並み重複テキストの場合でも、離れた場所にある別の候補まで探しに行く）。
function findNearestUnusedCandidate(usable, idealIndex, usedNormalizedTexts) {
  const n = usable.length;
  const center = Math.max(0, Math.min(n - 1, ((idealIndex % n) + n) % n));
  for (let distance = 0; distance < n; distance += 1) {
    const offsets = distance === 0 ? [0] : [-distance, distance];
    for (const offset of offsets) {
      const idx = (((center + offset) % n) + n) % n;
      const candidate = usable[idx];
      if (!usedNormalizedTexts.has(candidate.normalizedText)) return candidate;
    }
  }
  return null;
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
