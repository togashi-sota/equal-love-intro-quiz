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

  const firstMerge = mergeAchievementProgress(empty, ["no_miss_bronze"], nowIso);
  assertEqual(firstMerge.progress.unlockedAchievementIds, ["no_miss_bronze"], "1回目のマージで解放される");
  assertEqual(firstMerge.newlyUnlockedThisTime, ["no_miss_bronze"], "1回目は新規解放として報告される");
  assertEqual(firstMerge.progress.unlockedAtById.no_miss_bronze, nowIso, "取得日が記録される");

  const secondMerge = mergeAchievementProgress(firstMerge.progress, ["no_miss_bronze"], laterIso);
  assertEqual(secondMerge.progress.unlockedAchievementIds, ["no_miss_bronze"], "同じ称号を二重取得しない（配列が増えない）");
  assertEqual(secondMerge.newlyUnlockedThisTime, [], "2回目は新規解放として報告されない");
  assertEqual(secondMerge.progress.unlockedAtById.no_miss_bronze, nowIso, "取得日は最初の1回だけ保存され、2回目で上書きされない");

  // ---- evaluateAndSaveAchievements：実際のプレイ結果からの一連の判定 ----
  clearAchievementStorage();
  const playResult1 = evaluateAndSaveAchievements(buildCleanIntroResult());
  // 2026-08-13追加の成長段階系（イントロビギナー）も、同じ5問ノーミス条件で同時に新規解放される。
  assertEqual(
    playResult1.newlyUnlockedIds,
    ["intro_beginner", "no_miss_bronze"],
    "5問ノーミスの初回プレイでイントロビギナーとブロンズが新規解放される"
  );

  const playResult2 = evaluateAndSaveAchievements(buildCleanIntroResult());
  assertEqual(playResult2.newlyUnlockedIds, [], "2回目の同条件プレイでは新規解放として報告されない（回帰なし）");

  // ---- 複合称号の自動解放：表2称号を用意した状態で3つ目を達成すると＝LOVEマスターが付く ----
  clearAchievementStorage();
  const seeded = mergeAchievementProgress(
    { schemaVersion: 2, unlockedAchievementIds: [], unlockedAtById: {} },
    ["full_chorus_master", "song_master"],
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
    "3つ目の表称号が揃った瞬間に＝LOVEマスターが自動解放される"
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
    ["intro_beginner", "no_miss_bronze"],
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

  clearAchievementStorage();
  localStorage.setItem(`${LEGACY_PREFIX}.equalLoveKaiden`, "true");
  syncLegacyAchievements();
  const afterSync = getAchievementListSnapshot();
  const noMissEntries = afterSync.filter((entry) => entry.id.startsWith("no_miss_"));
  assertEqual(
    noMissEntries.every((entry) => entry.isUnlocked),
    true,
    "旧＝LOVE皆伝から、ノーミス段階称号5つすべてへカスケードで移行できる"
  );
  assertEqual(
    localStorage.getItem(`${LEGACY_PREFIX}.equalLoveKaiden`),
    "true",
    "移行後も旧称号データ自体は消さずに残す"
  );

  // syncLegacyAchievements()を複数回呼んでも、取得日が上書きされない（冪等性）ことを確認。
  const afterFirstSyncSnapshot = getAchievementListSnapshot();
  const firstUnlockedAt = afterFirstSyncSnapshot.find((entry) => entry.id === "no_miss_bronze").unlockedAt;
  syncLegacyAchievements();
  const afterSecondSyncSnapshot = getAchievementListSnapshot();
  const secondUnlockedAt = afterSecondSyncSnapshot.find((entry) => entry.id === "no_miss_bronze").unlockedAt;
  assertEqual(firstUnlockedAt, secondUnlockedAt, "旧称号の移行処理を複数回呼んでも取得日が変わらない（冪等）");

  // ---- compositeProgress.items：複合称号カードの「獲得条件」チェックリスト用データ
  //      （本人指示・2026-08-07：「どの称号を集めれば最終称号になるのか」が名前入りで
  //      一目で分かるように）。取得状態が正しくitemsへ反映されることを確認する。 ----
  clearAchievementStorage();
  localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify({ schemaVersion: 2, unlockedAchievementIds: ["full_chorus_master"], unlockedAtById: {} })
  );
  const partialSnapshot = getAchievementListSnapshot();
  const masterEntry = partialSnapshot.find((entry) => entry.id === "equal_love_master");
  assertEqual(
    masterEntry.compositeProgress.items.map((item) => item.id),
    ["no_miss_master", "full_chorus_master", "song_master"],
    "＝LOVEマスターの必要称号3つが、compositeOfの順番どおりitemsに並ぶ"
  );
  assertEqual(
    masterEntry.compositeProgress.items.map((item) => item.name),
    ["ノーミスマスター", "フルコーラスマスター", "歌マスター"],
    "＝LOVEマスターの必要称号3つが、表示名つきで取得できる"
  );
  assertEqual(
    masterEntry.compositeProgress.items.map((item) => item.isUnlocked),
    [false, true, false],
    "フルコーラスマスターだけ取得済みの状態が、itemsのisUnlockedへ正しく反映される"
  );

  const completeEntry = partialSnapshot.find((entry) => entry.id === "equal_love_complete");
  assertEqual(
    completeEntry.compositeProgress.items.map((item) => item.id),
    ["lightning_fast", "melody_ace", "lyric_master"],
    "＝LOVE完全制覇の必要称号3つが、compositeOfの順番どおりitemsに並ぶ"
  );
  assertEqual(
    completeEntry.compositeProgress.items.every((item) => item.isUnlocked === false),
    true,
    "＝LOVE完全制覇の必要称号は、何も取得していない状態ではすべて未取得として表示される"
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
    { hasEqualLoveMaster: false, hasEqualLoveComplete: false },
    "称号が何もない状態では王冠もダイヤも付かない"
  );

  localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify({ schemaVersion: 2, unlockedAchievementIds: ["equal_love_master"], unlockedAtById: {} })
  );
  assertEqual(
    getOshiBadgeState(),
    { hasEqualLoveMaster: true, hasEqualLoveComplete: false },
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
    { hasEqualLoveMaster: true, hasEqualLoveComplete: true },
    "＝LOVE完全制覇取得で王冠とダイヤの両方が付く"
  );

  clearAchievementStorage();
}
