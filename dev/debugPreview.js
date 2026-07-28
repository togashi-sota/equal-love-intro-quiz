// 開発用プレビューツール本体。
// 結果画面の称号チップ・称号一覧のカードを、実際にプレイしなくても一覧確認できるようにする。
// 保存データ（localStorage）は一切書き換えない、表示だけの確認専用スクリプト。
//
// 通常のゲーム本編（index.html／js/main.js）からは一切読み込まれない
//（dev/preview.htmlを直接開いたときだけ動く）ので、本番のプレイには影響しない。
//
// 称号を追加・変更したときは、js/debugPreview.js側の`sampleEvents`に新しい称号を
// 1件足すだけで、結果画面チップのプレビューにも反映できる。

import { renderResultTitleEvents } from "../js/titleDisplay.js";
import { debugPreviewAllTitleCards } from "../js/titleList.js";

const panel = document.createElement("div");
panel.style.cssText =
  "max-width:600px;margin:0 auto;padding:24px 16px;font-family:sans-serif;";
panel.innerHTML = `
  <h2 style="text-align:center;">結果画面の称号チップ（サンプル）</h2>
  <div id="debug-chip-preview" style="display:flex;flex-direction:column;align-items:center;gap:8px;max-width:400px;margin:0 auto 40px;"></div>
  <h2 style="text-align:center;">称号一覧カード（全件・解放済み表示）</h2>
  <div id="debug-card-preview" style="max-width:400px;margin:0 auto;"></div>
`;
document.body.appendChild(panel);

// 結果画面のチップを、称号ぶんまとめて確認できるようにする（NEW演出のtypeもいくつか混ぜている）。
// 称号を追加したときは、ここに1件足せばプレビューに反映される。
const sampleEvents = [
  { id: "perfect", name: "パーフェクト", type: "new", mode: "5", isNewProgress: true },
  { id: "introMaster", name: "イントロマスター", type: "new", mode: "5", isNewProgress: true },
  { id: "lightningFast", name: "電光石火", type: "unlock-and-new", mode: "5", isNewProgress: true },
  { id: "equalLoveKaiden", name: "＝LOVE皆伝", type: "unlock-and-new", mode: null, isNewProgress: true },
  { id: "inspiration", name: "ひらめき", type: "new", mode: null, isNewProgress: true },
];

const dummyLink = document.createElement("button");
dummyLink.hidden = true; // このプレビューでは「称号一覧を見る」リンクは使わないので、表に出さない受け皿だけ用意する

renderResultTitleEvents(sampleEvents, {
  chipContainer: panel.querySelector("#debug-chip-preview"),
  titleListLinkElement: dummyLink,
});

debugPreviewAllTitleCards(panel.querySelector("#debug-card-preview"));
