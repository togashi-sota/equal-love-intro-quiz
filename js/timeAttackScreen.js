// タイムアタックの設定画面・結果画面を担当するファイル。
// クイズ本編（出題・選択肢生成・音源再生・タイマー）はjs/quiz.js・js/state.js・js/audio.js・
// js/timer.jsをそのまま再利用し、このファイルは「タイムアタックだけの記録（合計タイム・
// ミス数）の管理」と「設定・結果、2つの画面の組み立て」に専念する。
//
// 実行中の記録（合計タイム・ミス数など）は、既存のgameState（js/state.js）には一切持たせず、
// このファイルのモジュール内変数だけで完結させている。得点・自己ベスト・プレイ履歴の
// どの仕組みにも触れない、完全に独立した記録として扱うため（本人の要望：「通常クイズの
// 履歴・自己ベストとは混ぜず、タイムアタック専用の記録にする」）。
//
// 【2026-08-07追加、本人指示による例外】称号（実績）システムだけは例外で、
// タイムアタック（現在のイントロ形式）もイントロクイズと並ぶ「ノーミス段階称号・電光石火」の
// 達成手段として明示的に対象にする。js/achievementProgress.jsへ渡す共通結果の組み立てだけを
// buildAchievementResultInput()として持ち、保存先自体（自己ベスト・履歴）は今まで通り別のまま。

import { SONGS } from "./data/songs.js";
import { filterSongsByCategory, validatePlayablePoolSize, resolveQuestionCount, buildQuizQuestions } from "./quiz.js";
import { filterSongsWithImportedAudio } from "./audioStorage.js";
import { gameState } from "./state.js";
import { recordWeakSongAttempt } from "./weakSongStats.js";
import { recordShuffleWeakSongAttempt } from "./shuffleWeakSongStats.js";
import {
  getTimeAttackBest,
  saveTimeAttackBestIfBetter,
  saveTimeAttackBestReachIfBetter,
} from "./timeAttackScore.js";
import { saveTimeAttackHistoryEntry } from "./timeAttackHistory.js";
import { evaluateAndSaveAchievements } from "./achievementProgress.js";
import { renderAchievementUnlockEvents } from "./achievementDisplay.js";
import { getAchievementById } from "./achievementDefinitions.js";
import { calculateAverageResponseMs, formatResponseSeconds } from "./responseTime.js";
import { describeSpeedProgressForPlay, buildSpeedProgressResultBlock } from "./speedAchievementProgress.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { attemptSilentUnlock } from "./audio.js";

// ルール（3種類）。
// normal    ：間違えた選択肢だけ消える消去法。正解したら即次へ。ミス数を記録する。
// hard      ：1回間違えたら、正解を見せずに即次の問題へ進む（消去法なし）。ミス数を記録する。
// loveChain ：ガチ勢向け。1回でも間違えた瞬間にその場でゲーム終了し、即結果画面へ。
//             自己ベストは「全問クリアできたときのタイム」だけを対象にする（2026-08-06追加）。
export const TIME_ATTACK_RULE = { NORMAL: "normal", HARD: "hard", LOVE_CHAIN: "loveChain" };

// 出題タイプ（2026-08-07追加）。
// intro         ：曲の冒頭を聴いて当てる、従来どおりのタイムアタック。
// randomPlayback：曲の途中からランダムな位置で数秒間だけ再生する
//                 （js/randomPlaybackEngine.jsの既存の純粋関数をそのまま再利用し、
//                 このファイルでは種(seed)の発行だけを新しく持つ。js/randomPlaybackScreen.jsの
//                 「アダプター方式」と同じ考え方を、今度はタイムアタック自身の中に取り込む形）。
// 将来のメロディアス等の追加を見込み、文字列のvariantIdとして結果データに残す設計にしている。
//
// 【2026-08-30追加、本人指示（後半③）】outro：アウトロクイズ専用のグローバルランキング区分。
// タイムアタックのルール（ノーマル/ハード/LOVE連チャン）としては存在しない（本人指示：
// アウトロのタイムアタックは今回追加しない）が、ランキングの区分キーとしてはintro・
// randomPlaybackと全く同じ仕組みをそのまま再利用したいため、ここに追加する
// （js/main.jsのrenderResult()、アウトロクイズ通常導線からのみ使う）。
export const TIME_ATTACK_VARIANT = { INTRO: "intro", RANDOM_PLAYBACK: "randomPlayback", OUTRO: "outro" };

