// オンライン歌詞クイズ対戦の「入室・開始を速くする仕組み」と「アプリの版の組み合わせ」のテスト（2026-10-28新設）。
//
// 【重要・著作権】歌詞はすべて tests/lyricsSyntheticCorpus.js が乱数で作るダミーの文字列。
// 実在の楽曲の歌詞は使わない。曲IDだけは、回答候補を作るため js/data/songs.js の実在IDを使う。
//
// 確認すること（本人の依頼）：
//   ① 速くした「答えが1曲に決まらない行」の判定が、以前の方式と全く同じ結果になる
//   ② 保存した計算結果（キャッシュ）を使っても使わなくても、capability・問題が全く同じになる
//   ③ 速さの目安（遅くなる変更が入ったら気づけるように）
//   ④ アプリの版の組み合わせ（v382以前／v383／新しい版）ごとに、公平でない対戦が新しいアプリで始まらない。
//      全員が新しいアプリなら誤って止めない
//   ⑤ 「確認中」の待ち（届けば開始・届かなければ案内）、途中参加・入り直し
//   ⑥ Firebaseへ送る値・保存する値・案内文に歌詞本文が含まれない

import {
  normalizeForLyricsUniqueness,
  buildUniquenessCorpus,
  findOtherSongsContainingFragment,
  resolveIndexedAmbiguousLines,
  computeAmbiguousLinesForSong,
  computeLyricsUniquenessExclusions,
  computeLyricsUniquenessExclusionsAsync,
  AMBIGUITY_REASON,
  MIN_UNIQUE_FRAGMENT_LENGTH,
} from "../js/lyricsQuestionUniqueness.js";
import {
  buildLyricsBattleCapability,
  buildLyricsBattleCapabilityFromHashes,
  evaluateLyricsBattleCompatibility,
  resolveLyricsParticipantGate,
  resolveQuestionSettingsForHost,
  describeQuestionSettingsNoticeForHost,
  waitForLyricsBattleCompatibility,
  isCompatibilityPendingOnly,
  describeCompatProblem,
  buildLyricsMatchCheckPayload,
  COMPAT_PROBLEM,
} from "../js/lyricsQuizBattleCompatibility.js";
import {
  createLyricsBattleDerivedCache,
  createMemoryDerivedStore,
  computePoolExclusionsCacheKey,
  serializeExclusions,
  deserializeExclusions,
  annotateEntriesWithPoolExclusions,
  MAX_POOL_EXCLUSION_ENTRIES,
} from "../js/lyricsBattleDerivedCache.js";
import { buildLyricsQuizQuestions, validateLyricsQuizAvailability } from "../js/lyricsQuizQuestionBuilder.js";
import { buildLyricsCoveragePayload } from "../js/lyricsQuizBattleFirebasePayloads.js";
import * as lyricsQuizBattleMode from "../js/battleModes/lyricsQuizBattleMode.js";
import { QUESTION_SOURCE_TYPE } from "../js/questionSource.js";
import { SONGS } from "../js/data/songs.js";
import { LYRICS_AMBIGUITY_INDEX } from "../js/data/lyricsAmbiguityIndex.js";
import { LYRICS_UNIQUENESS_MANUAL_EXCLUSIONS } from "../js/data/lyricsUniquenessManualList.js";
import { makeSyntheticSizes, makeSyntheticLyricsRecords, containsAnySyntheticLyricLine } from "./lyricsSyntheticCorpus.js";
import { assertEqual } from "./test-utils.js";

// ---------- テスト用の道具 ----------

const ELIGIBLE = SONGS.filter((song) => song.id !== "overture");
const SONG_BY_ID = new Map(SONGS.map((song) => [song.id, song]));
const ELIGIBLE_IDS_83 = ELIGIBLE.slice(0, 83).map((song) => song.id);

function toEntries(records) {
  return records.map((record) => ({ song: SONG_BY_ID.get(record.songId), lines: record.lines }));
}

function recordsMap(records) {
  return new Map(records.map((record) => [record.songId, { songId: record.songId, lines: record.lines }]));
}

function serializeExclusionMap(map) {
  return JSON.stringify([...map].map(([songId, lines]) => [songId, [...lines]]));
}

const NO_LISTS = { ambiguityIndex: { songs: {} }, manualExclusions: {} };

// 以前（2026-10-28の高速化より前）の判定方式を、そのまま写したもの（比べるための基準）。
function referenceAmbiguousLines(entry, corpus, options = {}) {
  const ambiguityIndex = options.ambiguityIndex;
  const manualExclusions = options.manualExclusions ?? {};
  const minLength = options.minFragmentLength ?? MIN_UNIQUE_FRAGMENT_LENGTH;
  const songId = entry.song.id;
  const result = new Map();
  const otherLineSet = new Set();
  for (const [otherSongId, data] of corpus) {
    if (otherSongId === songId) continue;
    data.normalizedLines.forEach((normalizedLine) => otherLineSet.add(normalizedLine));
  }
  for (const line of entry.lines) {
    const normalized = normalizeForLyricsUniqueness(line?.text);
    if (normalized.length === 0) result.set(line.line, AMBIGUITY_REASON.EMPTY);
    else if (normalized.length < minLength) result.set(line.line, AMBIGUITY_REASON.TOO_SHORT);
    else if (otherLineSet.has(normalized)) result.set(line.line, AMBIGUITY_REASON.CROSS_SONG_EXACT);
    else if (findOtherSongsContainingFragment(normalized, corpus, songId).length > 0) result.set(line.line, AMBIGUITY_REASON.CROSS_SONG_SUBSTRING);
  }
  for (const lineNumber of manualExclusions[songId] ?? []) if (!result.has(lineNumber)) result.set(lineNumber, AMBIGUITY_REASON.MANUAL);
  for (const lineNumber of resolveIndexedAmbiguousLines(songId, entry.lines, ambiguityIndex).lineNumbers) {
    if (!result.has(lineNumber)) result.set(lineNumber, AMBIGUITY_REASON.INDEX);
  }
  return result;
}

