// 特別な称号の勲章を「その人の今の称号」で表示するための、共通の解決処理（2026-11-01 新設・本人の依頼 R8 の 4）。
//
// 【なぜ必要か（本人の勲章がランキングで出なかった原因）】
// ランキングの行の勲章は、以前は「記録のキー（記録を保存したときの匿名UID）」の公開プロフィール
// publicProfiles/{記録のUID} の真偽値だけで決めていた。ところが匿名UIDは端末の事情で変わることがあり
// （本人の場合は2回変わった）、前のIDのときに作った記録（例：8月15日の記録）は前のIDのキーのまま残る。
// 前のIDの公開プロフィールは、IDが変わった時点の古い写し（以後は更新されない）で、
// 「引き継いで整理する」を行うと消される。そのため、前のIDの記録の行では
//   ・前のIDのプロフィールが消えている → 勲章なし（普通の丸）
//   ・残っていても、IDが変わった後に取った称号は反映されない
// となり、フレンドの一覧（今のIDのプロフィール）やホーム（この端末の称号）と食い違っていた。
//
// 【この部品のやること（表示だけ）】
//   記録のUID → 今のUID（検証済みのつながりだけ：uidSupersession の対応表と、この端末が知っている自分の前のID）
//   → たどった全部のUIDの公開プロフィールの称号を合わせる（称号は一度取ったら失われないので「どれかで持っていれば持っている」）
//   → 行き着いた先が「今の自分」なら、この端末の称号（ホームの勲章と同じもの）も合わせる
// 本人キー（identityKey）や名前の一致ではつながない（他人が書き写せるため。ランキングの統合と同じ方針）。
// 称号の判定・獲得条件・保存データ・Firebase には一切書き込まない。
//
// このファイルの上半分は Firebase に触れない純粋関数（テストで直接確かめる）。
// 下の fetchDisplayBadgeStates は、読み取りの関数を引数で受け取る（画面側が Firebase の関数を渡す）。
// getOwnBadgeIdentity は、この端末の保存データ（localStorage）を読むだけ（書き込まない）。
import { getActivePlayer, getPendingUidMerge, getCompletedUidMerges, getLastKnownUid, getKnownOldUidsForPlayer } from "./playerProfile.js";
import { collectMyKnownOldUids } from "./fanProfilesIdentity.js";
import { getOshiBadgeState } from "./achievementProgress.js";

// 称号の取得状況が分からない・無いときの形（3つとも false）
export const EMPTY_BADGE_STATE = Object.freeze({
  hasNoMissMaster: false,
  hasEqualLoveMaster: false,
  hasEqualLoveComplete: false,
});

// 勲章に関わる称号の ID（js/achievementList.js の SPECIAL_BADGE_ACHIEVEMENT_IDS と同じ3つ）と、公開プロフィールの真偽値の名前
const BADGE_FLAG_BY_ACHIEVEMENT_ID = {
  no_miss_master: "hasNoMissMaster",
  equal_love_master: "hasEqualLoveMaster",
  equal_love_complete: "hasEqualLoveComplete",
};

// 公開プロフィールの生の値（または正規化済みの値）から、勲章の状態を作る。
// 真偽値（hasNoMissMaster など）が true か、取得済みの称号の一覧（unlockedAchievementIds）に入っていれば「持っている」。
// 古い形式のプロフィールで真偽値が欠けていても、一覧に入っていれば勲章を出す（判定の条件は変えず、保存済みの事実を読むだけ）。
export function badgeStateFromProfileValue(value) {
  if (!value || typeof value !== "object") return { ...EMPTY_BADGE_STATE };
  const ids = Array.isArray(value.unlockedAchievementIds) ? value.unlockedAchievementIds : [];
  const state = { ...EMPTY_BADGE_STATE };
  Object.entries(BADGE_FLAG_BY_ACHIEVEMENT_ID).forEach(([achievementId, flag]) => {
    state[flag] = value[flag] === true || ids.includes(achievementId);
  });
  return state;
}

// 複数の勲章の状態を合わせる（どれかで true なら true）。null・undefined は無視する。
export function mergeBadgeStates(...states) {
  const merged = { ...EMPTY_BADGE_STATE };
  states.forEach((state) => {
    if (!state || typeof state !== "object") return;
    Object.keys(merged).forEach((flag) => {
      if (state[flag] === true) merged[flag] = true;
    });
  });
  return merged;
}

// 記録のUIDから「今のUID」までのつながりをたどる。戻り値は [記録のUID, …, 今のUID]（つながりが無ければ [記録のUID]）。
//   ・この端末が知っている自分の前のID（ownPreviousUids）なら → 今の自分（selfUid）
//   ・uidSupersession の対応表（supersessionLinks：旧UID → 新UID）にあれば → 新UID
// 対応表が輪になっていても止まる（同じUIDは2度通らない）。たどる回数にも上限がある。
export function resolveBadgeIdentityChain(uid, { supersessionLinks = {}, selfUid = null, ownPreviousUids = [], maxHops = 8 } = {}) {
  if (typeof uid !== "string" || !uid) return [];
  const links = supersessionLinks && typeof supersessionLinks === "object" ? supersessionLinks : {};
  const ownOld = new Set(Array.isArray(ownPreviousUids) ? ownPreviousUids.filter((u) => typeof u === "string" && u) : []);
  const chain = [uid];
  const seen = new Set(chain);
  let current = uid;
  for (let hop = 0; hop < maxHops; hop += 1) {
    let next = null;
    if (selfUid && current !== selfUid && ownOld.has(current)) next = selfUid;
    else if (typeof links[current] === "string" && links[current]) next = links[current];
    if (!next || seen.has(next)) break;
    chain.push(next);
    seen.add(next);
    current = next;
  }
  return chain;
}

