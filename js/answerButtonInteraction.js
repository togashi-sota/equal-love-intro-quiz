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
// 【設計方針・2026-09-06再設計】
// ・pointerdownの時点で、setPointerCapture()を試みる（成否は問わない。失敗しても後述の
//   documentレベル監視があるため致命的ではない）。
// ・pointermove/pointerup/pointercancelは、ボタン自身ではなくdocumentへ（このpointerIdの
//   押下中だけ）bindする。setPointerCapture()の成否・DOM構造の変化（一覧の再描画等）に
//   一切依存せず、同じ指のイベントを確実に拾い続けるため。
// ・押している間、以下の2つのどちらかが起きた時点で「キャンセル」状態にする：
//   ①スクロールコンテナが実際にスクロールした（scrollTopが動いた）。矩形の再計測
//     タイミングに左右されない、最も確定的な signal。
//   ②押し始めた時点のボタンの矩形＋許容範囲（CANCEL_SLOP_PX）から指が明確に離れた。
//   一度キャンセルすると、その後どれだけ指を動かしても（元のボタンへ戻す・別のボタンへ
//   移動する等）そのpointer操作では二度と確定しない。
// ・pointerupの時点では、それまでのpointermoveでの判定に加えて、release位置そのものでも
//   必ず①②を再確認してからでないと確定しない（pointermoveは間引かれることがあるため、
//   pointerup自身での最終確認が無いと、間引きの隙間で誤って確定してしまう）。
// ・pointercancel（着信・OSジェスチャー等による中断）は、位置に関係なく常にキャンセル扱い。
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

// 【2026-09-06再修正・本人のiPhone実機での再現報告を受けて】前回はfrozenPressRect
// （押し始めた時点のボタン矩形）とその場のポインタ座標だけを比較していたが、本人の
// 全曲検索モードでの実機再テストで「未回答なのに勝手に確定する」「逆にタップしたのに
// 何も起きない」の両方が再発した。矩形とポインタ座標の比較は、実機でのスクロール中の
// レイアウト確定タイミング（メインスレッドとコンポジタスレッドのズレ）に依存しがちで、
// タイミング次第で誤ってどちらの方向にもブレうる、という弱点があった。
// 今回はこれに加えて、より直接的で確定的な信号を優先して使う：
// 「実際にスクロールコンテナのscrollTopが動いたかどうか」。これはブラウザが
// このジェスチャーを実際にスクロールとして消費したという動かぬ証拠であり、
// 矩形の再計測タイミングに一切左右されない。
// また、setPointerCapture()が実機で無言のまま失敗した場合（try/catchで握りつぶされる
// ため、その後どうなるか従来コードでは検証していなかった）、pointermove/up/cancelが
// ボタン自身に届かず「押したのに何も起きない」を引き起こしうるという懸念も踏まえ、
// これらのイベントはボタン自身ではなくdocumentレベルで（対象のpointerIdだけを見て）
// 監視する方式に変更した。setPointerCapture()の成否・DOM構造の変化に関係なく、
// 同じpointerIdのイベントを確実に拾い続けられる。
const SCROLL_CANCEL_THRESHOLD_PX = 3;

