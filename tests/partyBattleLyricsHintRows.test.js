// パーティー対戦 歌詞クイズの「ヒントN＋歌詞を同じ1行に・最新を一番上へ」（2026-09-15 第4回実機QA修正・本人指示）のテスト。
//
// 【検証すること】
//   ・各行（.party-lyric-row）が「ヒント番号バッジ＋歌詞本文」の同一row構造で、ラベルだけの行を作らない
//   ・【第7回】4行の画面上の位置は「曲中の登場位置順（startLine）」で固定し、公開（ヒント1→2→3→4）はその固定スロットに出すだけ
//     （hint1=20行目／hint2=30／hint3=10／hint4=40 なら DOM 順は必ず 3,1,2,4。段階1では hint1 のスロットだけ本文、以後増えても順は不変）
//   ・2人対戦は2ビューで内容一致（DOM順は同じ。相手側はビューごと回転：縦180度／横90・-90度）
//   ・3／4人は1ビュー
//   ・表示順を変えても、段階（level）と答え合わせの開始位置（resolveReviewPlaybackPlan）は変わらない
import { assertEqual } from "./test-utils.js";
import { PARTY_PHASE, PARTY_QUIZ_TYPE, normalizePartySettings, buildPartyPlayers, createPartyMatch, createQuestionRuntime, resolveParticipantIds, resolveLyricSlotOrder } from "../js/partyBattleState.js";
import { buildLyricsQuizQuestions } from "../js/lyricsQuizQuestionBuilder.js";
import { computeStealHintProgress } from "../js/lyricsQuizBattleTiming.js";
import { resolveReviewPlaybackPlan } from "../js/partyBattleEngine.js";

const HINTS = [
  { hintLevel: 1, startLine: 20, segment: { text: "寄せる波にちょっと焦って" } },
  { hintLevel: 2, startLine: 30, segment: { text: "秋が来てもサマーチューン" } },
  { hintLevel: 3, startLine: 10, segment: { text: "ベタつく風 なびくストレート" } },
  { hintLevel: 4, startLine: 40, segment: { text: "（でも）僕のもの" } },
];
const SLOT_ORDER = [3, 1, 2, 4]; // 曲中の登場位置順（startLine 10,20,30,40）
const QUESTION = { song: { id: "s1", title: "夏名残サマーチューン" }, choices: [], hints: HINTS, revealStartTimeSec: 10, revealStartTimeSecByHintLevel: { 1: 10, 2: 20, 3: 30, 4: 40 } };

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

function buildMatch(playerCount) {
  const settings = normalizePartySettings({ playerCount, emptySeatId: playerCount === 3 ? "bottomRight" : null, playerNames: ["あ", "い", "う", "え"], quizType: "lyrics", answerMethod: "voice", questionCountValue: "5", otetsuki: true });
  const built = buildPartyPlayers(settings);
  const match = { ...createPartyMatch({ settings, players: built.players, layout: built.layout, seats: built.seats, questions: [QUESTION], plannedCount: 5, seed: 1 }), startedAt: Date.now() + Math.random() };
  const runtime = { ...createQuestionRuntime({ question: QUESTION, questionNumber: 1, totalQuestions: 5, isSuddenDeath: false, participantIds: resolveParticipantIds(match) }), ordinal: 1, phase: PARTY_PHASE.ACTIVE };
  return { match, runtime };
}

// 1文字/秒＋段階間2秒（computeStealHintProgress の既定値）で、段階 level まで開いた直後の経過時間
function elapsedForLevel(level) {
  let ms = 0;
  for (let i = 1; i < level; i++) ms += HINTS[i - 1].segment.text.length * 1000 + 2000;
  return ms + 1500;
}

