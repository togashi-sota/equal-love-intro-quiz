// js/audioTroubleRecovery.jsのテスト（2026-09-17新設、本人指示：「音が出ない」救済ボタン
// 第2段階〈オンライン対戦：一瞬バトル・一瞬協力〉）。
//
// 【確認したいこと】
// ・computeNextReportAttemptSlot()が、問題が変わったら0番から数え直すこと。
// ・isAudioTroubleRecoveryLocking()が、"replaying"かつ問題番号が一致するときだけtrueを返すこと。
// ・computeAudioTroubleRecoveryAction()が：
//   - 申告が無ければ"none"（通常進行してよい）を返すこと。
//   - 新しい申告を検知したら"start-replay"を返し、attemptCountを1つ進めること。
//   - リカバリー再生の待機時間中は"wait"を返し、通常進行を止め続けること。
//   - 待機時間が終われば"finish-replay"を返すこと。
//   - 安全な回数（MAX_RECOVERY_REPLAY_ATTEMPTS）を使い切った後の申告は"swap-reserve"を返すこと。
//   - 予備曲への差し替え後（swapCount>=1）になお申告が来たら"return-to-lobby"を返すこと。
//   - 古い問題番号（別のquestionIndex）に対する申告は無視されること（レース安全性）。

import {
  MAX_RECOVERY_REPLAY_ATTEMPTS,
  RECOVERY_REPLAY_BUFFER_MS,
  RECOVERY_COUNTDOWN_MS,
  computeRecoveryReplayWindowMs,
  computeNextReportAttemptSlot,
  isAudioTroubleRecoveryLocking,
  computeAudioTroubleRecoveryAction,
} from "../js/audioTroubleRecovery.js";
import { assertEqual } from "./test-utils.js";

