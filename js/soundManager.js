// ＝LOVEイントロクイズ 全体の効果音システム（2026-08-10新設）。
//
// 【方針】外部の音声ファイルを一切使わず、Web Audio API（ブラウザ標準の音声合成の仕組み）で
// その場で音を組み立てる。理由は3つ：①著作権のある音源を探さずに済む、②GitHubへ音声素材を
// 置かずに済む、③周波数・長さ・音量をコード側の数値だけで後から調整できる。
//
// 【呼び出し側のルール】呼び出し側は必ず playSfx(SFX_EVENTS.xxx) の形で「何が起きたか」だけを
// 伝える。「今どのテーマが選ばれているか」で音がどう変わるかは、このファイルの中の
// SOUND_DEFINITIONS だけが知っていればよく、呼び出し側でテーマ分岐を書かない
// （本人指示）。旧js/sfx.js（クリック/正解/不正解/カウントアップ音）は、このファイルへの
// 薄いラッパーとして残しており、既存の100箇所以上の呼び出し元は書き換えていない。

import { recordAudioDiagnostic } from "./audioDiagnosticLog.js";

// ===== イベント・テーマの定義 =====

export const SFX_EVENTS = {
  UI_CLICK: "uiClick",
  UI_BACK: "uiBack",
  UI_CONFIRM: "uiConfirm",
  QUIZ_CORRECT: "quizCorrect",
  QUIZ_WRONG: "quizWrong",
  COUNTDOWN_TICK: "countdownTick",
  COUNTDOWN_FINAL: "countdownFinal",
  GAME_START: "gameStart",
  RESULT_GOOD: "resultGood",
  RESULT_GREAT: "resultGreat",
  RESULT_PERFECT: "resultPerfect",
  BATTLE_WIN: "battleWin",
  BATTLE_LOSE: "battleLose",
  ACHIEVEMENT_UNLOCK: "achievementUnlock",
  STEAL_SUCCESS: "stealSuccess",
};

// 「操作音」「クイズ・対戦音」どちらのON/OFFで制御するかの対応表（本人指示：分離できるように）。
const UI_EVENT_SET = new Set([SFX_EVENTS.UI_CLICK, SFX_EVENTS.UI_BACK, SFX_EVENTS.UI_CONFIRM]);

export const SFX_THEMES = { SPARKLE: "sparkle", LIVE: "live", CLASSIC: "classic" };

export const SFX_THEME_INFO = [
  { id: SFX_THEMES.SPARKLE, name: "Sparkle Pop", description: "明るくかわいい、テンポの良いキラキラサウンド" },
  { id: SFX_THEMES.LIVE, name: "Live Stage", description: "ライブ会場のような、派手で盛り上がるサウンド" },
  { id: SFX_THEMES.CLASSIC, name: "Quiz Classic", description: "テレビのクイズ番組のような、分かりやすい王道サウンド" },
];

// 【2026-09-26新設・本人指示：サウンドシステム全面整備3章】詳細設定で「音ごとに」個別変更
// できるイベント（本人指示：「普通のUIクリック音まで1ボタンずつ設定する必要はない。
// UI操作音についてはテーマ側で統一された共通音を使用してよい」）。UI_EVENT_SETの補集合＝
// 「クイズ・対戦」ON/OFFの対象と完全に一致する（新しい分類を増やさず、既存の
// ui/game区分をそのまま流用する）。表示名はここに集約し、詳細設定画面（
// js/soundSettingsScreen.js）はこの配列を見て行を組み立てるだけにする。
export const CUSTOMIZABLE_SFX_EVENT_INFO = [
  { id: SFX_EVENTS.QUIZ_CORRECT, label: "正解" },
  { id: SFX_EVENTS.QUIZ_WRONG, label: "不正解" },
  { id: SFX_EVENTS.GAME_START, label: "ゲーム／対戦開始" },
  { id: SFX_EVENTS.COUNTDOWN_TICK, label: "カウントダウン（秒読み）" },
  { id: SFX_EVENTS.COUNTDOWN_FINAL, label: "カウントダウン（スタート）" },
  { id: SFX_EVENTS.RESULT_GOOD, label: "結果（ふつう）" },
  { id: SFX_EVENTS.RESULT_GREAT, label: "結果（すごい）" },
  { id: SFX_EVENTS.RESULT_PERFECT, label: "結果（パーフェクト）" },
  { id: SFX_EVENTS.BATTLE_WIN, label: "対戦：勝利" },
  { id: SFX_EVENTS.BATTLE_LOSE, label: "対戦：敗北" },
  { id: SFX_EVENTS.ACHIEVEMENT_UNLOCK, label: "称号獲得" },
  { id: SFX_EVENTS.STEAL_SUCCESS, label: "早押し成功" },
];
const CUSTOMIZABLE_SFX_EVENT_IDS = new Set(CUSTOMIZABLE_SFX_EVENT_INFO.map((info) => info.id));

