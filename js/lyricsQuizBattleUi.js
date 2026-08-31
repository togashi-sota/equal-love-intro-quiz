// 歌詞クイズ オンライン対戦の画面が使う「UI自動生成」の土台（Phase5）。
//
// 【設計方針】各ルール（クラシック/奪い取り/コンボ）が持つ宣言データ
// （settingsFields／hudFields／resultColumns／allowedAnswerPoolSizes、いずれも
// js/battleRules/各ルールモジュール由来）を読み取り、「どのルールが選ばれているか」を
// 一切分岐せずに、設定画面・対戦中HUD・結果画面へ必要な情報を組み立てる。
// クラシック・奪い取り・コンボという名前は、このファイルのどこにも登場しない。
//
// 【前半：純粋関数（describe*）】DOMに一切触れない、「何を表示すべきか」を返すだけの
// 関数群。合成データで自動テストできる（tests/lyricsQuizBattleUi.test.js）。
// 【後半：DOM描画関数（render*）】上のdescribe*の結果を実際の要素へ反映する薄い層。
// 副作用があるためユニットテスト対象外とし、dev/lyricsQuizBattleUiMockup.htmlで
// 実際にブラウザ上で見た目・操作を確認する（このプロジェクトの既存の検証方針を踏襲）。
//
// まだ本物のオンライン対戦画面（js/onlineBattleScreen.js等）へは結線していない
// （Phase6で行う想定）。Firebaseへの本結線もしていない。

import { listAvailableBattleRulesForSettings } from "./battleModes/lyricsQuizBattleMode.js";
import { describeLyricsCoverageStatus, LYRICS_COVERAGE_STATUS, STEAL_CLAIM_OUTCOME } from "./lyricsQuizBattleFirebasePayloads.js";

// ===== 純粋関数（describe*） =====

function findRule(ruleId) {
  return listAvailableBattleRulesForSettings().find((rule) => rule.ruleId === ruleId) ?? null;
}

// ルーム設定画面の「対戦ルール選択」一覧。ルール名を1つも知らずに描画できる形。
export function describeRuleOptions(selectedRuleId) {
  return listAvailableBattleRulesForSettings().map((rule) => ({
    ruleId: rule.ruleId,
    label: rule.label,
    description: rule.description,
    selected: rule.ruleId === selectedRuleId,
  }));
}

// 選んだルールのallowedAnswerPoolSizesだけに絞り込んだ、回答方式の選択肢。
export function describeAnswerPoolSizeOptions(ruleId, selectedSize) {
  const rule = findRule(ruleId);
  const allowedSizes = rule?.allowedAnswerPoolSizes ?? [];
  return allowedSizes.map((size) => ({
    size,
    label: size === "all" ? "全曲検索" : `${size}択`,
    selected: size === selectedSize,
  }));
}

// settingsFields宣言に「今の値」を添えて、フォーム項目として整形する
// （ヒント表示時間の4/6/8秒選択肢等、ルール共通の項目もここに含まれる）。
export function describeSettingsForm(ruleId, currentSettings) {
  const rule = findRule(ruleId);
  const fields = rule?.settingsFields ?? [];
  return fields.map((field) => ({
    ...field,
    currentValue: currentSettings?.[field.key] ?? field.default,
  }));
}

// hudFields宣言 + 今のプレイヤー統計から、対戦中HUDに出す項目を整形する。
// playerStatsに値が無いキーは「―」で表示する（試合開始直後で未確定な項目等）。
export function describeHudItems(ruleId, playerStats) {
  const rule = findRule(ruleId);
  const fields = rule?.hudFields ?? [];
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    value: formatDisplayValue(playerStats?.[field.key], field.unit),
  }));
}

// 【2026-09-03修正・本人指摘】以前はunit引数が無く、hudFields/resultColumnsで
// unit: "ms"を宣言していても無視され、ミリ秒の生値（例：9620）がそのまま表示されていた。
// unitが"ms"の数値だけ「秒」表示に変換する（他のunit無しの数値は今までどおり）。
function formatDisplayValue(value, unit) {
  if (value === undefined || value === null) return "―";
  if (typeof value === "number") {
    if (unit === "ms") return `${(Math.round(value / 10) / 100).toFixed(2)}秒`;
    return String(Math.round(value * 100) / 100);
  }
  return String(value);
}