let elements = null;
let resultElements = null;

// ===== 1. 設定画面 =====

export function initTimeAttackScreen(newElements) {
  elements = newElements;
  elements.startButton.addEventListener("click", () => {
    // 【2026-09-15追加・本人指示：アプリ起動後最初の第1問だけ無音になるバグ対策】
    // オンライン対戦では既に「開始する」系ボタンの先頭でattemptSilentUnlock()を
    // 呼んでいたが、オフライン各モードの「開始する」ボタンにはこの対策が無く、起動後
    // 最初のクイズ開始（インタラクションからplay()までの間にIndexedDB読み込み等の
    // 非同期処理が複数回挟まる）でunlockが間に合わない可能性があった。本物のユーザー
    // ジェスチャー（クリック）の呼び出しスタック内で同期的に実行する。
    attemptSilentUnlock();
    const questionCountValue = document.querySelector('input[name="time-attack-question-count"]:checked').value;
    const categoryFilterValue = document.querySelector('input[name="time-attack-category-filter"]:checked').value;
    const rule = document.querySelector('input[name="time-attack-rule"]:checked').value;
    // 出題タイプのラジオが無い画面（旧HTMLとの互換）でも壊れないよう、要素が無ければintro扱いにする。
    const variant =
      document.querySelector('input[name="time-attack-variant"]:checked')?.value ?? TIME_ATTACK_VARIANT.INTRO;
    elements.onStart(questionCountValue, categoryFilterValue, rule, variant);
  });
}

// ===== 実行中の記録（gameStateとは別に、このファイルだけで完結させる） =====

let currentRule = TIME_ATTACK_RULE.NORMAL;
let currentQuestionCountValue = null;
let currentCategoryFilterValue = null;
let currentVariant = TIME_ATTACK_VARIANT.INTRO;
// ランダム再生variantのときだけ使う、再生開始位置の種。js/randomPlaybackScreen.jsの
// startRandomPlaybackRun()と全く同じ発行方法（Math.random()の値をそのまま種にする。
// 1人用は「毎回違う位置になる」ことだけが目的で、複数端末間の一致は不要なため）。
let currentSeed = 0;
let totalElapsedMs = 0;
let correctCount = 0;
let missCount = 0;
let perQuestionResults = []; // 履歴の詳細画面に必要な情報一式（下のrecordTimeAttackAnswer参照）
let missCountThisQuestion = 0; // 今の問題で、これまでに何回間違えたか（ノーマルルールで加算していく）
let selectedAnswersThisQuestion = []; // 今の問題で、押した順に選択肢の曲名を貯める（履歴の詳細表示用）
let runFailed = false; // LOVE連チャンで、全問クリアできずに終了したかどうか

// タイムアタックを開始する直前に呼ぶ。実行中の記録をすべてリセットする。
export function startTimeAttackRun(rule, questionCountValue, categoryFilterValue, variant = TIME_ATTACK_VARIANT.INTRO) {
  currentRule = rule;
  currentQuestionCountValue = questionCountValue;
  currentCategoryFilterValue = categoryFilterValue;
  currentVariant = variant;
  currentSeed =
    variant === TIME_ATTACK_VARIANT.RANDOM_PLAYBACK ? (Math.floor(Math.random() * 0x100000000) >>> 0) : 0;
  totalElapsedMs = 0;
  correctCount = 0;
  missCount = 0;
  perQuestionResults = [];
  missCountThisQuestion = 0;
  selectedAnswersThisQuestion = [];
  runFailed = false;
}

export function getCurrentTimeAttackRule() {
  return currentRule;
}

export function getCurrentTimeAttackVariant() {
  return currentVariant;
}

// ランダム再生variantの再生開始位置の種。main.js側でcomputeRandomStartTimeSec()に渡す。
export function getCurrentTimeAttackSeed() {
  return currentSeed;
}

