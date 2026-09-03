// css/style.cssの「[hidden]属性が本当にdisplay:noneへ落ちるか」を検証するテスト。
//
// 【2026-11-XX新設・実機バグ調査：再戦UIが何度直しても直らなかった根本原因】
// このプロジェクトのCSSでは、display（flex/grid等）を明示指定するクラスに対して
// `.クラス名[hidden] { display: none; }` という個別の打ち消しルールを1つずつ用意する
// 設計になっている（ブラウザ標準の[hidden]{display:none}はUAスタイルシートの扱いのため、
// 同じセレクタでも著者スタイルシート側のdisplay指定に必ず負けてしまうため）。この打ち消し
// ルールが1つでも漏れると、JS側が`element.hidden = true`を正しく設定していても、
// 実際の画面では要素が消えない（＝JS側のロジックは完全に正しいのに、見た目には
// 一切反映されないまま）という、原因の切り分けが非常に難しい不具合になる。
//
// 実際に.online-battle-result-return-panel（結果画面の「もう一度」提案パネル、
// 4つのオンライン対戦モードすべてで共有するクラス）がこの打ち消しルールを欠いており、
// 「ホスト・ゲストのロジックを何度見直しても実機では直っていない」という報告が
// 複数ラウンドにわたって続いていた根本原因だった（js/onlineBattleScreen.js等の
// JS側ロジック自体は最初から正しかった）。
//
// このテストは、実際のcss/style.cssをtests.htmlが読み込んだ状態で、要素を実際に
// DOMへ追加してgetComputedStyle()で検証する（静的なセレクタの文字列比較ではなく、
// ブラウザの実際のカスケード計算結果を確認する）。

import { assertEqual } from "./test-utils.js";

// 要素をbodyへ一時的に追加し、[hidden]の有無それぞれでのcomputed displayを確認する。
// 【isolationWrapperについて】bodyタグ自体がdisplay:flexのため、bodyへ直接追加すると
// 対象要素が「flexアイテム」になり、CSSの仕様（inline-level=false化）によって
// display:inline-flexがdisplay:flexへ強制的に変換されてしまい（.quiz-back-link等）、
// 本来のCSSルールが指定した値とは別の値が観測されてしまう。テスト対象のCSSルール
// そのもの（display:none上書きが効くか）とは無関係なノイズのため、間に
// display:blockの中立な入れ子を1つ挟んで、この変換が起きないようにする。
function checkHiddenEffectiveness(className) {
  const isolationWrapper = document.createElement("div");
  isolationWrapper.style.display = "block";
  document.body.appendChild(isolationWrapper);

  const el = document.createElement("div");
  el.className = className;
  isolationWrapper.appendChild(el);

  el.hidden = true;
  const displayWhenHidden = getComputedStyle(el).display;

  el.hidden = false;
  const displayWhenVisible = getComputedStyle(el).display;

  isolationWrapper.remove();
  return { displayWhenHidden, displayWhenVisible };
}

export function runCssHiddenAttributeEffectivenessTests() {
  // ---- 今回の実機バグの直接原因：.online-battle-result-return-panel ----
  // 歌詞クイズ対戦・一瞬バトル・一瞬協力・通常対戦（イントロ/ランダム再生/アウトロ）の
  // 4画面すべての「もう一度」提案パネル（online-battle-result-rematch-panel等）が
  // このクラスを共有している。1つのCSSルールを直せば4画面すべてに効く。
  {
    const { displayWhenHidden, displayWhenVisible } = checkHiddenEffectiveness("online-battle-result-return-panel");
    assertEqual(
      displayWhenHidden,
      "none",
      "online-battle-result-return-panel: hidden属性がある間は必ずdisplay:noneになる（4画面共通の再戦パネルが、hidden=trueなのに見え続けるバグの再発防止）"
    );
    assertEqual(
      displayWhenVisible,
      "flex",
      "online-battle-result-return-panel: hidden属性が無い間は本来のdisplay:flexのまま（打ち消しルールが常時効いてしまう副作用が無いことの確認）"
    );
  }

  // ---- 過去に同じ理由で個別対応済みの既存クラス（回帰確認・比較対象） ----
  // これらは既に[hidden]の打ち消しルールを持っている前提のクラス。ここが失敗するように
  // なった場合、CSSの並び順・詳細度を変える別の変更が、既存の対応を壊した可能性が高い。
  const alreadyFixedClasses = [
    { className: "button-row", visibleDisplay: "flex" },
    { className: "quiz-back-link", visibleDisplay: "inline-flex" },
    { className: "modal-overlay", visibleDisplay: "flex" },
    // 【2026-11-XX追加・本人指示：ルーム招待バナー】このテストと全く同じ原因で、
    // 招待が無いときもホーム画面にバナーが表示され続けてしまう回帰を実機テストで発見。
    // js/roomInviteUi.js・css/style.css参照。
    { className: "room-invite-banner", visibleDisplay: "flex" },
  ];
  alreadyFixedClasses.forEach(({ className, visibleDisplay }) => {
    const { displayWhenHidden, displayWhenVisible } = checkHiddenEffectiveness(className);
    assertEqual(displayWhenHidden, "none", `${className}: 既存の[hidden]打ち消しルールが引き続き効いている（display:none）`);
    assertEqual(displayWhenVisible, visibleDisplay, `${className}: hidden属性が無い間は本来のdisplayのまま`);
  });
}
