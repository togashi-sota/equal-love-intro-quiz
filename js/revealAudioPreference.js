// オフライン歌詞クイズ・オフライン一瞬チャレンジの「正解発表で曲を再生する／しない」設定を
// 保存・読み込みするだけの小さなファイル（2026-11-XX新設・本人指示：最優先1）。
//
// 【本人指示の要点】
// ・初期値は「再生する」（true）。
// ・歌詞クイズと一瞬チャレンジは別設定（一方を変えても、もう一方の値には影響しない）。
// ・「通常モード」「オリジナル問題作成モード」は、同じ出題形式（歌詞クイズ／一瞬チャレンジ）
//   なら同じ設定欄・同じ保存値を共有する（見た目は各画面に1つずつ置くが、値は1つ）。
//   本人の依頼文は「各モードごとに前回選択値を保存」「歌詞クイズと一瞬チャレンジを1つの
//   共通設定にまとめない」の2点を明示しており、「通常／オリジナル問題作成」を分けて
//   保存すべきとは明示していないため、既存のサウンド設定（js/soundManager.js）と同じ
//   「端末に1つだけ保存する設定」という扱いに揃えた。
// ・称号・実績の判定には一切使わない（js/lyricsQuizScreen.js・js/instantChallengeScreen.js
//   側で、この設定値をachievementProgress.js等へ渡さないことで保証する）。
const STORAGE_KEYS = {
  lyricsQuiz: "equalLoveIntroQuiz.revealAudioEnabled.lyricsQuiz",
  instantChallenge: "equalLoveIntroQuiz.revealAudioEnabled.instantChallenge",
};

function readBoolean(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return stored === "true";
  } catch {
    return defaultValue;
  }
}

function writeBoolean(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 保存に失敗しても（プライベートブラウズ等）、今回のプレイ自体は続けられるようにする。
  }
}

export function getLyricsQuizRevealAudioEnabled() {
  return readBoolean(STORAGE_KEYS.lyricsQuiz, true);
}

export function setLyricsQuizRevealAudioEnabled(enabled) {
  writeBoolean(STORAGE_KEYS.lyricsQuiz, enabled);
}

export function getInstantChallengeRevealAudioEnabled() {
  return readBoolean(STORAGE_KEYS.instantChallenge, true);
}

export function setInstantChallengeRevealAudioEnabled(enabled) {
  writeBoolean(STORAGE_KEYS.instantChallenge, enabled);
}

// 【DOM配線の共通ヘルパー】「正解発表で曲を再生する／曲を再生せず次へ進む」の2択ラジオを、
// 4つの入口（通常歌詞クイズ・通常一瞬チャレンジ・オリジナル問題作成の歌詞クイズ／
// 一瞬チャレンジタイプ）どれでも同じロジックで配線できるようにする（本人指示：
// 「新しいHTML/SVGを画面ごとに手作業で追加しない、共通の関数・CSSクラスだけで」と同じ方針。
// js/oshiBadge.jsと同じ考え方を、DOM配線側にも適用した）。
// radioNameSelector: 例 'input[name="lyrics-quiz-reveal-audio"]'
// getEnabled/setEnabled: 上のgetLyricsQuizRevealAudioEnabled等をそのまま渡す。
// onChange（省略可）：値が変わった直後に呼ばれる（操作音の再生など、呼び出し側固有の処理用）。

// 【2026-11-XX追加】ラジオのchecked状態だけを、保存済みの値へ合わせ直す（イベントリスナーは
// 付け直さない）。オリジナル問題作成モードの選曲画面（js/customQuizScreen.js）のように、
// 画面を開き直すたびに呼ばれる箇所で、initRevealAudioToggle()を再度呼ぶとリスナーが
// 重複登録されてしまうため、この軽量版を使う（本人指示：「通常モードで変えた値が、
// オリジナル問題作成モード側にもすぐ反映される」ことを保証するために必要）。
export function syncRevealAudioToggle(radioNameSelector, getEnabled) {
  const radios = document.querySelectorAll(radioNameSelector);
  const currentValue = getEnabled() ? "on" : "off";
  radios.forEach((radio) => {
    radio.checked = radio.value === currentValue;
  });
}

export function initRevealAudioToggle(radioNameSelector, getEnabled, setEnabled, onChange) {
  const radios = document.querySelectorAll(radioNameSelector);
  if (radios.length === 0) return;

  syncRevealAudioToggle(radioNameSelector, getEnabled);
  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      setEnabled(radio.value === "on");
      onChange?.();
    });
  });
}
