// 「YouTube 出演図鑑」のデータの読み込みと検査（2026-11-03新設・30日ルールの対応）。
//
// 【しくみ】
// - 動画の情報（タイトル・公開日など YouTube API から取ったもの）と、その回に作った出演の判定は、公開のたびに作るファイル
//   data/youtube-appearances.json に入っている。このファイルは git に入れない（scripts/youtube/refresh.mjs が作り、Pages にだけ載せる）
// - アプリはこのファイルを読むだけ。利用者の端末から YouTube の API は呼ばない
// - ファイルの expiresAt（取得から30日）を過ぎていたら、中身を一切表示しない（「更新が止まっています」）。
//   YouTube API Services Developer Policies III.E.4：API のデータは30日を超えて保存・表示しない
// - Service Worker はこのファイルを network-first で扱う（sw.js）。オフラインで前のファイルが出てきても、ここで期限を確かめる
// DOM には触れない（テストから直接呼べるように）。
export const YOUTUBE_DATA_PATH = "data/youtube-appearances.json";
export const YOUTUBE_DATA_SCHEMA = 1;
export const YOUTUBE_DATA_MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const YOUTUBE_DATA_STATE = Object.freeze({
  IDLE: "idle", // まだ読んでいない
  LOADING: "loading",
  READY: "ready", // 読めて、期限内
  EXPIRED: "expired", // 読めたが、期限切れ（中身は出さない）
  MISSING: "missing", // ファイルが無い（まだ公開の仕組みが動いていない・期限切れで外した）
  INVALID: "invalid", // 形が壊れている
  ERROR: "error", // 通信できない（オフラインで前のファイルも無い）
});

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["video", "short", "live"]);
const CONFIDENCES = new Set(["confirmed", "partial", "estimated", "unconfirmed"]);
const STATUSES = new Set(["manual", "cast-list", "title-name", "description-name", "group-only", "unconfirmed"]);

// 期限：expiresAt と、fetchedAt＋30日の早いほう（expiresAt が書き換えられていても30日を超えない）
export function youtubeDataExpiry(data) {
  const fetched = Date.parse(data?.fetchedAt ?? "");
  const declared = Date.parse(data?.expiresAt ?? "");
  if (!Number.isFinite(fetched)) return null;
  const limit = fetched + YOUTUBE_DATA_MAX_AGE_DAYS * DAY_MS;
  return new Date(Number.isFinite(declared) ? Math.min(declared, limit) : limit);
}

export function isYoutubeDataExpired(data, now = new Date()) {
  const expiry = youtubeDataExpiry(data);
  return !expiry || now.getTime() >= expiry.getTime();
}

// 形の検査。アプリの表示の前と、公開の前（scripts/youtube/refresh.mjs）の両方で使う
export function validateYoutubePublishedData(data, { now = new Date(), memberIds = null } = {}) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, errors: ["データが JSON のオブジェクトではない"] };
  if (data.schema !== YOUTUBE_DATA_SCHEMA) errors.push(`schema が ${YOUTUBE_DATA_SCHEMA} ではない`);
  const fetched = Date.parse(data.fetchedAt ?? "");
  if (!Number.isFinite(fetched)) errors.push("fetchedAt（取得の日時）が無い");
  else if (fetched > now.getTime() + DAY_MS) errors.push("fetchedAt が未来の日時");
  if (!Number.isFinite(Date.parse(data.expiresAt ?? ""))) errors.push("expiresAt（期限）が無い");
  if (!Array.isArray(data.videos)) {
    errors.push("videos が配列ではない");
    return { ok: false, errors };
  }
  const seen = new Set();
  data.videos.forEach((video, index) => {
    const where = `videos[${index}]`;
    if (!video || typeof video !== "object") return errors.push(`${where} がオブジェクトではない`);
    if (!VIDEO_ID_PATTERN.test(String(video.id))) errors.push(`${where}.id の形`);
    if (seen.has(video.id)) errors.push(`${where}.id が重なる`);
    seen.add(video.id);
    if (typeof video.title !== "string" || !video.title) errors.push(`${where}.title が無い`);
    if (!DATE_PATTERN.test(String(video.publishedAt))) errors.push(`${where}.publishedAt の形`);
    if (!KINDS.has(video.kind)) errors.push(`${where}.kind`);
    if (!STATUSES.has(video.status)) errors.push(`${where}.status`);
    if (video.privacy !== "public") errors.push(`${where} が公開の動画ではない`);
    const ids = [...(video.memberIds ?? []), ...(video.footageMemberIds ?? []), ...(video.thumbnailMemberIds ?? [])];
    if (video.thumbnailMemberIds !== undefined && !Array.isArray(video.thumbnailMemberIds)) errors.push(`${where}.thumbnailMemberIds が配列ではない`);
    if (!Array.isArray(video.memberIds) || !Array.isArray(video.footageMemberIds ?? [])) errors.push(`${where} のメンバーが配列ではない`);
    else if (memberIds && ids.some((memberId) => !memberIds.has(memberId))) errors.push(`${where} に知らないメンバー`);
    if ("description" in video) errors.push(`${where} に説明の全文がある（要約だけにする）`);
    // 【R11】確かさ（無い古いデータも読める）
    if (video.confidence !== undefined && !CONFIDENCES.has(video.confidence)) errors.push(`${where}.confidence`);
    if (video.writerMemberIds !== undefined && !Array.isArray(video.writerMemberIds)) errors.push(`${where}.writerMemberIds が配列ではない`);
  });
  return { ok: errors.length === 0, errors: errors.slice(0, 20) };
}

