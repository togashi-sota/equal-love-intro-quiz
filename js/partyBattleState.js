// パーティー対戦（2026-09-15新設、本人指示）の「純粋な状態遷移」だけを担当するファイル。
//
// 【パーティー対戦とは】1台のスマホ／タブレットを机の中央に置き、2〜4人が同じ問題を同時に聞いて、
// 各自の席（画面の四隅／上下）に置かれた回答エリアで早押しするローカル対戦。以前の「1台対戦」
// （対戦コードを共有して各自がタイムアタックを解き、結果コードを集める方式。js/localBattle.js）を
// 置き換える新モードで、Firebaseはゲーム進行に一切使わない。
//
// 【このファイルの方針】DOM・タイマー・音声・Firebaseには一切触れず、「今の状態」と「起きた出来事」
// から「次の状態」を返す関数だけを置く（引数を書き換えず、新しいオブジェクトを返す）。
// 早押しの同時入力・お手つき・PASS・サドンデスなど、間違えると得点が二重に入る等の事故になる
// ルールをここに集約し、tests/partyBattleState.test.jsで機械的に検証できるようにするため。
// タイマー・音源再生・音声認識などの「時間や外部と関わる処理」はjs/partyBattleEngine.jsが担当し、
// 画面の描画はjs/partyBattleScreen.js・js/partyBattlePlayScreen.jsが担当する。

// ===== 設定の選択肢（定数） =====
export const PARTY_PLAYER_COUNT_VALUES = [2, 3, 4];

// 席。4分割グリッドの4枠に固定のIDと識別色を持たせる（本人指示：色だけに頼らず、名前・枠・
// PLAYER番号も必ず併用する。具体色は既存テーマに合う赤／青／緑／黄系）。
// 2人対戦はこのうち「向かい合う2席」（top＝上辺全体、bottom＝下辺全体）を使う専用レイアウト。
export const PARTY_SEAT_IDS = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
export const PARTY_TWO_PLAYER_SEAT_IDS = ["top", "bottom"];
export const PARTY_SEAT_COLORS = {
  topLeft: { key: "red", label: "レッド" },
  topRight: { key: "blue", label: "ブルー" },
  bottomLeft: { key: "green", label: "グリーン" },
  bottomRight: { key: "yellow", label: "イエロー" },
  top: { key: "red", label: "レッド" },
  bottom: { key: "blue", label: "ブルー" },
};

export const PARTY_QUIZ_TYPE = {
  INTRO: "intro",
  RANDOM: "random",
  OUTRO: "outro",
  INSTANT: "instant",
  LYRICS: "lyrics",
};
export const PARTY_QUIZ_TYPE_VALUES = Object.values(PARTY_QUIZ_TYPE);
export const PARTY_QUIZ_TYPE_LABELS = {
  intro: "イントロ",
  random: "ランダム再生",
  outro: "アウトロ",
  instant: "一瞬",
  lyrics: "歌詞",
};

export const PARTY_ANSWER_METHOD = { FOUR_CHOICE: "fourChoice", VOICE: "voice" };
export const PARTY_ANSWER_METHOD_LABELS = { fourChoice: "4択回答", voice: "音声回答" };

// 選曲ソース。カテゴリ3種は既存のcategoryFilterValueと同じ文字列をそのまま使う
// （js/questionSource.jsのCATEGORYへ橋渡しするため）。共同選曲はFirebase依存のため入れない。
export const PARTY_SONG_SOURCE = {
  TITLE_TRACK: "title-track",
  TITLE_AND_GROUP: "title-and-group",
  ALL: "all",
  MANUAL: "manual",
  FAVORITES: "favorites",
  PLAYLIST: "playlist",
};
export const PARTY_SONG_SOURCE_VALUES = Object.values(PARTY_SONG_SOURCE);
export const PARTY_SONG_SOURCE_LABELS = {
  "title-track": "表題曲のみ",
  "title-and-group": "表題曲＋全員曲",
  all: "全曲",
  manual: "曲を選んで出題",
  favorites: "お気に入り",
  playlist: "プレイリスト",
};

// 音声回答の「話し始めるまで」の制限時間（秒）。既定3秒。
export const PARTY_VOICE_TIMEOUT_VALUES = [2, 3, 5, 10];
export const PARTY_VOICE_TIMEOUT_DEFAULT = 3;
// 音声の発話が始まってから、認識完了を待てる最大時間（本人確定：5秒程度）。
export const PARTY_VOICE_MAX_SPEECH_MS = 5000;

// 一瞬モードの設定。再生長は既存の一瞬チャレンジと同じ選択肢（js/instantChallengeScreen.js）。
export const PARTY_INSTANT_CLIP_VALUES = ["0.5", "1", "1.5"];
export const PARTY_INSTANT_CLIP_DEFAULT = "1";
export const PARTY_INSTANT_MAX_LISTENS_VALUES = [3, 5];
export const PARTY_INSTANT_MAX_LISTENS_DEFAULT = 3;

