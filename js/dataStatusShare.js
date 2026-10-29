// 【2026-10-29新設・本人の希望】「他の人がどれだけ音源やコールを入れているか見られるようにしたい」。
// この端末のデータの状態（js/dataStatusCheck.js の collect → summarize）から、公開プロフィール
// （publicProfiles/{uid}）に載せる「数だけ」を作り、フレンドの詳しい画面で1行の文にする。
//
// 【載せるもの】音源の曲数・全曲数、歌詞の曲数・歌詞のある曲数、コール表の曲数・そのうち使える曲数、
//   コール表（完成版データ）の書き出しの日付（YYYY-MM-DD）。
// 【載せないもの】曲名・足りない曲の一覧・歌詞やコールの本文・ハッシュ・版の番号の細部。
//   summarize の結果には曲名の一覧（missing・old・notUsable）が入っているが、ここで数だけを抜き出して捨てる。
//
// このファイルの上半分は純粋関数（テストしやすく、Firebase にも IndexedDB にも触れない）。
// 下半分は「今の数」を覚えておく小さな仕組みで、端末の読み取り（js/dataStatusCheck.js）は動的 import にしている
//（js/publicProfilePayloads.js がこのファイルを読み込んでも、テストのたびに IndexedDB を開かないため）。

export const SHARED_DATA_STATUS_VERSION = 1;
const MAX_COUNT = 999; // 曲数としてあり得ない大きな数・壊れた値を載せない／表示しない

function toCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_COUNT ? value : null;
}

