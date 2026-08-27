// オンライン対戦の「歌詞クイズ」モード用アダプター。
//
// 【設計方針】既存のtimeAttackBattleMode.js・randomPlaybackBattleMode.jsと同じ形の
// battleModes契約（gameMode・label・defaultSettings・validateSettings・buildQuestions・
// createResult・compareResults・getRuleDescription）を満たしつつ、実際の採点・終了条件・
// 結果生成はすべてjs/battleRules/（クラシック/奪い取り/コンボ）へ委譲する。
// このファイル自身は「どのルールが選ばれているか（settings.battleRuleId）」を見て
// battleRules側の関数を呼ぶだけの薄い窓口で、採点ロジックそのものは一切持たない。
//
// これにより、js/onlineBattle.js・js/onlineBattleScreen.jsは今までどおり
// js/battleModes/index.js経由でしかこのファイルを呼ばず、js/battleRules/の存在すら
// 意識しない設計になる（battleRules/index.jsを直接importするのはこのファイルだけ）。
//
// 【フェーズ2時点の注意（継続）】まだjs/battleModes/index.jsのREGISTRYには登録していない
// （本人の指示により、既存battleModeの変更＝レジストリへの登録もこのフェーズでは行わない）。
// このファイル単体で読み込み・テストできる状態まで。オンライン対戦画面との結線は次フェーズ以降。
//
// 【設計⑩①：settingsとruntimeContextの分離】settingsはFirebaseのroom.settingsへ
// そのまま保存・同期される想定のデータで、歌詞本文・歌詞行データを絶対に含めない。
// 歌詞データ（loadSongsWithLyrics()の戻り値）は各端末のIndexedDBから読み込む
// 「実行時にしか存在しない、この端末専用のデータ」として明確に区別し、runtimeContextという
// 別の引数に分離した（settings.songsWithLyricsのような紛らわしい持たせ方はしない）。
// runtimeContextはJSON化してFirebaseへ送ってはいけない値、という契約をここに明記する。
//
// 【設計⑩②：非同期の事前準備フック（案B採用）】歌詢クイズの実際の問題生成
// （buildLyricsQuizQuestions）はIndexedDBから歌詞データを読み込む非同期処理を必要とする。
// 既存のbuildQuestions({ seed, settings })は同期関数のままにしつつ、
// prepareRuntimeContext({ settings }) という「モードが任意で持てる非同期の事前準備フック」を
// 新設した。既存のtimeAttack/randomPlaybackにはこのフックが無く、呼び出し元（将来の
// オンライン対戦画面）は「そのモードにprepareRuntimeContextがあれば呼ぶ」という判定だけで
// 済む設計にしている（gameMode名で分岐しない、既存方針の踏襲）。
// 今回はjs/battleModes/index.jsの登録簿・ディスパッチ関数にはまだ手を入れず、
// このファイル単体にメソッドとして生やすところまでに留めた（既存ファイルは無改造のまま）。

import {
  buildLyricsQuizQuestions,
  loadSongsWithLyrics,
  validateLyricsQuizAvailability,
  resolveLyricsQuizSongPool,
} from "../lyricsQuizQuestionBuilder.js";
import { validateSongPoolForQuestionCount, QUESTION_SOURCE_TYPE } from "../questionSource.js";
import {
  createDefaultBattleRuleSettings,
  validateBattleRule,
  getBattleRuleVersion,
  isSupportedBattleRuleVersion,
  resolveQuestionAnswers as resolveBattleRuleQuestionAnswers,
  shouldEndQuestion as shouldEndBattleRuleQuestion,
  aggregateResult as aggregateBattleRuleResult,
  compareBattleRuleResults,
  getBattleRuleDescription,
  listAvailableBattleRules,
  getAnswerSubmissionPlan as getBattleRuleAnswerSubmissionPlan,
  getComboMultiplierForCount as getBattleRuleComboMultiplierForCount,
} from "../battleRules/index.js";
import { SKIP_SELECTION, MAX_HINT_LEVEL } from "../battleRules/sharedDefaults.js";

// js/lyricsQuizMatchProgress.js（対戦進行エンジン）が、期限切れで未回答のまま終わった
// プレイヤーをスキップ扱いにするために使う定数。battleRules/を直接importするのは
// このファイルだけ、という設計方針を保つため、ここで再エクスポートする。
export { SKIP_SELECTION, MAX_HINT_LEVEL };

