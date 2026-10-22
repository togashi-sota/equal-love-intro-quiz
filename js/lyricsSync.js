// 試聴中の曲に合わせて、歌詞を再生位置に同期表示するための共通モジュール。
// 収録曲一覧（songlist.js）とオリジナル問題作成モードの選曲画面（customQuizScreen.js）は
// それぞれ別々の<audio>要素・別々のミニプレイヤーUIを持っているため、
// このモジュールはどちらの<audio>要素・どちらのパネル要素に対しても同じ関数で使えるように、
// 「今どの要素を対象にしているか」を呼び出し時の引数として受け取る設計にしている
// （audioPreview.jsのように内部で1つの<audio>要素だけを覚える設計にはしていない）。
//
// 歌詞データがない曲では、パネル自体を表示しない（音源が未読み込みの曲でエラー表示を
// 出さないのと同じ、このプロジェクトの一貫した方針）。

import { getLyricsData } from "./lyricsStorage.js";
import { closeFullscreenLyrics } from "./lyricsFullscreen.js";
import { createPlaybackFrameTicker } from "./playbackFrameTicker.js";

// ユーザーが手動でパネルをスクロールしてから、自動追従を再開するまでの猶予（ミリ秒）。
const MANUAL_SCROLL_SUPPRESS_MS = 4000;

// 【2026-10-23追加：追尾性能改善 第1段階（表示側だけの改善。歌詞の時刻データは一切変えていない）】
// 行と行の間の短い隙間（この秒数以下）では、前の行の強調を消さずに残す（隙間で一瞬消えるちらつき対策）。
// 長い間奏・無音（この秒数より長い隙間）では、これまでどおり強調を外す。
export const LYRICS_GAP_HOLD_SEC = 1.0;
// この秒数より短い行へ切り替わるとき、または直前の自動スクロールからこのミリ秒以内のときは、
// なめらかスクロールを待たず即座にスクロールする（ラップなど短い行の連続でスクロールが遅れないように）。
const SHORT_LINE_SEC = 1.2;
const RAPID_SCROLL_MS = 700;
// 自動スクロールの「自分で起こしたスクロール」扱いを解除するまでの予備の時間（scrollend が使えない環境用）。
// なめらかスクロールは端末によって500msより長くかかり、手動スクロールと誤判定されていたため長めにする。
const PROGRAMMATIC_SCROLL_RESET_SMOOTH_MS = 1000;
const PROGRAMMATIC_SCROLL_RESET_INSTANT_MS = 200;

// 「同期表示」（ハイライト+自動スクロール）と「全文表示」（ハイライト・自動スクロールなし、
// 自分のペースで自由に読める）の2つの表示モード。曲ごとではなく共通の設定として
// localStorageに保存し、次回以降も引き継ぐ。
const DISPLAY_MODE_STORAGE_KEY = "equalLoveIntroQuiz.lyricsDisplayMode";
const DISPLAY_MODE_SYNC = "sync";
const DISPLAY_MODE_FULL = "full";

// 【QAで発見・修正：2026-09-07】このファイルはmain.jsのimportグラフからモジュール読み込み
// 時点（DOMContentLoaded等より前）で即座に評価され、下のdisplayMode初期化がその場で
// loadDisplayModePreference()を呼ぶ。localStorage自体が使えない環境（一部のプライベート
// ブラウズ・サンドボックス化されたWebView等ではgetItem()が例外を投げることがある）だと、
// try/catch無しではこのモジュール自体の評価が失敗し、main.js以下の初期化処理が
// 1つも実行されないまま真っ白な画面で起動不能になっていた。js/audio.js・
// js/soundManager.js等、他の「モジュール読み込み時に即座にlocalStorageを読む」箇所は
// 既にtry/catchで保護済みで、このファイルだけ抜け漏れていた。
function loadDisplayModePreference() {
  try {
    const saved = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
    return saved === DISPLAY_MODE_FULL ? DISPLAY_MODE_FULL : DISPLAY_MODE_SYNC;
  } catch {
    return DISPLAY_MODE_SYNC;
  }
}

