// スタート画面のプレイヤー表示（名前・推しメン）と、プレイヤー管理モーダル
// （名前変更・プレイヤー切替・新規追加・削除）を担当するファイル。
// プレイヤーの実データ管理はjs/playerProfile.jsが行い、このファイルは画面の組み立てと
// 操作の受け付けだけを行う（2026-08-03新設、HANDOFF 10-29章参照）。
//
// 「名前を変更」（renamePlayer、今のプレイヤーのデータを維持）と
// 「新しいプレイヤーを追加」（addPlayer、新しいplayerId・初期状態のデータ）は、
// 別々のボタン・別々の関数として明確に分けている（本人方針。誤操作で
// データが混ざらないようにするため）。

import {
  getPlayers,
  getActivePlayerId,
  getActivePlayer,
  deletePlayer,
  registerNewPlayer,
  switchToPlayer,
  renamePlayerVerified,
  PLAYER_NAME_MAX_LENGTH,
  DEFAULT_PLAYER_ID,
} from "./playerProfile.js";
import { getMemberById } from "./memberUtils.js";
import { getMostOshiMemberId } from "./oshiMembers.js";
import { applyOshiBadgeDecorations } from "./oshiBadge.js";
import { getStoragePersistenceStatus } from "./storagePersistence.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

let elements = null;
let members = null; // 推しメン表示用に、members.jsの配列を保持しておく
let renamingPlayerId = null; // 現在インライン編集中のプレイヤーid（無ければnull）
let pendingDeletePlayerId = null; // 削除確認モーダルで対象にしているプレイヤーid

// スタート画面上部の「プレイヤー名」「推しメン」チップを、現在の選択状態に合わせて更新する。
// プレイヤー切替・推しメン登録の直後など、状態が変わるたびに呼ぶ想定。
export function renderPlayerSummary() {
  const activePlayer = getActivePlayer();
  elements.playerNameChipText.textContent = activePlayer.playerName || "プレイヤー名を設定";

  const mostOshiMemberId = getMostOshiMemberId();
  const mostOshiMember = mostOshiMemberId ? getMemberById(members, mostOshiMemberId) : null;
  elements.oshiSummaryChipText.textContent = mostOshiMember
    ? `推し：${mostOshiMember.name}`
    : "推しメンを登録しよう";
  // 未登録のときは「押せば設定できる」ことが一目で伝わるよう、ボタンらしい見た目
  // （背景色＋矢印）にする。登録済みなら通常の情報表示に戻す（2026-08-04追加）。
  elements.oshiSummaryChip.classList.toggle("is-empty", !mostOshiMember);

  // 丸いスワッチ（アイコン部分）は、最推しのメンバーカラーがあればそれを、
  // 無ければ控えめなプレースホルダーのままにする（2026-08-04デザイン改善）。
  if (elements.playerHeroSwatch) {
    const hex = mostOshiMember?.memberColor?.hex;
    elements.playerHeroSwatch.style.background = hex ?? "";
    elements.playerHeroSwatch.classList.toggle("is-placeholder", !hex);
    // ＝LOVEマスター／＝LOVE完全制覇を取得していれば、王冠・ダイヤを重ねて表示する
    // （2026-08-07追加、本人指示。共通関数・CSSクラスだけで行い、画面ごとに複製しない）。
    applyOshiBadgeDecorations(elements.playerHeroSwatch);
  }
}

// プレイヤー名の1文字目（無ければ「？」）を、丸いアバター代わりに使う。
function buildPlayerAvatar(player) {
  const avatar = document.createElement("span");
  avatar.className = "player-row-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = player.playerName ? player.playerName.charAt(0) : "？";
  return avatar;
}

// 画面に出すときの名前（名前の無い最初のプレイヤーは「（名前未設定）」）
function displayNameOf(player) {
  return player?.playerName || "（名前未設定）";
}

// 欄の近くに理由・結果を出す（空文字で隠す）。tone："error"｜"success"｜""
function setMessage(element, text, tone = "") {
  if (!element) return;
  element.textContent = text;
  element.hidden = !text;
  element.classList.toggle("is-error", tone === "error");
  element.classList.toggle("is-success", tone === "success");
}

