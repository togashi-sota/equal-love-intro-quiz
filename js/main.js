// アプリの起点となるファイル。
// 各モジュール（state.js, screens.js など）を import してつなぎ合わせていく。

import { SONGS } from "./data/songs.js";
import { showScreen } from "./screens.js";
import {
  gameState,
  resetGameState,
  startQuiz,
  startReviewQuiz,
  startSpecialQuiz,
  getCurrentQuestion,
  recordAnswer,
  advanceToNextQuestion,
  markPlaybackStarted,
  getElapsedMsSincePlaybackStart,
  getMissedSongs,
  setReviewSongs,
} from "./state.js";
import {
  filterSongsByCategory,
  resolveQuestionCount,
  validatePoolSize,
  buildQuizQuestions,
  buildReviewQuizQuestions,
  buildQuestionsFromSongIds,
} from "./quiz.js";
import { playSongIntro, stopAudio } from "./audio.js";
import { startTimer, stopTimer } from "./timer.js";
import { calculateScore, calculateRank } from "./score.js";
import { getHighScore, saveHighScoreIfBetter } from "./highscore.js";
import { playClickSound, playCorrectSound, playWrongSound, playCountUpSound } from "./sfx.js";
import { renderBackgroundSparkles } from "./decorations.js";
import { renderSongList, resetSongListToDefaultView, stopSongListPreview } from "./songlist.js";
import { buildPlayResult, evaluateAndSaveTitles } from "./titleProgress.js";
import { renderResultTitleEvents, clearResultTitleEvents } from "./titleDisplay.js";
import { initTitleListModal } from "./titleList.js";
import { saveHistoryEntry } from "./history.js";
import { initHistoryScreen, renderHistoryScreen } from "./historyScreen.js";
import { initHistoryDetailScreen, renderHistoryDetail } from "./historyDetailScreen.js";
import { initSpecialModesScreen } from "./specialModesScreen.js";
import { initWeakSongsScreen, renderWeakSongsScreen, resolveWeakSongIds } from "./weakSongsScreen.js";
import {
  initCustomQuizScreen,
  openCustomQuizScreenForNewPreset,
  openCustomQuizScreenForPreset,
  getLastStartedCustomQuizSelection,
  setLastStartedCustomQuizSelection,
  stopCustomQuizPreview,
} from "./customQuizScreen.js";
import { getPresets, saveNewPreset, updatePreset, deletePreset, duplicatePreset } from "./customQuizPresets.js";
import {
  initCustomQuizPresetsScreen,
  renderCustomQuizPresetsScreen,
  showPresetActionBanner,
} from "./customQuizPresetsScreen.js";
import { importAudioFiles, getImportedSongIds } from "./audioStorage.js";
import { analyzeLyricsFiles, saveLyricsData, getImportedLyricsSongIds } from "./lyricsStorage.js";

// 背景のキラキラ演出は、ゲームの状態と関係なく最初に1回だけ生成すればよい。
renderBackgroundSparkles();

// 収録曲一覧画面の中身も、ゲームの状態と関係なく最初に1回だけ組み立てればよい。
renderSongList(SONGS);

const startScreenElement = document.getElementById("start-screen");
const quizScreenElement = document.getElementById("quiz-screen");
const startErrorElement = document.getElementById("start-error");
const questionCountNoticeElement = document.getElementById("question-count-notice");
const questionProgressElement = document.getElementById("question-progress");
const progressDotsElement = document.getElementById("progress-dots");
const choiceButtonElements = document.querySelectorAll(".choice-button");
const feedbackElement = document.getElementById("feedback");
const nextButtonElement = document.getElementById("next-button");
const skipButtonElement = document.getElementById("skip-button");
const revealButtonElement = document.getElementById("reveal-button");
const audioErrorElement = document.getElementById("audio-error");
const timerDisplayElement = document.getElementById("timer-display");
const totalScoreElement = document.getElementById("total-score-display");
const rankElement = document.getElementById("rank-display");
const rankLetterElement = document.getElementById("rank-letter");
const highScoreElement = document.getElementById("high-score-display");
const newRecordElement = document.getElementById("new-record-badge");
const answerLogListElement = document.getElementById("answer-log-list");
const resultEyebrowLabelElement = document.getElementById("result-eyebrow-label");
const missedSongsSectionElement = document.getElementById("missed-songs-section");
const missedSongsChipRowElement = document.getElementById("missed-songs-chip-row");
const reviewMissedSongsButtonElement = document.getElementById("review-missed-songs-button");
const returnToNormalButtonElement = document.getElementById("return-to-normal-button");
const retryButtonElement = document.getElementById("retry-button");
const modeBestChipElement = document.getElementById("mode-best-chip");
const modeBestConditionElement = document.getElementById("mode-best-condition");
const modeBestValueElement = document.getElementById("mode-best-value");
const rulesLinkElement = document.getElementById("rules-link");
const rulesModalElement = document.getElementById("rules-modal");
const rulesModalCloseButtonElement = document.getElementById("rules-modal-close");
const songlistLinkElement = document.getElementById("songlist-link");
const songlistBackButtonElement = document.getElementById("songlist-back-button");
const titleEventListElement = document.getElementById("title-event-list");
const titleListLinkFromResultElement = document.getElementById("title-list-link-from-result");
const titleListLinkElement = document.getElementById("title-list-link");
const titleListModalElement = document.getElementById("title-list-modal");
const titleListModalCardElement = titleListModalElement.querySelector(".modal-card");
const titleListModalCloseButtonElement = document.getElementById("title-list-modal-close");
const titleListContainerElement = document.getElementById("title-list-container");
const historyLinkElement = document.getElementById("history-link");
const historyBackButtonElement = document.getElementById("history-back-button");
const historyClearConfirmModalElement = document.getElementById("history-clear-confirm-modal");
const historyDetailBackButtonElement = document.getElementById("history-detail-back-button");
// 詳細画面を開く直前の、履歴一覧のスクロール位置。「戻る」で一覧に戻ったときに復元する。
let historyListScrollY = 0;
const specialModesLinkElement = document.getElementById("special-modes-link");
const specialModesBackButtonElement = document.getElementById("special-modes-back-button");
const weakSongsBackButtonElement = document.getElementById("weak-songs-back-button");
const customQuizBackButtonElement = document.getElementById("custom-quiz-back-button");
const customQuizPresetsBackButtonElement = document.getElementById("custom-quiz-presets-back-button");
const customQuizRulesLinkElement = document.getElementById("custom-quiz-rules-link");
const customQuizRulesModalElement = document.getElementById("custom-quiz-rules-modal");
const customQuizRulesModalCloseButtonElement = document.getElementById("custom-quiz-rules-modal-close");
const customQuizPresetsRulesLinkElement = document.getElementById("custom-quiz-presets-rules-link");
const customQuizPresetsRulesModalElement = document.getElementById("custom-quiz-presets-rules-modal");
const customQuizPresetsRulesModalCloseButtonElement = document.getElementById(
  "custom-quiz-presets-rules-modal-close"
);
const customQuizPresetDetailModalElement = document.getElementById("custom-quiz-preset-detail-modal");
const customQuizDeleteConfirmModalElement = document.getElementById("custom-quiz-delete-confirm-modal");
const customQuizPresetsDeleteConfirmModalElement = document.getElementById(
  "custom-quiz-presets-delete-confirm-modal"
);
const weakSongsRulesLinkElement = document.getElementById("weak-songs-rules-link");
const weakSongsRulesModalElement = document.getElementById("weak-songs-rules-modal");
const weakSongsRulesModalCloseButtonElement = document.getElementById("weak-songs-rules-modal-close");
const specialModeNoticeElement = document.getElementById("special-mode-notice");
const backToTitleButtonElement = document.getElementById("back-to-title-button");
const backToSpecialModesButtonElement = document.getElementById("back-to-special-modes-button");
const backToModeListButtonElement = document.getElementById("back-to-mode-list-button");
const backToSpecialModesLinkElement = document.getElementById("back-to-special-modes-link");
const backToTitleLinkFromSpecialElement = document.getElementById("back-to-title-link-from-special");

// 特別モードのクイズ画面から、それぞれの確認/一覧画面へ戻るための共通処理。
// SPECIAL_MODES_DISPLAYの中で複数回参照する（結果画面の「◯◯一覧に戻る」と、
// クイズ中断の確認モーダル確定後の戻り先で、同じ画面に戻るため）。
function goToWeakSongsScreen() {
  renderWeakSongsScreen();
  showScreen("weakSongs");
}

function goToCustomQuizPresetsList() {
  renderCustomQuizPresetsScreen();
  showScreen("customQuizPresets");
}

