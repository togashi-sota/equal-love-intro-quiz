// パーティー対戦の再生位置・再聴・答え合わせ再生（2026-09-15 第3回実機QA修正・本人指示）のテスト。
//
// 【対象】js/partyBattleEngine.js の純粋関数 resolveQuestionStartTimeSec／resolveQuestionPlaybackPlan／
// resolveReviewPlaybackPlan と、js/audio.js の onEnded／曲末まで再生の契約、エンジン本体のソース構造
// （タイマー・音源が次の問題へ漏れないこと）。音は鳴らさない（AudioElementは触らない）。
//
// 【本人確定の仕様】
//   ランダム再生：seed・songId・ordinal で1問1回だけ決まる固定位置から曲末まで（5秒で止めない）。再聴・答え合わせも同じ位置。
//   アウトロ：曲末の約5秒（再聴も答え合わせも同じ区間を1回）。一瞬：同じ位置から、答え合わせは続きを流す。
//   イントロ：曲頭（再聴なし）。歌詞：正解確定時点のヒント段階に対応する位置（オンライン歌詞対戦と同じ表を再利用）。

import { assertEqual } from "./test-utils.js";
import { resolveQuestionStartTimeSec, resolveQuestionPlaybackPlan, resolveReviewPlaybackPlan } from "../js/partyBattleEngine.js";
import { PARTY_QUIZ_TYPE } from "../js/partyBattleState.js";
import { AUDIO_METADATA } from "../js/data/audioMetadata.js";
import { computeRandomStartTimeSec, clampStartTimeToActualDuration, RANDOM_PLAYBACK_DEFAULTS } from "../js/randomPlaybackEngine.js";

const SONG = { id: "song-x", title: "テスト曲", introLeadInSec: 0 };
const DURATION = 240;

