// パーティー対戦（2026-09-15新設）の「入力の交通整理」を担当するファイル。
//
// 早押しでは「同時に2人が押した」「START前から指を置きっぱなしにしてSTARTを跨いだ（フライング）」
// 「連打・マルチタッチで1問に2回答入った」といった事故が起きやすい。ここでは、
//   ・START後に新しく始まったpointer（pointerdown）だけを有効にする
//   ・最初の1件だけを原子的に受理し、その瞬間に入力ロックを立てる（2件目以降は必ず拒否）
//   ・長押し（全員PASS＝約1秒、終了＝約2秒）の成立／不成立を1箇所で判定する
// という3つを、DOMイベントの細部から切り離した形で提供する。判定部分（createClaimArbiter・
// createLongPressTracker）は純粋なロジックなので、tests/partyBattleInputAndVoice.test.jsで機械的に検証できる。
//
// 【2026-09-15 第1回実機QA修正・本人指示：回答操作を「押した瞬間」→「ボタン上で離した瞬間」へ】
// 以前は pointerdown の瞬間に回答確定していたが、押し間違えを取り消せず、実機での操作感も
// 既存のオフラインクイズ（js/answerButtonInteraction.js：押す→へこむ→ボタン上で離して確定、
// 外へスライドして離すとキャンセル、pointercancelもキャンセル）と違っていた。そこで回答ボタン
// （4択の選択肢・音声の「回答！」・一瞬のPASS）はすべて既存の bindPressReleaseAnswer() を
// そのまま再利用し、確定時に受け取る pressStartedAtMs（押し始めた pointerdown の時刻）で
// フライング判定だけを行う。早押しの勝者は「最初に成立した有効な回答確定操作（＝最初の有効な
// pointerup）」になる。先に押しただけでは権利を予約しない。

import { bindPressReleaseAnswer } from "./answerButtonInteraction.js";

// 「最初の有効入力1件だけを受理する」判定器。
//   enable(nowMs): START直後に呼ぶ。以後、nowMs以降に始まったpointerだけ有効。
//   disable(): カウントダウン開始・回答権確定・問題終了などで呼ぶ。以後すべて拒否。
//   tryClaim(pointerStartedAtMs): 受理できたらtrue（この呼び出しで即ロックされる）。
//     pointerStartedAtMsがenable時刻より前＝START前から押していたフライングは拒否。
//     pointerを経由しない操作（null）は、押し始めが確認できないため拒否する。
export function createClaimArbiter() {
  let enabledAtMs = null;
  let claimed = false;
  return {
    enable(nowMs) {
      enabledAtMs = nowMs;
      claimed = false;
    },
    disable() {
      enabledAtMs = null;
      claimed = true;
    },
    isEnabled() {
      return enabledAtMs !== null && !claimed;
    },
    // 【第6回】受理せずに「この押し始め時刻なら受理できるか」だけを調べる（音声認識の先行起動の可否に使う）。
    wouldAccept(pointerStartedAtMs) {
      if (enabledAtMs === null || claimed) return false;
      return typeof pointerStartedAtMs === "number" && pointerStartedAtMs >= enabledAtMs;
    },
    tryClaim(pointerStartedAtMs) {
      if (enabledAtMs === null || claimed) return false;
      if (typeof pointerStartedAtMs !== "number" || !(pointerStartedAtMs >= enabledAtMs)) return false;
      claimed = true;
      return true;
    },
  };
}

// 回答ボタン（4択の選択肢・「回答！」・一瞬のPASS）に、既存クイズと同じ
// 「押す→へこむ→ボタン上で離して確定／外へスライドして離すとキャンセル」を付ける。
// onConfirm(pressStartedAtMs) は「ボタンの中で指を離した」瞬間だけ呼ばれる。
// 受理するかどうか（フライング・回答権の有無・ロック）はエンジン側（arbiter＋状態遷移）が決める。
// 押している間は .is-pressed が付く（js/answerButtonInteraction.js が管理。CSSは.party-*用に用意）。
// hooks（省略可）: { onPressStart(pressStartedAtMs), onPressEnd({ confirmed, pressStartedAtMs }) }
// 【第6回】「回答！」は押した瞬間（pointerdown）に音声認識を先行起動するため、押し始め・キャンセルの通知を受け取れるようにした。
export function attachPressHandler(element, onConfirm, hooks = {}) {
  return bindPressReleaseAnswer(element, ({ pressStartedAtMs } = {}) => onConfirm(pressStartedAtMs ?? null), {
    onPressStart: hooks.onPressStart ? ({ pressStartedAtMs }) => hooks.onPressStart(pressStartedAtMs ?? null) : undefined,
    onPressEnd: hooks.onPressEnd,
  });
}

