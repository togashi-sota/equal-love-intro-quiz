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
  // ---- 2026-08-15追加：イントロマスター（旧ノーミスマスター）は＝LOVEマスター・完全制覇より
  //      下位の代表ラベル（2026-08-30改訂：表示名のみ「ノーミスマスター」→「イントロマスター」） ----
  assertEqual(
    buildRepresentativeLabel(buildProfile({ hasNoMissMaster: true })),
    "イントロマスター",
    "イントロマスターだけ取得済みならそれが代表ラベルになる"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ hasNoMissMaster: true, hasEqualLoveMaster: true })),
    "＝LOVEマスター",
    "＝LOVEマスターも取得済みなら、イントロマスターより＝LOVEマスターが優先される"
  );

  // ---- 2026-08-29追加・2026-08-30改訂：5組の段階制ペア（本人指示） ----
  // イントロエース→イントロマスター、アウトロエース→アウトロマスター、
  // シャッフルエース→シャッフルマスター、リリックエース→リリックマスター、
  // 一瞬エース→一瞬マスター。上位（マスター系）を持てば下位（エース系）は代表表示しない。
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["intro_ace"] })),
    "イントロエース",
    "イントロエースだけ取得済みなら、それが代表ラベルになる"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["intro_ace", "no_miss_master"] })),
    "イントロマスター",
    "イントロマスターも取得済みなら、イントロエースより優先される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["shuffle_ace"] })),
    "シャッフルエース",
    "シャッフルエースだけ取得済みなら、それが代表ラベルになる"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["shuffle_ace", "full_chorus_master"] })),
    "シャッフルマスター",
    "シャッフルマスターも取得済みなら、シャッフルエースより優先される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["lyric_ace", "song_master"] })),
    "リリックマスター",
    "リリックマスターも取得済みなら、リリックエースより優先される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["outro_ace", "outro_master"] })),
    "アウトロマスター",
    "アウトロマスターも取得済みなら、アウトロエースより優先される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ unlockedAchievementIds: ["instant_ace", "instant_master"] })),
    "一瞬マスター",
    "一瞬マスターも取得済みなら、一瞬エースより優先される"
  );
  assertEqual(
    buildRepresentativeLabel(
      buildProfile({ hasEqualLoveComplete: true, unlockedAchievementIds: ["no_miss_master", "intro_ace"] })
    ),
    "＝LOVE完全制覇",
    "複合称号（完全制覇）は、5組のペアより常に優先される"
  );
  assertEqual(
    buildRepresentativeLabel(buildProfile({ hasNoMissMaster: true, unlockedAchievementIds: [] })),
    "イントロマスター",
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

  // ---- 2026-11-XX新設・本人指示：「一緒に遊ぶ」ボタン ----
  // onPlayInviteRequest未指定なら、今までどおり何も追加されない（isAdmin未指定の場合と同じ）。
  const noInviteCard = buildProfileCard(buildProfile({ uid: "uid-no-invite" }), MEMBERS, null, {
    presenceEntry: { connections: { a: true } },
  });
  assertEqual(
    noInviteCard.tagName,
    "BUTTON",
    "onPlayInviteRequest未指定なら戻り値はbutton要素のまま（presenceEntryがあっても変わらない）"
  );

  // オンラインのフレンドには、押せる状態の「一緒に遊ぶ」ボタンが1段追加される。
  let invitedProfile = null;
  let invitedPresenceInfo = null;
  const onlineProfile = buildProfile({ uid: "uid-online-friend", displayName: "オンラインさん" });
  const onlineWrap = buildProfileCard(onlineProfile, MEMBERS, null, {
    presenceEntry: { connections: { a: true } },
    onPlayInviteRequest: (profile, info) => {
      invitedProfile = profile;
      invitedPresenceInfo = info;
    },
  });
  assertEqual(onlineWrap.className, "fan-profile-card-wrap", "onPlayInviteRequest指定時はラッパーdivが返る");
  const onlineInviteButton = onlineWrap.querySelector(".fan-profile-play-invite-button");
  assertEqual(onlineInviteButton?.textContent, "🤝 一緒に遊ぶ", "オンラインなら押せる文言のボタンになる");
  assertEqual(onlineInviteButton?.disabled, false, "オンラインならボタンは有効");
  onlineInviteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertEqual(invitedProfile?.uid, "uid-online-friend", "「一緒に遊ぶ」タップでonPlayInviteRequestが正しいprofileで呼ばれる");
  assertEqual(
    invitedPresenceInfo,
    { isOnline: true, isPlaying: false },
    "onPlayInviteRequestにはisOnline/isPlayingの状態も渡される"
  );

  // プレイ中でも招待は送れる（本人指示：「プレイ中でも招待可能」）。
  const playingWrap = buildProfileCard(buildProfile({ uid: "uid-playing-friend" }), MEMBERS, null, {
    presenceEntry: { connections: { a: true }, isPlaying: true },
    onPlayInviteRequest: () => {},
  });
  const playingInviteButton = playingWrap.querySelector(".fan-profile-play-invite-button");
  assertEqual(playingInviteButton?.disabled, false, "プレイ中でも「一緒に遊ぶ」ボタンは有効のまま");

  // オフラインのフレンドには、押せない状態のボタンが表示される（消えはしない）。
  const offlineWrap = buildProfileCard(buildProfile({ uid: "uid-offline-friend" }), MEMBERS, null, {
    presenceEntry: null,
    onPlayInviteRequest: () => {},
  });
  const offlineInviteButton = offlineWrap.querySelector(".fan-profile-play-invite-button");
  assertEqual(offlineInviteButton?.textContent, "オフライン", "オフラインなら「オフライン」という文言に変わる");
  assertEqual(offlineInviteButton?.disabled, true, "オフラインならボタンはdisabledになる（存在は消さない）");

  // 自分自身のカードには「一緒に遊ぶ」ボタン自体を出さない。
  const selfWrap = buildProfileCard(buildProfile({ uid: "uid-self" }), MEMBERS, null, {
    presenceEntry: { connections: { a: true } },
    onPlayInviteRequest: () => {},
    myUid: "uid-self",
  });
  assertEqual(
    selfWrap.tagName,
    "BUTTON",
    "自分自身のカードには「一緒に遊ぶ」ボタンが無いため、ラッパーではなくbutton要素のまま返る"
  );

  // isAdmin: trueとonPlayInviteRequestを両方指定した場合、削除ボタンの行と
  // 「一緒に遊ぶ」ボタンの両方が縦に並ぶ。
  const adminWithInviteWrap = buildProfileCard(buildProfile({ uid: "uid-admin-and-invite" }), MEMBERS, null, {
    isAdmin: true,
    onAdminDeleteRequest: () => {},
    presenceEntry: { connections: { a: true } },
    onPlayInviteRequest: () => {},
  });
  assertEqual(adminWithInviteWrap.className, "fan-profile-card-wrap", "isAdmin+onPlayInviteRequest指定時もラッパーdivが返る");
  assertEqual(
    adminWithInviteWrap.querySelector(".fan-profile-card-row") !== null,
    true,
    "管理者削除ボタンの行はそのまま存在する"
  );
  assertEqual(
    adminWithInviteWrap.querySelector(".fan-profile-play-invite-button") !== null,
    true,
    "「一緒に遊ぶ」ボタンも同時に存在する"
  );

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

  // ---- 最終確定の6段構成（2026-08-29最終確定・本人指示）：①イントロ系②シャッフル系
  //      ③リリック系（各ブロックはビギナー〜マスターの4段階）④＝LOVEマスター
  //      （取得者だけの特別枠）⑤裏チャレンジ（独立ブロック）⑥＝LOVE完全制覇
  //      （取得者だけの特別枠）。未取得の称号・空のブロックは出さない。 ----
  const partialList = buildAchievedAchievementsList(["intro_beginner", "full_chorus_master"]);
  const achievedNames = [...partialList.querySelectorAll(".fan-profile-achievement-name")].map((el) => el.textContent);
  assertEqual(
    achievedNames,
    ["イントロビギナー", "シャッフルマスター"],
    "取得済みの称号だけが名前つきで表示される（未取得は一切出さない）。イントロ系→シャッフル系の順で並ぶ"
  );
  const partialHeadings = [...partialList.querySelectorAll(".fan-profile-achievement-block-heading")].map(
    (el) => el.textContent
  );
  assertEqual(
    partialHeadings,
    ["🎧 イントロ系", "🔀 シャッフル系"],
    "取得済みの称号がある系統だけブロック見出しが表示される（リリック系は0件なので見出しごと出ない）"
  );
  assertEqual(
    partialList.querySelector(".fan-profile-achievement-empty"),
    null,
    "1件でも取得済みがあれば「まだ称号を取得していません」は表示されない"
  );

  // ---- 重要：電光石火はイントロを使う称号だが、通常のイントロ系ステップアップとは
  //      別物のため、イントロ系ブロックには入らない（本人指示） ----
  const introWithBackChallenge = buildAchievedAchievementsList([
    "intro_beginner",
    "intro_challenger",
    "intro_ace",
    "no_miss_master",
    "lightning_fast",
  ]);
  const blocksByHeading = [...introWithBackChallenge.querySelectorAll(".fan-profile-achievement-block")].map(
    (block) => ({
      heading: block.querySelector(".fan-profile-achievement-block-heading")?.textContent,
      names: [...block.querySelectorAll(".fan-profile-achievement-name")].map((el) => el.textContent),
    })
  );
  assertEqual(
    blocksByHeading.find((block) => block.heading === "🎧 イントロ系")?.names,
    ["イントロビギナー", "イントロチャレンジャー", "イントロエース", "イントロマスター"],
    "イントロ系ブロックはビギナー〜イントロマスターの4段階だけで、電光石火は含まれない"
  );
  assertEqual(
    blocksByHeading.find((block) => block.heading === "💎 裏チャレンジ")?.names,
    ["電光石火"],
    "電光石火は独立した裏チャレンジブロックの中に表示される"
  );
  assertEqual(
    blocksByHeading.map((block) => block.heading),
    ["🎧 イントロ系", "💎 裏チャレンジ"],
    "裏チャレンジブロックはイントロ系ブロックより後に表示される"
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

  // ---- 通常系統を3個しか取得していない場合、4枠目が空いても次の系統をそこへ詰めない
  //      （各ブロックが独立したgridのため、DOM構造として別のgrid要素になっている） ----
  const introThreeThenShuffleList = buildAchievedAchievementsList([
    "intro_beginner",
    "intro_challenger",
    "intro_ace",
    "shuffle_beginner",
  ]);
  const grids = introThreeThenShuffleList.querySelectorAll(".fan-profile-achievement-grid");
  assertEqual(grids.length, 2, "イントロ系3個＋シャッフル系1個なら、ブロックごとに別々のgrid要素が2つできる");
  assertEqual(
    grids[0].querySelectorAll(".fan-profile-achievement-card").length,
    3,
    "イントロ系のgridには、シャッフル系の称号は混ざらず3件だけが入る"
  );
  assertEqual(
    grids[1].querySelectorAll(".fan-profile-achievement-card").length,
    1,
    "シャッフル系のgridは独立しており、イントロ系の4枠目の空きに詰め込まれることはない"
  );

  // ---- ＝LOVEマスター・＝LOVE完全制覇は未取得なら表示されない ----
  const noSpecialList = buildAchievedAchievementsList(["no_miss_master", "full_chorus_master", "song_master"]);
  assertEqual(
    noSpecialList.querySelector(".fan-profile-special-achievement-card"),
    null,
    "＝LOVEマスター・＝LOVE完全制覇のどちらも未取得なら、特別カードは1件も表示されない"
  );

  // ---- ＝LOVEマスターだけ取得済みなら、④の位置に特別カードとして1件だけ表示される ----
  const masterOnlyList = buildAchievedAchievementsList([
    "no_miss_master",
    "full_chorus_master",
    "song_master",
    "equal_love_master",
  ]);
  const masterCard = masterOnlyList.querySelector(".fan-profile-special-achievement-card--equal_love_master");
  assertEqual(masterCard?.querySelector(".fan-profile-special-achievement-name")?.textContent, "＝LOVEマスター", "＝LOVEマスター取得済みなら専用の特別カードが表示される");
  assertEqual(
    masterOnlyList.querySelector(".fan-profile-special-achievement-card--equal_love_complete"),
    null,
    "＝LOVE完全制覇は未取得なので表示されない"
  );

  // ---- ＝LOVE完全制覇だけ取得済みなら、⑥の位置に特別カードとして1件だけ表示される ----
  const completeOnlyList = buildAchievedAchievementsList(["lightning_fast", "melody_ace", "lyric_master", "equal_love_complete"]);
  assertEqual(
    completeOnlyList.querySelector(".fan-profile-special-achievement-card--equal_love_complete")
      ?.querySelector(".fan-profile-special-achievement-name")?.textContent,
    "＝LOVE完全制覇",
    "＝LOVE完全制覇取得済みなら専用の特別カードが表示される"
  );

  // ---- 称号多数（17件すべて）取得済みなら、6ブロックすべてが表示され、17件全部が
  //      どこかしらのブロックに含まれる（本人指示：取得データは一切隠さない） ----
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
    fullList.querySelectorAll(".fan-profile-achievement-block").length,
    6,
    "17件すべて取得済みなら、イントロ系・シャッフル系・リリック系・＝LOVEマスター・裏チャレンジ・＝LOVE完全制覇の6ブロックすべてが表示される"
  );
  const fullListNormalNames = [...fullList.querySelectorAll(".fan-profile-achievement-name")].map((el) => el.textContent);
  const fullListSpecialNames = [...fullList.querySelectorAll(".fan-profile-special-achievement-name")].map(
    (el) => el.textContent
  );
  assertEqual(
    fullListNormalNames.length + fullListSpecialNames.length,
    17,
    "17件すべてが、通常ブロックのカードか特別カードのどちらかとして表示される（1件も隠れない）"
  );
  assertEqual(
    fullListSpecialNames,
    ["＝LOVEマスター", "＝LOVE完全制覇"],
    "＝LOVEマスターと＝LOVE完全制覇は、通常カードではなく専用の特別カードとして表示される"
  );
}

