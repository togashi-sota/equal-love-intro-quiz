// パーティー対戦（2026-09-15新設）の音声回答：Web Speech API（SpeechRecognition）のアダプター。
//
// 【位置づけ】音声認識は補助機能（本人確定）。正式な利用形態は「ホーム画面に追加（インストール）した
// PWA」（iPhone／iPad／Android）。iOS・iPadOSのWebKitは、Safariタブでは webkitSpeechRecognition が
// 使える一方、ホーム画面版（standalone）ではAPIが存在しても start() が無言で失敗する／イベントが
// 一切来ない、権限プロンプトが出ない、といった固有の挙動が報告されている。そのため、このファイルは
//   ・どの段階で失敗したかを必ず区別して記録する（段階：API存在→マイク→start()→音の検出→発話→結果）
//   ・失敗を内部で黙って握りつぶさず、onStage() で画面へ現在状態を伝える
//   ・試合中に認識が使えなくなっても、その回答だけ人間判定へ落として試合を止めない（エンジン側）
// という方針で書かれている。診断ログ（getVoiceDiagnostics）は開始前チェック画面の「診断情報」で
// 確認できる（一般ユーザーに常時大きなログを見せることはしない）。
//
// 【時間の考え方】制限時間（2/3/5/10秒）は「話し始めるまで」の時間。発話開始（speechstart／
// soundstart／途中結果）を検出したら、そこから最大PARTY_VOICE_MAX_SPEECH_MS（5秒）まで認識完了を
// 待てる。時間の計算はcomputeVoiceDeadline()として純粋関数に切り出し、テストできるようにしている。
//
// 【iOSで実際に起きうること（2026-09-15 第1回実機QAでの「反応しない」報告を受けた調査結果）】
//   ・standalone（ホーム画面版）では webkitSpeechRecognition が定義されていても、start() 後に
//     onstart／onaudiostart が一度も来ないまま onend も来ない（＝無反応）ことがある
//     → 締切タイマーで必ず打ち切り、人間判定へ落とす（PARTY_VOICE_START_GRACE_MS）
//   ・マイク権限が未付与だと onerror("not-allowed") または即 onend
//     → 開始前チェックの「マイク／音声認識テスト」で、明確なユーザー操作から getUserMedia を先に呼び、
//       権限プロンプトを出す（マイク不可と認識API不可を別のエラーとして表示）
//   ・interimResults の途中結果しか返らず isFinal が来ないまま onend になる
//     → onend 時点で途中結果があればそれを最終結果として扱う（以前はここで人間判定へ落としていた）
//   ・音源（HTMLAudio）の再生直後は、音声セッションの切り替えで認識開始が遅れる／失敗する
//     → 回答権確定時に音源を止めてから start() を呼ぶ（エンジン側）。
//
// 【2026-09-16 第6回「音声早押し認識 最大精度化」】
//   ・start() を呼んだ瞬間と、認識器が実際に音を受け取れる瞬間（onstart／onaudiostart）は別。早押し直後に話すと
//     その差のぶん発話の冒頭が録れない。→ エンジンは「回答！」の pointerdown（押した瞬間）で認識を先行起動し
//     （pre-warm）、pointerup で回答権を取った時点では既にマイクが開き始めている状態にする。
//   ・途中結果（interim）・最終結果の代替候補（alternatives）を捨てずに候補履歴（candidates）として保持し、
//     曲名マッチャー（js/songNameMatcher.js）へ「証拠の集まり」として渡す。
//   ・onReady（onstart／onaudiostart のどちらか早い方）を通知し、回答時間の起点をそこへ寄せられるようにする。
//   ・1回の発話セッションの時系列（各イベントの相対ms・候補・判定）をメモリ上に最大10件残す
//     （getVoiceSessionLogs。外部送信・保存・録音はしない）。

import { PARTY_VOICE_MAX_SPEECH_MS } from "./partyBattleState.js";

// start() を呼んでから、onstart／onaudiostart のどれも来ない場合に「開始失敗」とみなすまでの猶予。
export const PARTY_VOICE_START_GRACE_MS = 2500;

