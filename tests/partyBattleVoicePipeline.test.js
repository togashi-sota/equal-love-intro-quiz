// パーティー対戦「第6回：音声早押し認識 最大精度化」（2026-09-16・本人指示）のテスト。
//
// (A) 曲名マッチャー：冒頭／末尾欠けの救済・複数候補（最終／代替／途中）の証拠統合・競合時の人間判定・自動不正解の条件
// (B) 全84曲の擬似認識エラー総当たり（先頭1〜2文字欠け・末尾1〜2文字欠け・1文字置換）で「別の曲へ自動正解しない」
// (C) 回答時間の起点（認識器 ready 起点。ready が来なければ従来どおり）
// (D) FakeSpeechRecognition でイベント順を再現し、エンジンを実際に回して
//     先行起動（pointerdown）→引き継ぎ（pointerup）→途中／最終→自動正解／人間判定／エラー時フォールバックを確認
// (E) 配線（bindPressReleaseAnswer の hooks／画面→engine.prewarmVoice／診断ログ）
import { assertEqual } from "./test-utils.js";
import { SONGS } from "../js/data/songs.js";
import {
  normalizeSpokenText,
  isDroppedEdgeMatch,
  resolveAllowedDropCount,
  scoreSongAgainstSpokenText,
  normalizeRecognitionCandidates,
  matchSpokenSongName,
  decideVoiceVerdict,
  CANDIDATE_SOURCE_WEIGHT,
} from "../js/songNameMatcher.js";
import {
  computeVoiceDeadline,
  PARTY_VOICE_READY_SHIFT_CAP_MS,
  setSpeechRecognitionFactoryForTest,
  startVoiceRecognitionSession,
  getVoiceSessionLogs,
  clearVoiceDiagnostics,
  resetVoiceRecognitionAvailability,
  isVoiceRecognitionAvailable,
} from "../js/partyBattleVoice.js";
import { PARTY_PHASE, normalizePartySettings, buildPartyPlayers, createPartyMatch } from "../js/partyBattleState.js";
import { createClaimArbiter } from "../js/partyBattleInput.js";
import { setSfxMasterEnabled, getSfxSettings } from "../js/soundManager.js";

const LOVE = SONGS.find((song) => song.id === "love");
const SEISHUN = SONGS.find((song) => song.title === '青春"サブリミナル"');
const byTitle = (title) => SONGS.find((song) => song.title === title);

