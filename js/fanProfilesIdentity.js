// フレンド一覧の「同じプレイヤーの重複」と「同じ名前の別プレイヤー」を扱う純粋関数（2026-10-28新設）。
// Firebase・DOM・localStorage には一切触れない（tests/identityPresenceFix.test.js・tests/accountPermanentFix.test.js から直接検証するため）。
//
// 【背景（本人の実機報告）】フレンド一覧に「がしお」が2人（🟢オンラインと「4日前」）出ていた。
// 匿名UIDが変わると、旧UID名義の publicProfiles/{旧UID}・presence/{旧UID} が残るため。
// 既存の引き継ぎ（js/uidSupersession.js）が完了すれば旧プロフィールは消えるが、完了するまで・
// 失敗したまま・UIDが2回以上変わった場合などは並んで見えていた。
//
// 【同一人物とみなす「強い証拠」だけを使う（本人指示：表示名が同じだけでは絶対にまとめない）】
// 【2026-10-28改訂（恒久対策）：identityKey の一致だけではまとめない】
//   identityKey（backupId の SHA-256）は公開プロフィールに載っている値なので、誰でも自分のプロフィールへ
//   書き写せる（Rules は形式しか検査しない）。一致だけでまとめると「書き写した人のカードの裏に、本物の人のカードが
//   隠れる」ことが起こりうる。そこで、カードを隠すのは次の「改ざんできない証拠」があるときだけにした：
//   ① 見ている本人の端末が「自分の旧UID」だと知っている（整理待ちの列・整理済み・lastKnownUid。
//      いずれも ownerSecret による所有権確認を通った結果だけが端末に残る）
//   ② uidSupersession/{旧UID}/newUid が一覧にいる新しいUIDを指している（この対応表は、そのバックアップの現在の
//      持ち主が ownerSecret で所有権を証明し、previousUids に旧UIDが Rules の検証つきで記録された場合しか作れない）。
//      ※ 今の本番 Rules では対応表をアプリから読めないため、読めない間は②は使われない（安全側：隠さない）。
//        読めるようにする提案は firebase/database.rules.proposed.json（報告書参照）。
//   identityKey と表示名の両方が同じカードは、隠さずに「以前のIDかもしれません（未確認）」と補足するだけにする。
// どちらも「削除」ではなく「表示しない（まとめる）」だけ。Firebase 上のデータは一切変えない。
//
// 【限界（報告書にも記載）】②が使えない今の本番 Rules では、友だちの画面に本人の旧IDのカードが残ることがある
// （本人の端末が旧IDの整理を済ませれば、旧カード自体が消えるので解消する）。

// 表示名の比較用（前後の空白を除き、全角・半角の違いを NFKC でそろえる）。
export function normalizeDisplayNameForCompare(name) {
  if (typeof name !== "string") return "";
  return name.normalize("NFKC").trim().toLowerCase();
}

// UIDの末尾4文字（「同じ名前の別プレイヤー」を見分ける短い印）。UID全体は出さない。
export function shortUidSuffix(uid) {
  if (typeof uid !== "string" || uid.length === 0) return "";
  return uid.slice(-4);
}

function isUsableIdentityKey(key) {
  return typeof key === "string" && key.length >= 16 && key.length <= 64;
}

// 代表カードを選ぶ順番：自分 → オンライン中 → 最終接続が新しい → プロフィール更新が新しい → UID順（安定化）
function pickPrimary(group, { myUid, presenceRankByUid }) {
  const mine = group.find((p) => p.uid === myUid);
  if (mine) return mine;
  return [...group].sort((a, b) => {
    const ra = presenceRankByUid?.[a.uid] ?? { online: false, lastSeen: -Infinity };
    const rb = presenceRankByUid?.[b.uid] ?? { online: false, lastSeen: -Infinity };
    if (ra.online !== rb.online) return ra.online ? -1 : 1;
    if (ra.lastSeen !== rb.lastSeen) return rb.lastSeen - ra.lastSeen;
    const ua = typeof a.updatedAt === "number" ? a.updatedAt : -Infinity;
    const ub = typeof b.updatedAt === "number" ? b.updatedAt : -Infinity;
    if (ua !== ub) return ub - ua;
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
  })[0];
}

