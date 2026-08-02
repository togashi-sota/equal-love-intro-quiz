// memberUtils.js（メンバー関連の集計・導出ロジック）のテスト。
// 実際のsongs.js/members.jsには依存せず、テスト専用のダミーデータだけを使う
// （本物のメンバー名・曲データが変わってもテストが壊れないようにするため）。

import {
  getMemberById,
  getActiveMembers,
  getGraduatedMembers,
  getActiveMemberCount,
  getMemberCenterSongs,
  getMemberUnitSongs,
} from "../js/memberUtils.js";
import { CATEGORY } from "../js/data/songs.js";
import { MEMBER_STATUS } from "../js/data/members.js";
import { assertEqual } from "./test-utils.js";

const dummyMembers = [
  { id: "member-b", name: "メンバーB", status: MEMBER_STATUS.ACTIVE, attendanceNumber: 2 },
  { id: "member-a", name: "メンバーA", status: MEMBER_STATUS.ACTIVE, attendanceNumber: 1 },
  { id: "member-c", name: "メンバーC", status: MEMBER_STATUS.ACTIVE, attendanceNumber: 3 },
  { id: "member-x", name: "卒業メンバーX", status: MEMBER_STATUS.GRADUATED },
];

const dummySongs = [
  { id: "song-1", category: CATEGORY.TITLE_TRACK, center: ["メンバーA"] },
  { id: "song-2", category: CATEGORY.GROUP_SONG, center: ["メンバーA", "メンバーB"] }, // Wセンター
  { id: "song-3", category: CATEGORY.UNIT_SONG, members: ["メンバーB", "メンバーC"] },
  { id: "song-4", category: CATEGORY.UNIT_SONG, members: ["メンバーC"] },
  { id: "song-5", category: CATEGORY.GROUP_SONG, center: [] },
];

export function runMemberUtilsTests() {
  // ---- getMemberById ----
  assertEqual(getMemberById(dummyMembers, "member-a")?.name, "メンバーA", "getMemberById: 存在するidはメンバー情報を返す");
  assertEqual(getMemberById(dummyMembers, "not-exist"), null, "getMemberById: 存在しないidはnullを返す");

  // ---- getActiveMembers ----
  assertEqual(
    getActiveMembers(dummyMembers).map((m) => m.id),
    ["member-a", "member-b", "member-c"],
    "getActiveMembers: 出席番号の昇順に並び替えられ、卒業メンバーは含まれない"
  );

  // ---- getGraduatedMembers ----
  assertEqual(
    getGraduatedMembers(dummyMembers).map((m) => m.id),
    ["member-x"],
    "getGraduatedMembers: status=graduatedのメンバーだけを返す"
  );

  // ---- getActiveMemberCount ----
  assertEqual(getActiveMemberCount(dummyMembers), 3, "getActiveMemberCount: 現役メンバーの人数を返す");

  // ---- getMemberCenterSongs ----
  assertEqual(
    getMemberCenterSongs(dummySongs, dummyMembers, "member-a").map((s) => s.id),
    ["song-1", "song-2"],
    "getMemberCenterSongs: Wセンターの曲も含めて、centerに名前がある曲をすべて返す"
  );
  assertEqual(
    getMemberCenterSongs(dummySongs, dummyMembers, "member-c").map((s) => s.id),
    [],
    "getMemberCenterSongs: センター曲が無いメンバーは空配列を返す"
  );
  assertEqual(
    getMemberCenterSongs(dummySongs, dummyMembers, "not-exist"),
    [],
    "getMemberCenterSongs: 存在しないメンバーIDは空配列を返す"
  );

  // ---- getMemberUnitSongs ----
  assertEqual(
    getMemberUnitSongs(dummySongs, dummyMembers, "member-c").map((s) => s.id),
    ["song-3", "song-4"],
    "getMemberUnitSongs: membersに名前があるユニット曲をすべて返す"
  );
  assertEqual(
    getMemberUnitSongs(dummySongs, dummyMembers, "member-a").map((s) => s.id),
    [],
    "getMemberUnitSongs: ユニット曲に参加していないメンバーは空配列を返す"
  );
  assertEqual(
    getMemberUnitSongs(dummySongs, dummyMembers, "member-b").map((s) => s.id),
    ["song-3"],
    "getMemberUnitSongs: category違い(表題曲/全員曲)のcenterフィールドは参照しない"
  );
}
