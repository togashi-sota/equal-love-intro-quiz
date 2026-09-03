// オリジナル問題作成モードのプリセット一覧画面を担当するファイル。
// 保存済みのセット（名前・メモ・曲数・ダミー選択肢モード）を並べ、タップすると
// 選曲画面がその内容で開く。「＋ 新しいセットを作る」からは、空の選曲画面を開ける。
// 各プリセットの「収録曲を見る」からは、シングル単位の全曲名を確認できる詳細モーダルを開ける
// （中身がプリセットごとに変わる動的なモーダルのため、開閉・描画ともにこのファイルで完結させる）。
// 保存データの読み込み自体はcustomQuizPresets.jsに任せ、ここでは画面の組み立てだけを行う。

import { SONGS } from "./data/songs.js";
import { buildSongGroups } from "./songlist.js";
import { getPresets, CUSTOM_QUIZ_TYPE } from "./customQuizPresets.js";
// この画面内だけで完結する操作（削除確認モーダル・詳細モーダルの開閉）に効果音を鳴らすため追加。
import { SFX_EVENTS, playSfx } from "./soundManager.js";

// ダミー選択肢モードの表示ラベル。プリセットカード・詳細モーダルに添える。
// 【2026-11-XX修正・仕様総監査で発見】2026-10-01の改訂で、distractorModeの値が
// 「選択した曲だけ／全収録曲」（selected/all）から、カテゴリー3択
// （title-track/title-and-group/all、index.html:4530-4532参照）へ変わったが、
// このラベル表だけ旧仕様のまま取り残されていた。プリセット一覧・詳細モーダルに
// 内部コード値（"title-track"等）がそのまま表示されてしまう表示バグだったため、
// 実際の選択肢と同じ文言へ揃える。
const DISTRACTOR_MODE_LABELS = { "title-track": "表題曲のみ", "title-and-group": "表題曲＋全員曲", all: "全曲" };
// 歌詞クイズタイプの回答候補数の表示ラベル。js/lyricsQuizEngine.jsのANSWER_POOL_SIZE_VALUESと
// 同じ値の並び（このファイルはFirebase同様、歌詞クイズ関連ファイルへの依存を増やしたくないため、
// 表示ラベルだけこちらにも軽量に複製している。値自体の一覧はlyricsQuizEngine.js側が正）。
const ANSWER_POOL_SIZE_LABELS = { 4: "4択", 10: "10択", 30: "30択", 50: "50択", all: "全曲検索" };

// 【2026-08-29追加、本人指示（⑭）】今この画面が対象にしているオリジナル問題の種類。
// js/main.jsのcustom-quiz-type-select-screenで選ばれた種類がここに反映され、
// 一覧に出すプリセットの絞り込み・見た目の表示に使う。
let currentQuizType = CUSTOM_QUIZ_TYPE.INTRO;

export function setCustomQuizPresetsType(quizType) {
  currentQuizType = quizType;
}

export function getCustomQuizPresetsType() {
  return currentQuizType;
}

const QUIZ_TYPE_EYEBROW_LABELS = {
  [CUSTOM_QUIZ_TYPE.INTRO]: "ORIGINAL QUIZ・イントロ",
  [CUSTOM_QUIZ_TYPE.RANDOM_PLAYBACK]: "ORIGINAL QUIZ・ランダム再生",
  [CUSTOM_QUIZ_TYPE.LYRICS_QUIZ]: "ORIGINAL QUIZ・歌詞クイズ",
  // 2026-08-30追加、本人指示：アウトロクイズタイプ・一瞬チャレンジタイプ（後半②）。
  [CUSTOM_QUIZ_TYPE.OUTRO_QUIZ]: "ORIGINAL QUIZ・アウトロ",
  [CUSTOM_QUIZ_TYPE.INSTANT_CHALLENGE]: "ORIGINAL QUIZ・一瞬",
};