function saveDisplayModePreference(mode) {
  try {
    localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
  } catch {
    // 保存に失敗しても（プライベートブラウズ・ストレージ容量超過等）アプリ自体は動き続けられるようにする。
  }
}

let audioElement = null;
let panelElement = null;
let renderedLines = []; // { element, start, end }
let activeIndex = -1;
let autoScrollEnabled = true;
let suppressAutoScrollUntil = 0;
let isProgrammaticScroll = false;
let programmaticScrollResetTimerId = null;
let displayMode = loadDisplayModePreference();
let modeToggleButtonElement = null;
let onLineClickCallback = null; // 呼び出し元が独自のタップ処理をしたい場合のフック（js/karaokeSyncScreen.js参照）
let frameTicker = null; // 再生中だけ毎フレーム再生位置を確認する（js/playbackFrameTicker.js）
let lastAutoScrollAt = -Infinity;

function handleTimeUpdate() {
  updateActiveLyricsLine(audioElement.currentTime);
}

// シークバー操作・10秒送り/戻しはaudio.currentTimeを直接書き換えるため、
// 標準のseekingイベントが必ず発火する。timeupdateを待たず即座に追従させる。
function handleSeeking() {
  updateActiveLyricsLine(audioElement.currentTime, { immediate: true });
}

// 曲が最後まで再生し終えたら、ハイライトを解除する（行の表示自体は残す）。
function handleEnded() {
  applyActiveIndex(-1);
}

function handlePanelScroll() {
  if (isProgrammaticScroll) return;
  suppressAutoScrollUntil = Date.now() + MANUAL_SCROLL_SUPPRESS_MS;
}

// 自分で起こしたスクロールが終わったら、すぐに手動スクロールの検知を再開する（scrollend 対応環境のみ）
function handlePanelScrollEnd() {
  if (!isProgrammaticScroll) return;
  isProgrammaticScroll = false;
  if (programmaticScrollResetTimerId !== null) {
    clearTimeout(programmaticScrollResetTimerId);
    programmaticScrollResetTimerId = null;
  }
}

// 再生が始まったとき・アプリが裏から戻ったとき：今の再生位置へ合わせ直す（手動スクロール中の猶予は守る）
function handlePlaybackResume(currentTime) {
  updateActiveLyricsLine(currentTime, { resync: true });
}

// 切替ボタンには「今から切り替わる先」のモード名を表示する
// （例：同期表示中は「全文表示にする」、全文表示中は「同期表示に戻す」）。
function modeToggleButtonLabel() {
  return displayMode === DISPLAY_MODE_FULL ? "同期表示に戻す" : "全文表示にする";
}

function updateModeToggleButtonLabel() {
  if (modeToggleButtonElement) {
    modeToggleButtonElement.textContent = modeToggleButtonLabel();
  }
}

// 表示モードを切り替える。全文表示に切り替えた瞬間はハイライトを解除し、
// 同期表示に戻した瞬間は今の再生位置に合わせて即座に追従させる。
function handleModeToggleClick() {
  displayMode = displayMode === DISPLAY_MODE_FULL ? DISPLAY_MODE_SYNC : DISPLAY_MODE_FULL;
  saveDisplayModePreference(displayMode);
  if (panelElement) {
    panelElement.classList.toggle("is-full-text-mode", displayMode === DISPLAY_MODE_FULL);
  }
  updateModeToggleButtonLabel();
  if (displayMode === DISPLAY_MODE_FULL) {
    applyActiveIndex(-1);
  } else if (audioElement) {
    updateActiveLyricsLine(audioElement.currentTime, { immediate: true });
  }
}

// 現在時刻から該当行のインデックスを求める純粋関数（DOM・音源に一切触れない）。
// start <= currentTime < end を満たす行を「現在行」とする。
// 複数行が同時に該当する場合（ハモリ・掛け合い等でwarnings付きのまま保存されたデータ）は、
// 最後に開始した行（＝最も遅くstartする行）を採用する。linesはstartが時系列順であることが
// Step1のvalidateLyricsData()で保証されているため、先頭から順に見て最後に見つかったものが
// 必ず最も遅く開始した行になる。該当する行が1つもない場合（曲の先頭より前、最後の行より後、
// 行と行の間の空白区間、linesが空）は-1を返す。
export function findActiveLineIndex(lines, currentTime) {
  let result = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentTime >= lines[i].start && currentTime < lines[i].end) {
      result = i;
    }
  }
  return result;
}

