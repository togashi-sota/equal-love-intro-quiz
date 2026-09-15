// パーティー対戦（2026-09-15新設）の入力判定（js/partyBattleInput.js）・音声回答の時間計算
// （js/partyBattleVoice.js）・曲名マッチング（js/songNameMatcher.js）・保存データ（js/partyBattleStorage.js）
// のテスト。実際のWeb Speech APIは呼ばない（本人確定：CI／desktopで実サービス成功を「テスト済み」と偽らない）。

import {
  createClaimArbiter,
  isLongPressSatisfied,
  computeLongPressProgress,
  createLongPressTracker,
  attachPressHandler,
  attachLongPressHandler,
} from "../js/partyBattleInput.js";
import {
  computeVoiceDeadline,
  isSpeechRecognitionSupported,
  startVoiceRecognitionSession,
  isVoiceFatalEndReason,
  requestMicrophonePermission,
  runVoiceRecognitionTest,
  describeVoiceEnvironment,
  getVoiceDiagnostics,
  clearVoiceDiagnostics,
  markVoiceRecognitionUnavailable,
  resetVoiceRecognitionAvailability,
  isVoiceRecognitionAvailable,
  VOICE_STAGE,
} from "../js/partyBattleVoice.js";
import {
  normalizeSpokenText,
  isKanaOnly,
  resolveSpokenReading,
  SPOKEN_HOMOPHONE_READINGS,
  buildSongNameCandidates,
  computeEditDistance,
  resolveAllowedEditDistance,
  scoreSongAgainstSpokenText,
  matchSpokenSongName,
  decideVoiceVerdict,
} from "../js/songNameMatcher.js";
import { SONGS } from "../js/data/songs.js";
import {
  getRecentPartyPlayerNames,
  rememberPartyPlayerNames,
  getLastPartySettings,
  saveLastPartySettings,
  buildPartyBattleHistoryEntry,
} from "../js/partyBattleStorage.js";
import { normalizePartySettings, buildPartyPlayers, createPartyMatch } from "../js/partyBattleState.js";
import { assertEqual } from "./test-utils.js";

let nextPointerId = 100;

function makePartyButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.style.position = "fixed";
  button.style.left = "0px";
  button.style.top = "0px";
  button.style.width = "100px";
  button.style.height = "50px";
  document.body.appendChild(button);
  return button;
}

function firePointer(target, type, { x, y, pointerId, timeStamp }) {
  const event = new PointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true, cancelable: true });
  if (typeof timeStamp === "number") {
    Object.defineProperty(event, "timeStamp", { value: timeStamp });
  }
  target.dispatchEvent(event);
}