// 実行中の記録を読み取り専用で取得する（保存は一切行わない）。
// 対戦モード（js/localBattleScreen.js）が、タイムアタックと全く同じ「ノーマル/ハード/
// LOVE連チャンのテンポ良い進行ルール」を再利用するために追加した（2026-08-06）。
// 対戦モードは結果の保存先（自己ベスト・履歴）がタイムアタックとは完全に別なので、
// renderTimeAttackResult()（保存まで行う）は呼ばず、この関数で生の数値だけを受け取る。
export function getCurrentTimeAttackStats() {
  return { totalElapsedMs, correctCount, missCount, perQuestionResults, runFailed };
}

// LOVE連チャンで1回間違えて即終了になったときに呼ぶ。renderTimeAttackResult()側で、
// 自己ベストの保存をスキップし、「失敗しました」の表示に切り替えるために使う。
export function markTimeAttackRunFailed() {
  runFailed = true;
}

// ノーマルルールで不正解の選択肢を選んだときに呼ぶ。今の問題のミス回数を1増やすだけで、
// 問題そのものは終わらせない（呼び出し側で、その選択肢ボタンを無効化する）。
export function registerTimeAttackMiss() {
  missCountThisQuestion += 1;
}

// 選択肢をクリックするたびに呼ぶ（正解・不正解どちらでも）。押した順に曲名を積み上げておき、
// 1問終わったときの履歴に「間違えた曲A→間違えた曲B→正解曲」のような形で残せるようにする。
export function registerTimeAttackSelection(choiceTitle) {
  selectedAnswersThisQuestion.push(choiceTitle);
}

// 1問分の結果を記録する（正解した瞬間、またはhard／LOVE連チャンルールで1回間違えた瞬間に呼ばれる）。
// elapsedMsがnull（音源再生に失敗した等）の場合は、合計タイムには加算しない
// （実測できていない時間を0扱いで加算すると、合計タイムが不当に有利になってしまうため）。
// missCountThisQuestion・selectedAnswersThisQuestionは、ここまでに積み上げた分をそのまま使い、
// 記録し終えたら次の問題のためにリセットする。
// question（js/state.jsのgetCurrentQuestion()の戻り値）から、履歴の詳細表示に必要な
// 「その問題で表示された4択」「正解の曲名」を取り出して一緒に保存する。
export function recordTimeAttackAnswer({ elapsedMs, isCorrect, question }) {
  if (elapsedMs !== null) {
    totalElapsedMs += elapsedMs;
  }
  if (isCorrect) {
    correctCount += 1;
  }
  missCount += missCountThisQuestion;

  // 【2026-08-16追加、本人指示】苦手曲判定用の記録。対象はplayModeが"timeAttack"
  // （イントロタイムアタック・ランダム再生タイムアタックの両方）と"randomPlayback"
  // （js/randomPlaybackScreen.jsの独立したランダム再生クイズ。startRandomPlaybackRun()経由で
  // このファイルの記録エンジンを再利用しているため）の2つ。"localBattle"・"onlineBattle"
  // （対戦モード）も同じrecordTimeAttackAnswer()を通るが、対象モードに含まれないため除外する。
  // 正誤の判定は、最終的なisCorrectではなくmissCountThisQuestion===0（1回も間違えずに
  // 正解できたか）を使う。ノーマルルールは「正解するまでやり直せる」ため、isCorrectは
  // ほぼ常にtrueになってしまい判定に使えない（下のcomputeTimeAttackWeakSongsと同じ理由。
  // js/timeAttackHistory.jsのコメント参照）。
  // 【2026-08-30改訂、本人指示：苦手曲5系統完全分離】以前はイントロ・ランダム再生の
  // どちらもjs/weakSongStats.jsへ合算していたが、5系統を完全に独立させたため、ここで
  // currentVariant（イントロタイムアタックのvariantはINTRO固定なのでtimeAttackでは常時参照）と
  // playModeを見て、イントロ系はjs/weakSongStats.js、シャッフル系（ランダム再生・ランダム再生
  // タイムアタック）はjs/shuffleWeakSongStats.jsへ分けて記録する。
  const isShuffleAnswer =
    gameState.playMode === "randomPlayback" ||
    (gameState.playMode === "timeAttack" && currentVariant === TIME_ATTACK_VARIANT.RANDOM_PLAYBACK);
  const isIntroAnswer = gameState.playMode === "timeAttack" && currentVariant === TIME_ATTACK_VARIANT.INTRO;
  if (isShuffleAnswer) {
    recordShuffleWeakSongAttempt(question.song.id, missCountThisQuestion === 0);
  } else if (isIntroAnswer) {
    recordWeakSongAttempt(question.song.id, missCountThisQuestion === 0);
  }

  perQuestionResults.push({
    questionNumber: perQuestionResults.length + 1,
    songId: question.song.id,
    choices: question.choices.map((choice) => ({ id: choice.id, title: choice.title })),
    correctAnswer: question.song.title,
    selectedAnswers: [...selectedAnswersThisQuestion],
    elapsedMs,
    missCountThisQuestion,
    isCorrect,
  });
  missCountThisQuestion = 0;
  selectedAnswersThisQuestion = [];
}

