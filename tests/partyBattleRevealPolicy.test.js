// パーティー対戦「正解曲名の公開ルール」のDOMテスト（2026-09-15 第2回実機QA修正・本人指示）。
//
// 【ルール】問題が継続する可能性がある間は正解曲名を絶対に公開しない。正解／全員PASS（一瞬は最終試聴）／
// 判定の取り消しで「問題終了が確定した瞬間」だけ公開する。5出題タイプ（イントロ／ランダム再生／アウトロ／
// 一瞬／歌詞）× 2回答方式（4択／音声）すべてで同じ。
//
// 【方法】本物の index.html の盤面セクションをこのテストページに差し込み、本物の js/partyBattlePlayScreen.js で
// 各状態を描画して「正解曲名の文字列が画面（オーバーレイ・中央カード）に含まれるか」を機械的に確認する。
// 状態遷移そのもの（canRevealSolution が立つタイミング）は tests/partyBattleState.test.js で検証済みなので、
// ここでは「画面側が canRevealSolution 以外の理由で曲名を描いていない」ことを、実際の状態遷移で作った
// runtime を使って確認する。

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
  markPlaybackStarted,
  markPlaybackEnded,
  canReplay,
  beginReplay,
  voidRevealedCorrect,
  canRevealSolution,
} from "../js/partyBattleState.js";
import { initPartyPlayScreen, renderPartyPlaySnapshot, resetPartyPlayScreen } from "../js/partyBattlePlayScreen.js";

const CORRECT_TITLE = "君と私の歌";
const SONGS_FAKE = [
  { id: "s1", title: CORRECT_TITLE },
  { id: "s2", title: "ズルいよ ズルいね" },
  { id: "s3", title: "CAMEO" },
  { id: "s4", title: "=LOVE" },
];
const HINTS_FAKE = [{ hintLevel: 1, segment: { text: "ヒントの歌詞の一節" } }];
const QUIZ_TYPES = ["intro", "random", "outro", "instant", "lyrics"];

const ELEMENT_IDS = {
  root: "party-play-root", seats: "party-play-seats", questionLabel: "party-play-question-label", lyrics: "party-play-lyrics",
  status: "party-play-status", passButton: "party-play-pass-button", passProgress: "party-play-pass-progress", replayButton: "party-play-replay-button",
  quitButton: "party-play-quit-button", quitProgress: "party-play-quit-progress", introOverlay: "party-play-intro-overlay",
  introText: "party-play-intro-text", resultOverlay: "party-play-result-overlay", resultHeadline: "party-play-result-headline",
  resultSong: "party-play-result-song", resultDetail: "party-play-result-detail", overrideButton: "party-play-override-button",
  resultNextButton: "party-play-result-next-button", voiceOverlay: "party-play-voice-overlay", voicePlayer: "party-play-voice-player",
  voiceTimer: "party-play-voice-timer", voiceTranscript: "party-play-voice-transcript", voiceHint: "party-play-voice-hint",
  judgeRow: "party-play-judge-row", judgeCorrectButton: "party-play-judge-correct-button", judgeWrongButton: "party-play-judge-wrong-button",
  notice: "party-play-notice", pauseOverlay: "party-play-pause-overlay", resumeButton: "party-play-resume-button",
};

let host = null;

async function mountPlayScreen() {
  const html = await (await fetch("index.html", { cache: "no-store" })).text();
  const start = html.indexOf('<section id="party-battle-play-screen"');
  const section = html.slice(start, html.indexOf("</section>", start) + "</section>".length);
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-2000px;top:0;width:393px;height:852px;overflow:hidden;";
  host.innerHTML = section;
  document.body.appendChild(host);
  const elements = {};
  Object.entries(ELEMENT_IDS).forEach(([key, id]) => {
    elements[key] = host.querySelector(`#${id}`);
  });
  elements.onQuitRequested = () => {};
  initPartyPlayScreen(elements);
}

function buildCase(quizType, answerMethod) {
  const settings = normalizePartySettings({ playerCount: 2, playerNames: ["あ", "い"], quizType, answerMethod, questionCountValue: quizType === "instant" ? "3" : "5", otetsuki: true, instantMaxListens: 3 });
  const built = buildPartyPlayers(settings);
  const question = { song: SONGS_FAKE[0], choices: SONGS_FAKE, hints: quizType === "lyrics" ? HINTS_FAKE : [] };
  const match = { ...createPartyMatch({ settings, players: built.players, layout: built.layout, seats: built.seats, questions: [question], plannedCount: 5, seed: 1 }), startedAt: Date.now() + Math.random() };
  const runtime = { ...createQuestionRuntime({ question, questionNumber: 1, totalQuestions: 5, isSuddenDeath: false, participantIds: resolveParticipantIds(match) }), ordinal: 1 };
  return { match, runtime };
}

