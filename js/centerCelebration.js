// 新曲公開・センター就任などを祝う、期間限定のお祝い／案内ポップアップの表示条件・
// 既読管理を担当するファイル（2026-08-24新設、同日全面刷新、2026-08-25複数件対応に拡張）。
//
// 【デザインについて】見た目は本人がChatGPTで作成した1枚の完成画像（assets/images/）を
// そのまま使用する。点線枠の位置に実際のMVサムネイル、「MVを見る」「見た！」の位置に
// 透明なクリック領域を重ねるだけで、CSS/SVGでの再現はしない（画像ごとにレイアウトが
// 異なるため、位置は各CELEBRATIONSエントリのlayoutフィールドにpx実測値から算出した
// %値として持たせ、表示時にインラインstyleで適用する。CSS側は位置を持たない）。
//
// 【表示条件の考え方】「更新するボタンを押したから」ではなく、「対象となる条件（曲データ・
// センター等、無ければ常に対象）が揃っていて、まだこの起動中に見ていない」ことだけを
// 条件にする。js/main.jsの自動更新の仕組み（本人指示により「更新する」ボタンを撤廃し、
// 安全な画面に来たときだけ自動でリロードする設計）と自然に噛み合う。
//
// 【複数件を順番に表示する仕組み（2026-08-25追加）】CELEBRATIONS配列の並び順どおりに、
// 「未読で条件を満たしている最初の1件」を表示する。「見た！」を押すと、そのお祝いだけを
// 既読にしたうえで、再度findEligibleCelebration()を呼び直す。次に条件を満たす未読の
// お祝いが見つかれば、同じオーバーレイの中身を差し替えて続けて表示する（大場花菜→夢の続き、
// のように連続表示できる）。無ければオーバーレイを閉じてホーム画面へ戻る。
//
// 【既読の扱い（2026-08-24改訂・本人指示）】「見た！」を押しても永久には非表示にしない。
// sessionStorageで管理しているため、アプリを完全に閉じてから開き直すと、同じお祝いの
// 開催期間中はまた表示される（sessionStorageは新しいタブ・新しいPWA起動のたびにリセット
// される）。お祝いの終了は日付等で自動判定せず、本人が今後CELEBRATIONS配列から該当の
// エントリを取り除くまで表示を続ける。
//
// 【複数プレイヤー運用時の注意】既読フラグはプレイヤーごとに別キーで保存するため、
// 1台の端末を複数プレイヤーで使い分けている場合、プレイヤーごとに独立して表示される。

const CELEBRATIONS = [
  {
    id: "obaCenterNatsunagori",
    songId: "natsunagori-summer-tune",
    centerMemberName: "大場花菜",
    backgroundImageSrc: "assets/images/center-celebration-oba-natsunagori.webp",
    youtubeUrl: "https://www.youtube.com/watch?v=_Bm66BRnM1A",
    youtubeVideoId: "_Bm66BRnM1A",
    ariaLabel: "祝！はなちゃんセンターおめでとう！＝LOVE 21stシングル カップリング曲『夏名残サマーチューン』MV公開！",
    // 縦長画像（1023×1537px、幅:高さ比 約2:3）。標準のカード幅・余白のままで十分な存在感になる。
    frameMaxWidth: "420px",
    overlayPadding: "16px",
    // 本人から預かった背景画像（1023×1537px）を実測して求めた値を%に変換したもの（10-24章と同じ手法）。
    layout: {
      thumb: { left: 15.4, top: 46.8, width: 68.4, height: 26.5 },
      mvHotspot: { left: 14.5, top: 76.0, width: 69.7, height: 7.7 },
      seenHotspot: { left: 14.5, top: 85.5, width: 69.7, height: 8.4 },
    },
  },
  {
    id: "yumeNoTsuzuki",
    // songId/centerMemberNameを指定しない＝曲データの有無やセンターと無関係に、常に対象と
    // なる「お知らせ系」のお祝い（21stシングル カップリング曲「夢の続き」のMV公開案内）。
    // songs.jsにまだ「夢の続き」自体を登録していなくても表示できるようにする
    // （曲データ自体の追加は別タスク、HANDOFF.md 18章参照）。
    backgroundImageSrc: "assets/images/celebration-yume-no-tsuzuki.webp",
    youtubeUrl: "https://www.youtube.com/watch?v=RjHjQlEjs_E",
    youtubeVideoId: "RjHjQlEjs_E",
    ariaLabel: "＝LOVE 21stシングル カップリング曲『夢の続き』MV公開！",
    // 【2026-08-26改訂】当初の横長画像（1536×1024px）は縦長画像（obaCenterNatsunagori）より
    // 小さく見えるという実機フィードバックを受け、本人が国立競技場を背景にした縦長画像
    // （1024×1536px、obaCenterNatsunagoriとほぼ同じ縦横比）に作り直した。MV枠が横長の
    // ダミー枠を含む構図になり、実際のMVサムネイル（国立競技場で撮影）を重ねると背景の
    // 国立競技場と自然につながって見えるデザイン（本人承認済み、17-13章参照）。
    // 縦長画像なのでobaCenterNatsunagoriと同じ幅上限・余白に戻す。
    frameMaxWidth: "420px",
    overlayPadding: "16px",
    // 本人から預かった新しい背景画像（1024×1536px）を実測して求めた値を%に変換したもの。
    layout: {
      thumb: { left: 9.77, top: 26.76, width: 80.37, height: 31.64 },
      mvHotspot: { left: 21.09, top: 77.6, width: 58.3, height: 8.66 },
      seenHotspot: { left: 21.09, top: 89.39, width: 58.3, height: 8.14 },
    },
  },
];

