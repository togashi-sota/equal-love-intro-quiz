// パーティー対戦「第7回実機QA修正」（2026-09-16・本人指示）のテスト：
//   (A) 音声回答の寛容化：受入ケース（「特別して」→とくべチュ、して／「Sweet Girl」→Sweetest girl 等）と既存ケースの維持
//   (B) 全84曲×擬似「発話崩れ」（先頭・末尾・中央欠け／置換／長音・空白・記号脱落／カナ化／大小／語尾）の総当たり：
//       別曲への自動誤正解 0 件・自動不正解（崩れ入力での）0 件を守りつつ、自分の曲への自動正解率を報告
//   (C) パーティー専用 SFX（正解／不正解／優勝）がテーマ非依存で、ON/OFF・音量だけ設定に従う
import { assertEqual } from "./test-utils.js";
import { SONGS } from "../js/data/songs.js";
import {
  normalizeSpokenText,
  buildSpokenInputVariants,
  looseKana,
  tokenizeSpokenText,
  tokensCoverTitle,
  scoreSongAgainstSpokenTextDetailed,
  matchSpokenSongName,
  decideVoiceVerdict,
} from "../js/songNameMatcher.js";
import {
  SFX_EVENTS,
  SFX_THEMES,
  CUSTOMIZABLE_SFX_EVENT_INFO,
  PARTY_FIXED_SFX_EVENT_IDS,
  resolvePartyFixedSoundDescriptor,
  setEventThemeOverride,
  clearAllEventThemeOverrides,
  setSfxTheme,
  getSfxSettings,
  previewSfxEvent,
} from "../js/soundManager.js";

const byTitle = (title) => SONGS.find((song) => song.title === title);
const TOKUBECHU = byTitle("とくべチュ、して");
const SWEETEST = byTitle("Sweetest girl");
const SEISHUN = byTitle('青春"サブリミナル"');

function expectCorrect(inputs, song, label) {
  inputs.forEach((input) => {
    const result = matchSpokenSongName([input], SONGS);
    assertEqual(`${result.status}:${result.song?.id}`, `match:${song.id}`, `${label}：「${input}」→${song.title}（${result.evidenceType ?? result.reason}）`);
    assertEqual(decideVoiceVerdict(result, song.id), "correct", `${label}：「${input}」は正解曲が${song.title}なら自動正解`);
  });
}

