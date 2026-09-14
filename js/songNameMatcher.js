// 音声回答（パーティー対戦、2026-09-15新設）で、音声認識が返した文字列（transcript）と
// 曲データを突き合わせて「どの曲を言ったか」を判定する純粋関数のファイル。
//
// 【辞書は既存のものだけ】js/data/songs.jsの title（公式曲名）／searchReading（ひらがな読み）／
// searchAliases（ファンの間の略称・別名）を唯一の辞書として使う（本人確定：party専用の重複辞書は
// 作らない）。正規化の基本はjs/songSearch.jsのnormalizeForSearch()（収録曲一覧・オリジナル問題作成の
// 曲名検索と同じ）を再利用し、音声認識特有の揺れ（句読点・語尾・長音など）だけをここで追加吸収する。
//
// 【判定の考え方】
//   1) 完全一致（曲名／読み／別名のどれかと一致）→ 高信頼の "match"
//   2) 前方一致・包含（曲名／読みの十分な長さ）→ 中信頼。候補が1曲だけなら "match"、複数なら "ambiguous"
//   3) 別の曲に高信頼で一致した → その曲を "match" として返す（呼び出し側が正解曲と比べて不正解と判定）
//   4) 何にも一致しない → "none"（人間判定へ）
// 「一般的でない任意の部分文字列だけで自動正解にしない」（本人確定）ため、2)は正規化後3文字以上の
// 入力にだけ適用し、別名（短い略称が多い）は完全一致のみとする。

import { normalizeForSearch } from "./songSearch.js";

// 音声認識由来の揺れを吸収する追加の正規化。normalizeForSearch（小文字化・全角数字→半角・
// カタカナ→ひらがな・空白除去・一部記号除去）に加えて、句読点・長音記号・語尾の丁寧表現を落とす。
export function normalizeSpokenText(text) {
  if (typeof text !== "string") return "";
  let normalized = normalizeForSearch(text)
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

// 1曲ぶんの照合候補（正規化済み文字列）を作る。
//   official: 曲名・読み（前方一致・包含を許す）
//   aliases: 略称・別名（完全一致のみ）
export function buildSongNameCandidates(song) {
  const official = new Set();
  const aliases = new Set();
  const addOfficial = (value) => {
    const normalized = normalizeSpokenText(value);
    if (normalized) official.add(normalized);
  };
  const addAlias = (value) => {
    const normalized = normalizeSpokenText(value);
    if (normalized) aliases.add(normalized);
  };
  addOfficial(song.title);
  addOfficial(song.searchReading);
  (song.searchAliases ?? []).forEach((alias) => {
    if (typeof alias === "string") {
      addAlias(alias);
    } else if (alias && typeof alias === "object") {
      addAlias(alias.text);
      addAlias(alias.reading);
    }
  });
  // 将来拡張用の音声専用別名（今回は推測で大量追加しない。本人確定）。
  (song.voiceAliases ?? []).forEach((alias) => addAlias(alias));
  return { official: [...official], aliases: [...aliases] };
}

const MIN_PARTIAL_MATCH_LENGTH = 3;

// 1曲に対するスコア（高いほど確からしい）。0は不一致。
//   3: 完全一致（曲名／読み／別名）
//   2: 入力が曲名／読みの先頭に一致、または曲名／読みが入力の中に丸ごと含まれる（3文字以上）
//   1: 入力が曲名／読みの途中に含まれる（3文字以上）
export function scoreSongAgainstSpokenText(song, normalizedInput) {
  if (!normalizedInput) return 0;
  const { official, aliases } = buildSongNameCandidates(song);
  if (official.includes(normalizedInput) || aliases.includes(normalizedInput)) return 3;
  if (normalizedInput.length < MIN_PARTIAL_MATCH_LENGTH) return 0;
  let best = 0;
  official.forEach((candidate) => {
    if (candidate.startsWith(normalizedInput) || normalizedInput.includes(candidate)) {
      best = Math.max(best, 2);
    } else if (candidate.includes(normalizedInput)) {
      best = Math.max(best, 1);
    }
  });
  return best;
}

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
  const rivals = scored.filter((entry) => entry.score === top.score);
  if (top.score === 3 && rivals.length === 1) return { status: "match", song: top.song, score: 3, candidates: scored };
  if (top.score === 2 && rivals.length === 1) return { status: "match", song: top.song, score: 2, candidates: scored };
  return { status: "ambiguous", song: top.song, score: top.score, candidates: scored };
}

// 正解曲と照合結果から、自動判定の結論を出す。
//   "correct": 高信頼で正解曲に一致
//   "wrong": 高信頼で別の曲に一致（明確な不一致）
//   "manual": 認識失敗・曖昧・スコア境界 → 人間判定へ
export function decideVoiceVerdict(matchResult, correctSongId) {
  if (!matchResult || matchResult.status === "none") return "manual";
  if (matchResult.status === "ambiguous") {
    // 曖昧でも「上位候補の中に正解曲が含まれ、かつ全候補が同点で正解曲がその1つ」の場合は
    // 判断を人に委ねる（自動○×を確定しない）。
    return "manual";
  }
  if (matchResult.song?.id === correctSongId) return "correct";
  // 別の曲へ高信頼（完全一致）で一致した場合だけ自動で不正解。前方一致レベル（score 2）の不一致は
  // 聞き間違いの可能性があるため人間判定へ。
  return matchResult.score >= 3 ? "wrong" : "manual";
}