// ===== 長押し（全員PASS＝約1秒、終了＝約2秒） =====

// 指の許容ぶれ幅。回答ボタンと同じ考え方（Appleの最小タップ領域44ptのおよそ半分）。
const LONG_PRESS_SLOP_PX = 24;
const LONG_PRESS_TICK_MS = 40;

// 長押しの成立判定（純粋関数）。pressedAtMsから離すまでの時間がdurationMs以上なら成立。
export function isLongPressSatisfied(pressedAtMs, releasedAtMs, durationMs) {
  if (typeof pressedAtMs !== "number" || typeof releasedAtMs !== "number") return false;
  return releasedAtMs - pressedAtMs >= durationMs;
}

// 長押しの進捗（0〜1）。進捗バーの表示用。
export function computeLongPressProgress(pressedAtMs, nowMs, durationMs) {
  if (typeof pressedAtMs !== "number") return 0;
  return Math.min(1, Math.max(0, (nowMs - pressedAtMs) / durationMs));
}

function isPointInsideRectWithSlop(x, y, rect, slopPx) {
  return x >= rect.left - slopPx && x <= rect.right + slopPx && y >= rect.top - slopPx && y <= rect.bottom + slopPx;
}

// 長押しの状態機械（純粋。DOMに触れない）。テストと attachLongPressHandler の両方から使う。
//   down(nowMs, rect): 押し始め
//   move(x, y): 指の移動。rect＋許容範囲の外に出たらキャンセル（以後そのジェスチャーでは成立しない）
//   tick(nowMs): 進捗を返す（成立した瞬間に completed=true を1回だけ返す）
//   up(nowMs, x, y): 離した。成立前ならキャンセル
//   cancel(): pointercancel
// 戻り値の progress は 0〜1、state は "idle" | "pressing" | "completed" | "cancelled"。
export function createLongPressTracker({ durationMs, slopPx = LONG_PRESS_SLOP_PX }) {
  let state = "idle";
  let pressedAtMs = null;
  let rect = null;
  let fired = false;
  const snapshot = (progress) => ({ state, progress });
  return {
    down(nowMs, pressRect) {
      state = "pressing";
      pressedAtMs = nowMs;
      rect = pressRect;
      fired = false;
      return snapshot(0);
    },
    move(x, y) {
      if (state !== "pressing") return snapshot(state === "completed" ? 1 : 0);
      if (rect && !isPointInsideRectWithSlop(x, y, rect, slopPx)) {
        state = "cancelled";
        return snapshot(0);
      }
      return snapshot(computeLongPressProgress(pressedAtMs, pressedAtMs, durationMs));
    },
    tick(nowMs) {
      if (state !== "pressing") return { ...snapshot(state === "completed" ? 1 : 0), justCompleted: false };
      const progress = computeLongPressProgress(pressedAtMs, nowMs, durationMs);
      if (progress >= 1 && !fired) {
        state = "completed";
        fired = true;
        return { state, progress: 1, justCompleted: true };
      }
      return { state, progress, justCompleted: false };
    },
    up(nowMs, x, y) {
      if (state === "completed") {
        state = "idle";
        return { state: "completed", progress: 1, justCompleted: false };
      }
      if (state === "pressing") {
        // 離した位置でも再確認（pointermoveは間引かれることがある）
        const inside = !rect || typeof x !== "number" || isPointInsideRectWithSlop(x, y, rect, slopPx);
        const satisfied = inside && isLongPressSatisfied(pressedAtMs, nowMs, durationMs) && !fired;
        state = "idle";
        if (satisfied) {
          fired = true;
          return { state: "completed", progress: 1, justCompleted: true };
        }
      }
      state = "idle";
      return { state: "cancelled", progress: 0, justCompleted: false };
    },
    cancel() {
      state = "idle";
      return { state: "cancelled", progress: 0, justCompleted: false };
    },
    getState() {
      return state;
    },
  };
}

