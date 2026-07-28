// 称号ごとの「メダル風アイコン」を組み立てる、表示専用のヘルパーファイル。
// titleDisplay.js（結果画面のチップ）とtitleList.js（称号一覧のカード）の両方が
// 同じ見た目のアイコンを必要とするため、SVGの中身をここに1箇所だけ持たせておく
// （表示の一貫性を保つためのヘルパーで、称号の判定・保存ロジックとは無関係）。
//
// パーフェクト・イントロマスター・＝LOVE皆伝の3つは、すでにこのゲームの他の場所
//（タイトルロゴ、ランクバッジ）で使っているSVGパスをそのまま流用している。
// 電光石火・ひらめきの2つだけ、この称号のために新しく描き起こしたシンプルな図形。
const ICON_DEFINITIONS = {
  perfect: {
    // タイトルロゴ・ランクバッジの飾りと同じ、星を添えた特別仕様のスパークル星をそのまま流用
    viewBox: "0 0 16 16",
    markup: '<path d="M8 0 9.4 6.6 16 8 9.4 9.4 8 16 6.6 9.4 0 8 6.6 6.6Z"/>',
  },
  introMaster: {
    // タイトルロゴの音符アイコンをそのまま流用（星の飾りは小さすぎて潰れるため省略）
    viewBox: "0 0 28 28",
    markup:
      '<path d="M9 20V8.4a1 1 0 0 1 .79-.98l8-1.8A1 1 0 0 1 19 6.6V17a3 3 0 1 1-2-2.83V9.1l-6 1.35v9.55a3 3 0 1 1-2-2.83Z"/>',
  },
  lightningFast: {
    // 新規デザイン：稲妻のシルエット
    viewBox: "0 0 24 24",
    markup: '<path d="M7 2v11h3v9l7-12h-4l4-8z"/>',
  },
  equalLoveKaiden: {
    // ランクバッジのSランクで使っている王冠をそのまま流用
    viewBox: "0 0 24 16",
    markup: '<path d="M2 14 1 5 6 9 12 2 18 9 23 5 22 14Z"/>',
  },
  inspiration: {
    // 新規デザイン：電球のシルエット（円＋台座の長方形の組み合わせ）
    viewBox: "0 0 24 24",
    markup: '<circle cx="12" cy="10" r="7"/><rect x="9" y="19" width="6" height="3" rx="1.5"/>',
  },
};

// 解放済みの称号1件分の、アイコン入りメダルを組み立てる。
export function buildTitleIconMedal(titleId) {
  const medal = document.createElement("span");
  medal.classList.add("title-icon-medal");

  const definition = ICON_DEFINITIONS[titleId];
  if (definition) {
    medal.innerHTML =
      `<svg viewBox="${definition.viewBox}" fill="currentColor" aria-hidden="true">${definition.markup}</svg>`;
  }

  return medal;
}

// ロック中（称号一覧でまだ解放されていない）称号のメダルを組み立てる。
// アイコンの形で正体が分かってしまうと「？？？」で伏せている意味がなくなるため、
// 称号ごとのアイコンは使わず、「？」の文字だけを見せる控えめな見た目にする。
export function buildLockedIconMedal() {
  const medal = document.createElement("span");
  medal.classList.add("title-icon-medal", "is-locked");
  medal.textContent = "？";
  return medal;
}