// ===== 診断ログ =====
const MAX_DIAGNOSTIC_ENTRIES = 60;
const diagnosticEntries = [];
let diagnosticStartMs = null;

function pushDiagnostic(stage, detail = "") {
  const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (diagnosticStartMs === null) diagnosticStartMs = nowMs;
  diagnosticEntries.push({ atMs: Math.round(nowMs - diagnosticStartMs), stage, detail: String(detail ?? "") });
  if (diagnosticEntries.length > MAX_DIAGNOSTIC_ENTRIES) diagnosticEntries.shift();
}

// 開始前チェック画面の「診断情報」用。段階名と詳細の配列を返す（新しい順ではなく時系列）。
export function getVoiceDiagnostics() {
  return diagnosticEntries.map((entry) => ({ ...entry }));
}

export function clearVoiceDiagnostics() {
  diagnosticEntries.length = 0;
  diagnosticStartMs = null;
  sessionLogs.length = 0;
}

// 【第6回】発話セッション単位の時系列ログ（直近 MAX_SESSION_LOGS 件。メモリ上のみ）。
//   { id, startedAtMs, origin: "prewarm"|"claim", events: [{ name, dtMs, detail }], candidates: [...], judgement: {...} | null }
//   dtMs は start() 呼び出し時刻からの相対ms。judgement はエンジンが判定後に attachVoiceSessionJudgement で書き込む。
const MAX_SESSION_LOGS = 10;
const sessionLogs = [];
let sessionSequence = 0;

export function getVoiceSessionLogs() {
  return sessionLogs.map((log) => ({ ...log, events: log.events.map((event) => ({ ...event })), candidates: log.candidates.map((candidate) => ({ ...candidate })) }));
}

// エンジンが判定結果（matcher の1位・2位・スコア・verdict・人間判定へ落ちた理由・回答権からの経過ms）を書き込む。
export function attachVoiceSessionJudgement(sessionId, judgement) {
  const log = sessionLogs.find((entry) => entry.id === sessionId);
  if (log) log.judgement = { ...judgement };
}

// 開発者向け：console から `window.__partyVoiceLogs()` で直近のセッションを見られるようにする（本番画面は汚さない）。
if (typeof window !== "undefined") {
  window.__partyVoiceLogs = () => getVoiceSessionLogs();
}

// ===== 環境の判定 =====
// 【第6回・テスト用】本物の SpeechRecognition の代わりに使うコンストラクタ（Fake）を差し込む。
// tests/ から「start→audiostart→speechstart→interim→final→end」等のイベント順を再現するために使う。null で元に戻す。
let speechRecognitionFactoryOverride = null;
export function setSpeechRecognitionFactoryForTest(factory) {
  speechRecognitionFactoryOverride = typeof factory === "function" ? factory : null;
}

function resolveSpeechRecognitionConstructor() {
  if (speechRecognitionFactoryOverride) return speechRecognitionFactoryOverride;
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// この環境でSpeechRecognitionが「存在するか」。存在しても実際に動くとは限らない
// （権限拒否・ネットワーク無し・standalone固有の無反応等）ため、開始前のマイクテストで実際に1回試す。
export function isSpeechRecognitionSupported() {
  return resolveSpeechRecognitionConstructor() !== null;
}

export function isMicrophoneApiSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

// ホーム画面に追加したPWA（standalone）として動いているか。iOSは navigator.standalone、
// それ以外は display-mode メディアクエリで判定する。
export function isStandalonePwa() {
  if (typeof window === "undefined") return false;
  if (navigator.standalone === true) return true;
  try {
    return window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  } catch {
    return false;
  }
}

// 環境の要約（診断表示・開始前チェックの文言に使う）。
export function describeVoiceEnvironment() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  return {
    hasSpeechRecognition: isSpeechRecognitionSupported(),
    usesWebkitPrefix: typeof window !== "undefined" && !window.SpeechRecognition && Boolean(window.webkitSpeechRecognition),
    hasMicrophoneApi: isMicrophoneApiSupported(),
    isSecureContext: typeof window !== "undefined" ? window.isSecureContext === true : false,
    isStandalone: isStandalonePwa(),
    isIos,
  };
}

