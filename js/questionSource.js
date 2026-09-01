// 出題範囲（questionSource）を、実際の出題対象となる曲ID配列（songPool）へ解決する共通レイヤー。
//
// 【設計方針】
// タイムアタック・ローカル対戦・オンライン対戦・今後追加するランダム再生クイズ・歌詞クイズなど、
// あらゆるモードの「出題対象をどこから選ぶか」をここに集約する。ゲーム進行側（quiz.js・
// js/battleModes配下等）は「確定済みの曲ID配列（songPool、string[]）」だけを受け取り、それが
// 全曲・カテゴリ・手動選曲・お気に入り・プレイリスト・オンライン共同選曲のどれから作られたかを
// 一切意識しない構造にする（2026-08-08、最終1日ロードマップの一環として新設。詳細はHANDOFF.md
// 10-59章参照）。
//
// 曲情報そのもの（曲名・カテゴリ等）はここでは複製しない。曲データの正は引き続きjs/data/songs.js。
// このファイルが返すsongPoolは、常に「string[]（曲idの配列、重複なし・実在する曲のみ）」という形。
//
// 【既存コードへの影響】このファイルは新規追加のみで、quiz.js・localBattle.js・
// battleModes/timeAttackBattleMode.js等の既存の関数・シグネチャは一切変更しない。
// 既存モードがこのファイルを使うかどうかは、呼び出し側が任意に選べる（後方互換）。

import { SONGS } from "./data/songs.js";
import { filterSongsByCategory, resolveQuestionCount, buildQuizQuestions } from "./quiz.js";
import { getFavoriteSongIds } from "./favoriteSongs.js";
import { getPlaylistById } from "./playlists.js";
import { createSeededRandom } from "./seededRandom.js";

// questionSourceのtype一覧。
// 依頼文にあった「mixListSnapshot」は、本人確認の結果「プレイリスト」と同一概念だったため、
// 別のtypeを設けず PLAYLIST_SNAPSHOT に統合している（HANDOFF.md 10-59章参照）。
export const QUESTION_SOURCE_TYPE = {
  ALL_SONGS: "allSongs",
  CATEGORY: "category",
  MANUAL_SELECTION: "manualSelection",
  FAVORITES_SNAPSHOT: "favoritesSnapshot",
  PLAYLIST_SNAPSHOT: "playlistSnapshot",
  COLLABORATIVE_SELECTION: "collaborativeSelection",
};

// 曲IDの配列を、実在するsongs.jsの曲データにのみ絞り込み、重複を除去して返す（順序は維持）。
// - 存在しないID（データ不整合・削除済みプレイリストが参照していた曲・オンライン対戦の
//   参加者が削除済みお気に入りを送ってきた場合等）は安全に除外する。
// - 重複ID（複数人が同じ曲を選んだ場合、同じ曲がプレイリストとお気に入りの両方に
//   入っていた場合等）は1件にまとめる。
// 出題順そのものはここでは決めない（並び順・抽選はbuildQuizQuestions等、呼び出し側の責務）。
export function sanitizeSongIds(songIds) {
  const validIds = new Set(SONGS.map((song) => song.id));
  const seen = new Set();
  const result = [];
  for (const songId of songIds) {
    if (!validIds.has(songId) || seen.has(songId)) continue;
    seen.add(songId);
    result.push(songId);
  }
  return result;
}

// questionSourceの記述から、実際のsongPool（string[]）を解決する。
// questionSource: { type, ...typeごとの追加情報 }
//   category               : { type: "category", categoryFilterValue }
//   manualSelection        : { type: "manualSelection", songIds }（本人が直接選んだ曲ID）
//   favoritesSnapshot      : { type: "favoritesSnapshot" }（この端末のお気に入りを都度参照）
//   playlistSnapshot       : { type: "playlistSnapshot", playlistId }（この端末のプレイリストを都度参照）
//   collaborativeSelection : { type: "collaborativeSelection", songIds }（オンライン対戦で確定済みの
//                            songPool。Firebase上のconfirmedSongPoolを呼び出し側が読み取り済みの前提。
//                            このファイルはFirebaseに一切アクセスしない）
export function resolveSongPool(questionSource) {
  switch (questionSource?.type) {
    case QUESTION_SOURCE_TYPE.CATEGORY:
      return sanitizeSongIds(
        filterSongsByCategory(SONGS, questionSource.categoryFilterValue).map((song) => song.id)
      );
    case QUESTION_SOURCE_TYPE.MANUAL_SELECTION:
      return sanitizeSongIds(questionSource.songIds ?? []);
    case QUESTION_SOURCE_TYPE.FAVORITES_SNAPSHOT:
      return sanitizeSongIds(getFavoriteSongIds());
    case QUESTION_SOURCE_TYPE.PLAYLIST_SNAPSHOT: {
      const playlist = getPlaylistById(questionSource.playlistId);
      return sanitizeSongIds(playlist ? playlist.songIds : []);
    }
    case QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION:
      return sanitizeSongIds(questionSource.songIds ?? []);
    case QUESTION_SOURCE_TYPE.ALL_SONGS:
    default:
      // 未知のtype・questionSource省略時は、最も安全なフォールバックとして全曲を返す。
      return sanitizeSongIds(SONGS.map((song) => song.id));
  }
}

