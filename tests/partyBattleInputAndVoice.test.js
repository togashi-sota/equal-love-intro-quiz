// パーティー対戦（2026-09-15新設）の入力判定（js/partyBattleInput.js）・音声回答の時間計算
// （js/partyBattleVoice.js）・曲名マッチング（js/songNameMatcher.js）・保存データ（js/partyBattleStorage.js）
// のテスト。実際のWeb Speech APIは呼ばない（本人確定：CI／desktopで実サービス成功を「テスト済み」と偽らない）。

import { createClaimArbiter, isLongPressSatisfied, computeLongPressProgress } from "../js/partyBattleInput.js";
import { computeVoiceDeadline, isSpeechRecognitionSupported, startVoiceRecognitionSession } from "../js/partyBattleVoice.js";
import {
  normalizeSpokenText,
  buildSongNameCandidates,
  scoreSongAgainstSpokenText,
  matchSpokenSongName,
  decideVoiceVerdict,
} from "../js/songNameMatcher.js";
import { SONGS } from "../js/data/songs.js";
import {
  getRecentPartyPlayerNames,
  rememberPartyPlayerNames,
  getLastPartySettings,
  saveLastPartySettings,
  buildPartyBattleHistoryEntry,
} from "../js/partyBattleStorage.js";
import { normalizePartySettings, buildPartyPlayers, createPartyMatch } from "../js/partyBattleState.js";
import { assertEqual } from "./test-utils.js";

export function runPartyBattleInputTests() {
  // ===== 早押しの受理：START前の指は無効、最初の1件だけ =====
  const arbiter = createClaimArbiter();
  assertEqual(arbiter.tryClaim(100), false, "enable前は何も受理しない");
  arbiter.enable(1000);
  assertEqual(arbiter.tryClaim(900), false, "START前（enable時刻より前）に始まったpointerはフライングとして拒否");
  assertEqual(arbiter.tryClaim(1000), true, "START時刻ちょうどのpointerは受理");
  assertEqual(arbiter.tryClaim(1001), false, "同時に近い2件目は拒否（最初の1件だけ）");
  assertEqual(arbiter.isEnabled(), false, "受理した瞬間にロックが立つ");
  arbiter.enable(2000);
  assertEqual(arbiter.tryClaim(2500), true, "次の問題（再enable）では再び受理できる");
  arbiter.disable();
  assertEqual(arbiter.tryClaim(9999), false, "disable後は受理しない");

  // ===== 長押し =====
  assertEqual(isLongPressSatisfied(0, 999, 1000), false, "1秒未満のタップでは全員PASSは成立しない");
  assertEqual(isLongPressSatisfied(0, 1000, 1000), true, "1秒押し続けたら成立");
  assertEqual(isLongPressSatisfied(null, 1000, 1000), false, "押していない状態では成立しない");
  assertEqual(computeLongPressProgress(0, 500, 1000), 0.5, "進捗は0〜1");
  assertEqual(computeLongPressProgress(0, 1500, 1000), 1, "進捗は1で頭打ち");
}

export function runPartyBattleVoiceTests() {
  // ===== 締切の計算：話し始めるまでの制限、発話開始後は最大5秒 =====
  assertEqual(computeVoiceDeadline({ claimedAtMs: 0, speechStartedAtMs: null, startTimeoutSec: 3 }), 3000, "発話前は「回答権＋制限秒」が締切");
  assertEqual(computeVoiceDeadline({ claimedAtMs: 0, speechStartedAtMs: 2900, startTimeoutSec: 3 }), 7900, "制限ぎりぎりに話し始めても、発話開始から5秒待てる");
  assertEqual(computeVoiceDeadline({ claimedAtMs: 0, speechStartedAtMs: 100, startTimeoutSec: 10 }), 10000, "早く話し始めた場合も制限秒までは待つ（大きい方）");
  assertEqual(typeof isSpeechRecognitionSupported(), "boolean", "対応判定はbooleanを返す");

  // APIが無い／使えない環境でも例外にならず、unsupportedで即終了する（人間判定へ落とすための契約）
  const original = { a: window.SpeechRecognition, b: window.webkitSpeechRecognition };
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = undefined;
  let endReason = null;
  const session = startVoiceRecognitionSession({ onEnd: (reason) => (endReason = reason) });
  assertEqual(endReason, "unsupported", "API非対応ならonEnd('unsupported')が同期的に呼ばれる");
  session.abort();
  assertEqual(endReason, "unsupported", "abortを重ねてもonEndは1回だけ");
  window.SpeechRecognition = original.a;
  window.webkitSpeechRecognition = original.b;
}