let markedUnavailable = false;
let unavailableReason = null;

// 試合中にAPIが継続不能になったとき、以降の回答を人間判定へ固定するためのフラグ。
export function markVoiceRecognitionUnavailable(reason = "unknown") {
  markedUnavailable = true;
  unavailableReason = reason;
  pushDiagnostic("unavailable", reason);
}
export function resetVoiceRecognitionAvailability() {
  markedUnavailable = false;
  unavailableReason = null;
}
export function isVoiceRecognitionAvailable() {
  return isSpeechRecognitionSupported() && !markedUnavailable;
}
export function getVoiceUnavailableReason() {
  return unavailableReason;
}

// マイクが開くのを待つ時間として、回答時間の起点をずらしてよい上限（回答権から）。これを超えて開かない場合は
// 起点をここで打ち切る（「マイクが開かないと永遠に締切が来ない」を防ぐ。start-timeout の猶予 2.5 秒より少し短い）。
export const PARTY_VOICE_READY_SHIFT_CAP_MS = 1500;

// 回答の締切時刻を求める純粋関数。
//   claimedAtMs: 回答権を取った時刻（有効な pointerup）、speechStartedAtMs: 発話開始を検出した時刻（未検出はnull）
//   readyAtMs: 【第6回】認識器が実際に音を受け取れる状態になった時刻（onstart／onaudiostart。未検出はnull）
//   startTimeoutSec: 話し始めるまでの制限秒数
// 「話し始めるまで」の締切は、以前は claimedAt 起点だった（マイクの初期化に時間がかかると、その分だけ実質の回答時間が
// 削られていた）。第6回から、認識器が ready になった時刻（ただし claimedAt＋1.5秒を上限）を起点にする。ready が
// まだ来ていない間は従来どおり claimedAt を起点にし、ready が来た時点で締切を後ろへ延ばす（残り時間が減る方向には
// 動かない。ready が一度も来なければ従来と同じ締切＝無限に延びない）。
// 発話が始まっていれば「発話開始＋最大待ち時間」（ただし制限時間ぎりぎりに話し始めた場合も有効にするため、両者の大きい方）。
export function computeVoiceDeadline({ claimedAtMs, speechStartedAtMs, startTimeoutSec, readyAtMs = null, maxSpeechMs = PARTY_VOICE_MAX_SPEECH_MS, readyShiftCapMs = PARTY_VOICE_READY_SHIFT_CAP_MS }) {
  const shiftCap = claimedAtMs + readyShiftCapMs;
  const onsetOrigin = typeof readyAtMs === "number" ? Math.min(Math.max(readyAtMs, claimedAtMs), shiftCap) : claimedAtMs;
  const onsetDeadline = onsetOrigin + startTimeoutSec * 1000;
  if (typeof speechStartedAtMs !== "number") return onsetDeadline;
  return Math.max(onsetDeadline, speechStartedAtMs + maxSpeechMs);
}

// 音声認識セッションの段階（画面表示・診断に使う）。
export const VOICE_STAGE = {
  STARTING: "starting", // start() を呼んだ直後（まだ何のイベントも来ていない）
  LISTENING: "listening", // onstart／onaudiostart が来た（マイクが開いた）
  HEARING: "hearing", // 音／発話を検出した
  RESULT: "result", // 途中結果または最終結果を受け取った
  ENDED: "ended",
};

