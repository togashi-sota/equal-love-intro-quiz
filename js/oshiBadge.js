// 推しメンアイコンへの「王冠」「ダイヤ」装飾を、共通の関数・CSSクラスだけで行うファイル。
// 画面ごとに別々のHTML・SVGを手作業で追加しない（本人指示）。
// ＝LOVEマスター取得で王冠、＝LOVE完全制覇取得で王冠の上にさらにダイヤを追加する。
// どちらも装飾のみでクリック操作を邪魔しないよう、CSS側でpointer-events:noneにする
// （js/style.cssの.oshi-badge-crown/.oshi-badge-diamond参照）。
//
// 【今回のスコープ】本人指示どおり、まずは端末内で完結する画面（ホーム画面の推し表示）に
// 適用する。オンライン対戦の参加者一覧・結果画面など、他プレイヤーの称号状態をFirebase経由で
// 共有する必要がある箇所は、今回は同期の規模が大きくなるため保留とし、最終報告で明記する
// （Firebaseのスキーマ・セキュリティルールは一切変更していない）。
import { getOshiBadgeState } from "./achievementProgress.js";

// 対象の要素（推しアイコンのスワッチ等）へ、現在の称号状態に応じたクラスを付け外しする。
// element自体の位置づけは問わない（position:relativeであることを呼び出し側のCSSで保証する）。
export function applyOshiBadgeDecorations(element) {
  if (!element) return;
  const { hasEqualLoveMaster, hasEqualLoveComplete } = getOshiBadgeState();
  element.classList.toggle("has-equal-love-master", hasEqualLoveMaster);
  element.classList.toggle("has-equal-love-complete", hasEqualLoveComplete);
}
