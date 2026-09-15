// パーティー対戦「音声回答の誤判定を正解公開後に救済する」（2026-09-15 第4回実機QA修正・本人指示）のテスト。
//
// 【仕様（本人確定）】
//   ・通常のテンポは変えない（自動不正解のたびに確認画面を出さない）
//   ・その問題中の音声回答（誰が・何と認識され・どう判定されたか・回答順）を runtime に一時保持（永続化しない）
//   ・正解曲名が公開された結果表示（正解／全員PASS）でだけ、過去に不正解処理された回答を救済候補として出す
//   ・救済＝人間の最終判断。救済した人へ+1、後から正解していた人の+1は取り消し（1問の正解者は1人。二重加算しない）
//   ・問題は終了したまま（再開・3・2・1しない）。solutionRevealed は維持。既存の「正解→不正解へ修正」（voided）とは別
import { assertEqual } from "./test-utils.js";
import {
  PARTY_PHASE,
  normalizePartySettings,
  buildPartyPlayers,
  createPartyMatch,
  createQuestionRuntime,
  resolveParticipantIds,
  beginCountdown,
  activateQuestion,
  claimAnswer,
  resolveCorrect,
  resolveWrong,
  finishWrongResult,
  passQuestion,
  creditCorrectScore,
  revokeCorrectScore,
  voidRevealedCorrect,
  recordVoiceAttempt,
  listRescuableVoiceAttempts,
  rescueVoiceAttempt,
  resolveSuddenDeathOutcome,
  applyQuestionOutcome,
  canRevealSolution,
} from "../js/partyBattleState.js";
import { initPartyPlayScreen, renderPartyPlaySnapshot, resetPartyPlayScreen } from "../js/partyBattlePlayScreen.js";

const SONGS_FAKE = [
  { id: "love", title: "＝LOVE" },
  { id: "s2", title: "ズルいよ ズルいね" },
  { id: "s3", title: "CAMEO" },
  { id: "s4", title: "青春\"サブリミナル\"" },
];

function buildCase() {
  const settings = normalizePartySettings({ playerCount: 3, emptySeatId: "bottomRight", playerNames: ["がしお", "さな", "ゆい"], quizType: "intro", answerMethod: "voice", questionCountValue: "5", otetsuki: true });
  const built = buildPartyPlayers(settings);
  const question = { song: SONGS_FAKE[0], choices: SONGS_FAKE, hints: [] };
  const match = { ...createPartyMatch({ settings, players: built.players, layout: built.layout, seats: built.seats, questions: [question], plannedCount: 5, seed: 1 }), startedAt: Date.now() + Math.random() };
  const runtime = { ...createQuestionRuntime({ question, questionNumber: 1, totalQuestions: 5, isSuddenDeath: false, participantIds: resolveParticipantIds(match) }), ordinal: 1 };
  const [p1, p2, p3] = match.players.map((player) => player.id);
  return { match, runtime, p1, p2, p3 };
}

// エンジンの recordVoiceOutcome と同じ形で1件記録する
function attempt(runtime, { playerId, transcript, outcome, atMs, judgedBy = "auto" }) {
  return recordVoiceAttempt(runtime, {
    key: `${playerId}:${atMs}`,
    playerId,
    transcripts: transcript ? [transcript] : [],
    matchedTitle: null,
    autoVerdict: outcome === "correct" ? "correct" : "wrong",
    judgedBy,
    outcome,
    atMs,
  });
}

// 音声回答1件を「不正解として処理」した状態まで進める（CLAIMED→WRONG_RESULT→再開）
function wrongVoiceAnswer(runtime, playerId, transcript, atMs) {
  const claimed = claimAnswer(runtime, { playerId, choiceId: null });
  const wrong = resolveWrong(claimed, { otetsuki: true, judgedBy: "auto" });
  const recorded = attempt(wrong, { playerId, transcript, outcome: "wrong", atMs });
  return activateQuestion(finishWrongResult(recorded));
}