const DEFAULT_THEME = SFX_THEMES.SPARKLE;
const DEFAULT_VOLUME_PERCENT = 70;

// ===== 設定の保存・読み込み（localStorage、端末共通。プレイヤーごとではない） =====
//
// 【後方互換】以前から存在するequalLoveIntroQuiz.sfxEnabled（マスターON/OFF）は
// キー名も意味もそのまま引き継ぐ。ui/game/theme/volumeは今回新設のため、保存が無ければ
// 既定値（true/true/Sparkle/70%）にする。「旧OFFだったユーザーが、更新後に勝手に
// ONへ戻る」ことは無い（masterは既存の値をそのまま読むだけで、新しい移行処理を挟まない）。
const STORAGE_KEYS = {
  master: "equalLoveIntroQuiz.sfxEnabled",
  ui: "equalLoveIntroQuiz.sfxUiEnabled",
  game: "equalLoveIntroQuiz.sfxGameEnabled",
  theme: "equalLoveIntroQuiz.sfxTheme",
  volume: "equalLoveIntroQuiz.sfxVolume",
  // 【2026-09-26新設・本人指示：サウンドシステム全面整備3章】イベントごとのテーマ上書き
  // （例：テーマ全体はSparkle Popのままだが、正解音だけLive Stageのものを使う）。
  // 古いバージョンにはこのキー自体が存在しないため、読み込み時に無ければ「上書きなし」
  // （＝すべてテーマに従う）として扱う。既存ユーザーの設定を壊さない後方互換。
  eventOverrides: "equalLoveIntroQuiz.sfxEventThemeOverrides",
};

function readBoolean(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored === "true";
  } catch {
    return defaultValue;
  }
}

function writeBoolean(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 保存できなくても、その場の切り替え自体は反映され続ける
  }
}

function clampVolumePercent(value) {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME_PERCENT;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.theme);
    return Object.values(SFX_THEMES).includes(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function readVolumePercent() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.volume);
    if (stored === null) return DEFAULT_VOLUME_PERCENT;
    return clampVolumePercent(Number(stored));
  } catch {
    return DEFAULT_VOLUME_PERCENT;
  }
}

