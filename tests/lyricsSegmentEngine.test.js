// js/lyricsSegmentEngine.js（歌詞クイズの区間自動生成・ヒント段階生成）のテスト。
//
// 【重要・著作権】このテストで使う歌詞テキストはすべて、テストのためだけに作った
// ダミーの日本語文（実在の楽曲の歌詞ではない）。歌詞クイズ機能は本人が用意した
// 実際の歌詞データを扱うが、その本文をテストファイル・Gitリポジトリに含めることは
// 一切しない（HANDOFF.mdの著作権運用方針どおり）。ここでは「行の構造」「繰り返し」
// 「句読点」「間隔（間奏）」「曲名らしき単語」を模した架空の文だけを使う。

import {
  normalizeLyricsQuizText,
  containsSongTitle,
  generateLyricsSegments,
  pickPrimarySegment,
  buildHintSequence,
  computeLyricsContentHash,
} from "../js/lyricsSegmentEngine.js";
import { assertEqual } from "./test-utils.js";

// テスト専用のダミー歌詞データ。実在の楽曲とは無関係。
// 4行目は曲名（ダミー）「なつのゆめ」を含む。5行目は2行目と全く同じテキストの繰り返し
// （サビの再登場を想定）で、かつ前の行との間隔を大きく空けて「間奏」を模している。
function buildDummyLines() {
  return [
    { line: 1, text: "あさのひかりが まどからさす", start: 0.0, end: 3.0 },
    { line: 2, text: "きみのことを おもいだしてる", start: 3.2, end: 6.0 },
    { line: 3, text: "そらはあおくて かぜはあたたかい。", start: 6.2, end: 9.0 },
    { line: 4, text: "なつのゆめ はじまりのうた", start: 9.2, end: 12.0 },
    { line: 5, text: "きみのことを おもいだしてる", start: 30.0, end: 33.0 },
    { line: 6, text: "あしたも おなじみちをあるく", start: 33.2, end: 36.0 },
  ];
}

