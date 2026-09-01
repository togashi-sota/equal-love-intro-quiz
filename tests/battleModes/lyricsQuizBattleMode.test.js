// js/battleModes/lyricsQuizBattleMode.js（歌詞クイズ オンライン対戦アダプター）のテスト。
//
// 前半は基本的な契約（defaultSettings/validateSettings/ルール切り替え/ルールバージョン）の確認。
// 後半は、Firebase・画面を一切使わず、合成データだけで「複数プレイヤーの対戦を
// 最初から最後まで動かす」シミュレーションを行い、lyricsQuizBattleMode.jsが
// battleRulesへ正しく委譲できていることを確認する（フェーズ2の目標「ローカルだけで
// 3ルールを最後まで動かせる」の裏付け）。歌詞本文は一切扱わず、ダミーの曲ID・数値のみ使用。

import * as lyricsQuizBattleMode from "../../js/battleModes/lyricsQuizBattleMode.js";
import { createDefaultBattleRuleSettings, getBattleRuleVersion } from "../../js/battleRules/index.js";
import { createDefaultSettingsForRule } from "../../js/battleModes/lyricsQuizBattleMode.js";
import { QUESTION_SOURCE_TYPE } from "../../js/questionSource.js";
import { SONGS } from "../../js/data/songs.js";
import { assertEqual } from "../test-utils.js";

// 【重要】js/questionSource.jsのresolveSongPool()は、実在するjs/data/songs.jsの曲だけに
// 絞り込む（sanitizeSongIds）ため、Phase2時点のテストで使っていた"song-1"のような
// 架空のIDはMANUAL_SELECTION経由では全て除外されて空配列になる。
// そのため、「曲プールがある」ケースはALL_SONGS（実在の全曲、必ず非空）を、
// 「曲プールが空」ケースは架空のIDのMANUAL_SELECTION（sanitize後に必ず空になる）を使う。
const ALL_SONGS_SOURCE = { type: QUESTION_SOURCE_TYPE.ALL_SONGS };
const EMPTY_SOURCE = { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ["song-1", "song-2"] };
// 曲数不足の検証用に、実在する曲を少数だけ選ぶ（本物のSONGSデータに依存するが、
// 81曲中2曲を選ぶだけなので、今後曲が増減しても壊れにくい）。
function realManualSource(count) {
  return { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: SONGS.slice(0, count).map((song) => song.id) };
}

// settings.battleRuleIdを切り替えるたびに、対応するbattleRuleVersion・ルール固有設定も
// 一緒に差し替えるための補助関数（本番のロビー画面がルール選択UIで行う操作を模している）。
function withBattleRule(baseSettings, ruleId) {
  return {
    ...baseSettings,
    battleRuleId: ruleId,
    battleRuleVersion: getBattleRuleVersion(ruleId),
    ...createDefaultBattleRuleSettings(ruleId),
  };
}

// ===== ローカル対戦シミュレーションの補助関数 =====
//
// 実際のオンライン対戦（次フェーズ以降）では、Firebaseから読んだ「全員の回答事実」を
// 使ってこの流れを再現する想定。ここではFirebaseの代わりに、あらかじめ用意した
// 合成データ（questionScript）をそのまま使う。

// questionScript: {
//   correctSongId,
//   questionStartedAt,
//   answersByUid: { [uid]: { selectedSongId, hintLevel, submittedAt } },
// }[]
// 奪い取り用に、各問題の「勝者候補」（実際に正解した人の中で最もsubmittedAtが早い人）を
// 自動計算する（Firebaseのwrite-once＝サーバーが最初に受理した書き込みが勝つ、という
// 挙動を、テスト用に単純化してシミュレートしている）。
function computeSimulatedWinner(question) {
  let winner = null;
  for (const [uid, answer] of Object.entries(question.answersByUid)) {
    if (answer.selectedSongId !== question.correctSongId) continue;
    if (!winner || answer.submittedAt < winner.submittedAt) {
      winner = { uid, submittedAt: answer.submittedAt };
    }
  }
  return winner;
}

