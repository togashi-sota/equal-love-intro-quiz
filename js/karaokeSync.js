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
import { isShortCallText, getCallDisplayTier, CALL_TYPE_LABELS } from "./callSync.js";

// ===== 同期状態 =====
//
// 【UI/UX第6版・2026-08-10で再設計】「一時停止していた時間の長さ分だけ、タイミング補正値が
// ズレる」という不具合が実機で見つかった（本人指摘）。原因は、旧resumeKaraokeSyncが
// resyncToPosition()を経由してoffsetMsそのものを再計算し直していたため。
//
// 再設計の考え方：「再生位置（今どこか）」と「タイミング補正（カラオケに対して何秒
// ずらして表示するか）」を、状態としても完全に独立させる。
//   A. 再生位置＝syncStartAtMs・isPaused・pausedAtRawPositionSecだけで決まる「生の経過時間」
//   B. タイミング補正＝offsetMsだけの、Aとは独立した値
// 最終的な表示位置は常に「A＋B」（getKaraokePositionSec参照）。一時停止／再開はAだけを
// 操作し、offsetMs（B）には指1本触れない。±ボタン・「今！」・歌詞タップはBだけを操作し、
// Aには一切触れない。この分離により、一時停止中にoffsetを変えても凍結中の表示位置には
// 「A(凍結)＋B」として自然に反映されるため、以前あった「一時停止中は特別扱いする」ための
// 分岐（adjustOffsetMs/resetOffsetToZero/resyncToPositionそれぞれにあった）が不要になった。

export function createKaraokeSyncState() {
  return {
    isSyncing: false,
    syncStartAtMs: null, // 「生の経過時間」の基準時刻（ms）。一時停止からの再開のたびに、停止していた分だけ後ろにずらす
    offsetMs: 0, // タイミング補正値。「今！」・早い/遅い補正の蓄積値（このセッション内だけの一時的な値。永続化しない）
    lastResyncAtPositionSec: null, // 最後に再同期した時点の、カラオケ経過位置（表示用）
    isPaused: false, // 一時停止中かどうか（UI/UX第4版で追加）
    pausedAtRawPositionSec: null, // 一時停止した瞬間の「生の経過時間」（オフセット抜き）。isPaused中はここを凍結して使う
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
    pausedAtRawPositionSec: null,
  };
}

// 「同期をやり直す」。offset等はリセットするが、この関数は曲データ・コールデータ・
// 初心者ナビ設定・IndexedDBのいずれにも一切触れない（そもそも参照すらしない）。
export function resetKaraokeSync() {
  return createKaraokeSyncState();
}

// タイミング補正抜きの「生の経過時間」（秒）。一時停止中は凍結された値を返す。
function getRawPositionSec(state, monotonicNowMs) {
  if (!state.isSyncing || state.syncStartAtMs === null) return null;
  if (state.isPaused) return state.pausedAtRawPositionSec;
  return (monotonicNowMs - state.syncStartAtMs) / 1000;
}

// 現在のカラオケ経過位置（秒）＝「生の経過時間」＋「タイミング補正値」。同期中でなければnullを返す。
export function getKaraokePositionSec(state, monotonicNowMs) {
  const rawPositionSec = getRawPositionSec(state, monotonicNowMs);
  if (rawPositionSec === null) return null;
  return rawPositionSec + state.offsetMs / 1000;
}

// ===== 一時停止／再開（UI/UX第4版で追加、第6版で「タイミング補正には触れない」設計へ再設計） =====
// 「0秒へ戻す完全停止」ではなく、「今の位置を凍結し、同じ位置から再開できる」一時停止。
// 呼び出し側は、これと同時に端末音源の.pause()／.play()も必ず行うこと
// （この関数自体は音源要素に一切触れない。同期時計と音源の両方を同時に止める／再開する責務は
// 呼び出し側＝js/karaokeSyncScreen.jsが持つ）。
//
// pauseKaraokeSyncは「生の経過時間」を凍結するだけで、offsetMs（タイミング補正値）には
// 一切触れない。resumeKaraokeSyncは、凍結していた「生の経過時間」から途切れなく続きを
// 計算できるよう、syncStartAtMsを一時停止していた実時間の分だけ後ろへずらすだけで、
// これもoffsetMsには触れない。この結果、「一時停止していた秒数の分だけ補正値がズレる」
// ということが構造的に起こり得なくなる（本人指摘の不具合の修正）。
export function pauseKaraokeSync(state, monotonicNowMs) {
  if (!state.isSyncing || state.isPaused) return state;
  const rawPositionSec = getRawPositionSec(state, monotonicNowMs);
  return { ...state, isPaused: true, pausedAtRawPositionSec: rawPositionSec };
}

