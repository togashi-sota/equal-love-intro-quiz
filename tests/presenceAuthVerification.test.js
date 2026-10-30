// 【2026-10-28新設】在席（接続ごとの時刻）とアカウント保護の、エミュレータ検証で見つけた点の回帰テスト。
// Firebase には一切接続しない（純粋関数と、偽の認証関数・ソースの構造チェックだけ）。
// 本物の SDK＋Firebase Local Emulator Suite での検証は tests/emulator/presence-auth/（node 専用・tests.html では動かさない）。
//   V. 「通信不明」と「オフライン」の境目を接続ごとの時刻で決める（iPhone の残骸＋PC を閉じた直後、など）
//   G. 自分の古い接続ノードの掃除（時刻つきは1時間で残骸）
//   H. ハートビートが拒否されたときの対応（送り直しは書き戻さない／今の接続が消されたら作り直す）
//   K. パスワード再設定メール（登録の有無を漏らさない・ログインを変えない）
//   S. 配線の構造チェック（presenceSync.js）
import { assertEqual } from "./test-utils.js";
import {
  classifyPresenceEntry,
  buildPresenceDisplay,
  selectStaleOwnConnectionIds,
  decideHeartbeatDenialAction,
  PRESENCE_STALE_CONNECTION_MS,
  PRESENCE_UNKNOWN_MAX_MS,
} from "../js/presencePayloads.js";
import { createAccountProtection, PASSWORD_RESET_NEUTRAL_MESSAGE, describeAuthErrorJa } from "../js/accountRecovery.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = 1_800_000_000_000;

function runStateBoundaryTests() {
  // iPhone の数値ノードが2時間止まった残骸＋PC を今閉じた（onDisconnect が lastSeen を今にした）
  const ghostPlusClosedPc = { connections: { "-iphone": NOW - 2 * HOUR }, lastSeen: NOW - 30 * 1000 };
  assertEqual(classifyPresenceEntry(ghostPlusClosedPc, NOW).state, "offline", "V1: 残骸（2時間止まった接続）しか無ければ、別の端末を今閉じた直後でもオフライン（以前は「通信不明」）");
  assertEqual(buildPresenceDisplay(ghostPlusClosedPc, NOW).text, "たった今", "V1: オフラインの時刻は全体の最終接続（PC を閉じた時刻）");
  // iPhone の数値ノードが20分止まっている＋PC を今閉じた
  const suspendedPlusClosedPc = { connections: { "-iphone": NOW - 20 * MIN }, lastSeen: NOW - 30 * 1000 };
  const d2 = buildPresenceDisplay(suspendedPlusClosedPc, NOW);
  assertEqual([d2.state, d2.text], ["unknown", "通信不明（最終確認 20分前）"], "V2: 通信不明の「最終確認」は止まっている接続自身の時刻（PC を閉じた時刻ではない）");
  // 両方とも数値で、片方が生きている
  assertEqual(classifyPresenceEntry({ connections: { a: NOW - 2 * MIN, b: NOW - 3 * HOUR }, lastSeen: NOW - 2 * MIN }, NOW).state, "online", "V3: 生きている接続が1つでもあればオンライン");
  // true（今の本番 Rules）だけの従来ケースは変わらない
  assertEqual(classifyPresenceEntry({ connections: { a: true }, lastSeen: NOW - 20 * MIN }, NOW).state, "unknown", "V4: true の接続は従来どおり共有の lastSeen で判定（20分＝通信不明）");
  assertEqual(classifyPresenceEntry({ connections: { a: true }, lastSeen: NOW - 2 * HOUR }, NOW).state, "offline", "V4: true の接続で lastSeen が1時間超ならオフライン");
  // true と数値の混在：true 側の lastSeen が20分、数値側が3時間 → 通信不明（true 側の時刻）
  const mixed = buildPresenceDisplay({ connections: { old: true, num: NOW - 3 * HOUR }, lastSeen: NOW - 20 * MIN }, NOW);
  assertEqual([mixed.state, mixed.text], ["unknown", "通信不明（最終確認 20分前）"], "V5: 古いアプリ（true）と新しいアプリ（数値）が混在しても、止まっている接続の時刻で表示");
  // 境目
  assertEqual(classifyPresenceEntry({ connections: { a: NOW - PRESENCE_STALE_CONNECTION_MS }, lastSeen: NOW - HOUR }, NOW).state, "online", "V6: ちょうど15分はまだオンライン");
  assertEqual(classifyPresenceEntry({ connections: { a: NOW - PRESENCE_STALE_CONNECTION_MS - 1 }, lastSeen: NOW - HOUR }, NOW).state, "unknown", "V6: 15分を1ミリ秒でも過ぎたら通信不明");
  assertEqual(classifyPresenceEntry({ connections: { a: NOW - PRESENCE_UNKNOWN_MAX_MS }, lastSeen: NOW - 2 * HOUR }, NOW).state, "unknown", "V6: ちょうど1時間はまだ通信不明");
  assertEqual(classifyPresenceEntry({ connections: { a: NOW - PRESENCE_UNKNOWN_MAX_MS - 1 }, lastSeen: NOW - 2 * HOUR }, NOW).state, "offline", "V6: 1時間を過ぎたらオフライン");
  assertEqual(buildPresenceDisplay({ connections: { a: NOW - 20 * MIN } }, NOW).isOnline, false, "V7: 通信不明は「一緒に遊ぶ」の対象にしない");
  assertEqual(buildPresenceDisplay({ connections: { a: NOW + 30 * 1000 }, lastSeen: NOW }, NOW).state, "online", "V7: サーバー時刻の推定が少し遅れていても（未来の時刻）オンライン");
}

