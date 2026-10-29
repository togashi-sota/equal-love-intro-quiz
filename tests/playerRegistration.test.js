// 【2026-10-29新設】プレイヤーの登録画面（js/playerScreen.js・js/playerProfile.js）のテスト。
// 本人の iPad での報告「どこで入力して、何がOKなのか分からない」「完了したら閉じてほしい」への直しを確かめる。
//   ・名前の確かめ方（空・長すぎ・重複・全角半角の違い）、保存できたかの確認、保存に失敗したときの取り消し
//   ・画面：登録の成功 → 使用中・ホームの名前・「○○さんを登録しました」・自動で閉じる・二重押しを防ぐ
//   ・失敗：閉じない・理由を出す・入力を残す。日本語の変換を確定する Enter では登録しない
//   ・既存の人を押す → 切り替えて閉じる。✎ → 名前だけ変わる（新しい人を作らない・playerId はそのまま）
// テストの前後で players 一覧・使用中の人を元に戻す（端末の本当のデータを残さない）。
import {
  getPlayers,
  getActivePlayerId,
  DEFAULT_PLAYER_ID,
  validatePlayerName,
  normalizePlayerNameForCompare,
  registerNewPlayer,
  switchToPlayer,
  renamePlayerVerified,
  isPlayerSavedToStorage,
  PLAYER_NAME_MAX_LENGTH,
  clearPlayersCacheForTest,
} from "../js/playerProfile.js";
import { initPlayerScreen, PLAYER_MODAL_AUTO_CLOSE_MS } from "../js/playerScreen.js";
import { MEMBERS } from "../js/data/members.js";
import { assertEqual } from "./test-utils.js";

const PLAYERS_KEY = "equalLoveIntroQuiz.players";
const ACTIVE_KEY = "equalLoveIntroQuiz.activePlayerId";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// players 一覧をテスト用の中身にする（playerProfile.js のキャッシュも捨てて読み直させる）
function seedPlayers(players, activeId) {
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
  localStorage.setItem(ACTIVE_KEY, activeId);
  clearPlayersCacheForTest();
}

function buildFixture() {
  const root = document.createElement("div");
  root.hidden = true;
  root.innerHTML = `
    <button id="t-player-chip" type="button"><span id="t-player-chip-text"></span></button>
    <span id="t-swatch"></span>
    <button id="t-oshi-chip" type="button"><span id="t-oshi-chip-text"></span></button>
    <div id="t-player-modal" class="modal-overlay" hidden>
      <div class="modal-card">
        <button id="t-player-close" class="modal-close-button" type="button">×</button>
        <div id="t-player-list" class="player-list"></div>
        <p id="t-unnamed-note" class="player-unnamed-note" hidden></p>
        <input id="t-player-add-input" type="text" maxlength="20">
        <p id="t-player-add-message" class="player-add-message" hidden></p>
        <button id="t-player-add-button" class="primary-button" type="button">この名前で登録</button>
        <p id="t-storage"></p>
      </div>
    </div>
    <div id="t-delete-modal" class="modal-overlay" hidden>
      <button id="t-delete-cancel" type="button">キャンセル</button>
      <button id="t-delete-confirm" type="button">削除する</button>
    </div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector(`#${id}`);
  let changedCount = 0;
  const elements = {
    playerHeroSwatch: $("t-swatch"),
    playerNameChip: $("t-player-chip"),
    playerNameChipText: $("t-player-chip-text"),
    oshiSummaryChip: $("t-oshi-chip"),
    oshiSummaryChipText: $("t-oshi-chip-text"),
    playerModal: $("t-player-modal"),
    playerModalCloseButton: $("t-player-close"),
    playerList: $("t-player-list"),
    playerUnnamedNote: $("t-unnamed-note"),
    playerAddInput: $("t-player-add-input"),
    playerAddButton: $("t-player-add-button"),
    playerAddMessage: $("t-player-add-message"),
    playerDeleteConfirmModal: $("t-delete-modal"),
    playerDeleteCancelButton: $("t-delete-cancel"),
    playerDeleteConfirmButton: $("t-delete-confirm"),
    storageStatusText: $("t-storage"),
    onSelectOshiSummary: () => {},
    onPlayerChanged: () => {
      changedCount += 1;
    },
  };
  return { root, elements, $, changed: () => changedCount };
}

function pressEnter(input, { composing = false } = {}) {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: composing });
  input.dispatchEvent(event);
  return event;
}

