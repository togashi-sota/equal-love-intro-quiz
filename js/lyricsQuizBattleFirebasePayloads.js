// 歌詞クイズ オンライン対戦のFirebase書き込み内容を組み立てる、純粋関数だけのファイル。
//
// 【このファイルを分離した理由】js/lyricsQuizBattleFirebase.js（実際のSDK呼び出し）は
// Firebase SDK・js/firebaseClient.jsをimportしており、importされた瞬間にFirebaseアプリの
// 初期化・匿名ログインが走り出す。ペイロード組み立てロジックだけを自動テストしたい
// ときにその副作用を避けるため、Firebaseに一切触れない部分だけをこのファイルへ独立させた
// （tests/lyricsQuizBattleFirebase.test.jsはこのファイルだけをimportする）。

// lyricsCoverage（players/{uid}/lyricsCoverage）の中身を組み立てる。
// completeはavailableCount/requiredCountから機械的に導出し、呼び出し元が
// 独自に偽った値を渡せないようにする（本人が虚偽報告すること自体は防げないが、
// 「入力ミスでavailableCount>requiredCountなのにcomplete:falseになる」ような
// 単純な不整合は起こらないようにする）。
export function buildLyricsCoveragePayload({ availableCount, requiredCount, poolHash }) {
  return {
    availableCount,
    requiredCount,
    complete: availableCount >= requiredCount,
    poolHash,
  };
}

export function isLyricsCoverageReady(lyricsCoverage) {
  return !!lyricsCoverage && lyricsCoverage.complete === true;
}

// 【Phase6新設・簡略版】settings.songPool（曲IDの配列）から、決定論的な短い文字列を作る。
// 元の設計（追記⑥3章）では歌詞本文の内容そのものをハッシュ化する想定だったが、Phase6時点では
// songPoolの手動絞り込みUIが無く常に全曲が対象になるため、「どの曲プールで対戦しているか」を
// 機械的に照合できれば十分と判断し、songPoolの中身だけをハッシュ化する簡易版にした
// （歌詞内容そのものの改変検知は将来の課題として持ち越す）。並び順に依存しないよう、
// 曲IDを並べ替えてから結合する。暗号強度は不要（衝突しにくければよい）なので、
// 軽量なdjb2文字列ハッシュを使う。
export function computeSongPoolHash(songPool) {
  const sortedIds = [...songPool].sort();
  const joined = sortedIds.join(",");
  let hash = 5381;
  for (let i = 0; i < joined.length; i++) {
    hash = ((hash << 5) + hash + joined.charCodeAt(i)) | 0;
  }
  return `p${sortedIds.length}-${(hash >>> 0).toString(36)}`;
}

// 歌詞データの「内容が一致しているか」の照合（追記⑥3章のcomputeLyricsContentHash由来の値を比較する）。
export function doesLyricsPoolHashMatch(myPoolHash, hostPoolHash) {
  return typeof myPoolHash === "string" && myPoolHash.length > 0 && myPoolHash === hostPoolHash;
}

// 1人分のlyricsCoverageを、表示用の3状態のどれかに分類する純粋関数。
//
// 【なぜ3状態にしたか・2026-08-06】lyricsCoverageがまだFirebaseに届いていない
// （＝本人がまだIndexedDBの確認を終えていない）状態を、これまでは呼び出し側が
// 「availableCount: 0」という仮のデフォルト値で埋めて扱っていたため、「本当に0曲しか
// 無い」のか「まだ確認中なだけ」なのかが画面上で区別できず、ロビー作成直後に
// 「歌詞データが不足しています（81曲中0曲）」という誤解を招く表示が一時的に出てしまう
// 不具合があった（本人からの実機報告で発覚）。coverageが無い、またはプールのハッシュが
// 今のプールと一致しない（＝古い確認結果）場合は、不足と断定せず「確認中」を返す。
export const LYRICS_COVERAGE_STATUS = {
  CHECKING: "checking",
  INSUFFICIENT: "insufficient",
  READY: "ready",
};

