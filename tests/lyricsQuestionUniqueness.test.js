// js/lyricsQuestionUniqueness.js（答えが1曲に決まらない歌詞の行を出題しない共通フィルター）と、
// それを使う問題生成（js/lyricsQuizQuestionBuilder.js・js/battleModes/lyricsQuizBattleMode.js）のテスト。
//
// 【重要・著作権】このテストで使う歌詞テキストはすべて、テストのためだけに作ったダミーの文
// （実在の楽曲の歌詞ではない）。曲IDは、問題生成が回答候補を作るためにjs/data/songs.jsの実在IDを
// 必要とする箇所だけ実在の曲IDを使う（歌詞本文ではなく公開情報なので問題ない）。
//
// 本人が挙げた12のケース（①完全一致 ②部分重複 ③よくある言い回し ④句読点・空白 ⑤全角半角
// ⑥ひらがなカタカナ ⑦大文字小文字 ⑧同じ曲内の繰り返し ⑨別バージョン ⑩短すぎる
// ⑪他の曲の歌詞の一部 ⑫意味的に紛らわしい行＝手作業の一覧）に加えて、1人用とオンライン対戦で
// 同じ候補になること・seedによる決定論性・候補切れ・端末に一部の曲の歌詞が無い場合を確認する。

import {
  normalizeForLyricsUniqueness,
  buildUniquenessCorpus,
  computeAmbiguousLinesForSong,
  computeLyricsUniquenessExclusions,
  resolveIndexedAmbiguousLines,
  AMBIGUITY_REASON,
  LYRICS_UNIQUENESS_RULES_VERSION,
  MIN_UNIQUE_FRAGMENT_LENGTH,
} from "../js/lyricsQuestionUniqueness.js";
import { computeLyricsContentHash, generateAnchorLineCandidates } from "../js/lyricsSegmentEngine.js";
import {
  buildLyricsQuizQuestions,
  filterQuizzableSongs,
  validateLyricsQuizAvailability,
  annotateLyricsUniqueness,
  countSongsExcludedByUniqueness,
} from "../js/lyricsQuizQuestionBuilder.js";
import * as lyricsQuizBattleMode from "../js/battleModes/lyricsQuizBattleMode.js";
import { LYRICS_AMBIGUITY_INDEX } from "../js/data/lyricsAmbiguityIndex.js";
import { LYRICS_UNIQUENESS_MANUAL_EXCLUSIONS } from "../js/data/lyricsUniquenessManualList.js";
import { SONGS } from "../js/data/songs.js";
import { assertEqual } from "./test-utils.js";

// ---------- テスト用の道具 ----------

// テキストの配列から、歌詞データ（{ line, text, start, end }[]）を作る（行番号は1始まり）。
function makeLines(texts) {
  return texts.map((text, i) => ({ line: i + 1, text, start: i * 3, end: i * 3 + 2.5 }));
}
function dummySong(id) {
  return { id, title: `ダミー曲${id}`, searchAliases: [] };
}
// 空の事前一覧・空の手作業一覧（フィルターそのものだけを確かめるため）。
const NO_LISTS = { ambiguityIndex: { songs: {} }, manualExclusions: {} };

// 1曲分の「出題しない行番号→理由」を、比較相手の曲と一緒に求める。
function reasonsFor(target, others, options = NO_LISTS) {
  const corpus = buildUniquenessCorpus([target, ...others]);
  return computeAmbiguousLinesForSong(target, corpus, options);
}

// 問題生成で回答候補を作るため、実在の曲IDを使う（タイトルがダミー歌詞に含まれないものを選ぶ）。
const REAL = SONGS.slice(0, 6);

// 各曲固有のダミー歌詞（曲ごとに必ず違う文にする）。sharedLinesを渡すと、その行を差し込む。
function uniqueLinesFor(index, sharedLines = []) {
  const own = [
    `みなとのあかりがゆれていた${index}ばんめ`,
    `しろいくもをおいかけていく${index}ばんめ`,
    `ちいさなまどにあめがふる${index}ばんめ`,
    `とけいのはりがまわりだす${index}ばんめ`,
    `ゆうやけいろのみちをかえる${index}ばんめ`,
  ];
  return makeLines([...own.slice(0, 2), ...sharedLines, ...own.slice(2)]);
}

