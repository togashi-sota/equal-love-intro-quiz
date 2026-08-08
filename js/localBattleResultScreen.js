// 対戦モード（ローカル対戦）の、結果集計・順位発表画面を担当するファイル。
// プレイし終えた直後（自分の結果だけが分かっている状態）から、他の参加者の結果コードを
// 追加していき、最後に順位を確定するまでの流れをここにまとめる。
//
// 【設計メモ】1対1（2人）も4人対戦も、同じ「結果を集める→順位表」の2画面をそのまま使う。
// 2人のときは結果として自然に「勝ち負け」の形になる。UIを2系統持たずに済むための共通化。

import { getCurrentBattleSession, RULE_LABELS } from "./localBattleScreen.js";
import {
  encodeResultCode,
  decodeResultCode,
  formatResultCodeForDisplay,
  rankBattleParticipants,
  computeNormalFinalRecordMs,
} from "./localBattleResult.js";
import { savePlayHistoryEntry } from "./playHistory.js";

const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全問" };
const CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };

let elements = null;
let participants = []; // { playerName, result, resultCode }の配列。自分の分が先頭。
let usedResultCodes = new Set(); // 二重登録の検出用

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

// 集計中リストを再描画する。
function renderCollectList() {
  const { maxParticipants } = getCurrentBattleSession();

  elements.progress.textContent = `これまでに${participants.length}人分の結果を入力しました（最大${maxParticipants}人まで）`;

  elements.list.innerHTML = "";
  participants.forEach((participant) => {
    const row = document.createElement("li");
    row.className = "battle-collect-row";

    const name = document.createElement("span");
    name.className = "battle-collect-row-name";
    name.textContent = participant.playerName;
    row.appendChild(name);

    const check = document.createElement("span");
    check.className = "battle-collect-row-check";
    check.textContent = "✓ 済";
    row.appendChild(check);

    elements.list.appendChild(row);
  });

  const reachedMax = participants.length >= maxParticipants;
  elements.addSection.hidden = reachedMax;
  elements.finishButton.disabled = participants.length < 1;
}

// プレイし終えた直後に、main.js（finishBattlePlay）から呼ばれる。
// 自分の結果を、参加者リストの先頭として登録し、結果集計画面を描画する。
export function startBattleResultCollection(stats) {
  const { config, playerName } = getCurrentBattleSession();
  const reachedQuestionNumber = stats.perQuestionResults.length;

  const myResult = {
    battleSeed: config.seed,
    totalElapsedMs: stats.totalElapsedMs,
    correctCount: stats.correctCount,
    missCount: stats.missCount,
    completed: !stats.runFailed,
    reachedQuestionNumber,
  };
  const myResultCode = encodeResultCode(myResult);

  participants = [{ playerName, result: myResult, resultCode: myResultCode }];
  usedResultCodes = new Set([myResultCode]);

  elements.myResultCode.textContent = formatResultCodeForDisplay(myResultCode);
  elements.nameInput.value = "";
  elements.codeInput.value = "";
  elements.error.hidden = true;

  renderCollectList();
}

function handleAddResult() {
  const { config, maxParticipants } = getCurrentBattleSession();
  const playerName = elements.nameInput.value.trim();
  const rawCode = elements.codeInput.value;

  if (participants.length >= maxParticipants) return;

  if (!playerName) {
    elements.error.hidden = false;
    elements.error.textContent = "表示名を入力してください。";
    return;
  }

  const decoded = decodeResultCode(rawCode, config.seed);
  if (!decoded.ok) {
    elements.error.hidden = false;
    elements.error.textContent =
      decoded.reason === "wrong-battle"
        ? "この対戦の結果コードではないようです。コードを確認してください。"
        : "結果コードが正しくありません。入力した文字を確認してください。";
    return;
  }

  const normalizedCode = rawCode.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (usedResultCodes.has(normalizedCode)) {
    elements.error.hidden = false;
    elements.error.textContent = "この結果コードは、すでに登録されています。";
    return;
  }

  elements.error.hidden = true;
  usedResultCodes.add(normalizedCode);
  participants.push({ playerName, result: decoded.result, resultCode: normalizedCode });

  elements.nameInput.value = "";
  elements.codeInput.value = "";
  renderCollectList();
}

