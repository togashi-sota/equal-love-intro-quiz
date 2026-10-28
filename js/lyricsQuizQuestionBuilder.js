// 歌詞クイズの「1問分のデータ」を組み立てる層。
// js/questionSource.jsで解決したsongPool（曲IDの配列）と、各曲の歌詞データ
// （js/lyricsStorage.jsから読み込み済みのlines）を受け取り、js/lyricsSegmentEngine.js・
// js/lyricsQuizEngine.jsの純粋関数を使って実際の出題データを組み立てる。
//
// 【テスト方針】中心ロジック（buildLyricsQuizQuestions・filterQuizzableSongs・
// validateLyricsQuizAvailability）は「歌詞データを読み込み済みの曲一覧」を受け取る
// 純粋関数にしてあるため、IndexedDBに触れずにテストできる
// （tests/lyricsQuizQuestionBuilder.test.js参照）。実際にIndexedDBから歌詞データを
// 読み込む部分（loadSongsWithLyrics）だけは薄いラッパーとして分離し、
// tests/lyricsStorage.test.jsと同じ方針（IndexedDBには実際に触れずテストする）を踏襲している。

import { getLyricsDataMany } from "./lyricsStorage.js";
import { resolveSongPool, resolveSongObjects, QUESTION_SOURCE_TYPE } from "./questionSource.js";
import { resolveQuestionCount } from "./quiz.js";
import { generateAnchorLineCandidates, pickPrimarySegment, buildHintSequence } from "./lyricsSegmentEngine.js";
import {
  generateAnswerPool,
  createAnswerPoolRandom,
  validateLyricsQuizQuestionAnswerPool,
  buildFallbackAnswerPool,
} from "./lyricsQuizEngine.js";
import { createSeededRandom } from "./seededRandom.js";
import { computeLyricsUniquenessExclusions } from "./lyricsQuestionUniqueness.js";

// 1曲を「出題可能」とみなすために必要な、曲名を含まない・品質0でない区間候補の最低数。
export const MIN_USABLE_SEGMENTS_REQUIRED = 1;

// 【2026-08-08新設】歌詞クイズの出題・回答候補・曲選択一覧・歌詞充足チェックの
// いずれからも除外する曲のID一覧。Overtureはボーカルの無いインストゥルメンタル曲で、
// そもそも歌詞データが存在しないため（本人指示：「歌詞データ不足」ではなく
// 「最初から歌詞クイズの対象外」として扱う）。イントロクイズ・ランダム再生クイズ・
// タイムアタック・収録曲一覧等、歌詞を使わないモードには一切影響しない
// （これらは引き続きjs/questionSource.jsのresolveSongPool()をそのまま使う）。
// 将来対象外の曲が増える場合は、この配列へ追加するだけで歌詞クイズ関連の全箇所へ反映される。
const LYRICS_QUIZ_INELIGIBLE_SONG_IDS = new Set(["overture"]);

// 曲オブジェクト（js/data/songs.jsの1件）が、歌詞クイズの出題対象になりうるかを判定する。
// 曲選択一覧（js/onlineBattleSongPicker.js）など、曲オブジェクト単位で判定したい箇所で使う。
export function isLyricsQuizEligibleSong(song) {
  return !LYRICS_QUIZ_INELIGIBLE_SONG_IDS.has(song.id);
}

// songPool（曲IDの配列）から、歌詞クイズの対象外の曲を取り除く。
function filterLyricsQuizEligibleSongPool(songPool) {
  return songPool.filter((songId) => !LYRICS_QUIZ_INELIGIBLE_SONG_IDS.has(songId));
}

