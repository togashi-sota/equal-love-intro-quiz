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
  update,
  remove,
  query,
  orderByChild,
  startAt,
  limitToFirst,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { getActivePlayer, getOrCreateBackupId } from "./playerProfile.js";
import { getMostOshiMemberId } from "./oshiMembers.js";
import { isPublicProfileSharingEnabled } from "./publicProfilePayloads.js";
import { getTimeAttackHistoryEntries } from "./timeAttackHistory.js";
import { getAllRankingCandidateBests } from "./rankingCandidateStore.js";
import {
  buildLeaderboardPath,
  buildLeaderboardEntryPayload,
  resolveLeaderboardWritePlan,
  normalizeLeaderboardEntry,
  collectUniqueTopEntries,
  findBestEntryPerVariantQuestionCountAndCategory,
  isValidLeaderboardCandidate,
  isSupportedLeaderboardDimension,
  computeLeaderboardIdentityKey,
  LEADERBOARD_TOP_FETCH_LIMIT,
} from "./timeAttackLeaderboard.js";
import { autoMergeSupersededLeaderboardEntries } from "./uidSupersession.js";
import { ensureIdentityBootstrap, canAutoSyncToCloud } from "./identityBootstrap.js";

// 【2026-09-22追加：本人確認の関門（js/identityBootstrap.js）】クラウドへ自分名義で書く前に必ず通す。
// 関門が ready（本人確認済み・旧UIDの引き継ぎ済み）のときだけ true。pending／migrating／unresolved なら false。
async function isIdentityReadyForCloudWrite() {
  const state = await ensureIdentityBootstrap();
  return canAutoSyncToCloud(state);
}

// 【2026-09-22追加：論理ユーザー識別キー（js/timeAttackLeaderboard.js の説明参照）】
// 現在のプレイヤーの backupId から identityKey を求める。backupId は UID が変わっても・バックアップを
// 復元しても同じ値が引き継がれるため、「同じ人」の印として使える。求められない環境では null
// （記録にキーを付けないだけで、送信自体は従来どおり行う）。
async function resolveMyIdentityKey() {
  try {
    const player = getActivePlayer();
    const backupId = getOrCreateBackupId(player.playerId);
    return await computeLeaderboardIdentityKey(backupId);
  } catch {
    return null;
  }
}

