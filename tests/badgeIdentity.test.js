// 勲章を「その人の今の称号」で表示する共通処理のテスト（2026-11-01 新設・本人の依頼 R8 の 4）。
// 不具合：ランキングで、前のIDのときの記録の行は publicProfiles/{前のID} だけを見ていたため、
// 前のIDのプロフィールが消えている・古いと、称号を持っていても普通の丸になった（本人の 8月15日の記録）。
// ここでは Firebase に触れず、ダミーのUID・ダミーのプロフィールだけで確かめる（本物のUID・個人のデータは使わない）。
import {
  EMPTY_BADGE_STATE,
  badgeStateFromProfileValue,
  mergeBadgeStates,
  resolveBadgeIdentityChain,
  resolveDisplayBadgeState,
  fetchDisplayBadgeStates,
} from "../js/badgeIdentity.js";
import { resolveOshiBadgeTier } from "../js/oshiBadge.js";
import { buildOshiSwatch, buildProfileCard } from "../js/fanProfileCard.js";
import { MEMBERS } from "../js/data/members.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

// ---- ダミーのデータ（本物のUIDではない） ----
const SELF = "dummy-self-now"; // 今の自分のID
const SELF_OLD = "dummy-self-old"; // 自分の前のID（この端末が知っている）
const FRIEND_OLD = "dummy-friend-old"; // 友だちの前のID（uidSupersession でつながっている）
const FRIEND_MID = "dummy-friend-mid"; // 友だちの2つ目のID（さらに変わった）
const FRIEND_NOW = "dummy-friend-now"; // 友だちの今のID
const STRANGER = "dummy-stranger"; // つながりの無い別の人

const TIER1 = { hasNoMissMaster: true, hasEqualLoveMaster: false, hasEqualLoveComplete: false };
const TIER2 = { hasNoMissMaster: true, hasEqualLoveMaster: true, hasEqualLoveComplete: false };
const TIER3 = { hasNoMissMaster: true, hasEqualLoveMaster: true, hasEqualLoveComplete: true };
const tierOf = (state) => resolveOshiBadgeTier(state);

function runProfileValueTests() {
  assertEqual(badgeStateFromProfileValue(null), EMPTY_BADGE_STATE, "読み方：プロフィールが無ければ称号なし");
  assertEqual(badgeStateFromProfileValue({ hasNoMissMaster: true }), TIER1, "読み方：真偽値の形");
  assertEqual(
    badgeStateFromProfileValue({ unlockedAchievementIds: ["intro_ace", "no_miss_master", "equal_love_master"] }),
    TIER2,
    "読み方：真偽値が欠けた古い形式でも、取得済みの称号の一覧に入っていれば持っている"
  );
  assertEqual(
    badgeStateFromProfileValue({ hasNoMissMaster: "true", unlockedAchievementIds: "no_miss_master" }),
    EMPTY_BADGE_STATE,
    "読み方：true 以外の値・壊れた一覧は持っているとみなさない"
  );
  assertEqual(mergeBadgeStates(TIER1, null, { hasEqualLoveComplete: true }), { ...TIER1, hasEqualLoveComplete: true }, "合わせ方：どれかで持っていれば持っている");
  assertEqual(mergeBadgeStates(), EMPTY_BADGE_STATE, "合わせ方：何も無ければ称号なし");
}

