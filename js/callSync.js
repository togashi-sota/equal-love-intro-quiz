// ライブコールモード専用：歌詞パネルに「コール」を重ねて同期表示するモジュール。
// js/lyricsSync.jsの同期歌詞表示（本編ですでに実機確認済み）には一切手を加えず、
// lyricsSync.jsが描画し終えた歌詞パネル（.synced-lyrics-line群）の間に、
// コールの行を追加で挿し込むだけの、完全に独立した重ね書き方式にしている。
// これにより、既存の収録曲一覧・連続再生画面の歌詞表示には何の影響も与えない
// （2026-08-06新設、ライブコールモード基盤）。
//
// 呼び出し側（js/liveCallModeScreen.js）は、必ず
//   1. lyricsSync.jsのloadLyricsForSong()を先に呼んで歌詞パネルを描画させる
//   2. その結果（true）を確認してから、このモジュールのloadCallsForSong()を呼ぶ
// という順序を守ること（歌詞の行要素が先に存在していないと、コールを差し込む位置を
// 判断できないため）。
//
// findActiveLineIndex()はjs/lyricsSync.jsの純粋関数をそのまま再利用している
// （「start<=現在時刻<endの行を現在行とする」という判定基準を、歌詞・コールの
// 両方で完全に統一するため。実装を2箇所に複製しない）。

import { getCallData } from "./callStorage.js";
import { getLyricsData } from "./lyricsStorage.js";
import { findActiveLineIndex } from "./lyricsSync.js";

let audioElement = null;
let panelElement = null;
let renderedCalls = []; // { element, start, end, text }（時刻順に並べ替え済み）
let activeIndex = -1;
let callsVisible = true; // 「歌詞＋コール」/「通常歌詞のみ」の表示切り替え状態
let toggleButtonElement = null;

// ===== 短いコールの「飛び出しバースト」演出（2026-08-06、本人要望で追加） =====
// 「Hi!」「Yeah!」「オレ！」のような一瞬で終わる短いコールは、歌詞パネル内の
// 小さな行のハイライトだけでは目立ちにくいという指摘を受け、画面中央に大きく
// 飛び出す専用の演出を追加した。長いコール（MIX全体など）はこれまで通り
// 行のハイライトのみとし、読みやすさを優先する。
const SHORT_CALL_MAX_LENGTH = 6;

// テキストの文字数だけで「短いコールかどうか」を判定する純粋関数。
// DOM・タイミングに一切触れないため、tests/callSync.test.jsで直接テストできる。
export function isShortCallText(text) {
  return typeof text === "string" && text.length > 0 && text.length <= SHORT_CALL_MAX_LENGTH;
}

let burstLayerElement = null;
let burstHideTimeoutId = null;

// バースト演出用のDOM（画面に1つだけ）を、必要になった最初のタイミングで作る。
function ensureBurstLayer() {
  if (burstLayerElement) return burstLayerElement;
  burstLayerElement = document.createElement("div");
  burstLayerElement.className = "call-burst-layer";
  burstLayerElement.setAttribute("aria-hidden", "true"); // 装飾演出のため、スクリーンリーダーには読ませない
  const textElement = document.createElement("span");
  textElement.className = "call-burst-text";
  burstLayerElement.appendChild(textElement);
  document.body.appendChild(burstLayerElement);
  return burstLayerElement;
}

// 短いコールがアクティブになった瞬間に、画面中央へ大きく飛び出す演出を1回再生する。
// 同じ要素・同じクラスを毎回付け直すことで、連続して短いコールが来ても
// そのたびにアニメーションが最初から再生される（CSSアニメーションの仕組み上、
// 一度classを外してから付け直す必要があるため、requestAnimationFrameで1フレーム空ける）。
function triggerCallBurst(text) {
  const layer = ensureBurstLayer();
  const textElement = layer.querySelector(".call-burst-text");
  textElement.textContent = text;

  layer.classList.remove("is-bursting");
  window.clearTimeout(burstHideTimeoutId);
  // eslint-disable-next-line no-unused-expressions
  void layer.offsetWidth; // reflowを強制し、クラス再付与でアニメーションを確実に再生させる
  layer.classList.add("is-bursting");

  burstHideTimeoutId = window.setTimeout(() => {
    layer.classList.remove("is-bursting");
  }, 1000);
}