// 【2026-10-23追加】表示用の現在行。findActiveLineIndex() の結果をそのまま使い、どの行にも当たらない
// ときだけ「直前に終わった行と次の行の隙間が holdGapSec 以下なら、直前の行を現在行のままにする」。
// 最後の行の後（次の行が無い）や長い間奏では -1 を返す。findActiveLineIndex() 自体は変えていないため、
// それを使う他の機能（コール・カラオケ同期・歌詞エディタ等）の判定には影響しない。純粋関数。
export function findDisplayLineIndex(lines, currentTime, holdGapSec = LYRICS_GAP_HOLD_SEC) {
  const activeIndex = findActiveLineIndex(lines, currentTime);
  if (activeIndex !== -1) return activeIndex;
  let previousIndex = -1;
  let nextStart = Infinity;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].end <= currentTime && (previousIndex === -1 || lines[i].end >= lines[previousIndex].end)) {
      previousIndex = i;
    }
    if (lines[i].start > currentTime && lines[i].start < nextStart) {
      nextStart = lines[i].start;
    }
  }
  if (previousIndex === -1 || nextStart === Infinity) return -1;
  return nextStart - lines[previousIndex].end <= holdGapSec ? previousIndex : -1;
}

// 行のハイライト（クラスの付け替え）だけを行う。実際に変わったかどうかを返す。
function applyActiveIndex(index) {
  if (index === activeIndex) return false;
  activeIndex = index;
  renderedLines.forEach((line, i) => {
    line.element.classList.toggle("is-current-lyrics-line", i === index);
  });
  return true;
}

function scrollToLine(index, { immediate }) {
  const target = renderedLines[index];
  if (!target || !panelElement) return;

  isProgrammaticScroll = true;
  target.element.scrollIntoView({ block: "center", behavior: immediate ? "auto" : "smooth" });

  // scrollイベントが実際に収まるまでの猶予。scrollend が来ればその時点で戻し（handlePanelScrollEnd）、
  // 来ない環境・パネル自体がスクロールしなかった場合に備えて、一定時間後にも必ず戻す。
  if (programmaticScrollResetTimerId !== null) {
    clearTimeout(programmaticScrollResetTimerId);
  }
  programmaticScrollResetTimerId = setTimeout(
    () => {
      isProgrammaticScroll = false;
      programmaticScrollResetTimerId = null;
    },
    immediate ? PROGRAMMATIC_SCROLL_RESET_INSTANT_MS : PROGRAMMATIC_SCROLL_RESET_SMOOTH_MS
  );
}

// 現在の再生位置を渡し、該当する行のハイライト・自動スクロールを更新する。
// options.immediate: true の場合、自動追従の一時停止中でも即座に（スクロールは瞬間移動で）追従する
// （シーク直後・曲の読み込み直後に使う）。
// options.resync: true の場合、行が変わっていなくても今の行へ瞬間移動でスクロールし直す。ただし手動スクロール中の
// 猶予は守る（再生再開・アプリが裏から戻ったときに使う。2026-10-23追加）。
// 再生中は毎フレーム（js/playbackFrameTicker.js）と timeupdate の両方から呼ばれるが、行が変わったときだけ
// 表示を書き換えるため、二重に呼ばれても同じ行のハイライト・スクロールを繰り返すことはない。
export function updateActiveLyricsLine(currentTime, options = {}) {
  if (renderedLines.length === 0) return;
  if (displayMode === DISPLAY_MODE_FULL) return; // 全文表示モードでは、ハイライト・自動スクロールを行わない

  const index = findDisplayLineIndex(renderedLines, currentTime);
  const changed = applyActiveIndex(index);

  if (index === -1) return;
  if (!changed && !options.immediate && !options.resync) return; // 同じ行のままなら何もしない

  if (options.immediate) {
    scrollToLine(index, { immediate: true });
    lastAutoScrollAt = performance.now();
    return;
  }

  const shouldAutoScroll = autoScrollEnabled && Date.now() >= suppressAutoScrollUntil;
  if (shouldAutoScroll) {
    // 短い行への切り替え・スクロールが連続しているとき・再同期のときは、なめらかスクロールを待たず即座に動かす
    const line = renderedLines[index];
    const now = performance.now();
    const instant = options.resync || line.end - line.start < SHORT_LINE_SEC || now - lastAutoScrollAt < RAPID_SCROLL_MS;
    scrollToLine(index, { immediate: instant });
    lastAutoScrollAt = now;
  }
}