// js/questionSource.jsのresolveSongPool()を、歌詞クイズ向けに包んだもの。
// 歌詞クイズに関係する呼び出し元（1人用歌詞クイズ・オンライン歌詞クイズ対戦の設定検証・
// 問題生成・歌詞充足チェック）は、resolveSongPool()を直接使わず必ずこちらを使うことで、
// 「歌詞クイズの出題対象曲数」の意味を全箇所で一致させる（対象外の曲を毎回別々に
// 除外するコードを書かずに済む）。
export function resolveLyricsQuizSongPool(questionSource) {
  return filterLyricsQuizEligibleSongPool(resolveSongPool(questionSource));
}

// songPool（曲IDの配列）から、実際に歌詞データがIndexedDBに読み込まれている曲だけを、
// { song, lines } の形で返す（IndexedDBに実際に触れる、薄いラッパー関数。単体テスト対象外）。
// 【2026-10-28改訂・本人指示：入室を速くする】1曲ずつデータベースを開く方式から、1回の読み取りで
// まとめて取得する方式（getLyricsDataMany()）に変えた。戻り値（並び順・中身）は以前と全く同じ。
export async function loadSongsWithLyrics(songPool) {
  const songs = resolveSongObjects(songPool);
  const recordsBySongId = await getLyricsDataMany(songs.map((song) => song.id));
  return songs
    .map((song) => {
      const record = recordsBySongId.get(song.id);
      return record ? { song, lines: record.lines } : null;
    })
    .filter((entry) => entry !== null);
}

// ===== 答えが1曲に決まらない行の除外（2026-10-28新設・本人指示） =====
//
// 同じフレーズが複数の曲に出てくると「正解が2曲以上ある問題」になってしまうため、
// js/lyricsQuestionUniqueness.jsの共通フィルターで「別の曲にも出てくる行・短すぎる行・
// 手作業で除外した行」をヒント候補から外す。1人用・オンライン対戦・パーティーの
// 歌詞クイズは、すべてこのファイルの関数を通るため、全モードで同じ判定になる。
//
// lyricsUniqueness（省略可）: {
//   enabled,        // false のときだけ除外しない（古い端末と同じ部屋で対戦するときの互換用。既定はtrue）
//   corpusEntries,  // 比較相手に追加する { song, lines }[]（songsWithLyrics自身は常に比較相手に入る）
// }
// songsWithLyricsの各要素が uniqueExcludedLineNumbers（行番号の配列）を持っている場合は、
// それを優先して使う（loadSongsWithLyricsForUniqueQuiz()が、端末にある全曲の歌詞と
// 比べて事前に計算したもの。1曲だけ渡して問題を作るパーティーの差し替え問題でも、
// 全曲と比べた結果がそのまま使われるようにするため）。
// 戻り値: Map<songId, number[]>（出題しない行番号）
//
// 【計算の使い回し】全曲（約80曲）を比べる計算は端末によっては数百ミリ秒かかるため、
// 同じsongsWithLyrics配列（オンライン対戦の開始前チェック→問題生成のように、同じ配列が
// 続けて渡される）に対しては、1回目の結果を使い回す。比較相手を追加で渡された場合
// （corpusEntriesあり）は、組み合わせが毎回違いうるので使い回さない。
const uniquenessExclusionsCache = new WeakMap();

function resolveUniquenessExclusions(songsWithLyrics, lyricsUniqueness = {}) {
  if (lyricsUniqueness.enabled === false) return new Map();
  const canCache = !lyricsUniqueness.corpusEntries && Array.isArray(songsWithLyrics);
  if (canCache && uniquenessExclusionsCache.has(songsWithLyrics)) {
    return uniquenessExclusionsCache.get(songsWithLyrics);
  }
  const exclusions = computeUniquenessExclusionsWithoutCache(songsWithLyrics, lyricsUniqueness);
  if (canCache) uniquenessExclusionsCache.set(songsWithLyrics, exclusions);
  return exclusions;
}

