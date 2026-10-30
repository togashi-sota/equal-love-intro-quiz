// 【2026-10-31新設・本人の実機報告】フレンド一覧に本人「がしお」が今のID #Gr72 と前のID #PWW2 の2行で出ていた件の回帰テスト。
// ・同じUIDは1行だけ（取得や再描画が重なっても増えない）
// ・「今の自分」「自分の以前のID（確かめた／らしい）」「別の人」を区別して出す。表示名だけでは同じ人とみなさない
// ・自分の以前のIDらしいカードに「一緒に遊ぶ」を出さない。自分のカードに「同じ名前の別プレイヤーがいます」と誤って出さない
// ・起動時の自動処理では、以前のIDの公開データ（フレンドのカード・オンライン記録）を消さない（本人が違いを見て承認したときだけ）
// Firebase には一切接続しない（純粋関数・DOM・ソースの構造だけを見る）。
import {
  collapseSamePlayerProfiles,
  annotateSameNameProfiles,
  buildProfileIdentityNote,
  dedupeProfilesByUid,
  classifyProfileRelation,
  canInviteProfile,
} from "../js/fanProfilesIdentity.js";
import { buildProfileCard } from "../js/fanProfileCard.js";
import { listAutoMigrationTargets, UID_MERGE_STATE, enqueueUidMerge, selectActiveUidMerge } from "../js/uidMergeQueue.js";
import { describeUidMergePlan, describeUidMergeDifferences, isUidMergePlanEmpty } from "../js/uidSupersession.js";
import { comparePublicIdentity } from "../js/identityDataComparison.js";
import { MEMBERS } from "../js/data/members.js";
import { decideHiddenPresenceDelayMs, PRESENCE_HIDDEN_GRACE_MS, buildPresenceDisplay, selectCurrentRoomPlayerUids } from "../js/presencePayloads.js";
import { assertEqual } from "./test-utils.js";

// 実機の画面と同じ形（UIDは記録にある本人のもの。どちらも本人キーが同じ・表示名「がしお」）
const GR72 = "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72";
const PWW2 = "sh5vDFnk64Mdp5fCa1jomwRgPWW2";
const KEY_GASHIO = "g".repeat(64);
const KEY_OTHER = "o".repeat(64);

function profile(uid, displayName, extra = {}) {
  return { uid, displayName, identityKey: null, updatedAt: null, unlockedAchievementIds: [], oshiMemberId: null, ...extra };
}

// 画面と同じ順番で、表示用の一覧を作る（js/fanProfilesScreen.js の buildDisplayProfiles と同じ組み立て）
function buildView(profiles, options) {
  const collapsed = collapseSamePlayerProfiles(dedupeProfilesByUid(profiles), options);
  return { ...collapsed, profiles: annotateSameNameProfiles(collapsed.profiles) };
}

function runDedupeTests() {
  // D1. 同じUIDが2回渡されても1行
  {
    const list = [profile("A", "がしお", { updatedAt: 1 }), profile("B", "サブ"), profile("A", "がしお", { updatedAt: 5 })];
    const out = dedupeProfilesByUid(list);
    assertEqual(out.map((p) => p.uid), ["A", "B"], "D1: 同じUIDは1行だけ（最初に現れた位置のまま）");
    assertEqual(out[0].updatedAt, 5, "D1: 同じUIDが複数あれば、更新が新しい方を残す");
  }
  // D2. 壊れた値は落ちずに捨てる
  assertEqual(dedupeProfilesByUid([null, {}, { uid: "" }, profile("X", "x")]).map((p) => p.uid), ["X"], "D2: uid の無い値は捨てる");
  assertEqual(dedupeProfilesByUid(undefined), [], "D2: 配列でなくても空で返す");
  // D3. 一覧の組み立てを2回重ねても、行は増えない（再描画が何回あっても同じ結果）
  {
    const list = [profile(GR72, "がしお", { identityKey: KEY_GASHIO }), profile("S", "サブ")];
    const once = buildView(list, { myUid: GR72 }).profiles.map((p) => p.uid);
    const twice = buildView([...list, ...list], { myUid: GR72 }).profiles.map((p) => p.uid);
    assertEqual(twice, once, "D3: 同じ取得結果が2回分届いても、行の数と順番は1回分と同じ");
  }
}