function ui(overrides = {}) {
  return { countdownValue: null, showQuestionIntro: false, paused: false, resumeRequired: false, notice: null, lyricsElapsedMs: 3000, voice: null, playbackStarted: true, finished: false, aborted: false, canReplay: false, ...overrides };
}

function voice(status, extra = {}) {
  return { playerId: "p1", status, transcripts: extra.transcripts ?? ["きた"], remainingMs: 1500, speechStarted: false, verdict: extra.verdict ?? null, recognitionAvailable: extra.recognitionAvailable ?? true, stage: extra.stage ?? "listening", stageDetail: "", manualReason: extra.manualReason ?? null };
}

// 画面（オーバーレイと中央カード）の見えているテキストに正解曲名が含まれるか。
// 4択の選択肢ボタン（候補として最初から見えている）は対象外。
function visibleTextContainsTitle() {
  const ids = ["party-play-result-overlay", "party-play-voice-overlay", "party-play-center", "party-play-intro-overlay", "party-play-notice"];
  return ids.some((id) => {
    const element = host.querySelector(`#${id}`);
    if (!element || element.hidden) return false;
    return [...element.querySelectorAll("*")].some((node) => {
      if (node.hidden || node.closest("[hidden]")) return false;
      return node.childNodes.length > 0 && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.includes(CORRECT_TITLE));
    });
  });
}

function render(match, runtime, uiState) {
  renderPartyPlaySnapshot({ match, runtime, ui: uiState });
}

