// 一瞬チャレンジの「1問分のデータ（回答候補まで含む）」を組み立てる、DOMに一切触れない
// 純粋関数だけを集めたファイル。
//
// 【なぜ分離したか・2026-11-XX新設】以前はjs/instantChallengeScreen.js内にこの関数が
// 直接書かれていたが、あのファイルは画面操作全体（答え合わせカードの組み立て・ボタンの
// イベント登録等）を担うファイルで、js/answerPoolBrowseUi.js経由でjs/songlist.js
// （モジュール読み込み時にdocument.getElementById(...)を大量に行う、画面直結のファイル）を
// 連鎖的に読み込んでしまう。そのため自動テストからjs/instantChallengeScreen.jsを直接
// importすると、テスト用ページ（tests.html）に無数のダミーDOM要素を用意しない限り
// 「addEventListener of null」で即座に例外が起きてテスト全体が止まってしまう問題があった。
// js/lyricsQuizQuestionBuilder.js（歌詞クイズの問題組み立て）と同じ考え方で、
// 「問題データを組み立てる部分」だけをDOMに触れない純粋関数として切り出すことで、
// 単体テストから安全に呼び出せるようにした（本人指示：実機の不具合を今後も確実に
// 自動テストで再現・再発防止できるようにする）。

import {
  generateAnswerPool,
  validateLyricsQuizQuestionAnswerPool,
  buildFallbackAnswerPool,
} from "./lyricsQuizEngine.js";
import { MIN_SONGS_REQUIRED } from "./quiz.js";

// 【QAで発見・修正：2026-09-09】苦手曲モード「一瞬」タブ（practiceModeId === "weakSongsInstant"）
// だけ、出題開始に必要な最低曲数を通常の4曲（MIN_SONGS_REQUIRED、正解1＋ダミー3）から
// 2曲（正解1＋誤答1）へ緩和する判定を、js/instantChallengeScreen.js（DOM直結でテスト
// できない）から切り出した純粋関数にする。
//
// 【なぜ4曲でなくてよいか】generateAnswerPool()（js/lyricsQuizEngine.js）は、要求された
// 回答候補数（4/10/全曲）をプールの実際のサイズまで自動的に切り詰める設計のため、
// 4曲に満たなくても「正解1＋誤答1以上」さえあれば有効な問題を組み立てられる。苦手曲
// モードは対象曲そのものが元々少数（1桁）になりやすいため、他の開始経路（通常の一瞬
// チャレンジ・オリジナル問題作成モード）と同じ4曲固定の下限をそのまま当てはめると、
// 音源が実際に読み込まれていても開始できなくなってしまっていた（本人の実機報告：3曲を
// 苦手曲として正しく認識しているのに「音源が読み込まれていない」という誤った案内が出て
// 開始できなかった）。
export const MIN_SONGS_REQUIRED_FOR_WEAK_SONGS_PRACTICE = 2;

export function resolveInstantChallengeMinSongsRequired(practiceModeId) {
  return practiceModeId === "weakSongsInstant" ? MIN_SONGS_REQUIRED_FOR_WEAK_SONGS_PRACTICE : MIN_SONGS_REQUIRED;
}

// 1曲分の問題データ（回答候補まで含めて）を組み立てる。初回の出題・音源再生失敗時の
// 差し替えのどちらからも呼ぶ共通処理（本人指示：新しい生成ロジックを重複させない）。
// distractorPool省略時は今までどおりpool自身から回答候補を選ぶ（既存呼び出し元は無変更）。
//
// 【2026-11-XX修正・本人指示：オリジナル一瞬チャレンジの回答候補が0件になる重大バグ】
// distractorPool（不正解候補の母集団＝設定したカテゴリー全体）に、正解の曲そのものが
// 含まれていない場合がある（例：カテゴリーを「表題曲のみ」にしたまま、全員曲を選んで
// 出題した場合）。generateAnswerPool()は正解曲が母集団に無いと空配列を返す仕様のため、
// 回答候補が1件も表示されず「回答選択肢が出なくなる」実機バグの直接の原因になっていた。
// 正解の曲は必ず候補プールに含まれている状態にしてから渡すことで、この空振りを防ぐ
// （通常時＝正解曲が既にdistractorPoolに含まれているケースでは配列の中身は変わらない）。
export function buildInstantChallengeQuestion(song, pool, settings, distractorPool = pool) {
  const effectivePool = distractorPool.some((candidate) => candidate.id === song.id)
    ? distractorPool
    : [song, ...distractorPool];
  let answerPool = generateAnswerPool(effectivePool, song.id, settings.answerPoolSizeValue);
  const validation = validateLyricsQuizQuestionAnswerPool({ song, answerPool });
  if (!validation.ok) {
    answerPool = buildFallbackAnswerPool(effectivePool, song.id, settings.answerPoolSizeValue) ?? [];
  }
  return { song, answerPool };
}
