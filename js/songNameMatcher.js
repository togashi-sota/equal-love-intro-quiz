// 音声回答（パーティー対戦、2026-09-15新設／同日 第3回実機QA修正で段階的マッチャーへ全面改訂／
// 2026-09-16 第6回「音声早押し認識 最大精度化」で複数候補の証拠統合・冒頭／末尾欠けの救済を追加）で、
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
//   第4.5段階 冒頭／末尾欠け … 【第6回】音声認識が発話の頭（マイクが開く前に話し始めた）や末尾（早く切られた）を
//             1〜2文字落とした場合。残りが十分長く（4文字以上・曲名の60%以上）、曲名の長さに応じた文字数以内の欠けなら
//             近似一致（2）として扱う。残りが短い／一般的な語は対象外（競合チェックと最低長で弾く）
//   第5段階 部分・略称的回答 … 「青春サブ」のように曲名／読みの先頭部分（十分な長さ）で、他の曲と衝突しないもの
//   第6段階 競合チェック … 1位と2位のスコアが近ければ自動判定せず人間判定へ
//   第7段階 【第6回】証拠統合 … 認識器が返した複数の候補（最終結果・その代替候補・安定した途中結果）を
//             1つの文字列にせず全部照合し、最終結果を最も強く、途中結果は少し弱く重み付けして曲ごとに集計。
//             最終結果と途中結果が別の曲を強く支持するなら自動判定せず人間判定へ。
//   第8段階 【第7回】寛容化 … パーティー用に「84曲の集合の中で実質1曲しか指さない」発話を拾う：
//             ・入力の言い換え（variants）：認識器が出しやすい漢字表記→読み（特別→とくべつ）、語尾（よ／って／ね）の除去
//             ・ゆるい読み比較（loose kana）：小書き（ゃゅょっ）と濁点・半濁点を畳んだ読みどうしの編集距離
//               （「とくべつして」≒「とくべチュ、して」）
//             ・単語（トークン）一致：英語曲名の単語ごとの一致（「Sweet Girl」≒「Sweetest girl」）
//             ・唯一の断片（unique fragment）：4文字以上の断片が84曲中ただ1曲の曲名にしか含まれない → 近似扱い
//             短い一般語（して／ラブ／歌／君／好き）は最短長・割合・競合チェックで自動正解にしない。
// 【絶対条件】全く無関係な回答は自動正解にしない。別の曲名を明確に答えた（最終結果が完全一致）なら自動不正解にできる。

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
  const tailPatterns = [/だとおもいます$/, /とおもいます$/, /だとおもう$/, /とおもう$/, /だと思います$/, /と思います$/, /だと思う$/, /と思う$/, /でしょう$/, /ですか$/, /です$/, /かな$/, /だ$/];
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

// 【第7回】認識器が「かな曲名」を漢字に書き起こしたときの、漢字→読みの部分置換表（入力側だけに使う）。
// 例：「とくべチュ、して」を話すと「特別して」と書き起こされる → 「とくべつして」へ変換してから読み比較にかける。
// 汎用の漢字辞書は持たない（実機で見つかった事例だけをここへ足す）。
export const SPOKEN_KANJI_READINGS = {
  特別: "とくべつ",
  国家: "こっか",
  国歌: "こっか",
};

// 入力の「読み」を推定する：かなだけなら入力そのもの、同音表記の表にあればその読み、漢字の部分置換で全部かなになればその読み、それ以外は null。
export function resolveSpokenReading(normalizedInput) {
  if (!normalizedInput) return null;
  if (isKanaOnly(normalizedInput)) return normalizedInput;
  const homophone = SPOKEN_HOMOPHONE_READINGS[normalizedInput];
  if (homophone) return normalizeSpokenText(homophone);
  const substituted = applyKanjiReadings(normalizedInput);
  return substituted !== normalizedInput && isKanaOnly(substituted) ? substituted : null;
}

function applyKanjiReadings(text) {
  let result = text;
  Object.entries(SPOKEN_KANJI_READINGS).forEach(([kanji, reading]) => {
    if (result.includes(kanji)) result = result.split(kanji).join(reading);
  });
  return result;
}

