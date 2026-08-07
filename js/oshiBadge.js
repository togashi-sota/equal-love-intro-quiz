// 推しメンアイコンへの「王冠」「ダイヤ」装飾を、共通の関数・CSSクラスだけで行うファイル。
// 画面ごとに別々のHTML・SVGを手作業で追加しない（本人指示）。
// ＝LOVEマスター取得で王冠、＝LOVE完全制覇取得で王冠の上にさらにダイヤを追加する。
// どちらも装飾のみでクリック操作を邪魔しないよう、CSS側でpointer-events:noneにする
// （js/style.cssの.oshi-badge-crown/.oshi-badge-diamond参照）。
//
// 【2026-08-07拡張】「みんなのプロフィール」機能で、自分以外のユーザー（Firebaseの公開
// プロフィール）にも同じ王冠・ダイヤ装飾を表示する必要が生じたため、クラスの付け外し部分を
// applyOshiBadgeDecorationsFromState()として切り出した。ローカルの自分用（
// applyOshiBadgeDecorations、今までどおりgetOshiBadgeState()でlocalStorageを読む）と、
// 他人の公開プロフィール用（呼び出し側がFirebaseから取得したbooleanを渡す）の両方が、
// 同じCSSクラス・同じ見た目のロジックを共有する（本人指示：「別実装にせず、現在の共通装飾
// ロジックを再利用する」）。
import { getOshiBadgeState } from "./achievementProgress.js";

// 対象の要素へ、渡された称号取得状態に応じたクラスを付け外しする（純粋な見た目の適用のみ、
// データの取得元は問わない）。element自体の位置づけは問わない（position:relativeであることを
// 呼び出し側のCSSで保証する）。
export function applyOshiBadgeDecorationsFromState(element, { hasEqualLoveMaster, hasEqualLoveComplete }) {
  if (!element) return;
  element.classList.toggle("has-equal-love-master", hasEqualLoveMaster);
  element.classList.toggle("has-equal-love-complete", hasEqualLoveComplete);
}

// 今の端末・今のプレイヤーの称号状態（localStorage）を使って装飾する、従来どおりの入口。
export function applyOshiBadgeDecorations(element) {
  applyOshiBadgeDecorationsFromState(element, getOshiBadgeState());
}