export function describeLyricsCoverageStatus(coverage, hostPoolHash) {
  if (!coverage || !doesLyricsPoolHashMatch(coverage.poolHash, hostPoolHash)) {
    return { status: LYRICS_COVERAGE_STATUS.CHECKING, availableCount: null, requiredCount: coverage?.requiredCount ?? null };
  }
  if (isLyricsCoverageReady(coverage)) {
    return { status: LYRICS_COVERAGE_STATUS.READY, availableCount: coverage.availableCount, requiredCount: coverage.requiredCount };
  }
  return { status: LYRICS_COVERAGE_STATUS.INSUFFICIENT, availableCount: coverage.availableCount, requiredCount: coverage.requiredCount };
}

// 参加者全員のlyricsCoverageから、READYを許可してよいか判定する。
// 1人でも不足・内容不一致がいれば拒否し、理由を返す（追記⑦10章のホスト向け表示に使う）。
export function checkAllPlayersLyricsReady(lyricsCoverageByUid, hostPoolHash) {
  const notReadyUids = Object.entries(lyricsCoverageByUid)
    .filter(([, coverage]) => !isLyricsCoverageReady(coverage) || !doesLyricsPoolHashMatch(coverage.poolHash, hostPoolHash))
    .map(([uid]) => uid);
  return { ok: notReadyUids.length === 0, notReadyUids };
}

// answers/{questionIndex}/{uid}へ書き込む内容。submittedAtはFirebase書き込み時にだけ
// 実際のサーバー時刻へ解決される特別な値（serverTimestamp()）を渡す想定のため、
// この関数の引数として受け取る（本番ではserverTimestamp()、テストでは検証用の
// 固定値を渡せるようにするため。追記⑨②で述べた「ServerValue.TIMESTAMPの最終データ形」
// を、渡された値をそのまま使うことで確認できる）。
export function buildAnswerPayload({ selectedSongId, hintLevel, answeredAt, submittedAtValue }) {
  return { selectedSongId, hintLevel, answeredAt, submittedAt: submittedAtValue };
}

// 奪い取りで正解と判定したときに使う、回答ログ＋winner claimの同時書き込み用データ。
// 1回のupdate()にまとめて渡すことで、「winnerだけ存在して回答ログがない」
// 「回答ログ成功後にwinner送信だけ失敗」のような中間状態を避ける（本人指示どおり）。
// winnerは最小構造（{ uid, submittedAt }）にし、selectedSongIdは重複保存しない
// （唯一の情報源はanswers側。正誤の最終確認は必ずanswers側を見て行う、追記⑨②）。
export function buildAnswerAndStealClaimUpdatePaths({
  roomId,
  matchId,
  questionIndex,
  uid,
  selectedSongId,
  hintLevel,
  answeredAt,
  submittedAtValue,
}) {
  const answerPath = `rooms/${roomId}/matches/${matchId}/answers/${questionIndex}/${uid}`;
  const winnerPath = `rooms/${roomId}/matches/${matchId}/questionClaims/${questionIndex}/winner`;
  return {
    [answerPath]: buildAnswerPayload({ selectedSongId, hintLevel, answeredAt, submittedAtValue }),
    [winnerPath]: { uid, submittedAt: submittedAtValue },
  };
}

// answers/{questionIndex}/{uid}の件数（Firebase上に実際に届いた回答数）から、
// 誰がDNF（最後まで完走できなかった）かを導出する。js/lyricsQuizMatchProgress.jsの
// finalizeMatch()と同じ考え方（完走者＝全問分の回答が揃っている人）を、Firebaseから
// 読み取った件数ベースで再現したもの。DNFは新しいFirebaseフィールドとして書き込まず、
// 常にこの関数で「今の回答件数」から導出する（設計⑪①：完走済みを誤って上書きしない
// ようにするための構造上の保証。書き込まれた値を信用するのではなく、都度計算するため、
// 上書き事故が起こりようがない）。
export function deriveDnfUidsFromAnswerCounts({ allPlayerUids, answeredCountByUid, totalQuestions }) {
  return allPlayerUids.filter((uid) => (answeredCountByUid[uid] ?? 0) < totalQuestions);
}

