// 「YouTube 出演図鑑」の自動更新の中心（2026-11-03新設）。通信も DOM もファイルも触らない（Node のスクリプトとテストの両方から使う）。
//
// 流れ（scripts/youtube/refresh.mjs が呼ぶ）：
//   取得した動画（API のデータ）＋本人が確かめた判定（git）＋前に公開したデータ（公開中のサイトから読む。30日以内のものだけ）
//     → buildYoutubePublishedData：判定してデータを作る
//     → checkYoutubePublication：形・件数の急な減り・期限を検査する
//     → decideYoutubePublication：公開する／前のままにする／データを外して公開する、を決める
// 守ること：
// - 強い根拠（説明欄の公式の出演者の表記・本人の確認）だけが「確定」。推定・未確認はその印のまま
// - 前に確定した判定は、自動で下げない（説明欄から名前が消えても、前の判定を「保留中」として最大30日まで残し、要確認に出す）
// - 削除・非公開になった動画は載せない（本人が確かめた判定は git に残るので、また公開されれば元に戻る）
// - 書き出してよいのは data/youtube-appearances.json だけ（isAllowedRefreshOutput）
import { MEMBERS } from "./data/members.js";
import {
  APPEARANCE_STATUS,
  EXCLUDE_REASON_LABELS,
  ROSTER_TEMPLATE_MIN_NAMES,
  ROSTER_TEMPLATE_MIN_REPEATS,
  castSignature,
  classifyYoutubeVideo,
  extractCastNames,
  findEqualLoveNamesInText,
  normalizePersonName,
  summarizeDescription,
} from "./youtubeAppearanceClassifier.js";
import { toClassifierManual } from "./data/youtubeVerifiedJudgments.js";
import { YOUTUBE_DATA_PATH, YOUTUBE_DATA_SCHEMA, YOUTUBE_DATA_MAX_AGE_DAYS, isYoutubeDataExpired, validateYoutubePublishedData } from "./youtubeAppearanceData.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const YOUTUBE_CHANNEL_INFO = Object.freeze({
  id: "UCWHh6SdvJWrPuf1oJrHbX3A",
  handle: "@ikonoijoy",
  title: "イコラブ ノイミー ニアジョイ チャンネル",
  url: "https://www.youtube.com/@ikonoijoy",
});
// 件数がこの割合より減ったら、取得の失敗・データの壊れとみなして公開しない
export const SUDDEN_DROP_RATIO = 0.8;
// 前の確定を「保留中」として残す最長の日数（API のデータから作った判定なので30日を超えて持ち越さない）
export const HOLD_MAX_DAYS = 30;