// パネルの中身・購読しているイベントをすべて片付ける。
// 曲を停止する・別の曲へ切り替える・画面を離れるときに必ず呼ぶ。
export function destroyLyricsSync() {
  // 全画面表示が開いたままだと、この後panelElementの中身を消してしまい、
  // 全画面側に空のパネルが取り残される。必ず先に閉じて、パネルを元の場所へ戻す
  // （全画面が開いていなければ何もしない安全な呼び出し）。
  closeFullscreenLyrics();

  if (frameTicker) {
    frameTicker.destroy();
    frameTicker = null;
  }
  if (audioElement) {
    audioElement.removeEventListener("timeupdate", handleTimeUpdate);
    audioElement.removeEventListener("seeking", handleSeeking);
    audioElement.removeEventListener("ended", handleEnded);
  }
  if (panelElement) {
    panelElement.removeEventListener("scroll", handlePanelScroll);
    panelElement.removeEventListener("scrollend", handlePanelScrollEnd);
    panelElement.textContent = "";
    panelElement.hidden = true;
  }
  if (programmaticScrollResetTimerId !== null) {
    clearTimeout(programmaticScrollResetTimerId);
    programmaticScrollResetTimerId = null;
  }

  audioElement = null;
  panelElement = null;
  renderedLines = [];
  activeIndex = -1;
  suppressAutoScrollUntil = 0;
  isProgrammaticScroll = false;
  lastAutoScrollAt = -Infinity;
  modeToggleButtonElement = null;
  onLineClickCallback = null;
}

// 指定した曲の歌詞データを取得し、パネルへ描画し、再生位置に合わせた同期表示を開始する。
// 歌詞データがない曲では、パネル自体を表示しないまま何もしない
// （試聴機能自体は今まで通り使える。エラー表示も出さない）。
// 戻り値：歌詞データが見つかってパネルを表示したらtrue、無かった（何もしなかった）らfalse。
// 呼び出し側（songlist.js等）は、この値を使って「全画面表示ボタン」の表示・非表示を
// 判断する（曲IDをハードコードせず、実際に歌詞データがあるかどうかで自動判定するため。
// 2026-08-03、Overtureのように歌詞が存在しない曲でボタンだけ残ってしまう問題への対応）。
//
// audioElement/panelElementは、収録曲一覧・オリジナル問題作成モードそれぞれが持つ
// 実際の<audio>要素・歌詞パネル用の要素を毎回渡す想定
// （このモジュール自体はどちらの画面の要素かを知らない）。
//
// options.onLineClick（省略可）：歌詞行がタップされたときの処理を呼び出し元がカスタマイズしたい
// 場合のフック（UI/UX第4版でjs/karaokeSyncScreen.jsが追加）。渡された場合、既定の
// 「audioElement.currentTime = line.start」は行わず、代わりにonLineClick(line)を呼ぶ。
// 省略した場合（既存の呼び出し元すべて）は今までどおりの既定動作のまま変わらない。
// カラオケ同期画面では、渡しているaudioElementが本物の<audio>ではなく時計だけの疑似要素
// （currentTimeへ代入しても同期エンジンには何の効果もない）のため、この既定動作は無意味になる。
export async function loadLyricsForSong(songId, targetAudioElement, targetPanelElement, options = {}) {
  // 前の曲の表示・イベント購読を必ず先に片付けてから始める
  // （曲を切り替えたときに前の歌詞が残ってしまうことを構造的に防ぐ）。
  destroyLyricsSync();

  const record = await getLyricsData(songId);
  return startLyricsSyncWithRecord(record, targetAudioElement, targetPanelElement, options);
}