// 順位表を描画する。ノーマル/ハードは「クリア＞タイム＞ミス数」、LOVE連チャンは
// 「クリア＞到達数＞時間＞ミス数」で順位付けする（js/localBattleResult.jsのrankBattleParticipants）。
// 表示項目は、クリアした人・LOVE連チャンで途中終了した人どちらも同じ並びに揃えている
// （該当しない項目は「―」にする、という本人の指示どおり）。
function renderRankingList() {
  const { config } = getCurrentBattleSession();
  const questionCountLabel = QUESTION_COUNT_LABELS[config.questionCountValue] ?? config.questionCountValue;
  const categoryLabel = CATEGORY_LABELS[config.categoryFilterValue] ?? config.categoryFilterValue;
  const ruleLabel = RULE_LABELS[config.rule] ?? config.rule;
  elements.rankingConfigSummary.textContent = `${questionCountLabel}・${categoryLabel}・${ruleLabel}`;

  const ranked = rankBattleParticipants(participants, config.rule, config.penaltySeconds);

  const medalByRank = { 1: "🥇", 2: "🥈", 3: "🥉" };

  elements.rankingList.innerHTML = "";
  ranked.forEach((participant) => {
    const row = document.createElement("li");
    row.className = `battle-rank-row${participant.rank === 1 ? " is-rank-1" : ""}`;

    const medal = document.createElement("div");
    medal.className = "battle-rank-medal";
    medal.textContent = medalByRank[participant.rank] ?? `${participant.rank}位`;
    row.appendChild(medal);

    const info = document.createElement("div");
    info.className = "battle-rank-info";

    const name = document.createElement("p");
    name.className = "battle-rank-name";
    name.textContent = participant.playerName;
    info.appendChild(name);

    const { result } = participant;
    const metaParts = [`正解${result.correctCount}／ミス${result.missCount}`];
    if (config.rule === "loveChain" && !result.completed) {
      metaParts.push(`到達${result.reachedQuestionNumber}問`);
    }
    const meta = document.createElement("p");
    meta.className = "battle-rank-meta";
    meta.textContent = metaParts.join("／");
    info.appendChild(meta);

    row.appendChild(info);

    const timeValue = document.createElement("div");
    timeValue.className = "battle-rank-time";
    if (config.rule === "normal") {
      // ノーマルはペナルティ込みの最終記録を主役にし、その下に内訳（実測＋ペナルティ）を添える。
      const finalLine = document.createElement("p");
      finalLine.className = "battle-rank-time-final";
      finalLine.textContent = `${formatSeconds(computeNormalFinalRecordMs(result, config.penaltySeconds))}秒`;
      const penaltyTotalSeconds = result.missCount * config.penaltySeconds;
      const breakdownLine = document.createElement("p");
      breakdownLine.className = "battle-rank-time-breakdown";
      breakdownLine.textContent = `実測${formatSeconds(result.totalElapsedMs)}秒＋ペナルティ${penaltyTotalSeconds.toFixed(2)}秒`;
      timeValue.appendChild(finalLine);
      timeValue.appendChild(breakdownLine);
    } else {
      timeValue.textContent = result.completed
        ? `${formatSeconds(result.totalElapsedMs)}秒`
        : `${result.reachedQuestionNumber}問目で終了`;
    }
    row.appendChild(timeValue);

    elements.rankingList.appendChild(row);
  });

  elements.rankingRuleNote.textContent =
    config.rule === "loveChain"
      ? "順位は「クリア＞到達問題数＞経過時間＞ミス数」で決まります"
      : config.rule === "hard"
        ? "順位は「正解数＞合計タイム＞ミス数」で決まります"
        : `順位は「ミスペナルティ込みの最終記録（実測タイム＋ミス1回につき${config.penaltySeconds}秒）＞ミス数」で決まります`;

  return ranked;
}

// 【2026-08-08新設】自分の分の対戦結果を、統一プレイ履歴（js/playHistory.js）へ保存する。
// 参加者全員の順位・スコアもスナップショットとして一緒に残す（本人指示：後から
// 「誰と遊んで何位だったか」を見返せるように）。Firebaseは一切使わない、この端末だけの記録。
//
// 【注意】rankBattleParticipants()はspreadで新しいオブジェクト配列を返すため、
// participants[0]（自分）とrankedの要素はオブジェクトとして同一にならない（参照比較は使えない）。
// 代わりに、参加者ごとに一意なresultCode（js/localBattleResult.jsのencodeResultCode()）で照合する。
function saveLocalBattleHistoryEntry(ranked) {
  const { config } = getCurrentBattleSession();
  const myResultCode = participants[0].resultCode;
  const myEntry = ranked.find((participant) => participant.resultCode === myResultCode) ?? ranked[0];
  savePlayHistoryEntry({
    playedAt: Date.now(),
    modeId: "localBattle",
    modeLabel: "対戦モード",
    questionCount: myEntry.result.reachedQuestionNumber,
    isAllSongsMode: config.categoryFilterValue === "all",
    correctCount: myEntry.result.correctCount,
    wrongCount: myEntry.result.missCount,
    skippedCount: null,
    score: null,
    averageResponseMs: null,
    completed: myEntry.result.completed,
    details: {
      rule: config.rule,
      penaltySeconds: config.penaltySeconds,
      myRank: myEntry.rank,
      participantCount: ranked.length,
      standings: ranked.map((participant) => ({
        playerName: participant.playerName,
        rank: participant.rank,
        correctCount: participant.result.correctCount,
        missCount: participant.result.missCount,
        completed: participant.result.completed,
        totalElapsedMs: participant.result.completed ? participant.result.totalElapsedMs : null,
        isYou: participant.resultCode === myResultCode,
      })),
    },
  });
}

// 対戦モード：結果集計・順位発表画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
export function initLocalBattleResultScreens(newElements) {
  elements = newElements;
  elements.addButton.addEventListener("click", handleAddResult);
  elements.finishButton.addEventListener("click", () => {
    const ranked = renderRankingList();
    saveLocalBattleHistoryEntry(ranked);
    elements.navigateTo("battleResultRanking");
  });
  elements.homeLink.addEventListener("click", () => elements.navigateTo("start"));
  elements.rankingHomeButton.addEventListener("click", () => elements.navigateTo("start"));
}
