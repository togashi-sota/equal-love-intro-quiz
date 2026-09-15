// パーティー対戦「第5回実機QA修正」（2026-09-16・本人指示）のテスト：
//   (A) 歌詞クイズのヒント位置はランダムか（オンライン歌詞早押し対戦と同じ共通ロジックか）
//   (B) 結果カード（正解／不正解／全員PASS／判定修正／救済）の表示構造・公開ルール・演出の発火
//   (C) 効果音：正解「ピンポン」／不正解「ブー」／優勝ファンファーレが1回だけ・設定OFFで鳴らない
//   (D) 最終結果：順位発表→優勝者、優勝演出は試合終了時だけ
import { assertEqual } from "./test-utils.js";
import { buildLyricsQuizQuestions } from "../js/lyricsQuizQuestionBuilder.js";
import { computeStealHintProgress } from "../js/lyricsQuizBattleTiming.js";
import { resolveReviewPlaybackPlan } from "../js/partyBattleEngine.js";
import {
  PARTY_PHASE,
  PARTY_QUIZ_TYPE,
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
  passQuestion,
  creditCorrectScore,
  voidRevealedCorrect,
  recordVoiceAttempt,
  listRescuableVoiceAttempts,
  rescueVoiceAttempt,
  computeStandings,
  buildRevealOrder,
} from "../js/partyBattleState.js";
import { initPartyPlayScreen, renderPartyPlaySnapshot, resetPartyPlayScreen } from "../js/partyBattlePlayScreen.js";
import { SFX_EVENTS, SFX_THEMES, addSfxListener, getSfxSettings, setSfxMasterEnabled, setSfxGameEnabled, playSfx, previewSfxEvent } from "../js/soundManager.js";

// ===== (A) 歌詞ヒントのランダム性 =====
function buildLongDummyLines() {
  const texts = [
    "あさのひかりがまどからさす", "きみのことをおもいだしてる", "そらはあおくてかぜはあたたかい", "あしたもおなじみちをあるく",
    "とおくのまちへむかっている", "ゆうがたのかねがなりひびく", "ふたりでみたあのなつのそら", "なみだのあとにわらえるように",
    "よるのしずけさにみみをすます", "ほしをかぞえてねむりにつく", "あめあがりのにおいがすき", "さいごのてがみをひらいた",
  ];
  return texts.map((text, index) => ({ line: index + 1, text, start: index * 3, end: index * 3 + 2.8 }));
}

export function runPartyLyricsHintRandomnessTests() {
  const song = { id: "dummy-song", title: "夜明けの歌", searchAliases: [] };
  const songsWithLyrics = [{ song, lines: buildLongDummyLines() }];
  const build = (seed) =>
    buildLyricsQuizQuestions({ songsWithLyrics, songPool: [song.id], distractorSongPool: [song.id], questionCountValue: "1", answerPoolSizeValue: "4", seed })[0];
  const signature = (question) => question.hints.map((hint) => `${hint.hintLevel}:${hint.startLine}`).join("|");

  const seeds = [1, 2, 3, 7, 11, 42, 99, 1234, 55555, 987654];
  const signatures = seeds.map((seed) => signature(build(seed)));
  const distinct = new Set(signatures);
  assertEqual(distinct.size >= 6, true, `seed が違えばヒントに使う歌詞位置・順番が変わる（10 seed 中 ${distinct.size} 通り）`);
  assertEqual(signature(build(42)), signature(build(42)), "同じ seed なら同じヒント（決定論的＝同じ問題内で途中で変わらない）");
  const q = build(42);
  assertEqual(q.hints.map((hint) => hint.hintLevel), [1, 2, 3, 4], "ヒント1→2→3→4 の段階が付く");
  assertEqual(new Set(q.hints.map((hint) => hint.startLine)).size, 4, "4段階は互いに別の行");
  const chronological = q.hints.every((hint, index) => index === 0 || hint.startLine > q.hints[index - 1].startLine);
  const anySeedNonChronological = seeds.some((seed) => {
    const hints = build(seed).hints;
    return hints.some((hint, index) => index > 0 && hint.startLine < hints[index - 1].startLine);
  });
  assertEqual(anySeedNonChronological, true, "提示順は歌詞の登場順に固定されていない（seed によっては前後する＝抽選順）");
  assertEqual(typeof chronological, "boolean", "（前提）");
  // 答え合わせ位置：段階ごとの位置表があり、実際に選ばれた行の時刻と一致する
  q.hints.forEach((hint) => {
    assertEqual(typeof q.revealStartTimeSecByHintLevel[hint.hintLevel], "number", `段階${hint.hintLevel}の答え合わせ位置がある`);
  });
  const partyQuestion = { song, hints: q.hints, choices: q.answerPool, revealStartTimeSec: q.revealStartTimeSec, revealStartTimeSecByHintLevel: q.revealStartTimeSecByHintLevel };
  const hintTexts = q.hints.map((hint) => hint.segment?.text ?? "");
  const elapsedForLevel2 = hintTexts[0].length * 1000 + 2000 + 1500;
  const progress = computeStealHintProgress({ elapsedMs: elapsedForLevel2, hintTexts });
  assertEqual(progress.currentLevel, 2, "前提：2段階目の途中");
  const plan = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.LYRICS, question: partyQuestion, seed: 42, ordinal: 1, instantClipSec: 1, lyricsElapsedMs: elapsedForLevel2 });
  assertEqual(plan.computeStartTimeSec(600), q.revealStartTimeSecByHintLevel[2], "答え合わせは「実際に選ばれた（ランダムな）ヒント2の位置」から");
}

export async function runPartyLyricsHintSharedLogicTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const engine = await fetchText("js/partyBattleEngine.js");
  assertEqual(engine.includes("const [question] = buildLyricsQuizQuestions({") && engine.includes("const built = buildLyricsQuizQuestions({"), true, "パーティー歌詞の問題生成はオンライン歌詞対戦と同じ buildLyricsQuizQuestions（js/lyricsQuizQuestionBuilder.js）を使う");
  assertEqual(engine.includes("const seed = generateRandomSeed(32);"), true, "seed は試合ごとに乱数で作る（毎回同じヒントにならない）");
  const online = await fetchText("js/battleModes/lyricsQuizBattleMode.js");
  assertEqual(online.includes("buildLyricsQuizQuestions("), true, "オンライン歌詞対戦（battleModes/lyricsQuizBattleMode.js）も同じ buildLyricsQuizQuestions を使う");
  const segment = await fetchText("js/lyricsSegmentEngine.js");
  assertEqual(segment.includes("createHintSelectionRandom(seed, songId, questionIndex)") && segment.includes("pickRandomHintCandidates(usable, random, count)"), true, "ヒント4段階は seed・曲・問題番号から決まる乱数で「使える行全体から」抽選（共通ロジック）");
}

// ===== (B) 結果カード =====
const ELEMENT_IDS = {
  root: "party-play-root", seats: "party-play-seats", questionLabel: "party-play-question-label", lyrics: "party-play-lyrics",
  status: "party-play-status", passButton: "party-play-pass-button", passProgress: "party-play-pass-progress", replayButton: "party-play-replay-button",
  rescueBox: "party-play-rescue-box", resultIcon: "party-play-result-icon", resultPlayer: "party-play-result-player", resultPoints: "party-play-result-points",
  resultSongLabel: "party-play-result-song-label", resultScores: "party-play-result-scores",
  quitButton: "party-play-quit-button", quitProgress: "party-play-quit-progress", introOverlay: "party-play-intro-overlay",
  introText: "party-play-intro-text", resultOverlay: "party-play-result-overlay", resultHeadline: "party-play-result-headline",
  resultSong: "party-play-result-song", resultDetail: "party-play-result-detail", overrideButton: "party-play-override-button",
  resultNextButton: "party-play-result-next-button", voiceOverlay: "party-play-voice-overlay", voicePlayer: "party-play-voice-player",
  voiceTimer: "party-play-voice-timer", voiceTranscript: "party-play-voice-transcript", voiceHint: "party-play-voice-hint",
  judgeRow: "party-play-judge-row", judgeCorrectButton: "party-play-judge-correct-button", judgeWrongButton: "party-play-judge-wrong-button",
  notice: "party-play-notice", pauseOverlay: "party-play-pause-overlay", resumeButton: "party-play-resume-button",
};
const TITLE = "夢の続き";