// 本物の index.html／style.css／partyBattlePlayScreen.js を、指定サイズの iframe（＝縦向き／横向きが window の
// 実寸で決まる）で描く。tests/partyBattlePlayLayout.test.js と同じ方式。
function loadPlayIframe({ w, h }, sectionHtml) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;opacity:0;pointer-events:none;border:0;`;
    document.body.appendChild(iframe);
    const baseHref = location.href.replace(/[^/]*$/, "");
    const elementsLiteral = Object.entries(ELEMENT_IDS).map(([key, id]) => `${key}: document.getElementById("${id}")`).join(",");
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><base href="${baseHref}"><link rel="stylesheet" href="css/style.css"></head>` +
        `<body data-screen="partyBattlePlay"><main class="game-frame">${sectionHtml}</main><script type="module">
          import { initPartyPlayScreen, renderPartyPlaySnapshot, resetPartyPlayScreen } from "./js/partyBattlePlayScreen.js";
          document.getElementById("party-battle-play-screen").classList.add("is-active");
          initPartyPlayScreen({ ${elementsLiteral}, onQuitRequested() {} });
          window.__render = renderPartyPlaySnapshot;
          window.__reset = resetPartyPlayScreen;
          window.__ready = true;
        </script></body></html>`
    );
    doc.close();
    const startedAt = Date.now();
    const poll = () => {
      const win = iframe.contentWindow;
      if (win && win.__ready && doc.querySelector("link")?.sheet) {
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

export async function runPartyBattleLyricsHintRowsTests() {
  const html = await (await fetch("index.html", { cache: "no-store" })).text();
  const start = html.indexOf('<section id="party-battle-play-screen"');
  const section = html.slice(start, html.indexOf("</section>", start) + "</section>".length);
  const ui = (lyricsElapsedMs) => ({ countdownValue: null, showQuestionIntro: false, paused: false, resumeRequired: false, notice: null, lyricsElapsedMs, voice: null, playbackStarted: true, finished: false, aborted: false, canReplay: false, rescuableVoiceAttempts: [] });

  for (const [w, h] of [[393, 852], [852, 393]]) {
    const { iframe, doc, win } = await loadPlayIframe({ w, h }, section);
    const elements = { lyrics: doc.getElementById("party-play-lyrics") };
    const renderPartyPlaySnapshot = win.__render;
    const resetPartyPlayScreen = win.__reset;
    const orientation = w > h ? "landscape" : "portrait";

    for (const playerCount of [2, 3, 4]) {
      const { match, runtime } = buildMatch(playerCount);
      const label = `${w}×${h}／${playerCount}人`;
      for (let level = 1; level <= 4; level++) {
        const elapsedMs = elapsedForLevel(level);
        renderPartyPlaySnapshot({ match, runtime, ui: ui(elapsedMs) });
        const views = [...elements.lyrics.querySelectorAll(".party-lyric-view")];
        assertEqual(views.length, playerCount === 2 ? 2 : 1, `${label}／ヒント${level}：ビュー数（2人=2、3／4人=1）`);
        const expectedLevels = computeStealHintProgress({ elapsedMs, hintTexts: HINTS.map((hint) => hint.segment.text) }).levels.map((entry) => entry.level);
        assertEqual(expectedLevels[expectedLevels.length - 1], level, `${label}／ヒント${level}：前提（段階 ${level} まで開いている）`);
        views.forEach((view) => {
          const rows = [...view.querySelectorAll(".party-lyric-row")];
          assertEqual(rows.map((row) => Number(row.dataset.level)), SLOT_ORDER, `${label}／ヒント${level}／${view.dataset.view}：DOM順は曲中位置順 3,1,2,4 で固定（公開段階に関係なく不変）`);
          const revealedLevels = rows.filter((row) => row.dataset.revealed === "true").map((row) => Number(row.dataset.level)).sort();
          assertEqual(revealedLevels, [...expectedLevels].sort(), `${label}／ヒント${level}：公開済みスロットだけ本文（段階${level}までのヒント）`);
          rows.forEach((row) => {
            const badge = row.querySelector(".party-lyric-level");
            const text = row.querySelector(".party-lyric-text");
            assertEqual(Boolean(badge && text), true, `${label}：各行が「ヒント番号バッジ＋本文」の同一row`);
            const revealed = row.dataset.revealed === "true";
            assertEqual(badge.textContent, revealed ? `ヒント${row.dataset.level}` : "…", `${label}：バッジ（公開済みは番号、未公開は…）`);
            if (!revealed) assertEqual(text.textContent, "", `${label}：未公開スロットに歌詞を出さない`);
            assertEqual(badge.parentElement === row && text.parentElement === row, true, `${label}：バッジと本文が同じ行（ラベルだけの行を作らない）`);
            // 同じ行に横並び（バッジの下に本文が落ちない）
            const badgeRect = badge.getBoundingClientRect();
            const textRect = text.getBoundingClientRect();
            const rotated = view.dataset.rotation === "90" || view.dataset.rotation === "-90";
            if (revealed && !rotated && badgeRect.width > 0) {
              assertEqual(textRect.top < badgeRect.bottom, true, `${label}：本文の先頭行がバッジと同じ行にある`);
              assertEqual(badgeRect.width < row.getBoundingClientRect().width * 0.4, true, `${label}：バッジが行幅の40%未満（過剰に幅を取らない）`);
            }
          });
          const latestRows = rows.filter((row) => row.classList.contains("is-latest"));
          assertEqual(latestRows.map((row) => Number(row.dataset.level)), [level], `${label}：最新に公開された段階${level}の行だけ強調（位置は動かない）`);
        });
        if (views.length === 2) {
          assertEqual(views[0].textContent, views[1].textContent, `${label}／ヒント${level}：2ビューの内容が一致（1 state・2 view）`);
          assertEqual(views.map((view) => view.dataset.rotation).join(","), orientation === "landscape" ? "90,-90" : "180,0", `${label}：回転（縦=180/0、横=90/-90）`);
          const order0 = [...views[0].querySelectorAll(".party-lyric-row")].map((row) => row.dataset.level).join(",");
          const order1 = [...views[1].querySelectorAll(".party-lyric-row")].map((row) => row.dataset.level).join(",");
          assertEqual(order0, order1, `${label}：DOM順は両ビュー同じ（回転で向きを合わせる。片方だけ逆順にしない）`);
        }
        // 表示順を変えても、答え合わせの開始位置は「今開いている段階」の位置のまま
        const plan = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.LYRICS, question: QUESTION, seed: 1, ordinal: 1, instantClipSec: 1, lyricsElapsedMs: elapsedMs });
        assertEqual(plan.hintLevel, level, `${label}／ヒント${level}：答え合わせの段階は表示順に影響されない`);
        assertEqual(plan.computeStartTimeSec(300), QUESTION.revealStartTimeSecByHintLevel[level], `${label}／ヒント${level}：答え合わせの開始位置は段階${level}の位置`);
      }
      // 長い歌詞：本文が折り返しても行がはみ出さない（縦向きのみ測定）
      if (orientation === "portrait") {
        const longQuestion = { ...QUESTION, hints: [{ hintLevel: 1, segment: { text: "とても長い歌詞の一節がここに入ります。スマホの幅に収まらないくらい長い長い長い一節です。" } }] };
        const longRuntime = { ...runtime, question: longQuestion };
        renderPartyPlaySnapshot({ match, runtime: longRuntime, ui: ui(200000) });
        const view = elements.lyrics.querySelector(".party-lyric-view");
        const row = view.querySelector(".party-lyric-row");
        const rowRect = row.getBoundingClientRect();
        const viewRect = view.getBoundingClientRect();
        assertEqual(rowRect.right <= viewRect.right + 1 && rowRect.left >= viewRect.left - 1, true, `${label}：長い歌詞でも行がビューの横幅からはみ出さない`);
        assertEqual(row.querySelector(".party-lyric-text").getBoundingClientRect().height > rowRect.height * 0.5, true, `${label}：本文は自然に折り返す（文字を極端に小さくしない）`);
      }
      resetPartyPlayScreen();
    }
    iframe.remove();
  }
}