function runChainTests() {
  const links = { [FRIEND_OLD]: FRIEND_MID, [FRIEND_MID]: FRIEND_NOW };
  assertEqual(resolveBadgeIdentityChain(STRANGER, { supersessionLinks: links, selfUid: SELF }), [STRANGER], "つながり：無ければ記録のUIDだけ");
  assertEqual(
    resolveBadgeIdentityChain(SELF_OLD, { selfUid: SELF, ownPreviousUids: [SELF_OLD] }),
    [SELF_OLD, SELF],
    "つながり：この端末が知っている自分の前のID → 今の自分"
  );
  assertEqual(
    resolveBadgeIdentityChain(FRIEND_OLD, { supersessionLinks: links }),
    [FRIEND_OLD, FRIEND_MID, FRIEND_NOW],
    "つながり：uidSupersession の対応表を2回たどって今のIDへ"
  );
  assertEqual(
    resolveBadgeIdentityChain("a", { supersessionLinks: { a: "b", b: "a" } }),
    ["a", "b"],
    "つながり：対応表が輪になっていても止まる"
  );
  assertEqual(resolveBadgeIdentityChain(SELF_OLD, { ownPreviousUids: [SELF_OLD] }), [SELF_OLD], "つながり：今のUIDが分からなければ、自分の前のIDでもたどらない");
  assertEqual(resolveBadgeIdentityChain("", {}), [], "つながり：UIDが無ければ空");
}

function runResolveTests() {
  // 本人の形：前のIDの記録（前のIDのプロフィールは消えている）、今のIDのプロフィールは第1段階、この端末の称号は第2段階
  const byUid = new Map([[SELF, TIER1]]);
  const own = { selfUid: SELF, ownPreviousUids: [SELF_OLD] };
  assertEqual(tierOf(resolveDisplayBadgeState(SELF_OLD, { badgeStateByUid: new Map() })), 0, "前の不具合の再現：前のIDのプロフィールだけを見ると称号なし");
  assertEqual(
    tierOf(resolveDisplayBadgeState(SELF_OLD, { badgeStateByUid: byUid, ...own })),
    1,
    "前のIDの記録：今のIDのプロフィールの称号が出る"
  );
  assertEqual(
    tierOf(resolveDisplayBadgeState(SELF_OLD, { badgeStateByUid: byUid, ...own, ownLocalBadgeState: TIER2 })),
    2,
    "前のIDの記録：今の自分なら、この端末の称号（ホームの勲章と同じ）も合わせる"
  );
  assertEqual(
    tierOf(resolveDisplayBadgeState(SELF, { badgeStateByUid: byUid, ...own })),
    1,
    "今のIDの記録：今のプロフィールの称号"
  );
  // 前のIDのプロフィールが古い写しで残っている（称号が少ない）場合も、今の方の称号が勝つ
  assertEqual(
    tierOf(resolveDisplayBadgeState(SELF_OLD, { badgeStateByUid: new Map([[SELF_OLD, TIER1], [SELF, TIER3]]), ...own })),
    3,
    "前のIDの古いプロフィールが残っていても、今のプロフィールの上の称号が出る"
  );
  // 称号の情報が無い記録（プロフィールが無い・真偽値が無い）
  assertEqual(
    tierOf(resolveDisplayBadgeState(STRANGER, { badgeStateByUid: new Map([[STRANGER, badgeStateFromProfileValue({ unlockedAchievementIds: ["no_miss_master"] })]]) })),
    1,
    "称号の真偽値が無い古いプロフィール：一覧から第1段階"
  );
  assertEqual(tierOf(resolveDisplayBadgeState(STRANGER, { badgeStateByUid: new Map() })), 0, "プロフィールの無い人：称号なし（壊れない）");
  // 友だちの前のIDの記録（uidSupersession でつながる）
  const links = { [FRIEND_OLD]: FRIEND_MID, [FRIEND_MID]: FRIEND_NOW };
  assertEqual(
    tierOf(resolveDisplayBadgeState(FRIEND_OLD, { badgeStateByUid: new Map([[FRIEND_NOW, TIER2]]), supersessionLinks: links, selfUid: SELF, ownLocalBadgeState: TIER3 })),
    2,
    "友だちの前のIDの記録：対応表の先の今のプロフィール（自分の端末の称号は混ぜない）"
  );
  // つながりの無い別の人には、他人の称号を貸さない（名前・本人キーが同じでもつながない）
  assertEqual(
    tierOf(resolveDisplayBadgeState(STRANGER, { badgeStateByUid: new Map([[SELF, TIER3]]), selfUid: SELF, ownPreviousUids: [SELF_OLD], ownLocalBadgeState: TIER3 })),
    0,
    "つながりの無い別の人には、自分の称号を付けない"
  );
}