// 特別モードごとの表示（結果画面の見出し・案内文、クイズ画面の進捗表示・中断時の戻り先）を
// まとめた対応表。将来モードが増えるときは、ここに1件足すだけでよい。
//
// backToListLabel/onBackToListは、そのモードが専用の一覧画面を持つ場合だけ設定する
// （例：オリジナル問題作成モードのプリセット一覧）。持たないモード（苦手曲モード）は
// 設定しないことで、結果画面は従来通り「特別モード一覧に戻る」だけを表示する。
//
// quizBackLabel/quizQuitTitle/quizQuitConfirmLabel/onQuizBackは、そのモードのクイズ中
// （playMode==="special"のとき）に「タイトルへ」の代わりに表示する文言と戻り先。
// 設定がない場合（通常プレイ・復習）は、呼び出し側で従来通り「タイトルへ」にフォールバックする。
const SPECIAL_MODES_DISPLAY = {
  weakSongs: {
    eyebrowLabel: "WEAK SONGS",
    progressPrefix: "🎯 苦手曲 ",
    resultNotice: "苦手曲の判定は、通常プレイの成績によって更新されます",
    quizBackLabel: "苦手曲モードへ",
    quizQuitTitle: "クイズを中断して苦手曲モードに戻りますか？",
    quizQuitConfirmLabel: "苦手曲モードに戻る",
    onQuizBack: goToWeakSongsScreen,
  },
  customQuiz: {
    eyebrowLabel: "ORIGINAL QUIZ",
    progressPrefix: "📝 オリジナル ",
    resultNotice: "この結果は、プレイ履歴・自己ベスト・称号には反映されません",
    backToListLabel: "オリジナル問題一覧に戻る",
    onBackToList: goToCustomQuizPresetsList,
    quizBackLabel: "セット一覧へ",
    quizQuitTitle: "クイズを中断してオリジナル問題作成モードに戻りますか？",
    quizQuitConfirmLabel: "セット一覧に戻る",
    onQuizBack: goToCustomQuizPresetsList,
  },
};
const quizBackButtonElement = document.getElementById("quiz-back-button");
const quizBackButtonLabelElement = document.getElementById("quiz-back-button-label");
const quizQuitConfirmModalElement = document.getElementById("quiz-quit-confirm-modal");
const quizQuitConfirmTitleElement = document.getElementById("quiz-quit-confirm-title");
const quizQuitCancelButtonElement = document.getElementById("quiz-quit-cancel-button");
const quizQuitConfirmButtonElement = document.getElementById("quiz-quit-confirm-button");
const audioImportStatusElement = document.getElementById("audio-import-status");
const audioImportInputElement = document.getElementById("audio-import-input");
const audioImportResultElement = document.getElementById("audio-import-result");
const lyricsImportStatusElement = document.getElementById("lyrics-import-status");
const lyricsImportInputElement = document.getElementById("lyrics-import-input");
const lyricsImportResultElement = document.getElementById("lyrics-import-result");
const lyricsWarningPanelElement = document.getElementById("lyrics-warning-panel");
const lyricsWarningListElement = document.getElementById("lyrics-warning-list");
const lyricsWarningSaveButtonElement = document.getElementById("lyrics-warning-save-button");
const lyricsWarningDiscardButtonElement = document.getElementById("lyrics-warning-discard-button");
const updateAvailableBannerElement = document.getElementById("update-available-banner");
const updateReloadButtonElement = document.getElementById("update-reload-button");

// 称号一覧モーダルの開閉ロジックはtitleList.jsに閉じ込めてあるので、
// ここでは必要なDOM要素を渡して初期化するだけでよい。
initTitleListModal({
  overlay: titleListModalElement,
  modalCard: titleListModalCardElement,
  closeButton: titleListModalCloseButtonElement,
  listContainer: titleListContainerElement,
  openTriggers: [titleListLinkElement, titleListLinkFromResultElement],
});

// プレイ履歴画面のサマリー・一覧の描画、削除確認モーダルの開閉ロジックはhistoryScreen.jsに
// 閉じ込めてあるので、ここでは必要なDOM要素を渡して初期化するだけでよい。
initHistoryScreen({
  summaryPlayCount: document.getElementById("history-summary-play-count"),
  summaryAnswerCount: document.getElementById("history-summary-answer-count"),
  summaryAccuracy: document.getElementById("history-summary-accuracy"),
  listContainer: document.getElementById("history-list"),
  emptyState: document.getElementById("history-empty-state"),
  clearButton: document.getElementById("history-clear-button"),
  confirmModalOverlay: historyClearConfirmModalElement,
  confirmCancelButton: document.getElementById("history-clear-cancel-button"),
  confirmDeleteButton: document.getElementById("history-clear-delete-button"),
  onSelectEntry: (entry) => {
    playClickSound();
    historyListScrollY = window.scrollY;
    renderHistoryDetail(entry);
    showScreen("historyDetail");
  },
});

// プレイ履歴詳細画面の描画に使うDOM要素一式と、復習ボタンのコールバックを渡して初期化する。
initHistoryDetailScreen({
  date: document.getElementById("history-detail-date"),
  mode: document.getElementById("history-detail-mode"),
  rankDisplay: document.getElementById("history-detail-rank-display"),
  rankLetter: document.getElementById("history-detail-rank-letter"),
  score: document.getElementById("history-detail-score"),
  averageTime: document.getElementById("history-detail-average-time"),
  newRecord: document.getElementById("history-detail-new-record"),
  titleBadges: document.getElementById("history-detail-title-badges"),
  missedSection: document.getElementById("history-detail-missed-section"),
  missedHeading: document.getElementById("history-detail-missed-heading"),
  missedChipRow: document.getElementById("history-detail-missed-chip-row"),
  reviewButton: document.getElementById("history-detail-review-button"),
  allCorrectMessage: document.getElementById("history-detail-all-correct-message"),
  answerList: document.getElementById("history-detail-answer-list"),
  listEnd: document.getElementById("history-detail-list-end"),
  // 「この回の間違えた曲だけ復習する」：この履歴の出題数・カテゴリを引き継いで復習クイズを
  // 開始する。beginReviewQuiz()（結果画面発の復習）とほぼ同じ処理だが、こちらは
  // startReviewQuiz()にmodeOverrideを渡し、今のgameStateではなくこの履歴のモードに
  // questionCountValue/categoryFilterValueを合わせる点が異なる。
  onStartReview: (missedSongs, questionCountValue, categoryFilterValue) => {
    playClickSound();
    stopTimer();
    stopAudio();
    const distractorPool = filterSongsByCategory(SONGS, categoryFilterValue);
    const questions = buildReviewQuizQuestions(missedSongs, distractorPool);
    startReviewQuiz(questions, { questionCountValue, categoryFilterValue });
    renderQuestion();
    showScreen("quiz");
  },
});

// 特別モード一覧画面：モードカードがタップされたら、対応する画面を開く。
initSpecialModesScreen({
  listContainer: document.getElementById("special-modes-list"),
  onSelectMode: (modeId) => {
    playClickSound();
    if (modeId === "weakSongs") {
      renderWeakSongsScreen();
      showScreen("weakSongs");
    } else if (modeId === "originalQuiz") {
      renderCustomQuizPresetsScreen();
      showScreen("customQuizPresets");
    }
  },
});

// オリジナル問題作成モードのプリセット一覧画面：「＋新しいセットを作る」／
// 保存済みプリセットのタップ、どちらも選曲画面（#custom-quiz-screen）を開く。
initCustomQuizPresetsScreen({
  listContainer: document.getElementById("custom-quiz-presets-list"),
  emptyState: document.getElementById("custom-quiz-presets-empty-state"),
  searchInput: document.getElementById("custom-quiz-presets-search-input"),
  savedBanner: document.getElementById("custom-quiz-presets-saved-banner"),
  onCreateNew: () => {
    playClickSound();
    openCustomQuizScreenForNewPreset();
    showScreen("customQuiz");
  },
  onSelectPreset: (preset) => {
    playClickSound();
    openCustomQuizScreenForPreset(preset);
    showScreen("customQuiz");
  },
  // 「▶ プレイ」：選曲画面を経由せず直接クイズを始める。結果画面の「もう一度挑戦する」も
  // 正しく同じ内容を再開できるよう、先に「直前の開始内容」を更新しておく。
  onPlayPreset: (preset) => {
    playClickSound();
    setLastStartedCustomQuizSelection(preset.songIds, preset.distractorMode);
    beginCustomQuiz(preset.songIds, preset.distractorMode);
  },
  // 複製アイコン：一覧を離れず複製し、そのまま複製した内容の編集画面を開く
  // （複製は「少し変えて使いたい」場面が前提のため、名前や曲を調整しやすいようにする）。
  onDuplicatePreset: (preset) => {
    playClickSound();
    const duplicate = duplicatePreset(preset.id);
    if (duplicate) {
      openCustomQuizScreenForPreset(duplicate);
      showScreen("customQuiz");
    }
  },
  // 一覧カードのゴミ箱アイコン（確認モーダルで確定後）：プリセットを削除し、一覧を描画し直す。
  // すでにこの一覧画面にいるので、選曲画面からの削除と違いshowScreen()は不要。
  onDeletePreset: (preset) => {
    playClickSound();
    deletePreset(preset.id);
    renderCustomQuizPresetsScreen();
    showPresetActionBanner(`「${preset.name}」を削除しました`);
  },
  listDeleteConfirmModal: customQuizPresetsDeleteConfirmModalElement,
  listDeleteCancelButton: document.getElementById("custom-quiz-presets-delete-cancel-button"),
  listDeleteConfirmButton: document.getElementById("custom-quiz-presets-delete-confirm-button"),
  detailModal: customQuizPresetDetailModalElement,
  detailCloseButton: document.getElementById("custom-quiz-preset-detail-close"),
  detailTitle: document.getElementById("custom-quiz-preset-detail-title"),
  detailMemo: document.getElementById("custom-quiz-preset-detail-memo"),
  detailSummary: document.getElementById("custom-quiz-preset-detail-summary"),
  detailGroups: document.getElementById("custom-quiz-preset-detail-groups"),
  detailPlayButton: document.getElementById("custom-quiz-preset-detail-play-button"),
});

