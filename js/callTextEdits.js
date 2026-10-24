// ライブコール「文字モード」の、本人が編集・承認した内容（位置・文章・非表示・追加）を当てはめる部品（2026-10-25新設）。
// コール表エディター（tools/live-call-text/editor.html、ローカル専用）とアプリ本体の両方が使う。DOM に触れない純粋関数。
//
// 【既存データを守る】同期モードのコール（各端末の IndexedDB）は書き換えない。ここで作るのは「文字モードで表示するための
// 作業用のコピー」だけ。編集を当てはめる前に、元のコールの本文が編集したときと同じか（originalTextHash）を照合し、
// 違うコールには当てはめない（端末のコールが別の版のときに、誤った位置・文章を付けないため）。
//
// 1曲分の編集データ（entry）の形：
// {
//   songId, baseFingerprint,          … 編集したときのコール一式の指紋（computeCallsFingerprint）
//   calls: { [callKey]: { lineNo, position, order?, offset?, lineTextHash?, hidden?, editedText?, split?, originalTextHash } },
//   added: [ { key: "added-…", text, type, lineNo, position, order, offset?, lineTextHash? } ]   … 本人が文字モード用に追加したコール
// }
// offset・lineTextHash：行の途中の文字位置に置くとき（js/callTextLayout.js の説明）。
// split：1件のコール（例「おい！　おい！　おい！　おい！」）を文字モードだけで複数に分けて別々の位置に置くとき。
//   { at: [区切る文字位置…], parts: [ { lineNo, position, order?, offset?, lineTextHash? }, … ] }（parts は at の数＋1）
//   分けた表示単位のキーは「元のキー#1」「元のキー#2」…。分けた文章をつなげると必ず元の文章に戻る（欠けない・重ならない）。
// 歌詞本文は含めない。editedText・added の text はコール本文なので、公開してよいかは採用時に別に判断する。

export const CALL_TEXT_EDITS_SCHEMA = "equal-love-call-text-edits";
export const CALL_TEXT_EDITS_VERSION = 1;

