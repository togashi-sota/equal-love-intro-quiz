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
let renderedCalls = []; // { element, start, end }（時刻順に並べ替え済み）
let activeIndex = -1;
let callsVisible = true; // 「歌詞＋コール」/「通常歌詞のみ」の表示切り替え状態
let toggleButtonElement = null;

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

    return { element: callElement, start: call.start, end: call.end };
  });

  activeIndex = -1;
  updateActiveCallLine(audioElement.currentTime);
  return true;
}
