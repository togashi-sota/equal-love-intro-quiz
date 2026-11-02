// 「質問AI」と「＝LOVE 最新情報」（別の担当・ブランチ r11-news）をつなぐ差し替え口（2026-11-03新設・R11-C）。
//
// 質問AIは、最新情報のデータをこの関数だけから読む（中身の作り方を知らない）。
// 統合のときは main.js で次の1行を足すだけ：
//   import { getOfficialNewsSnapshot } from "./officialNewsData.js";
//   setQaNewsProvider(getOfficialNewsSnapshot);
// 想定している形（r11-news の仮の約束）：
//   { state: "ready" | "loading" | "error" | "unavailable" | ..., items: [{ id, title, publishedOn, category, memberIds, url, source, fetchedAt }] }
// つながっていない・読み込めないときは state: "unavailable" を返す（質問AIは「最新情報を読み込めていません」と答え、推測しない）。

export const QA_NEWS_STATE = Object.freeze({ READY: "ready", UNAVAILABLE: "unavailable", ERROR: "error", LOADING: "loading" });

let provider = null;

export function setQaNewsProvider(fn) {
  provider = typeof fn === "function" ? fn : null;
}

// いつも { state, items } の形で返す（形が違っても壊れない）
export function getQaNewsSnapshot() {
  if (!provider) return { state: QA_NEWS_STATE.UNAVAILABLE, items: [] };
  try {
    const snapshot = provider() ?? {};
    const items = Array.isArray(snapshot.items) ? snapshot.items.filter((item) => item && typeof item.title === "string") : [];
    return { state: typeof snapshot.state === "string" ? snapshot.state : QA_NEWS_STATE.UNAVAILABLE, items, fetchedAt: snapshot.fetchedAt ?? null };
  } catch (error) {
    return { state: QA_NEWS_STATE.ERROR, items: [] };
  }
}