// 長押しボタン。押している間は .is-pressed を付け、onProgress(0〜1) を定期的に呼び、
// durationMs 押し続けた瞬間に onComplete を1回だけ呼ぶ（その後に指を離しても二重発火しない）。
// 途中で離す／許容範囲の外へ移動する／pointercancel は不成立で onCancel（進捗は0へ戻す）。
// 「tapだけでは発動しない」（本人確定）を満たすため、短いタップは何も起こさない。
// pointermove/up/cancel は既存の回答ボタンと同じくdocumentレベルで（同じpointerIdだけ）監視する：
// setPointerCaptureの成否に依存せず、指がボタンから外れても確実に追跡できる。
// 進捗の刻みは requestAnimationFrame ではなく setInterval（タブが非表示でも止まらない）。
export function attachLongPressHandler(element, { durationMs, onProgress, onComplete, onCancel, now = () => performance.now() }) {
  const tracker = createLongPressTracker({ durationMs });
  let trackingPointerId = null;
  let intervalId = null;
  let suppressNextNativeClick = false;

  const setPressed = (pressed) => element.classList.toggle("is-pressed", pressed);

  const stopTracking = () => {
    if (intervalId !== null) clearInterval(intervalId);
    intervalId = null;
    document.removeEventListener("pointermove", onDocPointerMove);
    document.removeEventListener("pointerup", onDocPointerUp);
    document.removeEventListener("pointercancel", onDocPointerCancel);
    try {
      if (trackingPointerId !== null) element.releasePointerCapture(trackingPointerId);
    } catch {
      /* 既に失われている等は無視 */
    }
    trackingPointerId = null;
    setPressed(false);
    suppressNextNativeClick = true;
    setTimeout(() => {
      suppressNextNativeClick = false;
    }, 0);
  };

  const finishCancelled = () => {
    stopTracking();
    onProgress?.(0);
    onCancel?.();
  };

  const finishCompleted = () => {
    stopTracking();
    onProgress?.(1);
    onComplete?.();
  };

  const onTick = () => {
    const result = tracker.tick(now());
    if (result.justCompleted) {
      finishCompleted();
      return;
    }
    if (result.state === "cancelled") {
      finishCancelled();
      return;
    }
    onProgress?.(result.progress);
  };

  function onDocPointerMove(event) {
    if (event.pointerId !== trackingPointerId) return;
    const result = tracker.move(event.clientX, event.clientY);
    if (result.state === "cancelled") finishCancelled();
  }

  function onDocPointerUp(event) {
    if (event.pointerId !== trackingPointerId) return;
    const result = tracker.up(now(), event.clientX, event.clientY);
    if (result.justCompleted) finishCompleted();
    else if (result.state !== "completed") finishCancelled();
    else stopTracking(); // 成立後に離した：既に発火済みなので何もしない
  }

  function onDocPointerCancel(event) {
    if (event.pointerId !== trackingPointerId) return;
    tracker.cancel();
    finishCancelled();
  }

  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (trackingPointerId !== null) return; // 別の指を追跡中
    event.preventDefault();
    trackingPointerId = event.pointerId;
    tracker.down(now(), element.getBoundingClientRect());
    setPressed(true);
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* 無効なpointerId等は無視（documentレベルの監視があるため致命的ではない） */
    }
    document.addEventListener("pointermove", onDocPointerMove);
    document.addEventListener("pointerup", onDocPointerUp);
    document.addEventListener("pointercancel", onDocPointerCancel);
    onProgress?.(0);
    intervalId = setInterval(onTick, LONG_PRESS_TICK_MS);
  });
  // 長押しの後に自動発火するネイティブclick、およびキーボード等のclickでは何も起こさない
  // （tapだけで発動しない仕様。長押しはpointer操作でしか成立しない）。
  element.addEventListener("click", (event) => {
    event.preventDefault();
    suppressNextNativeClick = false;
  });
  element.addEventListener("contextmenu", (event) => event.preventDefault());
}