function buildCase(answerMethod = "voice") {
  const settings = normalizePartySettings({ playerCount: 3, emptySeatId: "bottomRight", playerNames: ["がしお", "さな", "ゆい"], quizType: "intro", answerMethod, questionCountValue: "5", otetsuki: true });
  const built = buildPartyPlayers(settings);
  const songs = [{ id: "s1", title: TITLE }, { id: "s2", title: "CAMEO" }, { id: "s3", title: "＝LOVE" }, { id: "s4", title: "ナツマトペ" }];
  const question = { song: songs[0], choices: songs, hints: [] };
  const match = { ...createPartyMatch({ settings, players: built.players, layout: built.layout, seats: built.seats, questions: [question], plannedCount: 5, seed: 1 }), startedAt: Date.now() + Math.random() };
  const runtime = { ...createQuestionRuntime({ question, questionNumber: 1, totalQuestions: 5, isSuddenDeath: false, participantIds: resolveParticipantIds(match) }), ordinal: 1 };
  const [p1, p2, p3] = match.players.map((player) => player.id);
  return { match, runtime, p1, p2, p3 };
}

function ui(overrides = {}) {
  return { countdownValue: null, showQuestionIntro: false, paused: false, resumeRequired: false, notice: null, lyricsElapsedMs: 0, voice: null, playbackStarted: true, finished: false, aborted: false, canReplay: false, rescuableVoiceAttempts: [], ...overrides };
}