// ===== 2. 結果画面 =====

export function initTimeAttackResultScreen(newElements) {
  resultElements = newElements;
}

// getCurrentTimeAttackStats()の生データ（1問=1エントリだが、ノーマルルールは
// 「間違えても最終的に正解すればisCorrect:true」になる）を、称号（実績）判定用の
// 共通結果オブジェクトへ変換する（js/achievementEvaluation.js参照）。
// 「ノーミス」の定義は、js/randomPlaybackScreen.jsも含めて統一する：
// 1問でもmissCountThisQuestion>0（一度でも間違った選択肢を選んだ）なら、
// 最終的に正解していてもその問題は「誤答あり」として扱う（本人指示の「誤答なし」の趣旨、
// 消去法で何度か外してから当てた場合まで含めてしまわないようにするため）。
// タイムアタック・ランダム再生クイズには「スキップ」の概念が無いため、skippedCountは常に0。
export function buildAchievementResultInput(stats, modeId, questionCountValue, categoryFilterValue = null) {
  const cleanCorrectCount = stats.perQuestionResults.filter(
    (result) => result.isCorrect && result.missCountThisQuestion === 0
  ).length;
  const impureCount = stats.perQuestionResults.length - cleanCorrectCount;

  const averageResponseMs = calculateAverageResponseMs(
    stats.perQuestionResults
      .filter((result) => result.isCorrect && result.elapsedMs !== null)
      .map((result) => result.elapsedMs)
  );

  return {
    modeId,
    questionCountValue,
    categoryFilterValue,
    correctCount: cleanCorrectCount,
    wrongCount: impureCount,
    skippedCount: 0,
    completed: !stats.runFailed,
    averageResponseMs,
  };
}

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

const RULE_LABELS = {
  [TIME_ATTACK_RULE.NORMAL]: "ノーマル",
  [TIME_ATTACK_RULE.HARD]: "ハード",
  [TIME_ATTACK_RULE.LOVE_CHAIN]: "LOVE連チャン",
};