async function runFetchTests() {
  const profiles = { [SELF]: { hasNoMissMaster: true }, [FRIEND_NOW]: { unlockedAchievementIds: ["no_miss_master", "equal_love_master", "equal_love_complete"] }, [STRANGER]: {} };
  const reads = [];
  const linkAsks = [];
  const fetchBadgeState = async (uid) => {
    reads.push(uid);
    if (uid === "dummy-broken") throw new Error("通信エラー（ダミー）");
    return profiles[uid] ?? null;
  };
  const fetchSupersessionLinks = async (uids) => {
    linkAsks.push([...uids]);
    const table = { [FRIEND_OLD]: FRIEND_MID, [FRIEND_MID]: FRIEND_NOW };
    return Object.fromEntries(uids.filter((u) => table[u]).map((u) => [u, table[u]]));
  };
  const result = await fetchDisplayBadgeStates([SELF_OLD, SELF, FRIEND_OLD, STRANGER, "dummy-broken", SELF_OLD], {
    fetchBadgeState,
    fetchSupersessionLinks,
    selfUid: SELF,
    ownPreviousUids: [SELF_OLD],
    ownLocalBadgeState: TIER2,
  });
  assertEqual(
    [SELF_OLD, SELF, FRIEND_OLD, STRANGER, "dummy-broken"].map((u) => tierOf(result.get(u))),
    [2, 2, 3, 0, 0],
    "まとめて解決：前のIDの自分／今の自分／友だちの前のID（2回変わった）／別の人／読めない人"
  );
  assertEqual(new Set(reads).size, reads.length, "まとめて解決：同じUIDのプロフィールは1回だけ読む");
  assertEqual(reads.includes(FRIEND_NOW) && reads.includes(FRIEND_MID), true, "まとめて解決：つながりの先のプロフィールも読む");
  assertEqual(linkAsks[0].includes(SELF) || linkAsks[0].includes(SELF_OLD), false, "まとめて解決：今の自分・自分の前のIDの対応表は読みに行かない");
  assertEqual(linkAsks.length <= 3, true, "まとめて解決：対応表を読む回数には上限がある");

  // 対応表が読めない（今の本番の Rules）・例外を出しても、一覧は壊れず、分かる範囲で出す
  const noLinks = await fetchDisplayBadgeStates([SELF_OLD, FRIEND_OLD], {
    fetchBadgeState,
    fetchSupersessionLinks: async () => {
      throw new Error("permission_denied（ダミー）");
    },
    selfUid: SELF,
    ownPreviousUids: [SELF_OLD],
    ownLocalBadgeState: null,
  });
  assertEqual([tierOf(noLinks.get(SELF_OLD)), tierOf(noLinks.get(FRIEND_OLD))], [1, 0], "対応表が読めなくても、自分の前のIDは端末の情報で今の自分へつながる");
}

