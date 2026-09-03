// 「🔇 音が出ない」救済ボタン・第2段階（オンライン対戦：一瞬バトル・一瞬協力）の
// 進行ロジックを、Firebase・画面から完全に切り離した純粋関数として表現するモジュール
// （2026-09-17新設、本人指示）。js/instantBattleMatchProgress.js・js/instantCoopMatchProgress.jsと
// 同じ設計方針（進行判定はこのファイルの中だけで完結させ、Firebaseは保存・同期する層に
// 限定する）を踏襲している。
//
// 【第1段階（オフライン各モード、js/main.js）との違い】オフラインは「自分の画面だけ」を
// 制御すればよかったが、オンライン一瞬バトル・一瞬協力は「全員が同じ問題を同時に見る」
// host-tick方式の同期進行（js/instantBattleMatchProgress.js・js/instantCoopMatchProgress.js）
// の上に乗っているため、1人の申告が試合全体（全員の回答ロック・進行の一時停止・全員への
// 同じタイミングでの再生し直し）に影響する。この非対称性（「参加者は申告するだけ」
// 「ホストだけが実際に進行を動かす」）は、既存のhost-tick方式（回答集計・確定・次の問題への
// 進行を、ホストの端末だけがtick()で判定し、Firebaseへ書く）と全く同じ役割分担にする。
//
// 【状態の形（Firebase上のmatches/{matchId}/audioTroubleRecoveryの中身）】
// {
//   reports: {
//     [questionIndex]: {
//       [attemptSlot]: { uid, reportedAt }   // 参加者がwrite-once（1問につき複数attemptSlotを
//                                             // 使い切りながら複数回申告できる。同じslotへの
//                                             // 2つ目の書き込みはFirebase Rulesが拒否するため、
//                                             // 「最初の有効な1件だけが採用される」が保証される）
//     }
//   },
//   status: "replaying" | "resolved",   // ホストだけが書く。省略時（キー自体が無い）は
//                                        // "resolved"と同じ「何も進行中でない」扱い。
//   questionIndex: number,               // 今のstatusがどの問題についてのものか（ホストだけが書く）
//   attemptCount: number,                 // questionIndexの問題で、これまでに何回リカバリー
//                                          // 再生を行ったか（ホストだけが書く）
//   swapCount: number,                    // この試合全体で、このボタンがきっかけで予備曲へ
//                                          // 差し替えた回数（ホストだけが書く。問題をまたいで
//                                          // 累積する）
//   reportedByUid: string,                // 今の（直近の）リカバリー再生のきっかけになった申告者
//   startedAt: number,                    // 今のstatus:"replaying"が始まったサーバー時刻
//   resolvedAt: number,                   // 直近の解決（"resolved"への遷移）のサーバー時刻
// }
//
// 【なぜattemptSlotという仕組みにしたか】1つの問題に対して「音が出ない」は複数回
// （最大MAX_RECOVERY_REPLAY_ATTEMPTS回のリカバリー再生＋その後の予備曲差し替え判定）
// 押される可能性があるが、Firebaseのwrite-onceパターン（js/instantBattleFirebase.jsの
// questionClaims/{questionIndex}/winnerと同じ考え方）は「1つのパスにつき1回だけ」しか
// 表現できない。そこで「questionIndexの中で、今から受け付ける申告が何回目か
// （＝ホストが管理するattemptCount）」を鍵の一部（attemptSlot）にすることで、
// 同じ問題の中で何度も「新しいwrite-onceの枠」を用意できるようにしている。

// 安全な回数（本人指示：例えば2回まで）だけリカバリー再生を試みる。この回数を超えて
// なお申告が来た場合は、静かに予備曲へ差し替える（本人指示のフォールバック①）。
export const MAX_RECOVERY_REPLAY_ATTEMPTS = 2;

// リカバリー再生1回あたり、ホストが「もう終わっただろう」と判断するまで待つ余裕時間。
// 各クライアントの音源読み込み・再生開始タイミングのばらつきを吸収するための余白
// （host-tick方式は他の同期処理と同じく、個々のクライアントからの「再生完了」通知を
// 待つ仕組みを持たないため、固定時間待つ方式に統一している。js/onlineInstantBattleScreen.js
// のREVEAL_DELAY_MS等、既存のホスト側固定待機の考え方をそのまま踏襲）。
export const RECOVERY_REPLAY_BUFFER_MS = 1500;

// 一瞬バトル・一瞬協力とも、各問題の音源再生前（初回・もう一度聞く・リカバリー再生の
// いずれも）に3→2→1のローカルカウントダウン（js/localReplayCountdown.js）を挟む
// （js/onlineInstantBattleScreen.js・js/onlineInstantCoopBattleScreen.jsの
// playCurrentQuestionAudioWithCountdown()参照）。
// 【2026-11-XX修正・実機バグ調査：仕様総監査で発見】一瞬協力は元々このカウントダウンを
// 持たない設計だったが、後から両モード共通のカウントダウンが追加されたにもかかわらず、
// このコメントとincludesCountdown引数だけが更新されずに残っていた。リカバリー再生も
// 同じ演出をそのまま再利用するため、待機時間の計算にも必ず反映する必要がある。
export const RECOVERY_COUNTDOWN_MS = 3000;

// リカバリー再生1回にどれくらいの時間ホストが待つべきかを計算する。
// playDurationSec: そのルームの再生秒数設定（settings.playDurationValue）。
// includesCountdown: 3→2→1のカウントダウンを挟むかどうか（一瞬バトル・一瞬協力とも常にtrue）。
export function computeRecoveryReplayWindowMs({ playDurationSec, includesCountdown }) {
  const countdownMs = includesCountdown ? RECOVERY_COUNTDOWN_MS : 0;
  const safePlayDurationSec = Number.isFinite(playDurationSec) ? Math.max(0, playDurationSec) : 0;
  return countdownMs + safePlayDurationSec * 1000 + RECOVERY_REPLAY_BUFFER_MS;
}