export const QUESTION_STATUS = { ACTIVE: "active", RESOLVED: "resolved" };

// ===== 失敗理由の統一語彙（設計⑫⑤） =====
//
// js/lyricsQuizBattleFirebase.jsの各書き込み関数は、必ずこの中のどれか1つを
// { ok: false, reason } として返す（例外をそのまま投げない）。UI側は
// isRetryableFailureReason()で「再試行してよいか」を機械的に判定できる。
export const FIREBASE_FAILURE_REASON = {
  NOT_SIGNED_IN: "not-signed-in",
  NOT_FOUND: "not-found",
  NOT_HOST: "not-host",
  STALE_MATCH: "stale-match",
  STALE_QUESTION: "stale-question",
  QUESTION_RESOLVED: "question-resolved",
  ALREADY_ANSWERED: "already-answered",
  WINNER_ALREADY_CLAIMED: "winner-already-claimed",
  INVALID_SETTINGS: "invalid-settings",
  PERMISSION_DENIED: "permission-denied",
  NETWORK_ERROR: "network-error",
};

// submitLyricsQuizAnswerWithStealClaim()（2段階送信）が、ok:trueのときに返すoutcome。
// ok:falseのとき（送信自体が拒否・失敗）はFIREBASE_FAILURE_REASON側を使う。
export const STEAL_CLAIM_OUTCOME = {
  WON: "won",
  LOST_RACE: "lost-race",
  ANSWERED_WRONG: "answered-wrong",
};

// 「一時的な通信の問題」だけを再試行してよいものとして扱う。それ以外（仕様上の拒否・
// 権限拒否等）は、再試行しても状況が変わらないため再試行しない
// （本人指示どおり：already-answered・stale-match・question-resolved・
// invalid-settings・winner-already-claimed等は再試行してはいけない）。
const RETRYABLE_FAILURE_REASONS = new Set([FIREBASE_FAILURE_REASON.NETWORK_ERROR]);

export function isRetryableFailureReason(reason) {
  return RETRYABLE_FAILURE_REASONS.has(reason);
}

// ===== 書き込み前の事前チェック（純粋関数。Firebaseへ実際に書く前に、呼び出し元が
// 読み取り済みのroomスナップショットから「書けそうか」を判定する。実際の許可可否の
// 最終防衛線は必ずセキュリティルール側だが、ここで事前に弾けば無駄な書き込み
// リクエストを減らし、失敗理由もより具体的に返せる） =====

// room: { activeMatchId, matches: { [matchId]: {
//   currentQuestionIndex, questionStatus, answers: { [questionIndex]: { [uid]: {...} } } } } }
//
// 【2026-09-06追記・本人指示：権限エラーの原因調査】以前はparticipantsスナップショットに
// 本人が存在するかを確認していなかった。実際のFirebaseセキュリティルール
// （canWriteAnswer、firebase/database.rules.jsonのanswers/{questionIndex}/{uid}）は
// `participants/{uid}.exists()`も要求しているため、何らかの理由でparticipantsに
// 本人のエントリが無い状態（再接続の際どいタイミング等）だと、この事前チェックだけが
// 素通りして「書けるはずなのに実際は拒否される」という不一致が起こり得た。
// 事前チェックとルールの条件を完全に一致させることで、原因不明のPERMISSION_DENIEDを減らす。
export function checkAnswerSubmissionAllowed({ room, matchId, questionIndex, uid }) {
  if (!room) return { ok: false, reason: FIREBASE_FAILURE_REASON.NOT_FOUND };
  if (room.activeMatchId !== matchId) return { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_MATCH };
  const match = room.matches?.[matchId];
  if (!match) return { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_MATCH };
  if (match.currentQuestionIndex !== questionIndex) return { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_QUESTION };
  if (match.questionStatus !== QUESTION_STATUS.ACTIVE) return { ok: false, reason: FIREBASE_FAILURE_REASON.QUESTION_RESOLVED };
  if (match.answers?.[questionIndex]?.[uid]) return { ok: false, reason: FIREBASE_FAILURE_REASON.ALREADY_ANSWERED };
  if (!match.participants?.[uid]) return { ok: false, reason: FIREBASE_FAILURE_REASON.NOT_FOUND };
  return { ok: true };
}

