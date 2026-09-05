// 結果画面（オンライン対戦4モード共通）で、自分自身が「ルーム設定に戻る」または
// 「もう一度」への対応（対戦の準備をする）を既に押したかどうかを表す、モジュール間で
// 共有する軽量な状態（2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド23-29章）。
//
// 【本人指示の要点】結果画面は各プレイヤーが自分のペースで見てよく、他の参加者の操作
// （ホストの「もう一度」「ルーム設定に戻る」等）で、まだ結果を見ている自分の画面を
// 強制的に切り替えてはいけない。「自分がまだ一度もこの結果画面に対して行動していない」
// という状態を、4つの結果画面すべてが共通の基準として参照できるようにする。
//
// 【なぜ独立ファイルにしたか】js/onlineBattleScreen.js（共有エンジン結果画面）・
// js/onlineLyricsQuizBattleScreen.js・js/onlineInstantBattleScreen.js・
// js/onlineInstantCoopBattleScreen.jsの4つの結果画面すべてが、この状態を読み書きする
// 必要がある。js/onlineLyricsQuizBattleScreen.jsはjs/onlineBattleScreen.jsを一切importしない
// という設計方針（同ファイル冒頭コメント参照）のため、状態そのものをどちらにも属さない
// 中立なファイルへ切り出した（js/onlineParticipantIcon.jsと同じ考え方）。

let hasResponded = false;

// 「ルーム設定に戻る」「もう一度への対応（対戦の準備をする）」ボタンが押された瞬間に呼ぶ。
export function markResultScreenResponded() {
  hasResponded = true;
}

// 新しい結果画面に入るたびに呼び、まだ何も押していない状態から始める。
export function resetResultScreenResponded() {
  hasResponded = false;
}

export function hasRespondedToCurrentResultScreen() {
  return hasResponded;
}

// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】4つの結果画面すべてが
// 同じ形で使う「結果確認の状況」一覧のDOM描画。ゲーム性の判定は一切持たない純粋な
// 描画処理のため、モードごとに複製せずこの中立ファイルへ集約する（本人指示：
// 「4種類の別同期ロジックを作らない、共通処理は再利用する」）。
// participants: match.participants（{uid: {displayName, ...}}）、
// players: room.players（{uid: {resultReturned, ...}}）。
export function renderResultReturnStatusList(listElement, participants, players, myUid) {
  if (!listElement) return;
  listElement.innerHTML = "";
  Object.entries(participants || {}).forEach(([uid, participant]) => {
    const hasReturned = players?.[uid]?.resultReturned === true;
    const row = document.createElement("li");
    row.className = "online-battle-result-return-status-row";
    const nameSpan = document.createElement("span");
    nameSpan.className = "online-battle-result-return-status-name";
    nameSpan.textContent = uid === myUid ? `${participant.displayName}（あなた）` : participant.displayName;
    row.appendChild(nameSpan);
    const badge = document.createElement("span");
    badge.className = `online-battle-result-return-status-badge ${hasReturned ? "is-done" : "is-waiting"}`;
    badge.textContent = hasReturned ? "ロビーへ戻りました" : "結果確認中";
    row.appendChild(badge);
    listElement.appendChild(row);
  });
}

// 結果画面の画面名（elements.navigateTo()に渡す文字列と一致させる）。
// document.body.dataset.screenがこのいずれかの間は「結果画面を見ている最中」とみなし、
// 他の参加者の操作で強制的に画面を切り替えない。
//
// 【重要：ここに含めてよいのは、その結果画面自身が「ルーム設定に戻る」を全参加者
// （ホスト・ゲスト双方）に提供し、resultReturnedを書き込める場合だけ】含めた状態で
// 該当モードの結果画面にゲスト用の個別「ルーム設定に戻る」ボタンが無いと、ゲストは
// 結果画面から抜け出す手段が無いまま待たされ続ける（詰み）。2026-09-30時点で4モード
// （共有エンジン・歌詞クイズ・一瞬バトル・一瞬協力）すべてに実装済み。
export const RESULT_SCREEN_NAMES = new Set([
  "onlineBattleResult",
  "onlineLyricsBattleResult",
  "onlineInstantBattleResult",
  "onlineInstantCoopBattleResult",
]);

