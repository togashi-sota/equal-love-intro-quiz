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
// 【2026-09-26追加・本人指示：サウンドシステム全面整備】設定項目（ルール/回答方式/数値）の
// ラジオ・セレクトの変更は、他の画面の設定変更と同じくUI_CLICKで揃える。
import { SFX_EVENTS, playSfx } from "./soundManager.js";

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

// 【2026-09-01新設・本人指示：ライブスコアボード】対戦中の問題画面上部に置く、他プレイヤーの
// 累計スコア一覧を整形する。
//
// scoreSnapshot: matches/{matchId}/scoreSnapshotの生データ
//   （{ questionsScoredCount, scoresByUid: { [uid]: { totalPoints, correctCount } } }）。
//   まだ1問も確定していない試合序盤はundefined/nullになり得る（その場合は全員0点扱いで
//   一覧を組み立てる。「データが無い」ことを画面側が特別扱いしなくて済むようにするため）。
// participantsByUid: matches/{matchId}/participants（{ [uid]: { displayName, ... } }）。
//
// 【最重要の情報漏洩防止】この関数はscoreSnapshotに既に入っている値を並べ替えるだけで、
// answers・questionClaims等「今の問題の途中経過」を示すデータには一切触れない。
// scoreSnapshot自体が「reveal完了後にホストがまとめて書き込む、1つ前の問題までの確定値」
// であることは、呼び出し元（js/lyricsQuizBattleFirebase.jsのstartLyricsQuizQuestion／
// finalizeLyricsQuizMatch、js/onlineLyricsQuizBattleScreen.jsのrunHostProgressionTick）が保証する。
//
// 正解数バトルは「現在の正解数」（correctCount）、ポイントバトル・早押しバトルは
// 「現在の合計ポイント」（totalPoints）を見せる（本人指示のルールごとの表示内容）。
export function describeScoreboard({ ruleId, scoreSnapshot, participantsByUid, myUid }) {
  const valueKey = ruleId === "classic" ? "correctCount" : "totalPoints";
  const valueUnit = ruleId === "classic" ? "問" : "pt";

  const scoresByUid = scoreSnapshot?.scoresByUid ?? {};
  const rows = Object.keys(participantsByUid ?? {}).map((uid) => ({
    uid,
    displayName: participantsByUid[uid]?.displayName ?? uid,
    // 【2026-09-26追加・本人指示：オンライン対戦総合改修19-8章】スコアボードの各行にも
    // 推し色＋代表称号バッジのアイコンを添えるため、参加者データに既に含まれている
    // oshiMemberIdをそのまま持ち出す（新しい取得経路は増やさない）。
    oshiMemberId: participantsByUid[uid]?.oshiMemberId ?? null,
    isMe: uid === myUid,
    value: scoresByUid[uid]?.[valueKey] ?? 0,
  }));
  // 降順（同点はparticipantsの列挙順のまま。無理に順位を分けない既存のルール方針と合わせ、
  // 同点内での並び替えはしない）。
  rows.sort((rowA, rowB) => rowB.value - rowA.value);

  return {
    valueUnit,
    hasData: !!scoreSnapshot,
    questionsScoredCount: scoreSnapshot?.questionsScoredCount ?? 0,
    rows,
  };
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
//
// 【2026-08-31改訂・本人指示による3ルール全面見直し】「同点の場合に回答時間などで
// 無理に順位を分けないでください」という明確な指示により、rank付けを
// 単純なindex+1（配列順）から、合計ポイント（detail.totalPoints）が同じ相手とは
// 完全に同じ順位になり、次に違う点数の相手が来たときだけ実際の並び順（＝スキップした
// 順位）を付ける「競技方式」の順位付けへ変更した（例：8pt・8pt・5pt → 1位・1位・3位）。
// 3ルールとも合計ポイントの一本勝負（js/battleRules/各ルールのcompareResults参照）に
// 統一されたため、この関数はruleIdを知らないまま安全にdetail.totalPointsだけを見て
// 判定できる（rankedEntriesは呼び出し元がcompareResults()で既に降順ソート済みの前提）。
export function describeResultTable(ruleId, rankedEntries) {
  const rule = findRule(ruleId);
  const columns = rule?.resultColumns ?? [];
  const header = ["順位", "表示名", ...columns.map((column) => column.label)];

  let previousPoints = null;
  let previousRank = 0;
  const rows = rankedEntries.map((entry, index) => {
    let rank = null;
    if (!entry.isDnf) {
      const points = entry.result?.detail?.totalPoints ?? 0;
      rank = previousPoints !== null && points === previousPoints ? previousRank : index + 1;
      previousPoints = points;
      previousRank = rank;
    }
    return {
      rank,
      uid: entry.uid,
      displayName: entry.displayName ?? entry.uid,
      isHost: !!entry.isHost,
      isYou: !!entry.isYou,
      isDnf: !!entry.isDnf,
      oshiColor: entry.oshiColor ?? null,
      cells: entry.isDnf
        ? columns.map(() => "DNF")
        : columns.map((column) => formatDisplayValue(entry.result?.detail?.[column.key], column.unit)),
    };
  });
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
// 【2026-08-31改訂】表示名の変更（奪い取り→早押しバトル）に合わせて文言も揃えた。
const STEAL_CLAIM_OUTCOME_MESSAGES = {
  [STEAL_CLAIM_OUTCOME.WON]: "早押し成功！",
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
    inputElement.addEventListener("change", () => { playSfx(SFX_EVENTS.UI_CLICK); onSelect(option.ruleId); });
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
    inputElement.addEventListener("change", () => { playSfx(SFX_EVENTS.UI_CLICK); onSelect(option.size); });
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
      selectElement.addEventListener("change", () => { playSfx(SFX_EVENTS.UI_CLICK); onChange(field.key, Number(selectElement.value)); });
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

// 【2026-09-06改訂・本人指示：実機フィードバック第3弾②】以前はtable形式（順位／表示名／
// 獲得ポイント／使用ヒント数／回答時間／ミス回数／わからない回数の7列）で結果を表示していたが、
// スマホ幅では列が窮屈に折り返され読みにくいという指摘を受け、「1人1枚のカード」形式へ
// 全面的に描き替えた。resultColumnsの1列目（全ルール共通で「獲得ポイント」）だけを
// カード上部に大きく強調し、残りの列はカード内の定義リストとして並べる
// （このファイルはルール名を一切知らないまま、resultColumns宣言の並び順をそのまま使うだけ
// なので、ルールごとに個別分岐する必要はない）。
// 同点者の順位表示（describeResultTable()の競技方式ランキング）はそのまま活かす。
const RANK_MEDAL_BY_RANK = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function renderResultCards(containerElement, tableData) {
  clearElement(containerElement);
  const listElement = document.createElement("ul");
  listElement.className = "lyrics-battle-result-card-list";

  const [, , ...columnLabels] = tableData.header;
  const [primaryLabel, ...restLabels] = columnLabels;

  for (const row of tableData.rows) {
    const cardElement = document.createElement("li");
    cardElement.className = "lyrics-battle-result-card";
    if (row.isYou) cardElement.classList.add("is-you");
    if (row.isDnf) cardElement.classList.add("is-dnf");
    const medal = !row.isDnf ? RANK_MEDAL_BY_RANK[row.rank] : null;
    if (medal) cardElement.classList.add("is-medal-rank");

    const rankBadge = document.createElement("p");
    rankBadge.className = "lyrics-battle-result-card-rank";
    rankBadge.textContent = row.isDnf ? "DNF" : medal ? `${medal} ${row.rank}位` : `${row.rank}位`;
    cardElement.appendChild(rankBadge);

    const nameRow = document.createElement("div");
    nameRow.className = "lyrics-battle-result-card-name-row";
    if (row.oshiColor) {
      const dotElement = document.createElement("span");
      dotElement.className = "lyrics-battle-oshi-dot";
      dotElement.style.backgroundColor = row.oshiColor;
      dotElement.setAttribute("aria-hidden", "true");
      nameRow.appendChild(dotElement);
    }
    const nameText = document.createElement("span");
    nameText.className = "lyrics-battle-result-card-name";
    nameText.textContent = row.displayName;
    nameRow.appendChild(nameText);
    if (row.isHost) {
      const hostBadge = document.createElement("span");
      hostBadge.className = "lyrics-battle-host-badge";
      hostBadge.textContent = "ホスト";
      nameRow.appendChild(hostBadge);
    }
    if (row.isYou) {
      const youBadge = document.createElement("span");
      youBadge.className = "lyrics-battle-you-badge";
      youBadge.textContent = "あなた";
      nameRow.appendChild(youBadge);
    }
    cardElement.appendChild(nameRow);

    if (row.isDnf) {
      const dnfNote = document.createElement("p");
      dnfNote.className = "lyrics-battle-result-card-dnf-note";
      dnfNote.textContent = "未完走（結果が確定しませんでした）";
      cardElement.appendChild(dnfNote);
    } else {
      if (primaryLabel !== undefined) {
        const primaryStat = document.createElement("p");
        primaryStat.className = "lyrics-battle-result-card-primary-stat";
        primaryStat.textContent = `${row.cells[0]} ${primaryLabel}`;
        cardElement.appendChild(primaryStat);
      }
      if (restLabels.length > 0) {
        const statsList = document.createElement("dl");
        statsList.className = "lyrics-battle-result-card-stats";
        // 【2026-09-06新設】label→valueの1組ずつをdivでまとめてグリッドの1マスにする
        // （dt・ddを直接2列グリッドに流し込むと、項目数によって段組みが崩れるため）。
        restLabels.forEach((label, index) => {
          const statItem = document.createElement("div");
          statItem.className = "lyrics-battle-result-card-stat";
          const term = document.createElement("dt");
          term.textContent = label;
          const value = document.createElement("dd");
          value.textContent = row.cells[index + 1];
          statItem.appendChild(term);
          statItem.appendChild(value);
          statsList.appendChild(statItem);
        });
        cardElement.appendChild(statsList);
      }
    }

    listElement.appendChild(cardElement);
  }
  containerElement.appendChild(listElement);
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
