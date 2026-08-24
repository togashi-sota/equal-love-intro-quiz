// js/centerCelebration.js のテスト（2026-08-24新設）。
// 「見た！」を押すまで、対象の楽曲データが揃っているプレイヤーには毎回1回だけ表示条件を
// 満たし続けることと、既読にしたら二度と満たさなくなることを確認する。
import { findEligibleCelebration } from "../js/centerCelebration.js";
import { assertEqual } from "./test-utils.js";

const TEST_PLAYER_KEY_PREFIX = "player.center-celebration-test.";
const SEEN_KEY = `equalLoveIntroQuiz.${TEST_PLAYER_KEY_PREFIX}seenCelebration.obaCenterNatsunagori`;

const SONG_WITH_CENTER = {
  id: "natsunagori-summer-tune",
  title: "夏名残サマーチューン",
  center: ["大場花菜"],
  centerType: "single",
};

const SONG_WITHOUT_CENTER = {
  id: "natsunagori-summer-tune",
  title: "夏名残サマーチューン",
};

function cleanup() {
  localStorage.removeItem(SEEN_KEY);
}

export function runCenterCelebrationTests() {
  cleanup();

  // ---- 曲データが無ければ、センターが確認できていなくても対象外 ----
  assertEqual(
    findEligibleCelebration([], TEST_PLAYER_KEY_PREFIX),
    null,
    "対象の曲データが存在しなければ、お祝いは表示されない"
  );

  // ---- センターが確認できていない（center未設定）曲は対象外 ----
  assertEqual(
    findEligibleCelebration([SONG_WITHOUT_CENTER], TEST_PLAYER_KEY_PREFIX),
    null,
    "center未設定（未確認）の曲は、まだお祝いの対象にならない"
  );

  // ---- センターが確認できていても、別のメンバーなら対象外 ----
  assertEqual(
    findEligibleCelebration(
      [{ ...SONG_WITH_CENTER, center: ["野口衣織"] }],
      TEST_PLAYER_KEY_PREFIX
    ),
    null,
    "センターが対象メンバーと一致しなければ表示されない"
  );

  // ---- 条件を満たせば表示対象になる ----
  const eligible = findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX);
  assertEqual(eligible?.id, "obaCenterNatsunagori", "曲データが揃い、未読であれば表示対象になる");
  assertEqual(eligible?.heading, "はなちゃん", "表示内容のheadingが正しく設定されている");
  assertEqual(eligible?.youtubeVideoId, "_Bm66BRnM1A", "MVの動画IDが正しく設定されている");

  // ---- 既読フラグを立てると、以後は対象外になる ----
  localStorage.setItem(SEEN_KEY, "true");
  assertEqual(
    findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX),
    null,
    "既読フラグが立っていれば、曲データが揃っていても二度と表示されない"
  );

  // ---- 別のプレイヤーには、既読状態が引き継がれない（プレイヤーごとに独立） ----
  const otherPlayerEligible = findEligibleCelebration(
    [SONG_WITH_CENTER],
    "player.center-celebration-test-other."
  );
  assertEqual(
    otherPlayerEligible?.id,
    "obaCenterNatsunagori",
    "既読フラグはプレイヤーごとに独立しており、別プレイヤーには影響しない"
  );

  cleanup();
}
