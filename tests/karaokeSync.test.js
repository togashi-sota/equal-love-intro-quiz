// js/karaokeSync.js（カラオケ同期の計算・状態）のテスト。
// すべて純粋関数のため、実時間の待機には一切依存せず、monotonic時刻を自分で注入して
// 決定論的にテストする（本人指示どおり）。
import {
  createKaraokeSyncState,
  startKaraokeSync,
  resetKaraokeSync,
  getKaraokePositionSec,
  adjustOffsetMs,
  reportCallTooEarly,
  reportCallTooLate,
  resyncToPosition,
  findActiveCallIndex,
  findNextCall,
  selectSyncPointCandidates,
  findCurrentOrNextSyncPoint,
  getSecondsUntil,
  shouldShowSyncCheck,
  formatOffsetLabel,
  formatKaraokeMmSs,
} from "../js/karaokeSync.js";
import { assertEqual } from "./test-utils.js";

export function runKaraokeSyncTests() {
  // ===== 0秒から同期開始 =====
  {
    const state0 = createKaraokeSyncState();
    assertEqual(state0.isSyncing, false, "初期状態は同期していない");
    assertEqual(getKaraokePositionSec(state0, 10000), null, "同期前はnullを返す");

    const started = startKaraokeSync(state0, 5000);
    assertEqual(started.isSyncing, true, "曲スタート後はisSyncingがtrue");
    assertEqual(getKaraokePositionSec(started, 5000), 0, "曲スタート直後の位置は0秒");
    assertEqual(getKaraokePositionSec(started, 8000), 3, "3000ms経過で3秒になる");
  }

  // ===== offset補正（+/-） =====
  {
    let state = startKaraokeSync(createKaraokeSyncState(), 0);
    state = reportCallTooLate(state, 300); // 「コールが遅い」→ offsetを増やして早める
    assertEqual(state.offsetMs, 300, "「コールが遅い」でoffsetが+300msされる");
    assertEqual(getKaraokePositionSec(state, 1000), 1.3, "offset+300msぶん位置が前に進む");

    state = reportCallTooEarly(state, 300); // 「コールが早い」→ offsetを減らして遅らせる
    assertEqual(state.offsetMs, 0, "「コールが早い」でoffsetが-300msされ、元に戻る");

    state = reportCallTooEarly(state, 500);
    assertEqual(state.offsetMs, -500, "「コールが早い」を単独で押すと負の値になる");
    assertEqual(getKaraokePositionSec(state, 1000), 0.5, "負のoffsetぶん位置が遅れる");
  }

  // ===== adjustOffsetMsの符号は常にdeltaの符号どおり =====
  {
    let state = adjustOffsetMs(createKaraokeSyncState(), 100);
    assertEqual(state.offsetMs, 100, "adjustOffsetMs(+100)");
    state = adjustOffsetMs(state, -250);
    assertEqual(state.offsetMs, -150, "adjustOffsetMsの累積が正しい");
  }

  // ===== 「今！」による再同期 =====
  {
    // 曲スタートから10秒経過した時点（実際には多少ずれている）で、
    // 「このコールのstart=12秒が今起きた」として「今！」を押した場合。
    let state = startKaraokeSync(createKaraokeSyncState(), 0);
    state = resyncToPosition(state, 12, 10000); // 経過10秒の時点でstart=12秒に合わせる
    assertEqual(state.offsetMs, 2000, "resyncToPositionは経過時間との差分をoffsetにする");
    assertEqual(getKaraokePositionSec(state, 10000), 12, "再同期した瞬間の位置はtargetと一致する");
    assertEqual(getKaraokePositionSec(state, 11000), 13, "再同期後も1秒経過すれば1秒進む");
    assertEqual(state.lastResyncAtPositionSec, 12, "最後に再同期した位置が記録される");

    // 再同期を2回行っても、古いoffsetの影響を受けず、その時点の経過時間から1回で正しく計算し直す。
    state = resyncToPosition(state, 12, 10000); // 直前の状態からさらに、同じ時刻でもう一度押した想定
    const state2 = resyncToPosition(state, 20, 20000);
    assertEqual(getKaraokePositionSec(state2, 20000), 20, "2回目の再同期でも正しく合う");
  }

  // 同期開始前に「今！」を押しても何も起きない（安全な無視）。
  {
    const state = createKaraokeSyncState();
    const after = resyncToPosition(state, 5, 1000);
    assertEqual(after, state, "同期開始前のresyncToPositionは状態を変えない");
  }

  // ===== 同期をやり直す =====
  {
    let state = startKaraokeSync(createKaraokeSyncState(), 0);
    state = reportCallTooLate(state, 500);
    state = resetKaraokeSync(state);
    assertEqual(state.isSyncing, false, "同期をやり直すとisSyncingがfalseに戻る");
    assertEqual(state.offsetMs, 0, "同期をやり直すとoffsetもリセットされる");
  }

  // ===== コール検索 =====
  const calls = [
    { start: 2, end: 3, text: "はい！" },
    { start: 5, end: 18, text: "ここでMIXが長く続く長文の掛け声がずっと入るシーン" },
    { start: 20, end: 21, text: "オレ！" },
    { start: 25, end: 26, text: "せーの" },
  ];

  assertEqual(findActiveCallIndex(calls, 1), -1, "開始前はどのコールもアクティブでない");
  assertEqual(findActiveCallIndex(calls, 2.5), 0, "1件目のコール区間内でアクティブになる");
  assertEqual(findActiveCallIndex(calls, 3), -1, "end時刻ちょうどはアクティブでない（半開区間）");
  assertEqual(findActiveCallIndex(calls, 10), 1, "長文コールの区間内でもアクティブと判定される");

  assertEqual(findNextCall(calls, 0)?.text, "はい！", "0秒時点の次のコールは1件目");
  assertEqual(findNextCall(calls, 2.5)?.text, "ここでMIXが長く続く長文の掛け声がずっと入るシーン", "アクティブ中でも次のコールを取得できる");
  assertEqual(findNextCall(calls, 26), null, "最後のコールより後ろでは次のコールが無い（null）");

  // ===== 同期ポイント選定 =====
  {
    const candidates = selectSyncPointCandidates(calls);
    assertEqual(
      candidates.map((c) => c.text),
      ["はい！", "オレ！", "せーの"],
      "短いコールだけが同期ポイント候補になる（長文MIXは除外）"
    );
  }
  {
    // 短いコールが1件も無い曲では、無理に絞り込まず全コールへフォールバックする。
    const longOnly = [{ start: 1, end: 15, text: "長い口上がずっと続くシーンのテキスト例" }];
    const candidates = selectSyncPointCandidates(longOnly);
    assertEqual(candidates.length, 1, "短いコールが無い曲は全コールにフォールバックする");
  }

  {
    const candidates = selectSyncPointCandidates(calls);
    assertEqual(findCurrentOrNextSyncPoint(candidates, 0)?.text, "はい！", "開始直後の同期ポイントは1件目");
    assertEqual(findCurrentOrNextSyncPoint(candidates, 2.5)?.text, "はい！", "同期ポイントがアクティブ中はそれ自身を返す");
    assertEqual(findCurrentOrNextSyncPoint(candidates, 10)?.text, "オレ！", "長文コール中は次の同期ポイント候補を返す（長文自体は候補にならない）");
    assertEqual(findCurrentOrNextSyncPoint(candidates, 30), null, "曲の最後まで進むと同期ポイントが無くなる");
  }

  // ===== 残り秒数 =====
  assertEqual(getSecondsUntil(10, 3.6), 6.4, "残り秒数は単純な引き算");
  assertEqual(getSecondsUntil(10, 12), 0, "過ぎている場合は0未満にならない");

  // ===== 同期チェックの表示判定 =====
  {
    const nextSyncPointCall = { start: 20, end: 21, text: "オレ！" };
    assertEqual(
      shouldShowSyncCheck({ nextSyncPointCall, positionSec: 16, lastShownAtPositionSec: null }),
      true,
      "5秒より手前に近づいたら表示してよい"
    );
    assertEqual(
      shouldShowSyncCheck({ nextSyncPointCall, positionSec: 10, lastShownAtPositionSec: null }),
      false,
      "まだ遠い（leadSecより前）ときは表示しない"
    );
    assertEqual(
      shouldShowSyncCheck({ nextSyncPointCall, positionSec: 21, lastShownAtPositionSec: null }),
      false,
      "コールを過ぎてからは表示しない"
    );
    assertEqual(
      shouldShowSyncCheck({ nextSyncPointCall, positionSec: 16, lastShownAtPositionSec: 0 }),
      false,
      "直前に表示済みなら、最低間隔（既定40秒）未満では再表示しない"
    );
    const laterSyncPointCall = { start: 50, end: 51, text: "せーの" };
    assertEqual(
      shouldShowSyncCheck({ nextSyncPointCall: laterSyncPointCall, positionSec: 46, lastShownAtPositionSec: 0 }),
      true,
      "最低間隔を過ぎ、かつ次の同期ポイントが近づいていれば再表示してよい"
    );
    assertEqual(
      shouldShowSyncCheck({ nextSyncPointCall: null, positionSec: 16, lastShownAtPositionSec: null }),
      false,
      "対象となる同期ポイントが無ければ表示しない"
    );
  }

  // ===== フォーマッタ =====
  assertEqual(formatOffsetLabel(0), "調整なし", "offset0のときは「調整なし」と表示する");
  assertEqual(formatOffsetLabel(300), "+0.3秒", "正のoffsetは+で表示する");
  assertEqual(formatOffsetLabel(-1200), "-1.2秒", "負のoffsetは-で表示する");
  assertEqual(formatKaraokeMmSs(84), "1:24", "84秒は1:24と表示する");
  assertEqual(formatKaraokeMmSs(0), "0:00", "0秒は0:00と表示する");
  assertEqual(formatKaraokeMmSs(-5), "0:00", "負の値は0:00に丸める（安全側）");
}