// push() のキーと同じ形で、先頭8文字に作成時刻を埋め込んだキーを作る（テスト用）
function pushKeyAt(timeMs) {
  const CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
  let t = timeMs;
  let head = "";
  for (let i = 0; i < 8; i += 1) {
    head = CHARS.charAt(t % 64) + head;
    t = Math.floor(t / 64);
  }
  return `${head}${"a".repeat(12)}`;
}

function runGhostCleanupTests() {
  const freshKey = pushKeyAt(NOW - 3 * HOUR); // 3時間前に作られたキー（作成時刻だけなら消さない）
  const conns = { [freshKey]: NOW - 2 * HOUR, keep: NOW - 20 * MIN, current: NOW, legacyTrue: true };
  assertEqual(selectStaleOwnConnectionIds(conns, "current", NOW, undefined, { serverNowMs: NOW }), [freshKey], "G1: 時刻つきで1時間以上止まった接続だけを選ぶ（20分止まったもの・true・今の接続は選ばない）");
  assertEqual(selectStaleOwnConnectionIds({ current: NOW - 5 * HOUR }, "current", NOW, undefined, { serverNowMs: NOW }), [], "G2: 今の接続は時刻が古くても選ばない");
  assertEqual(selectStaleOwnConnectionIds({ [freshKey]: NOW - 2 * HOUR }, "x", NOW), [freshKey], "G3: serverNowMs を省略したら nowMs で判定（従来の呼び方でも動く）");
  assertEqual(selectStaleOwnConnectionIds({ [freshKey]: true }, "x", NOW, undefined, { serverNowMs: NOW }), [], "G4: true の接続は従来どおり作成時刻（24時間）だけで判定");
}

function runHeartbeatDenialTests() {
  assertEqual(decideHeartbeatDenialAction({ deniedConnectionKey: "-new", currentConnectionKey: "-new", connected: true }), "recreate-connection", "H1: 今使っている接続のノードが消されていたら作り直す");
  assertEqual(decideHeartbeatDenialAction({ deniedConnectionKey: "-old", currentConnectionKey: "-new", connected: true }), "ignore", "H2: 再接続前の古い接続の送り直しが拒否されたら何もしない（書き戻さない）");
  assertEqual(decideHeartbeatDenialAction({ deniedConnectionKey: "-new", currentConnectionKey: "-new", connected: false }), "ignore", "H3: 切断中は作り直さない（再接続時に新しく作る）");
  assertEqual(decideHeartbeatDenialAction({ deniedConnectionKey: null, currentConnectionKey: "-new", connected: true }), "ignore", "H4: 接続ノードを含まない書き込みなら何もしない");
}