// 【2026-09-22 第11回・本人指示】identityKey 無しの退避（第7回で入れた「Rules に拒否されたらキー無しで保存」）は撤去した。
// 本人キーの無い記録は「別人として二重登録される」方向の退避になるため、キーを作れない／Rules に拒否された
// ときはクラウドへ書かず、候補をローカル（js/rankingCandidateStore.js）に残して次の機会に再送信する。
// 「ランキングに載らない」方が「同じ人が2人になる」より安全（Rules 側でも新規記録は identityKey 必須にしている）。
function isPermissionDenied(error) {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return /PERMISSION_DENIED|permission_denied|permission-denied/i.test(`${code} ${message}`);
}

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
// 【2026-08-16再改訂・本人指示】タイムアタックだけでなく、通常のイントロクイズ・通常の
// ランダム再生クイズからも呼ばれる共通の送信口になった（sourceで呼び出し元を区別して記録する
// だけで、掲載条件・比較ロジックは完全に同じものを使う＝本人指示の「同じランキング実装を
// 再利用する」を満たす）。出題数（5/10/20/50/全曲）・カテゴリー（表題曲のみ/表題曲＋全員曲/
// 全曲）とも、既存クイズの全ラジオボタン値がそのまま対象。isSupportedLeaderboardDimension()は
// 万が一の不正な値の混入を防ぐ最終防衛線として残している。
// 戻り値: { ok: true, updated: boolean } または
// { ok: false, reason: "privacy-disabled" | "offline" | "error" | "invalid-record" | "unsupported-dimension" }
export async function submitTimeAttackScoreIfBetter({
  variant,
  rule,
  source,
  questionCountValue,
  categoryFilterValue,
  clearTimeMs,
  missCount,
  playerKeyPrefix,
  actualQuestionCount,
}) {
  if (!isSupportedLeaderboardDimension(questionCountValue, categoryFilterValue)) {
    return { ok: false, reason: "unsupported-dimension" };
  }
  if (!isValidLeaderboardCandidate({ clearTimeMs, missCount })) {
    return { ok: false, reason: "invalid-record" };
  }
  if (!isPublicProfileSharingEnabled(playerKeyPrefix)) {
    return { ok: false, reason: "privacy-disabled" };
  }
  if (isOffline()) {
    return { ok: false, reason: "offline" };
  }
  // 【2026-09-22追加：本人確認の関門】UIDが変わった直後（旧UID名義の記録がまだ残っている／持ち主確認が
  // 取れていない）に「新UID名義」で書くと重複を作るため、関門が ready になるまで一切書かない。
  // 記録はローカルの候補（js/rankingCandidateStore.js）に残っているので、ready 後の自動同期で送られる。
  if (!(await isIdentityReadyForCloudWrite())) {
    return { ok: false, reason: "identity-not-ready" };
  }

  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return { ok: false, reason: "error" };

    const entryPath = `${buildLeaderboardPath(variant, questionCountValue, categoryFilterValue)}/${uid}`;
    const existingSnapshot = await get(ref(database, entryPath));
    const existingEntry = existingSnapshot.exists()
      ? normalizeLeaderboardEntry(uid, existingSnapshot.val())
      : null;

    // 【2026-09-22改訂】「set／欠けた項目だけupdate／何もしない」の判断を純粋関数
    // resolveLeaderboardWritePlan() に集約した（js/timeAttackLeaderboard.js）。
    // キーは常に自分のUID・push() は使わないため、同じ結果保存が何度呼ばれても記録は1件のまま。
    // 【2026-08-29、本人指示】タイム・ミス数は同じ（＝新記録ではない）でも、既存記録に
    // actualQuestionCount／identityKey が欠けていて今回分かる場合は、その項目だけ後から書き足す
    // （登録日時・タイムなど他の項目は一切変更しない）。
    // 【第11回】本人キーを作れない環境では書かない（候補はローカルに残り、後で再送信される）
    const identityKey = await resolveMyIdentityKey();
    if (!identityKey) return { ok: false, reason: "identity-key-unavailable" };
    const plan = resolveLeaderboardWritePlan({
      existingEntry,
      candidate: { clearTimeMs, missCount, actualQuestionCount },
      identityKey,
    });
    if (plan.action === "none") return { ok: true, updated: false };
    if (plan.action === "update") {
      await update(ref(database, entryPath), plan.fields);
      return { ok: true, updated: true };
    }

    const activePlayer = getActivePlayer();
    const payload = buildLeaderboardEntryPayload({
      displayName: activePlayer.playerName,
      oshiMemberId: getMostOshiMemberId(),
      clearTimeMs,
      missCount,
      rule,
      source,
      achievedAt: serverTimestamp(),
      actualQuestionCount,
      identityKey,
    });
    await set(ref(database, entryPath), payload);
    return { ok: true, updated: true };
  } catch (error) {
    if (isPermissionDenied(error)) {
      // Rules に拒否された（設定の食い違い等）。キー無しで強行はせず、候補をローカルに残す。
      console.warn("タイムアタックランキングへの送信が Firebase Rules に拒否されました（キー無しでは保存しません。ローカルの記録には影響ありません）", error);
      return { ok: false, reason: "rules-rejected" };
    }
    console.warn("タイムアタックランキングへの送信に失敗しました（ローカルの記録には影響ありません）", error);
    return { ok: false, reason: "error" };
  }
}

