// パーティー対戦「盤面」の寸法テスト（2026-09-15 第2回実機QA修正）。
//
// 【背景】本人のiPhone実機で、正解表示中の「判定を修正」ボタンが画面中央を縦いっぱいに占有する崩れが
// 見つかった。原因はアプリ共通の .secondary-button が持つ flex:1 が、盤面オーバーレイ（縦方向の
// flexコンテナ）の中で「縦の伸長」として働いたこと。ロジックテストでは検出できない種類の不具合なので、
// 本物の index.html／css/style.css／js/partyBattlePlayScreen.js を iframe（各viewport）に読み込み、
// 人数（2/3/4）・出題タイプ（4択／音声／一瞬／歌詞）・向き（縦／横）・中央UIの全状態
// （出題中／カウント／正解／不正解／PASS／人間判定／聞き取り中／判定修正／一時停止／問題番号表示）を
// 実際に描画して寸法を測る。
//
// 【検査内容】横スクロール0／盤面がviewport高さを超えない／オーバーレイ内の要素（見出し・曲名・ボタン）が
// 縦に異常伸長しない（高さ上限・縦横比）／「次へ」「判定を修正」「正解／不正解」がviewport内／
// 出題中は中央カードが席と重ならない／席・選択肢が盤面内に収まる。

import { assertEqual } from "./test-utils.js";
import {
  PARTY_PHASE,
  normalizePartySettings,
  buildPartyPlayers,
  createPartyMatch,
  createQuestionRuntime,
  resolveParticipantIds,
} from "../js/partyBattleState.js";

const VIEWPORTS = [
  { w: 393, h: 852 }, // iPhone 15（今回の実機スクリーンショット相当）
  { w: 375, h: 667 },
  { w: 430, h: 932 },
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 852, h: 393 }, // スマホ横
];
const PLAYER_COUNTS = [2, 3, 4];
const TYPE_CASES = [
  { quizType: "intro", answerMethod: "fourChoice" },
  { quizType: "intro", answerMethod: "voice" },
  { quizType: "instant", answerMethod: "fourChoice" },
  { quizType: "random", answerMethod: "fourChoice" }, // 再聴（もう一度聴く）＋全員PASSの同時表示
  { quizType: "lyrics", answerMethod: "voice" },
];
const MAX_BUTTON_HEIGHT_PX = 90;
const MAX_OVERLAY_ITEM_RATIO = 0.3; // オーバーレイ内の1要素の高さは盤面高さの30%まで

const SONGS_FAKE = [
  { id: "s1", title: "木漏れ日メゾフォルテ" },
  { id: "s2", title: '青春"サブリミナル"' },
  { id: "s3", title: "とても長い曲名のサンプルとても長い曲名のサンプル" },
  { id: "s4", title: "=LOVE" },
];
const HINTS_FAKE = [
  { hintLevel: 1, segment: { text: "木漏れ日の中でメゾフォルテに響く歌声" } },
  { hintLevel: 2, segment: { text: "二行目のヒントもここに表示される長さのテキスト" } },
];

function extractPlaySection(html) {
  const start = html.indexOf('<section id="party-battle-play-screen"');
  const end = html.indexOf("</section>", start) + "</section>".length;
  return html.slice(start, end);
}