// resultColumns宣言 + 順位付け済みの結果配列（js/lyricsQuizMatchProgress.jsの
// finalizeMatch()が返す形＋表示用の付随情報）から、結果表の見出し・行を整形する。
// DNFの行は、ルールごとの数値列をすべて「DNF」という文字列に統一して表示する
// （順位・完走判定はfinalizeMatch()側で既に確定済みの値をそのまま使うだけ）。
export function describeResultTable(ruleId, rankedEntries) {
  const rule = findRule(ruleId);
  const columns = rule?.resultColumns ?? [];
  const header = ["順位", "表示名", ...columns.map((column) => column.label)];
  const rows = rankedEntries.map((entry, index) => ({
    rank: index + 1,
    uid: entry.uid,
    displayName: entry.displayName ?? entry.uid,
    isHost: !!entry.isHost,
    isYou: !!entry.isYou,
    isDnf: !!entry.isDnf,
    oshiColor: entry.oshiColor ?? null,
    cells: entry.isDnf
      ? columns.map(() => "DNF")
      : columns.map((column) => formatDisplayValue(entry.result?.detail?.[column.key], column.unit)),
  }));
  return { header, rows };
}

// lyricsCoverageの状態から、READY可否とホスト向けの表示内容を整形する。
// ホストには「誰が・何曲中何曲」という件数だけを見せ、曲名は一切含めない
// （設計⑨④：改造クライアントの虚偽報告は防げないが、通常利用の事故防止のための表示）。
// 各人のstatusは"checking"（まだ確認できていない・不足と断定しない）・
// "insufficient"（確認済みで本当に不足）・"ready"（揃っている）の3状態
// （本人からの指摘・2026-08-06：未確認を0曲不足と誤表示しないため）。
export function describeLyricsReadiness(lyricsCoverageByUid, hostPoolHash, displayNameByUid) {
  const notReadyEntries = Object.entries(lyricsCoverageByUid)
    .map(([uid, coverage]) => ({
      uid,
      displayName: displayNameByUid?.[uid] ?? uid,
      ...describeLyricsCoverageStatus(coverage, hostPoolHash),
    }))
    .filter((entry) => entry.status !== LYRICS_COVERAGE_STATUS.READY);
  return {
    ready: notReadyEntries.length === 0,
    notReadyEntries,
  };
}

// 回答ボタンを押した瞬間に、送信してよいか・押せないなら何を案内すべきかを決める純粋関数。
//
// 【なぜ切り出したか・2026-08-06】これまでhandleAnswerChoiceClick()は、送信できない
// 条件（問題が既に解決済み・次の問題へ遷移中・既に回答済み・送信中）のどれに当てはまっても
// 何も表示せずreturnするだけだった。本人からの指摘：通信が遅い実機で「ボタンを押したのに
// 反応が無い」ように見える。理由ごとに案内文を出し分けられるよう、判定部分だけを
// DOM・Firebaseに触れない純粋関数として切り出した（tests/lyricsQuizBattleFirebase.test.js
// で恒久テスト）。判定の順序は元のhandleAnswerChoiceClick()と同じにしてある。
export const ANSWER_SUBMISSION_BLOCK_REASON = {
  SUBMITTING: "submitting",
  TRANSITIONING: "transitioning",
  QUESTION_RESOLVED: "questionResolved",
  ALREADY_ANSWERED: "alreadyAnswered",
};

const ANSWER_SUBMISSION_BLOCK_MESSAGES = {
  [ANSWER_SUBMISSION_BLOCK_REASON.SUBMITTING]: "送信中です。少々お待ちください。",
  [ANSWER_SUBMISSION_BLOCK_REASON.TRANSITIONING]: "次の問題へ進んでいます…",
  [ANSWER_SUBMISSION_BLOCK_REASON.QUESTION_RESOLVED]: "この問題の回答受付は終了しました。",
  [ANSWER_SUBMISSION_BLOCK_REASON.ALREADY_ANSWERED]: "この問題にはすでに回答しています。",
};