// ===== 長いコールの「本文を主役にした持続表示」演出 =====
// （2026-08-06：まず画面全体が沸くオーラ演出を追加／2026-08-07：本人要望により、
//  開始時だけでなく「コールが有効な間ずっと」本文を大きく表示する方式へ拡張）
//
// MIX・口上のような15秒前後続く長いコールは、開始直後だけ目立っても、その後
// 通常の行内ハイライトに戻ってしまうと「読み続けられない」という指摘を受けた。
// このため、長いコールがアクティブな間（開始〜終了まで）ずっと、画面全体を覆う
// 固定オーバーレイに本文を大きく表示し続ける方式にした。
//
// 表示のON/OFFはapplyActiveIndex()が「今アクティブなコールが変わった」と判断した
// 瞬間だけ呼ばれる（findActiveLineIndex・updateActiveCallLine等の判定ロジック自体は
// 一切変更していない）。そのため、このオーバーレイの表示時間は既存のタイミング判定に
// 完全に連動しており、独自のタイマーで表示を打ち切ることはしていない
// （短いコールのバーストのように「n秒後に消す」setTimeoutは使わず、
//  「次にアクティブなコールが変わるまで表示し続ける」だけのシンプルな方式）。
let longCallOverlayElement = null;
let longCallActive = false;

// 本文の長さに応じて文字サイズの段階（CSSクラス）を決める純粋関数。
// 非常に長い本文（8〜10行のMIX・口上等）でも画面内に収まるよう、DOM計測をせずに
// 文字数だけで4段階に振り分ける、安全で軽い方式（本人の希望通り、複雑な自動フィット
// アルゴリズムは採用していない）。
const LONGFORM_LENGTH_TIERS = [
  { maxLength: 20, tier: "compact" },
  { maxLength: 40, tier: "cozy" },
  { maxLength: 70, tier: "roomy" },
  { maxLength: Infinity, tier: "packed" },
];

export function getLongCallDisplayLengthTier(text) {
  const length = typeof text === "string" ? text.length : 0;
  const match = LONGFORM_LENGTH_TIERS.find((entry) => length <= entry.maxLength);
  return match.tier;
}

// 持続表示オーバーレイ用のDOM（画面に1つだけ）を、必要になった最初のタイミングで作る。
// 表示/非表示はCSSのtransition（.is-active）に任せているため、ここでは要素を
// 用意するだけで、アニメーションの開始・終了には関与しない。
function ensureLongCallOverlay() {
  if (longCallOverlayElement) return longCallOverlayElement;
  longCallOverlayElement = document.createElement("div");
  longCallOverlayElement.className = "call-longform-overlay";
  longCallOverlayElement.setAttribute("aria-hidden", "true"); // 装飾演出のため、スクリーンリーダーには読ませない
  const textElement = document.createElement("p");
  textElement.className = "call-longform-overlay-text";
  longCallOverlayElement.appendChild(textElement);
  document.body.appendChild(longCallOverlayElement);
  return longCallOverlayElement;
}

// 長いコールの本文を、画面全体のオーバーレイに大きく表示する。
// 「前のコールの表示を確実に消してから、新しい表示に切り替える」という本人要望のため、
// 呼ばれるたびに一度非表示状態へ戻し、1フレーム空けてから改めて表示する
// （triggerCallBurst()と同じ「クラスを外して付け直す」方式）。
function showLongCallDisplay(text) {
  const overlay = ensureLongCallOverlay();
  const textElement = overlay.querySelector(".call-longform-overlay-text");

  overlay.classList.remove("is-active");
  // eslint-disable-next-line no-unused-expressions
  void overlay.offsetWidth; // reflowを強制し、クラス再付与でアニメーションを確実に再生させる

  textElement.textContent = text;
  textElement.className = `call-longform-overlay-text is-length-tier-${getLongCallDisplayLengthTier(text)}`;

  overlay.classList.add("is-active");
  longCallActive = true;
}