const ELEMENT_IDS = {
  root: "party-play-root",
  seats: "party-play-seats",
  questionLabel: "party-play-question-label",
  lyrics: "party-play-lyrics",
  status: "party-play-status",
  passButton: "party-play-pass-button",
  passProgress: "party-play-pass-progress",
  replayButton: "party-play-replay-button",
  rescueBox: "party-play-rescue-box",
  resultIcon: "party-play-result-icon",
  resultPlayer: "party-play-result-player",
  resultPoints: "party-play-result-points",
  resultSongLabel: "party-play-result-song-label",
  resultScores: "party-play-result-scores",
  quitButton: "party-play-quit-button",
  quitProgress: "party-play-quit-progress",
  introOverlay: "party-play-intro-overlay",
  introText: "party-play-intro-text",
  resultOverlay: "party-play-result-overlay",
  resultHeadline: "party-play-result-headline",
  resultSong: "party-play-result-song",
  resultDetail: "party-play-result-detail",
  overrideButton: "party-play-override-button",
  resultNextButton: "party-play-result-next-button",
  voiceOverlay: "party-play-voice-overlay",
  voicePlayer: "party-play-voice-player",
  voiceTimer: "party-play-voice-timer",
  voiceTranscript: "party-play-voice-transcript",
  voiceHint: "party-play-voice-hint",
  judgeRow: "party-play-judge-row",
  judgeCorrectButton: "party-play-judge-correct-button",
  judgeWrongButton: "party-play-judge-wrong-button",
  notice: "party-play-notice",
  pauseOverlay: "party-play-pause-overlay",
  resumeButton: "party-play-resume-button",
};