// 曲IDの配列を受け取ってクイズを組み立て、開始する共通処理。
// 苦手曲モードだけでなく、将来のモードなど「曲を選んでクイズを始める」系の特別モード全般で、
// そのまま使い回せるようにしてある（「どの曲を選ぶか」は各モードの確認画面が担当し、
// ここでは選ばれた曲でクイズを始めることだけに専念する）。
// ダミー選択肢のプールは常に全曲（"all"）から選ぶ（苦手曲モード用）。
function beginSpecialQuiz(songIds, questionCountValue, specialModeId) {
  stopTimer();
  stopAudio();
  const distractorPool = filterSongsByCategory(SONGS, "all");
  const questions = buildQuestionsFromSongIds(songIds, distractorPool);
  startSpecialQuiz(questions, questionCountValue, specialModeId);
  renderQuestion();
  showScreen("quiz");
}

// オリジナル問題作成モード用のクイズ開始処理。beginSpecialQuiz()と違い、ダミー選択肢の
// プールを「選択した曲だけ」「全収録曲」から選べる点が異なるため、別関数にしている。
function beginCustomQuiz(songIds, distractorMode) {
  stopTimer();
  stopAudio();
  const selectedSongs = SONGS.filter((song) => songIds.includes(song.id));
  const distractorPool = distractorMode === "selected" ? selectedSongs : filterSongsByCategory(SONGS, "all");
  const questions = buildQuestionsFromSongIds(songIds, distractorPool);
  startSpecialQuiz(questions, String(questions.length), "customQuiz");
  renderQuestion();
  showScreen("quiz");
}

// 苦手曲モード確認画面の描画に使うDOM要素一式を渡して初期化する。
initWeakSongsScreen({
  availableSection: document.getElementById("weak-songs-available-section"),
  emptyState: document.getElementById("weak-songs-empty-state"),
  countValue: document.getElementById("weak-songs-count-value"),
  allLabel: document.getElementById("weak-songs-all-label"),
  chipRow: document.getElementById("weak-songs-chip-row"),
  countNotice: document.getElementById("weak-songs-count-notice"),
  startButton: document.getElementById("weak-songs-start-button"),
  onStart: (songIds, questionCountValue) => {
    playClickSound();
    beginSpecialQuiz(songIds, questionCountValue, "weakSongs");
  },
});

// オリジナル問題作成モードの選曲画面の描画に使うDOM要素一式を渡して初期化する。
initCustomQuizScreen({
  groupsContainer: document.getElementById("custom-quiz-groups"),
  selectedCountValue: document.getElementById("custom-quiz-selected-count-value"),
  minNotice: document.getElementById("custom-quiz-min-notice"),
  selectAllButton: document.getElementById("custom-quiz-select-all-button"),
  deselectAllButton: document.getElementById("custom-quiz-deselect-all-button"),
  searchInput: document.getElementById("custom-quiz-search-input"),
  searchClearButton: document.getElementById("custom-quiz-search-clear-button"),
  noResultsNotice: document.getElementById("custom-quiz-no-results-notice"),
  selectedOnlyCheckbox: document.getElementById("custom-quiz-selected-only-checkbox"),
  previewAudioElement: document.getElementById("custom-quiz-preview-audio"),
  previewPlayer: document.getElementById("custom-quiz-preview-player"),
  previewTitle: document.getElementById("custom-quiz-preview-title"),
  previewToggleButton: document.getElementById("custom-quiz-preview-toggle-button"),
  previewSeekBackButton: document.getElementById("custom-quiz-preview-seek-back"),
  previewSeekForwardButton: document.getElementById("custom-quiz-preview-seek-forward"),
  previewSeekRange: document.getElementById("custom-quiz-preview-seek-range"),
  previewCurrentTime: document.getElementById("custom-quiz-preview-current-time"),
  previewDuration: document.getElementById("custom-quiz-preview-duration"),
  previewLyricsPanel: document.getElementById("custom-quiz-preview-lyrics"),
  nameInput: document.getElementById("custom-quiz-name-input"),
  memoInput: document.getElementById("custom-quiz-memo-input"),
  nameError: document.getElementById("custom-quiz-name-error"),
  saveButton: document.getElementById("custom-quiz-save-button"),
  deleteButton: document.getElementById("custom-quiz-delete-button"),
  deleteConfirmModal: document.getElementById("custom-quiz-delete-confirm-modal"),
  deleteCancelButton: document.getElementById("custom-quiz-delete-cancel-button"),
  deleteConfirmButton: document.getElementById("custom-quiz-delete-confirm-button"),
  duplicateButton: document.getElementById("custom-quiz-duplicate-button"),
  startButton: document.getElementById("custom-quiz-start-button"),
  onStart: (songIds, distractorMode) => {
    playClickSound();
    beginCustomQuiz(songIds, distractorMode);
  },
  // 「セットを保存する」：新規プリセットとして保存し、一覧画面を最新の内容で描画し直してから戻る。
  // クイズを一度も始めなくても、この時点で保存自体は完結している
  // （保存完了バナーは、一覧に「保存できた」ことがひと目で伝わるよう添えている）。
  onSave: (presetData) => {
    playClickSound();
    saveNewPreset(presetData);
    renderCustomQuizPresetsScreen();
    showScreen("customQuizPresets");
    showPresetActionBanner(`「${presetData.name}」を保存しました`);
  },
  // 「上書き保存する」：同じidのプリセットを更新し、一覧画面へ戻る。
  onUpdate: (id, presetData) => {
    playClickSound();
    updatePreset(id, presetData);
    renderCustomQuizPresetsScreen();
    showScreen("customQuizPresets");
    showPresetActionBanner(`「${presetData.name}」を更新しました`);
  },
  // 「削除する」（確認モーダルで確定後）：プリセットを削除し、一覧画面へ戻る
  // （削除したカードが消えていることが分かるよう、必ず最新の内容で描画し直す）。
  // バナーに使う名前は、削除前の保存済みデータから取得する
  // （編集中の名前欄が保存前の未確定な入力である可能性があるため）。
  onDelete: (id) => {
    playClickSound();
    const preset = getPresets().find((p) => p.id === id);
    deletePreset(id);
    renderCustomQuizPresetsScreen();
    showScreen("customQuizPresets");
    showPresetActionBanner(`「${preset?.name ?? ""}」を削除しました`);
  },
  // 「複製する」：複製してできた新しいプリセットを、そのまま選曲画面で開き直す
  // （複製は「少し変えて使いたい」場面が前提のため、名前や曲を調整しやすいよう
  // 一覧へは戻らず、この画面のまま新しいプリセットの編集に進む）。
  onDuplicate: (id) => {
    playClickSound();
    const duplicate = duplicatePreset(id);
    if (duplicate) {
      openCustomQuizScreenForPreset(duplicate);
    }
  },
});

// 音源の再生に失敗したときの表示処理。
// タイマーや得点処理は止めず、エラーメッセージを出すだけに留める。
function showAudioError(message) {
  audioErrorElement.textContent = message;
  audioErrorElement.hidden = false;
}

// 自己ベストのチップに表示する、出題数・カテゴリの短縮ラベル。
// 出題数の「全曲」（5問/10問/20問/50問/全曲）とカテゴリの「全曲」が
// どちらも同じ表記だと紛らわしいため、出題数側だけ「全問」と表記して区別する。
const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全問" };
const CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };

// スタート画面で選択中の出題数・カテゴリに対応する自己ベストを表示する。
// ラジオボタンが切り替わるたびと、スタート画面に戻るたびに呼び出す。
function updateModeBestScoreDisplay() {
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;
  const best = getHighScore(questionCountValue, categoryFilterValue);

  modeBestConditionElement.textContent =
    `${QUESTION_COUNT_LABELS[questionCountValue]}・${CATEGORY_LABELS[categoryFilterValue]}`;
  modeBestValueElement.textContent = best > 0 ? `ベスト ${best}点` : "ベスト 記録なし";
  modeBestChipElement.classList.toggle("is-empty", best === 0);
}

// カテゴリの選択肢に、現在の対象曲数を添える。SONGSから毎回数え直すので、
// 新曲・アルバム曲・配信限定曲を追加しても自動的に数字が更新される。起動時に1回だけ呼べばよい。
function updateCategoryCountHints() {
  document.querySelectorAll(".count-hint[data-category-count]").forEach((hintElement) => {
    const categoryFilterValue = hintElement.dataset.categoryCount;
    const count = filterSongsByCategory(SONGS, categoryFilterValue).length;
    hintElement.textContent = `${count}曲`;
  });
}

// 選んだ出題数が、選んだカテゴリの対象曲数を上回っているときだけ、
// 「実際は何問になるか」を事前に案内する。ラジオボタンが切り替わるたびに呼び出す。
// resolveQuestionCount自体（quiz.js）はすでに曲数に収まるよう切り詰める作りなので、
// ここでは同じ考え方でその結果を先に見せているだけで、出題ロジックには手を加えていない。
function updateQuestionCountNotice() {
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;

  if (questionCountValue === "all") {
    questionCountNoticeElement.hidden = true;
    return;
  }

  const poolSize = filterSongsByCategory(SONGS, categoryFilterValue).length;
  const requestedCount = Number(questionCountValue);
  if (requestedCount > poolSize) {
    questionCountNoticeElement.textContent = `対象曲数が${questionCountValue}曲未満のため、全${poolSize}問を出題します`;
    questionCountNoticeElement.hidden = false;
  } else {
    questionCountNoticeElement.hidden = true;
  }
}

