// カラオケ同期・初心者ナビ機能の「計算・状態」を担当する純粋関数モジュール。
// DOM・タイマー・振動などには一切触れない（実際の描画・イベント購読はjs/karaokeSyncScreen.jsが担当する）。
// 状態はすべてイミュータブルに扱う（渡された古いstateを書き換えず、新しいオブジェクトを返す）ため、
// テストがしやすく、描画側の「変わったときだけ再描画する」判定とも相性がよい。
//
// 【最重要の設計方針】カラオケ側の音源はアプリから一切操作できないため、同期の基準時刻には
// 「今アプリ内で経過したmonotonic時間＋補正値」だけを使う。歌詞データの開始/終了時刻は
// AI補助で作成した箇所があり精度が一定でないため、同期の正解データには一切使わない
// （同期の正解データとして使うのは、常に既存のコールデータのstart/end）。
//
// 【最重要の設計方針】setIntervalで「100msずつ加算」のような時計は使わない。バックグラウンド
// 処理や描画の遅延でズレが蓄積するため。呼び出し側は毎回、
//   現在位置 = 現在のmonotonic時刻 − 同期開始時のmonotonic時刻 + offset
// という絶対計算をやり直す（本人の強い要望）。渡すmonotonic時刻はperformance.now()由来のものを
// 想定している（Date.now()は端末時計の変更の影響を受けるため使わない）。

import { findActiveLineIndex } from "./lyricsSync.js";
import { isShortCallText } from "./callSync.js";

// ===== 同期状態 =====

export function createKaraokeSyncState() {
  return {
    isSyncing: false,
    syncStartAtMs: null, // 同期開始時点のmonotonic時刻（ms）
    offsetMs: 0, // 「今！」・早い/遅い補正の蓄積値（このセッション内だけの一時的な値。永続化しない）
    lastResyncAtPositionSec: null, // 最後に再同期した時点の、カラオケ経過位置（表示用）
  };
}

// 「曲スタート！」が押された瞬間に呼ぶ。monotonicNowMsは、呼び出し側がクリック/タップの
// イベントハンドラの一番最初で取得したperformance.now()の値を渡すこと
// （UIアニメーション・DOM更新を待ってから取得すると、その分だけ基準時刻がずれるため）。
export function startKaraokeSync(state, monotonicNowMs) {
  return {
    ...state,
    isSyncing: true,
    syncStartAtMs: monotonicNowMs,
    offsetMs: 0,
    lastResyncAtPositionSec: null,
  };
}

// 「同期をやり直す」。offset等はリセットするが、この関数は曲データ・コールデータ・
// 初心者ナビ設定・IndexedDBのいずれにも一切触れない（そもそも参照すらしない）。
export function resetKaraokeSync() {
  return createKaraokeSyncState();
}

// 現在のカラオケ経過位置（秒）。同期中でなければnullを返す。
export function getKaraokePositionSec(state, monotonicNowMs) {
  if (!state.isSyncing || state.syncStartAtMs === null) return null;
  return (monotonicNowMs - state.syncStartAtMs + state.offsetMs) / 1000;
}

// ===== 「コールが早い／遅い」補正 =====
// 「コールが早い」＝アプリの表示（計算上の現在位置）が、実際のカラオケより先に進みすぎている
// 状態なので、offsetを減らして計算上の位置を遅らせる。
// 「コールが遅い」＝逆に、offsetを増やして計算上の位置を早める。
export function adjustOffsetMs(state, deltaMs) {
  return { ...state, offsetMs: state.offsetMs + deltaMs };
}

export function reportCallTooEarly(state, stepMs) {
  return adjustOffsetMs(state, -Math.abs(stepMs));
}

export function reportCallTooLate(state, stepMs) {
  return adjustOffsetMs(state, Math.abs(stepMs));
}

// ===== 「今！」による途中再同期 =====
// targetPositionSec（同期ポイントとなるコールのstart）が、まさに今この瞬間に実際のカラオケで
// 起きているとみなし、以後その前提でoffsetを引き直す。前回までの補正の積み重ねに関わらず、
// 「今の経過時間」から逆算して1回で正しい値を出すため、offsetの古い値には依存しない。
export function resyncToPosition(state, targetPositionSec, monotonicNowMs) {
  if (!state.isSyncing || state.syncStartAtMs === null) return state;
  const elapsedMs = monotonicNowMs - state.syncStartAtMs;
  const newOffsetMs = targetPositionSec * 1000 - elapsedMs;
  return {
    ...state,
    offsetMs: newOffsetMs,
    lastResyncAtPositionSec: targetPositionSec,
  };
}

