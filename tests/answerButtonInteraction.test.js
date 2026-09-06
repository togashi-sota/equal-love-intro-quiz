// js/answerButtonInteraction.js（回答ボタンの「押した状態のまま、ボタン内で指を離した瞬間に
// 確定する」方式・スライドアウトによるキャンセル）のテスト。
//
// 【このテストで検証できること／できないこと】setPointerCapture()は、実ブラウザでも
// スクリプトから発火させた合成PointerEventに対しては仕様上の挙動が実装依存であり
// （trueのpointer captureが働くとは限らない）、このテストではその点を検証しない
// （bindPressReleaseAnswer()自身もtry/catchで包んでおり、失敗しても致命的にならない設計）。
// 代わりに、実際に指がボタンに追従して動いた場合と同じイベント列を、対象ボタン自身へ
// 直接dispatchEvent()することで（＝pointer captureが正しく機能した場合に実ブラウザで
// 起きるのと同じイベントの流れを模して）、状態遷移・確定/キャンセルの判定ロジックだけを検証する。
import { bindPressReleaseAnswer, getAnswerButtonCancelSlopPx } from "../js/answerButtonInteraction.js";
import { assertEqual } from "./test-utils.js";

let nextPointerId = 1;

function makeButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.style.position = "fixed";
  button.style.left = "0px";
  button.style.top = "0px";
  button.style.width = "100px";
  button.style.height = "50px";
  document.body.appendChild(button);
  return button;
}

function firePointerEvent(button, type, { x, y, pointerId }) {
  button.dispatchEvent(
    new PointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true, cancelable: true })
  );
}