// プリセットカード・詳細モーダルに表示する「◯曲・◯◯」の内訳。歌詞クイズタイプは
// ダミー選択肢モードではなく回答候補数を、一瞬チャレンジタイプは再生時間＋回答候補数を
// 表示する（本人指示：それぞれの種類に合った情報を出す。2026-08-30追加：一瞬チャレンジ）。
function buildPresetSummaryText(preset) {
  if (preset.quizType === CUSTOM_QUIZ_TYPE.LYRICS_QUIZ) {
    const answerPoolLabel = ANSWER_POOL_SIZE_LABELS[preset.answerPoolSizeValue] ?? preset.answerPoolSizeValue;
    return `${preset.songIds.length}曲・${answerPoolLabel}`;
  }
  if (preset.quizType === CUSTOM_QUIZ_TYPE.INSTANT_CHALLENGE) {
    const answerPoolLabel = ANSWER_POOL_SIZE_LABELS[preset.answerPoolSizeValue] ?? preset.answerPoolSizeValue;
    return `${preset.songIds.length}曲・${preset.playDurationValue}秒・${answerPoolLabel}`;
  }
  const distractorLabel = DISTRACTOR_MODE_LABELS[preset.distractorMode] ?? preset.distractorMode;
  return `${preset.songIds.length}曲・${distractorLabel}`;
}

// この画面が使うDOM要素一式。initCustomQuizPresetsScreen()で受け取って保持する。
let elements = null;

// 今の検索語。画面を離れて戻ってきても保持したままにする
// （編集のために一覧を離れた場合、絞り込みが解除されていると探し直しになるため）。
let searchQuery = "";

// 一覧カードから直接削除しようとしているプリセット（確認モーダルを閉じている間はnull）。
// 編集画面側の削除確認モーダル（customQuizScreen.js）とは別に、この画面専用で持つ
// （同じモーダルを2箇所から操作すると、削除対象の取り違えが起きかねないため）。
// idだけでなくプリセット全体を保持し、削除完了バナーにセット名をそのまま使えるようにしている。
let pendingDeletePreset = null;

// 保存完了バナーを自動で隠すためのタイマーID。連続保存で古いタイマーが後から発火して
// 表示中のバナーを消してしまわないよう、新しく表示するたびに前のタイマーを解除する。
let savedBannerHideTimeoutId = null;

// 検索用に文字列を正規化する。今の規模（個人が作る数十件程度）を踏まえ、
// 大文字/小文字・全角/半角数字の統一だけを行うシンプルな一致判定にしている
// （ひらがな/カタカナの相互変換までは行わない）。
function normalizeForSearch(text) {
  return text
    .toLowerCase()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

// セット名・メモを対象に検索語と一致するか判定する。
function matchesSearchQuery(preset, query) {
  if (query === "") return true;
  const haystack = normalizeForSearch(`${preset.name} ${preset.memo}`);
  return haystack.includes(normalizeForSearch(query));
}

// 「タップで進める」ことを示すシェブロンアイコンを1つ作る（他のカードと共通の部品）。
function createChevron() {
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("class", "special-mode-card-chevron");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("fill", "none");
  chevron.setAttribute("aria-hidden", "true");
  const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  chevronPath.setAttribute("d", "M9 5 16 12 9 19");
  chevronPath.setAttribute("stroke", "currentColor");
  chevronPath.setAttribute("stroke-width", "2.4");
  chevronPath.setAttribute("stroke-linecap", "round");
  chevronPath.setAttribute("stroke-linejoin", "round");
  chevron.appendChild(chevronPath);
  return chevron;
}

// 「＋ 新しいセットを作る」カード。特別モード一覧のカードと同じ見た目・構造を流用する。
function buildNewPresetCard() {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "special-mode-card";
  card.addEventListener("click", () => elements.onCreateNew());

  const content = document.createElement("div");
  content.className = "special-mode-card-content";

  const title = document.createElement("p");
  title.className = "special-mode-card-title";
  title.textContent = "＋ 新しいセットを作る";
  content.appendChild(title);

  card.appendChild(content);
  card.appendChild(createChevron());
  return card;
}

// ゴミ箱アイコン（一覧カードからの直接削除ボタン用）。
function createTrashIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML =
    '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-8 0 1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  return icon;
}

// 複製アイコン（一覧カードからの直接複製ボタン用）。
function createCopyIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML =
    '<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  return icon;
}