export function runLyricsQuestionUniquenessTests() {
  // ===== 正規化 =====
  assertEqual(normalizeForLyricsUniqueness("ＡＢＣ１２３"), "abc123", "正規化：全角英数字→半角");
  assertEqual(normalizeForLyricsUniqueness("ｷﾗｷﾗ"), "きらきら", "正規化：半角カナ→全角→ひらがな（NFKC＋かな統一）");
  assertEqual(normalizeForLyricsUniqueness("キラキラ"), "きらきら", "正規化：カタカナ→ひらがな");
  assertEqual(normalizeForLyricsUniqueness("Hello MY Friend"), "hellomyfriend", "正規化：大文字小文字・空白");
  assertEqual(normalizeForLyricsUniqueness("あい、たい！？「いま」…♡"), "あいたいいま", "正規化：句読点・記号・絵文字を除去");
  assertEqual(normalizeForLyricsUniqueness("ラーメン"), "らーめん", "正規化：長音「ー」は残す");
  assertEqual(normalizeForLyricsUniqueness(null), "", "正規化：null → 空文字（例外を投げない）");

  // ===== ① 完全一致（別の曲に全く同じ行がある） =====
  {
    const a = { song: dummySong("a"), lines: makeLines(["みずいろのかさをさしてあるく", "あさのでんしゃにゆられている"]) };
    const b = { song: dummySong("b"), lines: makeLines(["みずいろのかさをさしてあるく", "よるのこうえんでまっている"]) };
    assertEqual(reasonsFor(a, [b]).get(1), AMBIGUITY_REASON.CROSS_SONG_EXACT, "①完全一致：別の曲にある行は除外（理由：完全一致）");
    assertEqual(reasonsFor(b, [a]).get(1), AMBIGUITY_REASON.CROSS_SONG_EXACT, "①完全一致：相手の曲側でも同じ行が除外される");
    assertEqual(reasonsFor(a, [b]).has(2), false, "①完全一致：重複していない行は残る");
  }

  // ===== ② 部分重複（短い行が、別の曲の長い行の一部）→ 短い方だけ除外、長い方は残る =====
  {
    const a = { song: dummySong("a"), lines: makeLines(["ほしぞらのしたでまっている", "べつのことばをならべてみる"]) };
    const b = { song: dummySong("b"), lines: makeLines(["ほしぞらのしたでまっているよきみを", "ぜんぜんちがうぎょうがある"]) };
    assertEqual(reasonsFor(a, [b]).get(1), AMBIGUITY_REASON.CROSS_SONG_SUBSTRING, "②部分重複：短い行（別の曲の行の一部）は除外");
    assertEqual(reasonsFor(b, [a]).has(1), false, "②部分重複：より長い行は一意なので残る（長い方を優先して使える）");
  }

  // ===== ③ よくある言い回し（3曲に出てくる） =====
  {
    const phrase = "ずっとそばにいてほしい";
    const songs = ["a", "b", "c"].map((id, i) => ({
      song: dummySong(id),
      lines: makeLines([phrase, `それぞれのきょく${"いろは"[i]}のぎょう`]),
    }));
    const exclusions = computeLyricsUniquenessExclusions(songs, NO_LISTS);
    assertEqual(
      songs.map((entry) => exclusions.get(entry.song.id).has(1)),
      [true, true, true],
      "③よくある言い回し：3曲すべてで除外される"
    );
  }

  // ===== ④ 句読点・空白の違い =====
  {
    const a = { song: dummySong("a"), lines: makeLines(["あいたい、 いますぐ！きみに"]) };
    const b = { song: dummySong("b"), lines: makeLines(["あいたい いますぐ きみに"]) };
    assertEqual(reasonsFor(a, [b]).get(1), AMBIGUITY_REASON.CROSS_SONG_EXACT, "④句読点・空白だけの違いは同じ行とみなす");
  }

  // ===== ⑤ 全角・半角の違い =====
  {
    const a = { song: dummySong("a"), lines: makeLines(["ＡＢＣのうたをうたう", "ﾐﾗｲﾍﾄﾂﾂﾞｸﾐﾁ"]) };
    const b = { song: dummySong("b"), lines: makeLines(["abcのうたをうたう", "ミライヘトツヅクミチ"]) };
    const reasons = reasonsFor(a, [b]);
    assertEqual(reasons.get(1), AMBIGUITY_REASON.CROSS_SONG_EXACT, "⑤全角英字と半角英字は同じ行とみなす");
    assertEqual(reasons.get(2), AMBIGUITY_REASON.CROSS_SONG_EXACT, "⑤半角カナ（濁点つき）と全角カナは同じ行とみなす");
  }

  // ===== ⑥ ひらがな・カタカナの違い =====
  {
    const a = { song: dummySong("a"), lines: makeLines(["キラキラひかるよぞら"]) };
    const b = { song: dummySong("b"), lines: makeLines(["きらきらひかるよぞら"]) };
    assertEqual(reasonsFor(a, [b]).get(1), AMBIGUITY_REASON.CROSS_SONG_EXACT, "⑥ひらがなとカタカナの違いは同じ行とみなす");
  }

  // ===== ⑦ 大文字・小文字の違い =====
  {
    const a = { song: dummySong("a"), lines: makeLines(["Hello MY friend"]) };
    const b = { song: dummySong("b"), lines: makeLines(["hello my FRIEND"]) };
    assertEqual(reasonsFor(a, [b]).get(1), AMBIGUITY_REASON.CROSS_SONG_EXACT, "⑦大文字・小文字の違いは同じ行とみなす");
  }

  // ===== ⑧ 同じ曲の中での繰り返し（サビ等）は除外しない =====
  {
    const a = {
      song: dummySong("a"),
      lines: makeLines(["くりかえすさびのぎょうです", "まんなかのちがうぎょう", "くりかえすさびのぎょうです"]),
    };
    const b = { song: dummySong("b"), lines: makeLines(["まったくかんけいのないきょく"]) };
    const reasons = reasonsFor(a, [b]);
    assertEqual([reasons.has(1), reasons.has(3)], [false, false], "⑧同じ曲内の繰り返しは除外しない（答えは変わらないため）");
    const candidates = generateAnchorLineCandidates(a.lines, { excludedLineNumbers: reasons.keys() });
    assertEqual(candidates[2].isRepeat, true, "⑧繰り返しの行は従来どおりisRepeat（減点のみ）として扱われる");
  }

  // ===== ⑨ 別バージョン（同じ歌詞の曲が2つ）→ どちらも出題しない =====
  {
    const sameLyrics = ["べつばーじょんのおなじかし", "にばんめのおなじかしです", "さいごのおなじかしのぎょう"];
    const songsWithLyrics = [
      { song: REAL[0], lines: makeLines(sameLyrics) },
      { song: REAL[1], lines: makeLines(sameLyrics) },
      { song: REAL[2], lines: uniqueLinesFor(3) },
    ];
    const quizzable = filterQuizzableSongs(songsWithLyrics).map((entry) => entry.song.id);
    assertEqual(quizzable, [REAL[2].id], "⑨別バージョン（全行が同じ）の2曲はどちらも出題対象から外れる");
    assertEqual(countSongsExcludedByUniqueness(songsWithLyrics), 2, "⑨重複が原因で出題できない曲数を数えられる");
    const availability = validateLyricsQuizAvailability(songsWithLyrics, "3");
    assertEqual(availability.ok, false, "⑨3曲必要なのに1曲しか出題できない → ok:false");
    assertEqual(availability.reason.includes("2曲は、歌詞が他の曲と重複"), true, "⑨理由の文に、重複で出題できない曲数が添えられる");
  }

  // ===== ⑩ 短すぎる行 =====
  {
    const a = { song: dummySong("a"), lines: makeLines(["ねえ", "らら！", "あいうえ", "！？…"]) };
    const reasons = reasonsFor(a, []);
    assertEqual(reasons.get(1), AMBIGUITY_REASON.TOO_SHORT, `⑩正規化後${MIN_UNIQUE_FRAGMENT_LENGTH}文字未満の行は除外（2文字）`);
    assertEqual(reasons.get(2), AMBIGUITY_REASON.TOO_SHORT, "⑩記号を除くと短すぎる行も除外");
    assertEqual(reasons.has(3), false, `⑩ちょうど${MIN_UNIQUE_FRAGMENT_LENGTH}文字で、他の曲に無ければ残す`);
    assertEqual(reasons.get(4), AMBIGUITY_REASON.EMPTY, "⑩記号だけの行（正規化すると空）は除外");
  }

  // ===== ⑪ 他の曲の歌詞の一部（2行にまたがって出てくる場合も） =====
  {
    const a = { song: dummySong("a"), lines: makeLines(["かぜのなかでうたうよ", "ほかとはちがうぎょう"]) };
    const b = { song: dummySong("b"), lines: makeLines(["とおくへいこうかぜのなか", "でうたうよふたりで"]) };
    assertEqual(
      reasonsFor(a, [b]).get(1),
      AMBIGUITY_REASON.CROSS_SONG_SUBSTRING,
      "⑪別の曲で2行にまたがって歌われているフレーズも、部分一致として除外"
    );
    assertEqual(reasonsFor(a, [b]).has(2), false, "⑪一致しない行は残る");
  }

  // ===== ⑫ 意味的に紛らわしい行（機械的には一意）→ 手作業の一覧で除外 =====
  {
    const a = { song: dummySong("a"), lines: makeLines(["きかいてきにはいちいのぎょう", "べつのふつうのぎょうです"]) };
    const reasons = reasonsFor(a, [], { ambiguityIndex: { songs: {} }, manualExclusions: { a: [1] } });
    assertEqual(reasons.get(1), AMBIGUITY_REASON.MANUAL, "⑫手作業の一覧に載せた行は除外（理由：手作業）");
    assertEqual(reasons.has(2), false, "⑫一覧に無い行は残る");
  }

  // ===== 配布するデータに歌詞本文が入っていないこと =====
  {
    const manualOk = Object.values(LYRICS_UNIQUENESS_MANUAL_EXCLUSIONS).every(
      (value) => Array.isArray(value) && value.every((n) => Number.isInteger(n))
    );
    assertEqual(manualOk, true, "手作業の一覧は「曲ID→行番号（整数）の配列」だけで、歌詞の文字列を含まない");
    const indexOk = Object.values(LYRICS_AMBIGUITY_INDEX.songs).every(
      (entry) =>
        Object.keys(entry).sort().join(",") === "ambiguousLines,contentHash,lineCount" &&
        /^[0-9a-f]{1,8}$/.test(entry.contentHash) &&
        Number.isInteger(entry.lineCount) &&
        entry.ambiguousLines.every((n) => Number.isInteger(n))
    );
    assertEqual(indexOk, true, "事前計算の一覧は「内容ハッシュ・行数・行番号」だけで、歌詞の文字列を含まない");
    assertEqual(LYRICS_AMBIGUITY_INDEX.rulesVersion, LYRICS_UNIQUENESS_RULES_VERSION, "事前計算の一覧は現在のルールの版で作られている");
  }

  // ===== 事前計算の一覧は、内容ハッシュが一致する曲だけに使う =====
  {
    const lines = makeLines(["いちぎょうめのだみー", "にぎょうめのだみーです"]);
    const index = { songs: { a: { contentHash: computeLyricsContentHash(lines), lineCount: 2, ambiguousLines: [2] } } };
    assertEqual(resolveIndexedAmbiguousLines("a", lines, index), { verified: true, lineNumbers: [2] }, "内容が一致 → 一覧の行番号を使う");
    const edited = makeLines(["いちぎょうめのだみー", "しゅうせいされたぎょう"]);
    assertEqual(resolveIndexedAmbiguousLines("a", edited, index), { verified: false, lineNumbers: [] }, "内容が違う（歌詞が修正された）→ 一覧を使わない");
    assertEqual(resolveIndexedAmbiguousLines("x", lines, index), { verified: false, lineNumbers: [] }, "一覧に無い曲 → 使わない");
    const reasons = computeAmbiguousLinesForSong({ song: dummySong("a"), lines }, buildUniquenessCorpus([]), {
      ambiguityIndex: index,
      manualExclusions: {},
    });
    assertEqual(reasons.get(2), AMBIGUITY_REASON.INDEX, "端末に相手の曲が無くても、一覧に載った行は除外される");
  }

  // ===== 問題生成：除外した行は、どのseedでもヒントに出ない =====
  const SHARED = "ふたつのきょくにあるぎょうです";
  const songsWithShared = REAL.map((song, index) => ({
    song,
    lines: uniqueLinesFor(index + 1, index < 2 ? [SHARED] : []),
  }));
  const songPool = REAL.map((song) => song.id);
  {
    let leaked = 0;
    let built = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const questions = buildLyricsQuizQuestions({
        songsWithLyrics: songsWithShared,
        songPool,
        questionCountValue: "all",
        answerPoolSizeValue: "4",
        seed,
      });
      built += questions.length;
      questions.forEach((question) => {
        if (question.hints.some((hint) => normalizeForLyricsUniqueness(hint.segment.text) === normalizeForLyricsUniqueness(SHARED))) {
          leaked += 1;
        }
      });
    }
    assertEqual(built, 150 * REAL.length, "共有行があっても、各曲に一意な行があれば全曲出題できる（150seed×6曲）");
    assertEqual(leaked, 0, "2曲に共通する行は、150通りのseedのどの問題のヒントにも出ない");
  }

  // ===== 決定論性：同じseed・同じ入力なら同じ問題 =====
  {
    const build = (seed) =>
      buildLyricsQuizQuestions({ songsWithLyrics: songsWithShared, songPool, questionCountValue: "4", answerPoolSizeValue: "4", seed }).map(
        (q) => ({ id: q.song.id, lines: q.hints.map((h) => h.startLine), pool: q.answerPool.map((s) => s.id) })
      );
    assertEqual(build(777), build(777), "同じseedなら、出題曲・ヒントの行・回答候補が完全に同じ");
  }

  // ===== 1人用（端末の全曲と比較）とオンライン（出題範囲＋事前一覧）が同じ候補になる =====
  // 端末に全曲の歌詞があり、出題範囲も全曲という（いちばん普通の）状況。
  {
    const seed = 4242;
    const offlineEntries = annotateLyricsUniqueness(songsWithShared, songsWithShared);
    const offline = buildLyricsQuizQuestions({
      songsWithLyrics: offlineEntries,
      songPool,
      questionCountValue: "all",
      answerPoolSizeValue: "4",
      seed,
    });
    const settings = { ...lyricsQuizBattleMode.defaultSettings(), questionCountValue: "all", answerPoolSizeValue: "4" };
    const online = lyricsQuizBattleMode.buildQuestions({
      seed,
      settings,
      runtimeContext: { ok: true, songsWithLyrics: songsWithShared, songPool },
    });
    const shape = (questions) => questions.map((q) => ({ id: q.song.id, lines: q.hints.map((h) => h.startLine) }));
    assertEqual(shape(online), shape(offline), "1人用とオンライン対戦で、同じ入力なら出題曲・ヒントの行が完全に一致する");

    // 候補集合そのもの（出題しない行番号）も一致する。
    const offlineSets = offlineEntries.map((e) => [e.song.id, [...e.uniqueExcludedLineNumbers].sort((x, y) => x - y)]);
    const onlineExclusions = computeLyricsUniquenessExclusions(songsWithShared);
    const onlineSets = songsWithShared.map((e) => [e.song.id, [...onlineExclusions.get(e.song.id)].sort((x, y) => x - y)]);
    assertEqual(onlineSets, offlineSets, "1人用とオンラインで「出題しない行」の集合が一致する");
  }

  // ===== 端末に一部の曲の歌詞が無い場合（オンライン：端末ごとの差が問題に影響しない） =====
  {
    // 出題範囲は最初の3曲。範囲外の曲（REAL[5]）が1曲目と同じ行を持っているが、
    // その曲の歌詞は端末Aにはあり、端末Bには無い。
    const poolEntries = songsWithShared.slice(0, 3);
    const outside = { song: REAL[5], lines: makeLines(["はんいがいのきょくのぎょう", poolEntries[2].lines[0].text]) };
    const poolIds = poolEntries.map((e) => e.song.id);
    const sharedLineNumber = poolEntries[2].lines[0].line;
    // オンラインのruntimeContextには、出題範囲の曲しか入らない（prepareRuntimeContextの仕様）。
    // そのため判定は「出題範囲の曲どうし＋事前一覧」だけで決まり、範囲外の曲を端末に
    // 持っているかどうか（端末ごとに違う）には左右されない。
    const onlineOnly = computeLyricsUniquenessExclusions(poolEntries, NO_LISTS);
    assertEqual(onlineOnly.get(poolEntries[2].song.id).has(sharedLineNumber), false, "オンライン：範囲外の曲は比較に使わない（端末差で問題がずれない）");
    // 範囲外の曲との重複は、歌詞本文を含まない事前一覧が補う（全端末に同じ一覧が入っている）。
    const syntheticIndex = {
      songs: {
        [poolEntries[2].song.id]: {
          contentHash: computeLyricsContentHash(poolEntries[2].lines),
          lineCount: poolEntries[2].lines.length,
          ambiguousLines: [sharedLineNumber],
        },
      },
    };
    const onlineWithIndex = computeLyricsUniquenessExclusions(poolEntries, { ambiguityIndex: syntheticIndex, manualExclusions: {} });
    assertEqual(onlineWithIndex.get(poolEntries[2].song.id).has(sharedLineNumber), true, "オンライン：範囲外の曲との重複は事前一覧で除外される");
    const settings = { ...lyricsQuizBattleMode.defaultSettings(), questionCountValue: "all", answerPoolSizeValue: "4" };
    const twice = [1, 2].map(() =>
      lyricsQuizBattleMode
        .buildQuestions({ seed: 99, settings, runtimeContext: { ok: true, songsWithLyrics: poolEntries.map((e) => ({ ...e })), songPool: poolIds } })
        .map((q) => ({ id: q.song.id, lines: q.hints.map((h) => h.startLine) }))
    );
    assertEqual(twice[0], twice[1], "オンライン：同じseed・同じ出題範囲なら、どの端末でも同じ問題");

    // 1人用：端末にある範囲外の曲とも比べるので、その行は出題しない（より安全側）。
    const offline = annotateLyricsUniqueness(poolEntries, [...poolEntries, outside]);
    assertEqual(offline[2].uniqueExcludedLineNumbers.includes(poolEntries[2].lines[0].line), true, "1人用：範囲外の曲と同じ行も除外する");
    // 1曲だけ渡して問題を作る（パーティーの差し替え問題と同じ形）ときも、付けた除外結果が使われる。
    let leaked = false;
    for (let seed = 1; seed <= 60; seed += 1) {
      const [question] = buildLyricsQuizQuestions({
        songsWithLyrics: [offline[2]],
        songPool: [offline[2].song.id],
        distractorSongPool: poolIds,
        questionCountValue: "1",
        answerPoolSizeValue: "4",
        seed,
      });
      if (question.hints.some((h) => h.startLine === poolEntries[2].lines[0].line)) leaked = true;
    }
    assertEqual(leaked, false, "1曲だけで問題を作るとき（パーティーの差し替え）も、全曲と比べた除外が効く");
  }

  // ===== 候補切れ：無限ループせず、出題できる分だけ作る =====
  {
    const same = ["ぜんぶおなじかしのいちぎょうめ", "ぜんぶおなじかしのにぎょうめ"];
    const allSame = REAL.map((song) => ({ song, lines: makeLines(same) }));
    const questions = buildLyricsQuizQuestions({ songsWithLyrics: allSame, songPool, questionCountValue: "all", answerPoolSizeValue: "4", seed: 1 });
    assertEqual(questions.length, 0, "全曲の歌詞が同じ → 出題できる問題0件（例外・無限ループにならない）");
    const availability = validateLyricsQuizAvailability(allSame, "all");
    assertEqual(availability.ok, false, "全曲の歌詞が同じ → 開始前チェックでok:false");
    assertEqual(availability.reason.includes("答えが1曲に決まらない"), true, "開始前チェックの理由で、重複が原因だと分かる");

    const mixed = [
      { song: REAL[0], lines: makeLines(same) },
      { song: REAL[1], lines: makeLines(same) },
      { song: REAL[2], lines: uniqueLinesFor(3) },
    ];
    const fewer = buildLyricsQuizQuestions({ songsWithLyrics: mixed, songPool: mixed.map((e) => e.song.id), questionCountValue: "3", answerPoolSizeValue: "4", seed: 5 });
    assertEqual(fewer.map((q) => q.song.id), [REAL[2].id], "3問要求でも、答えが1曲に決まる曲だけで出題（1問）。重複した2曲を無理に出さない");

    // 一意な行が1行しかない曲：ヒントは1段階で打ち切り（stopReasonつき）。
    const oneUnique = [
      { song: REAL[0], lines: makeLines([...same, "このきょくだけのゆいいつのぎょう"]) },
      { song: REAL[1], lines: makeLines(same) },
    ];
    const [single] = buildLyricsQuizQuestions({ songsWithLyrics: oneUnique, songPool: [REAL[0].id, REAL[1].id], questionCountValue: "1", answerPoolSizeValue: "4", seed: 3 });
    assertEqual([single.song.id, single.hints.length, single.hints[0].stopReason], [REAL[0].id, 1, "insufficient-candidates"], "一意な行が1行だけ → ヒント1つで打ち切り（重複行で水増ししない）");
  }

  // ===== オンライン対戦：ルームの版と、古いアプリとの互換 =====
  {
    const settings = lyricsQuizBattleMode.defaultSettings();
    assertEqual(settings.lyricsUniquenessRulesVersion, LYRICS_UNIQUENESS_RULES_VERSION, "新しく作るルームの設定には、出題ルールの版が入る");
    assertEqual(typeof settings.lyricsUniquenessRulesVersion, "number", "版は数値（Firebaseへそのまま保存できる値。歌詞は含まない）");

    const legacySettings = { ...settings, questionCountValue: "all", answerPoolSizeValue: "4" };
    delete legacySettings.lyricsUniquenessRulesVersion;
    assertEqual(
      lyricsQuizBattleMode.resolveLyricsUniquenessForSettings(legacySettings),
      { supported: true, lyricsUniqueness: { enabled: false } },
      "版が無いルーム（古いアプリのホストが作成）→ 除外しない（ホストと同じ問題にするため）"
    );
    const legacyQuestions = lyricsQuizBattleMode.buildQuestions({ seed: 11, settings: legacySettings, runtimeContext: { ok: true, songsWithLyrics: songsWithShared, songPool } });
    const oldBehavior = buildLyricsQuizQuestions({ songsWithLyrics: songsWithShared, songPool, questionCountValue: "all", answerPoolSizeValue: "4", seed: 11, lyricsUniqueness: { enabled: false } });
    const shape = (questions) => questions.map((q) => ({ id: q.song.id, lines: q.hints.map((h) => h.startLine) }));
    assertEqual(shape(legacyQuestions), shape(oldBehavior), "版が無いルームでは、従来（除外なし）と完全に同じ問題になる");

    const futureSettings = { ...settings, questionSource: { type: "allSongs" }, lyricsUniquenessRulesVersion: LYRICS_UNIQUENESS_RULES_VERSION + 1 };
    assertEqual(
      lyricsQuizBattleMode.validateSettings(futureSettings),
      "歌詞クイズの出題ルールのバージョンが一致しません。アプリを更新してください。",
      "自分より新しい版のルーム → 設定検証でアプリ更新を案内"
    );
    assertEqual(
      lyricsQuizBattleMode.buildQuestions({ seed: 1, settings: futureSettings, runtimeContext: { ok: true, songsWithLyrics: songsWithShared, songPool } }),
      [],
      "自分より新しい版のルーム → 問題を作らない（ずれた問題で対戦しない）"
    );
    assertEqual(
      lyricsQuizBattleMode.checkRuntimeAvailability({ runtimeContext: { ok: true, songsWithLyrics: songsWithShared }, settings: futureSettings }).ok,
      false,
      "自分より新しい版のルーム → 開始前チェックもok:false"
    );
  }
}