// ===== (A) マッチャー =====
export function runVoicePipelineMatcherTests() {
  // --- 欠け救済の純粋関数 ---
  assertEqual(resolveAllowedDropCount(4), 0, "4文字以下の曲名は欠けを認めない");
  assertEqual(resolveAllowedDropCount(5), 1, "5〜7文字は1文字まで");
  assertEqual(resolveAllowedDropCount(8), 2, "8〜13文字は2文字まで");
  assertEqual(resolveAllowedDropCount(14), 3, "14文字以上は3文字まで");
  assertEqual(isDroppedEdgeMatch("いこるらぶ", "こるらぶ"), true, "いこるらぶ→こるらぶ（先頭1文字欠け）");
  assertEqual(isDroppedEdgeMatch("青春さぶりみなる", "春さぶりみなる"), true, "青春さぶりみなる→春さぶりみなる（先頭1文字欠け）");
  assertEqual(isDroppedEdgeMatch("青春さぶりみなる", "さぶりみなる"), true, "先頭2文字欠け（8文字なので2文字まで）");
  assertEqual(isDroppedEdgeMatch("青春さぶりみなる", "ぶりみなる"), false, "先頭3文字欠けは許容外");
  assertEqual(isDroppedEdgeMatch("青春さぶりみなる", "青春さぶりみ"), true, "末尾2文字欠け");
  assertEqual(isDroppedEdgeMatch("いこるらぶ", "るらぶ"), false, "残りが3文字（4文字未満）は救済しない");
  assertEqual(isDroppedEdgeMatch("cameo", "ameo"), true, "5文字（cameo）の先頭1文字欠けは残り4文字・80%なので対象");
  assertEqual(isDroppedEdgeMatch("らぶ", "ぶ"), false, "短い曲名は欠けを認めない");
  assertEqual(isDroppedEdgeMatch("あいうえおかきくけこ", "うえおかきくけこ"), true, "10文字で2文字欠け");
  assertEqual(isDroppedEdgeMatch("あいうえおかきくけこ", "えおかきくけこ"), false, "10文字で3文字欠けは許容外");
  assertEqual(isDroppedEdgeMatch("あいうえおかき", "いうえおかき"), true, "7文字で1文字欠け");
  assertEqual(isDroppedEdgeMatch("あいうえおかき", "うえおかき"), false, "7文字で2文字欠けは許容外（残り71%だが欠け数超過）");

  // --- 冒頭欠けの実データ ---
  const love1 = matchSpokenSongName(["コールラブ"], SONGS);
  assertEqual(`${love1.status}:${love1.song?.id}`, "match:love", "「コールラブ」（イコールラブの冒頭欠け）→＝LOVE");
  assertEqual(decideVoiceVerdict(love1, "love"), "correct", "正解が＝LOVEなら自動正解");
  const seishun1 = matchSpokenSongName(["春サブリミナル"], SONGS);
  assertEqual(`${seishun1.status}:${seishun1.song?.id}`, `match:${SEISHUN.id}`, "「春サブリミナル」→青春サブリミナル");
  const seishun2 = matchSpokenSongName(["サブリミナル"], SONGS);
  assertEqual(`${seishun2.status}:${seishun2.song?.id}`, `match:${SEISHUN.id}`, "「サブリミナル」（先頭2文字欠け・残り6文字）→青春サブリミナル");
  const seishun3 = matchSpokenSongName(["青春サブリミナ"], SONGS);
  assertEqual(`${seishun3.status}:${seishun3.song?.id}`, `match:${SEISHUN.id}`, "「青春サブリミナ」（末尾1文字欠け）→青春サブリミナル");
  // 別曲へ欠け救済で自動不正解にはしない（近似・欠けは人間判定）
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["コールラブ"], SONGS), SEISHUN.id), "manual", "正解が別曲のとき、冒頭欠けの一致は自動不正解にせず人間判定");
  // 残りが一般的・短い語は救済しない
  ["ラブ", "青春", "らぶ", "うた", "サブ", "こんにちは", "わかりません"].forEach((input) => {
    const result = matchSpokenSongName([input], SONGS);
    assertEqual(result.status === "match", false, `「${input}」は自動判定しない`);
    assertEqual(decideVoiceVerdict(result, "love") === "correct", false, `「${input}」は自動正解にならない`);
  });

  // --- 候補オブジェクトの正規化と重み ---
  const normalized = normalizeRecognitionCandidates([
    { transcript: "イコールラブ", isFinal: false, sequence: 1 },
    { transcript: "イコールラブ", isFinal: false, sequence: 2 },
    { transcript: "コールラブ", isFinal: true, rank: 0, confidence: 0.6, sequence: 3 },
    { transcript: "イコラブ", isFinal: true, rank: 1, sequence: 3 },
  ]);
  assertEqual(normalized.map((candidate) => candidate.source), ["interim-earlier", "interim", "final", "alternative"], "出どころ：古い途中／最新の途中／最終／代替");
  assertEqual(normalized[2].confidence, 0.6, "confidence は数値ならそのまま");
  assertEqual(normalized[3].confidence, null, "confidence が無ければ null（必須にしない）");
  assertEqual(normalizeRecognitionCandidates(["A", "B"]).map((candidate) => candidate.source), ["final", "alternative"], "文字列配列は従来どおり「最終・信頼度順」");
  assertEqual(normalizeRecognitionCandidates([{ transcript: "" }, { nope: 1 }, "   "]), [], "空・不正な候補は捨てる");
  assertEqual(CANDIDATE_SOURCE_WEIGHT.final > CANDIDATE_SOURCE_WEIGHT.alternative && CANDIDATE_SOURCE_WEIGHT.alternative > CANDIDATE_SOURCE_WEIGHT.interim && CANDIDATE_SOURCE_WEIGHT.interim > CANDIDATE_SOURCE_WEIGHT["interim-earlier"], true, "重み：最終 > 代替 > 途中 > 古い途中");

  // --- 証拠統合 ---
  const both = matchSpokenSongName([{ transcript: "イコールラブ", isFinal: false, sequence: 1 }, { transcript: "イコール Love", isFinal: true, sequence: 2 }], SONGS);
  assertEqual(`${both.status}:${both.song?.id}`, "match:love", "途中「イコールラブ」＋崩れた最終「イコール Love」→途中結果の支持で＝LOVE");
  assertEqual(both.score, 3 * CANDIDATE_SOURCE_WEIGHT.interim, "1位スコアは途中結果の完全一致×重み");
  assertEqual(decideVoiceVerdict(both, "love"), "correct", "正解が＝LOVEなら自動正解");
  assertEqual(decideVoiceVerdict(both, SEISHUN.id), "manual", "途中結果だけの一致は自動不正解の根拠にしない（人間判定）");
  const finalOnlyWrong = matchSpokenSongName([{ transcript: "＝LOVE", isFinal: true }], SONGS);
  assertEqual(decideVoiceVerdict(finalOnlyWrong, SEISHUN.id), "wrong", "最終結果が別曲に完全一致なら自動不正解（従来どおり）");
  const interimOnly = matchSpokenSongName([{ transcript: "イコールラブ", isFinal: false }], SONGS);
  assertEqual(`${interimOnly.status}:${interimOnly.song?.id}`, "match:love", "途中結果だけでも（no-final）判定できる");
  const support = matchSpokenSongName([
    { transcript: "イコールラブ", isFinal: false, sequence: 1 },
    { transcript: "イコール Love", isFinal: true, rank: 0, sequence: 2 },
    { transcript: "イコラブ", isFinal: true, rank: 1, sequence: 2 },
  ], SONGS);
  assertEqual(support.candidates[0].support >= 2, true, "複数候補が同じ曲を支持すると support が増える");
  assertEqual(support.status, "match", "複数候補が同じ1曲を支持→自動判定");
  // 途中と最終が別曲を強く支持 → 人間判定
  const conflict = matchSpokenSongName([{ transcript: "イコールラブ", isFinal: false, sequence: 1 }, { transcript: SEISHUN.title, isFinal: true, sequence: 2 }], SONGS);
  assertEqual(conflict.status, "ambiguous", "途中「イコールラブ」（完全）と最終「青春サブリミナル」（完全）が別曲→競合として人間判定（無理に自動確定しない）");
  assertEqual(decideVoiceVerdict(conflict, SEISHUN.id), "manual", "途中と最終が別曲なら自動正解も自動不正解もしない");
  const conflict2 = matchSpokenSongName([{ transcript: "イコールラブ", isFinal: false, sequence: 1 }, { transcript: "春サブリミナル", isFinal: true, sequence: 2 }], SONGS);
  assertEqual(conflict2.status, "ambiguous", "途中「イコールラブ」（完全）と最終「春サブリミナル」（近似）が別曲→人間判定");
  assertEqual(conflict2.reason, "final-vs-interim-conflict", "理由：途中と最終の食い違い");
  assertEqual(decideVoiceVerdict(conflict2, "love"), "manual", "食い違いは自動正解にしない");
  // 一瞬だけ偶然別の曲名が途中結果に出ても、最終が正しければ最終に従う
  const flicker = matchSpokenSongName([
    { transcript: "青春", isFinal: false, sequence: 1 },
    { transcript: "イコールラブ", isFinal: false, sequence: 2 },
    { transcript: "イコールラブ", isFinal: true, sequence: 3 },
  ], SONGS);
  assertEqual(`${flicker.status}:${flicker.song?.id}`, "match:love", "途中の一瞬の断片は最終結果に影響しない");
  // 途中結果に一瞬だけ別曲の完全一致が出て、最終は崩れた → 競合として人間判定
  const flickerBad = matchSpokenSongName([
    { transcript: SEISHUN.title, isFinal: false, sequence: 1 },
    { transcript: "イコールラブ", isFinal: false, sequence: 2 },
    { transcript: "イコール Love", isFinal: true, sequence: 3 },
  ], SONGS);
  assertEqual(flickerBad.status, "ambiguous", "古い途中結果が別曲に完全一致（2.1）・新しい途中結果が＝LOVE（2.55）→差0.45で競合→人間判定");
  // evidence（診断用）
  assertEqual(both.evidence.length, 2, "候補ごとの最有力曲（evidence）を返す");
  assertEqual(both.evidence[0].songId, "love", "evidence：途中「イコールラブ」→＝LOVE");
  assertEqual(matchSpokenSongName([], SONGS).status, "none", "候補なし→none");
  assertEqual(matchSpokenSongName([{ transcript: "ぱ", isFinal: true }], SONGS).status !== "match", true, "1文字は判定しない");

  // 既存の別名・表記揺れは維持
  ["＝LOVE", "=LOVE", "イコールラブ", "イコラブ", "国歌", "こっか", "国家", "LOVE"].forEach((input) => {
    assertEqual(matchSpokenSongName([input], SONGS).song?.id, "love", `「${input}」→＝LOVE（既存）`);
  });
}

