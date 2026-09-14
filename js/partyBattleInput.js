// パーティー対戦（2026-09-15新設）の「入力の交通整理」を担当するファイル。
//
// 早押しでは「同時に2人が押した」「START前から指を置きっぱなしにしてSTARTを跨いだ（フライング）」
// 「連打・マルチタッチで1問に2回答入った」といった事故が起きやすい。ここでは、
//   ・START後に新しく始まったpointer（pointerdown）だけを有効にする
//   ・最初の1件だけを原子的に受理し、その瞬間に入力ロックを立てる（2件目以降は必ず拒否）
//   ・長押し（全員PASS＝約1秒、終了＝約2秒）の成立／不成立を1箇所で判定する
// という3つを、DOMイベントの細部から切り離した形で提供する。判定部分（createClaimArbiter）は
// 純粋なロジックなので、tests/partyBattleInput.test.jsで機械的に検証できる。

// 「最初の有効入力1件だけを受理する」判定器。
//   enable(nowMs): START直後に呼ぶ。以後、nowMs以降に始まったpointerだけ有効。
//   disable(): カウントダウン開始・回答権確定・問題終了などで呼ぶ。以後すべて拒否。
//   tryClaim(pointerStartedAtMs): 受理できたらtrue（この呼び出しで即ロックされる）。
//     pointerStartedAtMsがenable時刻より前＝START前から押していたフライングは拒否。
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
    tryClaim(pointerStartedAtMs) {
      if (enabledAtMs === null || claimed) return false;
      if (!(pointerStartedAtMs >= enabledAtMs)) return false;
      claimed = true;
      return true;
    },
  };
}

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

// 「押した瞬間」を回答として扱うボタンに、pointerdownベースの早押し処理を付ける。
// click（指を離した時）ではなくpointerdown（触れた瞬間）で判定するのは、早押しで
// 「先に触れた人が勝つ」という直感どおりにするため。onPress(pointerStartedAtMs)は
// 有効なpointerdownのたびに呼ばれ、受理するかどうかはエンジン側（arbiter＋状態遷移）が決める。
// touch-action等の抑止はCSS側（.party-play-root）で行うため、ここではpreventDefaultで
// 二重発火（pointerdown→click）だけ抑える。
export function attachPressHandler(element, onPress) {
  const handler = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    onPress(event.timeStamp, event);
  };
  element.addEventListener("pointerdown", handler);
  // クリック（キーボード操作を含む）は、pointerdownの後に二重で来るため無視する。
  element.addEventListener("click", (event) => event.preventDefault());
  return () => element.removeEventListener("pointerdown", handler);
}

// 長押しボタン。押している間はonProgress(0〜1)を定期的に呼び、durationMs押し続けたらonComplete。
// 途中で離す／指が外れる（pointerleave・pointercancel）と不成立でonCancel。
// 「tapだけでは発動しない」（本人確定）を満たすため、短いタップは何も起こさない。
const LONG_PRESS_TICK_MS = 40;

export function attachLongPressHandler(element, { durationMs, onProgress, onComplete, onCancel, now = () => performance.now() }) {
  let pressedAtMs = null;
  let intervalId = null;
  let completed = false;

  const stop = (cancelled) => {
    if (intervalId !== null) clearInterval(intervalId);
    intervalId = null;
    pressedAtMs = null;
    if (cancelled) onCancel?.();
  };

  const tick = () => {
    if (pressedAtMs === null) return;
    const progress = computeLongPressProgress(pressedAtMs, now(), durationMs);
    onProgress?.(progress);
    if (progress >= 1) {
      completed = true;
      stop(false);
      onComplete?.();
    }
  };

  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    completed = false;
    pressedAtMs = now();
    // 押している間に指が少しずれても離した扱いにならないよう、このボタンにpointerを固定する
    // （非対応・無効なpointerIdでは例外になるだけなので無視してよい）。
    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      /* 無視 */
    }
    // requestAnimationFrameはタブが非表示のとき止まるため、短い間隔のsetIntervalで進捗を刻む
    intervalId = setInterval(tick, LONG_PRESS_TICK_MS);
    tick();
  });
  const release = () => {
    if (pressedAtMs === null) return;
    stop(!completed);
  };
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("pointerleave", release);
  element.addEventListener("click", (event) => event.preventDefault());
  element.addEventListener("contextmenu", (event) => event.preventDefault());
}