function buildSeenStorageKey(playerKeyPrefix, celebrationId) {
  return `equalLoveIntroQuiz.${playerKeyPrefix}seenCelebration.${celebrationId}`;
}

// 【2026-08-24改訂・本人指示】以前はlocalStorageで永久に既読管理していたが、
// 「アプリを閉じて開き直したら、同じお祝い期間中はまた表示したい」という指示に合わせて
// sessionStorageに変更した。sessionStorageは今の起動（タブ／PWAセッション）を閉じると
// 自動的に消えるため、「見た！」は「この起動中だけ非表示にする」という意味になる。
function isCelebrationSeen(playerKeyPrefix, celebrationId) {
  try {
    return sessionStorage.getItem(buildSeenStorageKey(playerKeyPrefix, celebrationId)) === "true";
  } catch {
    // sessionStorageが使えない環境（プライベートブラウジング等）でも、アプリ自体は
    // 問題なく動き続けられるようにする。既読管理ができないだけで、他機能には影響しない。
    return false;
  }
}

function markCelebrationSeen(playerKeyPrefix, celebrationId) {
  try {
    sessionStorage.setItem(buildSeenStorageKey(playerKeyPrefix, celebrationId), "true");
  } catch {
    // 保存できなくても致命的ではない（次にお祝いを表示するか判定するときにまた出るだけ）
  }
}

// 曲データ（SONGS）とプレイヤー識別子から、今表示すべきお祝いを1件だけ返す
// （CELEBRATIONSの並び順どおり、条件を満たし未読の最初の1件）。
// songId未指定のエントリは曲データを一切見ず、未読であれば常に対象になる。
// songId指定のエントリは、対象曲が存在しない・センターが確認できていない（center未設定）・
// センターが対象メンバーと一致しない・この起動中に既に見た、のいずれかに該当すれば
// スキップする（＝呼び出し側は何もしなくてよい）。
export function findEligibleCelebration(songs, playerKeyPrefix) {
  for (const celebration of CELEBRATIONS) {
    if (celebration.songId) {
      const song = songs.find((s) => s.id === celebration.songId);
      if (!song) continue;
      if (celebration.centerMemberName && !song.center?.includes(celebration.centerMemberName)) continue;
    }
    if (isCelebrationSeen(playerKeyPrefix, celebration.id)) continue;
    return celebration;
  }
  return null;
}

