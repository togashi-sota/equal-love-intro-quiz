// メンバーに関する集計・導出ロジックをまとめたファイル。
// センター曲・参加ユニットは members.js には一切持たせず、songs.js を唯一の情報源として
// このファイルが都度計算する（5-1章の「songs.js中心の一元管理」を踏襲）。
//
// quiz.js等の既存ロジックと同じく、songs/members はすべて引数で受け取る設計にしている
// （DOM・IndexedDBに一切触れない純粋関数のみで構成し、テスト用のダミーデータでも
// 呼び出せるようにするため）。呼び出し側（画面側）で、songs.jsのSONGS・members.jsのMEMBERSを
// 渡す想定。

import { CATEGORY } from "./data/songs.js";
import { MEMBER_STATUS } from "./data/members.js";

// idからメンバー情報を1件取得する。見つからない場合はnull。
export function getMemberById(members, memberId) {
  return members.find((member) => member.id === memberId) ?? null;
}

// 現役メンバーを出席番号順に並べて返す。
export function getActiveMembers(members) {
  return members
    .filter((member) => member.status === MEMBER_STATUS.ACTIVE)
    .sort((a, b) => a.attendanceNumber - b.attendanceNumber);
}

// 卒業メンバーを返す（一覧画面の「過去に在籍していたメンバー」セクション用）。
export function getGraduatedMembers(members) {
  return members.filter((member) => member.status === MEMBER_STATUS.GRADUATED);
}

// 現役メンバーの人数。歴史ページの「結成時12人→現在は◯人」のような表示に使う想定。
export function getActiveMemberCount(members) {
  return getActiveMembers(members).length;
}

// 指定したメンバーがセンターを務めた曲を、songsのcenterフィールドから抽出する。
// Wセンターの曲も、centerに名前が含まれていればそのまま該当曲として扱う。
export function getMemberCenterSongs(songs, members, memberId) {
  const member = getMemberById(members, memberId);
  if (!member) return [];
  return songs.filter((song) => Array.isArray(song.center) && song.center.includes(member.name));
}

// 指定したメンバーが参加しているユニット曲を、songsのmembersフィールドから抽出する。
export function getMemberUnitSongs(songs, members, memberId) {
  const member = getMemberById(members, memberId);
  if (!member) return [];
  return songs.filter(
    (song) =>
      song.category === CATEGORY.UNIT_SONG &&
      Array.isArray(song.members) &&
      song.members.includes(member.name)
  );
}

// センター曲の中で、発売日が一番早い曲（＝初センター曲）を返す。無ければnull。
export function getMemberFirstCenterSong(songs, members, memberId) {
  const centerSongs = getMemberCenterSongs(songs, members, memberId);
  if (centerSongs.length === 0) return null;
  return [...centerSongs].sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""))[0];
}

// memberProfiles.js（MEMBER_PROFILES配列）から、指定したメンバーの補足プロフィールを取得する。
// 見つからない場合はnull（memberProfiles.jsにまだ何も登録していないメンバーもいるため）。
export function getMemberProfile(profiles, memberId) {
  return profiles.find((profile) => profile.memberId === memberId) ?? null;
}

// memberActivities.js（MEMBER_ACTIVITIES配列）から、指定したメンバーが関わる活動を返す。
// 本人がmemberIdの活動だけでなく、relatedMemberIdsに含まれる共同活動（例：2人組のYouTube）も
// 拾う。共同活動をメンバーごとに二重登録しないための橋渡し役。
export function getMemberActivities(activities, memberId) {
  return activities.filter(
    (activity) => activity.memberId === memberId || activity.relatedMemberIds?.includes(memberId)
  );
}
