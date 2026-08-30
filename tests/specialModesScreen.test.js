// specialModesScreen.js（特別モード一覧・ホーム画面8カード）のテスト。
// データの整合性（並び順など）に加え、本人指示（2026-08-07）により以下2点だけは
// 実際のDOM・クリックイベントで検証する：
//   ・「？」ヘルプボタンを押したときに、カード本体のonSelectMode（モード開始）が
//     誤って発火しないこと（イベントバブリングの回帰）
//   ・8モードすべてで、カード本体タップからonSelectModeが正しいidで呼ばれること
// （他ファイルの「DOM構築はブラウザ確認に任せる」という規約からは外れるが、
//   誤発火はユーザー体験に直結するバグのため、この2点だけ明示的にテストする）。

import { SPECIAL_MODES, HOME_SPECIAL_MODES_ORDER, initSpecialModesScreen, buildAvailableCard } from "../js/specialModesScreen.js";
import { assertEqual } from "./test-utils.js";

export function runSpecialModesScreenTests() {
  const specialModeIds = SPECIAL_MODES.map((mode) => mode.id);

  // ---- ホーム画面には必ず10件並べる（2列×4段＋アウトロクイズ・一瞬チャレンジの
  //      2段追加、2026-08-30改訂） ----
  assertEqual(HOME_SPECIAL_MODES_ORDER.length, 10, "ホーム画面の特別モードはちょうど10件");

  // ---- 重複がないこと（同じモードが2度表示されるのを防ぐ） ----
  const uniqueIds = new Set(HOME_SPECIAL_MODES_ORDER);
  assertEqual(uniqueIds.size, HOME_SPECIAL_MODES_ORDER.length, "ホーム画面の並び順に重複がない");

  // ---- HOME_SPECIAL_MODES_ORDERの各idが、SPECIAL_MODESに実在すること
  //      （タイプミス等で存在しないidを指定していないかの回帰チェック） ----
  HOME_SPECIAL_MODES_ORDER.forEach((modeId) => {
    assertEqual(specialModeIds.includes(modeId), true, `HOME_SPECIAL_MODES_ORDERの"${modeId}"はSPECIAL_MODESに存在する`);
  });

  // ---- 本人指定の並び順どおりであること（2026-08-30再々改訂：ランダム再生→歌詞クイズ→
  //      アウトロクイズ→一瞬チャレンジ→タイムアタック→オンライン対戦、という主要モードの
  //      流れを優先。一瞬チャレンジは「末尾固定」の方針から「タイムアタックの直前」へ変更） ----
  assertEqual(
    HOME_SPECIAL_MODES_ORDER.join(","),
    [
      "randomPlayback", "lyricsQuiz", "outroQuiz", "instantChallenge", "timeAttack", "onlineBattle", "originalQuiz", "liveCallMode", "weakSongs", "localBattle",
    ].join(","),
    "ホーム画面の並び順が指定通り（ランダム再生→歌詞クイズ→アウトロ→一瞬→タイムアタック→オンライン対戦の順）"
  );

  // ---- 特別モード8個すべてにアイコン要素が存在する ----
  let selectedModeId = null;
  let helpModeId = null;
  initSpecialModesScreen({
    listContainer: document.createElement("div"),
    homeGridContainer: document.createElement("div"),
    onSelectMode: (modeId) => {
      selectedModeId = modeId;
    },
    onShowHelp: (modeId) => {
      helpModeId = modeId;
    },
  });

  SPECIAL_MODES.forEach((mode) => {
    const card = buildAvailableCard(mode);
    assertEqual(
      card.querySelector(".special-mode-icon") !== null,
      true,
      `${mode.title}のカードにアイコン要素（.special-mode-icon）が存在する`
    );
  });

  // ---- 「？」を押したのにモードが開いてしまうイベントバブリングの回帰確認 ----
  const sampleMode = SPECIAL_MODES[0];
  const sampleCard = buildAvailableCard(sampleMode);
  document.body.appendChild(sampleCard);
  selectedModeId = null;
  helpModeId = null;
  sampleCard.querySelector(".special-mode-card-help-button").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertEqual(helpModeId, sampleMode.id, "「？」ボタンを押すとonShowHelpが正しいmodeIdで呼ばれる");
  assertEqual(selectedModeId, null, "「？」ボタンを押してもonSelectMode（モード開始）は発火しない");
  document.body.removeChild(sampleCard);

  // ---- 8モードすべて、カード本体タップで正常に遷移できる ----
  SPECIAL_MODES.forEach((mode) => {
    const card = buildAvailableCard(mode);
    document.body.appendChild(card);
    selectedModeId = null;
    card.querySelector(".special-mode-card-tap-target").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assertEqual(selectedModeId, mode.id, `${mode.title}のカードをタップすると、onSelectModeが"${mode.id}"で呼ばれる`);
    document.body.removeChild(card);
  });
}
