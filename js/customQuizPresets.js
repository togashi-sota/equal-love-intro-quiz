// オリジナル問題作成モードのプリセット（名前付きの保存済み問題セット）を、
// ブラウザのlocalStorageに保存・読み込みするファイル。
// history.js・highscore.jsと同じく、localStorageへの読み書きは必ずこのファイルを経由し、
// 他のファイルが直接localStorageを触ることはない。
//
// 各プリセットは、共有（将来のURL/QR共有・クラウド同期を見据えて）しても意味のある
// 「中身」（name・memo・songIds・distractorMode）と、この端末だけで管理する
// 「管理情報」（id・createdAt・updatedAt）を分けて持たせている。将来、中身だけを
// 取り出して共有する機能を追加する際も、この構造のまま対応できる想定。

const CUSTOM_QUIZ_PRESETS_KEY = "equalLoveIntroQuiz.customQuizPresets";
const CURRENT_SCHEMA_VERSION = 1;

// プレイ履歴と同じ生成方法。crypto.randomUUID()が使えない環境向けの代替も同様に用意する。
function generatePresetId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadPresetsData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, presets: [] };
  try {
    const stored = localStorage.getItem(CUSTOM_QUIZ_PRESETS_KEY);
    if (!stored) return empty;

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed.presets)) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function savePresetsData(data) {
  try {
    localStorage.setItem(CUSTOM_QUIZ_PRESETS_KEY, JSON.stringify(data));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// 保存されているプリセットを、更新日時（updatedAt）が新しい順に返す。
// よく使う・最近編集したセットほど一覧の上に来るようにするため。
export function getPresets() {
  const data = loadPresetsData();
  return [...data.presets].map(normalizePreset).sort((a, b) => b.updatedAt - a.updatedAt);
}

// 【2026-08-29追加、本人指示（⑭）】プリセットの種類。「イントロクイズ」「ランダム再生クイズ」
// 「歌詞クイズ」の3種類から、新規作成時に選ぶ（js/customQuizTypeSelectScreen相当のUI、
// 実体はmain.js側のcustom-quiz-type-select-screen）。
// 【後方互換】この項目が追加される前に保存された既存プリセットにはquizType自体が存在しない。
// getPresets()側でquizTypeが無いプリセットは自動的に"intro"として扱う
// （normalizePreset参照）ため、既存ユーザーのプリセットは何も変更しなくても
// 今までどおり「イントロクイズ」のセットとして動き続ける。
export const CUSTOM_QUIZ_TYPE = {
  INTRO: "intro",
  RANDOM_PLAYBACK: "randomPlayback",
  LYRICS_QUIZ: "lyricsQuiz",
};

// 保存済みデータ（古い形式を含む）を、常に完全な形へ正規化する。
// ・quizTypeが無ければ"intro"（既存プリセットの後方互換）
// ・answerPoolSizeValueが無ければ"4"（歌詞クイズ以外では使わない値だが、
//   常に何らかの値を持たせておくことで、呼び出し側がundefinedを気にせずに済む）
function normalizePreset(preset) {
  return {
    ...preset,
    quizType: preset.quizType ?? CUSTOM_QUIZ_TYPE.INTRO,
    answerPoolSizeValue: preset.answerPoolSizeValue ?? "4",
  };
}

// 新しいプリセットを1件保存する。常に新規追加で、既存プリセットの上書きはこの関数では行わない。
export function saveNewPreset({ name, memo, songIds, distractorMode, quizType, answerPoolSizeValue }) {
  const data = loadPresetsData();
  const now = Date.now();
  const preset = {
    id: generatePresetId(),
    name,
    memo,
    songIds,
    distractorMode,
    quizType: quizType ?? CUSTOM_QUIZ_TYPE.INTRO,
    answerPoolSizeValue: answerPoolSizeValue ?? "4",
    createdAt: now,
    updatedAt: now,
  };

  data.presets.push(preset);
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  savePresetsData(data);
  return preset;
}

// 既存のプリセットを1件、同じidのまま上書き保存する。createdAtは変えず、
// updatedAtだけ現在時刻に更新する（一覧の並び順にそのまま反映される）。
// 該当idが見つからない場合は何もしない（削除済みのプリセットを誤って復活させないため）。
// 【本人指示】quizType自体は編集画面で変更できない（作り直しが必要）ため、
// 呼び出し側から渡されなかった場合は既存の値（無ければ"intro"）を保ち続ける。
export function updatePreset(id, { name, memo, songIds, distractorMode, answerPoolSizeValue }) {
  const data = loadPresetsData();
  const preset = data.presets.find((candidate) => candidate.id === id);
  if (!preset) return;

  preset.name = name;
  preset.memo = memo;
  preset.songIds = songIds;
  preset.distractorMode = distractorMode;
  if (answerPoolSizeValue !== undefined) preset.answerPoolSizeValue = answerPoolSizeValue;
  if (preset.quizType === undefined) preset.quizType = CUSTOM_QUIZ_TYPE.INTRO;
  preset.updatedAt = Date.now();

  savePresetsData(data);
}

// 既存のプリセットを基に、新しいプリセットを1件複製する。
// songIds・memo・distractorMode・quizType・answerPoolSizeValueを引き継ぎ、名前には
// 「（コピー）」を付け、id・createdAt・updatedAtは新しく発行する
// （元のプリセットには一切手を加えない）。該当idが見つからない場合はnullを返す。
export function duplicatePreset(id) {
  const data = loadPresetsData();
  const original = data.presets.find((preset) => preset.id === id);
  if (!original) return null;

  const normalizedOriginal = normalizePreset(original);
  const now = Date.now();
  const duplicate = {
    id: generatePresetId(),
    name: `${normalizedOriginal.name}（コピー）`,
    memo: normalizedOriginal.memo,
    songIds: [...normalizedOriginal.songIds],
    distractorMode: normalizedOriginal.distractorMode,
    quizType: normalizedOriginal.quizType,
    answerPoolSizeValue: normalizedOriginal.answerPoolSizeValue,
    createdAt: now,
    updatedAt: now,
  };

  data.presets.push(duplicate);
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  savePresetsData(data);
  return duplicate;
}

// プリセットを1件削除する。
export function deletePreset(id) {
  const data = loadPresetsData();
  data.presets = data.presets.filter((preset) => preset.id !== id);
  savePresetsData(data);
}
