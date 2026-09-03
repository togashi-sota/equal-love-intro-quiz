// 即時回答型の4択／10択ボタン（選択肢をタップすると即座に正誤判定へ進む形式）へ、
// 「押した瞬間に確定」ではなく「押した状態のまま、そのボタンの中で指を離した瞬間に確定」
// という一般的なスマホのボタン操作感を与えるための共通モジュール（2026-11-XX新設、本人指示：
// 実プレイで「押し間違えて指を逃がしたのに回答が確定してしまう」という報告を受けての改善）。
//
// 【対象範囲について】このモジュールが対応するのは「タップ即回答確定」のボタンだけで、
// 既に確認モーダル（js/answerConfirmPrompt.js）を挟んでいる一瞬チャレンジ系・
// オンライン一瞬対戦系・歌詞クイズ対戦の非早押しルールは対象外（既に別の誤タップ対策が
// 入っているため、二重に保護する必要が無い。呼び出し側で個別に判断して適用する）。
//
// 【設計方針】
// ・pointerdown〜pointerup/pointercancelの間、ボタンへpointer captureを設定することで、
//   指がボタンの外へ出ても引き続きこのボタンがpointermove/upを受け取れるようにする。
// ・pointermoveのたびに、今の指の位置がボタンの矩形＋許容範囲（CANCEL_SLOP_PX）の外へ
//   出たかどうかを判定する。出た時点で「キャンセル」状態にし、押下中の見た目（is-pressed）を
//   即座に解除する。一度キャンセルすると、その後どれだけ指を動かしても（元のボタンへ戻す・
//   別のボタンへ移動する等）そのpointer操作では二度と確定しない。
// ・pointerupの時点でキャンセルされていなければ、そこで初めてonConfirm()を呼ぶ。
// ・pointercancel（着信・OSジェスチャー等による中断）も、キャンセルと同じ扱いにする。
// ・キーボード操作（1〜4キー）や画面読み上げ操作の.click()合成呼び出し等、pointer eventsを
//   経由しない環境向けに"click"イベントも監視するが、直前に自分のpointer処理が同じ操作を
//   処理済み（＝確定させた、またはキャンセルした）場合は、後から自動発火するネイティブの
//   click（ブラウザがpointerup後に自動的に発火させるもの）を二重処理しないよう無視する。
//
// 【許容範囲（CANCEL_SLOP_PX）について】スマホでは指が触れている間もわずかに位置がぶれるため、
// 1pxでも矩形の外に出たら即キャンセルにすると、普通にタップしただけで誤ってキャンセル扱いに
// なってしまう。かといって広すぎると「明らかに指を逃がした」つもりの操作が確定してしまう。
// 本人指示により具体的な数値はこちら側で決めてよいとのことなので、Appleの人間工学ガイドラインが
// 推奨する最小タップ領域（44pt角）のおよそ半分にあたる24pxを外側マージンとして採用した
// （自然な指ブレは数px程度で収まることが多く24pxあれば十分に吸収できる一方、ボタン半分弱の
// 距離を明確に指を動かせばキャンセルされる、という実用的なバランスを狙った値）。
const CANCEL_SLOP_PX = 24;

function isPointInsideRectWithSlop(x, y, rect, slopPx) {
  return x >= rect.left - slopPx && x <= rect.right + slopPx && y >= rect.top - slopPx && y <= rect.bottom + slopPx;
}