function runRelationTests() {
  // R1. 実機の再現：端末が #PWW2 を自分の旧IDと知らない（整理待ちの列に無い）場合
  {
    const list = [
      profile(GR72, "がしお", { identityKey: KEY_GASHIO, updatedAt: 20 }),
      profile("SUB-uid", "サブ", { identityKey: KEY_OTHER }),
      profile(PWW2, "がしお", { identityKey: KEY_GASHIO, updatedAt: 10 }),
    ];
    const view = buildView(list, { myUid: GR72, myKnownOldUids: [] });
    const me = view.profiles.find((p) => p.uid === GR72);
    const old = view.profiles.find((p) => p.uid === PWW2);
    assertEqual(view.profiles.length, 3, "R1: 確かめられない間は、以前のIDらしいカードも隠さない（安全側）");
    assertEqual(classifyProfileRelation(me, { myUid: GR72 }), "me", "R1: #Gr72 は「今の自分」");
    assertEqual(classifyProfileRelation(old, { myUid: GR72 }), "my-old-candidate", "R1: #PWW2 は「自分の以前のIDかもしれない（未確認）」");
    assertEqual(buildProfileIdentityNote(me, { myUid: GR72 }), "#Gr72（あなた・今のID）", "R1: 自分のカードに「同じ名前の別プレイヤーがいます」と誤って出さない");
    assertEqual(buildProfileIdentityNote(old, { myUid: GR72 }), "#PWW2・あなたの以前のIDかもしれません（未確認）", "R1: 以前のIDらしいカードは「あなたの」と明記");
    assertEqual(canInviteProfile(old, { myUid: GR72 }), false, "R1: 自分の以前のIDらしいカードには「一緒に遊ぶ」を出さない");
    assertEqual(canInviteProfile(view.profiles.find((p) => p.uid === "SUB-uid"), { myUid: GR72 }), true, "R1: 別の人には「一緒に遊ぶ」を出せる");
  }
  // R2. 端末が #PWW2 を自分の旧IDと知っている（所有権の確認を通った）→ 1行にまとまる
  {
    const list = [profile(GR72, "がしお", { identityKey: KEY_GASHIO }), profile(PWW2, "がしお", { identityKey: KEY_GASHIO })];
    const view = buildView(list, { myUid: GR72, myKnownOldUids: [PWW2] });
    assertEqual(view.profiles.map((p) => p.uid), [GR72], "R2: 確かめた以前のIDはまとめて1行（データは消さない）");
    assertEqual(view.hidden, [{ uid: PWW2, primaryUid: GR72, reason: "my-old-uid" }], "R2: まとめた理由は「端末で確かめた自分の旧ID」");
    assertEqual(buildProfileIdentityNote(view.profiles[0], { myUid: GR72 }), null, "R2: まとまった後は補足なし");
    const admin = buildView(list, { myUid: GR72, myKnownOldUids: [PWW2], keepHiddenForAdmin: true });
    const oldCard = admin.profiles.find((p) => p.uid === PWW2);
    assertEqual(classifyProfileRelation(oldCard, { myUid: GR72 }), "my-old-verified", "R2: 管理者には「確かめた自分の以前のID」として残る");
    assertEqual(canInviteProfile(oldCard, { myUid: GR72 }), false, "R2: 確かめた自分の以前のIDにも「一緒に遊ぶ」を出さない");
  }
  // R3. 友だちから見た画面：対応表（uidSupersession。v2.2 で読める）があれば1行、無ければ「未確認」の補足
  {
    const list = [profile(GR72, "がしお", { identityKey: KEY_GASHIO, updatedAt: 2 }), profile(PWW2, "がしお", { identityKey: KEY_GASHIO, updatedAt: 1 })];
    const rank = { [GR72]: { online: true, lastSeen: 9 }, [PWW2]: { online: false, lastSeen: 1 } };
    const noLink = buildView(list, { myUid: "FRIEND", presenceRankByUid: rank });
    const gr = noLink.profiles.find((p) => p.uid === GR72);
    const pw = noLink.profiles.find((p) => p.uid === PWW2);
    assertEqual(buildProfileIdentityNote(gr, { myUid: "FRIEND" }), null, "R3: 友だちの画面でも、今のカードに「同じ名前の別プレイヤー」と出さない（未確認の旧カードは数えない）");
    assertEqual(buildProfileIdentityNote(pw, { myUid: "FRIEND" }), "#PWW2・#Gr72 の以前のIDかもしれません（未確認）", "R3: 旧カードには未確認の補足");
    assertEqual(classifyProfileRelation(pw, { myUid: "FRIEND" }), "old-candidate", "R3: 友だちから見ると「他の人の以前のIDかもしれない」");
    assertEqual(canInviteProfile(pw, { myUid: "FRIEND" }), true, "R3: 友だちの画面では、確かめられない以上は招待を止めない（別人の可能性があるため）");
    const linked = buildView(list, { myUid: "FRIEND", supersessionLinks: { [PWW2]: GR72 }, presenceRankByUid: rank });
    assertEqual(linked.profiles.map((p) => p.uid), [GR72], "R3: 対応表が読めれば、友だちの画面でも1行");
  }
  // R4. 表示名だけでは同じ人とみなさない
  {
    const list = [profile(GR72, "がしお", { identityKey: KEY_GASHIO }), profile("OTHER-1234", "がしお", { identityKey: KEY_OTHER }), profile("NOKEY-5678", "がしお")];
    const view = buildView(list, { myUid: GR72 });
    assertEqual(view.profiles.length, 3, "R4: 名前が同じでも、本人キーが違う・無いカードは全部残す");
    assertEqual(view.profiles.map((p) => classifyProfileRelation(p, { myUid: GR72 })), ["me", "other", "other"], "R4: 名前だけ同じ人は「別の人」");
    assertEqual(buildProfileIdentityNote(view.profiles[0], { myUid: GR72 }), "#Gr72（あなた）・同じ名前の別プレイヤーがいます", "R4: 本当に別の人がいるときは、今までどおり知らせる");
    assertEqual(buildProfileIdentityNote(view.profiles[1], { myUid: GR72 }), "#1234・同じ名前の別プレイヤー", "R4: 別の人のカードには短い印");
    assertEqual(canInviteProfile(view.profiles[1], { myUid: GR72 }), true, "R4: 同じ名前の別の人は招待できる");
  }
  // R5. 以前のIDらしいカードと、本当に同じ名前の別の人が同時にいる
  {
    const list = [profile(GR72, "がしお", { identityKey: KEY_GASHIO }), profile(PWW2, "がしお", { identityKey: KEY_GASHIO }), profile("OTHER-1234", "がしお", { identityKey: KEY_OTHER })];
    const view = buildView(list, { myUid: GR72 });
    const notes = Object.fromEntries(view.profiles.map((p) => [p.uid, buildProfileIdentityNote(p, { myUid: GR72 })]));
    assertEqual(notes[GR72], "#Gr72（あなた）・同じ名前の別プレイヤーがいます", "R5: 別の人がいれば自分のカードに知らせる");
    assertEqual(notes[PWW2], "#PWW2・あなたの以前のIDかもしれません（未確認）", "R5: 以前のIDらしいカードは別の補足");
    assertEqual(notes["OTHER-1234"], "#1234・同じ名前の別プレイヤー", "R5: 別の人には短い印");
  }
  // R6. 名前を変えた以前のID（本人キーだけ同じ）は、名前が違うので「未確認」とも言わない（何も足さない）
  {
    const view = buildView([profile(GR72, "がしお", { identityKey: KEY_GASHIO }), profile(PWW2, "がっしー", { identityKey: KEY_GASHIO })], { myUid: GR72 });
    assertEqual(view.profiles.map((p) => classifyProfileRelation(p, { myUid: GR72 })), ["me", "other"], "R6: 本人キーだけの一致では関係を付けない（書き写せる値のため）");
  }
}

