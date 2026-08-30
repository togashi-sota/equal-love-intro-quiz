// js/achievementProgress.jsの恒久テスト。localStorageを実際に使う結合テストのため、
// 各シナリオの前後で関連キーを明示的にクリアし、他のテストへ影響を残さないようにする
// （getPlayerKeyPrefix()はテスト環境では常に空文字列＝デフォルトプレイヤー扱いになる）。
import {
  mergeAchievementProgress,
  evaluateAndSaveAchievements,
  getAchievementListSnapshot,
  getOshiBadgeState,
  syncLegacyAchievements,
  collectLegacyNoMissEquivalents,
} from "../js/achievementProgress.js";
import { assertEqual } from "./test-utils.js";

const ACHIEVEMENTS_KEY = "equalLoveIntroQuiz.achievements";
const LEGACY_PREFIX = "equalLoveIntroQuiz.titles";

function clearAchievementStorage() {
  localStorage.removeItem(ACHIEVEMENTS_KEY);
  ["5", "10", "20", "50"].forEach((mode) => localStorage.removeItem(`${LEGACY_PREFIX}.perfect.${mode}`));
  localStorage.removeItem(`${LEGACY_PREFIX}.equalLoveKaiden`);
  localStorage.removeItem(`${LEGACY_PREFIX}.introMaster.5`);
  localStorage.removeItem(`${LEGACY_PREFIX}.lightningFast.5`);
}

function buildCleanIntroResult(overrides) {
  return {
    modeId: "intro",
    questionCountValue: "5",
    categoryFilterValue: "all",
    correctCount: 5,
    wrongCount: 0,
    skippedCount: 0,
    completed: true,
    averageResponseMs: null,
    maxHintLevelByQuestion: null,
    ...overrides,
  };
}

