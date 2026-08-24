// 新曲のセンター就任などを祝う、期間限定のお祝いポップアップの表示条件・既読管理を
// 担当するファイル（2026-08-24新設、本人指示）。
//
// 【表示条件の考え方】「更新するボタンを押したから」ではなく、「お祝い対象の楽曲データが
// 揃っていて（＝アプリの更新が反映済みという意味になる）、まだこのプレイヤーが見ていない」
// ことだけを条件にする。js/main.jsの自動更新の仕組み（本人指示により「更新する」ボタンを
// 撤廃し、安全な画面に来たときだけ自動でリロードする設計に変更）と自然に噛み合う：
// 新しいコードに切り替わった直後の最初のホーム画面表示で、初めて条件が揃うことになる。
//
// 【複数プレイヤー運用時の注意】既読フラグはプレイヤーごとに別キーで保存するため、
// 1台の端末を複数プレイヤーで使い分けている場合、プレイヤーごとに1回ずつ表示される。

const CELEBRATIONS = [
  {
    id: "obaCenterNatsunagori",
    songId: "natsunagori-summer-tune",
    centerMemberName: "大場花菜",
    heading: "はなちゃん",
    subheading: "センターおめでとう！",
    singleLine: "＝LOVE 21stシングル カップリング曲",
    songTitle: "『夏名残サマーチューン』",
    songMeta: "MV公開！",
    youtubeUrl: "https://www.youtube.com/watch?v=_Bm66BRnM1A",
    youtubeVideoId: "_Bm66BRnM1A",
  },
];

function buildSeenStorageKey(playerKeyPrefix, celebrationId) {
  return `equalLoveIntroQuiz.${playerKeyPrefix}seenCelebration.${celebrationId}`;
}

function isCelebrationSeen(playerKeyPrefix, celebrationId) {
  try {
    return localStorage.getItem(buildSeenStorageKey(playerKeyPrefix, celebrationId)) === "true";
  } catch {
    // localStorageが使えない環境（プライベートブラウジング等）でも、アプリ自体は
    // 問題なく動き続けられるようにする。既読管理ができないだけで、他機能には影響しない。
    return false;
  }
}

function markCelebrationSeen(playerKeyPrefix, celebrationId) {
  try {
    localStorage.setItem(buildSeenStorageKey(playerKeyPrefix, celebrationId), "true");
  } catch {
    // 保存できなくても致命的ではない（次回また出るだけで、他機能への影響は無い）
  }
}

// 曲データ（SONGS）とプレイヤー識別子から、今表示すべきお祝いを1件だけ返す
// （複数条件を同時に満たしても最初の1件だけ。今のところ同時に複数出す想定は無い）。
// 対象曲が存在しない・センターが確認できていない（center未設定）・既に見た、の
// いずれかに該当すればnullを返す（＝呼び出し側は何もしなくてよい）。
export function findEligibleCelebration(songs, playerKeyPrefix) {
  for (const celebration of CELEBRATIONS) {
    const song = songs.find((s) => s.id === celebration.songId);
    if (!song || !song.center?.includes(celebration.centerMemberName)) continue;
    if (isCelebrationSeen(playerKeyPrefix, celebration.id)) continue;
    return celebration;
  }
  return null;
}

// お祝いポップアップ内の紙吹雪演出。js/decorations.jsのrenderBackgroundSparkles()と
// 同じ考え方（ランダムな位置・タイミングで、決まった数だけ敷き詰める）。
const CONFETTI_COLORS = ["#ff9f4d", "#ffd93d", "#ffffff", "#ff8fc0"];
const CONFETTI_COUNT = 22;

function renderConfetti(container) {
  container.innerHTML = "";
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const piece = document.createElement("span");
    piece.className = "celebration-confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDuration = `${3.4 + Math.random() * 2.4}s`;
    piece.style.animationDelay = `${Math.random() * 3}s`;
    const size = 5 + Math.random() * 5;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    container.appendChild(piece);
  }
}

// elements: {
//   overlay, confettiField, heading, subheading, singleLine, songTitle, songMeta,
//   thumbLink, thumbImage, playBadge, mvButton, seenButton,
// }
export function initCenterCelebration(elements) {
  elements.seenButton.addEventListener("click", () => {
    const celebrationId = elements.overlay.dataset.celebrationId;
    const playerKeyPrefix = elements.overlay.dataset.playerKeyPrefix;
    if (celebrationId) {
      markCelebrationSeen(playerKeyPrefix, celebrationId);
    }
    elements.overlay.hidden = true;
  });
}

// 表示条件を満たしていれば、実際にポップアップを組み立てて表示する。
// 満たしていなければ何もしない（呼び出し側は条件分岐を書かなくてよい）。
export function showCenterCelebrationIfEligible(songs, playerKeyPrefix, elements) {
  const celebration = findEligibleCelebration(songs, playerKeyPrefix);
  if (!celebration) return;

  elements.overlay.dataset.celebrationId = celebration.id;
  elements.overlay.dataset.playerKeyPrefix = playerKeyPrefix;
  elements.heading.textContent = celebration.heading;
  elements.subheading.textContent = celebration.subheading;
  elements.singleLine.textContent = celebration.singleLine;
  elements.songTitle.textContent = celebration.songTitle;
  elements.songMeta.textContent = celebration.songMeta;
  // 「MVを見るボタン」「サムネイル自体のタップ」の両方から同じ公式MVへ移動できるようにする
  // （本人指示・2026-08-24）。
  elements.mvButton.href = celebration.youtubeUrl;
  elements.thumbLink.href = celebration.youtubeUrl;

  // MVサムネイルはYouTube側のURLをそのまま参照するだけで、アプリ側には一切保存しない。
  // 読み込みに失敗した場合（オフライン等）は、自動的にオレンジのプレースホルダーへ切り替える。
  elements.thumbImage.hidden = false;
  elements.playBadge.hidden = true;
  elements.thumbImage.onerror = () => {
    elements.thumbImage.hidden = true;
    elements.playBadge.hidden = false;
  };
  elements.thumbImage.src = `https://img.youtube.com/vi/${celebration.youtubeVideoId}/hqdefault.jpg`;

  renderConfetti(elements.confettiField);
  elements.overlay.hidden = false;
}