// ===== (A) 受入ケース =====
export function runVoiceLeniencyAcceptanceTests() {
  assertEqual(Boolean(TOKUBECHU && SWEETEST && SEISHUN), true, "前提：テストに使う曲が songs.js にある");

  // 言い換え（variants）・ゆるい読み・トークンの純粋関数
  assertEqual(buildSpokenInputVariants(normalizeSpokenText("特別してよ")).includes("とくべつして"), true, "「特別してよ」→ 漢字→読み置換＋語尾「よ」除去で「とくべつして」");
  assertEqual(buildSpokenInputVariants(normalizeSpokenText("特別してって")).includes("とくべつして"), true, "「特別してって」→「とくべつして」");
  assertEqual(buildSpokenInputVariants("らぶよ").includes("らぶ"), false, "語尾除去は残りが4文字以上のときだけ（短い断片を作らない）");
  assertEqual(looseKana("とくべちゅして"), "とくへちして", "ゆるい読み：小書き・濁点を畳む");
  assertEqual(looseKana("とくべつして"), "とくへつして", "ゆるい読み：清音はそのまま");
  assertEqual(tokenizeSpokenText("Sweet Girl"), ["sweet", "girl"], "トークン化（小文字・空白区切り）");
  assertEqual(tokensCoverTitle(["sweetest", "girl"], ["sweet", "girl"]), true, "sweet は sweetest の先頭（3文字以上）→ 全トークン一致");
  assertEqual(tokensCoverTitle(["sweetest", "girl"], ["girl"]), false, "girl だけでは足りない");
  assertEqual(tokensCoverTitle(["oh", "yes"], ["oh", "yes"]), false, "4文字以上のトークンを含まない曲名（短い語だけ）はトークン一致の対象外");
  assertEqual(scoreSongAgainstSpokenTextDetailed(TOKUBECHU, normalizeSpokenText("特別して")).type, "loose-near", "「特別して」の根拠はゆるい読みの近似");
  assertEqual(scoreSongAgainstSpokenTextDetailed(SWEETEST, normalizeSpokenText("Sweet Girl"), "Sweet Girl").type, "tokens", "「Sweet Girl」の根拠は単語一致");

  // 実例1：正解「とくべチュ、して」（本人の呼び方「特別してよ」）
  expectCorrect(["とくべチュ、して", "とくべちゅして", "特別してよ", "特別して", "とくべつして", "特別してよー", "特別してって", "とくべチュして", "とくべちゅし"], TOKUBECHU, "実例1");
  // 実例2：正解「Sweetest girl」
  expectCorrect(["Sweetest girl", "sweetest girl", "Sweet Girl", "スイーテストガール", "スイーテスト ガール", "スイーテスガール", "スイーテストガールです", "SWEETEST GIRL", "sweetestgirl", "スイーテストガー"], SWEETEST, "実例2");
  // 既存の維持
  expectCorrect(["＝LOVE", "=LOVE", "イコールラブ", "イコラブ", "国歌", "こっか", "国家", "LOVE", "コールラブ"], SONGS.find((song) => song.id === "love"), "既存：＝LOVE");
  expectCorrect(['青春"サブリミナル"', "青春サブリミナル", "青春サブ", "青サブ", "春サブリミナル", "サブリミナル"], SEISHUN, "既存：青春サブリミナル");
  expectCorrect(["どこが好きか言って", "どこかスキーかって"], byTitle("どこが好きか言って"), "実機ログ：「どこかスキーかって」（ゆるい読みの近似）");

  // 短い一般断片は自動正解にしない（人間判定へ）
  ["して", "ラブ", "歌", "君", "好き", "青春", "うた", "サブ", "ガール", "girl", "こんにちは", "わかりません", "えーっと"].forEach((input) => {
    const result = matchSpokenSongName([input], SONGS);
    assertEqual(result.status === "match", false, `「${input}」（短い一般断片）は自動判定しない（${result.status}:${result.reason}）`);
  });
  // 競合する断片は人間判定
  const heroine = matchSpokenSongName(["ヒロイン"], SONGS);
  assertEqual(heroine.status, "ambiguous", "「ヒロイン」（ヒロインズ／僕のヒロイン）は人間判定");
  // 結果に margin・support・evidenceType が載る（診断・将来の調整用）
  const detail = matchSpokenSongName(["特別して"], SONGS);
  assertEqual(typeof detail.margin === "number" && detail.margin >= 0, true, "結果に margin（1位−2位）");
  assertEqual(typeof detail.support === "number", true, "結果に support（近似以上で支持した候補数）");
  assertEqual(detail.candidates[0].evidenceType, "loose-near", "1位の根拠の種類");
  // 別の収録曲名を明確に言った → 自動不正解（従来どおり）
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["とくべチュ、して"], SONGS), SWEETEST.id), "wrong", "別曲を完全に言えば自動不正解");
  assertEqual(decideVoiceVerdict(matchSpokenSongName(["特別して"], SONGS), SWEETEST.id), "manual", "崩れた発話が別曲に近い場合は自動不正解にせず人間判定");
}

