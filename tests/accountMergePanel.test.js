// 「以前のあなた／現在のあなた」パネル（js/accountRecoveryPanel.js）の画面テスト（2026-10-28新設）。
// js/identityMergeRunner.js の新しい戻り値（conflicts・rollback・keptBecauseChanged・listHolds・confirmHold）を
// 画面がふつうの日本語で出せているか、保留だけのときに実行ボタンが出るか、「控えを削除する（確認済み）」に確認の手順があるかを確かめる。
//
// 【Firebase に触れない】パネルの context.createMergeRunner で偽の実行役（または、偽の端末・偽のバックアップで動く
// 本物の createIdentityMergeRunner）を渡すので、firebaseClient.js・gstatic の SDK は読み込まない。
// 【node と tests.html の両方で動く】ブラウザでは本物の DOM（document.createElement）を、node では最小限の偽の DOM を使う。
import { assertEqual } from "./test-utils.js";
import {
  mountAccountRecoveryPanel,
  unmountAccountRecoveryPanel,
  describeMergeExecuteResult,
  describeMergeUndoResult,
  describeMergeHold,
  describeMergeKeyLabel,
  CONFIRM_HOLD_MESSAGE,
} from "../js/accountRecoveryPanel.js";
import { createIdentityMergeRunner } from "../js/identityMergeRunner.js";