// 保存済みプリセット1件分のカード。
// 「タップで選曲・編集画面を開く」メインボタン、「複製」（コピーアイコン）、「削除」（ゴミ箱アイコン）、
// 「▶ プレイ」（すぐ開始）、「収録曲を見る」（詳細モーダル）を、それぞれ独立した兄弟要素として
// 分けている（ボタンの中にボタンを入れることはHTML上できないため、誤操作の防止もかねている）。
// 複製・削除のアイコンは他の2つより小さく・控えめにし、誤って押しにくいようにしている。
// 並び順は「メイン→複製→削除」とし、取り消しの効かない削除を一番右に置くことで、
// 右から左に読む視線の流れでも複製と間違えて削除を押しにくいようにしている。
function buildPresetCard(preset) {
  const wrapper = document.createElement("div");
  wrapper.className = "preset-card";

  const topRow = document.createElement("div");
  topRow.className = "preset-card-top";

  // 【二重再生防止】mainButton/copyIconButton/playButtonは、それぞれelements.onSelectPreset /
  // onDuplicatePreset / onPlayPreset（main.js側）の先頭で既にplaySfx(UI_CLICK)相当の
  // playClickSound()が鳴っているため、ここでは重ねて鳴らさない。
  const mainButton = document.createElement("button");
  mainButton.type = "button";
  mainButton.className = "preset-card-main";
  mainButton.addEventListener("click", () => elements.onSelectPreset(preset));

  const content = document.createElement("div");
  content.className = "special-mode-card-content";

  const title = document.createElement("p");
  title.className = "special-mode-card-title";
  title.textContent = preset.name;
  content.appendChild(title);

  const description = document.createElement("p");
  description.className = "special-mode-card-description";
  description.textContent = buildPresetSummaryText(preset);
  content.appendChild(description);

  // メモは一覧では1行に省略する（はみ出す分はCSSの text-overflow:ellipsis で「…」にする）。
  // 全文は「収録曲を見る」の詳細モーダルで確認できる。
  if (preset.memo) {
    const memo = document.createElement("p");
    memo.className = "preset-card-memo";
    memo.textContent = preset.memo;
    content.appendChild(memo);
  }

  mainButton.appendChild(content);
  mainButton.appendChild(createChevron());

  const copyIconButton = document.createElement("button");
  copyIconButton.type = "button";
  copyIconButton.className = "preset-card-icon-button preset-card-copy-icon";
  copyIconButton.setAttribute("aria-label", `「${preset.name}」を複製`);
  copyIconButton.appendChild(createCopyIcon());
  copyIconButton.addEventListener("click", () => elements.onDuplicatePreset(preset));

  const deleteIconButton = document.createElement("button");
  deleteIconButton.type = "button";
  deleteIconButton.className = "preset-card-icon-button preset-card-delete-icon";
  deleteIconButton.setAttribute("aria-label", `「${preset.name}」を削除`);
  deleteIconButton.appendChild(createTrashIcon());
  deleteIconButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openListDeleteConfirmModal(preset);
  });

  topRow.appendChild(mainButton);
  topRow.appendChild(copyIconButton);
  topRow.appendChild(deleteIconButton);

  const actionsRow = document.createElement("div");
  actionsRow.className = "preset-card-actions";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "preset-card-play-button";
  playButton.textContent = "▶ プレイ";
  playButton.addEventListener("click", () => elements.onPlayPreset(preset));

  const detailButton = document.createElement("button");
  detailButton.type = "button";
  detailButton.className = "preset-card-detail-link";
  detailButton.textContent = "収録曲を見る";
  detailButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openPresetDetailModal(preset);
  });

  actionsRow.appendChild(playButton);
  actionsRow.appendChild(detailButton);

  wrapper.appendChild(topRow);
  wrapper.appendChild(actionsRow);
  return wrapper;
}

