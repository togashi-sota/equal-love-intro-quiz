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
import { buildOshiSwatch, buildAchievementCountText, buildFriendAchievementSummary, buildAchievedAchievementsList } from "./fanProfileCard.js";
import { fetchPublicProfileBadgeState, fetchPublicProfileByUid } from "./publicProfileSync.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

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

// ===== 参加者プロフィールモーダル（2026-09-07新設・本人指示：ルーム参加者プロフィール） =====
//
// 【2026-09-26移設・本人指示：オンライン対戦総合改修19-10章】以前はjs/onlineBattleScreen.js
// （ロビー画面）だけの内部機能だったが、「対戦の公平性に影響しない場所（設定画面・
// 待機画面・問題の合間・結果画面）ならどこでもプロフィールを開けるようにしてほしい」との
// 指示で、js/onlineInstantBattleScreen.js・js/onlineInstantCoopBattleScreen.js・
// js/onlineLyricsQuizBattleScreen.jsからも使うようになった。js/onlineLyricsQuizBattleScreen.js
// の冒頭コメントに「js/onlineBattleScreen.jsを一切importしない（一方向の依存に保つため）」と
// いう明記があり、そちらからjs/onlineBattleScreen.jsを直接importすると設計方針に反するため、
// 参加者アイコンと同じくこの中立な共通ファイルへ実体ごと移設した。
// FirebaseのpublicProfiles/{uid}を1件だけ読み、簡易プロフィールモーダルに表示する
// （表示名・推し・獲得済み称号のみ。READY等の参加状態は一切変更しない読み取り専用）。
let profileModalElements = null;
let profileRequestToken = 0;

const PROFILE_ALL_TOGGLE_CLOSED_TEXT = "すべての称号を見る ＞";
const PROFILE_ALL_TOGGLE_OPEN_TEXT = "すべての称号を隠す";

// playerは{uid, name, oshiMemberId}の形を受け取る（room.players[uid]・
// match.participants[uid]のどちらも、この3つのプロパティを持つ）。
export async function openParticipantProfile(player) {
  if (!profileModalElements) return;
  const elements = profileModalElements;
  const requestToken = ++profileRequestToken;

  elements.name.textContent = player.name;
  const oshiMember = player.oshiMemberId ? getMemberById(MEMBERS, player.oshiMemberId) : null;
  elements.oshi.textContent = oshiMember ? `推し：${oshiMember.name}` : "推し：未設定";
  elements.swatch.innerHTML = "";
  elements.swatch.appendChild(buildOshiSwatch(MEMBERS, player.oshiMemberId, {}));

  elements.body.hidden = true;
  elements.unavailable.hidden = true;
  elements.loading.hidden = false;
  elements.modal.hidden = false;

  const { profile } = await fetchPublicProfileByUid(player.uid);
  if (requestToken !== profileRequestToken) return; // その間に別の参加者がタップされていた

  elements.loading.hidden = true;
  if (!profile) {
    elements.unavailable.hidden = false;
    return;
  }
  elements.body.hidden = false;
  // 本当に取得済みの代表称号だけを、既存のフレンドプロフィールと同じ見た目で表示する
  // （王冠・ダイヤを演出目的で勝手に足すのではなく、既存の称号取得ロジックが返した
  // 真偽値をそのまま渡すだけ＝新しいオンライン専用の判定は作らない）。
  elements.swatch.innerHTML = "";
  elements.swatch.appendChild(
    buildOshiSwatch(MEMBERS, player.oshiMemberId, {
      hasNoMissMaster: profile.hasNoMissMaster,
      hasEqualLoveMaster: profile.hasEqualLoveMaster,
      hasEqualLoveComplete: profile.hasEqualLoveComplete,
    })
  );
  elements.achievementCount.textContent = buildAchievementCountText(profile.unlockedAchievementIds);
  elements.summary.innerHTML = "";
  elements.summary.appendChild(buildFriendAchievementSummary(profile.unlockedAchievementIds));

  // js/fanProfilesScreen.jsの「すべての称号を見る」と全く同じ部品・同じ表示ロジックを
  // 再利用する（新しいオンライン専用の称号表示は作らない）。称号を1つも持っていない人には
  // 導線ごと出さない点も同じ。開閉状態は毎回「閉じている」から始める。
  if (elements.allToggle && elements.achievements) {
    elements.achievements.innerHTML = "";
    elements.achievements.appendChild(buildAchievedAchievementsList(profile.unlockedAchievementIds));
    elements.achievements.hidden = true;
    elements.allToggle.hidden = profile.unlockedAchievementIds.length === 0;
    elements.allToggle.textContent = PROFILE_ALL_TOGGLE_CLOSED_TEXT;
  }
}

function closeParticipantProfile() {
  if (!profileModalElements) return;
  // 【2026-09-26追加・本人指示：サウンドシステム全面整備】閉じるボタン・背景クリック・
  // Escapeキーのどの経路でも必ずこの共有関数を通るため、ここ1箇所にだけ付ければ
  // 二重再生の心配なく全経路をカバーできる。
  playSfx(SFX_EVENTS.UI_BACK);
  profileModalElements.modal.hidden = true;
}

function handleProfileAllToggleClick() {
  if (!profileModalElements?.allToggle || !profileModalElements?.achievements) return;
  playSfx(SFX_EVENTS.UI_CLICK);
  const willOpen = profileModalElements.achievements.hidden;
  profileModalElements.achievements.hidden = !willOpen;
  profileModalElements.allToggle.textContent = willOpen ? PROFILE_ALL_TOGGLE_OPEN_TEXT : PROFILE_ALL_TOGGLE_CLOSED_TEXT;
}

// modalElementsは{modal, closeButton, name, oshi, swatch, body, unavailable, loading,
// achievementCount, summary, allToggle, achievements}の形（js/main.jsから、既存の
// #online-lobby-profile-modal内の各要素をそのまま渡す）。
export function initParticipantProfileModal(modalElements) {
  profileModalElements = modalElements;
  modalElements.closeButton?.addEventListener("click", () => closeParticipantProfile());
  modalElements.allToggle?.addEventListener("click", () => handleProfileAllToggleClick());
  modalElements.modal?.addEventListener("click", (event) => {
    if (event.target !== modalElements.modal) return;
    closeParticipantProfile();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!modalElements.modal || modalElements.modal.hidden) return;
    closeParticipantProfile();
  });
}