async function runSameResultAcrossScreensTests() {
  // ランキング（UIDだけから読む）とフレンドの一覧・プロフィール（読み込み済みのプロフィールから決める）で同じ段階になる
  const profileList = [
    { uid: SELF, displayName: "ダミー自分", oshiMemberId: "noguchi-iori", hasNoMissMaster: true, unlockedAchievementIds: ["no_miss_master"] },
    { uid: SELF_OLD, displayName: "ダミー自分", oshiMemberId: "noguchi-iori", hasNoMissMaster: false, unlockedAchievementIds: [] },
    { uid: STRANGER, displayName: "ダミー他人", oshiMemberId: "oba-hana", hasEqualLoveMaster: true, unlockedAchievementIds: ["equal_love_master"] },
  ];
  const own = { selfUid: SELF, ownPreviousUids: [SELF_OLD], ownLocalBadgeState: TIER2 };
  const byUid = new Map(profileList.map((p) => [p.uid, badgeStateFromProfileValue(p)]));
  const fromProfiles = profileList.map((p) => tierOf(resolveDisplayBadgeState(p.uid, { badgeStateByUid: byUid, ...own })));

  const lb = await import("../js/timeAttackLeaderboardScreen.js");
  const rankingStates = await lb.resolveLeaderboardBadgeStates(
    profileList.map((p) => ({ uid: p.uid })),
    {
      fetchBadgeState: async (uid) => profileList.find((p) => p.uid === uid) ?? null,
      fetchLinks: async () => ({}),
      ownIdentity: own,
    }
  );
  const fromRanking = profileList.map((p) => tierOf(rankingStates.get(p.uid)));
  assertEqual(fromProfiles, [2, 2, 2], "同じ結果：フレンドの一覧・プロフィールの段階（今の自分・前のIDの自分・他人）");
  assertEqual(fromRanking, fromProfiles, "同じ結果：ランキングでも同じ段階");

  // 画面の部品でも同じ段階の勲章が付く（ランキングの行・フレンドのカード・プロフィールの大きい丸は同じ buildOshiSwatch）
  const row = lb.buildLeaderboardRow(
    { uid: SELF_OLD, displayName: "ダミー自分", oshiMemberId: "noguchi-iori", clearTimeMs: 9000, missCount: 0, achievedAt: 1 },
    2,
    rankingStates.get(SELF_OLD),
    true,
    "intro",
    5,
    "all",
    {}
  );
  const card = buildProfileCard(profileList[1], MEMBERS, () => {}, { myUid: SELF, badgeState: resolveDisplayBadgeState(SELF_OLD, { badgeStateByUid: byUid, ...own }) });
  const detail = buildOshiSwatch(MEMBERS, "noguchi-iori", resolveDisplayBadgeState(SELF_OLD, { badgeStateByUid: byUid, ...own }));
  const tierAttr = (el) => el.querySelector(".fan-profile-swatch")?.dataset.oshiBadgeTier ?? el.dataset.oshiBadgeTier ?? "0";
  assertEqual([tierAttr(row), tierAttr(card), tierAttr(detail)], ["2", "2", "2"], "同じ結果：ランキングの行・フレンドのカード・プロフィールの丸に同じ第2段階の勲章");
  const plainCard = buildProfileCard(profileList[2], MEMBERS, () => {}, {});
  assertEqual(tierAttr(plainCard), "2", "カード：勲章の状態を渡さなければ今までどおりプロフィール自身の真偽値で決まる");
}

async function runSourceTests() {
  const screen = await fetchText("js/timeAttackLeaderboardScreen.js");
  assertEqual(/fetchPublicProfileBadgeState\(entry\.uid\)/.test(screen), false, "ランキング：記録のUIDのプロフィールだけを見る書き方は残っていない");
  assertEqual(screen.includes("fetchDisplayBadgeStates("), true, "ランキング：共通の解決処理を使う");
  const friends = await fetchText("js/fanProfilesScreen.js");
  assertEqual((friends.match(/resolveProfileDisplayBadgeState\(profile\)/g) ?? []).length >= 2, true, "フレンド：一覧のカードとプロフィールの両方が共通の解決処理を使う");
  const sync = await fetchText("js/publicProfileSync.js");
  assertEqual(sync.includes("return badgeStateFromProfileValue(snapshot.val());"), true, "公開プロフィールの1件読み：共通の読み方（古い形式も読む）");
  const own = await fetchText("js/badgeIdentity.js");
  assertEqual(/\b(set|update|remove|push)\(ref\(/.test(own) || /localStorage\.setItem/.test(own), false, "共通処理：Firebase・端末の保存データに書き込まない");
  const sw = await fetchText("sw.js");
  assertEqual(sw.includes('"./js/badgeIdentity.js"') || sw.includes("'./js/badgeIdentity.js'") || sw.includes("js/badgeIdentity.js"), true, "APP_SHELL：js/badgeIdentity.js を含む");
}

export async function runBadgeIdentityTests() {
  runProfileValueTests();
  runChainTests();
  runResolveTests();
  await runFetchTests();
  await runSameResultAcrossScreensTests();
  await runSourceTests();
}
