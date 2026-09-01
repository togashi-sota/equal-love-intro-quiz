// オンライン対戦の各画面（ロビー・スコア表示・結果画面）で共通して使う、参加者アイコンの
// 組み立てを担当するファイル（2026-09-26新設・本人指示：オンライン対戦総合改修19-8/19-9章）。
//
// 【本人指示の要点】
// ・丸アイコンの基本色は「そのユーザーの推しメンカラー」の単色（白枠などの複雑な装飾は不要）。
// ・代表称号・代表バッジを持っている場合は、既存のプロフィール画面と全く同じ王冠・ダイヤの
//   装飾を、丸アイコンの端に重ねて表示する。オンライン専用の新しい優先順位・判定ロジックは
//   作らない（js/oshiBadge.js・js/fanProfileCard.jsの既存ロジックをそのまま再利用する）。
//
// 【なぜ2段階描画になっているか】推しメンカラー（oshiMemberId）はroom.players・
// match.participantsに既に含まれておりFirebase読み取りなしで即座に分かるが、称号・バッジの
// 取得状況はpublicProfiles/{uid}という別のFirebaseパスを読まないと分からない
// （みんなのプロフィール機能と同じ、公開設定がONの人だけが対象）。一覧の描画そのものを
// この読み取りの完了まで待たせると体感が悪くなるため、まず色だけの丸アイコンを同期的に
// 返し、バッジの取得が完了し次第、非同期に装飾を追加する2段階方式にしている
// （js/onlineBattleScreen.jsのopenLobbyParticipantProfile()と同じ考え方）。
import { getMemberById } from "./memberUtils.js";
import { MEMBERS } from "./data/members.js";
import { buildOshiSwatch } from "./fanProfileCard.js";
import { fetchPublicProfileBadgeState } from "./publicProfileSync.js";

// uid → 取得済みのバッジ状態（Promise）のキャッシュ。同じuidの称号を画面内の複数箇所
// （ロビー一覧・スコア表示・結果画面）で同時に表示することが多いため、同じセッション中は
// Firebaseへ重複して読みに行かない（本人指示の「無駄な読み取りを増やさない」方針を踏襲）。
const badgeStatePromiseCache = new Map();

function getBadgeStatePromise(uid) {
  if (!uid) return Promise.resolve(null);
  if (!badgeStatePromiseCache.has(uid)) {
    badgeStatePromiseCache.set(uid, fetchPublicProfileBadgeState(uid));
  }
  return badgeStatePromiseCache.get(uid);
}

// 【2026-09-26追加】自分自身の称号は、公開プロフィール（Firebase）を経由しなくても
// 端末内のachievementProgress.jsから直接、即座に分かる。呼び出し側（自分の行を描画する
// 箇所）は、待たずに正しいバッジを表示できるよう、この関数の代わりに
// js/oshiBadge.jsのgetOshiBadgeState()を直接使うことを推奨するが、この関数も
// 汎用的に「自分のuid」を渡された場合は同じキャッシュ経路を使う（公開設定がONなら
// 一致した結果が返る。OFFの場合は装飾なしになる点に注意）。

// 参加者1人分の丸アイコンを組み立てる。戻り値は<span class="fan-profile-swatch">要素
// （即座に返せる、推し色のみの状態）。称号バッジは非同期に取得でき次第、同じ要素へ
// 追加で装飾される（呼び出し側は戻り値をそのままDOMへ挿入するだけでよい）。
export function buildParticipantIcon(oshiMemberId, uid) {
  const swatch = buildOshiSwatch(MEMBERS, oshiMemberId, {});
  // 名前の隣に並べる用途のため、既定は44px基準ではなく22pxの縮小版にする
  // （css/style.cssの.fan-profile-swatch--sm参照）。
  swatch.classList.add("fan-profile-swatch--sm");
  getBadgeStatePromise(uid).then((badgeState) => {
    if (!badgeState) return;
    // 要素が既にDOMから外れていても、classList操作自体は安全（何も起きないだけ）。
    swatch.classList.toggle("has-no-miss-master", Boolean(badgeState.hasNoMissMaster));
    swatch.classList.toggle("has-equal-love-master", Boolean(badgeState.hasEqualLoveMaster));
    swatch.classList.toggle("has-equal-love-complete", Boolean(badgeState.hasEqualLoveComplete));
  });
  return swatch;
}

// 参加者の推しメン名（丸アイコンのaria-label等、アクセシビリティ用途に使う想定）。
export function describeOshiMemberName(oshiMemberId) {
  if (!oshiMemberId) return "推し未設定";
  const member = getMemberById(MEMBERS, oshiMemberId);
  return member ? member.name : "推し未設定";
}
