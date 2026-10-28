// 「以前のあなた（クラウドのバックアップ）」と「現在のあなた（この端末）」を比べて整理する実行役（2026-10-28新設）。
// 比較・計画は純粋関数（js/identityDataComparison.js）。このファイルは「読む・確かめる・控えを取る・書く・戻す」だけを、
// 依存（Firebase の読み書き・localStorage・同期）を引数で受け取る形で行う
// （tests/accountPermanentFix.test.js で偽物を、tools/rules-emulator/mergeRunner.emulator.test.mjs で本物の
//  Realtime Database エミュレーターを差し込む）。
//
// 【安全の約束】
//   ・最初は必ず試算（dryRun）。実行（execute）は confirmed: true が無いと何もしない
//   ・本人の証明が無いと実行しない：①バックアップを「持ち主として」読めた（backups/{id}/currentUid が今のUID。
//     Rules 上、これは ownerSecret による所有権の回復か、引き継ぎコード・管理者の付け替えを通った後にしか成り立たない）
//     ②端末に ownerSecret がある ③計画を作ったときと同じUID・同じ backupId。管理者が他人のバックアップを
//     読めても①を満たさないので、他人のデータとは絶対に混ぜない
//   ・実行の直前にもう一度読み直して計画を作り直し、試算と違えば中止（試算し直してもらう）
//
// 【2026-10-28改訂：衝突に強い書き込み（本人指示）】
// 以前は「書く前に控えを取り、失敗したら控えを丸ごと書き戻す」だった。これだと、整理の最中に別のタブ・別の端末が
// 書いた新しい記録まで、控えの古い値で消してしまう。そこで次のように変えた：
//   ・書く前に「保留の控え」（identityMergeHold）を必ず先に保存する。以前の値（クラウド）と現在の値（端末）の両方を、
//     書き換える項目・自動では統合しない項目（累積の回数）・今の値を残す項目（推し・設定）について残す。
//     控えはバックアップにも含まれ、本人が「確認済み」にするまで自動では消さない（＝以前のデータを消さない）
//   ・項目（キー）ごとに「比べてから書く」（compare-and-set）：
//       端末：書く直前の値が計画時点の値と同じときだけ書く。違えば（別のタブが書いた）その項目は書かない＝衝突として報告
//       クラウド（deps.cloud がある場合）：backups/{id}/payload/{キー} を transaction で、計画時点の値（以前のあなた）と
//       同じときだけ統合後の値にする。違えば書かない（別の端末が書いた値を上書きしない）
//   ・失敗したら「自分が書いた値が、まだ自分が書いたままのときだけ」元に戻す。誰かが書き換えていれば触らない
//   ・同じ実行を何度繰り返しても結果は同じ（既に統合後の値になっている項目は「済み」として扱う）
//   ・累積の回数（苦手曲の集計）は自動では統合しない：「保留（自動では統合しません）」として両方の値を控えるだけ
//   ・旧バックアップ（以前のあなた）の項目は削除しない。書き換えるのは「統合後の値＝以前の内容を含む値」だけ

import { planBackupMerge, describeBackupMergePlan, HOLD_LOGICAL_KEY } from "./identityDataComparison.js";

export const MERGE_SNAPSHOT_KEY_PREFIX = "equalLoveIntroQuiz.identityMergeSnapshot.";
export const MERGE_SNAPSHOT_INDEX_KEY = "equalLoveIntroQuiz.identityMergeSnapshotIndex";
export const MERGE_SNAPSHOT_MAX = 3;
export { HOLD_LOGICAL_KEY };