function runCardDomTests() {
  // C1. カードに関係が付き、自分の以前のIDらしいカードには「一緒に遊ぶ」の行が出ない
  const online = { connections: { c1: true }, lastSeen: Date.now() };
  const view = buildView(
    [profile(GR72, "がしお", { identityKey: KEY_GASHIO }), profile(PWW2, "がしお", { identityKey: KEY_GASHIO })],
    { myUid: GR72 }
  );
  const oldProfile = view.profiles.find((p) => p.uid === PWW2);
  const oldCard = buildProfileCard(oldProfile, MEMBERS, null, { presenceEntry: online, onPlayInviteRequest: () => {}, myUid: GR72 });
  assertEqual(oldCard.tagName, "BUTTON", "C1: 自分の以前のIDらしいカードは、オンラインでも「一緒に遊ぶ」の行を付けない");
  assertEqual(oldCard.dataset.identityRelation, "my-old-candidate", "C1: カードに関係（自分の以前のIDらしい）が付く");
  assertEqual(oldCard.querySelector(".fan-profile-card-identity-note")?.textContent, "#PWW2・あなたの以前のIDかもしれません（未確認）", "C1: 補足が画面に出る");
  const meCard = buildProfileCard(view.profiles.find((p) => p.uid === GR72), MEMBERS, null, { presenceEntry: online, onPlayInviteRequest: () => {}, myUid: GR72 });
  assertEqual(meCard.dataset.identityRelation, "me", "C1: 自分のカードは「me」");
  const friendCard = buildProfileCard(profile("F1", "ともだち"), MEMBERS, null, { presenceEntry: online, onPlayInviteRequest: () => {}, myUid: GR72 });
  assertEqual(friendCard.className, "fan-profile-card-wrap", "C1: 別の人（オンライン）には今までどおり「一緒に遊ぶ」の行が付く");
  assertEqual(friendCard.querySelector(".fan-profile-card").dataset.identityRelation, "other", "C1: 別の人は「other」");
}

