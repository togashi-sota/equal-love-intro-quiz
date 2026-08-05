// 歌詞クイズ オンライン対戦「勝敗ルール」共通の定数・純粋関数。
//
// 配点・コンボ倍率・ヒント表示時間の数値をこのファイルに集約することで、
// 実機テスト後にバランス調整したくなったときも、このファイルの数値を
// 書き換えるだけで済むようにしている（UI・エンジン側には数値を直接書かない）。

// ヒント段階（1〜4）ごとの配点。クラシック・奪い取り・コンボの3ルールが共通で使う。
export const DEFAULT_HINT_POINT_TABLE = { 1: 50, 2: 40, 3: 30, 4: 20 };

// コンボ数（しきい値）ごとの倍率。コンボルールだけが使う。
export const DEFAULT_COMBO_MULTIPLIER_TABLE = { 1: 1.0, 3: 1.2, 5: 1.5, 7: 2.0 };

// ヒント1段階あたりの表示時間（秒）のデフォルト値。
export const DEFAULT_HINT_INTERVAL_SEC = 6;

// ヒントの最大段階数（ソロ版と同じ、buildHintSequenceのmaxHints既定値）。
export const MAX_HINT_LEVEL = 4;

// ルーム設定画面で使う、ヒント表示時間の選択肢の宣言（1.5章のsettingsFields用）。
export const HINT_INTERVAL_SETTINGS_FIELD = {
  key: "hintIntervalSec",
  label: "ヒント表示時間",
  type: "select",
  options: [
    { value: 4, label: "4秒（速い）" },
    { value: 6, label: "6秒（標準）" },
    { value: 8, label: "8秒（じっくり）" },
  ],
  default: DEFAULT_HINT_INTERVAL_SEC,
};

// クラシック・コンボは全ての回答方式を許可、奪い取りは当面4択・10択のみ（設計⑧④）。
export const ANSWER_POOL_SIZE_ALL_MODES = [4, 10, 30, 50, "all"];
export const ANSWER_POOL_SIZE_QUICK_ONLY = [4, 10];

// スキップを表す予約語。songs.jsの実際の曲IDと衝突しない前提の文字列。
export const SKIP_SELECTION = "SKIP";

// selectedSongIdと正解songIdを比較して、この1問の結果を判定する。
// 「正解」は秘密の値ではなく、全端末が同じシードから独立に計算しているquestion.song.id
// そのものなので、この関数はどの端末で実行しても必ず同じ結果になる（決定論的）。
// クライアントが自己申告した「正解/不正解」を信用しない設計の核心部分（追記⑧①・⑨①）。
export function deriveAnswerOutcome(correctSongId, selectedSongId) {
  if (selectedSongId === SKIP_SELECTION) return "skipped";
  return selectedSongId === correctSongId ? "correct" : "wrongAnswer";
}

// submittedAt（サーバー時刻）から、「今のヒント段階が表示されてから何ms経っていたか」を
// 逆算する。responseMs自体は保存せず、信頼できる時刻情報だけから毎回この関数で
// 計算する（追記⑧①・⑨③）。時計のズレ等による異常値は安全な範囲へクランプする。
export function computeResponseMs({ submittedAt, questionStartedAt, hintLevel, hintIntervalSec }) {
  const hintShownAt = questionStartedAt + (hintLevel - 1) * hintIntervalSec * 1000;
  const rawResponseMs = submittedAt - hintShownAt;
  const maxResponseMs = hintIntervalSec * 1000;
  return Math.min(Math.max(rawResponseMs, 0), maxResponseMs);
}

// コンボ倍率テーブル（しきい値→倍率）を線形探索で引く。
// テーブルに新しい段階を足したいときも、この関数自体は変更不要。
export function getComboMultiplier(comboCount, comboMultiplierTable) {
  const thresholds = Object.keys(comboMultiplierTable)
    .map(Number)
    .sort((a, b) => a - b);
  let multiplier = 1.0;
  for (const threshold of thresholds) {
    if (comboCount >= threshold) multiplier = comboMultiplierTable[threshold];
  }
  return multiplier;
}

// 配点テーブルの基本的な妥当性チェック（ヒント1〜4すべてに0以上の数値があるか）。
// 各ルールのvalidateSettings()が共通で使う。
export function validatePointTable(pointTable) {
  if (!pointTable || typeof pointTable !== "object") return "配点テーブルが不正です。";
  for (let level = 1; level <= MAX_HINT_LEVEL; level++) {
    const point = pointTable[level];
    if (typeof point !== "number" || Number.isNaN(point) || point < 0) {
      return `ヒント${level}の配点が不正です。`;
    }
  }
  return null;
}

export function validateHintIntervalSec(hintIntervalSec) {
  if (typeof hintIntervalSec !== "number" || Number.isNaN(hintIntervalSec) || hintIntervalSec <= 0) {
    return "ヒント表示時間が不正です。";
  }
  return null;
}