// ===== 【第7回】固定スロットの並び（純粋関数）＋ 実データの seed 多数で「単純な1→2→3→4順ではない」 =====
export function runLyricSlotOrderTests() {
  const order = resolveLyricSlotOrder(HINTS).map((slot) => slot.hintLevel);
  assertEqual(order, [3, 1, 2, 4], "hint1=20／hint2=30／hint3=10／hint4=40 → 上から 3,1,2,4");
  assertEqual(resolveLyricSlotOrder(HINTS).map((slot) => slot.slotIndex), [0, 1, 2, 3], "slotIndex は上から 0,1,2,3");
  assertEqual(resolveLyricSlotOrder([{ hintLevel: 2, startLine: 5 }, { hintLevel: 1, startLine: 5 }]).map((slot) => slot.hintLevel), [1, 2], "同じ行なら hintLevel 順");
  assertEqual(resolveLyricSlotOrder([{ hintLevel: 1 }, { hintLevel: 2 }]).map((slot) => slot.hintLevel), [1, 2], "startLine が無い旧データは hintLevel 順（壊れない）");
  assertEqual(resolveLyricSlotOrder([]), [], "ヒントなし→空");
  assertEqual(resolveLyricSlotOrder(null), [], "null→空（例外にしない）");
  // 公開段階を進めても並びは変わらない（並びは hints だけで決まり、公開状態を引数に取らない）
  assertEqual(resolveLyricSlotOrder(HINTS).map((slot) => slot.hintLevel).join(","), resolveLyricSlotOrder([...HINTS]).map((slot) => slot.hintLevel).join(","), "同じ hints なら常に同じ並び");

  // 実データ相当：共通の問題生成（buildLyricsQuizQuestions）で seed を多数変えると、スロット順が 1,2,3,4 でないことが十分ある
  const texts = ["あさのひかりがまどからさす", "きみのことをおもいだしてる", "そらはあおくてかぜはあたたかい", "あしたもおなじみちをあるく", "とおくのまちへむかっている", "ゆうがたのかねがなりひびく", "ふたりでみたあのなつのそら", "なみだのあとにわらえるように", "よるのしずけさにみみをすます", "ほしをかぞえてねむりにつく", "あめあがりのにおいがすき", "さいごのてがみをひらいた"];
  const lines = texts.map((text, index) => ({ line: index + 1, text, start: index * 3, end: index * 3 + 2.8 }));
  const song = { id: "dummy-slot-song", title: "夜明けの歌", searchAliases: [] };
  let nonTrivial = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const [question] = buildLyricsQuizQuestions({ songsWithLyrics: [{ song, lines }], songPool: [song.id], distractorSongPool: [song.id], questionCountValue: "1", answerPoolSizeValue: "4", seed });
    const slots = resolveLyricSlotOrder(question.hints);
    const startLines = slots.map((slot) => question.hints.find((hint) => hint.hintLevel === slot.hintLevel).startLine);
    assertEqual(startLines.every((line, index) => index === 0 || line >= startLines[index - 1]), true, `seed ${seed}：スロット順は曲中位置の昇順`);
    if (slots.map((slot) => slot.hintLevel).join(",") !== "1,2,3,4") nonTrivial += 1;
  }
  assertEqual(nonTrivial >= 20, true, `40 seed 中 ${nonTrivial} 件はヒント番号順と異なる配置（単純な上下順ではない）`);
}