export function runPartyBattleInputTests() {
  // ===== 早押しの受理：START前の指は無効、最初の1件だけ =====
  const arbiter = createClaimArbiter();
  assertEqual(arbiter.tryClaim(100), false, "enable前は何も受理しない");
  arbiter.enable(1000);
  assertEqual(arbiter.tryClaim(900), false, "START前（enable時刻より前）に始まったpointerはフライングとして拒否");
  assertEqual(arbiter.tryClaim(null), false, "押し始めが確認できない操作（pointerを経由しないclick等）は拒否");
  assertEqual(arbiter.tryClaim(1000), true, "START時刻ちょうどのpointerは受理");
  assertEqual(arbiter.tryClaim(1001), false, "同時に近い2件目は拒否（最初の1件だけ）");
  assertEqual(arbiter.isEnabled(), false, "受理した瞬間にロックが立つ");
  arbiter.enable(2000);
  assertEqual(arbiter.tryClaim(2500), true, "次の問題（再enable）では再び受理できる");
  arbiter.disable();
  assertEqual(arbiter.tryClaim(9999), false, "disable後は受理しない");

  // ===== 回答ボタン：pointerdownでは確定せず、ボタン上でpointerupして確定（既存クイズと同じUX） =====
  {
    const button = makePartyButton();
    const confirms = [];
    attachPressHandler(button, (startedAt) => confirms.push(startedAt));
    const pointerId = nextPointerId++;
    firePointer(button, "pointerdown", { x: 50, y: 25, pointerId, timeStamp: 5000 });
    assertEqual(confirms.length, 0, "pointerdownだけでは回答しない");
    assertEqual(button.classList.contains("is-pressed"), true, "押している間は .is-pressed（へこみ表現）が付く");
    firePointer(button, "pointerup", { x: 50, y: 25, pointerId });
    assertEqual(confirms, [5000], "ボタン上でpointerupすると1回だけ確定し、押し始めのtimeStampが渡る");
    assertEqual(button.classList.contains("is-pressed"), false, "確定後は .is-pressed が外れる");
    button.remove();
  }
  {
    const button = makePartyButton();
    const confirms = [];
    attachPressHandler(button, (startedAt) => confirms.push(startedAt));
    const pointerId = nextPointerId++;
    firePointer(button, "pointerdown", { x: 50, y: 25, pointerId, timeStamp: 1 });
    firePointer(button, "pointermove", { x: 400, y: 300, pointerId });
    assertEqual(button.classList.contains("is-pressed"), false, "ボタン外へスライドした瞬間に押下表現が解除される");
    firePointer(button, "pointerup", { x: 400, y: 300, pointerId });
    assertEqual(confirms.length, 0, "ボタン外へスライドして離すとキャンセル（回答しない）");
    button.remove();
  }
  {
    const button = makePartyButton();
    const confirms = [];
    attachPressHandler(button, (startedAt) => confirms.push(startedAt));
    const pointerId = nextPointerId++;
    firePointer(button, "pointerdown", { x: 50, y: 25, pointerId, timeStamp: 1 });
    firePointer(button, "pointercancel", { x: 50, y: 25, pointerId });
    assertEqual(confirms.length, 0, "pointercancel（着信・OSジェスチャー等）はキャンセル");
    assertEqual(button.classList.contains("is-pressed"), false, "pointercancelでも押下表現が解除される");
    button.remove();
  }
  // ===== フライング：START前に押した指をSTART後に離しても無効。START後の指は有効 =====
  {
    const button = makePartyButton();
    const arb = createClaimArbiter();
    const accepted = [];
    attachPressHandler(button, (startedAt) => accepted.push(arb.tryClaim(startedAt)));
    const early = nextPointerId++;
    firePointer(button, "pointerdown", { x: 50, y: 25, pointerId: early, timeStamp: 900 });
    arb.enable(1000); // START
    firePointer(button, "pointerup", { x: 50, y: 25, pointerId: early });
    assertEqual(accepted, [false], "START前pointerdown→START後pointerupは無効（フライング）");
    const fresh = nextPointerId++;
    firePointer(button, "pointerdown", { x: 50, y: 25, pointerId: fresh, timeStamp: 1200 });
    firePointer(button, "pointerup", { x: 50, y: 25, pointerId: fresh });
    assertEqual(accepted, [false, true], "START後に新しく始まったpointerの有効なpointerupは回答になる");
    button.remove();
  }
  // ===== 早押し競合：先に押しただけでは権利を予約しない。最初の有効なpointerupが勝つ。後続は無効 =====
  {
    const buttonA = makePartyButton();
    const buttonB = makePartyButton();
    buttonB.style.top = "60px";
    const arb = createClaimArbiter();
    const winners = [];
    attachPressHandler(buttonA, (startedAt) => {
      if (arb.tryClaim(startedAt)) winners.push("P1");
    });
    attachPressHandler(buttonB, (startedAt) => {
      if (arb.tryClaim(startedAt)) winners.push("P2");
    });
    arb.enable(1000);
    const p1 = nextPointerId++;
    const p2 = nextPointerId++;
    firePointer(buttonA, "pointerdown", { x: 50, y: 25, pointerId: p1, timeStamp: 1100 }); // P1が先に押す
    firePointer(buttonB, "pointerdown", { x: 50, y: 85, pointerId: p2, timeStamp: 1150 }); // P2が後に押す
    firePointer(buttonB, "pointerup", { x: 50, y: 85, pointerId: p2 }); // P2が先に離す
    firePointer(buttonA, "pointerup", { x: 50, y: 25, pointerId: p1 }); // P1が後に離す
    assertEqual(winners, ["P2"], "先に離した（最初に成立した）P2が回答権を取り、後続のP1のpointerupは無効（二重得点なし）");
    buttonA.remove();
    buttonB.remove();
  }

  // ===== 長押しの純粋判定 =====
  assertEqual(isLongPressSatisfied(0, 999, 1000), false, "1秒未満のタップでは全員PASSは成立しない");
  assertEqual(isLongPressSatisfied(0, 1000, 1000), true, "1秒押し続けたら成立");
  assertEqual(isLongPressSatisfied(null, 1000, 1000), false, "押していない状態では成立しない");
  assertEqual(computeLongPressProgress(0, 500, 1000), 0.5, "進捗は0〜1");
  assertEqual(computeLongPressProgress(0, 1500, 1000), 1, "進捗は1で頭打ち");

  // ===== 長押しの状態機械（全員PASS 1秒／終了 2秒） =====
  {
    const rect = { left: 0, top: 0, right: 100, bottom: 50 };
    const tracker = createLongPressTracker({ durationMs: 1000 });
    tracker.down(0, rect);
    assertEqual(tracker.tick(500).progress, 0.5, "0.5秒で進捗50%");
    assertEqual(tracker.tick(999).justCompleted, false, "1秒未満では成立しない");
    const done = tracker.tick(1000);
    assertEqual(done.justCompleted, true, "1秒ちょうどで成立（1回だけ）");
    assertEqual(tracker.tick(1500).justCompleted, false, "成立後のtickでは二重発火しない");
    assertEqual(tracker.up(1600, 50, 25).justCompleted, false, "成立後に指を離しても二重発火しない");

    const quit = createLongPressTracker({ durationMs: 2000 });
    quit.down(0, rect);
    assertEqual(quit.tick(1999).justCompleted, false, "終了は2秒未満では成立しない");
    assertEqual(quit.tick(2000).justCompleted, true, "終了は2秒で成立");

    const released = createLongPressTracker({ durationMs: 1000 });
    released.down(0, rect);
    released.tick(400);
    assertEqual(released.up(500, 50, 25).state, "cancelled", "途中で離すとキャンセル");
    assertEqual(released.tick(2000).progress, 0, "キャンセル後は進捗0のまま");

    const moved = createLongPressTracker({ durationMs: 1000 });
    moved.down(0, rect);
    assertEqual(moved.move(110, 25).state, "pressing", "許容範囲（24px）内のぶれではキャンセルしない");
    assertEqual(moved.move(200, 200).state, "cancelled", "許容範囲の外へ移動するとキャンセル");
    assertEqual(moved.tick(2000).justCompleted, false, "キャンセル後は時間が経っても成立しない");

    const cancelled = createLongPressTracker({ durationMs: 1000 });
    cancelled.down(0, rect);
    assertEqual(cancelled.cancel().state, "cancelled", "pointercancelでキャンセル");

    const late = createLongPressTracker({ durationMs: 1000 });
    late.down(0, rect);
    assertEqual(late.up(1200, 50, 25).justCompleted, true, "tickが間に合わなくても、離した時点で規定時間を超えていれば成立する");
  }

  // ===== 長押しのDOM配線：pointerdownで押下表現、進捗0→100、成立時1回だけ発火、途中離脱でキャンセル =====
  {
    const button = makePartyButton();
    let nowMs = 0;
    const progress = [];
    let completed = 0;
    let cancelled = 0;
    attachLongPressHandler(button, {
      durationMs: 1000,
      now: () => nowMs,
      onProgress: (value) => progress.push(value),
      onComplete: () => completed++,
      onCancel: () => cancelled++,
    });
    const pointerId = nextPointerId++;
    firePointer(button, "pointerdown", { x: 50, y: 25, pointerId });
    assertEqual(button.classList.contains("is-pressed"), true, "長押し：pointerdown直後から押下表現が付く");
    assertEqual(progress[0], 0, "長押し：進捗は0から始まる");
    nowMs = 300;
    firePointer(button, "pointerup", { x: 50, y: 25, pointerId });
    assertEqual(completed, 0, "0.3秒で離すと成立しない（tapだけでは発動しない）");
    assertEqual(cancelled, 1, "途中で離すとonCancelが1回呼ばれる");
    assertEqual(button.classList.contains("is-pressed"), false, "キャンセル後は押下表現が解除される");
    assertEqual(progress[progress.length - 1], 0, "キャンセルで進捗が0へ戻る");

    const pointerId2 = nextPointerId++;
    nowMs = 1000;
    firePointer(button, "pointerdown", { x: 50, y: 25, pointerId: pointerId2 });
    nowMs = 2100;
    firePointer(button, "pointerup", { x: 50, y: 25, pointerId: pointerId2 });
    assertEqual(completed, 1, "1秒以上押してから離すと成立して1回だけ発火する");
    assertEqual(progress[progress.length - 1], 1, "成立時に進捗100%");

    const pointerId3 = nextPointerId++;
    nowMs = 3000;
    firePointer(button, "pointerdown", { x: 50, y: 25, pointerId: pointerId3 });
    firePointer(button, "pointermove", { x: 400, y: 400, pointerId: pointerId3 });
    assertEqual(cancelled, 2, "ボタンの外へ大きく移動するとキャンセル");
    nowMs = 5000;
    firePointer(button, "pointerup", { x: 400, y: 400, pointerId: pointerId3 });
    assertEqual(completed, 1, "外へ移動した後は時間が経ってから離しても発火しない");

    const pointerId4 = nextPointerId++;
    nowMs = 6000;
    firePointer(button, "pointerdown", { x: 50, y: 25, pointerId: pointerId4 });
    firePointer(button, "pointercancel", { x: 50, y: 25, pointerId: pointerId4 });
    assertEqual(cancelled, 3, "pointercancelでキャンセル");
    button.remove();
  }
}

