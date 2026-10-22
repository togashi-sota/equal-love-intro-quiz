// 【2026-10-23新設】オンライン表示の鮮度判定（「ゆき」の不具合）・開始予定ステータス・情報更新の回帰テスト。
import {
  computeIsOnlineForDisplay,
  buildPresenceStatusLabel,
  sortProfilesByPresence,
  PRESENCE_STALE_CONNECTION_MS,
  getPushIdTimestampMs,
  selectStaleOwnConnectionIds,
  PRESENCE_OWN_GHOST_MAX_AGE_MS,
} from "../js/presencePayloads.js";
import { MEMBER_ACTIVITIES, ACTIVITY_STATUS } from "../js/data/memberActivities.js";
import { LIVE_EVENTS, LIVE_STATUS } from "../js/data/liveHistory.js";
import { getMemberActivities } from "../js/memberUtils.js";
import {
  getEffectiveActivityStatus,
  getActivityGroupRank,
  sortActivitiesByDateDesc,
  buildActivityCard,
  getTodayInJapan,
} from "../js/membersScreen.js";
import { assertEqual } from "./test-utils.js";

const find = (id) => MEMBER_ACTIVITIES.find((activity) => activity.id === id) ?? null;

export function runOct23UpdatesTests() {
  const now = Date.UTC(2026, 9, 22, 17, 32, 0);
  const minutes = (n) => n * 60 * 1000;

  // ===== A. オンライン表示の鮮度判定 =====
  // 本番で観測した形：接続ノードが1件残り、lastSeen が8日以上前で止まっている
  const ghost = { connections: { "-P3tBH9OxxxxxxxxxxX": true }, lastSeen: now - 200 * 60 * 60 * 1000, isPlaying: false };
  assertEqual(computeIsOnlineForDisplay(ghost, now), false, "A: 接続ノードが残っていても lastSeen が8日前ならオフライン（ゆきの再現ケース）");
  assertEqual(buildPresenceStatusLabel(ghost, now).text, "8日前", "A: 表示は最終ログインの「8日前」");
  assertEqual(buildPresenceStatusLabel({ ...ghost, isPlaying: true }, now).isPlaying, false, "A: 残骸は「プレイ中」とも表示しない");
  assertEqual(computeIsOnlineForDisplay({ connections: { a: true }, lastSeen: now - minutes(2) }, now), true, "A: 2分前に更新（通常のハートビート間隔）ならオンライン");
  assertEqual(computeIsOnlineForDisplay({ connections: { a: true }, lastSeen: now - minutes(14) }, now), true, "A: 14分前でもオンライン（通常プレイ中の人を誤ってオフラインにしない余裕）");
  assertEqual(computeIsOnlineForDisplay({ connections: { a: true }, lastSeen: now - PRESENCE_STALE_CONNECTION_MS - 1 }, now), false, "A: 15分を超えて更新が無ければオフライン");
  assertEqual(computeIsOnlineForDisplay({ connections: { a: true } }, now), true, "A: lastSeen の無い古い形式は従来どおり接続ノードで判定");
  assertEqual(computeIsOnlineForDisplay({ connections: { a: true, b: true }, lastSeen: now - minutes(1) }, now), true, "A: 複数端末でもオンライン");
  assertEqual(computeIsOnlineForDisplay({ connections: {}, lastSeen: now - 1000 }, now), true, "A: 一瞬の通信断の猶予は従来どおり");
  assertEqual(computeIsOnlineForDisplay({ connections: { a: true }, lastSeen: now + minutes(3) }, now), true, "A: 時計のずれで lastSeen が少し未来でもオンライン");
  const sorted = sortProfilesByPresence(
    [{ uid: "ghost", displayName: "ゆき" }, { uid: "live", displayName: "がしお" }],
    { ghost, live: { connections: { c: true }, lastSeen: now - minutes(1) } },
    now
  ).map((profile) => profile.uid);
  assertEqual(sorted, ["live", "ghost"], "A: 並び順でも残骸はオフライン側");

  // ===== B. push ID の時刻と、本人の古い接続ノードの選び方 =====
  assertEqual(new Date(getPushIdTimestampMs("-P3tBH9O")).toISOString(), "2026-10-14T06:54:43.865Z", "B: push ID から作成時刻を読める（本番の残骸ノードの作成時刻）");
  assertEqual(getPushIdTimestampMs("短い"), null, "B: 形式違いは null");
  assertEqual(getPushIdTimestampMs(null), null, "B: null でも落ちない");
  const nowForGhost = Date.UTC(2026, 9, 22, 17, 32, 0);
  assertEqual(
    selectStaleOwnConnectionIds({ "-P3tBH9Oaaaaaaaaaaaa": true, current: true }, "current", nowForGhost),
    ["-P3tBH9Oaaaaaaaaaaaa"],
    "B: 24時間以上前に作られた自分の接続ノードだけを掃除対象にする"
  );
  const freshId = (() => {
    const chars = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
    let t = nowForGhost - 60 * 60 * 1000;
    let id = "";
    for (let i = 0; i < 8; i += 1) {
      id = chars.charAt(t % 64) + id;
      t = Math.floor(t / 64);
    }
    return `${id}zzzzzzzzzzzz`;
  })();
  assertEqual(selectStaleOwnConnectionIds({ [freshId]: true }, "current", nowForGhost), [], "B: 1時間前に別端末が作った接続は消さない");
  assertEqual(selectStaleOwnConnectionIds({ current: true }, "current", nowForGhost), [], "B: 今の接続は絶対に消さない");
  assertEqual(selectStaleOwnConnectionIds({ "読めないキー": true }, "x", nowForGhost), [], "B: 作成時刻が読めないキーは消さない");
  assertEqual(selectStaleOwnConnectionIds(null, "x", nowForGhost), [], "B: connections が無くても落ちない");
  assertEqual(PRESENCE_OWN_GHOST_MAX_AGE_MS, 24 * 60 * 60 * 1000, "B: 掃除の基準は24時間");

  // ===== C. 開始予定ステータス =====
  const upcoming = { status: ACTIVITY_STATUS.UPCOMING, startDate: "2026-11-01" };
  assertEqual(getEffectiveActivityStatus(upcoming, "2026-10-23"), "upcoming", "C: 開始日前は「開始予定」");
  assertEqual(getEffectiveActivityStatus(upcoming, "2026-11-01"), "ongoing", "C: 開始日（日本時間）を迎えたら「継続中」");
  assertEqual(getEffectiveActivityStatus({ status: ACTIVITY_STATUS.ENDED, startDate: "2020-01-01" }, "2026-10-23"), "ended", "C: 他のステータスは日付で変えない");
  assertEqual(getEffectiveActivityStatus({ status: ACTIVITY_STATUS.UPCOMING, startDate: null }, "2026-10-23"), "upcoming", "C: 開始日が無ければ予定のまま");
  assertEqual(getActivityGroupRank(upcoming), 0, "C: 開始予定は継続中と同じ上のグループ");
  assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(getTodayInJapan()), true, "C: 日本時間の今日を YYYY-MM-DD で返す");
  assertEqual(getTodayInJapan(new Date("2026-10-31T15:30:00Z")), "2026-11-01", "C: 日本時間で日付が変わる（UTC 15:30＝日本 0:30）");

  // ===== D. 大場花菜「はなまる！」 =====
  const hanamaru = find("oba-nack5-hanamaru");
  assertEqual(hanamaru !== null, true, "D: はなまる！が登録されている");
  assertEqual(hanamaru.memberId, "oba-hana", "D: 大場花菜");
  assertEqual(hanamaru.title, "＝LOVE 大場花菜の「はなまる！」", "D: 正式名称");
  assertEqual(hanamaru.type, "radio", "D: ラジオ");
  assertEqual([hanamaru.status, hanamaru.startDate], ["upcoming", "2026-11-01"], "D: 2026-11-01開始の開始予定");
  assertEqual(["FM NACK5", "2026年11月1日", "毎週日曜25:00〜25:30", "録音番組"].every((text) => hanamaru.description.includes(text)), true, "D: 局・初回・放送時間・録音番組");
  assertEqual(hanamaru.links[0].url, "https://www.nack5.co.jp/program/love_oba_hanamaru/", "D: 番組公式ページ");
  assertEqual(find("oba-artistspoken").status, ACTIVITY_STATUS.ONGOING, "D: 既存のイマフレランチ（金曜）は残っている");
  const obaIds = sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, "oba-hana")).map((activity) => activity.id);
  assertEqual(obaIds[0], "oba-nack5-hanamaru", "D: 開始予定の新番組は一番上");
  const hanamaruCard = buildActivityCard(hanamaru);
  const expectedStatusText = getEffectiveActivityStatus(hanamaru) === "upcoming" ? "開始予定" : "継続中";
  assertEqual(hanamaruCard.querySelector(".activity-card-status").textContent, expectedStatusText, "D: タグは開始日前「開始予定」／開始後「継続中」");
  assertEqual([...hanamaruCard.querySelectorAll("a")].every((link) => link.target === "_blank" && link.rel.includes("noopener")), true, "D: リンクは別タブ");

  // ===== E. 音嶋莉沙 evelyn（既存カードを更新、重複なし） =====
  const evelynCards = MEMBER_ACTIVITIES.filter((activity) => activity.memberId === "otoshima-risa" && activity.title.includes("evelyn"));
  assertEqual(evelynCards.length, 1, "E: evelynは1件だけ（重複追加していない）");
  assertEqual(evelynCards[0].description.includes("2026 Winter collection"), true, "E: 2026 Winter collectionを反映");
  assertEqual(evelynCards[0].description.includes("2025 Winter collection"), true, "E: 過去シーズンの履歴を残している");
  assertEqual(evelynCards[0].links.map((link) => link.url), ["https://evelyn.tokyo.jp/", "https://equal-love.jp/news/detail/12272"], "E: ブランド公式と＝LOVE公式情報");

  // ===== F. 齋藤樹愛羅 MeloRia（発売開始済み・イメージモデルは継続中） =====
  const meloria = find("saito-meloria-image-model");
  assertEqual(meloria.status, ACTIVITY_STATUS.ONGOING, "F: イメージモデルは継続中");
  assertEqual(meloria.description.includes("予定"), false, "F: 「発売開始予定」の表記が残っていない");
  assertEqual(meloria.description.includes("2026年10月21日（水）12:00に発売開始"), true, "F: 発売開始日時");

  // ===== G. 9周年公演は開催済み =====
  const ninth = LIVE_EVENTS.find((event) => event.id === "live-9th-anniversary-premium-concert");
  assertEqual(ninth.status, LIVE_STATUS.HELD, "G: 9周年公演（2026-10-15・16）は開催済み");
  const dome = LIVE_EVENTS.find((event) => event.id === "live-tokyo-dome-announced");
  assertEqual(dome.status, LIVE_STATUS.ANNOUNCED, "G: 東京ドーム（2027-01）は開催予定のまま");

  // ===== H. 全データの監査：「予定」を含む説明なのに開始日が過ぎているもの・開催予定のまま日程が過ぎた公演 =====
  const today = getTodayInJapan();
  const staleActivities = MEMBER_ACTIVITIES.filter(
    (activity) => /予定/.test(activity.description ?? "") && typeof activity.startDate === "string" && activity.startDate < today && activity.status !== ACTIVITY_STATUS.UPCOMING
  ).map((activity) => activity.id);
  assertEqual(staleActivities, [], "H: 開始済みなのに説明に「予定」が残る個人活動が無い（2026-10-23時点）");
  const staleLives = LIVE_EVENTS.filter((event) => event.status === LIVE_STATUS.ANNOUNCED && (event.endDate ?? event.startDate) < "2026-10-23").map((event) => event.id);
  assertEqual(staleLives, [], "H: 2026-10-23時点で、開催予定のまま日程が過ぎた公演が無い");
}