export function runLyricsSegmentEngineTests() {
  // ===== normalizeLyricsQuizText() =====

  assertEqual(normalizeLyricsQuizText("ａｂｃ１２３"), "abc123", "全角英数字を半角に変換する");
  assertEqual(normalizeLyricsQuizText("ｱｲｳ"), "ｱｲｳ", "半角カタカナは変換対象外（全角カタカナのみ変換）");
  assertEqual(normalizeLyricsQuizText("アイウ"), "あいう", "全角カタカナをひらがなに変換する");
  assertEqual(normalizeLyricsQuizText("な つ の ゆめ"), "なつのゆめ", "空白を除去する");
  assertEqual(normalizeLyricsQuizText("なつ・の「ゆめ」！？"), "なつのゆめ", "記号を除去する");
  assertEqual(normalizeLyricsQuizText("ナツノユメ"), "なつのゆめ", "カタカナ＋正規化後にひらがなの曲名と一致する");

  // ===== containsSongTitle() =====

  assertEqual(
    containsSongTitle(normalizeLyricsQuizText("なつのゆめ はじまりのうた"), "なつのゆめ"),
    true,
    "正規化後のテキストに曲名がそのまま含まれる → true"
  );
  assertEqual(
    containsSongTitle(normalizeLyricsQuizText("なつのゆめ はじまりのうた"), "ナツノユメ"),
    true,
    "曲名側がカタカナ表記でも、正規化後に一致すればtrue"
  );
  assertEqual(
    containsSongTitle(normalizeLyricsQuizText("あさのひかりが まどからさす"), "なつのゆめ"),
    false,
    "曲名を含まないテキスト → false"
  );
  assertEqual(
    containsSongTitle(normalizeLyricsQuizText("あのなつうたをうたおう"), "べつのきょく", [
      { text: "夏歌", reading: "なつうた" },
    ]),
    true,
    "曲名自体は含まないが、別名（aliases）のreading（ひらがな表記）が含まれる → true"
  );
  assertEqual(
    containsSongTitle(normalizeLyricsQuizText("なにもない一日"), "", []),
    false,
    "曲名が空文字列 → 誤検出せずfalse"
  );

  // ===== generateLyricsSegments() =====

  assertEqual(generateLyricsSegments([]), [], "linesが空配列 → 区間も空配列");
  assertEqual(generateLyricsSegments(null), [], "linesがnull → 例外を投げず空配列");

  {
    const segments = generateLyricsSegments(buildDummyLines(), {
      title: "なつのゆめ",
      maxWindowLines: 4,
      maxLineGapSec: 3,
    });

    // 1行だけの区間（startLine === endLine）はlines.length件（6件）必ず存在する。
    const singleLineSegments = segments.filter((s) => s.startLine === s.endLine);
    assertEqual(singleLineSegments.length, 6, "1行だけの区間が行数分（6件）生成される");

    // 4行目（なつのゆめ を含む行）を含む区間は、必ずcontainsTitle:trueかつquality:0になる。
    const segmentsIncludingLine4 = segments.filter((s) => s.startLine <= 4 && s.endLine >= 4);
    assertEqual(
      segmentsIncludingLine4.every((s) => s.containsTitle === true && s.quality === 0),
      true,
      "曲名を含む行をまたぐ区間はすべてcontainsTitle:true・quality:0になる"
    );

    // 曲名を含まない1行目の区間は曲名を含まない。
    const line1Only = segments.find((s) => s.startLine === 1 && s.endLine === 1);
    assertEqual(line1Only.containsTitle, false, "曲名を含まない行の区間はcontainsTitle:false");

    // 3行目は句読点（。）で終わるため、3行目を含む区間はそれ以上windowが広がらない
    // （3行目を起点に4行目以降まで含む区間が存在しない）。
    const segmentsStartingAtLine3 = segments.filter((s) => s.startLine === 3);
    assertEqual(
      segmentsStartingAtLine3.every((s) => s.endLine === 3),
      true,
      "句読点で終わる行を起点にした区間は、その行より先へ広がらない"
    );

    // 4行目と5行目の間はmaxLineGapSec（3秒）を大きく超える間隔（18秒）があるため、
    // 4行目と5行目をまたぐ区間は生成されない。
    const crossesInterlude = segments.some((s) => s.startLine <= 4 && s.endLine >= 5);
    assertEqual(crossesInterlude, false, "間隔が大きい行（間奏相当）をまたぐ区間は生成されない");

    // 2行目「きみのことを おもいだしてる」と5行目（同一テキスト）は、
    // 5行目側だけがisRepeat:trueになる（先に出てきた2行目はisRepeat:false）。
    const line2 = segments.find((s) => s.startLine === 2 && s.endLine === 2);
    const line5 = segments.find((s) => s.startLine === 5 && s.endLine === 5);
    assertEqual(line2.isRepeat, false, "先に出現したテキストの区間はisRepeat:false");
    assertEqual(line5.isRepeat, true, "後から同じテキストが出てきた区間はisRepeat:true");

    // すべての区間のtextは、対応する行のtextを改行で連結したものと完全に一致する
    // （行の途中で切られていないことの確認）。
    const dummyLines = buildDummyLines();
    const twoLineSegment = segments.find((s) => s.startLine === 1 && s.endLine === 2);
    assertEqual(
      twoLineSegment.text,
      `${dummyLines[0].text}\n${dummyLines[1].text}`,
      "複数行の区間は行のtextをそのまま連結したものになる（単語の途中で切れない）"
    );
  }

  // ===== pickPrimarySegment() =====

  {
    const segments = generateLyricsSegments(buildDummyLines(), { title: "なつのゆめ" });

    const picked1 = pickPrimarySegment(segments, 12345, "dummy-song", 0);
    const picked2 = pickPrimarySegment(segments, 12345, "dummy-song", 0);
    assertEqual(picked1.id, picked2.id, "同じseed・songId・questionIndexなら常に同じ区間を選ぶ");

    assertEqual(picked1.containsTitle, false, "選ばれる区間は曲名を含まない");

    const pickedForOtherQuestion = pickPrimarySegment(segments, 12345, "dummy-song", 1);
    // 必ずしも異なるとは限らないため、少なくとも例外が起きず有効な区間を返すことだけ確認する。
    assertEqual(
      typeof pickedForOtherQuestion.id === "string",
      true,
      "questionIndexが違っても有効な区間を返す"
    );

    assertEqual(
      pickPrimarySegment([], 1, "x", 0),
      null,
      "候補が空配列 → null（例外を投げない）"
    );

    const onlyTitleSegments = [
      { id: "1-1", startLine: 1, endLine: 1, containsTitle: true, quality: 90 },
    ];
    assertEqual(
      pickPrimarySegment(onlyTitleSegments, 1, "x", 0),
      null,
      "候補が全て曲名含有 → null"
    );
  }

  // ===== buildHintSequence() =====

  {
    const segments = generateLyricsSegments(buildDummyLines(), { title: "なつのゆめ", maxWindowLines: 4 });
    const primary = pickPrimarySegment(segments, 999, "dummy-song", 0);
    const hints = buildHintSequence(segments, primary.id, 4);

    assertEqual(hints.length <= 4, true, "ヒント数は最大4件を超えない");
    assertEqual(hints[0].hintLevel, 1, "1件目のhintLevelは1");
    assertEqual(hints[0].segmentId, primary.id, "1件目のsegmentIdはprimarySegmentIdと一致する");

    const hintLevels = hints.map((h) => h.hintLevel);
    const expectedLevels = hints.map((_, index) => index + 1);
    assertEqual(hintLevels, expectedLevels, "hintLevelは1から連番で増える");

    const segmentIds = hints.map((h) => h.segmentId);
    const uniqueSegmentIds = new Set(segmentIds);
    assertEqual(uniqueSegmentIds.size, segmentIds.length, "同じ区間を2回以上ヒントに使わない");

    assertEqual(
      hints.every((h) => {
        const segment = segments.find((s) => s.id === h.segmentId);
        return segment && segment.containsTitle === false;
      }),
      true,
      "どのヒントの区間も曲名を含まない"
    );
  }

  assertEqual(
    buildHintSequence([{ id: "1-1", startLine: 1, endLine: 1, containsTitle: true, quality: 0 }], "1-1"),
    [],
    "primarySegmentIdがcontainsTitle:trueの区間 → 空配列（呼び出し側のガード漏れ対策）"
  );
  assertEqual(buildHintSequence([], "not-found"), [], "primarySegmentIdが候補内に存在しない → 空配列");

  {
    // 拡張フォールバックの確認：1行しかない極端に短い歌詞データでは、
    // 「広げる」候補が存在しないため、2件目以降のヒントは生成されない
    // （別区間への切り替え候補も無い場合は、そこでヒント生成が止まる）。
    const oneLineOnly = [{ line: 1, text: "たったひとことだけ", start: 0, end: 2 }];
    const segments = generateLyricsSegments(oneLineOnly);
    const primary = pickPrimarySegment(segments, 1, "short-song", 0);
    const hints = buildHintSequence(segments, primary.id, 4);
    assertEqual(hints.length, 1, "候補が1区間しかない曲は、ヒントも1段階だけで打ち切られる");
  }

  // ===== computeLyricsContentHash() =====

  {
    const linesA = buildDummyLines();
    const linesB = buildDummyLines();
    assertEqual(
      computeLyricsContentHash(linesA),
      computeLyricsContentHash(linesB),
      "同じ内容のlinesなら常に同じハッシュ値になる"
    );

    const linesChanged = buildDummyLines();
    linesChanged[0] = { ...linesChanged[0], text: "ちがうかしだよ" };
    assertEqual(
      computeLyricsContentHash(linesA) === computeLyricsContentHash(linesChanged),
      false,
      "1行でも内容が違えばハッシュ値も変わる"
    );

    assertEqual(typeof computeLyricsContentHash(linesA), "string", "ハッシュ値は文字列で返す");
  }
}
