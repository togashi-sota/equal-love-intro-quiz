// js/backupSync.js（プレイヤーデータの自動クラウドバックアップ）のテスト。
// Firebaseへ実際に書き込む部分（performSync・scheduleBackupSync・syncNow・
// createRecoveryRequest・checkRecoveryRequestStatus・restoreFromBackup）は、
// 他のFirebase連携ファイル（js/publicProfileSync.js等）と同じ方針により、
// 自動テストからは呼ばない（本番のFirebaseへ実際に書き込んでしまうため）。
// ここではlocalStorageだけを対象にした、決定論的な部分だけを検証する。
// 実際のFirebase読み書き・復元動作は、ダミーデータを使ってブラウザ上で手動確認する
// （docs/HANDOFF.md参照、本人指示のパターンを踏襲）。

import { isBackupWorthyLogicalKey, collectLocalBackupEntries, buildBackupPayload, writeRestoredEntries } from "../js/backupSync.js";
import { loadPickedSongIds } from "../js/songPickSelection.js";
import { setActivePlayerId, addPlayer, deletePlayer, DEFAULT_PLAYER_ID } from "../js/playerProfile.js";
import { assertEqual } from "./test-utils.js";

const TEST_KEYS_TO_CLEAN = [
  "equalLoveIntroQuiz.achievements",
  "equalLoveIntroQuiz.highScore.5.all",
  "equalLoveIntroQuiz.sfxEnabled",
  "equalLoveIntroQuiz.oshiMembers",
  "equalLoveIntroQuiz.customQuizPresets",
];

function cleanup() {
  TEST_KEYS_TO_CLEAN.forEach((key) => localStorage.removeItem(key));
}

// 選んだ曲（pickedSongs）のバックアップと復元（Firebase には触れず、localStorage だけで確かめる）。
// 復元は restoreFromBackup() と同じ書き戻し（writeRestoredEntries）を使う。テストの前の値は最後に戻す。
function runPickedSongsBackupTests() {
  const pickedKey = "equalLoveIntroQuiz.pickedSongs";
  const favoriteKey = "equalLoveIntroQuiz.favoriteSongs";
  const saved = [pickedKey, favoriteKey].map((key) => localStorage.getItem(key));
  try {
    localStorage.setItem(pickedKey, JSON.stringify(["song-b", "song-a"]));
    const entries = collectLocalBackupEntries();
    assertEqual(entries.pickedSongs, JSON.stringify(["song-b", "song-a"]), "選んだ曲はバックアップに選んだ順のまま入る");

    // 新しいバックアップ（pickedSongs あり）を復元すると、選んだ曲も戻る（引き継ぎも同じ書き戻し）
    localStorage.setItem(pickedKey, JSON.stringify(["other"]));
    writeRestoredEntries({ pickedSongs: JSON.stringify(["song-b", "song-a"]), favoriteSongs: JSON.stringify(["song-c"]) });
    assertEqual(loadPickedSongIds(), ["song-b", "song-a"], "復元で選んだ曲が選んだ順のまま戻る");
    assertEqual(localStorage.getItem(favoriteKey), JSON.stringify(["song-c"]), "同じ復元でお気に入りも戻る");

    // 古いバックアップ（pickedSongs が無い）を復元しても壊れない：端末の今の選んだ曲はそのまま
    localStorage.setItem(pickedKey, JSON.stringify(["keep-me"]));
    writeRestoredEntries({ favoriteSongs: JSON.stringify(["song-d"]) });
    assertEqual(loadPickedSongIds(), ["keep-me"], "古いバックアップ（pickedSongs なし）を復元しても、端末の選んだ曲は消えない");
    localStorage.removeItem(pickedKey);
    writeRestoredEntries({ favoriteSongs: JSON.stringify(["song-d"]) });
    assertEqual(loadPickedSongIds(), [], "選んだ曲が無い端末に古いバックアップを復元しても、空として読める");

    // 壊れた値・文字列でない値
    writeRestoredEntries({ pickedSongs: "{壊れた" });
    assertEqual(loadPickedSongIds(), [], "復元した値が壊れていても止まらず空として扱う");
    localStorage.setItem(pickedKey, JSON.stringify(["x"]));
    writeRestoredEntries({ pickedSongs: ["not", "a", "string"] });
    assertEqual(loadPickedSongIds(), ["x"], "文字列でない値は書き戻さない（今までの復元と同じ）");
    writeRestoredEntries(null);
    assertEqual(loadPickedSongIds(), ["x"], "payload が無いバックアップでも止まらない");
  } finally {
    [pickedKey, favoriteKey].forEach((key, index) => {
      if (saved[index] === null) localStorage.removeItem(key);
      else localStorage.setItem(key, saved[index]);
    });
  }
}