// deps:
//   storage: localStorage と同じ形（getItem/setItem/removeItem）
//   getStoragePrefix(): 論理キーの前に付ける接頭辞（例 "equalLoveIntroQuiz." ＋ プレイヤー接頭辞）
//   getPlayerId(): 今のプレイヤーID（控えの名前に使う）
//   getCurrentUid(): 今のUID（authReady 後）
//   getBackupId(): 端末の backupId（無ければ null）
//   hasOwnerSecret(): 端末に ownerSecret があるか
//   readBackup(backupId): Promise<{ ok, currentUid, entries, reason }>（entries は論理キーへ戻した payload）
//   collectLocalEntries(): この端末の { 論理キー: 生の文字列 }
//   syncNow(): Promise（整理後の通常のバックアップ同期。省略可）
//   now(): 現在時刻（ミリ秒）
//   compareLyricsQuizResults?: 歌詞クイズの比較関数
//   cloud?: { transactPayloadKey(backupId, logicalKey, updateFn) → Promise<{ committed, value }> }
//           （backups/{backupId}/payload/{キー} の transaction。updateFn は今の値→新しい値／undefined＝中止）
//   beforeEachWrite?(key): テスト用の差し込み口（書く直前に別の端末の書き込みや失敗を起こす）
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
    return {
      ok: true,
      lines,
      changedKeyCount: comparison.plan.summary.changedKeyCount,
      heldKeyCount: comparison.plan.summary.heldKeyCount ?? 0,
      canExecute: comparison.proof.ok && (comparison.plan.summary.changedKeyCount > 0 || (comparison.plan.held ?? []).length > 0),
    };
  }

  // ---- 控え（元に戻す用。最新3件。端末だけ） ----
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
  function saveSnapshot(record) {
    const id = `${deps.getPlayerId()}.${record.savedAt}`;
    deps.storage.setItem(`${MERGE_SNAPSHOT_KEY_PREFIX}${id}`, JSON.stringify(record));
    const index = [...readIndex().filter((x) => x !== id), id];
    while (index.length > MERGE_SNAPSHOT_MAX) {
      const dropped = index.shift();
      deps.storage.removeItem(`${MERGE_SNAPSHOT_KEY_PREFIX}${dropped}`);
    }
    writeIndex(index);
    return id;
  }

  // ---- 保留の控え（以前の値を消さない。バックアップにも含まれる論理キー。本人が確認するまで消さない） ----
  function holdStorageKey() {
    return `${deps.getStoragePrefix()}${HOLD_LOGICAL_KEY}`;
  }
  function readHolds() {
    try {
      const parsed = JSON.parse(deps.storage.getItem(holdStorageKey()) ?? "null");
      return Array.isArray(parsed?.holds) ? parsed.holds.filter((h) => h && typeof h.id === "string") : [];
    } catch {
      return [];
    }
  }
  function writeHolds(holds) {
    const raw = JSON.stringify({ schemaVersion: 1, holds });
    deps.storage.setItem(holdStorageKey(), raw);
    if (deps.storage.getItem(holdStorageKey()) !== raw) throw new Error("hold-write-failed");
  }
  function listHolds() {
    return readHolds();
  }
  // 本人が中身を確かめて「確認済み」にしたときだけ消す（confirmed: true が必要）
  function confirmHold(holdId, { confirmed = false } = {}) {
    if (!confirmed) return { ok: false, reason: "確認が済んでいません" };
    const holds = readHolds();
    if (!holds.some((h) => h.id === holdId)) return { ok: false, reason: "その控えはありません" };
    writeHolds(holds.filter((h) => h.id !== holdId));
    return { ok: true };
  }

  // クラウドの1項目を「計画時点の値（expected）と同じときだけ」desired にする。
  // 戻り値："written"（書いた）／"already"（既に desired）／"conflict"（別の値になっていた＝書かない）
  async function casCloud(backupId, key, expected, desired) {
    if (!deps.cloud) return "skipped";
    const result = await deps.cloud.transactPayloadKey(backupId, key, (cur) => {
      const value = cur === undefined ? null : cur;
      if (value === desired) return desired;
      if (value === expected) return desired;
      // RTDB の transaction は最初に端末のキャッシュ（無ければ null）で呼ばれる。null のときは null を返して
      // サーバーの本当の値で呼び直してもらう（本当に null なら何も変えずに終わる＝書かない）
      if (value === null) return null;
      return undefined; // 別の値になっている＝中止（上書きしない）
    });
    const finalValue = result?.value === undefined ? null : result?.value;
    if (finalValue === desired) return expected === desired ? "already" : "written";
    return "conflict";
  }

  // 自分が書いた値が、まだ自分が書いたままのときだけ元へ戻す
  async function rollbackWritten(prefix, written, backupId) {
    const report = { restored: [], keptBecauseChanged: [] };
    for (const [key, w] of Object.entries(written)) {
      if (w.local) {
        const storageKey = `${prefix}${key}`;
        if (deps.storage.getItem(storageKey) === w.local.after) {
          if (w.local.before === null) deps.storage.removeItem(storageKey);
          else deps.storage.setItem(storageKey, w.local.before);
          report.restored.push(`端末:${key}`);
        } else {
          report.keptBecauseChanged.push(`端末:${key}`);
        }
      }
      if (w.cloud && deps.cloud) {
        try {
          const outcome = await deps.cloud.transactPayloadKey(backupId, key, (cur) => {
            const value = cur === undefined ? null : cur;
            if (value === w.cloud.before) return w.cloud.before;
            if (value === w.cloud.after) return w.cloud.before;
            if (value === null) return null;
            return undefined;
          });
          const finalValue = outcome?.value === undefined ? null : outcome?.value;
          if (finalValue === w.cloud.before) report.restored.push(`クラウド:${key}`);
          else report.keptBecauseChanged.push(`クラウド:${key}`);
        } catch {
          report.keptBecauseChanged.push(`クラウド:${key}`);
        }
      }
    }
    return report;
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
    if (JSON.stringify(fresh.plan.writes) !== JSON.stringify(comparison.plan.writes) || JSON.stringify(fresh.plan.held ?? []) !== JSON.stringify(comparison.plan.held ?? [])) {
      return { ok: false, reason: "試算の後にデータが変わりました。もう一度「整理する（試算を見る）」を押してください", stale: true };
    }
    const plan = fresh.plan;
    const writes = plan.writes;
    const keys = Object.keys(writes).sort();
    const heldItems = plan.held ?? [];
    if (keys.length === 0 && heldItems.length === 0) return { ok: true, changedKeyCount: 0, snapshotId: null, holdId: null, conflicts: [] };
    const prefix = deps.getStoragePrefix();
    const savedAt = now();
    const holdId = `${deps.getPlayerId()}.${savedAt}`;

    // ① 保留の控えを最初に保存する（以前の値を絶対に失わない）。保存できなければ何も書かない
    try {
      const overwritten = keys.map((key) => ({ key, previous: plan.baseline?.[key]?.previous ?? null, current: plan.baseline?.[key]?.current ?? null, merged: writes[key] }));
      const holds = readHolds().filter((h) => h.id !== holdId);
      holds.push({ id: holdId, savedAt, uid: fresh.uid, kind: "backup-merge", label: "以前のあなた／現在のあなたの整理", items: heldItems, overwritten, confirmedAt: null });
      writeHolds(holds);
    } catch {
      return { ok: false, reason: "整理前の控え（保留）を保存できなかったため、何も変更していません（端末の空き容量をご確認ください）" };
    }

    // ② 元に戻す用の控え（書いた値と書く前の値だけ）
    let snapshotId = null;
    try {
      snapshotId = saveSnapshot({ savedAt, uid: fresh.uid, backupId: fresh.backupId, kind: "backup-merge", prefix, written: {} });
    } catch {
      return { ok: false, reason: "整理前の控えを保存できなかったため、何も変更していません（端末の空き容量をご確認ください）", holdId };
    }
    const updateSnapshot = (written) => {
      try {
        deps.storage.setItem(`${MERGE_SNAPSHOT_KEY_PREFIX}${snapshotId}`, JSON.stringify({ savedAt, uid: fresh.uid, backupId: fresh.backupId, kind: "backup-merge", prefix, written }));
      } catch {
        // 控えの更新に失敗しても、書いた値の記録は written に残っている（下の巻き戻しで使う）
      }
    };

    // ③ 項目ごとに「比べてから書く」
    const written = {};
    const conflicts = [];
    const already = [];
    try {
      for (const key of keys) {
        if (typeof deps.beforeEachWrite === "function") await deps.beforeEachWrite(key);
        const storageKey = `${prefix}${key}`;
        const expectedLocal = plan.baseline?.[key]?.current ?? null;
        const desired = writes[key];
        const nowLocal = deps.storage.getItem(storageKey);
        if (nowLocal === desired) {
          already.push(`端末:${key}`);
        } else if (nowLocal !== expectedLocal) {
          conflicts.push({ key, where: "端末", message: "整理の途中で別のタブ・別の操作がこの記録を変えたため、この項目は整理しませんでした（新しい記録はそのまま）" });
          continue;
        } else {
          deps.storage.setItem(storageKey, desired);
          if (deps.storage.getItem(storageKey) !== desired) throw new Error(`readback-mismatch:${key}`);
          written[key] = { ...(written[key] ?? {}), local: { before: nowLocal, after: desired } };
          updateSnapshot(written);
        }
        // クラウド側（backups/{id}/payload/{キー}）も「以前のあなたの値のままなら」統合後の値へ
        if (deps.cloud) {
          const expectedCloud = plan.baseline?.[key]?.previous ?? null;
          const outcome = await casCloud(fresh.backupId, key, expectedCloud, desired);
          if (outcome === "written") {
            written[key] = { ...(written[key] ?? {}), cloud: { before: expectedCloud, after: desired } };
            updateSnapshot(written);
          } else if (outcome === "already") {
            already.push(`クラウド:${key}`);
          } else if (outcome === "conflict") {
            conflicts.push({ key, where: "クラウド", message: "整理の途中で別の端末がクラウドのこの記録を変えたため、クラウド側は書き換えませんでした（次回の通常の同期でそろいます）" });
          }
        }
      }
    } catch (error) {
      const rollback = await rollbackWritten(prefix, written, fresh.backupId);
      updateSnapshot({});
      return {
        ok: false,
        reason: "途中で書き込みに失敗したため、この整理で書いた値を元に戻しました（他のタブ・端末が書いた新しい値には触れていません。保留の控えは残っています）",
        error: String(error?.message ?? error),
        rollback,
        holdId,
        conflicts,
      };
    }

    if (typeof deps.syncNow === "function" && Object.keys(written).length > 0) {
      try {
        await deps.syncNow();
      } catch {
        // 同期は次の機会に自動で行われる（端末の整理自体は完了している）
      }
    }
    return { ok: true, changedKeyCount: Object.keys(written).length, snapshotId, holdId, conflicts, already, heldKeyCount: heldItems.filter((h) => h.reason === "not-mergeable").length };
  }

  // 直前の整理を元に戻す（控えが無ければ何もしない）。自分が書いた値がそのまま残っている項目だけ戻す。
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
    if (!snapshot || typeof snapshot.written !== "object" || snapshot.written === null) return { ok: false, reason: "控えが壊れていて元に戻せません" };
    const report = await rollbackWritten(snapshot.prefix ?? deps.getStoragePrefix(), snapshot.written, snapshot.backupId ?? deps.getBackupId());
    deps.storage.removeItem(`${MERGE_SNAPSHOT_KEY_PREFIX}${id}`);
    writeIndex(index.filter((x) => x !== id));
    if (typeof deps.syncNow === "function" && report.restored.length > 0) {
      try {
        await deps.syncNow();
      } catch {
        // 次の機会に同期される
      }
    }
    return { ok: true, restoredKeyCount: report.restored.filter((x) => x.startsWith("端末:")).length, restored: report.restored, keptBecauseChanged: report.keptBecauseChanged };
  }

  function hasUndo() {
    const playerPrefix = `${deps.getPlayerId()}.`;
    return readIndex().some((x) => x.startsWith(playerPrefix));
  }

  return { compare, dryRun, execute, undoLast, hasUndo, checkProof, listHolds, confirmHold };
}

// ---------------------------------------------------------------------------
// 実アプリ向けの配線（動的 import。テストからは呼ばない）
// ---------------------------------------------------------------------------
// Realtime Database のキーに "." は使えないため、payload のキーは "~" に置き換えて保存している（js/backupSync.js と同じ）
export function encodePayloadKeyForFirebase(logicalKey) {
  return logicalKey.replace(/\./g, "~");
}

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
    // 項目ごとの compare-and-set（backups/{id}/payload/{キー} だけの transaction。持ち主しか読み書きできない場所）
    cloud: {
      transactPayloadKey: async (backupId, logicalKey, updateFn) => {
        const target = rtdb.ref(firebaseClient.database, `backups/${backupId}/payload/${encodePayloadKeyForFirebase(logicalKey)}`);
        const result = await rtdb.runTransaction(target, (cur) => updateFn(cur), { applyLocally: false });
        return { committed: result.committed, value: result.snapshot.val() };
      },
    },
  });
}