export const gameMode = "lyricsQuiz";
export const label = "歌詞クイズ";
export const description = "歌詞のヒントから曲を当てます";
// 音源再生を伴わないモードのため、既存の"intro"/"randomPosition"とは別の識別子にする。
// js/main.jsのrenderQuestion()が将来この値を見て、歌詞クイズ専用画面へ振り分ける想定
// （既存の"intro"/"randomPosition"の分岐には一切手を加えない）。
export const playbackType = "lyricsQuiz";
// 【2026-08-27新設】オンライン対戦の共通曲判定（js/onlineBattleSongAvailability.js）が、
// このモードを「歌詞データの所持状況」で絞り込むべきと判断するための識別子
// （音源が無くても歌詞さえ揃っていれば歌詞クイズは成立するため、音源基準では絞り込まない）。
export const availabilityKind = "lyrics";

const DEFAULT_BATTLE_RULE_ID = "classic";

// ロビー画面のホスト用設定フォームが最初に表示する既定値。
//
// 【Firebaseへそのまま保存・同期される想定のフィールドのみ】battleRuleId・
// battleRuleVersion・ルール固有設定（hintIntervalSec等、本人が自由に選んでよい項目のみ）・
// questionCountValue・answerPoolSizeValueは、すべてJSON化できるプリミティブな値のみで、
// 歌詞本文・歌詞行データを一切含まない。
//
// 【Phase6.5・questionSourceへ統一】曲プールは、他の対戦モード（タイムアタック・
// ランダム再生対戦）と同じくjs/questionSource.jsのquestionSource記述子として持つ。
// Phase6では確定済みのsongPool配列を直接持たせていたが、既存基盤を無視した
// 別設計になっていた（本人指摘）。今回選べるUI自体は「全曲」のみのままだが、
// 内部的にはall/category/manualSelection/favoritesSnapshot/playlistSnapshot/
// collaborativeSelectionのいずれもそのまま受け取れる形にしてある。
//
// 【設計⑪②：配点テーブルはここに含めない】pointTable・comboMultiplierTableは、
// battleRuleId・battleRuleVersionさえ一致していれば全端末が同じ値をコード
// （js/battleRules/各ルールモジュール内の定数）から取得できるため、あえて
// settingsへ含めない。ホストが不正な配点を送る・端末ごとに配点が食い違う、
// といった事故を構造的に防ぐための設計判断。
export function defaultSettings() {
  return {
    battleRuleId: DEFAULT_BATTLE_RULE_ID,
    battleRuleVersion: getBattleRuleVersion(DEFAULT_BATTLE_RULE_ID),
    ...createDefaultBattleRuleSettings(DEFAULT_BATTLE_RULE_ID),
    questionSource: { type: QUESTION_SOURCE_TYPE.ALL_SONGS },
    questionCountValue: "10",
    answerPoolSizeValue: 4,
  };
}

// 設定が実際に出題できる内容か検証する。問題なければnull、問題があればエラー文言を返す。
//
// 【設計⑩③：ルールバージョンの不一致を拒否】settings.battleRuleVersionが、
// 自分の端末が知っている現在のバージョンと一致しない場合は開始を拒否する。
// 配点・コンボ倍率等を変更した新しいアプリと、更新前の古いアプリが混在した対戦を防ぐため。
//
// 【Phase6.5追加：曲数不足の事前ガード】questionSourceから解決したsongPoolの曲数が
// questionCountValueに満たない場合は、js/questionSource.jsのrandomPlaybackBattleMode等と
// 同じ考え方（validateSongPoolForQuestionCount）で開始自体を拒否する。ここではまだ
// 「歌詞データが実際に読み込まれているか」までは分からない（各端末のIndexedDB次第の
// 非同期情報のため）。その後段のチェックはcheckRuntimeAvailability()が担当する。
//
// 【歌詞データの充足チェックについて】ここでは行わない。「参加者の端末に実際に
// 歌詞データがあるか」（lyricsCoverage）は、改造クライアントの虚偽報告を防ぐものではなく
// 通常利用の事故防止のための仕組みであり（設計⑨④）、ルーム設定の妥当性とは別の関心事
// として、READY操作のタイミングで別途検証する設計にしている。
export function validateSettings(settings) {
  if (!settings || typeof settings !== "object") return "設定が不正です。";

  const ruleError = validateBattleRule(settings.battleRuleId, settings);
  if (ruleError) return ruleError;

  if (!isSupportedBattleRuleVersion(settings.battleRuleId, settings.battleRuleVersion)) {
    return "対戦ルールのバージョンが一致しません。アプリを更新してください。";
  }

  // 【2026-08-27追記・本人指示】共同選曲（collaborativeSelection）は、参加者全員が
  // まだ選んでいる最中（0曲）という状態を、ロビーでの設定保存自体はエラーにしない
  // （js/battleModes/timeAttackBattleMode.jsの同じ追記と同じ理由）。
  if (
    settings.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION &&
    (settings.questionSource.songIds ?? []).length === 0
  ) {
    return null;
  }

  // 【2026-08-08修正】resolveSongPool()ではなく、歌詞クイズ対象外の曲
  // （Overture等、ボーカルの無い曲）を除いたresolveLyricsQuizSongPool()を使う。
  const songPool = resolveLyricsQuizSongPool(settings.questionSource);
  if (songPool.length === 0) {
    return "出題対象の曲が選ばれていません。";
  }
  const poolCheck = validateSongPoolForQuestionCount(songPool, settings.questionCountValue);
  if (!poolCheck.ok) {
    return `出題対象の曲が足りません（${poolCheck.requiredCount}曲必要ですが、${poolCheck.currentCount}曲しかありません）。`;
  }
  return null;
}

