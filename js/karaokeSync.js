// カラオケ同期・初心者ナビ機能の「計算・状態」を担当する純粋関数モジュール。
// DOM・タイマーなどには一切触れない（実際の描画・イベント購読はjs/karaokeSyncScreen.jsが担当する）。
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
    isPaused: false, // 一時停止中かどうか（UI/UX第4版で追加）
    pausedAtPositionSec: null, // 一時停止した瞬間のカラオケ経過位置（isPaused中はここを凍結して返す）
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
    isPaused: false,
    pausedAtPositionSec: null,
  };
}

// 「同期をやり直す」。offset等はリセットするが、この関数は曲データ・コールデータ・
// 初心者ナビ設定・IndexedDBのいずれにも一切触れない（そもそも参照すらしない）。
export function resetKaraokeSync() {
  return createKaraokeSyncState();
}

// 現在のカラオケ経過位置（秒）。同期中でなければnullを返す。
// 一時停止中は、経過時間の計算式を使わずpausedAtPositionSecをそのまま返す
// （＝performance.now()がどれだけ進んでも、再開されるまで位置が動かない）。
export function getKaraokePositionSec(state, monotonicNowMs) {
  if (!state.isSyncing || state.syncStartAtMs === null) return null;
  if (state.isPaused) return state.pausedAtPositionSec;
  return (monotonicNowMs - state.syncStartAtMs + state.offsetMs) / 1000;
}

// ===== 一時停止／再開（UI/UX第4版で追加） =====
// 「0秒へ戻す完全停止」ではなく、「今の位置を凍結し、同じ位置から再開できる」一時停止。
// 呼び出し側は、これと同時に端末音源の.pause()／.play()も必ず行うこと
// （この関数自体は音源要素に一切触れない。同期時計と音源の両方を同時に止める／再開する責務は
// 呼び出し側＝js/karaokeSyncScreen.jsが持つ）。
export function pauseKaraokeSync(state, monotonicNowMs) {
  if (!state.isSyncing || state.isPaused) return state;
  const positionSec = getKaraokePositionSec(state, monotonicNowMs);
  return { ...state, isPaused: true, pausedAtPositionSec: positionSec };
}

// 一時停止した位置から、途切れなく再開する。内部的にはresyncToPosition()と同じ考え方
// （「今の経過時間」から逆算してoffsetを1回で引き直す）を使い、凍結していた位置を
// そのままの値で再開後も維持する。
export function resumeKaraokeSync(state, monotonicNowMs) {
  if (!state.isSyncing || !state.isPaused) return state;
  const targetPositionSec = state.pausedAtPositionSec;
  const resumedState = resyncToPosition({ ...state, isPaused: false, pausedAtPositionSec: null }, targetPositionSec, monotonicNowMs);
  return resumedState;
}

// ===== タイミング調整 =====
// offsetを増やすと、計算上の現在位置が大きくなる→コールの表示が実際より早く来る＝「早める」。
// offsetを減らすと、計算上の現在位置が小さくなる→コールの表示が実際より遅く来る＝「遅らせる」。
// 【UI/UX第3版・本人指示で必ず検証】この符号の向きは、以下の具体例で確認済み：
// 「曲スタート」を実際より1秒遅く押した場合、アプリの経過時間は本当のカラオケより
// 常に1秒少なく計算される＝コール表示は本来より遅れて出る。これを直すには、offsetを
// +1000msして「早める」必要がある（実際に本来より遅れているものを早めて追いつかせる）。
// この関係が、ここより下のresyncToPosition()の計算式（offset = target*1000 - elapsedMs）
// とも整合していることをテスト（tests/karaokeSync.test.js）で確認している。
//
// 【UI/UX第4版・一時停止中の扱い】一時停止中はgetKaraokePositionSec()がoffsetMsを見ずに
// pausedAtPositionSecをそのまま返すため、offsetMsだけ変えても画面上の凍結位置が動かず
// 「ボタンを押しても何も起きない」ように見えてしまう。一時停止中にoffsetを変えたときは、
// pausedAtPositionSecも同じ量（秒換算）だけ動かし、非表示中でも操作結果が一貫するようにする。
export function adjustOffsetMs(state, deltaMs) {
  if (state.isPaused) {
    return {
      ...state,
      offsetMs: state.offsetMs + deltaMs,
      pausedAtPositionSec: state.pausedAtPositionSec + deltaMs / 1000,
    };
  }
  return { ...state, offsetMs: state.offsetMs + deltaMs };
}

// タイミング調整だけを0msへ戻す。同期自体（開始時刻・経過位置・音源再生）には一切触れない
// （本人指示：「曲そのものを最初からやり直す機能ではない。現在位置・音源再生は維持したまま、
// タイミング補正だけを0に戻す」）。一時停止中は、上のadjustOffsetMs()と同じ考え方で、
// 古いoffsetの分だけpausedAtPositionSecを巻き戻してから0にする（非表示のズレを防ぐ）。
export function resetOffsetToZero(state) {
  if (state.isPaused) {
    return { ...state, offsetMs: 0, pausedAtPositionSec: state.pausedAtPositionSec - state.offsetMs / 1000 };
  }
  return { ...state, offsetMs: 0 };
}

// ===== 「今！」・歌詞タップによる途中再同期 =====
// targetPositionSec（同期ポイントとなるコールのstart、または歌詞行のstart）が、
// まさに今この瞬間に実際のカラオケで起きているとみなし、以後その前提でoffsetを引き直す。
// 前回までの補正の積み重ねに関わらず、「今の経過時間」から逆算して1回で正しい値を出すため、
// offsetの古い値には依存しない（＝実質的に古い補正はこの1回でリセットされるのと同じ効果になる）。
// 一時停止中に呼ばれた場合は、経過時間の計算をせずpausedAtPositionSecへ直接ターゲット位置を
// 設定する（本人指示：一時停止中でも歌詞タップで位置合わせでき、一時停止状態自体は維持する）。
export function resyncToPosition(state, targetPositionSec, monotonicNowMs) {
  if (!state.isSyncing || state.syncStartAtMs === null) return state;
  if (state.isPaused) {
    return { ...state, pausedAtPositionSec: targetPositionSec, lastResyncAtPositionSec: targetPositionSec };
  }
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

// ===== コール表示の文字サイズ段階（UI/UX第3版で追加） =====
// 「はい！」のような短いコールは画面いっぱいに大きく、MIX・口上のような長いコールは
// 読める大きさに抑える、という3段階を判定する純粋関数。
// SHORTの基準は、既存の飛び出しバースト演出（isShortCallText）と完全に統一する
// （同じ「短い」の基準が画面によって変わらないように）。
// MEDIUMの上限20文字は、js/callSync.jsの長文コール表示（LONGFORM_LENGTH_TIERS）の
// 最初の区切り「compact」と揃えている。
export function getCallDisplayTier(text) {
  if (isShortCallText(text)) return "short";
  if (typeof text === "string" && text.length <= 20) return "medium";
  return "long";
}
