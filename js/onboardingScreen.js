// 初回起動時の「プレイヤー名＋推しメン」必須登録画面を担当するファイル（2026-08-15新設）。
//
// 【対象】このアップデートより後に初めてこのPWAを開いた、正真正銘の新規ユーザーだけ。
// すでに何らかのデータ（プレイ履歴・自己ベスト・称号・設定など、equalLoveIntroQuiz.で
// 始まるどのキーでもよい）を端末に持っている場合は「既存ユーザー」とみなし、この画面は
// 一切表示しない（本人の最優先指示：既存ユーザーへの影響を絶対に避ける）。
//
// 【設計方針】名前・推しは、複数プレイヤー機能の「最初のプレイヤー」（DEFAULT_PLAYER_ID）に
// そのまま設定する。新しいプレイヤーを別途作る（addPlayer）のではなく、既存の仕組み
// （renamePlayer・setMostOshiMember）をそのまま使うため、データの持ち方を増やさない。
// 新規ユーザーはこの画面を通過するまでプレイできないため、「名前未設定のままプレイした
// データ」自体がそもそも発生しない＝過去に問題になった「匿名データの移行」は不要になる
// （調査の結果、既存の複数プレイヤー機構ではデフォルトプレイヤーの保存キーに名前を含まない
// ため、後から名前を付けてもデータが失われることはない。詳細は本人への最終報告を参照）。
import { DEFAULT_PLAYER_ID, renamePlayer } from "./playerProfile.js";
import { setMostOshiMember } from "./oshiMembers.js";
import { getActiveMembers } from "./memberUtils.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

const ONBOARDING_COMPLETE_KEY = "equalLoveIntroQuiz.onboardingCompleted";
const APP_DATA_KEY_PREFIX = "equalLoveIntroQuiz.";

// オンボーディング完了フラグ以外に、equalLoveIntroQuiz.で始まる保存データが
// 何か1つでもあれば「既存ユーザー」と判断する。特定の機能を使ったかどうかに依存しない
// （新しい機能が増えるたびにここへ追記する必要がないよう、あえてprefix一致だけで判定する）。
function hasAnyExistingAppData() {
  try {
    return Object.keys(localStorage).some(
      (key) => key.startsWith(APP_DATA_KEY_PREFIX) && key !== ONBOARDING_COMPLETE_KEY
    );
  } catch {
    // localStorageが読めない異常系（プライベートブラウズ等の一部環境）では、
    // オンボーディングで詰まらせるより先に進めさせる方が安全なため、既存扱いにする。
    return true;
  }
}

// この画面を表示すべきかどうかを判定する。既存ユーザーだった場合は、判定と同時に
// 完了フラグを立てる（グランドファザリング。以後は毎回この関数を呼ぶだけで済む）。
export function needsOnboarding() {
  try {
    if (localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "true") return false;
  } catch {
    return false;
  }
  if (hasAnyExistingAppData()) {
    markOnboardingCompleted();
    return false;
  }
  return true;
}

export function markOnboardingCompleted() {
  try {
    localStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
  } catch {
    // 保存できなくても、オンボーディング自体は完了させて先に進める（保存を諦めるだけ）。
  }
}

let elements = null;
let members = null;
let selectedOshiMemberId = null;
let onComplete = null;

function updateSubmitButtonState() {
  const name = elements.nameInput.value.trim();
  const isValid = name.length > 0 && selectedOshiMemberId !== null;
  elements.submitButton.disabled = !isValid;
}

function buildMemberOption(member) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "onboarding-member-option";
  button.dataset.memberId = member.id;
  button.classList.toggle("is-selected", member.id === selectedOshiMemberId);
  button.setAttribute("aria-pressed", String(member.id === selectedOshiMemberId));

  const swatch = document.createElement("span");
  swatch.className = "onboarding-member-swatch";
  swatch.style.background = member.memberColor?.hex ?? "";
  swatch.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "onboarding-member-name";
  name.textContent = member.name;

  button.append(swatch, name);
  button.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    selectedOshiMemberId = member.id;
    renderMemberGrid();
    updateSubmitButtonState();
  });
  return button;
}

function renderMemberGrid() {
  elements.memberGrid.innerHTML = "";
  getActiveMembers(members).forEach((member) => {
    elements.memberGrid.appendChild(buildMemberOption(member));
  });
}

function handleSubmit() {
  const name = elements.nameInput.value.trim();
  if (name.length === 0 || selectedOshiMemberId === null) return;

  playSfx(SFX_EVENTS.UI_CONFIRM);
  renamePlayer(DEFAULT_PLAYER_ID, name);
  setMostOshiMember(selectedOshiMemberId);
  markOnboardingCompleted();
  onComplete?.();
}

// elements: {
//   nameInput: プレイヤー名の入力欄,
//   memberGrid: 推しメン選択グリッドの入れ物,
//   submitButton: 「このプロフィールでゲームを始める」ボタン,
// }
// allMembers: js/data/members.jsのMEMBERS
// onCompleteCallback: 登録が完了した直後にmain.js側で呼ばれるコールバック
//   （スタート画面の表示更新・画面遷移を行う想定）
export function initOnboardingScreen(newElements, allMembers, onCompleteCallback) {
  elements = newElements;
  members = allMembers;
  onComplete = onCompleteCallback;

  renderMemberGrid();
  updateSubmitButtonState();

  elements.nameInput.addEventListener("input", updateSubmitButtonState);
  // Enterキーでの誤送信（IME変換確定中も含む）を防ぎつつ、確定後のEnterでは
  // 次の操作（推し選択）へ進みやすいよう、フォーム送信は行わずボタン活性化のみに任せる。
  elements.nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
    }
  });
  elements.submitButton.addEventListener("click", handleSubmit);
}
