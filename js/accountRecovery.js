// 管理者の復旧手順と「アカウントの保護（メールで再ログインできるようにする）」（2026-10-28新設）。
// Firebase の認証関数は引数で受け取る（依存の差し込み）。テストでは偽物を使い、本物の Firebase には接続しない。
//
// 【管理者の復旧の考え方】
//   管理者かどうかは Realtime Database の admins/{UID}: true だけで決まり、アプリからは誰も書けない（Rules で .write: false）。
//   UIDが変わったら、本人が「自分の iPhone に表示された今のUID」（＝端末を持っていることが本人の証明）を読み、
//   自分の Google アカウントで Firebase Console にログインして admins に1行追加する（Console のログイン＝強い本人確認）。
//   このファイルはその手順の文言を作るだけで、権限には一切関わらない。
//
// 【アカウントの保護（任意・既定は OFF）】
//   匿名アカウントに「メール＋パスワード」を結び付ける（linkWithCredential）。UIDは変わらない（別のアカウントは作らない）。
//   端末の保存領域が消えても、同じメールでログインし直せば同じUIDに戻れる＝管理者・フレンドのカード・ランキングがそのまま。
//   ・結び付け先のメールが既に別のアカウントで使われている（credential-already-in-use／email-already-in-use）場合は、
//     今のアカウントを切り替えない。理由を説明するだけ
//   ・「メールでログインし直す」は、確認のうえで、そのメールのアカウント（＝以前保護したUID）へ切り替える。
//     切り替え後は画面を読み込み直し、端末の backupId・ownerSecret による既存の所有権回復→旧UIDの整理（整理待ちの列）に乗せる
//   ・パスワードはアプリにも Firebase のデータベースにも保存しない（Firebase Authentication が管理する）

export const ACCOUNT_PROTECTION_FLAG_KEY = "equalLoveIntroQuiz.feature.accountProtection";
export const ACCOUNT_PROTECTION_URL_PARAM = "accountprotect";

// 機能を出すかどうか（純粋関数）。既定は OFF。
//   ・端末の設定で ON にした（URL に ?accountprotect=on を付けて開くと ON が保存される。off で戻る）
//   ・今のIDが管理者（admins/{uid} が true と確認できた）
//   ・この端末で以前のIDが管理者だった記録がある（UIDが変わって外れた本人を想定）
export function isAccountProtectionEnabled({ storedFlag = null, urlParam = null, isAdmin = false, rememberedAdminUids = [] } = {}) {
  if (urlParam === "off") return false;
  if (urlParam === "on" || storedFlag === "on") return true;
  if (isAdmin === true) return true;
  return Array.isArray(rememberedAdminUids) && rememberedAdminUids.length > 0;
}

// URL の指定を端末の設定として保存すべき値（純粋関数）。null＝何もしない。
export function resolveAccountProtectionFlagUpdate(urlParam) {
  if (urlParam === "on") return "on";
  if (urlParam === "off") return "off";
  return null;
}

// メールの表示用（他の人にのぞかれても分かりにくいよう一部を隠す）。
export function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return "";
  const [local, domain] = email.split("@");
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"*".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

// 入力チェック（純粋関数）。Firebase の最低条件（パスワード6文字以上）より少し厳しく8文字以上にする。
export function validateEmailPasswordInput(email, password, passwordConfirm = password) {
  const errors = [];
  const trimmed = typeof email === "string" ? email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) errors.push("メールアドレスの形が正しくありません");
  if (typeof password !== "string" || password.length < 8) errors.push("パスワードは8文字以上にしてください");
  if (password !== passwordConfirm) errors.push("確認用のパスワードが一致しません");
  return { ok: errors.length === 0, email: trimmed, errors };
}

// Firebase Authentication のエラーを、本人が読んで分かる日本語にする（純粋関数）。
export function describeAuthErrorJa(code) {
  switch (code) {
    case "auth/credential-already-in-use":
    case "auth/email-already-in-use":
      return "このメールアドレスは別のアカウントで既に使われています。今のアカウントはそのままにしました（切り替えていません）。以前そのメールで保護したなら「メールでログインし直す」を使ってください";
    case "auth/provider-already-linked":
      return "このアカウントは既にメールで保護されています";
    case "auth/operation-not-allowed":
      return "メールでのログインが Firebase で有効になっていません（管理者が Console で「メール/パスワード」を有効にする必要があります）";
    case "auth/weak-password":
      return "パスワードが短すぎます（8文字以上にしてください）";
    case "auth/invalid-email":
      return "メールアドレスの形が正しくありません";
    case "auth/requires-recent-login":
      return "安全のため、もう一度ログインし直してから操作してください";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "メールアドレスかパスワードが違います（何も変更していません）";
    case "auth/too-many-requests":
      return "試行回数が多すぎます。しばらく待ってからもう一度お試しください";
    case "auth/network-request-failed":
      return "通信できませんでした。電波の良い場所でもう一度お試しください（何も変更していません）";
    default:
      return `うまくいきませんでした（${code ?? "不明なエラー"}）。何も変更していません`;
  }
}

