// 早押しバトル（steal）の勝者判定セキュリティルール（js/lyricsQuizBattleSecurityRules.js）が、
// 「何人が・どんな順番で・誰が正解を試みても、勝者は必ずちょうど1人（または0人）にしかならない」
// という不変条件を、あらゆる人数・あらゆる到着順で満たし続けるかを検査する
// ランダム化テスト（2026-09-06、長時間耐久検証PHASE C-5：
// 「100-500件の早押しレーストライアル。実Firebaseは代表的な部分集合、残りは
// property/state-levelで可」を受けて追加）。
//
// 【実Firebaseでのテストとの役割分担】tests/onlineBattlePropertyFuzz.test.js・実機での
// 早押しバトル多人数テスト（HANDOFF.md参照）が「実際のネットワーク越しの同時書き込みで
// 本当に競合が起きるか」を検証するのに対し、このテストは「セキュリティルールの許可/拒否
// ロジックそのものが、あらゆる人数・あらゆる到着順の組み合わせで論理的に正しいか」を
// 網羅的に検査する（canWriteAnswer・canWriteStealClaimは既に個別の分岐ごとのテストが
// tests/lyricsQuizBattleSecurityRules.test.jsにあるが、「複数人が入り乱れて到着する」
// という集合的な振る舞いまではそちらでは検査していないため、ここで補う）。
//
// 【シミュレーションの考え方】実際のFirebaseの書き込みは「到着した順に1件ずつ確定する」
// （同時に2件が同じ場所へ書き込まれることは無い）。そのため、ランダムな到着順を1つ
// 生成し、その順番どおりに1人ずつcanWriteAnswer→（正解を試みる人だけ）canWriteStealClaimを
// 呼び、許可されたときだけ実際に状態（existingWinnerExists等）を進める、という
// 逐次シミュレーションで「到着順に依存した結果」を再現できる。
import { createSeededRandom } from "../js/seededRandom.js";
import { canWriteAnswer, canWriteStealClaim } from "../js/lyricsQuizBattleSecurityRules.js";
import { assertEqual } from "./test-utils.js";

const FUZZ_SEED = 20260906;
// 2026-09-06追記・最終QAフェーズ（本人指示PHASE6-3：早押しレースの追加soak、
// 最低100〜500seed相当を要求）を受け、300→1500へ引き上げた。
const TRIAL_COUNT = 1500;

function shuffle(array, random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function runStealRaceArbitrationFuzzTests() {
  const random = createSeededRandom(FUZZ_SEED);
  const failures = [];

  for (let trial = 0; trial < TRIAL_COUNT; trial++) {
    const playerCount = 2 + Math.floor(random() * 9); // 2〜10人
    const players = Array.from({ length: playerCount }, (_, i) => `uid-${i}`);
    // このトライアルで「正解を試みる」プレイヤーの集合（0人〜全員、ランダム）。
    const claimAttempters = new Set(players.filter(() => random() < 0.5));
    const arrivalOrder = shuffle(players, random);

    const matchId = "MATCH1";
    const questionIndex = 0;
    const room = {
      activeMatchId: matchId,
      matches: {
        [matchId]: {
          currentQuestionIndex: questionIndex,
          questionStatus: "active",
          participants: Object.fromEntries(players.map((uid) => [uid, true])),
        },
      },
    };

    let existingWinnerExists = false;
    let winnerUid = null;
    let winnerCount = 0;
    const answeredUids = new Set();

    for (const uid of arrivalOrder) {
      const answerAllowed = canWriteAnswer({
        authUid: uid,
        targetUid: uid,
        room,
        matchId,
        questionIndex,
        existingAnswerExists: answeredUids.has(uid),
      });
      if (!answerAllowed) {
        failures.push({ trial, uid, reason: "初回の回答書き込みが許可されなかった（本来は許可されるべき）" });
        continue;
      }
      answeredUids.add(uid);

      if (!claimAttempters.has(uid)) continue; // 不正解役はclaimを試みない

      const claimAllowed = canWriteStealClaim({
        authUid: uid,
        newWinnerUid: uid,
        room,
        matchId,
        questionIndex,
        existingWinnerExists,
        hasOwnAnswerInSameWrite: true,
      });
      if (claimAllowed) {
        existingWinnerExists = true;
        winnerUid = uid;
        winnerCount++;
      }
    }

    // 【不変条件1】勝者は0人か1人のみ。2人以上が勝者として確定することは絶対に無い。
    if (winnerCount > 1) {
      failures.push({ trial, reason: `勝者が${winnerCount}人になった（2人以上の同時勝者は禁止）`, arrivalOrder, claimAttempters: [...claimAttempters] });
    }
    // 【不変条件2】claimを試みた人が1人以上いるなら、必ず誰か1人が勝者になる
    // （claim自体は許可されるはずなので、0人になることも無い）。
    if (claimAttempters.size > 0 && winnerCount === 0) {
      failures.push({ trial, reason: "claimを試みた人が1人以上いるのに、誰も勝者にならなかった", arrivalOrder, claimAttempters: [...claimAttempters] });
    }
    // 【不変条件3】勝者は必ずclaimAttempters（正解を試みた人）の中の1人でなければならない。
    if (winnerUid !== null && !claimAttempters.has(winnerUid)) {
      failures.push({ trial, reason: "claimを試みていない人が勝者になった", winnerUid, claimAttempters: [...claimAttempters] });
    }
    // 【不変条件4】勝者は必ず到着順で最初にclaimを試みた人と一致する（早い者勝ちの意図どおり）。
    const firstAttempterInOrder = arrivalOrder.find((uid) => claimAttempters.has(uid)) ?? null;
    if (winnerUid !== firstAttempterInOrder) {
      failures.push({ trial, reason: "勝者が到着順で最初のclaim試行者と一致しない", winnerUid, firstAttempterInOrder, arrivalOrder });
    }
  }

  if (failures.length > 0) {
    console.error(`stealRaceArbitrationFuzzTests: ${failures.length}件の不変条件違反を検出（seed=${FUZZ_SEED}）`, failures.slice(0, 10));
  }
  assertEqual(
    failures.length,
    0,
    `シード${FUZZ_SEED}による${TRIAL_COUNT}件のランダム早押しレース（2〜10人・ランダム到着順・ランダム正解者集合）で、` +
      `「勝者は必ずちょうど1人（claim試行者が0人なら0人）、かつ到着順で最初のclaim試行者と一致する」が全トライアルで成立する` +
      `（詳細はconsole.error参照。1件目: ${failures[0] ? JSON.stringify(failures[0]).slice(0, 300) : "なし"}）`
  );
}