async function runPasswordResetTests() {
  const calls = [];
  const user = { uid: "U1", isAnonymous: true, providerData: [] };
  const make = (impl) =>
    createAccountProtection({
      getCurrentUser: () => user,
      makeEmailCredential: () => ({}),
      linkWithCredential: async () => ({ user }),
      signInWithEmailAndPassword: async () => ({ user }),
      sendPasswordResetEmail: async (email) => {
        calls.push(email);
        return impl(email);
      },
    });
  const ok = make(async () => {});
  assertEqual((await ok.requestPasswordReset({ email: "a@example.com" })).ok, false, "K1: 確認前は送らない");
  assertEqual(calls.length, 0, "K1: 確認前は Firebase を呼ばない");
  const sent = await ok.requestPasswordReset({ email: " a@example.com ", confirmed: true });
  assertEqual([sent.ok, sent.sent, calls[0]], [true, true, "a@example.com"], "K2: 前後の空白を除いたメールに送る");
  assertEqual(user.uid, "U1", "K2: 送っても今のログインは変わらない");
  const notFound = make(async () => {
    throw Object.assign(new Error("x"), { code: "auth/user-not-found" });
  });
  const nf = await notFound.requestPasswordReset({ email: "nobody@example.com", confirmed: true });
  assertEqual([nf.ok, nf.sent, nf.reason], [true, false, PASSWORD_RESET_NEUTRAL_MESSAGE], "K3: 登録の無いメールでも同じ文言（登録の有無を漏らさない）");
  const disabled = make(async () => {
    throw Object.assign(new Error("x"), { code: "auth/operation-not-allowed" });
  });
  const dis = await disabled.requestPasswordReset({ email: "a@example.com", confirmed: true });
  assertEqual([dis.ok, dis.sent, dis.reason.includes("Console")], [false, false, true], "K4: メール/パスワードが無効なら、有効にする必要があると説明（送ったことにしない）");
  const bad = await ok.requestPasswordReset({ email: "not-mail", confirmed: true });
  assertEqual(bad.ok, false, "K5: メールの形が正しくなければ送らない");
  const noDep = createAccountProtection({ getCurrentUser: () => user });
  assertEqual((await noDep.requestPasswordReset({ email: "a@example.com", confirmed: true })).ok, false, "K6: 送る関数が無ければ送れないと返す（落ちない）");
  assertEqual(describeAuthErrorJa("auth/user-disabled").includes("無効"), true, "K7: 無効にされたアカウントの説明");
}

async function readSource(path) {
  if (typeof window !== "undefined" && typeof fetch === "function") {
    return (await fetch(path, { cache: "no-store" })).text();
  }
  const fs = await import("node:fs");
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

async function runWiringTests() {
  const src = await readSource("js/presenceSync.js");
  const node = src.slice(src.indexOf("function writeConnectionNode"), src.indexOf("function writeHeartbeat"));
  assertEqual(node.indexOf("set(connectionRef, true).then(") >= 0 && node.indexOf("set(connectionRef, true).then(") < node.indexOf("set(connectionRef, serverTimestamp())"), true, "S1: 接続ノードはまず true で作り、その後に時刻へ書き換える（提案 Rules の data.exists() に合わせる）");
  assertEqual(node.includes("if (snapshot.exists()) rememberConnectionTimestampUnsupported();"), true, "S2: 時刻が拒否されたら、ノードが残っている（＝Rules の問題）ときだけ「使えない」と覚える");
  const hb = src.slice(src.indexOf("function writeHeartbeat"), src.indexOf("async function armPresenceForUid"));
  assertEqual(hb.includes("decideHeartbeatDenialAction(") && hb.includes('action === "recreate-connection"'), true, "S3: ハートビートが拒否されたら、今の接続のときだけ作り直す");
  assertEqual(src.includes("{ serverNowMs: getPresenceNowMs() }"), true, "S4: 古い接続ノードの掃除はサーバー時刻で判定する");
  assertEqual(src.includes("PRESENCE_LASTSEEN_HEARTBEAT_INTERVAL_MS = 120000"), true, "S5: ハートビート間隔（2分）は変えていない");
  // 【2026-10-31改訂・本人の判断「アプリを閉じたのにオンラインのまま」を起こさない】画面が隠れたら自分の接続ノードを外す
  assertEqual(src.includes('if (document.visibilityState === "hidden") {') && src.includes("pausePresenceForBackground()"), true, "S6: 画面が隠れたら、この端末の接続ノードを外す（本人の判断で仕様変更）");
}

export async function runPresenceAuthVerificationTests() {
  runStateBoundaryTests();
  runGhostCleanupTests();
  runHeartbeatDenialTests();
  await runPasswordResetTests();
  await runWiringTests();
}
