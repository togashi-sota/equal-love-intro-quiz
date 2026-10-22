// 【2026-10-23新設】歌詞・コール表示の追尾性能改善（第1段階：表示側だけの改善）の回帰テスト。
// 端末の歌詞・コールデータ（IndexedDB）には一切触れず、ダミーの時刻データと「偽の<audio>」で確認する。
// requestAnimationFrame はテスト中だけ手動で1コマずつ進める偽物に差し替え、終わったら必ず元に戻す。
import { findActiveLineIndex, findDisplayLineIndex, LYRICS_GAP_HOLD_SEC, startLyricsSyncWithRecord, destroyLyricsSync, updateActiveLyricsLine } from "../js/lyricsSync.js";
import { startCallSyncWithRecords, destroyCallSync } from "../js/callSync.js";
import { createPlaybackFrameTicker, setVisibilitySourceForTest } from "../js/playbackFrameTicker.js";
import { assertEqual } from "./test-utils.js";

// 再生状態を持つ偽の<audio>（本物と同じく play/pause 等のイベントを出す）
class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.currentTime = 0;
    this.paused = true;
    this.ended = false;
  }
  play() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    this.dispatchEvent(new Event("playing"));
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  seek(time) {
    this.currentTime = time;
    this.dispatchEvent(new Event("seeking"));
  }
}

// カラオケ同期画面の「時計だけの疑似要素」と同じ形（paused を持たない）
class ClockOnlySource extends EventTarget {
  constructor() {
    super();
    this.currentTime = 0;
  }
}

