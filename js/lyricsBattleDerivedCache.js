// オンライン歌詞クイズ対戦の「入室・開始を速くする」ための、歌詞データから計算した値の保存場所
// （2026-10-28新設・本人指示）。
//
// 【何を速くするか】ロビーに入るたびに、
//   ・歌詞クイズ対象の全曲（約80曲）の歌詞データを読み込み、曲ごとの内容ハッシュを計算する（capability）
//   ・対戦開始のたびに「答えが1曲に決まらない行」を計算する（数千行どうしの比較）
// を行っていた。どちらも「歌詞データが変わらなければ毎回同じ結果」になる計算なので、結果だけを
// 保存しておき、次からは計算せずに使う。
//
// 【保存するもの（歌詞本文は保存しない）】
//   ・曲ID→内容ハッシュ（8桁の16進数）の一覧（Firebaseへ送っているcapabilityと同じ値）
//   ・出題範囲ごとの「出題しない行番号」（曲ID→行番号の配列）
// 保存先は歌詞データ本体とは別のIndexedDBデータベース（equalLoveIntroQuizLyricsDerived）。
// 歌詞データ本体のデータベース（js/lyricsStorage.js）の形は一切変えない（古いアプリが同じ端末で
// 開いても壊れないようにするため）。この保存場所は消えても困らない（消えたら計算し直すだけ）。
//
// 【古い結果を使わないための確認】
//   ・曲ごとの内容ハッシュ：js/lyricsStorage.jsが歌詞データを保存・削除するたびに変える「版の印」
//     （getLyricsDataRevision()）と、保存されている曲IDの一覧（中身は読まずにキーだけ取得）が、
//     保存したときと同じ場合だけ使う。さらに、保存した結果を使ったときは、ロビーの表示が
//     終わって手が空いたときに1回だけ（そのページの中で1回）歌詞データを読み直して確かめ、
//     違っていれば作り直す（verifySongHashes()。印を書き換えない経路＝古いアプリの別タブ等への保険）。
//   ・出題しない行番号：出題範囲の曲の「その場で読み込んだ歌詞」から計算した内容ハッシュ・行数と、
//     除外ルールの版・一覧のハッシュを組み合わせた文字列が完全に一致する場合だけ使う
//     （歌詞が1文字でも違えば別の計算として扱う。印の仕組みには頼らない）。
//
// 【テスト】保存場所（store）・版の印・歌詞データの読み込みは差し替えられるようにしてある
// （tests/lyricsBattlePerfMatrix.test.jsは、メモリ上の保存場所とダミー歌詞で確かめる）。

import { computeLyricsContentHash } from "./lyricsSegmentEngine.js";
import { getLyricsDataMany, getImportedLyricsSongIds, getLyricsDataRevision } from "./lyricsStorage.js";
import {
  LYRICS_UNIQUENESS_RULES_VERSION,
  MIN_UNIQUE_FRAGMENT_LENGTH,
  computeLyricsUniquenessExclusionsAsync,
} from "./lyricsQuestionUniqueness.js";
import { computeLyricsTablesSignature, hashStringToHex } from "./lyricsQuizBattleCompatibility.js";

// 保存する値の形の版。形を変えたら上げる（古い形の保存は使われず、計算し直される）。
export const LYRICS_DERIVED_CACHE_VERSION = 1;
// 出題範囲ごとの「出題しない行番号」を、いくつまで保存しておくか（古いものから消す）。
export const MAX_POOL_EXCLUSION_ENTRIES = 8;

const SONG_HASHES_RECORD_KEY = "songHashes";
const POOL_EXCLUSION_KEY_PREFIX = "excl:";
const POOL_EXCLUSION_LIST_KEY = "exclusionKeys";

// ===== 純粋関数（キー・形の変換） =====

// 保存されている曲IDの一覧の印（曲の追加・削除に気づくため）。
export function computeSongIdsSignature(songIds) {
  const sorted = [...new Set(songIds ?? [])].sort();
  return `${sorted.length}:${hashStringToHex(sorted.join("\u0001"))}`;
}