// 成功してから閉じるまでの待ち時間（「登録しました」を読めるだけ見せる）と、知らせを出しておく時間
export const PLAYER_MODAL_AUTO_CLOSE_MS = 900;
const PLAYER_TOAST_MS = 2400;

// 【2026-10-29追加】登録・切り替え・名前の変更のあと、閉じたホームの上に短く出す知らせ（読み上げにも伝わる）。
let toastElement = null;
let toastTimerId = null;
function showPlayerToast(text) {
  if (!toastElement) {
    toastElement = document.createElement("div");
    toastElement.className = "player-toast";
    toastElement.setAttribute("role", "status");
    toastElement.setAttribute("aria-live", "polite");
    toastElement.hidden = true;
    document.body.appendChild(toastElement);
  }
  toastElement.textContent = text;
  toastElement.hidden = false;
  clearTimeout(toastTimerId);
  toastTimerId = setTimeout(() => {
    toastElement.hidden = true;
  }, PLAYER_TOAST_MS);
}

// 成功してから閉じるまでの間は true（二重押し・別の操作を受け付けない）
let isFinishing = false;
let autoCloseTimerId = null;
let pendingToastText = ""; // 閉じたときに出す知らせ（自動で閉じる前に × で閉じても出す）

// 成功したとき：ホームの名前を直し、他の画面にも知らせ、短い知らせを出して閉じる
function finishWithSuccess(toastText, { changedPlayer = true, delayMs = PLAYER_MODAL_AUTO_CLOSE_MS } = {}) {
  isFinishing = true;
  pendingToastText = toastText;
  renamingPlayerId = null;
  // 閉じるタイマーを先に作る（下の他の画面の処理で例外が出ても、閉じられなくならないように）
  clearTimeout(autoCloseTimerId);
  autoCloseTimerId = setTimeout(() => {
    autoCloseTimerId = null;
    hidePlayerModal();
  }, delayMs);
  try {
    renderPlayerSummary();
    if (changedPlayer) elements.onPlayerChanged?.();
  } catch (error) {
    console.warn("プレイヤーの切り替えのあとの表示の更新に失敗しました（登録・切り替えは保存済みです）", error);
  }
}

// IME（日本語入力）の変換を確定するための Enter は、登録・保存に使わない。
// iPhone の Safari は isComposing を付けないことがあるので、keyCode 229（変換中）も見る。
function isImeEnter(event) {
  return event.isComposing || event.keyCode === 229;
}