// 問題数の選択肢。通常系は既存オフラインモードのQUESTION_COUNT_VALUES、一瞬は既存一瞬チャレンジの
// 選択肢を尊重する（本人確定）。
export const PARTY_QUESTION_COUNT_VALUES_NORMAL = ["5", "10", "20", "50", "all"];
export const PARTY_QUESTION_COUNT_VALUES_INSTANT = ["3", "5", "10"];
export function getPartyQuestionCountValues(quizType) {
  return quizType === PARTY_QUIZ_TYPE.INSTANT ? PARTY_QUESTION_COUNT_VALUES_INSTANT : PARTY_QUESTION_COUNT_VALUES_NORMAL;
}

// 不正解表示の長さ（約2秒）と、全員PASSの長押し時間（約1秒）、終了の長押し時間（約2秒）。
export const PARTY_WRONG_RESULT_MS = 2000;
export const PARTY_PASS_LONG_PRESS_MS = 1000;
export const PARTY_QUIT_LONG_PRESS_MS = 2000;

// 1問の中の状態（本人確定の順序）。
export const PARTY_PHASE = {
  QUESTION_INTRO: "QUESTION_INTRO", // 「第N問／全M問」または「サドンデス」を表示
  COUNTDOWN: "COUNTDOWN", // 3→2→1。全入力無効
  ACTIVE: "ACTIVE", // START後。新しく始まったタッチだけ受付
  CLAIMED: "CLAIMED", // 最初の有効入力1件を受理し、他をロック（音声回答の認識中もここ）
  CORRECT_RESULT: "CORRECT_RESULT", // 正解。「次の問題へ」を押すまで待つ
  WRONG_RESULT: "WRONG_RESULT", // 不正解。約2秒表示後にCOUNTDOWNへ戻る
  PASS_RESULT: "PASS_RESULT", // 全員PASS（一瞬は最終試聴で全員PASS）。「次の問題へ」を押すまで待つ
};

// 「次の問題へ」を押せる状態（正解／全員PASSの結果表示中）。
export function isWaitingForNext(runtime) {
  return runtime.phase === PARTY_PHASE.CORRECT_RESULT || runtime.phase === PARTY_PHASE.PASS_RESULT;
}

// ===== 席の割り当て =====

// 人数と「空席にする席」から、席→プレイヤーの対応を作る。
// 戻り値: { layout: "two" | "four", seats: [{ seatId, playerIndex, color }] }
//   playerIndexはplayers配列の添字（空席はnull）。
// 2人: 向かい合う2席固定（top/bottom）。3人: 4分割のうちemptySeatIdを空席にする。4人: 4席すべて。
// 3人なのに空席が未指定／不正なら、開始できないようnullを返す（画面側が理由を表示する）。
export function resolveSeatAssignments(playerCount, emptySeatId = null) {
  if (playerCount === 2) {
    return {
      layout: "two",
      seats: PARTY_TWO_PLAYER_SEAT_IDS.map((seatId, index) => ({
        seatId,
        playerIndex: index,
        color: PARTY_SEAT_COLORS[seatId].key,
      })),
    };
  }
  if (playerCount === 4) {
    return {
      layout: "four",
      seats: PARTY_SEAT_IDS.map((seatId, index) => ({
        seatId,
        playerIndex: index,
        color: PARTY_SEAT_COLORS[seatId].key,
      })),
    };
  }
  if (playerCount === 3) {
    if (!PARTY_SEAT_IDS.includes(emptySeatId)) return null;
    let nextPlayerIndex = 0;
    return {
      layout: "four",
      seats: PARTY_SEAT_IDS.map((seatId) => {
        const isEmpty = seatId === emptySeatId;
        const playerIndex = isEmpty ? null : nextPlayerIndex++;
        return { seatId, playerIndex, color: PARTY_SEAT_COLORS[seatId].key };
      }),
    };
  }
  return null;
}

// 席の向き。机の中央に置いた端末を囲む人が、それぞれ自分の辺から読めるように席ごとに回転させる
// （本人確定：席コンテナ単位でtransformし、文字だけが逆さまにならないようにする）。
// 4分割・縦向き2人: 上側の席は180度、下側は0度。横向き2人: 左が90度、右が-90度（画面の左右の辺から読む）。
export function resolveSeatRotation(seatId, { layout, isLandscape }) {
  if (layout === "two") {
    if (isLandscape) return seatId === "top" ? 90 : -90;
    return seatId === "top" ? 180 : 0;
  }
  return seatId === "topLeft" || seatId === "topRight" ? 180 : 0;
}

// ===== 設定の既定値・検証 =====

export function createDefaultPartySettings() {
  return {
    playerCount: 2,
    playerNames: ["", "", "", ""],
    emptySeatId: null,
    quizType: PARTY_QUIZ_TYPE.INTRO,
    questionCountValue: "5",
    songSource: PARTY_SONG_SOURCE.ALL,
    manualSongIds: [],
    playlistId: null,
    answerMethod: PARTY_ANSWER_METHOD.FOUR_CHOICE,
    otetsuki: true,
    voiceStartTimeoutSec: PARTY_VOICE_TIMEOUT_DEFAULT,
    instantClipSec: PARTY_INSTANT_CLIP_DEFAULT,
    instantMaxListens: PARTY_INSTANT_MAX_LISTENS_DEFAULT,
  };
}