// ===== コール検索（歌詞データには一切触れない） =====
// 判定基準はjs/lyricsSync.jsのfindActiveLineIndex()をそのまま再利用する
// （js/callSync.jsが歌詞行のハイライト判定とコールのハイライト判定に同じ関数を使っているのと
// 同じ考え方。オブジェクトの形が{start, end, ...}であれば、中身が歌詞行でもコールでも
// 同じ基準で「現在アクティブな要素」を判定できるため、実装を2箇所に複製しない）。
export function findActiveCallIndex(calls, positionSec) {
  return findActiveLineIndex(calls, positionSec);
}

// 次に始まるコール（現在アクティブなものは含まない）。callsはstart昇順であること。
export function findNextCall(calls, positionSec) {
  return calls.find((call) => call.start > positionSec) ?? null;
}

// ===== 同期ポイント（「今！」の対象にする、初心者にも分かりやすい短いコール） =====
// 短いコール（isShortCallText。既存の「飛び出しバースト」演出と全く同じ基準）を優先する。
// 曲内に1件も無い場合は、無理に絞り込まず全コールにフォールバックする
// （本人指示：「適切なものがない曲では、無理に自動選択せず別方式にフォールバックして構わない」）。
export function selectSyncPointCandidates(calls) {
  const shortOnes = calls.filter((call) => isShortCallText(call.text));
  return shortOnes.length > 0 ? shortOnes : calls;
}

// 同期ポイント候補の中から、「今アクティブなもの」または「次に来るもの」を1件返す（無ければnull）。
export function findCurrentOrNextSyncPoint(candidates, positionSec) {
  const activeIndex = findActiveCallIndex(candidates, positionSec);
  if (activeIndex !== -1) return candidates[activeIndex];
  return findNextCall(candidates, positionSec);
}

// ===== 残り秒数 =====
export function getSecondsUntil(targetSec, positionSec) {
  return Math.max(0, targetSec - positionSec);
}

// ===== 「同期チェック」を表示してよいかの判定 =====
// 次の同期ポイントがleadSec秒以内に迫っていて、かつ前回表示してからminGapSec秒以上
// 経っている場合だけ表示してよいと判定する（毎回・全コールで出すと邪魔になるため）。
export function shouldShowSyncCheck({
  nextSyncPointCall,
  positionSec,
  lastShownAtPositionSec,
  leadSec = 5,
  minGapSec = 40,
}) {
  if (!nextSyncPointCall) return false;
  const secondsUntil = nextSyncPointCall.start - positionSec;
  if (secondsUntil <= 0 || secondsUntil > leadSec) return false;
  if (lastShownAtPositionSec !== null && positionSec - lastShownAtPositionSec < minGapSec) return false;
  return true;
}

// ===== 表示用フォーマッタ =====
// 「完全同期しています」のような断定はせず、実際に分かる数値だけを見せるための表記
// （本人指示：緑＝完璧／赤＝間違いのような断定的な色分けもしない）。
export function formatOffsetLabel(offsetMs) {
  const seconds = offsetMs / 1000;
  if (Math.abs(seconds) < 0.005) return "調整なし";
  const sign = seconds > 0 ? "+" : "-";
  return `${sign}${Math.abs(seconds).toFixed(1)}秒`;
}

export function formatKaraokeMmSs(totalSeconds) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// ===== NEXT CALLカードの表示段階（UI/UX第2版で追加） =====
// 「今は何も言わない／もうすぐ言う／今言う」を、数値の暗算なしで一目で分かるようにするための
// 3段階（upcoming/imminent/now）と、その表示テキストをまとめて計算する純粋関数。
// leadSec秒以内になったら「もうすぐ！」＋整数カウントダウン（3・2・1）に切り替える。
const IMMINENT_LEAD_SEC = 3;

export function getNextCallCountdownDisplay(secondsUntil, isActive) {
  if (isActive) {
    return { phase: "now", eyebrow: "コール中！", text: "" };
  }
  if (secondsUntil <= IMMINENT_LEAD_SEC) {
    // 3.0〜2.01秒→3、2.0〜1.01秒→2、1.0〜0.01秒→1、という表示にするためceilを使う
    // （0ちょうどはfindActiveCallIndex側で既にisActive扱いになっているため、ここには来ない）。
    const digit = Math.max(1, Math.ceil(secondsUntil));
    return { phase: "imminent", eyebrow: "もうすぐ！", text: String(digit) };
  }
  return { phase: "upcoming", eyebrow: "NEXT CALL", text: `あと${secondsUntil.toFixed(1)}秒` };
}