// SpeechRecognition の偽物。テストから onstart／onresult／onerror／onend を任意の順で起こせる。
function installFakeRecognition(behaviour) {
  const original = { a: window.SpeechRecognition, b: window.webkitSpeechRecognition };
  const instances = [];
  class FakeRecognition {
    constructor() {
      instances.push(this);
    }
    start() {
      behaviour(this);
    }
    abort() {
      this.aborted = true;
    }
  }
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = FakeRecognition; // webkit接頭辞の環境（iOS Safari）を模す
  return {
    instances,
    restore() {
      window.SpeechRecognition = original.a;
      window.webkitSpeechRecognition = original.b;
    },
  };
}

function makeResultEvent(transcripts, isFinal) {
  const result = transcripts.map((transcript) => ({ transcript }));
  result.isFinal = isFinal;
  return { resultIndex: 0, results: [result] };
}

export function runPartyBattleVoiceTests() {
  // ===== 締切の計算：話し始めるまでの制限、発話開始後は最大5秒 =====
  assertEqual(computeVoiceDeadline({ claimedAtMs: 0, speechStartedAtMs: null, startTimeoutSec: 3 }), 3000, "発話前は「回答権＋制限秒」が締切");
  assertEqual(computeVoiceDeadline({ claimedAtMs: 0, speechStartedAtMs: 2900, startTimeoutSec: 3 }), 7900, "制限ぎりぎりに話し始めても、発話開始から5秒待てる");
  assertEqual(computeVoiceDeadline({ claimedAtMs: 0, speechStartedAtMs: 100, startTimeoutSec: 10 }), 10000, "早く話し始めた場合も制限秒までは待つ（大きい方）");
  assertEqual(typeof isSpeechRecognitionSupported(), "boolean", "対応判定はbooleanを返す");
  const env = describeVoiceEnvironment();
  assertEqual(typeof env.hasSpeechRecognition === "boolean" && typeof env.hasMicrophoneApi === "boolean" && typeof env.isStandalone === "boolean", true, "環境判定は各項目booleanを返す");

  // ===== 致命的な終了理由（以降その試合は人間判定で続行。4択へは変えない） =====
  ["unsupported", "start-timeout", "no-start", "error:not-allowed", "error:network", "error:start"].forEach((reason) => {
    assertEqual(isVoiceFatalEndReason(reason), true, `${reason} は「認識APIが使えない」扱い`);
  });
  ["final", "no-final", "no-speech", "aborted", "timeout"].forEach((reason) => {
    assertEqual(isVoiceFatalEndReason(reason), false, `${reason} はその回答だけ人間判定（APIは使い続ける）`);
  });
  resetVoiceRecognitionAvailability();
  markVoiceRecognitionUnavailable("error:not-allowed");
  assertEqual(isVoiceRecognitionAvailable(), false, "使えないと判定した後は利用不可（試合中は人間判定に固定）");
  resetVoiceRecognitionAvailability();

  // APIが無い環境でも例外にならず、unsupportedで即終了する（人間判定へ落とすための契約）
  {
    const original = { a: window.SpeechRecognition, b: window.webkitSpeechRecognition };
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
    let endReason = null;
    const session = startVoiceRecognitionSession({ onEnd: (reason) => (endReason = reason) });
    assertEqual(endReason, "unsupported", "API非対応ならonEnd('unsupported')が同期的に呼ばれる");
    session.abort();
    assertEqual(endReason, "unsupported", "abortを重ねてもonEndは1回だけ");
    window.SpeechRecognition = original.a;
    window.webkitSpeechRecognition = original.b;
  }

  // ===== 偽のSpeechRecognition（webkit接頭辞）で各イベント経路を検証 =====
  {
    // start() が同期例外を投げる（iOS standalone で報告される形の1つ）
    const fake = installFakeRecognition(() => {
      throw new Error("InvalidStateError");
    });
    clearVoiceDiagnostics();
    let endReason = null;
    startVoiceRecognitionSession({ onEnd: (reason) => (endReason = reason) });
    assertEqual(endReason, "error:start", "start()の同期例外は error:start として通知される（黙って失敗しない）");
    assertEqual(getVoiceDiagnostics().some((entry) => entry.stage === "start-exception"), true, "診断ログに start-exception が残る");
    fake.restore();
  }
  {
    // 権限拒否
    const fake = installFakeRecognition((recognition) => {
      recognition.onerror({ error: "not-allowed" });
    });
    let endReason = null;
    startVoiceRecognitionSession({ onEnd: (reason) => (endReason = reason) });
    assertEqual(endReason, "error:not-allowed", "not-allowed は error:not-allowed");
    fake.restore();
  }
  {
    // 無音（マイクは開いたが声なし）→ その回答だけ人間判定
    const fake = installFakeRecognition((recognition) => {
      recognition.onstart();
      recognition.onerror({ error: "no-speech" });
    });
    const stages = [];
    let endReason = null;
    startVoiceRecognitionSession({ onStage: (stage) => stages.push(stage), onEnd: (reason) => (endReason = reason) });
    assertEqual(endReason, "no-speech", "no-speech はそのまま通知（致命的ではない）");
    assertEqual(stages.includes(VOICE_STAGE.LISTENING), true, "onstart で「聞き取り中」段階へ進む");
    fake.restore();
  }
  {
    // abort
    const fake = installFakeRecognition((recognition) => {
      recognition.onstart();
    });
    let endReason = null;
    const session = startVoiceRecognitionSession({ onEnd: (reason) => (endReason = reason) });
    session.abort();
    assertEqual(endReason, "aborted", "abort() は aborted");
    assertEqual(fake.instances[0].aborted, true, "abort() は本物の recognition.abort() を呼ぶ");
    fake.restore();
  }
  {
    // 途中結果だけで onend（iOSで多い）→ no-final として途中結果を渡す
    const fake = installFakeRecognition((recognition) => {
      recognition.onstart();
      recognition.onspeechstart();
      recognition.onresult(makeResultEvent(["青春サブリミナル"], false));
      recognition.onend();
    });
    const received = [];
    let endReason = null;
    let speechStarted = 0;
    startVoiceRecognitionSession({
      onTranscripts: (transcripts, isFinal) => received.push({ transcripts, isFinal }),
      onSpeechStart: () => speechStarted++,
      onEnd: (reason) => (endReason = reason),
    });
    assertEqual(received, [{ transcripts: ["青春サブリミナル"], isFinal: false }], "途中結果が通知される");
    assertEqual(endReason, "no-final", "最終結果が来ないまま終わったら no-final（呼び出し側は途中結果で判定する）");
    assertEqual(speechStarted, 1, "発話開始は1回だけ通知される");
    fake.restore();
  }
  {
    // 最終結果
    const fake = installFakeRecognition((recognition) => {
      recognition.onstart();
      recognition.onresult(makeResultEvent(["イコールラブ", "いこーるらぶ"], true));
    });
    const received = [];
    let endReason = null;
    startVoiceRecognitionSession({
      onTranscripts: (transcripts, isFinal) => received.push({ transcripts, isFinal }),
      onEnd: (reason) => (endReason = reason),
    });
    assertEqual(received, [{ transcripts: ["イコールラブ", "いこーるらぶ"], isFinal: true }], "最終結果は複数候補ごと通知される");
    assertEqual(endReason, "final", "最終結果で final 終了");
    fake.restore();
  }
  {
    // onend だけが即来る（開始できていない）→ no-start（致命的）
    const fake = installFakeRecognition((recognition) => {
      recognition.onend();
    });
    let endReason = null;
    startVoiceRecognitionSession({ onEnd: (reason) => (endReason = reason) });
    assertEqual(endReason, "no-start", "onstartが来ないまま終了したら no-start");
    assertEqual(isVoiceFatalEndReason(endReason), true, "no-start は認識API不可として扱う");
    fake.restore();
  }
  assertEqual(typeof requestMicrophonePermission, "function", "マイク権限の要求関数がある（明確なユーザー操作から呼ぶ）");
  assertEqual(typeof runVoiceRecognitionTest, "function", "開始前チェック用のテスト関数がある");
}

