// 歌詞クイズ オンライン対戦の新規Firebaseパスに対する、セキュリティルール案の
// 「意図」をJavaScriptの純粋関数として再現したシミュレーター（Phase4）。
//
// 【重要な限界】これはFirebase Realtime Database Rules（実際のルール言語）そのものでは
// なく、ルールに込めたい意図をコードとして書き下し、様々な攻撃・正常系シナリオに対して
// 期待どおりの許可/拒否になるかを自動テストするためのもの。実際にFirebaseへ公開する前には、
// 必ずFirebase Rules Playgroundで本物のルール構文（下記の対応するJSON案は
// docs/mode-design-random-playback-and-lyrics-quiz.md 追記⑨・⑪参照）が同じ結果になる
// ことを確認し、本人の承認を経てから公開する（既存の運用をそのまま継続する）。
//
// room: { host, activeMatchId, matches: { [matchId]: {
//   currentQuestionIndex, questionStatus, participants: { [uid]: true } } } }
// という、Firebase上の該当部分を模した最小限の形を各関数の引数として渡す想定。

// players/{uid}/lyricsCoverageへの書き込み（本人限定の自己スコープ）。
export function canWriteLyricsCoverage({ authUid, targetUid }) {
  return authUid != null && authUid === targetUid;
}

// answers/{questionIndex}/{uid}への書き込み可否（設計⑨①・⑪の意図をそのまま再現）。
export function canWriteAnswer({ authUid, targetUid, room, matchId, questionIndex, existingAnswerExists }) {
  if (authUid == null || authUid !== targetUid) return false;
  if (existingAnswerExists) return false; // write-once：二重回答・上書きを拒否
  if (room.activeMatchId !== matchId) return false; // 古い試合の遅延通信を拒否
  const match = room.matches?.[matchId];
  if (!match) return false;
  if (match.currentQuestionIndex !== questionIndex) return false; // 古い/未来のquestionIndexを拒否
  if (match.questionStatus !== "active") return false; // 問題終了後の回答を拒否
  if (!match.participants?.[targetUid]) return false; // 未参加者の書き込みを拒否
  return true;
}

// 【2026-08-31改訂・本人指示による3ルール全面見直し】以前はhintLevelが「実際の経過時間
// （画面に表示されていたはずの段階）とほぼ一致しているか」を、hintIntervalSec（ヒントが
// 時間経過で自動送りされる間隔）を基準に検証していた。しかし新仕様では、ヒントは
// 本人がボタンを押して手動で開く方式に変わり、「いつ何段階目を開いたか」は本人の自由な
// タイミング次第になったため、固定間隔を前提にしたこの時間窓チェックはもう成立しない
// （本人が慎重に考えて10秒後にヒント1のまま回答しても、何もおかしくない）。
// そのため検証は「1〜4の整数であること」という型・範囲チェックのみに縮小した
// （友達内利用が前提の既存の信頼モデルを踏襲し、hintLevelは結果画面の参考情報としてのみ
// 扱う。採点（pointsAwarded）への影響もclassicRule/stealRuleでは既に無くしてあり、
// comboRuleだけがこの自己申告値を配点に使うが、そちらも「友達内利用前提」の
// 既存の信頼モデルの範囲内として扱う）。
export function isHintLevelConsistentWithElapsedTime({ hintLevel }) {
  return Number.isInteger(hintLevel) && hintLevel >= 1 && hintLevel <= 4;
}

// questionClaims/{questionIndex}/winnerへの書き込み可否。
// hasOwnAnswerInSameWrite：同じ問題への自分の回答ログが、この書き込みの時点で
// （既存データとして、またはanswers+winnerをまとめた同一update()内で）存在するかどうか。
// 正解songIdそのものの検証はここではできない（設計⑨①の限界）ため、
// アプリ側（js/battleRules/stealRule.js）の再照合を必ず維持する。
export function canWriteStealClaim({ authUid, newWinnerUid, room, matchId, questionIndex, existingWinnerExists, hasOwnAnswerInSameWrite }) {
  if (authUid == null) return false;
  if (newWinnerUid !== authUid) return false; // 他人の代わりにclaimすることはできない
  if (existingWinnerExists) return false; // write-once：先に確定した勝者を上書きできない
  if (room.activeMatchId !== matchId) return false;
  const match = room.matches?.[matchId];
  if (!match) return false;
  if (match.currentQuestionIndex !== questionIndex) return false;
  if (match.questionStatus !== "active") return false;
  if (!hasOwnAnswerInSameWrite) return false; // 何もせず即claimすることはできない
  return true;
}

