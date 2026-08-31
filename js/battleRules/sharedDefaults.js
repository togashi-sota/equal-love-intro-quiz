// 歌詞クイズ オンライン対戦「勝敗ルール」共通の定数・純粋関数。
//
// 配点・コンボ倍率・ヒント表示時間の数値をこのファイルに集約することで、
// 実機テスト後にバランス調整したくなったときも、このファイルの数値を
// 書き換えるだけで済むようにしている（UI・エンジン側には数値を直接書かない）。
//
// 【2026-08-31改訂・本人指示による3ルール全面見直し】以前は「ヒント段階に応じた配点を
// 3ルール共通で使う」設計だったが、新仕様では正解数バトル（旧クラシック）・
// 早押しバトル（旧奪い取り）は正解一律1ptに変更し、ポイントバトル（旧コンボ）だけが
// ヒント段階別の配点（コンボ倍率なし）を使う。DEFAULT_COMBO_MULTIPLIER_TABLE・
// getComboMultiplier()はポイントバトルではもう使わないが、既存テスト
// （tests/battleRules/sharedDefaults.test.js）との互換のため関数自体は残している。

// ヒント段階（1〜4）ごとの配点。ポイントバトル（js/battleRules/comboRule.js）だけが使う
// （正解数バトル・早押しバトルは正解一律+1ptのため参照しない）。
export const DEFAULT_HINT_POINT_TABLE = { 1: 4, 2: 3, 3: 2, 4: 1 };

// コンボ数（しきい値）ごとの倍率。【2026-08-31時点では未使用】ポイントバトルから
// コンボ倍率の概念自体を撤廃したため、現在このテーブルを参照するルールは無い。
// 既存テスト・getComboMultiplier()との互換のため定数自体は残す。
export const DEFAULT_COMBO_MULTIPLIER_TABLE = { 1: 1.0, 3: 1.2, 5: 1.5, 7: 2.0 };

// ヒント1段階あたりの表示時間（秒）のデフォルト値。
// 【2026-08-31時点では未使用】正解数バトル・ポイントバトルはヒントを時間経過で自動送りせず、
// 本人がボタンを押して手動で開く方式に変更したため、この値を使う自動送りタイマーは
// もう無い。ルーム設定のsettingsFieldsからも外した（js/battleRules/classicRule.js・
// comboRule.js参照）。互換のため定数自体とHINT_INTERVAL_SETTINGS_FIELDは残す。
export const DEFAULT_HINT_INTERVAL_SEC = 6;

// 【2026-08-31追加】1問あたりの最大受付時間（ミリ秒）。全ルール共通のセーフティネット。
// ヒントを時間経過で自動送りしなくなったため、「全員回答済み」にならない限り
// 問題が進行しなくなる可能性がある（誰かが操作をやめてしまった等）。そうした場合でも
// 対戦が止まったままにならないよう、この時間が経過したら未回答者をスキップ扱いにして
// 強制的に問題を終了する（js/battleRules/classicRule.js・stealRule.js・comboRule.jsの
// shouldEndQuestion()参照）。60秒は「本人が実際に操作をやめた」と判断できる程度に長く、
// かつ対戦が止まったままになる時間としては十分短い値として選んだ。
export const MANUAL_PROGRESS_QUESTION_TIMEOUT_MS = 60000;

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

// 【2026-08-31追加】問題が始まってから回答するまでの経過時間（ミリ秒）。
// 旧computeResponseMs()は「時間経過で自動送りされるヒント段階が今何番目か」を前提に
// 「そのヒント段階が表示されてから何ms経ったか」を逆算していたが、ヒントを手動で開く
// 新方式ではその前提が成り立たない（本人が任意のタイミングでヒントを開くため）。
// 新方式では単純に「問題が始まってから回答するまでの時間」を、参考情報（結果画面の
// 表示用。順位には一切使わない）としてそのまま使う。
export function computeElapsedSinceQuestionStart({ submittedAt, questionStartedAt }) {
  return Math.max(0, submittedAt - questionStartedAt);
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
