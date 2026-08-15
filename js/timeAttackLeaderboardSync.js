// タイムアタックのグローバルランキング（TOP10）の、Firebaseとのやり取りを担当するファイル。
// 既存のオンライン対戦・フレンドと同じFirebase Realtime Database・匿名認証
// （js/firebaseClient.js）をそのまま再利用し、新しいFirebaseプロジェクトは追加しない。
//
// 【ファイル分割方針】Firebaseに一切触れない部分（payload組み立て・比較・並び替え）は
// js/timeAttackLeaderboard.jsへ切り出している。恒久テストはそちらだけをimportし、
// Firebase SDKの初期化・匿名ログインを自動テストのたびに発生させないようにするため
// （js/publicProfileSync.js・js/lyricsQuizBattleFirebase.jsと同じ設計）。
//
// 【プライバシー方針、本人指示】ランキングへの「参加」（自分の記録の送信）は、
// 「フレンド」の公開設定がONのユーザーだけを対象にする。OFFのユーザーは
// タイムアタック自体は今までどおり遊べるが、記録はFirebaseへ送信されない（ローカルの
// 自己ベストには一切影響しない）。ランキングの「閲覧」自体は公開設定を問わず誰でもできる
// （フレンド一覧の閲覧方針と同じ）。
//
// 【負荷方針、本人指示】全記録をダウンロードしてJS側でソートするのではなく、
// Firebaseのquery機能（orderByChild + limitToFirst）でTOP10だけをサーバー側で絞り込む。
// 自分の記録の確認も、全件取得ではなく自分のuidの1件だけを個別に読む。
//
// 【失敗時の扱い、本人指示】Firebase保存・取得に失敗しても、例外を投げず、
// 呼び出し側（画面）が「送信に失敗しました」等の案内を出せるよう、ok:falseの結果を返すだけに
// とどめる（プレイ結果・ローカル自己ベストへは一切影響しない）。
import {
  ref,
  get,
  set,
  remove,
  query,
  orderByChild,
  limitToFirst,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { getActivePlayer } from "./playerProfile.js";
import { getMostOshiMemberId } from "./oshiMembers.js";
import { isPublicProfileSharingEnabled } from "./publicProfilePayloads.js";
import { getTimeAttackHistoryEntries } from "./timeAttackHistory.js";
import {
  buildLeaderboardPath,
  buildLeaderboardEntryPayload,
  isBetterLeaderboardRecord,
  normalizeLeaderboardEntry,
  sortLeaderboardEntries,
  findBestEntryPerVariantRuleQuestionCountAndCategory,
  isValidLeaderboardCandidate,
} from "./timeAttackLeaderboard.js";

// オフライン時はそもそもFirebaseへ接続を試みない（本人指示：「オフライン時は『ランキングは
// オンライン時に表示できます』等の案内」。無駄な接続待ちで画面が固まるのを防ぐ）。
function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// 今回のプレイが自己ベストを更新していた場合に呼ぶ想定（本人指示の更新順序：
// ①ローカル自己ベスト判定②自己ベスト更新③ランキング公開条件確認④Firebase上の自分の
// 既存記録確認⑤新記録が速い場合だけ更新⑥結果画面へ反映、のうち③〜⑤をこの関数が担当する）。
// 【2026-08-16改訂・本人指示】ルール（ノーマル/ハード/LOVE連チャン）を問わず対象にする。
// 代わりに、1問でも間違えたプレイ（missCount>0）はisValidLeaderboardCandidate()側で
// 確実に弾かれる（Firebase書き込みの最終防衛線）。
// 戻り値: { ok: true, updated: boolean } または { ok: false, reason: "privacy-disabled" | "offline" | "error" }
export async function submitTimeAttackScoreIfBetter({
  variant,
  rule,
  questionCountValue,
  categoryFilterValue,
  clearTimeMs,
  missCount,
  playerKeyPrefix,
}) {
  if (!isValidLeaderboardCandidate({ clearTimeMs, missCount })) {
    return { ok: false, reason: "invalid-record" };
  }
  if (!isPublicProfileSharingEnabled(playerKeyPrefix)) {
    return { ok: false, reason: "privacy-disabled" };
  }
  if (isOffline()) {
    return { ok: false, reason: "offline" };
  }

  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return { ok: false, reason: "error" };

    const entryPath = `${buildLeaderboardPath(variant, rule, questionCountValue, categoryFilterValue)}/${uid}`;
    const existingSnapshot = await get(ref(database, entryPath));
    const existingEntry = existingSnapshot.exists()
      ? normalizeLeaderboardEntry(uid, existingSnapshot.val())
      : null;

    if (!isBetterLeaderboardRecord(existingEntry, { clearTimeMs, missCount })) {
      return { ok: true, updated: false };
    }

    const activePlayer = getActivePlayer();
    const payload = buildLeaderboardEntryPayload({
      displayName: activePlayer.playerName,
      oshiMemberId: getMostOshiMemberId(),
      clearTimeMs,
      missCount,
      achievedAt: serverTimestamp(),
    });
    await set(ref(database, entryPath), payload);
    return { ok: true, updated: true };
  } catch (error) {
    console.warn("タイムアタックランキングへの送信に失敗しました（ローカルの記録には影響ありません）", error);
    return { ok: false, reason: "error" };
  }
}

