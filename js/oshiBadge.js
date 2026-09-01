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
// 【2026-08-15追加】ノーミスマスター用のhas-no-miss-masterを追加。CSS側で
// 「:not(.has-equal-love-master):not(.has-equal-love-complete)」を条件に付けているため、
// 上位2つの称号を持つ場合は自動的に非表示になり、王冠・ダイヤより目立つことはない。
// 【2026-09-14修正・実機回帰バグ】classList.toggle(name, force)は、forceに
// undefinedを渡すと「force未指定」として扱われ、現在の状態を反転させる（＝毎回
// トグルする）動作になる。この関数の呼び出し元がhasEqualLoveMaster/hasEqualLoveComplete
// を省略して{}だけを渡すと、分割代入でundefinedになり、意図せずクラスが付与されて
// しまっていた（称号を持たない参加者にも王冠・ダイヤが常に表示される不具合）。
// 3つとも明示的にfalseをデフォルト値にし、Boolean()で真偽値へ確実に変換する。
export function applyOshiBadgeDecorationsFromState(
  element,
  { hasNoMissMaster = false, hasEqualLoveMaster = false, hasEqualLoveComplete = false }
) {
  if (!element) return;
  element.classList.toggle("has-no-miss-master", Boolean(hasNoMissMaster));
  element.classList.toggle("has-equal-love-master", Boolean(hasEqualLoveMaster));
  element.classList.toggle("has-equal-love-complete", Boolean(hasEqualLoveComplete));
}

// 今の端末・今のプレイヤーの称号状態（localStorage）を使って装飾する、従来どおりの入口。
export function applyOshiBadgeDecorations(element) {
  applyOshiBadgeDecorationsFromState(element, getOshiBadgeState());
}
