// 再生中の<audio>の再生位置を、画面の描画タイミング（requestAnimationFrame、通常1秒に約60回）ごとに
// 確認するための共通部品（2026-10-23新設・本人指示「歌詞・コール表示の追尾性能改善 第1段階」）。
//
// 【なぜ必要か】これまで歌詞・コールの表示は<audio>の timeupdate イベントだけで更新していた。
// timeupdate はブラウザの実装上だいたい0.25秒ごとにしか来ないため、行の切り替えが最大約0.25秒遅れ、
// 0.25秒より短い行・コールは一度も表示されないまま飛ばされることがあった。
//
// 【負荷・電池への配慮】
// ・ループを回すのは「本当に再生中（paused === false）」で「画面が見えている」間だけ。
//   一時停止・再生終了・画面を離れた（destroy）・アプリが裏に回った（visibilitychange）ら止める。
// ・毎フレーム行うのは「再生位置を読んで onFrame に渡す」ことだけ。表示の書き換えは呼び出し側が
//   「現在行が変わったときだけ」行う（歌詞・コールとも既存の applyActiveIndex が同じ行なら何もしない）。
// ・カラオケ同期画面が渡す「時計だけの疑似要素」は paused を持たない（play イベントも来ない）ため、
//   ここではループを始めず、今までどおり疑似要素の timeupdate（150msごと）だけで動く（影響なし）。
//
// timeupdate・seeking の購読は呼び出し側に残す（裏に回っている間など、requestAnimationFrame が
// 止まる場面の予備）。同じ再生位置で2回呼ばれても表示は変わらないため、二重の演出にはならない。

// 「画面が見えているか」を知らせる相手（通常は document）。テストでは偽物に差し替える
// （テスト用のページ自体が非表示のことがあり、また document へ偽の visibilitychange を投げると
//   他の機能（効果音の再開・同期処理等）まで反応してしまうため）。
let visibilitySource = typeof document !== "undefined" ? document : null;

export function setVisibilitySourceForTest(source) {
  visibilitySource = source ?? (typeof document !== "undefined" ? document : null);
}

// onFrame(currentTime)：再生中、毎フレーム呼ばれる
// onResume(currentTime)：裏から戻ったとき・再生が始まったときに1回呼ばれる（瞬時に正しい位置へ戻す用。省略可）
export function createPlaybackFrameTicker(mediaElement, { onFrame, onResume } = {}) {
  let frameId = null;
  let destroyed = false;
  const visibility = visibilitySource;

  const isPlaying = () => mediaElement.paused === false && !mediaElement.ended;
  const canRun = () => !destroyed && isPlaying() && typeof requestAnimationFrame === "function" && !visibility?.hidden;

  const loop = () => {
    frameId = null;
    if (!canRun()) return;
    onFrame?.(mediaElement.currentTime);
    frameId = requestAnimationFrame(loop);
  };

  const start = () => {
    if (frameId === null && canRun()) frameId = requestAnimationFrame(loop);
  };

  const stop = () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };

  const handlePlay = () => {
    onResume?.(mediaElement.currentTime);
    start();
  };

  const handleVisibilityChange = () => {
    if (visibility?.hidden) {
      stop();
      return;
    }
    // 裏に回っている間に進んだ分を、戻った瞬間に正しい位置へ合わせ直してから再開する。
    // 再生中のときだけ（一時停止中に手で読んでいた位置を引き戻さない・カラオケ同期の時計では動かない。レビュー指摘）
    if (!destroyed && isPlaying()) onResume?.(mediaElement.currentTime);
    start();
  };

  mediaElement.addEventListener("play", handlePlay);
  mediaElement.addEventListener("playing", start);
  mediaElement.addEventListener("pause", stop);
  mediaElement.addEventListener("ended", stop);
  mediaElement.addEventListener("emptied", stop);
  visibility?.addEventListener("visibilitychange", handleVisibilityChange);
  start();

  return {
    // 今ループが動いているか（テスト・診断用）
    isRunning: () => frameId !== null,
    destroy() {
      destroyed = true;
      stop();
      mediaElement.removeEventListener("play", handlePlay);
      mediaElement.removeEventListener("playing", start);
      mediaElement.removeEventListener("pause", stop);
      mediaElement.removeEventListener("ended", stop);
      mediaElement.removeEventListener("emptied", stop);
      visibility?.removeEventListener("visibilitychange", handleVisibilityChange);
    },
  };
}