// 戻り値: { blocked: false } または { blocked: true, reason }
export function resolveAnswerSubmissionBlock({ hasRoom, submitInFlight, hasMatch, questionStatus, alreadyAnsweredThisQuestion }) {
  if (submitInFlight) {
    return { blocked: true, reason: ANSWER_SUBMISSION_BLOCK_REASON.SUBMITTING };
  }
  if (!hasRoom || !hasMatch) {
    return { blocked: true, reason: ANSWER_SUBMISSION_BLOCK_REASON.TRANSITIONING };
  }
  if (questionStatus !== "active") {
    return { blocked: true, reason: ANSWER_SUBMISSION_BLOCK_REASON.QUESTION_RESOLVED };
  }
  if (alreadyAnsweredThisQuestion) {
    return { blocked: true, reason: ANSWER_SUBMISSION_BLOCK_REASON.ALREADY_ANSWERED };
  }
  return { blocked: false, reason: null };
}

// reasonから、実機に出す案内文を引く。未知のreasonにはnullを返す（呼び出し側は表示をスキップする）。
export function describeAnswerSubmissionBlockMessage(reason) {
  return ANSWER_SUBMISSION_BLOCK_MESSAGES[reason] ?? null;
}

// submitLyricsQuizAnswerWithStealClaim()がok:trueで返すoutcomeから、案内文を引く。
// answered-wrongは通常の不正解表示で十分なため対象外（null）。
// 【2段階送信・2026-08-06】answer保存とwinner claim送信を分けたことで生まれた
// outcome値（js/lyricsQuizBattleFirebase.jsのコメント参照）。
const STEAL_CLAIM_OUTCOME_MESSAGES = {
  [STEAL_CLAIM_OUTCOME.WON]: "奪い取り成功！",
  [STEAL_CLAIM_OUTCOME.LOST_RACE]: "わずかな差で先に正解されました",
};

export function describeStealClaimOutcomeMessage(outcome) {
  return STEAL_CLAIM_OUTCOME_MESSAGES[outcome] ?? null;
}

// 回答送信そのものが失敗した（ok:false）ときの案内文。既に回答済み（already-answered）は
// 呼び出し側が黙って成功扱いにするため対象外。それ以外（network-error等）は
// 呼び出し側が従来どおりの赤いエラー文言にフォールバックする想定でnullを返す。
const ANSWER_SUBMISSION_FAILURE_MESSAGES = {
  "question-resolved": "この問題の回答受付は終了しました。",
  "permission-denied": "権限エラーが発生しました。少し待ってからもう一度お試しください。",
};

export function describeAnswerSubmissionFailureMessage(reason) {
  return ANSWER_SUBMISSION_FAILURE_MESSAGES[reason] ?? null;
}

// 本人の端末だけに表示する、不足している曲名の一覧（Firebaseには一切送らないローカル情報）。
// missingSongTitlesは呼び出し元がIndexedDBとの突き合わせでローカルに算出したもの。
export function describeOwnMissingLyricsTitles(missingSongTitles) {
  return {
    hasMissing: missingSongTitles.length > 0,
    missingSongTitles,
  };
}

// ===== DOM描画（薄い層。副作用ありのためユニットテスト対象外、dev/で目視確認する） =====

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

// ルール選択肢を、カスタムラジオボタン風のリストとして描画する。
export function renderRuleOptions(containerElement, options, onSelect) {
  clearElement(containerElement);
  const fieldset = document.createElement("fieldset");
  fieldset.className = "lyrics-battle-rule-options";
  const legend = document.createElement("legend");
  legend.textContent = "対戦ルール";
  fieldset.appendChild(legend);

  for (const option of options) {
    const labelElement = document.createElement("label");
    labelElement.className = "lyrics-battle-rule-option";
    const inputElement = document.createElement("input");
    inputElement.type = "radio";
    inputElement.name = "lyrics-battle-rule";
    inputElement.value = option.ruleId;
    inputElement.checked = option.selected;
    inputElement.addEventListener("change", () => onSelect(option.ruleId));
    const textWrapper = document.createElement("span");
    const titleElement = document.createElement("strong");
    titleElement.textContent = option.label;
    const descriptionElement = document.createElement("span");
    descriptionElement.className = "lyrics-battle-rule-option-description";
    descriptionElement.textContent = option.description;
    textWrapper.appendChild(titleElement);
    textWrapper.appendChild(descriptionElement);
    labelElement.appendChild(inputElement);
    labelElement.appendChild(textWrapper);
    fieldset.appendChild(labelElement);
  }
  containerElement.appendChild(fieldset);
}

