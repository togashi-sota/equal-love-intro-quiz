// js/lyricsQuizBattleCompatibility.js（歌詞クイズ オンライン対戦で「参加者全員がホストと全く同じ
// 問題を作れるか」を照合する仕組み）のテスト。
//
// 【重要・著作権】このテストで使う歌詞テキストはすべて、テストのためだけに作ったダミーの文
// （実在の楽曲の歌詞ではない）。曲IDだけは、回答候補を作るためにjs/data/songs.jsの実在IDを使う。
//
// 確認すること（本人の依頼）：
//   ・新しいホスト＋古い参加者 → 開始を止め、「アプリを更新」の案内が出る
//   ・古いホスト＋新しい参加者 → 全員「除外なし」で同じ問題になる（止めない）
//   ・全員新しい → 端末が違っても、全問のヒントの行・正解の曲IDが一致する
//   ・問題の指紋が食い違う → 検出してホストが中止できる
//   ・再接続・途中参加 → もう一度照合される
//   ・歌詞データが無い・版が違う端末 → 開始を止める（出題範囲から外れる曲なら止めない）
//   ・Firebaseへ書く値に歌詞本文が含まれない
//   ・今の本番ルールのまま、新しく書く2つの値が拒否されない

import {
  LYRICS_BATTLE_COMPAT_FORMAT_VERSION,
  LYRICS_QUESTION_ENGINE_VERSION,
  MISSING_LYRICS_MARK,
  COMPAT_PROBLEM,
  COMPAT_ROOM_MODE,
  MATCH_CHECK_STATUS,
  hashStringToHex,
  computeLyricsTablesSignature,
  computeSongCatalogSignature,
  encodeSongHashes,
  decodeSongHashes,
  buildLyricsBattleCapability,
  evaluateLyricsBattleCompatibility,
  describeCompatProblem,
  describeCompatStartBlockMessage,
  describeLyricsLobbyCompatNotices,
  resolveQuestionSettingsForHost,
  computeLyricsQuestionHash,
  buildLyricsMatchCheckPayload,
  compareLyricsMatchChecks,
  compareOwnMatchCheck,
  findFirstMismatchedQuestionIndex,
  buildLyricsMatchAbortedCheckPayload,
  describeLyricsMatchAbortNotice,
} from "../js/lyricsQuizBattleCompatibility.js";
import { LYRICS_UNIQUENESS_RULES_VERSION } from "../js/lyricsQuestionUniqueness.js";
import { computeLyricsContentHash } from "../js/lyricsSegmentEngine.js";
import { buildLyricsQuizQuestions } from "../js/lyricsQuizQuestionBuilder.js";
import { buildLyricsCoveragePayload } from "../js/lyricsQuizBattleFirebasePayloads.js";
import * as lyricsQuizBattleMode from "../js/battleModes/lyricsQuizBattleMode.js";
import { validateParticipantCompatibilityForMode } from "../js/battleModes/index.js";
import { canWriteLyricsMatchCheck, inspectPlayerSubfieldRule } from "../js/lyricsQuizBattleSecurityRules.js";
import { QUESTION_SOURCE_TYPE } from "../js/questionSource.js";
import { SONGS } from "../js/data/songs.js";
import { assertEqual } from "./test-utils.js";

// ---------- テスト用の道具（ダミー歌詞だけ） ----------

function makeLines(texts) {
  return texts.map((text, i) => ({ line: i + 1, text, start: i * 3, end: i * 3 + 2.5 }));
}

// 実在の曲ID（回答候補を作るため）。歌詞クイズ対象外（overture）は除く。
const REAL = SONGS.filter((song) => song.id !== "overture").slice(0, 8);
const POOL_IDS = REAL.slice(0, 6).map((song) => song.id); // 出題範囲
const OUTSIDE_IDS = REAL.slice(6).map((song) => song.id); // 出題範囲外
const CHECKED_IDS = REAL.map((song) => song.id);

// 曲ごとに必ず違うダミー歌詞。sharedを渡すと、全曲に同じ行を混ぜる（除外ルールが効く行）。
function dummyLyricsFor(index, { shared = true, changed = false } = {}) {
  const own = [
    `てすとのみなとにあかりがともる${index}ごう`,
    `てすとのくもをおいかけていく${index}ごう`,
    `てすとのまどにあめがふりだす${index}ごう`,
    `てすとのとけいがまわりはじめる${index}ごう`,
    `てすとのゆうやけみちをかえる${index}ごう`,
    `てすとのほしがひとつながれた${index}ごう`,
  ];
  if (changed) own[2] = `てすとのまどにゆきがふりだす${index}ごう`; // 歌詞データの版違いを再現
  const sharedLines = shared ? ["みんなでうたうきょうつうのてすとぎょう", "もうひとつのきょうつうてすとぎょう"] : [];
  return makeLines([own[0], ...sharedLines.slice(0, 1), own[1], own[2], ...sharedLines.slice(1), own[3], own[4], own[5]]);
}