// オーバーレイを消す（CSSのtransitionにより、縮小しながらフェードアウトする）。
function hideLongCallDisplay() {
  if (!longCallActive) return;
  longCallActive = false;
  if (longCallOverlayElement) {
    longCallOverlayElement.classList.remove("is-active");
  }
}

// 画面遷移・曲切替のときは、フェードアウトの途中経過を次の画面に残さないよう、
// トランジションなしで即座に消す（要素ごと作り直すことで、進行中のtransitionも
// 確実に打ち切る）。
function resetLongCallDisplayInstantly() {
  longCallActive = false;
  if (longCallOverlayElement) {
    longCallOverlayElement.remove();
    longCallOverlayElement = null;
  }
}

// コールの種類ごとの表示ラベル（本文そのものではなく、種類を示す小さなバッジに使う）。
// 本文（Oh yeah!等の実際の文言）はcallStorage.js側のデータにのみ含まれ、
// このファイルには一切書かない。
const CALL_TYPE_LABELS = {
  mix: "MIX",
  "member-call": "コール",
  callback: "合いの手",
  unique: "固有コール",
};

function handleTimeUpdate() {
  updateActiveCallLine(audioElement.currentTime);
}

function handleSeeking() {
  updateActiveCallLine(audioElement.currentTime);
}

function applyActiveIndex(index) {
  if (index === activeIndex) return;
  activeIndex = index;
  renderedCalls.forEach((call, i) => {
    call.element.classList.toggle("is-current-lyrics-line", i === index);
  });

  const newlyActiveCall = index !== -1 ? renderedCalls[index] : null;
  if (newlyActiveCall) {
    if (isShortCallText(newlyActiveCall.text)) {
      triggerCallBurst(newlyActiveCall.text);
      hideLongCallDisplay(); // 短⇔長を行き来した場合に、前の長文表示が残らないようにする
    } else {
      showLongCallDisplay(newlyActiveCall.text);
    }
  } else {
    hideLongCallDisplay();
  }
}

function updateActiveCallLine(currentTime) {
  if (renderedCalls.length === 0) return;
  const index = findActiveLineIndex(renderedCalls, currentTime);
  applyActiveIndex(index);
}

// 表示切替ボタンのラベルを、今の状態に合わせて更新する。
function updateToggleButtonLabel() {
  if (toggleButtonElement) {
    toggleButtonElement.textContent = callsVisible ? "通常歌詞のみにする" : "コールを表示する";
  }
}

function handleToggleClick() {
  callsVisible = !callsVisible;
  if (panelElement) {
    panelElement.classList.toggle("calls-hidden", !callsVisible);
  }
  updateToggleButtonLabel();
}

// パネルの中身・購読しているイベントをすべて片付ける。
// destroyLyricsSync()と同じタイミング（曲切替・画面離脱時）で、呼び出し側が必ず一緒に呼ぶこと。
// このモジュールは歌詞パネル本体（panelElement）を空にする権限を持たない
// （lyricsSync.jsのdestroyLyricsSync()が、次にloadLyricsForSong()するときに
// panelElement.textContent = ""で歌詞ごとまとめて消してくれるため、二重に消す必要がない）。
export function destroyCallSync() {
  if (audioElement) {
    audioElement.removeEventListener("timeupdate", handleTimeUpdate);
    audioElement.removeEventListener("seeking", handleSeeking);
  }
  audioElement = null;
  panelElement = null;
  renderedCalls = [];
  activeIndex = -1;
  toggleButtonElement = null;

  // バースト演出も、曲切替・画面離脱のタイミングで必ず消す
  // （前の曲の演出が再生中のまま残ってしまうことがないように）。
  window.clearTimeout(burstHideTimeoutId);
  if (burstLayerElement) {
    burstLayerElement.classList.remove("is-bursting");
  }

  // 長いコールの持続表示オーバーレイも同様に、曲切替・画面離脱のタイミングで必ず消す。
  // フェードアウトの途中経過を次の画面に残さないよう、トランジションなしで即座に消す。
  resetLongCallDisplayInstantly();
}

