// js/fanProfileCard.js（「みんなのプロフィール」カード・詳細のDOM構築）のテスト。
// Firebaseには一切触れないファイルのため、tests.htmlの自動実行スイートで安全に
// 実際のDOMを組み立てて検証できる（js/achievementList.jsのbuildAchievementCardテストと
// 同じ考え方）。
import {
  buildProfileCard,
  buildRepresentativeLabel,
  sortProfiles,
  buildAchievedAchievementsList,
  getRepresentativeAchievementCandidates,
  buildAchievementCountText,
  buildRepresentativeAchievementChip,
  buildFriendAchievementSummary,
  MAX_REPRESENTATIVE_ACHIEVEMENT_COUNT,
} from "../js/fanProfileCard.js";
import { getAchievementById } from "../js/achievementDefinitions.js";
import { MEMBERS } from "../js/data/members.js";
import { assertEqual } from "./test-utils.js";

function buildProfile(overrides) {
  return {
    uid: "uid-1",
    displayName: "テスト太郎",
    oshiMemberId: null,
    unlockedAchievementIds: [],
    hasNoMissMaster: false,
    hasEqualLoveMaster: false,
    hasEqualLoveComplete: false,
    ...overrides,
  };
}

export function runFanProfileCardTests() {
  // ---- 表示名の長文がDOM上で全文存在する（省略しない方針は称号カードと同じ） ----
  const longName = "とても長い表示名のファンさんこんにちは２５文字くらいのやつです";
  const longNameCard = buildProfileCard(buildProfile({ displayName: longName }), MEMBERS, null);
  assertEqual(
    longNameCard.querySelector(".fan-profile-card-name").textContent,
    longName,
    "長い表示名がカードDOM上に全文存在する"
  );

  // ---- 未知のoshiMemberIdでも画面が壊れない（「推し：未設定」にフォールバック） ----
  const unknownMemberCard = buildProfileCard(
    buildProfile({ oshiMemberId: "this-member-id-does-not-exist" }),
    MEMBERS,
    null
  );
  assertEqual(
    unknownMemberCard.querySelector(".fan-profile-card-oshi").textContent,
    "推し：未設定",
    "未知のoshiMemberIdでもクラッシュせず「推し：未設定」表示になる"
  );

  // ---- 実在するoshiMemberIdは正しく表示される ----
  const knownMember = MEMBERS[0];
  const knownMemberCard = buildProfileCard(buildProfile({ oshiMemberId: knownMember.id }), MEMBERS, null);
  assertEqual(
    knownMemberCard.querySelector(".fan-profile-card-oshi").textContent,
    `推し：${knownMember.name}`,
    "実在するoshiMemberIdなら推し名が表示される"
  );

  // ---- 代表称号ラベル：完全制覇＞マスター＞称号数のみ、の優先順位 ----
  assertEqual(
    buildRepresentativeLabel(buildProfile({ hasEqualLoveMaster: true, hasEqualLoveComplete: true })),
    "＝LOVE完全制覇",
    "両方取得済みなら＝LOVE完全制覇が優先表示される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ hasEqualLoveMaster: true, hasEqualLoveComplete: false })),
    "＝LOVEマスター",
    "＝LOVEマスターだけ取得済みならそちらが表示される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ hasEqualLoveMaster: false, hasEqualLoveComplete: false })),
    null,
    "複合称号が無ければ代表ラベルはnull（称号数だけ表示）"
  );
  // ---- 2026-08-15追加：ノーミスマスターは＝LOVEマスター・完全制覇より下位の代表ラベル ----
  assertEqual(
    buildRepresentativeLabel(buildProfile({ hasNoMissMaster: true })),
    "ノーミスマスター",
    "ノーミスマスターだけ取得済みならそれが代表ラベルになる"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ hasNoMissMaster: true, hasEqualLoveMaster: true })),
    "＝LOVEマスター",
    "＝LOVEマスターも取得済みなら、ノーミスマスターより＝LOVEマスターが優先される"
  );

  // ---- 2026-08-29追加：3組の段階制ペア（本人指示） ----
  // イントロエース→ノーミスマスター、シャッフルエース→フルコーラスマスター、
  // リリックエース→歌マスター。上位（マスター系）を持てば下位（エース系）は代表表示しない。
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["intro_ace"] })),
    "イントロエース",
    "イントロエースだけ取得済みなら、それが代表ラベルになる"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["intro_ace", "no_miss_master"] })),
    "ノーミスマスター",
    "ノーミスマスターも取得済みなら、イントロエースより優先される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["shuffle_ace"] })),
    "シャッフルエース",
    "シャッフルエースだけ取得済みなら、それが代表ラベルになる"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["shuffle_ace", "full_chorus_master"] })),
    "フルコーラスマスター",
    "フルコーラスマスターも取得済みなら、シャッフルエースより優先される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["lyric_ace", "song_master"] })),
    "歌マスター",
    "歌マスターも取得済みなら、リリックエースより優先される"
  );
  assertEqual(
    buildRepresentativeLabel(
      buildProfile({ hasEqualLoveComplete: true, unlockedAchievementIds: ["no_miss_master", "intro_ace"] })
    ),
    "＝LOVE完全制覇",
    "複合称号（完全制覇）は、3組のペアより常に優先される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ hasNoMissMaster: true, unlockedAchievementIds: [] })),
    "ノーミスマスター",
    "後方互換：unlockedAchievementIdsが空でもhasNoMissMasterフラグだけで代表ラベルになる（旧データ対応）"
  );

  // ---- カードをタップするとonSelectがそのprofileで呼ばれる ----
  let selected = null;
  const clickableProfile = buildProfile({ uid: "uid-click-test" });
  const clickableCard = buildProfileCard(clickableProfile, MEMBERS, (profile) => {
    selected = profile;
  });
  document.body.appendChild(clickableCard);
  clickableCard.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertEqual(selected?.uid, "uid-click-test", "カードをタップするとonSelectが正しいprofileで呼ばれる");
  document.body.removeChild(clickableCard);

  // ---- 2026-08-16追加：isAdmin未指定・falseなら、今までどおりbutton要素をそのまま返す ----
  const nonAdminCard = buildProfileCard(buildProfile({ uid: "uid-non-admin" }), MEMBERS, null);
  assertEqual(nonAdminCard.tagName, "BUTTON", "isAdmin未指定なら戻り値はbutton要素のまま");
  assertEqual(
    nonAdminCard.querySelector(".fan-profile-admin-delete-button"),
    null,
    "isAdmin未指定なら削除ボタンは存在しない"
  );

  // ---- 2026-08-16追加：isAdmin: trueなら、カードと削除ボタンを横並びにした行を返す ----
  const adminProfile = buildProfile({ uid: "uid-admin-target", displayName: "削除対象さん" });
  let adminSelected = null;
  let adminDeleteRequested = null;
  const adminRow = buildProfileCard(
    adminProfile,
    MEMBERS,
    (profile) => {
      adminSelected = profile;
    },
    {
      isAdmin: true,
      onAdminDeleteRequest: (profile) => {
        adminDeleteRequested = profile;
      },
    }
  );
  assertEqual(adminRow.className, "fan-profile-card-row", "isAdmin:trueなら行コンテナが返る");
  const innerCard = adminRow.querySelector(".fan-profile-card");
  assertEqual(innerCard?.tagName, "BUTTON", "行コンテナの中にカード本体のbutton要素がある");
  const adminDeleteButton = adminRow.querySelector(".fan-profile-admin-delete-button");
  assertEqual(adminDeleteButton?.tagName, "BUTTON", "行コンテナの中に管理者削除ボタンがある");

  document.body.appendChild(adminRow);
  innerCard.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertEqual(adminSelected?.uid, "uid-admin-target", "管理者モードでもカード本体タップでonSelectが呼ばれる");

  adminDeleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertEqual(
    adminDeleteRequested?.uid,
    "uid-admin-target",
    "削除ボタンタップでonAdminDeleteRequestが正しいprofileで呼ばれる"
  );
  document.body.removeChild(adminRow);

  // ---- 表示名順の並び替え（ランキングではない、称号数などは一切見ない） ----
  const unsorted = [
    buildProfile({ uid: "a", displayName: "ひまわり" }),
    buildProfile({ uid: "b", displayName: "あおい" }),
    buildProfile({ uid: "c", displayName: "さくら" }),
  ];
  const sorted = sortProfiles(unsorted);
  assertEqual(
    sorted.map((p) => p.uid),
    ["b", "c", "a"],
    "表示名順（あおい→さくら→ひまわり）に並び替えられる"
  );
  assertEqual(unsorted.map((p) => p.uid), ["a", "b", "c"], "sortProfilesは元の配列を変更しない");

  // ---- 未取得称号は表示されず、取得済みだけがカテゴリごとに表示される ----
  const partialList = buildAchievedAchievementsList(["intro_beginner", "full_chorus_master"]);
  const achievedNames = [...partialList.querySelectorAll(".fan-profile-achievement-name")].map((el) => el.textContent);
  assertEqual(
    achievedNames,
    ["イントロビギナー", "フルコーラスマスター"],
    "取得済みの称号だけが名前つきで表示される（未取得は一切出さない）"
  );
  assertEqual(
    partialList.querySelector(".fan-profile-achievement-empty"),
    null,
    "1件でも取得済みがあれば「まだ称号を取得していません」は表示されない"
  );

  // ---- 未知のachievementIdでも画面が壊れない（静かに読み飛ばす） ----
  const withUnknownId = buildAchievedAchievementsList(["intro_beginner", "this-achievement-id-does-not-exist"]);
  assertEqual(
    [...withUnknownId.querySelectorAll(".fan-profile-achievement-name")].map((el) => el.textContent),
    ["イントロビギナー"],
    "未知のachievementIdはクラッシュせず読み飛ばされ、既知の分だけ表示される"
  );

  // ---- 称号0個なら案内文だけになる ----
  const emptyList = buildAchievedAchievementsList([]);
  assertEqual(
    emptyList.querySelector(".fan-profile-achievement-empty")?.textContent,
    "まだ称号を取得していません。",
    "称号0個のときは案内文が表示される"
  );
  assertEqual(
    emptyList.querySelectorAll(".fan-profile-achievement-card").length,
    0,
    "称号0個のときはカードが1件も表示されない"
  );

  // ---- 称号多数（17件すべて）取得済みなら、17件すべてがそのまま表示される ----
  // 【2026-08-29再設計・本人指示】このリストの役割を「フレンド詳細モーダルの主表示」から
  // 「すべての称号を見る」の全件確認用に変更した。代表称号（最大3個、同じ系統は最上位のみ）は
  // getRepresentativeAchievementCandidates側の役割になったため、こちらはもう圧縮しない
  // （本人指示：「代表表示から省略された下位称号も、ここでは取得済み称号として確認できる」）。
  const allIds = [
    "intro_beginner",
    "intro_challenger",
    "intro_ace",
    "shuffle_beginner",
    "shuffle_challenger",
    "shuffle_ace",
    "lyric_beginner",
    "lyric_challenger",
    "lyric_ace",
    "no_miss_master",
    "full_chorus_master",
    "song_master",
    "lightning_fast",
    "melody_ace",
    "lyric_master",
    "equal_love_master",
    "equal_love_complete",
  ];
  const fullList = buildAchievedAchievementsList(allIds);
  const fullListNames = [...fullList.querySelectorAll(".fan-profile-achievement-name")].map((el) => el.textContent);
  assertEqual(
    fullList.querySelectorAll(".fan-profile-achievement-card").length,
    17,
    "「すべての称号を見る」では、称号17個（全種類）取得済みなら圧縮せず17件すべてが表示される"
  );
  assertEqual(
    fullListNames.includes("イントロビギナー") &&
      fullListNames.includes("イントロチャレンジャー") &&
      fullListNames.includes("イントロエース") &&
      fullListNames.includes("ノーミスマスター"),
    true,
    "代表称号からは省略されるはずのイントロ系の下位段階（ビギナー・チャレンジャー・エース）も、「すべての称号を見る」では取得済みとしてすべて表示される"
  );
}

