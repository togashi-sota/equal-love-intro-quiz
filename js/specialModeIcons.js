// 特別モード8件それぞれの、シンプルなSVGアイコンを組み立てる表示専用ヘルパー。
// js/achievementIcons.jsと同じ方針（著作権のある画像素材・外部アイコンフォントは使わず、
// 単純な図形のみで構成する）を踏襲している。生のUnicode絵文字をそのまま置くと
// OS・端末によって見た目が変わってしまう（本人指示）ため、必ずSVGで統一する。
//
// 色の違いはSVGパス自体を分けず、CSS側（.special-mode-icon.is-{modeId}）で塗り分ける方針にし、
// パスの管理をachievementIcons.jsと同じ形で最小限にしている。
const ICON_DEFINITIONS = {
  // 【2026-08-08追加】通常イントロクイズ用アイコン（統一プレイ履歴で使う。8つの特別モードには
  // 含まれないが、同じ「色付き丸背景アイコン」の仕組み（buildSpecialModeIcon）をそのまま
  // 再利用するため、ここに追加する）。音符2つ＝「曲を聴いて当てる」ことを象徴する。
  intro: {
    viewBox: "0 0 24 24",
    markup:
      '<path d="M9 17V4.5l10-2v12.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="6.5" cy="17" r="2.8"/><circle cx="16.5" cy="14.5" r="2.8"/>',
  },
  weakSongs: {
    // 苦手曲モード：的（ターゲット）。「弱点に的を絞って練習する」イメージ。
    viewBox: "0 0 24 24",
    markup:
      '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="12" cy="12" r="1.8"/>',
  },
  originalQuiz: {
    // オリジナル問題作成モード：鉛筆（「自分で作る・編集する」イメージ）。
    viewBox: "0 0 24 24",
    markup:
      '<path d="M4 20l1-5 11-11 4 4-11 11-5 1Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M15 5l4 4" stroke="currentColor" stroke-width="2"/>',
  },
  timeAttack: {
    // タイムアタック：ストップウォッチ。
    viewBox: "0 0 24 24",
    markup:
      '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M12 13V8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M9.5 2h5M12 5V2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  },
  randomPlayback: {
    // ランダム再生クイズ：シャッフル（交差する矢印）。
    viewBox: "0 0 24 24",
    markup:
      '<path d="M3 6h3.5L15 17h5.5M3 17h3.5L11 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M17.5 4 20.5 6 17.5 8M17.5 15 20.5 17 17.5 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  liveCallMode: {
    // ライブコールモード：ペンライト（本人指示・2026-08-07：メガホンだと直感的に伝わらないため変更）。
    // 発光部分をブランドのピンク、持ち手を白にし、他のアイコンと同じ「currentColorの地に
    // 白/ピンクのアクセントを乗せる」パターン（achievementIcons.jsのSHIELD_PATH等と同じ考え方）。
    // 周囲の光の筋は発光している雰囲気を出すための最小限の装飾。
    viewBox: "0 0 24 24",
    markup:
      '<rect x="9.6" y="11.5" width="4.8" height="10" rx="2.1" fill="#fff"/>' +
      '<ellipse cx="12" cy="8" rx="5" ry="5.6" fill="#fff" opacity="0.35"/>' +
      '<ellipse cx="12" cy="8.3" rx="3.2" ry="3.7" fill="#ff6fa8"/>' +
      '<path d="M12 0.8v1.8M6.4 2.9l1.2 1.3M17.6 2.9l-1.2 1.3M3.6 8.3h1.8M18.6 8.3h1.8" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>',
  },
  lyricsQuiz: {
    // 歌詞クイズ：マイク（歌詞＝歌を象徴）。
    viewBox: "0 0 24 24",
    markup:
      '<rect x="9.5" y="2" width="5" height="11" rx="2.5"/>' +
      '<path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M12 17v4M9 21h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  },
  localBattle: {
    // 対戦モード：交差する2本の剣。
    viewBox: "0 0 24 24",
    markup:
      '<path d="M3 21 12 12M21 21 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M3 3l5 1 1 5-3 3-3-3 1-5ZM21 3l-5 1-1 5 3 3 3-3-1-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/>',
  },
  onlineBattle: {
    // オンライン対戦：地球儀（離れた場所とつながるイメージ）。
    viewBox: "0 0 24 24",
    markup:
      '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M3.5 9h17M3.5 15h17" stroke="currentColor" stroke-width="1.6"/>',
  },
};

// 特別モード1件分の、色付き丸背景アイコンを組み立てる。装飾目的のみ（本人指示：
// 「アイコンだけで意味を伝えず、モード名・説明文も残す」）なので、常にaria-hiddenにする。
export function buildSpecialModeIcon(modeId) {
  const icon = document.createElement("span");
  icon.classList.add("special-mode-icon", `is-${modeId}`);
  icon.setAttribute("aria-hidden", "true");

  const definition = ICON_DEFINITIONS[modeId];
  if (definition) {
    icon.innerHTML = `<svg viewBox="${definition.viewBox}" fill="currentColor">${definition.markup}</svg>`;
  }
  return icon;
}