// 今、参加者が「音が出ない」を押した場合にどのattemptSlotへ書き込むべきかを計算する。
// recovery: Firebase上のaudioTroubleRecovery（無ければundefined/null）。
// questionIndex: 今表示している問題番号（参加者の端末が把握している、今のcurrentQuestionIndex）。
//
// 【古い問題番号を引きずらない設計】recovery.questionIndexが今のquestionIndexと違う場合
// （＝別の問題のときの記録が残っている場合）は、新しい問題の1回目（0番）として扱う。
// これにより、問題が進むたびに明示的なリセット処理をホスト側に持たせる必要が無い
// （「この問題番号での申告は何回目か」を都度計算し直すだけで自然に正しくなる）。
export function computeNextReportAttemptSlot({ recovery, questionIndex }) {
  if (!recovery || recovery.questionIndex !== questionIndex) return 0;
  return recovery.attemptCount ?? 0;
}

// 今、この問題の回答操作・進行がロックされている（＝リカバリー再生が進行中）かどうか。
// 参加者側の画面表示（ボタン無効化・回答ロック）にも、ホストの進行判定（tick()を
// 一時停止するかどうか）にも共通で使う。
export function isAudioTroubleRecoveryLocking({ recovery, questionIndex }) {
  return !!recovery && recovery.questionIndex === questionIndex && recovery.status === "replaying";
}

// ホストが、今のtickで何をすべきかを判定する中核の純粋関数。js/instantBattleMatchProgress.js
// のtick()・js/instantCoopMatchProgress.jsのtick()と同じ「呼び出し元が繰り返し呼び、
// 状態に応じて必要なアクションだけを返す」設計。
//
// 戻り値のtype：
//   "none"          : 何もする必要が無い（申告も進行中のリカバリーも無い）。通常の
//                      回答集計（既存のtick()）を進めてよい。
//   "wait"          : リカバリー再生の待機時間中。何もせず、通常の回答集計も止めておく。
//   "start-replay"  : 新しい申告を検知した。リカバリー再生を開始する
//                      （nextAttemptCount回目、reportedByUidが申告者）。
//   "finish-replay" : リカバリー再生の待機時間が終わった。通常進行を再開してよい状態に戻す。
//   "swap-reserve"  : 安全な回数（MAX_RECOVERY_REPLAY_ATTEMPTS）を使い切ってもなお申告が
//                      来た。予備曲へ静かに差し替える（1回目の差し替え）。
//   "return-to-lobby": 予備曲への差し替え（本人指示のフォールバック①）も既に一度試したのに、
//                      なお申告が来た。試合を安全に終了し、全員をロビーへ戻す。
//
// recovery: match.audioTroubleRecovery（Firebaseの生データ、無ければundefined）。
// reports: recovery?.reports（{ [questionIndex]: { [attemptSlot]: {uid, reportedAt} } }）。
//          呼び出し元がrecoveryから直接渡してもよいが、テストのしやすさのため引数を分けている。
// questionIndex: 今のmatch.currentQuestionIndex（ホストの進行ミラーが見ている「今の問題」）。
// nowMs: 現在時刻（テスト容易性のため呼び出し元から渡す）。
// replayWindowMs: computeRecoveryReplayWindowMs()の戻り値。
// maxAttempts: 通常はMAX_RECOVERY_REPLAY_ATTEMPTS（テストで上書きできるよう引数化）。
export function computeAudioTroubleRecoveryAction({
  recovery,
  reports,
  questionIndex,
  nowMs,
  replayWindowMs,
  maxAttempts = MAX_RECOVERY_REPLAY_ATTEMPTS,
}) {
  const isForCurrentQuestion = !!recovery && recovery.questionIndex === questionIndex;

  // 【最優先】今まさにリカバリー再生の待機時間中なら、それ以外の判定は一切行わない
  // （待機時間中に新しい申告が届いていても、今のラウンドが終わってから改めて扱う。
  // これにより「1つの問題内で連打しても、有効になるのは常に1回ずつ」が自然に守られる）。
  if (isForCurrentQuestion && recovery.status === "replaying") {
    const startedAt = recovery.startedAt ?? nowMs;
    const elapsed = nowMs - startedAt;
    if (elapsed < replayWindowMs) return { type: "wait" };
    return { type: "finish-replay" };
  }

  // 今の問題・今受け付けるべきattemptSlotに、まだ処理していない申告が無いか確認する。
  const expectedSlot = isForCurrentQuestion ? recovery.attemptCount ?? 0 : 0;
  const pendingReport = reports?.[questionIndex]?.[expectedSlot];
  if (!pendingReport) return { type: "none" };

  const attemptCount = isForCurrentQuestion ? recovery.attemptCount ?? 0 : 0;
  if (attemptCount >= maxAttempts) {
    // 安全な回数を使い切った後の申告＝「まだ改善していない」という合図。
    // swapCountは問題をまたいで累積する値（match全体で1回だけ「予備曲に差し替えたのに
    // 改善しなかった」ことを検出したい）ため、isForCurrentQuestionに関わらずrecoveryから
    // そのまま読む（別の問題に切り替わっていてもswapCount自体は引き継がれる）。
    const swapCount = recovery?.swapCount ?? 0;
    return swapCount >= 1 ? { type: "return-to-lobby" } : { type: "swap-reserve", swapCount };
  }

  return { type: "start-replay", nextAttemptCount: attemptCount + 1, reportedByUid: pendingReport.uid };
}