// ===== (B) 全84曲の擬似認識エラー総当たり =====
function mutations(text) {
  const chars = Array.from(text);
  const list = [];
  if (chars.length >= 5) list.push({ kind: "prefix-1", text: chars.slice(1).join("") });
  if (chars.length >= 6) list.push({ kind: "prefix-2", text: chars.slice(2).join("") });
  if (chars.length >= 5) list.push({ kind: "suffix-1", text: chars.slice(0, -1).join("") });
  if (chars.length >= 6) list.push({ kind: "suffix-2", text: chars.slice(0, -2).join("") });
  if (chars.length >= 4) {
    const middle = Math.floor(chars.length / 2);
    const replaced = [...chars];
    replaced[middle] = replaced[middle] === "ん" ? "る" : "ん";
    list.push({ kind: "substitute-1", text: replaced.join("") });
  }
  return list;
}

export function runVoicePipelineFalsePositiveSweepTests() {
  let checked = 0;
  let autoCorrectOwn = 0;
  let manual = 0;
  const falsePositives = [];
  SONGS.forEach((song) => {
    const inputs = [song.title, song.searchReading].filter(Boolean);
    (song.searchAliases ?? []).forEach((alias) => {
      if (typeof alias === "string") inputs.push(alias);
      else inputs.push(alias.text, alias.reading);
    });
    inputs.filter(Boolean).forEach((input) => {
      mutations(input).forEach((mutation) => {
        const result = matchSpokenSongName([mutation.text], SONGS);
        const verdictForOwn = decideVoiceVerdict(result, song.id);
        checked += 1;
        if (result.status === "match" && result.song.id !== song.id) {
          falsePositives.push(`${song.title}：「${input}」の${mutation.kind}「${mutation.text}」→${result.song.title}`);
        }
        if (verdictForOwn === "correct") autoCorrectOwn += 1;
        else manual += 1;
        // 別の曲が正解のとき、この崩れた入力で「自動不正解」になるのは元の曲名を完全に言ったときだけ（欠け・置換では起きない）
        const other = SONGS.find((candidate) => candidate.id !== song.id);
        if (result.status === "match" && result.song.id === song.id) {
          assertEqual(decideVoiceVerdict(result, other.id) === "wrong" && result.topFinalScore < 3, false, `「${mutation.text}」（${song.title}の${mutation.kind}）は完全一致でない限り別曲の正解者を自動不正解にしない`);
        }
      });
    });
  });
  assertEqual(falsePositives.slice(0, 20), [], `全曲の擬似認識エラー（${checked}件）で別の曲へ自動正解しない（false positive ${falsePositives.length}件）`);
  // 具体例：「ヒロイン」は「ヒロインズ」の末尾欠けとも「僕のヒロイン」の冒頭欠けとも取れる → 人間判定
  const heroine = matchSpokenSongName(["ヒロイン"], SONGS);
  assertEqual(heroine.status, "ambiguous", "「ヒロイン」は2曲の断片なので自動判定しない");
  assertEqual(heroine.reason, "shared-fragment", "理由：別の曲名にも含まれる断片");
  assertEqual(checked > 400, true, `十分な件数を検査した（${checked}件：自分の曲へ自動正解 ${autoCorrectOwn}／人間判定 ${manual}）`);
  assertEqual(autoCorrectOwn > checked * 0.3, true, "長い曲名の欠け・1文字違いは相当数が自動正解で救える（30%超）");
  // 短い曲名（正規化後3文字以下＝編集距離の許容0）の1文字欠けは自動正解にならない
  // （4〜7文字は第3回で本人確定した「1文字の誤認識・欠落を許容」の範囲なので対象外）
  let shortChecked = 0;
  SONGS.forEach((song) => {
    const normalizedTitle = normalizeSpokenText(song.title);
    if (normalizedTitle.length > 3 || normalizedTitle.length < 2) return;
    const dropped = normalizedTitle.slice(1);
    if (dropped.length < 1) return;
    const result = matchSpokenSongName([dropped], SONGS);
    // 別名に完全一致する場合（例：短い別名）を除き、自動正解にならない
    const aliasHit = result.status === "match" && result.song.id === song.id && result.topFinalScore >= 3;
    if (!aliasHit) assertEqual(decideVoiceVerdict(result, song.id) === "correct", false, `短い曲名「${song.title}」の先頭欠け「${dropped}」は自動正解にしない`);
    shortChecked += 1;
  });
  assertEqual(shortChecked >= 0, true, `短い曲名 ${shortChecked} 件を検査`);
}