// 得点カウントアップ演出にかける時間。
const SCORE_COUNT_UP_DURATION_MS = 800;

// 合計得点を0から実際の点数まで、アニメーションしながらカウントアップ表示する。
// 「モーションを減らす」設定が有効な環境では、演出をせず即座に最終的な点数を表示する。
function animateScoreCountUp(finalScore) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    totalScoreElement.textContent = `合計得点: ${finalScore}点`;
    return;
  }

  playCountUpSound();
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min(1, (now - startTime) / SCORE_COUNT_UP_DURATION_MS);
    const currentScore = Math.floor(finalScore * progress);
    totalScoreElement.textContent = `合計得点: ${currentScore}点`;

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// タイマーの経過秒数表示を更新する。
function updateTimerDisplay(elapsedSec) {
  timerDisplayElement.textContent = `経過: ${elapsedSec}秒`;
}

// 正解の選択肢に「is-correct」（キラキラ演出）、選んでしまった不正解の選択肢に
// 「is-wrong」（シェイク演出）のクラスを付ける。selectedChoiceIdがnullなら
// （＝時間切れで何も選んでいない）正解の表示だけを行う。
function markChoiceButtons(selectedChoiceId) {
  const question = getCurrentQuestion();
  choiceButtonElements.forEach((button, index) => {
    const choice = question.choices[index];
    if (choice.id === question.song.id) {
      button.classList.add("is-correct");
    } else if (choice.id === selectedChoiceId) {
      button.classList.add("is-wrong");
    }
  });
}

// 次の問題を表示する前に、前の問題の演出クラスを消しておく。
function clearChoiceButtonStates() {
  choiceButtonElements.forEach((button) => {
    button.classList.remove("is-correct", "is-wrong");
  });
}

// 次の問題があればそれを表示し、なければ結果画面を表示する共通処理。
// 「次へ」ボタン・スキップの両方から呼ばれる。
function goToNextQuestionOrResult() {
  const hasMoreQuestions = advanceToNextQuestion();
  if (hasMoreQuestions) {
    renderQuestion();
    return;
  }

  renderResult();
  showScreen("result");
}

// 回答済みになったときに、スキップ・答えを見るボタンを隠す共通処理。
// （選択肢クリック・スキップ・答えを見る、どのルートで回答済みになっても呼ぶ）
function hideSkipAndRevealButtons() {
  skipButtonElement.hidden = true;
  revealButtonElement.hidden = true;
}

// 選択肢ボタンをクリックしたときの処理。
// 正解なら経過秒数に応じた段階式のボーナス、不正解なら0点として記録する。
function handleChoiceClick(selectedChoice) {
  // 他の操作とほぼ同時に起きても二重に処理しないためのガード。
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  stopTimer();
  hideSkipAndRevealButtons();

  const question = getCurrentQuestion();
  const isCorrect = selectedChoice.id === question.song.id;
  // 無音の頭出しはaudio.js側で再生位置をずらして対応済みなので、
  // ここではもう曲ごとの無音秒数を差し引かない（elapsedSecがそのまま実際の聴取時間になる）。
  const points = isCorrect ? calculateScore(gameState.elapsedSec) : 0;
  recordAnswer(isCorrect ? "correct" : "wrong", points, getElapsedMsSincePlaybackStart());
  markChoiceButtons(selectedChoice.id);
  if (isCorrect) {
    playCorrectSound();
  } else {
    playWrongSound();
  }

  feedbackElement.textContent = isCorrect
    ? `正解！ +${points}点`
    : `不正解…（正解は「${question.song.title}」）`;
  // 正解/不正解を文字色でも一目で分かるようにするための、見た目だけのクラス切り替え
  feedbackElement.classList.toggle("is-correct", isCorrect);
  feedbackElement.classList.toggle("is-wrong", !isCorrect);
  feedbackElement.hidden = false;
  nextButtonElement.hidden = false;
}

// 「スキップ」ボタンを押したときの処理。
// 0点として記録し、正解は見せずにそのまま次の問題（または結果画面）へ進める。
function handleSkip() {
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  stopTimer();
  stopAudio();
  playClickSound();

  recordAnswer("skip", 0, getElapsedMsSincePlaybackStart());
  goToNextQuestionOrResult();
}

// 「答えを見る」ボタンを押したときの処理。
// 0点として記録し、正解の曲名を表示してから「次へ」ボタンで進めるようにする。
function handleReveal() {
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  stopTimer();
  stopAudio();
  hideSkipAndRevealButtons();

  const question = getCurrentQuestion();
  recordAnswer("reveal", 0, getElapsedMsSincePlaybackStart());
  markChoiceButtons(null);
  playWrongSound();
  feedbackElement.textContent = `正解は「${question.song.title}」でした`;
  feedbackElement.hidden = false;
  nextButtonElement.hidden = false;
}

// 出題の進み具合を示すドットを表示する。
// 答え終えた問題は塗りつぶし、今の問題は少し大きく強調し、まだの問題は白抜きにする。
function renderProgressDots() {
  progressDotsElement.innerHTML = "";
  gameState.questions.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.classList.add("dot");
    if (index < gameState.currentIndex) {
      dot.classList.add("is-done");
    } else if (index === gameState.currentIndex) {
      dot.classList.add("is-current");
    }
    progressDotsElement.appendChild(dot);
  });
}

// クイズ画面左上の「タイトルへ」（中断ボタン）と、その確認モーダルの文言を、
// 今のモードに合わせて切り替える。特別モードのクイズ中（playMode==="special"）だけ、
// そのモードの確認/一覧画面に戻れるよう文言・戻り先を差し替え、それ以外（通常プレイ・復習）は
// 従来通り常に「タイトルへ」にする。
// 復習クイズ中は、特別モードから来た場合も含めて一律「🔁復習」表示にしている既存の方針
// （renderQuestion内のprogressPrefix）に合わせ、ここでもreviewは対象外にしている。
function updateQuizQuitDisplay() {
  const isSpecial = gameState.playMode === "special";
  const display = isSpecial ? SPECIAL_MODES_DISPLAY[gameState.specialModeId] : null;

  quizBackButtonLabelElement.textContent = display?.quizBackLabel ?? "タイトルへ";
  quizQuitConfirmTitleElement.textContent = display?.quizQuitTitle ?? "クイズを中断してタイトルに戻りますか？";
  quizQuitConfirmButtonElement.textContent = display?.quizQuitConfirmLabel ?? "タイトルに戻る";
}

// 今の問題の内容（進捗・4択の曲名）をクイズ画面に反映し、イントロ音源とタイマーを開始する。
function renderQuestion() {
  updateQuizQuitDisplay();
  const question = getCurrentQuestion();
  const progressLabel = `第${gameState.currentIndex + 1}問 / ${gameState.questions.length}問`;
  // 復習中は進捗表示に「🔁 復習」を、特別モード中はモードごとの接頭辞を添えて、
  // 通常プレイと見分けられるようにする。
  let progressPrefix = "";
  if (gameState.playMode === "review") {
    progressPrefix = "🔁 復習 ";
  } else if (gameState.playMode === "special") {
    progressPrefix = SPECIAL_MODES_DISPLAY[gameState.specialModeId]?.progressPrefix ?? "";
  }
  questionProgressElement.textContent = `${progressPrefix}${progressLabel}`;
  renderProgressDots();

  choiceButtonElements.forEach((button, index) => {
    button.textContent = question.choices[index].title;
  });

  feedbackElement.hidden = true;
  feedbackElement.classList.remove("is-correct", "is-wrong");
  nextButtonElement.hidden = true;
  skipButtonElement.hidden = false;
  revealButtonElement.hidden = false;
  audioErrorElement.hidden = true;
  clearChoiceButtonStates();

  // 再生を試みる直前の時刻をいったん暫定の計測起点にしておく。
  // 曲が実際に鳴り始めたら（onPlaybackStart）、より正確な値に上書きされる。
  markPlaybackStarted();
  playSongIntro(question.song, showAudioError, markPlaybackStarted);
  startTimer(updateTimerDisplay);
}

// 「今回間違えた曲」セクションを描画する。通常プレイ・復習プレイどちらの結果でも呼ばれる、
// 共通の処理。間違いが1曲もなければセクションごと隠す
// （復習ですべて正解した場合に再復習ボタンが消えるのも、この分岐だけで自然に実現される）。
function renderMissedSongsSection(missedSongs) {
  const hasMissedSongs = missedSongs.length > 0;
  missedSongsSectionElement.hidden = !hasMissedSongs;

  missedSongsChipRowElement.innerHTML = "";
  missedSongs.forEach((song) => {
    const chip = document.createElement("span");
    chip.classList.add("missed-song-chip");
    chip.textContent = song.title;
    missedSongsChipRowElement.appendChild(chip);
  });
}