// ✎ を押したあとの行：名前の欄・「保存」・「やめる」と、何が起きるかの説明
function buildRenameRow(player) {
  const wrapper = document.createElement("div");
  wrapper.className = "player-row-wrapper is-renaming";

  const row = document.createElement("div");
  row.className = "player-row is-renaming";
  row.classList.toggle("is-active", player.playerId === getActivePlayerId());
  row.appendChild(buildPlayerAvatar(player));

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = PLAYER_NAME_MAX_LENGTH;
  input.value = player.playerName;
  input.placeholder = "新しい名前を入力";
  input.className = "player-row-rename-input";
  input.autocomplete = "off";
  input.setAttribute("aria-label", `${displayNameOf(player)}の新しい名前`);
  input.setAttribute("enterkeyhint", "done");
  row.appendChild(input);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "player-row-text-button is-save";
  saveButton.textContent = "保存";
  saveButton.setAttribute("aria-label", "名前を保存する");
  row.appendChild(saveButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "player-row-text-button is-cancel";
  cancelButton.textContent = "やめる";
  cancelButton.setAttribute("aria-label", "名前を変えずに戻る");
  row.appendChild(cancelButton);
  wrapper.appendChild(row);

  // 何が起きるかを、その場で書く（新しいプレイヤーは作らない）
  const hint = document.createElement("p");
  hint.className = "player-row-rename-hint";
  hint.textContent = "名前だけが変わります。履歴・自己ベスト・称号・推しメンはそのままです（新しいプレイヤーは作りません）。";
  wrapper.appendChild(hint);

  const message = document.createElement("p");
  message.className = "player-add-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.hidden = true;
  wrapper.appendChild(message);

  const commitRename = () => {
    if (isFinishing) return;
    const result = renamePlayerVerified(player.playerId, input.value);
    if (!result.ok) {
      playSfx(SFX_EVENTS.UI_BACK);
      setMessage(message, result.message, "error");
      input.focus();
      return; // 閉じない・入力を残す
    }
    playSfx(SFX_EVENTS.UI_CONFIRM);
    saveButton.disabled = true;
    cancelButton.disabled = true;
    input.disabled = true;
    setMessage(message, `✓ 名前を「${result.name}」に変えました（このあと自動で閉じます）`, "success");
    // 名前の変更では使用中の人は変わらないので onPlayerChanged は呼ばない（呼ぶと連続再生を止める等、
    // 切り替え用の処理まで走るため）。表示名の公開プロフィールへの反映は、今までどおりホームに戻ったときの同期で行う。
    finishWithSuccess(`名前を「${result.name}」に変えました`, { changedPlayer: false });
  };

  // ✓ボタンが小さくて押しづらいという指摘があったため、キーボードのEnter（改行）でも
  // 保存できるようにする（IME変換確定中のEnterで誤って保存しないよう、変換中は無視する）。
  // stopPropagation()も呼び、documentのキー操作リスナー（main.js）までEnterイベントが
  // 伝わって「スタート画面：Enterキーでスタート」等の別ショートカットが誤発火しないようにする
  // （2026-08-04、実機で「名前確定時に裏で曲が始まる」不具合が発生したため追加）。
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || isImeEnter(event)) return;
    event.preventDefault();
    event.stopPropagation();
    commitRename();
  });
  input.addEventListener("input", () => setMessage(message, ""));
  saveButton.addEventListener("click", commitRename);
  cancelButton.addEventListener("click", () => {
    if (isFinishing) return;
    playSfx(SFX_EVENTS.UI_BACK);
    renamingPlayerId = null;
    renderPlayerModal();
  });
  // 編集開始時に自動でキーボードを出し、既存の名前を選択状態にしておく
  // （わざわざ入力欄をもう一度タップしなくても、そのまま打ち直せるようにするため）。
  // 行を一覧へ入れたあとでないと focus() が効かないので、少しだけ後に回す。
  queueMicrotask(() => {
    input.focus();
    input.select();
  });
  return wrapper;
}

function buildPlayerRow(player) {
  if (renamingPlayerId === player.playerId) return buildRenameRow(player);

  const row = document.createElement("div");
  row.className = "player-row";
  const isActive = player.playerId === getActivePlayerId();
  row.classList.toggle("is-active", isActive);

  row.appendChild(buildPlayerAvatar(player));

  // 名前を押す：その人に切り替えて閉じる（使用中の人なら、そのまま閉じる）
  const switchButton = document.createElement("button");
  switchButton.type = "button";
  switchButton.className = "player-row-switch-button";
  switchButton.setAttribute(
    "aria-label",
    isActive ? `${displayNameOf(player)}（使用中）。押すとこのまま閉じます` : `${displayNameOf(player)}に切り替える`
  );
  const nameSpan = document.createElement("span");
  nameSpan.className = "player-row-name";
  nameSpan.textContent = displayNameOf(player);
  switchButton.appendChild(nameSpan);
  const tag = document.createElement("span");
  tag.className = isActive ? "player-row-active-tag" : "player-row-switch-tag";
  tag.textContent = isActive ? "使用中" : "切り替える";
  tag.setAttribute("aria-hidden", "true");
  switchButton.appendChild(tag);
  switchButton.addEventListener("click", () => handleSwitchClick(player));
  row.appendChild(switchButton);

  // ✎：その人の名前だけを変える（新しいプレイヤーは作らない）。名前の無い人には「名前を付ける」
  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.className = "player-row-text-button is-rename";
  renameButton.textContent = player.playerName ? "✎ 名前を変える" : "✎ 名前を付ける";
  renameButton.setAttribute("aria-label", `${displayNameOf(player)}の名前を変える（記録はそのまま）`);
  renameButton.addEventListener("click", () => {
    if (isFinishing) return;
    playSfx(SFX_EVENTS.UI_CLICK);
    renamingPlayerId = player.playerId;
    renderPlayerModal();
  });
  row.appendChild(renameButton);

  // 最初のプレイヤー（今までの端末データそのもの）は削除できない（必ず1人は残す設計）。
  if (player.playerId !== DEFAULT_PLAYER_ID) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "player-row-icon-button is-delete";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `${displayNameOf(player)}を削除する`);
    deleteButton.addEventListener("click", () => {
      if (isFinishing) return;
      playSfx(SFX_EVENTS.UI_CLICK);
      renamingPlayerId = null; // 名前の変更の途中なら、それはやめる（削除のあと元の名前の欄が残らないように）
      pendingDeletePlayerId = player.playerId;
      elements.playerDeleteConfirmModal.hidden = false;
    });
    row.appendChild(deleteButton);
  }

  return row;
}