// 保存されていた設定（localStorage）や画面の入力を、必ず正しい値の範囲へ丸める。
// 不正な値が混ざっていても例外にせず、既定値へ戻す（古い保存データにも安全）。
export function normalizePartySettings(raw) {
  const defaults = createDefaultPartySettings();
  const source = raw && typeof raw === "object" ? raw : {};
  const playerCount = PARTY_PLAYER_COUNT_VALUES.includes(Number(source.playerCount))
    ? Number(source.playerCount)
    : defaults.playerCount;
  const quizType = PARTY_QUIZ_TYPE_VALUES.includes(source.quizType) ? source.quizType : defaults.quizType;
  const countValues = getPartyQuestionCountValues(quizType);
  const questionCountValue = countValues.includes(String(source.questionCountValue))
    ? String(source.questionCountValue)
    : countValues[0];
  const playerNames = Array.from({ length: 4 }, (_, index) => {
    const name = Array.isArray(source.playerNames) ? source.playerNames[index] : "";
    return typeof name === "string" ? name.slice(0, 12) : "";
  });
  return {
    playerCount,
    playerNames,
    emptySeatId: PARTY_SEAT_IDS.includes(source.emptySeatId) ? source.emptySeatId : null,
    quizType,
    questionCountValue,
    songSource: PARTY_SONG_SOURCE_VALUES.includes(source.songSource) ? source.songSource : defaults.songSource,
    manualSongIds: Array.isArray(source.manualSongIds)
      ? source.manualSongIds.filter((id) => typeof id === "string")
      : [],
    playlistId: typeof source.playlistId === "string" ? source.playlistId : null,
    answerMethod: Object.values(PARTY_ANSWER_METHOD).includes(source.answerMethod)
      ? source.answerMethod
      : defaults.answerMethod,
    otetsuki: typeof source.otetsuki === "boolean" ? source.otetsuki : defaults.otetsuki,
    voiceStartTimeoutSec: PARTY_VOICE_TIMEOUT_VALUES.includes(Number(source.voiceStartTimeoutSec))
      ? Number(source.voiceStartTimeoutSec)
      : defaults.voiceStartTimeoutSec,
    instantClipSec: PARTY_INSTANT_CLIP_VALUES.includes(String(source.instantClipSec))
      ? String(source.instantClipSec)
      : defaults.instantClipSec,
    instantMaxListens: PARTY_INSTANT_MAX_LISTENS_VALUES.includes(Number(source.instantMaxListens))
      ? Number(source.instantMaxListens)
      : defaults.instantMaxListens,
  };
}

// プレイヤー名の既定（未入力なら「プレイヤー1」等）。
export function resolvePlayerName(rawName, playerIndex) {
  const trimmed = typeof rawName === "string" ? rawName.trim() : "";
  return trimmed || `プレイヤー${playerIndex + 1}`;
}

// 設定からプレイヤー一覧を作る（席の割り当て込み）。席が解決できないときはnull。
export function buildPartyPlayers(settings) {
  const assignment = resolveSeatAssignments(settings.playerCount, settings.emptySeatId);
  if (!assignment) return null;
  const players = [];
  assignment.seats.forEach((seat) => {
    if (seat.playerIndex === null) return;
    players.push({
      id: `p${seat.playerIndex + 1}`,
      index: seat.playerIndex,
      name: resolvePlayerName(settings.playerNames[seat.playerIndex], seat.playerIndex),
      seatId: seat.seatId,
      color: seat.color,
    });
  });
  return { layout: assignment.layout, seats: assignment.seats, players };
}

// ===== 試合（match）の作成と得点 =====

// questions: js/partyBattleEngine.jsが組み立てた問題（{ song, choices, hints, isReserve }）の配列。
// plannedCount: 予定問題数（予備曲を除いた数）。
export function createPartyMatch({ settings, players, layout, seats, questions, plannedCount, seed }) {
  const scores = {};
  players.forEach((player) => {
    scores[player.id] = 0;
  });
  return {
    status: "playing", // "playing" | "suddenDeath" | "finished" | "aborted"
    settings,
    players,
    layout,
    seats,
    seed,
    questions,
    plannedCount,
    questionIndex: 0, // questions配列の中で「次に出す問題」の添字
    completedQuestionCount: 0, // 正解／全員PASSで終了した通常問題の数（差し替えた問題は数えない）
    scores,
    suddenDeath: null, // { participantIds, round } | null
    usedSongIds: [],
    stats: { wrongCount: 0, passCount: 0, replacedCount: 0, suddenDeathQuestionCount: 0 },
    winnerId: null,
    startedAt: null,
    finishedAt: null,
  };
}