// buttonの祖先を辿り、実際にスクロールしうる（overflow-y:auto/scroll かつ
// 中身が実際にはみ出している）直近のコンテナを1つ見つける。無ければnull
// （4択グリッドのようにそもそもスクロールしない画面では、この判定自体を単純にスキップする）。
function findScrollableAncestor(element) {
  let current = element.parentElement;
  while (current && current !== document.body) {
    const style = getComputedStyle(current);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
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
  let frozenPressRect = null;
  let scrollContainer = null;
  let startScrollTop = 0;

  function setPressed(pressed) {
    button.classList.toggle("is-pressed", pressed);
  }

  function removeDocumentListeners() {
    document.removeEventListener("pointermove", onDocPointerMove);
    document.removeEventListener("pointerup", onDocPointerUp);
    document.removeEventListener("pointercancel", onDocPointerCancel);
  }

  // 【2026-09-06再修正・本人の実機再現テストで発覚した重大な見落とし】pointerupの時点で
  // 「指を離した実際の位置」自体を再検証していなかった。ブラウザはpointermoveを
  // 途中の座標すべてについて必ず発火させるとは限らない（間引かれることがある。特に
  // 素早いフリック操作では、最後のpointermoveがまだボタン付近にある間に、その直後の
  // pointerupだけが遠く離れた位置で発生する、という間引きが実際に起こりうる）。
  // 従来はpointerup自身では位置を見ず、それまでのpointermoveで立った`cancelled`フラグ
  // だけを見ていたため、間引きが起きると「実際にはボタンから大きく離れた位置で
  // 指を離した」のに確定してしまっていた（この関数のテストで実際に再現・確認した）。
  // pointerup/pointercancelの時点でも、release位置自体で最終確認を行うことで、
  // pointermoveの発火頻度に一切依存しない、確実な判定にする。
  function endGesture(pointerId, { viaCancelEvent, releaseClientX, releaseClientY }) {
    if (pointerId !== trackingPointerId) return;
    if (!viaCancelEvent && releaseClientX !== undefined) {
      checkForCancellation(releaseClientX, releaseClientY);
    }
    removeDocumentListeners();
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
    frozenPressRect = null;
    scrollContainer = null;
    // このジェスチャーに続いてブラウザが自動的に発火させるネイティブのclickイベントを
    // 1回だけ無視する（下のonNativeClick参照。確定・キャンセルのどちらでも、pointerdown→
    // pointerupを経た操作には必ずこの後ネイティブclickが続くため、常に無視する）。
    // 【2026-09-06再修正・本人の実機再現テストで実際に踏んだ致命的な見落とし】以前は
    // queueMicrotaskでこのフラグを解除していたが、実際のブラウザ操作（本物のpointerdown→
    // pointermove→pointerup、synthetic dispatchEventの1タスク内完結ではない場合）では、
    // ブラウザが自動発火させるネイティブclickは、pointerupの処理完了後・マイクロタスク
    // キューが一度flushされた後に発火することを、実際にイベントの発火順序をログで
    // 確認して突き止めた。つまりqueueMicrotaskでの解除では、実際のclickが来る前に
    // suppressNextNativeClickが早々にfalseへ戻ってしまい、「一覧をスクロールしただけで
    // 正しくキャンセルされた（onConfirmは呼ばれていない）操作」であっても、その直後の
    // ネイティブclickがそのまま素通りしてonConfirm()を呼んでしまっていた（＝キャンセル
    // したはずの回答が、ネイティブclick経由で結局確定してしまうという、確認モーダル
    // 修正が意味を成さなくなる重大な抜け穴）。setTimeout(...,0)（マクロタスク）を使い、
    // 少なくとも現在のタスク＋マイクロタスクキューの処理が完全に終わってから解除する
    // ことで、その間に発火するネイティブclickを確実に無視できるようにした。
    suppressNextNativeClick = true;
    setTimeout(() => {
      suppressNextNativeClick = false;
    }, 0);
    if (shouldConfirm) onConfirm();
  }

  // 指の現在位置から、キャンセルすべきかどうかを判定する。
  // ①スクロールコンテナが実際に動いた（＝ブラウザがこの操作をスクロールとして確定させた）
  //   ことを最優先の確定的な signal として扱う。矩形の再計測タイミングに左右されない。
  // ②スクロールが無くても、押し始めた時点の矩形＋許容範囲から明確に指が離れた場合は
  //   従来どおりキャンセルする（横方向のドラッグ・スクロールしない画面向け）。
  function checkForCancellation(clientX, clientY) {
    if (cancelled) return;
    if (scrollContainer && Math.abs(scrollContainer.scrollTop - startScrollTop) > SCROLL_CANCEL_THRESHOLD_PX) {
      cancelled = true;
      setPressed(false);
      return;
    }
    if (!isPointInsideRectWithSlop(clientX, clientY, frozenPressRect, CANCEL_SLOP_PX)) {
      cancelled = true;
      setPressed(false);
    }
  }

  // pointermove/up/cancelは、ボタン自身ではなくdocumentレベルで監視する（このpointerIdの
  // 押下中だけ、pointerdownのタイミングで登録・endGestureで確実に解除する）。
  // setPointerCapture()が実機で無言に失敗しても、documentは常に全てのpointerイベントを
  // 受け取れるため、この方式なら「押したのに指を離しても何も起きない」を防げる。
  function onDocPointerMove(event) {
    if (event.pointerId !== trackingPointerId) return;
    checkForCancellation(event.clientX, event.clientY);
  }

  function onDocPointerUp(event) {
    if (event.pointerId !== trackingPointerId) return;
    endGesture(event.pointerId, {
      viaCancelEvent: false,
      releaseClientX: event.clientX,
      releaseClientY: event.clientY,
    });
  }

  function onDocPointerCancel(event) {
    if (event.pointerId !== trackingPointerId) return;
    endGesture(event.pointerId, { viaCancelEvent: true });
  }

  function onPointerDown(event) {
    if (button.disabled) return;
    // 【複数指同時操作への対応】既に別の指を追跡中なら、新しい指は無視する
    // （2本指で同時に別々の選択肢を押した場合、最初に押した方だけを有効にする）。
    if (trackingPointerId !== null) return;
    trackingPointerId = event.pointerId;
    cancelled = false;
    frozenPressRect = button.getBoundingClientRect();
    scrollContainer = findScrollableAncestor(button);
    startScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    setPressed(true);
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // 一部の古い環境やテスト環境ではsetPointerCaptureが無い/失敗することがあるが、
      // move/up/cancelはdocumentレベルでも監視しているため、それでも動作は継続できる。
    }
    document.addEventListener("pointermove", onDocPointerMove);
    document.addEventListener("pointerup", onDocPointerUp);
    document.addEventListener("pointercancel", onDocPointerCancel);
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
  button.addEventListener("click", onNativeClick);

  return function dispose() {
    removeDocumentListeners();
    button.removeEventListener("pointerdown", onPointerDown);
    button.removeEventListener("click", onNativeClick);
  };
}

// テストコードから、実装詳細（許容pxの値）を直接検証できるようにするための読み取り専用export。
export function getAnswerButtonCancelSlopPx() {
  return CANCEL_SLOP_PX;
}