// 既存のプレイヤーを押したとき：切り替えて、保存できたら閉じる（使用中の人なら、そのまま閉じる）
function handleSwitchClick(player) {
  if (isFinishing) return;
  renamingPlayerId = null; // 別の人の名前の変更の途中なら、それはやめる
  if (player.playerId === getActivePlayerId()) {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    finishWithSuccess("", { changedPlayer: false, delayMs: 0 });
    return;
  }
  const result = switchToPlayer(player.playerId);
  if (!result.ok) {
    playSfx(SFX_EVENTS.UI_BACK);
    renderPlayerModal();
    setMessage(elements.playerSwitchMessage, result.message, "error");
    return;
  }
  playSfx(SFX_EVENTS.UI_CONFIRM);
  renderPlayerModal(); // 「使用中」の印を、閉じる前に新しい人へ移す
  finishWithSuccess(`${displayNameOf(result.player)}さんに切り替えました`);
}

// 切り替えに失敗したときの理由を出す場所（一覧のすぐ下に、JS で1つだけ作る）
function ensureSwitchMessageElement() {
  const list = elements.playerList;
  if (!list) return null;
  const existing = document.getElementById("player-switch-message");
  if (existing) return existing;
  const message = document.createElement("p");
  message.id = "player-switch-message";
  message.className = "player-add-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  message.hidden = true;
  list.after(message);
  return message;
}

function renderPlayerModal() {
  elements.playerList.innerHTML = "";
  getPlayers().forEach((player) => {
    elements.playerList.appendChild(buildPlayerRow(player));
  });
  // 使用中の人に名前が無いときだけ「名前を付けるだけなら ✎」の案内を出す（名前の変更中は出さない）
  const unnamedNote = elements.playerUnnamedNote ?? document.getElementById("player-unnamed-note");
  if (unnamedNote) unnamedNote.hidden = Boolean(getActivePlayer().playerName) || renamingPlayerId !== null;
}

// 音源・歌詞データの永続化許可状況を表示する（2026-08-15追加）。
// モーダルを開くたびに最新の状態を確認する（設定変更はブラウザ側で行われるため、
// キャッシュせず毎回問い合わせる）。対応していない端末では、そのことが分かる文言にする
// （「絶対に消えません」等の言い切りは本人方針により使わない）。
async function renderStoragePersistenceStatus() {
  if (!elements.storageStatusText) return;
  const { supported, persisted } = await getStoragePersistenceStatus();
  const el = elements.storageStatusText;
  el.classList.remove("is-protected", "is-unprotected");
  if (!supported) {
    el.textContent = "🔒 音源・歌詞は端末内（IndexedDB）に保存されています。";
    return;
  }
  if (persisted) {
    el.classList.add("is-protected");
    el.textContent = "🔒 データ保護：有効（端末の空き容量が少なくなっても、自動では消えにくくなっています）";
  } else {
    el.classList.add("is-unprotected");
    el.textContent = "⚠️ データ保護：未許可（端末の空き容量が少ないと、音源・歌詞が自動で削除される場合があります）";
  }
}