export async function runPartyBattleResultPresentationTests() {
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
  ["resultIcon", "resultPlayer", "resultPoints", "resultSongLabel", "resultScores"].forEach((key) => {
    assertEqual(Boolean(elements[key]), true, `index.html：結果カードの要素 ${key} がある`);
  });
  elements.onQuitRequested = () => {};
  initPartyPlayScreen(elements);

  // バイブは新しい結果のときだけ1回（同じ結果の再描画では繰り返さない）
  const vibrateCalls = [];
  let vibrateStubbed = false;
  try {
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: (pattern) => { vibrateCalls.push(pattern); return true; } });
    vibrateStubbed = true;
  } catch {
    vibrateStubbed = false;
  }
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const { match, runtime: base, p1, p2 } = buildCase();
  const render = (m, runtime, uiState = ui()) => renderPartyPlaySnapshot({ match: m, runtime, ui: uiState });
  const visibleText = (el) => (el.hidden ? "" : el.textContent);
  const active = activateQuestion(beginCountdown(base));

  // --- 正解 ---
  let correct = resolveCorrect(claimAnswer(active, { playerId: p1, choiceId: null }), { judgedBy: "auto" });
  let creditedMatch;
  ({ match: creditedMatch, runtime: correct } = creditCorrectScore(match, correct));
  render(creditedMatch, correct);
  assertEqual(elements.resultOverlay.dataset.kind, "correct", "正解：kind=correct");
  assertEqual(elements.resultIcon.textContent, "⭕", "正解：大きな⭕アイコン");
  assertEqual(elements.resultHeadline.textContent, "正解！", "正解：見出し");
  assertEqual(visibleText(elements.resultPlayer), "がしお", "正解：回答者名");
  assertEqual(elements.resultPlayer.dataset.color, match.players[0].color, "正解：回答者チップは席の色");
  assertEqual(visibleText(elements.resultPoints), "+1pt", "正解：+1pt");
  assertEqual(visibleText(elements.resultSongLabel), "正解", "正解：曲名に「正解」ラベル");
  assertEqual(elements.resultSong.textContent, TITLE, "正解：正解曲名を公開");
  assertEqual(elements.resultNextButton.hidden, false, "正解：「次へ」");
  assertEqual(elements.resultOverlay.classList.contains("is-entering"), true, "正解：登場演出クラスが付く");
  const chips = [...elements.resultScores.querySelectorAll(".party-result-score-chip")];
  assertEqual(chips.length, 3, "全員の得点チップ（3人）");
  assertEqual(chips[0].classList.contains("is-scored") && chips[0].textContent.includes("1pt") && chips[0].textContent.includes("+1"), true, "得点した人のチップが強調され +1 バッジ");
  assertEqual(chips[1].classList.contains("is-scored"), false, "得点していない人は強調しない");
  const vibrateAfterCorrect = vibrateCalls.length;
  render(creditedMatch, correct); // 同じ結果の再描画
  render(creditedMatch, correct);
  if (vibrateStubbed && !reduceMotion) {
    assertEqual(vibrateAfterCorrect, 1, "正解のバイブは1回");
    assertEqual(vibrateCalls.length, 1, "同じ結果を再描画してもバイブを繰り返さない");
  }
  render(creditedMatch, correct, ui({ voice: { playerId: p1, status: "judged", transcripts: ["ゆめのつづき"], remainingMs: 0, speechStarted: true, verdict: { kind: "correct" }, recognitionAvailable: true, stage: "result", stageDetail: "", manualReason: null } }));
  assertEqual(elements.overrideButton.hidden, false, "正解（音声）：「判定を修正」は従来どおり");

  // --- 不正解（曲名は絶対に出さない） ---
  const wrong = resolveWrong(claimAnswer(active, { playerId: p2, choiceId: null }), { otetsuki: true, judgedBy: "auto" });
  render(match, wrong, ui({ voice: { playerId: p2, status: "judged", transcripts: ["きゃめお"], remainingMs: 0, speechStarted: true, verdict: { kind: "wrong" }, recognitionAvailable: true, stage: "result", stageDetail: "", manualReason: null } }));
  assertEqual(elements.resultOverlay.dataset.kind, "wrong", "不正解：kind=wrong");
  assertEqual(elements.resultIcon.textContent, "❌", "不正解：❌アイコン");
  assertEqual(elements.resultHeadline.textContent, "不正解！", "不正解：見出し「不正解！」");
  assertEqual(visibleText(elements.resultPlayer), "さな", "不正解：回答者名");
  assertEqual(elements.resultPoints.hidden, true, "不正解：得点表示なし");
  assertEqual(elements.resultSong.hidden && elements.resultSong.textContent === "" && elements.resultSongLabel.hidden, true, "不正解：正解曲名も「正解」ラベルも出さない（公開ルール）");
  assertEqual(elements.resultDetail.textContent.includes("さな はこの問題では回答できません") && elements.resultDetail.textContent.includes("3・2・1から再開"), true, "不正解：お手つきの案内と再開の案内");
  assertEqual(elements.resultDetail.textContent.includes("認識：「きゃめお」"), true, "不正解：認識した文字列は出してよい");
  assertEqual(elements.resultOverlay.textContent.includes(TITLE), false, "不正解：オーバーレイのどこにも正解曲名が無い");
  assertEqual(elements.resultNextButton.hidden, true, "不正解：「次へ」は出ない（自動で再開）");
  if (vibrateStubbed && !reduceMotion) assertEqual(vibrateCalls.length, 2, "不正解でもバイブ1回");

  // --- 全員PASS ---
  const passed = passQuestion(active);
  render(match, passed);
  assertEqual(elements.resultOverlay.dataset.kind, "pass", "PASS：kind=pass");
  assertEqual(elements.resultIcon.textContent, "PASS", "PASS：アイコン");
  assertEqual(elements.resultHeadline.textContent, "全員PASS", "PASS：見出し");
  assertEqual(elements.resultPlayer.hidden, true, "PASS：回答者なし");
  assertEqual(visibleText(elements.resultPoints), "0pt", "PASS：0pt");
  assertEqual(visibleText(elements.resultSongLabel), "正解", "PASS：「正解」ラベル");
  assertEqual(elements.resultSong.textContent, TITLE, "PASS：正解曲名を明示");
  assertEqual(elements.resultDetail.textContent.includes("上の曲"), false, "PASS：「正解は上の曲でした」という参照表現をやめた");
  assertEqual(elements.resultNextButton.hidden, false, "PASS：「次へ」");
  assertEqual(elements.resultScores.querySelectorAll(".is-scored").length, 0, "PASS：誰も強調しない");

  // --- 判定修正（voided）と救済（rescued） ---
  const voided = voidRevealedCorrect(correct);
  render(match, voided, ui({ voice: { playerId: p1, status: "judged", transcripts: ["ゆめのつづき"], remainingMs: 0, speechStarted: true, verdict: { kind: "wrong", byHuman: true }, recognitionAvailable: true, stage: "result", stageDetail: "", manualReason: null } }));
  assertEqual(elements.resultOverlay.dataset.kind, "voided", "voided：kind");
  assertEqual(elements.resultHeadline.textContent.includes("不正解に修正"), true, "voided：見出し");
  assertEqual(visibleText(elements.resultPoints), "0pt", "voided：0pt");
  assertEqual(elements.resultSong.textContent, TITLE, "voided：曲名は公開のまま");
  let rescuedBase = recordVoiceAttempt(passed, { key: `${p2}:1`, playerId: p2, transcripts: ["ゆめのつづき"], matchedTitle: null, autoVerdict: "wrong", judgedBy: "auto", outcome: "wrong", atMs: 1 });
  const rescued = rescueVoiceAttempt(match, rescuedBase, 1);
  render(rescued.match, rescued.runtime, ui({ rescuableVoiceAttempts: listRescuableVoiceAttempts(rescued.runtime) }));
  assertEqual(elements.resultOverlay.dataset.kind, "rescued", "rescued：kind");
  assertEqual(elements.resultIcon.textContent, "⭕", "rescued：⭕");
  assertEqual(visibleText(elements.resultPlayer), "さな", "rescued：救済した人");
  assertEqual(visibleText(elements.resultPoints), "+1pt", "rescued：+1pt");
  assertEqual(elements.overrideButton.hidden, true, "rescued：既存の「判定を修正」は出さない");
  assertEqual(elements.rescueBox.hidden, true, "rescued：候補が無ければ救済UIは消える");

  // 救済候補がある PASS：結果カードと救済UIが共存
  const withCandidates = recordVoiceAttempt(passed, { key: `${p1}:1`, playerId: p1, transcripts: ["ゆめのつづき"], matchedTitle: null, autoVerdict: "wrong", judgedBy: "auto", outcome: "wrong", atMs: 1 });
  render(match, withCandidates, ui({ rescuableVoiceAttempts: listRescuableVoiceAttempts(withCandidates) }));
  assertEqual(!elements.rescueBox.hidden && elements.resultSong.textContent === TITLE, true, "PASS＋救済候補：救済UIと正解曲名の両方");
  assertEqual(elements.resultNextButton.hidden, false, "PASS＋救済候補：「次へ」");

  resetPartyPlayScreen();
  assertEqual(elements.resultOverlay.classList.contains("is-entering"), false, "reset で演出クラスが外れる");
  if (vibrateStubbed) delete navigator.vibrate;
  host.remove();
}

