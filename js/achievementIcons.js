// 称号（実績）ごとの、シンプルなSVGアイコンを組み立てる表示専用ヘルパー。
// 著作権のある画像素材・外部アイコンフォントは使わず、単純な図形のみで構成する
// （本人指示）。色の違いはSVGパス自体を分けず、CSS側（.achievement-icon-medal.is-{iconKey}）で
// 塗り分ける方針にし、パスの管理を最小限にしている。
//
// 成長段階系（イントロ/シャッフル/リリック）3系統の基本形。ノーミス系5段階と同じ考え方で、
// 系統内はビギナー〜エースまで同じ形を共有し、CSS側の色だけで段階差を出す。
// エースだけは、この基本形に加えて右上に小さな星（ACE_BADGE_PATH）を1つ足し、
// 「3段階の中でもっとも到達した」ことが一目で分かるようにする（本人指示・2026-08-13：
// 3段階の差は視覚的に分かりやすく、ただし既存の最上位称号より控えめにすること）。
const HEADPHONE_PATH =
  '<path d="M12 2a7 7 0 0 0-7 7v6a2.4 2.4 0 0 0 2.4 2.4H9v-7H6.5V9a5.5 5.5 0 0 1 11 0v.5H15v7h1.6A2.4 2.4 0 0 0 19 15V9a7 7 0 0 0-7-7Z"/>';
const SHUFFLE_PATH =
  '<path d="M3 7h3.3l10.7 10h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M3 17h3.3l2.6-2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M14 9.5 17 7h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M17.5 4.5 20.5 7l-3 2.5M17.5 14.5l3 2.5-3 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
const LYRIC_CARD_PATH =
  '<rect x="3.5" y="4" width="17" height="16" rx="2.2"/>' +
  '<path d="M7.5 9h9M7.5 12.5h9M7.5 16h5.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>';
const ACE_BADGE_PATH = '<path d="M19.3 0.5 20.3 2.7 22.5 3.6 20.3 4.5 19.3 6.7 18.3 4.5 16.1 3.6 18.3 2.7Z" fill="#fff"/>';

// 【2026-08-30追加・本人指示④】アウトロ系（曲の最後を聞く＝音が消えていくイメージの
// 2音符＋フェードの弧）・一瞬チャレンジ系（ごく短い時間＝ストップウォッチ）の基本形。
// 既存の3系統と同じく、ビギナー〜エースは同じ形を共有し、エースだけACE_BADGE_PATHを足す。
const OUTRO_NOTE_PATH =
  '<path d="M9 16.5V5.5l9-1.8V13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<circle cx="7" cy="17" r="2.5"/>' +
  '<circle cx="16" cy="14.5" r="2.5"/>' +
  '<path d="M19.3 5.8c1.1.9 1.1 2.5 0 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
const STOPWATCH_PATH =
  '<circle cx="12" cy="13" r="8.5"/>' +
  '<path d="M12 13V7.5M12 13 15.5 11" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' +
  '<rect x="10" y="1.5" width="4" height="2.4" rx="1.2"/>';

