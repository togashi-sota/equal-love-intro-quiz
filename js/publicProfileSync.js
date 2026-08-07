// 「みんなのプロフィール」機能の、公開プロフィール（Firebase）とのやり取りを担当するファイル。
// 2026-08-07新設。既存のオンライン対戦（js/onlineBattle.js）と同じFirebase Realtime Database・
// 匿名認証（js/firebaseClient.js）をそのまま再利用し、新しいFirebaseプロジェクト・別の認証方式は
// 一切追加しない。
//
// 【設計方針：ローカルが正本、Firebaseは公開ミラー】本人プロフィールの正本は今までどおり
// 端末内（playerProfile.js／oshiMembers.js／achievementProgress.js）のまま。このファイルは
// 「ローカルプロフィール → 公開用payload生成 → Firebase publicProfiles/{uid}へ送信」という
// 一方向の同期だけを行う。Firebase側のデータをローカルへ書き戻すことは一切しない
// （本人指示：「Firebaseの公開プロフィールをローカルプロフィールの正本にはしない」）。
//
// 【ファイル分割方針】Firebaseに一切触れない部分（payload組み立て・公開設定フラグの読み書き）は
// js/publicProfilePayloads.jsへ切り出している。恒久テストはそちらだけをimportし、Firebase SDKの
// 初期化・匿名ログインを自動テストのたびに発生させないようにするため
// （js/lyricsQuizBattleFirebase.js／js/lyricsQuizBattleFirebasePayloads.jsと同じ設計）。
//
// 【書き込み失敗時の扱い】本人指示：「Firebase更新に失敗しても、称号取得自体を失敗扱いにしない」。
// このファイルの同期関数はすべて非同期・失敗しても例外を投げず、呼び出し側を一切ブロックしない
// （称号解放・画面表示は常にローカル処理だけで完結する）。
import {
  ref,
  set,
  get,
  remove,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { getActivePlayer } from "./playerProfile.js";
import { getMostOshiMemberId } from "./oshiMembers.js";
import { getAchievementListSnapshot, getOshiBadgeState } from "./achievementProgress.js";
import {
  isPublicProfileSharingEnabled,
  writeEnabledFlag,
  buildPublicProfilePayload,
  normalizePublicProfileEntry,
} from "./publicProfilePayloads.js";

export { isRunningAsInstalledPwa, isPublicProfileSharingEnabled } from "./publicProfilePayloads.js";

// 今のローカル状態から、buildPublicProfilePayload()に渡す材料を集める（DOMには触れない）。
function collectCurrentProfileMaterials() {
  const activePlayer = getActivePlayer();
  return {
    playerName: activePlayer.playerName,
    oshiMemberId: getMostOshiMemberId(),
    achievementsSnapshot: getAchievementListSnapshot(),
    oshiBadgeState: getOshiBadgeState(),
  };
}

// 直前に実際にFirebaseへ書き込んだpayloadの内容（JSON文字列）。同じ内容を毎回書き込まないための
// 簡易な重複排除（本人指示：「毎秒Firebaseへ書く必要はない」「無駄な書き込みを避ける」）。
// ページを開き直せばリセットされる、あくまで同一セッション内だけのキャッシュ
// （cachedPlayers等、このプロジェクトの他ファイルと同じ考え方）。
let lastSyncedPayloadJson = null;

// 公開設定がONのときだけ、現在のローカル状態をpublicProfiles/{uid}へ同期する。
// 呼び出し側を絶対にブロックしない（awaitせず呼び捨てにされる想定）。認証待ち・通信失敗は
// すべてこの関数の中で吸収し、コンソール警告だけを出す。
export async function syncPublicProfileIfEnabled(playerKeyPrefix) {
  if (!isPublicProfileSharingEnabled(playerKeyPrefix)) return;

  try {
    const payload = buildPublicProfilePayload(collectCurrentProfileMaterials());
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === lastSyncedPayloadJson) return; // 前回と内容が同じなら書き込まない

    await authReady;
    const uid = getCurrentUid();
    if (!uid) return;

    await set(ref(database, `publicProfiles/${uid}`), { ...payload, updatedAt: serverTimestamp() });
    lastSyncedPayloadJson = payloadJson;
  } catch (error) {
    // 本人指示：Firebase更新に失敗しても、称号取得・プレイ自体は失敗扱いにしない。
    // 次回の同期タイミング（次のプレイ後、次回起動時など）に再同期される。
    console.warn("公開プロフィールの同期に失敗しました（ローカルのプレイには影響ありません）", error);
  }
}