export function addScore(match, playerId, delta) {
  return { ...match, scores: { ...match.scores, [playerId]: (match.scores[playerId] ?? 0) + delta } };
}

// 順位表（同点は同順位。例: 3,3,1 → 1位,1位,3位）。
export function computeStandings(match) {
  const rows = match.players.map((player) => ({
    playerId: player.id,
    name: player.name,
    color: player.color,
    seatId: player.seatId,
    score: match.scores[player.id] ?? 0,
  }));
  rows.sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));
  let previousScore = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const rank = row.score === previousScore ? previousRank : index + 1;
    previousScore = row.score;
    previousRank = rank;
    return { ...row, rank };
  });
}

// 1位が複数人いるときだけ、そのプレイヤーIDの配列を返す（サドンデスの参加者）。単独首位ならnull。
export function resolveTopTiePlayerIds(match) {
  const standings = computeStandings(match);
  const topScore = standings[0]?.score ?? 0;
  const tied = standings.filter((row) => row.score === topScore).map((row) => row.playerId);
  return tied.length >= 2 ? tied : null;
}

// 今この問題に参加できるプレイヤーID（サドンデス中は1位タイの人だけ）。
export function resolveParticipantIds(match) {
  if (match.status === "suddenDeath" && match.suddenDeath) return match.suddenDeath.participantIds;
  return match.players.map((player) => player.id);
}

// ===== 1問分の実行時状態（questionRuntime） =====

export function createQuestionRuntime({ question, questionNumber, totalQuestions, isSuddenDeath, participantIds }) {
  return {
    phase: PARTY_PHASE.QUESTION_INTRO,
    question,
    questionNumber, // 1始まり（サドンデスでは通しの追加問題番号）
    totalQuestions,
    isSuddenDeath: Boolean(isSuddenDeath),
    participantIds: [...participantIds],
    acceptedClaim: null, // { playerId, choiceId | null }
    eliminatedChoiceIds: [], // 4択で外れて全席から消えた選択肢（曲ID）。問題終了まで復活しない
    lockedPlayerIds: [], // お手つきで回答不可になったプレイヤー。問題終了まで維持（全員ロック時だけ解除）
    lastResult: null, // { type: "correct"|"wrong"|"pass", playerId, choiceId, revived, judgedBy }
    revivedAll: false, // 直前の不正解で「全員復活！」が起きた（表示用）
    // 【2026-09-15 第3回実機QA修正・本人指示：「もう一度聴く」と「全員PASS」の分離】
    // playCount：この問題で音源を（最初から）鳴らした回数。最初の出題再生を1回目として数える。
    //   一瞬モードは settings.instantMaxListens（3／5）が上限（出題1回＋再聴2／4回）。
    //   ランダム再生／アウトロは回数無制限。イントロは再聴なし（曲頭から曲末まで流すため）。
    // playbackEnded：今の再生が最後まで終わった（曲末到達・区間の自動停止）。true の間だけ「もう一度聴く」を出せる。
    //   再聴で新しく鳴らし始めるときに false へ戻す。
    // 以前あった一瞬の「席ごとのPASS→全員PASSで再試聴」（instantPass／resolveInstantAllPassed）は、
    // 「再聴＝中央の🔁もう一度聴く」「諦め＝中央の全員PASS｜長押し」に役割を分けたため撤去した。
    playCount: 0,
    playbackEnded: false,
    voice: null, // 音声回答の進行状況（エンジンが埋める。純粋関数はここを見ない）
    // 【2026-09-15 第4回実機QA修正・本人指示：音声回答の誤判定を正解公開後に救済】
    // この問題の中で行われた音声回答の一時履歴（永続保存しない。個人PB・ランキング・苦手曲には一切混ぜない）。
    // 要素: { order, key, playerId, transcripts, matchedTitle, autoVerdict, judgedBy, outcome, atMs }
    //   order: 回答順（1始まり）／key: 同じ回答権の再判定（人間判定で覆す等）を同じ要素へ上書きするための識別子
    //   outcome: "wrong"（不正解として処理）| "correct"（正解として処理）| "overtaken"（正解扱いだったが、
    //            より早い回答が救済されて正解者でなくなった）| "voided"（正解表示から不正解へ修正）
    voiceAttempts: [],
    // 【2026-09-15 第2回実機QA修正・本人指示：正解曲名の公開ルール】
    // 「問題が継続する可能性がある間は正解曲名を公開しない。正解／PASS等で問題終了が確定した瞬間だけ公開する」
    // を5出題タイプ共通のルールにするためのフラグ。true になった問題は二度と出題中（COUNTDOWN／ACTIVE）へ戻さない。
    // 正解確定（resolveCorrect）・全員PASS（passQuestion／一瞬の最終試聴）・判定の取り消し（voidRevealedCorrect）で立つ。
    solutionRevealed: false,
  };
}

// この問題の正解曲名を画面に出してよいか（＝問題終了が確定したか）。画面側はこの関数だけを見て曲名を描く。
export function canRevealSolution(runtime) {
  return runtime.solutionRevealed === true;
}

