// フレンド一覧の「同じプレイヤーの重複」と「同じ名前の別プレイヤー」を扱う純粋関数（2026-10-28新設）。
// Firebase・DOM・localStorage には一切触れない（tests/identityPresenceFix.test.js から直接検証するため）。
//
// 【背景（本人の実機報告）】フレンド一覧に「がしお」が2人（🟢オンラインと「4日前」）出ていた。
// 匿名UIDが変わると、旧UID名義の publicProfiles/{旧UID}・presence/{旧UID} が残るため。
// 既存の引き継ぎ（js/uidSupersession.js）が完了すれば旧プロフィールは消えるが、完了するまで・
// 失敗したまま・UIDが2回以上変わって旧UIDの確認待ちが上書きされた場合などは並んで見えていた。
//
// 【同一人物とみなす「強い証拠」だけを使う（本人指示：表示名が同じだけでは絶対にまとめない）】
//   ① identityKey が一致する（backupId の SHA-256。js/timeAttackLeaderboard.js の computeLeaderboardIdentityKey。
//      同じバックアップ＝同じプレイヤーからしか同じ値は生まれない。UID には依存しない）
//   ② 見ている本人の端末が「自分の旧UID」だと知っている（pendingUidMerge.oldUid・completedUidMerges・
//      lastKnownUid。いずれも ownerSecret による所有権確認を通った結果だけが端末に残る）
// どちらも「削除」ではなく「表示しない（まとめる）」だけ。Firebase 上のデータは一切変えない。
//
// 【限界（報告書にも記載）】identityKey は公開プロフィールに載っている値なので、悪意ある利用者が他人の
// identityKey を自分のプロフィールへ書き写すことはできる（Rules は形式しか検査しない）。その場合でも
// 「自分のカードが他人のカードの裏にまとめられる」だけで、データの削除・なりすまし書き込みは起きない。
// 自分自身（myUid）のカードは常に代表になり、他人の書き写しで隠されることはない。

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

// 同一人物の重複をまとめる（純粋関数）。
// profiles: normalizePublicProfileEntry() 済みの配列（uid, displayName, identityKey, updatedAt …）
// options:
//   myUid: 今の自分のUID
//   myKnownOldUids: 端末が知っている「自分の旧UID」の配列
//   presenceRankByUid: { [uid]: { online: boolean, lastSeen: number } }（代表選びにだけ使う）
//   keepHiddenForAdmin: true なら隠さずに残し、duplicateOfUid を付ける（管理者が旧IDを確認・削除できるように）
// 戻り値：{ profiles: 表示する配列（代表に mergedUids を付与）, hidden: [{ uid, primaryUid, reason }] }
export function collapseSamePlayerProfiles(profiles, options = {}) {
  const { myUid = null, myKnownOldUids = [], presenceRankByUid = {}, keepHiddenForAdmin = false } = options;
  const list = Array.isArray(profiles) ? profiles.filter((p) => p && typeof p.uid === "string") : [];
  const myOldUidSet = new Set((myKnownOldUids ?? []).filter((uid) => typeof uid === "string" && uid && uid !== myUid));
  const hasMyCurrentProfile = list.some((p) => p.uid === myUid);

  // まず「同じ人のグループ」を作る（union-find の代わりに、代表キーで束ねる簡易版）
  const groupKeyByUid = new Map();
  list.forEach((p) => {
    groupKeyByUid.set(p.uid, isUsableIdentityKey(p.identityKey) ? `key:${p.identityKey}` : `uid:${p.uid}`);
  });
  // ② 自分の旧UID：自分の今のプロフィールが一覧にあるときだけ、自分のグループへ入れる
  //    （今のプロフィールがまだ無いうちは、旧UIDのカードが「自分を表す唯一のカード」なので隠さない）
  if (myUid && hasMyCurrentProfile) {
    const myGroupKey = groupKeyByUid.get(myUid);
    list.forEach((p) => {
      if (myOldUidSet.has(p.uid)) {
        const oldKey = groupKeyByUid.get(p.uid);
        // 旧UIDと同じ identityKey を持つ他のカードもまとめて自分のグループへ寄せる
        list.forEach((q) => {
          if (groupKeyByUid.get(q.uid) === oldKey) groupKeyByUid.set(q.uid, myGroupKey);
        });
      }
    });
  }

  const groups = new Map();
  list.forEach((p) => {
    const key = groupKeyByUid.get(p.uid);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });

  const visible = [];
  const hidden = [];
  groups.forEach((group) => {
    if (group.length === 1) {
      visible.push(group[0]);
      return;
    }
    const primary = pickPrimary(group, { myUid, presenceRankByUid });
    const others = group.filter((p) => p !== primary);
    const reasonOf = (p) => (myOldUidSet.has(p.uid) ? "my-old-uid" : "same-identity-key");
    visible.push({ ...primary, mergedUids: others.map((p) => p.uid) });
    others.forEach((p) => {
      const entry = { uid: p.uid, primaryUid: primary.uid, reason: reasonOf(p) };
      hidden.push(entry);
      if (keepHiddenForAdmin) visible.push({ ...p, duplicateOfUid: primary.uid, duplicateReason: entry.reason });
    });
  });

  // 入力の順番を保つ（並び替えは呼び出し側の sortProfiles／sortProfilesByPresence に任せる）
  const order = new Map(list.map((p, index) => [p.uid, index]));
  visible.sort((a, b) => order.get(a.uid) - order.get(b.uid));
  return { profiles: visible, hidden };
}