// 1回分の音声認識セッションを開始する。
//   onTranscripts(transcripts: string[], isFinal, candidates): 途中結果・最終結果（transcripts は信頼度順の候補配列、
//       candidates はこのセッションで得た全候補の履歴 { transcript, isFinal, rank, confidence, source, sequence, atMs }）
//   onSpeechStart(): 発話（音）を検出した
//   onReady(): 認識器が実際に音を受け取れる状態になった（onstart／onaudiostart のどちらか早い方。1回だけ）
//   onStage(stage, detail): 段階が進んだ（画面の状態表示用）
//   onEnd(reason): "final" | "no-final"（途中結果のみ）| "no-speech" | "aborted" | "unsupported" |
//                  "start-timeout"（start後に何も起きない）| "error:<code>"（一度だけ呼ぶ）
// 戻り値: { id, abort(), getCandidates(), getTimeline() } （締切や画面離脱で強制終了する）。
// APIが無い環境では即座にonEnd("unsupported")を呼ぶ。
// 【呼び出し条件】iOSでは start() をユーザー操作（pointerdown／pointerup／click）の同期処理内で呼ぶ必要があるため、
// この関数は同期的に start() まで進める（await を挟まない）。
export function startVoiceRecognitionSession({ lang = "ja-JP", origin = "claim", onTranscripts, onSpeechStart, onReady, onStage, onEnd }) {
  const Recognition = resolveSpeechRecognitionConstructor();
  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const startedAtMs = nowMs();
  const log = { id: ++sessionSequence, startedAtMs, origin, events: [], candidates: [], judgement: null };
  sessionLogs.push(log);
  if (sessionLogs.length > MAX_SESSION_LOGS) sessionLogs.shift();
  const mark = (name, detail = "") => {
    log.events.push({ name, dtMs: Math.round(nowMs() - startedAtMs), detail: String(detail ?? "") });
    pushDiagnostic(name, detail);
  };
  let ended = false;
  let graceTimerId = null;
  const finish = (reason) => {
    if (ended) return;
    ended = true;
    if (graceTimerId !== null) clearTimeout(graceTimerId);
    mark("end", reason);
    onStage?.(VOICE_STAGE.ENDED, reason);
    onEnd?.(reason);
  };
  const handle = {
    id: log.id,
    getCandidates: () => log.candidates.map((candidate) => ({ ...candidate })),
    getTimeline: () => log.events.map((event) => ({ ...event })),
    abort() {},
  };
  if (!Recognition || markedUnavailable) {
    mark("unsupported", markedUnavailable ? `marked:${unavailableReason}` : "no SpeechRecognition constructor");
    finish("unsupported");
    return handle;
  }
  let recognition;
  try {
    recognition = new Recognition();
  } catch (error) {
    mark("construct-error", error?.message ?? error);
    finish("error:construct");
    return handle;
  }
  recognition.lang = lang;
  // 途中結果も受け取る（最終結果が崩れても、安定した途中結果を証拠として使う）。代替候補は最大5件まで要求する
  // （返す数はブラウザ次第。iOS は1件のことが多い）。
  recognition.interimResults = true;
  recognition.maxAlternatives = 5;
  recognition.continuous = false;
  let gotFinal = false;
  let sawSpeech = false;
  let sawStart = false;
  let sawReady = false;
  let latestTranscripts = [];
  let resultSequence = 0;

  const noteStart = (eventName) => {
    if (!sawStart) {
      sawStart = true;
      if (graceTimerId !== null) clearTimeout(graceTimerId);
      graceTimerId = null;
      onStage?.(VOICE_STAGE.LISTENING, eventName);
    }
    mark(eventName);
    // onstart／onaudiostart のどちらか早い方＝「実際に音を受け取れる状態」。回答時間の起点に使う
    if (!sawReady && (eventName === "onstart" || eventName === "onaudiostart")) {
      sawReady = true;
      mark("ready", eventName);
      onReady?.();
    }
  };
  const noteSpeech = (eventName) => {
    mark(eventName);
    if (!sawSpeech) {
      sawSpeech = true;
      onStage?.(VOICE_STAGE.HEARING, eventName);
      onSpeechStart?.();
    }
  };

  recognition.onstart = () => noteStart("onstart");
  recognition.onaudiostart = () => noteStart("onaudiostart");
  recognition.onsoundstart = () => noteSpeech("onsoundstart");
  recognition.onspeechstart = () => noteSpeech("onspeechstart");
  recognition.onspeechend = () => mark("onspeechend");
  recognition.onsoundend = () => mark("onsoundend");
  recognition.onaudioend = () => mark("onaudioend");
  recognition.onnomatch = () => mark("onnomatch");
  recognition.onresult = (event) => {
    const transcripts = [];
    let isFinal = false;
    resultSequence += 1;
    const atMs = Math.round(nowMs() - startedAtMs);
    const results = event?.results ?? [];
    const startIndex = Number.isInteger(event?.resultIndex) ? event.resultIndex : 0;
    for (let i = startIndex; i < results.length; i++) {
      const result = results[i];
      if (!result) continue;
      if (result.isFinal) isFinal = true;
      const alternativeCount = typeof result.length === "number" ? result.length : 0;
      for (let j = 0; j < alternativeCount; j++) {
        const alternative = result[j];
        const text = alternative?.transcript;
        if (typeof text !== "string" || !text.trim()) continue;
        transcripts.push(text.trim());
        // 候補履歴：同じ文字列・同じ final/interim の重複は「最新の情報」で上書き（順序は最初に出た位置のまま）
        const candidate = {
          transcript: text.trim(),
          isFinal: Boolean(result.isFinal),
          rank: j,
          confidence: typeof alternative?.confidence === "number" && Number.isFinite(alternative.confidence) ? alternative.confidence : null,
          source: result.isFinal ? (j === 0 ? "final" : "alternative") : "interim",
          sequence: resultSequence,
          atMs,
        };
        const existingIndex = log.candidates.findIndex((entry) => entry.transcript === candidate.transcript && entry.isFinal === candidate.isFinal);
        if (existingIndex >= 0) log.candidates[existingIndex] = { ...log.candidates[existingIndex], ...candidate };
        else log.candidates.push(candidate);
      }
    }
    mark("onresult", `${isFinal ? "final" : "interim"}: ${transcripts.join(" / ")}`);
    if (!sawStart) noteStart("onresult");
    if (transcripts.length > 0 && !sawSpeech) noteSpeech("onresult");
    if (transcripts.length > 0) {
      latestTranscripts = transcripts;
      onStage?.(VOICE_STAGE.RESULT, transcripts[0]);
      onTranscripts?.(transcripts, isFinal, handle.getCandidates());
    }
    if (isFinal) {
      gotFinal = true;
      finish("final");
    }
  };
  recognition.onerror = (event) => {
    const code = event?.error;
    mark("onerror", `${code ?? "unknown"} ${event?.message ?? ""}`);
    if (code === "no-speech") {
      finish("no-speech");
      return;
    }
    if (code === "aborted") {
      finish("aborted");
      return;
    }
    // not-allowed（権限拒否）・network・audio-capture・service-not-allowed 等は「使えない」扱い
    finish(`error:${code ?? "unknown"}`);
  };
  recognition.onend = () => {
    mark("onend", `final=${gotFinal} speech=${sawSpeech} interim=${latestTranscripts.length}`);
    // 途中結果しか来ないまま終わった場合は "no-final"（呼び出し側はその途中結果で判定する）
    finish(gotFinal ? "final" : latestTranscripts.length > 0 ? "no-final" : sawSpeech ? "no-speech" : sawStart ? "no-speech" : "no-start");
  };
  try {
    mark("start()", `lang=${lang} origin=${origin}`);
    onStage?.(VOICE_STAGE.STARTING);
    recognition.start();
  } catch (error) {
    mark("start-exception", error?.message ?? error);
    finish("error:start");
    return handle;
  }
  // start() 後に onstart／onaudiostart／onresult／onerror／onend のどれも来ない（iOS standalone で報告される
  // 「無反応」）場合は、猶予後に開始失敗として打ち切る。
  graceTimerId = setTimeout(() => {
    if (ended || sawStart) return;
    mark("start-timeout", `${PARTY_VOICE_START_GRACE_MS}ms no events`);
    finish("start-timeout");
    try {
      recognition.abort();
    } catch {
      /* 無視 */
    }
  }, PARTY_VOICE_START_GRACE_MS);
  handle.abort = () => {
    // 先に "aborted" で終了扱いにしてから abort() を呼ぶ（abort() が同期的に onend を起こす実装でも理由が "aborted" になる）
    finish("aborted");
    try {
      recognition.abort();
    } catch {
      /* 既に終了している場合は無視 */
    }
  };
  return handle;
}