// 【第7回】入力の言い換え候補（正規化済み文字列の集合）。元の入力／漢字→読み置換／語尾（よ・って・ね・てよ）を落としたもの。
// 曲名側は変えず入力側だけ増やす（対称に削ると「どこが好きか言って」のような曲名まで削れてしまうため）。
// 語尾除去は残りが4文字以上のときだけ（短い断片を作らない）。
export function buildSpokenInputVariants(normalizedInput) {
  const variants = new Set();
  const add = (value) => {
    if (value && value.length > 0) variants.add(value);
  };
  add(normalizedInput);
  add(applyKanjiReadings(normalizedInput));
  [...variants].forEach((base) => {
    [/って$/, /てよ$/, /よ$/, /ね$/, /なの$/, /かも$/].forEach((pattern) => {
      const stripped = base.replace(pattern, "");
      if (stripped !== base && stripped.length >= 4) add(stripped);
    });
  });
  return [...variants];
}

// 【第7回】ゆるい読み：小書き（ゃゅょぁぃぅぇぉっゎ）を落とし、濁点・半濁点を清音へ畳む（かな部分だけ）。
// 「とくべちゅして」→「とくへちして」。読みどうしの細かい差（つ／ちゅ、ば／ぱ）を吸収するための比較用で、表示には使わない。
const VOICED_TO_BASE = {
  が: "か", ぎ: "き", ぐ: "く", げ: "け", ご: "こ", ざ: "さ", じ: "し", ず: "す", ぜ: "せ", ぞ: "そ",
  だ: "た", ぢ: "ち", づ: "つ", で: "て", ど: "と", ば: "は", び: "ひ", ぶ: "ふ", べ: "へ", ぼ: "ほ",
  ぱ: "は", ぴ: "ひ", ぷ: "ふ", ぺ: "へ", ぽ: "ほ", ゔ: "う",
};
export function looseKana(text) {
  if (typeof text !== "string") return "";
  return Array.from(text)
    .filter((char) => !"ゃゅょぁぃぅぇぉっゎ".includes(char))
    .map((char) => VOICED_TO_BASE[char] ?? char)
    .join("");
}