// お祝い表示中は、背後のホーム画面を完全に操作不能にする（本人指示）。
// オーバーレイ自体は.modal-overlay（position:fixed; inset:0、17-17章のセーフエリア対策込みで
// css/style.cssの.modal-overlay.celebration-overlay参照）で背後のクリック・タップを
// 塞いでいるが、ページ本体（body）がビューポートより縦に長い場合、オーバーレイの上での
// スワイプ操作でオーバーレイの「後ろ側」のページがスクロールしてしまうことがあるため、
// 表示中はbodyの位置を固定してスクロールできないようにし、閉じたら元の位置に戻す。
// js/lyricsFullscreen.jsのlockBodyScroll()と同じ、実機でも実績のある構成
// （17-16章の調査で、この方式自体は原因ではないと確認済み）。
let lockedScrollY = 0;
let isBackgroundScrollLocked = false;

// 【2026-08-26追記・17-18章】17-17章のenv(safe-area-inset-bottom)対策を実機で確認したところ、
// 白い帯の見え方が変化しなかった。本人と実機の実測値（オーバーレイはwindow.innerHeightまで
// 完全に届いている）から検討した結果、この白い帯はDOM要素（オーバーレイ・body）の
// 「範囲が足りない」問題ではなく、iOS standalone PWAのホームインジケーター側セーフエリアを、
// WebKitがhtml/bodyのレイアウト・サイズ計算そのものとは別枠で、html要素の背景色だけを
// 敷き詰めて描画する仕組みになっている（＝position:fixedの要素やCSSのheight/inset計算が
// 原理的に届かない領域がある）ためだと判断した。この領域へ実際のホーム画面・オーバーレイの
// 内容を描画することはWebKit側の制約上できないため、「無地の白」ではなく「お祝い表示中の
// 半透明オーバーレイをこの端末の通常の背景色の上に重ねたときと近い色」を、お祝い表示中だけ
// html・bodyの背景として一時的に敷くことで、白い帯が完全に浮かないようにする
// （本人指示：完全再現できないなら、違和感のない色へのfallbackで良い）。
// rgba(20, 40, 60, 0.55)（.celebration-overlayの背景）を、通常時の背景グラデーションの
// 終点寄りの色（css/style.cssの--color-background-end: #dff2ff）の上に重ねた場合の
// 近似値を採用している（正確な合成値である必要はなく、見た目の違和感を減らす目的のため）。
const SAFE_AREA_FALLBACK_BACKGROUND = "#6f8394";

function lockBackgroundScroll() {
  if (isBackgroundScrollLocked) {
    return; // 連続表示（大場花菜→夢の続き）の間、bodyの二重ロックはしない
  }
  isBackgroundScrollLocked = true;
  lockedScrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.overflow = "hidden";
  document.documentElement.style.background = SAFE_AREA_FALLBACK_BACKGROUND;
  document.body.style.background = SAFE_AREA_FALLBACK_BACKGROUND;
}

function unlockBackgroundScroll() {
  if (!isBackgroundScrollLocked) return;
  isBackgroundScrollLocked = false;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.overflow = "";
  document.documentElement.style.background = "";
  document.body.style.background = "";
  window.scrollTo(0, lockedScrollY);
}

// %指定の矩形（{left, top, width, height}）を要素へインラインstyleとして適用する。
function applyLayoutRect(element, rect) {
  element.style.left = `${rect.left}%`;
  element.style.top = `${rect.top}%`;
  element.style.width = `${rect.width}%`;
  element.style.height = `${rect.height}%`;
}