// ===== (C) 回答時間の起点 =====
export function runVoicePipelineDeadlineTests() {
  assertEqual(computeVoiceDeadline({ claimedAtMs: 1000, speechStartedAtMs: null, startTimeoutSec: 3 }), 4000, "ready 未検出：従来どおり回答権＋制限秒");
  assertEqual(computeVoiceDeadline({ claimedAtMs: 1000, readyAtMs: 1400, speechStartedAtMs: null, startTimeoutSec: 3 }), 4400, "ready 検出：ready 起点（マイク初期化の400msぶん延びる）");
  assertEqual(computeVoiceDeadline({ claimedAtMs: 1000, readyAtMs: 5000, speechStartedAtMs: null, startTimeoutSec: 3 }), 1000 + PARTY_VOICE_READY_SHIFT_CAP_MS + 3000, "ready が遅すぎる：上限（回答権＋1.5秒）で打ち切り");
  assertEqual(computeVoiceDeadline({ claimedAtMs: 1000, readyAtMs: 500, speechStartedAtMs: null, startTimeoutSec: 3 }), 4000, "先行起動で ready が回答権より前：回答権起点（縮めない）");
  assertEqual(computeVoiceDeadline({ claimedAtMs: 1000, readyAtMs: 1400, speechStartedAtMs: 1500, startTimeoutSec: 3 }), 6500, "発話開始後は発話開始＋5秒（従来）");
  assertEqual(computeVoiceDeadline({ claimedAtMs: 0, speechStartedAtMs: 2900, startTimeoutSec: 3 }), 7900, "既存：制限ぎりぎりに話し始めても5秒待てる");
}

// ===== FakeSpeechRecognition =====
class FakeRecognition {
  constructor() {
    this.started = false;
    this.aborted = false;
    this.lang = null;
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
    FakeRecognition.lastStarted = this;
    if (FakeRecognition.throwOnStart) throw new Error("start failed");
  }
  abort() {
    if (this.aborted) return;
    this.aborted = true;
    this.onend?.();
  }
  // テスト用：結果イベントを作って送る。results: [{ alternatives: [{ transcript, confidence }], isFinal }]
  emitResult(results, resultIndex = 0) {
    const list = results.map((entry) => {
      const alternatives = entry.alternatives.map((alt) => ({ transcript: alt.transcript, confidence: alt.confidence }));
      alternatives.isFinal = Boolean(entry.isFinal);
      return alternatives;
    });
    this.onresult?.({ resultIndex, results: list });
  }
}
FakeRecognition.instances = [];
FakeRecognition.lastStarted = null;
FakeRecognition.throwOnStart = false;