// songPool（string[]）を、songs.jsの曲オブジェクト配列に引き直す。
// 存在しないIDが紛れていても安全に無視する（sanitizeSongIds通過後の呼び出しなら通常発生しないが、
// 直接songPoolを渡された場合の防御として二重にガードしておく）。
export function resolveSongObjects(songPool) {
  return songPool
    .map((songId) => SONGS.find((song) => song.id === songId))
    .filter((song) => song !== undefined);
}

// 曲ID配列のうち、現在のカテゴリ条件（categoryFilterValue）に合う曲だけを返す。
// 【2026-09-14新設・本人指示：共有曲選択の仕様明確化】共同選曲・手動選曲などの
// 「曲指定」で選ばれた曲一覧は、カテゴリを変更しても選択状態そのものは保持する
// （songIds配列は書き換えない）。ただし実際に出題対象として使ってよいのは、
// 「今のカテゴリ条件にも合っている曲」だけ（例：表題曲のみに絞っている間は、
// 選択済みのカップリング曲は出題対象外）。この絞り込みを、選択状態を破壊せずに
// 出題直前・検証直前だけ適用するための関数。
export function filterSongIdsByCategory(songIds, categoryFilterValue) {
  const categorySongIds = new Set(filterSongsByCategory(SONGS, categoryFilterValue).map((song) => song.id));
  return songIds.filter((songId) => categorySongIds.has(songId));
}

// songPoolの曲数が、要求する出題数（questionCountValue: "5"|"10"|"20"|"50"|"all"）を
// 満たしているかを判定する。「全員で選んだ曲からオンライン対戦」等で、曲数不足のときに
// 出題数を勝手に減らしたり曲を重複させたりせず、開始不可にして案内を出すために使う
// （本人の明確な要望、HANDOFF.md 10-59章参照）。
//
// 戻り値: { ok: true } または
//         { ok: false, currentCount, requiredCount }（requiredCountは"all"のときnull＝下限なし）
export function validateSongPoolForQuestionCount(songPool, questionCountValue) {
  const currentCount = songPool.length;
  if (questionCountValue === "all") {
    // 「全曲」は「songPool全体を出題する」という意味なので、曲数0でなければ成立する
    // （0曲は別途MIN_SONGS_REQUIRED等の一般的な下限チェックに任せる）。
    return { ok: true };
  }
  const requiredCount = Number(questionCountValue);
  if (currentCount < requiredCount) {
    return { ok: false, currentCount, requiredCount };
  }
  return { ok: true };
}

// songPool（string[]）とseed・出題数から、全端末で完全に一致する問題セット
// （{song, choices}の配列）を組み立てる。js/localBattle.jsのbuildBattleQuestions()と
// 同じ考え方（seedから作った決定論的な乱数でjs/quiz.jsの既存ロジックをそのまま使う）だが、
// 「カテゴリで絞り込む」代わりに「既に確定済みのsongPoolをそのまま使う」点だけが違う。
// 出題数がsongPoolの曲数を超える場合はresolveQuestionCount（quiz.js）が自動的に
// songPoolの曲数で頭打ちにする（呼び出し側でvalidateSongPoolForQuestionCountによる
// 事前ガードを行う想定だが、この関数自体も安全側に倒れるようにしている）。
// 【2026-09-12追加・本人指示：共有クイズエンジンの音源再生失敗対策】reserveCountの意味は
// js/localBattle.jsのbuildBattleQuestions()と同じ（出題数に加えて予備の曲を確保し、
// isReserveで見分けられるようにする）。省略時は今までと完全に同じ挙動になる。
// 【2026-09-14追加・本人指示：出題曲プールと回答選択肢プールの完全分離】distractorPool
// （回答選択肢の母集団となる曲ID配列）を省略した場合は、今までと同じくsongPool自身が
// ダミー選択肢の母集団になる（既存の呼び出し元は挙動が一切変わらない）。distractorPoolを
// 渡した場合、正解はsongPoolから選ばれるが、ダミー選択肢はdistractorPoolから選ばれる
// （例：参加者が共同選択した4曲が出題対象でも、ダミーは現在のカテゴリ条件全体から選ぶ）。
export function buildQuestionsFromPool({ seed, songPool, distractorPool, questionCountValue, reserveCount = 0 }) {
  const poolSongs = resolveSongObjects(songPool);
  const distractorSongs = distractorPool ? resolveSongObjects(distractorPool) : poolSongs;
  const questionCount = resolveQuestionCount(questionCountValue, poolSongs.length);
  const extendedCount = Math.min(questionCount + reserveCount, poolSongs.length);
  const random = createSeededRandom(seed);
  return buildQuizQuestions(poolSongs, extendedCount, random, distractorSongs).map((question, questionIndex) => ({
    ...question,
    isReserve: questionIndex >= questionCount,
  }));
}