export function runAchievementProgressTests() {
  clearAchievementStorage();

  // ---- mergeAchievementProgress：重複しない・取得日は最初の1回だけ ----
  const nowIso = "2026-08-07T00:00:00.000Z";
  const laterIso = "2026-08-08T00:00:00.000Z";
  const empty = { schemaVersion: 2, unlockedAchievementIds: [], unlockedAtById: {} };

  const firstMerge = mergeAchievementProgress(empty, ["intro_beginner"], nowIso);
  assertEqual(firstMerge.progress.unlockedAchievementIds, ["intro_beginner"], "1回目のマージで解放される");
  assertEqual(firstMerge.newlyUnlockedThisTime, ["intro_beginner"], "1回目は新規解放として報告される");
  assertEqual(firstMerge.progress.unlockedAtById.intro_beginner, nowIso, "取得日が記録される");

  const secondMerge = mergeAchievementProgress(firstMerge.progress, ["intro_beginner"], laterIso);
  assertEqual(secondMerge.progress.unlockedAchievementIds, ["intro_beginner"], "同じ称号を二重取得しない（配列が増えない）");
  assertEqual(secondMerge.newlyUnlockedThisTime, [], "2回目は新規解放として報告されない");
  assertEqual(secondMerge.progress.unlockedAtById.intro_beginner, nowIso, "取得日は最初の1回だけ保存され、2回目で上書きされない");

  // ---- evaluateAndSaveAchievements：実際のプレイ結果からの一連の判定 ----
  // 【2026-08-14更新】ブロンズ/シルバー/ゴールド/プラチナ廃止にともない、5問ノーミスでは
  // 成長段階系（イントロビギナー）だけが解放されるようになった。
  clearAchievementStorage();
  const playResult1 = evaluateAndSaveAchievements(buildCleanIntroResult());
  assertEqual(
    playResult1.newlyUnlockedIds,
    ["intro_beginner"],
    "5問ノーミスの初回プレイでイントロビギナーが新規解放される"
  );

  const playResult2 = evaluateAndSaveAchievements(buildCleanIntroResult());
  assertEqual(playResult2.newlyUnlockedIds, [], "2回目の同条件プレイでは新規解放として報告されない（回帰なし）");

  // ---- 複合称号の自動解放：表3称号（アウトロマスター含む）を用意した状態で
  //      4つ目（ノーミスマスター）を達成すると＝LOVEマスターが付く（2026-08-30改訂）----
  clearAchievementStorage();
  const seeded = mergeAchievementProgress(
    { schemaVersion: 2, unlockedAchievementIds: [], unlockedAtById: {} },
    ["outro_master", "full_chorus_master", "song_master"],
    nowIso
  );
  localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(seeded.progress));

  const finalPlay = evaluateAndSaveAchievements(
    buildCleanIntroResult({ questionCountValue: "all", correctCount: 81 })
  );
  assertEqual(
    finalPlay.newlyUnlockedIds.includes("no_miss_master"),
    true,
    "全曲ノーミスでノーミスマスターが新規解放される"
  );
  assertEqual(
    finalPlay.newlyUnlockedIds.includes("equal_love_master"),
    true,
    "4つ目の表称号が揃った瞬間に＝LOVEマスターが自動解放される"
  );

  // ---- 壊れた保存データからの安全な復旧 ----
  clearAchievementStorage();
  localStorage.setItem(ACHIEVEMENTS_KEY, "{this is not valid json");
  const recoveredSnapshot = getAchievementListSnapshot();
  assertEqual(
    recoveredSnapshot.every((entry) => entry.isUnlocked === false),
    true,
    "壊れた保存データの場合、全称号が未取得状態として安全に復旧する"
  );
  const recoveredPlay = evaluateAndSaveAchievements(buildCleanIntroResult());
  assertEqual(
    recoveredPlay.newlyUnlockedIds,
    ["intro_beginner"],
    "壊れたデータから復旧した後も、通常どおりプレイ結果を保存できる"
  );

  // ---- 旧称号データからの安全な移行（読み取り専用・書き込みは新形式のみ） ----
  clearAchievementStorage();
  localStorage.setItem(`${LEGACY_PREFIX}.perfect.10`, "true");
  const legacyIds = collectLegacyNoMissEquivalents();
  assertEqual(
    legacyIds,
    ["no_miss_bronze", "no_miss_silver"],
    "旧パーフェクト(10問)から、ブロンズ・シルバーへ安全に移行できる"
  );

  // 【2026-08-14更新】collectLegacyNoMissEquivalents()自体は、旧データとの対応関係を保つため
  // あえて変更していない（ブロンズ〜プラチナのidをそのまま返す＝これらはACHIEVEMENTSから
  // 削除済みのため「孤立したid」としてlocalStorageに残るだけで実害はない、という設計）。
  // 現行のACHIEVEMENTSに実在するのはno_miss_masterだけなので、そこだけを確認する。
  clearAchievementStorage();
  localStorage.setItem(`${LEGACY_PREFIX}.equalLoveKaiden`, "true");
  syncLegacyAchievements();
  const afterSync = getAchievementListSnapshot();
  const noMissMasterEntry = afterSync.find((entry) => entry.id === "no_miss_master");
  assertEqual(
    noMissMasterEntry.isUnlocked,
    true,
    "旧＝LOVE皆伝から、現行のノーミスマスターへ移行できる（ブロンズ等は廃止済みのため対象外）"
  );
  assertEqual(
    localStorage.getItem(`${LEGACY_PREFIX}.equalLoveKaiden`),
    "true",
    "移行後も旧称号データ自体は消さずに残す"
  );

  // syncLegacyAchievements()を複数回呼んでも、取得日が上書きされない（冪等性）ことを確認。
  const afterFirstSyncSnapshot = getAchievementListSnapshot();
  const firstUnlockedAt = afterFirstSyncSnapshot.find((entry) => entry.id === "no_miss_master").unlockedAt;
  syncLegacyAchievements();
  const afterSecondSyncSnapshot = getAchievementListSnapshot();
  const secondUnlockedAt = afterSecondSyncSnapshot.find((entry) => entry.id === "no_miss_master").unlockedAt;
  assertEqual(firstUnlockedAt, secondUnlockedAt, "旧称号の移行処理を複数回呼んでも取得日が変わらない（冪等）");

  // ---- compositeProgress.items：複合称号カードの「獲得条件」チェックリスト用データ
  //      （本人指示・2026-08-07：「どの称号を集めれば最終称号になるのか」が名前入りで
  //      一目で分かるように）。取得状態が正しくitemsへ反映されることを確認する。
  //      【2026-08-30改訂】＝LOVEマスターは4称号（アウトロマスター追加）、
  //      ＝LOVE完全制覇は6称号（＝LOVEマスター自体＋完全終曲・即聞即答を追加）、
  //      表示名も改名後（イントロマスター等）に更新。 ----
  clearAchievementStorage();
  localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify({ schemaVersion: 2, unlockedAchievementIds: ["full_chorus_master"], unlockedAtById: {} })
  );
  const partialSnapshot = getAchievementListSnapshot();
  const masterEntry = partialSnapshot.find((entry) => entry.id === "equal_love_master");
  assertEqual(
    masterEntry.compositeProgress.items.map((item) => item.id),
    ["no_miss_master", "outro_master", "full_chorus_master", "song_master"],
    "＝LOVEマスターの必要称号4つが、compositeOfの順番どおりitemsに並ぶ"
  );
  assertEqual(
    masterEntry.compositeProgress.items.map((item) => item.name),
    ["イントロマスター", "アウトロマスター", "シャッフルマスター", "リリックマスター"],
    "＝LOVEマスターの必要称号4つが、表示名つきで取得できる"
  );
  assertEqual(
    masterEntry.compositeProgress.items.map((item) => item.isUnlocked),
    [false, false, true, false],
    "シャッフルマスターだけ取得済みの状態が、itemsのisUnlockedへ正しく反映される"
  );

  const completeEntry = partialSnapshot.find((entry) => entry.id === "equal_love_complete");
  assertEqual(
    completeEntry.compositeProgress.items.map((item) => item.id),
    ["equal_love_master", "lightning_fast", "complete_finale", "melody_ace", "lyric_master", "instant_flash_answer"],
    "＝LOVE完全制覇の必要称号6つが、compositeOfの順番どおりitemsに並ぶ"
  );
  assertEqual(
    completeEntry.compositeProgress.items.every((item) => item.isUnlocked === false),
    true,
    "＝LOVE完全制覇の必要称号は、何も取得していない状態ではすべて未取得として表示される"
  );

  clearAchievementStorage();

  // ---- 既存ユーザーの称号は、条件厳格化後も没収されない（本人指示・2026-08-14） ----
  // 「表題曲のみ」等カテゴリーを絞った状態でも取れていた旧仕様の時代にno_miss_master・
  // equal_love_masterを取得済みだったユーザーを想定し、条件厳格化後にプレイしても
  // 既存の取得済みidが消えないこと・条件を満たさない新しいプレイでは新規解放が起きない
  // ことの両方を確認する。
  clearAchievementStorage();
  localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify({
      schemaVersion: 2,
      unlockedAchievementIds: ["no_miss_bronze", "no_miss_master", "equal_love_master"],
      unlockedAtById: { no_miss_bronze: nowIso, no_miss_master: nowIso, equal_love_master: nowIso },
    })
  );
  // カテゴリーを絞った状態（新条件では不合格）で全曲プレイしても、既存の取得は失われない。
  const strictifiedPlay = evaluateAndSaveAchievements(
    buildCleanIntroResult({ questionCountValue: "all", categoryFilterValue: "title-track" })
  );
  assertEqual(
    strictifiedPlay.newlyUnlockedIds,
    [],
    "条件を満たさない新しいプレイでは、既存の称号に加えて何も新規解放されない"
  );
  const afterStrictifiedSnapshot = getAchievementListSnapshot();
  assertEqual(
    afterStrictifiedSnapshot.find((entry) => entry.id === "no_miss_master").isUnlocked,
    true,
    "旧仕様で取得済みだったノーミスマスターは、条件が厳しくなっても没収されない"
  );
  assertEqual(
    afterStrictifiedSnapshot.find((entry) => entry.id === "equal_love_master").isUnlocked,
    true,
    "旧仕様で取得済みだった＝LOVEマスターも、条件が厳しくなっても没収されない"
  );
  // ACHIEVEMENTSから削除済みのブロンズidが保存データに残っていても、一覧には出ず、
  // 他の称号の判定にも一切影響しないことを確認する（本人指示：「無理に削除・書き換えしない」）。
  assertEqual(
    afterStrictifiedSnapshot.some((entry) => entry.id === "no_miss_bronze"),
    false,
    "廃止済みのブロンズは、保存データに残っていても一覧（ACHIEVEMENTS由来）には出てこない"
  );

  clearAchievementStorage();

  // ---- 推しアイコンの王冠・ダイヤ判定 ----
  clearAchievementStorage();
  localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify({ schemaVersion: 2, unlockedAchievementIds: [], unlockedAtById: {} })
  );
  assertEqual(
    getOshiBadgeState(),
    { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false },
    "称号が何もない状態では王冠もダイヤも専用バッジも付かない"
  );

  // ---- 2026-08-15追加：ノーミスマスター単体取得 ----
  localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify({ schemaVersion: 2, unlockedAchievementIds: ["no_miss_master"], unlockedAtById: {} })
  );
  assertEqual(
    getOshiBadgeState(),
    { hasNoMissMaster: true, hasEqualLoveMaster: false, hasEqualLoveComplete: false },
    "ノーミスマスター取得で専用バッジが付く（王冠・ダイヤはまだ）"
  );

  localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify({ schemaVersion: 2, unlockedAchievementIds: ["equal_love_master"], unlockedAtById: {} })
  );
  assertEqual(
    getOshiBadgeState(),
    { hasNoMissMaster: false, hasEqualLoveMaster: true, hasEqualLoveComplete: false },
    "＝LOVEマスター取得で王冠が付く（ダイヤはまだ）"
  );

  localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify({
      schemaVersion: 2,
      unlockedAchievementIds: ["equal_love_master", "equal_love_complete"],
      unlockedAtById: {},
    })
  );
  assertEqual(
    getOshiBadgeState(),
    { hasNoMissMaster: false, hasEqualLoveMaster: true, hasEqualLoveComplete: true },
    "＝LOVE完全制覇取得で王冠とダイヤの両方が付く"
  );

  clearAchievementStorage();
}