// 画面を開くたびに呼び、最新の保存内容・今の検索語で一覧を描画し直す
// （プリセットを保存した直後にこの画面へ戻ってきたときも、必ず反映されるようにするため）。
// 「＋新しいセットを作る」は検索語に関わらず常に先頭に表示する（検索対象にしない）。
export function renderCustomQuizPresetsScreen() {
  // 【2026-08-29追加、本人指示（⑭)】今選ばれている種類のプリセットだけを対象にする
  // （後方互換：quizTypeを持たない旧プリセットはgetPresets()側で自動的にintro扱いになっているため、
  // 既存ユーザーの保存済みセットは「イントロクイズ」タブに今までどおり表示され続ける）。
  if (elements.eyebrowLabel) {
    elements.eyebrowLabel.textContent = QUIZ_TYPE_EYEBROW_LABELS[currentQuizType] ?? "ORIGINAL QUIZ";
  }
  const presets = getPresets().filter((preset) => preset.quizType === currentQuizType);
  const filteredPresets = presets.filter((preset) => matchesSearchQuery(preset, searchQuery));

  elements.listContainer.innerHTML = "";
  elements.listContainer.appendChild(buildNewPresetCard());
  filteredPresets.forEach((preset) => {
    elements.listContainer.appendChild(buildPresetCard(preset));
  });

  elements.emptyState.hidden = filteredPresets.length > 0;
  if (filteredPresets.length === 0) {
    elements.emptyState.textContent =
      presets.length === 0
        ? "まだ保存されたセットがありません。「＋ 新しいセットを作る」から作成できます。"
        : `「${searchQuery}」に一致するセットが見つかりませんでした`;
  }
}

// ===== プリセット詳細モーダル（収録曲の確認） =====
// 中身がプリセットごとに変わる動的なモーダルなので、開閉・描画をこのファイルで完結させる
// （他の説明モーダルのようにmain.jsでは管理しない）。

function isPresetDetailModalOpen() {
  return elements !== null && !elements.detailModal.hidden;
}

function closePresetDetailModal() {
  elements.detailModal.hidden = true;
}

// シングル区分1つ分の、読み取り専用の曲名リストを作る。
// 2026-09-16改訂・本人指示：UI一貫性ルール（曲名は常にピンクのピル表示に統一）。
// 以前は装飾のない箇条書き（<ul><li>）だったが、js/onlineBattleScreen.jsの
// 共有曲一覧チップ（.online-battle-collab-song-chip）と同じ見た目のチップ列に揃えた。
function buildDetailGroupElement(group) {
  const groupElement = document.createElement("div");
  groupElement.className = "preset-detail-group";

  const label = document.createElement("p");
  label.className = "preset-detail-group-label";
  label.textContent = `${group.label}（${group.songs.length}曲）`;
  groupElement.appendChild(label);

  const list = document.createElement("div");
  list.className = "preset-detail-song-chip-list";
  group.songs.forEach((song) => {
    const chip = document.createElement("span");
    chip.className = "preset-detail-song-chip";
    chip.textContent = song.title;
    list.appendChild(chip);
  });
  groupElement.appendChild(list);

  return groupElement;
}

function openPresetDetailModal(preset) {
  elements.detailTitle.textContent = preset.name;

  elements.detailMemo.hidden = !preset.memo;
  elements.detailMemo.textContent = preset.memo;

  elements.detailSummary.textContent = buildPresetSummaryText(preset);

  // 開くたびにこのプリセットを対象として上書きする（onclickの代入なので、開くたびに
  // リスナーが増えていくことはない）。一覧カードの「▶ プレイ」と同じコールバックを使う。
  elements.detailPlayButton.onclick = () => {
    closePresetDetailModal();
    elements.onPlayPreset(preset);
  };

  const presetSongs = SONGS.filter((song) => preset.songIds.includes(song.id));
  const groups = buildSongGroups(presetSongs);
  elements.detailGroups.innerHTML = "";
  groups.forEach((group) => {
    elements.detailGroups.appendChild(buildDetailGroupElement(group));
  });

  elements.detailModal.hidden = false;
}

// ===== 一覧カードからの直接削除 =====
// 編集画面（customQuizScreen.js）にも同じ見た目の削除確認モーダルがあるが、
// あちらは「今開いている編集対象」を、こちらは「カードごとに違うプリセット」を対象にするため、
// 削除対象の取り違えを避ける目的で、あえてモーダル自体を分けて自己完結させている。