function computeUniquenessExclusionsWithoutCache(songsWithLyrics, lyricsUniqueness) {
  const exclusions = new Map();

  const needsComputation = [];
  for (const entry of songsWithLyrics) {
    if (Array.isArray(entry.uniqueExcludedLineNumbers)) {
      exclusions.set(entry.song.id, entry.uniqueExcludedLineNumbers);
    } else {
      needsComputation.push(entry);
    }
  }
  if (needsComputation.length > 0) {
    const computed = computeLyricsUniquenessExclusions(needsComputation, {
      corpusEntries: [...songsWithLyrics, ...(lyricsUniqueness.corpusEntries ?? [])],
    });
    for (const [songId, lineNumbers] of computed) exclusions.set(songId, [...lineNumbers]);
  }
  return exclusions;
}

// 対象の曲（targetEntries）に、端末にある歌詞（corpusEntries）全体と比べた
// 「出題しない行番号」を付けた新しい配列を返す（元の配列・要素は書き換えない）。純粋関数。
export function annotateLyricsUniqueness(targetEntries, corpusEntries) {
  const exclusions = computeLyricsUniquenessExclusions(targetEntries, { corpusEntries });
  return targetEntries.map((entry) => ({
    ...entry,
    uniqueExcludedLineNumbers: [...(exclusions.get(entry.song.id) ?? [])],
  }));
}

// 1人用・パーティー（1台の端末だけで完結するモード）向けの読み込み。songPoolの曲の歌詞に加えて、
// 端末にある「歌詞クイズ対象の全曲」の歌詞も読み込み、それと比べた除外行を付けて返す
// （出題範囲を「表題曲のみ」等に絞っていても、範囲外の曲と同じフレーズは出題しないため）。
// 戻り値の並びはloadSongsWithLyrics(songPool)と同じ（songPoolの順）。
// 【オンライン対戦では使わない】端末ごとに持っている曲が違うと除外行がずれ、全員が同じ問題を
// 見られなくなるため。オンライン対戦は、全員が持っている出題範囲の曲どうしの比較＋
// 事前計算の一覧（js/data/lyricsAmbiguityIndex.js）で判定する（js/battleModes/lyricsQuizBattleMode.js）。
export async function loadSongsWithLyricsForUniqueQuiz(songPool) {
  const allEligibleIds = resolveLyricsQuizSongPool({ type: QUESTION_SOURCE_TYPE.ALL_SONGS });
  const allIds = [...new Set([...allEligibleIds, ...songPool])];
  const allEntries = await loadSongsWithLyrics(allIds);
  const entryById = new Map(allEntries.map((entry) => [entry.song.id, entry]));
  const poolEntries = songPool.map((songId) => entryById.get(songId)).filter((entry) => entry !== undefined);
  return annotateLyricsUniqueness(poolEntries, allEntries);
}

// 1曲分の { song, lines } から、出題に使える基準行候補（曲名を含まない・quality>0・
// 答えが1曲に決まらない行ではない）の件数を返す。
function countUsableSegments(song, lines, excludedLineNumbers = []) {
  const candidates = generateAnchorLineCandidates(lines, {
    title: song.title,
    titleAliases: song.searchAliases,
    excludedLineNumbers,
  });
  return candidates.filter((candidate) => !candidate.containsTitle && candidate.quality > 0).length;
}

// 【2026-10-28追加・本人指示：開始を速くする】1曲分の「使える基準行の数」の使い回し。
// オンライン対戦の開始時は、開始前チェック（validateLyricsQuizAvailability：除外あり・なしで3回）と
// 問題生成（buildLyricsQuizQuestions：1回）で、同じ曲について同じ計算を約4回くり返していた
// （約80曲ではスマホで数百ミリ秒、画面が固まる原因の1つ）。
// 計算に使うのは「曲（song）・歌詞（lines）・除外する行番号の配列」だけなので、同じ曲の要素
// （entryオブジェクト）と同じ除外配列の組み合わせなら、結果は必ず同じ。要素のオブジェクトごとに
// 覚えておく（要素が使われなくなれば自動で消える）。歌詞データは読み込むたびに新しい要素になるので、
// 歌詞を入れ替えた後に古い結果が使われることはない。
const NO_EXCLUDED_LINES = Object.freeze([]);
const usableSegmentCountCache = new WeakMap();