// 書き出してよい場所（自動更新が変えてよいのは YouTube のデータだけ）
export function isAllowedRefreshOutput(relativePath) {
  return String(relativePath ?? "").replace(/\\/g, "/").replace(/^\.\//, "") === YOUTUBE_DATA_PATH;
}

// 公開日（UTC の ISO）を日本時間の日付と時刻にする
export function toJapanDateTime(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return { date: null, time: null };
  const japan = new Date(time + 9 * 60 * 60 * 1000).toISOString();
  return { date: japan.slice(0, 10), time: japan.slice(11, 16) };
}

// ISO 8601 の長さ（PT1M5S）を秒に
export function durationSeconds(duration) {
  const match = String(duration ?? "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match.map((value) => Number(value ?? 0));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

// 種類：Shorts・ライブ配信の公式の再生リスト（UUSH・UULV）に入っているかで決める。取れなかったときだけ長さから推定する
export function decideYoutubeKind(video, shortsSet, liveSet) {
  if (liveSet && liveSet.has(video.id)) return { kind: "live", kindEstimated: false };
  if (shortsSet && shortsSet.has(video.id)) return { kind: "short", kindEstimated: false };
  if (shortsSet && liveSet) return { kind: "video", kindEstimated: false };
  const seconds = durationSeconds(video.duration);
  if (!liveSet && video.liveStreaming?.actualStartTime) return { kind: "live", kindEstimated: true };
  if (!shortsSet && seconds !== null && seconds <= 60) return { kind: "short", kindEstimated: true };
  return { kind: "video", kindEstimated: true };
}

// ≠ME・≒JOY の人の名前：チャンネルの出演者の表記に3回以上出た、＝LOVE 以外の人の名前（手で書き並べない）
export function collectOtherGroupNames(videos) {
  const counts = new Map();
  videos.forEach((video) => {
    (extractCastNames(video.description) ?? []).forEach((name) => {
      if (findEqualLoveNamesInText(name).length) return;
      const key = normalizePersonName(name);
      if (!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{3,8}$/u.test(key) || /様|さん|プロデューサー|ナレーター/.test(key)) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });
  return [...counts].filter(([, count]) => count >= 3).map(([name]) => name).sort();
}

// テンプレートの全員の表記：同じ大人数の表記が別々の動画に何度も繰り返されるもの
export function collectRosterTemplateKeys(videos) {
  const counts = new Map();
  videos.forEach((video) => {
    const names = extractCastNames(video.description);
    if (!names || names.length < ROSTER_TEMPLATE_MIN_NAMES) return;
    const key = castSignature(names);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return new Set([...counts].filter(([, count]) => count >= ROSTER_TEMPLATE_MIN_REPEATS).map(([key]) => key));
}

const STRONG_STATUSES = new Set([APPEARANCE_STATUS.CAST_LIST, APPEARANCE_STATUS.MANUAL]);

// fetched: { meta: { fetchedAt, channelVideoCount }, videos: [{ id, title, description, publishedAt, duration, privacyStatus, liveStreaming }],
//            shortsIds?: string[]|null, liveIds?: string[]|null, playlists?: [{ title, videoIds }] }
// verifiedJudgments：js/data/youtubeVerifiedJudgments.js の YOUTUBE_VERIFIED_JUDGMENTS
// previous：前に公開したデータ（無ければ null。期限切れなら使わない）
export function buildYoutubePublishedData({ fetched, verifiedJudgments = [], previous = null, now = new Date(), members = MEMBERS }) {
  const fetchedAt = fetched?.meta?.fetchedAt;
  if (!Number.isFinite(Date.parse(fetchedAt ?? ""))) throw new Error("取得の日時が無い");
  if (!Array.isArray(fetched?.videos)) throw new Error("取得した動画の一覧が無い");
  const usablePrevious = previous && !isYoutubeDataExpired(previous, now) ? previous : null;
  const previousById = new Map((usablePrevious?.videos ?? []).map((video) => [video.id, video]));
  const verifiedById = new Map(verifiedJudgments.map((judgment) => [judgment.videoId, judgment]));
  const shortsSet = Array.isArray(fetched.shortsIds) ? new Set(fetched.shortsIds) : null;
  const liveSet = Array.isArray(fetched.liveIds) ? new Set(fetched.liveIds) : null;
  const playlistTitlesByVideo = new Map();
  (fetched.playlists ?? []).forEach((playlist) =>
    (playlist.videoIds ?? []).forEach((videoId) => {
      if (!playlistTitlesByVideo.has(videoId)) playlistTitlesByVideo.set(videoId, []);
      playlistTitlesByVideo.get(videoId).push(playlist.title);
    })
  );
  const otherGroupNames = collectOtherGroupNames(fetched.videos);
  const rosterTemplateKeys = collectRosterTemplateKeys(fetched.videos);

  const videos = [];
  const excluded = [];
  const review = [];
  const fetchedIds = new Set();
  for (const raw of fetched.videos) {
    fetchedIds.add(raw.id);
    const playlistTitles = playlistTitlesByVideo.get(raw.id) ?? [];
    const verified = verifiedById.get(raw.id) ?? null;
    const result = classifyYoutubeVideo({ ...raw, playlistTitles }, { manual: toClassifierManual(verified), members, otherGroupNames, rosterTemplateKeys });
    if (!result.included) {
      excluded.push({ id: raw.id, reason: result.excludedReason, reasonLabel: EXCLUDE_REASON_LABELS[result.excludedReason] ?? result.excludedReason });
      continue;
    }
    const { date, time } = toJapanDateTime(raw.publishedAt);
    const { kind, kindEstimated } = decideYoutubeKind(raw, shortsSet, liveSet);
    let status = result.status;
    let memberIds = result.memberIds;
    let footageMemberIds = result.footageMemberIds ?? [];
    let evidence = result.evidence;
    let hold = null;
    // 前に確定した判定を下げない（本人の確認が無い動画だけ）
    const before = previousById.get(raw.id);
    if (!verified && before && STRONG_STATUSES.has(before.status)) {
      const lost = (before.memberIds ?? []).filter((memberId) => !memberIds.includes(memberId));
      const downgraded = !STRONG_STATUSES.has(status) || lost.length > 0;
      if (downgraded) {
        const since = before.hold?.since ?? fetchedAt;
        const heldDays = (Date.parse(fetchedAt) - Date.parse(since)) / DAY_MS;
        if (heldDays < HOLD_MAX_DAYS) {
          status = before.status;
          memberIds = [...new Set([...memberIds, ...before.memberIds])];
          footageMemberIds = before.footageMemberIds ?? footageMemberIds;
          evidence = before.evidence;
          hold = { since, reason: "説明欄の出演者の表記が前と変わった（前の判定を残して確認待ち）" };
        }
        review.push({ id: raw.id, kind: "downgrade", lost, heldDays: Math.floor(heldDays), keptPrevious: Boolean(hold) });
      }
    }
    if (!STRONG_STATUSES.has(status)) review.push({ id: raw.id, kind: status === APPEARANCE_STATUS.UNCONFIRMED ? "unconfirmed" : "estimate" });
    if (!before && usablePrevious) review.push({ id: raw.id, kind: "new", status });
    videos.push({
      id: raw.id,
      title: raw.title,
      publishedAt: date,
      publishedAtTime: time,
      kind,
      ...(kindEstimated ? { kindEstimated: true } : {}),
      status,
      memberIds,
      footageMemberIds,
      evidence,
      ...(verified ? { verified: { by: verified.verifiedBy, on: verified.verifiedOn } } : {}),
      ...(hold ? { hold } : {}),
      summary: summarizeDescription(raw.description),
      series: playlistTitles,
      privacy: "public",
    });
  }
  videos.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || String(a.publishedAtTime).localeCompare(String(b.publishedAtTime)) || a.id.localeCompare(b.id));
  // 前に載っていたのに今回の取得に無い（削除・非公開・限定公開になった）動画。数だけを残す（タイトルなどは持ち越さない）
  const endedIds = [...previousById.keys()].filter((videoId) => !fetchedIds.has(videoId));
  const unconfirmed = videos.filter((video) => video.status === APPEARANCE_STATUS.UNCONFIRMED).length;
  const expiresAt = new Date(Date.parse(fetchedAt) + YOUTUBE_DATA_MAX_AGE_DAYS * DAY_MS).toISOString();
  const data = {
    schema: YOUTUBE_DATA_SCHEMA,
    source: "YouTube Data API v3",
    channel: YOUTUBE_CHANNEL_INFO,
    fetchedAt,
    expiresAt,
    counts: {
      channelVideos: Number.isFinite(fetched.meta.channelVideoCount) ? fetched.meta.channelVideoCount : fetched.videos.length,
      checked: fetched.videos.length,
      included: videos.length - unconfirmed,
      unconfirmed,
      excluded: excluded.length,
      ended: endedIds.length,
    },
    videos,
  };
  return { data, report: { excluded, review, endedIds } };
}

// 公開してよいかの検査（形・件数の急な減り・期限）
export function checkYoutubePublication(data, { previous = null, now = new Date(), members = MEMBERS } = {}) {
  const memberIds = new Set(members.map((member) => member.id));
  const shape = validateYoutubePublishedData(data, { now, memberIds });
  const errors = [...shape.errors];
  if (shape.ok && isYoutubeDataExpired(data, now)) errors.push("作ったデータがもう期限切れ");
  if (shape.ok && previous && !isYoutubeDataExpired(previous, now) && Array.isArray(previous.videos)) {
    const before = previous.videos.length;
    if (before > 0 && data.videos.length < before * SUDDEN_DROP_RATIO) errors.push(`件数が急に減った（${before} → ${data.videos.length}）`);
  }
  return { ok: errors.length === 0, errors };
}

// 公開の決め方。trigger："push"（アプリの更新）・"schedule"／"dispatch"（定期の更新）
//   fresh：{ ok: true, data } か { ok: false, error }（取得・判定・検査のどこかで失敗）
// 戻り値の action：
//   "publish-fresh"：取り直したデータで公開
//   "publish-previous"：前のデータ（30日以内）で公開（アプリの更新を止めないため。push のときだけ）
//   "keep-live"：公開しない（公開中のサイトは前のまま。前のデータはまだ30日以内）
//   "publish-without-data"：データを外して公開（前のデータが30日を超えた・無い）。アプリは「更新が止まっています」
// alert：本人に知らせる（Issue を作る）か
export function decideYoutubePublication({ trigger, fresh, previous = null, now = new Date() }) {
  if (fresh?.ok) return { action: "publish-fresh", alert: false, reason: "取り直したデータで公開" };
  const previousUsable = previous && !isYoutubeDataExpired(previous, now) && validateYoutubePublishedData(previous, { now }).ok;
  const error = fresh?.error ?? "不明な失敗";
  if (previousUsable) {
    if (trigger === "push") return { action: "publish-previous", alert: true, reason: `取得に失敗（${error}）。前のデータ（30日以内）で公開` };
    return { action: "keep-live", alert: true, reason: `取得に失敗（${error}）。公開中のサイトは前のまま` };
  }
  return { action: "publish-without-data", alert: true, reason: `取得に失敗（${error}）し、前のデータも30日を過ぎた・無い。データを外して公開` };
}

// Issue の本文（API キー・説明の全文は入れない）
export function describeYoutubeRefreshForIssue({ decision, check, report, trigger, runUrl }) {
  const lines = [
    `YouTube 出演図鑑の自動更新で、確認が必要なことがありました（${trigger}）。`,
    "",
    `- 結果：${decision.reason}`,
  ];
  if (check && !check.ok) lines.push(`- 検査で見つかったこと：${check.errors.join("／")}`);
  if (report?.review?.some((item) => item.kind === "downgrade")) {
    lines.push(`- 説明欄の出演者の表記が前と変わった動画：${report.review.filter((item) => item.kind === "downgrade").map((item) => item.id).join(", ")}`);
  }
  if (runUrl) lines.push(`- 実行の記録：${runUrl}`);
  lines.push("", "対処のしかたは scripts/youtube/SETUP.md の「困ったとき」を見てください。");
  return lines.join("\n");
}