function referenceExclusions(targets, options = {}) {
  const corpus = buildUniquenessCorpus([...targets, ...(options.corpusEntries ?? targets)]);
  return new Map(targets.map((entry) => [entry.song.id, new Set(referenceAmbiguousLines(entry, corpus, options).keys())]));
}

// 版の印（localStorageの代わり）と、歌詞データの保存場所（IndexedDBの代わり）。
function createFakeLyricsBackend(records, { persistentAvailable = true } = {}) {
  const data = recordsMap(records);
  let persistent = null;
  let session = 0;
  let loadCount = 0;
  return {
    data,
    get loadCount() {
      return loadCount;
    },
    readRevision({ ensure = false } = {}) {
      if (!persistentAvailable) return { persistent: null, session };
      if (persistent === null && ensure) persistent = "init-1";
      return { persistent, session };
    },
    bump() {
      session += 1;
      if (persistentAvailable) persistent = `rev-${session}`;
    },
    // 別のタブ（版の印を変えない古いアプリ）で書き換えられた、を再現する
    writeWithoutBump(songId, lines) {
      data.set(songId, { songId, lines });
    },
    reloadPage() {
      session = 0; // ページを開き直すと、ページ内の通し番号は0から
    },
    listStoredSongIds: async () => [...data.keys()],
    loadRecords: async (songIds) => {
      loadCount += 1;
      return new Map(songIds.filter((id) => data.has(id)).map((id) => [id, data.get(id)]));
    },
  };
}

function makeCache(backend, store) {
  return createLyricsBattleDerivedCache({
    store,
    readRevision: (options) => backend.readRevision(options),
    listStoredSongIds: backend.listStoredSongIds,
    loadRecords: backend.loadRecords,
  });
}