// 今のログインの状態（純粋関数）。user は Firebase の User と同じ形（uid, isAnonymous, providerData[]）。
export function describeProtectionStatus(user) {
  if (!user) return { signedIn: false, isAnonymous: null, protected: false, email: null, text: "ログインしていません" };
  const providers = Array.isArray(user.providerData) ? user.providerData : [];
  const emailProvider = providers.find((p) => p?.providerId === "password");
  const email = emailProvider?.email ?? user.email ?? null;
  if (emailProvider) {
    return { signedIn: true, isAnonymous: false, protected: true, email, text: `🛡 メールで保護済み（${maskEmail(email)}）。保存領域が消えても、このメールでログインし直せば同じIDに戻れます` };
  }
  return { signedIn: true, isAnonymous: user.isAnonymous !== false, protected: false, email: null, text: "未保護（匿名ログイン）。この端末の保存領域が消えると、IDが変わります" };
}

// 依存（Firebase の認証関数）を差し込んで使う本体。
// deps:
//   getCurrentUser(): User|null
//   makeEmailCredential(email, password): AuthCredential（EmailAuthProvider.credential）
//   linkWithCredential(user, credential): Promise<{ user }>
//   signInWithEmailAndPassword(email, password): Promise<{ user }>
export function createAccountProtection(deps) {
  async function protectWithEmail({ email, password, passwordConfirm = password, confirmed = false }) {
    if (!confirmed) return { ok: false, reason: "確認が済んでいません", switched: false };
    const input = validateEmailPasswordInput(email, password, passwordConfirm);
    if (!input.ok) return { ok: false, reason: input.errors.join("／"), switched: false };
    const user = deps.getCurrentUser();
    if (!user) return { ok: false, reason: "ログイン状態を確認できません", switched: false };
    const status = describeProtectionStatus(user);
    if (status.protected) return { ok: false, reason: describeAuthErrorJa("auth/provider-already-linked"), switched: false, code: "auth/provider-already-linked" };
    const beforeUid = user.uid;
    try {
      const credential = deps.makeEmailCredential(input.email, password);
      const result = await deps.linkWithCredential(user, credential);
      const afterUid = result?.user?.uid ?? deps.getCurrentUser()?.uid ?? null;
      if (afterUid !== beforeUid) {
        // 結び付け（link）はUIDを変えないはず。万一違ったら成功扱いにしない
        return { ok: false, reason: "想定外：IDが変わりました。画面を開き直して「詳細情報」を確認してください", switched: true, beforeUid, afterUid };
      }
      return { ok: true, uid: afterUid, switched: false, email: maskEmail(input.email) };
    } catch (error) {
      const code = error?.code ?? null;
      return { ok: false, code, reason: describeAuthErrorJa(code), switched: false };
    }
  }

  async function reloginWithEmail({ email, password, confirmed = false }) {
    if (!confirmed) return { ok: false, reason: "確認が済んでいません", switched: false };
    // ログインし直しではパスワードの長さは問わない（Firebase 側で照合する）。メールの形と空でないことだけ確かめる
    const input = validateEmailPasswordInput(email, "xxxxxxxx");
    if (!input.ok) return { ok: false, reason: input.errors.join("／"), switched: false };
    if (typeof password !== "string" || password.length === 0) return { ok: false, reason: "パスワードを入力してください", switched: false };
    const beforeUid = deps.getCurrentUser()?.uid ?? null;
    const beforeStatus = describeProtectionStatus(deps.getCurrentUser());
    if (beforeStatus.protected) return { ok: false, reason: "今のアカウントは既にメールで保護されています（ログインし直す必要はありません）", switched: false };
    try {
      const result = await deps.signInWithEmailAndPassword(input.email, password);
      const afterUid = result?.user?.uid ?? null;
      return {
        ok: true,
        switched: afterUid !== beforeUid,
        beforeUid,
        afterUid,
        // 画面全体を読み込み直す（在席・ランキング・バックアップの各機能が新しいIDで始め直すため）
        needsReload: afterUid !== beforeUid,
      };
    } catch (error) {
      const code = error?.code ?? null;
      return { ok: false, code, reason: describeAuthErrorJa(code), switched: false };
    }
  }

  return { protectWithEmail, reloginWithEmail, getStatus: () => describeProtectionStatus(deps.getCurrentUser()) };
}

// ---------------------------------------------------------------------------
// 管理者の復旧手順（純粋関数）。uid は「今この端末に表示されているID」。
// ---------------------------------------------------------------------------
export function buildAdminRecoverySteps(uid, { projectId = "equal-love-intro-quiz" } = {}) {
  const shown = typeof uid === "string" && uid ? uid : "（IDを取得できませんでした。通信状態を確認して開き直してください）";
  return [
    `① この画面に出ている「今のID」：${shown}`,
    "　（このIDを知っている＝この端末を持っている本人、という確認になります。下のボタンでコピーできます）",
    `② パソコンで https://console.firebase.google.com/ を開き、自分の Google アカウントでログインしてプロジェクト「${projectId}」を選ぶ`,
    "③ 左のメニュー「構築」→「Realtime Database」→「データ」タブ → ルート直下の admins を開く",
    "④ admins の「＋」で、キー＝①のID、値＝true、型＝boolean を追加（文字列の \"true\" は不可）",
    "⑤ この画面を開き直す。「🔧 バックアップ管理」が出れば復旧完了",
    "※ アプリから自分を管理者にする方法はありません（安全のため）。元に戻すときは admins の①の行を削除するだけです",
    "※ 次からIDが変わらないようにするには、下の「アカウントを保護する」（任意）を使えます",
  ];
}