// js/fanProfileCard.js の代表称号システム（2026-08-29新設・本人指示の再設計）のテスト。
// 「ランキング順位は使わず、称号だけで実力感を伝える」フレンドプロフィール向けに、
// getRepresentativeAchievementCandidates（代表候補の優先順位つき絞り込み）・
// buildAchievementCountText（獲得称号総数）・buildRepresentativeAchievementChip（代表チップ）・
// buildFriendAchievementSummary（ランク感＋代表最大3個のまとめ）を検証する。
// 取得データ本体（unlockedAchievementIds配列）は変更せず、表示用の配列・DOMだけを
// 組み立てる純粋関数であることを確認する。
export function runGetRepresentativeAchievementCandidatesTests() {
  // ---- 1段階だけ取得：そのまま候補になる（圧縮の必要なし） ----
  assertEqual(
    getRepresentativeAchievementCandidates(["intro_beginner"]).map((a) => a.id),
    ["intro_beginner"],
    "ビギナーだけ取得している場合はビギナーがそのまま代表候補になる"
  );

  // ---- 3段階取得：系統内の最上位（エース）だけが候補に残る ----
  assertEqual(
    getRepresentativeAchievementCandidates(["intro_beginner", "intro_challenger", "intro_ace"]).map((a) => a.id),
    ["intro_ace"],
    "ビギナー〜エースまで取得済みなら、系統内の最上位エースだけが代表候補に残る"
  );

  // ---- シャッフル系・リリック系でも同じ圧縮が働く（系統ごとに独立） ----
  assertEqual(
    getRepresentativeAchievementCandidates(["shuffle_beginner", "shuffle_challenger", "shuffle_ace"]).map(
      (a) => a.id
    ),
    ["shuffle_ace"],
    "シャッフル系も3段階取得済みならエースだけが代表候補になる"
  );
  assertEqual(
    getRepresentativeAchievementCandidates(["lyric_beginner", "lyric_challenger", "lyric_ace"]).map((a) => a.id),
    ["lyric_ace"],
    "リリック系も3段階取得済みならエースだけが代表候補になる"
  );

  // ---- 本人指示の中核ルール：ステップアップの先にマスター系・裏チャレンジ系まで続く
  //      1本の系統として扱い、上位を持てば下位はすべて代表候補から除外する ----
  assertEqual(
    getRepresentativeAchievementCandidates(["intro_ace", "no_miss_master"]).map((a) => a.id),
    ["no_miss_master"],
    "イントロエース＋ノーミスマスター取得済みなら、ノーミスマスターだけが代表候補になる"
  );
  assertEqual(
    getRepresentativeAchievementCandidates([
      "intro_beginner",
      "intro_challenger",
      "intro_ace",
      "no_miss_master",
      "lightning_fast",
    ]).map((a) => a.id),
    ["lightning_fast"],
    "イントロ系の全段階（ビギナー〜電光石火）を取得済みなら、系統最上位の電光石火だけが代表候補になる（取得データ自体は消えない）"
  );
  assertEqual(
    getRepresentativeAchievementCandidates(["shuffle_ace", "full_chorus_master"]).map((a) => a.id),
    ["full_chorus_master"],
    "シャッフルエース＋フルコーラスマスター取得済みなら、フルコーラスマスターだけが代表候補になる"
  );
  assertEqual(
    getRepresentativeAchievementCandidates(["lyric_ace", "song_master"]).map((a) => a.id),
    ["song_master"],
    "リリックエース＋歌マスター取得済みなら、歌マスターだけが代表候補になる"
  );
  assertEqual(
    getRepresentativeAchievementCandidates(["intro_ace"]).map((a) => a.id),
    ["intro_ace"],
    "上位を未取得ならイントロエースは今までどおり代表候補になる"
  );

  // ---- 複合称号（＝LOVEマスター／＝LOVE完全制覇）を取得済みなら、その材料になった
  //      単体称号（compositeOf）も代表候補から除外される ----
  assertEqual(
    getRepresentativeAchievementCandidates([
      "no_miss_master",
      "full_chorus_master",
      "song_master",
      "equal_love_master",
    ]).map((a) => a.id),
    ["equal_love_master"],
    "＝LOVEマスター取得済みなら、材料になった3つのマスター単体称号は代表候補から除外され、＝LOVEマスターだけが残る"
  );
  assertEqual(
    getRepresentativeAchievementCandidates([
      "lightning_fast",
      "melody_ace",
      "lyric_master",
      "equal_love_complete",
    ]).map((a) => a.id),
    ["equal_love_complete"],
    "＝LOVE完全制覇取得済みなら、材料になった3つの裏チャレンジ単体称号は代表候補から除外され、＝LOVE完全制覇だけが残る"
  );

  // ---- カテゴリー優先順位：裏チャレンジ系 ＞ マスター系 ＞ ステップアップ系（本人指示） ----
  const categoryPriorityOrder = getRepresentativeAchievementCandidates([
    "intro_ace",
    "full_chorus_master",
    "lyric_master",
  ]).map((a) => a.id);
  assertEqual(
    categoryPriorityOrder,
    ["lyric_master", "full_chorus_master", "intro_ace"],
    "3系統がそれぞれ別カテゴリーの称号を持つ場合、裏チャレンジ→マスター→ステップアップの順に並ぶ"
  );

  // ---- 同じカテゴリー内では、系統内の難易度（段階）が高いほど優先される ----
  const tierPriorityOrder = getRepresentativeAchievementCandidates(["intro_ace", "shuffle_challenger"]).map(
    (a) => a.id
  );
  assertEqual(
    tierPriorityOrder,
    ["intro_ace", "shuffle_challenger"],
    "同じステップアップ系カテゴリーでも、段階が高いほう（エース）が段階が低いほう（チャレンジャー）より優先される"
  );

  // ---- 空配列・未知のIDは安全に扱われる ----
  assertEqual(getRepresentativeAchievementCandidates([]), [], "未取得（空配列）なら代表候補も空配列になる");
  assertEqual(
    getRepresentativeAchievementCandidates(["this-achievement-id-does-not-exist"]),
    [],
    "未知のachievementIdはクラッシュせず読み飛ばされる"
  );

  // ---- 元の配列を変更しない（呼び出し側のデータを壊さない） ----
  const original = ["intro_beginner", "intro_challenger", "intro_ace"];
  const originalCopy = [...original];
  getRepresentativeAchievementCandidates(original);
  assertEqual(
    original,
    originalCopy,
    "getRepresentativeAchievementCandidates()は引数の配列を変更しない（新しい配列を返すだけ）"
  );
}