// js/fanProfileCard.js の代表称号システム（2026-08-29新設・本人指示の再設計）のテスト。
// 「ランキング順位は使わず、称号だけで実力感を伝える」フレンドプロフィール向けに、
// getRepresentativeAchievementCandidates（代表候補の絞り込み・並び替え）・
// buildAchievementCountText（獲得称号総数）・buildRepresentativeAchievementChip（代表チップ）・
// buildFriendAchievementSummary（ランク感＋代表称号＋次のチャレンジのまとめ）を検証する。
// 取得データ本体（unlockedAchievementIds配列）は変更せず、表示用の配列・DOMだけを
// 組み立てる純粋関数であることを確認する。
// 【2026-08-29再設計・本人指示】代表称号の最大3個キャップを廃止し、系統（イントロ／
// ランダム再生／歌詞クイズ）ごとに「裏チャレンジ→取得していれば表示／マスター→取得して
// いれば表示（両方あれば両方）／どちらも未取得ならステップアップ最上位を表示」という
// ルールに変更した。
export function runGetRepresentativeAchievementCandidatesTests() {
  // ---- F：ステップアップのみ取得：そのまま候補になる（圧縮の必要なし） ----
  assertEqual(
    getRepresentativeAchievementCandidates(["intro_beginner"]).map((a) => a.id),
    ["intro_beginner"],
    "ビギナーだけ取得している場合はビギナーがそのまま代表候補になる"
  );

  // ---- 3段階取得：系統内の最上位（エース）だけが候補に残る（マスター・裏チャレンジが
  //      どちらも未取得の間は、ステップアップの中で最上位1個だけを見せる） ----
  assertEqual(
    getRepresentativeAchievementCandidates(["intro_beginner", "intro_challenger", "intro_ace"]).map((a) => a.id),
    ["intro_ace"],
    "ビギナー〜エースまで取得済みなら、系統内の最上位エースだけが代表候補に残る"
  );
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

  // ---- G：マスター＋対応するステップアップ取得 → マスターだけが代表候補に残る ----
  assertEqual(
    getRepresentativeAchievementCandidates(["intro_ace", "no_miss_master"]).map((a) => a.id),
    ["no_miss_master"],
    "イントロエース＋ノーミスマスター取得済みなら、ノーミスマスターだけが代表候補になる（イントロエースは代表からは外れるが取得データ自体は消えない）"
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

  // ---- H：裏チャレンジ＋ステップアップ取得（マスター未取得） → 裏チャレンジだけが
  //      代表候補に残る（本人指示：マスター未取得でも、裏チャレンジがあればステップアップは
  //      もう代表候補に出さない） ----
  assertEqual(
    getRepresentativeAchievementCandidates(["intro_beginner", "intro_challenger", "intro_ace", "lightning_fast"]).map(
      (a) => a.id
    ),
    ["lightning_fast"],
    "電光石火（裏チャレンジ）取得済みなら、ノーミスマスター未取得でもイントロ系のステップアップは代表候補から外れ、電光石火だけが残る"
  );

  // ---- I：裏チャレンジ＋マスター＋ステップアップ取得 → 裏チャレンジ・マスターの
  //      両方を代表候補に残す（本人指示の核心：片方を持っているからもう片方が消えることは
  //      絶対にない）。ステップアップだけが代表候補から外れる。 ----
  assertEqual(
    getRepresentativeAchievementCandidates([
      "intro_beginner",
      "intro_challenger",
      "intro_ace",
      "no_miss_master",
      "lightning_fast",
    ]).map((a) => a.id),
    ["lightning_fast", "no_miss_master"],
    "電光石火＋ノーミスマスター＋イントロエースをすべて取得済みなら、電光石火とノーミスマスターの両方が代表候補に残り、イントロエースだけが外れる（本人指示の具体例）"
  );

  // ---- J：3系統すべてマスター取得 → マスター3個、イントロ→ランダム再生→歌詞クイズの順 ----
  assertEqual(
    getRepresentativeAchievementCandidates(["song_master", "no_miss_master", "full_chorus_master"]).map(
      (a) => a.id
    ),
    ["no_miss_master", "full_chorus_master", "song_master"],
    "3系統すべてマスター取得済みなら、取得順に関わらずイントロ→ランダム再生→歌詞クイズの順で3個とも代表候補になる"
  );

  // ---- K：3系統すべて裏チャレンジ取得 → 裏チャレンジ3個、同じくイントロ→ランダム再生→
  //      歌詞クイズの順 ----
  assertEqual(
    getRepresentativeAchievementCandidates(["lyric_master", "lightning_fast", "melody_ace"]).map((a) => a.id),
    ["lightning_fast", "melody_ace", "lyric_master"],
    "3系統すべて裏チャレンジ取得済みなら、取得順に関わらずイントロ→ランダム再生→歌詞クイズの順で3個とも代表候補になる"
  );

  // ---- L：裏チャレンジ3個＋マスター3個取得 → 最大6個すべて代表候補になり、
  //      本人指示の表示順（①裏チャレンジ×3系統→②マスター×3系統）で並ぶ ----
  assertEqual(
    getRepresentativeAchievementCandidates([
      "no_miss_master",
      "full_chorus_master",
      "song_master",
      "lightning_fast",
      "melody_ace",
      "lyric_master",
    ]).map((a) => a.id),
    ["lightning_fast", "melody_ace", "lyric_master", "no_miss_master", "full_chorus_master", "song_master"],
    "裏チャレンジ3個＋マスター3個すべて取得済みなら、上限なく6個すべてが代表候補になり、裏チャレンジ3つ→マスター3つの順で並ぶ"
  );

  // ---- ＝LOVEマスター／＝LOVE完全制覇（複合称号）は特定の系統に属さないため、
  //      代表称号システムには含めない（本人指示の「最大6個」の例と一致させる）。
  //      材料になった単体称号（マスター3つ・裏チャレンジ3つ）はそのまま代表候補になる。 ----
  assertEqual(
    getRepresentativeAchievementCandidates([
      "no_miss_master",
      "full_chorus_master",
      "song_master",
      "equal_love_master",
    ]).map((a) => a.id),
    ["no_miss_master", "full_chorus_master", "song_master"],
    "＝LOVEマスターを取得済みでも、代表称号には材料になった3つのマスター単体称号がそのまま並ぶ（＝LOVEマスター自体は代表称号システムに含めない）"
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

// buildFriendAchievementSummary()のテストケースは、本人指示のテストケース記号
// （A：称号0個、B：1個、…、R：新規ユーザーのランキング参加）に対応させている。
// M〜R（プロフィール公開ON/OFF・新規/既存ユーザー・ランキング参加）はFirebase同期に
// 関わるため、このファイル（Firebase非依存の恒久テスト）の対象外。js/publicProfileSync.js・
// js/publicProfilePayloads.js・js/timeAttackLeaderboardSync.jsのコードレビューで別途確認する
// （unlockedAchievementIdsを表示時にそのまま使う設計のため、公開ON/OFF・新規/既存で
// 分岐する専用コードが無いことをコードで確認済み）。
export function runBuildFriendAchievementSummaryTests() {
  // ---- A：称号0個 → 「これから挑戦！」＋イントロクイズから始める案内、代表称号チップ・
  //      次のチャレンジカードは無い（この案内文自体がその役割を兼ねる） ----
  const emptySummary = buildFriendAchievementSummary([]);
  assertEqual(
    emptySummary.querySelector(".fan-profile-rank-label")?.textContent,
    "これから挑戦！",
    "称号0個なら「これから挑戦！」と表示される"
  );
  const emptyHints = [...emptySummary.querySelectorAll(".fan-profile-rank-empty-hint")].map((el) => el.textContent);
  assertEqual(
    emptyHints,
    ["まずはイントロクイズから挑戦してみよう！", "慣れてきたらランダム再生クイズ・歌詞クイズにも挑戦！"],
    "称号0個なら、イントロクイズを入口とした初心者向けの案内文が2行表示される"
  );
  assertEqual(
    emptySummary.querySelectorAll(".fan-profile-representative-chip").length,
    0,
    "称号0個なら代表称号チップは1件も表示されない（未獲得称号を並べない）"
  );
  assertEqual(
    emptySummary.querySelector(".fan-profile-next-challenge"),
    null,
    "称号0個のときは、専用の案内文で足りるため「次のチャレンジ」カードは別途表示しない"
  );

  // ---- B：称号1個（未取得系統2つ） → 「CHALLENGER」＋そのまま1件表示＋次のチャレンジ ----
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
  assertEqual(
    oneSummary.querySelector(".fan-profile-next-challenge-text")?.textContent,
    "アウトロクイズ・ランダム再生クイズ・歌詞クイズ・一瞬チャレンジの称号にも挑戦してみよう！",
    "イントロ系の称号しか持っていない場合、次のチャレンジは残り4系統をまとめて案内する（2026-08-30改訂：5系統化）"
  );

  // ---- C：称号2個（未取得系統1つ） → 「CHALLENGER」＋そのまま2件表示＋次のチャレンジ ----
  const twoSummary = buildFriendAchievementSummary(["intro_ace", "shuffle_beginner"]);
  assertEqual(
    twoSummary.querySelector(".fan-profile-rank-label")?.textContent,
    "CHALLENGER",
    "称号2個なら「CHALLENGER」と表示される"
  );
  assertEqual(twoSummary.querySelectorAll(".fan-profile-representative-chip").length, 2, "称号2個なら2件表示される");
  assertEqual(
    twoSummary.querySelector(".fan-profile-next-challenge-text")?.textContent,
    "アウトロクイズ・歌詞クイズ・一瞬チャレンジの称号にも挑戦してみよう！",
    "イントロ・ランダム再生に称号があり残り3系統が0個の場合、その3系統を案内する（2026-08-30改訂：5系統化）"
  );

  // ---- D：称号3個以上だが1系統が0個 → 「代表称号」＋次のチャレンジも表示される ----
  const threeMissingOneSummary = buildFriendAchievementSummary([
    "shuffle_beginner",
    "shuffle_challenger",
    "shuffle_ace",
  ]);
  assertEqual(
    threeMissingOneSummary.querySelector(".fan-profile-rank-label")?.textContent,
    "代表称号",
    "称号3個以上なら「代表称号」と表示される"
  );
  assertEqual(
    threeMissingOneSummary.querySelector(".fan-profile-next-challenge-text")?.textContent,
    "イントロクイズ・アウトロクイズ・歌詞クイズ・一瞬チャレンジの称号にも挑戦してみよう！",
    "称号3個以上でも、未取得系統（残り4系統）があれば「次のチャレンジ」を表示する（CHALLENGER専用にしない、2026-08-30改訂：5系統化）"
  );

  // ---- E：5系統すべて最低1個取得 → 「次のチャレンジ」は表示しない（2026-08-30改訂：5系統化） ----
  const allSeriesSummary = buildFriendAchievementSummary([
    "intro_ace",
    "outro_ace",
    "shuffle_ace",
    "lyric_ace",
    "instant_ace",
  ]);
  assertEqual(
    allSeriesSummary.querySelectorAll(".fan-profile-representative-chip").length,
    5,
    "5系統それぞれ1個ずつ、合計5個の代表称号が表示される"
  );
  assertEqual(
    allSeriesSummary.querySelector(".fan-profile-next-challenge"),
    null,
    "5系統すべてに1個以上称号があれば、「次のチャレンジ」は表示されない"
  );

  // ---- I：裏チャレンジ＋マスター＋ステップアップ取得 → 裏チャレンジ・マスター両方を表示 ----
  const backAndMasterSummary = buildFriendAchievementSummary([
    "intro_beginner",
    "intro_challenger",
    "intro_ace",
    "no_miss_master",
    "lightning_fast",
  ]);
  const backAndMasterNames = [...backAndMasterSummary.querySelectorAll(".fan-profile-representative-name")].map(
    (el) => el.textContent
  );
  assertEqual(
    backAndMasterNames,
    ["電光石火", "イントロマスター"],
    "電光石火（裏チャレンジ）とイントロマスター（マスター）の両方が代表称号に表示され、イントロエースは表示されない"
  );

  // ---- L：裏チャレンジ3個＋マスター3個取得 → 最大6個すべて表示（もう上限で切らない） ----
  const maxSummary = buildFriendAchievementSummary([
    "no_miss_master",
    "full_chorus_master",
    "song_master",
    "lightning_fast",
    "melody_ace",
    "lyric_master",
  ]);
  assertEqual(
    maxSummary.querySelectorAll(".fan-profile-representative-chip").length,
    6,
    "裏チャレンジ3個＋マスター3個すべて取得済みなら、6個すべてが表示される（3個キャップは廃止）"
  );
  // 【2026-08-30改訂：5系統化】この6個はイントロ・シャッフル・リリックの3系統分のみのため、
  // アウトロ・一瞬チャレンジの2系統は未取得のまま。「次のチャレンジ」はこの2系統だけを案内する
  // （やり込み度が高くても、本当に未取得の系統があれば表示するのがCHALLENGER専用にしない方針）。
  assertEqual(
    maxSummary.querySelector(".fan-profile-next-challenge-text")?.textContent,
    "アウトロクイズ・一瞬チャレンジの称号にも挑戦してみよう！",
    "3系統（イントロ・シャッフル・リリック）をやり込んでいても、未取得の2系統（アウトロ・一瞬チャレンジ）があれば「次のチャレンジ」が表示される"
  );
}