// ISO の日時 → 日本の日付（YYYY-MM-DD）。読めなければ null
export function toJapanDateString(isoText) {
  if (typeof isoText !== "string" || !isoText) return null;
  const time = Date.parse(isoText);
  if (!Number.isFinite(time)) return null;
  // 9時間ずらして UTC の日付として読む（Intl のタイムゾーンに頼らず、どの端末でも同じ結果にする）
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// summarizeDeviceDataStatus() の結果 → 公開してよい数だけの形。数えられなかった項目は入れない。
// 何も数えられなかったときは null（payload に載せない）。
export function buildSharedDataStatus(summary) {
  if (!summary || typeof summary !== "object") return null;
  const status = { v: SHARED_DATA_STATUS_VERSION };
  if (summary.audio && toCount(summary.audio.have) !== null && toCount(summary.audio.total) !== null) {
    status.audio = summary.audio.have;
    status.audioTotal = summary.audio.total;
  }
  if (summary.lyrics && toCount(summary.lyrics.have) !== null && toCount(summary.lyrics.total) !== null) {
    status.lyrics = summary.lyrics.have;
    status.lyricsTotal = summary.lyrics.total;
  }
  if (summary.calls && toCount(summary.calls.have) !== null && toCount(summary.calls.usable) !== null) {
    status.calls = summary.calls.have;
    status.callsUsable = summary.calls.usable;
    const date = toJapanDateString(summary.calls.version?.exportedAt ?? null);
    if (date) status.dataDate = date;
  }
  return Object.keys(status).length > 1 ? status : null;
}

// Firebase から読んだ値（どんな壊れ方をしているか分からない）→ 画面で使ってよい形。無い・壊れていれば null。
// 知らないキーは捨てる（相手が新しい版で項目を増やしても、ここで決めた項目だけを表示する）。
export function normalizeSharedDataStatus(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  const pairs = [
    ["audio", "audioTotal"],
    ["lyrics", "lyricsTotal"],
    ["calls", "callsUsable"],
  ];
  for (const [countKey, otherKey] of pairs) {
    const count = toCount(raw[countKey]);
    const other = toCount(raw[otherKey]);
    if (count === null || other === null) continue;
    // 「入っている数」が「全体」より大きいのはおかしいので載せない（コールは「使える数」が「入っている数」以下）
    if (countKey === "calls" ? other > count : count > other) continue;
    out[countKey] = count;
    out[otherKey] = other;
  }
  if (typeof raw.dataDate === "string" && DATE_PATTERN.test(raw.dataDate) && out.calls !== undefined) out.dataDate = raw.dataDate;
  return Object.keys(out).length > 0 ? out : null;
}

export const SHARED_DATA_STATUS_EMPTY_TEXT = "まだ記録がありません";

// フレンドの詳しい画面の1行：「データ：音源 ○／84・歌詞 ○／83・コール ○曲」
// 数えられた項目だけを並べる。何も無い（古い版のアプリの相手など）ときは「まだ記録がありません」。
export function describeSharedDataStatus(status) {
  const normalized = normalizeSharedDataStatus(status);
  if (!normalized) return { text: `データ：${SHARED_DATA_STATUS_EMPTY_TEXT}`, detail: "", hasRecord: false };
  const parts = [];
  if (normalized.audio !== undefined) parts.push(`音源 ${normalized.audio}／${normalized.audioTotal}`);
  if (normalized.lyrics !== undefined) parts.push(`歌詞 ${normalized.lyrics}／${normalized.lyricsTotal}`);
  if (normalized.calls !== undefined) parts.push(`コール ${normalized.calls}曲`);
  const details = [];
  if (normalized.calls !== undefined && normalized.callsUsable !== normalized.calls) details.push(`コールのうち今使える曲 ${normalized.callsUsable}曲`);
  if (normalized.dataDate) details.push(`コール表の版 ${normalized.dataDate.replace(/-/g, "/")}`);
  return { text: `データ：${parts.join("・")}`, detail: details.join("・"), hasRecord: true };
}

// ---------------------------------------------------------------------------
// 「今の数」を覚えておく（ページを開いている間だけ。localStorage には保存しない：
// 初めて開いた端末で equalLoveIntroQuiz. のキーを先に作ると、初回の名前登録（js/onboardingScreen.js）が
// 「既存のユーザー」と判断して出なくなるため）。
// ---------------------------------------------------------------------------
let currentStatus = null; // buildSharedDataStatus() の結果（まだ数えていなければ null）
let hasCounted = false;
let inflight = null;
let generation = 0;

async function defaultCollectSummary() {
  const { collectDeviceDataStatus, summarizeDeviceDataStatus } = await import("./dataStatusCheck.js");
  return summarizeDeviceDataStatus(await collectDeviceDataStatus());
}

// 端末を数え直す（読むだけ）。読み込みのあと・起動のときに呼ぶ。失敗しても例外は投げない。
export function refreshSharedDataStatus({ collectSummary = defaultCollectSummary } = {}) {
  const myGeneration = ++generation;
  inflight = (async () => {
    try {
      const status = buildSharedDataStatus(await collectSummary());
      if (myGeneration === generation) {
        currentStatus = status;
        hasCounted = true;
      }
    } catch (error) {
      console.warn("公開プロフィール用のデータの数を数えられませんでした", error);
    } finally {
      if (myGeneration === generation) inflight = null;
    }
    return currentStatus;
  })();
  return inflight;
}

// 「データの状態を確かめる」で数えた結果を、そのまま使う（同じ読み取りを2回しない）
export function setSharedDataStatusFromSummary(summary) {
  generation += 1;
  inflight = null;
  currentStatus = buildSharedDataStatus(summary);
  hasCounted = true;
}

// 公開プロフィールの同期（js/publicProfileSync.js）が呼ぶ：今の数を返す。まだ数えていなければ数え始め、
// timeoutMs まで待つ（同期を長く止めない。間に合わなければ null＝今回は載せず、数え終わったあとの同期で載る）。
export async function getSharedDataStatusForProfile({ timeoutMs = 4000, collectSummary } = {}) {
  if (!hasCounted && !inflight) refreshSharedDataStatus(collectSummary ? { collectSummary } : {});
  if (inflight) {
    let timerId = null;
    const timeout = new Promise((resolve) => {
      timerId = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([inflight, timeout]);
    clearTimeout(timerId);
  }
  return currentStatus;
}

// テスト用：覚えている数を消す
export function resetSharedDataStatusForTest() {
  generation += 1;
  currentStatus = null;
  hasCounted = false;
  inflight = null;
}
