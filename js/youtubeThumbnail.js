// YouTube公式のサムネイル画像を使った「MVサムネイル」表示を、複数の画面（収録曲一覧・
// ＝LOVEについてページの合同楽曲カード等）で共通して使うためのファイル（2026-08-25新設）。
//
// 【設計方針】画像ファイル自体はアプリ側に一切保存せず、YouTube公式のサムネイルURL
// （img.youtube.com/vi/{videoId}/…）をそのまま参照するだけにする（著作権保護のための
// 既存方針、収録曲一覧のMVサムネイルと同じ考え方）。
// 「同じ構造の楽曲カードを追加するときにも使い回せる形にしたい」という本人指示のとおり、
// youtubeUrlを渡すだけでサムネイル付きリンク要素を組み立てられる関数として切り出した。

// youtubeUrl（例："https://www.youtube.com/watch?v=xxxx"）から動画IDだけを取り出す。
// 形式が想定と違う場合はnullを返し、呼び出し側でサムネイル表示自体をスキップする。
export function extractYoutubeVideoId(youtubeUrl) {
  try {
    return new URL(youtubeUrl).searchParams.get("v");
  } catch {
    return null;
  }
}

// MVサムネイル付きのリンク要素（<a class="track-mv-thumb">）を組み立てる。
// youtubeUrlの形式が不正、または動画IDが取り出せない場合はnullを返す（呼び出し側は
// appendChildしない、という判断をこの戻り値で行う）。
// 画像の読み込みに失敗した場合（オフライン等）は、リンク要素自体を自動的に非表示にする。
//
// options.ariaLabel: リンクのaria-label（例：「◯◯のMVを見る」）
// options.onBeforeNavigate: サムネイルをタップした瞬間に呼ぶコールバック（省略可）。
//   収録曲一覧では、試聴中の音とMVの音が重ならないよう試聴を止める用途で使う。
export function buildMvThumbnailElement(youtubeUrl, options = {}) {
  const videoId = extractYoutubeVideoId(youtubeUrl);
  if (!videoId) return null;

  const thumbLink = document.createElement("a");
  thumbLink.className = "track-mv-thumb";
  thumbLink.href = youtubeUrl;
  thumbLink.target = "_blank";
  thumbLink.rel = "noopener noreferrer";
  if (options.ariaLabel) {
    thumbLink.setAttribute("aria-label", options.ariaLabel);
  }
  if (typeof options.onBeforeNavigate === "function") {
    thumbLink.addEventListener("click", options.onBeforeNavigate);
  }

  const thumbImg = document.createElement("img");
  thumbImg.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  thumbImg.alt = "";
  thumbImg.loading = "lazy";
  thumbImg.onerror = () => {
    thumbLink.hidden = true;
  };
  thumbLink.appendChild(thumbImg);

  return thumbLink;
}
