// 「曲を選んで再生」（2026-11-01 r8-music・本人の依頼 R8-2）の、選んだ曲の保存と計算だけを置くファイル。
// DOM に一切触れない（tests.html から安全に import できるようにするため）。画面は js/songPickScreen.js。
//
// 【保存の形】選んだ曲 id の配列を、選んだ順に1つのキーへ保存する。
//   キー：equalLoveIntroQuiz.<プレイヤーごとの接頭辞>pickedSongs（例：["love", "sayonara-no-imi", ...]）
//   お気に入り（…favoriteSongs）・プレイリスト（…playlists）とは別のキー。既存のデータの形は変えない。
//   「選んだ順」＝「順番に再生したときの順」。並びを持たせるために Set ではなく配列で持つ。
//   クラウドのバックアップ（js/backupSync.js）の対象には入れない（一時的な「かご」なので。お気に入り・
//   プレイリストへ足した曲は、そちらのキーでバックアップされる）。

import { getPlayerKeyPrefix } from "./playerProfile.js";

function buildPickedSongsKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}pickedSongs`;
}

// 保存されている「選んだ曲」を返す。壊れた値・文字列以外の要素・重複は取り除く。
export function loadPickedSongIds() {
  try {
    const stored = localStorage.getItem(buildPickedSongsKey());
    if (!stored) return [];
    return normalizePickedSongIds(JSON.parse(stored));
  } catch {
    return [];
  }
}

export function savePickedSongIds(songIds) {
  try {
    localStorage.setItem(buildPickedSongsKey(), JSON.stringify(normalizePickedSongIds(songIds)));
  } catch {
    // 保存できなくても（プライベートブラウズ等）、画面の中の選択はそのまま使える。
  }
}

// ---- ここから下は純粋関数（テストで確かめる） ----

// 配列でなければ空、文字列の id だけ、最初に出てきた順で重複なし、にそろえる。
export function normalizePickedSongIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  value.forEach((id) => {
    if (typeof id !== "string" || id === "" || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
}

// 1曲の選択を切り替える。選ぶときは末尾へ（＝最後に再生）、外すときはその曲だけ抜く（ほかの順は変えない）。
export function togglePickedSong(pickedIds, songId) {
  return pickedIds.includes(songId) ? pickedIds.filter((id) => id !== songId) : [...pickedIds, songId];
}

// まとめて選ぶ（作品ごとの「全部選ぶ」・検索結果の「表示中を全部選ぶ」）。すでに選んでいる曲は位置を変えない。
export function addPickedSongs(pickedIds, songIds) {
  const existing = new Set(pickedIds);
  return [...pickedIds, ...normalizePickedSongIds(songIds).filter((id) => !existing.has(id))];
}

// まとめて外す。
export function removePickedSongs(pickedIds, songIds) {
  const removing = new Set(songIds);
  return pickedIds.filter((id) => !removing.has(id));
}

// 選んだ曲 id → 再生キューに渡す曲データの配列（選んだ順。曲データに無い id は飛ばす）。
// getSongById は js/data/songs.js のもの（テストでは差し替えられるよう引数にする）。
export function resolvePickedSongs(pickedIds, getSongById) {
  return normalizePickedSongIds(pickedIds).map((id) => getSongById(id)).filter(Boolean);
}

// 再生できる曲（端末に音源がある曲）の数を数える。importedIds は Set（js/audioStorage.js の getImportedSongIds）。
// 戻り値：{ total：選んだ曲, playable：再生できる曲, missing：音源の無い曲 }
export function countPlayablePicked(pickedIds, importedIds) {
  const total = pickedIds.length;
  const playable = pickedIds.filter((id) => importedIds.has(id)).length;
  return { total, playable, missing: total - playable };
}

// 一覧の絞り込みの種類。
export const PICK_FILTERS = Object.freeze({
  ALL: "all", // すべての曲
  FAVORITES: "favorites", // ♡ お気に入りだけ
  PICKED: "picked", // 選んだ曲だけ（何を選んだかの見直し用）
  PLAYABLE: "playable", // 音源がある曲だけ
});

// 1曲が、今の絞り込みに当てはまるか。sets：{ pickedIds:Set, favoriteIds:Set, importedIds:Set }
export function songMatchesPickFilter(songId, filter, { pickedIds, favoriteIds, importedIds }) {
  if (filter === PICK_FILTERS.FAVORITES) return favoriteIds.has(songId);
  if (filter === PICK_FILTERS.PICKED) return pickedIds.has(songId);
  if (filter === PICK_FILTERS.PLAYABLE) return importedIds.has(songId);
  return true;
}

// プレイリスト・お気に入りへまとめて足すとき、「新しく入る曲」と「もう入っている曲」に分ける。
// existingIds：そのプレイリスト（またはお気に入り）に今入っている曲 id の配列。
export function splitForBulkAdd(pickedIds, existingIds) {
  const existing = new Set(existingIds);
  const toAdd = [];
  const already = [];
  normalizePickedSongIds(pickedIds).forEach((id) => (existing.has(id) ? already : toAdd).push(id));
  return { toAdd, already };
}

// まとめて足したあとの案内の文。target：「お気に入り」や「「通勤用」」など、足した先の名前。
export function describeBulkAddResult(target, addedCount, alreadyCount) {
  if (addedCount === 0 && alreadyCount === 0) return "曲が選ばれていません";
  if (addedCount === 0) return `選んだ${alreadyCount}曲は、すべて${target}に入っています`;
  const head = `${target}に${addedCount}曲を追加しました`;
  return alreadyCount > 0 ? `${head}（${alreadyCount}曲はもう入っていたので、そのままです）` : head;
}

// 下の帯に出す「選んだ数」の文。counts は countPlayablePicked の戻り値。
export function describePickedSummary({ total, playable, missing }) {
  if (total === 0) return { main: "曲をタップして選んでください", sub: "" };
  if (missing === 0) return { main: `${total}曲を選択中`, sub: "" };
  if (playable === 0) return { main: `${total}曲を選択中`, sub: "音源のある曲がありません（追加はできます）" };
  return { main: `${total}曲を選択中`, sub: `再生できるのは${playable}曲（${missing}曲は音源なし）` };
}
