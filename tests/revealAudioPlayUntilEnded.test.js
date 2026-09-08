// 【QAで発見・修正：2026-09-09・本人指示：初回完成版前の最後の機能調整】
// オフライン限定5モード（歌詞クイズ・一瞬チャレンジ・オリジナル問題作成モード〈歌詞／
// 一瞬タイプ〉・苦手曲モードのリリック／一瞬）の答え合わせ音源を、以前は固定7秒で
// 強制停止していたが、「固定時間では止めず、音源そのものの終わりまで再生できる。
// 止めるのは『次へ』を押した瞬間だけ」という仕様へ変更した回帰防止テスト。
//
// 【なぜソーステキストの構造チェックなのか】js/lyricsQuizScreen.js・
// js/instantChallengeScreen.jsはどちらも画面操作全体（DOM要素・イベント登録）を
// 直接担うファイルで、tests.htmlの環境からモジュールごとimportして呼び出すには
// 大量のダミーDOM要素が必要になる（js/instantChallengeQuestionBuilder.js冒頭コメント
// 参照）。そのため、js/audioIndexedDbErrorRegression.test.js等の既存の前例と同じ
// 「実際に配信されるソースコードの構造を直接検証する」方式を踏襲する。
//
// 【対象外であることの確認も含む】この変更は「オフラインの答え合わせ音源だけ」が対象で、
// オンライン対戦（js/onlineLyricsQuizBattleScreen.js・js/onlineInstantBattleScreen.js・
// js/onlineInstantCoopBattleScreen.js）・おさらい（js/main.jsの通常/ランダム再生/
// アウトロクイズのreview系エンジン）には一切影響しないことも、あわせてソースの
// 構造から確認する。
import { assertEqual } from "./test-utils.js";

async function fetchSource(path) {
  const response = await fetch(path);
  return response.text();
}