export function runBackupSyncTests() {
  cleanup();
  setActivePlayerId(DEFAULT_PLAYER_ID);

  // ---- isBackupWorthyLogicalKey：対象キーの判定 ----
  assertEqual(isBackupWorthyLogicalKey("achievements"), true, "achievementsはバックアップ対象");
  assertEqual(isBackupWorthyLogicalKey("playHistory"), true, "playHistoryはバックアップ対象");
  assertEqual(isBackupWorthyLogicalKey("oshiMembers"), true, "oshiMembersはバックアップ対象");
  assertEqual(isBackupWorthyLogicalKey("customQuizPresets"), true, "customQuizPresetsはバックアップ対象");
  assertEqual(
    isBackupWorthyLogicalKey("highScore.5.all"),
    true,
    "highScore.*（出題数・カテゴリの組み合わせで変わる動的なキー）もバックアップ対象"
  );
  assertEqual(
    isBackupWorthyLogicalKey("timeAttackBest.normal.5.all"),
    true,
    "timeAttackBest.*もバックアップ対象"
  );
  assertEqual(isBackupWorthyLogicalKey("sfxEnabled"), false, "サウンド設定（端末固有の設定）はバックアップ対象外");
  assertEqual(isBackupWorthyLogicalKey("players"), false, "players一覧そのものはバックアップ対象外（別の仕組みで管理）");
  assertEqual(isBackupWorthyLogicalKey("activePlayerId"), false, "activePlayerIdはバックアップ対象外");
  assertEqual(isBackupWorthyLogicalKey("onboardingCompleted"), false, "初回登録完了フラグ等の端末固有UIフラグは対象外");
  // 【2026-11-01 r8-music2・本人の決定】「曲を選んで再生」で選んだ曲も、お気に入り・プレイリストと同じくバックアップする
  assertEqual(
    ["favoriteSongs", "playlists", "pickedSongs"].map((key) => isBackupWorthyLogicalKey(key)),
    [true, true, true],
    "お気に入り・プレイリスト・選んだ曲（pickedSongs）はバックアップ対象"
  );
  runPickedSongsBackupTests();

  // ---- collectLocalBackupEntries：デフォルトプレイヤーの対象キーだけを集める ----
  cleanup();
  localStorage.setItem("equalLoveIntroQuiz.achievements", JSON.stringify({ schemaVersion: 2, unlockedAchievementIds: ["a", "b"] }));
  localStorage.setItem("equalLoveIntroQuiz.highScore.5.all", "1234");
  localStorage.setItem("equalLoveIntroQuiz.sfxEnabled", "true"); // 対象外のはずのキー
  {
    const entries = collectLocalBackupEntries();
    assertEqual(entries["achievements"] !== undefined, true, "achievementsが収集される");
    assertEqual(entries["highScore.5.all"], "1234", "動的なキーも正しく収集される");
    assertEqual(entries["sfxEnabled"], undefined, "対象外のキー（サウンド設定）は収集されない");
  }
  cleanup();

  // ---- collectLocalBackupEntries：複数プレイヤーで、他プレイヤーのデータが混ざらない ----
  {
    const newPlayer = addPlayer("テストプレイヤーB");
    setActivePlayerId(newPlayer.playerId);
    localStorage.setItem(`equalLoveIntroQuiz.player.${newPlayer.playerId}.achievements`, JSON.stringify({ unlockedAchievementIds: ["x"] }));
    localStorage.setItem("equalLoveIntroQuiz.achievements", JSON.stringify({ unlockedAchievementIds: ["default-player-data"] }));

    const entriesForB = collectLocalBackupEntries();
    assertEqual(
      JSON.parse(entriesForB["achievements"]).unlockedAchievementIds,
      ["x"],
      "2人目のプレイヤーをアクティブにすると、そのプレイヤー専用のachievementsだけが収集される"
    );

    setActivePlayerId(DEFAULT_PLAYER_ID);
    const entriesForDefault = collectLocalBackupEntries();
    assertEqual(
      JSON.parse(entriesForDefault["achievements"]).unlockedAchievementIds,
      ["default-player-data"],
      "デフォルトプレイヤーに戻すと、デフォルトプレイヤー自身のachievementsだけが収集される（他プレイヤーのデータは混ざらない）"
    );

    deletePlayer(newPlayer.playerId);
    localStorage.removeItem(`equalLoveIntroQuiz.player.${newPlayer.playerId}.achievements`);
    cleanup();
  }

  // ---- buildBackupPayload：achievementCount・oshiMemberIdの抽出 ----
  cleanup();
  localStorage.setItem(
    "equalLoveIntroQuiz.achievements",
    JSON.stringify({ schemaVersion: 2, unlockedAchievementIds: ["intro_beginner", "shuffle_beginner", "lyric_beginner"] })
  );
  localStorage.setItem("equalLoveIntroQuiz.oshiMembers", JSON.stringify({ favoriteMemberIds: ["m1"], mostOshiMemberId: "m1" }));
  {
    const payload = buildBackupPayload();
    assertEqual(payload.achievementCount, 3, "achievementCountは取得済み称号の件数になる");
    assertEqual(payload.oshiMemberId, "m1", "oshiMemberIdは最推しメンバーのIDになる");
    assertEqual(payload.schemaVersion, 1, "schemaVersionが含まれる");
    assertEqual(payload.entries["achievements"] !== undefined, true, "entriesにachievementsが含まれる");
  }
  cleanup();

  // ---- buildBackupPayload：称号データが無い場合でもクラッシュしない ----
  {
    const payload = buildBackupPayload();
    assertEqual(payload.achievementCount, 0, "称号データが無い場合、achievementCountは0になる");
    assertEqual(payload.oshiMemberId, null, "推しメンデータが無い場合、oshiMemberIdはnullになる");
  }

  cleanup();
}