// TOP10を取得する。サーバー側のquery（orderByChild+limitToFirst）で絞り込むため、
// 全記録をダウンロードすることはない。
// 【2026-09-22改訂】同じ identityKey（同一人物）の記録は最良の1件に統合してから TOP10 にする
// （第二の防衛線。旧UIDの記録が残っていても画面上で同じ人が2人並ばない）。統合で件数が減っても
// 10件を保てるよう、LEADERBOARD_TOP_FETCH_LIMIT 件だけ多めに取得する。名前では統合しない。
// 戻り値: { ok: true, entries: [...] }（0件でも成功扱い） または { ok: false, entries: [], reason }
export async function fetchTimeAttackLeaderboardTop10(variant, questionCountValue, categoryFilterValue) {
  if (isOffline()) {
    return { ok: false, entries: [], reason: "offline" };
  }

  try {
    await authReady;
    const divisionRef = ref(database, buildLeaderboardPath(variant, questionCountValue, categoryFilterValue));
    // 【2026-09-22改訂：ページ取得】同一人物（identityKey）の重複が上位に何件あっても、存在する限り正しい
    // ユニークTOP10を返すため、「ユニークが10人そろうか、データが尽きるまで」次のページを取りに行く
    // （js/timeAttackLeaderboard.js collectUniqueTopEntries）。1ページは LEADERBOARD_TOP_FETCH_LIMIT 件、
    // ページ数には上限があり（LEADERBOARD_TOP_MAX_PAGES）、無限取得にはならない。
    // 次ページの起点は「最後の記録の clearTimeMs とキー（UID）」（startAt(value, key)）。同じ記録が
    // 先頭に重なって返るため、1件多く取って重なりを捨てる。順序は snapshot.forEach で保つ（val() は順序を失う）。
    const fetchPage = async (cursor) => {
      const constraints = [orderByChild("clearTimeMs")];
      if (cursor) constraints.push(startAt(cursor.clearTimeMs, cursor.uid));
      constraints.push(limitToFirst(LEADERBOARD_TOP_FETCH_LIMIT + (cursor ? 1 : 0)));
      const snapshot = await get(query(divisionRef, ...constraints));
      const ordered = [];
      snapshot.forEach((child) => {
        ordered.push({ uid: child.key, raw: child.val() });
      });
      const page = cursor && ordered[0]?.uid === cursor.uid ? ordered.slice(1) : ordered;
      const entries = page.map(({ uid, raw }) => normalizeLeaderboardEntry(uid, raw)).filter((entry) => entry !== null);
      const last = page[page.length - 1];
      const hasMore = page.length >= LEADERBOARD_TOP_FETCH_LIMIT && last && Number.isFinite(Number(last.raw?.clearTimeMs));
      return { entries, nextCursor: hasMore ? { clearTimeMs: Number(last.raw.clearTimeMs), uid: last.uid } : null };
    };
    const entries = await collectUniqueTopEntries(fetchPage);
    return { ok: true, entries };
  } catch (error) {
    console.warn("タイムアタックランキングの取得に失敗しました", error);
    return { ok: false, entries: [], reason: "error" };
  }
}

function buildBackfillFlagKey(playerKeyPrefix) {
  // 【2026-08-16再改訂】パス構造・対象次元がさらに変わったため（rule区分の廃止、出題数/
  // カテゴリーの絞り込み）、旧フラグ（〜BackfilledV2）とは別名にし、既存ユーザーでも
  // 新条件で一度だけ改めてバックフィルが走るようにする（旧フラグはそのまま残るが無害・無視される）。
  // 【2026-08-29再改訂】submitTimeAttackScoreIfBetter側にactualQuestionCountの後追い
  // 補完（needsActualQuestionCountBackfill）を追加したため、すでにV3フラグが立っている
  // 端末でも、この新しいロジックの恩恵を受けられるようもう一度だけ実行し直す。
  return `equalLoveIntroQuiz.${playerKeyPrefix}timeAttackLeaderboardBackfilledV4`;
}

// 「フレンド」を新たにONにした人・すでにONだった人の両方に対応する、
// 既存のローカル自己ベストをランキングへ一度だけ反映する処理（2026-08-07追加、本人指示。
// 2026-08-16にルールを問わず統合する形へ再改訂）。
// 通常の新記録時の送信（submitTimeAttackScoreIfBetter、renderTimeAttackResult経由）は
// 「今まさに更新した記録」しか送らないため、それより前に貯まっていた自己ベストは
// このままでは永久にランキングに反映されない。そのズレを一度だけ解消するための処理。
// プレイヤーごとにlocalStorageのフラグで多重実行を防ぐ（毎回スタート画面へ戻るたびに
// 全件送信し直すような無駄な通信をしないため）。
// 【本人指示】通常クイズは今まで所要時間を記録していなかったため、バックフィル対象の
// 履歴データが存在しない＝この処理は今までどおりタイムアタック履歴だけを対象にする。
export async function backfillTimeAttackLeaderboardIfNeeded(playerKeyPrefix) {
  if (!isPublicProfileSharingEnabled(playerKeyPrefix)) return;
  if (isOffline()) return; // オフライン時はフラグを立てず、次回オンライン時に再試行できるようにする
  // 【2026-09-22追加】本人確認の関門が ready になるまでは、過去の自己ベストを（別UID名義で）一括送信しない。
  // フラグも立てないので、ready になった後の起動で改めて実行される。
  if (!(await isIdentityReadyForCloudWrite())) return;

  const flagKey = buildBackfillFlagKey(playerKeyPrefix);
  try {
    if (localStorage.getItem(flagKey) === "true") return;
  } catch {
    return; // localStorageが使えない環境では、多重実行防止ができないため何もしない
  }

  try {
    const historyEntries = getTimeAttackHistoryEntries();
    const bestEntries = findBestEntryPerVariantQuestionCountAndCategory(historyEntries);
    // 【QAで発見・修正：2026-09-07】このループにtry/catchが無く、1件でも不正な形の
    // データ（bestEntriesの1件がnull・型違い等）が混じると例外でループ全体が止まり、
    // その後のlocalStorage.setItem(flagKey, "true")にも到達しないため、次回起動時も
    // 同じ地点で必ず失敗し、それより後ろの自己ベストが永久にランキングへ反映されない
    // 不具合があった（js/timeAttackLeaderboardSync.jsの
    // syncRankingCandidatesToFirebase()で見つかったのと同じ不具合の形）。1件ずつ
    // 独立させ、フラグは全件を試行し終えた後に必ず立てる。
    for (const best of bestEntries) {
      if (!best || typeof best !== "object") continue;
      try {
        await submitTimeAttackScoreIfBetter({ ...best, playerKeyPrefix });
      } catch (error) {
        console.warn("タイムアタック自己ベストの1件だけ反映に失敗しました（他の自己ベストの反映は続行します）", error);
      }
    }
    localStorage.setItem(flagKey, "true");
  } catch (error) {
    console.warn("タイムアタック自己ベストのランキング反映に失敗しました", error);
  }
}