function runAutoMigrationTargetTests() {
  // Q1. 起動時の自動処理（ランキングの引き継ぎだけ）の対象
  const now = 1_000_000;
  const queue = [
    { oldUid: "u-merged", state: UID_MERGE_STATE.MERGED, recordedAt: 1, leaderboardMergedAt: 5, nextRetryAt: null },
    { oldUid: "u-awaiting", state: UID_MERGE_STATE.MERGING, recordedAt: 2, leaderboardMergedAt: 7, nextRetryAt: null },
    { oldUid: "u-blocked-later", state: UID_MERGE_STATE.BLOCKED, recordedAt: 3, leaderboardMergedAt: null, nextRetryAt: now + 10 },
    { oldUid: "u-blocked-due", state: UID_MERGE_STATE.BLOCKED, recordedAt: 4, leaderboardMergedAt: null, nextRetryAt: now - 10 },
    { oldUid: "u-new", state: UID_MERGE_STATE.PENDING, recordedAt: 6, leaderboardMergedAt: null, nextRetryAt: null },
    { oldUid: "u-failed", state: UID_MERGE_STATE.FAILED, recordedAt: 5, leaderboardMergedAt: null, nextRetryAt: null },
  ];
  assertEqual(
    listAutoMigrationTargets(queue, { nowMs: now }).map((e) => e.oldUid),
    ["u-blocked-due", "u-failed", "u-new"],
    "Q1: 整理済み・ランキング引き継ぎ済み（本人の確認待ち）・再確認の時刻前の blocked は対象外。記録が古い順"
  );
  assertEqual(listAutoMigrationTargets(null), [], "Q1: 列が無くても空");

  // Q2. 端末が後から見つけた旧UID（本人の確認待ち）は、自動では何もしない
  const plain = enqueueUidMerge([], { oldUid: "u-a", backupId: "b", nowMs: 1 });
  assertEqual("requiresApproval" in plain.queue[0], false, "Q2: 印の無い記録は今までと同じ形（項目を足さない）");
  const recheck = enqueueUidMerge(plain.queue, { oldUid: "u-b", backupId: "b", nowMs: 2, requiresApproval: true });
  assertEqual(recheck.queue[1].requiresApproval, true, "Q2: 読み直しで見つけた旧UIDには「本人の確認待ち」の印");
  assertEqual(listAutoMigrationTargets(recheck.queue, { nowMs: 3 }).map((e) => e.oldUid), ["u-a"], "Q2: 確認待ちの旧UIDは起動時の自動処理の対象にしない");
  const again = enqueueUidMerge(recheck.queue, { oldUid: "u-b", backupId: "b", nowMs: 4 });
  assertEqual([again.added, again.queue.length], [false, 2], "Q2: 何度読み直しても同じ旧UIDは2件にならない");
}

