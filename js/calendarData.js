// 「＝LOVEカレンダー」のデータの読み込み（2026-11-24新設）。DOM には触れない（テスト・質問AIから直接呼べるように）。
//
// 【しくみ】
// - data/official-schedule.json（公開のたびに scripts/calendar/refresh-calendar.mjs が作る。git に入れない）を読む
// - 読めないとき（手元・まだ一度も作っていない）は、過去の分の土台 data/calendar/official-schedule-seed.json を読む
// - 利用者の端末から公式サイトへは取りに行かない。Service Worker は network-first（sw.js）
// - 大きいファイルなので、起動のときには読まない。カレンダー・質問AIを開いたときに読む（loadCalendarData）
//
// 【ほかの機能へ渡す形】getCalendarSnapshot()
//   { state, events, months, fetchedAt, lastAttempt, ageDays, source, error }
//   - state：CALENDAR_STATE。events が入っているのは READY と STALE（古いが表示はしてよい）のときだけ
//   - months：{ "2026-11": 最後に読めた日時 }（収録できている月。無い月は「まだ収録できていない」）
import { CALENDAR_DATA_PATH, CALENDAR_SEED_PATH, CALENDAR_STALE_DAYS, fromStoredCalendarData, validateCalendarData } from "./calendarCore.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const CALENDAR_STATE = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  STALE: "stale", // 最後の取得から日が経っている（表示はする）
  MISSING: "missing", // ファイルが無い
  INVALID: "invalid", // 形が壊れている（中身は出さない）
  ERROR: "error", // 通信できない
});

const EMPTY = Object.freeze({ events: [], months: {}, fetchedAt: null, lastAttempt: null, ageDays: null, source: null });

export function calendarAgeDays(fetchedAt, now = new Date()) {
  const time = Date.parse(fetchedAt ?? "");
  return Number.isFinite(time) ? Math.max(0, Math.floor((now.getTime() - time) / DAY_MS)) : null;
}

// 読み込んだ JSON から、画面に出してよい形を作る。source："published"（毎日の取得）／"seed"（土台だけ）
export function interpretCalendarData(stored, { now = new Date(), source = "published" } = {}) {
  const data = fromStoredCalendarData(stored);
  const check = validateCalendarData(data);
  if (!check.ok) return { ...EMPTY, state: CALENDAR_STATE.INVALID, error: check.errors.slice(0, 3).join("／") };
  const ageDays = calendarAgeDays(data.fetchedAt, now);
  const stale = ageDays === null || ageDays >= CALENDAR_STALE_DAYS;
  return {
    state: stale ? CALENDAR_STATE.STALE : CALENDAR_STATE.READY,
    events: data.events,
    months: data.months && typeof data.months === "object" ? data.months : {},
    fetchedAt: data.fetchedAt ?? null,
    lastAttempt: data.lastAttempt && typeof data.lastAttempt === "object" ? { ...data.lastAttempt } : null,
    ageDays,
    source,
    error: null,
  };
}

let snapshot = { ...EMPTY, state: CALENDAR_STATE.IDLE, error: null };
let loading = null;
const listeners = new Set();

export function getCalendarSnapshot() {
  return snapshot;
}

export function onCalendarDataChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSnapshot(next) {
  snapshot = next;
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error(error);
    }
  });
}

async function readJson(fetchImpl, path) {
  const response = await fetchImpl(path, { cache: "no-cache" });
  if (response.status === 404) return { status: "missing" };
  if (!response.ok) return { status: "error", error: `HTTP ${response.status}` };
  try {
    return { status: "ok", json: fromStoredCalendarData(await response.json()) };
  } catch (error) {
    return { status: "invalid", error: "JSON を読めない" };
  }
}

// options.fetchImpl：テストで差し替える。options.force：読み直す
export function loadCalendarData({ fetchImpl = (url, init) => fetch(url, init), now = () => new Date(), force = false } = {}) {
  if (loading && !force) return loading;
  if (!force && snapshot.state !== CALENDAR_STATE.IDLE && snapshot.state !== CALENDAR_STATE.ERROR) return Promise.resolve(snapshot);
  setSnapshot({ ...snapshot, state: CALENDAR_STATE.LOADING });
  loading = (async () => {
    try {
      let read = await readJson(fetchImpl, CALENDAR_DATA_PATH);
      let source = "published";
      // 毎日のデータが無い・壊れている → 土台を読む（過去の分だけでも出す）
      if (read.status !== "ok" || !validateCalendarData(read.json).ok) {
        const seed = await readJson(fetchImpl, CALENDAR_SEED_PATH);
        if (seed.status === "ok") {
          read = seed;
          source = "seed";
        }
      }
      if (read.status === "missing") setSnapshot({ ...EMPTY, state: CALENDAR_STATE.MISSING, error: null });
      else if (read.status === "error") setSnapshot({ ...EMPTY, state: CALENDAR_STATE.ERROR, error: read.error });
      else if (read.status === "invalid") setSnapshot({ ...EMPTY, state: CALENDAR_STATE.INVALID, error: read.error });
      else setSnapshot(interpretCalendarData(read.json, { now: now(), source }));
    } catch (error) {
      setSnapshot({ ...EMPTY, state: CALENDAR_STATE.ERROR, error: String(error?.message ?? error) });
    } finally {
      loading = null;
    }
    return snapshot;
  })();
  return loading;
}

export function setCalendarSnapshotForTest(next) {
  loading = null;
  setSnapshot(next ?? { ...EMPTY, state: CALENDAR_STATE.IDLE, error: null });
}
