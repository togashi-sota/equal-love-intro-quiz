// 「以前のあなた（クラウドのバックアップ）」と「現在のあなた（この端末）」を比べて整理する実行役（2026-10-28新設）。
// 比較・計画は純粋関数（js/identityDataComparison.js）。このファイルは「読む・確かめる・控えを取る・書く・戻す」だけを、
// 依存（Firebase の読み取り・localStorage・同期）を引数で受け取る形で行う（tests/accountPermanentFix.test.js で偽物を差し込む）。
//
// 【安全の約束】
//   ・最初は必ず試算（dryRun）。実行（execute）は confirmed: true が無いと何もしない
//   ・本人の証明が無いと実行しない：①バックアップを「持ち主として」読めた（backups/{id}/currentUid が今のUID。
//     Rules 上、これは ownerSecret による所有権の回復か、引き継ぎコード・管理者の付け替えを通った後にしか成り立たない）
//     ②端末に ownerSecret がある ③計画を作ったときと同じUID・同じ backupId。管理者が他人のバックアップを
//     読めても①を満たさないので、他人のデータとは絶対に混ぜない
//   ・実行の直前にもう一度読み直して計画を作り直し、試算と違えば中止（試算し直してもらう）
//   ・書く前に、書き換えるキーの今の値をすべて端末に控える（元に戻せる）。書いた後に読み戻して確かめ、
//     1つでも違えば控えから全部戻す
//   ・Firebase へ書くのは、整理後の通常のバックアップ同期（syncNow）だけ。他人のデータ・他のUIDのデータには書かない

import { planBackupMerge, describeBackupMergePlan } from "./identityDataComparison.js";

export const MERGE_SNAPSHOT_KEY_PREFIX = "equalLoveIntroQuiz.identityMergeSnapshot.";
export const MERGE_SNAPSHOT_INDEX_KEY = "equalLoveIntroQuiz.identityMergeSnapshotIndex";
export const MERGE_SNAPSHOT_MAX = 3;

