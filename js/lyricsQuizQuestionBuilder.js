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

import { getLyricsData } from "./lyricsStorage.js";
import { resolveSongPool, resolveSongObjects } from "./questionSource.js";
import { resolveQuestionCount } from "./quiz.js";
import { generateAnchorLineCandidates, pickPrimarySegment, buildHintSequence } from "./lyricsSegmentEngine.js";
import {
  generateAnswerPool,
  createAnswerPoolRandom,
  validateLyricsQuizQuestionAnswerPool,
  buildFallbackAnswerPool,
} from "./lyricsQuizEngine.js";
import { createSeededRandom } from "./seededRandom.js";

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
export async function loadSongsWithLyrics(songPool) {
  const songs = resolveSongObjects(songPool);
  const entries = await Promise.all(
    songs.map(async (song) => {
      const record = await getLyricsData(song.id);
      return record ? { song, lines: record.lines } : null;
    })
  );
  return entries.filter((entry) => entry !== null);
}

// 1曲分の { song, lines } から、出題に使える基準行候補（曲名を含まない・quality>0）の件数を返す。
function countUsableSegments(song, lines) {
  const candidates = generateAnchorLineCandidates(lines, { title: song.title, titleAliases: song.searchAliases });
  return candidates.filter((candidate) => !candidate.containsTitle && candidate.quality > 0).length;
}

// songsWithLyrics（{song, lines}[]）から、実際に歌詞クイズの出題対象にできる曲だけに絞り込む
// （区間候補が少なすぎる曲＝歌詞が極端に短い・ほぼ曲名だらけ等は出題対象から除外する）。
// 純粋関数（IndexedDBに触れない）。
export function filterQuizzableSongs(songsWithLyrics) {
  return songsWithLyrics.filter(
    ({ song, lines }) => countUsableSegments(song, lines) >= MIN_USABLE_SEGMENTS_REQUIRED
  );
}

// 歌詞クイズが指定の出題数で開始できる状態かを検証する。
// js/questionSource.jsのvalidateSongPoolForQuestionCount()と同じ戻り値の形にしてあり、
// 呼び出し側（画面）で同じような分岐処理を書ける。
// 戻り値: { ok: true, quizzableCount } または
//         { ok: false, quizzableCount, requiredCount, reason }（requiredCountは"all"のときnull）
export function validateLyricsQuizAvailability(songsWithLyrics, questionCountValue) {
  const quizzableCount = filterQuizzableSongs(songsWithLyrics).length;

  if (questionCountValue === "all") {
    if (quizzableCount === 0) {
      return {
        ok: false,
        quizzableCount,
        requiredCount: null,
        reason: "歌詞クイズに出題できる曲がありません（歌詞データの読み込み、または曲の追加が必要です）。",
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
      reason: `歌詞クイズに出題できる曲が足りません（${requiredCount}曲必要ですが、${quizzableCount}曲しかありません）。`,
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
export function buildLyricsQuizQuestions({
  songsWithLyrics,
  songPool,
  questionCountValue,
  answerPoolSizeValue,
  seed,
}) {
  const quizzable = filterQuizzableSongs(songsWithLyrics);
  const questionCount = resolveQuestionCount(questionCountValue, quizzable.length);
  const random = createSeededRandom(seed);
  const questionEntries = pickQuestionEntries(quizzable, questionCount, random);
  const poolSongs = resolveSongObjects(songPool);

  const questions = questionEntries.map((entry, questionIndex) => {
    const candidates = generateAnchorLineCandidates(entry.lines, {
      title: entry.song.title,
      titleAliases: entry.song.searchAliases,
    });
    const primary = pickPrimarySegment(candidates, seed, entry.song.id, questionIndex);
    const hints = primary
      ? buildHintSequence(entry.lines, primary.index, {
          title: entry.song.title,
          titleAliases: entry.song.searchAliases,
          maxHints: 4,
        })
      : [];
    const answerRandom = createAnswerPoolRandom(seed, entry.song.id, questionIndex);
    const answerPool = generateAnswerPool(poolSongs, entry.song.id, answerPoolSizeValue, answerRandom);

    // 【2026-09-26新設・本人指示：サウンドシステム全面整備9章】答え合わせ中に流す楽曲を、
    // 可能な範囲で「ヒント1」の歌詞が始まる位置から再生するための時間（秒）。
    // entry.lines（歌詞データ本体、js/lyricsStorage.jsが保存するstart/end秒つきの行データ）と
    // hints[0].startLine（buildHintSequence()が返す、ヒント1に対応する行番号）を突き合わせて
    // 求める。歌詞データに秒数が保存されていない曲・ヒントが1つも作れなかった曲では
    // nullになる（呼び出し側は0秒から再生する等、安全にフォールバックする）。
    const firstHintLine = hints[0] ? entry.lines.find((line) => line.line === hints[0].startLine) : null;
    const revealStartTimeSec = typeof firstHintLine?.start === "number" ? firstHintLine.start : null;

    return { song: entry.song, hints, answerPool, revealStartTimeSec };
  });

  // 最終防衛ライン（2026-08-07追加）：「正解曲が選択肢に存在しない」不具合の再発防止。
  // 生成された各問題を検証し、条件を満たさない場合はシャッフルを使わない決定論的な
  // フォールバックで作り直す。フォールバックでも正解曲がsongPool自体に見つからない
  // （＝そもそも出題対象として不適格）場合だけ、その問題を安全に除外する
  // （不正な問題をそのまま出題することだけは絶対に避ける、という方針）。
  return questions
    .map((question) => {
      if (validateLyricsQuizQuestionAnswerPool(question).ok) return question;

      const fallbackAnswerPool = buildFallbackAnswerPool(poolSongs, question.song.id, answerPoolSizeValue);
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