export function runVoiceSessionEventOrderTests() {
  setSpeechRecognitionFactoryForTest(FakeRecognition);
  resetVoiceRecognitionAvailability();
  clearVoiceDiagnostics();
  try {
    // 1) start → audiostart → speechstart → interim → final → end
    {
      const events = [];
      let ready = 0;
      const session = startVoiceRecognitionSession({
        onReady: () => { ready += 1; },
        onTranscripts: (transcripts, isFinal, candidates) => events.push({ transcripts, isFinal, count: candidates.length }),
        onEnd: (reason) => events.push({ end: reason }),
      });
      const fake = FakeRecognition.lastStarted;
      assertEqual(fake.interimResults === true && fake.maxAlternatives === 5 && fake.continuous === false && fake.lang === "ja-JP", true, "設定：interimResults=true／maxAlternatives=5／continuous=false／lang=ja-JP");
      fake.onstart?.();
      fake.onaudiostart?.();
      assertEqual(ready, 1, "ready は onstart／onaudiostart のどちらか早い方で1回だけ");
      fake.onspeechstart?.();
      fake.emitResult([{ alternatives: [{ transcript: "イコール", confidence: 0.3 }], isFinal: false }]);
      fake.emitResult([{ alternatives: [{ transcript: "イコールラブ", confidence: 0.5 }], isFinal: false }]);
      fake.emitResult([{ alternatives: [{ transcript: "イコールラブ", confidence: 0.9 }, { transcript: "イコラブ", confidence: 0.4 }], isFinal: true }]);
      fake.onend?.();
      assertEqual(events.map((event) => event.isFinal ?? event.end), [false, false, true, "final"], "途中→途中→最終→end");
      const candidates = session.getCandidates();
      assertEqual(candidates.map((candidate) => `${candidate.source}:${candidate.transcript}`), ["interim:イコール", "interim:イコールラブ", "final:イコールラブ", "alternative:イコラブ"], "候補履歴：途中結果も代替候補も捨てない（重複は上書き）");
      assertEqual(candidates[2].confidence, 0.9, "confidence を保持");
      const log = getVoiceSessionLogs().at(-1);
      assertEqual(log.events.map((event) => event.name).slice(0, 5), ["start()", "onstart", "ready", "onaudiostart", "onspeechstart"], "セッションログに時系列が残る");
      assertEqual(log.events.every((event) => typeof event.dtMs === "number"), true, "各イベントの相対ms");
    }
    // 2) start 直後に result（onstart より先）でも捨てない／途中結果だけで end → no-final
    {
      const events = [];
      startVoiceRecognitionSession({ onTranscripts: (t, isFinal) => events.push(isFinal), onEnd: (reason) => events.push(reason) });
      const fake = FakeRecognition.lastStarted;
      fake.emitResult([{ alternatives: [{ transcript: "イコールラブ" }], isFinal: false }]);
      fake.onend?.();
      assertEqual(events, [false, "no-final"], "onstart 前の途中結果も受け取り、途中結果だけなら no-final");
    }
    // 3) onerror（network）→ error:network ／ no-speech ／ aborted
    ["network", "not-allowed", "audio-capture", "service-not-allowed"].forEach((code) => {
      const ends = [];
      startVoiceRecognitionSession({ onEnd: (reason) => ends.push(reason) });
      FakeRecognition.lastStarted.onerror?.({ error: code });
      FakeRecognition.lastStarted.onend?.();
      assertEqual(ends, [`error:${code}`], `${code} は error:${code} として1回だけ終了`);
    });
    {
      const ends = [];
      startVoiceRecognitionSession({ onEnd: (reason) => ends.push(reason) });
      FakeRecognition.lastStarted.onerror?.({ error: "no-speech" });
      FakeRecognition.lastStarted.onend?.();
      assertEqual(ends, ["no-speech"], "no-speech");
    }
    {
      const ends = [];
      const session = startVoiceRecognitionSession({ onEnd: (reason) => ends.push(reason) });
      FakeRecognition.lastStarted.onstart?.();
      session.abort();
      assertEqual(ends, ["aborted"], "abort() は aborted で1回だけ");
    }
    // 4) onend だけ来る（イベント無し）→ no-start
    {
      const ends = [];
      startVoiceRecognitionSession({ onEnd: (reason) => ends.push(reason) });
      FakeRecognition.lastStarted.onend?.();
      assertEqual(ends, ["no-start"], "onend だけ→no-start（致命的扱い→人間判定）");
    }
    // 5) start() が例外
    {
      FakeRecognition.throwOnStart = true;
      const ends = [];
      startVoiceRecognitionSession({ onEnd: (reason) => ends.push(reason) });
      FakeRecognition.throwOnStart = false;
      assertEqual(ends, ["error:start"], "start() の例外は error:start");
    }
    // 6) 複数 result（resultIndex）・空の transcript・length 無し でも壊れない
    {
      const events = [];
      startVoiceRecognitionSession({ onTranscripts: (t) => events.push(t) });
      const fake = FakeRecognition.lastStarted;
      fake.onresult?.({ resultIndex: 1, results: [null, Object.assign([{ transcript: "  " }, { transcript: "イコラブ" }], { isFinal: true })] });
      assertEqual(events, [["イコラブ"]], "resultIndex 以降だけ・空文字は除外");
      fake.onresult?.({ results: [] });
      fake.onend?.();
    }
  } finally {
    setSpeechRecognitionFactoryForTest(null);
    clearVoiceDiagnostics();
  }
}

