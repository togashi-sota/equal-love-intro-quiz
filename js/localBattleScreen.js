// 対戦モード（ローカル対戦）の、出題開始までの画面群を担当するファイル。
// 「人数選択→作る/参加する→（設定→コード共有｜コード入力）→ルール確認」という一連の流れを、
// この1ファイルにまとめている（すべて同じ対戦準備フローの一部で、密接に関係するため）。
// 出題そのもの（クイズ画面の表示・選択肢クリックの処理）と、結果コードの集計・順位表は、
// それぞれ既存のクイズエンジン（js/main.js）・js/localBattleResultScreen.jsが担当する。
//
// 【設計メモ：showScreen()について】このプロジェクトでは、画面遷移（showScreen）と効果音
// （playClickSound）はmain.js だけが呼ぶ、という決まりになっている（他の画面ファイルは
// コールバック経由でmain.js に処理を委譲する）。このファイルは画面数が多く、都度コールバック名を
// 分けると煩雑になるため、"navigateTo(screenName)" という1つの汎用コールバックに統一し、
// main.js側で「効果音を鳴らしてからshowScreenする」という共通処理にまとめてもらっている。

import { getActivePlayer } from "./playerProfile.js";
import { SONGS } from "./data/songs.js";
import { filterSongsByCategory } from "./quiz.js";
import { getImportedSongIds } from "./audioStorage.js";
import {
  createBattleConfig,
  encodeBattleCode,
  decodeBattleCode,
  validateBattleConfig,
  formatBattleCodeForDisplay,
} from "./localBattle.js";

export const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全問" };
export const CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };
export const RULE_LABELS = { normal: "ノーマル", hard: "ハード", loveChain: "LOVE連チャン" };

// 初めて遊ぶ人にも「何をすれば勝てるか」が開始前に分かるよう、対戦の設定画面・ルール確認画面で
// 表示する短い勝敗条件の案内文（本人の要望・2026-08-07）。ノーマルだけ、選んだペナルティ秒数を
// 差し込む必要があるため関数にしている。
const RULE_WIN_CONDITION_HINTS = {
  hard: "正解数が多い人が上位。同点の場合はタイムで決まります",
  loveChain: "全問クリアを目指します。失敗時は到達問題数で競います",
};

function getRuleHintText(rule, penaltySeconds) {
  if (rule === "normal") {
    return `ミス1回につき+${penaltySeconds}秒。ペナルティ込みの記録で競います`;
  }
  return RULE_WIN_CONDITION_HINTS[rule] ?? "";
}

let elements = null;
let selectedPlayerCount = 2; // 1対1=2、4人対戦=4
let isHost = false; // 「対戦を作る」で来たか「参加する」で来たか
let currentBattleConfig = null; // {seed, questionCountValue, categoryFilterValue, rule}
let myPlayerName = "";

// 出題を開始する側（main.js）・結果集計側（localBattleResultScreen.js）が、
// 「今どんな対戦をしているか」を読み取るための窓口。
export function getCurrentBattleSession() {
  return { config: currentBattleConfig, maxParticipants: selectedPlayerCount, playerName: myPlayerName };
}

function buildConfigSummaryChips(container, config) {
  container.innerHTML = "";
  const chips = [
    QUESTION_COUNT_LABELS[config.questionCountValue] ?? config.questionCountValue,
    CATEGORY_LABELS[config.categoryFilterValue] ?? config.categoryFilterValue,
    RULE_LABELS[config.rule] ?? config.rule,
  ];
  if (config.rule === "normal") {
    chips.push(`ペナルティ+${config.penaltySeconds}秒`);
  }
  chips.forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "battle-config-chip";
    chip.textContent = text;
    container.appendChild(chip);
  });
}

// 対戦で使うカテゴリの曲プール全体について、この端末に音源が読み込まれているかを確認する。
// 対戦は「シードから毎回同じ問題を作り直す」設計のため、実際に出題される曲だけを先に
// 確定させるのが難しく、代わりにプール全体を対象に確認する（多少厳しめの判定になるが、
// 「対戦相手を待たせてから音源不足が発覚する」事故を防ぐことを優先した）。
async function countMissingAudio(config) {
  const pool = filterSongsByCategory(SONGS, config.categoryFilterValue);
  const importedIds = await getImportedSongIds();
  const importedSet = new Set(importedIds);
  return pool.filter((song) => !importedSet.has(song.id)).length;
}

function renderAudioCheck(container, config) {
  container.innerHTML = "";
  countMissingAudio(config).then((missingCount) => {
    const box = document.createElement("div");
    if (missingCount === 0) {
      box.className = "battle-check-ok";
      box.textContent = "✓ お使いの端末で、出題される可能性のある曲の音源を確認できました";
    } else {
      box.className = "battle-warning-box";
      box.textContent = `⚠ ${missingCount}曲の音源が読み込まれていません。「音源を読み込む」から追加してください`;
    }
    container.appendChild(box);
  });
}

function goToRuleConfirm() {
  buildConfigSummaryChips(elements.ruleConfirmConfigSummary, currentBattleConfig);
  elements.ruleConfirmRuleHint.textContent = getRuleHintText(currentBattleConfig.rule, currentBattleConfig.penaltySeconds);
  elements.ruleConfirmPlayerName.value = getActivePlayer().playerName || "";
  renderAudioCheck(elements.ruleConfirmAudioCheck, currentBattleConfig);
  elements.navigateTo("battleRuleConfirm");
}