// ===== (C) 効果音 =====
export function runPartyBattleSfxTests() {
  assertEqual(SFX_EVENTS.PARTY_CORRECT, "partyCorrect", "パーティー正解音のイベントがある");
  assertEqual(SFX_EVENTS.PARTY_WRONG, "partyWrong", "パーティー不正解音のイベントがある");
  assertEqual(SFX_EVENTS.PARTY_WINNER, "partyWinner", "パーティー優勝ファンファーレのイベントがある");
  Object.values(SFX_THEMES).forEach((theme) => {
    [SFX_EVENTS.PARTY_CORRECT, SFX_EVENTS.PARTY_WRONG, SFX_EVENTS.PARTY_WINNER].forEach((eventId) => {
      let threw = false;
      try {
        previewSfxEvent(eventId, theme);
      } catch {
        threw = true;
      }
      assertEqual(threw, false, `テーマ${theme}で${eventId}の試聴が例外を投げない（3テーマぶん定義済み）`);
    });
  });

  const played = [];
  const remove = addSfxListener((eventName) => played.push(eventName));
  const before = getSfxSettings();
  setSfxMasterEnabled(true);
  setSfxGameEnabled(true);
  playSfx(SFX_EVENTS.PARTY_CORRECT);
  assertEqual(played, [SFX_EVENTS.PARTY_CORRECT], "ON なら鳴る（リスナーへ1回通知）");
  setSfxMasterEnabled(false);
  playSfx(SFX_EVENTS.PARTY_CORRECT);
  playSfx(SFX_EVENTS.PARTY_WRONG);
  assertEqual(played.length, 1, "マスターOFFでは鳴らない（通知もしない）");
  setSfxMasterEnabled(true);
  setSfxGameEnabled(false);
  playSfx(SFX_EVENTS.PARTY_WINNER);
  assertEqual(played.length, 1, "ゲーム効果音OFFでも鳴らない");
  setSfxGameEnabled(true);
  playSfx(SFX_EVENTS.PARTY_WINNER);
  assertEqual(played.length, 2, "戻せば鳴る");
  remove();
  playSfx(SFX_EVENTS.PARTY_WRONG);
  assertEqual(played.length, 2, "リスナー解除後は通知されない");
  restoreSfxSettings(before);
}