export function runPartyBattleVoiceRescueStateTests() {
  // ===== 履歴の保持 =====
  {
    const { runtime: base, p1, p2 } = buildCase();
    assertEqual(Array.isArray(base.voiceAttempts) && base.voiceAttempts.length === 0, true, "問題開始時点の音声回答履歴は空");
    const active = activateQuestion(beginCountdown(base));
    const afterP1 = wrongVoiceAnswer(active, p1, "イコールラブ", 1000);
    assertEqual(afterP1.voiceAttempts.length, 1, "不正解1件を履歴に保持");
    assertEqual(afterP1.voiceAttempts[0].order, 1, "回答順 1");
    assertEqual(afterP1.voiceAttempts[0].playerId, p1, "誰の回答か");
    assertEqual(afterP1.voiceAttempts[0].transcripts, ["イコールラブ"], "認識した文字列");
    assertEqual(afterP1.voiceAttempts[0].outcome, "wrong", "不正解として処理された");
    assertEqual(afterP1.phase, PARTY_PHASE.ACTIVE, "通常どおり問題は再開（テンポを変えない）");
    assertEqual(afterP1.lockedPlayerIds, [p1], "お手つきロックは従来どおり");
    const afterP2 = wrongVoiceAnswer(afterP1, p2, "ずるいよ", 2000);
    assertEqual(afterP2.voiceAttempts.map((entry) => entry.order), [1, 2], "回答順に番号が付く");
    // 同じ回答権の再判定（同じ key）は上書きで、順番は変わらない
    const overwritten = attempt(afterP2, { playerId: p1, transcript: "イコールラブ", outcome: "correct", atMs: 1000, judgedBy: "human" });
    assertEqual(overwritten.voiceAttempts.length, 2, "同じ回答権の再判定は追加ではなく上書き");
    assertEqual(overwritten.voiceAttempts[0].outcome, "correct", "上書きで outcome が更新される");
    assertEqual(overwritten.voiceAttempts[0].order, 1, "上書きしても回答順は最初のまま");
    const matchShape = createPartyMatch({ settings: {}, players: [], layout: "two", seats: [], questions: [], plannedCount: 1, seed: 1 });
    assertEqual("voiceAttempts" in matchShape, false, "履歴は runtime（問題単位）だけが持ち、match（保存対象）には持たない");
  }

  // ===== 正解公開前は候補を出さない =====
  {
    const { runtime: base, p1 } = buildCase();
    const active = activateQuestion(beginCountdown(base));
    const afterP1 = wrongVoiceAnswer(active, p1, "イコールラブ", 1000);
    assertEqual(listRescuableVoiceAttempts(afterP1), [], "出題中（正解未公開）は救済候補を出さない");
    const claimed = claimAnswer(afterP1, { playerId: base.participantIds[1], choiceId: null });
    assertEqual(listRescuableVoiceAttempts(claimed), [], "回答中も出さない");
    const wrong = resolveWrong(claimed, { otetsuki: true });
    assertEqual(listRescuableVoiceAttempts(wrong), [], "不正解表示中（問題継続）も出さない");
    assertEqual(rescueVoiceAttempt({}, afterP1, 1), null, "正解公開前の救済操作は無効（null）");
  }

  // ===== ケースA：全員PASS（0点）→ P1 を救済 → P1 +1 =====
  {
    const { match, runtime: base, p1 } = buildCase();
    const active = activateQuestion(beginCountdown(base));
    const afterP1 = wrongVoiceAnswer(active, p1, "イコールラブ", 1000);
    const passed = passQuestion(afterP1);
    assertEqual(canRevealSolution(passed), true, "全員PASSで正解公開");
    const candidates = listRescuableVoiceAttempts(passed);
    assertEqual(candidates.map((entry) => entry.playerId), [p1], "正解公開後に P1 の不正解回答が救済候補になる");
    const rescued = rescueVoiceAttempt(match, passed, 1);
    assertEqual(rescued !== null, true, "救済できる");
    assertEqual(rescued.match.scores[p1], 1, "0点問題から P1 +1");
    assertEqual(Object.values(rescued.match.scores).reduce((sum, value) => sum + value, 0), 1, "総得点は1（二重加算なし）");
    assertEqual(rescued.runtime.phase, PARTY_PHASE.CORRECT_RESULT, "結果は正解表示（問題は終了したまま）");
    assertEqual(rescued.runtime.lastResult.type, "rescued", "lastResult.type は rescued（既存の correct／voided と区別）");
    assertEqual(rescued.runtime.lastResult.playerId, p1, "最終正解者は P1");
    assertEqual(rescued.runtime.lastResult.previousPlayerId, null, "全員PASSからの救済なので取り消した人はいない");
    assertEqual(rescued.runtime.solutionRevealed, true, "solutionRevealed は維持");
    assertEqual(rescued.runtime.scoreCredited, true, "得点済みフラグが立つ（次へで二重に入れない）");
    assertEqual(beginCountdown(rescued.runtime), null, "救済後に同じ問題へ戻れない（再開しない）");
    assertEqual(listRescuableVoiceAttempts(rescued.runtime), [], "救済した回答は候補から消える");
    assertEqual(rescueVoiceAttempt(rescued.match, rescued.runtime, 1), null, "同じ回答を二度救済できない");
    // applyQuestionOutcome：PASS ではなく正解として集計（passCount は増えない）
    const outcome = applyQuestionOutcome(rescued.match, rescued.runtime);
    assertEqual(outcome.stats.passCount, 0, "救済後は全員PASSとして数えない");
    assertEqual(outcome.completedQuestionCount, 1, "問題は完了として数える");
  }

  // ===== ケースB：P1 誤不正解 → P2 通常正解（+1）→ P1 救済 → P2 -1・P1 +1 =====
  {
    const { match, runtime: base, p1, p2 } = buildCase();
    const active = activateQuestion(beginCountdown(base));
    const afterP1 = wrongVoiceAnswer(active, p1, "イコールラブ", 1000);
    const claimedP2 = claimAnswer(afterP1, { playerId: p2, choiceId: null });
    let correct = resolveCorrect(claimedP2, { judgedBy: "auto" });
    let creditedMatch;
    ({ match: creditedMatch, runtime: correct } = creditCorrectScore(match, correct));
    correct = attempt(correct, { playerId: p2, transcript: "＝LOVE", outcome: "correct", atMs: 2000 });
    assertEqual(creditedMatch.scores[p2], 1, "前提：P2 が通常正解で +1");
    const candidates = listRescuableVoiceAttempts(correct);
    assertEqual(candidates.map((entry) => entry.playerId), [p1], "正解表示中：P1 の不正解回答だけが候補（P2 の正解回答は候補ではない）");
    const rescued = rescueVoiceAttempt(creditedMatch, correct, 1);
    assertEqual(rescued.match.scores[p1], 1, "P1 +1");
    assertEqual(rescued.match.scores[p2], 0, "P2 の +1 を取り消し");
    assertEqual(Object.values(rescued.match.scores).reduce((sum, value) => sum + value, 0), 1, "総得点は1のまま（二重加算なし）");
    assertEqual(rescued.runtime.lastResult.playerId, p1, "最終正解者は P1（早押しとして先に正解していた）");
    assertEqual(rescued.runtime.lastResult.previousPlayerId, p2, "取り消した人 P2 を表示用に持つ");
    assertEqual(rescued.runtime.acceptedClaim.playerId, p1, "回答権の記録も P1 へ");
    const p2Entry = rescued.runtime.voiceAttempts.find((entry) => entry.playerId === p2);
    assertEqual(p2Entry.outcome, "overtaken", "P2 の回答は「先の回答を救済したため取り消し」（overtaken）");
    assertEqual(listRescuableVoiceAttempts(rescued.runtime).map((entry) => entry.playerId), [p2], "取り消された P2 は救済し直せる（誤操作の戻し道）");
    // P2 を救済し直す → 得点が戻る（やはり合計1）
    const back = rescueVoiceAttempt(rescued.match, rescued.runtime, 2);
    assertEqual([back.match.scores[p1], back.match.scores[p2]], [0, 1], "P2 を救済し直すと P1 -1・P2 +1（合計は1のまま）");
    assertEqual(back.runtime.lastResult.playerId, p2, "最終正解者は P2 に戻る");
  }

  // ===== 複数候補：1問で複数人へ +1 しない。より早い回答が分かる（order） =====
  {
    const { match, runtime: base, p1, p2, p3 } = buildCase();
    const active = activateQuestion(beginCountdown(base));
    const afterP1 = wrongVoiceAnswer(active, p1, "イコールラブ", 1000);
    const afterP3 = wrongVoiceAnswer(afterP1, p3, "イコラブ", 3000);
    const passed = passQuestion(afterP3);
    const candidates = listRescuableVoiceAttempts(passed);
    assertEqual(candidates.map((entry) => [entry.order, entry.playerId]), [[1, p1], [2, p3]], "候補は回答順（P1 が先）");
    const rescuedP3 = rescueVoiceAttempt(match, passed, 2);
    assertEqual([rescuedP3.match.scores[p1], rescuedP3.match.scores[p3]], [0, 1], "P3 を救済すると P3 だけ +1");
    const thenP1 = rescueVoiceAttempt(rescuedP3.match, rescuedP3.runtime, 1);
    assertEqual([thenP1.match.scores[p1], thenP1.match.scores[p3]], [1, 0], "その後 P1（より早い回答）を救済すると P3 の +1 は取り消され、正解者は1人だけ");
    assertEqual(Object.values(thenP1.match.scores).reduce((sum, value) => sum + value, 0), 1, "合計1");
    assertEqual(thenP1.runtime.lastResult.previousPlayerId, p3, "取り消した人 P3");
    assertEqual(p2 !== null, true, "（P2 は無関係）");
  }

  // ===== 既存「正解→不正解へ修正」（voided）との共存 =====
  {
    const { match, runtime: base, p1, p2 } = buildCase();
    const active = activateQuestion(beginCountdown(base));
    const afterP1 = wrongVoiceAnswer(active, p1, "イコールラブ", 1000);
    let correct = resolveCorrect(claimAnswer(afterP1, { playerId: p2, choiceId: null }), { judgedBy: "auto" });
    let creditedMatch;
    ({ match: creditedMatch, runtime: correct } = creditCorrectScore(match, correct));
    correct = attempt(correct, { playerId: p2, transcript: "ずるいよ", outcome: "correct", atMs: 2000 });
    // 既存：P2 の正解を人間が不正解へ修正 → 0点終了（voided）
    let revoked;
    ({ match: revoked, runtime: correct } = revokeCorrectScore(creditedMatch, correct, p2));
    const voided = attempt(voidRevealedCorrect(correct), { playerId: p2, transcript: "ずるいよ", outcome: "voided", atMs: 2000, judgedBy: "human" });
    assertEqual(voided.phase, PARTY_PHASE.PASS_RESULT, "既存の voided はそのまま動く");
    assertEqual(revoked.scores[p2], 0, "既存の +1 取り消しもそのまま");
    assertEqual(listRescuableVoiceAttempts(voided).map((entry) => entry.playerId), [p1], "voided の後も P1 の不正解回答は救済候補（P2 の voided 回答は候補にしない）");
    const rescued = rescueVoiceAttempt(revoked, voided, 1);
    assertEqual([rescued.match.scores[p1], rescued.match.scores[p2]], [1, 0], "voided（0点）から P1 を救済 → P1 +1 だけ");
    assertEqual(rescued.runtime.lastResult.type, "rescued", "voided → rescued へ（別の type）");
  }

  // ===== サドンデス：救済した正解でも決着 =====
  {
    const { runtime: base, p1 } = buildCase();
    const sd = { ...activateQuestion(beginCountdown({ ...base, isSuddenDeath: true })) };
    const passed = passQuestion(wrongVoiceAnswer(sd, p1, "イコールラブ", 1000));
    assertEqual(resolveSuddenDeathOutcome(passed).kind, "continue", "サドンデスの全員PASSは続行");
    const rescued = rescueVoiceAttempt({ scores: { [p1]: 0 } }, passed, 1);
    assertEqual(resolveSuddenDeathOutcome(rescued.runtime), { kind: "finished", winnerId: p1 }, "救済で正解者が決まればサドンデス決着");
  }
}