// ---- 読み込み（アプリ） ----
let snapshot = { state: YOUTUBE_DATA_STATE.IDLE, data: null, videos: [], error: null };
let loading = null;
const listeners = new Set();

export function getYoutubeAppearanceSnapshot() {
  return snapshot;
}

export function onYoutubeAppearanceDataChange(listener) {
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

// 読み込んだ JSON から、画面に出してよい形を作る（期限切れ・壊れたものは videos を空にする）
export function interpretYoutubeData(data, { now = new Date(), memberIds = null } = {}) {
  const check = validateYoutubePublishedData(data, { now, memberIds });
  if (!check.ok) return { state: YOUTUBE_DATA_STATE.INVALID, data: null, videos: [], error: check.errors.join("／") };
  if (isYoutubeDataExpired(data, now)) {
    // 期限切れ：動画の情報は持たない（最後に更新した日だけ、案内のために残す）
    return { state: YOUTUBE_DATA_STATE.EXPIRED, data: { fetchedAt: data.fetchedAt, expiresAt: data.expiresAt }, videos: [], error: null };
  }
  return { state: YOUTUBE_DATA_STATE.READY, data, videos: data.videos, error: null };
}

// options.fetchImpl：テストで差し替える。options.force：読み直す
export function loadYoutubeAppearanceData({ fetchImpl = (url, init) => fetch(url, init), now = () => new Date(), memberIds = null, force = false } = {}) {
  if (loading && !force) return loading;
  if (!force && snapshot.state !== YOUTUBE_DATA_STATE.IDLE && snapshot.state !== YOUTUBE_DATA_STATE.ERROR) return Promise.resolve(snapshot);
  setSnapshot({ ...snapshot, state: YOUTUBE_DATA_STATE.LOADING });
  loading = (async () => {
    try {
      const response = await fetchImpl(YOUTUBE_DATA_PATH, { cache: "no-cache" });
      if (response.status === 404) {
        setSnapshot({ state: YOUTUBE_DATA_STATE.MISSING, data: null, videos: [], error: null });
      } else if (!response.ok) {
        setSnapshot({ state: YOUTUBE_DATA_STATE.ERROR, data: null, videos: [], error: `HTTP ${response.status}` });
      } else {
        let json = null;
        try {
          json = await response.json();
        } catch (error) {
          json = undefined;
        }
        setSnapshot(json === undefined ? { state: YOUTUBE_DATA_STATE.INVALID, data: null, videos: [], error: "JSON を読めない" } : interpretYoutubeData(json, { now: now(), memberIds }));
      }
    } catch (error) {
      setSnapshot({ state: YOUTUBE_DATA_STATE.ERROR, data: null, videos: [], error: String(error?.message ?? error) });
    } finally {
      loading = null;
    }
    return snapshot;
  })();
  return loading;
}

// テスト用：状態を直接入れる・初めに戻す
export function setYoutubeAppearanceSnapshotForTest(next) {
  loading = null;
  setSnapshot(next ?? { state: YOUTUBE_DATA_STATE.IDLE, data: null, videos: [], error: null });
}