// 指定した曲のコールデータを取得し、既に描画済みの歌詞パネルへ差し込む。
// コールデータがない曲では、何もしないまま何もしない（歌詞データがない曲でパネル自体を
// 出さない、という既存の一貫した方針を踏襲）。
// 戻り値：コールデータが見つかって表示したらtrue、無かった（何もしなかった）らfalse。
export async function loadCallsForSong(songId, targetAudioElement, targetPanelElement) {
  destroyCallSync();

  const callRecord = await getCallData(songId);
  if (!callRecord || !Array.isArray(callRecord.calls) || callRecord.calls.length === 0) {
    return false;
  }

  // 歌詞の各行の開始時刻を、コールの差し込み位置の判断材料として使う
  // （lyricsSync.js自体は変更せず、歌詞データを読み取り専用でもう一度取得するだけ）。
  const lyricsRecord = await getLyricsData(songId);
  const lyricsLines = lyricsRecord && Array.isArray(lyricsRecord.lines) ? lyricsRecord.lines : [];
  const lyricsLineElements = [...targetPanelElement.querySelectorAll(".synced-lyrics-line")];

  audioElement = targetAudioElement;
  panelElement = targetPanelElement;

  audioElement.addEventListener("timeupdate", handleTimeUpdate);
  audioElement.addEventListener("seeking", handleSeeking);

  panelElement.classList.toggle("calls-hidden", !callsVisible);

  // 表示切替ボタン。歌詞側の全文表示切替ボタンと同じく、パネル内にsticky表示する
  // （lyricsSync.js側のボタンとは別物。コールが無い曲では作られないため、
  // 「コールがある曲だけボタンが出る」という要望を自動的に満たす）。
  toggleButtonElement = document.createElement("button");
  toggleButtonElement.type = "button";
  toggleButtonElement.className = "calls-toggle-button";
  updateToggleButtonLabel();
  toggleButtonElement.addEventListener("click", handleToggleClick);
  panelElement.insertBefore(toggleButtonElement, panelElement.firstChild);

  // コールの時刻順に並べ替えてから、差し込み先を決める
  // （保存順は問わない設計のため。callStorage.jsのコメント参照）。
  const sortedCalls = [...callRecord.calls].sort((a, b) => a.start - b.start);

  renderedCalls = sortedCalls.map((call) => {
    const callElement = document.createElement("p");
    callElement.className = "synced-call-line";
    callElement.dataset.callType = call.type;

    const typeBadge = document.createElement("span");
    typeBadge.className = "synced-call-type-badge";
    typeBadge.textContent = CALL_TYPE_LABELS[call.type] ?? "コール";
    callElement.appendChild(typeBadge);

    const textSpan = document.createElement("span");
    textSpan.className = "synced-call-text";
    textSpan.textContent = call.text;
    callElement.appendChild(textSpan);

    // タップ/クリックで、そのコールの開始位置へシークする（歌詞行と同じ操作感）。
    callElement.addEventListener("click", () => {
      audioElement.currentTime = call.start;
      updateActiveCallLine(call.start);
    });

    // 差し込み先：このコールの開始時刻以降で最初に始まる歌詞行の直前に挿す。
    // 該当する歌詞行が無ければ（曲の最後より後ろのコール等）、パネルの一番最後に足す。
    const targetLineIndex = lyricsLines.findIndex((line) => line.start >= call.start);
    if (targetLineIndex === -1 || !lyricsLineElements[targetLineIndex]) {
      panelElement.appendChild(callElement);
    } else {
      panelElement.insertBefore(callElement, lyricsLineElements[targetLineIndex]);
    }

    return { element: callElement, start: call.start, end: call.end, text: call.text };
  });

  activeIndex = -1;
  updateActiveCallLine(audioElement.currentTime);
  return true;
}