// settings・questionScriptから、全プレイヤー分の最終結果（ruleId経由でcompareResults可能な形）
// を組み立てる。lyricsQuizBattleMode.resolveQuestionAnswers()・createResult()を実際に
// 順番に呼び出す、対戦の進行そのものを再現するシミュレーション。
function runLocalMatchSimulation(settings, questionScript) {
  const allPlayerUids = Object.keys(questionScript[0].answersByUid);
  const historyByUid = Object.fromEntries(allPlayerUids.map((uid) => [uid, []]));
  const comboCountByUid = Object.fromEntries(allPlayerUids.map((uid) => [uid, 0]));

  for (const question of questionScript) {
    const winner = computeSimulatedWinner(question);
    const context = {
      answersByUid: question.answersByUid,
      correctSongId: question.correctSongId,
      winner,
      comboCountByUid,
      questionStartedAt: question.questionStartedAt,
      settings,
    };

    // 「全員が回答済みなら終了する」という条件が、実際にこの合成データでも
    // 正しく成り立つことを確認する（オーケストレーションが正しく1問ずつ進む裏付け）。
    const ended = lyricsQuizBattleMode.shouldEndQuestion(settings, {
      ...context,
      allPlayerUids,
      nowMs: question.questionStartedAt + 1,
    });
    if (!ended) {
      throw new Error("シミュレーション用データが不正です（全員回答済みなのに終了判定されませんでした）");
    }

    const outcomesByUid = lyricsQuizBattleMode.resolveQuestionAnswers(settings, context);
    for (const uid of allPlayerUids) {
      historyByUid[uid].push(outcomesByUid[uid]);
      comboCountByUid[uid] = outcomesByUid[uid].nextComboCount;
    }
  }

  const resultsByUid = Object.fromEntries(
    allPlayerUids.map((uid) => [uid, lyricsQuizBattleMode.createResult(historyByUid[uid], settings)])
  );
  const ranking = [...allPlayerUids].sort((uidA, uidB) =>
    lyricsQuizBattleMode.compareResults(resultsByUid[uidA], resultsByUid[uidB], settings)
  );
  return { resultsByUid, ranking };
}