export function runSongNameMatcherTests() {
  // ===== 正規化 =====
  assertEqual(normalizeSpokenText("青春 サブリミナル です"), "青春さぶりみなる", "空白・語尾「です」を落とし、カナはひらがなへ");
  assertEqual(normalizeSpokenText("イコールラブ、かな"), "いこーるらぶ".replace(/ー/g, ""), "句読点・語尾・長音を落とす");
  assertEqual(normalizeSpokenText(""), "", "空文字は空");
  assertEqual(normalizeSpokenText(null), "", "nullは空");

  // ===== 全84曲：曲名／読み／別名で必ずその曲が1位で返る（既存辞書だけを使う） =====
  let checked = 0;
  SONGS.forEach((song) => {
    const inputs = [song.title];
    if (song.searchReading) inputs.push(song.searchReading);
    (song.searchAliases ?? []).forEach((alias) => {
      if (typeof alias === "string") inputs.push(alias);
      else {
        inputs.push(alias.text);
        if (alias.reading) inputs.push(alias.reading);
      }
    });
    inputs.forEach((input) => {
      const result = matchSpokenSongName([input], SONGS);
      const ok = result.song?.id === song.id && result.status === "match";
      if (!ok) {
        assertEqual(`${result.status}:${result.song?.title ?? "-"}`, `match:${song.title}`, `「${input}」→${song.title}が1位で一致する`);
      }
      checked += 1;
    });
  });
  assertEqual(checked > 84, true, "曲名・読み・別名の全候補を検査した");
  const { official, aliases } = buildSongNameCandidates(SONGS.find((song) => song.id === SONGS[0].id));
  assertEqual(official.length >= 1, true, "曲名は必ず候補に入る");
  assertEqual(Array.isArray(aliases), true, "別名は配列");

  // ===== 音声認識由来の揺れ =====
  const seishun = SONGS.find((song) => song.title === '青春"サブリミナル"');
  if (seishun) {
    assertEqual(matchSpokenSongName(["青春サブリミナル"], SONGS).song?.id, seishun.id, "記号（\"）の有無を吸収");
    assertEqual(matchSpokenSongName(["せいしゅんさぶりみなる、です"], SONGS).song?.id, seishun.id, "ひらがな＋句読点＋語尾でも一致");
    assertEqual(matchSpokenSongName(["青サブ"], SONGS).song?.id, seishun.id, "登録済みの別名（青サブ）は受理");
    assertEqual(decideVoiceVerdict(matchSpokenSongName(["青サブ"], SONGS), seishun.id), "correct", "正解曲と一致すれば自動判定：正解");
    const other = SONGS.find((song) => song.id !== seishun.id && song.searchReading);
    assertEqual(decideVoiceVerdict(matchSpokenSongName([other.title], SONGS), seishun.id), "wrong", "別の曲へ完全一致なら自動判定：不正解");
  }
  assertEqual(matchSpokenSongName(["ぱ"], SONGS).status === "match", false, "1〜2文字の断片だけでは自動正解にしない");
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["まったく関係ない言葉"], SONGS), "x"), "manual", "何にも一致しなければ人間判定へ");
  assertEqual(decideVoiceVerdict(null, "x"), "manual", "結果なしは人間判定へ");
  assertEqual(scoreSongAgainstSpokenText({ title: "ABC", searchAliases: ["ab"] }, "ab"), 3, "別名は完全一致で最高スコア");
  assertEqual(scoreSongAgainstSpokenText({ title: "ABCDE" }, "abc"), 1.5, "3文字以上かつ40%以上の前方一致は自動判定できる下限スコア（1.5）");
  assertEqual(scoreSongAgainstSpokenText({ title: "ABCDE" }, "cd"), 0, "3文字未満の部分一致は不一致扱い");
  // 近似一致（score 2）・前方一致（1.5）で別の曲になった場合は聞き間違いの可能性があるので人間判定へ
  assertEqual(decideVoiceVerdict({ status: "match", song: { id: "y" }, score: 2 }, "x"), "manual", "近似一致レベルの別曲は自動不正解にしない");
  assertEqual(decideVoiceVerdict({ status: "match", song: { id: "y" }, score: 1.5 }, "x"), "manual", "前方一致レベルの別曲は自動不正解にしない");
  assertEqual(decideVoiceVerdict({ status: "ambiguous", song: { id: "x" }, score: 3 }, "x"), "manual", "曖昧（同点候補が複数）は人間判定へ");

  runSongNameMatcherLeniencyTests();
}