// 【2026-09-26新設】{ [eventId]: themeId } の形。CUSTOMIZABLE_SFX_EVENT_IDSに含まれない
// キーや、存在しないテーマIDが万一保存されていても、安全に無視する（壊れた保存データへの
// 耐性、他の設定読み込み関数と同じ方針）。
function readEventOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.eventOverrides);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result = {};
    for (const [eventId, themeId] of Object.entries(parsed)) {
      if (CUSTOMIZABLE_SFX_EVENT_IDS.has(eventId) && Object.values(SFX_THEMES).includes(themeId)) {
        result[eventId] = themeId;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeEventOverrides(overrides) {
  try {
    localStorage.setItem(STORAGE_KEYS.eventOverrides, JSON.stringify(overrides));
  } catch {
    // 保存できなくても、その場の切り替え自体は反映され続ける
  }
}

let sfxMasterEnabled = readBoolean(STORAGE_KEYS.master, true);
let sfxUiEnabled = readBoolean(STORAGE_KEYS.ui, true);
let sfxGameEnabled = readBoolean(STORAGE_KEYS.game, true);
let sfxTheme = readTheme();
let sfxVolumePercent = readVolumePercent();
let sfxEventOverrides = readEventOverrides();

export function getSfxSettings() {
  return {
    masterEnabled: sfxMasterEnabled,
    uiEnabled: sfxUiEnabled,
    gameEnabled: sfxGameEnabled,
    theme: sfxTheme,
    volumePercent: sfxVolumePercent,
  };
}

// このイベントに、テーマ全体とは別の個別上書きが設定されていればそのテーマIDを、
// 無ければnull（＝現在のテーマに従う）を返す。
export function getEventThemeOverride(eventId) {
  return sfxEventOverrides[eventId] ?? null;
}

// 実際にこのイベントを鳴らすときに使われるテーマID（上書きがあればそれ、無ければ
// 現在のテーマ）。詳細設定画面のプレビュー・「カスタム」バッジ判定の両方に使う。
export function getEffectiveThemeForEvent(eventId) {
  return sfxEventOverrides[eventId] ?? sfxTheme;
}

// themeIdにnullを渡すと上書きを解除する（＝テーマに従う状態へ戻す）。
export function setEventThemeOverride(eventId, themeId) {
  if (!CUSTOMIZABLE_SFX_EVENT_IDS.has(eventId)) return;
  const next = { ...sfxEventOverrides };
  if (themeId === null || !Object.values(SFX_THEMES).includes(themeId)) {
    delete next[eventId];
  } else {
    next[eventId] = themeId;
  }
  sfxEventOverrides = next;
  writeEventOverrides(sfxEventOverrides);
}

// 1件でも個別上書きがあるか（詳細設定の「カスタム」バッジ・テーマ変更時の確認ダイアログの
// 要否判定に使う）。
export function hasAnyEventThemeOverrides() {
  return Object.keys(sfxEventOverrides).length > 0;
}

// 【本人指示14：テーマ変更時に個別カスタムが知らないうちに消えないように】テーマそのものを
// 切り替える操作からだけ呼ぶ想定（呼び出し側が事前に確認ダイアログを出す）。
export function clearAllEventThemeOverrides() {
  sfxEventOverrides = {};
  writeEventOverrides(sfxEventOverrides);
}

export function setSfxMasterEnabled(enabled) {
  sfxMasterEnabled = !!enabled;
  writeBoolean(STORAGE_KEYS.master, sfxMasterEnabled);
}
export function toggleSfxMasterEnabled() {
  setSfxMasterEnabled(!sfxMasterEnabled);
  return sfxMasterEnabled;
}
export function setSfxUiEnabled(enabled) {
  sfxUiEnabled = !!enabled;
  writeBoolean(STORAGE_KEYS.ui, sfxUiEnabled);
}
export function setSfxGameEnabled(enabled) {
  sfxGameEnabled = !!enabled;
  writeBoolean(STORAGE_KEYS.game, sfxGameEnabled);
}
export function setSfxTheme(themeId) {
  sfxTheme = Object.values(SFX_THEMES).includes(themeId) ? themeId : DEFAULT_THEME;
  try {
    localStorage.setItem(STORAGE_KEYS.theme, sfxTheme);
  } catch {
    // 保存できなくても、その場の切り替え自体は反映され続ける
  }
}
export function setSfxVolumePercent(percent) {
  sfxVolumePercent = clampVolumePercent(percent);
  try {
    localStorage.setItem(STORAGE_KEYS.volume, String(sfxVolumePercent));
  } catch {
    // 保存できなくても、その場の切り替え自体は反映され続ける
  }
}

// ===== AudioContext（アプリ全体で1つだけ使い回す） =====
//
// クリックのたびにnew AudioContext()しない（本人指示）。初めて音を鳴らすとき
// （＝必ずユーザー操作の中）に1回だけ作り、以後は使い回す。iOS Safari/PWAでは
// 自動再生制限によりsuspended状態になることがあるため、鳴らす直前に毎回resume()を試みる
// （resume()自体はuser gesture外でも呼べるが、実際にrunningへ遷移できるのはuser gesture
// 由来の呼び出しのときだけ、というのがブラウザの仕様。効果音は常にクリック等の操作の中から
// 呼ばれるため、この構造で安全に復帰できる）。
let audioContext = null;

// 【2026-09-23新設・2026-09-24結論確定：本人指示】新規プレイのたびに第1問だけ無音に
// なる問題の調査時、「効果音用のAudioContextと曲再生用の<audio>要素がiOSの音声出力を
// 共有し干渉しているのでは」という仮説を検証するため追加した。実際の根本原因は
// js/audio.js側のunlock用データURIの不備（HANDOFF.md 76章参照）であり、この仮説は
// 外れたと判明したが、AudioContextの生成・resume()はそれ自体が稀にしか起きない
// 低頻度のイベントで、記録を残しておいても実害が無いため、今後また別の音源トラブルが
// 起きた際の切り分け材料として記録は残してある（js/audioDiagnosticLog.js、
// js/audio.jsの再生記録と同じ共有タイムラインに載る）。この記録自体はaudioContext
// 自体の挙動を一切変えない（読み取り・記録のみ）。
function getAudioContext() {
  if (audioContext === null) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null; // 対応していない環境ではnullを返し、以降は何もしない
    audioContext = new AudioContextCtor();
    recordAudioDiagnostic("[AUDIO_CONTEXT] 新規作成", { state: audioContext.state });
  }
  if (audioContext.state === "suspended") {
    recordAudioDiagnostic("[AUDIO_CONTEXT] resume()呼び出し開始", { stateBefore: audioContext.state });
    audioContext
      .resume()
      .then(() => {
        recordAudioDiagnostic("[AUDIO_CONTEXT] resume()成功", { stateAfter: audioContext.state });
      })
      .catch((error) => {
        recordAudioDiagnostic("[AUDIO_CONTEXT] resume()失敗", { name: error?.name, message: error?.message });
      });
  }
  return audioContext;
}

// 【2026-09-13新設・本人指示：一瞬バトルで実機再生失敗が再発（原因調査）】上のコメントの
// 前提（「効果音は常にクリック等の操作の中から呼ばれる」）は、js/localReplayCountdown.jsの
// 3→2→1カウントダウンのビープ音には当てはまらない（setTimeoutから呼ばれるため）。
// タブ・PWAを裏に回して戻ってきた際にAudioContextがsuspendedのままになっていた場合、
// カウントダウンのビープ音だけが鳴らなくなる可能性があるため、js/audio.jsの
// 曲再生unlockと同じ「画面へ戻ってきたタイミング」で復帰を試みる。まだ一度も音を
// 鳴らしていない（audioContextがnullの）場合は、ここで新規作成はしない
// （本人指示どおり「クリックのたびにnew AudioContext()しない」の趣旨を維持し、
// 未使用の環境で不要な警告を出さないため）。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && audioContext !== null) {
    getAudioContext();
  }
});

