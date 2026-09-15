// js/centerCelebration.js のテスト（2026-08-24新設、同日全面刷新、2026-08-25複数件対応に拡張）。
// 「見た！」を押すまで、対象条件を満たすプレイヤーには毎回表示条件を満たし続けること、
// 既読にするとその起動中は満たさなくなること、sessionStorageベースの既読管理なので
// 「新しい起動（＝sessionStorageがリセットされた状態）」では既読が引き継がれず再び表示対象に
// なること、そして複数件のお祝いが並び順どおりに連続して対象になっていくことを確認する。
import {
  findEligibleCelebration,
  showCenterCelebrationIfEligible,
  CELEBRATION_POPUPS_ENABLED,
  CELEBRATION_SUPPRESS_KEY,
  isCelebrationSuppressed,
  setCelebrationSuppressed,
  applyCelebrationQueryOverride,
} from "../js/centerCelebration.js";
import { assertEqual } from "./test-utils.js";

const TEST_PLAYER_KEY_PREFIX = "player.center-celebration-test.";
const SEEN_KEY_OBA = `equalLoveIntroQuiz.${TEST_PLAYER_KEY_PREFIX}seenCelebration.obaCenterNatsunagori`;
const SEEN_KEY_YUME = `equalLoveIntroQuiz.${TEST_PLAYER_KEY_PREFIX}seenCelebration.yumeNoTsuzuki`;

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
  sessionStorage.removeItem(SEEN_KEY_OBA);
  sessionStorage.removeItem(SEEN_KEY_YUME);
}