const ICON_DEFINITIONS = {
  intro_beginner: { viewBox: "0 0 24 24", markup: HEADPHONE_PATH },
  intro_challenger: { viewBox: "0 0 24 24", markup: HEADPHONE_PATH },
  intro_ace: { viewBox: "0 0 24 24", markup: HEADPHONE_PATH + ACE_BADGE_PATH },
  outro_beginner: { viewBox: "0 0 24 24", markup: OUTRO_NOTE_PATH },
  outro_challenger: { viewBox: "0 0 24 24", markup: OUTRO_NOTE_PATH },
  outro_ace: { viewBox: "0 0 24 24", markup: OUTRO_NOTE_PATH + ACE_BADGE_PATH },
  shuffle_beginner: { viewBox: "0 0 24 24", markup: SHUFFLE_PATH },
  shuffle_challenger: { viewBox: "0 0 24 24", markup: SHUFFLE_PATH },
  shuffle_ace: { viewBox: "0 0 24 24", markup: SHUFFLE_PATH + ACE_BADGE_PATH },
  lyric_beginner: { viewBox: "0 0 24 24", markup: LYRIC_CARD_PATH },
  lyric_challenger: { viewBox: "0 0 24 24", markup: LYRIC_CARD_PATH },
  lyric_ace: { viewBox: "0 0 24 24", markup: LYRIC_CARD_PATH + ACE_BADGE_PATH },
  instant_beginner: { viewBox: "0 0 24 24", markup: STOPWATCH_PATH },
  instant_challenger: { viewBox: "0 0 24 24", markup: STOPWATCH_PATH },
  instant_ace: { viewBox: "0 0 24 24", markup: STOPWATCH_PATH + ACE_BADGE_PATH },

  // 【2026-11-XX追加・本人指示：称号マーク未設定の監査で発覚】outro_master・
  // instant_master・complete_finale・instant_flash_answerの4件は、ICON_DEFINITIONSに
  // 項目自体が無く、マーク無し（空のメダル）で表示されていた（css/style.cssの色指定
  // 〈.is-outro_master等〉は既に存在していたため、SVGの中身だけが抜けていた）。
  // 他のマスター/裏チャレンジ称号と同じ「各系統の成長アイコンとは別の、専用の絵柄」という
  // 方針（フルコーラスマスター＝レコード盤、歌マスター＝マイク等）に合わせ、新規に追加する。
  outro_master: {
    // アウトロ系の成長アイコン（音符＋ステム）に、曲の終わりを示す「終止線（二重線）」を
    // 添えたもの＝「曲の終わりを極めた」ことが一目で伝わる絵柄。
    viewBox: "0 0 26 22",
    markup:
      '<path d="M6 17.5V4.7l10-2v10.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="4.2" cy="18" r="2.6"/>' +
      '<circle cx="14.2" cy="15.3" r="2.6"/>' +
      '<rect x="19.4" y="2" width="1.6" height="18" rx="0.4"/>' +
      '<rect x="22.1" y="2" width="3" height="18" rx="0.6"/>',
  },
  instant_master: {
    // 大小2つの光の粒（フラッシュ・きらめき）で、「一瞬」を捉えきったイメージ。
    viewBox: "0 0 24 24",
    markup:
      '<path d="M12 0 13.6 8.4 22 10 13.6 11.6 12 20 10.4 11.6 2 10 10.4 8.4Z"/>' +
      '<path d="M19 1.5 19.8 3.8 22 4.6 19.8 5.4 19 7.7 18.2 5.4 16 4.6 18.2 3.8Z" fill="#fff"/>',
  },
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
  // 【2026-11-XX追加・本人指示：称号マーク未設定の監査で発覚】complete_finale。
  // 「舞台の緞帳（どんちょう）が閉じる」＝曲の終わりを完全に極めたイメージ。
  complete_finale: {
    viewBox: "0 0 24 24",
    markup:
      '<path d="M2 2c3 3 3 15 0 20h6c-2-5-2-15 0-20Z"/>' +
      '<path d="M22 2c-3 3-3 15 0 20h-6c2-5 2-15 0-20Z"/>' +
      '<circle cx="12" cy="12" r="2" fill="#fff"/>',
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
  // 【2026-11-XX追加・本人指示：称号マーク未設定の監査で発覚】instant_flash_answer。
  // 一瞬チャレンジ系の成長アイコン（ストップウォッチ）の針を稲妻に置き換え、「聞き直し無しの
  // 一発勝負」を表現。ストップウォッチの輪郭は共有しつつ、中身で電光石火・一瞬マスターとは
  // 別物と分かるようにしている。
  instant_flash_answer: {
    viewBox: "0 0 24 24",
    markup:
      '<circle cx="12" cy="13" r="8.5"/>' +
      '<rect x="10" y="1.5" width="4" height="2.4" rx="1.2"/>' +
      '<path d="M13 6 9 13.5h3l-1 6 5-8.5h-3.3Z" fill="#fff"/>',
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

// 【2026-11-XX新設・再発防止】outro_master等4件のマーク抜けを受け、「すべての称号に
// アイコン定義が存在するか」を自動テストから機械的に確認できるようにする読み取り専用ヘルパー。
export function hasIconDefinition(iconKey) {
  return Object.prototype.hasOwnProperty.call(ICON_DEFINITIONS, iconKey);
}

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
//
// locked:true（本人指示・2026-08-07）は、＝LOVEマスター・＝LOVE完全制覇の一覧カードだけが使う
// 特例。他の称号は未取得中は汎用の鍵アイコン（buildLockedAchievementIconMedal）に切り替えるが、
// この2つの複合称号だけは「未取得状態でも形（王冠・王冠+ダイヤ）や説明は見えるようにし、
// 取得するとカラーと発光が解放される」という見せ方にするため、同じ形のままCSS側の配色だけを
// 控えめ（is-locked-preview）に切り替える。
export function buildAchievementIconMedal(iconKey, { locked = false } = {}) {
  return buildMedal(iconKey, locked ? "is-locked-preview" : "is-unlocked");
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