// 【第7回】単語（トークン）一致用：元の文字列を空白・記号で区切り、各トークンを正規化する（空白は正規化で消えるので元の文字列から作る）。
export function tokenizeSpokenText(rawText) {
  if (typeof rawText !== "string") return [];
  return rawText
    .split(/[\s　・／/,、。，．!！?？\-–—:：;；"'’「」『』()（）\[\]［］]+/)
    .map((token) => normalizeSpokenText(token))
    .filter((token) => token.length > 0);
}

// 2つのトークンが「同じ単語とみなせる」か：完全一致／片方がもう片方の先頭（3文字以上）／4文字以上で編集距離1
function tokensMatch(a, b) {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 3 && longer.startsWith(shorter)) return true;
  if (shorter.length >= 4 && computeEditDistance(a, b) <= 1) return true;
  return false;
}

// 曲名のトークン列（2語以上）が、入力のトークン列で全部カバーされるか（順不同。曲名側の各トークンに一致相手がある）。
// 1語だけの曲名や短い語ばかりの曲名は対象外（「girl」だけで一致にならないように、4文字以上のトークンを1つは含むこと）。
export function tokensCoverTitle(titleTokens, inputTokens) {
  if (titleTokens.length < 2 || inputTokens.length === 0) return false;
  if (!titleTokens.some((token) => token.length >= 4)) return false;
  const remaining = [...inputTokens];
  return titleTokens.every((titleToken) => {
    const index = remaining.findIndex((inputToken) => tokensMatch(titleToken, inputToken));
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

// ===== 曲ごとの照合候補 =====

// 1曲ぶんの照合候補（正規化済み文字列）。
//   official: 曲名・読み（近似・部分一致を許す）
//   aliases: 略称・別名の表記（完全一致のみ。5文字以上なら欠け救済の対象にもする）
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
  // 【第7回】単語一致用のトークン列（曲名と文字列別名。2語以上のものだけ意味がある）と、ゆるい読み
  const tokenLists = [song.title, ...(song.searchAliases ?? []).filter((alias) => typeof alias === "string")]
    .map((text) => tokenizeSpokenText(text))
    .filter((tokens) => tokens.length >= 2);
  const loose = [...official].map((candidate) => looseKana(candidate));
  return { official: [...official], aliases: [...aliases], readings: [...readings], tokenLists, loose };
}

// 【第6回】曲ごとの照合候補は曲データが変わらない限り同じなので、曲オブジェクトをキーに1回だけ作る
// （84曲 × 複数候補 × 毎回の正規化を省き、発話終了→判定表示を遅くしない）。
const candidateCache = new WeakMap();
function getSongNameCandidates(song) {
  if (!song || typeof song !== "object") return buildSongNameCandidates(song ?? {});
  let cached = candidateCache.get(song);
  if (!cached) {
    cached = buildSongNameCandidates(song);
    candidateCache.set(song, cached);
  }
  return cached;
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

// 【第6回】冒頭／末尾の欠けとして許容する文字数（曲名の長さに連動。編集距離の許容と同じ刻みだが、
// 4文字の曲名は1文字欠けで3文字の断片になるため対象外にする）。
//   〜4文字: 0（欠けを認めない）／5〜7文字: 1／8〜13文字: 2／14文字〜: 3
export function resolveAllowedDropCount(length) {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  if (length <= 13) return 2;
  return 3;
}

const MIN_PARTIAL_MATCH_LENGTH = 3; // 部分一致に必要な最短文字数（「青春」のような2文字の一般語は対象外）
const MIN_PARTIAL_MATCH_RATIO = 0.4; // 先頭部分一致で必要な「曲名に対する長さの割合」（「青春サブ」= 4/8 = 0.5）
const MIN_DROP_REMAINDER_LENGTH = 4; // 欠け救済で「残り」に必要な最短文字数
const MIN_DROP_REMAINDER_RATIO = 0.6; // 欠け救済で「残り」に必要な曲名に対する割合

// 【第6回】input が candidate の「冒頭が欠けたもの」または「末尾が欠けたもの」か。
// 残りが十分長く（4文字以上・60%以上）、欠けた文字数が曲名の長さに応じた許容内なら true。
export function isDroppedEdgeMatch(candidate, input) {
  if (!candidate || !input) return false;
  if (input.length >= candidate.length) return false;
  if (input.length < MIN_DROP_REMAINDER_LENGTH) return false;
  if (input.length / candidate.length < MIN_DROP_REMAINDER_RATIO) return false;
  const dropped = candidate.length - input.length;
  if (dropped > resolveAllowedDropCount(candidate.length)) return false;
  return candidate.endsWith(input) || candidate.startsWith(input);
}

// スコア（高いほど確からしい）。0は不一致。
//   3.0: 完全一致（曲名／読み／別名）、または読み一致（同音異義・漢字→読み置換）
//   2.0: 近似一致（編集距離が長さ連動の許容内）、冒頭／末尾の欠け（残りが十分長い）、ゆるい読みの近似、単語一致
//   1.5: 先頭部分一致（3文字以上かつ曲名の40%以上）、または入力の中に曲名／読みが丸ごと含まれる（4文字以上）
//   1.0: 途中一致（4文字以上）。84曲中この曲にしか含まれない断片なら matchSpokenSongName 側で 2.0（unique-fragment）へ昇格
// 戻り値: { score, type }（type は根拠の種類：exact / reading / near / edge-drop / loose-near / tokens / prefix / contains-title / fragment）
export function scoreSongAgainstSpokenTextDetailed(song, normalizedInput, rawText = null) {
  if (!normalizedInput) return { score: 0, type: null };
  const { official, aliases, readings, tokenLists, loose } = getSongNameCandidates(song);
  const variants = buildSpokenInputVariants(normalizedInput);
  let best = { score: 0, type: null };
  const consider = (score, type) => {
    if (score > best.score) best = { score, type };
  };
  for (const input of variants) {
    if (official.includes(input) || aliases.includes(input)) return { score: 3, type: "exact" };
    const inputReading = resolveSpokenReading(input);
    if (inputReading && (readings.includes(inputReading) || official.includes(inputReading))) return { score: 3, type: "reading" };
  }
  for (const input of variants) {
    if (input.length < MIN_PARTIAL_MATCH_LENGTH) continue;
    official.forEach((candidate, candidateIndex) => {
      const allowed = resolveAllowedEditDistance(Math.max(candidate.length, input.length));
      if (allowed > 0 && Math.abs(candidate.length - input.length) <= allowed && computeEditDistance(candidate, input) <= allowed) {
        consider(2, "near");
      }
      if (isDroppedEdgeMatch(candidate, input)) consider(2, "edge-drop");
      // ゆるい読み（5文字以上のかな）：小書き・濁点を畳んだ上での近似
      const inputReading = resolveSpokenReading(input);
      if (inputReading && inputReading.length >= 5) {
        const looseInput = looseKana(inputReading);
        const looseCandidate = loose[candidateIndex];
        const looseAllowed = resolveAllowedEditDistance(Math.max(looseCandidate.length, looseInput.length));
        if (looseAllowed > 0 && Math.abs(looseCandidate.length - looseInput.length) <= looseAllowed && computeEditDistance(looseCandidate, looseInput) <= looseAllowed) {
          consider(2, "loose-near");
        }
      }
      if (candidate.startsWith(input) && input.length / candidate.length >= MIN_PARTIAL_MATCH_RATIO) {
        consider(1.5, "prefix");
      } else if (candidate.length >= 4 && input.includes(candidate)) {
        consider(1.5, "contains-title");
      } else if (input.length >= 4 && candidate.includes(input)) {
        consider(1, "fragment");
      }
    });
    // 5文字以上の別名（「ビーピーエム170」等）だけ、欠けの救済を認める（短い略称は完全一致のみ）
    aliases.forEach((alias) => {
      if (alias.length >= 5 && isDroppedEdgeMatch(alias, input)) consider(2, "edge-drop");
    });
  }
  // 単語一致（英語曲名など2語以上の曲名）：元の文字列のトークンで比べる
  if (rawText && tokenLists.length > 0) {
    const inputTokens = tokenizeSpokenText(rawText);
    if (tokenLists.some((titleTokens) => tokensCoverTitle(titleTokens, inputTokens))) consider(2, "tokens");
  }
  return best;
}

// 数値だけ欲しい呼び出し（従来の互換）。
export function scoreSongAgainstSpokenText(song, normalizedInput, rawText = null) {
  return scoreSongAgainstSpokenTextDetailed(song, normalizedInput, rawText).score;
}

// 【第6回】入力（正規化済み）が、その曲の曲名／読みの「一部分」（真部分文字列）か。
// 「ヒロイン」のように別々の曲名（ヒロインズ／僕のヒロイン）の両方に含まれる断片は、どちらの欠けか決められないため
// 人間判定へ回す判定（shared-fragment）に使う。
export function songContainsFragment(song, normalizedInput) {
  if (!normalizedInput) return false;
  const { official } = getSongNameCandidates(song);
  return official.some((candidate) => candidate.length > normalizedInput.length && candidate.includes(normalizedInput));
}

// ===== 認識候補（第6回：単一文字列ではなく「証拠の集まり」として扱う） =====

// 候補の出どころごとの重み。最終結果（第1候補）を最も強く、代替候補・途中結果は少し弱く扱う。
export const CANDIDATE_SOURCE_WEIGHT = {
  final: 1, // 最終結果の第1候補
  alternative: 0.9, // 最終結果の第2候補以降（maxAlternatives）
  interim: 0.85, // 最後に届いた途中結果（一番安定している）
  "interim-earlier": 0.7, // それより前の途中結果（変化しやすい）
};

// 入力を候補オブジェクトへそろえる。文字列配列（従来の呼び出し）は「最終結果・信頼度順」とみなす。
//   候補オブジェクト: { transcript, isFinal?, rank?, confidence?, source?, sequence? }
export function normalizeRecognitionCandidates(inputs) {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  const candidates = [];
  list.forEach((entry, index) => {
    if (typeof entry === "string") {
      const normalized = normalizeSpokenText(entry);
      if (normalized) candidates.push({ transcript: entry, normalized, isFinal: true, rank: index, confidence: null, source: index === 0 ? "final" : "alternative", sequence: index });
      return;
    }
    if (!entry || typeof entry.transcript !== "string") return;
    const normalized = normalizeSpokenText(entry.transcript);
    if (!normalized) return;
    const isFinal = entry.isFinal !== false;
    const rank = Number.isInteger(entry.rank) ? entry.rank : 0;
    let source = entry.source;
    if (!source) source = isFinal ? (rank === 0 ? "final" : "alternative") : "interim";
    candidates.push({
      transcript: entry.transcript,
      normalized,
      isFinal,
      rank,
      confidence: typeof entry.confidence === "number" && Number.isFinite(entry.confidence) ? entry.confidence : null,
      source,
      sequence: Number.isFinite(entry.sequence) ? entry.sequence : index,
    });
  });
  // 途中結果は「最後に届いたもの」だけ interim、それより前は interim-earlier として弱める
  const interims = candidates.filter((candidate) => !candidate.isFinal);
  if (interims.length > 1) {
    const latestSequence = Math.max(...interims.map((candidate) => candidate.sequence));
    interims.forEach((candidate) => {
      if (candidate.sequence !== latestSequence && candidate.source === "interim") candidate.source = "interim-earlier";
    });
  }
  return candidates;
}

// 自動判定に使うスコアの下限（これ未満は候補として弱すぎる）。
const AUTO_MATCH_MIN_SCORE = 1.5;
// 1位と2位のスコア差がこれ未満なら「競合」として人間判定へ。
const COMPETITION_MARGIN = 0.5;

// 音声認識の結果を曲一覧と照合する。
//   inputs: 認識結果の文字列配列（信頼度の高い順。従来どおり）、または候補オブジェクト配列
//           （{ transcript, isFinal, rank, confidence, source, sequence }。最終・代替・途中を混在させてよい）。
//   songs: 照合対象の曲オブジェクト配列（通常はSONGS全体）。
// 戻り値: { status: "match" | "ambiguous" | "none", song, score, margin, support, evidenceType, candidates, reason, evidence, topFinalScore }
//   score: 重み付き後の1位スコア／margin: 1位−2位／topFinalScore: 1位の曲に対する「最終結果」だけの生スコア（自動不正解の根拠に使う）
//   evidenceType: 1位の根拠の種類（exact / reading / near / edge-drop / loose-near / tokens / unique-fragment / prefix / contains-title / fragment）
//   candidates: スコア降順の [{ song, score, rawScore, support, finalScore, evidenceType }]（表示・デバッグ用）
//   evidence: 候補ごとの「最も強く支持した曲」（診断用）
//   reason: 人間判定へ回した理由（"weak" | "competition" | "final-vs-interim-conflict" | "shared-fragment" | null）
export function matchSpokenSongName(inputs, songs) {
  const candidates = normalizeRecognitionCandidates(inputs);
  if (candidates.length === 0) return { status: "none", song: null, score: 0, candidates: [], evidence: [], reason: "no-input", topFinalScore: 0, margin: 0, evidenceType: null };

  // 候補×曲のスコア表（1回だけ計算して使い回す）
  const table = candidates.map((candidate) => songs.map((song) => scoreSongAgainstSpokenTextDetailed(song, candidate.normalized, candidate.transcript)));
  // 【第7回】唯一の断片：4文字以上の入力（言い換え含む）が、84曲中ただ1曲の曲名／読みにしか含まれないなら、その曲を近似（2）へ昇格。
  // 2曲以上に含まれる断片は昇格せず、後段の shared-fragment（人間判定）に委ねる。
  candidates.forEach((candidate, candidateIndex) => {
    // 別の曲が既に近似以上（2）でこの候補を説明できるなら、断片扱いでの昇格はしない
    // （例：「イコラブ」は ＝LOVE の読みの近似であり、「ようこそ！イコラブ沼」の断片ではない）
    const row = table[candidateIndex];
    const strongestOther = (ownerIndex) => row.some((cell, songIndex) => songIndex !== ownerIndex && cell.score >= 2);
    const fragments = buildSpokenInputVariants(candidate.normalized).filter((variant) => variant.length >= 4);
    fragments.forEach((fragment) => {
      const owners = songs.map((song, songIndex) => (songContainsFragment(song, fragment) ? songIndex : -1)).filter((index) => index >= 0);
      if (owners.length !== 1) return;
      if (strongestOther(owners[0])) return;
      const cell = row[owners[0]];
      if (cell.score < 2) row[owners[0]] = { score: 2, type: "unique-fragment" };
    });
  });

  const perSong = songs.map((song, songIndex) => {
    let weighted = 0;
    let raw = 0;
    let finalScore = 0;
    let support = 0;
    let evidenceType = null;
    candidates.forEach((candidate, candidateIndex) => {
      const { score, type } = table[candidateIndex][songIndex];
      if (score <= 0) return;
      const weight = CANDIDATE_SOURCE_WEIGHT[candidate.source] ?? 0.7;
      if (score * weight > weighted) {
        weighted = score * weight;
        evidenceType = type;
      }
      raw = Math.max(raw, score);
      if (candidate.isFinal) finalScore = Math.max(finalScore, score);
      if (score >= 2) support += 1;
    });
    return { song, score: weighted, rawScore: raw, finalScore, support, evidenceType };
  });
  const scored = perSong
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.support - a.support || a.song.title.localeCompare(b.song.title));

  // 候補ごとの最有力曲（診断用。「途中結果と最終結果が別の曲を支持」の判定にも使う）
  const evidence = candidates.map((candidate, candidateIndex) => {
    let bestSong = null;
    let bestScore = 0;
    let bestType = null;
    songs.forEach((song, songIndex) => {
      const { score, type } = table[candidateIndex][songIndex];
      if (score > bestScore) {
        bestScore = score;
        bestSong = song;
        bestType = type;
      }
    });
    return { transcript: candidate.transcript, normalized: candidate.normalized, source: candidate.source, isFinal: candidate.isFinal, confidence: candidate.confidence, songId: bestSong?.id ?? null, songTitle: bestSong?.title ?? null, score: bestScore, type: bestType };
  });

  if (scored.length === 0) return { status: "none", song: null, score: 0, candidates: [], evidence, reason: "no-match", topFinalScore: 0, margin: 0, evidenceType: null };
  const top = scored[0];
  const second = scored[1];
  const base = { song: top.song, score: top.score, candidates: scored, evidence, topFinalScore: top.finalScore, margin: second ? Number((top.score - second.score).toFixed(3)) : top.score, evidenceType: top.evidenceType, support: top.support };
  if (top.score < AUTO_MATCH_MIN_SCORE) return { status: "ambiguous", ...base, reason: "weak" };
  // 第6段階：競合チェック。完全一致（3）が1曲だけなら他の弱い候補は無視してよい。
  if (second && top.score - second.score < COMPETITION_MARGIN) return { status: "ambiguous", ...base, reason: "competition" };
  // 【第6回】1位が完全一致でなく、入力が「1位の曲名の一部分」であり、かつ同じ入力が別の曲の曲名の一部分でもあるなら
  // 「どちらの曲の欠けか分からない」（例：「ヒロイン」＝「ヒロインズ」の末尾欠け／「僕のヒロイン」の冒頭欠け）→ 人間判定。
  // 「イコラブ」（＝LOVE の読みの1文字違いであって部分文字列ではない）のような近似一致はこの規則の対象外。
  if (top.rawScore < 3) {
    const sharedFragment = candidates.some(
      (candidate) => songContainsFragment(top.song, candidate.normalized) && songs.some((song) => song !== top.song && songContainsFragment(song, candidate.normalized))
    );
    if (sharedFragment) return { status: "ambiguous", ...base, reason: "shared-fragment" };
  }
  // 第7段階：最終結果が別の曲を近似以上（2）で支持しているのに、1位が途中結果頼み（最終結果では完全一致していない）なら
  // 「途中と最終で別の曲」＝人間判定へ
  const conflictingFinal = evidence.find((entry) => entry.isFinal && entry.songId && entry.songId !== top.song.id && entry.score >= 2);
  if (conflictingFinal && top.finalScore < 3) return { status: "ambiguous", ...base, reason: "final-vs-interim-conflict" };
  return { status: "match", ...base, reason: null };
}

// 正解曲と照合結果から、自動判定の結論を出す。
//   "correct": 十分な信頼で正解曲に一致（完全・読み・近似・欠け救済・一意な部分一致。途中結果の支持も含む）
//   "wrong": 別の曲名を明確に答えた（最終結果が完全一致）
//   "manual": 認識失敗・曖昧・競合・別曲への近似／部分一致（聞き間違いの可能性）→ 人間判定へ
export function decideVoiceVerdict(matchResult, correctSongId) {
  if (!matchResult || matchResult.status === "none") return "manual";
  if (matchResult.status === "ambiguous") return "manual";
  if (matchResult.song?.id === correctSongId) return "correct";
  // 自動不正解は「最終結果で別の曲名を完全に言った」ときだけ。途中結果だけの完全一致・近似・欠け救済は人間判定へ
  const finalScore = typeof matchResult.topFinalScore === "number" ? matchResult.topFinalScore : matchResult.score;
  return finalScore >= 3 ? "wrong" : "manual";
}