export function runSongNameMatcherTests() {
  // ===== 正規化 =====
  assertEqual(normalizeSpokenText("青春 サブリミナル です"), "青春さぶりみなる", "空白・語尾「です」を落とし、カナはひらがなへ");
  assertEqual(normalizeSpokenText("イコールラブ、かな"), "いこーるらぶ".replace(/ー/g, ""), "句読点・語尾・長音を落とす");
  assertEqual(normalizeSpokenText(""), "", "空文字は空");
  assertEqual(normalizeSpokenText(null), "", "nullは空");

  // ===== 全84曲：曲名／読み／別名で必ずその曲が1位で返る（既存辞書だけを使う） =====
  let checked = 0;
  SONGS.forEach((song) => {
    const inputs = [song.title];
    if (song.searchReading) inputs.push(song.searchReading);
    (song.searchAliases ?? []).forEach((alias) => {
      if (typeof alias === "string") inputs.push(alias);
      else {
        inputs.push(alias.text);
        if (alias.reading) inputs.push(alias.reading);
      }
    });
    inputs.forEach((input) => {
      const result = matchSpokenSongName([input], SONGS);
      const ok = result.song?.id === song.id && result.status === "match";
      if (!ok) {
        assertEqual(`${result.status}:${result.song?.title ?? "-"}`, `match:${song.title}`, `「${input}」→${song.title}が1位で一致する`);
      }
      checked += 1;
    });
  });
  assertEqual(checked > 84, true, "曲名・読み・別名の全候補を検査した");
  const { official, aliases } = buildSongNameCandidates(SONGS.find((song) => song.id === SONGS[0].id));
  assertEqual(official.length >= 1, true, "曲名は必ず候補に入る");
  assertEqual(Array.isArray(aliases), true, "別名は配列");

  // ===== 音声認識由来の揺れ =====
  const seishun = SONGS.find((song) => song.title === '青春"サブリミナル"');
  if (seishun) {
    assertEqual(matchSpokenSongName(["青春サブリミナル"], SONGS).song?.id, seishun.id, "記号（\"）の有無を吸収");
    assertEqual(matchSpokenSongName(["せいしゅんさぶりみなる、です"], SONGS).song?.id, seishun.id, "ひらがな＋句読点＋語尾でも一致");
    assertEqual(matchSpokenSongName(["青サブ"], SONGS).song?.id, seishun.id, "登録済みの別名（青サブ）は受理");
    assertEqual(decideVoiceVerdict(matchSpokenSongName(["青サブ"], SONGS), seishun.id), "correct", "正解曲と一致すれば自動判定：正解");
    const other = SONGS.find((song) => song.id !== seishun.id && song.searchReading);
    assertEqual(decideVoiceVerdict(matchSpokenSongName([other.title], SONGS), seishun.id), "wrong", "別の曲へ完全一致なら自動判定：不正解");
  }
  assertEqual(matchSpokenSongName(["ぱ"], SONGS).status === "match", false, "1〜2文字の断片だけでは自動正解にしない");
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["まったく関係ない言葉"], SONGS), "x"), "manual", "何にも一致しなければ人間判定へ");
  assertEqual(decideVoiceVerdict(null, "x"), "manual", "結果なしは人間判定へ");
  assertEqual(scoreSongAgainstSpokenText({ title: "ABC", searchAliases: ["ab"] }, "ab"), 3, "別名は完全一致で最高スコア");
  assertEqual(scoreSongAgainstSpokenText({ title: "ABCDE" }, "abc"), 2, "3文字以上の前方一致は中スコア");
  assertEqual(scoreSongAgainstSpokenText({ title: "ABCDE" }, "cd"), 0, "3文字未満の部分一致は不一致扱い");
  // 前方一致（score 2）で別の曲になった場合は聞き間違いの可能性があるので人間判定へ
  assertEqual(decideVoiceVerdict({ status: "match", song: { id: "y" }, score: 2 }, "x"), "manual", "前方一致レベルの別曲は自動不正解にしない");
  assertEqual(decideVoiceVerdict({ status: "ambiguous", song: { id: "x" }, score: 3 }, "x"), "manual", "曖昧（同点候補が複数）は人間判定へ");
}