// 結果画面に、合計得点・自己ベスト・1問ごとの内訳を反映する。
// 通常プレイと復習プレイの両方から呼ばれ、gameState.playModeに応じて表示・保存内容を出し分ける。
function renderResult() {
  animateScoreCountUp(gameState.score);
  const rank = calculateRank(gameState.score, gameState.questions.length);
  rankLetterElement.textContent = rank;
  // ランクごとにメダルの色・縁取り・光・飾りを切り替える見た目用のクラス
  rankElement.classList.remove("rank-s", "rank-a", "rank-b", "rank-c");
  rankElement.classList.add(`rank-${rank.toLowerCase()}`);

  const isReview = gameState.playMode === "review";
  // 苦手曲モードなど「特別モード」も、復習と同じく自己ベスト・称号・プレイ履歴には反映しない
  // （本人と合意済みの方針）。
  const isSpecial = gameState.playMode === "special";
  const specialModeDisplay = SPECIAL_MODES_DISPLAY[gameState.specialModeId];
  resultEyebrowLabelElement.textContent = isReview
    ? "REVIEW"
    : isSpecial
      ? (specialModeDisplay?.eyebrowLabel ?? "SPECIAL")
      : "RESULT";

  if (isReview || isSpecial) {
    // 復習プレイ・特別モードは自己ベスト・称号・プレイ履歴のいずれにも反映しない。
    // 保存処理そのものを呼ばないことに加え、前回（通常プレイ）の結果表示が
    // 残ってしまわないよう、自己ベスト欄・称号欄を明示的に隠す／空にする。
    highScoreElement.hidden = true;
    newRecordElement.hidden = true;
    clearResultTitleEvents({
      chipContainer: titleEventListElement,
      titleListLinkElement: titleListLinkFromResultElement,
    });

    // 特別モードのときだけ、自己ベスト欄の代わりに「記録には反映されない」ことを伝える一言を表示する。
    specialModeNoticeElement.hidden = !isSpecial;
    if (isSpecial) {
      specialModeNoticeElement.textContent = specialModeDisplay?.resultNotice ?? "";
    }
  } else {
    specialModeNoticeElement.hidden = true;
    const { questionCountValue, categoryFilterValue } = gameState;
    const isNewRecord = saveHighScoreIfBetter(gameState.score, questionCountValue, categoryFilterValue);
    highScoreElement.hidden = false;
    highScoreElement.textContent = `このモードの自己ベスト: ${getHighScore(questionCountValue, categoryFilterValue)}点`;
    newRecordElement.hidden = !isNewRecord;

    const playResult = buildPlayResult(gameState);
    const titleEvents = evaluateAndSaveTitles(playResult);
    renderResultTitleEvents(titleEvents, {
      chipContainer: titleEventListElement,
      titleListLinkElement: titleListLinkFromResultElement,
    });
    saveHistoryEntry(gameState, playResult, { rank, isNewRecord, titleEvents });
  }

  answerLogListElement.innerHTML = "";
  gameState.answerLog.forEach((entry, index) => {
    const item = document.createElement("li");
    const isCorrect = entry.resultType === "correct";
    item.classList.add(isCorrect ? "is-correct-row" : "is-wrong-row");

    const resultLabel = isCorrect ? "正解" : "不正解";
    const textElement = document.createElement("span");
    textElement.classList.add("answer-log-text");
    textElement.textContent = `第${index + 1}問「${entry.song.title}」: ${resultLabel}（${entry.pointsEarned}点）`;
    item.appendChild(textElement);

    // 回答時間は、音源の再生に失敗した等の理由で計測できていない場合があるので、
    // データがあるときだけバッジを表示する。
    if (entry.elapsedMs !== null) {
      const timeBadge = document.createElement("span");
      timeBadge.classList.add("answer-time-badge");
      timeBadge.textContent = `${(entry.elapsedMs / 1000).toFixed(1)}秒`;
      item.appendChild(timeBadge);
    }

    answerLogListElement.appendChild(item);
  });

  // 間違えた曲の抽出・表示・復習ボタンの出し分け。通常プレイ・復習プレイどちらの結果でも
  // 同じ処理を行う（「まだ間違えた曲」を再抽出することで、復習の連続実行に対応する）。
  const missedSongs = getMissedSongs(gameState.answerLog);
  setReviewSongs(missedSongs, gameState.categoryFilterValue);
  renderMissedSongsSection(missedSongs);

  // 特別モード（苦手曲モード等）の結果画面から「間違えた曲だけ復習する」に入った場合、
  // playModeは"review"になるが、specialModeIdはstartReviewQuiz()で書き換えられずそのまま残る。
  // これを利用して「特別モードから来た復習」かどうかを判定する。
  // このケースでは、復習後に「通常プレイを始める」を出すと、特別モード側のcategoryFilterValue
  // （常にnull）を引き継いでしまい、意図しない条件で通常クイズが始まってしまうため出さない。
  const isReviewFromSpecial = isReview && gameState.specialModeId !== null;

  // このモードが専用の一覧画面を持つかどうか（例：オリジナル問題作成モードのプリセット一覧）。
  // 持たないモード（苦手曲モード）は、従来通り「特別モード一覧に戻る」がそのまま副ボタンになる。
  const hasOwnListScreen = Boolean(specialModeDisplay?.onBackToList);
  const isSpecialWithList = isSpecial && hasOwnListScreen;
  const isReviewFromSpecialWithList = isReviewFromSpecial && hasOwnListScreen;

  // ボタン列の出し分け：「もう一度挑戦する」（通常プレイ・特別モードの結果）と
  // 「通常プレイを始める」（通常プレイ発の復習の結果）は互いに排他。
  //
  // 「タイトルに戻る」（#back-to-title-button）：
  //   通常プレイ・通常プレイ発の復習では、従来通り副ボタン。
  //   専用一覧を持たないモードから来た復習（例：苦手曲モード）では主役（primary-button）。
  //   専用一覧を持つモードから来た復習（例：オリジナル問題作成モード）では、
  //   「◯◯一覧に戻る」の方を主役にするため、こちらは副ボタンのまま。
  // 「◯◯一覧に戻る」（#back-to-mode-list-button）：専用一覧を持つモードの結果でだけ表示。
  //   そのモード自身の結果では副ボタン、そのモードから来た復習では主役にする
  //   （元の作業に最短で戻れるようにするため）。
  // 「特別モード一覧に戻る」：専用一覧を持たないモードでは副ボタン（従来通り）、
  //   専用一覧を持つモードでは控えめなテキストリンクに格下げする。
  retryButtonElement.hidden = isReview;
  returnToNormalButtonElement.hidden = !isReview || isReviewFromSpecial;

  backToTitleButtonElement.hidden = isSpecial;
  const showTitleAsPrimary = isReviewFromSpecial && !hasOwnListScreen;
  backToTitleButtonElement.classList.toggle("primary-button", showTitleAsPrimary);
  backToTitleButtonElement.classList.toggle("secondary-button", !showTitleAsPrimary);

  backToModeListButtonElement.hidden = !(isSpecialWithList || isReviewFromSpecialWithList);
  if (!backToModeListButtonElement.hidden) {
    backToModeListButtonElement.textContent = specialModeDisplay.backToListLabel;
  }
  backToModeListButtonElement.classList.toggle("primary-button", isReviewFromSpecialWithList);
  backToModeListButtonElement.classList.toggle("secondary-button", !isReviewFromSpecialWithList);

  backToSpecialModesButtonElement.hidden = !(isSpecial || isReviewFromSpecial) || hasOwnListScreen;
  backToSpecialModesLinkElement.hidden = !(isSpecialWithList || isReviewFromSpecialWithList);
  backToTitleLinkFromSpecialElement.hidden = !isSpecial;
}

// 4つの選択肢ボタンに、それぞれクリック時の処理を割り当てる。
// ボタンの並び自体は固定なので、クリック時に「今の問題」の該当インデックスの選択肢を参照する。
choiceButtonElements.forEach((button, index) => {
  button.addEventListener("click", () => {
    const question = getCurrentQuestion();
    handleChoiceClick(question.choices[index]);
  });
});

// 指定した出題数・カテゴリで、曲プールの絞り込み・検証から問題生成までを行い、
// クイズ画面を開始する共通処理。スタートボタンと、結果画面の「もう一度挑戦する」の
// 両方から呼ばれる（後者は毎回この関数を通すことで、曲順・4択が必ず再抽選される）。
function beginQuiz(questionCountValue, categoryFilterValue) {
  const pool = filterSongsByCategory(SONGS, categoryFilterValue);
  const errorMessage = validatePoolSize(pool);

  if (errorMessage) {
    startErrorElement.textContent = errorMessage;
    startErrorElement.hidden = false;
    return;
  }

  startErrorElement.hidden = true;
  const questionCount = resolveQuestionCount(questionCountValue, pool.length);
  const questions = buildQuizQuestions(pool, questionCount);
  startQuiz(questions, questionCountValue, categoryFilterValue);
  renderQuestion();

  showScreen("quiz");
}

// スタートボタンを押したときの処理。今選ばれている出題数・カテゴリを読み取って開始する。
document.getElementById("start-button").addEventListener("click", () => {
  playClickSound();
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;
  beginQuiz(questionCountValue, categoryFilterValue);
});

document.getElementById("next-button").addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();
  goToNextQuestionOrResult();
});

skipButtonElement.addEventListener("click", handleSkip);
revealButtonElement.addEventListener("click", handleReveal);