// ===== 【2026-09-15 第3回実機QA修正】段階的マッチャー：表記揺れ・読み・略称・近似・誤爆防止 =====
function runSongNameMatcherLeniencyTests() {
  const love = SONGS.find((song) => song.id === "love");
  assertEqual(love?.title, "＝LOVE", "前提：＝LOVE（全角＝）の曲データがある");
  assertEqual(love.searchAliases.some((alias) => alias?.text === "国歌" && alias.reading === "こっか"), true, "前提：「国歌」はsongs.jsの既存searchAliasesにある（party専用辞書は作らない）");
  assertEqual(love.searchAliases.some((alias) => alias === "国家" || alias?.text === "国家"), false, "本人確定：songs.jsに同音の「国家」は追加しない（matcher側で吸収）");

  // --- 第3段階：表記・認識揺れ（全角／半角・空白・記号・大小） ---
  assertEqual(normalizeSpokenText("＝LOVE"), normalizeSpokenText("=LOVE"), "全角「＝」と半角「=」は同じ正規化結果（第3回実機QAの根本原因）");
  assertEqual(normalizeSpokenText("＝ＬＯＶＥ"), "=love", "全角英字も半角小文字へ");
  assertEqual(normalizeSpokenText("イコール ラブ"), "いこるらぶ", "空白・長音を落としてひらがなへ");
  ["＝LOVE", "=LOVE", "= LOVE", "=love", "イコールラブ", "いこーるらぶ", "イコール ラブ", "イコラブ", "いこらぶ", "国歌", "こっか", "LOVE", "love"].forEach((input) => {
    const result = matchSpokenSongName([input], SONGS);
    assertEqual(`${result.status}:${result.song?.id}`, "match:love", `「${input}」→＝LOVEに自動一致`);
    assertEqual(decideVoiceVerdict(result, "love"), "correct", `「${input}」は正解曲が＝LOVEなら自動正解`);
  });

  // --- 同音異義（読みベース）：「国歌」を認識器が「国家」と書き起こしても、既存aliasの reading「こっか」で拾う ---
  assertEqual(resolveSpokenReading("国家"), "こっか", "同音表記「国家」→読み「こっか」");
  assertEqual(resolveSpokenReading("こっか"), "こっか", "かなだけの入力は入力そのものが読み");
  assertEqual(resolveSpokenReading("=love"), null, "かな以外で表にない入力は読み不明（null）");
  assertEqual(isKanaOnly("いこらぶ"), true, "ひらがなだけ→かな判定");
  assertEqual(isKanaOnly("国家"), false, "漢字→かなではない");
  assertEqual(typeof SPOKEN_HOMOPHONE_READINGS, "object", "同音表記の表は一般化されたデータ（partyBattleVoice.jsのベタ書きではない）");
  const kokka = matchSpokenSongName(["国家"], SONGS);
  assertEqual(`${kokka.status}:${kokka.song?.id}:${kokka.score}`, "match:love:3", "「国家」（同音）→読み一致で＝LOVEに最高スコア");
  assertEqual(matchSpokenSongName(["国家です"], SONGS).song?.id, "love", "「国家です」も語尾を落として同音一致");
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["国家"], SONGS), "love"), "correct", "正解曲が＝LOVEなら「国家」は自動正解");
  const otherSong = SONGS.find((song) => song.id !== "love");
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["国家"], SONGS), otherSong.id), "wrong", "正解曲が別の曲なら「国家」（＝LOVEの別名）は明確な別曲回答として自動不正解");

  // --- 読みの衝突は人間判定へ：同じ読みを2曲が持つ架空データ ---
  const clashing = [
    { id: "a", title: "曲A", searchReading: "きょくえー", searchAliases: [{ text: "花", reading: "はな" }] },
    { id: "b", title: "曲B", searchReading: "きょくびー", searchAliases: [{ text: "鼻", reading: "はな" }] },
  ];
  const clash = matchSpokenSongName(["はな"], clashing);
  assertEqual(clash.status, "ambiguous", "同じ読みを2曲が持つ→競合として曖昧");
  assertEqual(decideVoiceVerdict(clash, "a"), "manual", "読み衝突は自動判定せず人間判定へ");

  // --- 第4段階：編集距離（長さ連動） ---
  assertEqual(computeEditDistance("abc", "abd"), 1, "編集距離：置換1");
  assertEqual(computeEditDistance("あいう", "あいうえ"), 1, "編集距離：挿入1");
  assertEqual(computeEditDistance("", "abc"), 3, "編集距離：空文字");
  assertEqual(resolveAllowedEditDistance(3), 0, "3文字以下は完全一致のみ");
  assertEqual(resolveAllowedEditDistance(5), 1, "4〜7文字は1文字まで");
  assertEqual(resolveAllowedEditDistance(10), 2, "8〜13文字は2文字まで");
  assertEqual(resolveAllowedEditDistance(20), 3, "14文字以上は3文字まで");
  assertEqual(scoreSongAgainstSpokenText({ title: "あいうえおかきく" }, "あいうえおかきけ"), 2, "8文字で1文字違い→近似一致");
  assertEqual(scoreSongAgainstSpokenText({ title: "あいうえおかきく" }, "あいうえおかけこ"), 2, "8文字で2文字違い→近似一致");
  assertEqual(scoreSongAgainstSpokenText({ title: "あいうえおかきく" }, "あいうえさしすせ"), 0, "8文字で4文字違い→不一致");
  assertEqual(scoreSongAgainstSpokenText({ title: "あいう" }, "あいえ"), 0, "3文字の1文字違いは不一致（短い語は厳しく）");
  assertEqual(scoreSongAgainstSpokenText({ title: "あいうえ" }, "あいうお"), 2, "4文字の1文字違いは近似一致");

  // --- 実データ：長い曲名の1〜2文字の聞き間違いは自分の曲に自動一致（誤爆なし） ---
  const seishun = SONGS.find((song) => song.title === '青春"サブリミナル"');
  assertEqual(matchSpokenSongName(["青春サブリミナルー"], SONGS).song?.id, seishun.id, "「青春サブリミナルー」（長音付き）→青春サブリミナル");
  assertEqual(matchSpokenSongName(["せいしゅんさぶりみなろ"], SONGS).song?.id, seishun.id, "読みの末尾1文字違い→青春サブリミナル");
  assertEqual(matchSpokenSongName(["青春サブ"], SONGS).song?.id, seishun.id, "「青春サブ」（先頭部分・一意）→青春サブリミナル");
  assertEqual(matchSpokenSongName(["青春サブ"], SONGS).status, "match", "「青春サブ」は一意なので自動判定");
  assertEqual(matchSpokenSongName(["青春"], SONGS).status === "match", false, "「青春」（2文字の一般語）だけでは自動判定しない");

  // --- 第5段階：部分一致は一意なときだけ。短い断片・一般語は人間判定 ---
  ["あ", "らぶ", "サブ", "うた", "の"].forEach((input) => {
    assertEqual(matchSpokenSongName([input], SONGS).status === "match", false, `「${input}」（短い断片）は自動判定しない`);
  });

  // --- 絶対条件：無関係な言葉は自動正解にならない／別曲の完全一致は自動不正解／曖昧は人間 ---
  ["こんにちは", "わかりません", "えっとなんだっけ", "ぱす", "もう一回", "イコールラブの何か"].forEach((input) => {
    const verdict = decideVoiceVerdict(matchSpokenSongName([input], SONGS), seishun.id);
    assertEqual(verdict === "correct", false, `「${input}」（無関係）は自動正解にならない`);
  });
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["＝LOVE"], SONGS), seishun.id), "wrong", "正解が青春サブリミナルのとき「＝LOVE」は別曲の完全一致→自動不正解");
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["青サブ"], SONGS), "love"), "wrong", "正解が＝LOVEのとき「青サブ」（別曲の既知略称）→自動不正解");
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["せいしゅんさぶりみなろ"], SONGS), "love"), "manual", "別曲への近似一致は聞き間違いの可能性があるので人間判定");

  // --- 複数候補（認識器のalternatives）：どれかが一致すれば拾う ---
  assertEqual(matchSpokenSongName(["国家", "こっか", "告花"], SONGS).song?.id, "love", "候補のどれかが一致すれば拾う");

  // --- 全84曲クロスチェック：どの曲名・読み・別名も「別の曲」へ自動一致しない（誤爆検査） ---
  let crossChecked = 0;
  SONGS.forEach((song) => {
    const inputs = [song.title, song.searchReading].filter(Boolean);
    (song.searchAliases ?? []).forEach((alias) => {
      if (typeof alias === "string") inputs.push(alias);
      else inputs.push(alias.text, alias.reading);
    });
    inputs.filter(Boolean).forEach((input) => {
      const result = matchSpokenSongName([input], SONGS);
      if (result.status === "match" && result.song.id !== song.id) {
        assertEqual(result.song.title, song.title, `「${input}」（${song.title}）が別の曲へ自動一致しない`);
      }
      crossChecked += 1;
    });
    // 曲名（8文字以上）の末尾1文字を変えた聞き間違いは、自分の曲に一致するか人間判定（別曲へ自動一致しない）
    const normalized = normalizeSpokenText(song.title);
    if (normalized.length >= 8) {
      const mutated = normalized.slice(0, -1) + (normalized.endsWith("ん") ? "る" : "ん");
      const result = matchSpokenSongName([mutated], SONGS);
      assertEqual(result.status === "match" && result.song.id !== song.id, false, `「${mutated}」（${song.title}の末尾1文字違い）が別の曲へ自動一致しない`);
      assertEqual(decideVoiceVerdict(result, song.id) !== "wrong", true, `「${mutated}」は自分の曲が正解なら自動不正解にならない`);
      crossChecked += 1;
    }
  });
  assertEqual(crossChecked > 150, true, `全曲の曲名・読み・別名・1文字違いを横断検査した（${crossChecked}件）`);
}