export async function runPartyBattlePlaybackTests() {
  // ===== 出題の再生プラン =====
  const randomKey = { quizType: PARTY_QUIZ_TYPE.RANDOM, song: SONG, seed: 12345, ordinal: 3, instantClipSec: 1 };
  const randomPlan = resolveQuestionPlaybackPlan(randomKey);
  assertEqual(randomPlan.playDurationSec, null, "ランダム再生：自動停止しない（曲末まで流す。5秒で切らない）");
  const expectedRandomStart = clampStartTimeToActualDuration(
    computeRandomStartTimeSec({ seed: 12345, songId: SONG.id, questionIndex: 3, durationSec: DURATION, playDurationSec: RANDOM_PLAYBACK_DEFAULTS.playDurationSec }),
    DURATION
  );
  assertEqual(randomPlan.computeStartTimeSec(DURATION), expectedRandomStart, "ランダム再生：開始位置はseed・曲・ordinalから決定論的に決まる");
  assertEqual(resolveQuestionPlaybackPlan(randomKey).computeStartTimeSec(DURATION), expectedRandomStart, "ランダム再生：同じ問題なら何度求めても同じ位置（再聴で位置が変わらない）");
  assertEqual(
    resolveQuestionPlaybackPlan({ ...randomKey, ordinal: 4 }).computeStartTimeSec(DURATION) !== expectedRandomStart ||
      resolveQuestionPlaybackPlan({ ...randomKey, seed: 999 }).computeStartTimeSec(DURATION) !== expectedRandomStart,
    true,
    "ランダム再生：別の問題（ordinal／seed違い）では位置が変わりうる"
  );
  assertEqual(expectedRandomStart >= 0 && expectedRandomStart < DURATION, true, "ランダム再生：開始位置は曲の範囲内");

  const outroPlan = resolveQuestionPlaybackPlan({ ...randomKey, quizType: PARTY_QUIZ_TYPE.OUTRO });
  assertEqual(outroPlan.playDurationSec, 5, "アウトロ：約5秒で自動停止");
  assertEqual(outroPlan.computeStartTimeSec(DURATION), DURATION - 5, "アウトロ：メタデータが無ければ曲末5秒前から");
  const metaSongId = Object.keys(AUDIO_METADATA).find((id) => typeof AUDIO_METADATA[id]?.outroStartSec === "number");
  if (metaSongId) {
    const metaPlan = resolveQuestionPlaybackPlan({ ...randomKey, quizType: PARTY_QUIZ_TYPE.OUTRO, song: { id: metaSongId, title: "meta" } });
    assertEqual(metaPlan.computeStartTimeSec(DURATION), AUDIO_METADATA[metaSongId].outroStartSec, "アウトロ：メタデータの outroStartSec を優先");
  }

  const instantPlan = resolveQuestionPlaybackPlan({ ...randomKey, quizType: PARTY_QUIZ_TYPE.INSTANT, instantClipSec: "0.5" });
  assertEqual(instantPlan.playDurationSec, 0.5, "一瞬：設定した長さ（0.5秒）で自動停止（文字列設定も数値に）");
  const instantStart = instantPlan.computeStartTimeSec(DURATION);
  assertEqual(resolveQuestionPlaybackPlan({ ...randomKey, quizType: PARTY_QUIZ_TYPE.INSTANT, instantClipSec: "0.5" }).computeStartTimeSec(DURATION), instantStart, "一瞬：再聴でも同じ位置");

  const introPlan = resolveQuestionPlaybackPlan({ ...randomKey, quizType: PARTY_QUIZ_TYPE.INTRO });
  assertEqual(introPlan.computeStartTimeSec(DURATION), 0, "イントロ：曲頭");
  assertEqual(resolveQuestionStartTimeSec({ quizType: PARTY_QUIZ_TYPE.INTRO, song: { ...SONG, introLeadInSec: 2 } }, DURATION), 2, "イントロ：introLeadInSec があればそこから");

  // ===== 答え合わせ再生（正解後） =====
  const question = { song: SONG, hints: [], choices: [] };
  const reviewRandom = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.RANDOM, question, seed: 12345, ordinal: 3, instantClipSec: 1, lyricsElapsedMs: 0 });
  assertEqual(reviewRandom.computeStartTimeSec(DURATION), expectedRandomStart, "答え合わせ（ランダム再生）：その問題と同じ固定位置（新しく作らない）");
  assertEqual(reviewRandom.playDurationSec, null, "答え合わせ（ランダム再生）：曲末まで");
  const reviewOutro = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.OUTRO, question, seed: 12345, ordinal: 3, instantClipSec: 1, lyricsElapsedMs: 0 });
  assertEqual(reviewOutro.computeStartTimeSec(DURATION), DURATION - 5, "答え合わせ（アウトロ）：同じアウトロ区間");
  assertEqual(reviewOutro.playDurationSec, 5, "答え合わせ（アウトロ）：約5秒を1回だけ（ループしない）");
  const reviewInstant = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.INSTANT, question, seed: 12345, ordinal: 3, instantClipSec: "0.5", lyricsElapsedMs: 0 });
  assertEqual(reviewInstant.computeStartTimeSec(DURATION), instantStart, "答え合わせ（一瞬）：一瞬区間の開始位置から");
  assertEqual(reviewInstant.playDurationSec, null, "答え合わせ（一瞬）：0.5秒で止めず続きを流す");
  const reviewIntro = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.INTRO, question, seed: 1, ordinal: 1, instantClipSec: 1, lyricsElapsedMs: 0 });
  assertEqual(reviewIntro.computeStartTimeSec(DURATION), 0, "答え合わせ（イントロ）：曲頭");

  // 歌詞：正解確定時点のヒント段階 → revealStartTimeSecByHintLevel（オンライン歌詞対戦の表を再利用）
  const lyricsQuestion = {
    song: SONG,
    hints: [{ hintLevel: 1, segment: { text: "あいうえお" } }, { hintLevel: 2, segment: { text: "かきくけこ" } }, { hintLevel: 3, segment: { text: "さしすせそ" } }],
    revealStartTimeSec: 30,
    revealStartTimeSecByHintLevel: { 1: 30, 2: 45, 3: 60 },
  };
  const lyricsLevel1 = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.LYRICS, question: lyricsQuestion, seed: 1, ordinal: 1, instantClipSec: 1, lyricsElapsedMs: 1000 });
  assertEqual(lyricsLevel1.hintLevel, 1, "歌詞：1段階目の途中で正解→段階1");
  assertEqual(lyricsLevel1.computeStartTimeSec(DURATION), 30, "歌詞：段階1に対応する位置（曲頭0秒ではない）");
  assertEqual(lyricsLevel1.playDurationSec, null, "歌詞：曲末まで");
  // 1段階目 5文字（5秒）＋待機2秒 → 7秒以降は2段階目
  const lyricsLevel2 = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.LYRICS, question: lyricsQuestion, seed: 1, ordinal: 1, instantClipSec: 1, lyricsElapsedMs: 8000 });
  assertEqual(lyricsLevel2.hintLevel, 2, "歌詞：2段階目に入ってから正解→段階2");
  assertEqual(lyricsLevel2.computeStartTimeSec(DURATION), 45, "歌詞：段階2に対応する位置");
  const lyricsLevel3 = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.LYRICS, question: lyricsQuestion, seed: 1, ordinal: 1, instantClipSec: 1, lyricsElapsedMs: 60000 });
  assertEqual(lyricsLevel3.computeStartTimeSec(DURATION), 60, "歌詞：最終段階まで進んでから正解→段階3の位置");
  const lyricsFallback = resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.LYRICS, question: { ...lyricsQuestion, revealStartTimeSecByHintLevel: undefined }, seed: 1, ordinal: 1, instantClipSec: 1, lyricsElapsedMs: 8000 });
  assertEqual(lyricsFallback.computeStartTimeSec(DURATION), 30, "歌詞：段階別の表が無ければ revealStartTimeSec へフォールバック");
  assertEqual(resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.LYRICS, question: { ...lyricsQuestion, revealStartTimeSecByHintLevel: { 1: 500 } }, seed: 1, ordinal: 1, instantClipSec: 1, lyricsElapsedMs: 0 }).computeStartTimeSec(100), 99.5, "歌詞：位置が曲の長さを超えていたら曲末手前に丸める（再生失敗にしない）");
  assertEqual(resolveReviewPlaybackPlan({ quizType: PARTY_QUIZ_TYPE.LYRICS, question: { song: SONG, hints: [] }, seed: 1, ordinal: 1, instantClipSec: 1, lyricsElapsedMs: 0 }).computeStartTimeSec(DURATION), 0, "歌詞：位置情報が無ければ0秒（例外にしない）");

  // ===== ソース構造：音源・タイマーの漏れ防止（js/audio.js／js/partyBattleEngine.js） =====
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const audio = await fetchText("js/audio.js");
  assertEqual(audio.includes("export async function playSongIntro(song, onError, onPlaybackStart, onEnded = null)"), true, "audio.js：playSongIntro に onEnded（曲末到達）の引数が追加され、既存呼び出しは省略可のまま");
  assertEqual(audio.includes("export async function playSongFromRandomPosition(song, computeStartTimeSec, playDurationSec, onError, onPlaybackStart, onAutoStop, onEnded = null)"), true, "audio.js：playSongFromRandomPosition に onEnded が追加され、既存呼び出しは省略可のまま");
  assertEqual(audio.includes('if (typeof playDurationSec === "number" && Number.isFinite(playDurationSec))'), true, "audio.js：playDurationSec が null なら自動停止を予約しない（曲末まで流す）");
  assertEqual(audio.includes("audioElement.onended = null"), true, "audio.js：音源の差し替え時に前の onended を外す（別問題への漏れ防止）");

  const engine = await fetchText("js/partyBattleEngine.js");
  const nextBody = engine.slice(engine.indexOf("    next() {"), engine.indexOf("    pauseForBackground() {"));
  assertEqual(nextBody.includes("clearAllTimers();") && nextBody.includes("stopAudio();"), true, "engine：「次へ」は答え合わせ音源と予約タイマーを止めてから進む");
  assertEqual(nextBody.indexOf("clearAllTimers();") < nextBody.indexOf("match = applyQuestionOutcome"), true, "engine：タイマー停止は結果の確定より先");
  const overrideBody = engine.slice(engine.indexOf("    requestJudgementOverride() {"), engine.indexOf("    passAll() {"));
  assertEqual(overrideBody.includes("stopAudio()"), true, "engine：「判定を修正」は答え合わせ音源を止める");
  const judgeBody = engine.slice(engine.indexOf("    humanJudge("), engine.indexOf("    requestJudgementOverride() {"));
  assertEqual(judgeBody.includes("stopAudio(); // 答え合わせ音源を即停止"), true, "engine：正解→不正解への修正で答え合わせ音源を即停止（再開しない・0点終了）");
  const correctBody = engine.slice(engine.indexOf("  function applyCorrect("), engine.indexOf("  // ----- 音声回答 -----"));
  assertEqual(correctBody.includes("playSfx(SFX_EVENTS.PARTY_CORRECT)") && correctBody.includes("schedule(startReviewPlayback, REVIEW_PLAYBACK_DELAY_MS)"), true, "engine：正解SFX（パーティー専用のピンポン）→ 少し置いて答え合わせ再生（重ねない）");
  assertEqual(correctBody.indexOf("playSfx(SFX_EVENTS.PARTY_CORRECT)") < correctBody.indexOf("schedule(startReviewPlayback"), true, "engine：SFXが先、答え合わせは後");
  const reviewBody = engine.slice(engine.indexOf("  function startReviewPlayback() {"), engine.indexOf("  function pausePlaybackKeepingPosition() {"));
  assertEqual(reviewBody.includes("runtime.phase !== PARTY_PHASE.CORRECT_RESULT) return;"), true, "engine：答え合わせは正解表示中にしか始まらない");
  assertEqual(reviewBody.includes("console.warn"), true, "engine：答え合わせの読み込み失敗は警告のみ（正解・得点・公開・次へに影響しない）");
  assertEqual(reviewBody.includes("runtime.ordinal !== ordinalAtStart"), true, "engine：答え合わせの開始コールバックは問題番号（ordinal）を照合し、次の問題へ漏れない");
  const playbackBody = engine.slice(engine.indexOf("  function startPlaybackForCurrentQuestion() {"), engine.indexOf("  // 正解後の答え合わせ再生"));
  assertEqual(playbackBody.includes("runtime.ordinal !== ordinalAtStart"), true, "engine：曲末コールバックは問題番号を照合（前の問題の onEnded が次の問題の再聴ボタンを出さない）");
  assertEqual(playbackBody.includes("markPlaybackEnded(runtime)"), true, "engine：曲末／区間終了で playbackEnded を立てる（「もう一度聴く」の条件）");
  const replayBody = engine.slice(engine.indexOf("    replay() {"), engine.indexOf("    next() {"));
  assertEqual(replayBody.includes("beginReplay(runtime, match.settings)") && replayBody.includes("startCountdown()"), true, "engine：再聴は状態遷移（beginReplay）で判定し、3・2・1から同じ位置を最初から鳴らす");
  assertEqual(engine.includes("pressInstantPass"), false, "engine：旧・一瞬の席ごとのPASS入口は撤去済み");
  assertEqual(engine.includes("instantListenIndex") || engine.includes("instantPassedPlayerIds"), false, "engine：旧・一瞬のPASS状態を参照しない");
}
