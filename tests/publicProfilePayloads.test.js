// js/publicProfilePayloads.js（「みんなのプロフィール」機能のうちFirebaseに触れない部分）のテスト。
// Firebase SDKの初期化・匿名ログインを発生させないよう、意図的にこのファイルだけをimportする
// （js/lyricsQuizBattleFirebasePayloads.test.jsと同じ設計方針）。
import {
  isRunningAsInstalledPwa,
  isPublicProfileSharingEnabled,
  writeEnabledFlag,
  buildPublicProfilePayload,
  normalizePublicProfileEntry,
} from "../js/publicProfilePayloads.js";
import { assertEqual } from "./test-utils.js";

const FLAG_KEY = "equalLoveIntroQuiz.publicProfile.enabled";
const FLAG_KEY_PLAYER_A = "equalLoveIntroQuiz.player.a.publicProfile.enabled";

function buildSnapshot(overrides) {
  return [
    { id: "no_miss_bronze", isUnlocked: true },
    { id: "no_miss_silver", isUnlocked: false },
    { id: "full_chorus_master", isUnlocked: true },
    ...overrides,
  ];
}

export function runPublicProfilePayloadsTests() {
  localStorage.removeItem(FLAG_KEY);
  localStorage.removeItem(FLAG_KEY_PLAYER_A);

  // ---- isRunningAsInstalledPwa：例外を投げず、booleanを返す（判定方式の詳細はブラウザ差があるため
  //      値そのものは断定しない。呼んでも壊れないことだけを保証する） ----
  assertEqual(typeof isRunningAsInstalledPwa(), "boolean", "isRunningAsInstalledPwaはbooleanを返す");

  // ---- 公開設定フラグ：プレイヤーごとに独立して保存される ----
  assertEqual(isPublicProfileSharingEnabled(""), false, "初期状態では公開OFF（デフォルトプレイヤー）");
  writeEnabledFlag("", true);
  assertEqual(isPublicProfileSharingEnabled(""), true, "writeEnabledFlagでONにできる");
  assertEqual(isPublicProfileSharingEnabled("player.a."), false, "別プレイヤー（player.a.）は影響を受けない");
  writeEnabledFlag("player.a.", true);
  writeEnabledFlag("", false);
  assertEqual(isPublicProfileSharingEnabled(""), false, "デフォルトプレイヤーをOFFに戻せる");
  assertEqual(isPublicProfileSharingEnabled("player.a."), true, "player.a.は独立してONのまま");
  localStorage.removeItem(FLAG_KEY);
  localStorage.removeItem(FLAG_KEY_PLAYER_A);

  // ---- buildPublicProfilePayload：必要な項目だけを組み立てる ----
  const payload = buildPublicProfilePayload({
    playerName: "颯太",
    oshiMemberId: "noguchi-iori",
    achievementsSnapshot: buildSnapshot([]),
    oshiBadgeState: { hasEqualLoveMaster: true, hasEqualLoveComplete: false },
  });
  assertEqual(payload.schemaVersion, 1, "schemaVersionが1で組み立てられる");
  assertEqual(payload.displayName, "颯太", "displayNameが反映される");
  assertEqual(payload.oshiMemberId, "noguchi-iori", "oshiMemberIdが反映される");
  assertEqual(
    payload.unlockedAchievementIds,
    ["no_miss_bronze", "full_chorus_master"],
    "unlockedAchievementIdsは取得済みのidだけになる（未取得のno_miss_silverは含まれない）"
  );
  assertEqual(payload.hasEqualLoveMaster, true, "hasEqualLoveMasterが反映される");
  assertEqual(payload.hasEqualLoveComplete, false, "hasEqualLoveCompleteが反映される");

  // ---- 不要な個人情報がpayloadに入らない（固定のキー集合と完全一致することを確認） ----
  assertEqual(
    Object.keys(payload).sort(),
    ["displayName", "hasEqualLoveComplete", "hasEqualLoveMaster", "oshiMemberId", "schemaVersion", "unlockedAchievementIds"].sort(),
    "payloadのキーは6つだけ（uid・メールアドレス・IP・端末情報等は一切含まれない）"
  );

  // ---- 表示名が空でもクラッシュせず、フォールバック名になる ----
  const emptyNamePayload = buildPublicProfilePayload({
    playerName: "",
    oshiMemberId: null,
    achievementsSnapshot: [],
    oshiBadgeState: { hasEqualLoveMaster: false, hasEqualLoveComplete: false },
  });
  assertEqual(emptyNamePayload.displayName, "名無しのファン", "表示名が未設定でも安全なフォールバック名になる");
  assertEqual(emptyNamePayload.oshiMemberId, null, "推し未設定はnullのまま");
  assertEqual(emptyNamePayload.unlockedAchievementIds, [], "称号0個でも空配列になる");

  // ---- 表示名の前後の空白は詰める ----
  const trimmedPayload = buildPublicProfilePayload({
    playerName: "  スペース太郎  ",
    oshiMemberId: null,
    achievementsSnapshot: [],
    oshiBadgeState: { hasEqualLoveMaster: false, hasEqualLoveComplete: false },
  });
  assertEqual(trimmedPayload.displayName, "スペース太郎", "表示名の前後の空白がtrimされる");

  // ---- 称号多数でもすべて含まれる ----
  const manySnapshot = Array.from({ length: 12 }, (_, i) => ({ id: `achievement_${i}`, isUnlocked: true }));
  const manyPayload = buildPublicProfilePayload({
    playerName: "たくさん",
    oshiMemberId: null,
    achievementsSnapshot: manySnapshot,
    oshiBadgeState: { hasEqualLoveMaster: true, hasEqualLoveComplete: true },
  });
  assertEqual(manyPayload.unlockedAchievementIds.length, 12, "称号12個（全種類）でもすべてpayloadに含まれる");

  // ---- normalizePublicProfileEntry：壊れたデータでも安全なデフォルトへ復旧する ----
  assertEqual(normalizePublicProfileEntry("uid1", null), null, "entryがnullならnullを返す（呼び出し側でスキップできる）");
  assertEqual(normalizePublicProfileEntry("uid1", "not-an-object"), null, "entryが文字列などオブジェクトでなければnull");

  const brokenEntry = normalizePublicProfileEntry("uid2", {
    displayName: 12345, // 型が違う
    unlockedAchievementIds: "not-an-array", // 型が違う
    hasEqualLoveMaster: "yes", // booleanでない
  });
  assertEqual(brokenEntry.uid, "uid2", "uidはそのまま保持される");
  assertEqual(brokenEntry.displayName, "名無しのファン", "型の違うdisplayNameは安全なフォールバックになる");
  assertEqual(brokenEntry.oshiMemberId, null, "oshiMemberId未指定はnullになる");
  assertEqual(brokenEntry.unlockedAchievementIds, [], "配列でないunlockedAchievementIdsは空配列になる（画面が壊れない）");
  assertEqual(brokenEntry.hasEqualLoveMaster, false, "booleanでない値はfalse扱いになる（安全側）");
  assertEqual(brokenEntry.schemaVersion, 1, "schemaVersion未指定は1にフォールバックする");

  const oldSchemaEntry = normalizePublicProfileEntry("uid3", { schemaVersion: 0, displayName: "旧データさん" });
  assertEqual(oldSchemaEntry.schemaVersion, 0, "古いschemaVersionの値もそのまま保持される（数値であれば）");
  assertEqual(oldSchemaEntry.displayName, "旧データさん", "有効なdisplayNameはそのまま使われる");

  const wellFormedEntry = normalizePublicProfileEntry("uid4", {
    schemaVersion: 1,
    displayName: "正常太郎",
    oshiMemberId: "otani-emiri",
    unlockedAchievementIds: ["no_miss_bronze", "equal_love_master"],
    hasEqualLoveMaster: true,
    hasEqualLoveComplete: false,
    updatedAt: 1700000000000,
  });
  assertEqual(
    wellFormedEntry,
    {
      uid: "uid4",
      schemaVersion: 1,
      displayName: "正常太郎",
      oshiMemberId: "otani-emiri",
      unlockedAchievementIds: ["no_miss_bronze", "equal_love_master"],
      hasEqualLoveMaster: true,
      hasEqualLoveComplete: false,
      updatedAt: 1700000000000,
    },
    "正常な形のentryは、値をそのまま保った形に正規化される"
  );

  localStorage.removeItem(FLAG_KEY);
  localStorage.removeItem(FLAG_KEY_PLAYER_A);
}