// deps:
//   storage: localStorage と同じ形（getItem/setItem/removeItem）
//   getStoragePrefix(): 論理キーの前に付ける接頭辞（例 "equalLoveIntroQuiz." ＋ プレイヤー接頭辞）
//   getPlayerId(): 今のプレイヤーID（控えの名前に使う）
//   getCurrentUid(): 今のUID（authReady 後）
//   getBackupId(): 端末の backupId（無ければ null）
//   hasOwnerSecret(): 端末に ownerSecret があるか
//   readBackup(backupId): Promise<{ ok, currentUid, entries, reason }>（entries は論理キーへ戻した payload）
//   collectLocalEntries(): この端末の { 論理キー: 生の文字列 }
//   syncNow(): Promise（整理後の通常のバックアップ同期）
//   now(): 現在時刻（ミリ秒）
//   compareLyricsQuizResults?: 歌詞クイズの比較関数
export function createIdentityMergeRunner(deps) {
  const now = () => (typeof deps.now === "function" ? deps.now() : Date.now());

  function checkProof(backup, uid, backupId) {
    const reasons = [];
    if (!uid) reasons.push("ログインIDを確認できません");
    if (!backupId) reasons.push("この端末にはバックアップの記録がありません");
    if (!backup?.ok) reasons.push(backup?.reason ?? "バックアップを読めませんでした（持ち主として確認できません）");
    else if (backup.currentUid !== uid) reasons.push("バックアップの持ち主が今のIDではありません（本人の確認が取れていません）");
    if (!deps.hasOwnerSecret()) reasons.push("この端末に本人確認用の秘密（ownerSecret）がありません");
    return { ok: reasons.length === 0, reasons };
  }

  // 比べる（読み取りのみ）。
  async function compare() {
    const uid = deps.getCurrentUid();
    const backupId = deps.getBackupId();
    let backup = { ok: false, reason: "この端末にはバックアップの記録がありません" };
    if (backupId) {
      try {
        backup = await deps.readBackup(backupId);
      } catch (error) {
        backup = { ok: false, reason: `バックアップを読めませんでした（${error?.code ?? "通信エラー"}）` };
      }
    }
    const proof = checkProof(backup, uid, backupId);
    const local = deps.collectLocalEntries();
    const plan = backup?.ok ? planBackupMerge(backup.entries ?? {}, local, { compareLyricsQuizResults: deps.compareLyricsQuizResults }) : null;
    return { ok: !!plan, uid, backupId, proof, plan, reason: plan ? null : backup.reason, createdAt: now() };
  }

  // 試算（何も書かない）。画面に出す日本語を返す。
  function dryRun(comparison) {
    if (!comparison?.plan) return { ok: false, lines: [comparison?.reason ?? "比べられませんでした"] };
    const lines = describeBackupMergePlan(comparison.plan);
    return { ok: true, lines, changedKeyCount: comparison.plan.summary.changedKeyCount, canExecute: comparison.proof.ok && comparison.plan.summary.changedKeyCount > 0 };
  }

  function readIndex() {
    try {
      const parsed = JSON.parse(deps.storage.getItem(MERGE_SNAPSHOT_INDEX_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }

  function writeIndex(list) {
    deps.storage.setItem(MERGE_SNAPSHOT_INDEX_KEY, JSON.stringify(list));
  }

  function saveSnapshot(keys, meta) {
    const prefix = deps.getStoragePrefix();
    const values = {};
    keys.forEach((key) => {
      const raw = deps.storage.getItem(`${prefix}${key}`);
      values[key] = raw === null || raw === undefined ? null : raw;
    });
    const id = `${deps.getPlayerId()}.${meta.savedAt}`;
    deps.storage.setItem(`${MERGE_SNAPSHOT_KEY_PREFIX}${id}`, JSON.stringify({ ...meta, prefix, values }));
    const index = [...readIndex().filter((x) => x !== id), id];
    // 古い控えから捨てる（最新 MERGE_SNAPSHOT_MAX 件だけ残す）
    while (index.length > MERGE_SNAPSHOT_MAX) {
      const dropped = index.shift();
      deps.storage.removeItem(`${MERGE_SNAPSHOT_KEY_PREFIX}${dropped}`);
    }
    writeIndex(index);
    return id;
  }

  function restoreValues(prefix, values) {
    Object.entries(values).forEach(([key, raw]) => {
      if (raw === null) deps.storage.removeItem(`${prefix}${key}`);
      else deps.storage.setItem(`${prefix}${key}`, raw);
    });
  }

  // 実行。comparison は compare() の結果（試算を見た後のもの）。
  async function execute(comparison, { confirmed = false } = {}) {
    if (!confirmed) return { ok: false, reason: "確認が済んでいません（「本当に整理する」を押してください）" };
    if (!comparison?.plan) return { ok: false, reason: "試算がありません。先に「整理する（試算を見る）」を押してください" };
    if (!comparison.proof?.ok) return { ok: false, reason: `本人の確認が取れないため実行できません：${comparison.proof?.reasons?.join("／") ?? ""}` };
    // 直前にもう一度読み直して、試算と同じ内容か確かめる（その間に別の端末・別のタブで変わっていたら中止）
    const fresh = await compare();
    if (!fresh.proof.ok) return { ok: false, reason: `本人の確認が取れないため実行できません：${fresh.proof.reasons.join("／")}` };
    if (fresh.uid !== comparison.uid || fresh.backupId !== comparison.backupId) return { ok: false, reason: "試算したときとログインIDが違います。画面を開き直してください" };
    if (JSON.stringify(fresh.plan.writes) !== JSON.stringify(comparison.plan.writes)) {
      return { ok: false, reason: "試算の後にデータが変わりました。もう一度「整理する（試算を見る）」を押してください", stale: true };
    }
    const writes = fresh.plan.writes;
    const keys = Object.keys(writes);
    if (keys.length === 0) return { ok: true, changedKeyCount: 0, snapshotId: null };
    const prefix = deps.getStoragePrefix();
    const savedAt = now();
    let snapshotId;
    try {
      snapshotId = saveSnapshot(keys, { savedAt, uid: fresh.uid, kind: "backup-merge" });
    } catch {
      return { ok: false, reason: "整理前の控えを保存できなかったため、何も変更していません（端末の空き容量をご確認ください）" };
    }
    const snapshot = JSON.parse(deps.storage.getItem(`${MERGE_SNAPSHOT_KEY_PREFIX}${snapshotId}`));
    try {
      keys.forEach((key) => deps.storage.setItem(`${prefix}${key}`, writes[key]));
      const mismatch = keys.filter((key) => deps.storage.getItem(`${prefix}${key}`) !== writes[key]);
      if (mismatch.length) throw new Error(`readback-mismatch:${mismatch.join(",")}`);
    } catch (error) {
      restoreValues(prefix, snapshot.values);
      return { ok: false, reason: "書き込みを確かめられなかったため、整理前の状態に戻しました", error: String(error?.message ?? error) };
    }
    try {
      await deps.syncNow();
    } catch {
      // 同期は次の機会に自動で行われる（端末の整理自体は完了している）
    }
    return { ok: true, changedKeyCount: keys.length, snapshotId };
  }

  // 直前の整理を元に戻す（控えが無ければ何もしない）。
  async function undoLast() {
    const index = readIndex();
    const playerPrefix = `${deps.getPlayerId()}.`;
    const id = [...index].reverse().find((x) => x.startsWith(playerPrefix));
    if (!id) return { ok: false, reason: "元に戻せる整理の控えがありません" };
    let snapshot = null;
    try {
      snapshot = JSON.parse(deps.storage.getItem(`${MERGE_SNAPSHOT_KEY_PREFIX}${id}`) ?? "null");
    } catch {
      snapshot = null;
    }
    if (!snapshot || typeof snapshot.values !== "object") return { ok: false, reason: "控えが壊れていて元に戻せません" };
    restoreValues(snapshot.prefix ?? deps.getStoragePrefix(), snapshot.values);
    deps.storage.removeItem(`${MERGE_SNAPSHOT_KEY_PREFIX}${id}`);
    writeIndex(index.filter((x) => x !== id));
    try {
      await deps.syncNow();
    } catch {
      // 次の機会に同期される
    }
    return { ok: true, restoredKeyCount: Object.keys(snapshot.values).length };
  }

  function hasUndo() {
    const playerPrefix = `${deps.getPlayerId()}.`;
    return readIndex().some((x) => x.startsWith(playerPrefix));
  }

  return { compare, dryRun, execute, undoLast, hasUndo, checkProof };
}

// ---------------------------------------------------------------------------
// 実アプリ向けの配線（動的 import。テストからは呼ばない）
// ---------------------------------------------------------------------------
export async function createAppIdentityMergeRunner() {
  const playerProfile = await import("./playerProfile.js");
  const backupSync = await import("./backupSync.js");
  let compareLyricsQuizResults = null;
  try {
    ({ compareLyricsQuizResults } = await import("./lyricsQuizEngine.js"));
  } catch {
    compareLyricsQuizResults = null;
  }
  const firebaseClient = await import("./firebaseClient.js");
  const rtdb = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
  await firebaseClient.authReady;
  return createIdentityMergeRunner({
    storage: localStorage,
    getStoragePrefix: () => `equalLoveIntroQuiz.${playerProfile.getPlayerKeyPrefix()}`,
    getPlayerId: () => playerProfile.getActivePlayer().playerId,
    getCurrentUid: () => firebaseClient.getCurrentUid(),
    getBackupId: () => playerProfile.getBackupId(playerProfile.getActivePlayer().playerId),
    hasOwnerSecret: () => {
      const player = playerProfile.getPlayers().find((p) => p.playerId === playerProfile.getActivePlayer().playerId);
      return typeof player?.ownerSecret === "string" && player.ownerSecret.length >= 32;
    },
    readBackup: async (backupId) => {
      // 読み取り1回（持ち主か管理者しか読めない。持ち主かどうかは currentUid で判定する）
      const snap = await rtdb.get(rtdb.ref(firebaseClient.database, `backups/${backupId}`));
      if (!snap.exists()) return { ok: false, reason: "クラウドにバックアップがありません" };
      const record = snap.val();
      const entries = {};
      Object.entries(record.payload ?? {}).forEach(([firebaseKey, value]) => {
        if (typeof value === "string") entries[firebaseKey.replace(/~/g, ".")] = value;
      });
      return { ok: true, currentUid: record.currentUid ?? null, entries };
    },
    collectLocalEntries: () => backupSync.collectLocalBackupEntries(),
    syncNow: () => backupSync.syncNow(),
    compareLyricsQuizResults,
  });
}
