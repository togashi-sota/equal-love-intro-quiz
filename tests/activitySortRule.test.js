// 【2026-10-04新設】「個人活動・レギュラー企画」の共通ソートルールの回帰テスト（本人指示）。
//   継続中を必ず上 → 継続中は開始日の新しい順 → 終了をその下 → 終了は終了日の新しい順。
//   日付が一部不明・1件だけ・継続中だけ・終了だけでも壊れないこと、10人全員で表示エラーが無いことを確認する。
import { MEMBER_ACTIVITIES, ACTIVITY_STATUS } from "../js/data/memberActivities.js";
import { MEMBERS } from "../js/data/members.js";
import { getMemberActivities } from "../js/memberUtils.js";
import { sortActivitiesByDateDesc, getActivityGroupRank, buildActivityCard } from "../js/membersScreen.js";
import { assertEqual } from "./test-utils.js";

const ids = (list) => sortActivitiesByDateDesc(list).map((entry) => entry.id);

export function runActivitySortRuleTests() {
  // ---- A. 継続中は終了より必ず上（終了のほうが日付が新しくても） ----
  const mixed = [
    { id: "ended-new", status: ACTIVITY_STATUS.ENDED, startDate: "2020-01-01", endDate: "2026-10-03" },
    { id: "ongoing-old", status: ACTIVITY_STATUS.ONGOING, startDate: "2021-04-01", endDate: null },
    { id: "ended-old", status: ACTIVITY_STATUS.ENDED, startDate: "2018-01-01", endDate: "2019-01-01" },
    { id: "ongoing-new", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-09-01", endDate: null },
  ];
  assertEqual(ids(mixed), ["ongoing-new", "ongoing-old", "ended-new", "ended-old"], "A: 継続中が必ず上／継続中は開始日の新しい順／終了は終了日の新しい順");

  // ---- B. 継続中同士は開始日が新しいほど上（任期満了日などの未来のendDateは影響しない） ----
  const ongoing = [
    { id: "o2024", status: ACTIVITY_STATUS.ONGOING, startDate: "2024-04-17", endDate: null },
    { id: "o2026-10-term", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-10-01", endDate: "2028-03-31" },
    { id: "o2026-09", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-09-30", endDate: null },
    { id: "o2025", status: ACTIVITY_STATUS.ONGOING, startDate: "2025-11-05", endDate: null },
  ];
  assertEqual(ids(ongoing), ["o2026-10-term", "o2026-09", "o2025", "o2024"], "B: 継続中だけでも開始日の新しい順");

  // ---- C. 終了同士は終了日が新しいほど上 ----
  const ended = [
    { id: "e2024", status: ACTIVITY_STATUS.ENDED, startDate: "2023-01-01", endDate: "2024-12-22" },
    { id: "e2026-10", status: ACTIVITY_STATUS.ENDED, startDate: "2021-10-10", endDate: "2026-10-03" },
    { id: "past2023", status: ACTIVITY_STATUS.PAST, startDate: "2023-09-25", endDate: "2023-09-25" },
    { id: "e2026-08", status: ACTIVITY_STATUS.ENDED, startDate: "2025-04-25", endDate: "2026-08-07" },
  ];
  assertEqual(ids(ended), ["e2026-10", "e2026-08", "e2024", "past2023"], "C: 終了だけでも終了日の新しい順（過去の活動も終了グループ）");

  // ---- D. 年次開催・不定期は継続中の下・終了の上 ----
  const periodic = [
    { id: "ended", status: ACTIVITY_STATUS.ENDED, startDate: "2020-01-01", endDate: "2026-01-01" },
    { id: "annual", status: ACTIVITY_STATUS.ANNUAL, startDate: "2025-08-03", endDate: null },
    { id: "ongoing", status: ACTIVITY_STATUS.ONGOING, startDate: "2019-01-01", endDate: null },
    { id: "irregular", status: ACTIVITY_STATUS.IRREGULAR, startDate: "2023-04-13", endDate: null },
  ];
  assertEqual(ids(periodic), ["ongoing", "annual", "irregular", "ended"], "D: 継続中 → 年次/不定期 → 終了");

  // ---- E. 件数の少ないケースでも壊れない ----
  assertEqual(ids([]), [], "E: 0件でも壊れない");
  assertEqual(ids([{ id: "only", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-01-01" }]), ["only"], "E: 1件（継続中）");
  assertEqual(ids([{ id: "only", status: ACTIVITY_STATUS.ENDED, startDate: "2026-01-01", endDate: "2026-02-01" }]), ["only"], "E: 1件（終了）");
  assertEqual(ids(mixed.filter((entry) => entry.id.startsWith("ongoing"))), ["ongoing-new", "ongoing-old"], "E: 継続中しかない");
  assertEqual(ids(mixed.filter((entry) => entry.id.startsWith("ended"))), ["ended-new", "ended-old"], "E: 終了しかない");

  // ---- F. 日付が一部不明でも例外にならず、各グループの末尾にまとまる ----
  const partial = [
    { id: "ended-nodate", status: ACTIVITY_STATUS.ENDED, startDate: null, endDate: null },
    { id: "ongoing-nodate", status: ACTIVITY_STATUS.ONGOING, startDate: null, endDate: null },
    { id: "ongoing-dated", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-01-01", endDate: null },
    { id: "ended-broken", status: ACTIVITY_STATUS.ENDED, startDate: "2020-01-01", endDate: "こわれた日付" },
    { id: "ended-enddate-only", status: ACTIVITY_STATUS.ENDED, startDate: null, endDate: "2026-03-30" },
  ];
  assertEqual(ids(partial).length, 5, "F: 例外にならず5件すべて返る");
  const partialIds = ids(partial);
  assertEqual(partialIds.slice(0, 2), ["ongoing-dated", "ongoing-nodate"], "F: 継続中グループは日付ありが先、日付不明が末尾");
  assertEqual(partialIds[2], "ended-enddate-only", "F: 終了グループは日付の取れるものが先頭");
  assertEqual(getActivityGroupRank(undefined), 1, "F: 活動自体が無くても落ちない");
  assertEqual(getActivityGroupRank({}), 1, "F: status未設定は年次/不定期と同じ中間グループ");

  // ---- G. 同日どうしは安定した順序（priority→登録順） ----
  const sameDay = [
    { id: "s1", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-09-30" },
    { id: "s2", status: ACTIVITY_STATUS.ONGOING, startDate: "2026-09-30", priority: 1 },
  ];
  assertEqual(ids(sameDay), ["s2", "s1"], "G: 同日はpriority→登録順");

  // ---- H. 実データ：10人全員で並びのルールを満たし、カードが全件作れる ----
  const current = MEMBERS.filter((member) => member.status === "active");
  assertEqual(current.length, 10, "H: 現役10人");
  current.forEach((member) => {
    const sorted = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, member.id));
    const ranks = sorted.map((activity) => getActivityGroupRank(activity));
    assertEqual(ranks, [...ranks].sort((a, b) => a - b), `H: ${member.name} は継続中→年次/不定期→終了の順`);
    const cards = sorted.map((activity) => buildActivityCard(activity));
    assertEqual(cards.length, sorted.length, `H: ${member.name} は全${sorted.length}件のカードが表示エラーなく作れる`);
  });

  // ---- I. 今回問題になった個別ページ ----
  const otani = ids(getMemberActivities(MEMBER_ACTIVITIES, "otani-emiri"));
  assertEqual(otani[otani.length - 1], "otani-appare-saturday-radio", "I: 大谷映美里：終了したアッパレは継続中の下");
  assertEqual(otani.slice(0, -1).every((id) => id !== "otani-appare-saturday-radio"), true, "I: アッパレは継続中より上に出ない");
  const oba = ids(getMemberActivities(MEMBER_ACTIVITIES, "oba-hana"));
  assertEqual(oba.slice(0, 2), ["oba-saitama-tourism-ambassador", "oba-redyazel"], "I: 大場花菜：さいたま観光大使→REDYAZELが先頭");
  const saito = ids(getMemberActivities(MEMBER_ACTIVITIES, "saito-kiara"));
  assertEqual(saito.indexOf("saito-tochigi-future-ambassador") < saito.indexOf("saito-sasaki-einstein-tv"), true, "I: 齋藤樹愛羅：とちぎ未来大使（2024）はTV（2022）より上");
  assertEqual(saito.indexOf("saito-tochigi-future-ambassador") > saito.indexOf("saito-kiara-berippichi-radio"), true, "I: 齋藤樹愛羅：とちぎ未来大使はラジオ（2026）の下");
}