function countUsableSegmentsForEntry(entry, excludedLineNumbers) {
  const key = excludedLineNumbers ?? NO_EXCLUDED_LINES;
  let perEntry = usableSegmentCountCache.get(entry);
  if (!perEntry) {
    perEntry = new Map();
    usableSegmentCountCache.set(entry, perEntry);
  }
  if (perEntry.has(key) && perEntry.get(key).lines === entry.lines) return perEntry.get(key).count;
  const count = countUsableSegments(entry.song, entry.lines, key);
  perEntry.set(key, { lines: entry.lines, count });
  return count;
}

function filterQuizzableWithExclusions(songsWithLyrics, exclusions) {
  return songsWithLyrics.filter(
    (entry) => countUsableSegmentsForEntry(entry, exclusions.get(entry.song.id) ?? NO_EXCLUDED_LINES) >= MIN_USABLE_SEGMENTS_REQUIRED
  );
}

// songsWithLyrics（{song, lines}[]）から、実際に歌詞クイズの出題対象にできる曲だけに絞り込む
// （区間候補が少なすぎる曲＝歌詞が極端に短い・ほぼ曲名だらけ・全部の行が他の曲と重複している
// 等は出題対象から除外する）。純粋関数（IndexedDBに触れない）。
export function filterQuizzableSongs(songsWithLyrics, lyricsUniqueness = {}) {
  return filterQuizzableWithExclusions(songsWithLyrics, resolveUniquenessExclusions(songsWithLyrics, lyricsUniqueness));
}

// 歌詞データはあるのに「全部の行が他の曲と重複している等で、答えが1曲に決まる行が無い」ため
// 出題できない曲の数（案内文・デバッグ表示用）。
export function countSongsExcludedByUniqueness(songsWithLyrics, lyricsUniqueness = {}) {
  if (lyricsUniqueness.enabled === false) return 0;
  const withoutFilter = filterQuizzableWithExclusions(songsWithLyrics, new Map()).length;
  return withoutFilter - filterQuizzableSongs(songsWithLyrics, lyricsUniqueness).length;
}

// 歌詞クイズが指定の出題数で開始できる状態かを検証する。
// js/questionSource.jsのvalidateSongPoolForQuestionCount()と同じ戻り値の形にしてあり、
// 呼び出し側（画面）で同じような分岐処理を書ける。
// 戻り値: { ok: true, quizzableCount } または
//         { ok: false, quizzableCount, requiredCount, reason }（requiredCountは"all"のときnull）
export function validateLyricsQuizAvailability(songsWithLyrics, questionCountValue, lyricsUniqueness = {}) {
  const quizzableCount = filterQuizzableSongs(songsWithLyrics, lyricsUniqueness).length;
  // 【2026-10-28追加】歌詞が他の曲と重複していて出題できない曲がある場合は、理由に一言添える
  // （「歌詞を読み込んだのに足りない」と言われて混乱しないように）。
  const excludedByUniqueness = countSongsExcludedByUniqueness(songsWithLyrics, lyricsUniqueness);
  const uniquenessNote =
    excludedByUniqueness > 0
      ? `（うち${excludedByUniqueness}曲は、歌詞が他の曲と重複していて答えが1曲に決まらないため出題できません）`
      : "";

  if (questionCountValue === "all") {
    if (quizzableCount === 0) {
      return {
        ok: false,
        quizzableCount,
        requiredCount: null,
        reason: `歌詞クイズに出題できる曲がありません（歌詞データの読み込み、または曲の追加が必要です）。${uniquenessNote}`,
      };
    }
    return { ok: true, quizzableCount };
  }

  const requiredCount = Number(questionCountValue);
  if (quizzableCount < requiredCount) {
    return {
      ok: false,
      quizzableCount,
      requiredCount,
      reason: `歌詞クイズに出題できる曲が足りません（${requiredCount}曲必要ですが、${quizzableCount}曲しかありません）。${uniquenessNote}`,
    };
  }
  return { ok: true, quizzableCount };
}