export function beginCountdown(runtime) {
  // 正解曲名を公開した問題は、出題中へ戻せない（答えを全員が知っているため）。呼び出し側は null を「戻せない」として扱う。
  if (runtime.solutionRevealed) return null;
  return { ...runtime, phase: PARTY_PHASE.COUNTDOWN, acceptedClaim: null, revivedAll: false };
}

export function activateQuestion(runtime) {
  return { ...runtime, phase: PARTY_PHASE.ACTIVE, acceptedClaim: null };
}

// プレイヤーが今「押せる」か（4択の選択肢／音声の回答！／一瞬のPASSに共通する前提）。
export function canPlayerAnswer(runtime, playerId) {
  if (runtime.phase !== PARTY_PHASE.ACTIVE) return false;
  if (!runtime.participantIds.includes(playerId)) return false;
  if (runtime.lockedPlayerIds.includes(playerId)) return false;
  return true;
}

export function canTapChoice(runtime, playerId, choiceId) {
  if (!canPlayerAnswer(runtime, playerId)) return false;
  return !runtime.eliminatedChoiceIds.includes(choiceId);
}

// 最初の有効入力1件を受理する。受理できない入力（ロック中・消えた選択肢・既に誰かが回答権を
// 取った後）はnullを返す。呼び出し側（エンジン）は「nullなら何もしない」だけでよい。
// これにより、同一フレームに複数のタップが来ても、最初の1件がphaseをCLAIMEDへ変えた時点で
// 2件目以降は必ずnullになり、得点が二重に入らない。
export function claimAnswer(runtime, { playerId, choiceId = null }) {
  if (choiceId !== null) {
    if (!canTapChoice(runtime, playerId, choiceId)) return null;
  } else if (!canPlayerAnswer(runtime, playerId)) {
    return null;
  }
  return { ...runtime, phase: PARTY_PHASE.CLAIMED, acceptedClaim: { playerId, choiceId } };
}

// 回答権を取った人の答えが正しかったか（4択は選択肢と正解曲の比較。音声はエンジンが判定を渡す）。
export function isClaimedChoiceCorrect(runtime) {
  const claim = runtime.acceptedClaim;
  if (!claim || claim.choiceId === null) return false;
  return claim.choiceId === runtime.question.song.id;
}

// 正解として確定する（judgedBy: "auto"＝4択／音声の自動判定、"human"＝人間判定）。
export function resolveCorrect(runtime, { judgedBy = "auto" } = {}) {
  if (runtime.phase !== PARTY_PHASE.CLAIMED && runtime.phase !== PARTY_PHASE.WRONG_RESULT) return null;
  const claim = runtime.acceptedClaim;
  if (!claim) return null;
  return {
    ...runtime,
    phase: PARTY_PHASE.CORRECT_RESULT,
    solutionRevealed: true, // 正解確定＝問題終了。ここで初めて正解曲名を公開してよい
    // 不正解→正解へ人間が覆した場合、直前の不正解で付いたロックは取り消す
    lockedPlayerIds: runtime.lockedPlayerIds.filter((id) => id !== claim.playerId),
    revivedAll: false,
    lastResult: { type: "correct", playerId: claim.playerId, choiceId: claim.choiceId, revived: false, judgedBy },
  };
}

// 不正解として確定する。4択なら選ばれた誤答候補を全席から消し、お手つきONなら本人をロックする。
// ロックの結果、参加者全員が回答不可になったら「全員復活！」＝プレイヤーロックだけ全解除
// （消えた選択肢は復活しない。本人確定）。
export function resolveWrong(runtime, { otetsuki, judgedBy = "auto" } = {}) {
  // 【公開ルール】CORRECT_RESULT（正解曲名を公開済み）からの「不正解へ修正」は、同じ問題を再開できないため
  // ここでは扱わない（voidRevealedCorrect で「0点で問題終了」にする）。不正解にできるのは回答中（CLAIMED）だけ。
  if (runtime.phase !== PARTY_PHASE.CLAIMED) return null;
  if (runtime.solutionRevealed) return null;
  const claim = runtime.acceptedClaim;
  if (!claim) return null;
  const eliminatedChoiceIds =
    claim.choiceId !== null && !runtime.eliminatedChoiceIds.includes(claim.choiceId)
      ? [...runtime.eliminatedChoiceIds, claim.choiceId]
      : runtime.eliminatedChoiceIds;
  let lockedPlayerIds = runtime.lockedPlayerIds;
  let revived = false;
  if (otetsuki) {
    lockedPlayerIds = lockedPlayerIds.includes(claim.playerId) ? lockedPlayerIds : [...lockedPlayerIds, claim.playerId];
    const everyoneLocked = runtime.participantIds.every((id) => lockedPlayerIds.includes(id));
    if (everyoneLocked) {
      lockedPlayerIds = [];
      revived = true;
    }
  }
  return {
    ...runtime,
    phase: PARTY_PHASE.WRONG_RESULT,
    eliminatedChoiceIds,
    lockedPlayerIds,
    revivedAll: revived,
    lastResult: { type: "wrong", playerId: claim.playerId, choiceId: claim.choiceId, revived, judgedBy },
  };
}

