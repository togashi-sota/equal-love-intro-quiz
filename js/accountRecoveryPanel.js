// フレンド画面の「詳細情報」の中に出す、ID・データの整理と復旧のパネル（2026-10-28新設）。
// index.html は変えずに、要素はすべてこのファイルが JS で作る（js/fanProfilesScreen.js から mountAccountRecoveryPanel を1回呼ぶ）。
//
// 中身は3つ：
//   ① 🧭 以前のあなた／現在のあなた … 比べる（読み取りのみ）→ 整理する（試算を見る）→ 本当に整理する（確認つき）→ 元に戻す
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
import { comparePublicIdentity, describePublicIdentityComparison } from "./identityDataComparison.js";
import { summarizeUidMergeQueue } from "./uidMergeQueue.js";

let root = null;
let ctx = null;
let lastComparison = null;
let mergeRunner = null;

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
    const { createAppIdentityMergeRunner } = await import("./identityMergeRunner.js");
    mergeRunner = await createAppIdentityMergeRunner();
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
  const undoButton = el("button", { className: "account-recovery-button", text: "直前の整理を元に戻す", attrs: { type: "button" } });
  const reloadButton = el("button", { className: "account-recovery-button", text: "画面を読み込み直す", attrs: { type: "button" } });
  const status = el("p", { className: "account-recovery-status", attrs: { role: "status" } });
  [publicList, backupList, dryRunButton, dryRunList, executeButton, confirmBox, undoButton, reloadButton, status].forEach((n) => {
    n.hidden = true;
  });
  section.append(compareButton, queueLine, publicList, backupList, dryRunButton, dryRunList, executeButton, confirmBox, undoButton, reloadButton, status);

  const setStatus = (text) => {
    status.textContent = text;
    status.hidden = !text;
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
    [dryRunList, executeButton, confirmBox].forEach((n) => {
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
    executeButton.hidden = !result.ok || result.changedKeyCount === 0;
    executeButton.disabled = !result.canExecute;
    executeButton.title = result.canExecute ? "" : "本人の確認が取れていないため実行できません";
    if (result.ok && result.changedKeyCount > 0 && !result.canExecute) {
      setStatus(`試算だけ表示しています。本人の確認が取れていないため実行はできません（${lastComparison.proof.reasons.join("／")}）`);
    } else setStatus("これは試算です。まだ何も書き換えていません");
  });

  executeButton.addEventListener("click", () => {
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
      if (!result.ok) {
        setStatus(result.reason);
        return;
      }
      executeButton.hidden = true;
      dryRunList.hidden = true;
      undoButton.hidden = !runner.hasUndo();
      reloadButton.hidden = false;
      setStatus(`整理しました（${result.changedKeyCount}種類の記録）。表示を最新にするため「画面を読み込み直す」を押してください`);
      ctx.onMerged?.();
    } finally {
      confirmYes.disabled = false;
    }
  });
  undoButton.addEventListener("click", async () => {
    undoButton.disabled = true;
    try {
      const runner = await getMergeRunner();
      const result = await runner.undoLast();
      setStatus(result.ok ? `整理前の状態に戻しました（${result.restoredKeyCount}種類）。「画面を読み込み直す」を押してください` : result.reason);
      undoButton.hidden = !runner.hasUndo();
      reloadButton.hidden = !result.ok;
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
