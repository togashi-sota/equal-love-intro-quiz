// フレンド画面の「詳細情報」の中に出す、ID・データの整理と復旧のパネル（2026-10-28新設）。
// index.html は変えずに、要素はすべてこのファイルが JS で作る（js/fanProfilesScreen.js から mountAccountRecoveryPanel を1回呼ぶ）。
//
// 中身は3つ：
//   ① 🧭 以前のあなた／現在のあなた … 比べる（読み取りのみ）→ 整理する（試算を見る）→ 本当に整理する（確認つき）→ 元に戻す
//      【2026-10-28追加】実行結果の内訳（衝突した項目・戻した／戻さなかった項目）、保留だけのときの「控えだけ記録する」、
//      保留の控えの一覧と「控えを削除する（確認済み）」（確認つき。押すと控えを削除する＝js/identityMergeRunner.js の confirmHold() の動き）
//   ② 🔑 管理者の確認コード … 今のIDの表示とコピー、Console で admins に追加する手順（権限は一切与えない）
//   ③ 🛡 アカウントを保護する（任意・既定は非表示） … メール＋パスワードを今のアカウントに結び付ける／メールでログインし直す
// 計算・判定は純粋関数（js/identityDataComparison.js・js/identityMergeRunner.js・js/accountRecovery.js）。ここは画面と配線だけ。

import {
  buildAdminRecoverySteps,
  isAccountProtectionEnabled,
  resolveAccountProtectionFlagUpdate,
  ACCOUNT_PROTECTION_FLAG_KEY,
  ACCOUNT_PROTECTION_URL_PARAM,
  createAccountProtection,
  describeProtectionStatus,
} from "./accountRecovery.js";
import { comparePublicIdentity, describePublicIdentityComparison, classifyBackupKey, CATEGORY_LABELS } from "./identityDataComparison.js";
import { summarizeUidMergeQueue } from "./uidMergeQueue.js";

let root = null;
let ctx = null;
let lastComparison = null;
let mergeRunner = null;

// ---- 整理の結果を「ふつうの日本語」にする純粋関数（DOM に触れない。tests/accountMergePanel.test.js で確認） ----
// 論理キー（例 "achievements"・"highScore.xxx"）を、画面に出す記録の種類名へ。
export function describeMergeKeyLabel(key) {
  if (typeof key !== "string" || !key) return "記録";
  return CATEGORY_LABELS[classifyBackupKey(key)] ?? "記録";
}

// 実行役（js/identityMergeRunner.js）の rollback・undoLast の項目（"端末:キー"／"クラウド:キー"）を読みやすく
function describeRollbackItem(item) {
  const text = String(item ?? "");
  const sep = text.indexOf(":");
  const where = sep >= 0 ? text.slice(0, sep) : "";
  const key = sep >= 0 ? text.slice(sep + 1) : text;
  const place = where === "クラウド" ? "クラウドのバックアップ" : where === "端末" ? "この端末" : "";
  return place ? `${place}の「${describeMergeKeyLabel(key)}」` : `「${describeMergeKeyLabel(key)}」`;
}

// execute() の結果 → 画面の行（conflicts・rollback・保留を説明する）
export function describeMergeExecuteResult(result) {
  const lines = [];
  if (!result) return lines;
  const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
  conflicts.forEach((c) => {
    const place = c?.where === "クラウド" ? "クラウドのバックアップ" : "この端末";
    lines.push(`⚠ ${place}の「${describeMergeKeyLabel(c?.key)}」：${c?.message ?? "途中で別の操作が記録を変えたため、整理しませんでした"}`);
  });
  const rollback = result.rollback;
  if (rollback) {
    (rollback.restored ?? []).forEach((item) => lines.push(`↩ ${describeRollbackItem(item)}は、この整理の前の値に戻しました`));
    (rollback.keptBecauseChanged ?? []).forEach((item) => lines.push(`・${describeRollbackItem(item)}は、別の端末・別のタブで新しく変わっていたので戻しませんでした（新しい記録をそのまま残しています）`));
  }
  if (result.ok && (result.heldKeyCount ?? 0) > 0) {
    lines.push(`・保留の項目 ${result.heldKeyCount}種類（苦手曲の集計など）は統合していません。以前の値と現在の値を控えに記録しただけです（下の「保留の控え」で確認できます）`);
  }
  return lines;
}