export function runPartyBattleStorageTests() {
  const keys = ["equalLoveIntroQuiz.partyBattle.recentNames", "equalLoveIntroQuiz.partyBattle.lastSettings"];
  keys.forEach((key) => localStorage.removeItem(key));

  rememberPartyPlayerNames(["あい", "プレイヤー2", "  ", "ゆい"]);
  assertEqual(getRecentPartyPlayerNames(), ["あい", "ゆい"], "既定名「プレイヤーN」と空欄は候補に入れない");
  rememberPartyPlayerNames(["ゆい", "さな"]);
  assertEqual(getRecentPartyPlayerNames(), ["ゆい", "さな", "あい"], "新しい名前が先頭、重複なし");

  saveLastPartySettings({ playerCount: 3, emptySeatId: "topLeft", quizType: "lyrics", questionCountValue: "10", answerMethod: "voice", otetsuki: false });
  const restored = getLastPartySettings();
  assertEqual(restored.playerCount, 3, "前回の人数を復元");
  assertEqual(restored.emptySeatId, "topLeft", "前回の空席を復元");
  assertEqual(restored.quizType, "lyrics", "前回の出題タイプを復元");
  assertEqual(restored.answerMethod, "voice", "前回の回答方式を復元");
  assertEqual(restored.otetsuki, false, "前回のお手つき設定を復元");
  localStorage.setItem("equalLoveIntroQuiz.partyBattle.lastSettings", "{broken json");
  assertEqual(getLastPartySettings().playerCount, 2, "壊れた保存データは既定値へ（例外にしない）");

  // ===== 履歴データ：個人記録系のフィールドを一切持たない =====
  const settings = normalizePartySettings({ playerCount: 2, playerNames: ["あい", "ゆい"], quizType: "instant", questionCountValue: "3", answerMethod: "voice", voiceStartTimeoutSec: 5, instantClipSec: "0.5", instantMaxListens: 5 });
  const built = buildPartyPlayers(settings);
  let match = createPartyMatch({ settings, players: built.players, layout: built.layout, seats: built.seats, questions: [], plannedCount: 3, seed: 1 });
  match = { ...match, status: "finished", winnerId: "p2", scores: { p1: 1, p2: 2 }, stats: { ...match.stats, wrongCount: 4, passCount: 1, suddenDeathQuestionCount: 0 } };
  const entry = buildPartyBattleHistoryEntry(match, { playedAt: 123 });
  assertEqual(entry.modeId, "partyBattle", "modeIdはpartyBattle");
  assertEqual(entry.completed, true, "完走した試合だけ保存する前提でcompleted=true");
  assertEqual(entry.questionCount, 3, "予定問題数");
  assertEqual(entry.correctCount, 3, "正解数は全員の得点合計");
  assertEqual(entry.wrongCount, 4, "誤答数は誤答回数");
  assertEqual(entry.skippedCount, 1, "スキップ数はPASS回数");
  assertEqual(entry.score, null, "スコア（点数）は持たない");
  assertEqual(entry.details.playerCount, 2, "人数");
  assertEqual(entry.details.quizType, "instant", "出題タイプ");
  assertEqual(entry.details.answerMethod, "voice", "回答方式");
  assertEqual(entry.details.voiceStartTimeoutSec, 5, "音声時間（音声のときだけ）");
  assertEqual(entry.details.instantClipSec, 0.5, "一瞬設定（一瞬のときだけ）");
  assertEqual(entry.details.instantMaxListens, 5, "最大試聴回数");
  assertEqual(entry.details.hadSuddenDeath, false, "サドンデスの有無");
  assertEqual(entry.details.standings.map((row) => `${row.rank}:${row.playerName}:${row.score}`), ["1:ゆい:2", "2:あい:1"], "順位表（rank/name/score）");
  assertEqual(entry.details.standings[0].isWinner, true, "優勝者フラグ");
  assertEqual("rule" in entry.details, false, "旧1台対戦のrule等は持たない");

  keys.forEach((key) => localStorage.removeItem(key));
}

