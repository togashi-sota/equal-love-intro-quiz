// 新曲のセンター就任などを祝う、期間限定のお祝いポップアップの表示条件・既読管理を
// 担当するファイル（2026-08-24新設、同日全面刷新・本人指示）。
//
// 【デザインについて】見た目は本人がChatGPTで作成した1枚の完成画像（assets/images/）を
// そのまま使用する。点線枠の位置に実際のMVサムネイル、「MVを見る」「見た！」の位置に
// 透明なクリック領域を重ねるだけで、CSS/SVGでの再現はしない（index.html・css/style.css
// 側で位置を%指定しているため、この一覧の担当は「何を表示するか」の判定と既読管理のみ）。
//
// 【表示条件の考え方】「更新するボタンを押したから」ではなく、「お祝い対象の楽曲データが
// 揃っていて（＝アプリの更新が反映済みという意味になる）、まだこの起動中に見ていない」
// ことだけを条件にする。js/main.jsの自動更新の仕組み（本人指示により「更新する」ボタンを
// 撤廃し、安全な画面に来たときだけ自動でリロードする設計）と自然に噛み合う。
//
// 【既読の扱い（2026-08-24改訂・本人指示）】「見た！」を押しても永久には非表示にしない。
// sessionStorageで管理しているため、アプリを完全に閉じてから開き直すと、同じお祝いの
// 開催期間中はまた表示される（sessionStorageは新しいタブ・新しいPWA起動のたびにリセット
// される）。お祝いの終了は日付等で自動判定せず、本人が今後CELEBRATIONS配列から該当の
// エントリを取り除くまで表示を続ける。
//
// 【複数プレイヤー運用時の注意】既読フラグはプレイヤーごとに別キーで保存するため、
// 1台の端末を複数プレイヤーで使い分けている場合、プレイヤーごとに独立して表示される。
//
// 【将来の「お祝いボード」について】終了したお祝いを後から見返せるページは今回は作らない。
// ただし、他のメンバーのお祝いを今後追加しやすいよう、また終了後のお祝いを別画面で
// 再利用しやすいよう、各お祝いの情報（背景画像・MVリンク等）はCELEBRATIONS配列に
// 1件ずつまとめてある。

const CELEBRATIONS = [
  {
    id: "obaCenterNatsunagori",
    songId: "natsunagori-summer-tune",
    centerMemberName: "大場花菜",
    backgroundImageSrc: "assets/images/center-celebration-oba-natsunagori.webp",
    youtubeUrl: "https://www.youtube.com/watch?v=_Bm66BRnM1A",
    youtubeVideoId: "_Bm66BRnM1A",
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
// （複数条件を同時に満たしても最初の1件だけ。今のところ同時に複数出す想定は無い）。
// 対象曲が存在しない・センターが確認できていない（center未設定）・この起動中に既に見た、の
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

// お祝い表示中は、背後のホーム画面を完全に操作不能にする（本人指示）。
// オーバーレイ自体は.modal-overlay（position:fixed; inset:0）で背後のクリック・タップを
// 塞いでいるが、ページ本体（body）がビューポートより縦に長い場合、オーバーレイの上での
// スワイプ操作でオーバーレイの「後ろ側」のページがスクロールしてしまうことがあるため、
// 表示中はbodyの位置を固定してスクロールできないようにし、閉じたら元の位置に戻す。
let lockedScrollY = 0;

function lockBackgroundScroll() {
  lockedScrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.overflow = "hidden";
}

function unlockBackgroundScroll() {
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.overflow = "";
  window.scrollTo(0, lockedScrollY);
}

// elements: { overlay, bgImage, thumbLink, thumbImage, mvButton, seenButton }
export function initCenterCelebration(elements) {
  elements.seenButton.addEventListener("click", () => {
    const celebrationId = elements.overlay.dataset.celebrationId;
    const playerKeyPrefix = elements.overlay.dataset.playerKeyPrefix;
    if (celebrationId) {
      markCelebrationSeen(playerKeyPrefix, celebrationId);
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

  elements.overlay.dataset.celebrationId = celebration.id;
  elements.overlay.dataset.playerKeyPrefix = playerKeyPrefix;
  elements.bgImage.src = celebration.backgroundImageSrc;

  // 「MVを見る」領域・サムネイル自体のタップの両方から同じ公式MVへ移動できるようにする
  // （本人指示・2026-08-24）。
  elements.mvButton.href = celebration.youtubeUrl;
  elements.thumbLink.href = celebration.youtubeUrl;

  // MVサムネイルはYouTube側のURLをそのまま参照するだけで、アプリ側には一切保存しない。
  // 読み込みに失敗した場合（オフライン等）は非表示にし、背景画像の点線枠だけが見える
  // 状態にフォールバックする。
  elements.thumbImage.hidden = false;
  elements.thumbImage.onerror = () => {
    elements.thumbImage.hidden = true;
  };
  elements.thumbImage.src = `https://img.youtube.com/vi/${celebration.youtubeVideoId}/hqdefault.jpg`;

  elements.overlay.hidden = false;
  lockBackgroundScroll();
}
