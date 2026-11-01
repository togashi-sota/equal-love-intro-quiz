// 歴代グッズ図鑑の「公式 X の投稿を表示」を担当するファイル（2026-11-01新設）。
//
// 【決まっている作り方】
// - 画像はアプリで持たない。見せるのは公式 X（@Equal_LOVE_12）の投稿の正式な埋め込みだけ
//   （X が配る platform.twitter.com/widgets.js が、X の iframe の中に投稿を出す）。
// - 一覧では読み込まない。詳細で［公式 X の投稿を表示］を押したときだけ、初めて widgets.js を読む
//   （1件ごとに iframe と画像で数百KB になるため。押さなければ X には1回も繋がない）。
// - 消えた投稿・読み込めない・時間切れ・オフラインのときは「表示できません」と出し、投稿へのリンクを残す。
//
// テストでは X に繋がないよう、setGoodsTwitterLoader() で読み込みの部品を差し替える。
import { goodsTweetId } from "./goodsModel.js";

export const GOODS_WIDGETS_SCRIPT_URL = "https://platform.twitter.com/widgets.js";
// これを過ぎても投稿が出なければ「表示できません」にする（電波の弱い所で待たせ続けないため）
export const GOODS_EMBED_TIMEOUT_MS = 12000;

let widgetsPromise = null;

// 本番の読み込み：<script src=widgets.js> を1回だけ足し、window.twttr.widgets を返す
function loadTwitterWidgets() {
  if (window.twttr?.widgets?.createTweet) return Promise.resolve(window.twttr.widgets);
  if (widgetsPromise) return widgetsPromise;
  widgetsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOODS_WIDGETS_SCRIPT_URL;
    script.async = true;
    script.charset = "utf-8";
    script.dataset.goodsEmbed = "true";
    script.addEventListener("load", () => {
      // widgets.js は読み込み後に twttr.ready で準備ができる
      const twttr = window.twttr;
      if (twttr?.ready) twttr.ready((ready) => (ready?.widgets?.createTweet ? resolve(ready.widgets) : reject(new Error("widgets-missing"))));
      else if (twttr?.widgets?.createTweet) resolve(twttr.widgets);
      else reject(new Error("widgets-missing"));
    });
    script.addEventListener("error", () => reject(new Error("script-error")));
    document.head.appendChild(script);
  }).catch((error) => {
    // 失敗したら次に押したときにもう一度読み直せるようにする
    widgetsPromise = null;
    throw error;
  });
  return widgetsPromise;
}

let twitterLoader = loadTwitterWidgets;
let isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

// テスト用：読み込みの部品・オンラインの判定を差し替える（null で元に戻す）
export function setGoodsTwitterLoader(loader, onlineCheck = null) {
  twitterLoader = loader ?? loadTwitterWidgets;
  isOnline = onlineCheck ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// 投稿を container の中に出す。結果は { ok: true } か { ok: false, reason }。
// reason：offline（オフライン）／invalid（URL の形が違う）／script-error・widgets-missing（X の部品が読めない）／
//         unavailable（投稿が消えた・非公開など）／timeout（時間切れ）
export async function embedGoodsPost(container, xPostUrl, { timeoutMs = GOODS_EMBED_TIMEOUT_MS } = {}) {
  const tweetId = goodsTweetId(xPostUrl);
  if (!tweetId) return { ok: false, reason: "invalid" };
  if (!isOnline()) return { ok: false, reason: "offline" };
  try {
    const widgets = await withTimeout(Promise.resolve().then(() => twitterLoader()), timeoutMs);
    // dnt：X の追跡（おすすめの学習など）に使わない設定。conversation none：返信を出さない
    const element = await withTimeout(
      Promise.resolve(widgets.createTweet(tweetId, container, { dnt: true, lang: "ja", conversation: "none", align: "center" })),
      timeoutMs
    );
    // 投稿が消えた・非公開のとき、createTweet は何も出さずに undefined で終わる
    if (!element) return { ok: false, reason: "unavailable" };
    return { ok: true };
  } catch (error) {
    const reason = ["timeout", "script-error", "widgets-missing"].includes(error?.message) ? error.message : "unavailable";
    return { ok: false, reason };
  }
}

// 「表示できません」の説明（理由ごとに短く）
export function describeGoodsEmbedFailure(reason) {
  if (reason === "offline") return "オフラインのため、公式 X の投稿を表示できません。電波のある所で、もう一度押してください。";
  if (reason === "timeout") return "公式 X の投稿を表示できません（時間内に読み込めませんでした）。";
  if (reason === "script-error" || reason === "widgets-missing") return "公式 X の投稿を表示できません（X の表示の部品を読み込めませんでした）。";
  if (reason === "invalid") return "公式 X の投稿を表示できません（投稿の URL の形が正しくありません）。";
  return "公式 X の投稿を表示できません（投稿が削除されたか、見られない状態の可能性があります）。";
}
