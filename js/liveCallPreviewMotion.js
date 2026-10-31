// 曲のページ（コールを覚える）の3つのカードの「動く見本」（2026-11-01 nx-live 新設）。
// ライブコール・カラオケのカードでは、本物の画面をダミーの文字で撮った数秒の無音ループ（H.264 の mp4）を、静止画の上に重ねて流す。
//
// 【安定のための決まり】
//   ・まず静止画（同じ場面の1コマ）を出す。動画は「画面に見えている」「視差効果を減らす設定ではない」「ページが表に出ている」ときだけ再生する。
//     見えなくなったら止める。視差効果を減らす設定に変わったら止めて静止画に戻す。
//   ・動画の読み込みは、初めて見えたときだけ（preload="none" で、見える前は1バイトも読まない）。
//   ・muted・playsinline・loop・autoplay しない（自分で play を呼ぶ）。iPhone の低電力モードなどで再生できないとき（play が失敗する）・
//     読み込めないとき（オフライン：mp4 は Service Worker のキャッシュに入れていない）は、静止画のまま（動画は透明のまま）。
//   ・実際に再生が始まった（playing）ときだけ動画を見せる（再生できない端末で、黒い四角や再生ボタンが出ない）。
//   ・mp4 を APP_SHELL に入れない理由：iPhone の Safari は動画を「範囲の指定つき」で読みに来るが、sw.js のキャッシュは全体を返すため、
//     キャッシュから返すと再生できないことがある。オフラインでは静止画（APP_SHELL に入っている）を出す。

// 見本を動かしてよいか（純粋関数）。reducedMotion：視差効果を減らす設定。saveData：データ節約の設定
export function previewMotionAllowed({ reducedMotion = false, saveData = false } = {}) {
  return !reducedMotion && !saveData;
}

// いま再生するか（純粋関数）。visible：画面に見えている。pageHidden：ページが裏に回っている
export function shouldPlayPreview({ allowed = true, visible = false, pageHidden = false } = {}) {
  return Boolean(allowed && visible && !pageHidden);
}

function reducedMotionQuery(win) {
  return typeof win?.matchMedia === "function" ? win.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
}

// box（.lc-mode-preview）に、静止画と（あれば）動く見本を入れる。preview：{ src（静止画）, alt, video?（mp4） }、size：{ width, height }。
// 戻り値：{ destroy() }（画面を作り直すときに必ず呼ぶ。見張り・イベントを外し、動画を止めて読み込みを捨てる）
export function mountModePreview(box, preview, size, { win = typeof window === "undefined" ? null : window } = {}) {
  const doc = box.ownerDocument;
  const img = doc.createElement("img");
  img.className = "lc-mode-preview-image";
  img.src = preview.src;
  img.alt = preview.alt;
  img.width = size.width;
  img.height = size.height;
  img.loading = "lazy";
  img.decoding = "async";
  box.appendChild(img);
  if (!preview.video || !win) return { destroy() {} };

  box.classList.add("has-motion");
  const reduced = reducedMotionQuery(win);
  const saveData = Boolean(win.navigator?.connection?.saveData);
  let video = null;
  let visible = false;
  let failed = false;

  const ensureVideo = () => {
    if (video || failed) return video;
    video = doc.createElement("video");
    video.className = "lc-mode-preview-video";
    // 音は無い（-an で作った）が、自動で再生できるように muted を属性とプロパティの両方に付ける（iPhone の Safari の決まり）
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute("muted", "");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.loop = true;
    video.preload = "none";
    video.disablePictureInPicture = true;
    video.setAttribute("disablepictureinpicture", "");
    video.setAttribute("aria-hidden", "true"); // 中身は静止画の alt と同じ。読み上げは静止画の alt だけ
    video.tabIndex = -1;
    video.width = size.width;
    video.height = size.height;
    video.addEventListener("playing", () => box.classList.add("is-playing"));
    video.addEventListener("error", () => {
      // 読み込めない（オフラインなど）：静止画のまま。もう作り直さない
      failed = true;
      box.classList.remove("is-playing");
      video?.remove();
      video = null;
    });
    video.src = preview.video;
    box.appendChild(video);
    return video;
  };

  const update = () => {
    const allowed = previewMotionAllowed({ reducedMotion: reduced.matches, saveData });
    if (!allowed) box.classList.remove("is-playing"); // 視差効果を減らす：静止画に戻す
    if (shouldPlayPreview({ allowed, visible, pageHidden: Boolean(doc.hidden) })) {
      const v = ensureVideo();
      if (!v || !v.paused) return;
      const started = v.play();
      if (started && typeof started.catch === "function") started.catch(() => box.classList.remove("is-playing"));
    } else if (video && !video.paused) {
      video.pause();
    }
  };

  let observer = null;
  if (typeof win.IntersectionObserver === "function") {
    observer = new win.IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible = entry.isIntersecting && entry.intersectionRatio >= 0.35;
        update();
      },
      { threshold: [0, 0.35, 0.7] },
    );
    observer.observe(box);
  }
  // IntersectionObserver の無い古い端末：動かさない（静止画のまま）
  const onVisibility = () => update();
  doc.addEventListener("visibilitychange", onVisibility);
  const onReducedChange = () => update();
  if (typeof reduced.addEventListener === "function") reduced.addEventListener("change", onReducedChange);

  return {
    destroy() {
      observer?.disconnect();
      doc.removeEventListener("visibilitychange", onVisibility);
      if (typeof reduced.removeEventListener === "function") reduced.removeEventListener("change", onReducedChange);
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load(); // 読み込み中のデータを捨てる
        video.remove();
        video = null;
      }
    },
  };
}