const ADD_BUTTON_TEXT = "この名前で登録";

// 「新しいプレイヤーを追加」の欄を、開いたとき・閉じたときの状態に戻す
function resetAddForm() {
  elements.playerAddInput.value = "";
  elements.playerAddInput.disabled = false;
  elements.playerAddInput.classList.remove("is-invalid");
  elements.playerAddInput.removeAttribute("aria-invalid");
  elements.playerAddButton.disabled = false;
  elements.playerAddButton.textContent = ADD_BUTTON_TEXT;
  setMessage(elements.playerAddMessage, "");
  setMessage(elements.playerSwitchMessage, "");
}

function openPlayerModal() {
  playSfx(SFX_EVENTS.UI_CLICK);
  clearTimeout(autoCloseTimerId);
  autoCloseTimerId = null;
  pendingToastText = "";
  isFinishing = false;
  renamingPlayerId = null;
  resetAddForm();
  renderPlayerModal();
  renderStoragePersistenceStatus();
  elements.playerModal.hidden = false;
}

// 音を鳴らさずに閉じる（成功のあとに自動で閉じるとき）
function hidePlayerModal() {
  clearTimeout(autoCloseTimerId);
  autoCloseTimerId = null;
  if (pendingToastText) showPlayerToast(pendingToastText);
  pendingToastText = "";
  isFinishing = false;
  renamingPlayerId = null;
  elements.playerModal.hidden = true;
  resetAddForm();
}

function closePlayerModal() {
  playSfx(SFX_EVENTS.UI_BACK);
  hidePlayerModal();
}