function runMergePlanDescriptionTests() {
  // M1. 整理の前に見せる違い（称号・推し・ランキング）と、消えるものの明記
  const division = {
    variant: "intro",
    questionCountValue: "all",
    categoryFilterValue: "all",
    oldEntry: { clearTimeMs: 137030 },
    newEntry: { clearTimeMs: 140000 },
    legacyEntries: [],
    bestOldCandidate: { clearTimeMs: 137030 },
    action: "copyThenDeleteOld",
  };
  const oldProfile = { displayName: "がしお", oshiMemberId: "a", unlockedAchievementIds: ["t1", "t2", "t3"] };
  const newProfile = { displayName: "がしお", oshiMemberId: "b", unlockedAchievementIds: ["t1"] };
  const plan = {
    ok: true,
    oldUid: PWW2,
    newUid: GR72,
    divisions: [division],
    profile: { oldExists: true, newExists: true },
    presence: { oldExists: true },
    comparison: comparePublicIdentity({ oldUid: PWW2, newUid: GR72, oldProfile, newProfile, leaderboardDivisions: [division], oldPresence: { lastSeen: 1 } }),
  };
  const diff = describeUidMergeDifferences(plan);
  assertEqual(diff[0], "以前のID #PWW2 と 今のID #Gr72 の違い：", "M1: どのIDとどのIDを比べるかを最初に出す");
  assertEqual(diff.some((l) => l.includes("称号の表示：以前のIDだけ 2個・今のIDだけ 0個")), true, "M1: 称号の違いを出す");
  assertEqual(diff.some((l) => l.includes("推しメンの表示が違います")), true, "M1: 推しの違いを出す");
  assertEqual(diff.some((l) => l.includes("ランキング：以前のIDだけ 0区分・今のIDだけ 0区分・両方 1区分（うち以前の方が速い 1区分）")), true, "M1: 自己ベスト（ランキング）の違いを出す");
  assertEqual(diff[diff.length - 1], "・称号・プレイ記録・推し・設定・自己ベストは、IDではなくこの端末に保存されています。この整理では変わりません", "M1: 端末の記録はこの整理で変わらないことを明記");
  const lines = describeUidMergePlan(plan);
  assertEqual(lines.slice(0, diff.length), diff, "M1: 計画の表示は「違い」から始まる");
  assertEqual(lines.includes("整理すると消えるもの：以前のID（#PWW2）のフレンドのカード（消す前にこの端末へ控えを残します）"), true, "M1: 消えるもの（以前のIDのカード）を明記");
  assertEqual(lines.includes("整理すると消えるもの：以前のID（#PWW2）のオンライン表示の記録"), true, "M1: 消えるもの（オンライン記録）を明記");
  assertEqual(describeUidMergePlan({ ok: false }), [], "M1: 計画が無ければ何も出さない");

  // M2. 以前のIDに何も残っていなければ、案内を出し続けない（端末の印だけ整理済みにする）
  assertEqual(isUidMergePlanEmpty(plan), false, "M2: 残っているものがあれば「空」ではない");
  const emptyPlan = { ok: true, oldUid: "x", newUid: "y", divisions: [{ oldEntry: null, legacyEntries: [], newEntry: { clearTimeMs: 1 } }], profile: { oldExists: false, newExists: true }, presence: { oldExists: false } };
  assertEqual(isUidMergePlanEmpty(emptyPlan), true, "M2: ランキング・カード・オンライン記録が何も無ければ「空」");
  assertEqual(isUidMergePlanEmpty({ ...emptyPlan, divisions: [{ oldEntry: null, legacyEntries: [{ clearTimeMs: 5 }] }] }), false, "M2: 旧世代のランキングだけでも残っていれば「空」ではない");
  assertEqual(isUidMergePlanEmpty({ ok: false }), false, "M2: 計画が作れないときは閉じない");
}