// 「もう一度挑戦する」：スタート画面を経由せず、直前と同じ出題数・カテゴリのまま
// クイズを再抽選して開始する。
// 特別モードの結果では、通常のもう一度挑戦する（beginQuiz）ではなく、そのモードの判定を
// 再計算して再開する。将来モードが増えたときは、ここに分岐を1つ足すだけでよい。
function retrySpecialQuiz() {
  if (gameState.specialModeId === "weakSongs") {
    const songIds = resolveWeakSongIds(gameState.questionCountValue);
    beginSpecialQuiz(songIds, gameState.questionCountValue, "weakSongs");
  } else if (gameState.specialModeId === "customQuiz") {
    const { songIds, distractorMode } = getLastStartedCustomQuizSelection();
    beginCustomQuiz(songIds, distractorMode);
  }
}

retryButtonElement.addEventListener("click", () => {
  playClickSound();
  if (gameState.playMode === "special") {
    retrySpecialQuiz();
    return;
  }
  stopTimer();
  stopAudio();
  beginQuiz(gameState.questionCountValue, gameState.categoryFilterValue);
});

// 「通常プレイを始める」（復習の結果画面にだけ表示）：復習に入る前と同じ出題数・カテゴリで、
// 新しい通常クイズを始める。処理内容は「もう一度挑戦する」と全く同じ
// （beginQuiz→startQuizが必ずplayModeを"normal"に戻すため、ここで個別に戻す必要はない）。
returnToNormalButtonElement.addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();
  beginQuiz(gameState.questionCountValue, gameState.categoryFilterValue);
});

// 「間違えた曲だけ復習する」：直前のrenderResult()でgameState.reviewSongs/
// reviewCategoryFilterValueに保持しておいた内容をもとに、復習クイズを組み立てて開始する。
// 通常プレイ後・復習プレイ後のどちらの結果画面から呼ばれても、同じ処理でそのまま動く。
function beginReviewQuiz() {
  stopTimer();
  stopAudio();
  const distractorPool = filterSongsByCategory(SONGS, gameState.reviewCategoryFilterValue);
  const questions = buildReviewQuizQuestions(gameState.reviewSongs, distractorPool);
  startReviewQuiz(questions);
  renderQuestion();
  showScreen("quiz");
}

reviewMissedSongsButtonElement.addEventListener("click", () => {
  playClickSound();
  beginReviewQuiz();
});

// 「タイトルに戻る」：出題数・カテゴリの選択も含めて初期状態に戻し、スタート画面へ。
// タイトル（スタート画面）へ戻る共通処理。「タイトルに戻る」ボタン（通常プレイ・復習の結果）と、
// 特別モードの結果に表示する控えめなテキストリンクの、両方から呼ばれる。
function goToTitle() {
  stopTimer();
  stopAudio();
  resetGameState();
  showScreen("start");
  updateModeBestScoreDisplay(); // 直前のプレイで自己ベストが更新されている可能性があるので表示し直す
}

backToTitleButtonElement.addEventListener("click", () => {
  playClickSound();
  goToTitle();
});

// 「特別モード一覧に戻る」（特別モードの結果にだけ表示）：特別モード一覧画面へ戻る。
function goToSpecialModes() {
  stopTimer();
  stopAudio();
  resetGameState();
  showScreen("specialModes");
}

backToSpecialModesButtonElement.addEventListener("click", () => {
  playClickSound();
  goToSpecialModes();
});

// 専用の一覧画面を持つモード（例：オリジナル問題作成モード）でだけ表示する「◯◯一覧に戻る」。
// 戻り先の処理はSPECIAL_MODES_DISPLAYのonBackToListに任せる（モードが増えても分岐を足す必要がない）。
// resetGameState()はgameState.specialModeIdをnullに戻してしまうため、必ず先にonBackToListを
// 取り出しておく。
backToModeListButtonElement.addEventListener("click", () => {
  playClickSound();
  const onBackToList = SPECIAL_MODES_DISPLAY[gameState.specialModeId]?.onBackToList;
  stopTimer();
  stopAudio();
  resetGameState();
  onBackToList?.();
});

// 専用の一覧画面を持つモードの結果でだけ表示する、控えめな「特別モード一覧に戻る」リンク。
// 動きはボタン版（back-to-special-modes-button）と同じ。
backToSpecialModesLinkElement.addEventListener("click", () => {
  playClickSound();
  goToSpecialModes();
});

// 特別モードの結果にだけ表示する、控えめな「タイトルに戻る」リンク。動きはボタン版と同じ。
backToTitleLinkFromSpecialElement.addEventListener("click", () => {
  playClickSound();
  goToTitle();
});

// クイズ画面の「タイトルへ」：いきなり戻らず、必ず確認モーダルを挟む。
function openQuizQuitConfirmModal() {
  playClickSound();
  quizQuitConfirmModalElement.hidden = false;
}

function closeQuizQuitConfirmModal() {
  quizQuitConfirmModalElement.hidden = true;
}

quizBackButtonElement.addEventListener("click", openQuizQuitConfirmModal);

quizQuitCancelButtonElement.addEventListener("click", () => {
  playClickSound();
  closeQuizQuitConfirmModal();
});

// オーバーレイの背景部分をクリックしたときも閉じる（他のモーダルと同じ考え方）。
quizQuitConfirmModalElement.addEventListener("click", (event) => {
  if (event.target === quizQuitConfirmModalElement) {
    closeQuizQuitConfirmModal();
  }
});

// 確認モーダルの確定ボタン：通常プレイ・復習では、結果画面の「タイトルに戻る」ボタンと
// 全く同じ処理を行う。苦手曲モード・オリジナル問題作成モードのクイズ中（playMode==="special"）
// だけ、それぞれの確認/一覧画面に戻る（文言もupdateQuizQuitDisplay()で切り替え済み）。
// どちらの場合も、renderResult()を経由しないため、自己ベスト・称号・プレイ履歴の
// いずれにも一切反映されない（この3つはすべてrenderResult()の中でのみ保存処理が呼ばれる設計）。
// resetGameState()はgameState.specialModeIdをnullに戻してしまうため、必ず先にonQuizBackを
// 取り出しておく（backToModeListButtonElementのクリック処理と同じ理由）。
quizQuitConfirmButtonElement.addEventListener("click", () => {
  playClickSound();
  closeQuizQuitConfirmModal();
  const isSpecial = gameState.playMode === "special";
  const onQuizBack = isSpecial ? SPECIAL_MODES_DISPLAY[gameState.specialModeId]?.onQuizBack : null;
  stopTimer();
  stopAudio();
  resetGameState();
  if (onQuizBack) {
    onQuizBack();
  } else {
    showScreen("start");
    updateModeBestScoreDisplay();
  }
});

// ルール説明モーダルの開閉。start/quiz/resultの画面切り替え（showScreen）とは無関係な、
// 単純な表示/非表示の切り替えのみで済ませている（出題数・カテゴリの選択状態には一切触れない）。
function openRulesModal() {
  playClickSound();
  rulesModalElement.hidden = false;
}

function closeRulesModal() {
  rulesModalElement.hidden = true;
}

rulesLinkElement.addEventListener("click", openRulesModal);
rulesModalCloseButtonElement.addEventListener("click", closeRulesModal);

// オーバーレイ部分（背景）をクリックしたときも閉じる。
// モーダルカード自体のクリックはバブリングで拾ってしまうと誤って閉じるため、
// クリックされた要素がオーバーレイそのものだったときだけ閉じるようにする。
rulesModalElement.addEventListener("click", (event) => {
  if (event.target === rulesModalElement) {
    closeRulesModal();
  }
});

// 苦手曲モードの判定ルール説明モーダル。開閉の仕組みはルール説明モーダルと全く同じ。
function openWeakSongsRulesModal() {
  playClickSound();
  weakSongsRulesModalElement.hidden = false;
}

function closeWeakSongsRulesModal() {
  weakSongsRulesModalElement.hidden = true;
}

weakSongsRulesLinkElement.addEventListener("click", openWeakSongsRulesModal);
weakSongsRulesModalCloseButtonElement.addEventListener("click", closeWeakSongsRulesModal);

weakSongsRulesModalElement.addEventListener("click", (event) => {
  if (event.target === weakSongsRulesModalElement) {
    closeWeakSongsRulesModal();
  }
});

// オリジナル問題作成モードの説明モーダル。開閉の仕組みは他の説明モーダルと全く同じ。
function openCustomQuizRulesModal() {
  playClickSound();
  customQuizRulesModalElement.hidden = false;
}

function closeCustomQuizRulesModal() {
  customQuizRulesModalElement.hidden = true;
}

customQuizRulesLinkElement.addEventListener("click", openCustomQuizRulesModal);
customQuizRulesModalCloseButtonElement.addEventListener("click", closeCustomQuizRulesModal);

customQuizRulesModalElement.addEventListener("click", (event) => {
  if (event.target === customQuizRulesModalElement) {
    closeCustomQuizRulesModal();
  }
});

// オリジナル問題作成モード「一覧画面」の説明モーダル（モード全体の説明）。
// 選曲画面側の説明モーダルとは別に、開閉の仕組みだけ同じものを用意する。
function openCustomQuizPresetsRulesModal() {
  playClickSound();
  customQuizPresetsRulesModalElement.hidden = false;
}

function closeCustomQuizPresetsRulesModal() {
  customQuizPresetsRulesModalElement.hidden = true;
}

customQuizPresetsRulesLinkElement.addEventListener("click", openCustomQuizPresetsRulesModal);
customQuizPresetsRulesModalCloseButtonElement.addEventListener("click", closeCustomQuizPresetsRulesModal);

customQuizPresetsRulesModalElement.addEventListener("click", (event) => {
  if (event.target === customQuizPresetsRulesModalElement) {
    closeCustomQuizPresetsRulesModal();
  }
});