// 管理者専用：ランキングの特定の1件だけを削除する（2026-08-17追加）。
// 【安全設計】呼び出し側（js/timeAttackLeaderboardScreen.js）が事前にresolveIsAdminUser()で管理者であることを
// 確認したうえでだけ呼ぶ想定。js/publicProfileSync.jsのdeletePublicProfileByAdminと同じ
// 設計思想で、本当の権限チェックはFirebase Security Rules側で行う必要がある。
// 削除対象はvariant×questionCountValue×categoryFilterValue×targetUidで一意に決まる
// 1件の記録だけ。他の記録・他のFirebaseパス・本人の端末内データには一切触れない。
export async function deleteLeaderboardEntryByAdmin(variant, questionCountValue, categoryFilterValue, targetUid) {
  await authReady;
  const entryPath = `${buildLeaderboardPath(variant, questionCountValue, categoryFilterValue)}/${targetUid}`;
  await remove(ref(database, entryPath));
}

// 自分の記録だけを1件、軽量に取得する（TOP10圏外でも「あなたの記録」を表示するため）。
// 戻り値: { ok: true, entry: {...} | null } または { ok: false, entry: null }
export async function fetchMyTimeAttackLeaderboardEntry(variant, questionCountValue, categoryFilterValue) {
  if (isOffline()) {
    return { ok: false, entry: null };
  }

  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return { ok: true, entry: null };

    const entryPath = `${buildLeaderboardPath(variant, questionCountValue, categoryFilterValue)}/${uid}`;
    const snapshot = await get(ref(database, entryPath));
    const entry = snapshot.exists() ? normalizeLeaderboardEntry(uid, snapshot.val()) : null;
    return { ok: true, entry, uid, identityKey: await resolveMyIdentityKey() };
  } catch (error) {
    console.warn("あなたのタイムアタック記録の取得に失敗しました", error);
    return { ok: false, entry: null };
  }
}

// 【2026-08-16新設、本人指示】「フレンド」の公開設定をOFF→ONへ切り替えた瞬間に、
// OFF中でもランキング条件を満たしてローカルに貯まっていた自己ベスト
// （js/rankingCandidateStore.js）を、まとめてFirebaseへ同期する。
//
// 【設計】比較・上書き判定は、通常の新記録時の送信と全く同じsubmitTimeAttackScoreIfBetter()を
// そのまま再利用する（本人指示：「既存のupsert-bestロジックがあるなら再利用してください」）。
// これにより、「Firebase側の記録の方が速ければ何もしない・ローカルの方が速ければ更新する」
// という比較も、対応外の次元（カテゴリー等）を弾く処理も、二重実装せずに済む。
//
// 【呼び出しタイミング、本人指示】①公開設定をOFF→ONへ切り替えた瞬間、②公開ON状態のまま
// ランキング画面を開いたとき（js/timeAttackLeaderboardScreen.jsのshowTimeAttackLeaderboard参照）
// の2箇所から呼ぶ想定。後者は「オフライン等で同期に失敗した記録を、安全なタイミングで
// 再試行する」ための機会も兼ねる（本人指示：過剰なリトライループは作らない。あくまで
// 既存の画面遷移に便乗するだけで、新しいポーリング・タイマーは一切追加しない）。
//
// 【失敗時】オフライン・書き込み失敗のときも、ローカルの候補データ自体は一切削除しない
// （rankingCandidateStore.js側は「読むだけ」で、この関数からは何も削除しない設計にしている）。
// 次にこの関数が呼ばれた機会に、同じ候補がまた比較・送信の対象になる。
//
// 【2026-09-06追加・本人指示：圏外プレイ結果の自動再送信】この関数はjs/main.jsから
// オンライン復帰イベント・画面フォアグラウンド復帰・アプリ起動時など複数のタイミングで
// 呼ばれるようになった（js/rankingCandidateAutoSync.js参照）。ほぼ同時に複数回呼ばれても
// （例：オンライン復帰と同時にvisibilitychangeも発火する等）、同じ候補を並行して何度も
// Firebaseへ問い合わせに行かないよう、実行中は新しい呼び出しを即座に無視する
// single-flightロックを設ける。取りこぼしはない（ロック中に来た呼び出しは何もせず
// 早期returnするだけで、次にこの関数が呼ばれた機会にまた同じ候補が対象になるため）。
let isSyncInFlight = false;