// 終了理由が「認識APIそのものが使えない」ことを意味するか（試合中は以降を人間判定に固定する）。
export function isVoiceFatalEndReason(reason) {
  if (typeof reason !== "string") return false;
  if (reason === "unsupported" || reason === "start-timeout" || reason === "no-start") return true;
  return reason.startsWith("error:");
}

// マイク権限を、明確なユーザー操作（ボタン）から要求する。開始前チェック専用。
// 戻り値: { ok, reason }（reason: "unsupported" | "not-allowed" | "not-found" | "error:<name>"）。
// 取得したストリームはすぐ停止する（認識自体はSpeechRecognitionがマイクを開く）。
export async function requestMicrophonePermission() {
  if (!isMicrophoneApiSupported()) {
    pushDiagnostic("mic", "getUserMedia unsupported");
    return { ok: false, reason: "unsupported" };
  }
  try {
    pushDiagnostic("mic", "getUserMedia request");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    pushDiagnostic("mic", "granted");
    return { ok: true, reason: null };
  } catch (error) {
    const name = error?.name ?? "unknown";
    pushDiagnostic("mic", `error ${name}`);
    if (name === "NotAllowedError" || name === "SecurityError") return { ok: false, reason: "not-allowed" };
    if (name === "NotFoundError" || name === "OverconstrainedError") return { ok: false, reason: "not-found" };
    return { ok: false, reason: `error:${name}` };
  }
}