// quizzableな { song, lines } 一覧から、questionCount件をシャッフルして選ぶ。
// js/quiz.jsのpickQuestionSongs()と同じFisher-Yatesアルゴリズムを、{song, lines}の形の
// ままローカルに実装している（quiz.jsの関数はsong単体の配列専用のため、そのまま流用できない）。
function pickQuestionEntries(entries, count, randomFn) {
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// songsWithLyrics・songPool・出題数・回答候補数・seedから、歌詞クイズの問題セットを
// 決定論的に組み立てる（純粋関数、IndexedDBに触れない）。
// seed・songPool・songsWithLyricsの中身が全端末で同じなら、常に同じ問題セットになる
// （オンライン対戦での利用を見据えた設計。1人用MVPでは呼び出し側がMath.random由来の
// seedを1回だけ生成して渡す想定）。
//
// 戻り値: {
//   song,               // 正解の曲（songs.jsの曲オブジェクト）
//   hints,              // buildHintSequence()の戻り値（最大4段階、各要素にsegment（text等）を含む）
//   answerPool,         // generateAnswerPool()の戻り値（正解＋誤答の曲一覧、表示順込み）
// }[]
// 【2026-10-01追加・本人指示：正解プールと不正解候補プールの分離】distractorSongPool
// （曲IDの配列）を省略した場合は今までどおりsongPool自身が回答候補の母集団になる
// （通常の入り口・苦手曲モード等、既存の呼び出し元は無変更）。オリジナル問題作成モードの
// 歌詞クイズタイプだけ、songPool（選んだ曲＝正解の出題対象）とは別に、カテゴリー全体を
// distractorSongPoolとして渡す（js/lyricsQuizScreen.js参照）。
export function buildLyricsQuizQuestions({
  songsWithLyrics,
  songPool,
  distractorSongPool = songPool,
  questionCountValue,
  answerPoolSizeValue,
  seed,
  lyricsUniqueness = {},
}) {
  // 【2026-10-28追加】答えが1曲に決まらない行を、出題前に1回だけまとめて求める
  // （resolveUniquenessExclusions()参照。同じ入力なら全端末で同じ結果になる純粋な計算）。
  const exclusions = resolveUniquenessExclusions(songsWithLyrics, lyricsUniqueness);
  const quizzable = filterQuizzableWithExclusions(songsWithLyrics, exclusions);
  const questionCount = resolveQuestionCount(questionCountValue, quizzable.length);
  const random = createSeededRandom(seed);
  const questionEntries = pickQuestionEntries(quizzable, questionCount, random);
  const poolSongs = resolveSongObjects(distractorSongPool);

  const questions = questionEntries.map((entry, questionIndex) => {
    const excludedLineNumbers = exclusions.get(entry.song.id) ?? [];
    const candidates = generateAnchorLineCandidates(entry.lines, {
      title: entry.song.title,
      titleAliases: entry.song.searchAliases,
      excludedLineNumbers,
    });
    const primary = pickPrimarySegment(candidates, seed, entry.song.id, questionIndex);
    const hints = primary
      ? buildHintSequence(entry.lines, primary.index, {
          title: entry.song.title,
          titleAliases: entry.song.searchAliases,
          excludedLineNumbers,
          maxHints: 4,
          seed,
          songId: entry.song.id,
          questionIndex,
        })
      : [];
    const answerRandom = createAnswerPoolRandom(seed, entry.song.id, questionIndex);
    // 【2026-11-XX修正・本人指示：不正解候補プールに正解曲が含まれない重大バグ】
    // poolSongs（distractorSongPool＝設定したカテゴリー全体）に、この問題の正解曲自体が
    // 含まれていない場合がある（例：カテゴリーを「表題曲のみ」にしたまま、全員曲を選んで
    // 出題した場合）。generateAnswerPool()は正解曲が母集団に無いと空配列を返す仕様のため、
    // 何も気づかれないまま回答候補が0件になる（js/instantChallengeScreen.jsの
    // buildInstantChallengeQuestion()と同じ原因・同じ修正方針）。
    const answerPoolSource = poolSongs.some((candidate) => candidate.id === entry.song.id)
      ? poolSongs
      : [entry.song, ...poolSongs];
    const answerPool = generateAnswerPool(answerPoolSource, entry.song.id, answerPoolSizeValue, answerRandom);

    // 【2026-09-26新設・本人指示：サウンドシステム全面整備9章】
    // 【2026-10-01改訂・本人指示：回答時点のヒント位置から答え合わせ再生】以前は常に
    // 「ヒント1」の歌詞位置から答え合わせ楽曲を再生していたが、「本人がどのヒントまで見て
    // 回答したか」に応じて、その人自身が最後に開いていたヒントの歌詞位置から再生する
    // 仕様に変更した（js/onlineLyricsQuizBattleScreen.jsが、回答時に保存した
    // lastRevealedHintLevelを使ってrevealStartTimeSecByHintLevelを引く）。
    // hints[i].startLineとentry.lines（歌詞データ本体、js/lyricsStorage.jsが保存する
    // start/end秒つきの行データ）を突き合わせて、レベルごとの開始秒数を求める。
    // 歌詞データに秒数が保存されていない行は含めない（呼び出し側は0秒から再生する等、
    // 安全にフォールバックする）。
    const revealStartTimeSecByHintLevel = {};
    hints.forEach((hint) => {
      const hintLine = entry.lines.find((line) => line.line === hint.startLine);
      if (typeof hintLine?.start === "number") {
        revealStartTimeSecByHintLevel[hint.hintLevel] = hintLine.start;
      }
    });
    // 後方互換：hints[0]（ヒント1）の位置を、従来どおりrevealStartTimeSecとしても持たせる
    // （まだヒントを1つも開いていない状態からの回答等、フォールバック用）。
    const revealStartTimeSec = revealStartTimeSecByHintLevel[1] ?? null;

    return { song: entry.song, hints, answerPool, revealStartTimeSec, revealStartTimeSecByHintLevel };
  });

  // 最終防衛ライン（2026-08-07追加）：「正解曲が選択肢に存在しない」不具合の再発防止。
  // 生成された各問題を検証し、条件を満たさない場合はシャッフルを使わない決定論的な
  // フォールバックで作り直す。フォールバックでも正解曲がsongPool自体に見つからない
  // （＝そもそも出題対象として不適格）場合だけ、その問題を安全に除外する
  // （不正な問題をそのまま出題することだけは絶対に避ける、という方針）。
  return questions
    .map((question) => {
      if (validateLyricsQuizQuestionAnswerPool(question).ok) return question;

      // フォールバックも同じ理由で、正解曲を確実に含むプールから作り直す。
      const fallbackPoolSongs = poolSongs.some((candidate) => candidate.id === question.song.id)
        ? poolSongs
        : [question.song, ...poolSongs];
      const fallbackAnswerPool = buildFallbackAnswerPool(fallbackPoolSongs, question.song.id, answerPoolSizeValue);
      if (!fallbackAnswerPool) {
        // eslint-disable-next-line no-console
        console.warn(
          `歌詞クイズ：正解曲(${question.song.id})がsongPoolに見つからないため、この問題を除外しました。`
        );
        return null;
      }
      return { ...question, answerPool: fallbackAnswerPool };
    })
    .filter((question) => question !== null);
}