// テスト前の効果音設定へ戻したうえで、localStorage に保存された値は消す（tests/soundManager.test.js の clearAllKeys と同じ扱い。
// 残すと次回のページ読み込みで「デフォルトはON」のテストが保存値に引きずられる）。
function restoreSfxSettings(before) {
  setSfxMasterEnabled(before.masterEnabled);
  setSfxGameEnabled(before.gameEnabled);
  ["equalLoveIntroQuiz.sfxEnabled", "equalLoveIntroQuiz.sfxUiEnabled", "equalLoveIntroQuiz.sfxGameEnabled"].forEach((key) => localStorage.removeItem(key));
}

export async function runPartyBattleSfxWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const engine = await fetchText("js/partyBattleEngine.js");
  assertEqual(engine.includes("QUIZ_CORRECT") || engine.includes("QUIZ_WRONG"), false, "engine：通常クイズの正解／不正解音ではなくパーティー専用音を使う");
  const correctBody = engine.slice(engine.indexOf("  function applyCorrect("), engine.indexOf("  // ----- 音声回答 -----"));
  assertEqual((correctBody.match(/playSfx\(SFX_EVENTS\.PARTY_CORRECT\)/g) ?? []).length, 1, "engine：正解確定（applyCorrect）で PARTY_CORRECT を1回");
  const wrongBody = engine.slice(engine.indexOf("  function applyWrong("), engine.indexOf("  // 【2026-09-15 第4回実機QA修正・本人指示：音声回答の誤判定を正解公開後に救済】"));
  assertEqual((wrongBody.match(/playSfx\(SFX_EVENTS\.PARTY_WRONG\)/g) ?? []).length, 1, "engine：不正解確定（applyWrong）で PARTY_WRONG を1回");
  const humanJudge = engine.slice(engine.indexOf("    humanJudge(isCorrect) {"), engine.indexOf("    // 【2026-09-15 第4回実機QA修正・本人指示】正解公開後の救済"));
  assertEqual(humanJudge.includes("applyCorrect({ judgedBy: \"human\" })") && humanJudge.includes("applyWrong({ judgedBy: \"human\" })"), true, "engine：人間判定も applyCorrect／applyWrong を通る（同じ音・1回）");
  assertEqual(humanJudge.includes("playSfx(SFX_EVENTS.PARTY_WRONG)"), true, "engine：正解→不正解への修正（voided）でも不正解音");
  const correctResultEarlyReturn = humanJudge.includes("if (runtime.phase === PARTY_PHASE.CORRECT_RESULT) {\n          emit();\n          return;");
  assertEqual(correctResultEarlyReturn, true, "engine：正解表示中に⭕を押し直しても applyCorrect を再実行しない（二重発火なし）");
  const rescueBody = engine.slice(engine.indexOf("    rescueVoiceAttempt(order) {"), engine.indexOf("    requestJudgementOverride() {"));
  assertEqual((rescueBody.match(/playSfx\(SFX_EVENTS\.PARTY_CORRECT\)/g) ?? []).length, 1, "engine：救済確定で正解音を1回");
  assertEqual(engine.includes("const REVIEW_PLAYBACK_DELAY_MS = 1300;"), true, "engine：答え合わせ再生は正解音（約1.15秒）が鳴り終わってから");
  const screen = await fetchText("js/partyBattleScreen.js");
  assertEqual(screen.includes("playSfx(SFX_EVENTS.PARTY_WINNER)"), true, "最終結果：優勝発表で専用ファンファーレ");
  assertEqual(screen.includes("playSfx(SFX_EVENTS.BATTLE_WIN)"), false, "最終結果：汎用の勝利音ではなく専用音");
  const sound = await fetchText("js/soundManager.js");
  assertEqual(sound.includes("sfxListeners.forEach") && sound.indexOf("if (!sfxMasterEnabled) return;") < sound.indexOf("sfxListeners.forEach"), true, "soundManager：リスナー通知は ON/OFF 判定の後（設定尊重）");
  const definitionsBlock = sound.slice(sound.indexOf("[SFX_EVENTS.PARTY_CORRECT]: {"), sound.indexOf("[SFX_EVENTS.PARTY_WINNER]: {"));
  const gains = [...definitionsBlock.matchAll(/N2\([^)]*?,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)/g)].map((m) => Number(m[1]));
  assertEqual(gains.length > 0 && gains.every((gain) => gain <= 0.4), true, "soundManager：パーティー音の各音の gain は 0.4 以下（爆音にしない。音量スライダーはこの値に掛かる）");
  assertEqual(sound.includes("function getAudioContext()") && sound.includes(".resume()"), true, "soundManager：既存の AudioContext 共有・resume（iPhone PWA の unlock）をそのまま使う");
}

