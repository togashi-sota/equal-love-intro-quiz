// js/lyricsQuizMatchProgress.js（歌詞クイズ オンライン対戦・進行エンジン）のテスト。
// Firebase・画面は一切使わず、合成データだけで1試合分の状態遷移を再現する。
// 歌詞本文は一切扱わず、ダミーの曲ID・数値のみ使用。

import {
  createMatchProgress,
  recordAnswer,
  recordStealClaim,
  tick,
  advanceToNextQuestion,
  setPlayerConnection,
  markPlayerDnf,
  canAdvanceToNextQuestion,
  finalizeMatch,
  restoreMatchProgressFromFirebase,
  computeScoreSnapshotFromState,
} from "../js/lyricsQuizMatchProgress.js";
import { createDefaultBattleRuleSettings, getBattleRuleVersion } from "../js/battleRules/index.js";
import { deriveHintLevelFromElapsedMs, computeElapsedMs } from "../js/lyricsQuizBattleTiming.js";
import { assertEqual } from "./test-utils.js";

function buildDummyQuestions(songIds) {
  return songIds.map((songId) => ({ song: { id: songId, title: songId }, hints: [], answerPool: [] }));
}

function withBattleRule(ruleId) {
  return {
    battleRuleId: ruleId,
    battleRuleVersion: getBattleRuleVersion(ruleId),
    ...createDefaultBattleRuleSettings(ruleId),
  };
}