// ===== (B) 全84曲の発話崩れ総当たり =====
function katakanaOf(text) {
  return text.replace(/[ぁ-ん]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}
export function buildSpeechMutations(text) {
  const chars = Array.from(text);
  const n = chars.length;
  const list = [];
  if (n >= 5) list.push({ kind: "prefix-1", text: chars.slice(1).join("") });
  if (n >= 6) list.push({ kind: "prefix-2", text: chars.slice(2).join("") });
  if (n >= 5) list.push({ kind: "suffix-1", text: chars.slice(0, -1).join("") });
  if (n >= 6) list.push({ kind: "suffix-2", text: chars.slice(0, -2).join("") });
  if (n >= 5) {
    const middle = Math.floor(n / 2);
    list.push({ kind: "middle-delete", text: chars.filter((_, index) => index !== middle).join("") });
  }
  if (n >= 4) {
    const middle = Math.floor(n / 2);
    const replaced = [...chars];
    replaced[middle] = replaced[middle] === "ん" ? "る" : "ん";
    list.push({ kind: "middle-substitute", text: replaced.join("") });
  }
  if (text.includes("ー")) list.push({ kind: "no-choon", text: text.replace(/ー/g, "") });
  if (/\s/.test(text)) list.push({ kind: "no-space", text: text.replace(/\s+/g, "") });
  if (/[・！!？?「」"'、。]/.test(text)) list.push({ kind: "no-symbol", text: text.replace(/[・！!？?「」"'、。]/g, "") });
  if (/[ぁ-ん]/.test(text)) list.push({ kind: "katakana", text: katakanaOf(text) });
  if (/[A-Za-z]/.test(text)) list.push({ kind: "upper", text: text.toUpperCase() });
  list.push({ kind: "desu", text: `${text}です` });
  list.push({ kind: "omou", text: `${text}だと思う` });
  return list;
}

export function runVoiceLeniencySweepTests() {
  const stats = { checked: 0, correct: 0, manual: 0, wrong: 0, byKind: {} };
  const falsePositives = [];
  SONGS.forEach((song) => {
    const inputs = [song.title, song.searchReading].filter(Boolean);
    (song.searchAliases ?? []).forEach((alias) => {
      if (typeof alias === "string") inputs.push(alias);
      else inputs.push(alias.text, alias.reading);
    });
    const other = SONGS.find((candidate) => candidate.id !== song.id);
    inputs.filter(Boolean).forEach((input) => {
      buildSpeechMutations(input).forEach((mutation) => {
        const result = matchSpokenSongName([mutation.text], SONGS);
        const verdict = decideVoiceVerdict(result, song.id);
        stats.checked += 1;
        stats.byKind[mutation.kind] = stats.byKind[mutation.kind] ?? { n: 0, correct: 0 };
        stats.byKind[mutation.kind].n += 1;
        if (verdict === "correct") {
          stats.correct += 1;
          stats.byKind[mutation.kind].correct += 1;
        } else {
          stats.manual += 1;
        }
        if (result.status === "match" && result.song.id !== song.id) {
          falsePositives.push(`${song.title}｜${mutation.kind}「${mutation.text}」→${result.song.title}（${result.evidenceType}）`);
        }
        // 崩れた入力（最終結果の完全一致でない）で、別曲が正解のときに「自動不正解」になってはいけない
        if (decideVoiceVerdict(result, other.id) === "wrong" && result.topFinalScore < 3) stats.wrong += 1;
      });
    });
  });
  const rate = Math.round((stats.correct / stats.checked) * 1000) / 10;
  window.__partyVoiceSweepStats = { ...stats, rate, falsePositives };
  assertEqual(falsePositives.slice(0, 20), [], `別の曲への自動誤正解は 0 件（${stats.checked}件中 ${falsePositives.length}件）`);
  assertEqual(stats.wrong, 0, "崩れた入力で別曲の正解者を自動不正解にしない（0件）");
  assertEqual(stats.checked >= 1500, true, `総ケース数 ${stats.checked}（1500件以上）`);
  assertEqual(rate >= 85, true, `自分の曲への自動正解率 ${rate}%（${stats.correct}／${stats.checked}。第6回の「30%超」から改善）`);
  ["prefix-1", "suffix-1", "katakana", "desu", "no-choon"].forEach((kind) => {
    const entry = stats.byKind[kind];
    assertEqual(entry && entry.correct / entry.n >= 0.9, true, `${kind}：自動正解率 ${entry ? Math.round((entry.correct / entry.n) * 100) : 0}%（90%以上）`);
  });
  console.info("[party voice sweep]", JSON.stringify({ checked: stats.checked, correct: stats.correct, rate, manual: stats.manual, falsePositive: falsePositives.length, autoWrong: stats.wrong, byKind: stats.byKind }));
}

// ===== (C) パーティー専用 SFX はテーマ非依存 =====
export function runPartyFixedSfxTests() {
  assertEqual([...PARTY_FIXED_SFX_EVENT_IDS].sort(), [SFX_EVENTS.PARTY_CORRECT, SFX_EVENTS.PARTY_WINNER, SFX_EVENTS.PARTY_WRONG].sort(), "固定音は正解／不正解／優勝の3つ");
  const correct = resolvePartyFixedSoundDescriptor(SFX_EVENTS.PARTY_CORRECT);
  const wrong = resolvePartyFixedSoundDescriptor(SFX_EVENTS.PARTY_WRONG);
  const winner = resolvePartyFixedSoundDescriptor(SFX_EVENTS.PARTY_WINNER);
  assertEqual(Boolean(correct && wrong && winner), true, "3つとも固定定義がある");
  assertEqual(resolvePartyFixedSoundDescriptor(SFX_EVENTS.QUIZ_CORRECT), null, "通常クイズの正解音は固定音ではない（テーマで変わる）");
  // 正解：4打（G6→E6 を2回）・約1.1秒・アタック用ノイズ4つ
  const correctStrikes = correct.notes.filter((note) => note.freq === "G6" || note.freq === "E6");
  assertEqual(correctStrikes.map((note) => note.freq), ["G6", "E6", "G6", "E6"], "正解：ピン→ポン→ピン→ポンの4打");
  const correctEnd = Math.max(...correct.notes.map((note) => note.startSec + note.durationSec));
  assertEqual(correctEnd >= 1.0 && correctEnd <= 1.3, true, `正解：長さ約1.1秒（${correctEnd.toFixed(2)}s）`);
  assertEqual(correct.noises.length, 4, "正解：各打の頭にノイズ（アタック）");
  assertEqual(correct.notes.every((note) => note.gain <= 0.4) && correct.noises.every((noise) => noise.gain <= 0.2), true, "正解：gain は 0.4 以下（爆音にしない。音量スライダーが掛かる）");
  // 不正解：低いブザー・約0.9秒・正解音より低い音域
  const wrongEnd = Math.max(...wrong.notes.map((note) => note.startSec + note.durationSec));
  assertEqual(wrongEnd >= 0.8 && wrongEnd <= 1.0, true, `不正解：長さ約0.9秒（${wrongEnd.toFixed(2)}s）`);
  assertEqual(wrong.notes.every((note) => typeof note.freq === "number" && note.freq <= 230), true, "不正解：全部 230Hz 以下の低音（正解の鐘と聞き間違えない）");
  assertEqual(wrong.notes.every((note) => note.gain <= 0.32), true, "不正解：gain は 0.32 以下");
  const winnerEnd = Math.max(...winner.notes.map((note) => note.startSec + note.durationSec));
  assertEqual(winnerEnd >= 1.2, true, `優勝：約1.4秒のファンファーレ（${winnerEnd.toFixed(2)}s）`);
  // テーマ・上書きに関係なく同じ定義（設定を変えても resolve 結果が同一）
  const before = getSfxSettings();
  try {
    Object.values(SFX_THEMES).forEach((theme) => {
      setSfxTheme(theme);
      assertEqual(resolvePartyFixedSoundDescriptor(SFX_EVENTS.PARTY_CORRECT), correct, `テーマ ${theme} でも正解音は同じ定義`);
      let threw = false;
      try {
        previewSfxEvent(SFX_EVENTS.PARTY_CORRECT, theme);
        previewSfxEvent(SFX_EVENTS.PARTY_WRONG, theme);
        previewSfxEvent(SFX_EVENTS.PARTY_WINNER, theme);
      } catch {
        threw = true;
      }
      assertEqual(threw, false, `テーマ ${theme} で試聴しても例外なし`);
    });
    setEventThemeOverride(SFX_EVENTS.PARTY_CORRECT, SFX_THEMES.LIVE);
    assertEqual(resolvePartyFixedSoundDescriptor(SFX_EVENTS.PARTY_CORRECT), correct, "イベント別のテーマ上書きも固定音には効かない");
  } finally {
    clearAllEventThemeOverrides();
    setSfxTheme(before.theme);
    // 保存キーは消す（tests/soundManager.test.js の clearAllKeys と同じ扱い。残すと次回読み込みの「デフォルトテーマ」検査に響く）
    ["equalLoveIntroQuiz.sfxTheme", "equalLoveIntroQuiz.sfxEventThemeOverrides"].forEach((key) => localStorage.removeItem(key));
  }
  assertEqual(CUSTOMIZABLE_SFX_EVENT_INFO.some((info) => PARTY_FIXED_SFX_EVENT_IDS.includes(info.id)), false, "効果音設定の「テーマ差し替え」一覧に固定音は載せない");
}

export async function runPartyFixedSfxWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const sound = await fetchText("js/soundManager.js");
  assertEqual(sound.includes("const fixedDescriptor = resolvePartyFixedSoundDescriptor(eventName);") && sound.includes("const descriptor = fixedDescriptor ?? themeTable[effectiveTheme] ?? themeTable[DEFAULT_THEME];"), true, "renderSfxEvent：固定音を優先し、無ければ従来どおりテーマ別");
  assertEqual(sound.indexOf("if (!sfxMasterEnabled) return;") < sound.indexOf("renderSfxEvent(eventName);"), true, "playSfx：ON/OFF 判定は固定音でも従来どおり（固定音は音色だけ）");
  assertEqual(sound.includes("renderSoundDescriptor(context, descriptor, sfxVolumePercent / 100);"), true, "音量スライダーは固定音にも掛かる");
  assertEqual(sound.includes("function getAudioContext()") && sound.includes(".resume()"), true, "既存の共有 AudioContext／resume（iPhone PWA unlock）をそのまま使う");
  const engine = await fetchText("js/partyBattleEngine.js");
  assertEqual(engine.includes("const REVIEW_PLAYBACK_DELAY_MS = 1300;"), true, "答え合わせ再生は新しい正解音（約1.15秒）が鳴り終わってから");
}