// 端末1台分の歌詞データ（{ song, lines }[]）。omitIdsの曲は持っていない、changedIdsの曲は版違い。
function deviceEntries({ ids = CHECKED_IDS, omitIds = [], changedIds = [], reverse = false } = {}) {
  const entries = REAL.filter((song) => ids.includes(song.id) && !omitIds.includes(song.id)).map((song) => ({
    song,
    lines: dummyLyricsFor(REAL.indexOf(song), { changed: changedIds.includes(song.id) }),
  }));
  return reverse ? entries.reverse() : entries;
}

// 全ダミー歌詞の行（「Firebaseへ書く値に歌詞本文が無い」確認用）。
const ALL_DUMMY_TEXTS = REAL.flatMap((song, index) => [
  ...dummyLyricsFor(index).map((line) => line.text),
  ...dummyLyricsFor(index, { changed: true }).map((line) => line.text),
]);
function containsAnyLyricText(value) {
  const json = JSON.stringify(value);
  return ALL_DUMMY_TEXTS.some((text) => json.includes(text)) || json.includes("てすと") || json.includes("きょうつう");
}

function settingsFor({ legacy = false, version } = {}) {
  const settings = {
    ...lyricsQuizBattleMode.defaultSettings(),
    questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: POOL_IDS },
    questionCountValue: "5",
    answerPoolSizeValue: 4,
  };
  if (legacy) delete settings.lyricsUniquenessRulesVersion;
  if (version !== undefined) settings.lyricsUniquenessRulesVersion = version;
  return settings;
}

// 新しいアプリの参加者（capabilityを書く）。
function newPlayer(name, entries, overrides = {}) {
  const capability = { ...buildLyricsBattleCapability({ checkedSongIds: CHECKED_IDS, songsWithLyrics: entries }), ...overrides };
  return {
    name,
    lyricsCoverage: buildLyricsCoveragePayload({ availableCount: entries.length, requiredCount: POOL_IDS.length, poolHash: "p6-x", capability }),
  };
}
// 古いアプリの参加者（capabilityを書かない＝以前と同じ形のlyricsCoverage）。
function oldPlayer(name) {
  return { name, lyricsCoverage: buildLyricsCoveragePayload({ availableCount: 6, requiredCount: 6, poolHash: "p6-x" }) };
}

// 端末1台分の問題を、オンライン対戦と同じ入口（battleModeのbuildQuestions）で作る。
function buildDeviceQuestions({ seed, settings, entries }) {
  const songPool = lyricsQuizBattleMode.resolveSettingsSongPool(settings);
  const songsWithLyrics = entries.filter((entry) => songPool.includes(entry.song.id));
  return lyricsQuizBattleMode.buildQuestions({ seed, settings, runtimeContext: { ok: true, songsWithLyrics, songPool } });
}
// 古いアプリ（除外ルールを知らない）が作る問題を再現する。
function buildOldClientQuestions({ seed, settings, entries }) {
  const songPool = lyricsQuizBattleMode.resolveSettingsSongPool(settings);
  return buildLyricsQuizQuestions({
    seed,
    songsWithLyrics: entries.filter((entry) => songPool.includes(entry.song.id)),
    songPool,
    questionCountValue: settings.questionCountValue,
    answerPoolSizeValue: settings.answerPoolSizeValue,
    lyricsUniqueness: { enabled: false },
  });
}
function hintLineSignature(questions) {
  return questions.map((q) => `${q.song.id}:${q.hints.map((h) => h.startLine).join("/")}`).join("|");
}

