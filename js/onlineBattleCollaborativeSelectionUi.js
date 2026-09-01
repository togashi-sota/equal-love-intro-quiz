// 共同選曲（参加者全員で出題曲を選ぶ機能）の「誰がどの曲を選んだか」「共有曲一覧」を
// 表示するための、DOM描画だけを担当する共通ヘルパー（2026-09-14新設・本人指示）。
//
// js/onlineBattleScreen.js（イントロ/アウトロ/ランダム共有エンジン）と
// js/onlineLyricsQuizBattleScreen.js（歌詞クイズ対戦）の両方から同じ関数を呼ぶことで、
// 見た目・実装を1箇所に集約する（本人指示：共通処理は再利用する）。
// データの集計自体（和集合・参加者別内訳）はjs/onlineBattleCollaborativeSelectionPayloads.js
// の純粋関数に任せ、このファイルはそれをDOMへ描画するだけに専念する。

import { buildSelectionBreakdownByPlayer, buildSelectorUidsBySongId } from "./onlineBattleCollaborativeSelectionPayloads.js";

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

// players（room.playersそのまま）とsongTitleResolver（songId => 曲名）を受け取り、
// 参加者別内訳リストと、重複除去した共有曲一覧の両方を指定コンテナへ描画する。
// currentUid（省略可）を渡すと、自分の行に「（あなた）」を付ける。
export function renderCollaborativeSelectionBreakdown({
  byPlayerListElement,
  uniqueSongListElement,
  players,
  songTitleResolver,
  currentUid,
}) {
  const breakdown = buildSelectionBreakdownByPlayer(players);
  const selectorUidsBySongId = buildSelectorUidsBySongId(players);

  if (byPlayerListElement) {
    clearElement(byPlayerListElement);
    if (breakdown.length === 0) {
      const emptyItem = document.createElement("p");
      emptyItem.className = "online-battle-collab-breakdown-empty";
      emptyItem.textContent = "まだ誰も曲を選んでいません。";
      byPlayerListElement.appendChild(emptyItem);
    } else {
      breakdown.forEach((entry) => {
        const row = document.createElement("div");
        row.className = "online-battle-collab-breakdown-row";

        const nameEl = document.createElement("p");
        nameEl.className = "online-battle-collab-breakdown-name";
        nameEl.textContent = entry.uid === currentUid ? `${entry.displayName}（あなた）` : entry.displayName;
        row.appendChild(nameEl);

        const songsEl = document.createElement("p");
        songsEl.className = "online-battle-collab-breakdown-songs";
        songsEl.textContent = entry.songIds.map((songId) => songTitleResolver(songId)).join("、");
        row.appendChild(songsEl);

        byPlayerListElement.appendChild(row);
      });
    }
  }

  if (uniqueSongListElement) {
    clearElement(uniqueSongListElement);
    const uniqueSongIds = Object.keys(selectorUidsBySongId);
    if (uniqueSongIds.length === 0) {
      const emptyItem = document.createElement("p");
      emptyItem.className = "online-battle-collab-breakdown-empty";
      emptyItem.textContent = "共有曲はまだありません。";
      uniqueSongListElement.appendChild(emptyItem);
    } else {
      uniqueSongIds.forEach((songId) => {
        const chip = document.createElement("span");
        chip.className = "online-battle-collab-song-chip";
        const selectorCount = selectorUidsBySongId[songId].length;
        chip.textContent = selectorCount > 1 ? `${songTitleResolver(songId)}（${selectorCount}人）` : songTitleResolver(songId);
        uniqueSongListElement.appendChild(chip);
      });
    }
  }
}

// 「選択曲を見る」トグルボタンの開閉と、開いた瞬間の描画をまとめて配線する共通処理。
// toggleButtonElement・panelElementの表示切り替えロジックを2画面で複製しないための
// ラッパー。renderFn は「今開閉パネルを開いた瞬間に呼ぶべき再描画関数」を呼び出し元から
// 受け取る（各画面が持つ最新のroom/playersを毎回参照できるよう、クロージャ経由で渡す）。
export function wireCollaborativeSelectionDetailsToggle(toggleButtonElement, panelElement, renderFn) {
  if (!toggleButtonElement || !panelElement) return;
  toggleButtonElement.addEventListener("click", () => {
    const isOpen = !panelElement.hidden;
    panelElement.hidden = isOpen;
    toggleButtonElement.setAttribute("aria-expanded", String(!isOpen));
    toggleButtonElement.textContent = isOpen ? "選択曲を見る ▾" : "選択曲を閉じる ▴";
    if (!isOpen) renderFn();
  });
}

// 【2026-09-15新設・本人指示：共有曲選択UIをモード切替で安定させる】このセクション自体が
// hidden（今のモードでは使われていない）になる瞬間に呼ぶ。開閉パネルが開いたままの
// 状態を次にまた開いたときまで引きずらないよう、閉じた状態へ強制的に戻す
// （Firebaseへは一切触れない、見た目だけのリセット）。
export function resetCollaborativeSelectionDetailsPanel(toggleButtonElement, panelElement) {
  if (!toggleButtonElement || !panelElement) return;
  panelElement.hidden = true;
  toggleButtonElement.setAttribute("aria-expanded", "false");
  toggleButtonElement.textContent = "選択曲を見る ▾";
}
