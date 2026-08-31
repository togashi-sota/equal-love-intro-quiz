// js/lyricsQuizBattleUi.js（Phase5：UI自動生成の土台）のテスト。
// DOMに触れない前半の純粋関数（describe*）だけを対象にする（後半のrender*は
// 副作用があるため、dev/lyricsQuizBattleUiMockup.htmlでブラウザ上で目視確認する）。
// 歌詞本文は一切扱わず、ダミーの曲ID・数値のみ使用。

import {
  describeRuleOptions,
  describeAnswerPoolSizeOptions,
  describeSettingsForm,
  describeHudItems,
  describeResultTable,
  describeLyricsReadiness,
  describeOwnMissingLyricsTitles,
  resolveAnswerSubmissionBlock,
  describeAnswerSubmissionBlockMessage,
  ANSWER_SUBMISSION_BLOCK_REASON,
  describeStealClaimOutcomeMessage,
  describeAnswerSubmissionFailureMessage,
} from "../js/lyricsQuizBattleUi.js";
import { STEAL_CLAIM_OUTCOME } from "../js/lyricsQuizBattleFirebasePayloads.js";
import { assertEqual } from "./test-utils.js";

export function runLyricsQuizBattleUiTests() {
  // ===== describeRuleOptions：ルール名を知らずに一覧を組み立てられる =====
  {
    const options = describeRuleOptions("steal");
    assertEqual(options.length, 3, "3ルール分の選択肢が返る");
    assertEqual(
      options.map((option) => option.ruleId).sort(),
      ["classic", "combo", "steal"],
      "3ルールのIDがすべて含まれる"
    );
    const stealOption = options.find((option) => option.ruleId === "steal");
    assertEqual(stealOption.selected, true, "選択中のルールにselected:trueが立つ");
    const classicOption = options.find((option) => option.ruleId === "classic");
    assertEqual(classicOption.selected, false, "選択されていないルールはselected:false");
    assertEqual(typeof stealOption.description === "string" && stealOption.description.length > 0, true, "説明文が空でない");
  }

  // ===== describeAnswerPoolSizeOptions：ルールごとに選べる回答方式が絞られる =====
  {
    const classicOptions = describeAnswerPoolSizeOptions("classic", 10);
    assertEqual(classicOptions.map((o) => o.size), [4, 10, 30, 50, "all"], "クラシックは全ての回答方式が選べる");
    assertEqual(classicOptions.find((o) => o.size === 10).selected, true, "現在選択中の方式にselected:trueが立つ");
    assertEqual(classicOptions.find((o) => o.size === "all").label, "全曲検索", "全曲検索の表示ラベル");
    assertEqual(classicOptions.find((o) => o.size === 4).label, "4択", "N択の表示ラベル");

    const stealOptions = describeAnswerPoolSizeOptions("steal", 4);
    assertEqual(stealOptions.map((o) => o.size), [4, 10], "奪い取りは4択・10択のみに絞り込まれる（30/50/全曲検索は出ない）");
  }

  // ===== describeSettingsForm：settingsFields宣言に現在値を添える =====
  {
    const fields = describeSettingsForm("combo", { hintIntervalSec: 8 });
    assertEqual(fields.length > 0, true, "コンボにも設定項目（ヒント表示時間）がある");
    const hintField = fields.find((f) => f.key === "hintIntervalSec");
    assertEqual(hintField.currentValue, 8, "現在の設定値が反映される");

    const fieldsWithDefault = describeSettingsForm("combo", {});
    assertEqual(
      fieldsWithDefault.find((f) => f.key === "hintIntervalSec").currentValue,
      6,
      "現在の設定値が無ければ、宣言側のdefaultが使われる"
    );
  }

  // ===== describeHudItems：hudFields宣言 + プレイヤー統計 =====
  {
    const items = describeHudItems("combo", { totalPoints: 120, currentCombo: 3, maxCombo: 5, currentMultiplier: 1.2 });
    assertEqual(items.map((i) => i.key), ["totalPoints", "currentCombo", "maxCombo", "currentMultiplier"], "コンボのHUD項目が宣言順に並ぶ");
    assertEqual(items.find((i) => i.key === "totalPoints").value, "120", "統計値が文字列化されて入る");

    const itemsWithMissingStat = describeHudItems("combo", {});
    assertEqual(itemsWithMissingStat.every((i) => i.value === "―"), true, "統計値が無い項目は「―」で表示される");
  }

  // ===== describeHudItems・describeResultTable：ミリ秒の項目は秒表示に変換される =====
  // 【2026-09-03追加・本人指摘】以前はunit: "ms"の指定を無視しており、総回答時間が
  // 「9620」のような生のミリ秒のまま画面に表示されてしまっていた。
  {
    const hudItems = describeHudItems("classic", { correctCount: 3, firstHintCorrectCount: 2, totalHintsUsed: 5, totalElapsedMs: 9620 });
    assertEqual(
      hudItems.find((i) => i.key === "totalElapsedMs").value,
      "9.62秒",
      "対戦中HUDのtotalElapsedMs（ミリ秒）は「秒」表示に変換される（生の9620が出ない）"
    );

    const rankedEntries = [
      {
        uid: "p1",
        displayName: "たろう",
        isHost: true,
        isYou: false,
        isDnf: false,
        result: { detail: { totalPoints: 100, totalHintsUsed: 8, totalElapsedMs: 13600, missCount: 1, skippedCount: 0 } },
      },
    ];
    const table = describeResultTable("classic", rankedEntries);
    assertEqual(table.header.includes("回答時間"), true, "結果表の見出しに「回答時間」列がある");
    const elapsedColumnIndex = table.header.indexOf("回答時間") - 2; // header先頭の「順位」「表示名」の分だけずらす
    assertEqual(table.rows[0].cells[elapsedColumnIndex], "13.60秒", "結果表のtotalElapsedMs（ミリ秒）も「秒」表示に変換される");
  }

  // ===== describeResultTable：resultColumns宣言 + 順位付け済み結果 =====
  {
    const rankedEntries = [
      {
        uid: "p1",
        displayName: "たろう",
        isHost: true,
        isYou: false,
        isDnf: false,
        oshiColor: "#ff69b4",
        result: { detail: { totalPoints: 100, maxCombo: 5, totalHintsUsed: 8, skippedCount: 2 } },
      },
      { uid: "p2", displayName: "はなこ", isHost: false, isYou: true, isDnf: false, result: { detail: { totalPoints: 80, maxCombo: 3, totalHintsUsed: 10, skippedCount: 0 } } },
      { uid: "p3", displayName: "じろう", isHost: false, isYou: false, isDnf: true, result: null },
    ];
    const table = describeResultTable("combo", rankedEntries);
    assertEqual(
      table.header,
      ["順位", "表示名", "獲得ポイント", "最大コンボ", "使用ヒント数", "未回答"],
      "見出しはresultColumns宣言から自動生成される（未回答列を含む・本人の指示・2026-08-06）"
    );
    assertEqual(table.rows[0].rank, 1, "1位のrank");
    assertEqual(table.rows[0].isHost, true, "ホストであることが反映される");
    assertEqual(table.rows[0].cells, ["100", "5", "8", "2"], "1位の各列の値（未回答2を含む）");
    assertEqual(table.rows[1].isYou, true, "本人であることが反映される");
    assertEqual(table.rows[2].isDnf, true, "DNFフラグが反映される");
    assertEqual(table.rows[2].cells, ["DNF", "DNF", "DNF", "DNF"], "DNFの行は未回答列を含む全列がDNF表示になる");
  }

  // ===== describeLyricsReadiness：ホスト向けの件数表示（曲名は含まない） =====
  {
    const lyricsCoverageByUid = {
      p1: { availableCount: 20, requiredCount: 20, complete: true, poolHash: "hash-a" },
      p2: { availableCount: 15, requiredCount: 20, complete: false, poolHash: "hash-a" },
    };
    const readiness = describeLyricsReadiness(lyricsCoverageByUid, "hash-a", { p1: "たろう", p2: "はなこ" });
    assertEqual(readiness.ready, false, "1人でも不足していればready:false");
    assertEqual(readiness.notReadyEntries.length, 1, "不足している参加者が1人検出される");
    assertEqual(readiness.notReadyEntries[0].displayName, "はなこ", "表示名が解決される");
    assertEqual(readiness.notReadyEntries[0].availableCount, 15, "件数が含まれる");
    assertEqual(
      JSON.stringify(readiness).includes("song") || JSON.stringify(readiness).includes("曲名"),
      false,
      "曲名相当の情報は一切含まれない（件数だけ）"
    );

    const allReady = describeLyricsReadiness(
      { p1: { availableCount: 20, requiredCount: 20, complete: true, poolHash: "hash-a" } },
      "hash-a",
      { p1: "たろう" }
    );
    assertEqual(allReady.ready, true, "全員揃っていればready:true");
  }

  // ===== describeOwnMissingLyricsTitles：本人の端末だけに出す想定のローカル情報 =====
  {
    const withMissing = describeOwnMissingLyricsTitles(["曲A", "曲B"]);
    assertEqual(withMissing.hasMissing, true, "不足曲があればhasMissing:true");
    assertEqual(withMissing.missingSongTitles, ["曲A", "曲B"], "不足曲名がそのまま入る");

    const noMissing = describeOwnMissingLyricsTitles([]);
    assertEqual(noMissing.hasMissing, false, "不足が無ければhasMissing:false");
  }

  // ===== resolveAnswerSubmissionBlock：回答ボタンが押せない理由を必ず1つ返す =====
  // 「何も表示せずreturnする」ことで無反応に見える不具合の再発防止
  // （本人からの指摘・2026-08-06）。判定順序は元のhandleAnswerChoiceClick()と同じ。
  {
    const readyState = { hasRoom: true, submitInFlight: false, hasMatch: true, questionStatus: "active", alreadyAnsweredThisQuestion: false };

    assertEqual(resolveAnswerSubmissionBlock(readyState), { blocked: false, reason: null }, "全条件が揃っていれば送信を許可する");

    assertEqual(
      resolveAnswerSubmissionBlock({ ...readyState, submitInFlight: true }),
      { blocked: true, reason: ANSWER_SUBMISSION_BLOCK_REASON.SUBMITTING },
      "送信中はSUBMITTING（他の理由より優先）"
    );

    assertEqual(
      resolveAnswerSubmissionBlock({ ...readyState, hasRoom: false }),
      { blocked: true, reason: ANSWER_SUBMISSION_BLOCK_REASON.TRANSITIONING },
      "roomが無ければTRANSITIONING"
    );

    assertEqual(
      resolveAnswerSubmissionBlock({ ...readyState, hasMatch: false }),
      { blocked: true, reason: ANSWER_SUBMISSION_BLOCK_REASON.TRANSITIONING },
      "matchが無ければTRANSITIONING"
    );

    assertEqual(
      resolveAnswerSubmissionBlock({ ...readyState, questionStatus: "resolved" }),
      { blocked: true, reason: ANSWER_SUBMISSION_BLOCK_REASON.QUESTION_RESOLVED },
      "questionStatusがactiveでなければQUESTION_RESOLVED"
    );

    assertEqual(
      resolveAnswerSubmissionBlock({ ...readyState, alreadyAnsweredThisQuestion: true }),
      { blocked: true, reason: ANSWER_SUBMISSION_BLOCK_REASON.ALREADY_ANSWERED },
      "既に回答済みならALREADY_ANSWERED"
    );

    for (const reason of Object.values(ANSWER_SUBMISSION_BLOCK_REASON)) {
      const message = describeAnswerSubmissionBlockMessage(reason);
      assertEqual(typeof message === "string" && message.length > 0, true, `理由「${reason}」には空でない案内文がある`);
    }
    assertEqual(describeAnswerSubmissionBlockMessage("unknownReason"), null, "未知の理由にはnullを返す（表示をスキップできる）");
  }

  // ===== describeStealClaimOutcomeMessage：奪い取り2段階送信の成功時メッセージ =====
  // 【2段階送信・2026-08-06】answer保存とwinner claim送信を分けたことで生まれた
  // outcome値（js/lyricsQuizBattleFirebase.jsのsubmitLyricsQuizAnswerWithStealClaim()参照）。
  {
    assertEqual(describeStealClaimOutcomeMessage(STEAL_CLAIM_OUTCOME.WON), "奪い取り成功！", "wonには成功の案内文");
    assertEqual(
      describeStealClaimOutcomeMessage(STEAL_CLAIM_OUTCOME.LOST_RACE),
      "わずかな差で先に正解されました",
      "lost-raceには競り負けた旨の案内文"
    );
    assertEqual(
      describeStealClaimOutcomeMessage(STEAL_CLAIM_OUTCOME.ANSWERED_WRONG),
      null,
      "answered-wrongは通常の不正解表示に任せるためnull"
    );
    assertEqual(describeStealClaimOutcomeMessage("unknownOutcome"), null, "未知のoutcomeにはnullを返す");
  }

  // ===== describeAnswerSubmissionFailureMessage：回答送信自体が失敗したときの案内文 =====
  {
    assertEqual(
      describeAnswerSubmissionFailureMessage("question-resolved"),
      "この問題の回答受付は終了しました。",
      "question-resolvedには受付終了の案内文"
    );
    assertEqual(
      describeAnswerSubmissionFailureMessage("permission-denied"),
      "権限エラーが発生しました。少し待ってからもう一度お試しください。",
      "permission-deniedには権限エラーの案内文"
    );
    assertEqual(
      describeAnswerSubmissionFailureMessage("network-error"),
      null,
      "network-error等はnullを返し、呼び出し側の汎用エラー文言にフォールバックさせる"
    );
    assertEqual(
      describeAnswerSubmissionFailureMessage("already-answered"),
      null,
      "already-answeredは呼び出し側が黙って成功扱いにするため対象外（null）"
    );
  }
}