export function runLyricsQuizBattleCompatibilityTests() {
  // ===== 基本の道具 =====
  assertEqual(hashStringToHex("abc").length, 8, "ハッシュ：8桁の16進数");
  assertEqual(hashStringToHex("abc") === hashStringToHex("abd"), false, "ハッシュ：入力が違えば値も違う");
  assertEqual(/^[0-9a-f]{8}$/.test(computeLyricsTablesSignature()), true, "一覧のハッシュ：16進数8桁");
  assertEqual(
    computeLyricsTablesSignature({ manualExclusions: { "song-x": [3] } }) === computeLyricsTablesSignature(),
    false,
    "一覧のハッシュ：手作業の一覧が1行変わるだけで値が変わる（版の上げ忘れも検出できる）"
  );
  assertEqual(
    computeSongCatalogSignature([{ id: "a", title: "A" }]) === computeSongCatalogSignature([{ id: "a", title: "A2" }]),
    false,
    "曲の一覧のハッシュ：曲名が変わると値が変わる（曲名を含む行の判定がずれるため）"
  );
  const encoded = encodeSongHashes({ "866": "1cfb14e9", "24-7": "-", abc: "00000001" });
  assertEqual(encoded, "24-7=-;866=1cfb14e9;abc=00000001", "曲ごとのハッシュ：曲ID順の1本の文字列にする（数字だけのIDも配列化しない）");
  assertEqual(decodeSongHashes(encoded), { "24-7": "-", "866": "1cfb14e9", abc: "00000001" }, "曲ごとのハッシュ：読み戻すと元に戻る");
  assertEqual(decodeSongHashes(undefined), {}, "曲ごとのハッシュ：無い場合は空（例外を投げない）");

  // ===== capability の中身（歌詞本文を含まない） =====
  const fullEntries = deviceEntries();
  const capability = buildLyricsBattleCapability({ checkedSongIds: CHECKED_IDS, songsWithLyrics: deviceEntries({ omitIds: [CHECKED_IDS[7]] }) });
  assertEqual(capability.v, LYRICS_BATTLE_COMPAT_FORMAT_VERSION, "capability：形式の版");
  assertEqual(capability.uniquenessRulesVersion, LYRICS_UNIQUENESS_RULES_VERSION, "capability：除外ルールの版");
  assertEqual(capability.engineVersion, LYRICS_QUESTION_ENGINE_VERSION, "capability：問題の作り方の版");
  assertEqual(decodeSongHashes(capability.songHashes)[CHECKED_IDS[7]], MISSING_LYRICS_MARK, "capability：歌詞が無い曲は「-」");
  assertEqual(
    decodeSongHashes(capability.songHashes)[CHECKED_IDS[0]],
    computeLyricsContentHash(fullEntries[0].lines),
    "capability：歌詞がある曲は内容ハッシュ（事前一覧と同じ計算式）"
  );
  assertEqual(containsAnyLyricText(capability), false, "capability：歌詞本文（ダミー）の文字列を一切含まない");
  assertEqual(
    Object.keys(capability).sort(),
    ["catalogSignature", "engineVersion", "songHashes", "tablesSignature", "uniquenessRulesVersion", "v"],
    "capability：決まったフィールドだけ"
  );
  const coverageWithCapability = buildLyricsCoveragePayload({ availableCount: 6, requiredCount: 6, poolHash: "p6-x", capability });
  assertEqual(coverageWithCapability.capability, capability, "lyricsCoverage：capabilityを一緒に書く");
  assertEqual(
    Object.keys(buildLyricsCoveragePayload({ availableCount: 6, requiredCount: 6, poolHash: "p6-x" })),
    ["availableCount", "requiredCount", "complete", "poolHash"],
    "lyricsCoverage：capabilityを渡さなければ従来（古いアプリ）と全く同じ形"
  );

  const unique = settingsFor();
  const legacy = settingsFor({ legacy: true });
  const HOST = "host-uid";

  // ===== 全員が新しいアプリ → 同じ問題 =====
  {
    const players = {
      [HOST]: newPlayer("ホスト", deviceEntries()),
      "p-a": newPlayer("Aさん", deviceEntries({ reverse: true })), // 読み込み順が違う端末
      "p-b": newPlayer("Bさん", deviceEntries({ omitIds: OUTSIDE_IDS })), // 出題範囲外の曲を持っていない端末
    };
    const evaluation = evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players });
    assertEqual(evaluation.ok, true, "全員新しい：照合OK（読み込み順・出題範囲外の曲の有無は関係ない）");
    assertEqual(evaluation.mode, COMPAT_ROOM_MODE.UNIQUE, "全員新しい：除外ありの部屋");
    assertEqual(lyricsQuizBattleMode.validateParticipantCompatibility({ settings: unique, players, hostUid: HOST }), null, "全員新しい：開始を止めない");

    let identical = true;
    let answerIdsIdentical = true;
    let sharedLineUsedAsHint = false;
    for (let seed = 1; seed <= 40; seed++) {
      const hostQ = buildDeviceQuestions({ seed, settings: unique, entries: deviceEntries() });
      const aQ = buildDeviceQuestions({ seed, settings: unique, entries: deviceEntries({ reverse: true }) });
      const bQ = buildDeviceQuestions({ seed, settings: unique, entries: deviceEntries({ omitIds: OUTSIDE_IDS }) });
      const hostCheck = buildLyricsMatchCheckPayload({ matchId: `m${seed}`, questions: hostQ });
      if (
        buildLyricsMatchCheckPayload({ matchId: `m${seed}`, questions: aQ }).fingerprint !== hostCheck.fingerprint ||
        buildLyricsMatchCheckPayload({ matchId: `m${seed}`, questions: bQ }).fingerprint !== hostCheck.fingerprint ||
        hintLineSignature(aQ) !== hintLineSignature(hostQ)
      ) {
        identical = false;
      }
      const ids = (qs) => qs.map((q) => `${q.song.id}>${q.answerPool.map((s) => s.id).join(",")}`).join("|");
      if (ids(aQ) !== ids(hostQ) || ids(bQ) !== ids(hostQ)) answerIdsIdentical = false;
      // 全曲に共通するダミー行（2行目・5行目）は、除外ルールによりヒントに出ない
      if (hostQ.some((q) => q.hints.some((h) => h.startLine === 2 || h.startLine === 5))) sharedLineUsedAsHint = true;
    }
    assertEqual(identical, true, "全員新しい：40通りのseedで、3台のヒントの行・指紋がすべて一致");
    assertEqual(answerIdsIdentical, true, "全員新しい：正解の曲IDと回答候補の曲ID（並び順も）が一致");
    assertEqual(sharedLineUsedAsHint, false, "全員新しい：他の曲と共通の行はヒントに出ない（除外ルールが効いている）");

    // 読み込み順の違いを、battleModeの入口でそろえていることの確認（そろえないと出題される曲がずれる）
    let orderMatters = false;
    for (let seed = 1; seed <= 20 && !orderMatters; seed++) {
      const build = (entries) =>
        buildLyricsQuizQuestions({ seed, songsWithLyrics: entries, songPool: POOL_IDS, questionCountValue: "5", answerPoolSizeValue: 4 })
          .map((q) => q.song.id)
          .join(",");
      orderMatters = build(deviceEntries({ ids: POOL_IDS })) !== build(deviceEntries({ ids: POOL_IDS, reverse: true }));
    }
    assertEqual(orderMatters, true, "全員新しい：並び順をそろえないと出題曲がずれる（battleModeの入口でそろえる理由の確認）");
  }

  // ===== 新しいホスト＋古い参加者 → 開始を止める =====
  {
    const players = { [HOST]: newPlayer("ホスト", deviceEntries()), "p-old": oldPlayer("古端末さん") };
    const evaluation = evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players });
    assertEqual(evaluation.ok, false, "新ホスト×旧参加者：照合NG");
    assertEqual(evaluation.problems, [{ uid: "p-old", kind: COMPAT_PROBLEM.OUTDATED_APP, count: 0 }], "新ホスト×旧参加者：古いアプリとして検出（capabilityが無い）");
    const message = lyricsQuizBattleMode.validateParticipantCompatibility({ settings: unique, players, hostUid: HOST });
    assertEqual(typeof message === "string" && message.includes("古端末さん") && message.includes("アプリを更新"), true, "新ホスト×旧参加者：ホストの画面に名前と「アプリを更新」の案内");
    assertEqual(validateParticipantCompatibilityForMode("lyricsQuiz", { settings: unique, players, hostUid: HOST }), message, "開始前チェックの窓口（battleModes/index.js）経由でも同じ文言");
    assertEqual(validateParticipantCompatibilityForMode("timeAttack", { settings: unique, players, hostUid: HOST }), null, "歌詞クイズ以外のモードには影響しない");

    // 問題が実際にずれることの確認（このチェックが無いと不公平になる）
    let differs = false;
    for (let seed = 1; seed <= 20 && !differs; seed++) {
      differs =
        hintLineSignature(buildDeviceQuestions({ seed, settings: unique, entries: deviceEntries() })) !==
        hintLineSignature(buildOldClientQuestions({ seed, settings: unique, entries: deviceEntries() }));
    }
    assertEqual(differs, true, "新ホスト×旧参加者：止めなければヒントの行が実際にずれる（このテストが意味を持つことの確認）");

    // 参加者側（新しいアプリ）の画面：古い人の名前つきで案内
    const notices = describeLyricsLobbyCompatNotices({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players, viewerUid: HOST, displayNameByUid: { [HOST]: "ホスト", "p-old": "古端末さん" } });
    assertEqual(notices.length, 1, "ロビー：古い参加者の案内が1件");
  }

  // ===== 古いホスト（設定に版が無い）＋新しい参加者 → 全員「除外なし」で一致 =====
  {
    assertEqual(lyricsQuizBattleMode.resolveLyricsUniquenessForSettings(legacy).lyricsUniqueness.enabled, false, "旧ホスト：新しい端末は除外しない");
    let identical = true;
    for (let seed = 1; seed <= 30; seed++) {
      const oldHostQ = buildOldClientQuestions({ seed, settings: legacy, entries: deviceEntries() });
      const newQ = buildDeviceQuestions({ seed, settings: legacy, entries: deviceEntries({ reverse: true }) });
      if (buildLyricsMatchCheckPayload({ matchId: "m", questions: oldHostQ }).fingerprint !== buildLyricsMatchCheckPayload({ matchId: "m", questions: newQ }).fingerprint) {
        identical = false;
      }
    }
    assertEqual(identical, true, "旧ホスト×新参加者：30通りのseedで、古いアプリと新しいアプリの問題が完全に一致");
    const players = { [HOST]: oldPlayer("旧ホスト"), "p-a": newPlayer("Aさん", deviceEntries()), "p-b": oldPlayer("旧Bさん") };
    const evaluation = evaluateLyricsBattleCompatibility({ settings: legacy, songPool: POOL_IDS, hostUid: HOST, players });
    assertEqual(evaluation.ok, true, "旧ホストの部屋：古い参加者がいても止めない（全員が除外なしで同じ問題を作れる）");
    assertEqual(evaluation.unverified, true, "旧ホストの部屋：ホストとの照合はできない（unverified）");
    const notices = describeLyricsLobbyCompatNotices({ settings: legacy, songPool: POOL_IDS, hostUid: HOST, players, viewerUid: "p-a" });
    assertEqual(notices.length === 1 && notices[0].includes("ホストのアプリが古い"), true, "旧ホストの部屋：新しい参加者に「確かめられない」案内");
    assertEqual(describeLyricsLobbyCompatNotices({ settings: legacy, songPool: POOL_IDS, hostUid: HOST, players, viewerUid: HOST }).length, 0, "旧ホストの部屋：ホスト本人には出さない");
  }

  // ===== 新しいホストが作った古い形式の部屋（版なし）＋古い参加者 → 止めない =====
  {
    const players = { [HOST]: newPlayer("ホスト", deviceEntries()), "p-old": oldPlayer("古端末さん"), "p-a": newPlayer("Aさん", deviceEntries()) };
    assertEqual(evaluateLyricsBattleCompatibility({ settings: legacy, songPool: POOL_IDS, hostUid: HOST, players }).ok, true, "版なしの部屋：古い参加者がいても全員除外なしで一致するので止めない");
    const changedPlayers = { ...players, "p-a": newPlayer("Aさん", deviceEntries({ changedIds: [POOL_IDS[0]] })) };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: legacy, songPool: POOL_IDS, hostUid: HOST, players: changedPlayers }).problems.map((p) => p.kind),
      [COMPAT_PROBLEM.LYRICS_MISMATCH],
      "版なしの部屋でも、新しいアプリどうしの歌詞データの版違いは止める"
    );
  }

  // ===== 歌詞データが無い・版が違う =====
  {
    const missing = { [HOST]: newPlayer("ホスト", deviceEntries()), "p-a": newPlayer("Aさん", deviceEntries({ omitIds: [POOL_IDS[2]] })) };
    const evaluation = evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: missing });
    assertEqual(evaluation.problems, [{ uid: "p-a", kind: COMPAT_PROBLEM.MISSING_LYRICS, count: 1 }], "歌詞が無い：出題範囲の曲が1曲無い参加者を検出");
    let differs = false;
    for (let seed = 1; seed <= 10 && !differs; seed++) {
      differs =
        buildLyricsMatchCheckPayload({ matchId: "m", questions: buildDeviceQuestions({ seed, settings: unique, entries: deviceEntries() }) }).fingerprint !==
        buildLyricsMatchCheckPayload({ matchId: "m", questions: buildDeviceQuestions({ seed, settings: unique, entries: deviceEntries({ omitIds: [POOL_IDS[2]] }) }) }).fingerprint;
    }
    assertEqual(differs, true, "歌詞が無い：止めなければ出題される曲そのものがずれる（確認）");
    const narrowedPool = POOL_IDS.filter((id) => id !== POOL_IDS[2]);
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: narrowedPool, hostUid: HOST, players: missing }).ok,
      true,
      "歌詞が無い：共通曲への絞り込みでその曲が出題範囲から外れれば止めない"
    );
    const hostMissing = { [HOST]: newPlayer("ホスト", deviceEntries({ omitIds: [POOL_IDS[1]] })), "p-a": newPlayer("Aさん", deviceEntries()) };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: hostMissing }).problems,
      [{ uid: HOST, kind: COMPAT_PROBLEM.MISSING_LYRICS, count: 1 }],
      "歌詞が無い：ホスト側に無い場合もホストの問題として検出"
    );
    const bothMissing = { [HOST]: newPlayer("ホスト", deviceEntries({ omitIds: [POOL_IDS[1]] })), "p-a": newPlayer("Aさん", deviceEntries({ omitIds: [POOL_IDS[1]] })) };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: bothMissing }).ok,
      true,
      "歌詞が無い：全員が同じ曲を持っていない場合は、全員同じ入力なので止めない"
    );
    const changed = { [HOST]: newPlayer("ホスト", deviceEntries()), "p-a": newPlayer("Aさん", deviceEntries({ changedIds: [POOL_IDS[0], POOL_IDS[3]] })) };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: changed }).problems,
      [{ uid: "p-a", kind: COMPAT_PROBLEM.LYRICS_MISMATCH, count: 2 }],
      "歌詞データの版違い：内容が違う曲の数つきで検出"
    );
    const message = describeCompatProblem({ uid: "p-a", kind: COMPAT_PROBLEM.LYRICS_MISMATCH, count: 2 }, { displayNameByUid: { "p-a": "Aさん" }, viewerUid: HOST, hostUid: HOST });
    assertEqual(message.includes("Aさん") && message.includes("2曲"), true, "歌詞データの版違い：名前と曲数を案内");
    assertEqual(containsAnyLyricText(message), false, "案内文に歌詞本文を含まない");
  }

  // ===== 版の違い =====
  {
    const base = { [HOST]: newPlayer("ホスト", deviceEntries()) };
    const older = { ...base, "p-a": newPlayer("Aさん", deviceEntries(), { uniquenessRulesVersion: LYRICS_UNIQUENESS_RULES_VERSION - 1 }) };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: older }).problems.map((p) => p.kind),
      [COMPAT_PROBLEM.OUTDATED_APP],
      "版：除外ルールの版が低い参加者は「古いアプリ」"
    );
    const newer = { ...base, "p-a": newPlayer("Aさん", deviceEntries(), { uniquenessRulesVersion: LYRICS_UNIQUENESS_RULES_VERSION + 1 }) };
    const newerEval = evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: newer });
    assertEqual(newerEval.problems.map((p) => p.kind), [COMPAT_PROBLEM.HOST_APP_OUTDATED], "版：参加者の方が新しい場合は「ホストが古い」");
    const hostView = describeCompatStartBlockMessage(newerEval, { displayNameByUid: { "p-a": "Aさん" }, viewerUid: HOST, hostUid: HOST });
    assertEqual(hostView.includes("あなた（ホスト）のアプリ") && hostView.includes("アプリを更新してください"), true, "版：ホストの画面に「アプリを更新してください」");
    const participantView = describeCompatProblem(newerEval.problems[0], { displayNameByUid: { "p-a": "Aさん" }, viewerUid: "p-a", hostUid: HOST });
    assertEqual(participantView.includes("ホストのアプリが"), true, "版：新しい参加者の画面には「ホストのアプリが古い」");
    const engine = { ...base, "p-a": newPlayer("Aさん", deviceEntries(), { engineVersion: LYRICS_QUESTION_ENGINE_VERSION - 1 }) };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: engine }).problems.map((p) => p.kind),
      [COMPAT_PROBLEM.OUTDATED_APP],
      "版：問題の作り方の版が低い参加者も「古いアプリ」"
    );
    const tables = { ...base, "p-a": newPlayer("Aさん", deviceEntries(), { tablesSignature: "00000000" }) };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: tables }).problems.map((p) => p.kind),
      [COMPAT_PROBLEM.VERSION_MISMATCH],
      "版：番号は同じでも一覧の中身が違えば「版が一致しない」"
    );
    const catalog = { ...base, "p-a": newPlayer("Aさん", deviceEntries(), { catalogSignature: "00000000" }) };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: catalog }).problems.map((p) => p.kind),
      [COMPAT_PROBLEM.VERSION_MISMATCH],
      "版：曲の一覧が違えば「版が一致しない」"
    );
    const selfView = describeCompatProblem({ uid: "p-a", kind: COMPAT_PROBLEM.OUTDATED_APP, count: 0 }, { viewerUid: "p-a", hostUid: HOST });
    assertEqual(selfView.startsWith("あなたのアプリが古い") && selfView.includes("アプリを更新してください"), true, "版：古い本人の画面には「アプリを更新してください」");
  }

  // ===== 確認中（途中参加・入り直し直後） =====
  {
    const joining = { [HOST]: newPlayer("ホスト", deviceEntries()), "p-new": { name: "途中さん" } };
    const evaluation = evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: joining });
    assertEqual(evaluation.problems.map((p) => p.kind), [COMPAT_PROBLEM.CHECKING], "途中参加：まだlyricsCoverageを書いていない人は「確認中」で止める");
    assertEqual(
      describeLyricsLobbyCompatNotices({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: joining, viewerUid: HOST }).length,
      0,
      "途中参加：「確認中」はロビーの案内には出さない（ちらつき防止。開始を押したときに理由として出る）"
    );
    const lateOld = { ...joining, "p-new": oldPlayer("途中さん") };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: lateOld }).problems.map((p) => p.kind),
      [COMPAT_PROBLEM.OUTDATED_APP],
      "途中参加：古いアプリで入ってきた人は、開始時の再照合で止める"
    );
    const narrowCheck = { [HOST]: newPlayer("ホスト", deviceEntries()), "p-a": { name: "Aさん", lyricsCoverage: buildLyricsCoveragePayload({ availableCount: 6, requiredCount: 6, poolHash: "x", capability: buildLyricsBattleCapability({ checkedSongIds: POOL_IDS.slice(0, 3), songsWithLyrics: deviceEntries() }) }) } };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: narrowCheck }).problems.map((p) => p.kind),
      [COMPAT_PROBLEM.CHECKING],
      "確認していない曲が出題範囲にある場合は「確認中」（一致しているとはみなさない）"
    );
    const hostChecking = { [HOST]: { name: "ホスト" }, "p-a": newPlayer("Aさん", deviceEntries()) };
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: hostChecking }).problems,
      [{ uid: HOST, kind: COMPAT_PROBLEM.CHECKING, count: 0 }],
      "ホスト自身の確認がまだなら「確認中」で止める"
    );
  }

  // ===== ホストが古いアプリへ交代した部屋 =====
  // 【2026-10-28改訂】古いホストには v382以前（除外しない）と v383（公開版・除外する）があり、
  // Firebaseへ書く値が同じで見分けられない。以前は「除外なし」に合わせていたが、それでは v383 のホストと
  // 必ずずれていた。今は部屋の設定のまま（v383と同じ）で作り、ロビーでは準備完了にできなくする
  // （詳しくは tests/lyricsBattlePerfMatrix.test.js の版の対応表）。
  {
    const hostOld = { [HOST]: oldPlayer("旧ホスト"), "p-a": newPlayer("Aさん", deviceEntries()) };
    const followed = resolveQuestionSettingsForHost({ settings: unique, hostUid: HOST, players: hostOld });
    assertEqual(followed, unique, "ホスト交代：古いホストでも部屋の設定のまま（v383のホストと同じ「除外あり」）");
    assertEqual(
      evaluateLyricsBattleCompatibility({ settings: unique, songPool: POOL_IDS, hostUid: HOST, players: hostOld }).problems.map((p) => p.kind),
      [COMPAT_PROBLEM.HOST_UNVERIFIABLE],
      "ホスト交代：古いホストは「確かめられない」として扱う（v382以前かv383か見分けられない）"
    );
    const hostNew = { [HOST]: newPlayer("ホスト", deviceEntries()) };
    assertEqual(resolveQuestionSettingsForHost({ settings: unique, hostUid: HOST, players: hostNew }), unique, "ホスト交代：新しいホストなら設定はそのまま");
    assertEqual(resolveQuestionSettingsForHost({ settings: unique, hostUid: HOST, players: { [HOST]: { name: "ホスト" } } }), unique, "ホスト交代：ホストの状況が分からない間は設定のまま");
    assertEqual(resolveQuestionSettingsForHost({ settings: legacy, hostUid: HOST, players: hostOld }), legacy, "ホスト交代：版の無い部屋はそのまま");
  }

  // ===== 開始後：問題の指紋 =====
  {
    const questions = buildDeviceQuestions({ seed: 11, settings: unique, entries: deviceEntries() });
    const hostCheck = buildLyricsMatchCheckPayload({ matchId: "m1", questions });
    assertEqual(hostCheck.questionCount, questions.length, "指紋：問題数");
    assertEqual(hostCheck.questionHashes.split(",").every((hash) => /^[0-9a-f]{8}$/.test(hash)), true, "指紋：問題ごとのハッシュ（16進数8桁）だけ");
    assertEqual(containsAnyLyricText(hostCheck), false, "指紋：歌詞本文（ダミー）を一切含まない");
    assertEqual(JSON.stringify(hostCheck).includes(questions[0].song.title), false, "指紋：正解の曲名も含まない");
    assertEqual(
      buildLyricsMatchCheckPayload({ matchId: "m1", questions: buildDeviceQuestions({ seed: 11, settings: unique, entries: deviceEntries({ reverse: true }) }) }),
      hostCheck,
      "再接続：同じseed・同じ歌詞で作り直すと、全く同じ指紋になる（入り直すたびに再照合できる）"
    );
    const changedHint = questions.map((q, i) => (i === 2 ? { ...q, hints: q.hints.map((h, j) => (j === 0 ? { ...h, startLine: h.startLine + 1 } : h)) } : q));
    assertEqual(computeLyricsQuestionHash(changedHint[2]) === computeLyricsQuestionHash(questions[2]), false, "指紋：ヒントの行が1つ違うだけでハッシュが変わる");
    const changedAnswer = { ...questions[0], answerPool: [...questions[0].answerPool].reverse() };
    assertEqual(computeLyricsQuestionHash(changedAnswer) === computeLyricsQuestionHash(questions[0]), false, "指紋：回答候補の並び順が違ってもハッシュが変わる");

    const goodCheck = buildLyricsMatchCheckPayload({ matchId: "m1", questions });
    const badCheck = buildLyricsMatchCheckPayload({ matchId: "m1", questions: changedHint });
    const players = {
      [HOST]: { name: "ホスト", lyricsMatchCheck: hostCheck },
      "p-a": { name: "Aさん", lyricsMatchCheck: goodCheck },
      "p-b": { name: "Bさん" },
    };
    assertEqual(compareLyricsMatchChecks({ matchId: "m1", hostUid: HOST, participantUids: [HOST, "p-a", "p-b"], players }).status, MATCH_CHECK_STATUS.PENDING, "指紋：まだ書いていない人がいれば待つ");
    players["p-b"] = { name: "Bさん", lyricsMatchCheck: goodCheck };
    assertEqual(compareLyricsMatchChecks({ matchId: "m1", hostUid: HOST, participantUids: [HOST, "p-a", "p-b"], players }).status, MATCH_CHECK_STATUS.OK, "指紋：全員一致");
    players["p-b"] = { name: "Bさん", lyricsMatchCheck: badCheck };
    const mismatch = compareLyricsMatchChecks({ matchId: "m1", hostUid: HOST, participantUids: [HOST, "p-a", "p-b"], players });
    assertEqual([mismatch.status, mismatch.mismatchedUids, mismatch.firstMismatchIndex], [MATCH_CHECK_STATUS.MISMATCH, ["p-b"], 2], "指紋：食い違う人と、最初にずれた問題番号を特定");
    assertEqual(findFirstMismatchedQuestionIndex(goodCheck, goodCheck), -1, "指紋：一致なら-1");
    players["p-b"] = { name: "Bさん", lyricsMatchCheck: { ...badCheck, matchId: "m0" } };
    assertEqual(compareLyricsMatchChecks({ matchId: "m1", hostUid: HOST, participantUids: [HOST, "p-a", "p-b"], players }).status, MATCH_CHECK_STATUS.PENDING, "指紋：前の試合の指紋とは取り違えない（未提出扱い）");
    assertEqual(
      compareLyricsMatchChecks({ matchId: "m1", hostUid: HOST, participantUids: [HOST, "p-a"], players: { "p-a": players["p-a"] } }).status,
      MATCH_CHECK_STATUS.WAITING_HOST,
      "指紋：ホストの指紋が無い（古いホスト）なら照合しない"
    );
    assertEqual(compareOwnMatchCheck({ matchId: "m1", myCheck: badCheck, hostUid: HOST, players }), MATCH_CHECK_STATUS.MISMATCH, "指紋：参加者側でも自分のずれに気づける");
    assertEqual(compareOwnMatchCheck({ matchId: "m1", myCheck: goodCheck, hostUid: HOST, players }), MATCH_CHECK_STATUS.OK, "指紋：参加者側・一致");

    const aborted = buildLyricsMatchAbortedCheckPayload(hostCheck, 1);
    assertEqual(containsAnyLyricText(aborted), false, "中止の印：歌詞本文を含まない");
    const roomAfterAbort = { host: HOST, activeMatchId: "m1", status: "waiting", players: { [HOST]: { lyricsMatchCheck: aborted } } };
    assertEqual(typeof describeLyricsMatchAbortNotice(roomAfterAbort), "string", "中止の印：ロビーで全員に理由を出す");
    assertEqual(describeLyricsMatchAbortNotice({ ...roomAfterAbort, activeMatchId: "m2" }), null, "中止の印：次の試合が始まったら消える");
    assertEqual(describeLyricsMatchAbortNotice({ ...roomAfterAbort, players: { [HOST]: { lyricsMatchCheck: hostCheck } } }), null, "中止の印：中止していなければ出さない");
  }

  // ===== 書き込みの権限（JSの再現） =====
  assertEqual(canWriteLyricsMatchCheck({ authUid: "u1", targetUid: "u1" }), true, "権限：本人は自分の指紋を書ける");
  assertEqual(canWriteLyricsMatchCheck({ authUid: "u1", targetUid: "u2" }), false, "権限：他人の指紋は書けない");
  assertEqual(canWriteLyricsMatchCheck({ authUid: null, targetUid: "u1" }), false, "権限：未ログインは書けない");
}