// 指定のお祝いの内容をオーバーレイへ反映して表示する（内部ヘルパー）。
function renderCelebration(celebration, playerKeyPrefix, elements) {
  elements.overlay.dataset.celebrationId = celebration.id;
  elements.overlay.dataset.playerKeyPrefix = playerKeyPrefix;
  elements.overlay.setAttribute("aria-label", celebration.ariaLabel);
  elements.bgImage.src = celebration.backgroundImageSrc;
  elements.bgImage.alt = celebration.ariaLabel;

  // カードの最大幅・オーバーレイの余白を、画像の縦横比に合わせて調整する
  // （2026-08-25追加。縦長・横長どちらの画像でも、伸縮・トリミングせず画面幅を
  // 最大限活かせるようにするため。値はcelebration.frameMaxWidth/overlayPaddingが無ければ
  // CSSの既定値（420px／16px）を使う）。
  const frameElement = elements.overlay.querySelector(".celebration-frame");
  frameElement.style.maxWidth = celebration.frameMaxWidth ?? "420px";
  elements.overlay.style.padding = celebration.overlayPadding ?? "16px";

  // 「MVを見る」領域・サムネイル自体のタップの両方から同じ公式MVへ移動できるようにする
  // （本人指示・2026-08-24）。
  elements.mvButton.href = celebration.youtubeUrl;
  elements.thumbLink.href = celebration.youtubeUrl;
  elements.mvButton.setAttribute("aria-label", "MVを見る");
  elements.thumbLink.setAttribute("aria-label", "MVを見る");

  applyLayoutRect(elements.thumbLink, celebration.layout.thumb);
  applyLayoutRect(elements.mvButton, celebration.layout.mvHotspot);
  applyLayoutRect(elements.seenButton, celebration.layout.seenHotspot);

  // MVサムネイルはYouTube側のURLをそのまま参照するだけで、アプリ側には一切保存しない。
  // 【2026-08-26追記】まず上下に黒帯の入らない高解像度版（maxresdefault.jpg、1280×720の
  // 16:9）を試し、その動画に用意されていない場合（YouTube側でmaxresdefaultが生成されない
  // 動画もある）だけ、必ず存在する標準解像度（hqdefault.jpg、480×360の4:3、動画によっては
  // 上下に黒帯が入る）へ自動的に切り替える。黒帯が入っても表示自体は今までどおり成立する
  // ため、実害はない安全なフォールバック。どちらも読み込みに失敗した場合（オフライン等）は
  // 非表示にし、背景画像の点線枠だけが見える状態にする。
  elements.thumbImage.hidden = false;
  elements.thumbImage.dataset.triedFallback = "false";
  const fallbackToHqDefault = () => {
    if (elements.thumbImage.dataset.triedFallback === "true") {
      elements.thumbImage.hidden = true; // hqdefaultも失敗した場合だけ非表示にする
      return;
    }
    elements.thumbImage.dataset.triedFallback = "true";
    elements.thumbImage.src = `https://img.youtube.com/vi/${celebration.youtubeVideoId}/hqdefault.jpg`;
  };
  elements.thumbImage.onerror = fallbackToHqDefault;
  // 【重要】maxresdefault.jpgが用意されていない動画では、YouTube側が404ではなく
  // 120×90のグレーのプレースホルダー画像をHTTP 200で返すことがある（onerrorが発火しない）。
  // 読み込み後に極端に小さい場合はプレースホルダーとみなし、hqdefaultへ切り替える。
  elements.thumbImage.onload = () => {
    if (elements.thumbImage.dataset.triedFallback === "false" && elements.thumbImage.naturalWidth <= 120) {
      fallbackToHqDefault();
    }
  };
  elements.thumbImage.src = `https://img.youtube.com/vi/${celebration.youtubeVideoId}/maxresdefault.jpg`;

  elements.overlay.hidden = false;
  lockBackgroundScroll();
}

// elements: { overlay, bgImage, thumbLink, thumbImage, mvButton, seenButton }
// songs: SONGS配列（次のお祝いへ進む際、findEligibleCelebration()を呼び直すために必要）。
export function initCenterCelebration(elements, songs) {
  elements.seenButton.addEventListener("click", () => {
    const celebrationId = elements.overlay.dataset.celebrationId;
    const playerKeyPrefix = elements.overlay.dataset.playerKeyPrefix;
    if (celebrationId) {
      markCelebrationSeen(playerKeyPrefix, celebrationId);
    }

    // 次に表示すべきお祝いがあれば、同じオーバーレイの中身を差し替えて続けて表示する
    // （大場花菜→夢の続き、のように連続表示するための仕組み。2026-08-25追加）。
    const next = findEligibleCelebration(songs ?? [], playerKeyPrefix);
    if (next) {
      renderCelebration(next, playerKeyPrefix, elements);
      return;
    }

    elements.overlay.hidden = true;
    unlockBackgroundScroll();
  });
}

// 表示条件を満たしていれば、実際にポップアップを組み立てて表示する。
// 満たしていなければ何もしない（呼び出し側は条件分岐を書かなくてよい）。
export function showCenterCelebrationIfEligible(songs, playerKeyPrefix, elements) {
  const celebration = findEligibleCelebration(songs, playerKeyPrefix);
  if (!celebration) return;
  renderCelebration(celebration, playerKeyPrefix, elements);
}
