// 推しメン（複数登録可）・最推し（1人だけ）を、プレイヤーごとに保存するファイル。
// playerProfile.jsのgetPlayerKeyPrefix()を使うため、デフォルトプレイヤーでは
// "equalLoveIntroQuiz.oshiMembers"、2人目以降のプレイヤーでは
// "equalLoveIntroQuiz.player.{playerId}.oshiMembers" というキーになる
// （2026-08-03新設、HANDOFF 10-29章参照）。

import { getPlayerKeyPrefix } from "./playerProfile.js";
import { scheduleBackupSync } from "./backupSync.js";

function buildOshiKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}oshiMembers`;
}

function loadOshiData() {
  const empty = { favoriteMemberIds: [], mostOshiMemberId: null };
  try {
    const stored = localStorage.getItem(buildOshiKey());
    if (!stored) return empty;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed.favoriteMemberIds)) return empty;
    return {
      favoriteMemberIds: parsed.favoriteMemberIds,
      mostOshiMemberId: parsed.mostOshiMemberId ?? null,
    };
  } catch {
    return empty;
  }
}

function saveOshiData(data) {
  try {
    localStorage.setItem(buildOshiKey(), JSON.stringify(data));
    scheduleBackupSync(); // クラウドバックアップも更新する（2026-08-29追加、js/backupSync.js参照）
  } catch {
    // 保存に失敗しても（プライベートブラウズ等）アプリ自体は動き続けられるようにする。
  }
}

// 推しメンとして登録済みのメンバーidを、登録した順に返す。
export function getFavoriteMemberIds() {
  return loadOshiData().favoriteMemberIds;
}

// 最推しメンバーのidを返す。未設定ならnull。
export function getMostOshiMemberId() {
  return loadOshiData().mostOshiMemberId;
}

export function isFavoriteMember(memberId) {
  return loadOshiData().favoriteMemberIds.includes(memberId);
}

export function isMostOshiMember(memberId) {
  return loadOshiData().mostOshiMemberId === memberId;
}

// 推しメンの登録/解除を切り替える。解除したメンバーが最推しだった場合は、最推しも一緒に外す
// （本人希望とは逆に、最推しだけ残って推しメン一覧に出てこない、という矛盾を防ぐため）。
export function toggleFavoriteMember(memberId) {
  const data = loadOshiData();
  const isCurrentlyFavorite = data.favoriteMemberIds.includes(memberId);
  const favoriteMemberIds = isCurrentlyFavorite
    ? data.favoriteMemberIds.filter((id) => id !== memberId)
    : [...data.favoriteMemberIds, memberId];
  const mostOshiMemberId =
    isCurrentlyFavorite && data.mostOshiMemberId === memberId ? null : data.mostOshiMemberId;
  saveOshiData({ favoriteMemberIds, mostOshiMemberId });
}

// 最推しを設定する。まだ推しメンに登録されていなければ自動的に推しメンにも追加する。
// 以前の最推しは、推しメン一覧にはそのまま残る（mostOshiMemberIdという「今の最推しを
// 指す矢印」を1つ動かすだけで、favoriteMemberIdsからは削除しないため。本人方針）。
export function setMostOshiMember(memberId) {
  const data = loadOshiData();
  const favoriteMemberIds = data.favoriteMemberIds.includes(memberId)
    ? data.favoriteMemberIds
    : [...data.favoriteMemberIds, memberId];
  saveOshiData({ favoriteMemberIds, mostOshiMemberId: memberId });
}

// 最推しだけを解除する（推しメンからは外さない）。
export function clearMostOshiMember() {
  const data = loadOshiData();
  saveOshiData({ favoriteMemberIds: data.favoriteMemberIds, mostOshiMemberId: null });
}
