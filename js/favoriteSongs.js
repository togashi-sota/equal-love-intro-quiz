// お気に入り曲を、プレイヤーごとに保存するファイル。
// 設計はjs/oshiMembers.js（推しメン）と全く同じ考え方（getPlayerKeyPrefix()で
// プレイヤーごとにキーを分ける）。曲側は「複数登録可・上限なし」のみで、
// 推しメンのような「1つだけ」の概念（最推し相当）は存在しない（2026-08-04新設）。

import { getPlayerKeyPrefix } from "./playerProfile.js";
import { scheduleBackupSync } from "./backupSync.js";

function buildFavoriteSongsKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}favoriteSongs`;
}

function loadFavoriteSongIds() {
  try {
    const stored = localStorage.getItem(buildFavoriteSongsKey());
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFavoriteSongIds(songIds) {
  try {
    localStorage.setItem(buildFavoriteSongsKey(), JSON.stringify(songIds));
    scheduleBackupSync(); // クラウドバックアップも更新する（2026-08-29追加、js/backupSync.js参照）
  } catch {
    // 保存に失敗しても（プライベートブラウズ等）アプリ自体は動き続けられるようにする。
  }
}

// お気に入り登録済みの曲idを、登録した順に返す。
export function getFavoriteSongIds() {
  return loadFavoriteSongIds();
}

export function isFavoriteSong(songId) {
  return loadFavoriteSongIds().includes(songId);
}

// お気に入りの登録/解除を切り替える。
export function toggleFavoriteSong(songId) {
  const current = loadFavoriteSongIds();
  const next = current.includes(songId)
    ? current.filter((id) => id !== songId)
    : [...current, songId];
  saveFavoriteSongIds(next);
}

// 作品単位の一括お気に入り登録用（2026-08-04追加）。指定した曲idすべてが
// 登録済みかどうかを判定する（1曲でも未登録なら false）。
export function areAllFavoriteSongs(songIds) {
  if (songIds.length === 0) return false;
  const current = loadFavoriteSongIds();
  return songIds.every((songId) => current.includes(songId));
}

// 指定した曲idのうち、1曲でも登録済みのものがあるかを判定する
// （「未登録」「一部登録済み」「全登録済み」の3状態を見分けるために使う）。
export function isAnyFavoriteSong(songIds) {
  const current = loadFavoriteSongIds();
  return songIds.some((songId) => current.includes(songId));
}

// 指定した曲idをまとめてお気に入りに追加する（すでに登録済みの曲は重複させない）。
export function addFavoriteSongs(songIds) {
  const current = loadFavoriteSongIds();
  const additions = songIds.filter((songId) => !current.includes(songId));
  if (additions.length === 0) return;
  saveFavoriteSongIds([...current, ...additions]);
}

// 指定した曲idをまとめてお気に入りから外す。
export function removeFavoriteSongs(songIds) {
  const current = loadFavoriteSongIds();
  const idsToRemove = new Set(songIds);
  saveFavoriteSongIds(current.filter((songId) => !idsToRemove.has(songId)));
}