// 出題範囲の「出題しない行番号」の計算に効くもの全部を1本の文字列にする。
// entries : { song, lines }[]（出題範囲の曲で、この端末に歌詞がある曲）
// 戻り値  : { key（保存のキー。短い）, source（完全な文字列。取り出すときに一致を確かめる） }
export function computePoolExclusionsCacheKey(
  entries,
  {
    rulesVersion = LYRICS_UNIQUENESS_RULES_VERSION,
    tablesSignature = computeLyricsTablesSignature(),
    minFragmentLength = MIN_UNIQUE_FRAGMENT_LENGTH,
  } = {}
) {
  const songParts = (entries ?? [])
    .map((entry) => `${entry.song.id}=${computeLyricsContentHash(entry.lines ?? [])}.${(entry.lines ?? []).length}`)
    .sort();
  const source = `v${LYRICS_DERIVED_CACHE_VERSION}|r${rulesVersion}|t${tablesSignature}|m${minFragmentLength}|${songParts.join(";")}`;
  return { key: `${POOL_EXCLUSION_KEY_PREFIX}${hashStringToHex(source)}${hashStringToHex([...source].reverse().join(""))}`, source };
}

// Map<songId, Set|number[]> ⇔ 保存用の { songId: number[] }（並び順は保つ）
export function serializeExclusions(exclusions) {
  const result = {};
  for (const [songId, lineNumbers] of exclusions ?? new Map()) result[songId] = [...lineNumbers];
  return result;
}

export function deserializeExclusions(serialized) {
  const result = new Map();
  for (const [songId, lineNumbers] of Object.entries(serialized ?? {})) {
    if (Array.isArray(lineNumbers)) result.set(songId, [...lineNumbers]);
  }
  return result;
}

// 曲ごとの歌詞（{ songId, lines }のレコード）から、曲ID→内容ハッシュの一覧を作る。
export function computeSongHashesFromRecords(recordsBySongId) {
  const songHashById = {};
  for (const [songId, record] of recordsBySongId ?? new Map()) {
    if (Array.isArray(record?.lines)) songHashById[songId] = computeLyricsContentHash(record.lines);
  }
  return songHashById;
}

function sameSongHashes(a, b) {
  const keysA = Object.keys(a ?? {});
  const keysB = Object.keys(b ?? {});
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

// ===== 保存場所 =====

// テスト用：メモリ上の保存場所（IndexedDBと同じ使い方ができる）。
export function createMemoryDerivedStore() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? structuredCloneSafe(map.get(key)) : null;
    },
    async put(record) {
      map.set(record.key, structuredCloneSafe(record));
    },
    async delete(key) {
      map.delete(key);
    },
    // テストで中身を確かめるため（保存した値に歌詞本文が無いこと等）。
    dump() {
      return [...map.values()].map(structuredCloneSafe);
    },
  };
}

function structuredCloneSafe(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

const DERIVED_DB_NAME = "equalLoveIntroQuizLyricsDerived";
const DERIVED_DB_VERSION = 1;
const DERIVED_STORE_NAME = "derived";

// 本番用：IndexedDBの保存場所。失敗してもエラーにせず「保存が無い」として扱う（計算し直すだけ）。
// 接続は使い回す（スマホではデータベースを開くたびに数ミリ秒〜かかるため）。
export function createIndexedDbDerivedStore() {
  let connectionPromise = null;

  function openConnection() {
    if (connectionPromise) return connectionPromise;
    connectionPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("indexedDB is not available"));
        return;
      }
      const request = indexedDB.open(DERIVED_DB_NAME, DERIVED_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DERIVED_STORE_NAME)) db.createObjectStore(DERIVED_STORE_NAME, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        // 別のタブが新しい版で開こうとしたら、こちらの接続を閉じて邪魔をしない。
        db.onversionchange = () => {
          db.close();
          connectionPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      connectionPromise = null;
      throw error;
    });
    return connectionPromise;
  }

  async function run(mode, action) {
    const db = await openConnection();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DERIVED_STORE_NAME, mode);
      const request = action(tx.objectStore(DERIVED_STORE_NAME));
      tx.oncomplete = () => resolve(request?.result ?? null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    async get(key) {
      try {
        return (await run("readonly", (store) => store.get(key))) ?? null;
      } catch {
        return null;
      }
    },
    async put(record) {
      try {
        await run("readwrite", (store) => store.put(record));
      } catch {
        // 保存できなくても動作は変わらない（次回も計算するだけ）
      }
    },
    async delete(key) {
      try {
        await run("readwrite", (store) => store.delete(key));
      } catch {
        // 同上
      }
    },
  };
}