async function runWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const supersession = await fetchText("js/uidSupersession.js");
  const singleStart = supersession.indexOf("async function runSingleUidMigration(");
  const singleEnd = supersession.indexOf("export async function runPendingUidMigration(");
  const single = supersession.slice(singleStart, singleEnd);
  assertEqual(singleStart > 0 && singleEnd > singleStart, true, "W1: 起動時の自動処理の関数がある");
  assertEqual(/remove\(/.test(single), false, "W1: 起動時の自動処理は、以前のIDの公開プロフィール・オンライン記録を消さない");
  assertEqual(single.includes('status: "awaiting-approval"'), true, "W1: ランキングの引き継ぎの後は「本人の確認待ち」で残す");
  const executeBody = supersession.slice(supersession.indexOf("export async function executeUidMerge("));
  assertEqual(executeBody.indexOf("saveMergeSnapshot(plan)") < executeBody.indexOf("remove(ref(database, `publicProfiles/${plan.oldUid}`))"), true, "W2: 本人が実行した整理は、控えを保存してから消す");
  assertEqual(executeBody.includes("await recordUidSupersession(plan.oldUid, plan.backupId)"), true, "W2: 本人が実行した整理で、消す権限に必要な対応表を用意する");
  assertEqual(supersession.includes("oldPublicProfile: plan.oldValues?.publicProfile ?? null"), true, "W2: 控えに以前のIDの公開プロフィールの中身も入れる");

  const screen = await fetchText("js/fanProfilesScreen.js");
  assertEqual(screen.includes("collapseSamePlayerProfiles(dedupeProfilesByUid(profiles)"), true, "W3: 一覧は同じUIDを1枚にしてから組み立てる");
  assertEqual(screen.includes("if (requestSeq !== profileListRequestSeq) return;"), true, "W3: 古い取得の結果で一覧を上書きしない");
  assertEqual(screen.includes("if (isFanProfilesScreenActive()) startPresenceSubscriptionIfNeeded();"), true, "W4: 画面を離れた後にオンライン状態の購読を始めない（購読が残り続けない）");
  assertEqual(screen.includes("  if (unsubscribePresence) return;\n  unsubscribePresence = subscribeToAllPresence("), true, "W4: オンライン状態の購読は二重に登録しない");
  // 画面に関係なく、どこにも「表示名だけで同じ人とみなす」比較が無いこと（名前の比較は印付け・件数だけ）
  const identity = await fetchText("js/fanProfilesIdentity.js");
  assertEqual(identity.includes("const key = `${p.identityKey}|${normalizeDisplayNameForCompare(p.displayName)}`;"), true, "W5: 「未確認」の判定は本人キーと名前の両方が同じときだけ");

  const sync = await fetchText("js/backupSync.js");
  assertEqual(sync.includes("setPendingUidMerge(player.playerId, { oldUid, backupId, requiresApproval: isSessionRecheck });"), true, "W7: 起動ごとの読み直しで見つけた旧UIDは「本人の確認待ち」で足す");
  assertEqual(sync.includes("if (!isSessionRecheck && !recordedPreviousUid && candidates.length > 0)"), true, "W7: 読み直しのときは対応表を自動で書かない");
  const html = await fetchText("index.html");
  assertEqual(html.indexOf('id="fan-profiles-list"') < html.indexOf('id="fan-profiles-uid-merge-card"'), true, "W8: 引き継ぎ案内は一覧の下");
  assertEqual(html.includes('<details id="fan-profiles-uid-merge-card"'), true, "W8: 引き継ぎ案内はたためる形");

  const card = await fetchText("js/fanProfileCard.js");
  assertEqual(card.includes("canInviteProfile(profile, { myUid })"), true, "W6: カードの「一緒に遊ぶ」は関係を見て出す");
  const css = await fetchText("css/friendsFix.css");
  assertEqual(css.includes('.fan-profile-card[data-identity-relation="my-old-candidate"]'), true, "W6: 自分の以前のIDらしいカードは見た目でも区別する（点線）");
}