export function runLyricsQuizMatchProgressTests() {
  // ===== 試合開始・問題1開始 =====
  {
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    const state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });
    assertEqual(state.status, "inProgress", "問題があれば試合はinProgressで始まる");
    assertEqual(state.currentQuestionIndex, 0, "最初の問題は0問目");
    assertEqual(state.currentQuestion.status, "active", "問題1は最初からactive（開始済み）");
    assertEqual(state.currentQuestion.startedAt, 0, "問題1の開始時刻はcreateMatchProgress()に渡したnowMs");
    assertEqual(state.historyByUid, { p1: [], p2: [] }, "履歴は全員分、空配列で初期化される");
    assertEqual(state.comboCountByUid, { p1: 0, p2: 0 }, "コンボ数は全員0から始まる");
  }

  // ===== 複数プレイヤーの回答・1人1回答（write-once） =====
  {
    const questions = buildDummyQuestions(["song-1"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });
    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    assertEqual(Object.keys(state.currentQuestion.answersByUid), ["p1"], "p1の回答が記録される");

    const beforeSecondAttempt = state;
    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 2, submittedAt: 900 });
    assertEqual(state, beforeSecondAttempt, "同じ問題に同じ人が2回目の回答をしても、1回目の内容のまま変わらない（1人1回答）");

    state = recordAnswer(state, "p2", { selectedSongId: "song-2", hintLevel: 1, submittedAt: 600 });
    assertEqual(Object.keys(state.currentQuestion.answersByUid).sort(), ["p1", "p2"], "複数プレイヤーの回答が別々に記録される");
  }

  // ===== 全員回答時の早期終了・クラシックの集計・次問題へ進む =====
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });

    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    // p2がまだ回答していない段階では、制限時間内なら終了しない。
    state = tick(state, settings, 1000);
    assertEqual(state.currentQuestion.status, "active", "未回答者がいて期限前なら、tick()しても終了しない");

    state = recordAnswer(state, "p2", { selectedSongId: "song-2", hintLevel: 2, submittedAt: 1200 });
    state = tick(state, settings, 1300);
    assertEqual(state.currentQuestion.status, "resolved", "全員回答済みになった直後のtick()で、制限時間前でも終了する");
    assertEqual(state.historyByUid.p1.length, 1, "p1の履歴に1問分の結果が積まれる");
    assertEqual(state.historyByUid.p1[0].outcome, "correct", "p1はsong-1を選んで正解");
    assertEqual(state.historyByUid.p2[0].outcome, "wrongAnswer", "p2はsong-2を選んだが正解はsong-1なので不正解");

    assertEqual(canAdvanceToNextQuestion(state), true, "確定済み・ホスト接続中なら次へ進められる");
    state = advanceToNextQuestion(state, 30000);
    assertEqual(state.currentQuestionIndex, 1, "2問目へ進む");
    assertEqual(state.currentQuestion.status, "active", "2問目は新しくactiveから始まる");
    assertEqual(state.currentQuestion.answersByUid, {}, "2問目の回答は空から始まる（前の問題の回答が残らない）");
  }

  // ===== 未回答者がいる限り無期限に継続（2026-09-06・本人指示で固定タイムアウトを撤廃） =====
  // 実機で「考えている途中なのに勝手に問題が終了する」問題が起きたため、以前あった
  // 固定60秒の自動タイムアウトを完全に撤廃した。どれだけ時間が経っても、tick()だけでは
  // 問題は終了しない。放置対策はホスト救済機能（3分無操作通知→わからない扱い）に
  // 委ねる（js/onlineLyricsQuizBattleScreen.js参照。仕組みとしては、通常の
  // recordAnswer(state, uid, {selectedSongId: SKIP_SELECTION, ...})を呼ぶだけなので、
  // 下の「1人1回答（write-once）」のテストが、その経路の正しさも兼ねて検証している）。
  {
    const settings = withBattleRule("classic");
    const questions = buildDummyQuestions(["song-1"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });

    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    // p2は長時間（1時間経過）回答しない。tick()だけでは絶対に終了しない。
    state = tick(state, settings, 3600000);
    assertEqual(state.currentQuestion.status, "active", "p2が未回答なら、どれだけ時間が経ってもtick()だけでは終了しない");

    // ホスト救済機能と同じ経路（recordAnswer()へSKIP_SELECTIONを渡す）で、p2を
    // 「わからない」扱いにした場合だけ、その後のtick()で正しく終了する。
    state = recordAnswer(state, "p2", { selectedSongId: "SKIP", hintLevel: 1, submittedAt: 3600000 });
    state = tick(state, settings, 3600100);
    assertEqual(state.currentQuestion.status, "resolved", "全員分の回答（p2はホスト救済によるSKIP）が揃えば終了する");
    assertEqual(state.historyByUid.p2[0].outcome, "skipped", "ホスト救済によるp2の回答はskipped扱い");
    assertEqual(state.historyByUid.p2[0].pointsAwarded, 0, "ホスト救済によるskipは0点");
  }

  // ===== 早押しバトル：winner確定後の集計（配点は正解一律1pt） =====
  {
    const settings = withBattleRule("steal");
    const questions = buildDummyQuestions(["song-1"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });

    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 800 });
    state = recordStealClaim(state, "p1", 800);
    // 後から別の人が奪い取ろうとしても、write-onceなので上書きされない。
    state = recordStealClaim(state, "p2", 900);
    assertEqual(state.currentQuestion.winner.uid, "p1", "先にclaimしたp1がwinnerのまま（write-once）");

    state = recordAnswer(state, "p2", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 5000 });
    state = tick(state, settings, 5100);
    assertEqual(state.currentQuestion.status, "resolved", "winner確定後は、他に未回答者がいても即終了する");
    assertEqual(state.historyByUid.p1[0].wonQuestion, true, "p1が勝者として確定する");
    assertEqual(state.historyByUid.p1[0].pointsAwarded, 1, "早押しバトルは正解一律1pt");
    assertEqual(state.historyByUid.p2[0].wonQuestion, false, "p2は正解していても、winnerではないので得点なし");
  }

  // ===== ポイントバトル：ヒント段階別の固定配点（4/3/2/1pt）・不正解でもポイントは減らない =====
  // 【2026-08-31改訂】コンボ（連続正解による倍率）の概念を撤廃したため、以前あった
  // 「コンボの継続とリセット」テストは、新しいポイントバトルの配点方式のテストへ差し替えた。
  {
    const settings = withBattleRule("combo");
    const questions = buildDummyQuestions(["song-1", "song-2", "song-3"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1"], hostUid: "p1", nowMs: 0 });

    // 1問目：ヒント1で正解（+4pt）
    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = tick(state, settings, 600);
    state = advanceToNextQuestion(state, 30000);
    assertEqual(state.historyByUid.p1[0].pointsAwarded, 4, "1問目はヒント1正解で+4pt");

    // 2問目：不正解（+0pt。それまでのポイントは減らない）
    state = recordAnswer(state, "p1", { selectedSongId: "song-2の不正解", hintLevel: 1, submittedAt: 30500 });
    state = tick(state, settings, 30600);
    state = advanceToNextQuestion(state, 60000);
    assertEqual(state.historyByUid.p1[1].pointsAwarded, 0, "2問目は不正解で+0pt（ポイントが減ることはない）");

    // 3問目：ヒント3まで開いてから正解（+2pt、他人の状態に影響されず独立して計算される）
    state = recordAnswer(state, "p1", { selectedSongId: "song-3", hintLevel: 3, submittedAt: 60500 });
    state = tick(state, settings, 60600);
    assertEqual(state.historyByUid.p1[2].pointsAwarded, 2, "3問目はヒント3正解で+2pt");

    const totalPoints = state.historyByUid.p1.reduce((sum, outcome) => sum + outcome.pointsAwarded, 0);
    assertEqual(totalPoints, 4 + 0 + 2, "合計ポイントは減点なく単純に加算される（4+0+2=6pt）");
  }

  // ===== 最終結果生成・DNF =====
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["strong", "dnf-player"], hostUid: "strong", nowMs: 0 });

    // 1問目：strongは正解、dnf-playerも一応正解してから離脱する。
    state = recordAnswer(state, "strong", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = recordAnswer(state, "dnf-player", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = tick(state, settings, 600);
    state = advanceToNextQuestion(state, 30000);

    // dnf-playerがここで離脱する（2問目には参加できない）。
    state = markPlayerDnf(state, "dnf-player");
    state = recordAnswer(state, "strong", { selectedSongId: "song-2", hintLevel: 1, submittedAt: 30500 });
    state = tick(state, settings, 30600);
    assertEqual(state.currentQuestion.status, "resolved", "DNF済みの参加者は「全員回答済み」の判定対象から除外される");
    state = advanceToNextQuestion(state, 60000);

    assertEqual(state.status, "finished", "全問終えたら試合はfinishedになる");
    const ranking = finalizeMatch(state, settings);
    assertEqual(ranking.map((entry) => entry.uid), ["strong", "dnf-player"], "DNFした参加者は、成績に関わらず必ず下位になる");
    assertEqual(ranking[0].result.completed, true, "完走したstrongはcompleted:true");
    assertEqual(ranking[1].result.completed, false, "DNFしたプレイヤーはcompleted:falseへ上書きされる");
  }

  // ===== DNF：完走済み結果を上書きしない（設計⑪①） =====
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });

    // p1は最後まで正しく回答し、試合はfinishedになる（＝p1は完走済み）。
    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = recordAnswer(state, "p2", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = tick(state, settings, 600);
    state = advanceToNextQuestion(state, 700);
    assertEqual(state.status, "finished", "1問だけの試合なので、ここでfinishedになる");

    const beforeDnfAttempt = state;
    state = markPlayerDnf(state, "p1");
    assertEqual(state, beforeDnfAttempt, "完走済みのp1をmarkPlayerDnf()しても、状態は一切変化しない");

    const ranking = finalizeMatch(state, settings);
    const p1Entry = ranking.find((entry) => entry.uid === "p1");
    assertEqual(p1Entry.result.completed, true, "完走済みのp1は、DNFを試みてもcompleted:trueのまま");

    // markPlayerDnf()を何度呼んでも結果が変わらない（冪等性）。
    const afterFirstAttempt = state;
    state = markPlayerDnf(state, "p1");
    state = markPlayerDnf(state, "p1");
    assertEqual(state, afterFirstAttempt, "markPlayerDnf()を複数回呼んでも状態は変化しない");
  }

  // ===== DNF：二重の安全策（finalizeMatch自身も完走済みを上書きしない） =====
  {
    // markPlayerDnf()のガードを経由せず、dnfUidsへ直接完走済みのuidが混入した
    // 想定外の状態を作り、finalizeMatch()側の再判定だけでも完走済み結果を
    // 守れることを確認する（本来はmarkPlayerDnf()側で防がれるが、念のための二重防御）。
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1"], hostUid: "p1", nowMs: 0 });
    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = tick(state, settings, 600);
    state = advanceToNextQuestion(state, 700);
    assertEqual(state.status, "finished", "1問だけの試合なので、ここでfinishedになる");

    const corruptedState = { ...state, dnfUids: ["p1"] }; // 本来あり得ない、完走済みなのにdnfUidsに入っている状態
    const ranking = finalizeMatch(corruptedState, settings);
    assertEqual(ranking[0].result.completed, true, "dnfUidsに不正に混入していても、実際の履歴が揃っていればcompleted:trueとして扱う");
  }

  // ===== DNF後の回答は受け付けない =====
  {
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });
    state = markPlayerDnf(state, "p2");
    const beforeLateAnswer = state;
    state = recordAnswer(state, "p2", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    assertEqual(state, beforeLateAnswer, "DNF済みの参加者からの（遅れて届いた）回答は無視される");
  }

  // ===== DNF：既存の回答履歴は削除されない =====
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1", "song-2", "song-3"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });

    // p2は1問目だけ回答してから離脱する（2問目以降は未回答のままDNFになる）。
    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = recordAnswer(state, "p2", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = tick(state, settings, 600);
    state = advanceToNextQuestion(state, 30000);
    const historyBeforeDnf = state.historyByUid.p2;

    state = markPlayerDnf(state, "p2");
    assertEqual(state.historyByUid.p2, historyBeforeDnf, "DNF確定後も、それまでに記録済みの回答履歴（1問目の結果）は削除・変化しない");
    assertEqual(state.historyByUid.p2.length, 1, "DNF時点までに答えた1問分の履歴はそのまま残る");
  }

  // ===== DNF：完走者1人・DNFが複数人でも正しく順位付けされる =====
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1", "song-2", "song-3"]);
    let state = createMatchProgress({
      questions,
      allPlayerUids: ["winner", "dnf-early", "dnf-late"],
      hostUid: "winner",
      nowMs: 0,
    });

    // 1問目：全員回答。dnf-earlyはここで離脱する。
    state = recordAnswer(state, "winner", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = recordAnswer(state, "dnf-early", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = recordAnswer(state, "dnf-late", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = tick(state, settings, 600);
    state = advanceToNextQuestion(state, 30000);
    state = markPlayerDnf(state, "dnf-early");

    // 2問目：winnerとdnf-lateだけ回答（dnf-earlyはDNF済みのため対象外）。dnf-lateはここで離脱する。
    state = recordAnswer(state, "winner", { selectedSongId: "song-2", hintLevel: 1, submittedAt: 30500 });
    state = recordAnswer(state, "dnf-late", { selectedSongId: "song-2", hintLevel: 1, submittedAt: 30500 });
    state = tick(state, settings, 30600);
    state = advanceToNextQuestion(state, 60000);
    state = markPlayerDnf(state, "dnf-late");

    // 3問目：winnerだけ回答。
    state = recordAnswer(state, "winner", { selectedSongId: "song-3", hintLevel: 1, submittedAt: 60500 });
    state = tick(state, settings, 60600);
    state = advanceToNextQuestion(state, 90000);

    assertEqual(state.status, "finished", "全問終えたら試合はfinishedになる");
    const ranking = finalizeMatch(state, settings);
    assertEqual(
      ranking.map((entry) => entry.uid),
      ["winner", "dnf-late", "dnf-early"],
      "完走者が最上位、DNF同士は離脱が遅かった（回答できた問題数が多い）方が上位になる"
    );
    assertEqual(ranking[0].result.completed, true, "完走したwinnerだけがcompleted:true");
    assertEqual(ranking[1].result.completed, false, "dnf-lateはcompleted:false");
    assertEqual(ranking[2].result.completed, false, "dnf-earlyはcompleted:false");
  }

  // ===== DNF：全員DNFでも例外にならない =====
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });

    // 誰も回答しないまま、両者ともDNFになる（例：開始直後に全員切断した想定）。
    state = markPlayerDnf(state, "p1");
    state = markPlayerDnf(state, "p2");
    // 残っている参加者がいない状態でも、tick()は例外を投げず、
    // 「未回答者なし（空配列に対するevery()は真）」として問題を終了させる。
    state = tick(state, settings, 100);
    assertEqual(state.currentQuestion.status, "resolved", "全員DNFでも、tick()は例外を投げず問題を確定できる（空配列に対する判定が正しく機能する）");
    state = advanceToNextQuestion(state, 200);
    state = tick(state, settings, 300);
    state = advanceToNextQuestion(state, 400);

    assertEqual(state.status, "finished", "全員DNFでも試合はfinishedまで進む（無限ループ・例外にならない）");
    const ranking = finalizeMatch(state, settings);
    assertEqual(ranking.length, 2, "全員分の結果が例外なく返る");
    assertEqual(
      ranking.every((entry) => entry.result.completed === false),
      true,
      "全員がcompleted:falseとして扱われる"
    );
  }

  // ===== ホスト切断時の停止／復帰 =====
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["host", "guest"], hostUid: "host", nowMs: 0 });

    state = recordAnswer(state, "host", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = recordAnswer(state, "guest", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 600 });
    state = tick(state, settings, 700);
    assertEqual(state.currentQuestion.status, "resolved", "ホストが接続中でなくても、問題の確定（tick）自体は行われる");

    state = setPlayerConnection(state, "host", "disconnected");
    assertEqual(canAdvanceToNextQuestion(state), false, "ホストが切断中は、次の問題へ進められない");
    const beforeAdvanceAttempt = state;
    state = advanceToNextQuestion(state, 30000);
    assertEqual(
      state.currentQuestionIndex,
      beforeAdvanceAttempt.currentQuestionIndex,
      "ホスト切断中にadvanceToNextQuestion()を呼んでも、内部でcanAdvanceToNextQuestion()と同じ条件を守るため進まない"
    );

    state = setPlayerConnection(state, "host", "connected");
    assertEqual(canAdvanceToNextQuestion(state), true, "ホストが復帰すれば、再び次の問題へ進められるようになる");
  }

  // ===== restoreMatchProgressFromFirebase（Phase6.5新設：ホストのリロード復帰） =====

  // ----- ①問題1の途中（誰かは回答済み、まだ未確定）に復帰 -----
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    const match = {
      currentQuestionIndex: 0,
      questionStatus: "active",
      currentQuestionStartedAt: 1000,
      resolvedAt: null,
      answers: { 0: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1500 } } },
      questionClaims: {},
    };
    const restored = restoreMatchProgressFromFirebase({
      questions,
      allPlayerUids: ["p1", "p2"],
      hostUid: "p1",
      match,
      settings,
      nowMs: 2000,
    });
    assertEqual(restored.status, "inProgress", "1問目の途中はinProgressとして復元される");
    assertEqual(restored.currentQuestionIndex, 0, "問題インデックスがそのまま復元される");
    assertEqual(restored.currentQuestion.status, "active", "まだ確定していない問題はactiveとして復元される");
    assertEqual(restored.currentQuestion.startedAt, 1000, "開始時刻はFirebaseのcurrentQuestionStartedAtがそのまま使われる（ヒント段階の再計算に必須）");
    assertEqual(restored.currentQuestion.answersByUid, match.answers[0], "既存の回答がそのまま復元される");
    assertEqual(restored.historyByUid, { p1: [], p2: [] }, "まだ確定していない問題なので履歴は空のまま");
    assertEqual(restored.comboCountByUid, { p1: 0, p2: 0 }, "コンボもまだ0のまま");
  }

  // ----- ②ヒント3の途中から復帰：startedAtが正しく復元され、js/lyricsQuizBattleTiming.jsの
  //        deriveHintLevelFromElapsedMsと組み合わせて正しいヒント段階を計算できることを確認 -----
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1"]);
    const match = {
      currentQuestionIndex: 0,
      questionStatus: "active",
      currentQuestionStartedAt: 5000,
      resolvedAt: null,
      answers: {},
      questionClaims: {},
    };
    // 開始（5000）から13秒後（18000）に復帰した想定：6秒間隔ならヒント3の途中のはず。
    const nowServerTimeMs = 18000;
    const restored = restoreMatchProgressFromFirebase({
      questions,
      allPlayerUids: ["p1"],
      hostUid: "p1",
      match,
      settings,
      nowMs: nowServerTimeMs,
    });
    const elapsedMs = computeElapsedMs({ questionStartedAt: restored.currentQuestion.startedAt, nowServerTimeMs });
    const hintLevel = deriveHintLevelFromElapsedMs({ elapsedMs, hintIntervalSec: settings.hintIntervalSec, maxHintLevel: 4 });
    assertEqual(hintLevel, 3, "復元されたstartedAtから、13秒経過時点のヒント段階が正しく3と計算できる");
  }

  // ----- ③全員回答済みだが未resolveの状態から復帰：復帰直後にtick()を呼べば進行を再開できる -----
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1"]);
    const match = {
      currentQuestionIndex: 0,
      questionStatus: "active", // Firebase上ではまだresolvedに書き込まれていない
      currentQuestionStartedAt: 0,
      resolvedAt: null,
      answers: {
        0: {
          p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 },
          p2: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 600 },
        },
      },
      questionClaims: {},
    };
    const restored = restoreMatchProgressFromFirebase({
      questions,
      allPlayerUids: ["p1", "p2"],
      hostUid: "p1",
      match,
      settings,
      nowMs: 700,
    });
    assertEqual(restored.currentQuestion.status, "active", "Firebase上でまだresolvedになっていなければactiveのまま復元される");
    const ticked = tick(restored, settings, 800);
    assertEqual(ticked.currentQuestion.status, "resolved", "復帰直後にtick()を呼べば、全員回答済みのため即座に確定できる（進行の再開に成功）");
  }

  // ----- ④resolved済み問題（まだ次へ進んでいない）から復帰：そのまま次の問題へ進められる -----
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    const match = {
      currentQuestionIndex: 0,
      questionStatus: "resolved",
      currentQuestionStartedAt: 0,
      resolvedAt: 5000,
      answers: { 0: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 } } },
      questionClaims: {},
    };
    const restored = restoreMatchProgressFromFirebase({
      questions,
      allPlayerUids: ["p1"],
      hostUid: "p1",
      match,
      settings,
      nowMs: 6000,
    });
    assertEqual(restored.currentQuestion.status, "resolved", "確定済みとして復元される");
    assertEqual(restored.historyByUid.p1.length, 1, "確定済みの問題は履歴へ積まれた状態で復元される（tick()と同じ挙動）");
    assertEqual(canAdvanceToNextQuestion(restored), true, "復帰後、ホストが接続中なら（初期値がconnectedのため）すぐ次の問題へ進められる");
    const advanced = advanceToNextQuestion(restored, 6100);
    assertEqual(advanced.currentQuestionIndex, 1, "2問目へ正しく進める");
    assertEqual(advanced.currentQuestion.status, "active", "2問目は新しくactiveから始まる");
  }

  // ----- ⑤最終問題が確定済みの状態から復帰：結果確定（finalizeMatch）まで進められる -----
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1"]);
    const match = {
      currentQuestionIndex: 0,
      questionStatus: "resolved",
      currentQuestionStartedAt: 0,
      resolvedAt: 100,
      answers: { 0: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 50 } } },
      questionClaims: {},
    };
    const restored = restoreMatchProgressFromFirebase({
      questions,
      allPlayerUids: ["p1"],
      hostUid: "p1",
      match,
      settings,
      nowMs: 200,
    });
    const advanced = advanceToNextQuestion(restored, 300);
    assertEqual(advanced.status, "finished", "1問だけの試合で、最終問題が確定済みの状態から復帰し、advanceToNextQuestion()を呼べばfinishedに進める");
    const ranking = finalizeMatch(advanced, settings);
    assertEqual(ranking.length, 1, "結果確定（finalizeMatch）まで正しく進められる");
    assertEqual(ranking[0].result.completed, true, "唯一の参加者p1はcompleted:true");
  }

  // ----- ⑥全問終了後（advance済み、currentQuestionIndexが範囲外）に復帰：finishedとして復元される -----
  {
    const settings = { ...withBattleRule("classic"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1"]);
    // 1問だけの試合で、ホストが既にadvanceToNextQuestion()まで呼んでいたが、
    // finalizeLyricsQuizMatch()の書き込みに失敗していた、という想定
    // （Firebase側のcurrentQuestionIndexが1＝questions.lengthまで進んでいる状態）。
    const match = {
      currentQuestionIndex: 1,
      questionStatus: "resolved",
      currentQuestionStartedAt: 0,
      resolvedAt: 100,
      answers: { 0: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 50 } } },
      questionClaims: {},
    };
    const restored = restoreMatchProgressFromFirebase({
      questions,
      allPlayerUids: ["p1"],
      hostUid: "p1",
      match,
      settings,
      nowMs: 200,
    });
    assertEqual(restored.status, "finished", "既に全問を通過済みの状態から復帰すると、即座にfinishedとして復元される");
    const ranking = finalizeMatch(restored, settings);
    assertEqual(ranking.length, 1, "結果確定への再試行（finalizeLyricsQuizMatchの書き込み失敗からの再開）ができる");
  }

  // ----- ⑦複数問題を経た後の復帰：過去の獲得ポイントが正しく引き継がれて復元される -----
  // 【2026-08-31改訂】コンボ（連続正解による倍率）の概念を撤廃したため、以前あった
  // 「コンボが引き継がれる」テストは、新しいポイントバトルの「過去の獲得ポイントの
  // 履歴が正しく復元される」テストへ差し替えた（comboCountByUidの仕組み自体は
  // js/lyricsQuizMatchProgress.js側にそのまま残っているが、comboRule.jsが常に
  // nextComboCount:0を返すため、実質的に使われなくなった）。
  {
    const settings = withBattleRule("combo");
    const questions = buildDummyQuestions(["song-1", "song-2", "song-3"]);
    const match = {
      currentQuestionIndex: 2,
      questionStatus: "active",
      currentQuestionStartedAt: 60000,
      resolvedAt: null,
      answers: {
        0: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 } }, // ヒント1正解=4pt
        1: { p1: { selectedSongId: "song-2", hintLevel: 3, submittedAt: 30500 } }, // ヒント3正解=2pt
      },
      questionClaims: {},
    };
    const restored = restoreMatchProgressFromFirebase({
      questions,
      allPlayerUids: ["p1"],
      hostUid: "p1",
      match,
      settings,
      nowMs: 61000,
    });
    assertEqual(restored.comboCountByUid.p1, 0, "コンボの概念を撤廃したため、常に0のまま");
    assertEqual(restored.historyByUid.p1.length, 2, "確定済みの過去2問分の履歴が復元される");
    assertEqual(restored.historyByUid.p1[0].pointsAwarded, 4, "1問目（ヒント1正解）のポイントが正しく復元される");
    assertEqual(restored.historyByUid.p1[1].pointsAwarded, 2, "2問目（ヒント3正解）のポイントが正しく復元される");
    assertEqual(restored.currentQuestionIndex, 2, "現在の問題インデックス（3問目）がそのまま復元される");
    assertEqual(restored.currentQuestion.status, "active", "3問目はまだ進行中として復元される");
  }

  // ----- finalizeMatch()の決定論性：同一入力から3ルールいずれも常に同じ結果になる -----
  // （本人の要望：「結果画面の3ルール集計が同一入力から決定論的に一致する」ことの裏付け。
  // ホストが同じ状態に対してfinalizeMatch()を複数回呼んでも―リロード後の再実行を含め―
  // 常に同じ結果が得られることを保証する）。
  {
    for (const ruleId of ["classic", "steal", "combo"]) {
      const settings = { ...withBattleRule(ruleId), hintIntervalSec: 6 };
      const questions = buildDummyQuestions(["song-1", "song-2", "song-3"]);
      let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });

      for (let i = 0; i < 3; i++) {
        const startedAt = i * 30000;
        state = recordAnswer(state, "p1", { selectedSongId: `song-${i + 1}`, hintLevel: 1, submittedAt: startedAt + 500 });
        if (ruleId === "steal") state = recordStealClaim(state, "p1", startedAt + 500);
        state = recordAnswer(state, "p2", { selectedSongId: "wrong-song", hintLevel: 2, submittedAt: startedAt + 900 });
        state = tick(state, settings, startedAt + 1000);
        state = advanceToNextQuestion(state, startedAt + 30000);
      }
      assertEqual(state.status, "finished", `${ruleId}：3問終えたら試合はfinishedになる`);

      const rankingFirst = finalizeMatch(state, settings);
      const rankingSecond = finalizeMatch(state, settings);
      assertEqual(rankingFirst, rankingSecond, `${ruleId}：同じstateに対してfinalizeMatch()を複数回呼んでも、常に同じ結果になる（決定論的）`);
    }
  }

  // ----- ⑧復帰処理を2回呼んでも状態が変わらない（決定論的・二重進行しないことの裏付け） -----
  {
    const settings = { ...withBattleRule("combo"), hintIntervalSec: 6 };
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    const match = {
      currentQuestionIndex: 1,
      questionStatus: "active",
      currentQuestionStartedAt: 30000,
      resolvedAt: null,
      answers: { 0: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 } } },
      questionClaims: {},
    };
    const args = { questions, allPlayerUids: ["p1"], hostUid: "p1", match, settings, nowMs: 31000 };
    const restoredFirst = restoreMatchProgressFromFirebase(args);
    const restoredSecond = restoreMatchProgressFromFirebase(args);
    assertEqual(
      restoredFirst,
      restoredSecond,
      "同じFirebaseスナップショットから複数回復元しても、常に同じ状態になる（決定論的）。ホスト側の復帰処理を誤って2回呼んでも、進行が二重に進んだり結果が変わったりしない"
    );
  }

  // ===== computeScoreSnapshotFromState（2026-09-01新設：ライブスコアボード） =====
  // 【最重要の情報漏洩防止の検証】この関数はstate.historyByUid（tick()が既に確定済みの
  // 結果だけを積んだ配列）だけを材料にする。「今の問題」がまだ進行中（active）で、
  // 一部の人しか回答していない段階では、その問題の結果はhistoryByUidに一切積まれていない
  // （tick()が問題を確定させるまでhistoryByUidへ何も書かない、という既存の実装保証）ため、
  // computeScoreSnapshotFromState()を呼んでも「今の問題」のヒントにはなり得ないことを確認する。

  // ----- ①試合開始直後：全員0点 -----
  {
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    const state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });
    const snapshot = computeScoreSnapshotFromState(state);
    assertEqual(snapshot, { questionsScoredCount: 0, scoresByUid: { p1: { totalPoints: 0, correctCount: 0 }, p2: { totalPoints: 0, correctCount: 0 } } }, "試合開始直後は、まだ誰も0問しか終えていないので全員0点");
  }

  // ----- ②「今の問題」の途中経過はスコアに一切反映されない（情報漏洩防止の核心） -----
  {
    const settings = withBattleRule("classic");
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });

    // 1問目：p1だけが正解を回答した。p2はまだ何も答えていない（＝問題はまだactiveのまま）。
    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    const snapshotWhileActive = computeScoreSnapshotFromState(state);
    assertEqual(
      snapshotWhileActive,
      { questionsScoredCount: 0, scoresByUid: { p1: { totalPoints: 0, correctCount: 0 }, p2: { totalPoints: 0, correctCount: 0 } } },
      "p1が回答済みでも、問題がまだ確定（resolved）していなければ、そのスコアは一切反映されない（p1が既に正解したことがp2にバレない）"
    );

    // p2も回答し、tick()で1問目が確定して初めて、スコアへ反映される。
    state = recordAnswer(state, "p2", { selectedSongId: "song-2", hintLevel: 1, submittedAt: 600 });
    state = tick(state, settings, 700);
    const snapshotAfterResolve = computeScoreSnapshotFromState(state);
    assertEqual(
      snapshotAfterResolve,
      { questionsScoredCount: 1, scoresByUid: { p1: { totalPoints: 1, correctCount: 1 }, p2: { totalPoints: 0, correctCount: 0 } } },
      "問題が確定（resolved）した後は、その問題の結果が正しくスコアへ反映される"
    );
  }

  // ----- ③次の問題が始まっても、前の問題の確定済みスコアはそのまま維持される -----
  {
    const settings = withBattleRule("classic");
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", nowMs: 0 });
    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = recordAnswer(state, "p2", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 600 });
    state = tick(state, settings, 700);
    state = advanceToNextQuestion(state, 30000);

    // 2問目が始まった直後（まだ誰も回答していない）でも、1問目の結果は消えない。
    const snapshot = computeScoreSnapshotFromState(state);
    assertEqual(
      snapshot,
      { questionsScoredCount: 1, scoresByUid: { p1: { totalPoints: 1, correctCount: 1 }, p2: { totalPoints: 1, correctCount: 1 } } },
      "次の問題が始まっても、前の問題までの累計スコアはそのまま維持される"
    );
  }

  // ----- ④ポイントバトル：totalPointsとcorrectCountが別々に正しく集計される -----
  {
    const settings = withBattleRule("combo");
    const questions = buildDummyQuestions(["song-1", "song-2"]);
    let state = createMatchProgress({ questions, allPlayerUids: ["p1"], hostUid: "p1", nowMs: 0 });

    // 1問目：ヒント1で正解（+4pt、正解1問）
    state = recordAnswer(state, "p1", { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 });
    state = tick(state, settings, 600);
    state = advanceToNextQuestion(state, 30000);
    // 2問目：ヒント3で正解（+2pt、正解2問目）
    state = recordAnswer(state, "p1", { selectedSongId: "song-2", hintLevel: 3, submittedAt: 30500 });
    state = tick(state, settings, 30600);

    const snapshot = computeScoreSnapshotFromState(state);
    assertEqual(
      snapshot,
      { questionsScoredCount: 2, scoresByUid: { p1: { totalPoints: 6, correctCount: 2 } } },
      "ポイントバトルは、配点合計（totalPoints=4+2=6）と正解数（correctCount=2）が別々に正しく集計される"
    );
  }
}
