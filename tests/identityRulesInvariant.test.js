// 【2026-09-22 第11回・本人指示】サーバー側防波堤（Firebase Rules の identityKey 不変条件）の回帰テスト。
// A〜L：古いクライアント（本人確認の関門を知らない v346 以前）が、UID差し替え後に identityKey 無しで
// 新UID名義の記録／公開プロフィールを作ろうとしても拒否されること。legacy データは壊さないこと。
import {
  evaluateIdentityKeyInvariant,
  evaluateLeaderboardV3Write,
  evaluatePublicProfileWrite,
  evaluateIdentityNodeRead,
  applyUpdate,
} from "../js/identityRules.js";
import { buildPublicProfilePayload, normalizePublicProfileEntry } from "../js/publicProfilePayloads.js";
import { buildLeaderboardEntryPayload, resolveLeaderboardWritePlan, normalizeLeaderboardEntry, dedupeLeaderboardEntriesByIdentity, sortLeaderboardEntries } from "../js/timeAttackLeaderboard.js";
import { assertEqual } from "./test-utils.js";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const ADMINS = { "admin-uid": true };
const baseRecord = (extra = {}) => ({ displayName: "じゅ", clearTimeMs: 8114, missCount: 0, achievedAt: 1, ...extra });

export function runIdentityRulesInvariantTests() {
  // ---- A. v346相当：新UID＋identityKeyあり → 新規保存OK ----
  assertEqual(
    evaluateLeaderboardV3Write({ authUid: "uid-new", targetUid: "uid-new", existing: null, incoming: baseRecord({ identityKey: KEY_A }) }),
    { allowed: true, reason: null },
    "A: 最新クライアント（identityKey あり）は新UIDで新規保存できる"
  );
  const payload = buildLeaderboardEntryPayload({ displayName: "じゅ", oshiMemberId: null, clearTimeMs: 8114, missCount: 0, rule: null, source: "normal", achievedAt: 1, actualQuestionCount: 5, identityKey: KEY_A });
  assertEqual(evaluateLeaderboardV3Write({ authUid: "uid-new", targetUid: "uid-new", existing: null, incoming: payload }).allowed, true, "A: 実際の payload 組み立て結果も通る");

  // ---- B／J. 旧クライアント相当：新UID＋identityKeyなし → 新規保存DENY ----
  assertEqual(
    evaluateLeaderboardV3Write({ authUid: "uid-new", targetUid: "uid-new", existing: null, incoming: baseRecord() }),
    { allowed: false, reason: "identityKey-required-on-create" },
    "B/J: 古いクライアントが新UID名義で identityKey 無しの記録を作ろうとすると拒否（Firebase側で二重登録を作れない）"
  );
  const legacyPayload = buildLeaderboardEntryPayload({ displayName: "じゅ", oshiMemberId: null, clearTimeMs: 8114, missCount: 0, rule: null, source: "normal", achievedAt: 1, actualQuestionCount: 5 });
  assertEqual("identityKey" in legacyPayload, false, "B: 旧クライアントの payload には identityKey が無い（再現）");
  assertEqual(evaluateLeaderboardV3Write({ authUid: "uid-new", targetUid: "uid-new", existing: null, incoming: legacyPayload }).allowed, false, "J: その payload の新規作成は拒否される");

  // ---- C. 既存 legacy record（identityKey なし）→ 読み取り可能 ----
  assertEqual(evaluateIdentityNodeRead({ authUid: "anyone" }), { allowed: true, reason: null }, "C: legacy 記録も認証済みなら読める（.read は変えていない）");
  assertEqual(normalizeLeaderboardEntry("uid-legacy", baseRecord()).identityKey, null, "C: legacy 記録は identityKey null として読める");

  // ---- D. 既存 legacy record の管理者削除 → OK ----
  assertEqual(
    evaluateLeaderboardV3Write({ authUid: "admin-uid", targetUid: "uid-legacy", adminsMap: ADMINS, existing: baseRecord(), incoming: null }),
    { allowed: true, reason: null },
    "D: 管理者は legacy 記録を削除できる（削除は .validate の対象外）"
  );
  assertEqual(
    evaluateLeaderboardV3Write({ authUid: "uid-new", targetUid: "uid-old", supersessionMap: { "uid-old": { newUid: "uid-new" } }, existing: baseRecord(), incoming: null }),
    { allowed: true, reason: null },
    "D: 後継者（uidSupersession）も旧UIDの legacy 記録を削除できる"
  );
  assertEqual(evaluateLeaderboardV3Write({ authUid: "admin-uid", targetUid: "uid-legacy", adminsMap: ADMINS, existing: baseRecord(), incoming: baseRecord({ identityKey: KEY_A }) }).allowed, false, "D: 管理者でも他人名義で set はできない（従来どおり）");

  // ---- E. 既存 legacy record を最新クライアントが安全に backfill → 既存仕様どおり ----
  {
    const existing = baseRecord();
    const plan = resolveLeaderboardWritePlan({ existingEntry: normalizeLeaderboardEntry("uid-me", existing), candidate: { clearTimeMs: 8114, missCount: 0, actualQuestionCount: 5 }, identityKey: KEY_A });
    assertEqual(plan, { action: "update", fields: { actualQuestionCount: 5, identityKey: KEY_A } }, "E: 同タイム再送信で identityKey と actualQuestionCount を後追い付与する計画");
    const after = applyUpdate(existing, plan.fields);
    assertEqual(evaluateLeaderboardV3Write({ authUid: "uid-me", targetUid: "uid-me", existing, incoming: after }), { allowed: true, reason: null }, "E: legacy 記録への後追い付与は許可される");
    // legacy 記録に identityKey 以外だけを update する（旧クライアントの actualQuestionCount 後追い）も許可
    assertEqual(evaluateLeaderboardV3Write({ authUid: "uid-me", targetUid: "uid-me", existing, incoming: applyUpdate(existing, { actualQuestionCount: 5 }) }).allowed, true, "E: legacy 記録の identityKey 以外の update は旧クライアントでも通る（legacy を壊さない）");
    // 旧クライアントが legacy 記録を set() で丸ごと置き換える（新記録）：既存に identityKey が無いので通る（重複は作らない）
    assertEqual(evaluateLeaderboardV3Write({ authUid: "uid-me", targetUid: "uid-me", existing, incoming: baseRecord({ clearTimeMs: 7000 }) }).allowed, true, "E: 旧クライアントが自分の legacy 記録を更新するのは許可（同じUID＝二重登録ではない）");
  }

  // ---- identityKey を持つ記録から identityKey を消す書き込みは拒否 ----
  {
    const keyed = baseRecord({ identityKey: KEY_A });
    assertEqual(evaluateLeaderboardV3Write({ authUid: "uid-me", targetUid: "uid-me", existing: keyed, incoming: baseRecord({ clearTimeMs: 7000 }) }), { allowed: false, reason: "identityKey-removal-forbidden" }, "本人キー付きの記録を、旧クライアントの set() でキー無しに戻すことはできない");
    assertEqual(evaluateLeaderboardV3Write({ authUid: "uid-me", targetUid: "uid-me", existing: keyed, incoming: applyUpdate(keyed, { actualQuestionCount: 10 }) }).allowed, true, "update() はキーを保つので通る");
    assertEqual(evaluateLeaderboardV3Write({ authUid: "uid-me", targetUid: "uid-me", existing: keyed, incoming: baseRecord({ clearTimeMs: 7000, identityKey: KEY_B }) }).allowed, true, "同じ端末の別プレイヤー（別 backupId）がキーを差し替えるのは許可（キーの削除だけ禁止）");
    assertEqual(evaluateIdentityKeyInvariant({ existing: null, incoming: baseRecord({ identityKey: "short" }) }).reason, "identityKey-invalid", "16文字未満のキーは不正");
  }

  // ---- F／G. 本人キーを作れない／Rules に拒否 → キー無しで強行保存しない（構造テストは runIdentityRulesWiringTests） ----
  //   ここでは「キー無しの payload は新規作成で必ず拒否される」ことで、退避が無いことの意味を固定する
  assertEqual(evaluateIdentityKeyInvariant({ existing: null, incoming: baseRecord() }).allowed, false, "F/G: キー無しの新規レコードは Rules が拒否する＝クライアントが退避しても保存されない");

  // ---- H. 同名別人・別 identityKey → 両方存在可能 ----
  {
    const store = new Map();
    const write = (uid, record) => {
      const verdict = evaluateLeaderboardV3Write({ authUid: uid, targetUid: uid, existing: store.get(uid) ?? null, incoming: record });
      if (verdict.allowed) store.set(uid, record);
      return verdict.allowed;
    };
    assertEqual(write("uid-1", baseRecord({ displayName: "サブ", clearTimeMs: 9862, identityKey: KEY_A })), true, "H: 1人目の保存");
    assertEqual(write("uid-2", baseRecord({ displayName: "サブ", clearTimeMs: 9862, identityKey: KEY_B })), true, "H: 同名・同タイム・別キーの2人目も保存できる");
    const entries = [...store.entries()].map(([uid, raw]) => normalizeLeaderboardEntry(uid, raw));
    assertEqual(dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries(entries)).length, 2, "H: 表示でも別人として2人残る");

    // ---- I. 同 identityKey で UID 変更 → 最新クライアントでは引き継ぎ後に1人（表示統合＋旧削除） ----
    assertEqual(write("uid-old", baseRecord({ clearTimeMs: 8114, identityKey: KEY_A })), true, "I: 旧UIDの記録");
    assertEqual(write("uid-new", baseRecord({ clearTimeMs: 8114, identityKey: KEY_A })), true, "I: 新UIDの記録（同じ本人キー）");
    const both = ["uid-old", "uid-new"].map((uid) => normalizeLeaderboardEntry(uid, store.get(uid)));
    assertEqual(dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries(both)).length, 1, "I: 同じ本人キーは表示で1人");
    const successorDelete = evaluateLeaderboardV3Write({ authUid: "uid-new", targetUid: "uid-old", supersessionMap: { "uid-old": { newUid: "uid-new" } }, existing: store.get("uid-old"), incoming: null });
    assertEqual(successorDelete.allowed, true, "I: 引き継ぎで旧UIDの記録を後継者が削除できる → 保存先も1件");
  }

  // ---- K／L. publicProfiles ----
  {
    const profile = buildPublicProfilePayload({ playerName: "じゅ", oshiMemberId: null, achievementsSnapshot: [], oshiBadgeState: { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false }, identityKey: KEY_A });
    assertEqual(profile.identityKey, KEY_A, "K: 最新クライアントの公開プロフィールには identityKey が入る");
    assertEqual(evaluatePublicProfileWrite({ authUid: "uid-new", targetUid: "uid-new", existing: null, incoming: profile }), { allowed: true, reason: null }, "K: 最新クライアントは新UIDで公開プロフィールを作れる");
    const legacyProfile = buildPublicProfilePayload({ playerName: "じゅ", oshiMemberId: null, achievementsSnapshot: [], oshiBadgeState: { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false } });
    assertEqual("identityKey" in legacyProfile, false, "K: 旧クライアントの payload にはキーが無い（再現）");
    assertEqual(evaluatePublicProfileWrite({ authUid: "uid-new", targetUid: "uid-new", existing: null, incoming: legacyProfile }), { allowed: false, reason: "identityKey-required-on-create" }, "K: 旧クライアントが新UID名義で公開プロフィールを作るのは拒否（フレンド一覧の二重化を Firebase 側で防ぐ）");
    // L. 既存 legacy プロフィールは壊さない：旧クライアントの更新も、最新クライアントの後追い付与も通る
    assertEqual(evaluatePublicProfileWrite({ authUid: "uid-legacy", targetUid: "uid-legacy", existing: legacyProfile, incoming: { ...legacyProfile, displayName: "改名" } }).allowed, true, "L: 旧クライアントが自分の legacy プロフィールを更新できる");
    assertEqual(evaluatePublicProfileWrite({ authUid: "uid-legacy", targetUid: "uid-legacy", existing: legacyProfile, incoming: profile }).allowed, true, "L: 最新クライアントが legacy プロフィールにキーを付けて上書きできる");
    assertEqual(evaluatePublicProfileWrite({ authUid: "uid-legacy", targetUid: "uid-legacy", existing: profile, incoming: legacyProfile }).allowed, false, "L: キー付きプロフィールをキー無しに戻す書き込みは拒否");
    assertEqual(evaluatePublicProfileWrite({ authUid: "admin-uid", targetUid: "uid-legacy", adminsMap: ADMINS, existing: legacyProfile, incoming: null }).allowed, true, "L: 管理者は legacy プロフィールを削除できる");
    assertEqual(evaluatePublicProfileWrite({ authUid: "uid-new", targetUid: "uid-old", supersessionMap: { "uid-old": { newUid: "uid-new" } }, existing: legacyProfile, incoming: null }).allowed, true, "L: 後継者も旧プロフィールを削除できる");
    assertEqual(evaluateIdentityNodeRead({ authUid: "anyone" }).allowed, true, "L: legacy プロフィールは読める");
    assertEqual(normalizePublicProfileEntry("u", legacyProfile).identityKey, null, "L: 正規化：キー無しは null");
    assertEqual(normalizePublicProfileEntry("u", profile).identityKey, KEY_A, "正規化：キーを保持");
  }
}