export async function runRevealAudioPlayUntilEndedTests() {
  // ===== js/lyricsQuizScreen.js（歌詞クイズ・苦手曲リリック・オリジナル問題〈歌詞〉共通） =====
  {
    const source = await fetchSource("js/lyricsQuizScreen.js");
    assertEqual(source.length > 500, true, "js/lyricsQuizScreen.jsのソースを取得できた（前提条件）");

    // 固定7秒で止めるための仕組み（変数・定数）が完全に廃止されていること。
    assertEqual(
      source.includes("revealAudioStopTimeoutId"),
      false,
      "js/lyricsQuizScreen.js：答え合わせ音源を固定時間で止めるためのタイマー変数（revealAudioStopTimeoutId）が廃止されている"
    );
    assertEqual(
      source.includes("const REVEAL_AUDIO_DURATION_SEC ="),
      false,
      "js/lyricsQuizScreen.js：REVEAL_AUDIO_DURATION_SEC（固定7秒）の定数定義が廃止されている"
    );

    // 新しい「安全上限」の定数が、実際の楽曲尺より十分大きい値で存在すること。
    const maxDurationMatch = source.match(/const REVEAL_AUDIO_MAX_DURATION_SEC = (\d+);/);
    assertEqual(maxDurationMatch !== null, true, "js/lyricsQuizScreen.js：REVEAL_AUDIO_MAX_DURATION_SECが定義されている");
    assertEqual(
      Number(maxDurationMatch?.[1]) >= 300,
      true,
      "js/lyricsQuizScreen.js：REVEAL_AUDIO_MAX_DURATION_SECは実際の楽曲尺（数分程度）より十分大きい（5分＝300秒以上）"
    );

    // playAnswerRevealAudio()が、その新しい安全上限をplaySongFromRandomPosition()へ渡し、
    // 固定時間で止めるsetTimeout(stopAudio)を含まないこと。
    const playFnStart = source.indexOf("function playAnswerRevealAudio(question) {");
    assertEqual(playFnStart !== -1, true, "js/lyricsQuizScreen.js：playAnswerRevealAudio()が存在する（前提条件）");
    const playFnBody = source.slice(playFnStart, playFnStart + 900);
    assertEqual(
      playFnBody.includes("REVEAL_AUDIO_MAX_DURATION_SEC"),
      true,
      "js/lyricsQuizScreen.js：playAnswerRevealAudio()がREVEAL_AUDIO_MAX_DURATION_SECをplaySongFromRandomPosition()へ渡している"
    );
    assertEqual(
      playFnBody.includes("setTimeout"),
      false,
      "js/lyricsQuizScreen.js：playAnswerRevealAudio()自体はもう固定時間で止めるsetTimeoutを持たない（次へクリック時にstopAnswerRevealAudio()経由で止める設計へ変更）"
    );

    // showAnswerRevealWithAudio()が、固定時間の自動進行タイマーを含まないこと
    // （＝ended/放置しても自動でnextしない）。
    const showFnStart = source.indexOf("function showAnswerRevealWithAudio(");
    assertEqual(showFnStart !== -1, true, "js/lyricsQuizScreen.js：showAnswerRevealWithAudio()が存在する（前提条件）");
    const showFnEnd = source.indexOf("\n}", showFnStart);
    const showFnBody = source.slice(showFnStart, showFnEnd);
    assertEqual(
      showFnBody.includes("setTimeout") && showFnBody.includes("handleAnswerRevealNextButtonClick"),
      false,
      "js/lyricsQuizScreen.js：showAnswerRevealWithAudio()はもう「一定時間で自動的にhandleAnswerRevealNextButtonClick()を呼ぶ」タイマーを持たない（音源ONでも放置しても自動進行しない）"
    );

    // 500ms誤タップ防止ガードは維持されていること。
    assertEqual(
      source.includes("const REVEAL_AUDIO_NEXT_BUTTON_DELAY_MS = 500;"),
      true,
      "js/lyricsQuizScreen.js：500msの「次へ」誤タップ防止ガードは維持されている"
    );

    // 「次へ」クリックは今までどおり明示的にstopAnswerRevealAudio()（→stopAudio()）を呼ぶこと。
    const nextClickFnStart = source.indexOf("function handleAnswerRevealNextButtonClick() {");
    assertEqual(nextClickFnStart !== -1, true, "js/lyricsQuizScreen.js：handleAnswerRevealNextButtonClick()が存在する（前提条件）");
    const nextClickFnBody = source.slice(nextClickFnStart, nextClickFnStart + 400);
    assertEqual(
      nextClickFnBody.includes("stopAnswerRevealAudio();"),
      true,
      "js/lyricsQuizScreen.js：「次へ」クリックは即座にstopAnswerRevealAudio()を呼び、音源を止めてから次の問題へ進む"
    );

    // stopAnswerRevealAudio()自体が、まだstopAudio()を呼んでいること（cleanup経路の健全性）。
    const stopFnStart = source.indexOf("function stopAnswerRevealAudio() {");
    assertEqual(stopFnStart !== -1, true, "js/lyricsQuizScreen.js：stopAnswerRevealAudio()が存在する（前提条件）");
    const stopFnBody = source.slice(stopFnStart, stopFnStart + 300);
    assertEqual(
      stopFnBody.includes("stopAudio();"),
      true,
      "js/lyricsQuizScreen.js：stopAnswerRevealAudio()は引き続きstopAudio()を呼ぶ（quit/restart/次へ等、既存の全ての退出経路の後始末を維持）"
    );
  }

  // ===== js/instantChallengeScreen.js（一瞬チャレンジ・苦手曲一瞬・オリジナル問題〈一瞬〉共通） =====
  {
    const source = await fetchSource("js/instantChallengeScreen.js");
    assertEqual(source.length > 500, true, "js/instantChallengeScreen.jsのソースを取得できた（前提条件）");

    assertEqual(
      source.includes("REVEAL_AUDIO_AUTO_ADVANCE_DELAY_MS"),
      false,
      "js/instantChallengeScreen.js：音源ON時の固定時間auto-advance定数（REVEAL_AUDIO_AUTO_ADVANCE_DELAY_MS）が廃止されている"
    );
    assertEqual(
      source.includes("const REVEAL_AUDIO_DURATION_SEC ="),
      false,
      "js/instantChallengeScreen.js：REVEAL_AUDIO_DURATION_SEC（固定7秒）の定数定義が廃止されている"
    );

    const maxDurationMatch = source.match(/const REVEAL_AUDIO_MAX_DURATION_SEC = (\d+);/);
    assertEqual(maxDurationMatch !== null, true, "js/instantChallengeScreen.js：REVEAL_AUDIO_MAX_DURATION_SECが定義されている");
    assertEqual(
      Number(maxDurationMatch?.[1]) >= 300,
      true,
      "js/instantChallengeScreen.js：REVEAL_AUDIO_MAX_DURATION_SECは実際の楽曲尺より十分大きい（5分＝300秒以上）"
    );

    // playAnswerRevealAudio()が新しい安全上限を渡していること。
    const playFnStart = source.indexOf("function playAnswerRevealAudio(question) {");
    assertEqual(playFnStart !== -1, true, "js/instantChallengeScreen.js：playAnswerRevealAudio()が存在する（前提条件）");
    const playFnBody = source.slice(playFnStart, playFnStart + 700);
    assertEqual(
      playFnBody.includes("REVEAL_AUDIO_MAX_DURATION_SEC"),
      true,
      "js/instantChallengeScreen.js：playAnswerRevealAudio()がREVEAL_AUDIO_MAX_DURATION_SECをplaySongFromRandomPosition()へ渡している"
    );

    // handleAnswerSelected()の「音源ON」分岐が、もう自動進行タイマー（autoAdvanceTimerId）を
    // 予約しないこと。OFF分岐（4秒固定の自動進行）は維持されていることも確認する。
    const handleFnStart = source.indexOf("function handleAnswerSelected(selectedSongId, buttonElement) {");
    assertEqual(handleFnStart !== -1, true, "js/instantChallengeScreen.js：handleAnswerSelected()が存在する（前提条件）");
    const onBranchStart = source.indexOf("if (getInstantChallengeRevealAudioEnabled()) {", handleFnStart);
    assertEqual(onBranchStart !== -1, true, "js/instantChallengeScreen.js：音源ON分岐が存在する（前提条件）");
    const onBranchEnd = source.indexOf("\n  }", onBranchStart);
    const onBranchBody = source.slice(onBranchStart, onBranchEnd);
    assertEqual(
      onBranchBody.includes("autoAdvanceTimerId = setTimeout"),
      false,
      "js/instantChallengeScreen.js：音源ON分岐はもう自動進行タイマー（autoAdvanceTimerId）を予約しない（放置しても、音源が鳴り終わっても、自動では次へ進まない）"
    );
    assertEqual(
      onBranchBody.includes("REVEAL_AUDIO_NEXT_BUTTON_DELAY_MS"),
      true,
      "js/instantChallengeScreen.js：音源ON分岐でも500msの誤タップ防止ガードは維持されている"
    );

    // OFF分岐（音源を鳴らさない、既存仕様）は今までどおり4秒固定の自動進行を維持している
    // ことを確認する（本人指示：「音源OFFの経路...一切変えない」）。
    const offBranchStart = source.indexOf("// OFF：今までどおり", handleFnStart);
    assertEqual(offBranchStart !== -1, true, "js/instantChallengeScreen.js：音源OFF分岐のコメントが見つかる（前提条件）");
    const offBranchBody = source.slice(offBranchStart, offBranchStart + 1000);
    assertEqual(
      offBranchBody.includes("autoAdvanceTimerId = setTimeout") && offBranchBody.includes("AUTO_ADVANCE_DELAY_MS"),
      true,
      "js/instantChallengeScreen.js：音源OFF分岐は今までどおりAUTO_ADVANCE_DELAY_MS（4秒）で自動進行する（既存仕様を変更していない）"
    );

    // 「次へ」クリックは今までどおり明示的にstopAudio()を呼ぶこと。
    const nextBtnListenerStart = source.indexOf('questionElements.nextButton.addEventListener("click"');
    assertEqual(nextBtnListenerStart !== -1, true, "js/instantChallengeScreen.js：nextButtonのクリックリスナーが存在する（前提条件）");
    const nextBtnListenerBody = source.slice(nextBtnListenerStart, nextBtnListenerStart + 400);
    assertEqual(
      nextBtnListenerBody.includes("stopAudio();"),
      true,
      "js/instantChallengeScreen.js：「次へ」クリックは即座にstopAudio()を呼び、音源を止めてから次の問題へ進む"
    );

    // 一瞬（0.5/1/1.5秒）の問題音源そのものを流す関数は今回一切変更していないことの確認
    // （本人指示：「問題として最初に流す再生時間は絶対に変更しない」）。
    assertEqual(
      source.includes("function playCurrentQuestionAudio()"),
      true,
      "js/instantChallengeScreen.js：問題音源（一瞬のスニペット）を再生するplayCurrentQuestionAudio()は今回のリファクタでも変更・削除されていない"
    );
  }

  // ===== オンライン対戦・おさらいへ影響していないことの確認 =====
  {
    // オンライン各画面は、今回変更した2定数・2関数名（answerRevealのフルネーム）を
    // 一切持たない独立実装のままであることを確認する（誤って共有・流用していないか）。
    const onlineFiles = [
      "js/onlineLyricsQuizBattleScreen.js",
      "js/onlineInstantBattleScreen.js",
      "js/onlineInstantCoopBattleScreen.js",
    ];
    for (const path of onlineFiles) {
      const source = await fetchSource(path);
      assertEqual(source.length > 500, true, `${path}のソースを取得できた（前提条件）`);
      assertEqual(
        source.includes("REVEAL_AUDIO_MAX_DURATION_SEC"),
        false,
        `${path}：今回オフライン専用に新設したREVEAL_AUDIO_MAX_DURATION_SECを一切含まない（オンライン対戦は今までどおり固定時間で答え合わせ音源を進行する設計を維持）`
      );
    }

    // js/audio.jsの共有プリミティブ（playSongFromRandomPosition）自体には一切手を加えて
    // いないことを、シグネチャの文字列一致で確認する（オフライン側の呼び出し引数だけを
    // 変えており、共有関数は変更していないことの保証）。
    const audioSource = await fetchSource("js/audio.js");
    assertEqual(
      audioSource.includes(
        "export async function playSongFromRandomPosition(song, computeStartTimeSec, playDurationSec, onError, onPlaybackStart, onAutoStop) {"
      ),
      true,
      "js/audio.js：共有関数playSongFromRandomPosition()のシグネチャは今回一切変更していない（オフライン側の呼び出し引数だけを変えているため、オンライン側の呼び出しに影響しない）"
    );
  }
}
