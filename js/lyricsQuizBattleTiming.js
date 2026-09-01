// 歌詞クイズ オンライン対戦（Phase6）：画面表示用の「経過時間→ヒント段階」変換だけを行う、
// 独立した純粋関数のファイル。
//
// 【なぜ採点ロジック（js/battleRules/）と分けるか】採点（何点入るか）は、各自が回答を
// 送信した"瞬間"に自己申告したhintLevel（answers/{questionIndex}/{uid}.hintLevel）を
// js/battleRules/各ルールのresolveQuestionAnswers()がそのまま使う（詳しくは
// js/lyricsQuizBattleSecurityRules.jsのisHintLevelConsistentWithElapsedTime参照）。
// この関数はそれとは別に、「画面に今どのヒントまで見せるか」を経過時間から機械的に
// 計算するためだけのもので、採点には一切関与しない。
// battleRules/を直接importするのはjs/battleModes/lyricsQuizBattleMode.jsだけ、という
// 既存の設計方針を守るため、maxHintLevel・hintIntervalSecは呼び出し元
// （js/onlineLyricsQuizBattleScreen.js）がlyricsQuizBattleMode経由で受け取って渡す。

// 経過時間（ミリ秒）から、今表示すべきヒント段階（1〜maxHintLevel）を求める。
// 0〜interval秒未満はヒント1、interval〜2*interval秒未満はヒント2、…という区切り。
export function deriveHintLevelFromElapsedMs({ elapsedMs, hintIntervalSec, maxHintLevel }) {
  if (!(elapsedMs > 0)) return 1;
  const intervalMs = hintIntervalSec * 1000;
  const level = Math.floor(elapsedMs / intervalMs) + 1;
  return Math.min(Math.max(level, 1), maxHintLevel);
}

// 「サーバー時刻ベースの現在時刻」と「問題が始まったサーバー時刻」の差から経過時間を求める。
// questionStartedAtがまだFirebaseから読めていない場合（初回描画の一瞬等）は0を返す。
export function computeElapsedMs({ questionStartedAt, nowServerTimeMs }) {
  if (typeof questionStartedAt !== "number") return 0;
  return Math.max(0, nowServerTimeMs - questionStartedAt);
}

// 【2026-08-31追加・早押しバトル用】経過時間から、歌詞の該当箇所を何文字まで
// 表示すべきかを求める（本人指示：「とくべチュ、して」が と→とく→とくべ→…と
// 1文字/秒で表示される）。問題が始まった瞬間（elapsedMs=0）から1文字目は見えている
// 状態にする（0文字表示の空白時間を作らないため）。
export function deriveRevealedCharCount({ elapsedMs, totalCharCount, msPerChar = 1000 }) {
  if (!(totalCharCount > 0)) return 0;
  if (!(elapsedMs > 0)) return 1;
  const revealedCount = Math.floor(elapsedMs / msPerChar) + 1;
  return Math.min(Math.max(revealedCount, 1), totalCharCount);
}

// 文字列の先頭からrevealedCharCount文字だけを取り出す。
// 【絵文字・サロゲートペア対応】JavaScriptの文字列は".length"や単純なスライスだと
// サロゲートペア（絵文字等、1つの見た目の文字が2つのUTF-16コード単位からなる文字）を
// 途中で分断してしまうことがある。Array.from()は文字列をUnicodeのコードポイント単位で
// 分割するため、この問題を避けられる（本人指示：「絵文字・記号・サロゲートペア等で
// 1文字が壊れないよう安全に実装してください」への対応）。
export function revealTextByCharCount(fullText, revealedCharCount) {
  if (typeof fullText !== "string") return "";
  const characters = Array.from(fullText);
  return characters.slice(0, revealedCharCount).join("");
}

// revealTextByCharCount()が返しうる最大文字数（=フルテキストの文字数、サロゲートペア対応）。
export function countCharacters(fullText) {
  if (typeof fullText !== "string") return 0;
  return Array.from(fullText).length;
}

// 【2026-09-14新設・本人指示：早押しバトルのヒント1〜4を順番に1文字ずつ表示】
// 以前はヒント4段階のうち最も詳しい1段階（hints[length-1]）だけを経過時間に応じて
// 1文字ずつ表示し、残り3段階は答え合わせ時にしか見せていなかった。今回、ヒント1から
// 順番に「1文字/秒で全文表示→2秒待機→次のヒントへ」を繰り返し、かつ既に表示済みの
// ヒントは消さずに積み上げて見せる仕様に変更する。
//
// このファイルの既存方針どおり、setInterval等のタイマー管理は一切持たず、「経過時間から
// 今の状態を毎回計算し直す」純粋関数のままにする（js/onlineLyricsQuizBattleScreen.jsの
// 400ms tickから毎回呼ばれ、正解確定（isResolved）になった瞬間はこの関数自体が
// 呼ばれなくなる＝呼び出し側の分岐だけで自然に「進行が止まる」ので、この関数の中に
// 専用の停止処理は不要）。
//
// hintTexts: 各ヒント段階の歌詞テキストを順番に並べた配列（[hint1, hint2, hint3, hint4]）。
// 戻り値: { levels, currentLevel }
//   levels: 今までに表示が始まった段階すべての配列（1段階目から順、消さずに積み上げる）。
//     各要素 { level, revealedText, totalCharCount, isFullyRevealed }。
//   currentLevel: levels.length（今何段階目まで表示が始まっているか）。
export function computeStealHintProgress({ elapsedMs, hintTexts, msPerChar = 1000, pauseMsBetweenHints = 2000 }) {
  const levels = [];
  let cursorMs = Math.max(0, elapsedMs);

  for (let level = 1; level <= hintTexts.length; level++) {
    // 1段階目は経過時間0でも必ず表示を始める（本人指示の踏襲：0文字表示の空白時間を
    // 作らない）。2段階目以降も、前段階の表示＋2秒待機がちょうど終わった瞬間
    // （cursorMs===0）から同じ理由で即座に表示を始める。cursorMsが負（＝まだ待機中）の
    // ときだけここで止め、その段階はlevelsに含めない＝まだ画面に出さない。
    if (level > 1 && cursorMs < 0) break;

    const text = hintTexts[level - 1] ?? "";
    const totalCharCount = countCharacters(text);
    const revealedCharCount = totalCharCount === 0 ? 0 : deriveRevealedCharCount({ elapsedMs: cursorMs, totalCharCount, msPerChar });
    const isFullyRevealed = revealedCharCount >= totalCharCount;
    levels.push({
      level,
      revealedText: revealTextByCharCount(text, revealedCharCount),
      totalCharCount,
      isFullyRevealed,
    });

    if (!isFullyRevealed) break; // 今まさにこの段階を表示中。次の段階へはまだ進まない。

    // 次の段階の「開始からの経過時間」を計算するため、この段階の表示に要した時間
    // （deriveRevealedCharCountと同じ考え方：1文字目は即表示、以降1文字ごとにmsPerChar）
    // ＋待機時間を差し引く。
    const revealDurationMs = Math.max(0, (totalCharCount - 1) * msPerChar);
    cursorMs -= revealDurationMs + pauseMsBetweenHints;
  }

  return { levels, currentLevel: levels.length };
}