// ===== 使い回しの本体 =====
//
// store             : 保存場所（get/put/delete）
// readRevision      : ({ ensure }) => { persistent, session }（js/lyricsStorage.jsのgetLyricsDataRevision）
// listStoredSongIds : () => 歌詞データがある曲IDの配列（中身は読まない）
// loadRecords       : (songIds) => Map<songId, record>（歌詞データの読み込み）
// computeExclusions : (entries) => Promise<Map<songId, Set|number[]>>（出題しない行の計算）
export function createLyricsBattleDerivedCache({
  store: rawStore,
  readRevision,
  listStoredSongIds,
  loadRecords,
  computeExclusions = (entries) => computeLyricsUniquenessExclusionsAsync(entries),
}) {
  // 保存場所の失敗（容量不足・プライベートモード等）は「保存が無い」として扱い、計算し直すだけにする。
  const store = {
    async get(key) {
      try {
        return (await rawStore.get(key)) ?? null;
      } catch {
        return null;
      }
    },
    async put(record) {
      try {
        await rawStore.put(record);
      } catch {
        // 保存できなくても動作は変わらない
      }
    },
    async delete(key) {
      try {
        await rawStore.delete(key);
      } catch {
        // 同上
      }
    },
  };
  // ページの中での使い回し（データベースも読まない一番速い経路）。
  let songHashMemory = null; // { persistent, session, songIdsSignature, songHashById, verified }
  let inFlightSongHashes = null;
  const exclusionMemory = new Map(); // key → { source, exclusions(serialized) }（新しいものほど後ろ）
  const stats = { songHashes: { memory: 0, persistent: 0, computed: 0 }, exclusions: { memory: 0, persistent: 0, computed: 0 } };

  function revisionMatchesMemory(revision) {
    return !!songHashMemory && songHashMemory.persistent === revision.persistent && songHashMemory.session === revision.session;
  }

  async function computeAndStoreSongHashes() {
    // 読み込みより前の印を記録する（読み込み中に別の保存があった場合、次回は印が違うので計算し直される）。
    const revision = readRevision({ ensure: true });
    const storedIds = await listStoredSongIds();
    const songIdsSignature = computeSongIdsSignature(storedIds);
    const records = await loadRecords(storedIds);
    const songHashById = computeSongHashesFromRecords(records);
    if (revision.persistent !== null) {
      await store.put({
        key: SONG_HASHES_RECORD_KEY,
        version: LYRICS_DERIVED_CACHE_VERSION,
        revision: revision.persistent,
        songIdsSignature,
        songHashById,
        savedAt: Date.now(),
      });
    }
    songHashMemory = { ...revision, songIdsSignature, songHashById, verified: true };
    return songHashById;
  }

  // 曲ID→内容ハッシュ（歌詞データがある全曲）。
  // 戻り値: { songHashById, source: "memory"|"persistent"|"computed", needsVerification }
  async function getSongHashes() {
    const revision = readRevision();
    if (revisionMatchesMemory(revision)) {
      stats.songHashes.memory += 1;
      return { songHashById: { ...songHashMemory.songHashById }, source: "memory", needsVerification: !songHashMemory.verified };
    }
    if (inFlightSongHashes) return inFlightSongHashes;
    inFlightSongHashes = (async () => {
      try {
        if (revision.persistent !== null) {
          const [stored, storedIds] = await Promise.all([store.get(SONG_HASHES_RECORD_KEY), listStoredSongIds()]);
          const songIdsSignature = computeSongIdsSignature(storedIds);
          if (
            stored &&
            stored.version === LYRICS_DERIVED_CACHE_VERSION &&
            stored.revision === revision.persistent &&
            stored.songIdsSignature === songIdsSignature &&
            stored.songHashById &&
            typeof stored.songHashById === "object"
          ) {
            songHashMemory = { ...revision, songIdsSignature, songHashById: stored.songHashById, verified: false };
            stats.songHashes.persistent += 1;
            return { songHashById: { ...stored.songHashById }, source: "persistent", needsVerification: true };
          }
        }
        const songHashById = await computeAndStoreSongHashes();
        stats.songHashes.computed += 1;
        return { songHashById: { ...songHashById }, source: "computed", needsVerification: false };
      } finally {
        inFlightSongHashes = null;
      }
    })();
    return inFlightSongHashes;
  }

  // 保存した結果を使ったあと、手が空いたときに1回だけ呼ぶ確認。歌詞データを読み直して計算し、
  // 保存していた値と違えば作り直す。戻り値: { changed, songHashById }
  async function verifySongHashes() {
    if (songHashMemory?.verified) return { changed: false, songHashById: { ...songHashMemory.songHashById } };
    const before = songHashMemory?.songHashById ?? null;
    const songHashById = await computeAndStoreSongHashes();
    return { changed: before !== null && !sameSongHashes(before, songHashById), songHashById: { ...songHashById } };
  }

  function rememberExclusions(key, source, serialized) {
    exclusionMemory.delete(key);
    exclusionMemory.set(key, { source, exclusions: serialized });
    while (exclusionMemory.size > MAX_POOL_EXCLUSION_ENTRIES) exclusionMemory.delete(exclusionMemory.keys().next().value);
  }

  async function rememberPersistentExclusionKey(key) {
    const list = await store.get(POOL_EXCLUSION_LIST_KEY);
    const keys = (Array.isArray(list?.keys) ? list.keys : []).filter((existing) => existing !== key);
    keys.push(key);
    const removed = keys.splice(0, Math.max(0, keys.length - MAX_POOL_EXCLUSION_ENTRIES));
    await store.put({ key: POOL_EXCLUSION_LIST_KEY, keys });
    for (const oldKey of removed) await store.delete(oldKey);
  }

  // 出題範囲の曲（entries）の「出題しない行番号」。保存があればそれを、無ければ計算して保存する。
  // 戻り値: { exclusions: Map<songId, number[]>, source }
  async function getPoolExclusions(entries) {
    const { key, source } = computePoolExclusionsCacheKey(entries);
    const remembered = exclusionMemory.get(key);
    if (remembered && remembered.source === source) {
      rememberExclusions(key, source, remembered.exclusions);
      stats.exclusions.memory += 1;
      return { exclusions: deserializeExclusions(remembered.exclusions), source: "memory" };
    }
    const stored = await store.get(key);
    if (stored && stored.version === LYRICS_DERIVED_CACHE_VERSION && stored.source === source && stored.exclusions) {
      rememberExclusions(key, source, stored.exclusions);
      stats.exclusions.persistent += 1;
      return { exclusions: deserializeExclusions(stored.exclusions), source: "persistent" };
    }
    const computed = await computeExclusions(entries);
    const serialized = serializeExclusions(computed);
    rememberExclusions(key, source, serialized);
    await store.put({ key, version: LYRICS_DERIVED_CACHE_VERSION, source, exclusions: serialized, savedAt: Date.now() });
    await rememberPersistentExclusionKey(key);
    stats.exclusions.computed += 1;
    return { exclusions: deserializeExclusions(serialized), source: "computed" };
  }

  return {
    getSongHashes,
    verifySongHashes,
    getPoolExclusions,
    // ページの中の使い回しを捨てる（歌詞データの追加インポート直後など）。保存した値は印で判断される。
    clearMemory() {
      songHashMemory = null;
      exclusionMemory.clear();
    },
    getStats() {
      return JSON.parse(JSON.stringify(stats));
    },
  };
}

// 出題範囲の曲に、保存（または計算）した「出題しない行番号」を付けた新しい配列を返す。
// js/lyricsQuizQuestionBuilder.jsは、各曲のuniqueExcludedLineNumbersがあればそれを使うため、
// 問題を作るときに計算し直さない。付ける値は、builderが自分で計算した場合と全く同じ
// （オンライン対戦の比較相手は出題範囲の曲だけ＝computeLyricsUniquenessExclusions(entries)と同じ計算）。
export async function annotateEntriesWithPoolExclusions(entries, cache) {
  const { exclusions, source } = await cache.getPoolExclusions(entries);
  return {
    source,
    entries: entries.map((entry) => ({ ...entry, uniqueExcludedLineNumbers: [...(exclusions.get(entry.song.id) ?? [])] })),
  };
}

// アプリ本体が使う、ただ1つの使い回しの本体。
export const defaultLyricsBattleDerivedCache = createLyricsBattleDerivedCache({
  store: createIndexedDbDerivedStore(),
  readRevision: (options) => getLyricsDataRevision(options),
  listStoredSongIds: () => getImportedLyricsSongIds(),
  loadRecords: (songIds) => getLyricsDataMany(songIds),
});