// 【2026-08-27新設】settingsから「実際に出題対象になりうる曲ID一覧」を解決する。
// js/battleModes/timeAttackBattleMode.jsのresolveSettingsSongPool()と同じ役割で、
// これが無いとjs/battleModes/index.jsのresolveSongPoolForSettings()がnullを返し続け、
// オンライン対戦の共通曲（intersection）判定（js/onlineBattleSongAvailability.js）の
// 対象から歌詞クイズ対戦だけが外れたままになってしまう。
// 【歌詞データの充足チェックとの違い】ここで返すのは「設定上、出題対象になりうる曲」で
// あり、「その端末に歌詞データが実際にあるか」は見ない（そちらは従来どおり
// checkRuntimeAvailability()の役目）。参加者全員の歌詞所持状況での絞り込みは、
// js/onlineBattle.jsのstartBattle()がavailabilityKind="lyrics"を使って別途行う。
export function resolveSettingsSongPool(settings) {
  return resolveLyricsQuizSongPool(settings.questionSource);
}

// 【2026-08-27新設】このモードで「そもそも出題対象になりうる全曲ID」を返す
// （歌詞クイズ対象外の曲＝Overture等を除いた全曲）。オンライン対戦のロビー画面が
// 「今の参加者全員に共通する曲は何曲か」を見積もる際の基準（basePool）として使う
// （js/battleModes/index.jsのresolveAllEligibleSongIdsForMode参照）。
export function resolveAllEligibleSongIds() {
  return resolveLyricsQuizSongPool({ type: QUESTION_SOURCE_TYPE.ALL_SONGS });
}

// 【設計⑩②：非同期の事前準備フック】questionSourceからsongPoolを解決し、
// IndexedDBから歌詞データを読み込んで、buildQuestions()が使うruntimeContextを
// 組み立てる。この関数の戻り値は「この端末だけのローカルなデータ」であり、
// Firebaseへ送信してはいけない。
//
// 【IndexedDB読込失敗の扱い】loadSongsWithLyrics()自体は例外を投げない設計だが
// （読み込めなかった曲は結果から除外されるだけ）、万一IndexedDBへのアクセス自体が
// 失敗した場合（ブラウザの制限等）に備えてtry/catchで確実に捕捉し、
// 呼び出し元が「準備に失敗した」と明示的に判断できるok:falseを返す
// （画面側は、okがfalseならbuildQuestions()を呼ばず、エラー表示に倒す想定）。
export async function prepareRuntimeContext({ settings }) {
  try {
    const songPool = resolveLyricsQuizSongPool(settings.questionSource);
    const songsWithLyrics = await loadSongsWithLyrics(songPool);
    return { ok: true, songsWithLyrics, songPool };
  } catch (error) {
    return { ok: false, songsWithLyrics: [], songPool: [], reason: "歌詞データの読み込みに失敗しました。" };
  }
}

// seed・settings・runtimeContextから、全端末で完全に一致する問題セットを組み立てる。
//
// runtimeContext.songsWithLyrics・songPoolは、呼び出し元が事前にprepareRuntimeContext()
// で読み込んだものを渡す想定。settings自体には歌詞データを一切含めない（設計⑩①）。
// runtimeContextの準備に失敗していた場合（prepareRuntimeContext()がok:falseを返した場合）は、
// 空の問題配列を返す安全側の挙動にする。
export function buildQuestions({ seed, settings, runtimeContext }) {
  if (!runtimeContext?.ok) return [];
  return buildLyricsQuizQuestions({
    seed,
    songsWithLyrics: runtimeContext.songsWithLyrics ?? [],
    songPool: runtimeContext.songPool ?? resolveLyricsQuizSongPool(settings.questionSource),
    questionCountValue: settings.questionCountValue,
    answerPoolSizeValue: settings.answerPoolSizeValue,
  });
}

