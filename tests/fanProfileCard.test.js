// js/fanProfileCard.js（「みんなのプロフィール」カード・詳細のDOM構築）のテスト。
// Firebaseには一切触れないファイルのため、tests.htmlの自動実行スイートで安全に
// 実際のDOMを組み立てて検証できる（js/achievementList.jsのbuildAchievementCardテストと
// 同じ考え方）。
import {
  buildProfileCard,
  buildRepresentativeLabel,
  sortProfiles,
  buildAchievedAchievementsList,
  getAchievementsForPublicDisplay,
} from "../js/fanProfileCard.js";
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

  // ---- 称号多数（17件すべて、2026-08-14更新）取得済みでも、段階制3系統は最上位だけに
  // 圧縮されて表示される（2026-08-16更新、本人指示：フレンド画面の段階称号は最上位1個だけ）。
  // 【2026-08-29再改訂】マスターへの道（ノーミスマスター等）も同じ系統の最上位として
  // 圧縮対象に加わったため、17件中、段階制12件（イントロ/シャッフル/リリックの各3段階＋
  // 各マスター1件＝4段階×3系統）は最上位3件（各系統のマスター）だけに圧縮され、
  // 独立5件（電光石火・メロディアス・リリックマスター・＝LOVEマスター・＝LOVE完全制覇）は
  // そのまま表示されるため、合計8件になる。
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
    8,
    "称号17個（全種類）取得済みでも、段階制3系統（エース・マスターまで含む）が最上位1個ずつに圧縮され合計8枚になる"
  );
  assertEqual(
    fullListNames.includes("イントロビギナー") ||
      fullListNames.includes("イントロチャレンジャー") ||
      fullListNames.includes("イントロエース"),
    false,
    "ノーミスマスターまで取得済みなら、イントロ系の下位段階（ビギナー・チャレンジャー・エース）はどれも表示されない"
  );
  assertEqual(
    fullListNames.includes("ノーミスマスター"),
    true,
    "全段階取得済みなら、イントロ系の最上位（ノーミスマスター）が表示される"
  );
}

// js/fanProfileCard.js のgetAchievementsForPublicDisplay()専用テスト
// （2026-08-16新設、フレンド画面の段階称号圧縮機能）。
// 取得データ本体（unlockedAchievementIds配列）は変更せず、表示用の配列だけを絞り込む
// 純粋関数であることを検証する。
export function runGetAchievementsForPublicDisplayTests() {
  // ---- 1段階だけ取得：そのまま表示される（圧縮の必要なし） ----
  assertEqual(
    getAchievementsForPublicDisplay(["intro_beginner"]),
    ["intro_beginner"],
    "ビギナーだけ取得している場合はビギナーがそのまま表示される"
  );

  // ---- 2段階取得：上位（チャレンジャー）だけが残る ----
  assertEqual(
    getAchievementsForPublicDisplay(["intro_beginner", "intro_challenger"]),
    ["intro_challenger"],
    "ビギナー＋チャレンジャー取得済みなら、チャレンジャーだけが表示される"
  );

  // ---- 3段階すべて取得：最上位（エース）だけが残る ----
  assertEqual(
    getAchievementsForPublicDisplay(["intro_beginner", "intro_challenger", "intro_ace"]),
    ["intro_ace"],
    "3段階すべて取得済みなら、エースだけが表示される"
  );

  // ---- シャッフル系・リリック系でも同じ圧縮が働く（系統ごとに独立） ----
  assertEqual(
    getAchievementsForPublicDisplay(["shuffle_beginner", "shuffle_challenger", "shuffle_ace"]),
    ["shuffle_ace"],
    "シャッフル系も3段階取得済みならエースだけが表示される"
  );
  assertEqual(
    getAchievementsForPublicDisplay(["lyric_beginner", "lyric_challenger", "lyric_ace"]),
    ["lyric_ace"],
    "リリック系も3段階取得済みならエースだけが表示される"
  );

  // ---- 3系統が別々の段階で混在していても、互いに干渉しない ----
  const mixedFamilies = getAchievementsForPublicDisplay([
    "intro_beginner",
    "intro_challenger",
    "intro_ace",
    "shuffle_beginner",
    "lyric_beginner",
    "lyric_challenger",
  ]);
  assertEqual(
    mixedFamilies,
    ["intro_ace", "shuffle_beginner", "lyric_challenger"],
    "系統ごとに取得段階が違っても、それぞれ独立して最上位だけが残る（他系統に影響しない）"
  );

  // ---- 独立称号（段階制ではない）は、段階称号の状態に関わらず常にそのまま表示される ----
  assertEqual(
    getAchievementsForPublicDisplay(["lightning_fast", "equal_love_master"]),
    ["lightning_fast", "equal_love_master"],
    "独立称号（裏チャレンジ・複合称号）だけの場合は圧縮されず全件そのまま表示される"
  );

  // ---- 2026-08-29追加、本人指示：マスターへの道（ノーミスマスター等）も同じ系統の
  //      最上位として扱う。マスター取得済みなら、下位のエース（＋ビギナー・チャレンジャー）は
  //      一切表示されない ----
  assertEqual(
    getAchievementsForPublicDisplay(["intro_ace", "no_miss_master"]),
    ["no_miss_master"],
    "イントロエース＋ノーミスマスター取得済みなら、ノーミスマスターだけが表示される"
  );
  assertEqual(
    getAchievementsForPublicDisplay(["intro_beginner", "intro_challenger", "intro_ace", "no_miss_master"]),
    ["no_miss_master"],
    "イントロ系4段階（ビギナー〜ノーミスマスター）すべて取得済みでも、最上位のノーミスマスターだけが表示される"
  );
  assertEqual(
    getAchievementsForPublicDisplay(["shuffle_ace", "full_chorus_master"]),
    ["full_chorus_master"],
    "シャッフルエース＋フルコーラスマスター取得済みなら、フルコーラスマスターだけが表示される"
  );
  assertEqual(
    getAchievementsForPublicDisplay(["lyric_ace", "song_master"]),
    ["song_master"],
    "リリックエース＋歌マスター取得済みなら、歌マスターだけが表示される"
  );
  assertEqual(
    getAchievementsForPublicDisplay(["intro_ace"]),
    ["intro_ace"],
    "ノーミスマスター未取得でイントロエースだけ取得済みなら、今までどおりイントロエースが表示される"
  );

  // ---- 本人指示の具体例：イントロ3段階＋ノーミスマスター＋電光石火 → ちょうど2件 ----
  // （ノーミスマスターが同じ系統の最上位としてイントロエース以下をすべて吸収するため）
  const workedExample = getAchievementsForPublicDisplay([
    "intro_beginner",
    "intro_challenger",
    "intro_ace",
    "no_miss_master",
    "lightning_fast",
  ]);
  assertEqual(
    workedExample,
    ["no_miss_master", "lightning_fast"],
    "本人指示の具体例：イントロ4段階（ノーミスマスターまで）＋独立1称号 取得済みなら、表示は「ノーミスマスター・電光石火」の2件だけになる"
  );

  // ---- 空配列は空配列のまま ----
  assertEqual(getAchievementsForPublicDisplay([]), [], "未取得（空配列）ならそのまま空配列を返す");

  // ---- 元の配列を変更しない（呼び出し側のデータを壊さない） ----
  const original = ["intro_beginner", "intro_challenger", "intro_ace"];
  const originalCopy = [...original];
  getAchievementsForPublicDisplay(original);
  assertEqual(original, originalCopy, "getAchievementsForPublicDisplay()は引数の配列を変更しない（新しい配列を返すだけ）");
}
