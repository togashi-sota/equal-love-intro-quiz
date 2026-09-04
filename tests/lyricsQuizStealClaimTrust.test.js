// js/lyricsQuizStealClaimTrust.js（早押しバトルの僅差競合バグ対策）の恒久回帰テスト
// （2026-09-06新設・実機バグ調査：早押しバトルで、僅差で負けた側の端末に誤って
// 「🎉正解！+1pt」の二重勝利表示が出るバグの根本修正に対する再発防止）。
//
// 【このテストが守りたいこと】Firebase Realtime Databaseのクライアントは、自分が
// 送ったset()の結果がサーバーで確定する前に、その値を一瞬ローカルへ楽観的に反映する。
// 早押しの勝者判定は「最初の1件だけ書き込み成立」の一発勝負のため、僅差で負けた側の
// 端末では、questionClaims/{qIndex}/winner.uidが一瞬「自分のuid」に見えることがある。
// これをそのまま信用してはならない、という判定ロジックをisSelfWinnerClaimTrustworthy()
// 単体でも、実際のスコアリング処理（js/battleRules/stealRule.js）と組み合わせた
// 一連のレース状況のシミュレーションでも確認する。
import { isSelfWinnerClaimTrustworthy } from "../js/lyricsQuizStealClaimTrust.js";
import { resolveQuestionAnswers } from "../js/battleRules/stealRule.js";
import { createSeededRandom } from "../js/seededRandom.js";
import { assertEqual } from "./test-utils.js";