// 不正解表示（約2秒）が終わったら、必ず新しいカウントダウンから再開する。
export function finishWrongResult(runtime) {
  if (runtime.phase !== PARTY_PHASE.WRONG_RESULT) return null;
  return beginCountdown(runtime);
}

// 通常モードの「全員PASS｜長押し」成立。正解曲を表示し0点。
export function passQuestion(runtime) {
  if (runtime.phase !== PARTY_PHASE.ACTIVE) return null;
  return {
    ...runtime,
    phase: PARTY_PHASE.PASS_RESULT,
    acceptedClaim: null,
    solutionRevealed: true, // 全員PASS＝問題終了。ここで公開
    lastResult: { type: "pass", playerId: null, choiceId: null, revived: false, judgedBy: "auto" },
  };
}

// 【2026-09-15 第2回実機QA修正】正解表示（正解曲名を公開済み）のあとで、人間判定により「不正解」へ修正された場合。
// 答えを全員が見ているため同じ問題は再開せず、+1点を取り消して「0点で問題終了」にする（本人確定）。
// 得点の取り消し自体は revokeCorrectScore（match側）で行う。
export function voidRevealedCorrect(runtime) {
  if (runtime.phase !== PARTY_PHASE.CORRECT_RESULT || !runtime.solutionRevealed) return null;
  const claim = runtime.acceptedClaim;
  return {
    ...runtime,
    phase: PARTY_PHASE.PASS_RESULT,
    lastResult: { type: "voided", playerId: claim?.playerId ?? null, choiceId: claim?.choiceId ?? null, revived: false, judgedBy: "human" },
  };
}

// ===== 音声回答の履歴と「正解公開後の救済」（2026-09-15 第4回実機QA修正・本人指示） =====
//
// 【背景】音声認識＋曲名マッチャーは100%ではない。「イコールラブ」と言ったのに不正解と判定され、本人もその場では
// 確信が無くそのまま続行 → 全員PASSで正解「＝LOVE」が公開されて初めて「さっきの回答は正解だった」と分かる、
// というケースを救うための仕組み。通常のテンポは変えない（自動不正解のたびに確認画面を出さない）。
// 正解曲名が公開された（solutionRevealed）結果表示中にだけ、過去に「不正解」処理された音声回答を一覧し、
// その場の人間が「確かに今の正解曲を言っていた」と判断した回答だけを +1pt の正解者へ修正できる。
// 既存の「判定を修正（正解→不正解にして0点で終了）」＝voidRevealedCorrect とは逆方向の操作で、lastResult.type
// を "rescued" にして区別する。

// 音声回答1件を履歴へ記録（同じ key があれば上書き＝同じ回答権の再判定。order は最初の記録時のまま）。
export function recordVoiceAttempt(runtime, attempt) {
  const attempts = runtime.voiceAttempts ?? [];
  const existingIndex = attempts.findIndex((entry) => entry.key === attempt.key);
  if (existingIndex >= 0) {
    const next = [...attempts];
    next[existingIndex] = { ...attempts[existingIndex], ...attempt, order: attempts[existingIndex].order };
    return { ...runtime, voiceAttempts: next };
  }
  return { ...runtime, voiceAttempts: [...attempts, { ...attempt, order: attempts.length + 1 }] };
}

// 履歴の中で「正解として処理されている」要素の outcome を newOutcome へ（救済で正解者が入れ替わるとき用）。
function replaceVoiceAttemptOutcome(attempts, fromOutcome, toOutcome) {
  return attempts.map((entry) => (entry.outcome === fromOutcome ? { ...entry, outcome: toOutcome } : entry));
}

// 救済候補（正解公開後にだけ意味を持つ）。不正解として処理された回答と、救済で正解者でなくなった回答。回答順。
export function listRescuableVoiceAttempts(runtime) {
  if (!runtime.solutionRevealed) return [];
  if (runtime.phase !== PARTY_PHASE.CORRECT_RESULT && runtime.phase !== PARTY_PHASE.PASS_RESULT) return [];
  return (runtime.voiceAttempts ?? [])
    .filter((entry) => entry.outcome === "wrong" || entry.outcome === "overtaken")
    .sort((a, b) => a.order - b.order);
}