// 戻り値: { attempted, updated, failed }（呼び出し側のUI表示用の件数サマリー）。
// 公開設定がOFFのまま呼ばれた場合・オフラインの場合・既に実行中の場合は、何も送信せず全て0で返す。
export async function syncRankingCandidatesToFirebase(playerKeyPrefix) {
  if (!isPublicProfileSharingEnabled(playerKeyPrefix)) {
    return { attempted: 0, updated: 0, failed: 0, reason: "privacy-disabled" };
  }
  if (isOffline()) {
    return { attempted: 0, updated: 0, failed: 0, reason: "offline" };
  }
  if (isSyncInFlight) {
    return { attempted: 0, updated: 0, failed: 0, reason: "in-flight" };
  }

  isSyncInFlight = true;
  try {
    // 【2026-09-22改訂：本人確認の関門（js/identityBootstrap.js）】過去の自己ベストを一括送信する前に、
    //   認証確定 → バックアップの持ち主確認（必要なら ownerSecret で claim）→ 旧UID名義のランキング記録の
    //   引き継ぎ（速い方を新UID名義で1件残して旧を消す）
    // が終わって ready になっていることを必ず確認する。ready でなければ何も送らない
    // （候補はローカルに残るので、ready になった後の起動・復帰で改めて送られる）。
    // これが「UIDが変わっても、identity 移行より先に新UID名義で過去記録を再送信しない」順序保証。
    if (!(await isIdentityReadyForCloudWrite())) {
      return { attempted: 0, updated: 0, failed: 0, reason: "identity-not-ready" };
    }
    // 関門が ready でも、その後に旧UIDの確認待ちが新たに付いた場合に備えて、送信直前にもう一度だけ
    // 旧UID名義の記録の引き継ぎを試す（既に完了済みなら何もしない・冪等）。
    try {
      const merge = await autoMergeSupersededLeaderboardEntries({ identityKey: await resolveMyIdentityKey() });
      if (merge.attempted && !merge.completed) {
        return { attempted: 0, updated: 0, failed: 0, reason: "migration-incomplete" };
      }
    } catch (error) {
      console.warn("旧IDのランキング記録の自動引き継ぎに失敗しました（次の機会に再試行します）", error);
      return { attempted: 0, updated: 0, failed: 0, reason: "migration-error" };
    }
    const candidates = getAllRankingCandidateBests();
    let updated = 0;
    let failed = 0;
    for (const candidate of candidates) {
      // 【2026-09-07追加・最終QAでの監査で発見】1件のcandidateが壊れた形（例えば将来の
      // バックアップ復元経路の不具合等でnull・想定外の型が紛れ込んだ場合）でも、
      // その1件だけ失敗扱いにしてループ全体を止めない。これが無いと、たった1件の
      // 壊れた候補のせいで、それ以降のcombo（曲数・カテゴリーの組み合わせ）が
      // 一切ランキングへ反映されなくなってしまう。
      if (!candidate || typeof candidate !== "object") {
        failed += 1;
        continue;
      }
      try {
        const result = await submitTimeAttackScoreIfBetter({
          variant: candidate.variant,
          rule: candidate.rule,
          source: candidate.source,
          questionCountValue: candidate.questionCountValue,
          categoryFilterValue: candidate.categoryFilterValue,
          clearTimeMs: candidate.clearTimeMs,
          missCount: candidate.missCount,
          playerKeyPrefix,
          actualQuestionCount: candidate.actualQuestionCount,
        });
        if (result.ok) {
          if (result.updated) updated += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        console.warn("ランキング候補の同期中に1件だけ失敗しました（他の候補の同期は続行します）", error);
        failed += 1;
      }
    }
    return { attempted: candidates.length, updated, failed };
  } finally {
    isSyncInFlight = false;
  }
}
