// 推しメンアイコンへの「特別バッジ」装飾を、共通の関数・CSSクラスだけで行うファイル。
// 画面ごとに別々のHTML・SVGを手作業で追加しない（本人指示）。
// 対象は3つ：イントロマスター（no_miss_master）・＝LOVEマスター（equal_love_master）・
// ＝LOVE完全制覇（equal_love_complete）。3つとも取得していれば3つとも同時に表示する
// （本人指示・2026-11-XX改訂：「上位1つだけ表示ではありません。所持している特別バッジは
// 3個すべて推しアイコンへ表示してください」）。
//
// 【2026-11-XX全面改訂・本人指示：3個同時表示への対応】以前はCSSの::before/::afterの
// 2つだけで3種類のバッジ（王冠・ダイヤ・ノーミスマスター用メダル）を表現し、CSS側の
// :not()で「上位2つを持っていればノーミスマスターのメダルは隠す」という上位1つだけ表示の
// 仕組みだった。しかし1要素に持てる生成コンテンツはbefore/afterの2つまでのため、3つを
// 本当に同時表示するには生成コンテンツだけでは足りない。今回、実際のDOM子要素
// （<span class="oshi-badge oshi-badge--◯◯">）を3枚まで動的に追加・削除する方式へ
// 作り替えた。呼び出し側の使い方（applyOshiBadgeDecorationsFromState/
// applyOshiBadgeDecorationsに、対象要素と称号取得状況を渡すだけ）は変えていない。
//
// 【アイコン本体のサイズを変えない】本人指示：「バッジのために推しアイコンを縮小しない。
// バッジをアイコン外周へのoverlayとして配置し、必要なら小さいアイコン表示ではバッジ側
// だけ縮小する」。そのため、バッジは常にposition:absoluteのoverlayとして重ね、
// アイコン本体（width/height）には一切触れない。
//
// 【配置】3個同時表示が最悪ケースのため、3つの角（右上・右下・左下）へ分散して置く
// （名前・順位・スコア等は多くの画面でアイコンの右または下に続くため、右上を最も目立つ
// ＝LOVE完全制覇に、残り2つを右下・左下に置いて視認性と省スペースを両立させている）。
// クリック操作を邪魔しないよう、CSS側で全バッジにpointer-events:noneを付けている
// （css/style.cssの.oshi-badge系セレクタ参照）。
//
// 【2026-08-07拡張】「みんなのプロフィール」機能で、自分以外のユーザー（Firebaseの公開
// プロフィール）にも同じ装飾を表示する必要が生じたため、適用部分をapplyOshiBadgeDecorationsFromState()
// として切り出している。ローカルの自分用（applyOshiBadgeDecorations、今までどおり
// getOshiBadgeState()でlocalStorageを読む）と、他人の公開プロフィール用（呼び出し側が
// Firebaseから取得したbooleanを渡す）の両方が、同じロジックを共有する。
import { getOshiBadgeState } from "./achievementProgress.js";

// 【2026-11-XX改訂・本人指示：実装方式の最終確認】以前はbadgeEl.textContentへ絵文字
// （🎖️👑💎）をそのまま入れていたが、絵文字の実際の見た目（線の太さ・立体感・色味・
// 収まり方）はOS・端末のフォントレンダラーに依存し、iPhoneとAndroidで大きく異なる
// （本人指示：「iPhoneでもAndroidでも同じ特別バッジとして認識できることが目的」）。
// js/achievementIcons.jsが称号アイコンで既に使っている「単純な塗りつぶしSVGパスを
// currentColorで塗る」方式に統一し、端末フォントに依存しない一貫した見た目にした。
// 王冠の形は、称号一覧のequal_love_masterアイコン（js/achievementIcons.js）と
// 意図的に同じシルエットを再利用し、「称号一覧で見た王冠と同じもの」というシリーズ感・
// 一貫性を持たせている。
const MEDAL_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1 14.4 8.8 22 8.8 15.8 13.5 18.2 21.3 12 16.6 5.8 21.3 8.2 13.5 2 8.8 9.6 8.8Z"/></svg>';
const CROWN_SVG = '<svg viewBox="0 0 24 16" fill="currentColor" aria-hidden="true"><path d="M2 14 1 5 6 9 12 2 18 9 23 5 22 14Z"/></svg>';
const DIAMOND_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 20.5 9.5 12 22 3.5 9.5Z"/></svg>';

