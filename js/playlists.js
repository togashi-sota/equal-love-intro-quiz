// 自分用プレイリストを、プレイヤーごとに保存するファイル。
// 1プレイリスト = { playlistId, playlistName, songIds:[曲idを並び順に], createdAt, updatedAt }。
// 曲そのもの（音源・歌詞・曲情報）は持たず、songIdだけを保持する（js/history.jsと同じ考え方。
// 曲名等はsongs.js側から都度引く）。保存キーはgetPlayerKeyPrefix()でプレイヤーごとに分ける
// （js/playerProfile.js・js/oshiMembers.jsと同じ設計、2026-08-04新設）。

import { getPlayerKeyPrefix } from "./playerProfile.js";

function buildPlaylistsKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}playlists`;
}

function generatePlaylistId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function loadPlaylists() {
  try {
    const stored = localStorage.getItem(buildPlaylistsKey());
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((playlist) => ({
      ...playlist,
      songIds: Array.isArray(playlist.songIds) ? playlist.songIds : [],
    }));
  } catch {
    return [];
  }
}

function savePlaylists(playlists) {
  try {
    localStorage.setItem(buildPlaylistsKey(), JSON.stringify(playlists));
  } catch {
    // 保存に失敗しても（プライベートブラウズ等）アプリ自体は動き続けられるようにする。
  }
}

// プレイリスト一覧を、作成した順に返す。
export function getPlaylists() {
  return loadPlaylists();
}

export function getPlaylistById(playlistId) {
  return loadPlaylists().find((playlist) => playlist.playlistId === playlistId) ?? null;
}

export function createPlaylist(playlistName) {
  const playlists = loadPlaylists();
  const newPlaylist = {
    playlistId: generatePlaylistId(),
    playlistName: playlistName.trim(),
    songIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  savePlaylists([...playlists, newPlaylist]);
  return newPlaylist;
}

export function renamePlaylist(playlistId, newName) {
  const playlists = loadPlaylists();
  const updated = playlists.map((playlist) =>
    playlist.playlistId === playlistId
      ? { ...playlist, playlistName: newName.trim(), updatedAt: nowIso() }
      : playlist
  );
  savePlaylists(updated);
}

export function deletePlaylist(playlistId) {
  const playlists = loadPlaylists().filter((playlist) => playlist.playlistId !== playlistId);
  savePlaylists(playlists);
}

// 指定したプレイリストに曲を追加する。すでに入っている曲は追加しない
// （本人希望：同じ曲の重複登録を防ぐ）。
export function addSongToPlaylist(playlistId, songId) {
  const playlists = loadPlaylists();
  const updated = playlists.map((playlist) => {
    if (playlist.playlistId !== playlistId) return playlist;
    if (playlist.songIds.includes(songId)) return playlist;
    return { ...playlist, songIds: [...playlist.songIds, songId], updatedAt: nowIso() };
  });
  savePlaylists(updated);
}

export function removeSongFromPlaylist(playlistId, songId) {
  const playlists = loadPlaylists();
  const updated = playlists.map((playlist) => {
    if (playlist.playlistId !== playlistId) return playlist;
    return {
      ...playlist,
      songIds: playlist.songIds.filter((id) => id !== songId),
      updatedAt: nowIso(),
    };
  });
  savePlaylists(updated);
}

// プレイリスト内の曲の並び順を1つ動かす（direction: -1で上へ、+1で下へ）。
// 先頭で上へ／末尾で下へ、のように動かせない場合は何もしない。
function moveSongInPlaylist(playlistId, songId, direction) {
  const playlists = loadPlaylists();
  const updated = playlists.map((playlist) => {
    if (playlist.playlistId !== playlistId) return playlist;
    const index = playlist.songIds.indexOf(songId);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= playlist.songIds.length) return playlist;
    const songIds = [...playlist.songIds];
    [songIds[index], songIds[targetIndex]] = [songIds[targetIndex], songIds[index]];
    return { ...playlist, songIds, updatedAt: nowIso() };
  });
  savePlaylists(updated);
}

export function moveSongUp(playlistId, songId) {
  moveSongInPlaylist(playlistId, songId, -1);
}

export function moveSongDown(playlistId, songId) {
  moveSongInPlaylist(playlistId, songId, 1);
}