// ===== 画面：救済UIは正解公開後だけ／候補の表示／ボタンの競合なし =====
const ELEMENT_IDS = {
  root: "party-play-root", seats: "party-play-seats", questionLabel: "party-play-question-label", lyrics: "party-play-lyrics",
  status: "party-play-status", passButton: "party-play-pass-button", passProgress: "party-play-pass-progress", replayButton: "party-play-replay-button",
  rescueBox: "party-play-rescue-box",
  quitButton: "party-play-quit-button", quitProgress: "party-play-quit-progress", introOverlay: "party-play-intro-overlay",
  introText: "party-play-intro-text", resultOverlay: "party-play-result-overlay", resultHeadline: "party-play-result-headline",
  resultSong: "party-play-result-song", resultDetail: "party-play-result-detail", overrideButton: "party-play-override-button",
  resultNextButton: "party-play-result-next-button", voiceOverlay: "party-play-voice-overlay", voicePlayer: "party-play-voice-player",
  voiceTimer: "party-play-voice-timer", voiceTranscript: "party-play-voice-transcript", voiceHint: "party-play-voice-hint",
  judgeRow: "party-play-judge-row", judgeCorrectButton: "party-play-judge-correct-button", judgeWrongButton: "party-play-judge-wrong-button",
  notice: "party-play-notice", pauseOverlay: "party-play-pause-overlay", resumeButton: "party-play-resume-button",
};

