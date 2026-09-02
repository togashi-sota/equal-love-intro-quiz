// js/lyricsSegmentEngine.js（歌詞クイズの基準行選択・ヒント段階生成）のテスト。
//
// 【重要・著作権】このテストで使う歌詞テキストはすべて、テストのためだけに作った
// ダミーの日本語文（実在の楽曲の歌詞ではない）。歌詞クイズ機能は本人が用意した
// 実際の歌詞データを扱うが、その本文をテストファイル・Gitリポジトリに含めることは
// 一切しない（HANDOFF.mdの著作権運用方針どおり）。
//
// 【2026-08-09、実機プレイ後のヒント方式全面書き換えに伴うテスト全面書き換え】
// 旧方式（1〜4行の全パターンを事前生成し、広げられなくなったら別区間へジャンプ）から、
// 「基準行を1つ選び、必ずその基準行を含む範囲を1行ずつ、常に単調に広げる」方式へ変更。
// ヒントが増えるたびに情報が減ったり無関係な場所へ切り替わったりしないことを、
// このテストの中心に据えている。

import {
  normalizeLyricsQuizText,
  containsSongTitle,
  generateAnchorLineCandidates,
  pickPrimarySegment,
  buildHintSequence,
  computeLyricsContentHash,
  MIN_ANCHOR_QUALITY,
} from "../js/lyricsSegmentEngine.js";
import { assertEqual } from "./test-utils.js";