// ===== 配線テスト：新規JSがService Workerに登録され、個人記録系モジュールをimportしていない =====
export async function runPartyBattleWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const sw = await fetchText("sw.js");
  [
    "partyBattleState",
    "partyBattleInput",
    "partyBattleVoice",
    "partyBattleStorage",
    "partyBattleEngine",
    "partyBattleScreen",
    "partyBattlePlayScreen",
    "songNameMatcher",
    "songSearch",
  ].forEach((name) => {
    assertEqual(sw.includes(`"./js/${name}.js"`), true, `sw.jsのAPP_SHELLに${name}.jsが登録されている`);
  });

  const forbidden = ["timeAttackLeaderboard", "achievement", "weakSongStats", "shuffleWeakSongStats", "outroWeakSongStats", "randomPlaybackScore", "firebase"];
  for (const name of ["partyBattleEngine", "partyBattleStorage", "partyBattleState", "partyBattleScreen", "partyBattlePlayScreen"]) {
    const source = await fetchText(`js/${name}.js`);
    const imports = source.split("\n").filter((line) => line.startsWith("import "));
    forbidden.forEach((word) => {
      assertEqual(
        imports.some((line) => line.toLowerCase().includes(word.toLowerCase())),
        false,
        `${name}.jsは${word}系のモジュールをimportしない（個人PB・ランキング・称号・苦手曲・Firebaseを汚さない）`
      );
    });
  }

  const html = await fetchText("index.html");
  assertEqual(html.includes('id="party-battle-setup-screen"'), true, "設定画面が存在する");
  assertEqual(html.includes('id="party-battle-play-screen"'), true, "対戦盤面が存在する");
  assertEqual(html.includes('id="history-tab-party"'), true, "プレイ履歴に「パーティー」タブがある");
  assertEqual(html.includes('id="guide-video-card"') && html.includes('target="_blank" rel="noopener noreferrer"'), true, "ガイド最上部の動画カードが外部リンク（新しいタブ・noopener）");
  assertEqual(html.includes('id="battle-mode-select-screen"'), true, "旧1台対戦の画面は互換のため残っている（ホームからの導線だけ置き換え）");

  const specialModes = await fetchText("js/specialModesScreen.js");
  assertEqual(specialModes.includes('id: "partyBattle"'), true, "ホームのカードにパーティー対戦がある");
  assertEqual(specialModes.includes('id: "localBattle"'), false, "ホームのカードから旧1台対戦は消えている");

  const guide = await fetchText("js/data/guideContent.js");
  assertEqual(guide.includes("https://www.youtube.com/watch?v=n3YIZBR-Zl8"), true, "動画URLはguideContent.jsに1箇所");
  assertEqual(guide.includes('id: "partyBattle"'), true, "ガイドにパーティー対戦の項目がある");
  assertEqual(guide.includes('id: "localBattle"'), false, "ガイドから旧1台対戦の項目は消えている");
  assertEqual(guide.includes("間違えた曲だけ復習する"), true, "ガイドに復習クイズの記述がある");
  assertEqual(guide.includes("一緒に遊ぶ") && guide.includes("友達を招待"), true, "ガイドに招待機能の記述がある");
}