export async function runPlayerRegistrationTests() {
  const savedPlayers = localStorage.getItem(PLAYERS_KEY);
  const savedActive = localStorage.getItem(ACTIVE_KEY);
  const baseTime = "2026-10-01T00:00:00.000Z";
  const base = { playerId: DEFAULT_PLAYER_ID, playerName: "テスト本人", createdAt: baseTime, updatedAt: baseTime, backupId: "test-backup-id-default" };
  const fixture = buildFixture();
  try {
    // ---- 名前の確かめ方（純粋関数） ----
    const players = [base, { playerId: "p2", playerName: "ＡＢＣ", createdAt: baseTime, updatedAt: baseTime }];
    assertEqual(validatePlayerName("", players).reason, "empty", "登録：空の名前は empty");
    assertEqual(validatePlayerName("   ", players).reason, "empty", "登録：空白だけの名前も empty");
    assertEqual(validatePlayerName("あ".repeat(PLAYER_NAME_MAX_LENGTH + 1), players).reason, "too-long", "登録：21文字は too-long");
    assertEqual(validatePlayerName("あ".repeat(PLAYER_NAME_MAX_LENGTH), players).ok, true, "登録：20文字ちょうどは使える");
    assertEqual(validatePlayerName(" テスト本人 ", players).reason, "duplicate", "登録：前後の空白だけ違う名前は重複");
    assertEqual(validatePlayerName("abc", players).reason, "duplicate", "登録：全角・半角・大文字小文字だけ違う名前も重複");
    assertEqual(validatePlayerName("テスト本人", players, { exceptPlayerId: DEFAULT_PLAYER_ID }).ok, true, "名前の変更：自分の今の名前とは重複扱いにしない");
    assertEqual(validatePlayerName("新しい人", [{ playerId: DEFAULT_PLAYER_ID, playerName: "" }]).ok, true, "登録：名前の無い最初の人とは重複にならない");
    assertEqual(validatePlayerName(" 新しい人 ", players).name, "新しい人", "登録：前後の空白は除いて保存する");
    assertEqual(normalizePlayerNameForCompare("Ｓｏｕｔａ "), "souta", "名前の比べ方：NFKC・小文字・前後の空白");
    assertEqual(validatePlayerName("テスト本人", players).message.includes("一覧の名前を押すと"), true, "重複の理由に「一覧から選べば切り替わる」ことを書く");

    // ---- 登録の関数：保存を確かめ、既存の人を書き換えない ----
    seedPlayers([base], DEFAULT_PLAYER_ID);
    assertEqual(getPlayers().length, 1, "準備：テスト用の1人だけになっている");
    const registered = registerNewPlayer("登録テスト");
    assertEqual(registered.ok, true, "registerNewPlayer：成功");
    assertEqual(isPlayerSavedToStorage(registered.player.playerId, "登録テスト"), true, "registerNewPlayer：保存場所に本当に入っている");
    assertEqual(getActivePlayerId(), registered.player.playerId, "registerNewPlayer：新しい人が使用中になる");
    assertEqual(localStorage.getItem(ACTIVE_KEY), registered.player.playerId, "registerNewPlayer：使用中も保存されている");
    assertEqual(JSON.parse(localStorage.getItem(PLAYERS_KEY))[0], base, "registerNewPlayer：既存の人（playerId・名前・backupId・日時）は1文字も変わらない");
    assertEqual(registerNewPlayer("登録テスト").reason, "duplicate", "registerNewPlayer：同じ名前の2回目は重複で止まる（二重登録しない）");
    assertEqual(getPlayers().length, 2, "registerNewPlayer：重複で止まったとき人は増えない");

    // 保存に失敗したとき：取り消して、一覧にも残さない
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === PLAYERS_KEY) throw new Error("テスト：容量いっぱい");
      return originalSetItem.call(this, key, value);
    };
    let failed;
    try {
      failed = registerNewPlayer("保存できない人");
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
    assertEqual(failed.reason, "save-failed", "registerNewPlayer：保存できなければ save-failed");
    assertEqual(getPlayers().some((p) => p.playerName === "保存できない人"), false, "保存に失敗した人は一覧に残らない（キャッシュも取り消す）");
    assertEqual(getActivePlayerId(), registered.player.playerId, "保存に失敗しても、使用中の人は変わらない");

    // 切り替え・名前の変更
    assertEqual(switchToPlayer(DEFAULT_PLAYER_ID).ok, true, "switchToPlayer：既存の人に切り替えられる");
    assertEqual(getActivePlayerId(), DEFAULT_PLAYER_ID, "switchToPlayer：使用中が変わる");
    assertEqual(switchToPlayer("no-such-player").reason, "not-found", "switchToPlayer：いない人には切り替えない");
    assertEqual(renamePlayerVerified(DEFAULT_PLAYER_ID, "登録テスト").reason, "duplicate", "名前の変更：他の人と同じ名前にはしない");
    assertEqual(renamePlayerVerified(DEFAULT_PLAYER_ID, "").reason, "empty", "名前の変更：空にはしない（今までは黙って元の名前に戻していた）");
    const countBeforeRename = getPlayers().length;
    assertEqual(renamePlayerVerified(DEFAULT_PLAYER_ID, "テスト本人改").ok, true, "名前の変更：成功");
    const renamed = getPlayers().find((p) => p.playerId === DEFAULT_PLAYER_ID);
    assertEqual([renamed.playerName, renamed.backupId, renamed.createdAt], ["テスト本人改", base.backupId, base.createdAt], "名前の変更：名前だけが変わり、playerId・backupId・作った日時はそのまま");
    assertEqual(getPlayers().length, countBeforeRename, "名前の変更：新しいプレイヤーを作らない");

    // ---- 画面 ----
    seedPlayers([base], DEFAULT_PLAYER_ID);
    const { elements, $ } = fixture;
    initPlayerScreen(elements, MEMBERS);
    const modal = elements.playerModal;
    const input = elements.playerAddInput;
    const button = elements.playerAddButton;
    const message = elements.playerAddMessage;
    assertEqual(elements.playerNameChipText.textContent, "テスト本人", "画面：ホームの名前に今の人が出る");
    elements.playerNameChip.click();
    assertEqual(modal.hidden, false, "画面：名前を押すとプレイヤーのモーダルが開く");
    assertEqual([button.textContent, button.disabled, message.hidden], ["この名前で登録", false, true], "画面：開いたとき、ボタンは「この名前で登録」・理由は出ていない");
    assertEqual(
      [...elements.playerList.querySelectorAll(".player-row-text-button.is-rename")].map((b) => b.textContent),
      ["✎ 名前を変える"],
      "画面：✎ は「✎ 名前を変える」と文字で出す"
    );

    // 空で押す → 閉じない・理由
    input.value = "";
    button.click();
    assertEqual([modal.hidden, message.hidden, message.classList.contains("is-error")], [false, false, true], "空：閉じずに理由を出す");
    assertEqual(message.textContent, "名前を入力してください。", "空：理由の文");
    // 重複 → 閉じない・入力を残す
    input.value = "テスト本人";
    button.click();
    assertEqual([modal.hidden, input.value, message.textContent.includes("もう登録されています")], [false, "テスト本人", true], "重複：閉じない・入力を残す・理由を出す");
    assertEqual(input.getAttribute("aria-invalid"), "true", "重複：欄に aria-invalid を付ける（読み上げにも伝える）");
    input.dispatchEvent(new Event("input"));
    assertEqual([message.hidden, input.hasAttribute("aria-invalid")], [true, false], "打ち直し始めたら理由を消す");
    // 長すぎ（貼り付け等で maxlength を超えた場合）
    input.value = "い".repeat(PLAYER_NAME_MAX_LENGTH + 3);
    button.click();
    assertEqual([modal.hidden, message.textContent.includes("20文字まで")], [false, true], "長すぎ：閉じずに理由を出す");
    assertEqual(getPlayers().length, 1, "失敗が続いても、人は1人も増えていない（入力中・失敗では作らない）");

    // 日本語の変換を確定する Enter では登録しない
    input.value = "変換中の名前";
    pressEnter(input, { composing: true });
    assertEqual(getPlayers().length, 1, "変換の確定の Enter（isComposing）では登録しない");

    // Enter で登録 → 成功
    input.value = " テスト新人 ";
    const changedBefore = fixture.changed();
    const enterEvent = pressEnter(input);
    assertEqual(enterEvent.defaultPrevented, true, "Enter：登録に使い、他の Enter の操作（スタート等）へは伝えない");
    const afterAdd = getPlayers();
    const newcomer = afterAdd.find((p) => p.playerName === "テスト新人");
    assertEqual([afterAdd.length, Boolean(newcomer)], [2, true], "Enter で登録できる（前後の空白は除く）");
    assertEqual(getActivePlayerId(), newcomer.playerId, "成功：新しい人が使用中になる");
    assertEqual(elements.playerNameChipText.textContent, "テスト新人", "成功：ホームの名前がすぐ変わる");
    assertEqual(fixture.changed(), changedBefore + 1, "成功：他の画面（自己ベスト等）にも1回だけ知らせる");
    assertEqual([button.disabled, button.textContent, input.disabled], [true, "✓ 登録しました", true], "成功：ボタンを押せなくして「✓ 登録しました」");
    assertEqual(message.textContent.startsWith("✓ テスト新人さんを登録しました"), true, "成功：「○○さんを登録しました」を出す");
    assertEqual(modal.hidden, false, "成功の直後はまだ開いている（結果を読めるだけ見せる）");
    assertEqual(
      elements.playerList.querySelector(".player-row.is-active .player-row-name")?.textContent,
      "テスト新人",
      "成功：一覧の「使用中」も新しい人に移る"
    );
    // 二重押し
    button.disabled = false; // 押せなくしていても、念のため関数の側でも止まることを確かめる
    button.click();
    pressEnter(input);
    assertEqual(getPlayers().length, 2, "二重押し：閉じるまでの間に押しても、もう1人は作らない");
    await wait(PLAYER_MODAL_AUTO_CLOSE_MS + 200);
    assertEqual(modal.hidden, true, "成功：自動で閉じる");
    const toast = document.querySelector(".player-toast");
    assertEqual([toast?.hidden, toast?.textContent], [false, "テスト新人さんを登録しました"], "閉じたあと「○○さんを登録しました」を短く出す");
    assertEqual(toast?.getAttribute("role"), "status", "知らせは読み上げにも伝わる（role=status）");

    // 開き直すと欄は空・ボタンは元どおり
    elements.playerNameChip.click();
    assertEqual([input.value, input.disabled, button.disabled, button.textContent, message.hidden], ["", false, false, "この名前で登録", true], "開き直すと登録の欄は元どおり");

    // 既存の人を押す → 切り替えて閉じる
    const defaultRowButton = [...elements.playerList.querySelectorAll(".player-row-switch-button")].find((b) => b.textContent.includes("テスト本人"));
    assertEqual(defaultRowButton?.textContent.includes("切り替える"), true, "使用中でない人には「切り替える」の印");
    defaultRowButton.click();
    assertEqual(getActivePlayerId(), DEFAULT_PLAYER_ID, "既存の人を押すと切り替わる");
    assertEqual(elements.playerNameChipText.textContent, "テスト本人", "切り替え：ホームの名前も変わる");
    await wait(PLAYER_MODAL_AUTO_CLOSE_MS + 200);
    assertEqual([modal.hidden, getPlayers().length], [true, 2], "切り替え：閉じる・人は増えない");

    // ✎ → 名前だけ変える
    elements.playerNameChip.click();
    const renameButton = [...elements.playerList.querySelectorAll(".player-row-text-button.is-rename")][0];
    renameButton.click();
    const renameInput = elements.playerList.querySelector(".player-row-rename-input");
    assertEqual(Boolean(renameInput), true, "✎：名前の欄が出る");
    assertEqual(elements.playerList.querySelector(".player-row-rename-hint")?.textContent.includes("新しいプレイヤーは作りません"), true, "✎：その場で何が起きるかを書く");
    renameInput.value = "テスト新人";
    pressEnter(renameInput);
    assertEqual([modal.hidden, getPlayers()[0].playerName], [false, "テスト本人"], "✎：他の人と同じ名前は閉じずに断る（名前は変わらない）");
    renameInput.value = "テスト本人２";
    pressEnter(renameInput);
    const afterRename = getPlayers();
    assertEqual([afterRename.length, afterRename[0].playerId, afterRename[0].playerName], [2, DEFAULT_PLAYER_ID, "テスト本人２"], "✎：名前だけ変わる（新しい人を作らない・playerId はそのまま）");
    assertEqual(afterRename[1].playerName, "テスト新人", "✎：他の人の名前は変わらない");
    await wait(PLAYER_MODAL_AUTO_CLOSE_MS + 200);
    assertEqual(modal.hidden, true, "✎：保存できたら閉じる");

    // ✎ → やめる
    elements.playerNameChip.click();
    elements.playerList.querySelector(".player-row-text-button.is-rename").click();
    elements.playerList.querySelector(".player-row-text-button.is-cancel").click();
    assertEqual([Boolean(elements.playerList.querySelector(".player-row-rename-input")), modal.hidden], [false, false], "✎ → やめる：一覧に戻る（閉じない）");
    // 日本語の変換を Esc で取り消しただけでは閉じない・入力を消さない
    input.value = "変換中";
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true }));
    assertEqual([modal.hidden, input.value], [false, "変換中"], "変換中の Esc：閉じない・入力を消さない");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assertEqual([modal.hidden, input.value], [true, ""], "ふつうの Esc：閉じる");
    // 名前の変更の途中に別の人へ切り替えても、変更中の欄が残らない
    elements.playerNameChip.click();
    elements.playerList.querySelector(".player-row-text-button.is-rename").click();
    const otherSwitch = [...elements.playerList.querySelectorAll(".player-row-switch-button")].find((b) => !b.textContent.includes("使用中"));
    otherSwitch.click();
    assertEqual(Boolean(elements.playerList.querySelector(".player-row-rename-input")), false, "名前の変更の途中に切り替えたら、変更はやめる（元の名前の欄が残らない）");
    await wait(PLAYER_MODAL_AUTO_CLOSE_MS + 200);
    assertEqual(modal.hidden, true, "その切り替えのあとも自動で閉じる");
    // 他の画面の処理が例外を出しても、自動で閉じる
    const originalChanged = elements.onPlayerChanged;
    elements.onPlayerChanged = () => {
      throw new Error("テスト：他の画面の更新に失敗");
    };
    elements.playerNameChip.click();
    [...elements.playerList.querySelectorAll(".player-row-switch-button")].find((b) => !b.textContent.includes("使用中")).click();
    await wait(PLAYER_MODAL_AUTO_CLOSE_MS + 200);
    assertEqual(modal.hidden, true, "他の画面の更新で例外が出ても、閉じられなくならない");
    elements.onPlayerChanged = originalChanged;
    elements.playerNameChip.click();
    elements.playerModalCloseButton.click();
    assertEqual(modal.hidden, true, "× で閉じる");

    // 名前の無い最初の人：「名前を付けるだけなら ✎」の案内を出し、✎ の文字も「名前を付ける」にする
    elements.playerNameChip.click();
    assertEqual(elements.playerUnnamedNote.hidden, true, "名前のある人が使用中のときは、名前を付ける案内を出さない");
    elements.playerModalCloseButton.click();
    seedPlayers([{ ...base, playerName: "" }], DEFAULT_PLAYER_ID);
    elements.playerNameChip.click();
    assertEqual(elements.playerUnnamedNote.hidden, false, "名前の無い人が使用中のときは「✎ 名前を付ける」の案内を出す（別の人を作ってしまう混同を防ぐ）");
    assertEqual(elements.playerList.querySelector(".player-row-text-button.is-rename")?.textContent, "✎ 名前を付ける", "名前の無い人の ✎ は「名前を付ける」");
    elements.playerList.querySelector(".player-row-text-button.is-rename").click();
    assertEqual(elements.playerUnnamedNote.hidden, true, "名前を付けている間は案内を隠す");
    const firstNameInput = elements.playerList.querySelector(".player-row-rename-input");
    firstNameInput.value = "はじめての名前";
    pressEnter(firstNameInput);
    assertEqual([getPlayers().length, getPlayers()[0].playerId, getPlayers()[0].playerName], [1, DEFAULT_PLAYER_ID, "はじめての名前"], "初めての名前：最初の人の名前になる（新しい人は作らない）");
    await wait(PLAYER_MODAL_AUTO_CLOSE_MS + 200);
    assertEqual(elements.playerNameChipText.textContent, "はじめての名前", "初めての名前：ホームの名前に出る");
    seedPlayers([base, { ...newcomer }], DEFAULT_PLAYER_ID);

    // 画面：保存に失敗したとき
    elements.playerNameChip.click();
    input.value = "容量いっぱいの人";
    Storage.prototype.setItem = function (key, value) {
      if (key === PLAYERS_KEY) throw new Error("テスト：容量いっぱい");
      return originalSetItem.call(this, key, value);
    };
    try {
      button.click();
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
    assertEqual([modal.hidden, input.value, message.textContent.includes("保存できませんでした")], [false, "容量いっぱいの人", true], "保存の失敗：閉じない・入力を残す・理由を出す");
    assertEqual(getPlayers().length, 2, "保存の失敗：一覧に増えない");
    elements.playerModalCloseButton.click();
  } finally {
    fixture.root.remove();
    document.querySelector(".player-toast")?.remove();
    if (savedPlayers === null) localStorage.removeItem(PLAYERS_KEY);
    else localStorage.setItem(PLAYERS_KEY, savedPlayers);
    if (savedActive === null) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, savedActive);
    clearPlayersCacheForTest();
  }
}