// ===== (D) 最終結果 =====
export async function runPartyBattleFinalResultTests() {
  const { match, p1, p2, p3 } = buildCase("fourChoice");
  const scored = { ...match, scores: { [p1]: 2, [p2]: 3, [p3]: 1 }, winnerId: p2, status: "finished" };
  const standings = computeStandings(scored);
  assertEqual(standings.map((row) => row.playerId), [p2, p1, p3], "順位：得点順");
  const order = buildRevealOrder(standings);
  assertEqual(order.map((row) => row.playerId), [p3, p1, p2], "発表順：下位→上位→優勝者");
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const screen = await fetchText("js/partyBattleScreen.js");
  const showResult = screen.slice(screen.indexOf("function showResult(match) {"), screen.indexOf("function buildSummaryChipsForResult"));
  assertEqual(showResult.includes("if (isWinner) return;") && showResult.includes("const winnerDelay = stepMs * (order.length + 1);"), true, "優勝者は最後に別枠で発表（いきなり全順位を静的表示しない）");
  assertEqual(showResult.includes("spawnConfetti();") && showResult.includes("spawnWinnerBurst();") && showResult.includes("playSfx(SFX_EVENTS.PARTY_WINNER);") && showResult.includes("navigator.vibrate?.([120, 60, 120, 60, 240])"), true, "優勝発表：紙吹雪＋sparkle burst＋ファンファーレ＋バイブ");
  assertEqual(showResult.includes("if (!reduceMotionNow)"), true, "prefers-reduced-motion ではバイブを省く");
  assertEqual(showResult.includes("playSfx(SFX_EVENTS.COUNTDOWN_TICK);"), true, "順位発表の1行ごとに秒読み音（ドラムロール代わり）");
  const play = await fetchText("js/partyBattlePlayScreen.js");
  assertEqual(play.includes("spawnConfetti") || play.includes("PARTY_WINNER"), false, "通常問題の正解では優勝演出（紙吹雪・ファンファーレ）を出さない");
  const html = await fetchText("index.html");
  assertEqual(html.includes('id="party-result-winner-burst"') && html.includes('class="party-winner-trophy"'), true, "index.html：優勝カードに🏆と burst 領域");
  const css = await fetchText("css/style.css");
  assertEqual(css.includes(".party-winner-burst-piece,") && css.includes("@media (prefers-reduced-motion: reduce)"), true, "css：reduced-motion で burst／登場演出を止める");
  assertEqual(css.includes(".party-result-overlay.is-entering .party-result-icon,") && css.includes(".party-result-overlay.is-entering[data-kind=\"wrong\"] .party-result-icon"), true, "css：正解 pop／不正解 shake の演出定義");
}

