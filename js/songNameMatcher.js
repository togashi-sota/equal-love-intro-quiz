// 音声回答（パーティー対戦、2026-09-15新設／同日 第3回実機QA修正で段階的マッチャーへ全面改訂）で、
// 音声認識が返した文字列（transcript）と曲データを突き合わせて「どの曲を言ったか」を判定する純粋関数のファイル。
//
// 【辞書は既存のものだけ】js/data/songs.jsの title（公式曲名）／searchReading（ひらがな読み）／
// searchAliases（ファンの間の略称・別名。{ text, reading } 形式は漢字表記と読みの組）を唯一の辞書として使う
// （本人確定：party専用の重複辞書は作らない）。正規化の基本はjs/songSearch.jsのnormalizeForSearch()（収録曲一覧・
// オリジナル問題作成の曲名検索と同じ）を再利用し、音声認識特有の揺れだけをここで追加吸収する。
//
// 【方針（本人確定・第3回実機QA）】パーティーゲームの補助なので「厳密な採点機」ではなく、
// 「人間ならだいたい分かる回答はなるべく自動で拾い、危険なケースだけ人間判定へ回す」。
// ただし単純な includes や「1文字一致で正解」にはしない。段階：
//   第1段階 確定一致 … 正規化後の曲名／読み／別名（表記・読み）と完全一致 → 即正解
//   第2段階 既知略称 … searchAliases に登録された略称（「青サブ」「LOVE」「国歌」等）は第1段階で完全一致として扱う
//   第3段階 表記・認識揺れ … 全角／半角（「＝LOVE」と「=LOVE」）・空白・記号・大文字小文字・ひらがな／カタカナ・
//             長音・語尾（です／かな等）・同音異義（漢字違い）を正規化と読み照合で吸収
//   第4段階 近似一致 … 編集距離（レーベンシュタイン）。許容文字数は文字列長に連動（短い語ほど厳しく、
//             長い曲名は1〜2文字の誤認識まで寛容）
//   第5段階 部分・略称的回答 … 「青春サブ」のように曲名／読みの先頭部分（十分な長さ）で、他の曲と衝突しないもの
//   第6段階 競合チェック … 1位と2位のスコアが近ければ自動判定せず人間判定へ
// 【絶対条件】全く無関係な回答は自動正解にしない。別の曲名を明確に答えた（完全一致）なら自動不正解にできる。

import { normalizeForSearch } from "./songSearch.js";

// ===== 正規化 =====

