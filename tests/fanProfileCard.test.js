// js/fanProfileCard.js（「みんなのプロフィール」カード・詳細のDOM構築）のテスト。
// Firebaseには一切触れないファイルのため、tests.htmlの自動実行スイートで安全に
// 実際のDOMを組み立てて検証できる（js/achievementList.jsのbuildAchievementCardテストと
// 同じ考え方）。
import {
  buildProfileCard,
  buildRepresentativeLabel,
  sortProfiles,
  buildAchievedAchievementsList,
} from "../js/fanProfileCard.js";
import { MEMBERS } from "../js/data/members.js";
import { assertEqual } from "./test-utils.js";

function buildProfile(overrides) {
  return {
    uid: "uid-1",
    displayName: "テスト太郎",
    oshiMemberId: null,
    unlockedAchievementIds: [],
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

  // ---- 称号多数（17件すべて、2026-08-14更新）でも表示できる ----
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
  assertEqual(
    fullList.querySelectorAll(".fan-profile-achievement-card").length,
    17,
    "称号17個（全種類）取得済みなら17枚すべて表示される"
  );
}