// currentQuestionIndex・currentQuestionStartedAt・questionStatus・resolvedAt等、
// ホスト限定の進行フィールドへの書き込み可否。
export function canWriteHostOnlyMatchField({ authUid, room }) {
  return authUid != null && authUid === room.host;
}

// 「必要フィールド以外を持たない」チェック（Firebaseルールの$other:falseパターンの意図を再現）。
export function hasOnlyAllowedFields(obj, allowedKeys) {
  return Object.keys(obj).every((key) => allowedKeys.includes(key));
}

// 【Phase7新設】matches/{matchId}/lyricsResults/{uid}への書き込み可否。
//
// 【既存gameModeのresultsとの違い】既存gameMode（timeAttack等）のresults/{uid}は
// 「本人が自分の結果だけを書く」（authUid === targetUid）前提のルールだが、歌詞クイズは
// ホストが全参加者分の結果を1回のupdate()でまとめて確定する設計のため、書き込み主体が
// 異なる（authUid === room.host）。既存ルールへは一切影響を与えず、専用パスとして
// 新設した（詳しくはdocs/mode-design-random-playback-and-lyrics-quiz.md追記⑯2.参照）。
export function canWriteLyricsResult({ authUid, targetUid, room, matchId, existingResultExists }) {
  if (authUid == null || authUid !== room.host) return false; // ホスト限定
  if (existingResultExists) return false; // write-once：確定済みの結果は上書きできない
  if (room.activeMatchId !== matchId) return false; // 古い試合の遅延通信を拒否
  if (room.status !== "playing") return false; // 確定前（playing中）にしか書けない
  const match = room.matches?.[matchId];
  if (!match?.participants?.[targetUid]) return false; // 参加者スナップショットに無いuidへは書けない
  return true;
}

// ===== Phase7・本人指摘④：settings（Firebase同期される対戦設定）の値検証 =====
//
// 【位置づけ】既存のrooms/$roomId/settingsは、ホストが書き込めること（.write）だけを
// 検証し、値の中身（.validate）は他のgameModeも含め一切検証していなかった
// （「友達内利用が前提、ホストの全権限を許容する」という既存方針）。本人から
// 「battleRuleVersionを導入した目的（配点変更の区別・端末間の不一致防止・未知バージョンの
// 開始拒否）を踏まえ、少なくともMVPで許可する値だけは実ルールでも拒否したい」という
// 明確な指摘を受け、既存のsettings自体の.writeには一切触れず、settings配下の
// 個別フィールド（battleRuleId・battleRuleVersion・hintIntervalSec・answerPoolSizeValue）へ
// 追加の.validateを新設する方針にした。他のgameMode（timeAttack等）にはこれらの
// フィールド自体が存在しないため、この検証は歌詞クイズの設定を書くときにしか働かない。

const VALID_BATTLE_RULE_IDS = ["classic", "steal", "combo"];
const VALID_ANSWER_POOL_SIZE_VALUES = [4, 10, 30, 50, "all"];
const STEAL_ONLY_ANSWER_POOL_SIZE_VALUES = [4, 10];

export function isValidBattleRuleId(battleRuleId) {
  return VALID_BATTLE_RULE_IDS.includes(battleRuleId);
}

// 【2026-08-31・v1→v2】3ルールとも配点方式・タイブレーク方式を変更したため
// ruleVersionを2へ上げた（js/battleRules/classicRule.js・stealRule.js・comboRule.js参照）。
// 対応しているのはバージョン2のみ。将来、配点等をさらに変更してバージョンを
// 上げた際は、この関数も必ず同時に更新すること。
export function isValidBattleRuleVersion(battleRuleVersion) {
  return battleRuleVersion === 2;
}

// 【2026-08-31改訂】ヒントを手動で開く方式になり、hintIntervalSec（自動送り間隔）の
// 設定項目自体が無くなったため、この検証関数は使われなくなった。互換のため残す。
export function isValidHintIntervalSec() {
  return true;
}

// 奪い取り（steal）だけ4択・10択に絞る組み合わせ検証（設計⑧④・js/battleRules/stealRule.jsの
// allowedAnswerPoolSizesと同じ制約を、Firebaseルール側でも表現する）。
export function isValidAnswerPoolSizeValue({ answerPoolSizeValue, battleRuleId }) {
  if (!VALID_ANSWER_POOL_SIZE_VALUES.includes(answerPoolSizeValue)) return false;
  if (battleRuleId === "steal") return STEAL_ONLY_ANSWER_POOL_SIZE_VALUES.includes(answerPoolSizeValue);
  return true;
}
