// js/karaokeSync.js（カラオケ同期の計算・状態）のテスト。
// すべて純粋関数のため、実時間の待機には一切依存せず、monotonic時刻を自分で注入して
// 決定論的にテストする（本人指示どおり）。
import {
  createKaraokeSyncState,
  startKaraokeSync,
  resetKaraokeSync,
  getKaraokePositionSec,
  adjustOffsetMs,
  resetOffsetToZero,
  resyncToPosition,
  findActiveCallIndex,
  findNextCall,
  selectSyncPointCandidates,
  findCurrentOrNextSyncPoint,
  getSecondsUntil,
  formatOffsetLabel,
  formatKaraokeMmSs,
  getNextCallCountdownDisplay,
  getCallDisplayTier,
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

  // ===== タイミング調整（offsetの符号を具体的なシナリオで検証） =====
  // 「曲スタート」を実際より1秒遅れて押した場合、アプリの経過時間は本当のカラオケより
  // 常に1秒少なく計算される＝コール表示は本来より遅れて出る。これを追いつかせる
  // （＝早める）には、offsetを増やす必要がある。
  {
    let state = startKaraokeSync(createKaraokeSyncState(), 0);
    state = adjustOffsetMs(state, 300); // 「早める」+0.3秒
    assertEqual(state.offsetMs, 300, "「早める」でoffsetが+300msされる");
    assertEqual(getKaraokePositionSec(state, 1000), 1.3, "offsetを増やすと計算上の位置が前に進む＝表示が早まる");

    state = adjustOffsetMs(state, -300); // 「遅らせる」-0.3秒
    assertEqual(state.offsetMs, 0, "「遅らせる」でoffsetが-300msされ、元に戻る");

    state = adjustOffsetMs(state, -500); // 「遅らせる」を単独で
    assertEqual(state.offsetMs, -500, "「遅らせる」を単独で押すと負の値になる");
    assertEqual(getKaraokePositionSec(state, 1000), 0.5, "offsetを減らすと計算上の位置が遅れる＝表示が遅くなる");

    state = resetOffsetToZero(state);
    assertEqual(state.offsetMs, 0, "0に戻すボタンでoffsetがちょうど0になる");
    assertEqual(state.isSyncing, true, "0に戻しても同期自体は継続したまま（isSyncingは変わらない）");
    assertEqual(state.syncStartAtMs, 0, "0に戻しても同期開始時刻は変わらない（曲の位置は維持される）");
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

  // ===== 曲を最初からやり直す =====
  {
    let state = startKaraokeSync(createKaraokeSyncState(), 0);
    state = adjustOffsetMs(state, 500);
    state = resetKaraokeSync(state);
    assertEqual(state.isSyncing, false, "やり直すとisSyncingがfalseに戻る");
    assertEqual(state.offsetMs, 0, "やり直すとoffsetもリセットされる");
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

  // ===== フォーマッタ =====
  assertEqual(formatOffsetLabel(0), "調整なし", "offset0のときは「調整なし」と表示する");
  assertEqual(formatOffsetLabel(300), "+0.3秒", "正のoffsetは+で表示する");
  assertEqual(formatOffsetLabel(-1200), "-1.2秒", "負のoffsetは-で表示する");
  assertEqual(formatKaraokeMmSs(84), "1:24", "84秒は1:24と表示する");
  assertEqual(formatKaraokeMmSs(0), "0:00", "0秒は0:00と表示する");
  assertEqual(formatKaraokeMmSs(-5), "0:00", "負の値は0:00に丸める（安全側）");

  // ===== NEXT CALLカードの表示段階 =====
  assertEqual(getNextCallCountdownDisplay(7.2, false), { phase: "upcoming", eyebrow: "NEXT CALL", text: "あと7.2秒" }, "3秒より前はupcoming表示");
  assertEqual(getNextCallCountdownDisplay(3.0, false), { phase: "imminent", eyebrow: "もうすぐ！", text: "3" }, "ちょうど3秒はimminent側（境界値）");
  assertEqual(getNextCallCountdownDisplay(2.9, false), { phase: "imminent", eyebrow: "もうすぐ！", text: "3" }, "2.9秒は3と表示する");
  assertEqual(getNextCallCountdownDisplay(2.0, false), { phase: "imminent", eyebrow: "もうすぐ！", text: "2" }, "ちょうど2秒は2と表示する");
  assertEqual(getNextCallCountdownDisplay(1.1, false), { phase: "imminent", eyebrow: "もうすぐ！", text: "2" }, "1.1秒は2と表示する");
  assertEqual(getNextCallCountdownDisplay(1.0, false), { phase: "imminent", eyebrow: "もうすぐ！", text: "1" }, "ちょうど1秒は1と表示する");
  assertEqual(getNextCallCountdownDisplay(0.1, false), { phase: "imminent", eyebrow: "もうすぐ！", text: "1" }, "0.1秒は1と表示する（0を表示しない）");
  assertEqual(getNextCallCountdownDisplay(0, true), { phase: "now", eyebrow: "コール中！", text: "" }, "アクティブ中はisActive優先でnowになる");
  assertEqual(getNextCallCountdownDisplay(5, true), { phase: "now", eyebrow: "コール中！", text: "" }, "secondsUntilの値に関わらずisActiveがtrueならnow");

  // ===== コール表示の文字サイズ段階（UI/UX第3版で追加） =====
  assertEqual(getCallDisplayTier("はい！"), "short", "6文字以下はshort（既存バースト演出の基準と統一）");
  assertEqual(getCallDisplayTier("オレ！"), "short", "短いコールはshort");
  assertEqual(getCallDisplayTier("せーのっ、いくよー！"), "medium", "7〜20文字はmedium");
  assertEqual(getCallDisplayTier("あ".repeat(20)), "medium", "ちょうど20文字はmedium（境界値）");
  assertEqual(getCallDisplayTier("あ".repeat(21)), "long", "21文字以上はlong（境界値）");
  assertEqual(
    getCallDisplayTier("ここでMIXが長く続く長文の掛け声がずっと入るシーンのテキスト例"),
    "long",
    "長文MIXはlong"
  );
}