// 結果画面を描画し、自己ベスト・最高到達記録の判定・保存、履歴の保存もすべてここで行う
// （タイムアタックの1回のプレイが「終わった」瞬間に必ず1回だけ通る場所のため）。
// LOVE連チャンで全問クリアできずに終了した場合（runFailed）は、そもそも「記録」として
// 扱わないため、自己ベストの保存はスキップし、代わりに失敗した旨を表示する。
// 「タイトルへ」で中断した場合はこの関数自体が呼ばれないため、履歴にも残らない
// （既存の通常プレイ履歴と同じ考え方）。
export function renderTimeAttackResult() {
  const previousBest = getTimeAttackBest(
    currentRule,
    currentQuestionCountValue,
    currentCategoryFilterValue,
    currentVariant
  );
  const isNewRecord =
    !runFailed &&
    saveTimeAttackBestIfBetter(
      totalElapsedMs,
      currentRule,
      currentQuestionCountValue,
      currentCategoryFilterValue,
      currentVariant
    );

  // LOVE連チャンだけ「最高到達記録」も判定・保存する（成功・失敗どちらでも、
  // 到達できた問題数自体は意味のある記録のため）。他の2ルールは全問必ず最後まで進むので対象外。
  if (currentRule === TIME_ATTACK_RULE.LOVE_CHAIN) {
    saveTimeAttackBestReachIfBetter(
      perQuestionResults.length,
      totalElapsedMs,
      currentQuestionCountValue,
      currentCategoryFilterValue,
      currentVariant
    );
  }

  const failedAtQuestionNumber = runFailed ? perQuestionResults.length : null;
  saveTimeAttackHistoryEntry({
    rule: currentRule,
    questionCountValue: currentQuestionCountValue,
    categoryFilterValue: currentCategoryFilterValue,
    totalElapsedMs,
    correctCount,
    missCount,
    completed: !runFailed,
    failedAtQuestionNumber,
    isNewRecord,
    perQuestionResults,
    variant: currentVariant,
  });

  resultElements.totalTime.textContent = `${formatSeconds(totalElapsedMs)}秒`;
  resultElements.correctCount.textContent = `${correctCount} / ${perQuestionResults.length}問`;
  resultElements.missCount.textContent = `${missCount}回`;
  // ランダム再生variantのときだけ、既存の「ルール」表示に🔀マークを添えて見分けられるようにする
  // （イントロ形式は今までどおりの表示のまま、新しいHTML要素を増やさずに区別を伝えるための工夫）。
  const ruleLabelText = RULE_LABELS[currentRule] ?? "ノーマル";
  resultElements.ruleLabel.textContent =
    currentVariant === TIME_ATTACK_VARIANT.RANDOM_PLAYBACK ? `🔀${ruleLabelText}` : ruleLabelText;

  resultElements.newRecordBadge.hidden = !isNewRecord;
  resultElements.failStatus.hidden = !runFailed;
  if (runFailed) {
    resultElements.failStatus.textContent = `${perQuestionResults.length}問目で失敗しました（LOVE連チャンは全問クリアのタイムだけが記録されます）`;
  }

  // グローバルランキングへの送信（2026-08-07追加）。このファイル自体はFirebaseに一切触れない
  // 設計を保つため、実際の送信処理はmain.js側のonNewRecordコールバックに任せる
  // （js/achievementDisplay.jsの称号演出と同じ、コールバック注入のパターン）。
  // 毎回まず非表示にリセットし、新記録のときだけmain.js側が表示・文言を差し替える。
  if (resultElements.leaderboardStatus) {
    resultElements.leaderboardStatus.hidden = true;
  }
  if (isNewRecord) {
    resultElements.onNewRecord?.({
      variant: currentVariant,
      questionCountValue: currentQuestionCountValue,
      categoryFilterValue: currentCategoryFilterValue,
      rule: currentRule,
      totalElapsedMs,
      missCount,
      actualQuestionCount: perQuestionResults.length,
    });
  }

  // 【2026-08-16追加、本人指示】公開設定に関係なく、ランキング条件（ミス0・完走）を
  // 満たした記録は常にローカルへ保存しておく（js/rankingCandidateStore.js参照）。
  // 上のonNewRecordが「ローカル自己ベストを更新したとき」だけ呼ばれるのに対し、こちらは
  // 「ランキング条件を満たしたとき」だけを基準にする、意図的に別の判定にしている
  // （ローカル自己ベストはミスありでも更新されうるため、isNewRecordだけに頼ると、
  // ランキング条件を満たした記録を取りこぼす場合があった）。
  if (!runFailed && missCount === 0) {
    resultElements.onCleanClear?.({
      variant: currentVariant,
      questionCountValue: currentQuestionCountValue,
      categoryFilterValue: currentCategoryFilterValue,
      rule: currentRule,
      totalElapsedMs,
      missCount,
      actualQuestionCount: perQuestionResults.length,
    });
  }

  // 称号（実績）判定。「タイトルへ」で中断した場合はこの関数自体が呼ばれないため、
  // 判定対象にはならない（既存の通常プレイと同じ考え方）。
  //
  // 【本人指示、2026-08-07】「ノーミスマスター」「電光石火」は、あくまで既存のイントロクイズ・
  // イントロ形式タイムアタックだけを対象にした称号のまま変更しない。新設のランダム再生
  // タイムアタックがこれらを勝手に満たしてしまわないよう、modeIdをintro variantとは別の
  // 文字列にしている（js/achievementEvaluation.jsのmodeId判定に一致しないため、
  // このmodeIdからは現時点でどの称号も付与されない）。
  const achievementModeId =
    currentVariant === TIME_ATTACK_VARIANT.RANDOM_PLAYBACK ? "timeAttackRandomPlayback" : "timeAttack";
  const achievementInput = buildAchievementResultInput(
    getCurrentTimeAttackStats(),
    achievementModeId,
    currentQuestionCountValue,
    currentCategoryFilterValue
  );
  const achievementResult = evaluateAndSaveAchievements(achievementInput);
  renderAchievementUnlockEvents(achievementResult.newlyUnlockedIds, {
    chipContainer: resultElements.achievementChipContainer,
    achievementListLinkElement: resultElements.achievementListLink,
  });

  // 結果の達成度に応じた効果音（2026-08-10新設）。LOVE連チャン失敗時は鳴らさない。
  // 称号を新規獲得した回はachievementUnlock側の音と重ならないよう、こちらは鳴らさない。
  if (achievementResult.newlyUnlockedIds.length === 0 && !runFailed) {
    const isCleanClearForSound = achievementInput.correctCount > 0 && achievementInput.wrongCount === 0;
    playSfx(isCleanClearForSound ? SFX_EVENTS.RESULT_PERFECT : SFX_EVENTS.RESULT_GOOD);
  }

  // 平均回答時間の表示（2026-08-09新設）。称号判定（buildAchievementResultInput）に
  // 渡したのと完全に同じaverageResponseMsを表示に使うことで、数値のズレを防ぐ。
  if (resultElements.averageTime) {
    const formattedAverageResponseTime = formatResponseSeconds(achievementInput.averageResponseMs);
    resultElements.averageTime.hidden = formattedAverageResponseTime === null;
    if (formattedAverageResponseTime !== null) {
      resultElements.averageTime.textContent = `平均回答時間 ${formattedAverageResponseTime}`;
    }
  }

  // 電光石火までの進捗（イントロ形式・全曲モードのときだけ。ランダム再生variantは
  // achievementModeIdが"timeAttackRandomPlayback"のため、describeSpeedProgressForPlay内で
  // 自動的に対象外になる＝ここで分岐を書く必要はない）。
  if (resultElements.speedProgressContainer) {
    const isCleanClear = achievementInput.correctCount > 0 && achievementInput.wrongCount === 0 && achievementInput.completed;
    const speedProgress = describeSpeedProgressForPlay({
      modeId: achievementModeId,
      isAllSongsMode: currentQuestionCountValue === "all",
      isCleanClear,
      averageResponseMs: achievementInput.averageResponseMs,
    });
    resultElements.speedProgressContainer.innerHTML = "";
    const speedProgressBlock = buildSpeedProgressResultBlock(
      speedProgress,
      getAchievementById("lightning_fast")?.name ?? "電光石火"
    );
    if (speedProgressBlock) resultElements.speedProgressContainer.appendChild(speedProgressBlock);
  }

  if (previousBest !== null) {
    resultElements.bestTime.hidden = false;
    resultElements.bestTime.textContent = isNewRecord
      ? `自己ベストを更新しました（前回: ${formatSeconds(previousBest)}秒）`
      : `自己ベスト: ${formatSeconds(previousBest)}秒`;
  } else if (!runFailed) {
    resultElements.bestTime.hidden = false;
    resultElements.bestTime.textContent = "はじめての記録です";
  } else {
    resultElements.bestTime.hidden = true;
  }
}

