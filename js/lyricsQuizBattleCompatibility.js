// 歌詞クイズ オンライン対戦で「参加者全員の端末が、全く同じ問題（同じ正解・同じヒントの行）を
// 作れるか」を確かめるための、純粋関数だけのファイル（2026-10-28新設）。
//
// 【何を防ぐか】オンライン歌詞クイズは、Firebaseへseedと設定だけを送り、各端末が自分の
// 歌詞データから問題を組み立てる方式。そのため次のどれかがあると、端末ごとにヒントの行
// （ひどい場合は出題される曲・順番）がずれ、公平な対戦にならない：
//   ①「答えが1曲に決まらない行の除外」（js/lyricsQuestionUniqueness.js）を知らない古いアプリが混ざる
//   ② 除外ルールの版・事前計算の一覧（js/data/lyricsAmbiguityIndex.js）・手作業の一覧が端末ごとに違う
//   ③ 歌詞データ（行・時刻）の版が端末ごとに違う（データパックの入れ違い等）
//   ④ 出題する曲の歌詞データを持っていない端末がある
//   ⑤ 曲の一覧（曲名・別名）が違う（曲名を含む行の判定・回答候補が変わる）
//
// 【仕組み（今の本番データベースルールのままで動く）】
//   A. 開始前：各端末が「自分はどの版の問題を作れるか」（capability）を、既にある
//      players/{uid}/lyricsCoverage の中へ一緒に書く。ルールは players/{uid} 配下の
//      未知の子要素を拒否しないため、ルール変更・デプロイは不要
//      （tests/lyricsQuizBattleCompatibility.test.js でルールファイルを読んで確認している）。
//      ホストは対戦開始の直前に、全員のcapabilityを自分のものと照合し、1人でも同じ問題を
//      作れない人がいれば開始しない（理由を画面に出す）。capabilityを書かない＝この仕組みを
//      知らない古いアプリは「capabilityが無い」ことで見分けられる。
//   B. 開始後：各端末が、実際に作った問題の「指紋」（曲ID・ヒントの行番号・回答候補の曲IDを
//      ハッシュ化した短い文字列。歌詞本文は含まない）を players/{uid}/lyricsMatchCheck へ書く。
//      ホストは全員の指紋を自分のものと比べ、1人でも違えばその対戦を中止してロビーへ戻す
//      （Aをすり抜けた想定外のずれ＝開始直前の歌詞データの入れ替え等に備える安全網）。
//
// 【重要・著作権】このファイルが作る値・Firebaseへ送る値には、歌詞本文を一切含めない。
// 送るのは「版の番号」「一覧・曲データ全体のハッシュ」「曲IDごとの内容ハッシュ」
// 「問題ごとのハッシュ」だけ（内容ハッシュはjs/data/lyricsAmbiguityIndex.jsで既に公開して
// いる値と同じ計算式で、ハッシュから歌詞を復元することはできない）。
//
// 【純粋関数】DOM・IndexedDB・Firebaseには触れない（テストはダミー歌詞だけで行う）。

import { computeLyricsContentHash } from "./lyricsSegmentEngine.js";
import { LYRICS_UNIQUENESS_RULES_VERSION } from "./lyricsQuestionUniqueness.js";
import { LYRICS_AMBIGUITY_INDEX } from "./data/lyricsAmbiguityIndex.js";
import { LYRICS_UNIQUENESS_MANUAL_EXCLUSIONS } from "./data/lyricsUniquenessManualList.js";
import { SONGS } from "./data/songs.js";

// capability・指紋の「形式」の版。形式そのもの（どのフィールドをどう書くか）を変えたら上げる。
export const LYRICS_BATTLE_COMPAT_FORMAT_VERSION = 1;

// 問題の組み立て方（js/lyricsSegmentEngine.jsのヒント候補・抽選、js/lyricsQuizQuestionBuilder.jsの
// 出題曲の選び方、js/lyricsQuizEngine.jsの回答候補の作り方）の版。
// 【番号を上げるとき】同じseed・同じ歌詞から作られる問題が1問でも変わる修正をしたとき
// （古いアプリと新しいアプリが同じ部屋にいると、ヒントの行がずれるため）。
export const LYRICS_QUESTION_ENGINE_VERSION = 1;

// 端末に歌詞データが無い曲を、songHashesの中で表す印。
export const MISSING_LYRICS_MARK = "-";