// 回答方式（4/10/30/50/全曲検索）の選択肢を描画する。選べる方式はルールによって絞られる。
export function renderAnswerPoolSizeOptions(containerElement, options, onSelect) {
  clearElement(containerElement);
  const fieldset = document.createElement("fieldset");
  fieldset.className = "lyrics-battle-pool-size-options";
  const legend = document.createElement("legend");
  legend.textContent = "回答方式";
  fieldset.appendChild(legend);

  for (const option of options) {
    const labelElement = document.createElement("label");
    labelElement.className = "lyrics-battle-pool-size-option";
    const inputElement = document.createElement("input");
    inputElement.type = "radio";
    inputElement.name = "lyrics-battle-pool-size";
    inputElement.value = String(option.size);
    inputElement.checked = option.selected;
    inputElement.addEventListener("change", () => onSelect(option.size));
    labelElement.appendChild(inputElement);
    labelElement.appendChild(document.createTextNode(option.label));
    fieldset.appendChild(labelElement);
  }
  containerElement.appendChild(fieldset);
}

// settingsFields由来のフォーム項目を描画する（現状はtype:"select"のみだが、
// 将来型が増えても呼び出し側のコードを変えずに済むよう、type別に分岐する形にしておく）。
export function renderSettingsForm(containerElement, fields, onChange) {
  clearElement(containerElement);
  for (const field of fields) {
    const wrapperElement = document.createElement("div");
    wrapperElement.className = "lyrics-battle-settings-field";
    const labelElement = document.createElement("label");
    const inputId = `lyrics-battle-setting-${field.key}`;
    labelElement.setAttribute("for", inputId);
    labelElement.textContent = field.label;
    wrapperElement.appendChild(labelElement);

    if (field.type === "select") {
      const selectElement = document.createElement("select");
      selectElement.id = inputId;
      for (const option of field.options ?? []) {
        const optionElement = document.createElement("option");
        optionElement.value = String(option.value);
        optionElement.textContent = option.label;
        optionElement.selected = option.value === field.currentValue;
        selectElement.appendChild(optionElement);
      }
      selectElement.addEventListener("change", () => onChange(field.key, Number(selectElement.value)));
      wrapperElement.appendChild(selectElement);
    }
    containerElement.appendChild(wrapperElement);
  }
}

// 対戦中HUDを描画する。
export function renderHud(containerElement, hudItems) {
  clearElement(containerElement);
  const listElement = document.createElement("dl");
  listElement.className = "lyrics-battle-hud";
  for (const item of hudItems) {
    const termElement = document.createElement("dt");
    termElement.textContent = item.label;
    const valueElement = document.createElement("dd");
    valueElement.textContent = item.value;
    listElement.appendChild(termElement);
    listElement.appendChild(valueElement);
  }
  containerElement.appendChild(listElement);
}