export function runAudioTroubleRecoveryTests() {
  // ---- computeRecoveryReplayWindowMs ----
  // 【2026-11-XX修正・本人指示：一瞬協力の「もう一度聞く」仕様変更】この関数はあくまで
  // 「音源トラブル復旧（ホスト主導の強制リプレイ）」専用の待機時間計算。一瞬バトル・
  // 一瞬協力ともリカバリー再生は3→2→1カウントダウンを挟む設計のため、呼び出し側は
  // includesCountdown:trueを渡す（js/onlineInstantBattleScreen.js・
  // js/onlineInstantCoopBattleScreen.jsの該当箇所参照）。一瞬協力のユーザー主導の
  // 「もう一度聞く」（playQuestionAudioForVoluntaryReplay()）はカウントダウンを持たないが、
  // ホストの待機処理を一切経由しない完全ローカルな操作のため、この関数の対象外
  // （呼び出されない）。falseの計算式自体は汎用の純粋関数として引き続き成立するため、
  // 境界値の確認としてテストは残す。
  {
    const withCountdown = computeRecoveryReplayWindowMs({ playDurationSec: 2, includesCountdown: true });
    assertEqual(withCountdown, RECOVERY_COUNTDOWN_MS + 2000 + RECOVERY_REPLAY_BUFFER_MS, "一瞬バトル・一瞬協力共通（リカバリー再生）：カウントダウン込みの待機時間");
    const withoutCountdown = computeRecoveryReplayWindowMs({ playDurationSec: 2, includesCountdown: false });
    assertEqual(withoutCountdown, 2000 + RECOVERY_REPLAY_BUFFER_MS, "カウントダウン無しの場合の計算式（現在はどちらのモードからも使われない）");
  }

  // ---- computeRecoveryReplayWindowMs：一瞬バトル・一瞬協力の実際の再生秒数設定
  // （0.5秒／1.0秒／1.5秒）での回帰確認 ----
  // 【2026-11-XX新設・本人指示：一瞬協力の「もう一度聞く」仕様変更】音源トラブル復旧は
  // 両モードともカウントダウンを維持する設計のため、実際に選べる3つの再生秒数それぞれで
  // 「カウントダウン3秒＋再生秒数＋バッファ1.5秒」という想定どおりの待機時間になっているかを
  // 明示的に固定する（将来どちらかの秒数だけ計算式が崩れる回帰を検知できるようにする）。
  {
    assertEqual(
      computeRecoveryReplayWindowMs({ playDurationSec: 0.5, includesCountdown: true }),
      RECOVERY_COUNTDOWN_MS + 500 + RECOVERY_REPLAY_BUFFER_MS,
      "再生秒数0.5秒：リカバリー再生の待機時間"
    );
    assertEqual(
      computeRecoveryReplayWindowMs({ playDurationSec: 1.0, includesCountdown: true }),
      RECOVERY_COUNTDOWN_MS + 1000 + RECOVERY_REPLAY_BUFFER_MS,
      "再生秒数1.0秒：リカバリー再生の待機時間"
    );
    assertEqual(
      computeRecoveryReplayWindowMs({ playDurationSec: 1.5, includesCountdown: true }),
      RECOVERY_COUNTDOWN_MS + 1500 + RECOVERY_REPLAY_BUFFER_MS,
      "再生秒数1.5秒：リカバリー再生の待機時間"
    );
  }

  // ---- computeNextReportAttemptSlot ----
  {
    assertEqual(computeNextReportAttemptSlot({ recovery: undefined, questionIndex: 0 }), 0, "申告が一度も無ければ0番");
    assertEqual(
      computeNextReportAttemptSlot({ recovery: { questionIndex: 0, attemptCount: 1 }, questionIndex: 0 }),
      1,
      "同じ問題なら、これまでの試行回数がそのまま次のslot番号になる"
    );
    assertEqual(
      computeNextReportAttemptSlot({ recovery: { questionIndex: 0, attemptCount: 2, swapCount: 1 }, questionIndex: 1 }),
      0,
      "問題が変われば、前の問題の試行回数を引きずらず0番から数え直す"
    );
  }

  // ---- isAudioTroubleRecoveryLocking ----
  {
    assertEqual(isAudioTroubleRecoveryLocking({ recovery: undefined, questionIndex: 0 }), false, "申告記録が無ければロックしない");
    assertEqual(
      isAudioTroubleRecoveryLocking({ recovery: { questionIndex: 0, status: "resolved" }, questionIndex: 0 }),
      false,
      "resolvedはロックしない（通常進行してよい）"
    );
    assertEqual(
      isAudioTroubleRecoveryLocking({ recovery: { questionIndex: 0, status: "replaying" }, questionIndex: 1 }),
      false,
      "問題番号が違えばロックしない（古い問題の状態を新しい問題に誤って引き継がない）"
    );
    assertEqual(
      isAudioTroubleRecoveryLocking({ recovery: { questionIndex: 0, status: "replaying" }, questionIndex: 0 }),
      true,
      "同じ問題でreplaying中ならロックする"
    );
  }

  // ---- computeAudioTroubleRecoveryAction：申告が無ければ通常進行 ----
  {
    const action = computeAudioTroubleRecoveryAction({
      recovery: undefined,
      reports: undefined,
      questionIndex: 0,
      nowMs: 1000,
      replayWindowMs: 5000,
    });
    assertEqual(action, { type: "none" }, "申告が無ければ通常の回答集計を進めてよい");
  }

  // ---- computeAudioTroubleRecoveryAction：新しい申告→リカバリー再生を開始 ----
  {
    const reports = { 0: { 0: { uid: "p1", reportedAt: 1000 } } };
    const action = computeAudioTroubleRecoveryAction({
      recovery: undefined,
      reports,
      questionIndex: 0,
      nowMs: 1000,
      replayWindowMs: 5000,
    });
    assertEqual(action, { type: "start-replay", nextAttemptCount: 1, reportedByUid: "p1" }, "新しい申告(0番slot)を検知したらリカバリー再生1回目を開始する");
  }

  // ---- computeAudioTroubleRecoveryAction：待機時間中は"wait"、通常進行を止め続ける ----
  {
    const recovery = { questionIndex: 0, status: "replaying", attemptCount: 1, startedAt: 1000 };
    const action = computeAudioTroubleRecoveryAction({
      recovery,
      reports: {},
      questionIndex: 0,
      nowMs: 3000, // startedAtから2000ms経過。replayWindowMs(5000)未満。
      replayWindowMs: 5000,
    });
    assertEqual(action, { type: "wait" }, "待機時間中は何もせず、通常進行も止め続ける");
  }

  // ---- computeAudioTroubleRecoveryAction：待機時間が終わったら"finish-replay" ----
  {
    const recovery = { questionIndex: 0, status: "replaying", attemptCount: 1, startedAt: 1000 };
    const action = computeAudioTroubleRecoveryAction({
      recovery,
      reports: {},
      questionIndex: 0,
      nowMs: 6001, // startedAtから5001ms経過。replayWindowMs(5000)以上。
      replayWindowMs: 5000,
    });
    assertEqual(action, { type: "finish-replay" }, "待機時間が終わったら通常進行を再開してよい状態に戻す");
  }

  // ---- computeAudioTroubleRecoveryAction：2回目の申告→2回目のリカバリー再生 ----
  {
    const recovery = { questionIndex: 0, status: "resolved", attemptCount: 1, swapCount: 0 };
    const reports = { 0: { 1: { uid: "p2", reportedAt: 2000 } } };
    const action = computeAudioTroubleRecoveryAction({
      recovery,
      reports,
      questionIndex: 0,
      nowMs: 2000,
      replayWindowMs: 5000,
    });
    assertEqual(action, { type: "start-replay", nextAttemptCount: 2, reportedByUid: "p2" }, "1回目の再生後、resolvedの状態で2回目の申告(1番slot)が来たら2回目のリカバリー再生を開始する");
  }

  // ---- computeAudioTroubleRecoveryAction：安全な回数を使い切った後の申告→予備曲へ差し替え ----
  {
    const recovery = { questionIndex: 0, status: "resolved", attemptCount: MAX_RECOVERY_REPLAY_ATTEMPTS, swapCount: 0 };
    const reports = { 0: { [MAX_RECOVERY_REPLAY_ATTEMPTS]: { uid: "p1", reportedAt: 3000 } } };
    const action = computeAudioTroubleRecoveryAction({
      recovery,
      reports,
      questionIndex: 0,
      nowMs: 3000,
      replayWindowMs: 5000,
    });
    assertEqual(action, { type: "swap-reserve", swapCount: 0 }, `安全な回数(${MAX_RECOVERY_REPLAY_ATTEMPTS}回)を使い切った後の申告は予備曲への差し替えへ進む`);
  }

  // ---- computeAudioTroubleRecoveryAction：予備曲へ差し替え済みなのに、なお申告が来た→ロビーへ戻す ----
  {
    // 別の問題（予備曲、questionIndex:1）に切り替わった後、再び安全な回数を使い切った状態。
    const recovery = { questionIndex: 1, status: "resolved", attemptCount: MAX_RECOVERY_REPLAY_ATTEMPTS, swapCount: 1 };
    const reports = { 1: { [MAX_RECOVERY_REPLAY_ATTEMPTS]: { uid: "p1", reportedAt: 4000 } } };
    const action = computeAudioTroubleRecoveryAction({
      recovery,
      reports,
      questionIndex: 1,
      nowMs: 4000,
      replayWindowMs: 5000,
    });
    assertEqual(action, { type: "return-to-lobby" }, "予備曲への差し替え（swapCount>=1）後もなお改善しなければ、試合を終了してロビーへ戻す");
  }

  // ---- computeAudioTroubleRecoveryAction：レース安全性・古い問題番号の申告は無視する ----
  {
    // questionIndex:0の古い申告が残っている状態で、今の問題はquestionIndex:1に進んでいる。
    const recovery = { questionIndex: 0, status: "resolved", attemptCount: 1, swapCount: 0 };
    const reports = { 0: { 1: { uid: "p1", reportedAt: 1000 } } }; // 古い問題(0)への申告のみ存在
    const action = computeAudioTroubleRecoveryAction({
      recovery,
      reports,
      questionIndex: 1, // 今の問題は1
      nowMs: 5000,
      replayWindowMs: 5000,
    });
    assertEqual(action, { type: "none" }, "古い問題番号（questionIndex:0）に対する申告は、今の問題（1）には一切影響しない");
  }

  // ---- computeAudioTroubleRecoveryAction：レース安全性・同じslotへの2件目は集計に登場しない ----
  // （Firebase Rules側のwrite-once制約により、実際には2件目はそもそも書き込めない。
  //   ここでは「もし書き込めたとしても、reports[q][slot]は1つの値しか持てない」という
  //   データ構造自体が「後勝ち」を許さないことを、ホスト側の集計結果として確認する）。
  {
    const reports = { 0: { 0: { uid: "p1", reportedAt: 1000 } } }; // p2の申告は同じslotのため反映されない前提
    const action = computeAudioTroubleRecoveryAction({
      recovery: undefined,
      reports,
      questionIndex: 0,
      nowMs: 1000,
      replayWindowMs: 5000,
    });
    assertEqual(action.reportedByUid, "p1", "同じslotに対しては最初に採用された申告者だけが有効になる");
  }
}