// バッジ1種類ごとの定義（本人指示の豪華さの順：イントロマスター＜＝LOVEマスター＜＜
// ＝LOVE完全制覇。この配列の並び順＝DOM上の重なり順にもなるため、後ろにあるものほど
// 前面に描画される。最も豪華な＝LOVE完全制覇を一番最後＝一番手前にしている）。
const BADGE_DEFINITIONS = [
  { key: "no_miss_master", stateField: "hasNoMissMaster", className: "oshi-badge--medal", svg: MEDAL_SVG },
  { key: "equal_love_master", stateField: "hasEqualLoveMaster", className: "oshi-badge--crown", svg: CROWN_SVG },
  { key: "equal_love_complete", stateField: "hasEqualLoveComplete", className: "oshi-badge--diamond", svg: DIAMOND_SVG },
];

// element配下に、このモジュールが管理するバッジ用のラッパー（1つだけ）を用意する。
// アイコン要素自体の直下の子を増やしすぎないよう、バッジ専用のコンテナを1つ挟む。
function ensureBadgeLayer(element) {
  let layer = element.querySelector(":scope > .oshi-badge-layer");
  if (!layer) {
    layer = document.createElement("span");
    layer.className = "oshi-badge-layer";
    layer.setAttribute("aria-hidden", "true");
    element.appendChild(layer);
  }
  return layer;
}

// 対象の要素へ、渡された称号取得状態に応じたバッジ（実DOM要素）を過不足なく反映する
// （純粋な見た目の適用のみ、データの取得元は問わない）。element自体の位置づけは問わない
// （position:relativeであることを呼び出し側のCSSで保証する）。
// 【2026-09-14修正・実機回帰バグ】classList.toggle(name, force)は、forceに
// undefinedを渡すと「force未指定」として扱われ、現在の状態を反転させる（＝毎回
// トグルする）動作になる。この関数の呼び出し元がhasEqualLoveMaster/hasEqualLoveComplete
// を省略して{}だけを渡すと、分割代入でundefinedになり、意図せずバッジが表示されて
// しまっていた（称号を持たない参加者にも常に表示される不具合）。3つとも明示的に
// falseをデフォルト値にし、Boolean()で真偽値へ確実に変換する（この教訓は今回のDOM方式へ
// 作り替えても引き継いでいる）。
export function applyOshiBadgeDecorationsFromState(
  element,
  { hasNoMissMaster = false, hasEqualLoveMaster = false, hasEqualLoveComplete = false }
) {
  if (!element) return;
  const stateByField = { hasNoMissMaster, hasEqualLoveMaster, hasEqualLoveComplete };
  const anyBadge = BADGE_DEFINITIONS.some((def) => Boolean(stateByField[def.stateField]));

  // 1つも持っていなければ、レイヤーごと綺麗に取り除く（無駄な空要素を残さない）。
  const existingLayer = element.querySelector(":scope > .oshi-badge-layer");
  if (!anyBadge) {
    if (existingLayer) existingLayer.remove();
    return;
  }

  const layer = ensureBadgeLayer(element);
  BADGE_DEFINITIONS.forEach((def) => {
    const shouldShow = Boolean(stateByField[def.stateField]);
    let badgeEl = layer.querySelector(`:scope > .${def.className}`);
    if (shouldShow && !badgeEl) {
      badgeEl = document.createElement("span");
      badgeEl.className = `oshi-badge ${def.className}`;
      badgeEl.innerHTML = def.svg;
      layer.appendChild(badgeEl);
    } else if (!shouldShow && badgeEl) {
      badgeEl.remove();
    }
  });
}

// 今の端末・今のプレイヤーの称号状態（localStorage）を使って装飾する、従来どおりの入口。
export function applyOshiBadgeDecorations(element) {
  applyOshiBadgeDecorationsFromState(element, getOshiBadgeState());
}