export async function runPartyBattleVoiceRescueUiTests() {
  const html = await (await fetch("index.html", { cache: "no-store" })).text();
  const start = html.indexOf('<section id="party-battle-play-screen"');
  const section = html.slice(start, html.indexOf("</section>", start) + "</section>".length);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-2000px;top:0;width:393px;height:852px;overflow:hidden;";
  host.innerHTML = section;
  document.body.appendChild(host);
  const elements = {};
  Object.entries(ELEMENT_IDS).forEach(([key, id]) => {
    elements[key] = host.querySelector(`#${id}`);
  });
  assertEqual(Boolean(elements.rescueBox), true, "index.html に救済候補の箱（#party-play-rescue-box）がある");
  elements.onQuitRequested = () => {};
  const rescuedOrders = [];
  initPartyPlayScreen(elements);
  const { match, runtime: base, p1, p2 } = buildCase();
  const ui = (overrides = {}) => ({ countdownValue: null, showQuestionIntro: false, paused: false, resumeRequired: false, notice: null, lyricsElapsedMs: 0, voice: null, playbackStarted: true, finished: false, aborted: false, canReplay: false, rescuableVoiceAttempts: [], ...overrides });
  const render = (runtime, uiState) => renderPartyPlaySnapshot({ match, runtime, ui: uiState });

  const active = activateQuestion(beginCountdown(base));
  const afterP1 = wrongVoiceAnswer(active, p1, "イコールラブ", 1000);
  render(afterP1, ui({ rescuableVoiceAttempts: listRescuableVoiceAttempts(afterP1) }));
  assertEqual(elements.rescueBox.hidden, true, "出題中は救済UIを出さない");
  const wrongShowing = resolveWrong(claimAnswer(afterP1, { playerId: p2, choiceId: null }), { otetsuki: true });
  render(wrongShowing, ui({ rescuableVoiceAttempts: listRescuableVoiceAttempts(wrongShowing) }));
  assertEqual(elements.rescueBox.hidden, true, "不正解表示中（正解未公開）も出さない");

  const passed = passQuestion(afterP1);
  render(passed, ui({ rescuableVoiceAttempts: listRescuableVoiceAttempts(passed) }));
  assertEqual(elements.rescueBox.hidden, false, "全員PASS（正解公開）で救済UIが出る");
  assertEqual(elements.rescueBox.textContent.includes("判定を見直す回答があります"), true, "見出し");
  assertEqual(elements.rescueBox.textContent.includes("がしお") && elements.rescueBox.textContent.includes("イコールラブ"), true, "誰が何と認識されたか");
  assertEqual(elements.rescueBox.textContent.includes("自動判定：不正解"), true, "自動判定の結果");
  const buttons = [...elements.rescueBox.querySelectorAll(".party-rescue-button")];
  assertEqual(buttons.length, 1, "候補1件にボタン1つ");
  assertEqual(buttons[0].textContent, "この回答を正解に修正", "ボタン文言");
  assertEqual(elements.resultNextButton.hidden, false, "「次へ」は引き続き出る");
  assertEqual(elements.resultSong.textContent, "＝LOVE", "正解曲名は公開済みのまま");

  // 救済後の表示
  const rescued = rescueVoiceAttempt(match, passed, 1);
  renderPartyPlaySnapshot({ match: rescued.match, runtime: rescued.runtime, ui: ui({ rescuableVoiceAttempts: listRescuableVoiceAttempts(rescued.runtime), voice: { playerId: p1, status: "judged", transcripts: ["イコールラブ"], remainingMs: 0, speechStarted: true, verdict: { kind: "wrong" }, recognitionAvailable: true, stage: "result", stageDetail: "", manualReason: null } }) });
  assertEqual(elements.resultHeadline.textContent, "⭕ 判定を修正しました", "救済後の見出し");
  assertEqual(elements.resultDetail.textContent.includes("がしお +1pt"), true, "誰が最終正解者になったか");
  assertEqual(elements.resultSong.textContent, "＝LOVE", "正解曲名は公開のまま");
  assertEqual(elements.rescueBox.hidden, true, "候補が無くなれば救済UIは消える");
  assertEqual(elements.overrideButton.hidden, true, "救済で確定した結果には既存の「判定を修正」を出さない（混同しない）");
  assertEqual(elements.resultNextButton.hidden, false, "救済後は「次へ」");

  // 複数候補：回答順＋「これより前に…」の注意書き
  const { runtime: base2, p1: q1, p3: q3 } = buildCase();
  const active2 = activateQuestion(beginCountdown(base2));
  const multi = passQuestion(wrongVoiceAnswer(wrongVoiceAnswer(active2, q1, "イコールラブ", 1000), q3, "イコラブ", 3000));
  render(multi, ui({ rescuableVoiceAttempts: listRescuableVoiceAttempts(multi) }));
  const rows = [...elements.rescueBox.querySelectorAll(".party-rescue-row")];
  assertEqual(rows.map((row) => row.dataset.order), ["1", "2"], "複数候補は回答順");
  assertEqual(rows[0].querySelector(".party-rescue-note"), null, "最初の回答には注意書きなし");
  assertEqual(rows[1].querySelector(".party-rescue-note")?.textContent.includes("これより前に がしお の回答があります"), true, "後の回答には「これより前に○○の回答があります」");
  assertEqual(rows.every((row) => row.querySelector(".party-rescue-button")), true, "どの候補も人間が選べる（最終判断は人間）");
  assertEqual(p2 !== null && rescuedOrders.length === 0, true, "（前提）");

  // ケースB表示：後から正解した人の +1 取り消しが分かる
  const { match: matchB, runtime: baseB, p1: b1, p2: b2 } = buildCase();
  const activeB = activateQuestion(beginCountdown(baseB));
  let correctB = resolveCorrect(claimAnswer(wrongVoiceAnswer(activeB, b1, "イコールラブ", 1000), { playerId: b2, choiceId: null }));
  let matchBc;
  ({ match: matchBc, runtime: correctB } = creditCorrectScore(matchB, correctB));
  correctB = attempt(correctB, { playerId: b2, transcript: "＝LOVE", outcome: "correct", atMs: 2000 });
  const rescuedB = rescueVoiceAttempt(matchBc, correctB, 1);
  renderPartyPlaySnapshot({ match: rescuedB.match, runtime: rescuedB.runtime, ui: ui({ rescuableVoiceAttempts: listRescuableVoiceAttempts(rescuedB.runtime) }) });
  assertEqual(elements.resultDetail.textContent.includes("さな の+1点は取り消し"), true, "後から正解した人の +1 取り消しを表示");
  assertEqual(elements.rescueBox.hidden, false, "取り消された回答（overtaken）は候補として残る（戻し道）");
  assertEqual(elements.rescueBox.textContent.includes("他に見直す回答があります"), true, "救済後の見出しは「他に見直す回答があります」");
  assertEqual(elements.rescueBox.textContent.includes("先の回答を救済したため取り消し"), true, "overtaken の説明");

  // 4択回答（履歴なし）：救済UIは出ない
  const plain = passQuestion(activateQuestion(beginCountdown(baseB)));
  renderPartyPlaySnapshot({ match: matchB, runtime: plain, ui: ui({ rescuableVoiceAttempts: listRescuableVoiceAttempts(plain) }) });
  assertEqual(elements.rescueBox.hidden, true, "不正解回答が無い問題では従来どおり救済UIなし");

  resetPartyPlayScreen();
  host.remove();

  // エンジンのソース構造：記録タイミングと救済APIの配線
  const engine = await (await fetch("js/partyBattleEngine.js", { cache: "no-store" })).text();
  assertEqual(engine.includes("recordVoiceOutcome(\"wrong\", judgedBy)") && engine.includes("recordVoiceOutcome(\"correct\", judgedBy)"), true, "engine：正解／不正解の確定時に音声回答履歴を記録");
  assertEqual(engine.includes("recordVoiceOutcome(\"voided\", \"human\")"), true, "engine：既存の「正解→不正解へ修正」でも履歴を更新");
  assertEqual(engine.includes("rescueVoiceAttempt(order) {"), true, "engine：救済の公開API");
  assertEqual(engine.includes("rescuableVoiceAttempts: runtime ? listRescuableVoiceAttempts(runtime) : []"), true, "engine：snapshot に救済候補を載せる");
  const rescueBody = engine.slice(engine.indexOf("    rescueVoiceAttempt(order) {"), engine.indexOf("    requestJudgementOverride() {"));
  assertEqual(rescueBody.includes("stopAudio()") || rescueBody.includes("startCountdown()") || rescueBody.includes("startReviewPlayback"), false, "engine：救済は音源を止めも再生し直しもせず、再開もしない（答え合わせ再生のポリシーはそのまま）");
  const overrideBody = engine.slice(engine.indexOf("    requestJudgementOverride() {"), engine.indexOf("    passAll() {"));
  assertEqual(overrideBody.includes('runtime.lastResult?.type === "rescued") return;'), true, "engine：救済で確定した結果には既存の「判定を修正」を適用しない");
  const storage = await (await fetch("js/partyBattleStorage.js", { cache: "no-store" })).text();
  assertEqual(storage.includes("voiceAttempts"), false, "履歴（voiceAttempts）は保存データ（partyBattleStorage）へ入れない");
}