// 32ビットのFNV-1aハッシュを、8桁の16進数文字列にする（暗号強度は不要。端末間の食い違いを
// 見つけられればよい）。js/lyricsSegmentEngine.jsのcomputeLyricsContentHash()と同じ計算式。
export function hashStringToHex(source) {
  const text = String(source ?? "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// 除外ルールの版＋2つの一覧（事前計算・手作業）の中身をまとめたハッシュ。
// 版の番号を上げ忘れたまま一覧だけ作り直した場合でも、端末間の違いを見つけられるようにする。
// 【2026-10-28追加】引数なし（アプリ本体の一覧）の結果は変わらないので、1回だけ計算して使い回す
// （一覧全体をJSON化するため、入室のたび・キャッシュのキーを作るたびに計算し直すと無駄になる）。
let defaultTablesSignatureMemo = null;
export function computeLyricsTablesSignature(options) {
  if (options === undefined) {
    defaultTablesSignatureMemo ??= computeLyricsTablesSignatureUncached({});
    return defaultTablesSignatureMemo;
  }
  return computeLyricsTablesSignatureUncached(options);
}

function computeLyricsTablesSignatureUncached({
  rulesVersion = LYRICS_UNIQUENESS_RULES_VERSION,
  ambiguityIndex = LYRICS_AMBIGUITY_INDEX,
  manualExclusions = LYRICS_UNIQUENESS_MANUAL_EXCLUSIONS,
} = {}) {
  return hashStringToHex(`${rulesVersion}|${JSON.stringify(ambiguityIndex)}|${JSON.stringify(manualExclusions)}`);
}

// 曲の一覧（曲ID・曲名・別名）のハッシュ。曲名を含む行の判定（ヒントから外す）と
// 回答候補の作り方がこの一覧に依存するため、違うと問題がずれる。
let defaultCatalogSignatureMemo = null;
export function computeSongCatalogSignature(songs = SONGS) {
  if (songs === SONGS && defaultCatalogSignatureMemo !== null) return defaultCatalogSignatureMemo;
  const signature = computeSongCatalogSignatureUncached(songs);
  if (songs === SONGS) defaultCatalogSignatureMemo = signature;
  return signature;
}

function computeSongCatalogSignatureUncached(songs) {
  const source = songs
    .map((song) => `${song.id}\u0001${song.title}\u0001${(song.searchAliases ?? []).join("\u0002")}`)
    .join("\u0003");
  return hashStringToHex(source);
}

// 曲IDごとの内容ハッシュを、Firebaseへ書きやすい1本の文字列にする（"曲ID=ハッシュ;曲ID=-;..."）。
// オブジェクトのキーにしないのは、数字だけの曲ID（例："866"）があるとFirebaseが配列として
// 扱う場合があり、読み戻したときの形が端末ごとに変わる危険を避けるため。
export function encodeSongHashes(songHashById) {
  return Object.keys(songHashById)
    .sort()
    .map((songId) => `${songId}=${songHashById[songId]}`)
    .join(";");
}

export function decodeSongHashes(encoded) {
  const result = {};
  if (typeof encoded !== "string" || encoded.length === 0) return result;
  for (const part of encoded.split(";")) {
    const separatorIndex = part.lastIndexOf("=");
    if (separatorIndex <= 0) continue;
    result[part.slice(0, separatorIndex)] = part.slice(separatorIndex + 1);
  }
  return result;
}

// この端末の capability（同じ問題を作れるかを照合するための情報）を組み立てる。
// checkedSongIds: 確認した曲ID（ふつうは歌詞クイズ対象の全曲。出題範囲が後で絞り込まれても
//   照合できるよう、出題範囲より広く確認しておく）
// songsWithLyrics: その中で端末に歌詞データがあった曲（{ song, lines }[]）
export function buildLyricsBattleCapability({ checkedSongIds, songsWithLyrics }) {
  const songHashById = {};
  for (const entry of songsWithLyrics ?? []) {
    // 同じ曲IDが複数あれば後のものを使う（以前の実装＝new Map()に入れた場合と同じ）。
    if (entry?.song?.id === undefined) continue;
    if (Array.isArray(entry.lines)) songHashById[entry.song.id] = computeLyricsContentHash(entry.lines);
    else delete songHashById[entry.song.id];
  }
  return buildLyricsBattleCapabilityFromHashes({ checkedSongIds, songHashById });
}

// 【2026-10-28新設・本人指示：入室を速くする】曲ごとの内容ハッシュが既に分かっている場合
// （js/lyricsBattleDerivedCache.jsに保存した値）に、歌詞データを読まずにcapabilityを作る。
// buildLyricsBattleCapability()と全く同じ値になる（テストで確認）。
// songHashById: 曲ID→内容ハッシュ（歌詞データがある曲だけ。無い曲は「-」になる）
export function buildLyricsBattleCapabilityFromHashes({ checkedSongIds, songHashById }) {
  const checkedHashes = {};
  for (const songId of checkedSongIds ?? []) {
    const hash = songHashById?.[songId];
    checkedHashes[songId] = typeof hash === "string" ? hash : MISSING_LYRICS_MARK;
  }
  const songHashes = encodeSongHashes(checkedHashes);
  return {
    v: LYRICS_BATTLE_COMPAT_FORMAT_VERSION,
    uniquenessRulesVersion: LYRICS_UNIQUENESS_RULES_VERSION,
    engineVersion: LYRICS_QUESTION_ENGINE_VERSION,
    tablesSignature: computeLyricsTablesSignature(),
    catalogSignature: computeSongCatalogSignature(),
    songHashes,
  };
}

// 照合で見つかった問題の種類（画面の文言・テストで使う識別子）。
export const COMPAT_PROBLEM = {
  CHECKING: "checking", // まだ確認結果が届いていない（数秒で解消するはず）
  OUTDATED_APP: "outdated-app", // その人のアプリが古い（capabilityが無い・版が低い）
  HOST_APP_OUTDATED: "host-app-outdated", // その人のアプリの方が新しく、ホスト（部屋の設定）が古い
  VERSION_MISMATCH: "version-mismatch", // 版の番号は同じなのに中身が違う等（全員の更新が必要）
  MISSING_LYRICS: "missing-lyrics", // 出題する曲の歌詞データが無い
  LYRICS_MISMATCH: "lyrics-mismatch", // 歌詞データの版（内容）がホストと違う
  // 【2026-10-28追加】除外ルールの版がある部屋なのに、ホストがcapabilityを書かない古いアプリ。
  // v382以前（除外しない）とv383（除外する）は、Firebaseへ書く値が全く同じで見分けられないため、
  // 新しいアプリの参加者は「ホストと同じ問題を作れる」と保証できない（js/battleModes/lyricsQuizBattleMode.jsの
  // 版の対応表・tools/feature-research/2026-10-28/lyrics-battle-perf-matrix-report.md参照）。
  HOST_UNVERIFIABLE: "host-unverifiable",
};

export const COMPAT_ROOM_MODE = {
  UNIQUE: "unique", // 部屋の設定に除外ルールの版がある（この機能に対応したホストが作った部屋）
  LEGACY: "legacy", // 版が無い（古いアプリのホストが作った部屋）→全員除外なしで作る
};

function compareNumber(a, b) {
  if (typeof a !== "number" || typeof b !== "number") return null;
  return a === b ? 0 : a < b ? -1 : 1;
}

// 版の番号どうしを比べ、問題があればその種類を返す（無ければnull）。
// reference: 基準（ホスト・部屋）の値、target: 照合する人の値
function classifyVersionGap(targetValue, referenceValue) {
  const order = compareNumber(targetValue, referenceValue);
  if (order === null) return COMPAT_PROBLEM.OUTDATED_APP; // 値が無い＝その版を知らない古いアプリ
  if (order < 0) return COMPAT_PROBLEM.OUTDATED_APP;
  if (order > 0) return COMPAT_PROBLEM.HOST_APP_OUTDATED;
  return null;
}

// 出題範囲の曲について、2人の songHashes を比べる。
// 戻り値: { checking: boolean, missingCount（targetに無い）, referenceMissingCount（基準側に無い）, mismatchCount }
function compareSongHashesForPool(targetHashes, referenceHashes, songPool) {
  let checking = false;
  let missingCount = 0;
  let referenceMissingCount = 0;
  let mismatchCount = 0;
  for (const songId of songPool) {
    const target = targetHashes[songId];
    const reference = referenceHashes[songId];
    if (target === undefined || reference === undefined) {
      checking = true; // その曲をまだ確認していない（出題範囲が変わった直後など）
      continue;
    }
    if (target === reference) continue; // 両方とも同じ内容（両方とも無い場合も「同じ入力」なので一致）
    if (target === MISSING_LYRICS_MARK) missingCount += 1;
    else if (reference === MISSING_LYRICS_MARK) referenceMissingCount += 1;
    else mismatchCount += 1;
  }
  return { checking, missingCount, referenceMissingCount, mismatchCount };
}

function readCapability(player) {
  const capability = player?.lyricsCoverage?.capability;
  return capability && typeof capability === "object" ? capability : null;
}

// 部屋の参加者全員が、ホストと全く同じ問題を作れるかを判定する。
// settings : room.settings（対戦開始時に実際に使う、共通曲へ絞り込んだ後の設定）
// songPool : settingsから解決した、実際の出題範囲の曲ID
// hostUid  : ホストのuid（ホストのcapabilityを基準にする）
// players  : room.players（各自のlyricsCoverage.capabilityを読む）
// 戻り値: { ok, mode, unverified, problems: [{ uid, kind, count }] }
//   unverified … 古いホストの部屋で、ホストとの照合ができない（開始は止めない）
export function evaluateLyricsBattleCompatibility({ settings, songPool, hostUid, players }) {
  const roomVersion = settings?.lyricsUniquenessRulesVersion;
  const mode = roomVersion === undefined || roomVersion === null ? COMPAT_ROOM_MODE.LEGACY : COMPAT_ROOM_MODE.UNIQUE;
  const problems = [];
  const pool = Array.isArray(songPool) ? songPool : [];
  const hostCapability = readCapability(players?.[hostUid]);
  const hostHashes = hostCapability ? decodeSongHashes(hostCapability.songHashes) : null;

  // 基準となるホスト自身の確認がまだ（ホストの画面が歌詞データを読み込み中）。
  if (mode === COMPAT_ROOM_MODE.UNIQUE && !hostCapability) {
    const hasHostCoverage = !!players?.[hostUid]?.lyricsCoverage;
    // 【2026-10-28改訂】古いホストは「v382以前（除外しない）」か「v383（除外する）」か見分けられないため、
    // 「古いアプリ」ではなく「確かめられない」として扱う（参加者側は準備完了にできなくする）。
    problems.push({ uid: hostUid, kind: hasHostCoverage ? COMPAT_PROBLEM.HOST_UNVERIFIABLE : COMPAT_PROBLEM.CHECKING, count: 0 });
    return { ok: false, mode, unverified: false, problems };
  }

  for (const [uid, player] of Object.entries(players ?? {})) {
    const capability = readCapability(player);

    if (mode === COMPAT_ROOM_MODE.UNIQUE) {
      if (!capability) {
        // lyricsCoverageはあるのにcapabilityが無い＝この仕組みを知らない古いアプリ。
        // lyricsCoverage自体がまだ無い＝確認中（新旧どちらか、まだ分からない）。
        problems.push({ uid, kind: player?.lyricsCoverage ? COMPAT_PROBLEM.OUTDATED_APP : COMPAT_PROBLEM.CHECKING, count: 0 });
        continue;
      }
      const versionGap =
        classifyVersionGap(capability.v, LYRICS_BATTLE_COMPAT_FORMAT_VERSION) ??
        classifyVersionGap(capability.uniquenessRulesVersion, roomVersion) ??
        classifyVersionGap(capability.engineVersion, hostCapability.engineVersion);
      if (versionGap) {
        // ホスト自身が部屋の設定より新しい・古い場合（ホストが途中で交代した等）は、
        // 全員の更新をお願いする文言にする。
        problems.push({ uid, kind: uid === hostUid ? COMPAT_PROBLEM.VERSION_MISMATCH : versionGap, count: 0 });
        continue;
      }
      if (
        capability.tablesSignature !== hostCapability.tablesSignature ||
        capability.catalogSignature !== hostCapability.catalogSignature
      ) {
        problems.push({ uid, kind: COMPAT_PROBLEM.VERSION_MISMATCH, count: 0 });
        continue;
      }
    } else {
      // 古いホストの部屋（除外なし）。古いアプリも新しいアプリも「除外なし」で同じ問題を作れるため、
      // capabilityが無い人は止めない。capabilityがある人どうしは、分かる範囲で照合する。
      if (!capability || !hostCapability) continue;
      if (
        classifyVersionGap(capability.engineVersion, hostCapability.engineVersion) ||
        capability.catalogSignature !== hostCapability.catalogSignature
      ) {
        problems.push({ uid, kind: COMPAT_PROBLEM.VERSION_MISMATCH, count: 0 });
        continue;
      }
    }

    if (uid === hostUid) continue; // 歌詞データの比較はホストとの差だけを見る
    const comparison = compareSongHashesForPool(decodeSongHashes(capability.songHashes), hostHashes, pool);
    if (comparison.missingCount > 0) {
      problems.push({ uid, kind: COMPAT_PROBLEM.MISSING_LYRICS, count: comparison.missingCount });
    }
    if (comparison.referenceMissingCount > 0) {
      problems.push({ uid: hostUid, kind: COMPAT_PROBLEM.MISSING_LYRICS, count: comparison.referenceMissingCount });
    }
    if (comparison.mismatchCount > 0) {
      problems.push({ uid, kind: COMPAT_PROBLEM.LYRICS_MISMATCH, count: comparison.mismatchCount });
    }
    if (comparison.checking && comparison.missingCount + comparison.referenceMissingCount + comparison.mismatchCount === 0) {
      problems.push({ uid, kind: COMPAT_PROBLEM.CHECKING, count: 0 });
    }
  }

  return {
    ok: problems.length === 0,
    mode,
    unverified: mode === COMPAT_ROOM_MODE.LEGACY && !hostCapability,
    problems: dedupeProblems(problems),
  };
}

// 同じ人・同じ種類の問題は1件にまとめる（ホスト側の歌詞不足が参加者の人数分出るのを防ぐ）。
function dedupeProblems(problems) {
  const seen = new Map();
  for (const problem of problems) {
    const key = `${problem.uid}\u0001${problem.kind}`;
    const existing = seen.get(key);
    if (!existing || problem.count > existing.count) seen.set(key, problem);
  }
  return [...seen.values()];
}

// 問題1件を、画面に出す文章にする。viewerUid（今この画面を見ている人）本人のことは「あなた」と書く。
export function describeCompatProblem(problem, { displayNameByUid = {}, viewerUid = null, hostUid = null } = {}) {
  const isSelf = viewerUid !== null && problem.uid === viewerUid;
  const name = displayNameByUid[problem.uid] ?? "参加者";
  const who = isSelf ? "あなた" : `${name}さん`;
  switch (problem.kind) {
    case COMPAT_PROBLEM.CHECKING:
      // 【2026-10-28追加】開始時に数秒待っても確認が届かなかった場合（problem.timedOut）は、
      // 「待てば直る」ではなく、取るべき行動（入り直し）を先に書く。
      if (problem.timedOut) {
        return isSelf
          ? "あなたの歌詞データの確認が終わりませんでした。ルームに入り直してから、もう一度お試しください。"
          : `${who}の歌詞データの確認が、数秒待っても届きませんでした。${who}にルームへ入り直してもらってから、もう一度開始してください（古いアプリの場合は、アプリの更新も必要です）。`;
      }
      return isSelf
        ? "あなたの歌詞データを確認中です…"
        : `${who}の歌詞データを確認中です。数秒待ってから、もう一度お試しください（表示が変わらない場合は、${who}にルームへ入り直してもらってください）。`;
    case COMPAT_PROBLEM.HOST_UNVERIFIABLE:
      return isSelf
        ? "あなた（ホスト）のアプリが古いため、歌詞クイズ対戦で全員に同じヒントが出るかを確かめられません。アプリを更新してください。"
        : `ホスト（${name}さん）のアプリが古い版のため、全員に同じヒントが出るかを確かめられません（古い版どうしでも、版の違いでヒントがずれることがあります）。ホストの${name}さんにアプリを更新してもらってください。更新されるまで、このルームの歌詞クイズ対戦には準備完了にできません。`;
    case COMPAT_PROBLEM.OUTDATED_APP:
      return isSelf
        ? "あなたのアプリが古いため、この歌詞クイズ対戦では全員に同じヒントを出せません。アプリを更新してください。"
        : `${who}のアプリが古いため、歌詞クイズ対戦を開始できません（全員に同じヒントを出せないため）。${who}にアプリを更新してもらってください。`;
    case COMPAT_PROBLEM.HOST_APP_OUTDATED:
      // problem.uidは「ホストより新しいアプリの参加者」。古いのはホスト側。
      return viewerUid !== null && viewerUid === hostUid
        ? `あなた（ホスト）のアプリが${name}さんより古いため、歌詞クイズ対戦を開始できません。アプリを更新してください。`
        : `ホストのアプリが${who}より古いため、歌詞クイズ対戦を開始できません。ホストにアプリを更新してもらってください。`;
    case COMPAT_PROBLEM.VERSION_MISMATCH:
      return `${who}とホストで、アプリの版が一致しません（全員に同じヒントを出せないため開始できません）。全員アプリを最新に更新してください。`;
    case COMPAT_PROBLEM.MISSING_LYRICS:
      return `${who}の端末に、今回出題する曲の歌詞データが${problem.count}曲ありません。歌詞データを入れてから開始してください。`;
    case COMPAT_PROBLEM.LYRICS_MISMATCH:
      return `${who}の端末の歌詞データが、ホストの端末と${problem.count}曲で一致しません（歌詞データの版が違います）。${isSelf ? "" : `${who}と`}ホストの歌詞データを最新のものに入れ直してください。`;
    default:
      return `${who}の端末と、出題内容を一致させられません。全員アプリを最新に更新してください。`;
  }
}

// 対戦開始を止めるときに、ホストの画面へ出す1つの文章（複数の問題は続けて並べる）。
export function describeCompatStartBlockMessage(evaluation, options = {}) {
  if (!evaluation || evaluation.ok) return null;
  return evaluation.problems.map((problem) => describeCompatProblem(problem, options)).join(" ");
}

// 対戦に入る瞬間、問題を作るときに使う設定を決める。
// 【2026-10-28改訂・本人指示：版の対応表の見直し】以前は「除外ルールの版がある部屋なのに、今のホストが
// capabilityを書かない古いアプリ」のとき、版を外して「除外なし」で作り、古いホストに合わせていた。
// しかし古いホストには v382以前（除外しない）と v383（公開版。除外する）があり、Firebaseへ書く値が
// 同じで見分けられない。「除外なし」に合わせると、いちばん多い v383 のホストと必ずずれていた。
// 今は、この状況ではロビーで準備完了にできない（resolveLyricsParticipantGate()）ので、ここに来るのは
// 準備完了の後にホストが古いアプリへ交代した等の、まれな行き違いだけ。そのときは部屋の設定のまま
// （＝v383のホストと同じ「除外あり」）で作り、画面には確かめられないことを出す
// （describeQuestionSettingsNoticeForHost()）。v382以前のホストとはずれうるが、どちらに合わせても
// 片方とはずれるため、より多い方（公開版v383）に合わせる。
export function resolveQuestionSettingsForHost({ settings }) {
  return settings;
}

// 対戦中の画面に出す、ホストのアプリが古くて「同じ問題か確かめられない」ことの案内（無ければnull）。
export function describeQuestionSettingsNoticeForHost({ settings, hostUid, players, viewerUid }) {
  if (viewerUid === hostUid) return null;
  if (settings?.lyricsUniquenessRulesVersion === undefined || settings?.lyricsUniquenessRulesVersion === null) return null;
  const hostCoverage = players?.[hostUid]?.lyricsCoverage;
  if (!hostCoverage || hostCoverage.capability) return null;
  return "ホストのアプリが古い版のため、この対戦で全員に同じヒントが出ているかを確かめられません。結果は参考にとどめ、次の対戦の前にホストにアプリを更新してもらってください。";
}

// ===== 【2026-10-28新設・本人指示】参加者側の「準備完了」の可否 =====
//
// 新しいアプリの参加者が、このルームで「ホストと同じ問題を作れる」と言えるかを判定する。
// 古いホスト（v383以前）は開始前の照合をしないため、新しいアプリの参加者が自分で判断し、
// 保証できないときは準備完了にしない（古いホストは「全員が準備完了」でないと開始できないので、
// これで新しいアプリの参加者が公平でない対戦に巻き込まれるのを防げる）。
//   ・ホストが新しいアプリ（capabilityあり）       → 準備完了にできる（照合はホストが開始時に行う）
//   ・版の無い部屋（古いホストが作った部屋）        → 準備完了にできる（全員「除外なし」で同じ問題）
//   ・版のある部屋で、ホストのcapabilityが無い     → 準備完了にできない（v382以前とv383を見分けられない）
//   ・ホストの確認がまだ届いていない               → 準備完了にできる（誤って止めないため。届いた時点で再判定）
// 戻り値: { canReady, kind, message }
export function resolveLyricsParticipantGate({ settings, hostUid, players, viewerUid, displayNameByUid = {} }) {
  if (viewerUid === hostUid) return { canReady: true, kind: null, message: null };
  const roomVersion = settings?.lyricsUniquenessRulesVersion;
  if (roomVersion === undefined || roomVersion === null) return { canReady: true, kind: null, message: null };
  const hostCoverage = players?.[hostUid]?.lyricsCoverage;
  if (!hostCoverage || hostCoverage.capability) return { canReady: true, kind: null, message: null };
  const problem = { uid: hostUid, kind: COMPAT_PROBLEM.HOST_UNVERIFIABLE, count: 0 };
  return {
    canReady: false,
    kind: COMPAT_PROBLEM.HOST_UNVERIFIABLE,
    message: describeCompatProblem(problem, { displayNameByUid, viewerUid, hostUid }),
  };
}

// ===== 【2026-10-28新設・本人指示：全員が新しいアプリなのに誤って止めない】開始時の「確認中」の待ち =====
//
// 入室した直後の人は、capabilityをまだ書き終えていないことがある（「確認中」）。この状態で
// 開始ボタンが押された・ルール確認の自動開始が来たときは、すぐに止めずに、Firebaseを読み直しながら
// 少しだけ待つ。届けばそのまま開始し、待っても届かなければ「入り直してもらう」案内で止める。
export const COMPAT_CHECKING_WAIT_MS = 6000;
export const COMPAT_CHECKING_POLL_MS = 500;

// 問題が「確認中」だけ（待てば解消しうる）かどうか。
export function isCompatibilityPendingOnly(evaluation) {
  return !!evaluation && !evaluation.ok && evaluation.problems.length > 0 && evaluation.problems.every((problem) => problem.kind === COMPAT_PROBLEM.CHECKING);
}

// evaluate(players) → evaluateLyricsBattleCompatibility()の戻り値
// reloadPlayers()   → 最新のroom.players（読めなければnull）
// 戻り値: { evaluation, players, timedOut, waitedMs }
export async function waitForLyricsBattleCompatibility({
  players,
  evaluate,
  reloadPlayers,
  timeoutMs = COMPAT_CHECKING_WAIT_MS,
  intervalMs = COMPAT_CHECKING_POLL_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowMs = () => Date.now(),
}) {
  const startedAt = nowMs();
  let latestPlayers = players;
  let evaluation = evaluate(latestPlayers);
  while (isCompatibilityPendingOnly(evaluation) && nowMs() - startedAt < timeoutMs) {
    await sleep(intervalMs);
    const reloaded = await reloadPlayers();
    if (!reloaded) break;
    latestPlayers = reloaded;
    evaluation = evaluate(latestPlayers);
  }
  const timedOut = isCompatibilityPendingOnly(evaluation);
  if (timedOut) {
    evaluation = { ...evaluation, problems: evaluation.problems.map((problem) => ({ ...problem, timedOut: true })) };
  }
  return { evaluation, players: latestPlayers, timedOut, waitedMs: nowMs() - startedAt };
}

// ロビーに出す案内文の一覧（ホスト・参加者の両方に見せる）。
//   ・全員が同じ問題を作れない理由（開始を止める理由と同じもの。自分のことは「あなた」）
//   ・古いホストの部屋で、照合ができないことの案内（参加者の新しいアプリにだけ出す。開始は止めない）
// 「確認中」は数秒で消えることが多く、毎回出すと画面がちらつくため、ここでは出さない
// （実際に開始ボタンを押したときは、開始を止める理由として表示される）。
export function describeLyricsLobbyCompatNotices({ settings, songPool, hostUid, players, viewerUid, displayNameByUid = {} }) {
  const evaluation = evaluateLyricsBattleCompatibility({ settings, songPool, hostUid, players });
  const messages = evaluation.problems
    .filter((problem) => problem.kind !== COMPAT_PROBLEM.CHECKING)
    .map((problem) => describeCompatProblem(problem, { displayNameByUid, viewerUid, hostUid }));
  if (evaluation.unverified && viewerUid !== hostUid) {
    messages.push(
      "ホストのアプリが古い版のため、全員に同じ問題が出るかを確かめられません（この対戦では、答えが1曲に決まらない歌詞の除外も行われません）。ホストのアプリを更新すると確かめられるようになります。"
    );
  }
  return messages;
}

// ===== 開始後：実際に作った問題の「指紋」 =====

// 1問分のハッシュ。正解の曲ID・ヒントの段階と行番号・回答候補の曲ID（並び順も）だけを使う
// （歌詞本文は使わない）。どれか1つでも端末間で違えば、ハッシュが変わる。
export function computeLyricsQuestionHash(question) {
  const songId = question?.song?.id ?? "";
  const hints = (question?.hints ?? []).map((hint) => `${hint.hintLevel}:${hint.startLine}-${hint.endLine}`).join(",");
  const answers = (question?.answerPool ?? []).map((candidate) => candidate?.id ?? candidate).join(",");
  return hashStringToHex(`${songId}#${hints}#${answers}`);
}

// players/{uid}/lyricsMatchCheck へ書く内容。matchIdを入れるのは、前の試合の指紋と
// 取り違えないため。
export function buildLyricsMatchCheckPayload({ matchId, questions }) {
  const questionHashes = (questions ?? []).map(computeLyricsQuestionHash);
  return {
    v: LYRICS_BATTLE_COMPAT_FORMAT_VERSION,
    matchId,
    questionCount: questionHashes.length,
    fingerprint: hashStringToHex(questionHashes.join(",")),
    questionHashes: questionHashes.join(","),
  };
}

function readMatchCheck(player, matchId) {
  const check = player?.lyricsMatchCheck;
  if (!check || typeof check !== "object" || check.matchId !== matchId) return null;
  return check;
}

// 2つの指紋で、最初に食い違う問題の番号（0始まり）。一致していれば-1。
export function findFirstMismatchedQuestionIndex(checkA, checkB) {
  const hashesA = String(checkA?.questionHashes ?? "").split(",");
  const hashesB = String(checkB?.questionHashes ?? "").split(",");
  const length = Math.max(hashesA.length, hashesB.length);
  for (let i = 0; i < length; i += 1) {
    if (hashesA[i] !== hashesB[i]) return i;
  }
  return -1;
}

export const MATCH_CHECK_STATUS = {
  WAITING_HOST: "waiting-host", // ホストの指紋がまだ無い（古いホストの部屋では、ずっとこの状態）
  PENDING: "pending", // まだ指紋を書いていない参加者がいる
  OK: "ok", // 全員一致
  MISMATCH: "mismatch", // 1人以上がホストと違う問題を作った
};

// ホスト側の照合：今の試合の参加者全員の指紋を、ホストの指紋と比べる。
// participantUids: matches/{matchId}/participants のuid（途中離脱した人・部屋を出た人は呼び出し側で除く）
export function compareLyricsMatchChecks({ matchId, hostUid, participantUids, players }) {
  const hostCheck = readMatchCheck(players?.[hostUid], matchId);
  if (!hostCheck) {
    return { status: MATCH_CHECK_STATUS.WAITING_HOST, mismatchedUids: [], pendingUids: [], firstMismatchIndex: -1 };
  }
  const mismatchedUids = [];
  const pendingUids = [];
  let firstMismatchIndex = -1;
  for (const uid of participantUids ?? []) {
    if (uid === hostUid) continue;
    const check = readMatchCheck(players?.[uid], matchId);
    if (!check) {
      pendingUids.push(uid);
      continue;
    }
    if (check.fingerprint !== hostCheck.fingerprint || check.questionCount !== hostCheck.questionCount) {
      mismatchedUids.push(uid);
      const index = findFirstMismatchedQuestionIndex(check, hostCheck);
      if (index >= 0 && (firstMismatchIndex < 0 || index < firstMismatchIndex)) firstMismatchIndex = index;
    }
  }
  const status =
    mismatchedUids.length > 0 ? MATCH_CHECK_STATUS.MISMATCH : pendingUids.length > 0 ? MATCH_CHECK_STATUS.PENDING : MATCH_CHECK_STATUS.OK;
  return { status, mismatchedUids, pendingUids, firstMismatchIndex };
}

// 参加者側の照合：自分の指紋をホストの指紋と比べる（ずれていたら自分の画面に知らせるため）。
export function compareOwnMatchCheck({ matchId, myCheck, hostUid, players }) {
  const hostCheck = readMatchCheck(players?.[hostUid], matchId);
  if (!hostCheck || !myCheck || myCheck.matchId !== matchId) return MATCH_CHECK_STATUS.WAITING_HOST;
  return hostCheck.fingerprint === myCheck.fingerprint && hostCheck.questionCount === myCheck.questionCount
    ? MATCH_CHECK_STATUS.OK
    : MATCH_CHECK_STATUS.MISMATCH;
}

// ホストが対戦を中止したことを、自分の指紋の横に書き足す内容（ロビーで全員に理由を見せるため）。
export const MATCH_ABORT_REASON_QUESTION_MISMATCH = "question-mismatch";

export function buildLyricsMatchAbortedCheckPayload(hostCheck, mismatchedCount) {
  return { ...hostCheck, abortedReason: MATCH_ABORT_REASON_QUESTION_MISMATCH, abortedMismatchCount: mismatchedCount };
}

// ロビーに戻った後、直前の対戦が「出題内容の不一致」で中止されたかどうかの案内文（無ければnull）。
export function describeLyricsMatchAbortNotice(room) {
  const hostCheck = room?.players?.[room?.host]?.lyricsMatchCheck;
  if (!hostCheck || hostCheck.abortedReason !== MATCH_ABORT_REASON_QUESTION_MISMATCH) return null;
  if (!room.activeMatchId || hostCheck.matchId !== room.activeMatchId) return null;
  return "直前の対戦は、出題内容（ヒントの行）が参加者の端末の間で一致しなかったため、公平に遊べないので中止しました。全員アプリと歌詞データを最新にしてから、もう一度開始してください。";
}

// 参加者本人の画面に出す、対戦中の不一致の案内文。
export const OWN_MATCH_MISMATCH_MESSAGE =
  "この端末で作った問題が、ホストの端末と一致しませんでした。公平に遊べないため、この対戦は中止されます。アプリと歌詞データを最新にしてください。";
export const HOST_MATCH_MISMATCH_MESSAGE =
  "参加者の端末で作られた問題が、この端末と一致しませんでした。公平に遊べないため、対戦を中止してルーム設定に戻ります。";