export function runPartyBattleStorageTests() {
  const keys = ["equalLoveIntroQuiz.partyBattle.recentNames", "equalLoveIntroQuiz.partyBattle.lastSettings"];
  keys.forEach((key) => localStorage.removeItem(key));

  rememberPartyPlayerNames(["あい", "プレイヤー2", "  ", "ゆい"]);
  assertEqual(getRecentPartyPlayerNames(), ["あい", "ゆい"], "既定名「プレイヤーN」と空欄は候補に入れない");
  rememberPartyPlayerNames(["ゆい", "さな"]);
  assertEqual(getRecentPartyPlayerNames(), ["ゆい", "さな", "あい"], "新しい名前が先頭、重複なし");

  saveLastPartySettings({ playerCount: 3, emptySeatId: "topLeft", quizType: "lyrics", questionCountValue: "10", answerMethod: "voice", otetsuki: false });
  const restored = getLastPartySettings();
  assertEqual(restored.playerCount, 3, "前回の人数を復元");
  assertEqual(restored.emptySeatId, "topLeft", "前回の空席を復元");
  assertEqual(restored.quizType, "lyrics", "前回の出題タイプを復元");
  assertEqual(restored.answerMethod, "voice", "前回の回答方式を復元");
  assertEqual(restored.otetsuki, false, "前回のお手つき設定を復元");
  localStorage.setItem("equalLoveIntroQuiz.partyBattle.lastSettings", "{broken json");
  assertEqual(getLastPartySettings().playerCount, 2, "壊れた保存データは既定値へ（例外にしない）");

  // ===== 履歴データ：個人記録系のフィールドを一切持たない =====
  const settings = normalizePartySettings({ playerCount: 2, playerNames: ["あい", "ゆい"], quizType: "instant", questionCountValue: "3", answerMethod: "voice", voiceStartTimeoutSec: 5, instantClipSec: "0.5", instantMaxListens: 5 });
  const built = buildPartyPlayers(settings);
  let match = createPartyMatch({ settings, players: built.players, layout: built.layout, seats: built.seats, questions: [], plannedCount: 3, seed: 1 });
  match = { ...match, status: "finished", winnerId: "p2", scores: { p1: 1, p2: 2 }, stats: { ...match.stats, wrongCount: 4, passCount: 1, suddenDeathQuestionCount: 0 } };
  const entry = buildPartyBattleHistoryEntry(match, { playedAt: 123 });
  assertEqual(entry.modeId, "partyBattle", "modeIdはpartyBattle");
  assertEqual(entry.completed, true, "完走した試合だけ保存する前提でcompleted=true");
  assertEqual(entry.questionCount, 3, "予定問題数");
  assertEqual(entry.correctCount, 3, "正解数は全員の得点合計");
  assertEqual(entry.wrongCount, 4, "誤答数は誤答回数");
  assertEqual(entry.skippedCount, 1, "スキップ数はPASS回数");
  assertEqual(entry.score, null, "スコア（点数）は持たない");
  assertEqual(entry.details.playerCount, 2, "人数");
  assertEqual(entry.details.quizType, "instant", "出題タイプ");
  assertEqual(entry.details.answerMethod, "voice", "回答方式");
  assertEqual(entry.details.voiceStartTimeoutSec, 5, "音声時間（音声のときだけ）");
  assertEqual(entry.details.instantClipSec, 0.5, "一瞬設定（一瞬のときだけ）");
  assertEqual(entry.details.instantMaxListens, 5, "最大試聴回数");
  assertEqual(entry.details.hadSuddenDeath, false, "サドンデスの有無");
  assertEqual(entry.details.standings.map((row) => `${row.rank}:${row.playerName}:${row.score}`), ["1:ゆい:2", "2:あい:1"], "順位表（rank/name/score）");
  assertEqual(entry.details.standings[0].isWinner, true, "優勝者フラグ");
  assertEqual("rule" in entry.details, false, "旧1台対戦のrule等は持たない");

  keys.forEach((key) => localStorage.removeItem(key));
}

