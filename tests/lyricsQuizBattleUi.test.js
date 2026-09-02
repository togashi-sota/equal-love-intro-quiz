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
  describeScoreboard,
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
  // 【2026-08-31改訂】ヒントを手動で開く方式になり、ルール固有設定（hintIntervalSec）が
  // 無くなったため、settingsFieldsは常に空配列を返す。
  {
    const fields = describeSettingsForm("combo", {});
    assertEqual(fields, [], "ポイントバトルにルール固有設定は無いため、settingsFieldsは空配列");
  }

  // ===== describeHudItems：hudFields宣言 + プレイヤー統計 =====
  // 【2026-08-31改訂・本人指示】対戦中は自分の現在ポイントだけを見せる方針のため、
  // 3ルールとも対戦中HUDはtotalPointsの1項目のみになった。
  {
    const items = describeHudItems("combo", { totalPoints: 120 });
    assertEqual(items.map((i) => i.key), ["totalPoints"], "ポイントバトルのHUD項目はtotalPointsのみ");
    assertEqual(items[0].value, "120", "統計値が文字列化されて入る");

    const itemsWithMissingStat = describeHudItems("combo", {});
    assertEqual(itemsWithMissingStat.every((i) => i.value === "―"), true, "統計値が無い項目は「―」で表示される");
  }

  // ===== describeResultTable：ミリ秒の項目は秒表示に変換される =====
  // 【2026-09-03追加・本人指摘】以前はunit: "ms"の指定を無視しており、総回答時間が
  // 「9620」のような生のミリ秒のまま画面に表示されてしまっていた。
  {
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

  // ===== describeResultTable：resultColumns宣言 + 順位付け済み結果 + 同点は同じ順位 =====
  // 【2026-08-31改訂・本人指示】「同点の場合に回答時間などで無理に順位を分けないでください」
  // との指示により、同点は完全に同じ順位（competition方式：1位・1位・3位のように
  // 次の順位をスキップする）になることを確認する。
  {
    const rankedEntries = [
      {
        uid: "p1",
        displayName: "たろう",
        isHost: true,
        isYou: false,
        isDnf: false,
        oshiColor: "#ff69b4",
        result: { detail: { totalPoints: 8, firstHintCorrectCount: 5, totalHintsUsed: 8, skippedCount: 2 } },
      },
      {
        uid: "p2",
        displayName: "はなこ",
        isHost: false,
        isYou: true,
        isDnf: false,
        result: { detail: { totalPoints: 8, firstHintCorrectCount: 4, totalHintsUsed: 10, skippedCount: 0 } },
      },
      {
        uid: "p4",
        displayName: "さぶろう",
        isHost: false,
        isYou: false,
        isDnf: false,
        result: { detail: { totalPoints: 5, firstHintCorrectCount: 3, totalHintsUsed: 9, skippedCount: 1 } },
      },
      { uid: "p3", displayName: "じろう", isHost: false, isYou: false, isDnf: true, result: null },
    ];
    const table = describeResultTable("combo", rankedEntries);
    assertEqual(
      table.header,
      ["順位", "表示名", "獲得ポイント", "ヒント1正解数", "使用ヒント数", "わからない回数"],
      "見出しはresultColumns宣言から自動生成される（本人の指示・2026-08-06：未回答/わからない列を含む）"
    );
    assertEqual(table.rows[0].rank, 1, "同点1位（p1）のrankは1");
    assertEqual(table.rows[0].isHost, true, "ホストであることが反映される");
    assertEqual(table.rows[0].cells, ["8", "5", "8", "2"], "1位の各列の値（本人指示どおりヒント段階は順位に影響しないが列としては表示する）");
    assertEqual(table.rows[1].rank, 1, "同点1位（p2）も同じrank1になる（回答時間・ヒント使用数で無理に分けない）");
    assertEqual(table.rows[1].isYou, true, "本人であることが反映される");
    assertEqual(table.rows[2].rank, 3, "次に点数が違うp4は、同点2人ぶんスキップして3位になる（competition方式）");
    assertEqual(table.rows[3].isDnf, true, "DNFフラグが反映される");
    assertEqual(table.rows[3].rank, null, "DNFの行にはrank番号を付けない（表示はcellsとは別にDNF文字列で行う）");
    assertEqual(table.rows[3].cells, ["DNF", "DNF", "DNF", "DNF"], "DNFの行は全列がDNF表示になる");
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
    assertEqual(describeStealClaimOutcomeMessage(STEAL_CLAIM_OUTCOME.WON), "早押し成功！", "wonには成功の案内文");
    assertEqual(
      describeStealClaimOutcomeMessage(STEAL_CLAIM_OUTCOME.LOST_RACE),
      "わずかな差で先に正解されました",
      "lost-raceには競り負けた旨の案内文"
    );
    // 【2026-10-01改訂・本人指示：結果画面/再戦フロー全面設計6章】以前は
    // 「通常の不正解表示で十分」としてnull扱いにしていたが、実際には早押しルールで
    // 不正解になった本人に「回答しました」としか出ておらず分かりづらかったため、
    // 専用の案内文を返すよう変更した。
    assertEqual(
      describeStealClaimOutcomeMessage(STEAL_CLAIM_OUTCOME.ANSWERED_WRONG),
      "残念、不正解",
      "answered-wrongには「残念、不正解」の案内文（本人にその場で分かるようにする）"
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

  // ===== describeScoreboard（2026-09-01新設：ライブスコアボード） =====
  {
    const participantsByUid = {
      p1: { displayName: "たろう", oshiMemberId: "member-taro" },
      p2: { displayName: "はなこ" },
      p3: { displayName: "じろう" },
    };

    // ----- 正解数バトル：correctCountを見せる -----
    {
      const scoreSnapshot = {
        questionsScoredCount: 3,
        scoresByUid: { p1: { totalPoints: 2, correctCount: 2 }, p2: { totalPoints: 3, correctCount: 3 }, p3: { totalPoints: 1, correctCount: 1 } },
      };
      const scoreboard = describeScoreboard({ ruleId: "classic", scoreSnapshot, participantsByUid, myUid: "p1" });
      assertEqual(scoreboard.valueUnit, "問", "正解数バトルの単位は「問」");
      assertEqual(scoreboard.hasData, true, "scoreSnapshotがあればhasData:true");
      assertEqual(scoreboard.questionsScoredCount, 3, "questionsScoredCountがそのまま渡る");
      assertEqual(scoreboard.rows.map((row) => row.uid), ["p2", "p1", "p3"], "correctCountの降順で並ぶ");
      assertEqual(scoreboard.rows.map((row) => row.value), [3, 2, 1], "正解数バトルはcorrectCountの値が表示値になる");
      assertEqual(scoreboard.rows.find((row) => row.uid === "p1").isMe, true, "myUidと一致する行にisMe:trueが立つ");
      assertEqual(scoreboard.rows.find((row) => row.uid === "p2").isMe, false, "myUid以外はisMe:false");
      assertEqual(scoreboard.rows.find((row) => row.uid === "p1").displayName, "たろう", "参加者の表示名がそのまま使われる");
      // 【2026-09-26追加・本人指示：オンライン対戦総合改修19-8章】スコアボードの各行にも
      // 推し色＋代表称号バッジのアイコンを添えられるよう、oshiMemberIdをそのまま持ち出す。
      assertEqual(
        scoreboard.rows.find((row) => row.uid === "p1").oshiMemberId,
        "member-taro",
        "参加者データにoshiMemberIdがあればそのまま行に含まれる"
      );
      assertEqual(
        scoreboard.rows.find((row) => row.uid === "p2").oshiMemberId,
        null,
        "oshiMemberIdが無い参加者はnullになる（未定義エラーにしない）"
      );
    }

    // ----- ポイントバトル・早押しバトル：totalPointsを見せる -----
    {
      const scoreSnapshot = {
        questionsScoredCount: 2,
        scoresByUid: { p1: { totalPoints: 7, correctCount: 2 }, p2: { totalPoints: 4, correctCount: 1 }, p3: { totalPoints: 4, correctCount: 1 } },
      };
      const comboScoreboard = describeScoreboard({ ruleId: "combo", scoreSnapshot, participantsByUid, myUid: "p2" });
      assertEqual(comboScoreboard.valueUnit, "pt", "ポイントバトルの単位は「pt」");
      assertEqual(comboScoreboard.rows.map((row) => row.value), [7, 4, 4], "ポイントバトルはtotalPointsの値が表示値になる");

      const stealScoreboard = describeScoreboard({ ruleId: "steal", scoreSnapshot, participantsByUid, myUid: "p2" });
      assertEqual(stealScoreboard.valueUnit, "pt", "早押しバトルもポイントバトルと同じくtotalPointsを見せる（単位はpt）");
    }

    // ----- まだ1問も確定していない（scoreSnapshotがまだFirebaseに存在しない）場合 -----
    {
      const scoreboard = describeScoreboard({ ruleId: "classic", scoreSnapshot: undefined, participantsByUid, myUid: "p1" });
      assertEqual(scoreboard.hasData, false, "scoreSnapshotが無ければhasData:false");
      assertEqual(scoreboard.questionsScoredCount, 0, "確定済み問題数は0扱い");
      assertEqual(scoreboard.rows.every((row) => row.value === 0), true, "スコアがまだ無い参加者は全員0点として表示される（エラーにしない）");
      assertEqual(scoreboard.rows.length, 3, "参加者3人分の行が、スコアの有無に関わらず作られる");
    }

    // ----- 【2026-10-01新設・本人指示：歌詞クイズ問題画面モバイルレイアウト再設計5章】
    //       同点は同順位（競技方式）で、次に違う点数の相手が来たときだけ実際の並び順
    //       （スキップした順位）を付ける。describeResultTable()と同じ考え方をスコアボードにも適用。 -----
    {
      const scoreSnapshot = {
        questionsScoredCount: 2,
        scoresByUid: { p1: { totalPoints: 5, correctCount: 5 }, p2: { totalPoints: 3, correctCount: 3 }, p3: { totalPoints: 3, correctCount: 3 } },
      };
      const scoreboard = describeScoreboard({ ruleId: "combo", scoreSnapshot, participantsByUid, myUid: "p3" });
      assertEqual(scoreboard.rows.find((row) => row.uid === "p1").rank, 1, "1位（唯一の5pt）はrank:1");
      assertEqual(scoreboard.rows.find((row) => row.uid === "p2").rank, 2, "同点2人（p2・p3）は同じrank:2になる");
      assertEqual(scoreboard.rows.find((row) => row.uid === "p3").rank, 2, "同点2人（p2・p3）は同じrank:2になる");
    }

    // ----- 【2026-10-01新設・本人指示】同点グループの中では、横スクロール一覧ですぐ見つけられる
    //       よう自分（isMe）を先頭に並べる（対戦開始直後の全員同点状態を含む）。 -----
    {
      // 全員が0点（対戦開始直後）でも、自分（p2）が同点グループの先頭に来る。
      const startScoreboard = describeScoreboard({
        ruleId: "classic",
        scoreSnapshot: undefined,
        participantsByUid,
        myUid: "p2",
      });
      assertEqual(startScoreboard.rows[0].uid, "p2", "開始直後の全員同点時は自分が先頭に並ぶ");
      assertEqual(startScoreboard.rows[0].rank, 1, "自分が先頭でも、同点グループ全員が同じrank:1になる");
      assertEqual(startScoreboard.rows[1].rank, 1, "自分以外の同点者も同じrank:1になる");
      assertEqual(startScoreboard.rows[2].rank, 1, "自分以外の同点者も同じrank:1になる");

      // 自分以外の同点者どうしの相対順序は、participantsの列挙順のまま変えない
      // （p1→p3の順で並んでいたものを、p2を先頭に出す以外は崩さない）。
      assertEqual(
        startScoreboard.rows.map((row) => row.uid),
        ["p2", "p1", "p3"],
        "自分だけ先頭へ移動し、自分以外の相対順序（p1→p3）はそのまま保たれる"
      );
    }
  }
}