function isListDeleteConfirmModalOpen() {
  return elements !== null && !elements.listDeleteConfirmModal.hidden;
}

function openListDeleteConfirmModal(preset) {
  pendingDeletePreset = preset;
  elements.listDeleteConfirmModal.hidden = false;
}

function closeListDeleteConfirmModal() {
  elements.listDeleteConfirmModal.hidden = true;
  pendingDeletePreset = null;
}

function handleListDeleteConfirmed() {
  const preset = pendingDeletePreset;
  closeListDeleteConfirmModal();
  elements.onDeletePreset(preset);
}

// ===== 保存/更新/削除の完了バナー =====
// 「保存する」「上書き保存する」「削除する」で一覧画面に戻ってきたときだけ、短時間表示する案内。
// セット数が多くなると、カードの増減や位置だけでは操作が完了したことに気づきにくくなるため、
// 明示的な完了表示を添えている。
const ACTION_BANNER_DISPLAY_MS = 5000;

export function showPresetActionBanner(message) {
  elements.savedBanner.textContent = message;
  elements.savedBanner.hidden = false;

  if (savedBannerHideTimeoutId !== null) {
    clearTimeout(savedBannerHideTimeoutId);
  }
  savedBannerHideTimeoutId = setTimeout(() => {
    elements.savedBanner.hidden = true;
    savedBannerHideTimeoutId = null;
  }, ACTION_BANNER_DISPLAY_MS);
}

// プリセット一覧画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   eyebrowLabel: ヘッダーの小さなラベル（2026-08-29追加、選んだ種類に応じて書き換える）,
//   listContainer: 「＋新しいセットを作る」＋プリセットカードを並べる入れ物,
//   emptyState: 保存済みプリセットが1件もない/検索結果が0件のときに表示するメッセージ要素,
//   searchInput: セット名・メモを検索する入力欄,
//   savedBanner: 保存/更新が完了した直後だけ短時間表示する案内,
//   onCreateNew: 「＋新しいセットを作る」がタップされたときに呼ばれるコールバック,
//   onSelectPreset: 保存済みプリセットがタップされたときに呼ばれるコールバック（presetを受け取る）,
//   onPlayPreset: 「▶ プレイ」が押されたときに呼ばれるコールバック（presetを受け取る）,
//   onDuplicatePreset: 複製アイコンが押されたときに呼ばれるコールバック（presetを受け取る）,
//   onDeletePreset: 一覧カードの削除が確定したときに呼ばれるコールバック（presetを受け取る）,
//   listDeleteConfirmModal, listDeleteCancelButton, listDeleteConfirmButton: 一覧専用の削除確認モーダル一式,
//   detailModal, detailCloseButton: 詳細モーダルの背景・閉じるボタン,
//   detailTitle, detailMemo, detailSummary, detailGroups: 詳細モーダルの中身,
//   detailPlayButton: 詳細モーダルの「▶ このセットでプレイ」ボタン,
// }
export function initCustomQuizPresetsScreen(newElements) {
  elements = newElements;

  elements.searchInput.addEventListener("input", () => {
    searchQuery = elements.searchInput.value;
    renderCustomQuizPresetsScreen();
  });

  elements.detailCloseButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closePresetDetailModal();
  });
  elements.detailModal.addEventListener("click", (event) => {
    if (event.target === elements.detailModal) {
      closePresetDetailModal();
    }
  });

  elements.listDeleteCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closeListDeleteConfirmModal();
  });
  // 【二重再生防止】確定後に呼ばれるelements.onDeletePreset（main.js側）の先頭で
  // 既にplaySfx(UI_CLICK)相当のplayClickSound()が鳴っているため、ここでは重ねて鳴らさない。
  elements.listDeleteConfirmButton.addEventListener("click", handleListDeleteConfirmed);
  elements.listDeleteConfirmModal.addEventListener("click", (event) => {
    if (event.target === elements.listDeleteConfirmModal) {
      closeListDeleteConfirmModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (isPresetDetailModalOpen()) {
      closePresetDetailModal();
      return;
    }
    if (isListDeleteConfirmModalOpen()) {
      closeListDeleteConfirmModal();
    }
  });
}