// 【2026-10-31追加・本人の実機報告「サブがアプリを閉じたのに、1日ずっとオンライン」】
function runHiddenPresenceTests() {
  assertEqual(decideHiddenPresenceDelayMs({ screenName: "home", reason: "hidden" }), 0, "H1: ホームなどで画面が隠れたら、すぐ接続ノードを外す");
  assertEqual(decideHiddenPresenceDelayMs({ screenName: "fanProfiles" }), 0, "H1: フレンド画面でもすぐ外す");
  assertEqual(decideHiddenPresenceDelayMs({ screenName: "onlineBattleLobby" }), PRESENCE_HIDDEN_GRACE_MS, "H2: オンライン対戦のロビー（コードを LINE で送る等）は60秒の猶予");
  assertEqual(decideHiddenPresenceDelayMs({ screenName: "onlineBattleLobby", reason: "pagehide" }), 0, "H2: ページを閉じるときは猶予なし");
  assertEqual(decideHiddenPresenceDelayMs({}), 0, "H2: 画面が分からなければすぐ外す");
  assertEqual(PRESENCE_HIDDEN_GRACE_MS, 60000, "H2: 猶予は60秒");
  // 本番の「ゆき」と同じ形：接続ノードが残ったまま lastSeen が16日前 → オフライン
  const now = Date.parse("2026-10-31T02:44:00+09:00");
  const yuki = { connections: { "-Oghost": true }, lastSeen: now - 16 * 24 * 60 * 60 * 1000 };
  assertEqual(buildPresenceDisplay(yuki, now).state, "offline", "H3: 接続ノードの残骸があっても、最終接続が古ければオフライン（ゆきの件）");
  // 画面が隠れて接続ノードを外した直後：猶予（12秒）の後はオフライン
  const paused = { lastSeen: now - 20 * 1000 };
  assertEqual(buildPresenceDisplay(paused, now).state, "offline", "H4: 接続ノードを外した後はオフライン（最終接続＝隠れた時刻）");
}

async function runHiddenPresenceWiringTests() {
  const src = await (await fetch("js/presenceSync.js", { cache: "no-store" })).text();
  const pause = src.slice(src.indexOf("export function pausePresenceForBackground"), src.indexOf("export function resumePresenceFromBackground"));
  assertEqual(pause.includes("stopHeartbeatTimer();"), true, "W9: 隠れたらハートビートを止める");
  assertEqual(pause.includes("onDisconnect(connectionRef).cancel()") && pause.includes("remove(connectionRef)"), true, "W9: この端末の接続ノードだけを外す（他の端末・タブには触れない）");
  assertEqual(pause.includes("presence/${trackedUid}/lastSeen`), serverTimestamp())"), true, "W9: lastSeen を最後に1回だけ書く");
  const resume = src.slice(src.indexOf("export function resumePresenceFromBackground"), src.indexOf("export function isPresencePausedForBackground"));
  assertEqual(resume.includes("armConnectionNode(trackedUid)") && resume.includes("startHeartbeatTimer(trackedUid)"), true, "W10: 戻ったら接続ノード（onDisconnect つき）を付け直し、ハートビートを再開する");
  assertEqual(src.includes("if (backgroundPaused) return;\n    armConnectionNode(uid);"), true, "W10: 隠れている間に再接続しても接続ノードを作らない");
  assertEqual(src.includes('window.addEventListener("pagehide"'), true, "W11: アプリを閉じる・ページを離れるときも外す");
  assertEqual(src.includes("if (lastSeenHeartbeatTimerId !== null) return;"), true, "W12: ハートビートは二重に始めない");
}