// 「収録曲一覧」リンク：開くたびに、最新のシングルだけ展開した状態から始める。
songlistLinkElement.addEventListener("click", () => {
  playClickSound();
  resetSongListToDefaultView();
  showScreen("songlist");
});

// 収録曲一覧画面の「戻る」：試聴中の曲を必ず止めてからスタート画面へ戻る。
songlistBackButtonElement.addEventListener("click", () => {
  playClickSound();
  stopSongListPreview();
  showScreen("start");
});

// 「プレイ履歴」リンク：開くたびに最新の記録で描画し直す
// （直前のプレイがあれば、その分もすぐ反映されるようにするため）。
historyLinkElement.addEventListener("click", () => {
  playClickSound();
  renderHistoryScreen();
  showScreen("history");
});

// プレイ履歴画面の「戻る」：スタート画面へ戻る。
historyBackButtonElement.addEventListener("click", () => {
  playClickSound();
  showScreen("start");
});

// プレイ履歴詳細画面の「戻る」：一覧画面へ戻る。
// renderHistoryScreen()は呼び直さない（詳細画面を見ている間に履歴データが増えることはない
// ＝復習プレイは履歴に保存されないため、一覧を再構築する必要がない）。
// ただし、画面はページ全体が縦スクロールする作りのため、一覧を再構築しないだけでは
// スクロール位置は保たれない（詳細画面の表示中に、ページのスクロール位置自体が変わるため）。
// そのため、詳細画面を開く直前の位置をhistoryListScrollYに保存しておき、ここで復元する。
historyDetailBackButtonElement.addEventListener("click", () => {
  playClickSound();
  showScreen("history");
  window.scrollTo(0, historyListScrollY);
});

// 「特別モード」リンク：一覧画面を開く（一覧の中身は固定なので描画し直す必要はない）。
specialModesLinkElement.addEventListener("click", () => {
  playClickSound();
  showScreen("specialModes");
});

// 特別モード一覧画面の「戻る」：スタート画面へ戻る。
specialModesBackButtonElement.addEventListener("click", () => {
  playClickSound();
  showScreen("start");
});

// 苦手曲モード確認画面の「戻る」：特別モード一覧画面へ戻る（スタート画面まで一気には戻らない）。
weakSongsBackButtonElement.addEventListener("click", () => {
  playClickSound();
  showScreen("specialModes");
});

// オリジナル問題作成モードの選曲画面の「戻る」：プリセット一覧画面へ戻る
// （スタート画面まで一気には戻らない。特別モード一覧までは、プリセット一覧の「戻る」で戻る）。
// 画面内の「複製する」で保存せずこの画面に留まったまま新しいプリセットができている場合があるため、
// 必ず最新の内容で一覧を描画し直してから戻る。試聴中の曲があれば必ず止める。
customQuizBackButtonElement.addEventListener("click", () => {
  playClickSound();
  stopCustomQuizPreview();
  renderCustomQuizPresetsScreen();
  showScreen("customQuizPresets");
});

// オリジナル問題作成モードのプリセット一覧画面の「戻る」：特別モード一覧画面へ戻る。
customQuizPresetsBackButtonElement.addEventListener("click", () => {
  playClickSound();
  showScreen("specialModes");
});

// 出題数・カテゴリのラジオボタンが切り替わるたびに、自己ベスト表示・出題数の案内を更新する。
// ページを開いた直後（初期選択の状態）の分も、ここで一度呼んでおく。
document
  .querySelectorAll('input[name="question-count"], input[name="category-filter"]')
  .forEach((radio) => {
    radio.addEventListener("change", updateModeBestScoreDisplay);
    radio.addEventListener("change", updateQuestionCountNotice);
  });
updateModeBestScoreDisplay();
updateQuestionCountNotice();

// カテゴリの選択肢に添える対象曲数は、ゲームの状態と関係なく最初に1回だけ計算すればよい。
updateCategoryCountHints();

// 音源の読み込み状況（IndexedDBに何曲保存済みか）を表示に反映する。
// SONGSの曲数と突き合わせ、未読み込みの曲があれば件数を案内する。
async function updateAudioImportStatus() {
  const importedSongIds = await getImportedSongIds();
  const importedSet = new Set(importedSongIds);
  const missingCount = SONGS.filter((song) => !importedSet.has(song.id)).length;

  audioImportStatusElement.textContent =
    missingCount === 0
      ? `音源：全${SONGS.length}曲 読み込み済み`
      : `音源：${SONGS.length - missingCount}/${SONGS.length}曲 読み込み済み（${missingCount}曲未読み込み）`;
}

// 「音源を読み込む」ボタン（実体は隠したinput[type=file]）でファイルが選ばれたときの処理。
// 選んだファイルのうちファイル名がsongsのidと一致するものだけをIndexedDBに保存する。
// 一部の曲だけを選んでも、選んだ分だけが追加・上書きされる（差分インポート。js/audioStorage.js参照）。
audioImportInputElement.addEventListener("change", async () => {
  const files = [...audioImportInputElement.files];
  if (files.length === 0) return;

  const { savedSongIds, unmatchedFileNames } = await importAudioFiles(files);

  audioImportResultElement.hidden = false;
  audioImportResultElement.textContent =
    unmatchedFileNames.length > 0
      ? `${savedSongIds.length}曲を読み込みました（${unmatchedFileNames.length}件はファイル名が曲データと一致しませんでした）`
      : `${savedSongIds.length}曲を読み込みました`;

  // 同じファイルをもう一度選んでも change イベントが発火するように、選択状態をリセットする
  audioImportInputElement.value = "";
  await updateAudioImportStatus();
});

updateAudioImportStatus();

// songIdから曲名を引く（見つからない場合はsongIdそのものを表示に使う）。
// 歌詞インポートの結果表示・警告確認パネルで、歌詞本文の代わりに曲名を示すために使う。
function findSongTitle(songId) {
  const song = SONGS.find((item) => item.id === songId);
  return song ? song.title : songId;
}

// 歌詞データの読み込み状況をスタート画面に反映する。
// 音源の「◯/81曲」という分母付きの表示とは違い、あえて分母を出さない。
// 歌詞データは当面すべての曲が揃う予定はないため、分母を出すと長期間「未完成」に
// 見えてしまうのを避けるための表現上の判断（本人と合意済み）。
async function updateLyricsImportStatus() {
  const importedSongIds = await getImportedLyricsSongIds();
  lyricsImportStatusElement.textContent =
    importedSongIds.length === 0
      ? "歌詞データ：未読み込み"
      : `歌詞データ：${importedSongIds.length}曲分 読み込み済み`;
}

// 警告があるファイルの一覧を確認パネルへ組み立てる。
// 歌詞本文（text）は一切表示せず、ファイル名・曲名・新規/更新・警告内容（行番号や秒数）だけを見せる。
// innerHTMLでの文字列組み立てはファイル名に含まれる文字によって崩れる可能性があるため、
// DOM APIで安全に組み立てる。
function renderLyricsWarningList(warningFiles) {
  lyricsWarningListElement.textContent = "";

  warningFiles.forEach((file) => {
    const details = document.createElement("details");
    details.className = "lyrics-warning-item";

    const summary = document.createElement("summary");
    const songTitle = findSongTitle(file.normalizedData.songId);
    const updateLabel = file.isUpdate ? "更新" : "新規";
    summary.textContent = `${file.fileName}｜${songTitle}（${updateLabel}）｜警告${file.warnings.length}件`;
    details.appendChild(summary);

    const warningListElement = document.createElement("ul");
    file.warnings.forEach((warningText) => {
      const item = document.createElement("li");
      item.textContent = warningText;
      warningListElement.appendChild(item);
    });
    details.appendChild(warningListElement);

    lyricsWarningListElement.appendChild(details);
  });
}

// 1回のファイル選択の中で、警告確認パネルの表示中〜結果表示までの間だけ必要になる一時的な状態。
// ファイルを選び直すたびに作り直すため、前回選択分が混ざることはない。
let pendingLyricsWarningFiles = [];
let pendingLyricsFailedFiles = [];
let pendingLyricsReadyTally = { newCount: 0, updateCount: 0 };

// 「問題なし／警告あり／エラー」の3行にまとめた最終結果を表示する。
function showLyricsImportResult({ readyTally, warningOutcome, failedFiles }) {
  const lines = [];

  lines.push(
    `問題なし：${readyTally.newCount + readyTally.updateCount}件保存（新規${readyTally.newCount}・更新${readyTally.updateCount}）`
  );

  if (warningOutcome.total > 0) {
    lines.push(
      warningOutcome.saved
        ? `警告あり：${warningOutcome.total}件保存（新規${warningOutcome.newCount}・更新${warningOutcome.updateCount}）`
        : `警告あり：${warningOutcome.total}件保存せず`
    );
  }

  if (failedFiles.length > 0) {
    lines.push(`エラー：${failedFiles.length}件保存失敗`);
    failedFiles.forEach((file) => {
      lines.push(`　- ${file.fileName}：${file.errors.join(" / ")}`);
    });
  }

  lyricsImportResultElement.hidden = false;
  lyricsImportResultElement.textContent = lines.join("\n");
}