function medianMs(fn, repeat = 5) {
  const times = [];
  for (let i = 0; i < repeat; i += 1) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

async function medianMsAsync(fn, repeat = 5) {
  const times = [];
  for (let i = 0; i < repeat; i += 1) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

// 83曲ぶん（実データに近い大きさ）のダミー歌詞。
const SIZES_83 = makeSyntheticSizes({ songCount: 83, seed: 83 });
const RECORDS_83 = makeSyntheticLyricsRecords({ songIds: ELIGIBLE_IDS_83, sizes: SIZES_83, seed: 2026 });
const ENTRIES_83 = toEntries(RECORDS_83);

// ---------- 同期のテスト ----------

export function runLyricsBattlePerfMatrixTests() {
  // ===== ① 速くした判定が、以前の方式と全く同じ =====
  {
    let allEqual = true;
    let excludedTotal = 0;
    for (const seed of [1, 2, 3]) {
      const records = makeSyntheticLyricsRecords({
        songIds: ELIGIBLE_IDS_83,
        sizes: SIZES_83,
        seed,
        sharedLineRate: 0.03 * seed,
        sharedFragmentRate: 0.05,
      });
      const entries = toEntries(records);
      const fast = computeLyricsUniquenessExclusions(entries, NO_LISTS);
      const reference = referenceExclusions(entries, NO_LISTS);
      if (serializeExclusionMap(fast) !== serializeExclusionMap(reference)) allEqual = false;
      for (const lines of reference.values()) excludedTotal += lines.size;
      // 出題範囲（一部の曲）＋比較相手（全曲）の形（1人用・パーティーの形）
      const subset = entries.slice(0, 23);
      const fastSubset = computeLyricsUniquenessExclusions(subset, { ...NO_LISTS, corpusEntries: entries });
      const referenceSubset = referenceExclusions(subset, { ...NO_LISTS, corpusEntries: entries });
      if (serializeExclusionMap(fastSubset) !== serializeExclusionMap(referenceSubset)) allEqual = false;
      // 最短文字数を下げた場合（4文字未満のフレーズは、以前と同じ順に調べる経路）
      const shortFast = computeLyricsUniquenessExclusions(entries.slice(0, 30), { ...NO_LISTS, minFragmentLength: 2 });
      const shortReference = referenceExclusions(entries.slice(0, 30), { ...NO_LISTS, minFragmentLength: 2 });
      if (serializeExclusionMap(shortFast) !== serializeExclusionMap(shortReference)) allEqual = false;
    }
    assertEqual(allEqual, true, "高速化：除外する行が以前の方式と完全に一致（3種のダミー歌詞×全曲・一部の曲・最短文字数2）");
    assertEqual(excludedTotal > 300, true, "高速化：比べたダミー歌詞には除外される行が十分ある（テストが意味を持つ）");

    // 理由（完全一致・部分一致など）まで一致する
    const corpus = buildUniquenessCorpus(ENTRIES_83);
    const sameReasons = ENTRIES_83.slice(0, 20).every(
      (entry) => JSON.stringify([...computeAmbiguousLinesForSong(entry, corpus, NO_LISTS)]) === JSON.stringify([...referenceAmbiguousLines(entry, corpus, NO_LISTS)])
    );
    assertEqual(sameReasons, true, "高速化：行ごとの理由（完全一致・部分一致・短すぎる）も以前と同じ");

    // 本番の一覧（事前計算・手作業）を使う場合も同じ
    assertEqual(
      serializeExclusionMap(computeLyricsUniquenessExclusions(ENTRIES_83.slice(0, 40))),
      serializeExclusionMap(referenceExclusions(ENTRIES_83.slice(0, 40), { ambiguityIndex: LYRICS_AMBIGUITY_INDEX, manualExclusions: LYRICS_UNIQUENESS_MANUAL_EXCLUSIONS })),
      "高速化：本番の一覧（事前計算・手作業）を使う既定の呼び方でも以前の方式と同じ"
    );
  }

  // ===== ② capability：保存した内容ハッシュから作っても、歌詞から作っても同じ =====
  {
    const checkedSongIds = ELIGIBLE.map((song) => song.id); // 歌詞が無い曲（「-」）も含む
    const fromLines = buildLyricsBattleCapability({ checkedSongIds, songsWithLyrics: ENTRIES_83.slice(0, 70) });
    const songHashById = {};
    for (const entry of ENTRIES_83.slice(0, 70)) songHashById[entry.song.id] = fromLines.songHashes.match(new RegExp(`(?:^|;)${entry.song.id}=([0-9a-f]+)`))?.[1];
    const fromHashes = buildLyricsBattleCapabilityFromHashes({ checkedSongIds, songHashById: { ...songHashById, "not-in-catalog": "deadbeef" } });
    assertEqual(fromHashes, fromLines, "capability：内容ハッシュから作っても、歌詞から作った値と完全に同じ（歌詞が無い曲は「-」、一覧に無い曲は含めない）");
    const duplicate = buildLyricsBattleCapability({
      checkedSongIds,
      songsWithLyrics: [ENTRIES_83[0], { song: ENTRIES_83[0].song, lines: ENTRIES_83[1].lines }],
    });
    assertEqual(
      duplicate.songHashes.includes(`${ENTRIES_83[0].song.id}=`),
      true,
      "capability：同じ曲が2回渡されても形が崩れない（以前と同じく後のものを使う）"
    );
  }

  // ===== ③ 速さの目安（遅くなる変更が入ったら気づけるように。余裕を大きく取った上限） =====
  {
    const fastMs = medianMs(() => computeLyricsUniquenessExclusions(ENTRIES_83), 3);
    assertEqual(fastMs < 400, true, `速さ：83曲の「答えが1曲に決まらない行」の判定が0.4秒未満（今回 ${fastMs.toFixed(1)}ms）`);
    const checkedSongIds = ELIGIBLE.map((song) => song.id);
    const songHashById = Object.fromEntries(ENTRIES_83.map((entry) => [entry.song.id, "0123abcd"]));
    const capabilityMs = medianMs(() => buildLyricsBattleCapabilityFromHashes({ checkedSongIds, songHashById }), 5);
    assertEqual(capabilityMs < 20, true, `速さ：保存した内容ハッシュからcapabilityを作るのが20ms未満（今回 ${capabilityMs.toFixed(2)}ms）`);
    const settings = { ...lyricsQuizBattleMode.defaultSettings(), categoryFilterValue: "all", questionCountValue: "10" };
    const annotated = ENTRIES_83.map((entry) => ({ ...entry, uniqueExcludedLineNumbers: [] }));
    const exclusions = computeLyricsUniquenessExclusions(ENTRIES_83);
    annotated.forEach((entry) => (entry.uniqueExcludedLineNumbers = [...exclusions.get(entry.song.id)]));
    const runtimeContext = { ok: true, songsWithLyrics: annotated, songPool: ELIGIBLE_IDS_83 };
    lyricsQuizBattleMode.checkRuntimeAvailability({ runtimeContext, settings });
    const startMs = medianMs(() => {
      lyricsQuizBattleMode.checkRuntimeAvailability({ runtimeContext, settings });
      lyricsQuizBattleMode.buildQuestions({ seed: 5, settings, runtimeContext });
    }, 3);
    assertEqual(startMs < 250, true, `速さ：除外行が付いた83曲から、開始前チェック＋10問の生成が0.25秒未満（今回 ${startMs.toFixed(1)}ms）`);
  }

  // ===== 開始前チェックの使い回し：結果が変わらない =====
  {
    const settings = { ...lyricsQuizBattleMode.defaultSettings(), categoryFilterValue: "all", questionCountValue: "10" };
    const fresh = validateLyricsQuizAvailability(ENTRIES_83.map((entry) => ({ ...entry })), "10", { enabled: true });
    const repeated = validateLyricsQuizAvailability(ENTRIES_83, "10", { enabled: true });
    const repeatedAgain = validateLyricsQuizAvailability(ENTRIES_83, "10", { enabled: true });
    assertEqual([repeated, repeatedAgain], [fresh, fresh], "使い回し：同じ曲で開始前チェックを何度しても結果は同じ");
    const runtimeContext = { ok: true, songsWithLyrics: ENTRIES_83, songPool: ELIGIBLE_IDS_83 };
    const first = buildLyricsMatchCheckPayload({ matchId: "m", questions: lyricsQuizBattleMode.buildQuestions({ seed: 9, settings, runtimeContext }) });
    lyricsQuizBattleMode.checkRuntimeAvailability({ runtimeContext, settings });
    const second = buildLyricsMatchCheckPayload({ matchId: "m", questions: lyricsQuizBattleMode.buildQuestions({ seed: 9, settings, runtimeContext }) });
    assertEqual(second.fingerprint, first.fingerprint, "使い回し：開始前チェックの後に作っても、問題の指紋は同じ");
  }

  runVersionMatrixTests();

  // ===== 参加者側の「準備完了」の可否・案内 =====
  {
    const HOST = "host";
    const unique = { ...lyricsQuizBattleMode.defaultSettings() };
    const { lyricsUniquenessRulesVersion, ...legacy } = unique;
    const oldCoverage = buildLyricsCoveragePayload({ availableCount: 3, requiredCount: 3, poolHash: "p" });
    const newCoverage = buildLyricsCoveragePayload({
      availableCount: 3,
      requiredCount: 3,
      poolHash: "p",
      capability: buildLyricsBattleCapability({ checkedSongIds: ELIGIBLE_IDS_83, songsWithLyrics: ENTRIES_83 }),
    });
    const names = { [HOST]: "ホスト", me: "わたし" };
    const gateOldHost = resolveLyricsParticipantGate({ settings: unique, hostUid: HOST, players: { [HOST]: { lyricsCoverage: oldCoverage } }, viewerUid: "me", displayNameByUid: names });
    assertEqual(gateOldHost.canReady, false, "準備完了：版のある部屋でホストが古いアプリ → 準備完了にできない");
    assertEqual(
      gateOldHost.message.includes("ホストさんにアプリを更新してもらってください") || gateOldHost.message.includes("ホストのホストさん"),
      true,
      "準備完了：案内に「誰に」更新してもらうかが入る"
    );
    assertEqual(gateOldHost.message.includes("アプリを更新"), true, "準備完了：案内に「アプリを更新」が入る");
    assertEqual(
      resolveLyricsParticipantGate({ settings: legacy, hostUid: HOST, players: { [HOST]: { lyricsCoverage: oldCoverage } }, viewerUid: "me" }).canReady,
      true,
      "準備完了：版の無い部屋（全員「除外なし」）なら古いホストでも準備完了にできる"
    );
    assertEqual(
      resolveLyricsParticipantGate({ settings: unique, hostUid: HOST, players: { [HOST]: { lyricsCoverage: newCoverage } }, viewerUid: "me" }).canReady,
      true,
      "準備完了：新しいホストなら準備完了にできる（照合はホストが開始時に行う）"
    );
    assertEqual(
      resolveLyricsParticipantGate({ settings: unique, hostUid: HOST, players: { [HOST]: { name: "ホスト" } }, viewerUid: "me" }).canReady,
      true,
      "準備完了：ホストの確認がまだ届いていない間は止めない（誤って止めない）"
    );
    assertEqual(
      resolveLyricsParticipantGate({ settings: unique, hostUid: HOST, players: {}, viewerUid: HOST }).canReady,
      true,
      "準備完了：ホスト自身には関係しない"
    );
    assertEqual(
      describeQuestionSettingsNoticeForHost({ settings: unique, hostUid: HOST, players: { [HOST]: { lyricsCoverage: oldCoverage } }, viewerUid: "me" }) !== null,
      true,
      "対戦中：古いホストの部屋に（行き違いで）入った場合は、確かめられないことを知らせる"
    );
    assertEqual(
      describeQuestionSettingsNoticeForHost({ settings: unique, hostUid: HOST, players: { [HOST]: { lyricsCoverage: newCoverage } }, viewerUid: "me" }),
      null,
      "対戦中：新しいホストなら何も出さない"
    );
    assertEqual(containsAnySyntheticLyricLine(gateOldHost, RECORDS_83), false, "準備完了：案内に歌詞本文が含まれない");
  }
}

// ---------- ④ アプリの版の組み合わせ ----------
//
// A = v382以前（除外しない・capabilityを書かない・開始前の照合をしない）
// B = v383（公開版。部屋の版が1なら除外する・capabilityを書かない・照合をしない）
// C = 新しい版（capabilityを書く・ホストなら開始前に照合・参加者なら準備完了の可否を判断）
// AとBはFirebaseへ書く値が同じ（lyricsCoverageにcapabilityが無い）で、新しい版からは見分けられない。
// AとBの問題の作り方は、それぞれの版の本物のコードと一致することを
// tools/feature-research/2026-10-28/lyrics-battle-perf-matrix-report.md の手順（過去の版をgitから取り出して比較）で確認済み。
function runVersionMatrixTests() {
  const ids = ELIGIBLE.slice(0, 10).map((song) => song.id);
  const records = makeSyntheticLyricsRecords({
    songIds: ids,
    sizes: makeSyntheticSizes({ songCount: 10, seed: 10 }),
    seed: 77,
    sharedLineRate: 0.25,
    sharedFragmentRate: 0.1,
  });
  const entries = toEntries(records);
  const baseSettings = {
    ...lyricsQuizBattleMode.defaultSettings(),
    questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ids },
    questionCountValue: "5",
    answerPoolSizeValue: 4,
  };
  const { lyricsUniquenessRulesVersion, ...legacySettings } = baseSettings;
  const songPool = lyricsQuizBattleMode.resolveSettingsSongPool(baseSettings);
  const capability = buildLyricsBattleCapability({ checkedSongIds: ids, songsWithLyrics: entries });

  function playerRecord(client, name) {
    const coverage = buildLyricsCoveragePayload({
      availableCount: ids.length,
      requiredCount: ids.length,
      poolHash: "p",
      capability: client === "C" ? capability : undefined,
    });
    return { name, ready: true, lyricsCoverage: coverage };
  }

  function questionsFor(client, { settings, hostUid, players, seed }) {
    if (client === "A" || client === "B") {
      const enabled = client === "B" && settings.lyricsUniquenessRulesVersion === 1;
      return buildLyricsQuizQuestions({
        seed,
        songsWithLyrics: entries,
        songPool,
        questionCountValue: settings.questionCountValue,
        answerPoolSizeValue: settings.answerPoolSizeValue,
        lyricsUniqueness: { enabled },
      });
    }
    const questionSettings = resolveQuestionSettingsForHost({ settings, hostUid, players });
    return lyricsQuizBattleMode.buildQuestions({ seed, settings: questionSettings, runtimeContext: { ok: true, songsWithLyrics: entries, songPool } });
  }

  const signature = (questions) => buildLyricsMatchCheckPayload({ matchId: "m", questions }).fingerprint;
  // 同じ版・同じ部屋の種類・同じseedなら、同じ問題になる（他の人の状況には左右されない。C の場合も
  // resolveQuestionSettingsForHost() は部屋の設定をそのまま返す）。テストを速くするため結果を使い回す。
  const fingerprintMemo = new Map();
  const memberFingerprint = (client, context) => {
    const memoKey = `${client}|${context.settings.lyricsUniquenessRulesVersion ?? "none"}|${context.seed}|${JSON.stringify(resolveQuestionSettingsForHost(context))}`;
    if (!fingerprintMemo.has(memoKey)) fingerprintMemo.set(memoKey, signature(questionsFor(client, context)));
    return fingerprintMemo.get(memoKey);
  };
  const participantSets = [["A"], ["B"], ["C"], ["A", "B"], ["A", "C"], ["B", "C"], ["C", "C"], ["A", "B", "C"]];
  const rows = [];
  for (const hostClient of ["A", "B", "C"]) {
    for (const versioned of [true, false]) {
      for (const participantClients of participantSets) {
        const settings = versioned ? baseSettings : legacySettings;
        const hostUid = "h";
        const members = [{ uid: hostUid, client: hostClient }, ...participantClients.map((client, index) => ({ uid: `p${index}`, client }))];
        const players = Object.fromEntries(members.map((member) => [member.uid, playerRecord(member.client, member.uid)]));
        // 開始できるか：新しいホストは照合する。新しい参加者は準備完了にできるかを判断する（古いホストは全員の準備完了が必要）。
        const hostAllows =
          hostClient === "C" ? lyricsQuizBattleMode.validateParticipantCompatibility({ settings, players, hostUid }) === null : true;
        const newParticipantsReady = members
          .filter((member) => member.uid !== hostUid && member.client === "C")
          .every((member) => resolveLyricsParticipantGate({ settings, hostUid, players, viewerUid: member.uid }).canReady);
        const allowed = hostAllows && newParticipantsReady;
        // 公平か：全員の問題（正解・ヒントの行・回答候補）が、8通りのseedで一致するか
        let fair = true;
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
          const fingerprints = new Set(members.map((member) => memberFingerprint(member.client, { settings, hostUid, players, seed })));
          if (fingerprints.size > 1) fair = false;
        }
        rows.push({ hostClient, versioned, participantClients: participantClients.join(""), hasNew: members.some((m) => m.client === "C"), allowed, fair });
      }
    }
  }

  // 前提：このダミー歌詞では、除外の有無で実際に問題が変わる（変わらなければ、表のテストが意味を持たない）
  const filtered = signature(questionsFor("B", { settings: baseSettings, hostUid: "h", players: {}, seed: 1 }));
  const unfiltered = signature(questionsFor("A", { settings: baseSettings, hostUid: "h", players: {}, seed: 1 }));
  assertEqual(filtered !== unfiltered, true, "版の表：前提として、除外の有無で問題が変わるダミー歌詞を使っている");

  const unsafe = rows.filter((row) => row.hasNew && row.allowed && !row.fair);
  assertEqual(unsafe, [], "版の表：新しいアプリが1人でもいる部屋では、公平でない対戦は始まらない（全48通り）");

  const allNew = rows.filter((row) => row.hostClient === "C" && /^C+$/.test(row.participantClients));
  assertEqual(
    allNew.map((row) => row.allowed && row.fair),
    allNew.map(() => true),
    "版の表：全員が新しいアプリなら、版のある部屋・無い部屋とも開始でき、全員同じ問題（誤って止めない）"
  );

  // 新しいアプリがいない部屋：私たちの変更は届かない。版のある部屋に v382以前 と v383 が混ざると、今でも公平でない。
  const oldOnly = rows.filter((row) => !row.hasNew);
  const predictedUnfair = (row) => {
    const clients = new Set([row.hostClient, ...row.participantClients]);
    return row.versioned && clients.has("A") && clients.has("B");
  };
  assertEqual(
    oldOnly.map((row) => row.fair),
    oldOnly.map((row) => !predictedUnfair(row)),
    "版の表：古いアプリだけの部屋は、版のある部屋で v382以前とv383が混ざったときだけ公平でない（新しい版では直せない）"
  );

  // 安全側に止めすぎている組み合わせ（公平なのに止める）は、「版のある部屋＋古いホスト」だけ。
  const overBlocked = rows.filter((row) => row.hasNew && !row.allowed && row.fair);
  // 古いアプリ（A/B）は見分けられないため、版のある部屋に古いアプリが1人でもいれば止める。
  // そのうち「古いアプリが全員v383（B）」の場合は、実際には公平に遊べた（安全側に止めすぎている）。
  const describeRow = (row) => `${row.hostClient}${row.versioned ? "版あり" : "版なし"}+${row.participantClients}`;
  const expectedOverBlocked = rows.filter((row) => {
    const olds = [row.hostClient, ...row.participantClients].filter((client) => client !== "C");
    return row.hasNew && row.versioned && olds.length > 0 && olds.every((client) => client === "B");
  });
  assertEqual(
    overBlocked.map(describeRow),
    expectedOverBlocked.map(describeRow),
    "版の表：公平なのに止めるのは「版のある部屋に、v383（v382以前と見分けられない）の人がいる」場合だけ（ホストB×参加者C／CC／BC、ホストC×参加者B／BC）"
  );
  assertEqual(
    rows.filter((row) => row.hasNew && row.versioned && row.hostClient === "C" && /[AB]/.test(row.participantClients)).every((row) => !row.allowed),
    true,
    "版の表：新しいホストの版のある部屋に古いアプリの参加者がいれば、開始しない"
  );
  assertEqual(
    rows.filter((row) => !row.versioned && row.hasNew).every((row) => row.allowed && row.fair),
    true,
    "版の表：版の無い部屋（古いホストが作った部屋）では、新旧が混ざっても全員「除外なし」で同じ問題になり、止めない"
  );
}