// 【Phase6.5新設】出題可能な曲（実際に歌詞データが読み込まれている曲）が
// questionCountValueぶん揃っているかを検証する。validateSettings()の曲数チェックは
// 「曲プール自体の大きさ」しか見ておらず、「その端末に歌詞データが読み込まれているか」は
// 非同期情報のため分からない。prepareRuntimeContext()の後にこちらも必ず確認し、
// 足りなければ対戦を開始しない（本人の明確な指示）。
export function checkRuntimeAvailability({ runtimeContext, settings }) {
  if (!runtimeContext?.ok) {
    return { ok: false, quizzableCount: 0, requiredCount: null, reason: runtimeContext?.reason ?? "歌詞データの読み込みに失敗しました。" };
  }
  return validateLyricsQuizAvailability(runtimeContext.songsWithLyrics ?? [], settings.questionCountValue);
}

// 1人分の全問の結果（battleRules.resolveQuestionAnswers()の返り値を出題順に並べた配列）から、
// 最終結果を組み立てる。採点方法自体はsettings.battleRuleIdで選ばれたルールに完全に委譲する。
export function createResult(questionOutcomes, settings) {
  return aggregateBattleRuleResult(settings.battleRuleId, questionOutcomes, settings);
}

// 2人分の結果を比較する。戻り値がマイナスならresultAが上位。
export function compareResults(resultA, resultB, settings) {
  return compareBattleRuleResults(settings.battleRuleId, resultA, resultB, settings);
}

// ロビー画面・ルール確認等で表示する、勝敗条件の短い案内文。
export function getRuleDescription(settings) {
  return getBattleRuleDescription(settings.battleRuleId, settings);
}

// ===== 対戦中の進行に使う窓口（battleRulesへの委譲。js/lyricsQuizMatchProgress.jsが使う） =====
//
// js/onlineBattle.js・js/onlineBattleScreen.jsが将来これらを呼ぶことで、
// js/battleRules/index.jsを直接importせずに済むようにする
// （「battleRulesを直接importするのはこのファイルだけ」という設計方針を保つため）。

// 1問分・全員の回答から、参加者ごとの結果（得点・勝者・次のコンボ数等）を導出する。
//
// 【安全性の核心（設計⑧⑨④・削除禁止）】奪い取りルールのwinner候補は、
// battleRules/stealRule.js側で必ず「実際に正解していたか」を再照合してから
// wonQuestion判定に使う。winner claimは「サーバーで最初に確定した人物」の情報でしかなく、
// 「本当に正解していたこと」を保証しないため、この検算はFirebase結線後も
// 絶対に削除しないこと（stealRule.test.jsの「安全性の核心」テストで継続的に確認する）。
export function resolveQuestionAnswers(settings, context) {
  return resolveBattleRuleQuestionAnswers(settings.battleRuleId, context);
}

// その問題が終了条件を満たしたかどうかを判定する。
export function shouldEndQuestion(settings, context) {
  return shouldEndBattleRuleQuestion(settings.battleRuleId, context);
}

// ルーム作成画面の「対戦ルール選択」UIが、選べるルール一覧を表示するために使う
// （設計⑥1.5章：UIはルール名を知らず、この配列を描画するだけでよい）。
export function listAvailableBattleRulesForSettings() {
  return listAvailableBattleRules();
}

// 【Phase6新設】ロビー画面でホストが対戦ルールを切り替えたときに使う。新しいルールの
// battleRuleVersion・ルール固有設定（hintIntervalSec等）の既定値をまとめて組み立てる。
// songPool・questionCountValue・answerPoolSizeValueは呼び出し元がその場の値を引き継ぐため、
// ここには含めない（ルールを切り替えても、選んでいた曲や出題数まで勝手にリセットしないため）。
export function createDefaultSettingsForRule(ruleId) {
  return {
    battleRuleId: ruleId,
    battleRuleVersion: getBattleRuleVersion(ruleId),
    ...createDefaultBattleRuleSettings(ruleId),
  };
}

// 【Phase6.5新設】画面層が回答を送信する際、battleRuleIdの文字列分岐なしで
// 「回答ログだけでよいか、勝者claimも一緒に送るべきか」を決められるようにする窓口
// （js/battleRules/index.jsのgetAnswerSubmissionPlan()参照）。
export function getAnswerSubmissionPlan(settings, context) {
  return getBattleRuleAnswerSubmissionPlan(settings.battleRuleId, context);
}

// 【Phase6.5新設】対戦中HUDの「現在倍率」等、ルール固有のライブ計算を
// battleRuleIdの文字列分岐なしで呼べるようにする窓口。対応するルールが無ければnull。
export function getComboMultiplierForCount(settings, comboCount) {
  return getBattleRuleComboMultiplierForCount(settings.battleRuleId, comboCount);
}