export function runCenterCelebrationTests() {
  cleanup();

  // ---- 1件目（大場花菜）の条件だけを確認するため、曲データと無関係な2件目（夢の続き）を
  //      先に既読にしておく ----
  sessionStorage.setItem(SEEN_KEY_YUME, "true");

  assertEqual(
    findEligibleCelebration([], TEST_PLAYER_KEY_PREFIX),
    null,
    "対象の曲データが存在しなければ、大場花菜のお祝いは表示されない"
  );
  assertEqual(
    findEligibleCelebration([SONG_WITHOUT_CENTER], TEST_PLAYER_KEY_PREFIX),
    null,
    "center未設定（未確認）の曲は、まだお祝いの対象にならない"
  );
  assertEqual(
    findEligibleCelebration([{ ...SONG_WITH_CENTER, center: ["野口衣織"] }], TEST_PLAYER_KEY_PREFIX),
    null,
    "センターが対象メンバーと一致しなければ表示されない"
  );

  const eligible = findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX);
  assertEqual(eligible?.id, "obaCenterNatsunagori", "曲データが揃い、未読であれば表示対象になる");
  assertEqual(
    eligible?.backgroundImageSrc,
    "assets/images/center-celebration-oba-natsunagori.webp",
    "背景画像のパスが正しく設定されている"
  );
  assertEqual(eligible?.youtubeVideoId, "_Bm66BRnM1A", "MVの動画IDが正しく設定されている");
  assertEqual(eligible?.frameMaxWidth, "420px", "縦長画像の最大幅が設定されている");
  assertEqual(eligible?.overlayPadding, "16px", "縦長画像の余白が設定されている");

  // ---- 既読フラグを立てると、この起動中は対象外になる（2件目は既読のまま＝両方見た状態） ----
  sessionStorage.setItem(SEEN_KEY_OBA, "true");
  assertEqual(
    findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX),
    null,
    "両方のお祝いが既読になっていれば、曲データが揃っていても何も表示されない"
  );

  cleanup();

  // ---- 2件目（夢の続き）は曲データと無関係に、常に対象になる ----
  const yumeEligible = findEligibleCelebration([], TEST_PLAYER_KEY_PREFIX);
  assertEqual(
    yumeEligible?.id,
    "yumeNoTsuzuki",
    "1件目（大場花菜）の条件を満たさない場合、曲データが空でも2件目（夢の続き）は対象になる"
  );
  assertEqual(
    yumeEligible?.backgroundImageSrc,
    "assets/images/celebration-yume-no-tsuzuki.webp",
    "夢の続きの背景画像のパスが正しく設定されている"
  );
  assertEqual(yumeEligible?.youtubeVideoId, "RjHjQlEjs_E", "夢の続きのMVの動画IDが正しく設定されている");
  // 【2026-08-26改訂】画像を横長→縦長（国立競技場を背景にした構図）に作り直したため、
  // 大場花菜と同じ幅上限・余白に戻っている（17-13章参照）。
  assertEqual(
    yumeEligible?.frameMaxWidth,
    "420px",
    "縦長に作り直した後は、大場花菜と同じ最大幅が設定されている"
  );
  assertEqual(yumeEligible?.overlayPadding, "16px", "縦長に作り直した後は、大場花菜と同じ余白が設定されている");

  cleanup();

  // ---- 両方が条件を満たす場合、CELEBRATIONS配列の並び順どおり1件目（大場花菜）が先に返る ----
  assertEqual(
    findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX)?.id,
    "obaCenterNatsunagori",
    "両方条件を満たしている場合、並び順どおり大場花菜のお祝いが先に対象になる"
  );

  // ---- 1件目を既読にすると、次は2件目（夢の続き）が対象になる（「見た！」後に連続表示する
  //      仕組みの土台となる挙動） ----
  sessionStorage.setItem(SEEN_KEY_OBA, "true");
  assertEqual(
    findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX)?.id,
    "yumeNoTsuzuki",
    "1件目を既読にすると、続けて2件目（夢の続き）が対象になる"
  );

  // ---- 2件目も既読にすると、もう何も対象にならない ----
  sessionStorage.setItem(SEEN_KEY_YUME, "true");
  assertEqual(
    findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX),
    null,
    "両方既読にすると、もう表示対象は無い"
  );

  // ---- アプリを閉じて開き直した状態（sessionStorageがリセットされた状態）を再現すると、
  //      既読フラグが引き継がれず、再び表示対象になる（本人指示：「見た！」は永久に
  //      非表示にする仕様ではない） ----
  cleanup();
  assertEqual(
    findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX)?.id,
    "obaCenterNatsunagori",
    "アプリを閉じて開き直した状態を再現すると、既読は引き継がれず再び表示対象になる"
  );

  // ---- 別のプレイヤーには、既読状態が引き継がれない（プレイヤーごとに独立） ----
  sessionStorage.setItem(SEEN_KEY_OBA, "true");
  sessionStorage.setItem(SEEN_KEY_YUME, "true");
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

  // ---- 【2026-09-15追加】就活ポートフォリオ公開期間の表示スイッチ ----
  // 表示条件を満たす曲データがあっても、スイッチが false なら何も表示しない（DOMに触れない）。
  // findEligibleCelebration() 自体の判定は上のテストどおり変わらない（機能は残っている）。
  const fakeElements = { overlay: { hidden: true, dataset: {} } };
  assertEqual(
    showCenterCelebrationIfEligible([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX, fakeElements, { enabled: false }),
    false,
    "表示スイッチが false のときは、対象条件を満たしていてもポップアップを表示しない"
  );
  assertEqual(fakeElements.overlay.hidden, true, "表示スイッチが false のときはオーバーレイに一切触れない");
  assertEqual(
    findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX)?.id,
    "obaCenterNatsunagori",
    "表示スイッチが false でも、表示条件の判定（再表示のときに使う）はそのまま機能する"
  );
  // ---- 【2026-09-15 第1回実機QA修正】通常利用では表示、ポートフォリオ撮影用は端末ごとに非表示 ----
  assertEqual(CELEBRATION_POPUPS_ENABLED, true, "通常利用（本人・フレンド・一般ユーザー）ではお祝いポップアップを表示する（全体スイッチは true）");
  localStorage.removeItem(CELEBRATION_SUPPRESS_KEY);
  assertEqual(isCelebrationSuppressed(), false, "非表示フラグが無い端末は通常表示");
  // 既定引数（enabled 省略）は「全体スイッチ かつ 端末で非表示にしていない」。表示条件を満たさない曲データを渡せば
  // DOMに触れずに false を返す＝抑止ではなく通常の判定経路を通っていることを確認する。
  // 全件を「この起動中は見た」状態にして、通常の判定経路（抑止ではなく既読判定）で false になることを確認する
  sessionStorage.setItem(SEEN_KEY_OBA, "true");
  sessionStorage.setItem(SEEN_KEY_YUME, "true");
  assertEqual(
    showCenterCelebrationIfEligible([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX, fakeElements),
    false,
    "通常利用時は抑止されず、通常の表示条件判定（全件既読→false）へ進む"
  );
  cleanup();
  setCelebrationSuppressed(true);
  assertEqual(isCelebrationSuppressed(), true, "撮影用の非表示フラグを立てられる");
  assertEqual(
    showCenterCelebrationIfEligible([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX, fakeElements),
    false,
    "この端末で非表示にしているときだけ、対象曲があっても表示しない"
  );
  assertEqual(fakeElements.overlay.hidden, true, "非表示中はオーバーレイに触れない");
  setCelebrationSuppressed(false);
  assertEqual(localStorage.getItem(CELEBRATION_SUPPRESS_KEY), null, "通常表示へ戻すとフラグ自体を消す（他ユーザーの既存設定と同じ「無し」状態）");
  assertEqual(applyCelebrationQueryOverride("?celebration=off"), "off", "URLの ?celebration=off で非表示");
  assertEqual(isCelebrationSuppressed(), true, "?celebration=off は端末に保存される（PWA再起動後も保持）");
  assertEqual(applyCelebrationQueryOverride("?celebration=on"), "on", "URLの ?celebration=on で通常表示へ");
  assertEqual(isCelebrationSuppressed(), false, "?celebration=on で非表示フラグが消える");
  assertEqual(applyCelebrationQueryOverride("?foo=1"), null, "指定が無ければ何も変えない");
  assertEqual(isCelebrationSuppressed(), false, "指定なしでは設定を変えない");
  assertEqual(
    findEligibleCelebration([SONG_WITH_CENTER], TEST_PLAYER_KEY_PREFIX)?.id,
    "obaCenterNatsunagori",
    "既存の表示済み判定（sessionStorage）は変更しておらず、そのまま機能する"
  );
  cleanup();
}