// TOP10を取得する。サーバー側のquery（orderByChild+limitToFirst）で絞り込むため、
// 全記録をダウンロードすることはない。
// 戻り値: { ok: true, entries: [...] }（0件でも成功扱い） または { ok: false, entries: [], reason }
export async function fetchTimeAttackLeaderboardTop10(variant, rule, questionCountValue, categoryFilterValue) {
  if (isOffline()) {
    return { ok: false, entries: [], reason: "offline" };
  }

  try {
    await authReady;
    const leaderboardQuery = query(
      ref(database, buildLeaderboardPath(variant, rule, questionCountValue, categoryFilterValue)),
      orderByChild("clearTimeMs"),
      limitToFirst(10)
    );
    const snapshot = await get(leaderboardQuery);
    if (!snapshot.exists()) return { ok: true, entries: [] };

    const value = snapshot.val();
    const entries = Object.entries(value)
      .map(([uid, raw]) => normalizeLeaderboardEntry(uid, raw))
      .filter((entry) => entry !== null);
    return { ok: true, entries: sortLeaderboardEntries(entries) };
  } catch (error) {
    console.warn("タイムアタックランキングの取得に失敗しました", error);
    return { ok: false, entries: [], reason: "error" };
  }
}

function buildBackfillFlagKey(playerKeyPrefix) {
  // 【2026-08-16改訂】対象ルール・パス構造が変わったため、旧フラグ（〜Backfilled）とは
  // 別名にし、既存ユーザーでも新条件（ノーマル/ハードのクリーン記録・カテゴリー別）で
  // 一度だけ改めてバックフィルが走るようにする（旧フラグはそのまま残るが無害・無視される）。
  return `equalLoveIntroQuiz.${playerKeyPrefix}timeAttackLeaderboardBackfilledV2`;
}

// 「フレンド」を新たにONにした人・すでにONだった人の両方に対応する、
// 既存のローカル自己ベストをランキングへ一度だけ反映する処理（2026-08-07追加、本人指示。
// 2026-08-16にルール・カテゴリー別の抽出へ拡張）。
// 通常の新記録時の送信（submitTimeAttackScoreIfBetter、renderTimeAttackResult経由）は
// 「今まさに更新した記録」しか送らないため、それより前に貯まっていた自己ベストは
// このままでは永久にランキングに反映されない。そのズレを一度だけ解消するための処理。
// プレイヤーごとにlocalStorageのフラグで多重実行を防ぐ（毎回スタート画面へ戻るたびに
// 全件送信し直すような無駄な通信をしないため）。
export async function backfillTimeAttackLeaderboardIfNeeded(playerKeyPrefix) {
  if (!isPublicProfileSharingEnabled(playerKeyPrefix)) return;
  if (isOffline()) return; // オフライン時はフラグを立てず、次回オンライン時に再試行できるようにする

  const flagKey = buildBackfillFlagKey(playerKeyPrefix);
  try {
    if (localStorage.getItem(flagKey) === "true") return;
  } catch {
    return; // localStorageが使えない環境では、多重実行防止ができないため何もしない
  }

  try {
    const historyEntries = getTimeAttackHistoryEntries();
    const bestEntries = findBestEntryPerVariantRuleQuestionCountAndCategory(historyEntries);
    for (const best of bestEntries) {
      await submitTimeAttackScoreIfBetter({ ...best, playerKeyPrefix });
    }
    localStorage.setItem(flagKey, "true");
  } catch (error) {
    console.warn("タイムアタック自己ベストのランキング反映に失敗しました", error);
  }
}

// 管理者専用：ランキングの特定の1件だけを削除する（2026-08-17追加）。
// 【安全設計】呼び出し側（js/timeAttackLeaderboardScreen.js）が事前にADMIN_UIDとの一致を
// 確認したうえでだけ呼ぶ想定。js/publicProfileSync.jsのdeletePublicProfileByAdminと同じ
// 設計思想で、本当の権限チェックはFirebase Security Rules側で行う必要がある。
// 削除対象はvariant×rule×questionCountValue×categoryFilterValue×targetUidで一意に決まる
// 1件の記録だけ。他の記録・他のFirebaseパス・本人の端末内データには一切触れない。
export async function deleteLeaderboardEntryByAdmin(variant, rule, questionCountValue, categoryFilterValue, targetUid) {
  await authReady;
  const entryPath = `${buildLeaderboardPath(variant, rule, questionCountValue, categoryFilterValue)}/${targetUid}`;
  await remove(ref(database, entryPath));
}

// 自分の記録だけを1件、軽量に取得する（TOP10圏外でも「あなたの記録」を表示するため）。
// 戻り値: { ok: true, entry: {...} | null } または { ok: false, entry: null }
export async function fetchMyTimeAttackLeaderboardEntry(variant, rule, questionCountValue, categoryFilterValue) {
  if (isOffline()) {
    return { ok: false, entry: null };
  }

  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return { ok: true, entry: null };

    const entryPath = `${buildLeaderboardPath(variant, rule, questionCountValue, categoryFilterValue)}/${uid}`;
    const snapshot = await get(ref(database, entryPath));
    const entry = snapshot.exists() ? normalizeLeaderboardEntry(uid, snapshot.val()) : null;
    return { ok: true, entry, uid };
  } catch (error) {
    console.warn("あなたのタイムアタック記録の取得に失敗しました", error);
    return { ok: false, entry: null };
  }
}
