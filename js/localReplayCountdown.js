// 各問題の音源再生の直前に3→2→1を表示する、完全ローカルな軽量カウントダウン
// （2026-09-05新設、本人指示：49項目仕様書の残タスク「一瞬バトル・一瞬チャレンジへの
// カウントダウン追加」への対応）。
//
// 【js/onlineBattleScreen.jsの対戦開始カウントダウンとの違い】あちら（goToCountdownScreen）は
// ルーム全体で1回だけ・サーバー時刻に同期させて全員が同じタイミングで見る必要がある
// （対戦開始そのものの合図であり、揃っていないとズルができてしまうため）。
// こちらは「一瞬バトル」「一瞬チャレンジ」で、各問題の出題・再視聴のたびに繰り返し使う、
// 各プレイヤーの端末だけで完結する（他人と揃える必要が無い＝Firebase同期が不要な）軽量版。
// 何度も使うことを想定し、対戦開始カウントダウン（1秒刻み）より短いテンポにしている。

import { SFX_EVENTS, playSfx } from "./soundManager.js";

const TICK_INTERVAL_MS = 500; // 3→2→1を0.5秒間隔で切り替える（合計1.5秒＋再生開始）

// 【2026-09-06新設、本人指示：実機フィードバック】カウントダウンが終わった後、
// この文言へ切り替えて「回答フェーズ中はそのまま表示し続ける」（本人指示⑦）。
// 以前はcontainerElement.hidden=trueで完全に隠していたが、.local-replay-countdownが
// 通常時display:flexを持つクラスセレクタのため、[hidden]属性のデフォルト表示（display:none）
// より詳細度が高く上書きしてしまい、実際には最後の数字「1」が画面に残り続ける不具合が
// あった（css/style.cssの.local-replay-countdown[hidden]で保険を追加したが、そもそも
// 「隠す」のではなく「この曲は？に文言を差し替えて表示し続ける」という新仕様のほうが
// 本人の要望にも音源再生中〜考える時間中も自然に見える、という判断で置き換えた）。
const QUESTION_PROMPT_TEXT = "♪ この曲は？";

let activeTimerId = null;

// containerElement（表示/非表示を切り替える親要素）とnumberElement（数字を表示する要素）を
// 受け取り、3→2→1を表示してからonComplete()を呼ぶ。既に別の呼び出しが進行中だった場合は、
// そちらを打ち切ってから新しく数え直す（例：再視聴ボタンを連打された場合の保険）。
// カウントダウンが終わったら、numberElementの中身を「この曲は？」へ差し替え、
// containerElementは表示したままにする（次にこの関数が呼ばれる＝次の問題／次の再視聴の
// カウントダウンが始まるまで、回答フェーズ中はずっと見えている）。
export function runLocalReplayCountdown({ containerElement, numberElement }, onComplete) {
  cancelLocalReplayCountdown();
  containerElement.hidden = false;
  numberElement.classList.remove("is-question-prompt");

  let remaining = 3;
  const showNext = () => {
    numberElement.textContent = String(remaining);
    playSfx(remaining === 1 ? SFX_EVENTS.COUNTDOWN_FINAL : SFX_EVENTS.COUNTDOWN_TICK);
    remaining -= 1;
    activeTimerId = setTimeout(() => {
      if (remaining <= 0) {
        activeTimerId = null;
        numberElement.textContent = QUESTION_PROMPT_TEXT;
        numberElement.classList.add("is-question-prompt");
        onComplete();
        return;
      }
      showNext();
    }, TICK_INTERVAL_MS);
  };
  showNext();
}

// 進行中のカウントダウンを打ち切る（対戦を中断した場合等、呼び出し元がもう結果を
// 必要としないタイミングで呼ぶ）。呼び出し元のcontainerElementの後始末（hidden化）までは
// 責務を持たない（呼び出し元が画面ごと切り替えるため、通常は不要）。
export function cancelLocalReplayCountdown() {
  if (activeTimerId !== null) {
    clearTimeout(activeTimerId);
    activeTimerId = null;
  }
}