// 1つのUID（記録のUID・カードのUID）について、画面に出す勲章の状態を決める（純粋関数）。
//   badgeStateByUid：UID → 勲章の状態（Map または普通のオブジェクト。公開プロフィールから作ったもの）
//   ownLocalBadgeState：この端末の自分の称号（getOshiBadgeState() の値）。つながりの先が今の自分のときだけ合わせる
export function resolveDisplayBadgeState(
  uid,
  { badgeStateByUid = new Map(), supersessionLinks = {}, selfUid = null, ownPreviousUids = [], ownLocalBadgeState = null } = {}
) {
  const chain = resolveBadgeIdentityChain(uid, { supersessionLinks, selfUid, ownPreviousUids });
  const lookup = (u) => (badgeStateByUid instanceof Map ? badgeStateByUid.get(u) : badgeStateByUid?.[u]);
  const states = chain.map(lookup);
  const reachesSelf = Boolean(selfUid) && chain[chain.length - 1] === selfUid;
  if (reachesSelf && ownLocalBadgeState) states.push(ownLocalBadgeState);
  return mergeBadgeStates(...states);
}

// ランキングなど「UIDしか分からない一覧」用：必要な読み取りをしてから、UIDごとの表示用の勲章の状態を返す。
// 読み取りは引数で受け取る（画面側が Firebase の関数を渡す。テストでは偽の関数を渡す）。
//   fetchBadgeState(uid) → 勲章の状態（publicProfiles/{uid} を1件読む）
//   fetchSupersessionLinks(uids) → { 旧UID: 新UID }（読めない Rules のときは {} が返る）
// 失敗しても例外を出さず、分かった範囲で表示する（勲章が出ないだけで、一覧は壊れない）。
// 戻り値：Map（入力のUID → 勲章の状態）
export async function fetchDisplayBadgeStates(
  uids,
  { fetchBadgeState, fetchSupersessionLinks = null, selfUid = null, ownPreviousUids = [], ownLocalBadgeState = null, maxLinkRounds = 3 } = {}
) {
  const targets = [...new Set((Array.isArray(uids) ? uids : []).filter((u) => typeof u === "string" && u))];
  const ownOld = new Set(Array.isArray(ownPreviousUids) ? ownPreviousUids : []);

  // ① つながり（旧UID → 新UID）を読む。今の自分・この端末で分かる自分の前のIDは読まなくてよい。
  //   新UIDがさらに変わっている場合に備え、数回だけ先をたどる（回数に上限）。
  const supersessionLinks = {};
  if (typeof fetchSupersessionLinks === "function") {
    const asked = new Set();
    let toAsk = targets.filter((u) => u !== selfUid && !ownOld.has(u));
    for (let round = 0; round < maxLinkRounds && toAsk.length > 0; round += 1) {
      toAsk.forEach((u) => asked.add(u));
      let links = {};
      try {
        links = (await fetchSupersessionLinks(toAsk)) ?? {};
      } catch {
        links = {};
      }
      Object.entries(links).forEach(([oldUid, newUid]) => {
        if (typeof newUid === "string" && newUid) supersessionLinks[oldUid] = newUid;
      });
      toAsk = [...new Set(Object.values(links))].filter((u) => typeof u === "string" && u && u !== selfUid && !asked.has(u));
    }
  }

  // ② たどった先を含む全部のUIDの公開プロフィールを1件ずつ読む（同じUIDは1回だけ）
  const chainByUid = new Map(targets.map((u) => [u, resolveBadgeIdentityChain(u, { supersessionLinks, selfUid, ownPreviousUids })]));
  const allUids = [...new Set([...chainByUid.values()].flat())];
  const badgeStateByUid = new Map();
  await Promise.all(
    allUids.map(async (u) => {
      let state = null;
      try {
        state = typeof fetchBadgeState === "function" ? await fetchBadgeState(u) : null;
      } catch {
        state = null;
      }
      badgeStateByUid.set(u, state ? badgeStateFromProfileValue(state) : { ...EMPTY_BADGE_STATE });
    })
  );

  // ③ UIDごとに合わせる
  const result = new Map();
  targets.forEach((u) => {
    result.set(u, resolveDisplayBadgeState(u, { badgeStateByUid, supersessionLinks, selfUid, ownPreviousUids, ownLocalBadgeState }));
  });
  return result;
}

// 「今の自分」に関する材料をまとめて返す（ランキング・フレンドの一覧・プロフィールで同じものを使う）。
//   selfUid：今のUID／ownPreviousUids：この端末が知っている自分の前のID（フレンドの一覧と同じ集め方）／
//   ownLocalBadgeState：この端末の称号（ホームの勲章と同じ getOshiBadgeState()）
// 読み取りに失敗しても例外を出さない（前のIDが分からない・称号なし、として続ける）。
export function getOwnBadgeIdentity(selfUid) {
  let ownPreviousUids = [];
  let ownLocalBadgeState = null;
  try {
    const player = getActivePlayer();
    ownPreviousUids = collectMyKnownOldUids({
      currentUid: selfUid,
      pendingOldUid: getPendingUidMerge(player.playerId)?.oldUid ?? null,
      completedOldUids: getCompletedUidMerges(player.playerId),
      lastKnownUid: getLastKnownUid(player.playerId),
      queuedOldUids: getKnownOldUidsForPlayer(player.playerId, selfUid),
    });
  } catch {
    ownPreviousUids = [];
  }
  try {
    ownLocalBadgeState = getOshiBadgeState();
  } catch {
    ownLocalBadgeState = null;
  }
  return { selfUid: selfUid ?? null, ownPreviousUids, ownLocalBadgeState };
}
