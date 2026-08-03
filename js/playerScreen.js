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
  setActivePlayerId,
  addPlayer,
  renamePlayer,
  deletePlayer,
  DEFAULT_PLAYER_ID,
} from "./playerProfile.js";
import { getMemberById } from "./memberUtils.js";
import { getMostOshiMemberId } from "./oshiMembers.js";

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
  }
}

// プレイヤー名の1文字目（無ければ「？」）を、丸いアバター代わりに使う。
function buildPlayerAvatar(player) {
  const avatar = document.createElement("span");
  avatar.className = "player-row-avatar";
  avatar.textContent = player.playerName ? player.playerName.charAt(0) : "？";
  return avatar;
}

function buildPlayerRow(player) {
  const row = document.createElement("div");
  row.className = "player-row";
  const isActive = player.playerId === getActivePlayerId();
  row.classList.toggle("is-active", isActive);

  // インライン編集中（名前変更ボタンを押した直後）は、名前部分をテキスト入力に差し替える。
  if (renamingPlayerId === player.playerId) {
    row.appendChild(buildPlayerAvatar(player));

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 20;
    input.value = player.playerName;
    input.className = "player-row-rename-input";
    row.appendChild(input);

    const commitRename = () => {
      renamePlayer(player.playerId, input.value.trim() || player.playerName);
      renamingPlayerId = null;
      renderPlayerModal();
      renderPlayerSummary();
    };

    // ✓ボタンが小さくて押しづらいという指摘があったため、キーボードのEnter（改行）でも
    // 保存できるようにする（IME変換確定中のEnterで誤って保存しないよう、isComposing中は無視する）
    // （2026-08-04追加）。
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        commitRename();
      }
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "player-row-icon-button is-save";
    saveButton.textContent = "✓";
    saveButton.setAttribute("aria-label", "名前を保存する");
    saveButton.addEventListener("click", commitRename);
    row.appendChild(saveButton);
    // 編集開始時に自動でキーボードを出し、既存の名前を選択状態にしておく
    // （わざわざ入力欄をもう一度タップしなくても、そのまま打ち直せるようにするため）。
    input.focus();
    input.select();
    return row;
  }

  row.appendChild(buildPlayerAvatar(player));

  const switchButton = document.createElement("button");
  switchButton.type = "button";
  switchButton.className = "player-row-switch-button";
  const nameSpan = document.createElement("span");
  nameSpan.className = "player-row-name";
  nameSpan.textContent = player.playerName || "（名前未設定）";
  switchButton.appendChild(nameSpan);
  if (isActive) {
    const activeTag = document.createElement("span");
    activeTag.className = "player-row-active-tag";
    activeTag.textContent = "使用中";
    switchButton.appendChild(activeTag);
  }
  switchButton.addEventListener("click", () => {
    setActivePlayerId(player.playerId);
    renderPlayerModal();
    renderPlayerSummary();
    elements.onPlayerChanged?.();
  });
  row.appendChild(switchButton);

  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.className = "player-row-icon-button";
  renameButton.textContent = "✎";
  renameButton.setAttribute("aria-label", "名前を変更する");
  renameButton.addEventListener("click", () => {
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
    deleteButton.setAttribute("aria-label", "削除する");
    deleteButton.addEventListener("click", () => {
      pendingDeletePlayerId = player.playerId;
      elements.playerDeleteConfirmModal.hidden = false;
    });
    row.appendChild(deleteButton);
  }

  return row;
}

function renderPlayerModal() {
  elements.playerList.innerHTML = "";
  getPlayers().forEach((player) => {
    elements.playerList.appendChild(buildPlayerRow(player));
  });
}

function openPlayerModal() {
  renamingPlayerId = null;
  renderPlayerModal();
  elements.playerModal.hidden = false;
}

function closePlayerModal() {
  elements.playerModal.hidden = true;
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

  elements.playerNameChip.addEventListener("click", openPlayerModal);
  elements.playerModalCloseButton.addEventListener("click", closePlayerModal);
  elements.playerModal.addEventListener("click", (event) => {
    // 名前変更の入力中に背景（モーダルの外側）を誤タップしても、入力中の文字が消えたり
    // モーダルが閉じて裏の画面（スタートボタン等）に誤ってタップが伝わったりしないよう、
    // 入力中は外側タップでの閉じる動作を無効にする（2026-08-04、実機での不具合報告により追加）。
    if (renamingPlayerId) return;
    if (event.target === elements.playerModal) closePlayerModal();
  });

  const commitAddPlayer = () => {
    const name = elements.playerAddInput.value.trim();
    if (!name) return;
    const newPlayer = addPlayer(name);
    setActivePlayerId(newPlayer.playerId);
    elements.playerAddInput.value = "";
    renderPlayerModal();
    renderPlayerSummary();
    elements.onPlayerChanged?.();
  };
  elements.playerAddButton.addEventListener("click", commitAddPlayer);
  // 「＋追加」ボタンが押しづらい場合の代替手段として、キーボードのEnterでも追加できるようにする。
  elements.playerAddInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      commitAddPlayer();
    }
  });

  elements.playerDeleteCancelButton.addEventListener("click", () => {
    pendingDeletePlayerId = null;
    elements.playerDeleteConfirmModal.hidden = true;
  });
  elements.playerDeleteConfirmButton.addEventListener("click", () => {
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
    elements.onSelectOshiSummary?.();
  });

  renderPlayerSummary();
}