// ===== 音の合成に使う小さな部品 =====

// 読みやすさのための音名→周波数（第3〜6オクターブぶんだけ、今回使う範囲のみ）。
const NOTE_FREQ = {
  A3: 220.0,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
};

function resolveFreq(freq) {
  return typeof freq === "string" ? (NOTE_FREQ[freq] ?? 440) : freq;
}

// 1音（オシレーター）を鳴らす。endFreqを指定すると、開始から終了まで周波数を
// 直線的に変化させる（「上昇スイープ」「下降スイープ」に使う）。
// 音量は指数的に0近くまで落とすことで、電子音特有の「プツッ」という音切れを防ぐ。
function scheduleTone(context, startTime, { freq, endFreq, type = "sine", durationSec, gain, detuneCents = 0 }) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  const startFreqValue = resolveFreq(freq);
  oscillator.frequency.setValueAtTime(startFreqValue, startTime);
  if (endFreq !== undefined) {
    oscillator.frequency.linearRampToValueAtTime(resolveFreq(endFreq), startTime + durationSec);
  }
  if (detuneCents) oscillator.detune.value = detuneCents;

  const gainNode = context.createGain();
  const safeGain = Math.max(gain, 0.0001);
  gainNode.gain.setValueAtTime(safeGain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + durationSec);
  // 本人指示：Oscillatorは終了後disconnectし、連打してもノードが残留しないようにする。
  oscillator.addEventListener("ended", () => {
    oscillator.disconnect();
    gainNode.disconnect();
  });
}