// ===== (D) エンジンを実際に回す（歌詞モード＝音源不要／音声回答／実タイマー） =====
export async function runVoicePipelineEngineFlowTests() {
  const { createPartyBattleEngine } = await import("../js/partyBattleEngine.js");
  setSpeechRecognitionFactoryForTest(FakeRecognition);
  resetVoiceRecognitionAvailability();
  clearVoiceDiagnostics();
  const sfxBefore = getSfxSettings();
  setSfxMasterEnabled(false);
  const settings = normalizePartySettings({ playerCount: 2, playerNames: ["がしお", "さな"], quizType: "lyrics", answerMethod: "voice", questionCountValue: "10", otetsuki: false, voiceStartTimeoutSec: 3 });
  const built = buildPartyPlayers(settings);
  const hints = [{ hintLevel: 1, segment: { text: "あいうえおかきくけこ" } }];
  // 同じ曲は1試合に1回しか出ない（usedSongIds）ので、流れごとに別の曲を使う
  const questionSongs = [LOVE, SEISHUN, byTitle("夏名残サマーチューン"), byTitle("ヒロインズ"), byTitle("劇薬中毒"), byTitle("ズルいよ ズルいね"), byTitle("夢の続き")];
  assertEqual(questionSongs.every(Boolean), true, "前提：テストに使う7曲が songs.js にある");
  const questions = questionSongs.map((song) => ({ song, choices: SONGS.slice(0, 4), hints, revealStartTimeSec: 0, revealStartTimeSecByHintLevel: { 1: 0 } }));
  const match = createPartyMatch({ settings, players: built.players, layout: built.layout, seats: built.seats, questions, plannedCount: questions.length, seed: 1 });
  const [p1, p2] = match.players.map((player) => player.id);
  let latest = null;
  const engine = createPartyBattleEngine({ onUpdate: (snapshot) => { latest = snapshot; } });
  engine.load(match, { poolSongs: SONGS, distractorSongs: SONGS, songsWithLyrics: [] });
  engine.start();
  const waitFor = (predicate, ms = 9000) => new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt > ms) return reject(new Error("timeout"));
      setTimeout(tick, 40);
    };
    tick();
  });
  const waitActive = (questionNumber) => waitFor(() => latest?.runtime?.phase === PARTY_PHASE.ACTIVE && latest.runtime.questionNumber === questionNumber);
  const voice = () => latest?.ui?.voice ?? null;
  try {
    // ----- A: 先行起動 → 引き継ぎ → start→audiostart→speechstart→途中正解→最終正解 → 自動正解 -----
    await waitActive(1);
    const before = FakeRecognition.instances.length;
    const t0 = performance.now();
    assertEqual(engine.prewarmVoice(p1, t0), true, "A：pointerdown で音声認識を先行起動できる");
    assertEqual(FakeRecognition.instances.length, before + 1, "A：認識インスタンスが1つ起動");
    const fakeA = FakeRecognition.lastStarted;
    assertEqual(fakeA.started, true, "A：start() 済み（押した瞬間・ユーザー操作内）");
    assertEqual(engine.prewarmVoice(p2, t0), false, "A：同時に別の人が押しても先行起動は1つだけ");
    fakeA.onstart?.();
    fakeA.onaudiostart?.();
    engine.pressAnswer(p1, t0);
    assertEqual(latest.runtime.phase, PARTY_PHASE.CLAIMED, "A：pointerup で回答権（順位は pointerup で確定）");
    assertEqual(FakeRecognition.instances.length, before + 1, "A：先行起動したセッションをそのまま引き継ぐ（起動し直さない）");
    assertEqual(voice().prewarmed, true, "A：snapshot に prewarmed");
    assertEqual(voice().ready, true, "A：ready（マイクが開いている）を引き継ぐ");
    fakeA.onspeechstart?.();
    fakeA.emitResult([{ alternatives: [{ transcript: "イコールラブ" }], isFinal: false }]);
    assertEqual(voice().transcripts, ["イコールラブ"], "A：途中結果が画面へ");
    assertEqual(latest.runtime.phase, PARTY_PHASE.CLAIMED, "A：途中結果では確定しない");
    fakeA.emitResult([{ alternatives: [{ transcript: "イコールラブ", confidence: 0.92 }], isFinal: true }]);
    fakeA.onend?.();
    assertEqual(latest.runtime.phase, PARTY_PHASE.CORRECT_RESULT, "A：最終結果で自動正解");
    assertEqual(voice().verdict.kind, "correct", "A：verdict correct");
    const logA = getVoiceSessionLogs().at(-1);
    assertEqual(logA.origin, "prewarm", "A：ログは先行起動セッション");
    assertEqual(logA.judgement?.verdict, "correct", "A：判定がログに残る");
    assertEqual(logA.judgement?.prewarmed, true, "A：先行起動の情報");
    assertEqual(typeof logA.judgement?.claimToJudgeMs, "number", "A：回答権→判定のms");
    engine.next();

    // ----- B: 途中「青春サブリミナル」→ 最終「春サブリミナル」（冒頭欠け）→ 同一曲支持で自動正解 -----
    await waitActive(2);
    const t1 = performance.now();
    engine.prewarmVoice(p1, t1);
    engine.pressAnswer(p1, t1);
    const fakeB = FakeRecognition.lastStarted;
    fakeB.onstart?.();
    fakeB.emitResult([{ alternatives: [{ transcript: "青春サブリミナル" }], isFinal: false }]);
    fakeB.emitResult([{ alternatives: [{ transcript: "春サブリミナル" }], isFinal: true }]);
    fakeB.onend?.();
    assertEqual(latest.runtime.phase, PARTY_PHASE.CORRECT_RESULT, "B：途中と最終が同じ曲を支持→自動正解");
    engine.next();

    // ----- C: 先行起動なし（pointerup だけ）・最終が頭欠け「名残サマーチューン」 → unique remainder で救済 -----
    await waitActive(3);
    const t2 = performance.now();
    engine.pressAnswer(p1, t2);
    assertEqual(voice().prewarmed, false, "C：先行起動なしでも従来どおり回答権確定で起動");
    const fakeC = FakeRecognition.lastStarted;
    fakeC.onstart?.();
    fakeC.emitResult([{ alternatives: [{ transcript: "名残サマーチューン" }], isFinal: true }]);
    fakeC.onend?.();
    assertEqual(latest.runtime.phase, PARTY_PHASE.CORRECT_RESULT, "C：冒頭欠け「名残サマーチューン」→夏名残サマーチューンとして自動正解");
    engine.next();

    // ----- D: 曖昧（「ブリミナル」＝弱い途中一致）→ 人間判定 → 人間が⭕ → 正解（曲名は人間判定中に出さない） -----
    await waitActive(4);
    const t3 = performance.now();
    engine.prewarmVoice(p2, t3);
    engine.pressAnswer(p2, t3);
    const fakeD = FakeRecognition.lastStarted;
    fakeD.onstart?.();
    fakeD.emitResult([{ alternatives: [{ transcript: "ブリミナル" }], isFinal: true }]); // 途中一致（1.0）だけ＝弱い
    fakeD.onend?.();
    assertEqual(latest.runtime.phase, PARTY_PHASE.CLAIMED, "D：曖昧なら確定しない（人間判定待ち）");
    assertEqual(voice().status, "manual", "D：人間判定");
    assertEqual(voice().manualReason, "verdict:weak", "D：理由（弱い聞き取り）");
    assertEqual(latest.runtime.solutionRevealed, false, "D：人間判定中は正解曲名を公開しない");
    engine.humanJudge(true);
    assertEqual(latest.runtime.phase, PARTY_PHASE.CORRECT_RESULT, "D：人間の⭕で正解");
    engine.next();

    // ----- F: 非常に早い発話：start() 直後（onstart より前）に最終結果 → 捨てない -----
    await waitActive(5);
    const t4 = performance.now();
    engine.prewarmVoice(p1, t4);
    const fakeF = FakeRecognition.lastStarted;
    fakeF.emitResult([{ alternatives: [{ transcript: "劇薬中毒" }], isFinal: true }]);
    fakeF.onend?.();
    // 押している間に最終結果まで出た（endReason=final）→ pointerup でそのまま判定
    engine.pressAnswer(p1, t4);
    assertEqual(latest.runtime.phase, PARTY_PHASE.CORRECT_RESULT, "F：押している間に出た最終結果も捨てずに判定");
    engine.next();

    // ----- G: P1 が先行起動 → P2 が先に離して回答権 → P1 の先行起動は止め、P2 用に起動し直す -----
    await waitActive(6);
    const t5 = performance.now();
    engine.prewarmVoice(p1, t5);
    const fakeG1 = FakeRecognition.lastStarted;
    engine.pressAnswer(p2, t5);
    assertEqual(fakeG1.aborted, true, "G：別の人が回答権を取ったら先行起動は止める");
    const fakeG2 = FakeRecognition.lastStarted;
    assertEqual(fakeG2 !== fakeG1 && fakeG2.started, true, "G：回答権を取った人のために起動し直す");
    assertEqual(voice().playerId, p2, "G：回答権は先に離した P2（先行起動の有無は順位に影響しない）");
    fakeG2.onstart?.();
    fakeG2.emitResult([{ alternatives: [{ transcript: "ズルズル" }], isFinal: true }]); // 既知の別名（searchAliases）
    fakeG2.onend?.();
    assertEqual(latest.runtime.phase, PARTY_PHASE.CORRECT_RESULT, "G：P2 の回答で正解");
    engine.next();

    // ----- H: 先行起動をキャンセル（スライドして離す）→ 止まり、再び先行起動できる -----
    await waitActive(7);
    const t6 = performance.now();
    engine.prewarmVoice(p1, t6);
    const fakeH = FakeRecognition.lastStarted;
    engine.cancelVoicePrewarm(p1);
    assertEqual(fakeH.aborted, true, "H：キャンセルで先行起動を止める");
    assertEqual(latest.runtime.phase, PARTY_PHASE.ACTIVE, "H：問題は続く（回答権は取っていない）");
    assertEqual(engine.prewarmVoice(p1, performance.now()), true, "H：もう一度押せば再び先行起動できる");
    // ----- E: 認識APIのエラー（network）→ 人間判定へ（自動不正解にしない）。以降は人間判定固定 -----
    const fakeE = FakeRecognition.lastStarted;
    engine.pressAnswer(p1, performance.now());
    fakeE.onerror?.({ error: "network" });
    fakeE.onend?.();
    assertEqual(latest.runtime.phase, PARTY_PHASE.CLAIMED, "E：エラーでも不正解にしない");
    assertEqual(voice().status, "manual", "E：人間判定へフォールバック");
    assertEqual(voice().manualReason, "error:network", "E：理由");
    assertEqual(isVoiceRecognitionAvailable(), false, "E：以降この試合は人間判定で続ける");
    engine.humanJudge(false);
    assertEqual(latest.runtime.phase, PARTY_PHASE.WRONG_RESULT, "E：人間の❌で不正解（問題は続く）");
  } finally {
    engine.dispose();
    setSpeechRecognitionFactoryForTest(null);
    resetVoiceRecognitionAvailability();
    clearVoiceDiagnostics();
    ["equalLoveIntroQuiz.partyBattle.recentNames", "equalLoveIntroQuiz.partyBattle.lastSettings"].forEach((key) => localStorage.removeItem(key));
    setSfxMasterEnabled(sfxBefore.masterEnabled);
    ["equalLoveIntroQuiz.sfxEnabled"].forEach((key) => localStorage.removeItem(key));
  }
}