// 対戦の設定画面で、今選ばれているルール・ペナルティ秒数に合わせて勝敗条件案内を更新し、
// ノーマル以外を選んでいるときはミスペナルティの選択欄自体を隠す（無関係な設定を見せないため）。
function updateSetupRuleHint() {
  const rule = document.querySelector('input[name="battle-rule"]:checked').value;
  const penaltyRadio = document.querySelector('input[name="battle-penalty"]:checked');
  const penaltySeconds = penaltyRadio ? Number(penaltyRadio.value) : 2;
  elements.setupRuleHint.textContent = getRuleHintText(rule, penaltySeconds);
  elements.setupPenaltyFieldset.hidden = rule !== "normal";
}

// 対戦モード画面群を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   navigateTo(screenName)：画面遷移（効果音＋showScreen）をまとめて行うコールバック,
//   modeSelectBackButton, mode1v1Button, mode4pButton,
//   createOrJoinBackButton, createOrJoinTitle, createButton, joinButton,
//   setupBackButton, setupCreateCodeButton, setupError, setupRuleHint, setupPenaltyFieldset,
//   codeShareBackButton, codeShareConfigSummary, codeShareValue, codeShareStartButton,
//   joinBackButton, joinCodeInput, joinError, joinConfirmButton,
//   ruleConfirmBackButton, ruleConfirmConfigSummary, ruleConfirmRuleHint, ruleConfirmAudioCheck,
//   ruleConfirmPlayerName, ruleConfirmStartButton,
//   onStartBattle(config)：ルール確認画面の「この内容で挑戦する」が押されたときに呼ばれる。
//                          実際にクイズを組み立てて開始する処理はmain.js側が担当する。
// }
export function initLocalBattleScreens(newElements) {
  elements = newElements;

  document.querySelectorAll('input[name="battle-rule"], input[name="battle-penalty"]').forEach((radio) => {
    radio.addEventListener("change", updateSetupRuleHint);
  });
  updateSetupRuleHint(); // 初期表示（デフォルトで選ばれているノーマル・公式ペナルティの案内を出しておく）

  // 2026-08-08修正：ホームの特別モードカードから直接この画面を開くようになったため、
  // 「戻る」は間に古い「特別モード一覧画面」を挟まずホーム画面へ直接戻す。
  elements.modeSelectBackButton.addEventListener("click", () => elements.navigateTo("start"));
  elements.mode1v1Button.addEventListener("click", () => {
    selectedPlayerCount = 2;
    elements.createOrJoinTitle.textContent = "1対1対戦";
    elements.navigateTo("battleCreateOrJoin");
  });
  elements.mode4pButton.addEventListener("click", () => {
    selectedPlayerCount = 4;
    elements.createOrJoinTitle.textContent = "4人対戦";
    elements.navigateTo("battleCreateOrJoin");
  });

  elements.createOrJoinBackButton.addEventListener("click", () => elements.navigateTo("battleModeSelect"));
  elements.createButton.addEventListener("click", () => {
    isHost = true;
    elements.navigateTo("battleSetup");
  });
  elements.joinButton.addEventListener("click", () => {
    isHost = false;
    elements.joinCodeInput.value = "";
    elements.joinError.hidden = true;
    elements.navigateTo("battleJoin");
  });

  elements.setupBackButton.addEventListener("click", () => elements.navigateTo("battleCreateOrJoin"));
  elements.setupCreateCodeButton.addEventListener("click", () => {
    const questionCountValue = document.querySelector('input[name="battle-question-count"]:checked').value;
    const categoryFilterValue = document.querySelector('input[name="battle-category-filter"]:checked').value;
    const rule = document.querySelector('input[name="battle-rule"]:checked').value;
    const penaltySeconds = Number(document.querySelector('input[name="battle-penalty"]:checked').value);

    const errorMessage = validateBattleConfig({ categoryFilterValue });
    if (errorMessage) {
      elements.setupError.textContent = errorMessage;
      elements.setupError.hidden = false;
      return;
    }
    elements.setupError.hidden = true;

    currentBattleConfig = createBattleConfig({ questionCountValue, categoryFilterValue, rule, penaltySeconds });
    const code = encodeBattleCode(currentBattleConfig);
    buildConfigSummaryChips(elements.codeShareConfigSummary, currentBattleConfig);
    elements.codeShareValue.textContent = formatBattleCodeForDisplay(code);
    elements.navigateTo("battleCodeShare");
  });

  elements.codeShareBackButton.addEventListener("click", () => elements.navigateTo("battleCreateOrJoin"));
  elements.codeShareStartButton.addEventListener("click", goToRuleConfirm);

  elements.joinBackButton.addEventListener("click", () => elements.navigateTo("battleCreateOrJoin"));
  elements.joinConfirmButton.addEventListener("click", () => {
    const decoded = decodeBattleCode(elements.joinCodeInput.value);
    if (!decoded.ok) {
      elements.joinError.hidden = false;
      elements.joinError.textContent =
        decoded.reason === "version-mismatch"
          ? "曲データのバージョンが違います。アプリを更新してください。"
          : "対戦コードが正しくありません。入力した文字を確認してください。";
      return;
    }
    elements.joinError.hidden = true;
    currentBattleConfig = decoded.config;
    goToRuleConfirm();
  });

  elements.ruleConfirmBackButton.addEventListener("click", () => {
    elements.navigateTo(isHost ? "battleCodeShare" : "battleJoin");
  });
  elements.ruleConfirmStartButton.addEventListener("click", () => {
    myPlayerName = elements.ruleConfirmPlayerName.value.trim() || "プレイヤー";
    elements.onStartBattle(currentBattleConfig);
  });
}