// 指定の回答（order）を「本当は正解だった」として救済し、その問題の最終正解者にする。
//   ・問題は終了したまま（phase は CORRECT_RESULT、solutionRevealed は true のまま。再開しない）
//   ・現在の正解者（scoreCredited なら）の +1 を取り消し、救済した人へ +1（二重加算しない。1問の正解者は1人）
//   ・lastResult.type = "rescued"（既存の "correct"／"voided" と区別）
// 戻り値: { match, runtime } または、救済できない状態なら null。
export function rescueVoiceAttempt(match, runtime, order) {
  const candidates = listRescuableVoiceAttempts(runtime);
  const target = candidates.find((entry) => entry.order === order);
  if (!target) return null;
  let nextMatch = match;
  let attempts = runtime.voiceAttempts ?? [];
  const previousPlayerId = runtime.lastResult?.playerId ?? null;
  const previousType = runtime.lastResult?.type ?? null;
  // 今の正解者の得点を取り消す（全員PASS＝0点なら何もしない）
  if (runtime.scoreCredited && previousPlayerId) {
    nextMatch = addScore(nextMatch, previousPlayerId, -1);
    attempts = replaceVoiceAttemptOutcome(attempts, "correct", "overtaken");
  }
  nextMatch = addScore(nextMatch, target.playerId, 1);
  attempts = attempts.map((entry) => (entry.order === order ? { ...entry, outcome: "correct", judgedBy: "human" } : entry));
  const nextRuntime = {
    ...runtime,
    phase: PARTY_PHASE.CORRECT_RESULT,
    solutionRevealed: true,
    scoreCredited: true,
    acceptedClaim: { playerId: target.playerId, choiceId: null },
    voiceAttempts: attempts,
    lastResult: {
      type: "rescued",
      playerId: target.playerId,
      choiceId: null,
      revived: false,
      judgedBy: "human",
      previousPlayerId: previousType === "correct" || previousType === "rescued" ? previousPlayerId : null,
      previousType,
    },
  };
  return { match: nextMatch, runtime: nextRuntime };
}

// ===== 歌詞ヒントの画面配置（2026-09-16 第7回実機QA修正・本人指示） =====
//
// 【仕様（本人確定）】4つのヒント行の「画面上の位置」は、ヒント番号（公開順）ではなく、その曲の歌詞の中での登場位置順
// （hint.startLine 昇順。同じ行なら hintLevel 順）で問題開始時に固定する。公開はこれまでどおりヒント1→2→3→4 の順だが、
// 新しく公開されたヒントを先頭へ動かしたり hintLevel で並べ替えたりはせず、固定スロットの「その場所」に本文を出すだけ。
// 「表示位置」と「公開順」は別物。2人対戦の2ビュー・3／4人の1ビューとも同じ順（向きだけ回転）。
// 戻り値: [{ hintLevel, startLine, slotIndex }]（画面の上から順）。startLine が無いヒント（旧データ）は hintLevel 順で末尾へ。
export function resolveLyricSlotOrder(hints) {
  const list = (hints ?? []).map((hint, index) => ({
    hintLevel: Number.isFinite(hint?.hintLevel) ? hint.hintLevel : index + 1,
    startLine: Number.isFinite(hint?.startLine) ? hint.startLine : Number.POSITIVE_INFINITY,
  }));
  list.sort((a, b) => a.startLine - b.startLine || a.hintLevel - b.hintLevel);
  return list.map((entry, slotIndex) => ({ ...entry, slotIndex }));
}

// ===== 再生回数と「もう一度聴く」（2026-09-15 第3回実機QA修正） =====

// 再聴できる出題タイプ（イントロは曲頭〜曲末を流すため対象外。歌詞は音源を流さない）。
export const PARTY_REPLAYABLE_QUIZ_TYPES = [PARTY_QUIZ_TYPE.RANDOM, PARTY_QUIZ_TYPE.OUTRO, PARTY_QUIZ_TYPE.INSTANT];

// 音源を（最初から）鳴らし始めた：回数を1つ進め、終了フラグを下ろす。エンジンが START で呼ぶ。
export function markPlaybackStarted(runtime) {
  return { ...runtime, playCount: runtime.playCount + 1, playbackEnded: false };
}

// 今の再生が最後まで終わった（曲末到達／区間の自動停止）。
export function markPlaybackEnded(runtime) {
  return { ...runtime, playbackEnded: true };
}

// 一瞬モードの残り再聴回数（上限 − 使用済み）。他のタイプは無制限（null）。
export function resolveRemainingReplays(runtime, settings) {
  if (settings.quizType !== PARTY_QUIZ_TYPE.INSTANT) return null;
  return Math.max(0, settings.instantMaxListens - runtime.playCount);
}

// 「🔁 もう一度聴く」を出せるか：出題中（ACTIVE）で、今の再生が終わっていて、再聴可能なタイプで、
// 一瞬なら上限に達していない。問題終了（正解・PASS・公開済み）では絶対に出さない。
// 上限に達しても問題は終わらない（回答・全員PASSは引き続き可能。本人確定）。
export function canReplay(runtime, settings) {
  if (runtime.phase !== PARTY_PHASE.ACTIVE) return false;
  if (runtime.solutionRevealed) return false;
  if (!runtime.playbackEnded) return false;
  if (!PARTY_REPLAYABLE_QUIZ_TYPES.includes(settings.quizType)) return false;
  const remaining = resolveRemainingReplays(runtime, settings);
  return remaining === null || remaining > 0;
}