// 開始前チェック用のマイク／音声認識テスト。段階ごとの結果を返す。
//   1) マイクAPI／権限（requestMicrophonePermission）
//   2) SpeechRecognition の有無
//   3) start() が受理され、マイクが開いた（onstart／onaudiostart）
//   4) 音／発話を検出した
//   5) transcript を取得した
// 戻り値: { ok, stage, transcripts, reason, mic: { ok, reason }, environment }
//   stage: 到達した最終段階（"mic" | "api" | "start" | "hearing" | "result"）
// 【注意】マイク権限の要求と start() は、どちらもユーザー操作直後に呼ぶ必要がある。getUserMedia は
// await を挟むため、その後の start() はユーザー操作の同期処理外になる。iOSでは start() にユーザー操作が
// 必要な場合があるため、requireGesture=true のときは getUserMedia を省略して start() を同期的に呼ぶ。
export function runVoiceRecognitionTest({ timeoutMs = 7000, skipMicRequest = false } = {}) {
  return new Promise((resolve) => {
    const environment = describeVoiceEnvironment();
    pushDiagnostic("test", `standalone=${environment.isStandalone} ios=${environment.isIos} webkit=${environment.usesWebkitPrefix}`);
    const proceed = (mic) => {
      if (!isSpeechRecognitionSupported()) {
        resolve({ ok: false, stage: "api", transcripts: [], reason: "unsupported", mic, environment });
        return;
      }
      let latest = [];
      let stage = "start";
      let settled = false;
      let timerId = null;
      const settle = (ok, reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timerId);
        resolve({ ok, stage, transcripts: latest, reason, mic, environment });
      };
      const session = startVoiceRecognitionSession({
        onStage: (nextStage) => {
          if (nextStage === VOICE_STAGE.LISTENING) stage = "listening";
          else if (nextStage === VOICE_STAGE.HEARING) stage = "hearing";
          else if (nextStage === VOICE_STAGE.RESULT) stage = "result";
        },
        onTranscripts: (transcripts) => {
          latest = transcripts;
        },
        onEnd: (reason) => {
          settle(latest.length > 0, reason);
        },
      });
      timerId = setTimeout(() => {
        session.abort();
        settle(latest.length > 0, "timeout");
      }, timeoutMs);
    };
    if (skipMicRequest) {
      proceed({ ok: null, reason: "skipped" });
      return;
    }
    requestMicrophonePermission().then((mic) => {
      if (!mic.ok && mic.reason !== "unsupported") {
        resolve({ ok: false, stage: "mic", transcripts: [], reason: mic.reason, mic, environment });
        return;
      }
      proceed(mic);
    });
  });
}
