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
import { getActivePlayer, getPlayerKeyPrefix } from "./playerProfile.js";
import { getMostOshiMemberId } from "./oshiMembers.js";
import { getAchievementListSnapshot, getOshiBadgeState } from "./achievementProgress.js";
import {
  isPublicProfileSharingEnabled,
  writeEnabledFlag,
  buildPublicProfilePayload,
  normalizePublicProfileEntry,
} from "./publicProfilePayloads.js";
// 【Stage1・本人指示：presence書き込みをフレンド一覧の公開設定へ連動させる】
// js/presenceSync.jsはこのファイル（js/publicProfileSync.js）を一切importしていないため
// （firebaseClient.js・screens.js・presencePayloads.jsのみに依存する末端モジュール）、
// この向きのimportを追加しても循環importにはならないことを事前に確認済み。
import {
  startFriendPresenceTracking,
  stopFriendPresenceTracking,
  deleteFriendPresence,
  hasActiveFriendPresenceTracking,
} from "./presenceSync.js";

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
// 【Stage1・本人指示で追加】戻り値（true/false）は、既存の呼び出し側（await せず
// 呼び捨てにしている箇所）には一切影響しない後方互換の追加。新設の
// applyPublicProfileSharingEnabled()が「公開プロフィールの作成・確認が実際に
// できたときだけpresence trackingを開始する」ために、この戻り値を利用する。
export async function syncPublicProfileIfEnabled(playerKeyPrefix) {
  if (!isPublicProfileSharingEnabled(playerKeyPrefix)) return false;

  try {
    const payload = buildPublicProfilePayload(collectCurrentProfileMaterials());
    const payloadJson = JSON.stringify(payload);
    if (payloadJson === lastSyncedPayloadJson) return true; // 前回と内容が同じなら書き込まないが、同期済みとして扱う

    await authReady;
    const uid = getCurrentUid();
    if (!uid) return false;

    await set(ref(database, `publicProfiles/${uid}`), { ...payload, updatedAt: serverTimestamp() });
    lastSyncedPayloadJson = payloadJson;
    return true;
  } catch (error) {
    // 本人指示：Firebase更新に失敗しても、称号取得・プレイ自体は失敗扱いにしない。
    // 次回の同期タイミング（次のプレイ後、次回起動時など）に再同期される。
    console.warn("公開プロフィールの同期に失敗しました（ローカルのプレイには影響ありません）", error);
    return false;
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

// 【Stage1・本人指示】presence関連の一連の処理（開始・停止・削除、公開プロフィールの
// 作成・削除）を、呼ばれた順番どおりに1つずつ実行するための直列化キュー。
// 「短時間でON→OFF→ONと切り替えた場合」「アプリ起動時の判定と、直後のプレイヤー
// 切り替えが重なった場合」等に、複数の非同期処理が同時に進んでFirebaseへの書き込み順が
// 入れ替わってしまう（＝最終的な状態が意図と逆転してしまう）ことを防ぐ。
// キュー自体は絶対にreject（失敗）しない設計にしてあり、1つの処理が失敗しても
// 後続の処理は必ず実行される。
let presenceSettingsQueue = Promise.resolve();

function queuePresenceSettingsTask(task) {
  presenceSettingsQueue = presenceSettingsQueue.then(
    () =>
      task().catch((error) => {
        console.warn("presence関連の同期処理でエラーが発生しました", error);
      }),
    () => task().catch((error) => {
      console.warn("presence関連の同期処理でエラーが発生しました", error);
    })
  );
  return presenceSettingsQueue;
}

// 公開設定をONにした場合の後始末：公開プロフィールを作成・確認できたときだけ、
// presence trackingを開始する（本人指示：「publicProfile作成に失敗した場合は、
// presenceだけ開始されないようにする」）。
async function applyPublicProfileSharingEnabled(playerKeyPrefix) {
  const success = await syncPublicProfileIfEnabled(playerKeyPrefix);
  if (success) {
    startFriendPresenceTracking();
  }
}

// 公開設定をOFFにした場合の後始末。順番が重要：
// ①presence tracking停止＋onDisconnect予約解除（js/presenceSync.jsのstopFriendPresenceTracking()）
// ②presence/{uid}を削除（まだpublicProfiles/{uid}が存在するうちに行う。Firebase Rules
//   （Stage1で追加予定）がpresence書き込みの条件に「publicProfiles/{uid}が存在すること」を
//   使うため、先にpublicProfilesを消すとpresence削除自体が拒否されうる）
// ③publicProfiles/{uid}を削除
async function applyPublicProfileSharingDisabled() {
  stopFriendPresenceTracking();
  await deleteFriendPresence();
  await deletePublicProfile();
}

// 公開設定のON/OFFを切り替える。ONにした瞬間は即座に同期し、OFFにした瞬間は
// 即座に削除する（本人指示：「一度ONにした後でもOFFへ戻せる」「OFFにした場合は削除」）。
// 【Stage1で変更】実際の後始末（公開プロフィールの作成・削除、presence trackingの
// 開始・停止・削除）はqueuePresenceSettingsTask()を経由して直列に実行する。
// この関数自体の呼び出し方（同期関数として、awaitせず呼び捨てにできる）は
// 既存の呼び出し側（js/fanProfilesScreen.js）に合わせて変更していない。
export function setPublicProfileSharingEnabled(playerKeyPrefix, enabled) {
  writeEnabledFlag(playerKeyPrefix, enabled);
  if (enabled) {
    queuePresenceSettingsTask(() => applyPublicProfileSharingEnabled(playerKeyPrefix));
  } else {
    queuePresenceSettingsTask(() => applyPublicProfileSharingDisabled());
  }
}

// 【Stage1・本人指示で新設】「現在アクティブなプレイヤーの公開設定」に、presence
// trackingの状態を合わせ直す。以下の3箇所から呼ばれる想定：
//   ①アプリ起動時（js/main.js、以前のstartFriendPresenceTracking()無条件呼び出しの代わり）
//   ②同じ端末でのプレイヤー切り替え直後（js/main.jsのonPlayerChanged）
//   ③バックアップ・機種変更コードでの復元後（js/main.js側でwindow.location.reload()が
//     必ず行われるため、実際にはこの関数を明示的に呼び直す追加コードは不要。
//     reload後の①の起動時呼び出しがそのまま復元後の設定を反映する）
// 公開プロフィール自体の作成・削除はここでは行わない（プレイヤー切り替えのたびに
// 他プレイヤーの公開プロフィールを勝手に消してしまわないようにするため）。
// あくまで「今すでに始まっているpresence trackingを、今の設定に合わせて
// 始める／止める」だけを行う、副作用の小さい調整用の関数。
export function syncFriendPresenceToActivePlayer() {
  return queuePresenceSettingsTask(async () => {
    const playerKeyPrefix = getPlayerKeyPrefix();
    const shouldTrack = isPublicProfileSharingEnabled(playerKeyPrefix);
    if (shouldTrack) {
      if (hasActiveFriendPresenceTracking()) return; // 既に正しい状態
      const success = await syncPublicProfileIfEnabled(playerKeyPrefix);
      if (success) {
        startFriendPresenceTracking();
      }
    } else {
      if (!hasActiveFriendPresenceTracking()) return; // 既に正しい状態
      stopFriendPresenceTracking();
      await deleteFriendPresence();
    }
  });
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
    if (!snapshot.exists()) return { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false };
    const value = snapshot.val();
    return {
      hasNoMissMaster: value?.hasNoMissMaster === true,
      hasEqualLoveMaster: value?.hasEqualLoveMaster === true,
      hasEqualLoveComplete: value?.hasEqualLoveComplete === true,
    };
  } catch {
    return { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false };
  }
}

// 【2026-09-07新設・本人指示：ルーム参加者プロフィール】ロビーで参加者の名前をタップした
// ときに使う、UID1件だけの公開プロフィール取得。fetchAllPublicProfiles()（全員分）を
// 流用せず、必要な1件だけをFirebaseから読む（本人指示：新しいFirebase読み取りパスは
// 増やさず、既存のpublicProfiles/{uid}・既存のnormalizePublicProfileEntry()をそのまま使う）。
// 戻り値はfetchAllPublicProfiles()と揃え、{ok:true, profile:null}＝
// 「取得はできたがこの人はまだプロフィールを公開していない」と、
// {ok:false, profile:null}＝「通信エラー等で取得自体に失敗した」を区別する。
export async function fetchPublicProfileByUid(uid) {
  try {
    await authReady;
    const snapshot = await get(ref(database, `publicProfiles/${uid}`));
    if (!snapshot.exists()) return { ok: true, profile: null };
    return { ok: true, profile: normalizePublicProfileEntry(uid, snapshot.val()) };
  } catch (error) {
    console.warn("参加者プロフィールの取得に失敗しました", error);
    return { ok: false, profile: null };
  }
}

// 自分の現在のUID（匿名認証ID）を返す（2026-08-16追加）。フレンド画面の
// 「🆔 あなたのID」表示と、管理者判定（js/adminConfig.jsのADMIN_UIDとの一致確認）の
// 両方で使う共通関数。認証待ちを含むため非同期。
export async function getMyUid() {
  await authReady;
  return getCurrentUid();
}

// 管理者専用：他人の公開プロフィールをUID指定で削除する（2026-08-16追加）。
// 【安全設計】呼び出し側（js/fanProfilesScreen.js）が事前にADMIN_UIDとの一致を確認した
// うえでだけ呼ぶ想定。ただしそれはUIの誤操作防止のための二重チェックに過ぎず、
// 本当の権限チェックはFirebase Security Rules側で行う必要がある。ルールを適用するまでは、
// 一般ユーザーがブラウザの開発者ツール等から直接Firebaseへ書き込めば同じ削除ができてしまう
// 状態が残る点に注意（本人へ提案するルール文言は最終報告・docs/HANDOFF.mdを参照）。
// 削除対象はpublicProfiles/{targetUid}のみ。本人のローカルデータ・Authアカウント本体・
// 他のFirebaseパス（timeAttackLeaderboardsV2等）には一切触れない。
export async function deletePublicProfileByAdmin(targetUid) {
  await authReady;
  await remove(ref(database, `publicProfiles/${targetUid}`));
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
