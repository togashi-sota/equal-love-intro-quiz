// 【2026-09-06新設・本人指示：圏外プレイ結果をランキングへ自動的に反映する】
//
// 【背景・目的】js/rankingCandidateStore.js（ランキング条件を満たした自己ベストを、
// 「フレンド」公開設定・オンライン状況に関係なく常にlocalStorageへ保存する仕組み）と、
// js/timeAttackLeaderboardSync.jsのsyncRankingCandidatesToFirebase()（保存済みの候補を
// まとめてFirebaseへ再送信する仕組み）は、このファイルが新設される前から既に存在していた。
// ただし、syncRankingCandidatesToFirebase()を実際に呼ぶ箇所は「フレンド公開設定を
// OFF→ONへ切り替えた瞬間」「ランキング画面を開いたとき」の2箇所だけで、
// 「オフラインでプレイ→後でオンラインに戻る」だけでは自動的に呼ばれなかった
// （本人操作を待たないと再送信されない）。このファイルは、その「オンライン復帰」
// そのものをきっかけに自動で再送信するための、追加のトリガー配線だけを担当する。
//
// 【あえて新しいIndexedDB outboxを作らなかった理由】本人からは「IndexedDBへ
// pendingRankingSubmissionsのような永続outboxを持たせる方式」の提案があったが、
// 実際にコードを調査した結果、以下の理由から見送り、既存の仕組みを拡張するだけに留めた：
//   ①js/rankingCandidateStore.jsは既にlocalStorage（アプリを閉じても消えない、
//     CACHE_VERSION更新・Service Worker再インストールの影響も受けない）へ保存しており、
//     かつ既存のクラウドバックアップ（js/backupSync.js）にも自動的に含まれるため、
//     二重に保護されている。データ消失のリスクは新設前から極めて低い。
//   ②ランキングのFirebase書き込みは「1ユーザー1レコードの上書き（set）」であり、
//     追記型（push）ではない。そのため同じ内容を何度再送信しても、書き込み結果は
//     常に同じ値に収束する（本人が懸念する「二重登録」がそもそも起こり得ない構造）。
//     本人提案のsubmissionId方式は、履歴を都度追加するappend型ランキングでは重要になるが、
//     このアプリの「自己ベストのみ保持」型ランキングには必要な複雑さではないと判断した。
//   ③syncRankingCandidatesToFirebase()自体も、比較してから書き込む
//     （submitTimeAttackScoreIfBetter経由）既存の安全なロジックをそのまま再利用しており、
//     圏外中に複数回・順不同でプレイした記録をどの順で再送信しても、最終的に正しい
//     自己ベストへ収束する（本人指示のCASE9相当）。
//   ④本人指示にも「既存ランキングpayloadをそのまま安全に保存できるなら重複した独自形式を
//     増やさないでください」「Firebase構造を大規模変更する必要がある場合は、勝手に変更せず、
//     既存方式を維持できる最小案を優先」とあり、今回追加した自動トリガー配線だけで
//     本人の最終目的（圏外プレイ結果を失わず、オンライン復帰時に自動でランキングへ
//     反映する）を安全に満たせると判断した。
//
// 【今回追加したトリガー】
//   ①アプリ起動時（この関数の初回呼び出し自体）
//   ②window の "online" イベント（回線復帰の直接的なシグナル）
//   ③document の "visibilitychange" でvisibleに戻った瞬間（アプリをバックグラウンドから
//     フォアグラウンドへ戻した、PWAを再度開いた等）
// いずれも同じsyncRankingCandidatesToFirebase()を呼ぶだけで、複数のトリガーがほぼ同時に
// 発火しても、呼び出し先が持つsingle-flightロック（timeAttackLeaderboardSync.js参照）で
// 二重実行にはならない。
//
// 【認証未準備の扱い】この関数自体はauthReadyを待たない。syncRankingCandidatesToFirebase→
// submitTimeAttackScoreIfBetterの内部でauthReadyをawaitするため、起動直後にauthがまだ
// 準備できていなくても、そこで自然に待たされるだけで、候補データが失われることはない。
//
// 【通知】実際に1件以上「更新」できた場合だけ、控えめなトースト通知を1回出す
// （本人指示：「未送信だった記録をランキングに反映しました」。何も更新が無かった場合や、
// 送信対象の候補が無い場合は何も表示しない＝起動のたびに毎回通知が出ることはない）。
import { syncRankingCandidatesToFirebase } from "./timeAttackLeaderboardSync.js";
import { getPlayerKeyPrefix } from "./playerProfile.js";

const TOAST_VISIBLE_DURATION_MS = 4000;

let toastElement = null;
let toastHideTimeoutId = null;

function showAutoSyncToast(updatedCount) {
  if (!toastElement) return;
  toastElement.textContent =
    updatedCount === 1
      ? "未送信だった記録をランキングに反映しました"
      : `未送信だった${updatedCount}件の記録をランキングに反映しました`;
  toastElement.hidden = false;

  if (toastHideTimeoutId !== null) {
    clearTimeout(toastHideTimeoutId);
  }
  toastHideTimeoutId = setTimeout(() => {
    toastHideTimeoutId = null;
    toastElement.hidden = true;
  }, TOAST_VISIBLE_DURATION_MS);
}

async function runAutoSync() {
  const result = await syncRankingCandidatesToFirebase(getPlayerKeyPrefix());
  if (result.updated > 0) {
    showAutoSyncToast(result.updated);
  }
}

// main.jsから1度だけ呼ぶ。toastElementはoptional（無ければ通知なしで動作する）。
export function initRankingCandidateAutoSync({ toastElement: newToastElement } = {}) {
  toastElement = newToastElement ?? null;

  // ①起動時（このinit呼び出し自体が「アプリを開いた」タイミングにあたる）。
  runAutoSync();

  // ②回線復帰の直接的なシグナル。
  window.addEventListener("online", () => {
    runAutoSync();
  });

  // ③フォアグラウンド復帰（PWAをバックグラウンドから戻した等）。
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      runAutoSync();
    }
  });
}