// Rules ファイル本体と、クライアント配線の構造テスト。
export async function runIdentityRulesWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const rules = JSON.parse(await fetchText("firebase/database.rules.json")).rules;

  const v3 = rules.timeAttackLeaderboardsV3?.["$variant"]?.["$questionCount"]?.["$category"]?.["$uid"];
  assertEqual(
    v3?.[".validate"],
    "newData.hasChildren(['displayName','clearTimeMs','missCount','achievedAt']) && (data.exists() ? (!data.hasChild('identityKey') || newData.hasChild('identityKey')) : newData.hasChild('identityKey'))",
    "Rules: ランキングV3は『新規作成には identityKey 必須・既存の identityKey は消せない・legacy の更新は可』"
  );
  assertEqual(v3?.identityKey?.[".validate"], "newData.isString() && newData.val().length >= 16 && newData.val().length <= 64", "Rules: identityKey は16〜64文字の文字列");
  assertEqual(rules.timeAttackLeaderboardsV3?.["$variant"]?.["$questionCount"]?.["$category"]?.[".read"], "auth != null", "Rules: 読み取り条件は変えていない（legacy も読める）");
  assertEqual(v3?.[".write"]?.includes("(root.child('admins').child(auth.uid).val() === true && !newData.exists())"), true, "Rules: 管理者削除は従来どおり");

  const profile = rules.publicProfiles?.["$uid"];
  assertEqual(profile?.[".validate"], "data.exists() ? (!data.hasChild('identityKey') || newData.hasChild('identityKey')) : newData.hasChild('identityKey')", "Rules: publicProfiles も新規作成には identityKey 必須（legacy は壊さない）");
  assertEqual(profile?.identityKey?.[".validate"], "newData.isString() && newData.val().length >= 16 && newData.val().length <= 64", "Rules: publicProfiles の identityKey 形式");
  assertEqual(rules.publicProfiles?.[".read"], "auth != null", "Rules: publicProfiles の読み取りは変えていない");
  assertEqual(rules.presence?.["$uid"]?.[".write"]?.includes("root.child('publicProfiles/' + $uid).exists()"), true, "Rules: presence はプロフィールが無いと書けない（旧クライアントの新UID presence も結果的に止まる）");

  const sync = await fetchText("js/timeAttackLeaderboardSync.js");
  assertEqual(sync.includes('if (!identityKey) return { ok: false, reason: "identity-key-unavailable" };'), true, "sync: F. 本人キーを作れなければクラウドへ書かない（候補はローカルに残る）");
  assertEqual(sync.includes('return { ok: false, reason: "rules-rejected" };'), true, "sync: G. Rules 拒否時もキー無しで強行しない");
  assertEqual(sync.includes("writeWithIdentityKeyFallback") || sync.includes("identityKeyRejectedByRules"), false, "sync: キー無し退避は撤去済み");
  const candidateBody = sync.slice(sync.indexOf("export async function syncRankingCandidatesToFirebase("));
  assertEqual(candidateBody.includes("localStorage.removeItem") || candidateBody.includes("removeRankingCandidate") || candidateBody.includes("clearRankingCandidate"), false, "sync: 送信結果によってローカルの候補（rankingCandidateBest）を消す処理は無い（失敗分は次の機会に再送信）");

  const profileSync = await fetchText("js/publicProfileSync.js");
  assertEqual(profileSync.includes("const identityKey = await computeLeaderboardIdentityKey(getOrCreateBackupId(getActivePlayer().playerId));") && profileSync.includes("if (!identityKey) return false;"), true, "publicProfileSync: 本人キーを付けて公開、作れなければ公開しない");
  assertEqual(profileSync.includes("buildPublicProfilePayload({ ...collectCurrentProfileMaterials(), identityKey })"), true, "publicProfileSync: payload に identityKey を渡す");

  const supersession = await fetchText("js/uidSupersession.js");
  assertEqual(supersession.includes("const copied = { ...buildCopiedLeaderboardEntry(oldEntry, { displayName, oshiMemberId }), identityKey };"), true, "uidSupersession: 自動引き継ぎの複製にも identityKey を付ける（新規記録の Rules を満たす）");
  assertEqual(supersession.includes("const identityKey = await computeLeaderboardIdentityKey(getBackupId(player.playerId));"), true, "uidSupersession: 手動引き継ぎの複製にも identityKey を付ける");

  const sw = await fetchText("sw.js");
  assertEqual(sw.includes('"./js/identityRules.js"'), true, "sw.js: identityRules.js が APP_SHELL に登録されている");
}
