// js/youtubeThumbnail.js のテスト（2026-08-25新設）。
// 収録曲一覧・＝LOVEについてページの合同楽曲カードなど、複数画面で共通利用する
// MVサムネイル組み立てロジックを検証する。
import { extractYoutubeVideoId, buildMvThumbnailElement } from "../js/youtubeThumbnail.js";
import { assertEqual } from "./test-utils.js";

export function runYoutubeThumbnailTests() {
  // ---- extractYoutubeVideoId ----
  assertEqual(
    extractYoutubeVideoId("https://www.youtube.com/watch?v=_Bm66BRnM1A"),
    "_Bm66BRnM1A",
    "watch?v=形式のURLから動画IDを取り出せる"
  );
  assertEqual(
    extractYoutubeVideoId("https://www.youtube.com/watch?v=abc&list=xyz"),
    "abc",
    "他のクエリパラメータが付いていても動画IDだけを取り出せる"
  );
  assertEqual(extractYoutubeVideoId("not a url"), null, "URLとして不正な文字列はnullを返す");
  assertEqual(
    extractYoutubeVideoId("https://www.youtube.com/playlist?list=xyz"),
    null,
    "v=パラメータが無いURL（再生リストURL等）はnullを返す"
  );

  // ---- buildMvThumbnailElement ----
  assertEqual(
    buildMvThumbnailElement("not a url"),
    null,
    "動画IDが取り出せないURLでは要素を作らずnullを返す"
  );

  const thumbLink = buildMvThumbnailElement("https://www.youtube.com/watch?v=_Bm66BRnM1A", {
    ariaLabel: "テスト曲のMVを見る",
  });
  assertEqual(thumbLink?.tagName, "A", "有効なURLでは<a>要素を返す");
  assertEqual(thumbLink?.className, "track-mv-thumb", "収録曲一覧と共通のクラス名が付く");
  assertEqual(
    thumbLink?.href,
    "https://www.youtube.com/watch?v=_Bm66BRnM1A",
    "リンク先が渡したURLと一致する"
  );
  assertEqual(thumbLink?.getAttribute("aria-label"), "テスト曲のMVを見る", "aria-labelが渡した値になる");
  assertEqual(thumbLink?.target, "_blank", "新しいタブで開く設定になっている");

  const img = thumbLink?.querySelector("img");
  assertEqual(
    img?.src,
    "https://img.youtube.com/vi/_Bm66BRnM1A/hqdefault.jpg",
    "YouTube公式のサムネイル画像URLが設定される（アプリ側に画像は保存しない）"
  );

  // ---- onBeforeNavigateコールバック ----
  let callbackCalled = false;
  const thumbLinkWithCallback = buildMvThumbnailElement("https://www.youtube.com/watch?v=abc123", {
    onBeforeNavigate: () => {
      callbackCalled = true;
    },
  });
  thumbLinkWithCallback.dispatchEvent(new Event("click"));
  assertEqual(callbackCalled, true, "onBeforeNavigateはクリック時に呼ばれる");
}