// 結果表を描画する。ホスト・自分自身の行を視覚的に区別する。
export function renderResultTable(containerElement, tableData) {
  clearElement(containerElement);
  const tableElement = document.createElement("table");
  tableElement.className = "lyrics-battle-result-table";

  const headRow = document.createElement("tr");
  for (const headerText of tableData.header) {
    const thElement = document.createElement("th");
    thElement.scope = "col";
    thElement.textContent = headerText;
    headRow.appendChild(thElement);
  }
  const theadElement = document.createElement("thead");
  theadElement.appendChild(headRow);
  tableElement.appendChild(theadElement);

  const tbodyElement = document.createElement("tbody");
  for (const row of tableData.rows) {
    const trElement = document.createElement("tr");
    if (row.isYou) trElement.classList.add("is-you");
    if (row.isDnf) trElement.classList.add("is-dnf");

    const rankCell = document.createElement("td");
    rankCell.textContent = row.isDnf ? "DNF" : String(row.rank);
    trElement.appendChild(rankCell);

    const nameCell = document.createElement("td");
    if (row.oshiColor) {
      const dotElement = document.createElement("span");
      dotElement.className = "lyrics-battle-oshi-dot";
      dotElement.style.backgroundColor = row.oshiColor;
      dotElement.setAttribute("aria-hidden", "true");
      nameCell.appendChild(dotElement);
    }
    nameCell.appendChild(document.createTextNode(row.displayName));
    if (row.isHost) {
      const hostBadge = document.createElement("span");
      hostBadge.className = "lyrics-battle-host-badge";
      hostBadge.textContent = "ホスト";
      nameCell.appendChild(hostBadge);
    }
    if (row.isYou) {
      const youBadge = document.createElement("span");
      youBadge.className = "lyrics-battle-you-badge";
      youBadge.textContent = "あなた";
      nameCell.appendChild(youBadge);
    }
    trElement.appendChild(nameCell);

    for (const cellValue of row.cells) {
      const cellElement = document.createElement("td");
      cellElement.textContent = cellValue;
      trElement.appendChild(cellElement);
    }
    tbodyElement.appendChild(trElement);
  }
  tableElement.appendChild(tbodyElement);
  containerElement.appendChild(tableElement);
}

// 歌詞データ不足の表示（ホスト視点：件数だけ／本人視点：不足曲名まで）。
export function renderLyricsReadinessStatus(containerElement, readiness, { isHostView }) {
  clearElement(containerElement);
  const statusElement = document.createElement("div");
  statusElement.className = "lyrics-battle-readiness-status";
  statusElement.setAttribute("role", "status");
  statusElement.setAttribute("aria-live", "polite");

  const hasCheckingEntry = readiness.notReadyEntries.some((entry) => entry.status === LYRICS_COVERAGE_STATUS.CHECKING);
  const hasInsufficientEntry = readiness.notReadyEntries.some((entry) => entry.status === LYRICS_COVERAGE_STATUS.INSUFFICIENT);

  if (readiness.ready) {
    statusElement.textContent = "全員の歌詞データが揃っています。";
    statusElement.classList.add("is-ready");
  } else if (isHostView) {
    statusElement.classList.add(hasInsufficientEntry ? "is-not-ready" : "is-checking");
    const listElement = document.createElement("ul");
    for (const entry of readiness.notReadyEntries) {
      const itemElement = document.createElement("li");
      itemElement.textContent =
        entry.status === LYRICS_COVERAGE_STATUS.CHECKING
          ? `${entry.displayName}さんの歌詞データを確認中です…`
          : `${entry.displayName}さんの端末に、今回使用する曲の歌詞データが不足しています（${entry.requiredCount}曲中${entry.availableCount}曲）。`;
      listElement.appendChild(itemElement);
    }
    statusElement.appendChild(document.createTextNode(hasInsufficientEntry ? "開始できません：" : "確認中："));
    statusElement.appendChild(listElement);
  } else {
    statusElement.classList.add(hasCheckingEntry && !hasInsufficientEntry ? "is-checking" : "is-not-ready");
    statusElement.textContent = hasCheckingEntry && !hasInsufficientEntry
      ? "歌詞データを確認中です…"
      : "歌詞データが揃っていない参加者がいるため、まだ開始できません。";
  }
  containerElement.appendChild(statusElement);
}

// 本人の端末だけに、不足している曲名を表示する（他の参加者には見えない）。
export function renderOwnMissingLyricsTitles(containerElement, ownMissing) {
  clearElement(containerElement);
  if (!ownMissing.hasMissing) return;
  const statusElement = document.createElement("div");
  statusElement.className = "lyrics-battle-own-missing";
  statusElement.setAttribute("role", "status");
  const titleElement = document.createElement("p");
  titleElement.textContent = "あなたの端末に、以下の曲の歌詞データがありません：";
  statusElement.appendChild(titleElement);
  const listElement = document.createElement("ul");
  for (const songTitle of ownMissing.missingSongTitles) {
    const itemElement = document.createElement("li");
    itemElement.textContent = songTitle;
    listElement.appendChild(itemElement);
  }
  statusElement.appendChild(listElement);
  containerElement.appendChild(statusElement);
}