// 「画面が見えているか」の偽物（document へ偽のイベントを投げると他の機能まで反応するため）
class FakeVisibility extends EventTarget {
  constructor() {
    super();
    this.hidden = false;
  }
  set(hidden) {
    this.hidden = hidden;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

// 歌詞パネルを必ず「同期表示」にする（全文表示を保存している端末でもテストが同じ結果になるように）。
// 戻り値の関数で元の表示モードへ戻す。
function forceSyncMode(panel) {
  const toggle = panel.querySelector(".lyrics-mode-toggle-button");
  if (!panel.classList.contains("is-full-text-mode")) return () => {};
  toggle.click();
  return () => {
    if (!panel.classList.contains("is-full-text-mode")) toggle.click();
  };
}

function installManualAnimationFrames() {
  const original = { request: window.requestAnimationFrame, cancel: window.cancelAnimationFrame };
  const queue = new Map();
  let nextId = 1;
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;
    queue.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => queue.delete(id);
  return {
    pending: () => queue.size,
    // 1コマ進める（その時点で予約されていたコールバックだけを実行）
    step() {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((callback) => callback(performance.now()));
    },
    restore() {
      window.requestAnimationFrame = original.request;
      window.cancelAnimationFrame = original.cancel;
      // テスト中に他の機能が予約していた分は、本物へ渡し直す（捨てない）
      queue.forEach((callback) => original.request(callback));
      queue.clear();
    },
  };
}


// ダミーの歌詞（実在の歌詞は使わない）：短い行の連続（ラップ想定）・短い隙間・長い間奏を含む
const DUMMY_LYRICS = {
  songId: "dummy-sync",
  lines: [
    { line: 1, text: "ダミー一行目", start: 0.0, end: 1.0 },
    { line: 2, text: "短い行A", start: 1.0, end: 1.2 },
    { line: 3, text: "短い行B", start: 1.2, end: 1.4 },
    { line: 4, text: "短い行C", start: 1.4, end: 1.6 },
    { line: 5, text: "隙間の前の行", start: 2.0, end: 3.0 }, // 1.6〜2.0 の隙間（0.4秒）
    { line: 6, text: "間奏の後の行", start: 8.0, end: 9.0 }, // 3.0〜8.0 の間奏（5秒）
  ],
};
const DUMMY_CALLS = {
  songId: "dummy-sync",
  calls: [
    { text: "Hi!", start: 1.05, end: 1.15, type: "member-call" }, // 0.1秒しかない短いコール
    { text: "Yeah!", start: 2.1, end: 2.4, type: "callback" },
    { text: "ダミーの長いコールの文章です", start: 8.2, end: 9.0, type: "mix" },
  ],
};

function mountPanel(width = 375) {
  const panel = document.createElement("div");
  panel.style.cssText = `position:absolute;left:-9999px;top:0;width:${width}px;height:120px;overflow:auto;`;
  document.body.appendChild(panel);
  return panel;
}

function currentLineTexts(panel) {
  return [...panel.querySelectorAll(".synced-lyrics-line.is-current-lyrics-line")].map((element) => element.textContent);
}

export async function runSyncTrackingTests() {
  // ===== A. 表示用の現在行（短い隙間だけ前の行を残す）。既存の findActiveLineIndex は変えていない =====
  const lines = DUMMY_LYRICS.lines;
  assertEqual(LYRICS_GAP_HOLD_SEC, 1.0, "A: 前の行を残す隙間は1.0秒以下");
  assertEqual(findDisplayLineIndex(lines, 0.5), 0, "A: 行の中ではその行");
  assertEqual(findDisplayLineIndex(lines, 1.1), 1, "A: 0.2秒の短い行も現在行になる");
  assertEqual([findActiveLineIndex(lines, 1.8), findDisplayLineIndex(lines, 1.8)], [-1, 3], "A: 0.4秒の短い隙間では前の行を強調したまま（既存関数は-1のまま）");
  assertEqual(findDisplayLineIndex(lines, 4.0), -1, "A: 5秒の間奏では前の行を残さない");
  assertEqual(findDisplayLineIndex(lines, 9.5), -1, "A: 最後の行の後は残さない");
  assertEqual(findDisplayLineIndex(lines, -1), -1, "A: 曲の最初の行より前は-1");
  assertEqual(findDisplayLineIndex([], 1), -1, "A: 歌詞が空でも落ちない");
  assertEqual(findDisplayLineIndex([{ start: 0, end: 1 }, { start: 2.1, end: 3 }], 1.5), -1, "A: 1秒を超える隙間（1.1秒）は残さない");
  assertEqual(findDisplayLineIndex([{ start: 0, end: 1 }, { start: 0.5, end: 2 }, { start: 2.5, end: 3 }], 2.2), 1, "A: 重なりがあっても最後に終わった行を残す");

  const frames = installManualAnimationFrames();
  const visibility = new FakeVisibility();
  setVisibilitySourceForTest(visibility);
  try {
    // ===== B. 毎フレーム確認する部品（再生中・表示中だけ動く） =====
    const audio = new FakeAudio();
    const seen = [];
    const resumed = [];
    const ticker = createPlaybackFrameTicker(audio, { onFrame: (time) => seen.push(time), onResume: (time) => resumed.push(time) });
    assertEqual([ticker.isRunning(), frames.pending()], [false, 0], "B: 一時停止中はループを動かさない");
    audio.play();
    assertEqual([ticker.isRunning(), resumed.length], [true, 1], "B: 再生開始でループ開始・現在位置へ合わせ直す");
    audio.currentTime = 1.0;
    frames.step();
    audio.currentTime = 1.016;
    frames.step();
    assertEqual(seen, [1.0, 1.016], "B: 再生中は毎フレーム再生位置を渡す");
    audio.pause();
    assertEqual([ticker.isRunning(), frames.pending()], [false, 0], "B: 一時停止でループ停止");
    audio.play();
    visibility.set(true);
    assertEqual([ticker.isRunning(), frames.pending()], [false, 0], "B: アプリが裏に回ったらループ停止");
    audio.currentTime = 30;
    visibility.set(false);
    assertEqual([ticker.isRunning(), resumed[resumed.length - 1]], [true, 30], "B: 表に戻ったら進んだ位置へ合わせ直して再開");
    audio.pause();
    const resumedBefore = resumed.length;
    visibility.set(true);
    visibility.set(false);
    assertEqual([resumed.length, ticker.isRunning()], [resumedBefore, false], "B: 一時停止中は表に戻っても位置を合わせ直さない（手で読んでいた位置を引き戻さない）");
    audio.play();
    audio.ended = true;
    audio.dispatchEvent(new Event("ended"));
    assertEqual(ticker.isRunning(), false, "B: 再生終了でループ停止");
    audio.ended = false;
    ticker.destroy();
    audio.play();
    assertEqual([ticker.isRunning(), frames.pending()], [false, 0], "B: 画面を閉じた（destroy）後は再生イベントが来ても動かない");
    const clock = new ClockOnlySource();
    let clockResumes = 0;
    const clockTicker = createPlaybackFrameTicker(clock, { onFrame: () => {}, onResume: () => { clockResumes += 1; } });
    clock.dispatchEvent(new Event("play"));
    visibility.set(true);
    visibility.set(false);
    assertEqual([clockTicker.isRunning(), frames.pending()], [false, 0], "B: カラオケ同期の時計（再生状態を持たない）では動かず、従来の更新だけになる");
    assertEqual(clockResumes <= 1, true, "B: カラオケ同期の時計では、表に戻っても合わせ直しを走らせない");
    clockTicker.destroy();

    // ===== C. 歌詞の追尾 =====
    const lyricsAudio = new FakeAudio();
    const panel = mountPanel(375);
    let restoreDisplayMode = () => {};
    try {
      assertEqual(startLyricsSyncWithRecord(DUMMY_LYRICS, lyricsAudio, panel), true, "C: ダミー歌詞で同期表示を開始");
      restoreDisplayMode = forceSyncMode(panel);
      updateActiveLyricsLine(0, { immediate: true });
      assertEqual(currentLineTexts(panel), ["ダミー一行目"], "C: 開始直後は今の位置の行");
      lyricsAudio.play();
      lyricsAudio.currentTime = 1.1;
      frames.step();
      assertEqual(currentLineTexts(panel), ["短い行A"], "C: timeupdate（約0.25秒ごと）を待たずに0.2秒の短い行へ切り替わる");
      lyricsAudio.currentTime = 1.3;
      frames.step();
      lyricsAudio.currentTime = 1.5;
      frames.step();
      assertEqual(currentLineTexts(panel), ["短い行C"], "C: 短い行が連続しても順に追従する");

      // 同じ行のままのフレームでは表示を書き換えない（毎フレームDOMを全件書き換えない）
      let mutations = 0;
      const observer = new MutationObserver((records) => {
        mutations += records.length;
      });
      observer.observe(panel, { attributes: true, subtree: true, attributeFilter: ["class"] });
      for (let i = 0; i < 10; i++) {
        lyricsAudio.currentTime = 1.5 + i * 0.005;
        frames.step();
        lyricsAudio.dispatchEvent(new Event("timeupdate")); // 従来の timeupdate と二重に来ても同じ
      }
      mutations += observer.takeRecords().length;
      assertEqual(mutations, 0, "C: 同じ行の間は毎フレーム・timeupdateが来ても表示を書き換えない");
      observer.disconnect();

      lyricsAudio.currentTime = 1.8;
      frames.step();
      assertEqual(currentLineTexts(panel), ["短い行C"], "C: 0.4秒の短い隙間では前の行の強調を残す");
      lyricsAudio.currentTime = 4.0;
      frames.step();
      assertEqual(currentLineTexts(panel), [], "C: 長い間奏では強調を外す");
      lyricsAudio.pause();
      assertEqual(frames.pending(), 0, "C: 一時停止で毎フレームの確認を止める");
      lyricsAudio.seek(8.5);
      assertEqual(currentLineTexts(panel), ["間奏の後の行"], "C: 一時停止中のシークでもすぐ正しい行へ");
      lyricsAudio.play();
      assertEqual(frames.pending(), 1, "C: 再開で毎フレームの確認を再開");
      updateActiveLyricsLine(0.5, { immediate: true });
      assertEqual(currentLineTexts(panel), ["ダミー一行目"], "C: 曲の頭へ戻しても正しい行");

      // 全文表示モード：ハイライトしない（切替ボタンで切り替え、すぐ同期表示へ戻す）
      const toggle = panel.querySelector(".lyrics-mode-toggle-button");
      toggle.click();
      lyricsAudio.currentTime = 2.5;
      frames.step();
      assertEqual(currentLineTexts(panel), [], "C: 全文表示モードでは毎フレームでもハイライトしない");
      toggle.click();
      assertEqual(currentLineTexts(panel), ["隙間の前の行"], "C: 同期表示へ戻すと今の行へ");

      // 自動スクロールの回数を数える（scrollIntoView をテスト中だけ数える形に包む）
      const originalScrollIntoView = Element.prototype.scrollIntoView;
      let scrollCalls = 0;
      Element.prototype.scrollIntoView = function countedScrollIntoView(...args) {
        scrollCalls += 1;
        return originalScrollIntoView.apply(this, args);
      };
      try {
        lyricsAudio.currentTime = 0.5;
        frames.step();
        assertEqual(scrollCalls, 1, "C: 行が変わったときは自動スクロールする");
        lyricsAudio.currentTime = 0.6;
        frames.step();
        assertEqual(scrollCalls, 1, "C: 同じ行の間はスクロールを繰り返さない");
        // 手動スクロール中は自動追従を止める既存の挙動
        panel.dispatchEvent(new Event("scrollend")); // 直前の自動スクロールが終わった扱いにしてから
        panel.dispatchEvent(new Event("scroll")); // 利用者が手でスクロール
        lyricsAudio.currentTime = 8.5;
        frames.step();
        assertEqual([currentLineTexts(panel), scrollCalls], [["間奏の後の行"], 1], "C: 手動スクロール直後は強調だけ切り替え、スクロールは追従しない（既存の挙動）");
      } finally {
        Element.prototype.scrollIntoView = originalScrollIntoView;
      }

      // 曲変更（画面を閉じた／別の曲）でループ停止
      restoreDisplayMode();
      restoreDisplayMode = () => {};
      destroyLyricsSync();
      lyricsAudio.currentTime = 1.1;
      frames.step();
      assertEqual([frames.pending(), panel.hidden], [0, true], "C: 曲を閉じると毎フレームの確認も止まる");
      assertEqual(startLyricsSyncWithRecord({ songId: "x", lines: [] }, lyricsAudio, panel), false, "C: 歌詞の無い曲ではパネルを出さない");
      assertEqual(frames.pending(), 0, "C: 歌詞の無い曲では確認処理も動かない");
    } finally {
      restoreDisplayMode();
      destroyLyricsSync();
      panel.remove();
    }

    // ===== D. コールの追尾（歌詞と同時表示） =====
    const callAudio = new FakeAudio();
    const callPanel = mountPanel(375);
    let restoreCallDisplayMode = () => {};
    let burstStarts = 0;
    // 演出が出るたびに、バーストの文字が1回書き換わる（その回数で「何回演出が出たか」を数える）
    const burstObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "childList" && record.target.classList?.contains("call-burst-text")) burstStarts += 1;
      });
    });
    try {
      startLyricsSyncWithRecord(DUMMY_LYRICS, callAudio, callPanel);
      restoreCallDisplayMode = forceSyncMode(callPanel);
      assertEqual(startCallSyncWithRecords(DUMMY_CALLS, DUMMY_LYRICS, callAudio, callPanel), true, "D: ダミーのコールで同期表示を開始");
      burstObserver.observe(document.body, { childList: true, subtree: true });
      callAudio.play();
      callAudio.currentTime = 1.08;
      frames.step();
      const currentCall = () => [...callPanel.querySelectorAll(".synced-call-line.is-current-lyrics-line")].map((element) => element.textContent);
      assertEqual([currentCall().length, currentLineTexts(callPanel)], [1, ["短い行A"]], "D: 0.1秒しかない短いコールも表示され、歌詞と同時に強調");
      for (let i = 0; i < 5; i++) {
        callAudio.currentTime = 1.09 + i * 0.01;
        frames.step();
        callAudio.dispatchEvent(new Event("timeupdate"));
      }
      burstObserver.takeRecords().forEach((record) => {
        if (record.type === "childList" && record.target.classList?.contains("call-burst-text")) burstStarts += 1;
      });
      assertEqual(burstStarts, 1, "D: 同じコールの演出は毎フレーム・timeupdateが来ても1回だけ");
      callAudio.currentTime = 2.2;
      frames.step();
      burstObserver.takeRecords().forEach((record) => {
        if (record.type === "childList" && record.target.classList?.contains("call-burst-text")) burstStarts += 1;
      });
      assertEqual(burstStarts, 2, "D: 次のコールで演出が1回出る（連続発火しない）");
      callAudio.currentTime = 8.5;
      frames.step();
      assertEqual(document.querySelector(".call-longform-overlay")?.classList.contains("is-active"), true, "D: 長いコールの持続表示（既存の演出）を維持");
      callAudio.currentTime = 9.05; // 長いコールの終わりから0.05秒（次のコールは無いので残さない）
      frames.step();
      assertEqual(document.querySelector(".call-longform-overlay")?.classList.contains("is-active"), false, "D: 次のコールが無ければ長いコールの表示は終わる");
      callAudio.pause();
      assertEqual(frames.pending(), 0, "D: 一時停止で歌詞・コールとも確認を止める");
      restoreCallDisplayMode();
      restoreCallDisplayMode = () => {};
      destroyCallSync();
      destroyLyricsSync();
      callAudio.play();
      assertEqual(frames.pending(), 0, "D: 画面を閉じた後は動かない");
    } finally {
      restoreCallDisplayMode();
      burstObserver.disconnect();
      destroyCallSync();
      destroyLyricsSync();
      callPanel.remove();
    }
  } finally {
    frames.restore();
    setVisibilitySourceForTest(null);
  }

  // ===== E. 見た目（CSS）と配線 =====
  const css = await (await fetch("css/style.css", { cache: "no-store" })).text();
  const currentRule = css.slice(css.indexOf(".synced-lyrics-line.is-current-lyrics-line {"), css.indexOf(".synced-lyrics-line.is-current-lyrics-line {") + 400);
  assertEqual(currentRule.includes("transition-duration: 0s;"), true, "E: 歌詞の強調は付くときに即座に切り替える（外れるときはなめらか）");
  const burstKeyframes = css.slice(css.indexOf("@keyframes call-burst-fly-in"), css.indexOf("@keyframes call-burst-fly-in") + 400);
  assertEqual(burstKeyframes.includes("6% {"), true, "E: 短いコールの演出の立ち上がりを短縮");
  const overlayActive = css.slice(css.indexOf(".call-longform-overlay.is-active {"), css.indexOf(".call-longform-overlay.is-active {") + 300);
  assertEqual(overlayActive.includes("opacity 120ms"), true, "E: 長いコールの表示の立ち上がりを短縮");
  const sw = await (await fetch("sw.js", { cache: "no-store" })).text();
  assertEqual(sw.includes('"./js/playbackFrameTicker.js"'), true, "E: 新しいファイルをオフライン用キャッシュに追加");
  const lyricsSource = await (await fetch("js/lyricsSync.js", { cache: "no-store" })).text();
  assertEqual(/currentTime\s*[+-]\s*0\.1|DISPLAY_LEAD/.test(lyricsSource), false, "E: 歌詞を一律に早める補正は入れていない（今回は表示処理の改善のみ）");
}