// 公開設定をOFFにしたとき、publicProfiles/{uid}を削除する（本人指示：
// 「OFFにした場合はpublicProfiles/{uid}を削除。ローカルの称号・自己ベスト等は絶対に削除しない」）。
export async function deletePublicProfile() {
  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return;
    await remove(ref(database, `publicProfiles/${uid}`));
  } catch (error) {
    console.warn("公開プロフィールの削除に失敗しました", error);
  } finally {
    lastSyncedPayloadJson = null;
  }
}

// 公開設定のON/OFFを切り替える。ONにした瞬間は即座に同期し、OFFにした瞬間は
// 即座に削除する（本人指示：「一度ONにした後でもOFFへ戻せる」「OFFにした場合は削除」）。
export function setPublicProfileSharingEnabled(playerKeyPrefix, enabled) {
  writeEnabledFlag(playerKeyPrefix, enabled);
  if (enabled) {
    syncPublicProfileIfEnabled(playerKeyPrefix);
  } else {
    deletePublicProfile();
  }
}

// TOP10ランキングの各行に、みんなのプロフィールと同じ王冠・ダイヤ装飾を表示するための、
// 1人分だけの軽量な取得（2026-08-07追加）。本人指示「全ユーザー件数を毎回取得しないこと」を
// 守るため、下のfetchAllPublicProfiles()（全件取得）は使わず、ランキングに実際に表示する
// uidだけを個別に読む。取得できない・失敗した場合は両方falseにフォールバックし、
// 装飾なしで表示を継続する（ランキング自体は表示できる状態を優先する）。
export async function fetchPublicProfileBadgeState(uid) {
  try {
    await authReady;
    const snapshot = await get(ref(database, `publicProfiles/${uid}`));
    if (!snapshot.exists()) return { hasEqualLoveMaster: false, hasEqualLoveComplete: false };
    const value = snapshot.val();
    return {
      hasEqualLoveMaster: value?.hasEqualLoveMaster === true,
      hasEqualLoveComplete: value?.hasEqualLoveComplete === true,
    };
  } catch {
    return { hasEqualLoveMaster: false, hasEqualLoveComplete: false };
  }
}

// 「みんなのプロフィール」一覧に表示する、全員分の公開プロフィールを1回だけ取得する。
// 本人指示：競争ランキングではないため常時リアルタイム監視（onValue）にはせず、
// 一覧画面を開いたときに1回取得するだけで十分と判断（無駄なFirebase接続を避ける）。
// 戻り値は { ok: true, profiles: [{uid, ...payload, updatedAt}] } または
// 通信失敗時 { ok: false, profiles: [] }（呼び出し側が「0件」と「取得失敗」を
// 区別できるようにするため、本人指示）。
export async function fetchAllPublicProfiles() {
  try {
    await authReady;
    const snapshot = await get(ref(database, "publicProfiles"));
    if (!snapshot.exists()) return { ok: true, profiles: [] };

    const value = snapshot.val();
    const profiles = Object.entries(value)
      .map(([uid, entry]) => normalizePublicProfileEntry(uid, entry))
      .filter((profile) => profile !== null);
    return { ok: true, profiles };
  } catch (error) {
    console.warn("みんなのプロフィールの取得に失敗しました", error);
    return { ok: false, profiles: [] };
  }
}