export function runLyricsQuizStealClaimTrustTests() {
  // ===== isSelfWinnerClaimTrustworthy 単体テスト =====
  {
    assertEqual(
      isSelfWinnerClaimTrustworthy({
        rawWinnerUid: null,
        myUid: "me",
        qIndex: 0,
        confirmedSelfWinQuestionIndexes: new Set(),
      }),
      true,
      "まだ誰も勝者になっていない（winner:null）場合はそのまま信用してよい"
    );

    assertEqual(
      isSelfWinnerClaimTrustworthy({
        rawWinnerUid: "otherPlayer",
        myUid: "me",
        qIndex: 0,
        confirmedSelfWinQuestionIndexes: new Set(),
      }),
      true,
      "勝者が自分以外なら、自分の楽観的反映の問題は起こらないためそのまま信用してよい"
    );

    assertEqual(
      isSelfWinnerClaimTrustworthy({
        rawWinnerUid: "me",
        myUid: "me",
        qIndex: 3,
        confirmedSelfWinQuestionIndexes: new Set(),
      }),
      false,
      "勝者が自分自身で、まだサーバー確定（await結果）を得ていない問題番号は信用しない"
    );

    assertEqual(
      isSelfWinnerClaimTrustworthy({
        rawWinnerUid: "me",
        myUid: "me",
        qIndex: 3,
        confirmedSelfWinQuestionIndexes: new Set([1, 3, 5]),
      }),
      true,
      "勝者が自分自身で、その問題番号がconfirmedSelfWinQuestionIndexesに含まれていれば信用してよい"
    );

    assertEqual(
      isSelfWinnerClaimTrustworthy({
        rawWinnerUid: "me",
        myUid: "me",
        qIndex: 2,
        confirmedSelfWinQuestionIndexes: new Set([1, 3, 5]), // 2は含まれない
      }),
      false,
      "他の問題番号がconfirmed済みでも、対象の問題番号自体が未確認なら信用しない（問題ごとに独立して判定する）"
    );
  }

  // ===== レース状況シミュレーション：first-write-wins + 楽観的ローカル反映を再現 =====
  //
  // 【シミュレーションの設計】
  // ・N人（2〜10人でランダム）の参加者全員が、同じ問題に正解の選択肢で早押しを試みる。
  // ・「サーバーが実際に最初に受理した1人」（trueWinnerUid）を、シード付き乱数で
  //   ランダムに1人選ぶ（Firebaseの実際の書き込み到着順を模している）。
  // ・trueWinner本人の端末では、自分のset()がまだサーバー確定（await結果）を得る前は
  //   confirmedSelfWinQuestionIndexesに含まれない＝「たまたま自分が勝者に見えていても、
  //   確定するまでは信用しない」ガードが機能するかを確認する。
  // ・敗者（trueWinner以外）の端末では、一瞬「自分自身が勝者」という楽観的な反映が
  //   起こり得ることをシミュレートし、それを信用してはいけないことを確認する
  //   （ロールバック後にrawWinnerUidがtrueWinnerUidへ変わってから、初めて正しく解決する）。
  // ・最終的に、全端末が確定した状態（confirmedSelfWinQuestionIndexesが正しく揃った状態）で
  //   stealRule.resolveQuestionAnswers()を呼び、「勝者は1人だけ」「加算は1回だけ」
  //   「他は全員0点」という不変条件を確認する。
  {
    const rng = createSeededRandom(20260906);
    const RACE_CASE_COUNT = 500;
    let racesChecked = 0;

    for (let raceIndex = 0; raceIndex < RACE_CASE_COUNT; raceIndex++) {
      const participantCount = 2 + Math.floor(rng() * 9); // 2〜10人
      const uids = Array.from({ length: participantCount }, (_, i) => `p${i}`);
      const trueWinnerUid = uids[Math.floor(rng() * uids.length)];
      const correctSongId = "song-correct";
      const qIndex = Math.floor(rng() * 20);

      // 全員が正解の選択肢を送ったケースと、trueWinner以外の一部が不正解を送った
      // ケース（早押しでは不正解を早く押してしまう人もいる）の両方をランダムに混ぜる。
      const answersByUid = {};
      uids.forEach((uid) => {
        const isCorrectAnswer = uid === trueWinnerUid || rng() < 0.7;
        answersByUid[uid] = {
          selectedSongId: isCorrectAnswer ? correctSongId : "song-wrong",
          hintLevel: 1 + Math.floor(rng() * 4),
          submittedAt: Math.floor(rng() * 5000),
        };
      });

      // ---- 各端末（自分視点）ごとに、「まだ確定していない状態」→「ロールバック/確定後」の
      //      2段階でisSelfWinnerClaimTrustworthy()を通し、最終的にresolveQuestionAnswers()で
      //      採点する一連の流れを再現する。 ----
      const finalOutcomesByObservingUid = {};

      uids.forEach((observingUid) => {
        const confirmedSelfWinQuestionIndexes = new Set();

        // 段階1：サーバー確定前。trueWinner本人の端末では、自分のset()がローカルへ
        // 楽観的に反映されているため rawWinnerUid === trueWinnerUid（自分自身）に見えるが、
        // まだconfirmedSelfWinQuestionIndexesには入っていない。
        const stage1RawWinnerUid = observingUid === trueWinnerUid ? trueWinnerUid : null;
        const stage1Trusted = isSelfWinnerClaimTrustworthy({
          rawWinnerUid: stage1RawWinnerUid,
          myUid: observingUid,
          qIndex,
          confirmedSelfWinQuestionIndexes,
        });
        if (observingUid === trueWinnerUid) {
          assertEqual(
            stage1Trusted,
            false,
            `race#${raceIndex}: trueWinner本人（${observingUid}）も、await確定前は自分の勝利をまだ信用しない`
          );
        }

        // 段階1.5：敗者が「自分こそ勝者だ」という楽観的ローカル反映を一瞬受け取るケースを
        // ランダムに半分程度混ぜる（Firebaseの反映タイミングはクライアントごとに前後し得る）。
        if (observingUid !== trueWinnerUid && rng() < 0.5) {
          const optimisticSelfEchoTrusted = isSelfWinnerClaimTrustworthy({
            rawWinnerUid: observingUid, // 自分自身の未確定な楽観的反映
            myUid: observingUid,
            qIndex,
            confirmedSelfWinQuestionIndexes, // まだ何も確定していない
          });
          assertEqual(
            optimisticSelfEchoTrusted,
            false,
            `race#${raceIndex}: 敗者（${observingUid}）自身の楽観的な自己反映は、確定前は信用してはならない`
          );
        }

        // 段階2：サーバー確定後。
        // ・trueWinner本人：自分のawaitがWONで確定し、confirmedSelfWinQuestionIndexesへ追加される。
        // ・敗者：自分のawaitはLOST_RACE等で確定し、confirmedSelfWinQuestionIndexesには追加されない
        //   （追加はWONのときだけ、というのが実装の方針）。ロールバック後、rawWinnerUidは
        //   真の勝者（trueWinnerUid、自分以外）へ変わるため、isSelfWinnerClaimTrustworthy()の
        //   「勝者が自分以外なら常に信用してよい」分岐で正しく解決される。
        if (observingUid === trueWinnerUid) {
          confirmedSelfWinQuestionIndexes.add(qIndex);
        }
        const stage2RawWinnerUid = trueWinnerUid; // サーバー確定後は全端末で一致する
        const stage2Trusted = isSelfWinnerClaimTrustworthy({
          rawWinnerUid: stage2RawWinnerUid,
          myUid: observingUid,
          qIndex,
          confirmedSelfWinQuestionIndexes,
        });
        assertEqual(stage2Trusted, true, `race#${raceIndex}: サーバー確定後は必ず信用できる状態になる（${observingUid}視点）`);

        // 信用できる状態になって初めて、実際のスコアリング（stealRule）へ通す。
        const outcomesByUid = resolveQuestionAnswers({
          answersByUid,
          correctSongId,
          winner: { uid: stage2RawWinnerUid, submittedAt: 0 },
          questionStartedAt: 0,
        });
        finalOutcomesByObservingUid[observingUid] = outcomesByUid[observingUid];
      });

      // ---- 不変条件の確認：全端末が確定させた最終結果を突き合わせる ----
      const wonUids = uids.filter((uid) => finalOutcomesByObservingUid[uid].wonQuestion === true);
      const isTrueWinnerActuallyCorrect = answersByUid[trueWinnerUid].selectedSongId === correctSongId;

      if (isTrueWinnerActuallyCorrect) {
        assertEqual(wonUids, [trueWinnerUid], `race#${raceIndex}: 勝者は正確にtrueWinnerUid（${trueWinnerUid}）1人だけ`);
      } else {
        // stealRule.resolveQuestionAnswers()は、claimされたwinnerの実際の回答を必ず
        // 検算し、不正解なら「誰にも得点を与えない」（js/battleRules/stealRule.jsの設計）。
        assertEqual(wonUids, [], `race#${raceIndex}: 勝者として書き込まれた人の回答が実は不正解だった場合、誰にも得点を与えない`);
      }

      uids.forEach((uid) => {
        const isThisUidTheWinner = isTrueWinnerActuallyCorrect && uid === trueWinnerUid;
        assertEqual(
          finalOutcomesByObservingUid[uid].pointsAwarded,
          isThisUidTheWinner ? 1 : 0,
          `race#${raceIndex}: ${uid}のpointsAwardedは勝者なら1、それ以外は必ず0（二重付与も未加算も無い）`
        );
      });

      racesChecked++;
    }

    assertEqual(racesChecked, RACE_CASE_COUNT, `シード付き乱数で${RACE_CASE_COUNT}パターンのレース状況を再現し、すべて不変条件を確認した`);
  }
}