// ===== (C') エンジンを実際に回して効果音の発火回数を数える（歌詞モード＝音源不要、4択、実タイマー） =====
// 正解→1回、次の問題で不正解→1回、人間判定は音声モード専用なので、ここでは4択の自動判定を通す。
export async function runPartyBattleSfxEngineFlowTests() {
  const { createPartyBattleEngine } = await import("../js/partyBattleEngine.js");
  const settings = normalizePartySettings({ playerCount: 2, playerNames: ["あ", "い"], quizType: "lyrics", answerMethod: "fourChoice", questionCountValue: "5", otetsuki: false });
  const built = buildPartyPlayers(settings);
  const songs = [{ id: "s1", title: "曲A" }, { id: "s2", title: "曲B" }, { id: "s3", title: "曲C" }, { id: "s4", title: "曲D" }];
  const hints = [{ hintLevel: 1, segment: { text: "あいうえお" } }];
  const questions = songs.slice(0, 3).map((song) => ({ song, choices: songs, hints, revealStartTimeSec: 0, revealStartTimeSecByHintLevel: { 1: 0 } }));
  const match = createPartyMatch({ settings, players: built.players, layout: built.layout, seats: built.seats, questions, plannedCount: 3, seed: 1 });
  const [p1, p2] = match.players.map((player) => player.id);
  const played = [];
  const remove = addSfxListener((eventName) => played.push(eventName));
  const before = getSfxSettings();
  setSfxMasterEnabled(true);
  setSfxGameEnabled(true);
  let latest = null;
  const engine = createPartyBattleEngine({ onUpdate: (snapshot) => { latest = snapshot; } });
  engine.load(match, { poolSongs: songs, distractorSongs: songs, songsWithLyrics: [] });
  engine.start();
  const waitFor = (predicate, ms = 8000) => new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt > ms) return reject(new Error("timeout"));
      setTimeout(tick, 50);
    };
    tick();
  });
  try {
    await waitFor(() => latest?.runtime?.phase === PARTY_PHASE.ACTIVE);
    const count = (name) => played.filter((event) => event === name).length;
    engine.pressChoice(p1, "s1", performance.now()); // 正解
    assertEqual(latest.runtime.phase, PARTY_PHASE.CORRECT_RESULT, "engine flow：正解");
    assertEqual(count(SFX_EVENTS.PARTY_CORRECT), 1, "engine flow：正解確定で正解音がちょうど1回");
    assertEqual(count(SFX_EVENTS.PARTY_WRONG), 0, "engine flow：正解では不正解音なし");
    assertEqual(count(SFX_EVENTS.PARTY_WINNER), 0, "engine flow：通常問題の正解では優勝ファンファーレを鳴らさない");
    engine.pressChoice(p2, "s2", performance.now()); // 結果表示中の入力は無視
    assertEqual(count(SFX_EVENTS.PARTY_CORRECT) + count(SFX_EVENTS.PARTY_WRONG), 1, "engine flow：結果表示中の入力で音は増えない");
    engine.next();
    await waitFor(() => latest?.runtime?.phase === PARTY_PHASE.ACTIVE && latest.runtime.questionNumber === 2);
    engine.pressChoice(p2, "s1", performance.now()); // 第2問の正解は s2 → 不正解
    assertEqual(latest.runtime.phase, PARTY_PHASE.WRONG_RESULT, "engine flow：不正解");
    assertEqual(count(SFX_EVENTS.PARTY_WRONG), 1, "engine flow：不正解確定で不正解音がちょうど1回");
    assertEqual(count(SFX_EVENTS.PARTY_CORRECT), 1, "engine flow：不正解では正解音は増えない");
    // 不正解 → 2秒 → 3・2・1 → 再開（お手つき無しなので同じ人が再回答できる）→ 正解 → 1対1
    await waitFor(() => latest?.runtime?.phase === PARTY_PHASE.ACTIVE, 10000);
    engine.pressChoice(p2, "s2", performance.now());
    assertEqual(latest.runtime.phase, PARTY_PHASE.CORRECT_RESULT, "engine flow：再開後に正解");
    assertEqual(count(SFX_EVENTS.PARTY_CORRECT), 2, "engine flow：2問目の正解でも正解音は1回ずつ");
    // 第3問：SFX OFF なら不正解でも鳴らない（判定は動く）。全員PASS では正解音も不正解音も鳴らない
    engine.next();
    await waitFor(() => latest?.runtime?.phase === PARTY_PHASE.ACTIVE && latest.runtime.questionNumber === 3, 10000);
    setSfxMasterEnabled(false);
    engine.pressChoice(p1, "s4", performance.now()); // 第3問の正解は s3 → 不正解
    assertEqual(latest.runtime.phase, PARTY_PHASE.WRONG_RESULT, "engine flow：SFX OFF でも判定は動く");
    assertEqual(count(SFX_EVENTS.PARTY_WRONG), 1, "engine flow：SFX OFF なら不正解でも鳴らない");
    setSfxMasterEnabled(true);
    await waitFor(() => latest?.runtime?.phase === PARTY_PHASE.ACTIVE, 10000);
    engine.passAll();
    assertEqual(latest.runtime.phase, PARTY_PHASE.PASS_RESULT, "engine flow：全員PASS");
    assertEqual(count(SFX_EVENTS.PARTY_CORRECT) + count(SFX_EVENTS.PARTY_WRONG), 3, "engine flow：全員PASSでは正解音も不正解音も鳴らない");
    assertEqual(count(SFX_EVENTS.PARTY_WINNER), 0, "engine flow：エンジンは優勝ファンファーレを鳴らさない（最終結果画面だけ）");
  } finally {
    engine.dispose();
    remove();
    // engine.start() が保存した「前回の設定・名前」をテスト環境に残さない
    ["equalLoveIntroQuiz.partyBattle.recentNames", "equalLoveIntroQuiz.partyBattle.lastSettings"].forEach((key) => localStorage.removeItem(key));
    restoreSfxSettings(before);
  }
}
