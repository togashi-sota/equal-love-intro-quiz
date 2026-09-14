// パーティー対戦（2026-09-15新設）の音声回答：Web Speech API（SpeechRecognition）のアダプター。
//
// 【位置づけ】音声認識は補助機能（本人確定）。iOS Safari／PWAやAndroid Chromeで対応状況が違い、
// 「全端末で確実」「完全オフライン」とは言えない。そのため、
//   ・対応していない端末では開始前に「4択回答がおすすめ」と案内する（isSpeechRecognitionSupported）
//   ・試合中に認識が返らない／曖昧な場合は、その回答だけ人間判定へ落とす（エンジン側）
//   ・API自体が途中で使えなくなったら「以降は人間判定で続行」（markUnavailable）
// という段階的なフォールバックを前提に、このファイルは「1回の回答の録音〜結果通知」だけを担当する。
//
// 【時間の考え方】制限時間（2/3/5/10秒）は「話し始めるまで」の時間。発話開始（speechstart／
// soundstart／途中結果）を検出したら、そこから最大PARTY_VOICE_MAX_SPEECH_MS（5秒）まで認識完了を
// 待てる。時間の計算はcomputeVoiceDeadline()として純粋関数に切り出し、テストできるようにしている。

import { PARTY_VOICE_MAX_SPEECH_MS } from "./partyBattleState.js";

function resolveSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// この環境でSpeechRecognitionが「存在するか」。存在しても実際に動くとは限らない
// （権限拒否・ネットワーク無し等）ため、開始前のマイクテストで実際に1回試すのが前提。
export function isSpeechRecognitionSupported() {
  return resolveSpeechRecognitionConstructor() !== null;
}

let markedUnavailable = false;

// 試合中にAPIが継続不能になったとき、以降の回答を人間判定へ固定するためのフラグ。
export function markVoiceRecognitionUnavailable() {
  markedUnavailable = true;
}
export function resetVoiceRecognitionAvailability() {
  markedUnavailable = false;
}
export function isVoiceRecognitionAvailable() {
  return isSpeechRecognitionSupported() && !markedUnavailable;
}

// 回答の締切時刻を求める純粋関数。
//   claimedAtMs: 回答権を取った時刻、speechStartedAtMs: 発話開始を検出した時刻（未検出はnull）
//   startTimeoutSec: 話し始めるまでの制限秒数
// 発話が始まっていなければ「claimedAt＋制限時間」、始まっていれば「発話開始＋最大待ち時間」
// （ただし制限時間ぎりぎりに話し始めた場合も有効にするため、両者の大きい方）。
export function computeVoiceDeadline({ claimedAtMs, speechStartedAtMs, startTimeoutSec, maxSpeechMs = PARTY_VOICE_MAX_SPEECH_MS }) {
  const onsetDeadline = claimedAtMs + startTimeoutSec * 1000;
  if (typeof speechStartedAtMs !== "number") return onsetDeadline;
  return Math.max(onsetDeadline, speechStartedAtMs + maxSpeechMs);
}

// 1回分の音声認識セッションを開始する。
//   onTranscripts(transcripts: string[], isFinal): 途中結果・最終結果（信頼度順の候補配列）
//   onSpeechStart(): 発話（音）を検出した
//   onEnd(reason): "final" | "no-speech" | "error" | "aborted"（一度だけ呼ぶ）
// 戻り値: { abort() } （締切や画面離脱で強制終了する）。
// APIが無い環境では即座にonEnd("unsupported")を呼ぶ。
export function startVoiceRecognitionSession({ lang = "ja-JP", onTranscripts, onSpeechStart, onEnd }) {
  const Recognition = resolveSpeechRecognitionConstructor();
  let ended = false;
  const finish = (reason) => {
    if (ended) return;
    ended = true;
    onEnd?.(reason);
  };
  if (!Recognition || markedUnavailable) {
    finish("unsupported");
    return { abort() {} };
  }
  let recognition;
  try {
    recognition = new Recognition();
  } catch {
    finish("unsupported");
    return { abort() {} };
  }
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  recognition.continuous = false;
  let gotFinal = false;
  let sawSpeech = false;

  recognition.onspeechstart = () => {
    sawSpeech = true;
    onSpeechStart?.();
  };
  recognition.onsoundstart = () => {
    sawSpeech = true;
    onSpeechStart?.();
  };
  recognition.onresult = (event) => {
    const transcripts = [];
    let isFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) isFinal = true;
      for (let j = 0; j < result.length; j++) {
        const text = result[j]?.transcript;
        if (typeof text === "string" && text.trim()) transcripts.push(text.trim());
      }
    }
    if (transcripts.length > 0 && !sawSpeech) {
      sawSpeech = true;
      onSpeechStart?.();
    }
    if (transcripts.length > 0) onTranscripts?.(transcripts, isFinal);
    if (isFinal) {
      gotFinal = true;
      finish("final");
    }
  };
  recognition.onerror = (event) => {
    const code = event?.error;
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
    finish(gotFinal ? "final" : sawSpeech ? "no-final" : "no-speech");
  };
  try {
    recognition.start();
  } catch {
    finish("error:start");
    return { abort() {} };
  }
  return {
    abort() {
      try {
        recognition.abort();
      } catch {
        /* 既に終了している場合は無視 */
      }
      finish("aborted");
    },
  };
}

// 開始前チェック用のマイク／音声認識テスト。数秒だけ認識し、結果文字列を返す。
// 戻り値: { ok: boolean, transcripts: string[], reason }
export function runVoiceRecognitionTest({ timeoutMs = 6000 } = {}) {
  return new Promise((resolve) => {
    if (!isSpeechRecognitionSupported()) {
      resolve({ ok: false, transcripts: [], reason: "unsupported" });
      return;
    }
    let latest = [];
    let settled = false;
    const settle = (ok, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      resolve({ ok, transcripts: latest, reason });
    };
    const session = startVoiceRecognitionSession({
      onTranscripts: (transcripts) => {
        latest = transcripts;
      },
      onEnd: (reason) => {
        settle(reason === "final" && latest.length > 0, reason);
      },
    });
    const timerId = setTimeout(() => {
      session.abort();
      settle(latest.length > 0, "timeout");
    }, timeoutMs);
  });
}