export function runAnswerButtonInteractionTests() {
  // ===== 通常の素早いタップ：1回だけ確定する =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId = nextPointerId++;

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
    assertEqual(button.classList.contains("is-pressed"), true, "通常タップ：pointerdown直後はis-pressedが付く");
    firePointerEvent(button, "pointerup", { x: 50, y: 25, pointerId });
    assertEqual(confirmCount, 1, "通常タップ：同じ位置でpointerupすると1回だけ確定する");
    assertEqual(button.classList.contains("is-pressed"), false, "通常タップ：確定後はis-pressedが外れる");
    button.remove();
  }

  // ===== 許容範囲（slop）内の指ブレはキャンセルにならない =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId = nextPointerId++;
    const slop = getAnswerButtonCancelSlopPx();

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
    // ボタン矩形の右端(100)から、許容範囲ぎりぎり内側（slop - 1px）だけ外に出す。
    firePointerEvent(button, "pointermove", { x: 100 + slop - 1, y: 25, pointerId });
    assertEqual(button.classList.contains("is-pressed"), true, "許容範囲内の移動ではis-pressedを維持する");
    firePointerEvent(button, "pointerup", { x: 100 + slop - 1, y: 25, pointerId });
    assertEqual(confirmCount, 1, "許容範囲内の移動なら、そのままpointerupで確定する");
    button.remove();
  }

  // ===== 明らかにボタン外へ指を逃がした場合：キャンセルされ、確定しない =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId = nextPointerId++;
    const slop = getAnswerButtonCancelSlopPx();

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
    // 許容範囲を明確に超える位置（slop + 20px外）まで動かす。
    firePointerEvent(button, "pointermove", { x: 100 + slop + 20, y: 25, pointerId });
    assertEqual(button.classList.contains("is-pressed"), false, "ボタン外へ明確に逃がした時点でis-pressedが即座に外れる");
    firePointerEvent(button, "pointerup", { x: 100 + slop + 20, y: 25, pointerId });
    assertEqual(confirmCount, 0, "ボタン外へ逃がしてから離すと確定しない");
    button.remove();
  }

  // ===== キャンセル後に元のボタン範囲へ指を戻しても、そのpointer操作では復活しない =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId = nextPointerId++;
    const slop = getAnswerButtonCancelSlopPx();

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
    firePointerEvent(button, "pointermove", { x: 100 + slop + 20, y: 25, pointerId }); // キャンセル
    firePointerEvent(button, "pointermove", { x: 50, y: 25, pointerId }); // 元の位置へ戻す
    assertEqual(button.classList.contains("is-pressed"), false, "一度キャンセルすると、元の位置へ戻してもis-pressedは復活しない");
    firePointerEvent(button, "pointerup", { x: 50, y: 25, pointerId });
    assertEqual(confirmCount, 0, "一度キャンセルすると、元の位置に戻してから離しても確定しない");
    button.remove();
  }

  // ===== pointercancel（着信等による中断）でも確定しない =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId = nextPointerId++;

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
    firePointerEvent(button, "pointercancel", { x: 50, y: 25, pointerId });
    assertEqual(confirmCount, 0, "pointercancelでは確定しない");
    assertEqual(button.classList.contains("is-pressed"), false, "pointercancel後はis-pressedが外れる");
    button.remove();
  }

  // ===== 次の新しいタップは正常に確定できる（内部状態が完全リセットされている） =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId1 = nextPointerId++;
    const slop = getAnswerButtonCancelSlopPx();

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId: pointerId1 });
    firePointerEvent(button, "pointermove", { x: 100 + slop + 20, y: 25, pointerId: pointerId1 }); // キャンセル
    firePointerEvent(button, "pointerup", { x: 100 + slop + 20, y: 25, pointerId: pointerId1 });
    assertEqual(confirmCount, 0, "1回目（キャンセル）では確定しない");

    const pointerId2 = nextPointerId++;
    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId: pointerId2 });
    firePointerEvent(button, "pointerup", { x: 50, y: 25, pointerId: pointerId2 });
    assertEqual(confirmCount, 1, "次の新しいタップ（別pointerId）は正常に確定できる");
    button.remove();
  }

  // ===== 無効化されたボタンはpointerdownで反応しない =====
  {
    const button = makeButton();
    button.disabled = true;
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId = nextPointerId++;

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
    assertEqual(button.classList.contains("is-pressed"), false, "disabledボタンはpointerdownしてもis-pressedが付かない");
    firePointerEvent(button, "pointerup", { x: 50, y: 25, pointerId });
    assertEqual(confirmCount, 0, "disabledボタンは離しても確定しない");
    button.remove();
  }

  // ===== 高速連打でも二重回答にならない（1タップ＝1確定） =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);

    for (let i = 0; i < 5; i++) {
      const pointerId = nextPointerId++;
      firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
      firePointerEvent(button, "pointerup", { x: 50, y: 25, pointerId });
    }
    assertEqual(confirmCount, 5, "5回連打すれば5回確定する（1回のタップにつき1回だけ、が5セット）");
    button.remove();
  }

  // ===== 【2026-09-06追加・本人のiPhone実機報告バグの回帰テスト】検索式の回答候補一覧は
  //      スクロール可能（overflow-y:auto）で、ボタンを押さえたまま一覧を指でスクロールすると
  //      ボタン自身も指と一緒に画面上を移動する。以前はonPointerMoveのたびに
  //      button.getBoundingClientRect()を取り直していたため、ボタンが指と一緒に動く限り
  //      「範囲内」と判定され続け、単にスクロールして曲を探していただけなのに指を離した
  //      瞬間にそのボタンの回答が誤って確定してしまっていた（実機での「回答していないのに
  //      勝手に不正解になる」不具合の直接の原因）。押し始めた時点の矩形（frozenPressRect）を
  //      固定して比較することで、ボタンがスクロールで動いても正しくキャンセル扱いになることを
  //      検証する。
  {
    const button = makeButton(); // position:fixed; top:0; left:0; width:100; height:50
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId = nextPointerId++;

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
    // 一覧が指と一緒に上へ100pxスクロールした状況を再現する：ボタン自身がtop:-100pxへ動き、
    // 指もそれに追従して同じ量（100px）だけ上へ動く（＝相対位置は変わらず「範囲内」に
    // 見えるが、絶対位置としては押し始めた場所から明確に離れている）。
    button.style.top = "-100px";
    firePointerEvent(button, "pointermove", { x: 50, y: 25 - 100, pointerId });
    assertEqual(
      button.classList.contains("is-pressed"),
      false,
      "スクロールでボタンごと指に付いてきても、押し始めた位置基準で範囲外と判定されキャンセルされる"
    );
    firePointerEvent(button, "pointerup", { x: 50, y: 25 - 100, pointerId });
    assertEqual(
      confirmCount,
      0,
      "一覧をスクロールしただけ（曲を探していただけ）では、指を離しても回答が確定しない"
    );
    button.remove();
  }

  // ===== 上と対になる確認：ボタンが動かず（＝スクロールが起きず）、その場で押して
  //      離す通常のタップは、frozenPressRect導入後も変わらず確定する =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId = nextPointerId++;

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
    firePointerEvent(button, "pointermove", { x: 52, y: 26, pointerId }); // 通常の指ブレ程度
    firePointerEvent(button, "pointerup", { x: 52, y: 26, pointerId });
    assertEqual(confirmCount, 1, "ボタンが動かない通常のタップは、わずかな指ブレがあっても確定する");
    button.remove();
  }

  // ===== キーボード操作等、pointer eventsを経由しない.click()合成呼び出しでも確定する =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);

    button.click();
    assertEqual(confirmCount, 1, "pointerイベントを経由しない.click()（キーボードショートカット等）でも確定する");
    button.remove();
  }

  // ===== 実際のpointerdown→pointerupの後、ブラウザが自動発火させるネイティブclickを
  //      二重処理しない（1回のタップでonConfirmが2回呼ばれない） =====
  {
    const button = makeButton();
    let confirmCount = 0;
    bindPressReleaseAnswer(button, () => confirmCount++);
    const pointerId = nextPointerId++;

    firePointerEvent(button, "pointerdown", { x: 50, y: 25, pointerId });
    firePointerEvent(button, "pointerup", { x: 50, y: 25, pointerId });
    assertEqual(confirmCount, 1, "pointerup直後の時点で確定は1回");
    // ブラウザが実機のタップで自動的に発火させるネイティブclickを模して手動で発火する。
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    assertEqual(confirmCount, 1, "pointerupに続くネイティブclickは二重処理されない（合計は1回のまま）");
    button.remove();
  }
}
