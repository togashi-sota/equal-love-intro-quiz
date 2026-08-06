// 称号（実績）ごとの、シンプルなSVGアイコンを組み立てる表示専用ヘルパー。
// 著作権のある画像素材・外部アイコンフォントは使わず、単純な図形のみで構成する
// （本人指示）。色の違いはSVGパス自体を分けず、CSS側（.achievement-icon-medal.is-{iconKey}）で
// 塗り分ける方針にし、パスの管理を最小限にしている。
//
// ノーミス系5段階（ブロンズ〜ノーミスマスター）は同じ盾の形を共通で使い、CSSの配色だけで
// 段階差を出す（本人イメージ：銅→銀→金→白銀＋水色→星入り王冠、のうち「星入り王冠」だけは
// 専用の形にしている）。
const SHIELD_PATH =
  '<path d="M12 1 21 4.5V11c0 6-3.8 9.7-9 12-5.2-2.3-9-6-9-12V4.5Z"/>' +
  '<path d="M8.3 12.2 10.8 14.7 15.8 9.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';

const ICON_DEFINITIONS = {
  no_miss_bronze: { viewBox: "0 0 24 24", markup: SHIELD_PATH },
  no_miss_silver: { viewBox: "0 0 24 24", markup: SHIELD_PATH },
  no_miss_gold: { viewBox: "0 0 24 24", markup: SHIELD_PATH },
  no_miss_platinum: { viewBox: "0 0 24 24", markup: SHIELD_PATH },
  no_miss_master: {
    // 星入り王冠：既存のランクバッジ・タイトルロゴと同じ星を、王冠のシルエットに乗せる
    viewBox: "0 0 24 20",
    markup:
      '<path d="M2 18 1 6 7 11 12 2 17 11 23 6 22 18Z"/>' +
      '<path d="M12 6.2 12.7 8.4 15 9 12.7 9.6 12 11.8 11.3 9.6 9 9 11.3 8.4Z" fill="#fff"/>',
  },
  full_chorus_master: {
    // レコード盤＋音符（フルコーラス＝曲全体を表すイメージ）
    viewBox: "0 0 24 24",
    markup:
      '<circle cx="9" cy="9" r="7.5"/>' +
      '<circle cx="9" cy="9" r="2" fill="#fff"/>' +
      '<path d="M14 6V17a2.2 2.2 0 1 1-1.4-2.06V8.2Z"/>',
  },
  song_master: {
    // ゴールドマイク
    viewBox: "0 0 24 24",
    markup:
      '<rect x="9.5" y="2" width="5" height="11" rx="2.5"/>' +
      '<path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M12 17v4M9 21h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  },
  lightning_fast: {
    // 電光石火：稲妻（旧称号アイコンと同じ形を踏襲）
    viewBox: "0 0 24 24",
    markup: '<path d="M7 2v11h3v9l7-12h-4l4-8z"/>',
  },
  melody_ace: {
    // メロディアス：連なる音符
    viewBox: "0 0 24 24",
    markup:
      '<circle cx="5.5" cy="18.5" r="2.5"/>' +
      '<circle cx="14.5" cy="16.5" r="2.5"/>' +
      '<path d="M8 18.5V6l9-2v12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  lyric_master: {
    // 開いた本＋羽ペン
    viewBox: "0 0 24 24",
    markup:
      '<path d="M3 5c2.5-1 5-1 8 0v14c-3-1-5.5-1-8 0Z"/>' +
      '<path d="M21 5c-2.5-1-5-1-8 0v14c3-1 5.5-1 8 0Z"/>' +
      '<path d="M19 2 20.5 3.5 13 11l-2 .5.5-2Z" fill="#fff"/>',
  },
  equal_love_master: {
    // 金色の王冠（旧＝LOVE皆伝と同じ王冠シルエット）
    viewBox: "0 0 24 16",
    markup: '<path d="M2 14 1 5 6 9 12 2 18 9 23 5 22 14Z"/>',
  },
  equal_love_complete: {
    // 王冠＋中央にダイヤ（＝LOVEマスターとの違いが一目で分かるよう、ダイヤを追加）
    viewBox: "0 0 24 20",
    markup:
      '<path d="M2 16 1 7 6 11 12 4 18 11 23 7 22 16Z"/>' +
      '<path d="M12 0 15.5 3 12 8 8.5 3Z" fill="#fff"/>',
  },
};

function buildMedal(iconKey, extraClass) {
  const medal = document.createElement("span");
  medal.classList.add("achievement-icon-medal", `is-${iconKey}`);
  if (extraClass) medal.classList.add(extraClass);

  const definition = ICON_DEFINITIONS[iconKey];
  if (definition) {
    medal.innerHTML = `<svg viewBox="${definition.viewBox}" fill="currentColor" aria-hidden="true">${definition.markup}</svg>`;
  }
  return medal;
}

// 解放済みの称号1件分の、アイコン入りメダルを組み立てる。
export function buildAchievementIconMedal(iconKey) {
  return buildMedal(iconKey, "is-unlocked");
}

// ロック中（未取得）の称号のメダル。形は見せず、鍵マークだけの控えめな見た目にする。
export function buildLockedAchievementIconMedal() {
  const medal = document.createElement("span");
  medal.classList.add("achievement-icon-medal", "is-locked");
  medal.innerHTML =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<rect x="5" y="10" width="14" height="10" rx="2"/>' +
    '<path d="M8 10V7a4 4 0 1 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>' +
    "</svg>";
  return medal;
}