// 「同じ表示名の別プレイヤー」に印を付ける（純粋関数）。まとめた後の一覧に対して使う。
// 同じ名前が2件以上あるカードにだけ sameNameSuffix（UID末尾4文字）を付ける。名前だけでは絶対にまとめない。
export function annotateSameNameProfiles(profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  const counts = new Map();
  list.forEach((p) => {
    if (p.duplicateOfUid) return; // 管理者向けに残した旧IDカードは数えない
    const key = normalizeDisplayNameForCompare(p.displayName);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return list.map((p) => {
    const key = normalizeDisplayNameForCompare(p.displayName);
    if (!p.duplicateOfUid && (counts.get(key) ?? 0) >= 2) return { ...p, sameNameSuffix: shortUidSuffix(p.uid) };
    return p;
  });
}

// カードに出す補足文（純粋関数）。null なら何も出さない。
export function buildProfileIdentityNote(profile, { myUid = null } = {}) {
  if (!profile) return null;
  if (profile.duplicateOfUid) {
    return `以前のID（#${shortUidSuffix(profile.uid)}）：#${shortUidSuffix(profile.duplicateOfUid)} と同じプレイヤー（管理者のみ表示）`;
  }
  if (profile.sameNameSuffix) {
    const isMe = myUid !== null && profile.uid === myUid;
    return isMe ? `#${profile.sameNameSuffix}（あなた）・同じ名前の別プレイヤーがいます` : `#${profile.sameNameSuffix}・同じ名前の別プレイヤー`;
  }
  return null;
}

// 端末が知っている「自分の旧UID」をまとめる（純粋関数）。プレイヤーごとの記録（所有権確認を通った結果）だけを使う。
// 【認証履歴は使わない】同じ端末の複数プレイヤーは同じ匿名UIDを共有するため、端末の認証履歴（js/firebaseClient.js）
// にある旧UIDが「今のプレイヤー本人」のものとは限らない（別プレイヤーの公開プロフィールだった可能性がある）。
export function collectMyKnownOldUids({ currentUid = null, pendingOldUid = null, completedOldUids = [], lastKnownUid = null } = {}) {
  const set = new Set();
  [pendingOldUid, lastKnownUid, ...(completedOldUids ?? [])].forEach((uid) => {
    if (typeof uid === "string" && uid && uid !== currentUid) set.add(uid);
  });
  return [...set];
}