export function runBuildAchievementCountTextTests() {
  assertEqual(buildAchievementCountText([]), "🏅 獲得称号 0個", "称号0個なら「🏅 獲得称号 0個」になる");
  assertEqual(
    buildAchievementCountText(["a", "b", "c"]),
    "🏅 獲得称号 3個",
    "取得済みの件数がそのまま総数として表示される"
  );
  // 本人指示：「代表表示から除外された下位称号なども、取得済みであること自体は変わらないので
  // 総数には含める」。代表候補では1件に圧縮されるケースでも、総数はraw件数（5件）のままになる。
  const stepUpChainIds = ["intro_beginner", "intro_challenger", "intro_ace", "no_miss_master", "lightning_fast"];
  assertEqual(
    buildAchievementCountText(stepUpChainIds),
    "🏅 獲得称号 5個",
    "代表候補では1件に圧縮される系統でも、獲得称号の総数は取得済み全件（5個）を反映する"
  );
}

export function runBuildRepresentativeAchievementChipTests() {
  // ---- ステップアップ系：カテゴリータグは付かない ----
  const growthChip = buildRepresentativeAchievementChip(getAchievementById("intro_ace"));
  assertEqual(
    growthChip.querySelector(".fan-profile-representative-name").textContent,
    "イントロエース",
    "称号名が表示される"
  );
  assertEqual(
    growthChip.querySelector(".fan-profile-representative-condition").textContent,
    "イントロ系で20問ノーミス！",
    "achievementDefinitions.jsのconditionTextがそのまま1行の獲得条件として表示される"
  );
  assertEqual(
    growthChip.querySelector(".fan-profile-representative-tag"),
    null,
    "ステップアップ系にはカテゴリータグを付けない"
  );

  // ---- マスター系：「マスター称号」タグが付く ----
  const masterChip = buildRepresentativeAchievementChip(getAchievementById("no_miss_master"));
  const masterTag = masterChip.querySelector(".fan-profile-representative-tag");
  assertEqual(masterTag?.textContent, "マスター称号", "マスター系のチップには「マスター称号」タグが付く");
  assertEqual(
    masterTag?.classList.contains("fan-profile-representative-tag--masterPath"),
    true,
    "マスター系タグはカテゴリー別のCSSクラスを持つ"
  );

  // ---- 裏チャレンジ系：「裏チャレンジ称号」タグが付く ----
  const backChip = buildRepresentativeAchievementChip(getAchievementById("lightning_fast"));
  const backTag = backChip.querySelector(".fan-profile-representative-tag");
  assertEqual(backTag?.textContent, "裏チャレンジ称号", "裏チャレンジ系のチップには「裏チャレンジ称号」タグが付く");
  assertEqual(
    backTag?.classList.contains("fan-profile-representative-tag--backChallenge"),
    true,
    "裏チャレンジ系タグはカテゴリー別のCSSクラスを持つ"
  );
}