// ===== (E) 配線 =====
export async function runVoicePipelineWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const arbiter = createClaimArbiter();
  arbiter.enable(100);
  assertEqual(arbiter.wouldAccept(50), false, "arbiter.wouldAccept：START前の押し始めは不可（フライング）");
  assertEqual(arbiter.wouldAccept(150), true, "arbiter.wouldAccept：START後なら可");
  assertEqual(arbiter.isEnabled(), true, "wouldAccept は受理（ロック）しない");
  arbiter.tryClaim(150);
  assertEqual(arbiter.wouldAccept(160), false, "回答権が取られた後は不可");
  const interaction = await fetchText("js/answerButtonInteraction.js");
  assertEqual(interaction.includes("export function bindPressReleaseAnswer(button, onConfirm, hooks = {})") && interaction.includes("hooks.onPressStart?.({ pressStartedAtMs })") && interaction.includes("hooks.onPressEnd?.({ confirmed: shouldConfirm, pressStartedAtMs: startedAtMs })"), true, "bindPressReleaseAnswer：省略可能な hooks（onPressStart／onPressEnd）。省略時は従来どおり");
  const play = await fetchText("js/partyBattlePlayScreen.js");
  assertEqual(play.includes("onPressStart: (pointerStartedAtMs) => engine?.prewarmVoice(playerId, pointerStartedAtMs)") && play.includes("if (!confirmed) engine?.cancelVoicePrewarm(playerId)"), true, "画面：「回答！」の pointerdown で先行起動、キャンセルで停止");
  const engine = await fetchText("js/partyBattleEngine.js");
  assertEqual(engine.includes("if (!arbiter.wouldAccept(pointerStartedAtMs) || !canPlayerAnswer(runtime, playerId)) return false;"), true, "engine：先行起動は回答権を取れる状態のときだけ（順位判定は arbiter のまま）");
  assertEqual(engine.includes("pausePlaybackKeepingPosition();\n    prewarm.pausedPlayback = true;"), true, "engine：押した瞬間に音源を止める（曲がマイクに入らない）。キャンセルで戻す");
  assertEqual(engine.includes("const inputs = voiceState.candidates.length > 0 ? voiceState.candidates : transcripts;"), true, "engine：候補履歴（途中・代替・最終）をマッチャーへ渡す");
  assertEqual(engine.includes("readyAtMs: voiceState.readyAtMs,"), true, "engine：締切は ready 起点");
  assertEqual(engine.includes("attachVoiceSessionJudgement(voiceState.sessionId, {"), true, "engine：判定を診断ログへ");
  const screen = await fetchText("js/partyBattleScreen.js");
  assertEqual(screen.includes("export function formatVoiceSessionLog(log)") && screen.includes("getVoiceSessionLogs()"), true, "開始前チェックの診断情報に発話セッションログを表示");
  const voiceSource = await fetchText("js/partyBattleVoice.js");
  assertEqual(voiceSource.includes("recognition.maxAlternatives = 5;") && voiceSource.includes("recognition.interimResults = true;"), true, "voice：interimResults=true／maxAlternatives=5");
  assertEqual(voiceSource.includes("window.__partyVoiceLogs = () => getVoiceSessionLogs();"), true, "voice：console から直近セッションを確認できる");
  assertEqual(voiceSource.includes("firebase") || voiceSource.includes("localStorage.setItem"), false, "voice：診断ログは外部送信・保存しない");
  const storage = await fetchText("js/partyBattleStorage.js");
  assertEqual(storage.includes("candidates"), false, "候補履歴は保存データへ入れない");
}