// プレイヤー削除時に、そのプレイヤー専用の保存データ（自己ベスト・履歴・称号・推しメン等、
// "equalLoveIntroQuiz.player.{playerId}.〜"の形のキー）をlocalStorageから消す。
// 各データの保存キーはhighscore.js/history.js/titleProgress.js/oshiMembers.js側で
// バラバラに組み立てられているため、このファイルではキー名の中身を知らなくても済むよう、
// 接頭辞（プレフィックス）が一致するキーをまとめて探して消す方式にしている
// （2026-08-04、最終セルフレビューで「削除してもデータが残り続ける」不具合を発見し追加）。
function removePlayerScopedData(playerId) {
  const prefix = `equalLoveIntroQuiz.player.${playerId}.`;
  const keysToRemove = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

// elements: {
//   playerNameChip, playerNameChipText: スタート画面のプレイヤー名チップ,
//   oshiSummaryChip, oshiSummaryChipText: スタート画面の推しメンチップ,
//   playerModal, playerModalCloseButton, playerList: プレイヤー管理モーダル,
//   playerAddInput, playerAddButton: 新規プレイヤー追加用の入力欄・ボタン,
//   playerDeleteConfirmModal, playerDeleteCancelButton, playerDeleteConfirmButton: 削除確認モーダル,
//   onSelectOshiSummary: 推しメンチップが押されたときに呼ばれるコールバック（メンバー一覧へ遷移する想定）,
//   onPlayerChanged: プレイヤーが切り替わった/追加された/削除されたときに呼ばれるコールバック
//     （自己ベスト表示等、他画面の再描画をmain.js側に任せるため）,
// }
export function initPlayerScreen(newElements, allMembers) {
  elements = newElements;
  members = allMembers;
  // 【2026-10-29追加】理由・結果を出す場所（main.js から渡されなければ id で探す。main.js の変更を最小にするため）
  elements.playerAddMessage ??= document.getElementById("player-add-message");
  elements.playerSwitchMessage ??= ensureSwitchMessageElement();

  elements.playerNameChip.addEventListener("click", openPlayerModal);
  elements.playerModalCloseButton.addEventListener("click", closePlayerModal);
  // 【2026-10-29追加】Esc で閉じる（名前の変更中は、変更をやめるだけ。削除の確認が開いているときは何もしない）
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || elements.playerModal.hidden || !elements.playerDeleteConfirmModal.hidden) return;
    if (event.isComposing || event.keyCode === 229) return; // 日本語の変換を Esc で取り消しただけ（入力を消さない）
    if (renamingPlayerId) {
      renamingPlayerId = null;
      renderPlayerModal();
      return;
    }
    if (!isFinishing) closePlayerModal();
  });
  elements.playerModal.addEventListener("click", (event) => {
    // 名前変更の入力中に背景（モーダルの外側）を誤タップしても、入力中の文字が消えたり
    // モーダルが閉じて裏の画面（スタートボタン等）に誤ってタップが伝わったりしないよう、
    // 入力中は外側タップでの閉じる動作を無効にする（2026-08-04、実機での不具合報告により追加）。
    if (renamingPlayerId || isFinishing) return;
    if (event.target === elements.playerModal) closePlayerModal();
  });

  // 「この名前で登録」：名前を確かめる → 登録して保存を確かめる → 使用中にする → 「○○さんを登録しました」→ 自動で閉じる。
  // 失敗（空・重複・長すぎ・保存の失敗）のときは閉じず、理由を欄のすぐ下に出し、入力は残す。
  // 入力中には何も作らない（押したとき・Enter のときだけ）。成功してから閉じるまでは二重に押せない。
  const commitAddPlayer = () => {
    if (isFinishing || elements.playerAddButton.disabled) return;
    const result = registerNewPlayer(elements.playerAddInput.value);
    if (!result.ok) {
      playSfx(SFX_EVENTS.UI_BACK);
      setMessage(elements.playerAddMessage, result.message, "error");
      elements.playerAddInput.classList.add("is-invalid");
      elements.playerAddInput.setAttribute("aria-invalid", "true");
      if (result.reason === "activate-failed") renderPlayerModal(); // 登録はできたので一覧には出す
      elements.playerAddInput.focus();
      return;
    }
    playSfx(SFX_EVENTS.UI_CONFIRM);
    const name = result.player.playerName;
    elements.playerAddInput.disabled = true;
    elements.playerAddButton.disabled = true;
    elements.playerAddButton.textContent = "✓ 登録しました";
    renamingPlayerId = null; // 名前の変更の途中だったら、それはやめる（変更中の欄が元の名前に戻って残らないように）
    setMessage(elements.playerAddMessage, `✓ ${name}さんを登録しました。使用中にしました（このあと自動で閉じます）`, "success");
    renderPlayerModal();
    finishWithSuccess(`${name}さんを登録しました`);
  };
  elements.playerAddButton.addEventListener("click", commitAddPlayer);
  // キーボードのEnterでも登録できるようにする（日本語の変換を確定する Enter は除く）。
  // stopPropagation()の理由はリネーム欄と同じ（documentのEnterショートカットへの伝播を防ぐため）。
  elements.playerAddInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || isImeEnter(event)) return;
    event.preventDefault();
    event.stopPropagation();
    commitAddPlayer();
  });
  // 打ち直し始めたら、前の理由を消す（入力は残したまま）
  elements.playerAddInput.addEventListener("input", () => {
    setMessage(elements.playerAddMessage, "");
    elements.playerAddInput.classList.remove("is-invalid");
    elements.playerAddInput.removeAttribute("aria-invalid");
  });

  elements.playerDeleteCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    pendingDeletePlayerId = null;
    elements.playerDeleteConfirmModal.hidden = true;
  });
  elements.playerDeleteConfirmButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    if (pendingDeletePlayerId) {
      removePlayerScopedData(pendingDeletePlayerId);
      deletePlayer(pendingDeletePlayerId);
      pendingDeletePlayerId = null;
    }
    elements.playerDeleteConfirmModal.hidden = true;
    renderPlayerModal();
    renderPlayerSummary();
    elements.onPlayerChanged?.();
  });

  elements.oshiSummaryChip.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.onSelectOshiSummary?.();
  });

  renderPlayerSummary();
}