// 全角英数記号（U+FF01〜FF5E）を半角へ。normalizeForSearch は全角数字だけを半角化するため、
// 「＝LOVE」（全角＝）と音声認識の「=LOVE」（半角=）が一致しなかった（第3回実機QAの根本原因）。
function toHalfWidthAscii(text) {
  return text.replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

// 音声認識由来の揺れを吸収する追加の正規化。normalizeForSearch（小文字化・全角数字→半角・
// カタカナ→ひらがな・空白除去・一部記号除去）に加えて、全角英記号→半角、句読点・括弧・長音記号・語尾を落とす。
export function normalizeSpokenText(text) {
  if (typeof text !== "string") return "";
  let normalized = normalizeForSearch(toHalfWidthAscii(text))
    .replace(/[、。，．,.]/g, "")
    .replace(/[（）()［］\[\]｛｝{}]/g, "")
    .replace(/ー/g, "");
  // 「〜です」「〜かな」「〜だと思います」のような語尾を落とす（曲名の一部を削らないよう、末尾だけ）。
  const tailPatterns = [/だとおもいます$/, /とおもいます$/, /だとおもう$/, /とおもう$/, /でしょう$/, /ですか$/, /です$/, /かな$/, /だ$/];
  tailPatterns.forEach((pattern) => {
    normalized = normalized.replace(pattern, "");
  });
  return normalized;
}

// ひらがな（＋長音・小書き）だけの文字列か。読み（reading）どうしの照合に使う。
export function isKanaOnly(text) {
  return /^[ぁ-ゖゝゞ]+$/.test(text);
}

// 【同音異義の吸収】音声認識は「国歌」を同音の「国家」と書き起こすことがある。漢字→読みの汎用辞書は持たず、
// 「認識器が出しやすい同音表記 → 読み」の小さな表だけを持つ（既存の searchAliases の reading と照合するための
// 最小限の橋渡し。新しい事例が実機で見つかったらここへ追加する。曲一覧の検索には影響しない）。
export const SPOKEN_HOMOPHONE_READINGS = {
  国家: "こっか",
};

// 入力の「読み」を推定する：かなだけなら入力そのもの、同音表記の表にあればその読み、それ以外は null。
export function resolveSpokenReading(normalizedInput) {
  if (!normalizedInput) return null;
  if (isKanaOnly(normalizedInput)) return normalizedInput;
  const homophone = SPOKEN_HOMOPHONE_READINGS[normalizedInput];
  return homophone ? normalizeSpokenText(homophone) : null;
}

// ===== 曲ごとの照合候補 =====

// 1曲ぶんの照合候補（正規化済み文字列）。
//   official: 曲名・読み（近似・部分一致を許す）
//   aliases: 略称・別名の表記（完全一致のみ）
//   readings: 読み（searchReading と別名の reading。読み照合＝同音異義の吸収に使う）
export function buildSongNameCandidates(song) {
  const official = new Set();
  const aliases = new Set();
  const readings = new Set();
  const add = (set, value) => {
    const normalized = normalizeSpokenText(value);
    if (normalized) set.add(normalized);
  };
  add(official, song.title);
  add(official, song.searchReading);
  add(readings, song.searchReading);
  (song.searchAliases ?? []).forEach((alias) => {
    if (typeof alias === "string") {
      add(aliases, alias);
    } else if (alias && typeof alias === "object") {
      add(aliases, alias.text);
      add(aliases, alias.reading);
      add(readings, alias.reading);
    }
  });
  // 将来拡張用の音声専用別名（今回は推測で大量追加しない。本人確定）。
  (song.voiceAliases ?? []).forEach((alias) => add(aliases, alias));
  return { official: [...official], aliases: [...aliases], readings: [...readings] };
}

// ===== 近似一致（編集距離） =====

// レーベンシュタイン距離（コードポイント単位）。
export function computeEditDistance(a, b) {
  const s = Array.from(a);
  const t = Array.from(b);
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let previous = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const current = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[t.length];
}

// 文字列長に応じて許容する編集距離（短い語ほど厳しく、長い曲名ほど寛容。本人確定）。
//   〜3文字: 0（完全一致のみ）／4〜7文字: 1／8〜13文字: 2／14文字〜: 3
export function resolveAllowedEditDistance(length) {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  if (length <= 13) return 2;
  return 3;
}

const MIN_PARTIAL_MATCH_LENGTH = 3; // 部分一致に必要な最短文字数（「青春」のような2文字の一般語は対象外）
const MIN_PARTIAL_MATCH_RATIO = 0.4; // 先頭部分一致で必要な「曲名に対する長さの割合」（「青春サブ」= 4/8 = 0.5）

// スコア（高いほど確からしい）。0は不一致。
//   3.0: 完全一致（曲名／読み／別名）、または読み一致（同音異義）
//   2.0: 近似一致（編集距離が長さ連動の許容内）
//   1.5: 先頭部分一致（3文字以上かつ曲名の40%以上）、または入力の中に曲名／読みが丸ごと含まれる（4文字以上）
//   1.0: 途中一致（4文字以上）
export function scoreSongAgainstSpokenText(song, normalizedInput) {
  if (!normalizedInput) return 0;
  const { official, aliases, readings } = buildSongNameCandidates(song);
  if (official.includes(normalizedInput) || aliases.includes(normalizedInput)) return 3;
  const inputReading = resolveSpokenReading(normalizedInput);
  if (inputReading && readings.includes(inputReading)) return 3;
  if (normalizedInput.length < MIN_PARTIAL_MATCH_LENGTH) return 0;

  let best = 0;
  official.forEach((candidate) => {
    const allowed = resolveAllowedEditDistance(Math.max(candidate.length, normalizedInput.length));
    if (allowed > 0 && Math.abs(candidate.length - normalizedInput.length) <= allowed) {
      const distance = computeEditDistance(candidate, normalizedInput);
      if (distance <= allowed) best = Math.max(best, 2);
    }
    if (candidate.startsWith(normalizedInput) && normalizedInput.length / candidate.length >= MIN_PARTIAL_MATCH_RATIO) {
      best = Math.max(best, 1.5);
    } else if (candidate.length >= 4 && normalizedInput.includes(candidate)) {
      best = Math.max(best, 1.5);
    } else if (normalizedInput.length >= 4 && candidate.includes(normalizedInput)) {
      best = Math.max(best, 1);
    }
  });
  return best;
}

// 自動判定に使うスコアの下限（これ未満は候補として弱すぎる）。
const AUTO_MATCH_MIN_SCORE = 1.5;
// 1位と2位のスコア差がこれ未満なら「競合」として人間判定へ。
const COMPETITION_MARGIN = 0.5;

// 音声認識の結果（複数候補可）を曲一覧と照合する。
//   transcripts: 認識結果の文字列配列（信頼度の高い順）。
//   songs: 照合対象の曲オブジェクト配列（通常はSONGS全体）。
// 戻り値: { status: "match" | "ambiguous" | "none", song, score, candidates }
//   candidates: スコア降順の [{ song, score }]（表示・デバッグ用）。
export function matchSpokenSongName(transcripts, songs) {
  const inputs = (Array.isArray(transcripts) ? transcripts : [transcripts])
    .map((text) => normalizeSpokenText(text))
    .filter((text) => text.length > 0);
  if (inputs.length === 0) return { status: "none", song: null, score: 0, candidates: [] };

  const scored = songs
    .map((song) => ({ song, score: Math.max(...inputs.map((input) => scoreSongAgainstSpokenText(song, input))) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));

  if (scored.length === 0) return { status: "none", song: null, score: 0, candidates: [] };
  const top = scored[0];
  const second = scored[1];
  if (top.score < AUTO_MATCH_MIN_SCORE) return { status: "ambiguous", song: top.song, score: top.score, candidates: scored };
  // 第6段階：競合チェック。完全一致（3）が1曲だけなら他の弱い候補は無視してよい。
  if (second && top.score - second.score < COMPETITION_MARGIN) {
    return { status: "ambiguous", song: top.song, score: top.score, candidates: scored };
  }
  return { status: "match", song: top.song, score: top.score, candidates: scored };
}

// 正解曲と照合結果から、自動判定の結論を出す。
//   "correct": 十分な信頼で正解曲に一致（完全・読み・近似・一意な部分一致）
//   "wrong": 別の曲名を明確に答えた（完全一致）
//   "manual": 認識失敗・曖昧・競合・別曲への近似／部分一致（聞き間違いの可能性）→ 人間判定へ
export function decideVoiceVerdict(matchResult, correctSongId) {
  if (!matchResult || matchResult.status === "none") return "manual";
  if (matchResult.status === "ambiguous") return "manual";
  if (matchResult.song?.id === correctSongId) return "correct";
  return matchResult.score >= 3 ? "wrong" : "manual";
}