// undoLast() の結果 → 画面の行
export function describeMergeUndoResult(result) {
  if (!result) return [];
  if (!result.ok) return [result.reason ?? "元に戻せませんでした"];
  const lines = [`整理前の状態に戻しました（この端末の記録 ${result.restoredKeyCount ?? 0}種類）`];
  (result.keptBecauseChanged ?? []).forEach((item) => lines.push(`・${describeRollbackItem(item)}は、別の端末で新しく変わったので戻しませんでした`));
  return lines;
}

function formatHoldDate(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "日時不明";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// listHolds() の1件 → 画面の1行
export function describeMergeHold(hold) {
  const items = Array.isArray(hold?.items) ? hold.items : [];
  const notMergeable = items.filter((h) => h?.reason === "not-mergeable");
  const kept = items.filter((h) => h?.reason !== "not-mergeable");
  const overwritten = Array.isArray(hold?.overwritten) ? hold.overwritten : [];
  const names = (list) => [...new Set(list.map((h) => describeMergeKeyLabel(h?.key)))].join("・");
  const parts = [];
  if (notMergeable.length) parts.push(`統合していない保留 ${notMergeable.length}種類（${names(notMergeable)}）`);
  if (kept.length) parts.push(`今の値を残した項目の以前の値 ${kept.length}種類（${names(kept)}）`);
  if (overwritten.length) parts.push(`整理で書き換えた項目の整理前の値 ${overwritten.length}種類`);
  return `${formatHoldDate(hold?.savedAt)} の整理の控え：${parts.length ? parts.join("・") : "中身なし"}`;
}

// 「控えを削除する（確認済み）」の確認文（js/identityMergeRunner.js の confirmHold() が実際にすることだけを書く）
export const CONFIRM_HOLD_MESSAGE =
  "「控えを削除する（確認済み）」と、この控え（整理前の以前の値・現在の値の写し）をこの端末から削除します。次のバックアップ同期で、クラウドのバックアップに入っている控えからも消えます。" +
  "苦手曲の集計など保留した項目の以前の値は、この控えにしか残っていないことがあり、削除すると元に戻せません。" +
  "整理した記録そのもの（称号・履歴など、この端末の今の記録）は消えません。本当に確認済みにしますか？";

function el(tag, { className = "", text = "", attrs = {} } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function setLines(listElement, lines) {
  listElement.innerHTML = "";
  lines.forEach((line) => listElement.appendChild(el("li", { text: line })));
  listElement.hidden = lines.length === 0;
}

function readFlag() {
  try {
    return localStorage.getItem(ACCOUNT_PROTECTION_FLAG_KEY);
  } catch {
    return null;
  }
}

function applyUrlFlag() {
  let param = null;
  try {
    param = new URLSearchParams(location.search).get(ACCOUNT_PROTECTION_URL_PARAM);
  } catch {
    param = null;
  }
  const update = resolveAccountProtectionFlagUpdate(param);
  if (update) {
    try {
      localStorage.setItem(ACCOUNT_PROTECTION_FLAG_KEY, update);
    } catch {
      // 保存できなくても、このページの間は URL の指定どおりに動く
    }
  }
  return param;
}

async function getMergeRunner() {
  if (!mergeRunner) {
    // テストでは context.createMergeRunner で偽の実行役を渡す（Firebase を読み込まない）
    if (typeof ctx?.createMergeRunner === "function") {
      mergeRunner = await ctx.createMergeRunner();
    } else {
      const { createAppIdentityMergeRunner } = await import("./identityMergeRunner.js");
      mergeRunner = await createAppIdentityMergeRunner();
    }
  }
  return mergeRunner;
}

// ---- ① 以前のあなた／現在のあなた ----
function buildComparisonSection() {
  const section = el("section", { className: "account-recovery-section" });
  section.appendChild(el("h4", { className: "account-recovery-title", text: "🧭 以前のあなた／現在のあなた" }));
  section.appendChild(
    el("p", {
      className: "account-recovery-note",
      text: "称号・履歴・自己ベストなどの記録は、この端末（現在のあなた）が正本で、クラウドのバックアップ（以前のあなた）にも保存されています。フレンドのカード・ランキング・オンライン表示はIDごとに保存されるため、IDが変わると「以前のID」の分が残ります。",
    })
  );
  const compareButton = el("button", { className: "account-recovery-button", text: "比べる（読み取りのみ）", attrs: { type: "button" } });
  const queueLine = el("p", { className: "account-recovery-line" });
  const publicList = el("ul", { className: "account-recovery-list" });
  const backupList = el("ul", { className: "account-recovery-list" });
  const dryRunButton = el("button", { className: "account-recovery-button", text: "整理する（試算を見る）", attrs: { type: "button" } });
  const dryRunList = el("ul", { className: "account-recovery-list" });
  const executeButton = el("button", { className: "account-recovery-button is-primary", text: "この内容で整理する", attrs: { type: "button" } });
  const confirmBox = el("div", { className: "account-recovery-confirm" });
  confirmBox.appendChild(el("p", { text: "整理する前に、書き換える記録の今の値をこの端末に控えます（「直前の整理を元に戻す」で戻せます）。本当に整理しますか？" }));
  const confirmYes = el("button", { className: "account-recovery-button is-primary", text: "本当に整理する", attrs: { type: "button" } });
  const confirmNo = el("button", { className: "account-recovery-button", text: "やめる", attrs: { type: "button" } });
  confirmBox.append(confirmYes, confirmNo);
  const confirmText = confirmBox.children[0];
  const heldOnlyNote = el("p", {
    className: "account-recovery-note",
    text: "自動で整理できる違いはありません。保留の項目（苦手曲の集計など）は統合せず、以前の値と現在の値を「控え」として記録するだけです（この端末の記録もクラウドの記録も書き換えません）。",
  });
  heldOnlyNote.dataset.role = "merge-held-only-note";
  const undoButton = el("button", { className: "account-recovery-button", text: "直前の整理を元に戻す", attrs: { type: "button" } });
  const reloadButton = el("button", { className: "account-recovery-button", text: "画面を読み込み直す", attrs: { type: "button" } });
  const status = el("p", { className: "account-recovery-status", attrs: { role: "status" } });
  // 実行・元に戻すの結果の内訳（衝突・戻した／戻さなかった項目・保留）
  const resultList = el("ul", { className: "account-recovery-list" });
  resultList.dataset.role = "merge-result";
  // 保留の控え（本人が確かめて「確認済み」にするまで消えない）
  const holdsBox = el("div", { className: "account-recovery-holds" });
  holdsBox.dataset.role = "merge-holds";
  [publicList, backupList, dryRunButton, dryRunList, heldOnlyNote, executeButton, confirmBox, undoButton, reloadButton, status, resultList, holdsBox].forEach((n) => {
    n.hidden = true;
  });
  section.append(compareButton, queueLine, publicList, backupList, dryRunButton, dryRunList, heldOnlyNote, executeButton, confirmBox, undoButton, reloadButton, status, resultList, holdsBox);

  const setStatus = (text) => {
    status.textContent = text;
    status.hidden = !text;
  };
  const setResultLines = (lines) => setLines(resultList, lines);

  // ---- 保留の控えの一覧と「控えを削除する（確認済み）」（確認つき） ----
  const renderHolds = (runner) => {
    holdsBox.innerHTML = "";
    let holds = [];
    try {
      holds = typeof runner?.listHolds === "function" ? runner.listHolds() : [];
    } catch {
      holds = [];
    }
    holdsBox.hidden = holds.length === 0;
    if (holds.length === 0) return;
    holdsBox.appendChild(el("h5", { className: "account-recovery-title", text: `📦 保留の控え（${holds.length}件）` }));
    holdsBox.appendChild(
      el("p", {
        className: "account-recovery-note",
        text: "整理の前に、以前の値と現在の値をここに控えています。中身を確かめて問題が無ければ「控えを削除する（確認済み）」を押してください。押さない限り、控えは自動では消えません。",
      })
    );
    holds.forEach((hold) => {
      const row = el("div", { className: "account-recovery-hold" });
      row.dataset.holdId = hold.id;
      row.appendChild(el("p", { className: "account-recovery-line", text: describeMergeHold(hold) }));
      const confirmHoldButton = el("button", { className: "account-recovery-button", text: "控えを削除する（確認済み）", attrs: { type: "button" } });
      const holdConfirm = el("div", { className: "account-recovery-confirm" });
      holdConfirm.appendChild(el("p", { text: CONFIRM_HOLD_MESSAGE }));
      const holdYes = el("button", { className: "account-recovery-button is-primary", text: "はい、控えを削除する", attrs: { type: "button" } });
      const holdNo = el("button", { className: "account-recovery-button", text: "やめる", attrs: { type: "button" } });
      holdConfirm.append(holdYes, holdNo);
      holdConfirm.hidden = true;
      row.append(confirmHoldButton, holdConfirm);
      confirmHoldButton.addEventListener("click", () => {
        holdConfirm.hidden = false;
      });
      holdNo.addEventListener("click", () => {
        holdConfirm.hidden = true;
      });
      holdYes.addEventListener("click", async () => {
        holdYes.disabled = true;
        try {
          const r = await getMergeRunner();
          const result = await r.confirmHold(hold.id, { confirmed: true });
          setStatus(result?.ok ? "控えを削除しました（確認済み）" : result?.reason ?? "控えを削除できませんでした");
          renderHolds(r);
        } catch (error) {
          setStatus(`確認済みにできませんでした（${error?.message ?? "不明"}）。控えはそのまま残っています`);
        } finally {
          holdYes.disabled = false;
        }
      });
      holdsBox.appendChild(row);
    });
  };

  const refreshQueueLine = () => {
    const summary = summarizeUidMergeQueue(ctx.getUidMergeQueue(), { currentUid: ctx.getMyUid() });
    const parts = [];
    if (summary.pending) parts.push(`整理待ち ${summary.pending}件`);
    if (summary.failed) parts.push(`再試行待ち ${summary.failed}件`);
    if (summary.blocked) parts.push(`権限で止まっている ${summary.blocked}件（Rules の更新で自動的に片付きます）`);
    if (summary.merged) parts.push(`整理済み ${summary.merged}件`);
    queueLine.textContent = parts.length ? `🧹 以前のID：${parts.join("・")}` : "";
    queueLine.hidden = parts.length === 0;
  };

  compareButton.addEventListener("click", async () => {
    compareButton.disabled = true;
    setStatus("比べています（読み取りだけで、何も書き換えません）…");
    [dryRunList, heldOnlyNote, executeButton, confirmBox, resultList].forEach((n) => {
      n.hidden = true;
    });
    try {
      refreshQueueLine();
      setLines(publicList, await buildPublicComparisonLines());
      const runner = await getMergeRunner();
      lastComparison = await runner.compare();
      if (!lastComparison.ok) {
        setLines(backupList, [`クラウドのバックアップ：${lastComparison.reason ?? "比べられませんでした"}`]);
        dryRunButton.hidden = true;
      } else {
        const s = lastComparison.plan.summary;
        setLines(backupList, [
          `クラウドのバックアップと この端末：違いのある記録 ${s.changedKeyCount}種類（以前だけ ${s.onlyPreviousTotal}件・食い違い ${s.conflictTotal}件）`,
          lastComparison.proof.ok ? "本人の確認：OK（このバックアップの持ち主は今のIDです）" : `本人の確認：未確認（${lastComparison.proof.reasons.join("／")}）`,
        ]);
        dryRunButton.hidden = false;
      }
      undoButton.hidden = !runner.hasUndo();
      renderHolds(runner);
      setStatus("");
    } catch (error) {
      setStatus(`比べられませんでした（${error?.code ?? error?.message ?? "通信エラー"}）。電波の良い場所でもう一度お試しください`);
    } finally {
      compareButton.disabled = false;
    }
  });

  dryRunButton.addEventListener("click", async () => {
    const runner = await getMergeRunner();
    const result = runner.dryRun(lastComparison);
    setLines(dryRunList, result.lines);
    setResultLines([]);
    // 【2026-10-28】保留の項目だけ（自動で整理できる違いが0種類）でも、控えを記録するために実行できるようにする
    const heldCount = Math.max(result.heldKeyCount ?? 0, (lastComparison?.plan?.held ?? []).length);
    const heldOnly = result.ok && result.changedKeyCount === 0 && heldCount > 0;
    const actionable = result.ok && (result.changedKeyCount > 0 || heldCount > 0);
    executeButton.hidden = !actionable;
    executeButton.disabled = !result.canExecute;
    executeButton.textContent = heldOnly ? "控えだけ記録する（統合はしません）" : "この内容で整理する";
    executeButton.title = result.canExecute ? "" : "本人の確認が取れていないため実行できません";
    heldOnlyNote.hidden = !heldOnly;
    executeButton.dataset.heldOnly = String(heldOnly);
    if (actionable && !result.canExecute) {
      setStatus(`試算だけ表示しています。本人の確認が取れていないため実行はできません（${lastComparison.proof.reasons.join("／")}）`);
    } else setStatus("これは試算です。まだ何も書き換えていません");
  });

  executeButton.addEventListener("click", () => {
    confirmText.textContent =
      executeButton.dataset.heldOnly === "true"
        ? "保留の項目（苦手曲の集計など）の以前の値と現在の値を、この端末に控えとして記録します（次のバックアップ同期でクラウドにも入ります）。統合はせず、記録そのものは書き換えません。記録しますか？"
        : "整理する前に、書き換える記録の今の値をこの端末に控えます（「直前の整理を元に戻す」で戻せます）。本当に整理しますか？";
    confirmBox.hidden = false;
  });
  confirmNo.addEventListener("click", () => {
    confirmBox.hidden = true;
  });
  confirmYes.addEventListener("click", async () => {
    confirmYes.disabled = true;
    setStatus("整理しています…");
    try {
      const runner = await getMergeRunner();
      const result = await runner.execute(lastComparison, { confirmed: true });
      confirmBox.hidden = true;
      setResultLines(describeMergeExecuteResult(result));
      renderHolds(runner);
      if (!result.ok) {
        setStatus(result.reason);
        undoButton.hidden = !runner.hasUndo();
        return;
      }
      executeButton.hidden = true;
      heldOnlyNote.hidden = true;
      dryRunList.hidden = true;
      undoButton.hidden = !runner.hasUndo();
      if (result.changedKeyCount > 0) {
        reloadButton.hidden = false;
        const conflictNote = (result.conflicts ?? []).length ? `。整理しなかった項目が ${(result.conflicts ?? []).length}件あります（下の内訳）` : "";
        setStatus(`整理しました（${result.changedKeyCount}種類の記録）${conflictNote}。表示を最新にするため「画面を読み込み直す」を押してください`);
        ctx.onMerged?.();
      } else if ((result.conflicts ?? []).length) {
        setStatus("途中で別の操作が記録を変えたため、書き換えた記録はありません（下の内訳）。もう一度「比べる」からやり直してください");
      } else {
        setStatus("控えを記録しました。統合はしていません（記録そのものは何も書き換えていません）");
      }
    } catch (error) {
      setStatus(`整理できませんでした（${error?.message ?? "不明"}）。もう一度「比べる」からやり直してください`);
    } finally {
      confirmYes.disabled = false;
    }
  });
  undoButton.addEventListener("click", async () => {
    undoButton.disabled = true;
    try {
      const runner = await getMergeRunner();
      const result = await runner.undoLast();
      const lines = describeMergeUndoResult(result);
      setStatus(result.ok ? `${lines[0]}。「画面を読み込み直す」を押してください` : result.reason);
      setResultLines(result.ok ? lines.slice(1) : []);
      undoButton.hidden = !runner.hasUndo();
      reloadButton.hidden = !result.ok;
    } catch (error) {
      setStatus(`元に戻せませんでした（${error?.message ?? "不明"}）`);
    } finally {
      undoButton.disabled = false;
    }
  });
  reloadButton.addEventListener("click", () => location.reload());
  refreshQueueLine();
  return section;
}

// 公開データ（UIDごと）の比較。読み取りだけ：公開プロフィール2件＋在席1件（整理待ちの旧IDがあるときだけランキングも）。
async function buildPublicComparisonLines() {
  const pending = ctx.getPendingUidMerge();
  if (!pending) return ["以前のIDの整理待ちはありません（フレンドのカード・ランキングは今のIDだけです）"];
  const { planUidMerge } = await import("./uidSupersession.js");
  const plan = await planUidMerge();
  const firebaseClient = await import("./firebaseClient.js");
  const rtdb = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
  const read = async (path) => {
    try {
      return (await rtdb.get(rtdb.ref(firebaseClient.database, path))).val();
    } catch {
      return null;
    }
  };
  const myUid = ctx.getMyUid();
  const [oldProfile, newProfile, oldPresence] = await Promise.all([
    read(`publicProfiles/${pending.oldUid}`),
    myUid ? read(`publicProfiles/${myUid}`) : null,
    read(`presence/${pending.oldUid}`),
  ]);
  const cmp = comparePublicIdentity({
    oldUid: pending.oldUid,
    newUid: myUid,
    oldProfile,
    newProfile,
    leaderboardDivisions: plan.ok ? plan.divisions : [],
    oldPresence,
    adminOld: ctx.getRememberedAdminUids().includes(pending.oldUid) ? true : null,
    adminNew: ctx.isAdmin(),
  });
  const suffix = (uid) => (typeof uid === "string" ? uid.slice(-4) : "");
  return [`以前のID …${suffix(pending.oldUid)} と 今のID …${suffix(myUid)}`, ...describePublicIdentityComparison(cmp), "（公開データの整理は、上の「以前のIDの記録が見つかりました」の案内から行えます）"];
}

// ---- ② 管理者の確認コード ----
function buildAdminSection() {
  const section = el("details", { className: "account-recovery-section" });
  section.appendChild(el("summary", { className: "account-recovery-title", text: "🔑 管理者の確認コード（管理者本人向け）" }));
  const list = el("ol", { className: "account-recovery-list" });
  const copyButton = el("button", { className: "account-recovery-button", text: "今のIDをコピー", attrs: { type: "button" } });
  const status = el("p", { className: "account-recovery-status", attrs: { role: "status" } });
  status.hidden = true;
  section.append(list, copyButton, status);
  section.addEventListener("toggle", () => {
    if (section.open) setLines(list, buildAdminRecoverySteps(ctx.getMyUid()));
  });
  copyButton.addEventListener("click", async () => {
    const uid = ctx.getMyUid();
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      status.textContent = "コピーしました（パソコンへは AirDrop やメモで渡してください）";
    } catch {
      status.textContent = `コピーできませんでした。長押しで選んでコピーしてください：${uid}`;
    }
    status.hidden = false;
  });
  return section;
}

// ---- ③ アカウントを保護する（任意） ----
async function createAppAccountProtection() {
  const firebaseClient = await import("./firebaseClient.js");
  const authSdk = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
  await firebaseClient.authReady;
  return createAccountProtection({
    getCurrentUser: () => firebaseClient.auth.currentUser,
    makeEmailCredential: (email, password) => authSdk.EmailAuthProvider.credential(email, password),
    linkWithCredential: (user, credential) => authSdk.linkWithCredential(user, credential),
    signInWithEmailAndPassword: (email, password) => authSdk.signInWithEmailAndPassword(firebaseClient.auth, email, password),
    // 【2026-10-28】パスワード再設定メール（画面のボタンは未設置。報告書の提案を本人が判断してから付ける）
    sendPasswordResetEmail: (email) => authSdk.sendPasswordResetEmail(firebaseClient.auth, email),
  });
}

function buildProtectionSection() {
  const section = el("details", { className: "account-recovery-section" });
  section.appendChild(el("summary", { className: "account-recovery-title", text: "🛡 アカウントを保護する（任意・メールで再ログインできるようにする）" }));
  const statusLine = el("p", { className: "account-recovery-line" });
  const note = el("p", {
    className: "account-recovery-note",
    text: "今のアカウントにメールアドレスとパスワードを結び付けます（IDは変わりません・別のアカウントは作りません）。この端末の保存領域が消えても、同じメールでログインし直せば同じIDに戻れます。パスワードはアプリには保存されません。",
  });
  const email = el("input", { className: "account-recovery-input", attrs: { type: "email", autocomplete: "username", placeholder: "メールアドレス", inputmode: "email" } });
  const password = el("input", { className: "account-recovery-input", attrs: { type: "password", autocomplete: "new-password", placeholder: "パスワード（8文字以上）" } });
  const password2 = el("input", { className: "account-recovery-input", attrs: { type: "password", autocomplete: "new-password", placeholder: "パスワード（確認）" } });
  const protectButton = el("button", { className: "account-recovery-button is-primary", text: "このアカウントを保護する", attrs: { type: "button" } });
  const reloginButton = el("button", { className: "account-recovery-button", text: "保護したメールでログインし直す", attrs: { type: "button" } });
  const confirmBox = el("div", { className: "account-recovery-confirm" });
  const confirmText = el("p");
  const confirmYes = el("button", { className: "account-recovery-button is-primary", text: "はい、実行する", attrs: { type: "button" } });
  const confirmNo = el("button", { className: "account-recovery-button", text: "やめる", attrs: { type: "button" } });
  confirmBox.append(confirmText, confirmYes, confirmNo);
  confirmBox.hidden = true;
  const status = el("p", { className: "account-recovery-status", attrs: { role: "status" } });
  status.hidden = true;
  section.append(statusLine, note, email, password, password2, protectButton, reloginButton, confirmBox, status);
  // 「保護する」側だけを機能フラグの対象にする（ログインし直しは、保存領域が消えた後＝フラグも消えた後に使うため常に出す）
  [note, password2, protectButton].forEach((n) => n.classList.add('is-protect-only'));
  section.dataset.role = 'account-protection';

  let pendingAction = null;
  const setStatus = (text) => {
    status.textContent = text;
    status.hidden = !text;
  };
  const refreshStatus = async () => {
    try {
      const firebaseClient = await import("./firebaseClient.js");
      const st = describeProtectionStatus(firebaseClient.auth.currentUser);
      statusLine.textContent = st.text;
      const enabled = section.dataset.protectEnabled === 'true';
      protectButton.hidden = st.protected || !enabled;
      password2.hidden = st.protected || !enabled;
      note.hidden = !enabled;
    } catch {
      statusLine.textContent = "ログイン状態を確認できません";
    }
  };
  section.addEventListener("toggle", () => {
    if (section.open) refreshStatus();
  });
  protectButton.addEventListener("click", () => {
    pendingAction = "protect";
    confirmText.textContent = "今のアカウント（今のID）にこのメールを結び付けます。IDは変わりません。よろしいですか？";
    confirmBox.hidden = false;
  });
  reloginButton.addEventListener("click", () => {
    pendingAction = "relogin";
    confirmText.textContent = "保護済みのメールのアカウントへ切り替えます（以前保護したIDに戻ります）。今の匿名のIDは「以前のID」として整理待ちになり、この端末の記録はそのまま使われます。よろしいですか？";
    confirmBox.hidden = false;
  });
  confirmNo.addEventListener("click", () => {
    confirmBox.hidden = true;
    pendingAction = null;
  });
  confirmYes.addEventListener("click", async () => {
    confirmYes.disabled = true;
    try {
      const protection = await createAppAccountProtection();
      if (pendingAction === "protect") {
        const result = await protection.protectWithEmail({ email: email.value, password: password.value, passwordConfirm: password2.value, confirmed: true });
        setStatus(result.ok ? `保護しました（${result.email}）。IDはそのままです` : result.reason);
      } else if (pendingAction === "relogin") {
        const result = await protection.reloginWithEmail({ email: email.value, password: password.value, confirmed: true });
        if (!result.ok) setStatus(result.reason);
        else if (!result.switched) setStatus("既にそのアカウントでログインしています");
        else {
          setStatus("ログインし直しました。画面を読み込み直します…");
          setTimeout(() => location.reload(), 1200);
        }
      }
    } catch (error) {
      setStatus(`うまくいきませんでした（${error?.code ?? error?.message ?? "不明"}）。何も変更していません`);
    } finally {
      password.value = "";
      password2.value = "";
      confirmYes.disabled = false;
      confirmBox.hidden = true;
      pendingAction = null;
      refreshStatus();
    }
  });
  return section;
}

// context:
//   getMyUid(), isAdmin(), getRememberedAdminUids(), getUidMergeQueue(), getPendingUidMerge(), onMerged()
//   createMergeRunner()（省略可。テストで偽の実行役を渡すときだけ使う。省略時は js/identityMergeRunner.js の本物）
export function mountAccountRecoveryPanel(container, context) {
  if (!container || root) return root;
  ctx = context;
  const urlParam = applyUrlFlag();
  root = el("div", { className: "account-recovery-panel" });
  root.appendChild(buildComparisonSection());
  root.appendChild(buildAdminSection());
  const protection = buildProtectionSection();
  root.appendChild(protection);
  container.appendChild(root);
  refreshAccountRecoveryPanel({ urlParam });
  return root;
}

// 管理者判定が分かった後などに呼ぶ（アカウント保護の表示・非表示を合わせる）。
export function refreshAccountRecoveryPanel({ urlParam = null } = {}) {
  if (!root || !ctx) return;
  const protection = root.querySelector('[data-role="account-protection"]');
  if (!protection) return;
  const enabled = isAccountProtectionEnabled({
    storedFlag: readFlag(),
    urlParam,
    isAdmin: ctx.isAdmin(),
    rememberedAdminUids: ctx.getRememberedAdminUids(),
  });
  protection.dataset.protectEnabled = String(enabled);
  protection.querySelectorAll('.is-protect-only').forEach((n) => {
    n.hidden = !enabled;
  });
  const summary = protection.querySelector('summary');
  if (summary) summary.textContent = enabled ? '🛡 アカウントを保護する（任意・メールで再ログインできるようにする）' : '🔐 保護したメールでログインし直す（保護済みの方だけ）';
}

// テスト用：パネルを外して、モジュール内の状態（1回だけ作る作り・試算・実行役）を初めの状態へ戻す。
// アプリからは呼ばない（パネルはフレンド画面で1回だけ作る）。
export function unmountAccountRecoveryPanel() {
  if (root && typeof root.remove === "function") root.remove();
  root = null;
  ctx = null;
  lastComparison = null;
  mergeRunner = null;
}