export function resumeKaraokeSync(state, monotonicNowMs) {
  if (!state.isSyncing || !state.isPaused) return state;
  // 「今の生の経過時間 − 凍結していた生の経過時間」を新しい基準時刻に上乗せすることで、
  // 再開直後にgetRawPositionSec()を呼んでも、必ずpausedAtRawPositionSecと同じ値が返る
  // （＝続きから途切れなく再開する）。offsetMsはこの計算に一切登場しない。
  const newSyncStartAtMs = monotonicNowMs - state.pausedAtRawPositionSec * 1000;
  return { ...state, isPaused: false, pausedAtRawPositionSec: null, syncStartAtMs: newSyncStartAtMs };
}

// ===== タイミング調整 =====
// offsetを増やすと、計算上の現在位置が大きくなる→コールの表示が実際より早く来る＝「早める」。
// offsetを減らすと、計算上の現在位置が小さくなる→コールの表示が実際より遅く来る＝「遅らせる」。
// 【UI/UX第3版・本人指示で必ず検証】この符号の向きは、以下の具体例で確認済み：
// 「曲スタート」を実際より1秒遅く押した場合、アプリの経過時間は本当のカラオケより
// 常に1秒少なく計算される＝コール表示は本来より遅れて出る。これを直すには、offsetを
// +1000msして「早める」必要がある（実際に本来より遅れているものを早めて追いつかせる）。
// この関係が、ここより下のresyncToPosition()の計算式とも整合していることをテスト
// （tests/karaokeSync.test.js）で確認している。
//
// 【UI/UX第6版】offsetMsは常に「生の経過時間」に加算されるだけの値（getKaraokePositionSec
// 参照）なので、一時停止中かどうかで場合分けする必要がなくなった。一時停止中に押しても、
// 凍結されている生の経過時間はそのまま、そこに足すoffsetMsだけが変わるため、画面上の
// 表示位置は一時停止中でも正しく（凍結位置＋新しい補正値へ）動く。
export function adjustOffsetMs(state, deltaMs) {
  return { ...state, offsetMs: state.offsetMs + deltaMs };
}

// タイミング調整だけを0msへ戻す。同期自体（開始時刻・経過位置・音源再生）には一切触れない
// （本人指示：「曲そのものを最初からやり直す機能ではない。現在位置・音源再生は維持したまま、
// タイミング補正だけを0に戻す」）。
export function resetOffsetToZero(state) {
  return { ...state, offsetMs: 0 };
}

// ===== 「今！」・歌詞タップによる途中再同期 =====
// targetPositionSec（同期ポイントとなるコールのstart、または歌詞行のstart）が、
// まさに今この瞬間に実際のカラオケで起きているとみなし、以後その前提でoffsetを引き直す。
// これは実質的に「タイミング補正値（B）を、現在の生の経過時間（A）を基準に1回で設定し直す」
// 操作であり、「再生位置（A）」には一切触れない（本人指示：この2つは内部状態も分離する）。
// 一時停止中に呼ばれた場合も、凍結されている生の経過時間を基準にoffsetだけを計算するため、
// 一時停止状態自体はそのまま維持される。
export function resyncToPosition(state, targetPositionSec, monotonicNowMs) {
  if (!state.isSyncing || state.syncStartAtMs === null) return state;
  const rawPositionSec = getRawPositionSec(state, monotonicNowMs);
  const newOffsetMs = (targetPositionSec - rawPositionSec) * 1000;
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
// 読める大きさに抑える、という3段階を判定する純粋関数。実体はjs/callSync.js側に
// 移した（通常再生画面の演出強化でも同じ3段階が必要になったため。SHORT/MEDIUM/LONGの
// 境界を2箇所に重複定義しないよう、こちらは呼び出し元の互換のための再エクスポートのみ）。
export { getCallDisplayTier };

// ===== NEXT CALL予告（UI/UX第6版で追加） =====
// 「今／もうすぐ」の次に来るコールを1件だけでなく、その先の数件も小さく予告する。
// calls（start昇順）の中から、afterStartSec（今のHUDで主役表示しているコールのstart）より
// あとに始まるものを、先頭からmaxCount件返す（現在アクティブ中のコール自身は含まない）。
export function getUpcomingCallPreviews(calls, afterStartSec, maxCount) {
  if (afterStartSec === null || afterStartSec === undefined) return [];
  return calls.filter((call) => call.start > afterStartSec).slice(0, maxCount);
}

// 予告表示用の短いラベルを作る純粋関数。
// SHORT/MEDIUMはそのまま本文を見せてよい長さのため本文をそのまま返す。
// LONG（MIX・口上等）は予告欄では本文全体を見せる意味が薄いため、既存のコール種別
// （CALL_TYPE_LABELS＝callStorage.jsのtypeに対応する「MIX」「コール」等の表示名）があれば
// それを使う（本人指示：存在しない情報を勝手に生成しない）。type情報が無い場合だけ、
// 本文を適切な文字数で省略表示する。
const PREVIEW_TRUNCATE_LENGTH = 10;

export function getCallPreviewLabel(call) {
  if (getCallDisplayTier(call.text) !== "long") return call.text;
  const typeLabel = CALL_TYPE_LABELS[call.type];
  if (typeLabel) return typeLabel;
  return `${call.text.slice(0, PREVIEW_TRUNCATE_LENGTH)}…`;
}