function loadPlayIframe({ w, h }, sectionHtml) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;opacity:0;pointer-events:none;border:0;`;
    document.body.appendChild(iframe);
    const baseHref = location.href.replace(/[^/]*$/, "");
    const elementsLiteral = Object.entries(ELEMENT_IDS)
      .map(([key, id]) => `${key}: document.getElementById("${id}")`)
      .join(",");
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><base href="${baseHref}">` +
        `<link rel="stylesheet" href="css/style.css"></head>` +
        `<body data-screen="partyBattlePlay"><main class="game-frame">${sectionHtml}</main>` +
        `<script type="module">
          import { initPartyPlayScreen, renderPartyPlaySnapshot } from "./js/partyBattlePlayScreen.js";
          document.getElementById("party-battle-play-screen").classList.add("is-active");
          initPartyPlayScreen({ ${elementsLiteral}, onQuitRequested() {} });
          window.__render = renderPartyPlaySnapshot;
          window.__ready = true;
        </script></body></html>`
    );
    doc.close();
    const startedAt = Date.now();
    const poll = () => {
      const win = iframe.contentWindow;
      const sheetReady = doc.querySelector("link")?.sheet;
      if (win && win.__ready && sheetReady) {
        setTimeout(() => resolve({ iframe, doc, win }), 30);
        return;
      }
      if (Date.now() - startedAt > 8000) {
        reject(new Error("盤面iframeの初期化がタイムアウト"));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

function buildMatch(playerCount, quizType, answerMethod) {
  const settings = normalizePartySettings({
    playerCount,
    emptySeatId: playerCount === 3 ? "bottomRight" : null,
    playerNames: ["あい", "とても長いなまえのひと", "さな", "りん"],
    quizType,
    answerMethod,
    questionCountValue: quizType === "instant" ? "3" : "5",
    otetsuki: true,
  });
  const built = buildPartyPlayers(settings);
  const question = { song: SONGS_FAKE[0], choices: SONGS_FAKE, hints: quizType === "lyrics" ? HINTS_FAKE : [] };
  const match = { ...createPartyMatch({ settings, players: built.players, layout: built.layout, seats: built.seats, questions: [question], plannedCount: 5, seed: 1 }), startedAt: 1 };
  const runtime = {
    ...createQuestionRuntime({ question, questionNumber: 1, totalQuestions: 5, isSuddenDeath: false, participantIds: resolveParticipantIds(match) }),
    ordinal: 1,
  };
  return { match, runtime };
}

function buildUi(overrides = {}) {
  return {
    countdownValue: null,
    showQuestionIntro: false,
    paused: false,
    resumeRequired: false,
    notice: null,
    lyricsElapsedMs: 8000,
    voice: null,
    playbackStarted: true,
    finished: false,
    aborted: false,
    canReplay: false,
    rescuableVoiceAttempts: [],
    ...overrides,
  };
}

// 【第4回実機QA修正】音声回答の救済候補（正解公開後の結果表示に出る）
function rescueAttempts(match, count) {
  return match.players.slice(0, count).map((player, index) => ({
    order: index + 1,
    key: `${player.id}:${index}`,
    playerId: player.id,
    transcripts: [index === 0 ? "イコールラブ" : "とても長い認識結果の文字列がここに入ります"],
    matchedTitle: null,
    autoVerdict: "wrong",
    judgedBy: "auto",
    outcome: "wrong",
    atMs: index * 1000,
  }));
}

function voiceUi(playerId, status, extra = {}) {
  return {
    playerId,
    status,
    transcripts: extra.transcripts ?? [],
    remainingMs: extra.remainingMs ?? 1800,
    speechStarted: false,
    verdict: extra.verdict ?? null,
    recognitionAvailable: extra.recognitionAvailable ?? true,
    stage: extra.stage ?? "listening",
    stageDetail: "",
    manualReason: extra.manualReason ?? null,
  };
}

// 中央UIが切り替わる状態の一覧（出題タイプ・回答方式に応じて音声系は音声回答のときだけ）
function buildStates({ match, runtime }, answerMethod) {
  const p1 = match.players[0].id;
  const active = { ...runtime, phase: PARTY_PHASE.ACTIVE };
  const claimed = { ...runtime, phase: PARTY_PHASE.CLAIMED, acceptedClaim: { playerId: p1, choiceId: null } };
  const correct = { ...runtime, phase: PARTY_PHASE.CORRECT_RESULT, solutionRevealed: true, acceptedClaim: { playerId: p1, choiceId: "s1" }, lastResult: { type: "correct", playerId: p1, choiceId: "s1", revived: false, judgedBy: "human" } };
  const wrong = { ...runtime, phase: PARTY_PHASE.WRONG_RESULT, acceptedClaim: { playerId: p1, choiceId: "s2" }, eliminatedChoiceIds: ["s2"], lockedPlayerIds: [p1], lastResult: { type: "wrong", playerId: p1, choiceId: "s2", revived: false, judgedBy: "auto" } };
  const revived = { ...wrong, lockedPlayerIds: [], revivedAll: true, lastResult: { ...wrong.lastResult, revived: true } };
  const pass = { ...runtime, phase: PARTY_PHASE.PASS_RESULT, solutionRevealed: true, lastResult: { type: "pass", playerId: null, choiceId: null, revived: false, judgedBy: "auto" } };
  const voided = { ...correct, phase: PARTY_PHASE.PASS_RESULT, lastResult: { type: "voided", playerId: p1, choiceId: null, revived: false, judgedBy: "human" } };
  const states = [
    { name: "問題番号表示", runtime: { ...runtime }, ui: buildUi({ showQuestionIntro: true }) },
    { name: "カウントダウン", runtime: { ...runtime, phase: PARTY_PHASE.COUNTDOWN }, ui: buildUi({ countdownValue: 3 }) },
    { name: "START!", runtime: active, ui: buildUi({ countdownValue: "START" }) },
    { name: "出題中", runtime: active, ui: buildUi() },
    { name: "再生終了（もう一度聴く＋全員PASS）", runtime: { ...active, playCount: 1, playbackEnded: true }, ui: buildUi({ canReplay: true }) },
    { name: "正解", runtime: correct, ui: buildUi() },
    { name: "不正解（お手つき）", runtime: wrong, ui: buildUi() },
    { name: "全員復活", runtime: revived, ui: buildUi() },
    { name: "全員PASS", runtime: pass, ui: buildUi() },
    { name: "全員PASS＋救済候補2件", runtime: pass, ui: buildUi({ rescuableVoiceAttempts: rescueAttempts(match, Math.min(2, match.players.length)) }) },
    { name: "救済後（判定を修正しました）", runtime: { ...correct, acceptedClaim: { playerId: p1, choiceId: null }, lastResult: { type: "rescued", playerId: p1, choiceId: null, revived: false, judgedBy: "human", previousPlayerId: match.players[1]?.id ?? null, previousType: "correct" } }, ui: buildUi({ rescuableVoiceAttempts: rescueAttempts(match, 1).map((entry) => ({ ...entry, order: 2, outcome: "overtaken" })) }) },
    { name: "サドンデス出題中", runtime: { ...active, isSuddenDeath: true, participantIds: [p1] }, ui: buildUi() },
    { name: "一時停止", runtime: active, ui: buildUi({ paused: true, resumeRequired: true }) },
    { name: "差し替え通知", runtime: active, ui: buildUi({ notice: { text: "この問題の音源を再生できません。別の問題に差し替えます。", kind: "warn" } }) },
  ];
  if (answerMethod === "voice") {
    states.push(
      { name: "音声：起動中", runtime: claimed, ui: buildUi({ voice: voiceUi(p1, "listening", { stage: "starting" }) }) },
      { name: "音声：聞き取り中", runtime: claimed, ui: buildUi({ voice: voiceUi(p1, "listening", { stage: "listening" }) }) },
      { name: "音声：認識結果", runtime: claimed, ui: buildUi({ voice: voiceUi(p1, "listening", { stage: "result", transcripts: ["木漏れ日メゾフォルテ"] }) }) },
      { name: "音声：人間判定", runtime: claimed, ui: buildUi({ voice: voiceUi(p1, "manual", { manualReason: "error:not-allowed", recognitionAvailable: false }) }) },
      { name: "音声：自動正解（判定を修正あり）", runtime: correct, ui: buildUi({ voice: voiceUi(p1, "judged", { verdict: { kind: "correct" } }) }) },
      { name: "音声：人間判定で正解（判定を修正あり）", runtime: correct, ui: buildUi({ voice: voiceUi(p1, "judged", { verdict: { kind: "correct", byHuman: true } }) }) },
      { name: "音声：自動不正解（判定を修正あり）", runtime: wrong, ui: buildUi({ voice: voiceUi(p1, "judged", { verdict: { kind: "wrong" } }) }) },
      { name: "音声：判定修正中", runtime: correct, ui: buildUi({ voice: voiceUi(p1, "manual", { manualReason: "override" }) }) },
      { name: "音声：正解→不正解へ修正（0点で終了）", runtime: voided, ui: buildUi({ voice: voiceUi(p1, "judged", { verdict: { kind: "wrong", byHuman: true } }) }) }
    );
  }
  return states;
}

function isVisible(element) {
  if (!element || element.hidden) return false;
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return element.getClientRects().length > 0;
}

function overlaps(a, b, tolerance = 1) {
  return a.left < b.right - tolerance && b.left < a.right - tolerance && a.top < b.bottom - tolerance && b.top < a.bottom - tolerance;
}

export async function runPartyBattlePlayLayoutTests() {
  const html = await (await fetch("index.html", { cache: "no-store" })).text();
  const sectionHtml = extractPlaySection(html);
  const css = await (await fetch("css/style.css", { cache: "no-store" })).text();
  assertEqual(css.includes(".party-play-root .secondary-button,\n.party-play-root .primary-button {"), true, "盤面内の共通ボタン（.secondary-button/.primary-button）の flex:1／width:100% を盤面スコープで打ち消す規則がある");

  let renderedStates = 0;
  const problems = [];
  const note = (message) => problems.push(message);

  for (const viewport of VIEWPORTS) {
    for (const playerCount of PLAYER_COUNTS) {
      for (const typeCase of TYPE_CASES) {
        const { iframe, doc, win } = await loadPlayIframe(viewport, sectionHtml);
        const built = buildMatch(playerCount, typeCase.quizType, typeCase.answerMethod);
        const states = buildStates(built, typeCase.answerMethod);
        const root = doc.getElementById("party-play-root");
        const caseLabel = `${viewport.w}×${viewport.h}／${playerCount}人／${typeCase.quizType}／${typeCase.answerMethod}`;

        for (const state of states) {
          win.__render({ match: built.match, runtime: state.runtime, ui: state.ui });
          renderedStates += 1;
          const label = `${caseLabel}／${state.name}`;
          const rootRect = root.getBoundingClientRect();

          if (doc.documentElement.scrollWidth > viewport.w) note(`${label}：横スクロール（${doc.documentElement.scrollWidth}）`);
          if (rootRect.height > viewport.h + 1) note(`${label}：盤面の高さがviewportを超える（${Math.round(rootRect.height)}）`);

          // オーバーレイ内の各要素：viewport内・縦に異常伸長しない
          ["party-play-result-overlay", "party-play-voice-overlay", "party-play-pause-overlay", "party-play-intro-overlay"].forEach((overlayId) => {
            const overlay = doc.getElementById(overlayId);
            if (!isVisible(overlay)) return;
            [...overlay.children].forEach((child) => {
              if (!isVisible(child)) return;
              const rect = child.getBoundingClientRect();
              const tag = `${child.id || child.className}`;
              if (rect.height > viewport.h * MAX_OVERLAY_ITEM_RATIO && child.tagName !== "DIV") note(`${label}：${tag} が縦に伸びすぎ（${Math.round(rect.height)}px）`);
              if (child.tagName === "BUTTON") {
                if (rect.height > MAX_BUTTON_HEIGHT_PX) note(`${label}：ボタン ${tag} の高さ ${Math.round(rect.height)}px`);
                if (rect.height > rect.width) note(`${label}：ボタン ${tag} が縦長（${Math.round(rect.width)}×${Math.round(rect.height)}）`);
              }
              if (rect.top < -1 || rect.bottom > viewport.h + 1 || rect.left < -1 || rect.right > viewport.w + 1) note(`${label}：${tag} がviewport外（${Math.round(rect.top)}〜${Math.round(rect.bottom)}）`);
            });
          });
          // 判定ボタン（人間判定）
          const judgeRow = doc.getElementById("party-play-judge-row");
          if (isVisible(judgeRow)) {
            [doc.getElementById("party-play-judge-correct-button"), doc.getElementById("party-play-judge-wrong-button")].forEach((button) => {
              const rect = button.getBoundingClientRect();
              if (rect.height > MAX_BUTTON_HEIGHT_PX || rect.bottom > viewport.h + 1 || rect.right > viewport.w + 1) note(`${label}：判定ボタンの寸法・位置（${Math.round(rect.width)}×${Math.round(rect.height)}, bottom=${Math.round(rect.bottom)}）`);
            });
          }
          // 「次へ」「判定を修正」が見えるべき状態で見え、viewport内にある
          const phase = state.runtime.phase;
          const nextButton = doc.getElementById("party-play-result-next-button");
          const overrideButton = doc.getElementById("party-play-override-button");
          const resultVisible = isVisible(doc.getElementById("party-play-result-overlay"));
          // 【第5回実機QA修正】結果カード（.party-result-card）は横向きスマホ等で縦に収まらないときだけカード内スクロールになる。
          // その場合は「カード自体がviewport内」であれば、「次へ」はスクロールで届くので問題にしない
          const resultCard = doc.querySelector(".party-result-card");
          const cardScrollable = Boolean(resultCard) && resultVisible && resultCard.scrollHeight > resultCard.clientHeight + 1;
          if (resultVisible && resultCard) {
            const cardRect = resultCard.getBoundingClientRect();
            if (cardRect.top < -1 || cardRect.bottom > viewport.h + 1 || cardRect.left < -1 || cardRect.right > viewport.w + 1) note(`${label}：結果カードがviewport外`);
            if (cardScrollable && viewport.h >= 600) note(`${label}：縦長画面なのに結果カードがスクロールになる（${resultCard.scrollHeight}>${resultCard.clientHeight}）`);
          }
          if ((phase === PARTY_PHASE.CORRECT_RESULT || phase === PARTY_PHASE.PASS_RESULT) && resultVisible) {
            if (!isVisible(nextButton)) note(`${label}：「次へ」が表示されていない`);
            else if (!cardScrollable) {
              const nextRect = nextButton.getBoundingClientRect();
              if (nextRect.bottom > viewport.h + 1 || nextRect.top < -1) note(`${label}：「次へ」がviewport外（bottom=${Math.round(nextRect.bottom)}）`);
            }
          }
          // 【第4回実機QA修正】救済候補の箱：中身のボタンがviewport内・横長・「次へ」「判定を修正」と重ならない
          const rescueBox = doc.getElementById("party-play-rescue-box");
          if (isVisible(rescueBox)) {
            const boxRect = rescueBox.getBoundingClientRect();
            if (boxRect.right > viewport.w + 1 || boxRect.left < -1 || (!cardScrollable && (boxRect.bottom > viewport.h + 1 || boxRect.top < -1))) note(`${label}：救済候補の箱がviewport外`);
            if (boxRect.height < 60) note(`${label}：救済候補の箱が潰れて読めない（${Math.round(boxRect.height)}px）`);
            const expectedRows = state.ui.rescuableVoiceAttempts.length;
            const rows = rescueBox.querySelectorAll(".party-rescue-row").length;
            if (rows !== expectedRows) note(`${label}：救済候補の行数 ${rows}（期待 ${expectedRows}）`);
            rescueBox.querySelectorAll(".party-rescue-button").forEach((button) => {
              const rect = button.getBoundingClientRect();
              if (rect.height > rect.width) note(`${label}：救済ボタンが縦長`);
              if (rect.right > boxRect.right + 1 || rect.left < boxRect.left - 1) note(`${label}：救済ボタンが箱の横幅からはみ出す`);
            });
            [nextButton, overrideButton].forEach((button) => {
              if (isVisible(button) && overlaps(boxRect, button.getBoundingClientRect())) note(`${label}：救済候補の箱が ${button.id} と重なる`);
            });
          } else if (state.ui.rescuableVoiceAttempts.length > 0 && resultVisible && (phase === PARTY_PHASE.CORRECT_RESULT || phase === PARTY_PHASE.PASS_RESULT)) {
            note(`${label}：救済候補があるのに箱が出ていない`);
          }
          if (state.runtime.lastResult?.type === "rescued" && isVisible(overrideButton)) note(`${label}：救済後に既存の「判定を修正」が出ている`);
          if (isVisible(overrideButton)) {
            const rect = overrideButton.getBoundingClientRect();
            if (rect.height > 64) note(`${label}：「判定を修正」の高さ ${Math.round(rect.height)}px（実機で縦長になった箇所）`);
          }
          // 出題中：中央カードが席と重ならない、席・選択肢が盤面内
          if (phase === PARTY_PHASE.ACTIVE && !state.ui.paused && !state.ui.showQuestionIntro) {
            const center = doc.getElementById("party-play-center").getBoundingClientRect();
            const seats = [...doc.querySelectorAll(".party-seat")];
            seats.forEach((seat) => {
              const seatRect = seat.getBoundingClientRect();
              if (overlaps(center, seatRect)) note(`${label}：中央カードが席 ${seat.dataset.seatId} と重なる`);
              if (seatRect.right > rootRect.right + 1 || seatRect.bottom > rootRect.bottom + 1) note(`${label}：席 ${seat.dataset.seatId} が盤面からはみ出す`);
            });
            const choiceButtons = [...doc.querySelectorAll(".party-choice-button, .party-answer-button")];
            choiceButtons.forEach((button) => {
              const rect = button.getBoundingClientRect();
              if (rect.right > rootRect.right + 1 || rect.bottom > rootRect.bottom + 1 || rect.left < rootRect.left - 1 || rect.top < rootRect.top - 1) {
                note(`${label}：回答ボタンが盤面からはみ出す`);
              }
            });
            if (typeCase.answerMethod === "fourChoice") {
              const expected = (playerCount === 3 ? 3 : playerCount) * 4;
              if (choiceButtons.length !== expected) note(`${label}：4択ボタン数 ${choiceButtons.length}（期待 ${expected}）`);
            }
            // 【第3回実機QA】中央の「🔁 もう一度聴く」と「全員PASS｜長押し」：両方出るときも重ならず中央カード内・横長
            const replayButton = doc.getElementById("party-play-replay-button");
            const passButton = doc.getElementById("party-play-pass-button");
            if (state.ui.canReplay && !isVisible(replayButton)) note(`${label}：canReplay なのに「もう一度聴く」が出ていない`);
            if (!state.ui.canReplay && isVisible(replayButton)) note(`${label}：canReplay でないのに「もう一度聴く」が出ている`);
            if (!isVisible(passButton)) note(`${label}：出題中なのに「全員PASS」が出ていない（5タイプ共通）`);
            [replayButton, passButton].forEach((button) => {
              if (!isVisible(button)) return;
              const rect = button.getBoundingClientRect();
              if (rect.height > rect.width) note(`${label}：${button.id} が縦長（${Math.round(rect.width)}×${Math.round(rect.height)}）`);
              if (rect.height > MAX_BUTTON_HEIGHT_PX) note(`${label}：${button.id} の高さ ${Math.round(rect.height)}px`);
              if (rect.left < center.left - 1 || rect.right > center.right + 1 || rect.top < center.top - 1 || rect.bottom > center.bottom + 1) note(`${label}：${button.id} が中央カードからはみ出す`);
            });
            if (isVisible(replayButton) && isVisible(passButton) && overlaps(replayButton.getBoundingClientRect(), passButton.getBoundingClientRect())) {
              note(`${label}：「もう一度聴く」と「全員PASS」が重なる`);
            }
            // 問題番号が「終了｜長押し」と重ならない（2人・横向きの歌詞2ビューで起きた崩れ）
            const questionLabel = doc.getElementById("party-play-question-label").getBoundingClientRect();
            const quitButton = doc.getElementById("party-play-quit-button").getBoundingClientRect();
            if (overlaps(questionLabel, quitButton)) note(`${label}：問題番号が「終了｜長押し」と重なる`);
            // 【第3回実機QA】2人対戦の歌詞：1つの進行を2ビュー（相手側は回転）で表示。3人／4人は1ビュー
            if (typeCase.quizType === "lyrics") {
              const views = [...doc.querySelectorAll(".party-lyric-view")];
              const expectedViews = playerCount === 2 ? 2 : 1;
              if (views.length !== expectedViews) note(`${label}：歌詞ビュー数 ${views.length}（期待 ${expectedViews}）`);
              views.forEach((view) => {
                const rect = view.getBoundingClientRect();
                if (rect.width < 40 || rect.height < 20) note(`${label}：歌詞ビュー（${view.dataset.view}）が小さすぎる（${Math.round(rect.width)}×${Math.round(rect.height)}）`);
                if (rect.left < center.left - 1 || rect.right > center.right + 1 || rect.top < center.top - 1 || rect.bottom > center.bottom + 1) note(`${label}：歌詞ビュー（${view.dataset.view}）が中央カードからはみ出す`);
              });
              if (views.length === 2) {
                if (overlaps(views[0].getBoundingClientRect(), views[1].getBoundingClientRect())) note(`${label}：2つの歌詞ビューが重なる`);
                if (views[0].textContent !== views[1].textContent) note(`${label}：2つの歌詞ビューの内容が異なる（1 state・2 view）`);
                const landscape = viewport.w > viewport.h;
                const rotations = views.map((view) => view.dataset.rotation).join(",");
                if (rotations !== (landscape ? "90,-90" : "180,0")) note(`${label}：歌詞ビューの回転が ${rotations}（期待 ${landscape ? "90,-90" : "180,0"}）`);
              }
            }
          }
        }
        iframe.remove();
      }
    }
  }
  assertEqual(renderedStates > 600, true, `盤面の状態を十分な数（${renderedStates}件）描画して測定した`);
  assertEqual(problems.slice(0, 20), [], `盤面の寸法検査：問題なし（${problems.length}件の問題）`);
}
