// バックアップ所有権の自己修復（ownerSecret方式、2026-09-15新設）の回帰テスト。
//
// 本人指示の検証ケース A〜M に対応する：
//  A. 通常ユーザー・UID変更なし → 今までどおり（所有者として書ける、旧UIDの記録は作られない）
//  B. UIDだけ変更・localStorage残存 → ownerSecret で自動的に所有権を回復できる
//  C. UID変更・backupIdあり・ownerSecret不一致 → 拒否
//  D. 他人が backupId だけ知っている → 読めない・書けない
//  E. 他人が任意のUIDを指定 → 他人のプロフィール／backup／ランキングを操作できない
//  F. localStorage完全消失（ownerSecretが無い） → 自動復旧せず（従来の引き継ぎ／復旧の経路は生きている）
//  G. 同時起動／複数タブ → 後から来た古い previousUids の記録は拒否され、所有権が壊れない
//  H. 既存ユーザーへの ownerSecret 初回付与 → 所有者の通常書き込みとして許可、何度でも同じ値（冪等）
//  I. 旧UIDにしか無いランキング記録 → 勝手に削除されない（複製してから旧を消す計画になる）
//  J. 引き継ぎコード → 既存どおり許可（同じ書き込みで ownerSecret の差し替えも許可）
//  K. 復旧依頼（管理者による currentUid の書き換え） → 既存どおり許可
//  L/M. 管理者判定は tests/adminAccess.test.js が担当
//
// ルールの意図は js/backupOwnership.js のシミュレーターで、実ファイル（firebase/database.rules.json）と
// コードの配線はソース構造検証で、それぞれ確認する。

import {
  OWNER_SECRET_LENGTH,
  generateOwnerSecret,
  isValidOwnerSecret,
  detectUidChange,
  evaluateBackupWrite,
  evaluateBackupRead,
  evaluateUidSupersessionWrite,
  evaluateUidSupersessionRead,
  evaluateSuccessorDelete,
  planLeaderboardMerge,
  buildCopiedLeaderboardEntry,
} from "../js/backupOwnership.js";
import {
  getPlayers,
  getActivePlayer,
  getOrCreateOwnerSecret,
  rotateOwnerSecret,
  getLastKnownUid,
  setLastKnownUid,
  getPendingUidMerge,
  setPendingUidMerge,
  clearPendingUidMerge,
} from "../js/playerProfile.js";
import { assertEqual } from "./test-utils.js";

const OLD = "oldUid_1lg2ur";
const NEW = "newUid_sh5vDF";
const OTHER = "attackerUid";
const SECRET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789"; // 32文字
const NOW = 1_800_000_000_000;

function baseBackup(overrides = {}) {
  return {
    schemaVersion: 1,
    currentUid: OLD,
    updatedAt: NOW - 1000,
    payload: { achievements: "{}" },
    ownerSecret: SECRET,
    ...overrides,
  };
}
function ownerWrite(uid, overrides = {}) {
  return { schemaVersion: 1, currentUid: uid, updatedAt: NOW, payload: { achievements: "{}" }, ...overrides };
}