// 【2026-10-23分離】取得済みの歌詞データ（record）でパネルを描画し、同期表示を始める。
// loadLyricsForSong() の後半をそのまま切り出したもので、動きは変えていない。テストでは端末の歌詞データ
// （IndexedDB）に触れずにダミーの歌詞で表示を確認するため、これを直接呼ぶ。
export function startLyricsSyncWithRecord(record, targetAudioElement, targetPanelElement, options = {}) {
  destroyLyricsSync();
  if (!record || !Array.isArray(record.lines) || record.lines.length === 0) {
    return false;
  }

  audioElement = targetAudioElement;
  panelElement = targetPanelElement;
  onLineClickCallback = typeof options.onLineClick === "function" ? options.onLineClick : null;

  audioElement.addEventListener("timeupdate", handleTimeUpdate);
  audioElement.addEventListener("seeking", handleSeeking);
  audioElement.addEventListener("ended", handleEnded);
  panelElement.addEventListener("scroll", handlePanelScroll);
  panelElement.addEventListener("scrollend", handlePanelScrollEnd);

  panelElement.textContent = "";
  panelElement.hidden = false;
  panelElement.classList.toggle("is-full-text-mode", displayMode === DISPLAY_MODE_FULL);

  // 表示モードの切替ボタン。パネル内でsticky表示にすることで、スクロールしても
  // 見失わない（収録曲一覧・オリジナル問題作成モードのどちらのパネルにも、ここで共通に追加される）。
  modeToggleButtonElement = document.createElement("button");
  modeToggleButtonElement.type = "button";
  modeToggleButtonElement.className = "lyrics-mode-toggle-button";
  modeToggleButtonElement.textContent = modeToggleButtonLabel();
  modeToggleButtonElement.addEventListener("click", handleModeToggleClick);
  panelElement.appendChild(modeToggleButtonElement);

  renderedLines = record.lines.map((line) => {
    const lineElement = document.createElement("p");
    lineElement.className = "synced-lyrics-line";
    lineElement.textContent = line.text;
    // 歌詞をタップ/クリックすると、その行の開始位置へシークする
    // （再生中/一時停止中どちらでも位置だけ移動し、再生状態自体は変えない）。
    // onLineClickCallbackが渡されている場合（カラオケ同期画面）は、既定のシーク処理の代わりに
    // そちらを呼ぶ（呼び出し元が同期時計・端末音源・コール表示までまとめて合わせるため）。
    lineElement.addEventListener("click", () => {
      if (onLineClickCallback) {
        onLineClickCallback(line);
        return;
      }
      audioElement.currentTime = line.start;
      updateActiveLyricsLine(line.start, { immediate: true });
    });
    panelElement.appendChild(lineElement);
    return { element: lineElement, start: line.start, end: line.end };
  });
  activeIndex = -1;

  updateActiveLyricsLine(audioElement.currentTime, { immediate: true });
  // 再生中だけ毎フレーム再生位置を確認する（timeupdate の約0.25秒間隔による遅れ・短い行の取りこぼし対策）。
  // カラオケ同期画面の「時計だけの疑似要素」では動かず、今までどおり timeupdate だけで動く。
  frameTicker = createPlaybackFrameTicker(audioElement, {
    // 歌詞パネルが画面に出ていないとき（別画面で再生だけ続いている等）は判定を省く
    onFrame: (currentTime) => {
      if (panelElement?.isConnected && !panelElement.hidden) updateActiveLyricsLine(currentTime);
    },
    onResume: handlePlaybackResume,
  });
  return true;
}

// 自動スクロールのON/OFFを切り替える。Step3時点ではUIボタンは用意しないが、
// 将来「自動スクロールを止めたい」という要望が出たときにそのまま使える形にしておく。
export function setAutoScrollEnabled(enabled) {
  autoScrollEnabled = enabled;
}