// ---- node 用の最小限の偽の DOM ----
class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.hidden = false;
    this.textContent = "";
    this.className = "";
    this.listeners = {};
    this.disabled = false;
    this.value = "";
    this.open = false;
    this.title = "";
    const self = this;
    this.classList = {
      add: (c) => {
        self.className = `${self.className} ${c}`.trim();
      },
      contains: (c) => self.className.split(/\s+/).includes(c),
      toggle: () => {},
    };
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  appendChild(n) {
    this.children.push(n);
    return n;
  }
  append(...ns) {
    ns.forEach((n) => this.children.push(n));
  }
  remove() {}
  set innerHTML(_v) {
    this.children = [];
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  dispatchEvent(event) {
    (this.listeners[event.type] ?? []).forEach((fn) => fn(event));
    return true;
  }
  all() {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  querySelectorAll(sel) {
    const nodes = this.all().slice(1);
    if (sel.startsWith(".")) return nodes.filter((n) => n.classList.contains(sel.slice(1)));
    const m = sel.match(/^\[data-role="(.+)"\]$/);
    if (m) return nodes.filter((n) => n.dataset.role === m[1]);
    return nodes.filter((n) => n.tagName === sel.toUpperCase());
  }
}

const useFakeDom = typeof document === "undefined" || typeof document.createElement !== "function";

function createContainer() {
  return useFakeDom ? new FakeNode("div") : document.createElement("div");
}

// 要素の中のすべての子孫（本物の DOM でも偽の DOM でも同じ形で）
function descendants(node) {
  const out = [];
  const walk = (n) => {
    Array.from(n.children ?? []).forEach((c) => {
      out.push(c);
      walk(c);
    });
  };
  walk(node);
  return out;
}

function ownText(node) {
  return String(node.textContent ?? "");
}

function findButton(scope, text) {
  return descendants(scope).find((n) => n.tagName === "BUTTON" && ownText(n) === text) ?? null;
}

function findButtons(scope, text) {
  return descendants(scope).filter((n) => n.tagName === "BUTTON" && ownText(n) === text);
}

function byRole(scope, role) {
  return descendants(scope).find((n) => n.dataset?.role === role) ?? null;
}

function listTexts(listNode) {
  return descendants(listNode)
    .filter((n) => n.tagName === "LI")
    .map((n) => ownText(n));
}

function click(node) {
  node.dispatchEvent(useFakeDom ? { type: "click" } : new Event("click"));
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function statusOf(container) {
  return descendants(container).find((n) => n.className?.split?.(/\s+/).includes("account-recovery-status")) ?? null;
}

const baseContext = {
  getMyUid: () => "UID-ME",
  isAdmin: () => false,
  getRememberedAdminUids: () => [],
  getUidMergeQueue: () => [],
  getPendingUidMerge: () => null,
};

// 偽の実行役（呼ばれ方を記録する）
function createFakeRunner({ dry, executeResult = { ok: true, changedKeyCount: 1, conflicts: [] }, holds = [], undoResult = { ok: false, reason: "元に戻せる整理の控えがありません" }, hasUndo = false, proofOk = true } = {}) {
  const calls = { execute: [], confirmHold: [], undo: 0 };
  const state = { holds: [...holds] };
  const runner = {
    calls,
    compare: async () => ({
      ok: true,
      uid: "UID-ME",
      backupId: "B1",
      proof: { ok: proofOk, reasons: proofOk ? [] : ["この端末に本人確認用の秘密（ownerSecret）がありません"] },
      plan: { summary: { changedKeyCount: dry.changedKeyCount, onlyPreviousTotal: 0, conflictTotal: 0, heldKeyCount: dry.heldKeyCount }, held: dry.held ?? [], writes: {} },
    }),
    dryRun: () => ({ ok: true, lines: ["試算の行"], changedKeyCount: dry.changedKeyCount, heldKeyCount: dry.heldKeyCount, canExecute: proofOk && (dry.changedKeyCount > 0 || (dry.held ?? []).length > 0) }),
    execute: async (comparison, options) => {
      calls.execute.push(options);
      return executeResult;
    },
    undoLast: async () => {
      calls.undo += 1;
      return undoResult;
    },
    hasUndo: () => hasUndo,
    listHolds: () => state.holds,
    confirmHold: (id, options) => {
      calls.confirmHold.push([id, options]);
      if (!options?.confirmed) return { ok: false, reason: "確認が済んでいません" };
      state.holds = state.holds.filter((h) => h.id !== id);
      return { ok: true };
    },
  };
  return runner;
}

async function mountWith(runner) {
  unmountAccountRecoveryPanel();
  const container = createContainer();
  mountAccountRecoveryPanel(container, { ...baseContext, createMergeRunner: async () => runner });
  click(findButton(container, "比べる（読み取りのみ）"));
  await flush();
  click(findButton(container, "整理する（試算を見る）"));
  await flush();
  return container;
}

const HELD_ITEM = { key: "weakSongStats", category: "counters", label: "苦手曲の集計（累積の回数）", reason: "not-mergeable", previous: "{}", current: "{}" };

function runPureTests() {
  assertEqual(describeMergeKeyLabel("achievements"), "称号", "MP1: 論理キーを記録の種類名にする（称号）");
  assertEqual(describeMergeKeyLabel("highScore.5.all"), "自己ベスト（得点）", "MP1: 自己ベストのキーも種類名にする");
  const exec = describeMergeExecuteResult({
    ok: true,
    changedKeyCount: 1,
    heldKeyCount: 1,
    conflicts: [
      { key: "achievements", where: "端末", message: "整理の途中で別のタブ・別の操作がこの記録を変えたため、この項目は整理しませんでした（新しい記録はそのまま）" },
      { key: "playHistory", where: "クラウド", message: "整理の途中で別の端末がクラウドのこの記録を変えたため、クラウド側は書き換えませんでした（次回の通常の同期でそろいます）" },
    ],
  });
  assertEqual(exec[0].startsWith("⚠ この端末の「称号」：整理の途中で別のタブ"), true, "MP2: 衝突（端末）を場所・記録の種類・理由つきで出す");
  assertEqual(exec[1].startsWith("⚠ クラウドのバックアップの「プレイ履歴」"), true, "MP2: 衝突（クラウド）も場所を分けて出す");
  assertEqual(exec.some((l) => l.includes("統合していません") && l.includes("控えに記録しただけ")), true, "MP2: 保留は統合せず控えに記録しただけ、と出す");
  const failed = describeMergeExecuteResult({ ok: false, conflicts: [], rollback: { restored: ["端末:achievements", "クラウド:achievements"], keptBecauseChanged: ["端末:highScore.5.all"] } });
  assertEqual(
    failed,
    [
      "↩ この端末の「称号」は、この整理の前の値に戻しました",
      "↩ クラウドのバックアップの「称号」は、この整理の前の値に戻しました",
      "・この端末の「自己ベスト（得点）」は、別の端末・別のタブで新しく変わっていたので戻しませんでした（新しい記録をそのまま残しています）",
    ],
    "MP3: 失敗時の rollback（戻した／戻さなかった項目）をふつうの日本語で出す"
  );
  assertEqual(
    describeMergeUndoResult({ ok: true, restoredKeyCount: 1, restored: ["端末:achievements"], keptBecauseChanged: ["クラウド:highScore.5.all"] }),
    ["整理前の状態に戻しました（この端末の記録 1種類）", "・クラウドのバックアップの「自己ベスト（得点）」は、別の端末で新しく変わったので戻しませんでした"],
    "MP4: 元に戻すで戻さなかった項目（keptBecauseChanged）を出す"
  );
  assertEqual(describeMergeUndoResult({ ok: false, reason: "元に戻せる整理の控えがありません" }), ["元に戻せる整理の控えがありません"], "MP4: 元に戻せないときは理由だけ");
  const holdLine = describeMergeHold({ id: "p.1", savedAt: new Date(2026, 9, 28, 9, 5).getTime(), items: [HELD_ITEM, { key: "oshiMembers", reason: "current-kept" }], overwritten: [{ key: "achievements" }] });
  assertEqual(
    holdLine,
    "2026/10/28 09:05 の整理の控え：統合していない保留 1種類（苦手曲の集計（累積の回数））・今の値を残した項目の以前の値 1種類（推しメン）・整理で書き換えた項目の整理前の値 1種類",
    "MP5: 保留の控えの1行（日時・保留・今の値を残した項目・書き換えた項目）"
  );
  assertEqual(
    CONFIRM_HOLD_MESSAGE.includes("この端末から削除します") && CONFIRM_HOLD_MESSAGE.includes("元に戻せません") && CONFIRM_HOLD_MESSAGE.includes("整理した記録そのもの") && CONFIRM_HOLD_MESSAGE.includes("消えません"),
    true,
    "MP6: 「控えを削除する（確認済み）」の説明は、控えを削除すること・記録そのものは消えないことを正確に書く"
  );
}

async function runPanelTests() {
  // MP7. 保留だけ（changedKeyCount 0・heldKeyCount 1）でも実行ボタンを出し、「統合はしない・控えに記録するだけ」と説明する
  {
    const runner = createFakeRunner({ dry: { changedKeyCount: 0, heldKeyCount: 1, held: [HELD_ITEM] }, executeResult: { ok: true, changedKeyCount: 0, snapshotId: "s", holdId: "h", conflicts: [], already: [], heldKeyCount: 1 } });
    const container = await mountWith(runner);
    const execButton = findButton(container, "控えだけ記録する（統合はしません）");
    assertEqual([!!execButton, execButton?.hidden, execButton?.disabled], [true, false, false], "MP7: 保留だけでも実行ボタンを出す（押せる）");
    const note = byRole(container, "merge-held-only-note");
    assertEqual([note.hidden, ownText(note).includes("統合せず") && ownText(note).includes("記録するだけ")], [false, true], "MP7: 保留は記録するだけで統合しないと説明する");
    click(execButton);
    const confirmYes = findButton(container, "本当に整理する");
    const confirmBox = confirmYes ? descendants(container).find((n) => Array.from(n.children ?? []).includes(confirmYes)) : null;
    assertEqual([confirmBox?.hidden, ownText(Array.from(confirmBox?.children ?? [])[0] ?? {}).includes("統合はせず")], [false, true], "MP7: 確認の文も「統合はせず控えとして記録する」");
    assertEqual(runner.calls.execute.length, 0, "MP7: 確認ボタンを押すまで実行しない");
    click(confirmYes);
    await flush();
    assertEqual(runner.calls.execute, [{ confirmed: true }], "MP7: 確認後に1回だけ実行（confirmed: true）");
    assertEqual(ownText(statusOf(container)).startsWith("控えを記録しました。統合はしていません"), true, "MP7: 結果は「控えを記録した・統合はしていない」");
  }
  // MP8. 何も無い（changedKeyCount 0・保留 0）なら実行ボタンは出さない
  {
    const runner = createFakeRunner({ dry: { changedKeyCount: 0, heldKeyCount: 0, held: [] } });
    const container = await mountWith(runner);
    const execButton = findButton(container, "この内容で整理する");
    assertEqual(execButton?.hidden, true, "MP8: 違いも保留も無ければ実行ボタンは隠れたまま");
  }
  // MP9. 本人の確認が取れないときは、保留だけでも押せない
  {
    const runner = createFakeRunner({ dry: { changedKeyCount: 0, heldKeyCount: 1, held: [HELD_ITEM] }, proofOk: false });
    const container = await mountWith(runner);
    const execButton = findButton(container, "控えだけ記録する（統合はしません）");
    assertEqual([execButton?.hidden, execButton?.disabled, ownText(statusOf(container)).includes("本人の確認が取れていない")], [false, true, true], "MP9: 本人の確認が無ければ実行ボタンは押せず、理由を出す");
  }
  // MP10. 実行結果の conflicts を内訳に出す
  {
    const runner = createFakeRunner({
      dry: { changedKeyCount: 2, heldKeyCount: 0 },
      executeResult: { ok: true, changedKeyCount: 1, snapshotId: "s", holdId: "h", heldKeyCount: 0, already: [], conflicts: [{ key: "playHistory", where: "端末", message: "整理の途中で別のタブ・別の操作がこの記録を変えたため、この項目は整理しませんでした（新しい記録はそのまま）" }] },
      hasUndo: true,
    });
    const container = await mountWith(runner);
    click(findButton(container, "この内容で整理する"));
    click(findButton(container, "本当に整理する"));
    await flush();
    const lines = listTexts(byRole(container, "merge-result"));
    assertEqual([byRole(container, "merge-result").hidden, lines.length, lines[0]?.startsWith("⚠ この端末の「プレイ履歴」：整理の途中で別のタブ")], [false, 1, true], "MP10: 衝突した項目を内訳に出す");
    assertEqual(ownText(statusOf(container)).includes("整理しなかった項目が 1件あります"), true, "MP10: 状態の行にも衝突の件数を出す");
  }
  // MP11. 失敗時の rollback（戻した／戻さなかった項目）を内訳に出す
  {
    const runner = createFakeRunner({
      dry: { changedKeyCount: 2, heldKeyCount: 0 },
      executeResult: { ok: false, reason: "途中で書き込みに失敗したため、この整理で書いた値を元に戻しました", conflicts: [], rollback: { restored: ["端末:achievements"], keptBecauseChanged: ["端末:highScore.5.all"] }, holdId: "h" },
    });
    const container = await mountWith(runner);
    click(findButton(container, "この内容で整理する"));
    click(findButton(container, "本当に整理する"));
    await flush();
    const lines = listTexts(byRole(container, "merge-result"));
    assertEqual(
      [ownText(statusOf(container)).startsWith("途中で書き込みに失敗した"), lines.some((l) => l.includes("「称号」は、この整理の前の値に戻しました")), lines.some((l) => l.includes("「自己ベスト（得点）」は、別の端末・別のタブで新しく変わっていたので戻しませんでした"))],
      [true, true, true],
      "MP11: 失敗の理由と、戻した項目・戻さなかった項目を出す"
    );
  }
  // MP12. 保留の控えの一覧と「控えを削除する（確認済み）」（確認の手順つき）
  {
    const holds = [
      { id: "default.100", savedAt: 100, items: [HELD_ITEM], overwritten: [] },
      { id: "default.200", savedAt: 200, items: [HELD_ITEM], overwritten: [] },
    ];
    const runner = createFakeRunner({ dry: { changedKeyCount: 0, heldKeyCount: 0 }, holds });
    const container = await mountWith(runner);
    const holdsBox = byRole(container, "merge-holds");
    assertEqual([holdsBox.hidden, findButtons(holdsBox, "控えを削除する（確認済み）").length], [false, 2], "MP12: 比べた後に保留の控えを一覧で出す（1件ごとにボタン）");
    click(findButtons(holdsBox, "控えを削除する（確認済み）")[0]);
    const yes = findButtons(holdsBox, "はい、控えを削除する")[0];
    const confirmRow = descendants(holdsBox).find((n) => Array.from(n.children ?? []).includes(yes));
    assertEqual([confirmRow.hidden, ownText(Array.from(confirmRow.children)[0])], [false, CONFIRM_HOLD_MESSAGE], "MP12: 押すとまず確認の文を出す（まだ消さない）");
    assertEqual(runner.calls.confirmHold.length, 0, "MP12: 確認の前には confirmHold を呼ばない");
    click(findButtons(holdsBox, "やめる")[0]);
    assertEqual([confirmRow.hidden, runner.calls.confirmHold.length], [true, 0], "MP12: 「やめる」なら何もしない");
    click(findButtons(holdsBox, "控えを削除する（確認済み）")[0]);
    click(yes);
    await flush();
    assertEqual(runner.calls.confirmHold, [["default.100", { confirmed: true }]], "MP12: 「はい」で confirmHold(id, { confirmed: true }) を1回だけ呼ぶ");
    assertEqual([findButtons(holdsBox, "控えを削除する（確認済み）").length, ownText(statusOf(container)).startsWith("控えを削除しました（確認済み）")], [1, true], "MP12: 一覧を読み直し、確認済みにした控えは消える");
  }
  // MP13. 元に戻す：戻さなかった項目（keptBecauseChanged）を出す
  {
    const runner = createFakeRunner({
      dry: { changedKeyCount: 0, heldKeyCount: 0 },
      hasUndo: true,
      undoResult: { ok: true, restoredKeyCount: 1, restored: ["端末:achievements"], keptBecauseChanged: ["端末:playHistory"] },
    });
    const container = await mountWith(runner);
    const undo = findButton(container, "直前の整理を元に戻す");
    assertEqual(undo?.hidden, false, "MP13: 控えがあれば「元に戻す」を出す");
    click(undo);
    await flush();
    const lines = listTexts(byRole(container, "merge-result"));
    assertEqual(
      [ownText(statusOf(container)).startsWith("整理前の状態に戻しました（この端末の記録 1種類）"), lines],
      [true, ["・この端末の「プレイ履歴」は、別の端末で新しく変わったので戻しませんでした"]],
      "MP13: 「別の端末で新しく変わったので戻しませんでした」を項目ごとに出す"
    );
  }
}

// MP14. 本物の実行役（偽の端末・偽のバックアップ）でも：保留だけで実行→控えが1件→確認済みにすると控えは削除される
// （確認の文「この端末から削除します」が confirmHold() の実際の動きと一致していることの確認）
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

async function runRealRunnerTests() {
  const prefix = "equalLoveIntroQuiz.";
  const prevWs = JSON.stringify({ schemaVersion: 1, songs: { s1: { attempts: 10, correct: 4 } } });
  const curWs = JSON.stringify({ schemaVersion: 1, songs: { s1: { attempts: 3, correct: 1 } } });
  const storage = new MemoryStorage();
  storage.setItem(`${prefix}weakSongStats`, curWs);
  const runner = createIdentityMergeRunner({
    storage,
    getStoragePrefix: () => prefix,
    getPlayerId: () => "default",
    getCurrentUid: () => "UID-ME",
    getBackupId: () => "B1",
    hasOwnerSecret: () => true,
    readBackup: async () => ({ ok: true, currentUid: "UID-ME", entries: { weakSongStats: prevWs } }),
    collectLocalEntries: () => ({ weakSongStats: storage.getItem(`${prefix}weakSongStats`) }),
    now: () => 1761600000000,
  });
  unmountAccountRecoveryPanel();
  const container = createContainer();
  mountAccountRecoveryPanel(container, { ...baseContext, createMergeRunner: async () => runner });
  click(findButton(container, "比べる（読み取りのみ）"));
  await flush();
  click(findButton(container, "整理する（試算を見る）"));
  await flush();
  const execButton = findButton(container, "控えだけ記録する（統合はしません）");
  assertEqual(execButton?.hidden === false && execButton?.disabled === false, true, "MP14: 本物の実行役でも保留だけのとき実行ボタンが出る");
  click(execButton);
  click(findButton(container, "本当に整理する"));
  await flush();
  assertEqual([storage.getItem(`${prefix}weakSongStats`), runner.listHolds().length], [curWs, 1], "MP14: 端末の値は変えず、控えが1件できる");
  const holdsBox = byRole(container, "merge-holds");
  assertEqual(findButtons(holdsBox, "控えを削除する（確認済み）").length, 1, "MP14: 実行後の一覧に控えが出る");
  click(findButtons(holdsBox, "控えを削除する（確認済み）")[0]);
  click(findButtons(holdsBox, "はい、控えを削除する")[0]);
  await flush();
  assertEqual([runner.listHolds().length, storage.getItem(`${prefix}weakSongStats`)], [0, curWs], "MP14: 確認済みにすると控えは削除される（端末の記録そのものは変わらない）＝確認の文どおり");
  unmountAccountRecoveryPanel();
}

export async function runAccountMergePanelTests() {
  const prevDocument = globalThis.document;
  const installedFake = useFakeDom;
  if (installedFake) globalThis.document = { createElement: (tag) => new FakeNode(tag) };
  try {
    runPureTests();
    await runPanelTests();
    await runRealRunnerTests();
  } finally {
    unmountAccountRecoveryPanel();
    if (installedFake) globalThis.document = prevDocument;
  }
}