// 【2026-10-01新設・本人指示：結果画面/再戦フロー全面設計】再戦準備専用の別画面を廃止し、
// 結果画面のインラインパネルへ置き換えたことに伴う、「参加者ごとの準備状況リスト」の
// 共通描画処理。renderResultReturnStatusList()と全く同じ理由（4画面すべてが同じ形で使う・
// ゲーム性の判定を持たない純粋な描画）でこの中立ファイルに置く。
// players: room.players（{uid: {name, isHost, rematchReady, ...}}）。
// isHost: 自分がホストかどうか（true のときだけ、自分以外の各行にキックボタンを添える。
// クリックの実処理＝js/onlineBattle.jsのkickPlayer()は、各結果画面が自分のcurrentRoomIdを
// 使って個別に呼ぶため、ここではdata-rematch-kick-uid属性を付けるだけに留める）。
export function renderRematchReadinessList(listElement, players, myUid, isHost) {
  if (!listElement) return;
  const playerEntries = Object.entries(players || {}).sort(([uidA], [uidB]) => {
    if (uidA === myUid) return -1;
    if (uidB === myUid) return 1;
    return 0;
  });

  listElement.innerHTML = "";
  playerEntries.forEach(([uid, player]) => {
    const row = document.createElement("li");
    row.className = "online-lobby-player-row";
    if (uid === myUid) row.classList.add("is-me");

    const name = document.createElement("span");
    name.className = "online-lobby-player-name";
    name.textContent = player.name + (uid === myUid ? "（あなた）" : "");
    row.appendChild(name);

    const badges = document.createElement("span");
    badges.className = "online-lobby-player-badges";
    if (player.isHost) {
      const hostBadge = document.createElement("span");
      hostBadge.className = "online-lobby-badge online-lobby-badge-host";
      hostBadge.textContent = "ホスト";
      badges.appendChild(hostBadge);
    }
    const statusBadge = document.createElement("span");
    statusBadge.className = player.rematchReady
      ? "online-lobby-badge online-lobby-badge-connected"
      : "online-lobby-badge online-lobby-badge-progress";
    statusBadge.textContent = player.rematchReady ? "準備OK" : "未準備";
    badges.appendChild(statusBadge);
    row.appendChild(badges);

    if (isHost && uid !== myUid) {
      const kickButton = document.createElement("button");
      kickButton.type = "button";
      kickButton.className = "online-lobby-mini-button online-lobby-mini-button-danger";
      kickButton.textContent = "キック";
      kickButton.dataset.rematchKickUid = uid;
      kickButton.dataset.rematchKickName = player.name;
      row.appendChild(kickButton);
    }

    listElement.appendChild(row);
  });
}

// 【2026-09-05新設・本人指示：OS標準confirmから独自モーダルへ】再戦準備フェーズの
// キック確認も、ロビーのキック確認（js/onlineBattleScreen.js参照）と同じ理由で、
// アプリ独自のモーダルへ変更する。4つの結果画面（共有エンジン・歌詞クイズ・一瞬バトル・
// 一瞬協力）すべてが同じ意味の操作を持つため、モーダル自体はDOM上に1つだけ用意し
// （index.htmlの#online-battle-rematch-kick-confirm-modal）、この中立ファイルが
// 配線を一度だけ行う。どの画面から開いても、確定時にその画面が渡したkickPlayerFn・roomIdが
// 正しく使われるよう、保留状態（pendingRematchKick）に呼び出し元の情報をまとめて持たせる。
const rematchKickModalElement = document.getElementById("online-battle-rematch-kick-confirm-modal");
const rematchKickMessageElement = document.getElementById("online-battle-rematch-kick-confirm-message");
const rematchKickCancelButtonElement = document.getElementById("online-battle-rematch-kick-cancel-button");
const rematchKickConfirmButtonElement = document.getElementById("online-battle-rematch-kick-confirm-button");

let pendingRematchKick = null; // { roomId, targetUid, kickPlayerFn, playConfirmSfx } | null

function closeRematchKickModal() {
  if (rematchKickModalElement) rematchKickModalElement.hidden = true;
  pendingRematchKick = null;
}

rematchKickCancelButtonElement?.addEventListener("click", closeRematchKickModal);
rematchKickModalElement?.addEventListener("click", (event) => {
  if (event.target === rematchKickModalElement) closeRematchKickModal();
});
rematchKickConfirmButtonElement?.addEventListener("click", async () => {
  // 【二重確定防止】pendingが無い・処理中（disabled）なら何もしない。
  if (!pendingRematchKick || rematchKickConfirmButtonElement.disabled) return;
  const { roomId, targetUid, kickPlayerFn, playConfirmSfx } = pendingRematchKick;
  pendingRematchKick = null;
  if (rematchKickModalElement) rematchKickModalElement.hidden = true;
  playConfirmSfx?.();
  rematchKickConfirmButtonElement.disabled = true;
  await kickPlayerFn({ roomId, targetUid });
  rematchKickConfirmButtonElement.disabled = false;
});

// 上のrenderRematchReadinessList()が出すキックボタンのクリックを、リスト全体への1つの
// イベント委任で受け取るための共通ハンドラを作る工場関数。roomIdGetterは「今のroomId」を
// 返す関数（各結果画面が自分のcurrentRoomId/latestRoom.roomIdを渡す）、kickPlayerFnは
// js/onlineBattle.jsのkickPlayer()をそのまま渡す想定。
export function createRematchKickHandler({ getRoomId, kickPlayerFn, playConfirmSfx }) {
  return function handleRematchKickClick(event) {
    const kickButton = event.target.closest("[data-rematch-kick-uid]");
    const roomId = getRoomId();
    if (!kickButton || !roomId) return;
    const targetUid = kickButton.dataset.rematchKickUid;
    const targetName = kickButton.dataset.rematchKickName ?? "このプレイヤー";
    pendingRematchKick = { roomId, targetUid, kickPlayerFn, playConfirmSfx };
    if (rematchKickMessageElement) {
      rematchKickMessageElement.textContent = `${targetName}さんをこのルームから退出させます。今回の再戦には参加できません。`;
    }
    if (rematchKickModalElement) rematchKickModalElement.hidden = false;
  };
}
