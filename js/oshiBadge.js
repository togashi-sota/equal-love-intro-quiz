// 推しメンアイコンへの「特別バッジ」装飾を、共通の関数・CSSクラスだけで行うファイル。
// 画面ごとに別々のHTML・SVGを手作業で追加しない（本人指示）。
// ※2026-11-01：下の「4段階」の改訂で、角に丸いバッジを最大3個重ねる方式（このすぐ下の説明）は、
//   外周のリング＋飾りを1段階ぶん付ける方式に置き換えた。下の説明は経緯として残している。
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

// 【2026-11-01 全面改訂・本人指示（REQUEST の 7）：勲章を「4段階」で作り直す】
// 以前は、称号ごとの小さな丸いバッジ（銀の星・金の王冠・紫のダイヤ）をアイコンの角へ
// 最大3個まで重ねていた。本人の iPhone で見ると「小さな銀の星で地味」「上の段ほど豪華に
// 見えない」ため、持っている中で一番上の称号で決まる「段階」を1つ選び、アバターの外周を
// 囲むリングと、外周に置く小さな飾り（音符・王冠・ハート・ダイヤ・きらめき）で表す方式にした。
//   0：称号なし            … 何も付けない
//   1：イントロマスター      … ピンクと水色の細いリング＋音符・星。控えめな発光
//   2：＝LOVEマスター        … ピンクとゴールドの太いリング＋王冠・ハート。光がゆっくり回る
//   3：＝LOVE完全制覇        … 金の細い内輪＋虹色（オーロラ）の外輪＋宝石の王冠・ダイヤ・
//                              ハート・きらめき。外側にオーロラの光
// 3つの称号は入れ子（＝LOVEマスターの条件にイントロマスター、完全制覇の条件に＝LOVEマスターが
// 含まれる。js/achievementDefinitions.js の compositeOf）なので、一番上の段の飾りの中に
// 下の段の飾り（音符・王冠）も入れて、「全部持っている」ことが引き続き分かるようにしている。
// 称号の判定・保存データ・Firebase には一切触れない（受け取った真偽値から見た目を選ぶだけ）。
//
// 【描き方】飾りの絵は CSS の背景（SVG の data URI）で描く（css/style.css の .oshi-charm--◯◯）。
// ページの中に <svg> を何十個も置くと、グラデーションの id がぶつかったり、非表示の svg の
// グラデーションが効かなくなったりするため。リングは conic-gradient を radial-gradient の
// マスクで輪にしたもの。大きさ・位置はすべてアバターに対する % なので、22px（ロビー）〜
// 52px（プロフィール）のどのアバターでも、同じ部品のまま比例して大きさが変わる。

// 段階ごとに置く部品（クラス名の末尾）。並び順＝重なり順（後ろほど手前）。
// "minor" は小さい表示（.fan-profile-swatch--sm、22px）では CSS で隠す細かい飾り。
const TIER_PARTS = {
  1: [
    { part: "halo" },
    { part: "ring" },
    { part: "charm", charm: "star", minor: true },
    { part: "charm", charm: "note" },
  ],
  2: [
    { part: "halo" },
    { part: "ring" },
    { part: "charm", charm: "sparkle", minor: true },
    { part: "charm", charm: "heart", minor: true },
    { part: "charm", charm: "crown" },
  ],
  3: [
    { part: "halo" },
    { part: "ring" },
    { part: "charm", charm: "sparkle", minor: true },
    { part: "charm", charm: "sparkle2", minor: true },
    { part: "charm", charm: "sparkle3", minor: true },
    { part: "charm", charm: "heart", minor: true },
    { part: "charm", charm: "diamond" },
    { part: "charm", charm: "crown" },
  ],
};

// 段階の名前（テスト・説明用。画面の文字には使っていない）
export const OSHI_BADGE_TIER_NAMES = ["称号なし", "イントロマスター", "＝LOVEマスター", "＝LOVE完全制覇"];

// 称号の取得状況（真偽値3つ）から段階（0〜3）を決める。上の称号を持っていれば、それで決まる。
// 古いデータで下の称号のフラグだけが欠けていても、上の称号を持っていれば上の段階にする
// （判定は変えず、見せ方だけを選ぶ）。
export function resolveOshiBadgeTier(state) {
  if (!state || typeof state !== "object") return 0;
  if (state.hasEqualLoveComplete === true) return 3;
  if (state.hasEqualLoveMaster === true) return 2;
  if (state.hasNoMissMaster === true) return 1;
  return 0;
}

function buildTierLayer(tier) {
  const layer = document.createElement("span");
  layer.className = `oshi-badge-layer oshi-badge-layer--tier${tier}`;
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.tier = String(tier);
  TIER_PARTS[tier].forEach(({ part, charm, minor }) => {
    const el = document.createElement("span");
    if (part === "charm") {
      el.className = `oshi-charm oshi-charm--${charm}${minor ? " oshi-charm--minor" : ""}`;
    } else {
      el.className = `oshi-tier-${part}`;
    }
    layer.appendChild(el);
  });
  return layer;
}

// 対象の要素（推しの色の丸）へ、渡された称号の取得状況に合う段階の勲章を付ける。
// 何度呼んでもよい（段階が同じなら作り直さない。違えば入れ替える。0なら取り除く）。
// element 自体は position:relative であること（css/style.css の各アイコンのクラスで保証）。
// 【2026-09-14の教訓を引き継ぐ】省略された項目は false として扱う（undefined を真偽の
// 「反転」に使わない）。resolveOshiBadgeTier は === true だけを「持っている」とみなす。
export function applyOshiBadgeDecorationsFromState(element, state = {}) {
  if (!element) return;
  const tier = resolveOshiBadgeTier({
    hasNoMissMaster: Boolean(state?.hasNoMissMaster),
    hasEqualLoveMaster: Boolean(state?.hasEqualLoveMaster),
    hasEqualLoveComplete: Boolean(state?.hasEqualLoveComplete),
  });
  const existingLayer = element.querySelector(":scope > .oshi-badge-layer");
  if (tier === 0) {
    if (existingLayer) existingLayer.remove();
    delete element.dataset.oshiBadgeTier;
    return;
  }
  element.dataset.oshiBadgeTier = String(tier);
  if (existingLayer && existingLayer.dataset.tier === String(tier)) return;
  if (existingLayer) existingLayer.remove();
  element.appendChild(buildTierLayer(tier));
}

// 今の端末・今のプレイヤーの称号状態（localStorage）を使って装飾する、従来どおりの入口。
export function applyOshiBadgeDecorations(element) {
  applyOshiBadgeDecorationsFromState(element, getOshiBadgeState());
}