// 「歌詞を読み込む」ボタン（実体は隠したinput[type=file]）でファイルが選ばれたときの処理。
// データの解析（読み取り・正規化・検証・重複songIdの確認）はjs/lyricsStorage.jsの
// analyzeLyricsFiles()に任せ、ここではその結果を見て「保存するかどうか」「どう表示するか」だけを扱う。
lyricsImportInputElement.addEventListener("change", async () => {
  const files = [...lyricsImportInputElement.files];
  if (files.length === 0) return;

  const { readyFiles, warningFiles, failedFiles } = await analyzeLyricsFiles(files);

  // 警告のないファイルは、確認を待たずにその場で保存する。
  let newCount = 0;
  let updateCount = 0;
  const collectedFailures = [...failedFiles];

  for (const file of readyFiles) {
    const result = await saveLyricsData(file.normalizedData);
    if (result.saved) {
      if (file.isUpdate) updateCount++;
      else newCount++;
    } else {
      collectedFailures.push({ fileName: file.fileName, errors: result.errors });
    }
  }

  await updateLyricsImportStatus();

  pendingLyricsReadyTally = { newCount, updateCount };
  pendingLyricsFailedFiles = collectedFailures;

  if (warningFiles.length > 0) {
    // 警告があるファイルは、1件ずつモーダルを出さず、まとめて確認してから保存するかどうかを決める。
    pendingLyricsWarningFiles = warningFiles;
    renderLyricsWarningList(warningFiles);
    lyricsWarningPanelElement.hidden = false;
    lyricsImportResultElement.hidden = true;
  } else {
    showLyricsImportResult({
      readyTally: pendingLyricsReadyTally,
      warningOutcome: { total: 0, saved: false, newCount: 0, updateCount: 0 },
      failedFiles: pendingLyricsFailedFiles,
    });
  }

  // 同じファイルをもう一度選んでも change イベントが発火するように、選択状態をリセットする
  lyricsImportInputElement.value = "";
});

// 警告確認パネル：「警告があるファイルも保存する」
lyricsWarningSaveButtonElement.addEventListener("click", async () => {
  let warningNewCount = 0;
  let warningUpdateCount = 0;

  for (const file of pendingLyricsWarningFiles) {
    const result = await saveLyricsData(file.normalizedData);
    if (result.saved) {
      if (file.isUpdate) warningUpdateCount++;
      else warningNewCount++;
    } else {
      pendingLyricsFailedFiles.push({ fileName: file.fileName, errors: result.errors });
    }
  }

  await updateLyricsImportStatus();
  lyricsWarningPanelElement.hidden = true;

  showLyricsImportResult({
    readyTally: pendingLyricsReadyTally,
    warningOutcome: {
      total: pendingLyricsWarningFiles.length,
      saved: true,
      newCount: warningNewCount,
      updateCount: warningUpdateCount,
    },
    failedFiles: pendingLyricsFailedFiles,
  });

  pendingLyricsWarningFiles = [];
});

// 警告確認パネル：「警告があるファイルは保存しない」（＝既存データはそのまま変更しない）
lyricsWarningDiscardButtonElement.addEventListener("click", () => {
  const discardedCount = pendingLyricsWarningFiles.length;
  lyricsWarningPanelElement.hidden = true;

  showLyricsImportResult({
    readyTally: pendingLyricsReadyTally,
    warningOutcome: { total: discardedCount, saved: false, newCount: 0, updateCount: 0 },
    failedFiles: pendingLyricsFailedFiles,
  });

  pendingLyricsWarningFiles = [];
});

updateLyricsImportStatus();

// PWA対応：Service Workerを登録し、新しいバージョンが使えるようになったらバナーで知らせる。
// 黙って新しいコードに切り替えると、プレイ中に予期しない動作をする可能性があるため、
// 必ず本人が「更新する」を押してから切り替える設計にしている。
let pendingUpdateRegistration = null;

// 「更新する」バナーを表示する処理を1箇所にまとめる。
// ①すでに待機中のバージョンがある場合（アプリを閉じている間に更新の準備が整っていた等）と、
// ②今まさに新しいバージョンが見つかった場合（updatefound）の、2箇所から呼ばれる。
function showUpdateBanner(registration) {
  pendingUpdateRegistration = registration;
  updateAvailableBannerElement.hidden = false;
}

function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("./sw.js")
    .then((registration) => {
      // ①登録が完了した時点で、すでに待機中の新しいバージョンがないかを確認する。
      // 前回のセッション中にインストールだけ終わっていて、更新バナーを押せないまま
      // アプリを閉じた（スマホでアプリを閉じた等）場合、updatefoundは発生し直さないため、
      // このチェックがないと更新可能な状態のまま二度とバナーが出ない。
      if (registration.waiting) {
        showUpdateBanner(registration);
      }

      // ②今まさにこのセッション中に新しいバージョンが見つかった場合。
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          // controllerがある（＝すでに動いているService Workerがいる）状態での
          // installedは「新しいバージョンが準備できた」を意味する。
          // controllerがまだない初回登録時のinstalledはただの初回セットアップなので無視する。
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(registration);
          }
        });
      });
    })
    .catch(() => {
      // Service Workerが使えない環境（非対応ブラウザ等）でも、アプリ自体は問題なく動き続けられるようにする
    });

  // 新しいService Workerが有効化されたら、最新のコードを反映するために1回だけ再読み込みする。
  let hasReloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    window.location.reload();
  });
}

updateReloadButtonElement.addEventListener("click", () => {
  pendingUpdateRegistration?.waiting?.postMessage("skipWaiting");
});

initServiceWorker();

// キーボード操作対応。マウス・タップ操作は今まで通り使えるようにしたうえで、
// 今表示されている画面に応じてキー入力を割り当てる。
document.addEventListener("keydown", (event) => {
  // ルール説明モーダルが開いているときは、Escキーで閉じる。
  // それ以外のキー（スタート画面のEnterなど）は、モーダルを読んでいる間に
  // 誤って反応してしまわないよう、ここで処理を止めて下の分岐に進ませない。
  if (!rulesModalElement.hidden) {
    if (event.key === "Escape") {
      closeRulesModal();
    }
    return;
  }

  // 苦手曲モードの判定ルール説明モーダルが開いているときも、同じ考え方でEscキーに対応する。
  if (!weakSongsRulesModalElement.hidden) {
    if (event.key === "Escape") {
      closeWeakSongsRulesModal();
    }
    return;
  }

  // オリジナル問題作成モードの説明モーダルが開いているときも、同じ考え方でEscキーに対応する。
  if (!customQuizRulesModalElement.hidden) {
    if (event.key === "Escape") {
      closeCustomQuizRulesModal();
    }
    return;
  }

  // オリジナル問題作成モード「一覧画面」の説明モーダルも同様。
  if (!customQuizPresetsRulesModalElement.hidden) {
    if (event.key === "Escape") {
      closeCustomQuizPresetsRulesModal();
    }
    return;
  }

  // 称号一覧モーダルが開いているときも、他画面のショートカットを妨げないよう先に止める。
  // 開閉（Escキーを含む）自体はtitleList.js側のリスナーがすでに処理しているので、
  // ここでは何もせずreturnするだけでよい。
  if (!titleListModalElement.hidden) {
    return;
  }

  // プレイ履歴の削除確認モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はhistoryScreen.js側のリスナーがすでに処理している。
  if (!historyClearConfirmModalElement.hidden) {
    return;
  }

  // オリジナル問題作成モードのプリセット詳細モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はcustomQuizPresetsScreen.js側のリスナーがすでに処理している。
  if (!customQuizPresetDetailModalElement.hidden) {
    return;
  }

  // プリセット削除の確認モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はcustomQuizScreen.js側のリスナーがすでに処理している。
  if (!customQuizDeleteConfirmModalElement.hidden) {
    return;
  }

  // 一覧カードから削除するときの確認モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はcustomQuizPresetsScreen.js側のリスナーがすでに処理している。
  if (!customQuizPresetsDeleteConfirmModalElement.hidden) {
    return;
  }

  // クイズ中断・確認モーダルが開いているときは、Escキーで閉じる（＝中断をキャンセル）。
  // このモーダルの開閉ロジックはこのファイルで直接管理しているため、rulesModalと同じ書き方にする。
  if (!quizQuitConfirmModalElement.hidden) {
    if (event.key === "Escape") {
      closeQuizQuitConfirmModal();
    }
    return;
  }

  // スタート画面：Enterキーでスタート
  if (startScreenElement.classList.contains("is-active") && event.key === "Enter") {
    document.getElementById("start-button").click();
    return;
  }

  if (quizScreenElement.classList.contains("is-active")) {
    // クイズ画面：Escキーで、クイズ中断の確認モーダルを開く。
    // ここに到達している時点で（上のガードにより）他のモーダルは開いていないと分かっているため、
    // 「開いていなければ開く」の判定を別途書く必要はない。Escだけで即座にタイトルへ戻ることはなく、
    // 必ずこの確認モーダルを経由する。
    if (event.key === "Escape") {
      openQuizQuitConfirmModal();
      return;
    }

    // クイズ画面：1〜4キーで、対応する選択肢を選ぶ
    const choiceIndex = Number(event.key) - 1;
    if (choiceIndex >= 0 && choiceIndex < choiceButtonElements.length) {
      choiceButtonElements[choiceIndex].click();
      return;
    }

    // クイズ画面：回答後（次へボタンが表示されているとき）にEnterキーで次の問題へ
    if (event.key === "Enter" && !nextButtonElement.hidden) {
      nextButtonElement.click();
    }
  }
});