// room: 上と同じ形＋matches[matchId].questionClaims: { [questionIndex]: { winner: {...} } }
export function checkStealClaimAllowed({ room, matchId, questionIndex }) {
  if (!room) return { ok: false, reason: FIREBASE_FAILURE_REASON.NOT_FOUND };
  if (room.activeMatchId !== matchId) return { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_MATCH };
  const match = room.matches?.[matchId];
  if (!match) return { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_MATCH };
  if (match.currentQuestionIndex !== questionIndex) return { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_QUESTION };
  if (match.questionStatus !== QUESTION_STATUS.ACTIVE) return { ok: false, reason: FIREBASE_FAILURE_REASON.QUESTION_RESOLVED };
  if (match.questionClaims?.[questionIndex]?.winner) return { ok: false, reason: FIREBASE_FAILURE_REASON.WINNER_ALREADY_CLAIMED };
  return { ok: true };
}

// 【Phase6.5新設】room: { host, activeMatchId, status }
// ホストが最終問題を確定・進行し終えたときの事前チェック（js/lyricsQuizBattleFirebase.jsの
// finalizeLyricsQuizMatch()が、実際に書き込む前に使う）。既にroom.status === "result"
// （前回の試行が実はサーバー側で成功していた等、ホストのリロード後の再試行を含む）の場合は、
// 書き込み不要の成功として扱う（alreadyDone:trueで区別できるようにする）。
export function checkFinalizeLyricsQuizMatchAllowed({ room, matchId, uid }) {
  if (!room) return { ok: false, reason: FIREBASE_FAILURE_REASON.NOT_FOUND };
  if (room.host !== uid) return { ok: false, reason: FIREBASE_FAILURE_REASON.NOT_HOST };
  if (room.activeMatchId !== matchId) return { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_MATCH };
  if (room.status === "result") return { ok: true, alreadyDone: true };
  return { ok: true, alreadyDone: false };
}

// 全参加者分の最終結果（{ [uid]: result }）から、1回のupdate()にまとめる書き込みパスを
// 組み立てる。room.statusとmatches/{matchId}/lyricsResults/{uid}を同時に確定させることで、
// 「結果だけ書けてstatusがまだplayingのまま」のような中間状態を避ける（本人指示どおり）。
//
// 【Phase7・書き込み先パスについての訂正】Phase6では既存gameMode（timeAttack等）と同じ
// matches/{matchId}/results/{uid}を再利用していたが、セキュリティルール精査の過程で、
// 既存のresults/{uid}は「本人が自分の結果だけを書く」（auth.uid === $uid）前提の
// ルールであることが判明した。歌詞クイズは各自が自分の結果を送るのではなく、
// ホストが全員分の結果を一括確定するため、既存ルールとは書き込み主体が根本的に異なる。
// 既存ルール・既存gameModeの動作に一切影響を与えないよう、歌詞クイズ専用の新しいパス
// matches/{matchId}/lyricsResults/{uid}へ変更した（js/onlineLyricsQuizBattleScreen.jsの
// enterLyricsQuizResult()も合わせて変更済み）。
export function buildFinalizeLyricsQuizMatchUpdatePaths({ roomId, matchId, resultsByUid }) {
  const updates = { [`rooms/${roomId}/status`]: "result" };
  for (const [uid, result] of Object.entries(resultsByUid)) {
    updates[`rooms/${roomId}/matches/${matchId}/lyricsResults/${uid}`] = result;
  }
  return updates;
}