// テスト専用のダミー歌詞データ（10行）。実在の楽曲とは無関係。
// 4行目は曲名（ダミー）「なつのゆめ」を含む。5行目は2行目と全く同じテキストの繰り返し
// （サビの再登場を想定）で、かつ前の行との間隔を大きく空けて「間奏」を模している。
// 10行にしているのは、行番号が2桁になったときの並び替え不具合
// （id文字列比較だと"10-10"が"9-9"より前に来てしまう）を検出するため。
function buildDummyLines() {
  return [
    { line: 1, text: "あさのひかりがまどからさすよ", start: 0.0, end: 3.0 },
    { line: 2, text: "きみのことをおもいだしてるよ", start: 3.2, end: 6.0 },
    { line: 3, text: "そらはあおくてかぜはあたたかい", start: 6.2, end: 9.0 },
    { line: 4, text: "なつのゆめ はじまりのうただよ", start: 9.2, end: 12.0 },
    { line: 5, text: "きみのことをおもいだしてるよ", start: 30.0, end: 33.0 },
    { line: 6, text: "あしたもおなじみちをあるくんだ", start: 33.2, end: 36.0 },
    { line: 7, text: "とおくのまちへむかっているんだ", start: 36.2, end: 39.0 },
    { line: 8, text: "かぜがつめたくなってきたんだよ", start: 39.2, end: 42.0 },
    { line: 9, text: "ふゆのけはいがちかづいてくるよ", start: 42.2, end: 45.0 },
    { line: 10, text: "またあたらしいひがはじまるんだ", start: 45.2, end: 48.0 },
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
    containsSongTitle(normalizeLyricsQuizText("あさのひかりが まどからさす"), "なつのゆめ"),
    false,
    "曲名を含まないテキスト → false"
  );

  // ===== generateAnchorLineCandidates() =====

  assertEqual(generateAnchorLineCandidates([]), [], "linesが空配列 → 候補も空配列");
  assertEqual(generateAnchorLineCandidates(null), [], "linesがnull → 例外を投げず空配列");

  {
    const candidates = generateAnchorLineCandidates(buildDummyLines(), { title: "なつのゆめ" });

    assertEqual(candidates.length, 10, "候補数は行数と必ず一致する（1行＝1候補）");
    assertEqual(
      candidates.every((c) => c.startLine === c.endLine),
      true,
      "すべての候補は1行だけの範囲になる"
    );
    assertEqual(
      candidates.every((c) => typeof c.index === "number"),
      true,
      "各候補はlines配列内でのインデックスを持つ（buildHintSequence()へそのまま渡せるように）"
    );

    const line4 = candidates.find((c) => c.startLine === 4);
    assertEqual(line4.containsTitle, true, "曲名を含む行はcontainsTitle:true");
    assertEqual(line4.quality, 0, "曲名を含む行はquality:0");

    const line1 = candidates.find((c) => c.startLine === 1);
    assertEqual(line1.containsTitle, false, "曲名を含まない行はcontainsTitle:false");
    assertEqual(line1.quality, 100, "十分な長さ・非繰り返し・曲名なしの行はquality:100");

    const line2 = candidates.find((c) => c.startLine === 2);
    const line5 = candidates.find((c) => c.startLine === 5);
    assertEqual(line2.isRepeat, false, "先に出現したテキストの行はisRepeat:false");
    assertEqual(line5.isRepeat, true, "後から同じテキストが出てきた行はisRepeat:true");
    assertEqual(line5.quality, 50, "繰り返し行はqualityが半分になる（100→50）");
  }

  {
    // 短い行・長い行のquality評価を確認する。
    const shortLine = generateAnchorLineCandidates([{ line: 1, text: "みじかい", start: 0, end: 1 }]);
    assertEqual(shortLine[0].quality > 0 && shortLine[0].quality < 100, true, "6文字未満の短い行はquality0より大きく100未満");

    const longText = "あ".repeat(60);
    const longLine = generateAnchorLineCandidates([{ line: 1, text: longText, start: 0, end: 1 }]);
    assertEqual(longLine[0].quality >= 20 && longLine[0].quality < 100, true, "理想の長さを超える行は減点されるが0にはならない");
  }

  // ===== pickPrimarySegment() =====

  {
    const candidates = generateAnchorLineCandidates(buildDummyLines(), { title: "なつのゆめ" });

    const picked1 = pickPrimarySegment(candidates, 12345, "dummy-song", 0);
    const picked2 = pickPrimarySegment(candidates, 12345, "dummy-song", 0);
    assertEqual(picked1.id, picked2.id, "同じseed・songId・questionIndexなら常に同じ行を選ぶ");
    assertEqual(picked1.containsTitle, false, "選ばれる行は曲名を含まない");
    assertEqual(picked1.quality >= MIN_ANCHOR_QUALITY, true, "選ばれる行はMIN_ANCHOR_QUALITY以上になる（候補が十分にある場合）");

    // 【並び替え不具合の再発防止】旧実装はid文字列比較で並び替えていたため、
    // 2桁の行番号（10行目）が1桁の行番号より前に来てしまい、上位数件に絞ると
    // 常に曲の冒頭付近だけが選ばれる不具合があった。10行の曲で複数のseedを試し、
    // 行番号が10（2桁）の行も選ばれうることを確認する。
    const pickedStartLines = new Set();
    for (let seed = 0; seed < 30; seed += 1) {
      const picked = pickPrimarySegment(candidates, seed, "dummy-song", 0);
      pickedStartLines.add(picked.startLine);
    }
    assertEqual(pickedStartLines.size > 1, true, "seedを変えると異なる基準行が選ばれることがある（曲の一部分だけに偏らない）");

    assertEqual(pickPrimarySegment([], 1, "x", 0), null, "候補が空配列 → null（例外を投げない）");

    const onlyTitleCandidates = [
      { id: "1-1", index: 0, startLine: 1, endLine: 1, containsTitle: true, quality: 90 },
    ];
    assertEqual(pickPrimarySegment(onlyTitleCandidates, 1, "x", 0), null, "候補が全て曲名含有 → null");

    // MIN_ANCHOR_QUALITY以上の候補が無くても、quality>0であれば選ばれる
    // （極端に短い歌詞しかない曲を出題対象から不必要に除外しないため）。
    const onlyLowQuality = [
      { id: "1-1", index: 0, startLine: 1, endLine: 1, containsTitle: false, quality: 10 },
    ];
    assertEqual(
      pickPrimarySegment(onlyLowQuality, 1, "x", 0).id,
      "1-1",
      "MIN_ANCHOR_QUALITY未満でも、quality>0の候補があれば条件をゆるめて選ぶ"
    );
  }

  // ===== buildHintSequence()：4段階とも独立した別々の歌詞位置になる（2026-11-XX全面改訂・
  //       第2版：ヒントは曲全体からランダムに選ぶ） =====
  // 【本人指示：ヒント生成の再設計・第2版】前回（2026-10-01）は「使える行を歌詞の登場順に
  // 並べ、4グループへほぼ均等に分割し各グループから1件選ぶ」方式だったが、本人から
  // 「もっとランダム性のある結果にしてほしい」との指示があり、使える行全体から純粋に
  // ランダムに4件選ぶ方式へ変更した。あわせて、hintLevel（抽選順）と画面表示順
  // （歌詞の時系列）は別物になった：hintLevelは並べ替えない（抽選された順のまま）。

  {
    const lines = buildDummyLines();
    const hints = buildHintSequence(lines, 5, { title: "なつのゆめ", maxHints: 4, seed: 1, songId: "song-a", questionIndex: 0 });

    assertEqual(hints.length, 4, "使える行が十分にあれば4段階まで生成される");
    assertEqual(
      hints.every((h) => h.startLine === h.endLine),
      true,
      "各ヒントは独立した1行だけの範囲になる（前段階を含めて広がるのではない）"
    );

    const normalizedTexts = hints.map((h) => h.segment.normalizedText);
    assertEqual(
      new Set(normalizedTexts).size,
      normalizedTexts.length,
      "4段階とも正規化テキストが完全に重複しない（同じ文章を2回出さない）"
    );

    assertEqual(
      hints.every((h, i) => h.hintLevel === i + 1),
      true,
      "hintLevelは抽選順（配列の並び順）のまま1から連番になる"
    );

    assertEqual(
      hints.every((h) => h.startLine >= 1 && h.endLine <= lines.length),
      true,
      "startLine/endLineが歌詞の範囲外にならない"
    );

    assertEqual(hints[hints.length - 1].stopReason, null, "maxHintsまで到達できた場合、stopReasonはnull");
  }

  // ===== buildHintSequence()：hintLevel（抽選順）と歌詞の時系列は別物（本人指示：重要） =====
  // 複数のseedで試し、「hintLevelの順序どおりに歌詞のstartLineが単調増加するとは限らない」
  // （＝少なくとも1つのseedで、後のhintLevelのほうが前のhintLevelより歌詞的に早い位置に
  // なるケースがある）ことを確認する。これが「抽選順」と「表示順（時系列）」を画面側で
  // 別々に扱わなければならない理由そのもの。
  {
    const manyLines = Array.from({ length: 30 }, (_, i) => ({
      line: i + 1,
      text: `これはだい${i}ぎょうめのかしですよろしくおねがいします`,
      start: i * 3,
      end: i * 3 + 2,
    }));
    let foundOutOfOrder = false;
    for (let seed = 0; seed < 30; seed += 1) {
      const hints = buildHintSequence(manyLines, 0, { maxHints: 4, seed, songId: "song-b", questionIndex: 0 });
      const isMonotonic = hints.every((h, i) => i === 0 || h.startLine > hints[i - 1].startLine);
      if (!isMonotonic) {
        foundOutOfOrder = true;
        break;
      }
    }
    assertEqual(
      foundOutOfOrder,
      true,
      "hintLevelの並びは歌詞の時系列と一致しないことがある（抽選順と表示順は別物）"
    );
  }

  // ===== buildHintSequence()：曲名を含む行はどのヒントにも選ばれない =====

  {
    const lines = buildDummyLines();
    const hints = buildHintSequence(lines, 5, { title: "なつのゆめ", maxHints: 4, seed: 2, songId: "song-c", questionIndex: 0 });
    assertEqual(
      hints.every((h) => !h.segment.containsTitle),
      true,
      "曲名を含む行（4行目）はどのヒントにも選ばれない"
    );
    assertEqual(
      hints.every((h) => h.startLine !== 4),
      true,
      "曲名を含む行番号（4行目）自体が選ばれることはない"
    );
  }

  // ===== buildHintSequence()：使える行がmaxHints未満しかない短い歌詞 =====

  {
    const oneLineOnly = [{ line: 1, text: "たったひとことだけのかしです", start: 0, end: 2 }];
    const hints = buildHintSequence(oneLineOnly, 0, { maxHints: 4 });
    assertEqual(hints.length, 1, "1行しかない歌詞は、ヒントも1段階だけで安全に打ち切られる（例外を投げない）");
    assertEqual(
      hints[0].stopReason,
      "insufficient-candidates",
      "使える行がmaxHints未満の場合、stopReasonはinsufficient-candidates"
    );

    const threeLines = [
      { line: 1, text: "いちぎょうめのかしです", start: 0, end: 2 },
      { line: 2, text: "にぎょうめのかしになります", start: 2.2, end: 4 },
      { line: 3, text: "さんぎょうめでおわりです", start: 4.2, end: 6 },
    ];
    const hintsThree = buildHintSequence(threeLines, 1, { maxHints: 4 });
    assertEqual(hintsThree.length, 3, "3行しかない歌詞は、3段階（全行）でヒントが打ち切られる");
    assertEqual(
      [...hintsThree.map((h) => h.startLine)].sort((a, b) => a - b),
      [1, 2, 3],
      "3行しかない場合、3行すべてが（順不同で）別々のヒントとして使われる"
    );
    assertEqual(
      hintsThree[2].stopReason,
      "insufficient-candidates",
      "使える行を使い切って打ち切られた場合、stopReasonはinsufficient-candidates"
    );
  }

  // ===== buildHintSequence()：使える行がちょうどmaxHints以上ある場合はstopReason:null =====

  {
    const lines = buildDummyLines();
    const hints = buildHintSequence(lines, 0, { maxHints: 4 });
    assertEqual(hints.length, 4, "曲名を渡さない場合（全行が対象）は4段階まで生成される");
    assertEqual(hints[hints.length - 1].stopReason, null, "使える行がmaxHints以上ある場合、stopReasonはnull");
  }

  // ===== buildHintSequence()：異常な引数の安全な扱い =====

  assertEqual(buildHintSequence([], 0), [], "linesが空配列 → 空配列（例外を投げない）");
  assertEqual(buildHintSequence(buildDummyLines(), -1), [], "primaryLineIndexが範囲外（負） → 空配列");
  assertEqual(buildHintSequence(buildDummyLines(), 999), [], "primaryLineIndexが範囲外（超過） → 空配列");
  {
    // 基準行自体が曲名を含む場合は、呼び出し側のガード漏れ対策として空配列を返す
    // （通常はpickPrimarySegment()が曲名含有行を選ばないため起こらないはずだが、念のため）。
    const lines = [{ line: 1, text: "なつのゆめ はじまりのうた", start: 0, end: 2 }];
    assertEqual(
      buildHintSequence(lines, 0, { title: "なつのゆめ" }),
      [],
      "基準行がcontainsTitle:trueの場合 → 空配列"
    );
  }

  // ===== buildHintSequence()：決定論性（同じ入力は同じ結果） =====

  {
    const lines = buildDummyLines();
    const hintsA = buildHintSequence(lines, 5, { title: "なつのゆめ", maxHints: 4, seed: 3, songId: "song-d", questionIndex: 2 });
    const hintsB = buildHintSequence(lines, 5, { title: "なつのゆめ", maxHints: 4, seed: 3, songId: "song-d", questionIndex: 2 });
    assertEqual(
      hintsA.map((h) => `${h.startLine}-${h.endLine}`),
      hintsB.map((h) => `${h.startLine}-${h.endLine}`),
      "同じlines・primaryLineIndex・seed/songId/questionIndexなら、常に同じヒント行を返す（オンライン対戦の全端末一致に必須）"
    );
  }

  // ===== buildHintSequence()：seed・songId・questionIndexを変えると選ばれる4行の
  //       組み合わせも変わる（同じ曲でも問題ごとにヒントが変化する） =====

  {
    const manyLines = Array.from({ length: 20 }, (_, i) => ({
      line: i + 1,
      text: `これはだいなんぎょうめのかしですよろしく${i}`,
      start: i * 3,
      end: i * 3 + 2,
    }));
    const startLineSetsBySeed = new Set();
    for (let seed = 0; seed < 10; seed += 1) {
      const hints = buildHintSequence(manyLines, 0, { maxHints: 4, seed, songId: "song-e", questionIndex: 0 });
      startLineSetsBySeed.add([...hints.map((h) => h.startLine)].sort((a, b) => a - b).join(","));
    }
    assertEqual(
      startLineSetsBySeed.size > 1,
      true,
      "seedを変えると、選ばれる4行の組み合わせも変わる"
    );
  }

  // ===== buildHintSequence()：4つ全部が曲のごく狭い範囲に集中する極端な結果を避ける
  //       （本人指示：「2つくらい近い」は許容するが「4つ全部ほぼ同じ位置」は避ける） =====

  {
    const longSongLines = Array.from({ length: 40 }, (_, i) => ({
      line: i + 1,
      text: `これはだい${i}ぎょうめのかしですよろしくおねがいします`,
      start: i * 3,
      end: i * 3 + 2,
    }));
    const totalSpan = longSongLines[longSongLines.length - 1].line - longSongLines[0].line;
    let worstRatio = 1;
    for (let seed = 0; seed < 40; seed += 1) {
      const hints = buildHintSequence(longSongLines, 0, { maxHints: 4, seed, songId: "song-f", questionIndex: 0 });
      const startLines = hints.map((h) => h.startLine);
      const span = Math.max(...startLines) - Math.min(...startLines);
      const ratio = span / totalSpan;
      if (ratio < worstRatio) worstRatio = ratio;
    }
    assertEqual(
      worstRatio >= 0.3 - 1e-9,
      true,
      "40曲分seedを試しても、4ヒントの範囲が曲全体の30%を下回る極端な集中は起きない（再抽選ガードが機能している）"
    );
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
