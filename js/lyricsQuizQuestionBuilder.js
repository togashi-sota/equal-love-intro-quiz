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
import { resolveSongObjects } from "./questionSource.js";
import { resolveQuestionCount } from "./quiz.js";
import { generateLyricsSegments, pickPrimarySegment, buildHintSequence } from "./lyricsSegmentEngine.js";
import { generateAnswerPool, createAnswerPoolRandom } from "./lyricsQuizEngine.js";
import { createSeededRandom } from "./seededRandom.js";

// 1曲を「出題可能」とみなすために必要な、曲名を含まない・品質0でない区間候補の最低数。
export const MIN_USABLE_SEGMENTS_REQUIRED = 1;

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

// 1曲分の { song, lines } から、出題に使える区間候補（曲名を含まない・quality>0）の件数を返す。
function countUsableSegments(song, lines) {
  const segments = generateLyricsSegments(lines, { title: song.title, titleAliases: song.searchAliases });
  return segments.filter((segment) => !segment.containsTitle && segment.quality > 0).length;
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
//   segments,           // その曲の全区間候補（デバッグ・エディター用にそのまま含める）
//   hints,              // buildHintSequence()の戻り値（最大4段階）
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

  return questionEntries.map((entry, questionIndex) => {
    const segments = generateLyricsSegments(entry.lines, {
      title: entry.song.title,
      titleAliases: entry.song.searchAliases,
    });
    const primary = pickPrimarySegment(segments, seed, entry.song.id, questionIndex);
    const hints = primary ? buildHintSequence(segments, primary.id, 4) : [];
    const answerRandom = createAnswerPoolRandom(seed, entry.song.id, questionIndex);
    const answerPool = generateAnswerPool(poolSongs, entry.song.id, answerPoolSizeValue, answerRandom);

    return { song: entry.song, segments, hints, answerPool };
  });
}