// button: 対象のボタン要素。onConfirm: 正式に回答確定していいと判断できた瞬間に呼ばれる
// コールバック（引数無し）。呼び出し元は、この中で実際の回答処理（正誤判定・SE・
// 次問遷移等）を行う。
//
// 戻り値：後始末用のdispose()関数（現状どの呼び出し元も画面ごとdisposeしていないため
// 必須ではないが、将来的にボタンをJSから明示的に破棄したくなった場合のために用意する）。
export function bindPressReleaseAnswer(button, onConfirm) {
  let trackingPointerId = null;
  let cancelled = false;
  let suppressNextNativeClick = false;

  function setPressed(pressed) {
    button.classList.toggle("is-pressed", pressed);
  }

  function endGesture(pointerId, { viaCancelEvent }) {
    if (pointerId !== trackingPointerId) return;
    try {
      button.releasePointerCapture(pointerId);
    } catch {
      // releasePointerCapture自体が失敗しても（既に失われている等）、後続の状態リセットは
      // 必ず行う必要があるため、ここでは無視して続行する。
    }
    setPressed(false);
    const shouldConfirm = !cancelled && !viaCancelEvent;
    trackingPointerId = null;
    cancelled = false;
    // このジェスチャーに続いてブラウザが自動的に発火させるネイティブのclickイベントを
    // 1回だけ無視する（下のonNativeClick参照）。同期的なイベント連鎖の中で処理されるため、
    // queueMicrotaskでのクリアはその後（次の操作までの間）の安全な後始末として機能する。
    suppressNextNativeClick = true;
    queueMicrotask(() => {
      suppressNextNativeClick = false;
    });
    if (shouldConfirm) onConfirm();
  }

  function onPointerDown(event) {
    if (button.disabled) return;
    // 【複数指同時操作への対応】既に別の指を追跡中なら、新しい指は無視する
    // （2本指で同時に別々の選択肢を押した場合、最初に押した方だけを有効にする）。
    if (trackingPointerId !== null) return;
    trackingPointerId = event.pointerId;
    cancelled = false;
    setPressed(true);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // 一部の古い環境やテスト環境ではsetPointerCaptureが無い/失敗することがあるが、
      // その場合でも通常のバブリングでpointermove/upは受け取れるため、致命的ではない。
    }
  }

  function onPointerMove(event) {
    if (event.pointerId !== trackingPointerId || cancelled) return;
    const rect = button.getBoundingClientRect();
    if (!isPointInsideRectWithSlop(event.clientX, event.clientY, rect, CANCEL_SLOP_PX)) {
      cancelled = true;
      setPressed(false);
    }
  }

  function onPointerUp(event) {
    endGesture(event.pointerId, { viaCancelEvent: false });
  }

  function onPointerCancel(event) {
    endGesture(event.pointerId, { viaCancelEvent: true });
  }

  // 【なぜclickも見るか】キーボードの1〜4キー・スクリーンリーダー等、実際のpointerイベントを
  // 経由しない操作は button.click() を直接呼ぶ（main.jsのキーボードショートカット等）。
  // これらは通常のpointerdown/upの流れを一切通らないため、click単体で拾って確定させる
  // フォールバックが必要。一方、実際に指やマウスでpointerdown→pointerupを経た操作では、
  // ブラウザが自動的にその後へネイティブclickイベントも発火させる。これをそのまま
  // onConfirm()にもつなげると1回の操作でonConfirm()が2回呼ばれてしまうため、
  // 直前のpointer操作が既に処理済み（確定・キャンセルのどちらでも）だった場合は、
  // この自動発火分を無視する。
  function onNativeClick() {
    if (suppressNextNativeClick) {
      suppressNextNativeClick = false;
      return;
    }
    if (button.disabled) return;
    onConfirm();
  }

  button.addEventListener("pointerdown", onPointerDown);
  button.addEventListener("pointermove", onPointerMove);
  button.addEventListener("pointerup", onPointerUp);
  button.addEventListener("pointercancel", onPointerCancel);
  button.addEventListener("click", onNativeClick);

  return function dispose() {
    button.removeEventListener("pointerdown", onPointerDown);
    button.removeEventListener("pointermove", onPointerMove);
    button.removeEventListener("pointerup", onPointerUp);
    button.removeEventListener("pointercancel", onPointerCancel);
    button.removeEventListener("click", onNativeClick);
  };
}

// テストコードから、実装詳細（許容pxの値）を直接検証できるようにするための読み取り専用export。
export function getAnswerButtonCancelSlopPx() {
  return CANCEL_SLOP_PX;
}