export function runBackupOwnershipTests() {
  // ---- ownerSecret の生成・検証 ----
  const fixed = generateOwnerSecret((n) => Uint8Array.from({ length: n }, (_, i) => i));
  assertEqual(fixed.length, OWNER_SECRET_LENGTH, "ownerSecret は32文字");
  assertEqual(/^[0-9A-HJKMNP-TV-Z]+$/.test(fixed), true, "ownerSecret は紛らわしい文字（I/L/O/U）を含まないBase32文字集合");
  const real = generateOwnerSecret();
  assertEqual(isValidOwnerSecret(real), true, "実際の乱数で作った ownerSecret は妥当");
  assertEqual(real !== generateOwnerSecret(), true, "生成のたびに違う値になる");
  assertEqual(isValidOwnerSecret("short"), false, "短すぎる値は無効");
  assertEqual(isValidOwnerSecret("x".repeat(65)), false, "長すぎる値は無効");
  assertEqual(isValidOwnerSecret(12345678901234567890123456789012), false, "数値は無効");

  // ---- UID変化の検知 ----
  assertEqual(detectUidChange(null, NEW), { changed: false, previousUid: null }, "前回UIDが無ければ変化なし扱い（判定不能）");
  assertEqual(detectUidChange(NEW, NEW), { changed: false, previousUid: null }, "同じUIDなら変化なし");
  assertEqual(detectUidChange(OLD, NEW), { changed: true, previousUid: OLD }, "違うUIDなら変化あり・旧UIDを返す");

  // ---- A. UID変更なし：所有者の通常書き込み ----
  assertEqual(
    evaluateBackupWrite({ authUid: OLD, existing: baseBackup(), incoming: ownerWrite(OLD, { ownerSecret: SECRET }), now: NOW }),
    { allowed: true, reason: null },
    "A: 所有者（currentUid一致）の通常同期は許可される"
  );

  // ---- B. UIDだけ変更・ownerSecret一致：自己修復 ----
  const NEW_SECRET = "NEWSECRETNEWSECRETNEWSECRETNEWSE";
  const claimWrite = (secret, extra = {}) => ownerWrite(NEW, { ownerClaim: { secret, at: NOW }, ownerSecret: NEW_SECRET, ...extra });
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: baseBackup(), incoming: claimWrite(SECRET, { previousUids: { [OLD]: NOW } }), now: NOW }),
    { allowed: true, reason: null },
    "B: 手元の ownerSecret を証明として送り、ownerSecret を作り直す書き込みなら、新UIDが currentUid を自分へ書き換えられる（旧UIDの記録つき）"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: baseBackup(), incoming: claimWrite(SECRET), now: NOW }),
    { allowed: true, reason: null },
    "B: 旧UIDの記録なしでも証明が正しければ許可（記録が拒否されたときの再試行経路）"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: baseBackup(), incoming: ownerWrite(NEW, { ownerClaim: { secret: SECRET, at: NOW }, ownerSecret: SECRET }), now: NOW }),
    { allowed: false, reason: "write-denied" },
    "B: 証明が正しくても ownerSecret を作り直さない書き込みは拒否（古い証明を二度と使えなくするため）"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: baseBackup(), incoming: ownerWrite(NEW, { ownerClaim: { secret: SECRET, at: NOW - 5000 }, ownerSecret: NEW_SECRET }), now: NOW }),
    { allowed: false, reason: "write-denied" },
    "B: 証明の時刻がサーバー時刻と一致しない（＝この書き込みで送られた証明ではない）場合は拒否"
  );
  // update() が「書かなかったキーを以前の値のまま残す」性質への対策：以前の claim が残っていても再利用できない
  const afterClaim = baseBackup({ currentUid: NEW, ownerSecret: NEW_SECRET, ownerClaim: { secret: SECRET, at: NOW - 1000 } });
  assertEqual(
    evaluateBackupWrite({ authUid: OTHER, existing: afterClaim, incoming: { currentUid: OTHER, ownerClaim: { secret: SECRET, at: NOW }, ownerSecret: "ATTACKERATTACKERATTACKERATTACKER" }, now: NOW }),
    { allowed: false, reason: "write-denied" },
    "B: 以前の証明（古い ownerSecret）を再利用しても、ownerSecret が作り直されているため通らない"
  );

  // claim 成功後の後始末：持ち主は使い終わった ownerClaim を消せる。他人は消せない。
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: afterClaim, incoming: { ownerClaim: null }, now: NOW }),
    { allowed: true, reason: null },
    "B: claim 成功後、持ち主（新UID）は使い終わった ownerClaim を削除できる"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: OTHER, existing: afterClaim, incoming: { ownerClaim: null, currentUid: OTHER }, now: NOW }),
    { allowed: false, reason: "write-denied" },
    "B: 他人は ownerClaim を消すことも持ち主になることもできない"
  );

  // ---- C. ownerSecret 不一致 ----
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: baseBackup(), incoming: claimWrite("WRONG".padEnd(32, "X")), now: NOW }),
    { allowed: false, reason: "write-denied" },
    "C: 証明の ownerSecret が違えば拒否"
  );

  // ---- D. backupId だけ知っている他人 ----
  assertEqual(
    evaluateBackupWrite({ authUid: OTHER, existing: baseBackup(), incoming: ownerWrite(OTHER), now: NOW }),
    { allowed: false, reason: "write-denied" },
    "D: backupId だけでは書けない（ownerSecret を送れない）"
  );
  assertEqual(evaluateBackupRead({ authUid: OTHER, existing: baseBackup() }), false, "D: backupId だけでは読めない（ownerSecret を盗めない）");
  assertEqual(evaluateBackupRead({ authUid: OLD, existing: baseBackup() }), true, "D: 現在の持ち主は読める");
  assertEqual(evaluateBackupRead({ authUid: NEW, existing: baseBackup() }), false, "D: UIDが変わった端末も（回復前は）読めない＝所有権回復は書き込みだけで完結する設計");

  // ---- E. 他人が任意のUIDを指定 ----
  assertEqual(
    evaluateBackupWrite({
      authUid: NEW,
      existing: baseBackup(),
      incoming: claimWrite(SECRET, { previousUids: { [OTHER]: NOW } }),
      now: NOW,
    }),
    { allowed: false, reason: "previousUids-not-previous-owner" },
    "E: 正しい証明を持っていても、直前の持ち主以外のUIDを『自分の旧UID』として記録することはできない"
  );
  assertEqual(
    evaluateUidSupersessionWrite({ authUid: OTHER, oldUid: OLD, incoming: { newUid: OTHER, backupId: "b1", recordedAt: NOW }, backupsMap: { b1: baseBackup({ currentUid: NEW, previousUids: { [OLD]: NOW } }) } }),
    { allowed: false, reason: "not-current-owner" },
    "E: そのバックアップの持ち主でない人は対応表を作れない"
  );
  assertEqual(
    evaluateUidSupersessionWrite({ authUid: NEW, oldUid: OTHER, incoming: { newUid: NEW, backupId: "b1", recordedAt: NOW }, backupsMap: { b1: baseBackup({ currentUid: NEW, previousUids: { [OLD]: NOW } }) } }),
    { allowed: false, reason: "not-recorded-previous" },
    "E: previousUids に無いUIDを後継の対象にはできない"
  );
  assertEqual(
    evaluateUidSupersessionWrite({ authUid: NEW, oldUid: OLD, incoming: { newUid: OTHER, backupId: "b1", recordedAt: NOW }, backupsMap: { b1: baseBackup({ currentUid: NEW, previousUids: { [OLD]: NOW } }) } }),
    { allowed: false, reason: "newUid-mismatch" },
    "E: newUid に他人を指定した対応表は作れない"
  );
  assertEqual(evaluateSuccessorDelete({ authUid: OTHER, targetUid: OLD, uidSupersessionMap: { [OLD]: { newUid: NEW } } }), false, "E: 後継者でない人は旧UIDのプロフィール／ランキング／presenceを消せない");
  assertEqual(evaluateSuccessorDelete({ authUid: NEW, targetUid: OLD, uidSupersessionMap: { [OLD]: { newUid: NEW } }, isDelete: false }), false, "E: 後継者でも『書き換え』はできない（削除のみ）");
  assertEqual(evaluateSuccessorDelete({ authUid: NEW, targetUid: OLD, uidSupersessionMap: { [OLD]: { newUid: NEW } } }), true, "後継者は旧UIDのデータを削除できる");
  assertEqual(evaluateUidSupersessionRead(), false, "対応表は誰も読めない（backupId を含むため）");

  // ---- F. localStorage 完全消失（ownerSecret を送れない） ----
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: baseBackup(), incoming: ownerWrite(NEW), now: NOW }),
    { allowed: false, reason: "write-denied" },
    "F: ownerSecret を持たない新UIDは自動復旧できない（引き継ぎコード／復旧依頼の経路へ）"
  );

  // ---- G. 複数タブ・同時起動：古い previousUids の記録は拒否、所有権は壊れない ----
  const afterHeal = baseBackup({ currentUid: NEW, ownerSecret: NEW_SECRET, previousUids: { [OLD]: NOW } });
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: afterHeal, incoming: ownerWrite(NEW, { ownerSecret: NEW_SECRET, previousUids: { [OLD]: NOW + 1 } }), now: NOW + 1 }),
    { allowed: false, reason: "previousUids-not-previous-owner" },
    "G: 回復済みの後にもう1つのタブが同じ旧UIDを再記録しようとしても拒否される（旧UIDはもう直前の持ち主ではない）"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: afterHeal, incoming: ownerWrite(NEW, { ownerSecret: SECRET }), now: NOW + 1 }),
    { allowed: false, reason: "ownerSecret-change-not-allowed" },
    "G: 別タブに残った古い ownerSecret で上書きしようとしても拒否される（ownerSecret は claim／引き継ぎ／管理者でしか変えられない）"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: afterHeal, incoming: ownerWrite(NEW, { ownerSecret: NEW_SECRET }), now: NOW + 1 }),
    { allowed: true, reason: null },
    "G: 最新の ownerSecret を読み直した再試行は所有者として通る（所有権は壊れない）"
  );

  // ---- H. 既存ユーザーへの初回付与（ownerSecret がまだ無いバックアップ） ----
  const legacy = baseBackup({ ownerSecret: undefined });
  delete legacy.ownerSecret;
  assertEqual(
    evaluateBackupWrite({ authUid: OLD, existing: legacy, incoming: ownerWrite(OLD, { ownerSecret: SECRET }), now: NOW }),
    { allowed: true, reason: null },
    "H: ownerSecret がまだ無い既存バックアップへ、持ち主が初めて ownerSecret を付与できる"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: legacy, incoming: claimWrite(SECRET), now: NOW }),
    { allowed: false, reason: "write-denied" },
    "H: ownerSecret が無いバックアップは claim で取れない（旧世代の記録を勝手に乗っ取れない）"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: OLD, existing: baseBackup(), incoming: ownerWrite(OLD, { ownerSecret: SECRET }), now: NOW }),
    { allowed: true, reason: null },
    "H: 持ち主が同じ ownerSecret を毎回送っても許可（冪等）"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: OLD, existing: legacy, incoming: ownerWrite(OLD, { ownerSecret: "bad" }), now: NOW }),
    { allowed: false, reason: "invalid-ownerSecret" },
    "H: 短すぎる ownerSecret は持ち主でも保存できない"
  );

  // ---- I. 旧UIDにしか無いランキング記録は消さない ----
  assertEqual(planLeaderboardMerge({ clearTimeMs: 137030 }, null), "copyThenDeleteOld", "I: 旧にしか無い記録は『新へ複製してから旧を消す』（単純削除にならない）");
  assertEqual(planLeaderboardMerge({ clearTimeMs: 9630 }, { clearTimeMs: 10630 }), "copyThenDeleteOld", "I: 旧の方が速ければ旧の内容を新へ引き継ぐ");
  assertEqual(planLeaderboardMerge({ clearTimeMs: 13040 }, { clearTimeMs: 7410 }), "deleteOld", "I: 新の方が速ければ新を残して旧だけ整理");
  assertEqual(planLeaderboardMerge({ clearTimeMs: 10170 }, { clearTimeMs: 10170 }), "deleteOld", "I: 同一記録なら新UID側1件へ統合");
  assertEqual(planLeaderboardMerge(null, { clearTimeMs: 7410 }), "none", "I: 新にしか無い記録はそのまま");
  const copied = buildCopiedLeaderboardEntry(
    { displayName: "がしお", oshiMemberId: "noguchi-iori", clearTimeMs: 137030, missCount: 0, achievedAt: 123, rule: "loveChain", source: "timeAttack" },
    { displayName: "がしお", oshiMemberId: "noguchi-iori" }
  );
  assertEqual(copied, { displayName: "がしお", oshiMemberId: "noguchi-iori", clearTimeMs: 137030, missCount: 0, achievedAt: 123, rule: "loveChain", source: "timeAttack" }, "I: 複製はタイム・達成日時・ルール・出所をそのまま引き継ぐ（Rulesが受け付けるキーだけ）");

  // ---- J. 引き継ぎコード（transfer）は今までどおり ----
  const withTransfer = baseBackup({ transfer: { secret: "TRANSFER-SECRET-20CHARS!", createdAt: NOW - 10, expiresAt: NOW + 1000 } });
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: withTransfer, incoming: { currentUid: NEW, transfer: { secret: "TRANSFER-SECRET-20CHARS!", usedAt: NOW }, ownerSecret: NEW_SECRET }, now: NOW }),
    { allowed: true, reason: null },
    "J: 有効な引き継ぎコードなら所有権の移動と ownerSecret の差し替えが同時に許可される"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: baseBackup({ transfer: { secret: "S", expiresAt: NOW - 1 } }), incoming: { currentUid: NEW, transfer: { secret: "S", usedAt: NOW } }, now: NOW }),
    { allowed: false, reason: "write-denied" },
    "J: 期限切れの引き継ぎコードは拒否"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: NEW, existing: baseBackup({ transfer: { secret: "S", expiresAt: NOW + 1, usedAt: NOW - 5 } }), incoming: { currentUid: NEW, transfer: { secret: "S", usedAt: NOW } }, now: NOW }),
    { allowed: false, reason: "write-denied" },
    "J: 使用済みの引き継ぎコードは拒否"
  );

  // ---- K. 復旧依頼（管理者による書き換え） ----
  assertEqual(
    evaluateBackupWrite({ authUid: "adminUid", adminsMap: { adminUid: true }, existing: baseBackup(), incoming: { currentUid: NEW }, now: NOW }),
    { allowed: true, reason: null },
    "K: admins に登録された管理者は currentUid を新UIDへ書き換えられる（復旧依頼の承認）"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: "adminUid", adminsMap: { adminUid: true }, existing: baseBackup(), incoming: { currentUid: NEW, ownerSecret: NEW_SECRET }, now: NOW }),
    { allowed: true, reason: null },
    "K: 管理者は ownerSecret を差し替え（無効化）できる"
  );
  assertEqual(
    evaluateBackupWrite({ authUid: "notAdmin", adminsMap: { adminUid: true }, existing: baseBackup(), incoming: { currentUid: NEW }, now: NOW }),
    { allowed: false, reason: "write-denied" },
    "K: 管理者でなければ他人のバックアップを書き換えられない"
  );

  // ---- 端末側の保存（playerProfile.js） ----
  const player = getActivePlayer();
  // 端末側の保存は、前のテスト実行で残った値があると期待値がずれるため、先に消しておく
  localStorage.setItem("equalLoveIntroQuiz.players", JSON.stringify(getPlayers().map(({ ownerSecret, lastKnownUid, pendingUidMerge, ...rest }) => rest)));
  const s1 = getOrCreateOwnerSecret(player.playerId, () => SECRET);
  const s2 = getOrCreateOwnerSecret(player.playerId, () => "SHOULD-NOT-BE-USED-AGAIN-XXXXXXXXX");
  assertEqual(s1, SECRET, "H: 初回は生成関数の値が保存される");
  assertEqual(s2, SECRET, "H: 2回目以降は同じ値を返す（冪等・何度起動しても変わらない）");
  const rotated = rotateOwnerSecret(player.playerId, () => "ROTATEDROTATEDROTATEDROTATEDROTA");
  assertEqual(rotated, "ROTATEDROTATEDROTATEDROTATEDROTA", "引き継ぎ・復元後は ownerSecret を作り直せる");
  assertEqual(getOrCreateOwnerSecret(player.playerId, () => "X"), "ROTATEDROTATEDROTATEDROTATEDROTA", "作り直した値が以後使われる");
  assertEqual(getLastKnownUid(player.playerId) === null || typeof getLastKnownUid(player.playerId) === "string", true, "lastKnownUid は未設定なら null");
  setLastKnownUid(player.playerId, OLD);
  assertEqual(getLastKnownUid(player.playerId), OLD, "lastKnownUid を保存できる");
  setLastKnownUid(player.playerId, "");
  assertEqual(getLastKnownUid(player.playerId), OLD, "空文字では上書きしない");
  setPendingUidMerge(player.playerId, { oldUid: OLD, backupId: "b1" });
  assertEqual(getPendingUidMerge(player.playerId)?.oldUid, OLD, "確認待ちの旧UIDを保存できる");
  clearPendingUidMerge(player.playerId);
  assertEqual(getPendingUidMerge(player.playerId), null, "確認待ちを解除できる");
  // 後片付け（他のテストに影響させない）
  const players = getPlayers().map((p) => {
    const { ownerSecret, lastKnownUid, pendingUidMerge, ...rest } = p;
    return rest;
  });
  localStorage.setItem("equalLoveIntroQuiz.players", JSON.stringify(players));
}

export async function runBackupOwnershipRulesAndWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const rulesText = await fetchText("firebase/database.rules.json");
  const rules = JSON.parse(rulesText).rules;

  // ---- Rules：backups ----
  const backupWrite = rules.backups?.["$backupId"]?.[".write"] ?? "";
  assertEqual(backupWrite.includes("data.child('ownerSecret').isString() && data.child('ownerSecret').val().length >= 32 && newData.child('ownerClaim').child('secret').val() === data.child('ownerSecret').val() && newData.child('ownerClaim').child('at').val() === now && newData.child('ownerSecret').isString() && newData.child('ownerSecret').val() !== data.child('ownerSecret').val() && newData.child('currentUid').val() === auth.uid"), true, "Rules: backups の書き込みに claim 枝がある（証明の一致・サーバー時刻・ownerSecret の作り直し・自分のUID、の4条件）");
  assertEqual(rules.backups?.["$backupId"]?.ownerClaim?.["$other"]?.[".validate"], false, "Rules: ownerClaim の未知のキーは拒否");
  assertEqual((rules.backups?.["$backupId"]?.ownerSecret?.[".validate"] ?? "").includes("newData.val() === data.val() || newData.parent().child('ownerClaim').child('at').val() === now || newData.parent().child('transfer').child('usedAt').val() === now || root.child('admins').child(auth.uid).val() === true"), true, "Rules: 保存済み ownerSecret を変えられるのは claim／引き継ぎコード／管理者だけ");
  assertEqual(backupWrite.includes("data.child('currentUid').val() === auth.uid"), true, "Rules: 持ち主の枝は維持");
  assertEqual(backupWrite.includes("transfer/secret"), true, "Rules: 引き継ぎコードの枝は維持");
  assertEqual((rules.backups?.["$backupId"]?.ownerSecret?.[".validate"] ?? "").startsWith("!newData.exists() || (newData.isString() && newData.val().length >= 32 && newData.val().length <= 64"), true, "Rules: ownerSecret は32〜64文字の文字列のみ");
  assertEqual(rules.backups?.["$backupId"]?.previousUids?.["$previousUid"]?.[".validate"], "newData.isNumber() && $previousUid === root.child('backups').child($backupId).child('currentUid').val() && $previousUid !== auth.uid", "Rules: previousUids に記録できるのは書き込み直前の currentUid だけ");
  assertEqual(rules.backups?.["$backupId"]?.[".read"], "auth != null && data.child('currentUid').val() === auth.uid", "Rules: backups/{id} を読めるのは持ち主だけ（ownerSecret は他人に見えない）");
  assertEqual(rules.backups?.["$backupId"]?.["$other"]?.[".validate"], false, "Rules: backups の未知のキーは拒否のまま");

  // ---- Rules：uidSupersession ----
  const sup = rules.uidSupersession?.["$oldUid"];
  assertEqual(typeof sup, "object", "Rules: uidSupersession ノードがある");
  assertEqual(rules.uidSupersession?.[".read"], undefined, "Rules: uidSupersession は誰も読めない（ノード全体）");
  assertEqual(sup?.[".read"], undefined, "Rules: uidSupersession は誰も読めない（各エントリ）");
  assertEqual(sup?.[".write"], "auth != null && !data.exists() && $oldUid !== auth.uid && newData.child('newUid').val() === auth.uid && root.child('backups').child(newData.child('backupId').val()).child('currentUid').val() === auth.uid && root.child('backups').child(newData.child('backupId').val()).child('previousUids').child($oldUid).exists()", "Rules: 対応表は『そのbackupIdの現在の持ち主』が『previousUidsに記録済みの旧UID』についてだけ作れる");
  assertEqual(sup?.["$other"]?.[".validate"], false, "Rules: 対応表の未知のキーは拒否");

  // ---- Rules：後継者による削除 ----
  const succ = "(!newData.exists() && root.child('uidSupersession').child($uid).child('newUid').val() === auth.uid)";
  assertEqual(rules.publicProfiles?.["$uid"]?.[".write"]?.includes(succ), true, "Rules: publicProfiles/{旧UID} を後継者が削除できる（削除のみ）");
  assertEqual(rules.presence?.["$uid"]?.[".write"]?.includes(succ), true, "Rules: presence/{旧UID} を後継者が削除できる（削除のみ）");
  assertEqual(rules.timeAttackLeaderboardsV3?.["$variant"]?.["$questionCount"]?.["$category"]?.["$uid"]?.[".write"]?.includes(succ), true, "Rules: ランキングV3の旧UIDエントリを後継者が削除できる（削除のみ）");
  assertEqual(rules.timeAttackLeaderboardsV2?.["$variant"]?.["$rule"]?.["$questionCount"]?.["$category"]?.["$uid"]?.[".write"]?.includes(succ), false, "Rules: 旧世代ランキングV2は今回触らない");

  // ---- コード配線：js/backupSync.js ----
  const sync = await fetchText("js/backupSync.js");
  assertEqual(sync.includes("await update(ref(database, `backups/${backupId}`), buildWrites(attempt));"), true, "backupSync: 同期は update() で行い、claim→通常→従来形式の順に試す");
  assertEqual(sync.includes("writes.ownerClaim = { secret: ownerSecret, at: serverTimestamp() };"), true, "backupSync: claim では手元の ownerSecret を証明として送り、at にサーバー時刻を使う");
  assertEqual(sync.includes("writes.ownerSecret = rotatedOwnerSecret;"), true, "backupSync: claim では ownerSecret を作り直す");
  assertEqual(sync.includes("rotateOwnerSecret(player.playerId, () => rotatedOwnerSecret);"), true, "backupSync: claim 成功後に端末側の ownerSecret も新しい値へ更新する");
  assertEqual(sync.includes("await update(ref(database, `backups/${backupId}`), { ownerClaim: null });"), true, "backupSync: claim 成功直後に使い終わった ownerClaim を削除する");
  assertEqual(sync.includes("if (!legacy) writes.ownerClaim = null;"), true, "backupSync: 通常同期でも残った ownerClaim を消す（旧Rules向け従来形式では触らない）");
  assertEqual(sync.includes("const needsClaim = !legacyRulesDetected && previousUid !== null && detectedByLastKnownUid && isValidOwnerSecret(ownerSecret);"), true, "backupSync: claim は前回同期時のUIDとの不一致を検知したときだけ行う");
  const admin = await fetchText("js/backupAdmin.js");
  assertEqual(admin.includes("[`backups/${backupId}/ownerSecret`]: null,"), true, "backupAdmin: 復旧依頼の承認時に以前の端末の ownerSecret を無効化する");
  assertEqual(/await set\(ref\(database, `backups\/\$\{backupId\}`\)/.test(sync), false, "backupSync: backups/{id} 全体を set() で置き換える書き方は残っていない（transfer 等を消さない）");
  assertEqual(sync.includes("legacyRulesDetected = true;"), true, "backupSync: Rules未公開時は従来形式へフォールバックする");
  assertEqual(sync.includes("setLastKnownUid(player.playerId, uid);"), true, "backupSync: 同期成功後に lastKnownUid を更新する");
  assertEqual(sync.includes("setPendingUidMerge(player.playerId, { oldUid: recordedPreviousUid, backupId });"), true, "backupSync: 旧UIDを記録できたときだけ『確認待ち』を立てる");
  assertEqual(sync.includes("const recordedPreviousUid = applied.withPreviousUid ? previousUid : null;"), true, "backupSync: 実際に通った書き込みに旧UIDの記録が含まれていた場合だけ記録済みとみなす");
  assertEqual(sync.includes("[`backups/${backupId}/ownerSecret`]: claimedOwnerSecret"), true, "backupSync: 引き継ぎコード使用時に ownerSecret を差し替える");
  assertEqual(sync.includes("rotateOwnerSecret(player.playerId, generateOwnerSecret);"), true, "backupSync: 復元後に ownerSecret を作り直す");
  assertEqual(sync.includes("resolvePreviousUid(player.playerId, uid, backupId"), true, "backupSync: 旧UIDの解決（lastKnownUid → 管理者ならクラウドの currentUid）を行う");

  // ---- コード配線：uidSupersession.js / fanProfilesScreen.js ----
  const supSource = await fetchText("js/uidSupersession.js");
  assertEqual(supSource.includes('await remove(ref(database, `${path}/${plan.oldUid}`));'), true, "uidSupersession: 旧エントリの削除は複製の読み戻し確認の後だけ");
  assertEqual(supSource.indexOf("readBack.clearTimeMs !== copied.clearTimeMs") < supSource.indexOf('await remove(ref(database, `${path}/${plan.oldUid}`));'), true, "uidSupersession: 読み戻し確認 → 削除の順序");
  assertEqual(supSource.includes("saveMergeSnapshot(plan);"), true, "uidSupersession: 実行前に旧記録のスナップショットを端末へ保存する");
  const screen = await fetchText("js/fanProfilesScreen.js");
  assertEqual(screen.includes("handleUidMergeExecuteClick"), true, "fanProfilesScreen: 整理は本人がボタンを押したときだけ実行される");
  assertEqual(screen.includes("renderUidMergeCard();"), true, "fanProfilesScreen: 確認待ちがあるときだけ案内カードを表示する");
  const html = await fetchText("index.html");
  assertEqual(html.includes('id="fan-profiles-uid-merge-card"'), true, "index.html: 引き継ぎ案内カードがある");

  // ---- 自動テストでの匿名UID増殖防止（js/firebaseClient.js） ----
  const client = await fetchText("js/firebaseClient.js");
  assertEqual(client.includes(String.raw`/\/tests\.html$/.test(location.pathname)`), true, "firebaseClient: tests.html から読み込まれたかどうかを判定している");
  assertEqual(client.includes("if (IS_TEST_RUNNER) {") && client.indexOf("if (IS_TEST_RUNNER) {") < client.indexOf("signInAnonymously(auth)"), true, "firebaseClient: tests.html では signInAnonymously を呼ばない（本番アプリでは従来どおり呼ぶ）");
  const { auth: testAuth, IS_TEST_RUNNER } = await import("../js/firebaseClient.js");
  assertEqual(IS_TEST_RUNNER, true, "この tests.html 自身がテスト環境として判定されている");
  // 同じオリジンで以前に本番画面（index.html）を開いていた場合は、その時のユーザーがSDKにより復元される
  // （＝新規作成ではない）ため、ここでは「匿名ユーザーが居るとしても復元されたものか」だけを確認する。
  assertEqual(testAuth.currentUser === null || testAuth.currentUser.isAnonymous === true, true, "tests.html の実行中に新しい種類のログインは発生していない（既存の匿名セッションの復元のみ許容）");
}