export async function runLyricsQuizBattleModeTests() {
  // ===== defaultSettings / validateSettings / ルール切り替え・バージョン =====
  {
    const settings = lyricsQuizBattleMode.defaultSettings();
    assertEqual(settings.battleRuleId, "classic", "既定のルールはクラシック");
    assertEqual(
      settings.battleRuleVersion,
      getBattleRuleVersion("classic"),
      "既定のbattleRuleVersionは、現在のclassicRuleのバージョンと一致している"
    );
    assertEqual(
      lyricsQuizBattleMode.validateSettings({ ...settings, questionSource: ALL_SONGS_SOURCE }),
      null,
      "曲プールがあれば妥当な設定"
    );
    assertEqual(
      lyricsQuizBattleMode.validateSettings({ ...settings, questionSource: EMPTY_SOURCE }),
      "出題対象の曲が選ばれていません。",
      "曲プールが空（架空のIDはsanitizeSongIdsで除外される）ならエラー"
    );
    assertEqual(
      lyricsQuizBattleMode.validateSettings({ ...settings, questionSource: ALL_SONGS_SOURCE, battleRuleId: "unknown" }),
      "対戦ルールが不正です。",
      "未登録のbattleRuleIdならエラー"
    );
    assertEqual(
      lyricsQuizBattleMode.validateSettings({ ...settings, questionSource: ALL_SONGS_SOURCE, battleRuleVersion: 999 }),
      "対戦ルールのバージョンが一致しません。アプリを更新してください。",
      "battleRuleVersionが現在の実装と食い違っていればエラー（本人指示どおり、未知のバージョンでは開始を拒否する）"
    );

    // 【Phase6.5新設】曲プール自体は非空だが、questionCountValueに対して曲数が足りない場合。
    assertEqual(
      lyricsQuizBattleMode.validateSettings({ ...settings, questionSource: realManualSource(2), questionCountValue: "10" }),
      "出題対象の曲が足りません（10曲必要ですが、2曲しかありません）。",
      "実在する曲を選んでいても、questionCountValueに対して数が足りなければエラー"
    );
    assertEqual(
      lyricsQuizBattleMode.validateSettings({ ...settings, questionSource: realManualSource(2), questionCountValue: "all" }),
      null,
      "questionCountValueが「全曲」なら、曲プールの曲数がそのまま出題数になるためエラーにならない"
    );

    // ルール切り替え：3ルールすべてに切り替えて、それぞれ妥当な設定になることを確認する。
    for (const ruleId of ["classic", "steal", "combo"]) {
      const switched = { ...withBattleRule(settings, ruleId), questionSource: ALL_SONGS_SOURCE };
      assertEqual(
        lyricsQuizBattleMode.validateSettings(switched),
        null,
        `battleRuleIdを${ruleId}へ切り替えても妥当な設定になる`
      );
      assertEqual(
        typeof lyricsQuizBattleMode.getRuleDescription(switched) === "string" &&
          lyricsQuizBattleMode.getRuleDescription(switched).length > 0,
        true,
        `${ruleId}のルール説明文が空でない`
      );
    }
  }

  // ===== Overtureの除外（2026-08-08追加） =====
  // オンライン歌詞クイズ対戦でも、Overture（インストゥルメンタル曲）を出題対象曲数・
  // 歌詞データ読込対象から除外できているかを確認する。歌詞本文には一切触れない。
  // 【2026-09-16追記】defaultSettings()のcategoryFilterValueが既定で"title-track"に
  // なったため、ここでは明示的に"all"（全曲）へ上書きし、以前と同じ「全曲からOvertureだけ
  // 除いた数」を検証する（categoryFilterValue自体のテストは別ブロックで行う）。
  {
    const settings = {
      ...lyricsQuizBattleMode.defaultSettings(),
      questionSource: ALL_SONGS_SOURCE,
      categoryFilterValue: "all",
    };
    assertEqual(
      lyricsQuizBattleMode.validateSettings({ ...settings, questionCountValue: String(SONGS.length - 1) }),
      null,
      "全曲からOvertureを除いた曲数ちょうどをquestionCountValueに指定すれば妥当な設定になる"
    );
    assertEqual(
      lyricsQuizBattleMode.validateSettings({ ...settings, questionCountValue: String(SONGS.length) })
        ?.includes(`${SONGS.length - 1}曲しかありません`),
      true,
      "全曲数ぴったりをquestionCountValueに指定すると、Overtureを除いた数（全曲数-1）しかないためエラーになる"
    );
  }

  // ===== prepareRuntimeContext（Overtureの除外） =====
  {
    const runtimeContext = await lyricsQuizBattleMode.prepareRuntimeContext({
      settings: { ...lyricsQuizBattleMode.defaultSettings(), questionSource: ALL_SONGS_SOURCE },
    });
    assertEqual(runtimeContext.ok, true, "IndexedDBが使えない環境でも例外を投げず準備できる");
    assertEqual(
      runtimeContext.songPool.includes("overture"),
      false,
      "prepareRuntimeContext()が組み立てるsongPoolにOvertureが含まれない"
    );
  }

  // ===== listAvailableBattleRulesForSettings：UI一覧生成の土台 =====
  {
    const rules = lyricsQuizBattleMode.listAvailableBattleRulesForSettings();
    assertEqual(rules.length, 3, "選べるルールが3つ揃っている");
    assertEqual(
      rules.every(
        (rule) => Array.isArray(rule.settingsFields) && Array.isArray(rule.hudFields) && Array.isArray(rule.resultColumns)
      ),
      true,
      "各ルールがUI自動生成用の宣言（settingsFields/hudFields/resultColumns）を持っている"
    );
  }

  // ===== prepareRuntimeContext / buildQuestions：settingsとruntimeContextの分離 =====
  {
    // 歌詞データの読み込みに失敗した（runtimeContext.ok===false）場合、buildQuestionsは
    // 例外を投げず、安全に空配列を返すことを確認する。
    const questions = lyricsQuizBattleMode.buildQuestions({
      seed: 1,
      settings: { ...lyricsQuizBattleMode.defaultSettings(), questionSource: ALL_SONGS_SOURCE },
      runtimeContext: { ok: false, songsWithLyrics: [] },
    });
    assertEqual(questions, [], "runtimeContextが未準備（ok:false）ならbuildQuestionsは空配列を返す");

    // settings自体には歌詞データを持たせない契約になっていることを確認する
    // （defaultSettings()の戻り値にsongsWithLyrics相当のキーが無いこと）。
    const settings = lyricsQuizBattleMode.defaultSettings();
    assertEqual(
      "songsWithLyrics" in settings,
      false,
      "defaultSettings()の戻り値（Firebase同期想定）に歌詞データを持つフィールドが無い"
    );
    assertEqual(
      settings.questionSource,
      { type: "allSongs" },
      "【Phase6.5】defaultSettings()のquestionSourceは既定でALL_SONGS（js/questionSource.jsと同じ土台を使う）"
    );
  }

  // ===== checkRuntimeAvailability（Phase6.5新設） =====
  {
    assertEqual(
      lyricsQuizBattleMode.checkRuntimeAvailability({ runtimeContext: { ok: false, reason: "テスト用の失敗" }, settings: lyricsQuizBattleMode.defaultSettings() }),
      { ok: false, quizzableCount: 0, requiredCount: null, reason: "テスト用の失敗" },
      "runtimeContextの準備自体に失敗していれば、そのままng・理由を返す"
    );

    const settings = { ...lyricsQuizBattleMode.defaultSettings(), questionCountValue: "5" };
    const songsWithLyrics = [
      { song: { id: "a" }, lines: [{ line: 1, text: "とても長い歌詞の1行目です" }] },
      { song: { id: "b" }, lines: [{ line: 1, text: "とても長い歌詞の2行目です" }] },
    ];
    const result = lyricsQuizBattleMode.checkRuntimeAvailability({ runtimeContext: { ok: true, songsWithLyrics }, settings });
    assertEqual(result.ok, false, "歌詞データが読み込まれている曲が2曲しかなければ、5問要求には足りずng");
    assertEqual(result.requiredCount, 5, "不足時はrequiredCountに要求数が入る");
  }

  // ===== getAnswerSubmissionPlan / getComboMultiplierForCount（Phase6.5新設） =====
  {
    const stealSettings = withBattleRule(lyricsQuizBattleMode.defaultSettings(), "steal");
    assertEqual(
      lyricsQuizBattleMode.getAnswerSubmissionPlan(stealSettings, { selectedSongId: "x", correctSongId: "x" }),
      { submitAnswer: true, submitWinnerClaim: true },
      "battleRuleId経由でstealRuleへ正しく委譲される"
    );
    // 【2026-08-31改訂】ポイントバトル（旧コンボ）からコンボ倍率の概念を撤廃したため、
    // battleRuleId経由で委譲されても常にnullになる。
    const comboSettings = withBattleRule(lyricsQuizBattleMode.defaultSettings(), "combo");
    assertEqual(
      lyricsQuizBattleMode.getComboMultiplierForCount(comboSettings, 3),
      null,
      "コンボ倍率の概念を撤廃したため、battleRuleId経由で委譲されても常にnull"
    );
    const classicSettings = withBattleRule(lyricsQuizBattleMode.defaultSettings(), "classic");
    assertEqual(
      lyricsQuizBattleMode.getComboMultiplierForCount(classicSettings, 3),
      null,
      "コンボの概念が無いルールではnullを返す"
    );
  }

  // ===== ローカル対戦シミュレーション：正解数バトル（正解数が多い方が上位、配点は一律1pt） =====
  {
    // 【Phase6.5補足】songPoolは、questionSource経由で解決される値のためsettingsから廃止した。
    // このシミュレーションはquestionScript（合成データ）を直接使ってresolveQuestionAnswers等を
    // 呼ぶだけで、questionSource自体は一切参照しないため、settingsに含める必要は無い。
    // 【2026-08-31改訂】正解一律1ptへ変更したため、ヒント段階（hintLevel）が違っても
    // 正解しさえすれば同じ配点になることを確認する。
    const settings = withBattleRule(lyricsQuizBattleMode.defaultSettings(), "classic");
    const questionScript = [
      {
        correctSongId: "song-1",
        questionStartedAt: 0,
        answersByUid: {
          strong: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 },
          weak: { selectedSongId: "song-1", hintLevel: 3, submittedAt: 13000 }, // ヒント3正解でも同じ1pt
        },
      },
      {
        correctSongId: "song-2",
        questionStartedAt: 30000,
        answersByUid: {
          strong: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 30500 },
          weak: { selectedSongId: "song-3", hintLevel: 2, submittedAt: 36500 },
        },
      },
    ];
    const { resultsByUid, ranking } = runLocalMatchSimulation(settings, questionScript);
    assertEqual(ranking[0], "strong", "正解数バトル：正解数が多い方が1位になる");
    assertEqual(resultsByUid.strong.detail.totalPoints, 1 + 1, "strongの合計ポイントは正解一律1pt×2問=2");
    assertEqual(resultsByUid.weak.detail.totalPoints, 1, "weakは1問目のみ正解（ヒント段階に関わらず1pt）");
    assertEqual(resultsByUid.weak.detail.missCount, 1, "weakの2問目は不正解なのでミス1");
  }

  // ===== ローカル対戦シミュレーション：早押しバトル（先に正解した人だけが得点、配点は一律1pt） =====
  {
    const settings = withBattleRule(lyricsQuizBattleMode.defaultSettings(), "steal");
    const questionScript = [
      {
        // p1がヒント1で先に正解、p2はヒント2で正解するが後着なので0点。
        correctSongId: "song-1",
        questionStartedAt: 0,
        answersByUid: {
          p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
          p2: { selectedSongId: "song-1", hintLevel: 2, submittedAt: 9000 },
        },
      },
      {
        // p1がヒント1で正解、p2は不正解。
        correctSongId: "song-2",
        questionStartedAt: 30000,
        answersByUid: {
          p1: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 30500 },
          p2: { selectedSongId: "song-3", hintLevel: 1, submittedAt: 30300 },
        },
      },
      {
        // p2がヒント1で正解、p1は不正解。
        correctSongId: "song-3",
        questionStartedAt: 60000,
        answersByUid: {
          p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 60300 },
          p2: { selectedSongId: "song-3", hintLevel: 1, submittedAt: 60300 },
        },
      },
    ];
    const { resultsByUid, ranking } = runLocalMatchSimulation(settings, questionScript);
    assertEqual(resultsByUid.p1.detail.questionsWon, 2, "p1は1・2問目を獲得");
    assertEqual(resultsByUid.p2.detail.questionsWon, 1, "p2は3問目だけ獲得");
    assertEqual(resultsByUid.p1.detail.totalPoints, 1 + 1, "p1の合計ポイントは正解一律1pt×2問=2");
    assertEqual(resultsByUid.p2.detail.totalPoints, 1, "p2の合計ポイントは1");
    assertEqual(ranking[0], "p1", "獲得数・ポイントで勝るp1が1位");
  }

  // ===== ローカル対戦シミュレーション：ポイントバトル（早いヒント段階で正解する方が上位） =====
  // 【2026-08-31改訂】コンボ（連続正解による倍率）の概念を撤廃したため、以前あった
  // 「連続正解を維持した方が上位になる」テストは、新しい「早いヒント段階で正解するほど
  // 高得点（4/3/2/1pt）・不正解でもポイントは減らない」仕様のテストへ差し替えた。
  {
    const settings = withBattleRule(lyricsQuizBattleMode.defaultSettings(), "combo");
    const correctSongIds = ["song-1", "song-2", "song-3", "song-4", "song-5"];
    const questionScript = correctSongIds.map((correctSongId, i) => ({
      correctSongId,
      questionStartedAt: i * 30000,
      answersByUid: {
        // fast：常にヒント1で正解（5問×4pt=20pt）。
        fast: { selectedSongId: correctSongId, hintLevel: 1, submittedAt: i * 30000 + 500 },
        // slow：常にヒント4まで開いてから正解（5問×1pt=5pt）だが、不正解は一度も無い。
        slow: { selectedSongId: correctSongId, hintLevel: 4, submittedAt: i * 30000 + 500 },
      },
    }));
    const { resultsByUid, ranking } = runLocalMatchSimulation(settings, questionScript);
    assertEqual(resultsByUid.fast.detail.totalPoints, 4 * 5, "fastは常にヒント1正解のため合計20pt");
    assertEqual(resultsByUid.slow.detail.totalPoints, 1 * 5, "slowは常にヒント4正解のため合計5pt");
    assertEqual(ranking[0], "fast", "ポイントバトル：早いヒント段階で正解し続けた方が1位になる");

    // 不正解を挟んでも、それまでのポイントは減らないことを確認する。
    const withMissScript = [
      { correctSongId: "song-1", questionStartedAt: 0, answersByUid: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 } } },
      { correctSongId: "song-2", questionStartedAt: 30000, answersByUid: { p1: { selectedSongId: "wrong-song", hintLevel: 1, submittedAt: 30500 } } },
      { correctSongId: "song-3", questionStartedAt: 60000, answersByUid: { p1: { selectedSongId: "song-3", hintLevel: 3, submittedAt: 60500 } } },
    ];
    const { resultsByUid: missResults } = runLocalMatchSimulation(settings, withMissScript);
    assertEqual(missResults.p1.detail.totalPoints, 4 + 0 + 2, "不正解でポイントが減ることなく、4pt+0pt+2pt=6ptで合計される");
  }

  // ===== validateSettings：共同選曲(collaborativeSelection)の0曲は保存自体をエラーにしない
  // （2026-08-27新設。js/battleModes/timeAttackBattleMode.test.jsの同じ追記と同じ理由） =====
  {
    const settings = {
      ...lyricsQuizBattleMode.defaultSettings(),
      questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: [] },
    };
    assertEqual(
      lyricsQuizBattleMode.validateSettings(settings),
      null,
      "歌詞クイズ対戦でも、共同選曲が0曲なら設定の保存自体はエラーにならない"
    );
  }

  // ===== resolveSettingsSongPool / resolveAllEligibleSongIds / availabilityKind（2026-08-27新設） =====
  // オンライン対戦の共通曲（intersection）判定〈js/onlineBattleSongAvailability.js〉が、
  // 歌詞クイズ対戦にも対応できるようにするための窓口。
  {
    assertEqual(
      lyricsQuizBattleMode.availabilityKind,
      "lyrics",
      "歌詞クイズ対戦は歌詞データの所持状況（lyrics）で共通曲を判定する"
    );

    const pool = lyricsQuizBattleMode.resolveSettingsSongPool({
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ["love", "overture"] },
    });
    assertEqual(
      pool,
      ["love"],
      "resolveSettingsSongPool()はresolveLyricsQuizSongPool()と同じくOverture等の対象外曲を除く"
    );

    const allEligible = lyricsQuizBattleMode.resolveAllEligibleSongIds();
    assertEqual(allEligible.includes("overture"), false, "resolveAllEligibleSongIds()にもOvertureは含まれない");
    assertEqual(allEligible.length, SONGS.length - 1, "resolveAllEligibleSongIds()は全曲からOvertureを除いた数になる");
  }

  // ===== categoryFilterValue（2026-09-16新設・本人指示：他モードとの機能差解消） =====
  // オンライン歌詞クイズ対戦だけに無かった「カテゴリー」設定を追加した回帰テスト。
  // js/battleModes/timeAttackBattleMode.jsの「カテゴリ変更時も選択状態は保持するが
  // 出題対象外の曲は出題しない」という既存仕様（絶対に壊してはいけない）を、歌詞クイズでも
  // 同じ形で満たせているかを確認する。テストに使う曲は実在のSONGSデータから、
  // カテゴリの異なる3曲（表題曲："love"／全員曲："kioku-no-dokoka-de"／
  // ユニット曲："genneki-idol-chu"）を選んでいる。
  {
    assertEqual(
      lyricsQuizBattleMode.defaultSettings().categoryFilterValue,
      "title-track",
      "既定のカテゴリは他モードと同じ「表題曲のみ」（本人報告のバグ修正：以前はこの設定自体が無かった）"
    );

    // ----- 「全曲から出題」（ALL_SONGS）＋カテゴリ絞り込み -----
    const titleTrackPool = lyricsQuizBattleMode.resolveSettingsSongPool({
      questionSource: ALL_SONGS_SOURCE,
      categoryFilterValue: "title-track",
    });
    assertEqual(titleTrackPool.includes("love"), true, "表題曲のみ：表題曲は含まれる");
    assertEqual(titleTrackPool.includes("kioku-no-dokoka-de"), false, "表題曲のみ：全員曲は含まれない");
    assertEqual(titleTrackPool.includes("genneki-idol-chu"), false, "表題曲のみ：ユニット曲は含まれない");

    const titleAndGroupPool = lyricsQuizBattleMode.resolveSettingsSongPool({
      questionSource: ALL_SONGS_SOURCE,
      categoryFilterValue: "title-and-group",
    });
    assertEqual(titleAndGroupPool.includes("love"), true, "表題曲＋全員曲：表題曲は含まれる");
    assertEqual(titleAndGroupPool.includes("kioku-no-dokoka-de"), true, "表題曲＋全員曲：全員曲は含まれる");
    assertEqual(titleAndGroupPool.includes("genneki-idol-chu"), false, "表題曲＋全員曲：ユニット曲は含まれない");

    const allCategoryPool = lyricsQuizBattleMode.resolveSettingsSongPool({
      questionSource: ALL_SONGS_SOURCE,
      categoryFilterValue: "all",
    });
    assertEqual(allCategoryPool.includes("genneki-idol-chu"), true, "全曲：ユニット曲も含まれる");
    // 歌詞クイズ対象外の曲（Overture、カテゴリは「特別収録曲」）は、カテゴリを「全曲」に
    // 広げても既存の除外ロジックとの二重フィルタで出題対象に含まれてはならない。
    assertEqual(allCategoryPool.includes("overture"), false, "全曲でもOvertureは歌詞クイズ対象外のまま除外される");

    // ----- 共同選曲（collaborativeSelection）：カテゴリ変更時も選択状態は保持する -----
    // 【絶対に壊してはいけない既存仕様】選択済みの曲（questionSource.songIds）自体は
    // カテゴリを変えても書き換えない。出題対象から一時的に外れるだけで、カテゴリを
    // 戻せば再選択なしで復帰する。
    const collaborativeSongIds = ["love", "kioku-no-dokoka-de", "genneki-idol-chu"];
    const collaborativeSource = { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: collaborativeSongIds };

    const narrowedPool = lyricsQuizBattleMode.resolveSettingsSongPool({
      questionSource: collaborativeSource,
      categoryFilterValue: "title-track",
    });
    assertEqual(
      narrowedPool,
      ["love"],
      "共同選曲＋表題曲のみ：選択した3曲のうち表題曲だけが出題対象になる"
    );
    // resolveSettingsSongPool()の呼び出し自体は、渡したquestionSource.songIdsを書き換えない
    // （純粋関数であることの確認）。
    assertEqual(
      collaborativeSource.songIds,
      collaborativeSongIds,
      "resolveSettingsSongPool()を呼んでも、元のcollaborativeSelection.songIdsは変化しない（選択状態を破壊しない）"
    );

    // カテゴリを戻すと、選択状態（songIds）を変更していないので出題対象が復活する。
    const restoredPool = lyricsQuizBattleMode.resolveSettingsSongPool({
      questionSource: collaborativeSource,
      categoryFilterValue: "all",
    });
    assertEqual(
      restoredPool.length,
      collaborativeSongIds.length,
      "カテゴリを「全曲」へ戻すと、選択していた3曲すべてが再び出題対象に戻る（選択し直し不要）"
    );

    // ----- validateSettings：カテゴリを絞った結果、共有曲が0曲になった場合の案内文言 -----
    const zeroAfterCategorySettings = {
      ...lyricsQuizBattleMode.defaultSettings(),
      categoryFilterValue: "title-track",
      // questionCountValue: "all" ＝「曲プールの曲数がそのまま出題数」のため、カテゴリを
      // 広げたときに残る1曲だけでも妥当な設定として扱われる（このブロックの主眼は
      // 曲数の充足チェックではなく、カテゴリによる有効/無効の切り替えの確認のため）。
      questionCountValue: "all",
      questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: ["kioku-no-dokoka-de"] },
    };
    assertEqual(
      lyricsQuizBattleMode.validateSettings(zeroAfterCategorySettings),
      "現在のカテゴリ条件で有効な共有曲がありません。カテゴリを広げるか、参加者に曲を追加で選んでもらってください。",
      "選択済みの曲が現在のカテゴリ条件に1曲も合わない場合、カテゴリを広げるよう案内するエラーになる"
    );
    assertEqual(
      lyricsQuizBattleMode.validateSettings({ ...zeroAfterCategorySettings, categoryFilterValue: "title-and-group" }),
      null,
      "カテゴリを広げれば、同じ選択状態のまま再び有効な設定になる（選び直し不要）"
    );

    // ----- 3ルール（正解数バトル・早押しバトル・ポイントバトル）すべてでカテゴリ設定が
    // 効くことを確認する（本人指示：3ルール全てに追加）。 -----
    for (const ruleId of ["classic", "steal", "combo"]) {
      const settingsForRule = {
        ...withBattleRule(lyricsQuizBattleMode.defaultSettings(), ruleId),
        questionSource: ALL_SONGS_SOURCE,
        categoryFilterValue: "title-track",
        questionCountValue: "10",
      };
      assertEqual(
        lyricsQuizBattleMode.validateSettings(settingsForRule),
        null,
        `${ruleId}：表題曲のみ（23曲）でも既定の出題数10問なら開始できる`
      );
      const runtimeContext = await lyricsQuizBattleMode.prepareRuntimeContext({ settings: settingsForRule });
      assertEqual(
        runtimeContext.songPool.includes("kioku-no-dokoka-de"),
        false,
        `${ruleId}：prepareRuntimeContext()のsongPoolにも、表題曲のみのカテゴリ絞り込みが反映される`
      );
    }
  }

  // ===== createDefaultSettingsForRule（Phase6新設） =====
  {
    const comboDefaults = createDefaultSettingsForRule("combo");
    assertEqual(comboDefaults.battleRuleId, "combo", "指定したruleIdがそのまま入る");
    assertEqual(comboDefaults.battleRuleVersion, getBattleRuleVersion("combo"), "battleRuleVersionはそのルールの現在のバージョンと一致する");
    assertEqual(
      comboDefaults,
      { battleRuleId: "combo", battleRuleVersion: getBattleRuleVersion("combo"), ...createDefaultBattleRuleSettings("combo") },
      "battleRules/index.js経由の既定値と完全に一致する（songPool等は含まれない最小限の形）"
    );
    assertEqual("songPool" in comboDefaults, false, "songPool・questionCountValue・answerPoolSizeValueは含まれない（呼び出し元がその場の値を引き継ぐ設計のため）");
  }
}