export function runBuildFriendAchievementSummaryTests() {
  // ---- A：称号0個 → 「これから挑戦！」＋案内文、代表称号チップは1件も無い ----
  const emptySummary = buildFriendAchievementSummary([]);
  assertEqual(
    emptySummary.querySelector(".fan-profile-rank-label")?.textContent,
    "これから挑戦！",
    "称号0個なら「これから挑戦！」と表示される"
  );
  assertEqual(
    emptySummary.querySelector(".fan-profile-rank-empty-hint")?.textContent,
    "クイズに挑戦して最初の称号を獲得しよう！",
    "称号0個なら初心者向けの案内文が表示される"
  );
  assertEqual(
    emptySummary.querySelectorAll(".fan-profile-representative-chip").length,
    0,
    "称号0個なら代表称号チップは1件も表示されない（未獲得称号を並べない）"
  );

  // ---- B：称号1個 → 「CHALLENGER」＋そのまま1件表示 ----
  const oneSummary = buildFriendAchievementSummary(["intro_beginner"]);
  assertEqual(
    oneSummary.querySelector(".fan-profile-rank-label")?.textContent,
    "CHALLENGER",
    "称号1個なら「CHALLENGER」と表示される"
  );
  assertEqual(
    oneSummary.querySelectorAll(".fan-profile-representative-chip").length,
    1,
    "称号1個なら、無理に埋めず1件だけ表示される"
  );

  // ---- C：称号2個 → 「CHALLENGER」＋そのまま2件表示 ----
  const twoSummary = buildFriendAchievementSummary(["intro_ace", "shuffle_beginner"]);
  assertEqual(
    twoSummary.querySelector(".fan-profile-rank-label")?.textContent,
    "CHALLENGER",
    "称号2個なら「CHALLENGER」と表示される"
  );
  assertEqual(
    twoSummary.querySelectorAll(".fan-profile-representative-chip").length,
    2,
    "称号2個なら2件表示される"
  );

  // ---- D：称号3個以上 → 「代表称号」＋優先順位の高い3個だけ表示 ----
  const threeSummary = buildFriendAchievementSummary(["intro_ace", "shuffle_ace", "lyric_ace"]);
  assertEqual(
    threeSummary.querySelector(".fan-profile-rank-label")?.textContent,
    "代表称号",
    "称号3個以上なら「代表称号」と表示される"
  );
  assertEqual(
    threeSummary.querySelectorAll(".fan-profile-representative-chip").length,
    3,
    "称号3個ちょうどなら3件表示される"
  );

  // ---- I：称号を大量（9個以上）に持っている人でも、代表称号は最大3個までしか表示されない ----
  const manySummary = buildFriendAchievementSummary([
    "intro_beginner",
    "intro_challenger",
    "intro_ace",
    "shuffle_beginner",
    "shuffle_challenger",
    "shuffle_ace",
    "lyric_beginner",
    "lyric_challenger",
    "lyric_ace",
  ]);
  assertEqual(
    manySummary.querySelector(".fan-profile-rank-label")?.textContent,
    "代表称号",
    "代表候補が3個以上（この場合3系統×最上位=3件）なら「代表称号」と表示される"
  );
  assertEqual(
    manySummary.querySelectorAll(".fan-profile-representative-chip").length,
    MAX_REPRESENTATIVE_ACHIEVEMENT_COUNT,
    "代表称号は最大3個までしか表示されない（プロフィールが巨大化しない）"
  );

  // ---- H：裏チャレンジ系を持っている人は、優先順位に従ってそれが代表称号の先頭に来る ----
  const backChallengeSummary = buildFriendAchievementSummary([
    "intro_ace",
    "no_miss_master",
    "lightning_fast",
    "shuffle_ace",
  ]);
  const backChallengeNames = [
    ...backChallengeSummary.querySelectorAll(".fan-profile-representative-name"),
  ].map((el) => el.textContent);
  assertEqual(
    backChallengeNames[0],
    "電光石火",
    "裏チャレンジ系（電光石火）を持っていれば、優先順位に従って代表称号の先頭に表示される"
  );
}