// 今の本番ルールファイル（firebase/database.rules.json）のまま、新しく書く2つの値が
// 拒否されないことを、ルールファイルを実際に読んで確かめる（変更はしない）。
// rulesを渡さなければ、ブラウザ（tests.html）からfetchで読む。
export async function runLyricsQuizBattleCompatibilityRulesTests(rulesOverride = null) {
  const rules =
    rulesOverride ?? JSON.parse(await (await fetch("firebase/database.rules.json", { cache: "no-store" })).text()).rules;
  for (const fieldPath of ["lyricsCoverage", "lyricsCoverage/capability", "lyricsMatchCheck"]) {
    const status = inspectPlayerSubfieldRule(rules, fieldPath);
    assertEqual(
      status,
      { selfWritable: true, hasValidate: false, blockedByOther: false },
      `今のルール：players/$uid/${fieldPath} は本人が書け、値の検証・$other拒否が無い（ルール変更なしで動く）`
    );
  }
  assertEqual(inspectPlayerSubfieldRule(rules, "presence").hasValidate, true, "ルール調査の道具：検証のあるフィールド（presence）は正しく検出できる");
  assertEqual(
    inspectPlayerSubfieldRule({ rooms: { $roomId: { players: { $uid: { ".write": "auth.uid === $uid", $other: { ".validate": false } } } } } }, "lyricsMatchCheck").blockedByOther,
    true,
    "ルール調査の道具：将来$other:falseが入ったら検出できる（そのときは提案ファイルのルールが必要）"
  );
}