// ---------- 非同期のテスト ----------

export async function runLyricsBattlePerfMatrixAsyncTests() {
  // ===== 非同期の判定（画面を固めない版）が同期版と同じ =====
  {
    let yields = 0;
    let clock = 0;
    const asyncResult = await computeLyricsUniquenessExclusionsAsync(ENTRIES_83, {
      sliceBudgetMs: 1,
      nowMs: () => (clock += 0.6),
      yieldToMain: async () => {
        yields += 1;
      },
    });
    assertEqual(serializeExclusionMap(asyncResult), serializeExclusionMap(computeLyricsUniquenessExclusions(ENTRIES_83)), "区切りながらの計算：同期版と完全に同じ結果");
    assertEqual(yields > 10, true, "区切りながらの計算：途中で何度も処理を譲っている（画面を固めない）");
  }

  // ===== ② 保存した計算結果：曲ごとの内容ハッシュ =====
  {
    const backend = createFakeLyricsBackend(RECORDS_83);
    const store = createMemoryDerivedStore();
    const cache = makeCache(backend, store);
    const first = await cache.getSongHashes();
    assertEqual([first.source, first.needsVerification], ["computed", false], "保存：はじめては歌詞を読んで計算する");
    const expected = buildLyricsBattleCapability({ checkedSongIds: ELIGIBLE_IDS_83, songsWithLyrics: ENTRIES_83 });
    assertEqual(buildLyricsBattleCapabilityFromHashes({ checkedSongIds: ELIGIBLE_IDS_83, songHashById: first.songHashById }), expected, "保存：計算したcapabilityは以前の方式と同じ");
    const loadsAfterFirst = backend.loadCount;
    const second = await cache.getSongHashes();
    assertEqual([second.source, backend.loadCount], ["memory", loadsAfterFirst], "保存：同じページの2回目は、歌詞データを読まずに使い回す");

    backend.reloadPage();
    const afterReload = makeCache(backend, store); // アプリを開き直した（ページ内の使い回しは無い）
    const persistent = await afterReload.getSongHashes();
    assertEqual([persistent.source, persistent.needsVerification, backend.loadCount], ["persistent", true, loadsAfterFirst], "保存：開き直した後も、歌詞データを読まずに保存した値を使う（後で1回だけ確かめる）");
    assertEqual(persistent.songHashById, first.songHashById, "保存：保存した値は計算した値と同じ");
    const verified = await afterReload.verifySongHashes();
    assertEqual(verified.changed, false, "保存：手が空いたときの確認で、変わっていないことを確かめる");
    assertEqual((await afterReload.getSongHashes()).needsVerification, false, "保存：確かめた後は、もう確かめない");

    backend.bump(); // 歌詞データを保存した（版の印が変わる）
    backend.data.set(ELIGIBLE_IDS_83[0], { songId: ELIGIBLE_IDS_83[0], lines: RECORDS_83[1].lines });
    const afterSave = await afterReload.getSongHashes();
    assertEqual(afterSave.source, "computed", "保存：歌詞データを保存したら（版の印が変わったら）計算し直す");
    assertEqual(afterSave.songHashById[ELIGIBLE_IDS_83[0]] !== first.songHashById[ELIGIBLE_IDS_83[0]], true, "保存：計算し直した値は新しい歌詞のもの");

    backend.data.delete(ELIGIBLE_IDS_83[5]); // 版の印は同じまま曲が消えた（キーの一覧で気づく）
    backend.reloadPage();
    const afterDelete = await makeCache(backend, store).getSongHashes();
    assertEqual([afterDelete.source, ELIGIBLE_IDS_83[5] in afterDelete.songHashById], ["computed", false], "保存：曲の一覧が変わっていたら計算し直す");

    // 版の印を変えない書き換え（古いアプリの別タブ等）→ いったん古い値を使うが、手が空いたときの確認で気づく
    backend.reloadPage();
    const staleCache = makeCache(backend, store);
    backend.writeWithoutBump(ELIGIBLE_IDS_83[2], RECORDS_83[3].lines);
    const stale = await staleCache.getSongHashes();
    assertEqual(stale.source, "persistent", "保存：印を変えない書き換えは、その場では気づけない（後の確認で気づく）");
    const staleVerified = await staleCache.verifySongHashes();
    assertEqual(staleVerified.changed, true, "保存：手が空いたときの確認で、書き換えに気づく（画面側はcapabilityを送り直す）");
    assertEqual(
      buildLyricsBattleCapabilityFromHashes({ checkedSongIds: ELIGIBLE_IDS_83, songHashById: staleVerified.songHashById }),
      buildLyricsBattleCapability({ checkedSongIds: ELIGIBLE_IDS_83, songsWithLyrics: toEntries([...backend.data.values()]) }),
      "保存：確認の後の値は、今の歌詞データから計算した値と同じ"
    );

    // localStorageが使えない端末：保存した値は信用しない（ページ内の使い回しだけ）
    const noLs = createFakeLyricsBackend(RECORDS_83, { persistentAvailable: false });
    const noLsStore = createMemoryDerivedStore();
    await makeCache(noLs, noLsStore).getSongHashes();
    assertEqual(noLsStore.dump().length, 0, "保存：版の印が使えない端末では、保存しない（古い値を使う危険を避ける）");

    // 保存場所が壊れていても動く
    const brokenStore = { get: async () => { throw new Error("x"); }, put: async () => { throw new Error("x"); }, delete: async () => { throw new Error("x"); } };
    const broken = await makeCache(createFakeLyricsBackend(RECORDS_83), brokenStore).getSongHashes();
    assertEqual([broken.source, Object.keys(broken.songHashById).length], ["computed", 83], "保存：保存場所が使えなくても、計算して動く");

    // 保存した値に歌詞本文が無い
    assertEqual(containsAnySyntheticLyricLine(store.dump(), RECORDS_83), false, "保存：保存した値（内容ハッシュ）に歌詞本文が含まれない");
    assertEqual(Object.keys(store.dump().find((record) => record.key === "songHashes")).sort(), ["key", "revision", "savedAt", "songHashById", "songIdsSignature", "version"], "保存：保存する項目は版・印・ハッシュだけ");

    // 速さの目安：保存した値からの取り出し
    const memMs = await medianMsAsync(() => cache.getSongHashes(), 5);
    assertEqual(memMs < 10, true, `速さ：ページ内の使い回しからの取り出しが10ms未満（今回 ${memMs.toFixed(2)}ms）`);
    const persistentMs = await medianMsAsync(async () => {
      backend.reloadPage();
      await makeCache(backend, store).getSongHashes();
    }, 5);
    assertEqual(persistentMs < 40, true, `速さ：保存した値からの取り出し（開き直し後）が40ms未満（今回 ${persistentMs.toFixed(2)}ms）`);
  }

  // ===== ② 保存した計算結果：出題しない行番号 =====
  {
    const backend = createFakeLyricsBackend(RECORDS_83);
    const store = createMemoryDerivedStore();
    let computeCount = 0;
    const cache = createLyricsBattleDerivedCache({
      store,
      readRevision: (options) => backend.readRevision(options),
      listStoredSongIds: backend.listStoredSongIds,
      loadRecords: backend.loadRecords,
      computeExclusions: async (entries) => {
        computeCount += 1;
        return computeLyricsUniquenessExclusions(entries);
      },
    });
    const pool = ENTRIES_83.slice(0, 23);
    const expected = computeLyricsUniquenessExclusions(pool);
    const computed = await cache.getPoolExclusions(pool);
    const memory = await cache.getPoolExclusions(pool.map((entry) => ({ ...entry })));
    const persistent = await createLyricsBattleDerivedCache({ store, readRevision: () => ({ persistent: null, session: 0 }), listStoredSongIds: async () => [], loadRecords: async () => new Map(), computeExclusions: async () => { throw new Error("呼ばれないはず"); } }).getPoolExclusions([...pool].reverse());
    assertEqual([computed.source, memory.source, persistent.source, computeCount], ["computed", "memory", "persistent", 1], "除外行の保存：1回だけ計算し、同じページでも開き直した後でも使い回す（並び順が違っても同じ範囲なら同じ）");
    assertEqual(
      [serializeExclusionMap(computed.exclusions), serializeExclusionMap(memory.exclusions), serializeExclusionMap(persistent.exclusions)],
      [serializeExclusionMap(expected), serializeExclusionMap(expected), serializeExclusionMap(expected)],
      "除外行の保存：取り出した値は、その場で計算した値と同じ"
    );
    const changedPool = pool.map((entry, index) => (index === 3 ? { ...entry, lines: entry.lines.map((line, i) => (i === 0 ? { ...line, text: `${line.text}を` } : line)) } : entry));
    const changed = await cache.getPoolExclusions(changedPool);
    assertEqual([changed.source, computeCount], ["computed", 2], "除外行の保存：歌詞が1文字でも違えば、別の計算として扱う");
    const otherPool = await cache.getPoolExclusions(ENTRIES_83.slice(0, 10));
    assertEqual(otherPool.source, "computed", "除外行の保存：出題範囲が違えば、別の計算として扱う");
    for (let i = 0; i < MAX_POOL_EXCLUSION_ENTRIES + 3; i += 1) await cache.getPoolExclusions(ENTRIES_83.slice(i, i + 5));
    const exclusionRecords = store.dump().filter((record) => record.key.startsWith("excl:"));
    assertEqual(exclusionRecords.length <= MAX_POOL_EXCLUSION_ENTRIES, true, `除外行の保存：保存するのは新しい${MAX_POOL_EXCLUSION_ENTRIES}件まで（古いものは消す）`);
    assertEqual(containsAnySyntheticLyricLine(store.dump(), RECORDS_83), false, "除外行の保存：保存した値（キーの元の文字列を含む）に歌詞本文が含まれない");
    assertEqual(deserializeExclusions(serializeExclusions(expected)).size, expected.size, "除外行の保存：保存用の形との変換で曲が欠けない");
    const keyA = computePoolExclusionsCacheKey(pool);
    const keyB = computePoolExclusionsCacheKey(pool, { rulesVersion: 999 });
    assertEqual(keyA.key !== keyB.key, true, "除外行の保存：除外ルールの版が違えばキーも違う");
  }

  // ===== ② 対戦開始の準備（prepareRuntimeContext）：保存を使っても使わなくても同じ問題 =====
  {
    const store = createMemoryDerivedStore();
    const backend = createFakeLyricsBackend(RECORDS_83);
    const cache = makeCache(backend, store);
    const loadEntries = async (songPool) => songPool.filter((id) => SONG_BY_ID.has(id) && backend.data.has(id)).map((id) => ({ song: SONG_BY_ID.get(id), lines: backend.data.get(id).lines }));
    const loadReversed = async (songPool) => (await loadEntries(songPool)).reverse();
    let allSame = true;
    for (const categoryFilterValue of ["title-track", "all"]) {
      const settings = { ...lyricsQuizBattleMode.defaultSettings(), categoryFilterValue, questionCountValue: "10" };
      const plain = await lyricsQuizBattleMode.prepareRuntimeContext({ settings, derivedCache: null, loadEntries });
      const cachedCold = await lyricsQuizBattleMode.prepareRuntimeContext({ settings, derivedCache: cache, loadEntries: loadReversed });
      const cachedWarm = await lyricsQuizBattleMode.prepareRuntimeContext({ settings, derivedCache: makeCache(backend, store), loadEntries });
      if (cachedWarm.exclusionsSource !== "persistent" || cachedCold.exclusionsSource !== "computed") allSame = false;
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const fingerprints = [plain, cachedCold, cachedWarm].map(
          (runtimeContext) => buildLyricsMatchCheckPayload({ matchId: "m", questions: lyricsQuizBattleMode.buildQuestions({ seed, settings, runtimeContext }) }).fingerprint
        );
        if (new Set(fingerprints).size !== 1) allSame = false;
      }
      const availability = [plain, cachedCold, cachedWarm].map((runtimeContext) => lyricsQuizBattleMode.checkRuntimeAvailability({ runtimeContext, settings }));
      if (JSON.stringify(availability[0]) !== JSON.stringify(availability[1]) || JSON.stringify(availability[0]) !== JSON.stringify(availability[2])) allSame = false;
    }
    assertEqual(allSame, true, "開始の準備：保存なし・保存して計算・保存から取り出し、のどれでも開始前チェックと問題（10seed×表題曲のみ／全曲）が完全に同じ（読み込み順が違っても同じ）");

    const { lyricsUniquenessRulesVersion, ...legacy } = lyricsQuizBattleMode.defaultSettings();
    const legacyContext = await lyricsQuizBattleMode.prepareRuntimeContext({ settings: legacy, derivedCache: cache, loadEntries });
    assertEqual(
      [legacyContext.exclusionsSource, legacyContext.songsWithLyrics.some((entry) => "uniqueExcludedLineNumbers" in entry)],
      [null, false],
      "開始の準備：版の無い部屋（除外なし）では除外行を付けない"
    );
    const prewarmSettings = { ...lyricsQuizBattleMode.defaultSettings(), questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ELIGIBLE_IDS_83.slice(30, 50) } };
    const freshCache = makeCache(backend, createMemoryDerivedStore());
    const prewarm = await lyricsQuizBattleMode.prewarmRuntimeContext({ settings: prewarmSettings, derivedCache: freshCache, loadEntries });
    const afterPrewarm = await lyricsQuizBattleMode.prepareRuntimeContext({ settings: prewarmSettings, derivedCache: freshCache, loadEntries });
    assertEqual([prewarm.exclusionsSource, afterPrewarm.exclusionsSource], ["computed", "memory"], "開始の準備：ロビーで事前計算しておけば、開始時は計算しない");
    const annotated = await annotateEntriesWithPoolExclusions(ENTRIES_83.slice(0, 5), freshCache);
    assertEqual(containsAnySyntheticLyricLine(annotated.entries.map((entry) => entry.uniqueExcludedLineNumbers), RECORDS_83), false, "開始の準備：付ける値は行番号だけ");
  }

  // ===== ⑤ 「確認中」の待ち・途中参加・入り直し =====
  {
    const HOST = "host";
    const settings = {
      ...lyricsQuizBattleMode.defaultSettings(),
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ELIGIBLE_IDS_83.slice(0, 10) },
      questionCountValue: "5",
    };
    const capability = buildLyricsBattleCapability({ checkedSongIds: ELIGIBLE_IDS_83, songsWithLyrics: ENTRIES_83 });
    const newCoverage = buildLyricsCoveragePayload({ availableCount: 10, requiredCount: 10, poolHash: "p", capability });
    const oldCoverage = buildLyricsCoveragePayload({ availableCount: 10, requiredCount: 10, poolHash: "p" });
    const host = { name: "ホスト", lyricsCoverage: newCoverage };

    function fakeClock() {
      let now = 0;
      const sleeps = [];
      return { nowMs: () => now, sleep: async (ms) => { sleeps.push(ms); now += ms; }, sleeps };
    }

    // 入室直後の人の確認が、少し待ったら届く → 止めずに開始できる
    {
      const clock = fakeClock();
      let reloads = 0;
      const message = await lyricsQuizBattleMode.waitForParticipantCompatibility({
        settings,
        hostUid: HOST,
        players: { [HOST]: host, late: { name: "途中さん" } },
        reloadPlayers: async () => {
          reloads += 1;
          return { [HOST]: host, late: reloads >= 3 ? { name: "途中さん", lyricsCoverage: newCoverage } : { name: "途中さん" } };
        },
        sleep: clock.sleep,
        nowMs: clock.nowMs,
      });
      assertEqual([message, reloads], [null, 3], "確認中：入室直後の人の確認が1.5秒後に届けば、止めずに開始できる（全員新しいアプリで誤って止めない）");
    }
    // 待っても届かない → 「入り直してもらう」案内（誰か入り）
    {
      const clock = fakeClock();
      const message = await lyricsQuizBattleMode.waitForParticipantCompatibility({
        settings,
        hostUid: HOST,
        players: { [HOST]: host, late: { name: "途中さん" } },
        reloadPlayers: async () => ({ [HOST]: host, late: { name: "途中さん" } }),
        sleep: clock.sleep,
        nowMs: clock.nowMs,
      });
      assertEqual(
        typeof message === "string" && message.includes("途中さん") && message.includes("入り直して"),
        true,
        "確認中：数秒待っても届かなければ、誰に入り直してもらうかを書いて止める"
      );
      assertEqual(clock.nowMs() >= 6000 && clock.nowMs() < 7000, true, "確認中：待つのは約6秒まで");
    }
    // 古いアプリ → 待たずにすぐ止める
    {
      const clock = fakeClock();
      const message = await lyricsQuizBattleMode.waitForParticipantCompatibility({
        settings,
        hostUid: HOST,
        players: { [HOST]: host, old: { name: "古いさん", lyricsCoverage: oldCoverage } },
        reloadPlayers: async () => {
          throw new Error("呼ばれないはず");
        },
        sleep: clock.sleep,
        nowMs: clock.nowMs,
      });
      assertEqual([clock.sleeps.length, message.includes("古いさん") && message.includes("アプリを更新")], [0, true], "確認中：古いアプリの人がいれば待たずに止める（誰が更新するかを書く）");
    }
    // 読み直しに失敗 → それ以上待たずに案内
    {
      const clock = fakeClock();
      const result = await waitForLyricsBattleCompatibility({
        players: { [HOST]: host, late: { name: "途中さん" } },
        evaluate: (players) => evaluateLyricsBattleCompatibility({ settings, songPool: lyricsQuizBattleMode.resolveSettingsSongPool(settings), hostUid: HOST, players }),
        reloadPlayers: async () => null,
        sleep: clock.sleep,
        nowMs: clock.nowMs,
      });
      assertEqual([result.timedOut, clock.sleeps.length], [true, 1], "確認中：Firebaseを読み直せなければ、それ以上待たずに止める");
      assertEqual(isCompatibilityPendingOnly(result.evaluation), true, "確認中：「確認中だけ」の判定ができる");
    }
    // 入り直し：アプリを開き直した参加者は、保存した値から同じcapabilityを作る → そのまま照合が通る
    {
      const backend = createFakeLyricsBackend(RECORDS_83);
      const store = createMemoryDerivedStore();
      const before = buildLyricsBattleCapabilityFromHashes({ checkedSongIds: ELIGIBLE_IDS_83, songHashById: (await makeCache(backend, store).getSongHashes()).songHashById });
      backend.reloadPage();
      const after = buildLyricsBattleCapabilityFromHashes({ checkedSongIds: ELIGIBLE_IDS_83, songHashById: (await makeCache(backend, store).getSongHashes()).songHashById });
      assertEqual(after, before, "入り直し：開き直した後も同じcapabilityになる");
      const rejoined = { [HOST]: host, back: { name: "戻ったさん", lyricsCoverage: buildLyricsCoveragePayload({ availableCount: 10, requiredCount: 10, poolHash: "p", capability: after }) } };
      assertEqual(lyricsQuizBattleMode.validateParticipantCompatibility({ settings, players: rejoined, hostUid: HOST }), null, "入り直し：戻った人もそのまま照合が通る");
    }
    // 案内文に歌詞本文が含まれない
    {
      const texts = Object.values(COMPAT_PROBLEM).flatMap((kind) => [
        describeCompatProblem({ uid: "x", kind, count: 2 }, { displayNameByUid: { x: "テスト" }, viewerUid: HOST, hostUid: HOST }),
        describeCompatProblem({ uid: "x", kind, count: 2, timedOut: true }, { displayNameByUid: { x: "テスト" }, viewerUid: "x", hostUid: HOST }),
      ]);
      assertEqual(containsAnySyntheticLyricLine(texts, RECORDS_83), false, "案内文：どの案内にも歌詞本文が含まれない");
      const payload = buildLyricsCoveragePayload({ availableCount: 10, requiredCount: 10, poolHash: "p", capability });
      assertEqual(containsAnySyntheticLyricLine(payload, RECORDS_83), false, "Firebaseへ送る値：capabilityに歌詞本文が含まれない");
    }
  }
}