// uidSupersession の対応（旧UID → 新UID）を、一覧にいる「最新のUID」までたどる（最大5段。輪になっていても止まる）。
export function resolveSupersessionTarget(uid, links, presentUids) {
  let current = uid;
  let resolved = null;
  const visited = new Set([uid]);
  for (let hop = 0; hop < 5; hop += 1) {
    const next = links?.[current];
    if (typeof next !== "string" || !next || visited.has(next)) break;
    visited.add(next);
    current = next;
    if (presentUids.has(current)) resolved = current;
  }
  return resolved;
}

// 同一人物の重複をまとめる（純粋関数）。
// profiles: normalizePublicProfileEntry() 済みの配列（uid, displayName, identityKey, updatedAt …）
// options:
//   myUid: 今の自分のUID
//   myKnownOldUids: 端末が知っている「自分の旧UID」の配列（強い証拠①）
//   supersessionLinks: { [旧UID]: 新UID }（uidSupersession から読めた対応。強い証拠②。読めなければ {}）
//   presenceRankByUid: { [uid]: { online: boolean, lastSeen: number } }（代表選びにだけ使う）
//   keepHiddenForAdmin: true なら隠さずに残し、duplicateOfUid を付ける（管理者が旧IDを確認・削除できるように）
// 戻り値：{ profiles: 表示する配列（代表に mergedUids を付与）, hidden: [{ uid, primaryUid, reason }] }
//   reason: "my-old-uid"（強い証拠①）／"superseded"（強い証拠②）
export function collapseSamePlayerProfiles(profiles, options = {}) {
  const { myUid = null, myKnownOldUids = [], supersessionLinks = {}, presenceRankByUid = {}, keepHiddenForAdmin = false } = options;
  const list = Array.isArray(profiles) ? profiles.filter((p) => p && typeof p.uid === "string") : [];
  const myOldUidSet = new Set((myKnownOldUids ?? []).filter((uid) => typeof uid === "string" && uid && uid !== myUid));
  const presentUids = new Set(list.map((p) => p.uid));
  const hasMyCurrentProfile = myUid !== null && presentUids.has(myUid);

  // 旧UID → 代表UID（強い証拠があるものだけ）
  const primaryByUid = new Map();
  const reasonByUid = new Map();
  list.forEach((p) => {
    if (p.uid === myUid) return;
    // ① 自分の旧UID：自分の今のプロフィールが一覧にあるときだけ（今のプロフィールがまだ無いうちは、旧UIDのカードが
    //    「自分を表す唯一のカード」なので隠さない）
    if (hasMyCurrentProfile && myOldUidSet.has(p.uid)) {
      primaryByUid.set(p.uid, myUid);
      reasonByUid.set(p.uid, "my-old-uid");
      return;
    }
    // ② 対応表（uidSupersession）が一覧にいる新しいUIDを指している
    const target = resolveSupersessionTarget(p.uid, supersessionLinks, presentUids);
    if (target && target !== p.uid) {
      primaryByUid.set(p.uid, target);
      reasonByUid.set(p.uid, "superseded");
    }
  });
  // 代表がさらに誰かの旧UIDなら、最終の代表へ寄せる（輪になっていても止まる）
  const finalPrimary = (uid) => {
    let current = uid;
    const seen = new Set();
    while (primaryByUid.has(current) && !seen.has(current)) {
      seen.add(current);
      current = primaryByUid.get(current);
    }
    return current;
  };

  const hidden = [];
  const mergedByPrimary = new Map();
  list.forEach((p) => {
    if (!primaryByUid.has(p.uid)) return;
    const primaryUid = finalPrimary(p.uid);
    if (primaryUid === p.uid || !presentUids.has(primaryUid)) return;
    hidden.push({ uid: p.uid, primaryUid, reason: reasonByUid.get(p.uid) });
    if (!mergedByPrimary.has(primaryUid)) mergedByPrimary.set(primaryUid, []);
    mergedByPrimary.get(primaryUid).push(p.uid);
  });
  const hiddenByUid = new Map(hidden.map((h) => [h.uid, h]));
  const visible = [];
  list.forEach((p) => {
    const h = hiddenByUid.get(p.uid);
    if (h) {
      if (keepHiddenForAdmin) visible.push({ ...p, duplicateOfUid: h.primaryUid, duplicateReason: h.reason });
      return;
    }
    const merged = mergedByPrimary.get(p.uid);
    visible.push(merged ? { ...p, mergedUids: merged } : p);
  });

  // 【未確認の一致】identityKey も表示名も同じカードが複数残っているとき、代表でない方に補足を付ける（隠さない）。
  const groups = new Map();
  visible.forEach((p) => {
    if (p.duplicateOfUid || !isUsableIdentityKey(p.identityKey)) return;
    const key = `${p.identityKey}|${normalizeDisplayNameForCompare(p.displayName)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  const unverifiedByUid = new Map();
  groups.forEach((group) => {
    if (group.length < 2) return;
    const primary = pickPrimary(group, { myUid, presenceRankByUid });
    group.forEach((p) => {
      if (p !== primary && p.uid !== myUid) unverifiedByUid.set(p.uid, primary.uid);
    });
  });
  // 【2026-10-31追加】代表カードの側にも「未確認の以前のIDらしいカード」があることを記録する（表示の補足だけに使う）
  const candidatesByPrimary = new Map();
  unverifiedByUid.forEach((primaryUid, uid) => {
    if (!candidatesByPrimary.has(primaryUid)) candidatesByPrimary.set(primaryUid, []);
    candidatesByPrimary.get(primaryUid).push(uid);
  });
  return {
    profiles: visible.map((p) => {
      if (unverifiedByUid.has(p.uid)) return { ...p, unverifiedSameAsUid: unverifiedByUid.get(p.uid) };
      if (candidatesByPrimary.has(p.uid)) return { ...p, unverifiedOldUids: candidatesByPrimary.get(p.uid) };
      return p;
    }),
    hidden,
  };
}

// ---------------------------------------------------------------------------
// 【2026-10-31追加・本人の実機報告（フレンドに「がしお #Gr72」と「がしお #PWW2」の2行）】
// ---------------------------------------------------------------------------
// 同じUIDのカードは1枚だけにする（純粋関数）。publicProfiles は UID がキーなので本来は重複しないが、
// 将来の取得経路の追加・再描画の重なりで同じ UID が2回渡されても、行が増えないようにする安全弁。
// 同じ UID が複数あれば、updatedAt が新しい方を残す（同じなら先に来た方）。並び順は最初に現れた位置のまま。
export function dedupeProfilesByUid(profiles) {
  const list = Array.isArray(profiles) ? profiles.filter((p) => p && typeof p.uid === "string" && p.uid) : [];
  const indexByUid = new Map();
  const result = [];
  list.forEach((p) => {
    if (!indexByUid.has(p.uid)) {
      indexByUid.set(p.uid, result.length);
      result.push(p);
      return;
    }
    const index = indexByUid.get(p.uid);
    const kept = result[index];
    const keptAt = typeof kept.updatedAt === "number" ? kept.updatedAt : -Infinity;
    const nextAt = typeof p.updatedAt === "number" ? p.updatedAt : -Infinity;
    if (nextAt > keptAt) result[index] = p;
  });
  return result;
}

// カードと「見ている人」の関係（純粋関数）。表示の出し分け（補足・「一緒に遊ぶ」の有無）にだけ使う。
//   "me"                 … 今の自分のカード
//   "my-old-verified"    … 自分の以前のID（端末の所有権確認、または対応表で確かめた）。管理者にだけ残るカード
//   "old-verified"       … 他の人の以前のID（対応表で確かめた）。管理者にだけ残るカード
//   "my-old-candidate"   … 自分の以前のIDかもしれない（本人キーと名前が同じだけ。未確認）
//   "old-candidate"      … 他の人の以前のIDかもしれない（同上。未確認）
//   "other"              … 別の人（名前が同じでも、確かめられない限りここ）
// 表示名だけでは "other" 以外にしない（本人キー＋名前の一致は「未確認」、まとめる・隠すのは確かめた場合だけ）。
export function classifyProfileRelation(profile, { myUid = null } = {}) {
  if (!profile || typeof profile.uid !== "string") return "other";
  if (myUid !== null && profile.uid === myUid) return "me";
  if (profile.duplicateOfUid) {
    return profile.duplicateReason === "my-old-uid" || (myUid !== null && profile.duplicateOfUid === myUid) ? "my-old-verified" : "old-verified";
  }
  if (profile.unverifiedSameAsUid) {
    return myUid !== null && profile.unverifiedSameAsUid === myUid ? "my-old-candidate" : "old-candidate";
  }
  return "other";
}

// 【2026-10-31追加】カードの名前の横に付ける小さな札（純粋関数）。null なら付けない。
//   未確認（本人キーと名前が同じだけ）→「以前のID？」／確かめた以前のID（管理者のみ表示）→「以前のID（確認済み）」
export function buildProfileIdentityBadgeText(relation) {
  if (relation === "my-old-candidate" || relation === "old-candidate") return "以前のID？";
  if (relation === "my-old-verified" || relation === "old-verified") return "以前のID（確認済み）";
  return null;
}

// 「一緒に遊ぶ」を出してよい相手か（純粋関数）。自分自身・自分の以前のID（確かめた／らしい）には出さない。
export function canInviteProfile(profile, { myUid = null } = {}) {
  const relation = classifyProfileRelation(profile, { myUid });
  return relation !== "me" && relation !== "my-old-verified" && relation !== "my-old-candidate";
}

// 「同じ表示名の別プレイヤー」に印を付ける（純粋関数）。まとめた後の一覧に対して使う。
// 同じ名前が2件以上あるカードにだけ sameNameSuffix（UID末尾4文字）を付ける。名前だけでは絶対にまとめない。
export function annotateSameNameProfiles(profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  const counts = new Map();
  // 【2026-10-31改訂】「以前のIDかもしれない（未確認）」のカードも数えない。そのカードには専用の補足が付くため、
  // 代表カード（本人の今のカードなど）に「同じ名前の別プレイヤーがいます」と誤って出さない（本人の実機報告）。
  const isCounted = (p) => !p.duplicateOfUid && !p.unverifiedSameAsUid;
  list.forEach((p) => {
    if (!isCounted(p)) return;
    const key = normalizeDisplayNameForCompare(p.displayName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return list.map((p) => {
    const key = normalizeDisplayNameForCompare(p.displayName);
    if (isCounted(p) && (counts.get(key) ?? 0) >= 2) return { ...p, sameNameSuffix: shortUidSuffix(p.uid) };
    return p;
  });
}

// カードに出す補足文（純粋関数）。null なら何も出さない。
export function buildProfileIdentityNote(profile, { myUid = null } = {}) {
  if (!profile) return null;
  if (profile.duplicateOfUid) {
    return `以前のID（#${shortUidSuffix(profile.uid)}）：#${shortUidSuffix(profile.duplicateOfUid)} と同じプレイヤー（管理者のみ表示）`;
  }
  // 【2026-10-28追加】本人キーと名前が同じだが、改ざんできない証拠が無いカード（隠さない）
  if (profile.unverifiedSameAsUid) {
    // 【2026-10-31】見ている本人の以前のIDらしいときは「あなたの」と書く（本人が他人と取り違えないように）
    if (myUid !== null && profile.unverifiedSameAsUid === myUid) {
      return `#${shortUidSuffix(profile.uid)}・あなたの以前のIDかもしれません（未確認）`;
    }
    return `#${shortUidSuffix(profile.uid)}・#${shortUidSuffix(profile.unverifiedSameAsUid)} の以前のIDかもしれません（未確認）`;
  }
  const isMe = myUid !== null && profile.uid === myUid;
  if (profile.sameNameSuffix) {
    return isMe ? `#${profile.sameNameSuffix}（あなた）・同じ名前の別プレイヤーがいます` : `#${profile.sameNameSuffix}・同じ名前の別プレイヤー`;
  }
  // 【2026-10-31】自分のカードの下に「以前のIDらしいカード」があるときは、どちらが今の自分かを示す
  if (isMe && Array.isArray(profile.unverifiedOldUids) && profile.unverifiedOldUids.length > 0) {
    return `#${shortUidSuffix(profile.uid)}（あなた・今のID）`;
  }
  return null;
}

// 端末が知っている「自分の旧UID」をまとめる（純粋関数）。プレイヤーごとの記録（所有権確認を通った結果）だけを使う。
// 【認証履歴は使わない】同じ端末の複数プレイヤーは同じ匿名UIDを共有するため、端末の認証履歴（js/firebaseClient.js）
// にある旧UIDが「今のプレイヤー本人」のものとは限らない（別プレイヤーの公開プロフィールだった可能性がある）。
// 【2026-10-28】queuedOldUids（整理待ちの列にある旧UID全部）も受け取る。
export function collectMyKnownOldUids({ currentUid = null, pendingOldUid = null, completedOldUids = [], lastKnownUid = null, queuedOldUids = [] } = {}) {
  const set = new Set();
  [pendingOldUid, lastKnownUid, ...(completedOldUids ?? []), ...(queuedOldUids ?? [])].forEach((uid) => {
    if (typeof uid === "string" && uid && uid !== currentUid) set.add(uid);
  });
  return [...set];
}

// 【2026-10-28追加】uidSupersession を読みに行く候補（＝同じ本人キーのカードが他にもあるUID）だけを選ぶ（読み取りを最小にする）。
export function selectSupersessionLookupCandidates(profiles, { myUid = null, maxCount = 20 } = {}) {
  const list = Array.isArray(profiles) ? profiles.filter((p) => p && typeof p.uid === "string") : [];
  const countByKey = new Map();
  list.forEach((p) => {
    if (isUsableIdentityKey(p.identityKey)) countByKey.set(p.identityKey, (countByKey.get(p.identityKey) ?? 0) + 1);
  });
  return list
    .filter((p) => p.uid !== myUid && isUsableIdentityKey(p.identityKey) && countByKey.get(p.identityKey) >= 2)
    .map((p) => p.uid)
    .slice(0, maxCount);
}

// 【2026-10-29追加・本人指示「同じ名前の別人を誤って削除しないように」】管理者の削除確認に出す「対象の見分け方」（純粋関数）。
// 名前だけで消す相手を決めないよう、ID（全体）・区分・称号の数を並べる。今の自分自身（myUid）は消せないようにする
// （自分の公開をやめたいときは、公開設定のOFFを使う）。権限そのものは Firebase Rules が決める（ここは表示と誤操作の防止だけ）。
export function describeAdminDeleteTarget(profile, { myUid = null, myKnownOldUids = [], sameNameCount = 1, oshiName = null } = {}) {
  if (!profile || typeof profile.uid !== "string" || !profile.uid) {
    return { allowed: false, reason: "削除する相手を特定できません", kind: "unknown", lines: [] };
  }
  const isMe = myUid !== null && profile.uid === myUid;
  let kind;
  if (isMe) kind = "あなた（今のID）";
  else if (profile.duplicateOfUid) kind = `以前のID：#${shortUidSuffix(profile.duplicateOfUid)} と同じプレイヤー`;
  else if ((myKnownOldUids ?? []).includes(profile.uid)) kind = "あなたの以前のID（この端末で所有を確認済み）";
  else if (sameNameCount >= 2) kind = `ほかのプレイヤー（同じ名前のカードが ${sameNameCount}件あります。IDで確かめてください）`;
  else kind = "ほかのプレイヤー";
  const titles = Array.isArray(profile.unlockedAchievementIds) ? profile.unlockedAchievementIds.length : 0;
  const lines = [`ID：${profile.uid}`, `区分：${kind}`, `推し：${oshiName ?? "未設定"}・称号 ${titles}個`];
  if (isMe) {
    return { allowed: false, reason: "今のあなた自身の公開プロフィールは、ここからは削除できません（公開設定をOFFにしてください）", kind: "me", lines };
  }
  return { allowed: true, reason: null, kind: profile.duplicateOfUid || (myKnownOldUids ?? []).includes(profile.uid) ? "my-old" : "other", lines };
}