// 「もう一度挑戦する」「同じ条件でもう一度」用に、直前の条件をそのまま返す。
export function getLastTimeAttackSelection() {
  return {
    questionCountValue: currentQuestionCountValue,
    categoryFilterValue: currentCategoryFilterValue,
    rule: currentRule,
    variant: currentVariant,
  };
}

// タイムアタックの問題セットを組み立てる（曲プールの絞り込み・検証から問題生成まで）。
// main.js側の「開始」処理から呼ぶ共通処理。既存のbeginQuiz()と同じ考え方だが、
// 戻り値としてquestionsを返すだけにとどめ、実際にgameStateへ反映する処理
// （startTimeAttackQuiz呼び出し）はmain.js側が行う（main.js側の既存の書き方に合わせるため）。
// 曲数不足等でクイズを組み立てられない場合はnullを返す。
export async function buildTimeAttackQuestions(questionCountValue, categoryFilterValue) {
  const categoryPool = filterSongsByCategory(SONGS, categoryFilterValue);
  const pool = await filterSongsWithImportedAudio(categoryPool);
  const errorMessage = validatePlayablePoolSize(pool);
  if (errorMessage) return null;

  const questionCount = resolveQuestionCount(questionCountValue, pool.length);
  return buildQuizQuestions(pool, questionCount);
}