// 短い文字列の指紋（FNV-1a 32bit、16進）。照合用で暗号強度は不要。
export function hashText(text) {
  let hash = 0x811c9dc5;
  const source = String(text ?? "");
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function baseKey(call) {
  return `${call.type}@${Number(call.start).toFixed(2)}`;
}

// 文章を区切る：at（文字位置。昇順・範囲内・サロゲートペアの途中でない）で分け、各部分が空白だけにならないこと。
// 使えない区切りなら null。つなげると元の文章に戻る。
export function splitTextAt(text, at) {
  const source = String(text ?? "");
  if (!Array.isArray(at) || at.length === 0) return null;
  let previous = 0;
  const parts = [];
  for (const index of at) {
    if (!Number.isInteger(index) || index <= previous || index >= source.length) return null;
    const code = source.charCodeAt(index);
    if (code >= 0xdc00 && code <= 0xdfff) return null;
    parts.push(source.slice(previous, index));
    previous = index;
  }
  parts.push(source.slice(previous));
  if (parts.some((part) => part.trim() === "") || parts.join("") !== source) return null;
  return parts;
}

// 位置情報だけを取り出す（文字位置・並び順は持っているときだけ）
export function placementOf(record) {
  return {
    lineNo: record.lineNo,
    position: record.position,
    ...(Number.isFinite(record.order) ? { order: record.order } : {}),
    ...(Number.isInteger(record.offset) ? { offset: record.offset, lineTextHash: record.lineTextHash } : {}),
  };
}

// 文字モードで見せる歌詞（表示用）を当てはめる（2026-10-25追加）。lineTexts：{ [行番号]: { text, originalTextHash } }
// 端末の歌詞が、表示用の歌詞を作ったときの元の歌詞と同じ行だけ置き換える（違う行はそのまま＝元の歌詞）。
// 元の歌詞データは書き換えず、新しい行の一覧を返す。置き換えた行には displayEdited: true を付ける（空白・改行をそのまま見せる）。
export function applyDisplayLyrics(lines, lineTexts) {
  if (!lineTexts) return lines ?? [];
  return (lines ?? []).map((line) => {
    const lt = lineTexts[line.line];
    if (!lt || typeof lt.text !== "string" || lt.text.trim() === "" || lt.originalTextHash !== hashText(line.text)) return line;
    return { ...line, text: lt.text, displayEdited: true };
  });
}

// コール一式の指紋（キーと本文。並び順に左右されない）
export function computeCallsFingerprint(calls) {
  const rows = (calls ?? []).map((call) => `${baseKey(call)}\u0001${call.text}`).sort();
  return hashText(rows.join("\u0002"));
}

// 端末のコール（baseCalls）に編集データ（entry）を当てはめ、文字モードで並べるためのコール一覧と位置情報を返す。
// 戻り値：{ calls, overrides, hiddenKeys, mismatches, fingerprintMatches }
//   mismatches：編集データにあるのに本文が一致しない／端末に見つからないコール（当てはめていない）
export function applyCallTextEntry(baseCalls, entry) {
  const calls = [];
  const overrides = {};
  const hiddenKeys = [];
  const mismatches = [];
  const records = entry?.calls ?? {};
  const seen = new Set();
  (baseCalls ?? []).forEach((call) => {
    const key = baseKey(call);
    const record = records[key];
    if (!record) {
      calls.push({ ...call });
      return;
    }
    seen.add(key);
    if (record.originalTextHash && record.originalTextHash !== hashText(call.text)) {
      mismatches.push({ key, reason: "本文が編集したときと違う" });
      calls.push({ ...call });
      return;
    }
    if (record.hidden) {
      hiddenKeys.push(key);
      return;
    }
    const text = typeof record.editedText === "string" && record.editedText.trim() !== "" ? record.editedText : call.text;
    if (record.split) {
      const pieces = splitTextAt(text, record.split.at);
      if (pieces && Array.isArray(record.split.parts) && record.split.parts.length === pieces.length) {
        pieces.forEach((piece, index) => {
          const partKey = `${key}#${index + 1}`;
          // 分けた表示単位も元のコールと同じ時刻の扱い（順番は分けた順）
          calls.push({ ...call, key: partKey, text: piece.trim(), start: call.start + index * 0.001, edited: text !== call.text, splitFrom: key, splitIndex: index, splitCount: pieces.length });
          overrides[partKey] = placementOf(record.split.parts[index]);
        });
        return;
      }
      mismatches.push({ key, reason: "分割の位置が本文と合わない" });
    }
    calls.push({ ...call, text, edited: text !== call.text });
    overrides[key] = placementOf(record);
  });
  Object.keys(records).forEach((key) => {
    if (!seen.has(key)) mismatches.push({ key, reason: "端末のコールに見つからない" });
  });
  (entry?.added ?? []).forEach((added) => {
    if (typeof added?.key !== "string" || typeof added.text !== "string" || added.text.trim() === "") return;
    const order = Number.isFinite(added.order) ? added.order : 0;
    calls.push({ key: added.key, text: added.text, type: added.type ?? "unique", start: order, end: order + 1.5, added: true });
    overrides[added.key] = { ...placementOf(added), order };
  });
  return {
    calls,
    overrides,
    hiddenKeys,
    mismatches,
    fingerprintMatches: !entry?.baseFingerprint || entry.baseFingerprint === computeCallsFingerprint(baseCalls),
  };
}

// アプリ本体用：承認済みデータ（js/data/callTextPlacements.js の1曲分）を端末のコールに当てはめる。
// 旧形式 { placements } は位置だけ、新形式 { calls, added, baseFingerprint } は位置・文章・非表示・追加まで反映する。
// 新形式で端末のコールが承認したときと1件でも違う場合は、何も当てはめず「未確認」として扱う（誤った位置・文章を出さない）。
// 戻り値：{ calls, overrides, approved, mismatch }
export function resolveApprovedCallText(baseCalls, approved) {
  const calls = baseCalls ?? [];
  if (!approved) return { calls, overrides: null, approved: false, mismatch: false };
  if (!approved.calls && !approved.added) return { calls, overrides: approved.placements ?? null, approved: true, mismatch: false };
  const applied = applyCallTextEntry(calls, approved);
  if (applied.mismatches.length > 0 || !applied.fingerprintMatches) return { calls, overrides: null, approved: false, mismatch: true };
  return { calls: applied.calls, overrides: applied.overrides, approved: true, mismatch: false };
}