// ===== 配線テスト：新規JSがService Workerに登録され、個人記録系モジュールをimportしていない =====
export async function runPartyBattleWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const sw = await fetchText("sw.js");
  [
    "partyBattleState",
    "partyBattleInput",
    "partyBattleVoice",
    "partyBattleStorage",
    "partyBattleEngine",
    "partyBattleScreen",
    "partyBattlePlayScreen",
    "songNameMatcher",
    "songSearch",
  ].forEach((name) => {
    assertEqual(sw.includes(`"./js/${name}.js"`), true, `sw.jsのAPP_SHELLに${name}.jsが登録されている`);
  });

  const forbidden = ["timeAttackLeaderboard", "achievement", "weakSongStats", "shuffleWeakSongStats", "outroWeakSongStats", "randomPlaybackScore", "firebase"];
  for (const name of ["partyBattleEngine", "partyBattleStorage", "partyBattleState", "partyBattleScreen", "partyBattlePlayScreen"]) {
    const source = await fetchText(`js/${name}.js`);
    const imports = source.split("\n").filter((line) => line.startsWith("import "));
    forbidden.forEach((word) => {
      assertEqual(
        imports.some((line) => line.toLowerCase().includes(word.toLowerCase())),
        false,
        `${name}.jsは${word}系のモジュールをimportしない（個人PB・ランキング・称号・苦手曲・Firebaseを汚さない）`
      );
    });
  }

  const html = await fetchText("index.html");
  assertEqual(html.includes('id="party-battle-setup-screen"'), true, "設定画面が存在する");
  assertEqual(html.includes('id="party-battle-play-screen"'), true, "対戦盤面が存在する");
  assertEqual(html.includes('id="history-tab-party"'), true, "プレイ履歴に「パーティー」タブがある");
  assertEqual(html.includes('id="guide-video-card"') && html.includes('target="_blank" rel="noopener noreferrer"'), true, "ガイド最上部の動画カードが外部リンク（新しいタブ・noopener）");
  assertEqual(html.includes('id="battle-mode-select-screen"'), true, "旧1台対戦の画面は互換のため残っている（ホームからの導線だけ置き換え）");

  const specialModes = await fetchText("js/specialModesScreen.js");
  assertEqual(specialModes.includes('id: "partyBattle"'), true, "ホームのカードにパーティー対戦がある");
  assertEqual(specialModes.includes('id: "localBattle"'), false, "ホームのカードから旧1台対戦は消えている");

  const guide = await fetchText("js/data/guideContent.js");
  assertEqual(guide.includes("https://www.youtube.com/watch?v=n3YIZBR-Zl8"), true, "動画URLはguideContent.jsに1箇所");
  assertEqual(guide.includes('id: "partyBattle"'), true, "ガイドにパーティー対戦の項目がある");
  assertEqual(guide.includes('id: "localBattle"'), false, "ガイドから旧1台対戦の項目は消えている");
  assertEqual(guide.includes("間違えた曲だけ復習する"), true, "ガイドに復習クイズの記述がある");
  assertEqual(guide.includes("一緒に遊ぶ") && guide.includes("友達を招待"), true, "ガイドに招待機能の記述がある");
}