export async function runPartyBattleRevealPolicyTests() {
  await mountPlayScreen();

  for (const quizType of QUIZ_TYPES) {
    for (const answerMethod of ["fourChoice", "voice"]) {
      const label = `${quizType}／${answerMethod}`;
      const { match, runtime: base } = buildCase(quizType, answerMethod);
      const active = activateQuestion(beginCountdown(base));

      // 出題中・回答権獲得中（音声の聞き取り／人間判定待ち）は非公開
      render(match, active, ui());
      assertEqual(visibleTextContainsTitle(), false, `${label}：出題中は正解曲名を出さない`);
      const claimed = claimAnswer(active, { playerId: "p1", choiceId: answerMethod === "voice" ? null : "s2" });
      if (answerMethod === "voice") {
        render(match, claimed, ui({ voice: voice("listening") }));
        assertEqual(visibleTextContainsTitle(), false, `${label}：聞き取り中は正解曲名を出さない`);
        render(match, claimed, ui({ voice: voice("manual", { manualReason: "verdict:manual" }) }));
        assertEqual(visibleTextContainsTitle(), false, `${label}：人間判定待ち（曖昧）は正解曲名を出さない`);
        assertEqual(host.querySelector("#party-play-voice-hint").textContent.includes("今の回答を正解にしますか"), true, `${label}：人間判定の案内文は「今の回答を正解にしますか？」`);
        render(match, claimed, ui({ voice: voice("manual", { manualReason: "no-speech", transcripts: [] }) }));
        assertEqual(visibleTextContainsTitle(), false, `${label}：認識失敗（no-speech）は正解曲名を出さない`);
        render(match, claimed, ui({ voice: voice("manual", { manualReason: "unavailable:unsupported", recognitionAvailable: false, transcripts: [] }) }));
        assertEqual(visibleTextContainsTitle(), false, `${label}：API不可のフォールバックも正解曲名を出さない`);
      }

      // 不正解（自動／人間）→ 問題継続：非公開。再開後も非公開
      const wrong = resolveWrong(claimed, { otetsuki: true, judgedBy: answerMethod === "voice" ? "human" : "auto" });
      render(match, wrong, ui({ voice: answerMethod === "voice" ? voice("judged", { verdict: { kind: "wrong" } }) : null }));
      assertEqual(visibleTextContainsTitle(), false, `${label}：不正解の表示中は正解曲名を出さない`);
      assertEqual(host.querySelector("#party-play-result-song").textContent, "", `${label}：不正解では曲名欄が空`);
      if (answerMethod === "voice") {
        assertEqual(host.querySelector("#party-play-result-detail").textContent.includes("認識：「きた」"), true, `${label}：不正解でも認識した回答内容は表示してよい`);
      }
      const resumed = activateQuestion(finishWrongResult(wrong));
      render(match, resumed, ui());
      assertEqual(visibleTextContainsTitle(), false, `${label}：不正解後の再開でも正解曲名を出さない`);
      if (answerMethod === "fourChoice") {
        const eliminated = host.querySelectorAll(".party-choice-button.is-eliminated").length;
        assertEqual(eliminated, 2, `${label}：誤答候補だけが全席（2席）から消える`);
      }

      // 不正解→正解へ修正：公開＋問題終了
      const overturned = resolveCorrect(wrong, { judgedBy: "human" });
      render(match, overturned, ui({ voice: answerMethod === "voice" ? voice("judged", { verdict: { kind: "correct", byHuman: true } }) : null }));
      assertEqual(canRevealSolution(overturned), true, `${label}：不正解→正解へ修正すると問題終了（公開可）`);
      assertEqual(host.querySelector("#party-play-result-song").textContent, CORRECT_TITLE, `${label}：不正解→正解へ修正で正解曲名を公開`);

      // 正解（自動／人間）：ここで初めて公開
      const correct = resolveCorrect(claimAnswer(active, { playerId: "p2", choiceId: answerMethod === "voice" ? null : "s1" }));
      render(match, correct, ui({ voice: answerMethod === "voice" ? voice("judged", { verdict: { kind: "correct" } }) : null }));
      assertEqual(host.querySelector("#party-play-result-song").textContent, CORRECT_TITLE, `${label}：正解確定で正解曲名を公開`);
      assertEqual(host.querySelector("#party-play-result-next-button").hidden, false, `${label}：正解後は「次へ」`);

      // 正解→不正解へ修正：同じ問題は再開せず、0点で終了（曲名は公開済みのまま）
      assertEqual(beginCountdown(correct), null, `${label}：正解曲名を公開した問題は出題中へ戻れない`);
      assertEqual(resolveWrong(correct, { otetsuki: true, judgedBy: "human" }), null, `${label}：正解表示から不正解へ「覆して再開」はできない`);
      const voided = voidRevealedCorrect(correct);
      render(match, voided, ui({ voice: answerMethod === "voice" ? voice("judged", { verdict: { kind: "wrong", byHuman: true } }) : null }));
      assertEqual(voided.phase, PARTY_PHASE.PASS_RESULT, `${label}：正解→不正解へ修正は「0点で終了」`);
      assertEqual(host.querySelector("#party-play-result-headline").textContent.includes("不正解に修正"), true, `${label}：修正の表示が出る`);
      assertEqual(host.querySelector("#party-play-result-next-button").hidden, false, `${label}：修正後は「次へ」で次の問題へ`);

      // 全員PASS（問題終了）：公開。一瞬は最終試聴の全員PASSだけ公開
      if (["random", "outro", "instant"].includes(quizType)) {
        // 再聴（問題継続）：「🔁 もう一度聴く」が出ている状態でも、カウントダウン中でも正解曲名を出さない
        const ended = markPlaybackEnded(markPlaybackStarted(active));
        render(match, ended, ui({ canReplay: canReplay(ended, match.settings) }));
        assertEqual(host.querySelector("#party-play-replay-button").hidden, false, `${label}：再生終了後に「もう一度聴く」が出る`);
        assertEqual(host.querySelector("#party-play-pass-button").hidden, false, `${label}：「もう一度聴く」と同時に「全員PASS」も使える`);
        assertEqual(visibleTextContainsTitle(), false, `${label}：再聴できる状態でも正解曲名を出さない`);
        const replay = beginReplay(ended, match.settings);
        render(match, replay, ui({ countdownValue: 3 }));
        assertEqual(visibleTextContainsTitle(), false, `${label}：再聴のカウントダウン中も正解曲名を出さない`);
        assertEqual(host.querySelector("#party-play-replay-button").hidden, true, `${label}：再聴のカウントダウン中は「もう一度聴く」を出さない`);
      }
      const passed = passQuestion(active);
      render(match, passed, ui());
      assertEqual(host.querySelector("#party-play-result-song").textContent, CORRECT_TITLE, `${label}：全員PASS（問題終了）で正解曲名を公開`);
      assertEqual(host.querySelector("#party-play-replay-button").hidden, true, `${label}：問題終了後は「もう一度聴く」を出さない`);
      assertEqual(host.querySelector("#party-play-pass-button").hidden, true, `${label}：問題終了後は「全員PASS」を出さない`);
      resetPartyPlayScreen();
    }
  }

  host.remove();
  host = null;
}