// 【2026-10-31追加・本人の実機報告「ルームを解散したのに『🏠 同じルームにいます』が残る」】
function runSameRoomTests() {
  const room = { roomId: "ABC123", players: { [GR72]: {}, "SUB-uid": {} } };
  assertEqual([...selectCurrentRoomPlayerUids({ currentRoomId: "ABC123", latestRoom: room })].sort(), [GR72, "SUB-uid"].sort(), "SR1: 今いるルームの参加者は「同じルーム」");
  assertEqual(selectCurrentRoomPlayerUids({ currentRoomId: null, latestRoom: room }).size, 0, "SR2: ルームを出た・解散した後（今いるルームが無い）は、古い中身が残っていても誰も「同じルーム」にしない");
  assertEqual(selectCurrentRoomPlayerUids({ currentRoomId: "XYZ999", latestRoom: room }).size, 0, "SR3: 別のルームの古い中身は使わない");
  assertEqual(selectCurrentRoomPlayerUids({ currentRoomId: "ABC123", latestRoom: null }).size, 0, "SR4: 中身がまだ無ければ空");
  assertEqual(selectCurrentRoomPlayerUids().size, 0, "SR4: 引数が無くても落ちない");
}

// 【2026-10-31追加・iPad（サブ）の実機報告「整理待ちが無いのに『以前のIDの記録』の案内が出る」】
function runMergePromptConditionTests() {
  const queue = [
    { oldUid: "OLD-done", state: UID_MERGE_STATE.MERGED, recordedAt: 1, leaderboardMergedAt: 1, nextRetryAt: null },
    { oldUid: "SUB-now", state: UID_MERGE_STATE.PENDING, recordedAt: 2, leaderboardMergedAt: null, nextRetryAt: null },
  ];
  assertEqual(selectActiveUidMerge(queue, { currentUid: "SUB-now" }), null, "MP1: 「旧ID＝今のID」の記録しか無ければ、整理待ちは無い（案内を出さない）");
  assertEqual(selectActiveUidMerge(queue)?.oldUid ?? null, "SUB-now", "MP1: 今のIDを渡さない判定だと案内が出てしまう（直す前の不具合の再現）");
}

async function runMergePromptWiringTests() {
  const sup = await (await fetch("js/uidSupersession.js", { cache: "no-store" })).text();
  assertEqual(sup.includes("export function hasPendingUidMerge({ currentUid = null } = {})") && sup.includes("getPendingUidMerge(player.playerId, { currentUid }) !== null"), true, "MP2: 案内を出す判定は今のIDを除いて数える");
  assertEqual(sup.includes("export function dropSelfUidMergeEntry(currentUid)"), true, "MP2: 「旧ID＝今のID」の記録は端末の中で片付ける");
  const screen = await (await fetch("js/fanProfilesScreen.js", { cache: "no-store" })).text();
  assertEqual(screen.includes("hasPendingUidMerge()"), false, "MP3: フレンド画面は、どこでも今のIDを渡して判定する");
  assertEqual(screen.includes("dropSelfUidMergeEntry(myUid);"), true, "MP3: 案内を描く前に、今のIDの記録を片付ける");
}

async function runSameRoomWiringTests() {
  const src = await (await fetch("js/onlineBattleScreen.js", { cache: "no-store" })).text();
  assertEqual(src.includes("return selectCurrentRoomPlayerUids({ currentRoomId, latestRoom });"), true, "SR5: フレンド一覧の「同じルーム」は今いるルームと一致するときだけ");
  const leave = src.slice(src.indexOf("export async function leaveOnlineBattleRoomCompletely"), src.indexOf("function stopListeningToRoom"));
  assertEqual(leave.includes("latestRoom = null;"), true, "SR6: 完全に退出したらルームの中身を消す");
}

export async function runFriendsIdentity1031Tests() {
  runMergePromptConditionTests();
  await runMergePromptWiringTests();
  runSameRoomTests();
  await runSameRoomWiringTests();
  runHiddenPresenceTests();
  await runHiddenPresenceWiringTests();
  runDedupeTests();
  runRelationTests();
  runCardDomTests();
  runAutoMigrationTargetTests();
  runMergePlanDescriptionTests();
  await runWiringTests();
}
