// YouTube 出演図鑑：YouTube Data API v3 から、チャンネルの公開動画を全件取る（2026-11-03 scripts/youtube に移した。元は tools/youtube-appearances/fetch_youtube.mjs）。
// 取得だけをする（出演の判定はしない）。読み取りだけ・公開の情報だけ。動画本体・サムネイルはダウンロードしない。
// 使う API：channels.list・playlistItems.list（UU＝全部／UUSH＝Shorts／UULV＝ライブ配信）・playlists.list・videos.list。1回で約85ユニット。
//
// 【API キー】環境変数 YOUTUBE_API_KEY（GitHub Actions では Secrets から渡す）。手元では、無ければ C:\EqualLove-tools\youtube_api_key.txt の1行目。
//   キーは画面・ログ・ファイルに一切出さない（エラーでも URL を出さない）。
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const CHANNEL_ID = "UCWHh6SdvJWrPuf1oJrHbX3A"; // イコラブ ノイミー ニアジョイ チャンネル（@ikonoijoy）
const LOCAL_KEY_FILE = "C:\\EqualLove-tools\\youtube_api_key.txt";
const API_BASE = "https://www.googleapis.com/youtube/v3/";
const WAIT_MS = 250;

export async function loadYoutubeApiKey() {
  const fromEnv = (process.env.YOUTUBE_API_KEY ?? "").trim();
  if (fromEnv) return { key: fromEnv, source: "環境変数 YOUTUBE_API_KEY" };
  if (existsSync(LOCAL_KEY_FILE)) {
    const firstLine = (await readFile(LOCAL_KEY_FILE, "utf8")).split(/\r?\n/)[0].trim();
    if (firstLine) return { key: firstLine, source: "手元のキーのファイル" };
  }
  return { key: null, source: null };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let usedUnits = 0;
async function callApi(apiKey, endpoint, params) {
  const url = new URL(endpoint, API_BASE);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, String(value)));
  url.searchParams.set("key", apiKey);
  await sleep(WAIT_MS);
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (error) {
    // URL（キーを含む）を出さない
    throw new Error(`${endpoint} に繋がりませんでした（${error?.cause?.code ?? error?.name ?? "通信の失敗"}）`);
  }
  usedUnits += 1;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? "";
    const error = new Error(`${endpoint} が ${response.status} ${reason}`.trim());
    error.status = response.status;
    error.reason = reason;
    throw error;
  }
  return body;
}

async function fetchPlaylistVideoIds(apiKey, playlistId, { optional = false } = {}) {
  const ids = [];
  let pageToken = "";
  do {
    let page;
    try {
      page = await callApi(apiKey, "playlistItems", { part: "contentDetails,status", playlistId, maxResults: 50, ...(pageToken ? { pageToken } : {}) });
    } catch (error) {
      if (optional && (error.status === 404 || error.status === 403)) return null;
      throw error;
    }
    (page.items ?? []).forEach((item) => {
      ids.push({ id: item.contentDetails?.videoId, privacyStatus: item.status?.privacyStatus ?? null });
    });
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return ids;
}

async function fetchPlaylists(apiKey) {
  const playlists = [];
  let pageToken = "";
  do {
    const page = await callApi(apiKey, "playlists", { part: "snippet,contentDetails", channelId: CHANNEL_ID, maxResults: 50, ...(pageToken ? { pageToken } : {}) });
    (page.items ?? []).forEach((item) => playlists.push({ id: item.id, title: item.snippet?.title ?? "", itemCount: item.contentDetails?.itemCount ?? null }));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  for (const playlist of playlists) {
    const entries = await fetchPlaylistVideoIds(apiKey, playlist.id, { optional: true });
    playlist.videoIds = (entries ?? []).map((entry) => entry.id).filter(Boolean);
  }
  return playlists;
}

async function fetchVideoDetails(apiKey, ids) {
  const videos = [];
  for (let start = 0; start < ids.length; start += 50) {
    const chunk = ids.slice(start, start + 50);
    const page = await callApi(apiKey, "videos", { part: "snippet,contentDetails,status,liveStreamingDetails", id: chunk.join(","), maxResults: 50 });
    (page.items ?? []).forEach((item) =>
      videos.push({
        id: item.id,
        title: item.snippet?.title ?? "",
        description: item.snippet?.description ?? "",
        publishedAt: item.snippet?.publishedAt ?? null,
        channelId: item.snippet?.channelId ?? null,
        duration: item.contentDetails?.duration ?? null,
        privacyStatus: item.status?.privacyStatus ?? null,
        liveBroadcastContent: item.snippet?.liveBroadcastContent ?? null,
        liveStreaming: item.liveStreamingDetails
          ? { actualStartTime: item.liveStreamingDetails.actualStartTime ?? null, scheduledStartTime: item.liveStreamingDetails.scheduledStartTime ?? null }
          : null,
      })
    );
  }
  return videos;
}


// チャンネルの全件を取る。戻り値は refresh の入力（fetched）の形
export async function fetchYoutubeChannel(apiKey) {
  usedUnits = 0;
  const channel = await callApi(apiKey, "channels", { part: "contentDetails,statistics,snippet", id: CHANNEL_ID });
  const channelItem = channel.items?.[0];
  if (!channelItem) throw new Error("チャンネルが見つかりませんでした");
  const uploadsId = channelItem.contentDetails.relatedPlaylists.uploads;
  const suffix = uploadsId.slice(2);
  const uploads = await fetchPlaylistVideoIds(apiKey, uploadsId);
  const shorts = await fetchPlaylistVideoIds(apiKey, `UUSH${suffix}`, { optional: true });
  const lives = await fetchPlaylistVideoIds(apiKey, `UULV${suffix}`, { optional: true });
  const playlists = await fetchPlaylists(apiKey);
  const videos = await fetchVideoDetails(apiKey, uploads.filter((entry) => entry.id).map((entry) => entry.id));
  return {
    meta: {
      fetchedAt: new Date().toISOString(),
      channelId: CHANNEL_ID,
      channelVideoCount: Number(channelItem.statistics?.videoCount ?? NaN),
      uploadsPlaylistCount: uploads.length,
      usedUnits,
    },
    videos,
    shortsIds: shorts?.map((entry) => entry.id) ?? null,
    liveIds: lives?.map((entry) => entry.id) ?? null,
    playlists,
  };
}