// 再聴を始める：3・2・1 からやり直し、START で同じ位置（同じ問題の固定位置）を最初から鳴らす。
// 得点・回答権・お手つきロック・消去済み候補・問題番号・公開フラグは一切変えない（本人確定）。
export function beginReplay(runtime, settings) {
  if (!canReplay(runtime, settings)) return null;
  const next = beginCountdown(runtime);
  if (!next) return null;
  return { ...next, needsFreshPlayback: true };
}

// ===== 試合の進行 =====

// 1問が正解／全員PASSで終わったときの試合側の更新（完了数・使用曲・PASS数）。
// 【得点について】+1点は「正解が確定した瞬間」に入れる（creditCorrectScore。席の得点表示を
// 結果表示中から更新するため。本人確定：正解+1、正解曲表示、得点更新）。人間判定で
// 正解→不正解へ覆された場合はrevokeCorrectScoreで戻す。ここでは加点しない。
export function applyQuestionOutcome(match, runtime) {
  const result = runtime.lastResult;
  if (!result) return match;
  let next = { ...match, usedSongIds: [...match.usedSongIds, runtime.question.song.id] };
  if (result.type === "pass") {
    next = { ...next, stats: { ...next.stats, passCount: next.stats.passCount + 1 } };
  }
  // result.type === "voided"（正解→不正解へ修正）は0点で完了扱い。得点は revokeCorrectScore で既に戻している
  if (runtime.isSuddenDeath) {
    next = {
      ...next,
      stats: { ...next.stats, suddenDeathQuestionCount: next.stats.suddenDeathQuestionCount + 1 },
    };
  } else {
    next = { ...next, completedQuestionCount: next.completedQuestionCount + 1, questionIndex: next.questionIndex + 1 };
  }
  return next;
}

// 人間判定で「正解→不正解」へ覆したとき、既に加算した1点を戻す（正解確定時に得点を入れる
// 設計ではなく、問題終了時にapplyQuestionOutcomeで入れるため、通常はここは不要。
// エンジンは結果表示中に覆された場合、lastResultを差し替えてから次へ進むだけでよい）。

// 正解確定時の加点。同じ回答に二重に入れないよう、runtime.scoreCreditedで管理する。
export function creditCorrectScore(match, runtime) {
  if (runtime.scoreCredited || !runtime.lastResult?.playerId) return { match, runtime };
  return {
    match: addScore(match, runtime.lastResult.playerId, 1),
    runtime: { ...runtime, scoreCredited: true },
  };
}

// 人間判定で「正解→不正解」へ覆したとき、入れた1点を戻す。
export function revokeCorrectScore(match, runtime, playerId) {
  if (!runtime.scoreCredited) return { match, runtime };
  return {
    match: addScore(match, playerId, -1),
    runtime: { ...runtime, scoreCredited: false },
  };
}

export function countWrongAttempt(match) {
  return { ...match, stats: { ...match.stats, wrongCount: match.stats.wrongCount + 1 } };
}

// 予定問題が全部終わったあと、次に何をするか。
//   "suddenDeath": 1位が同点なので、同点の人だけで追加問題へ
//   "finished": 単独首位が決まった
export function resolveAfterPlannedQuestions(match) {
  const tie = resolveTopTiePlayerIds(match);
  if (tie) return { kind: "suddenDeath", participantIds: tie };
  return { kind: "finished", winnerId: computeStandings(match)[0]?.playerId ?? null };
}

// サドンデス中に1問が終わったあとの判定。最初に正解した1位タイの人が最終勝者。
// 誰も正解しなかった（全員PASS）なら次のサドンデス問題へ。
export function resolveSuddenDeathOutcome(runtime) {
  const result = runtime.lastResult;
  if ((result?.type === "correct" || result?.type === "rescued") && result.playerId) return { kind: "finished", winnerId: result.playerId };
  return { kind: "continue" };
}

// サドンデス用の追加問題の曲を選ぶ。まず未出題の曲から。未出題が尽きたときだけ既出曲から
// 再利用する（直前の問題の即リピートは避け、再シャッフル）。
// poolSongs: 出題対象の曲オブジェクト配列、usedSongIds: 既出、lastSongId: 直前の曲、random: 0〜1の乱数関数。
export function pickSuddenDeathSong(poolSongs, usedSongIds, lastSongId, random = Math.random) {
  const used = new Set(usedSongIds);
  const unused = poolSongs.filter((song) => !used.has(song.id));
  const candidates = unused.length > 0 ? unused : poolSongs.filter((song) => song.id !== lastSongId);
  const finalCandidates = candidates.length > 0 ? candidates : poolSongs;
  if (finalCandidates.length === 0) return null;
  const index = Math.min(finalCandidates.length - 1, Math.floor(random() * finalCandidates.length));
  return finalCandidates[index];
}

// ===== 結果表示用 =====

// 最終順位を「下位→上位」の順で発表するための並び（同点は同順位のまま）。
export function buildRevealOrder(standings) {
  return [...standings].sort((a, b) => b.rank - a.rank || b.playerId.localeCompare(a.playerId));
}