// 短いノイズバースト（「カチッ」「ブブー」のような、音程がはっきりしない音に使う）。
// BiquadFilterで帯域を絞ることで、単なるホワイトノイズではなく楽器的な質感にする。
function scheduleNoiseBurst(context, startTime, { durationSec, gain, filterFreq = 1200, filterType = "bandpass" }) {
  const bufferSize = Math.max(1, Math.floor(context.sampleRate * durationSec));
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = context.createBufferSource();
  source.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;

  const gainNode = context.createGain();
  const safeGain = Math.max(gain, 0.0001);
  gainNode.gain.setValueAtTime(safeGain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(context.destination);

  source.start(startTime);
  source.stop(startTime + durationSec);
  source.addEventListener("ended", () => {
    source.disconnect();
    filter.disconnect();
    gainNode.disconnect();
  });
}

// 1件の効果音定義（notes配列・省略可のnoise）を、指定した音量スケール（0〜1）で鳴らす。
function renderSoundDescriptor(context, descriptor, volumeScale) {
  const startTime = context.currentTime;
  (descriptor.notes ?? []).forEach((note) => {
    scheduleTone(context, startTime + (note.startSec ?? 0), {
      freq: note.freq,
      endFreq: note.endFreq,
      type: note.type ?? "sine",
      durationSec: note.durationSec,
      gain: note.gain * volumeScale,
      detuneCents: note.detuneCents,
    });
  });
  if (descriptor.noise) {
    scheduleNoiseBurst(context, startTime + (descriptor.noise.startSec ?? 0), {
      durationSec: descriptor.noise.durationSec,
      gain: descriptor.noise.gain * volumeScale,
      filterFreq: descriptor.noise.filterFreq,
      filterType: descriptor.noise.filterType,
    });
  }
}

// ===== テーマ別の音の定義（データ）=====
//
// 各イベント・各テーマの「note」のgainは、100%音量のときにそのまま使われる絶対Gain値
// （0〜1）。ここに、イベントごとの相対的な大きさ・楽曲音源との共存を考えた上限を
// あらかじめ織り込んである（本人指示：不正解ブザーだけ突然爆音にならないように・
// 楽曲と同時に鳴っても効果音だけ爆音にならないように）。マスター音量スライダー（0〜100%）は
// この値に対する掛け算として最後にかかる。
const N = (freq, startSec, durationSec, gain, extra = {}) => ({ freq, startSec, durationSec, gain, ...extra });

const SOUND_DEFINITIONS = {
  [SFX_EVENTS.UI_CLICK]: {
    [SFX_THEMES.SPARKLE]: { notes: [N("A5", 0, 0.05, 0.09, { type: "sine" })] },
    [SFX_THEMES.LIVE]: { noise: { startSec: 0, durationSec: 0.03, gain: 0.16, filterFreq: 3200, filterType: "bandpass" } },
    [SFX_THEMES.CLASSIC]: { noise: { startSec: 0, durationSec: 0.035, gain: 0.13, filterFreq: 2000, filterType: "highpass" } },
  },
  [SFX_EVENTS.UI_BACK]: {
    [SFX_THEMES.SPARKLE]: { notes: [N("E5", 0, 0.08, 0.08, { type: "sine", endFreq: "C5" })] },
    [SFX_THEMES.LIVE]: { notes: [N(500, 0, 0.06, 0.11, { type: "square" })] },
    [SFX_THEMES.CLASSIC]: { notes: [N(700, 0, 0.08, 0.09, { type: "triangle", endFreq: 500 })] },
  },
  [SFX_EVENTS.UI_CONFIRM]: {
    [SFX_THEMES.SPARKLE]: {
      notes: [N("C5", 0, 0.06, 0.1, { type: "sine" }), N("G5", 0.05, 0.1, 0.11, { type: "sine" })],
    },
    [SFX_THEMES.LIVE]: {
      notes: [N("A4", 0, 0.05, 0.13, { type: "square" }), N("D5", 0.04, 0.09, 0.13, { type: "square" })],
    },
    [SFX_THEMES.CLASSIC]: { notes: [N("G4", 0, 0.05, 0.1, { type: "triangle" }), N("C5", 0.05, 0.1, 0.11, { type: "triangle" })] },
  },

  [SFX_EVENTS.QUIZ_CORRECT]: {
    // Sparkle：キラッと上昇する明るいチャイム（3音）
    [SFX_THEMES.SPARKLE]: {
      notes: [
        N("C5", 0, 0.14, 0.26, { type: "sine" }),
        N("E5", 0.08, 0.16, 0.27, { type: "sine" }),
        N("G5", 0.16, 0.22, 0.28, { type: "sine" }),
      ],
    },
    // Live：ステージで決まった感じの力強い上昇（ベースを1音重ねる）
    [SFX_THEMES.LIVE]: {
      notes: [
        N("G4", 0, 0.28, 0.14, { type: "sawtooth" }),
        N("G4", 0, 0.12, 0.22, { type: "square" }),
        N("C5", 0.06, 0.14, 0.24, { type: "square" }),
        N("E5", 0.12, 0.22, 0.26, { type: "square" }),
      ],
    },
    // Classic：ピンポーンに近い、下降する2音チャイム
    [SFX_THEMES.CLASSIC]: {
      notes: [N("G5", 0, 0.18, 0.27, { type: "sine" }), N("E5", 0.15, 0.22, 0.27, { type: "sine" })],
    },
  },

  [SFX_EVENTS.QUIZ_WRONG]: {
    // Sparkle：重すぎない、柔らかい下降音
    [SFX_THEMES.SPARKLE]: { notes: [N("A4", 0, 0.22, 0.18, { type: "sine", endFreq: "E4" })] },
    // Live：短い低音ドロップ
    [SFX_THEMES.LIVE]: { notes: [N(220, 0, 0.24, 0.2, { type: "sawtooth", endFreq: 110 })] },
    // Classic：分かりやすいブザー（ブブー）
    [SFX_THEMES.CLASSIC]: { notes: [N(220, 0, 0.32, 0.22, { type: "sawtooth", endFreq: 140 })] },
  },

  [SFX_EVENTS.COUNTDOWN_TICK]: {
    [SFX_THEMES.SPARKLE]: { notes: [N("C5", 0, 0.09, 0.16, { type: "sine" })] },
    [SFX_THEMES.LIVE]: { notes: [N("C5", 0, 0.07, 0.18, { type: "square" })] },
    [SFX_THEMES.CLASSIC]: { noise: { startSec: 0, durationSec: 0.05, gain: 0.18, filterFreq: 2500, filterType: "bandpass" } },
  },
  [SFX_EVENTS.COUNTDOWN_FINAL]: {
    [SFX_THEMES.SPARKLE]: {
      notes: [N("C6", 0, 0.16, 0.22, { type: "sine" }), N("E6", 0.05, 0.2, 0.2, { type: "sine" })],
    },
    [SFX_THEMES.LIVE]: {
      notes: [N("C5", 0, 0.06, 0.2, { type: "square" }), N("C6", 0.05, 0.22, 0.24, { type: "square" })],
    },
    [SFX_THEMES.CLASSIC]: { notes: [N("C6", 0, 0.2, 0.24, { type: "triangle" })] },
  },

  [SFX_EVENTS.GAME_START]: {
    [SFX_THEMES.SPARKLE]: { notes: [N("C5", 0, 0.3, 0.16, { type: "sine", endFreq: "C6" })] },
    [SFX_THEMES.LIVE]: {
      notes: [N("A4", 0, 0.32, 0.18, { type: "sawtooth", endFreq: "A5" }), N("A4", 0, 0.1, 0.14, { type: "square" })],
    },
    [SFX_THEMES.CLASSIC]: { notes: [N("G5", 0, 0.22, 0.2, { type: "triangle" })] },
  },

  [SFX_EVENTS.RESULT_GOOD]: {
    [SFX_THEMES.SPARKLE]: { notes: [N("C5", 0, 0.12, 0.18, { type: "sine" }), N("E5", 0.09, 0.16, 0.19, { type: "sine" })] },
    [SFX_THEMES.LIVE]: { notes: [N("A4", 0, 0.12, 0.18, { type: "square" }), N("D5", 0.09, 0.16, 0.19, { type: "square" })] },
    [SFX_THEMES.CLASSIC]: { notes: [N("C5", 0, 0.12, 0.18, { type: "triangle" }), N("F5", 0.09, 0.16, 0.19, { type: "triangle" })] },
  },
  [SFX_EVENTS.RESULT_GREAT]: {
    [SFX_THEMES.SPARKLE]: {
      notes: [
        N("C5", 0, 0.12, 0.2, { type: "sine" }),
        N("E5", 0.09, 0.13, 0.21, { type: "sine" }),
        N("G5", 0.18, 0.2, 0.23, { type: "sine" }),
      ],
    },
    [SFX_THEMES.LIVE]: {
      notes: [
        N("A4", 0, 0.1, 0.2, { type: "square" }),
        N("D5", 0.08, 0.12, 0.21, { type: "square" }),
        N("A5", 0.16, 0.22, 0.23, { type: "square" }),
      ],
    },
    [SFX_THEMES.CLASSIC]: {
      notes: [N("C5", 0, 0.1, 0.2, { type: "triangle" }), N("E5", 0.08, 0.12, 0.21, { type: "triangle" }), N("G5", 0.16, 0.22, 0.23, { type: "triangle" })],
    },
  },
  [SFX_EVENTS.RESULT_PERFECT]: {
    [SFX_THEMES.SPARKLE]: {
      notes: [
        N("C5", 0, 0.1, 0.2, { type: "sine" }),
        N("E5", 0.08, 0.1, 0.22, { type: "sine" }),
        N("G5", 0.16, 0.12, 0.24, { type: "sine" }),
        N("C6", 0.26, 0.34, 0.28, { type: "sine" }),
      ],
    },
    [SFX_THEMES.LIVE]: {
      notes: [
        N("A4", 0, 0.09, 0.2, { type: "square" }),
        N("D5", 0.07, 0.09, 0.22, { type: "square" }),
        N("A5", 0.14, 0.12, 0.24, { type: "square" }),
        N("D6", 0.24, 0.34, 0.28, { type: "sawtooth" }),
        N("A4", 0.24, 0.34, 0.14, { type: "sawtooth" }),
      ],
    },
    [SFX_THEMES.CLASSIC]: {
      notes: [
        N("C5", 0, 0.1, 0.2, { type: "triangle" }),
        N("E5", 0.08, 0.1, 0.22, { type: "triangle" }),
        N("G5", 0.16, 0.12, 0.24, { type: "triangle" }),
        N("C6", 0.26, 0.32, 0.27, { type: "triangle" }),
      ],
    },
  },

  [SFX_EVENTS.BATTLE_WIN]: {
    [SFX_THEMES.SPARKLE]: {
      notes: [
        N("C5", 0, 0.1, 0.22, { type: "sine" }),
        N("E5", 0.09, 0.1, 0.23, { type: "sine" }),
        N("G5", 0.18, 0.12, 0.25, { type: "sine" }),
        N("C6", 0.28, 0.3, 0.28, { type: "sine" }),
      ],
    },
    [SFX_THEMES.LIVE]: {
      notes: [
        N("A4", 0, 0.09, 0.22, { type: "square" }),
        N("D5", 0.08, 0.1, 0.24, { type: "square" }),
        N("A5", 0.16, 0.1, 0.26, { type: "square" }),
        N("D6", 0.24, 0.3, 0.3, { type: "sawtooth" }),
        N("A4", 0.24, 0.3, 0.15, { type: "sawtooth" }),
      ],
    },
    [SFX_THEMES.CLASSIC]: {
      notes: [N("C5", 0, 0.1, 0.22, { type: "triangle" }), N("F5", 0.08, 0.1, 0.24, { type: "triangle" }), N("C6", 0.16, 0.3, 0.27, { type: "triangle" })],
    },
  },
  [SFX_EVENTS.BATTLE_LOSE]: {
    [SFX_THEMES.SPARKLE]: { notes: [N("A4", 0, 0.28, 0.16, { type: "sine", endFreq: "D4" })] },
    [SFX_THEMES.LIVE]: { notes: [N(196, 0, 0.3, 0.18, { type: "sawtooth", endFreq: 98 })] },
    [SFX_THEMES.CLASSIC]: { notes: [N("E4", 0, 0.14, 0.18, { type: "triangle" }), N("C4", 0.12, 0.2, 0.18, { type: "triangle" })] },
  },

  [SFX_EVENTS.ACHIEVEMENT_UNLOCK]: {
    [SFX_THEMES.SPARKLE]: {
      notes: [
        N("E6", 0, 0.08, 0.14, { type: "sine" }),
        N("C5", 0.06, 0.14, 0.22, { type: "sine" }),
        N("E5", 0.16, 0.14, 0.24, { type: "sine" }),
        N("G5", 0.26, 0.16, 0.26, { type: "sine" }),
        N("C6", 0.38, 0.4, 0.3, { type: "sine" }),
      ],
    },
    [SFX_THEMES.LIVE]: {
      notes: [
        N("A4", 0, 0.08, 0.2, { type: "square" }),
        N("D5", 0.07, 0.1, 0.22, { type: "square" }),
        N("A5", 0.15, 0.1, 0.24, { type: "square" }),
        N("D6", 0.25, 0.42, 0.3, { type: "sawtooth" }),
        N("A4", 0.25, 0.42, 0.16, { type: "sawtooth" }),
      ],
    },
    [SFX_THEMES.CLASSIC]: {
      notes: [
        N("C5", 0, 0.1, 0.2, { type: "triangle" }),
        N("E5", 0.08, 0.1, 0.22, { type: "triangle" }),
        N("G5", 0.16, 0.12, 0.24, { type: "triangle" }),
        N("C6", 0.26, 0.4, 0.28, { type: "triangle" }),
      ],
    },
  },

  [SFX_EVENTS.STEAL_SUCCESS]: {
    [SFX_THEMES.SPARKLE]: { notes: [N("G5", 0, 0.06, 0.2, { type: "sine" }), N("C6", 0.05, 0.14, 0.24, { type: "sine" })] },
    [SFX_THEMES.LIVE]: { notes: [N("D5", 0, 0.05, 0.2, { type: "square" }), N("A5", 0.04, 0.14, 0.25, { type: "square" })] },
    [SFX_THEMES.CLASSIC]: { notes: [N("E5", 0, 0.06, 0.2, { type: "triangle" }), N("A5", 0.05, 0.14, 0.24, { type: "triangle" })] },
  },
};

// ===== 再生の入口 =====

// 1回のプレイ・1回のクリックで、UIクリック共通音＋そのボタン専用の音が二重に鳴らないよう、
// 呼び出し側（画面側）はUI_CLICKとUI_CONFIRM/UI_BACKを同時に呼ばない設計にすること
// （このファイル自体は「呼ばれたら鳴らす」だけで、二重呼び出しの防止は呼び出し側の責務）。
export function playSfx(eventName) {
  if (!sfxMasterEnabled) return;
  const isUiEvent = UI_EVENT_SET.has(eventName);
  if (isUiEvent ? !sfxUiEnabled : !sfxGameEnabled) return;

  const context = getAudioContext();
  if (!context) return;

  const themeTable = SOUND_DEFINITIONS[eventName];
  if (!themeTable) return;
  // 【2026-09-26改訂・本人指示：サウンドシステム全面整備3章】このイベントだけ個別に
  // テーマ上書きが設定されていれば、現在のテーマではなくそちらの音を使う。
  const effectiveTheme = sfxEventOverrides[eventName] ?? sfxTheme;
  const descriptor = themeTable[effectiveTheme] ?? themeTable[DEFAULT_THEME];
  if (!descriptor) return;

  try {
    renderSoundDescriptor(context, descriptor, sfxVolumePercent / 100);
  } catch {
    // 効果音は補助的な演出のため、失敗してもゲーム進行には影響させない
  }
}

// 単発の試聴：指定イベント・指定テーマの音を1回だけ鳴らす（本人指示：明示的な試聴操作の
// ため、ON/OFF設定はバイパスしてよい。ただし音量設定は反映する）。詳細設定画面の
// 「▶」ボタン（1つのイベントだけを試聴）から使う。
export function previewSfxEvent(eventId, themeId) {
  const context = getAudioContext();
  if (!context) return;
  const table = SOUND_DEFINITIONS[eventId];
  if (!table) return;
  const validTheme = Object.values(SFX_THEMES).includes(themeId) ? themeId : DEFAULT_THEME;
  const descriptor = table[validTheme] ?? table[DEFAULT_THEME];
  if (!descriptor) return;
  try {
    renderSoundDescriptor(context, descriptor, sfxVolumePercent / 100);
  } catch {
    // 試聴に失敗しても画面側は何もしなくてよい
  }
}

// 【2026-09-26改訂・本人指示：サウンドシステム全面整備4章】テーマ選択カードの
// 「▶ テーマを試聴」用。以前は正解音を1回鳴らすだけだったが、そのテーマの雰囲気が
// 一目（一聴）で伝わるよう、操作音→正解→不正解→開始→結果の5つを短い間隔で
// 順番に鳴らす。試聴ボタンを連打・別テーマの試聴を続けて押した場合は、まだ鳴っていない
// 後続の音をキャンセルしてから新しい試聴を始める（本人指示：試聴同士が重複再生し続け
// ないように）。
const THEME_PREVIEW_SEQUENCE = [
  SFX_EVENTS.UI_CLICK,
  SFX_EVENTS.QUIZ_CORRECT,
  SFX_EVENTS.QUIZ_WRONG,
  SFX_EVENTS.GAME_START,
  SFX_EVENTS.RESULT_GREAT,
];
const THEME_PREVIEW_STEP_GAP_MS = 420;
let pendingThemePreviewTimeoutIds = [];

export function previewSfxTheme(themeId) {
  pendingThemePreviewTimeoutIds.forEach((id) => clearTimeout(id));
  pendingThemePreviewTimeoutIds = [];

  const context = getAudioContext();
  if (!context) return;
  const validTheme = Object.values(SFX_THEMES).includes(themeId) ? themeId : DEFAULT_THEME;

  THEME_PREVIEW_SEQUENCE.forEach((eventId, index) => {
    const timeoutId = setTimeout(() => {
      const table = SOUND_DEFINITIONS[eventId];
      const descriptor = table?.[validTheme] ?? table?.[DEFAULT_THEME];
      if (!descriptor) return;
      try {
        renderSoundDescriptor(context, descriptor, sfxVolumePercent / 100);
      } catch {
        // 試聴に失敗しても画面側は何もしなくてよい
      }
    }, index * THEME_PREVIEW_STEP_GAP_MS);
    pendingThemePreviewTimeoutIds.push(timeoutId);
  });
}

// 結果画面の得点カウントアップ演出用の、テーマに属さない単発スイープ音
// （js/sfx.jsのplayCountUpSound()から使う。以前からある演出をそのまま維持しつつ、
// 新しいマスター/ゲーム効果音ON-OFF・音量設定には従うようにする）。
export function playCountUpSweep() {
  if (!sfxMasterEnabled || !sfxGameEnabled) return;
  const context = getAudioContext();
  if (!context) return;
  try {
    const startTime = context.currentTime;
    scheduleTone(context, startTime, {
      freq: 440,
      endFreq: 1046.5,
      type: "sine",
      durationSec: 0.8,
      gain: 0.1 * (sfxVolumePercent / 100),
    });
  } catch {
    // 効果音は補助的な演出のため、失敗してもゲーム進行には影響させない
  }
}
