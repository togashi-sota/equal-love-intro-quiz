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
//   calls: { [callKey]: { lineNo, position, order?, hidden?, editedText?, originalTextHash } },
//   added: [ { key: "added-…", text, type, lineNo, position, order } ]   … 本人が文字モード用に追加したコール
// }
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
    calls.push({ ...call, text, edited: text !== call.text });
    overrides[key] = { lineNo: record.lineNo, position: record.position, ...(Number.isFinite(record.order) ? { order: record.order } : {}) };
  });
  Object.keys(records).forEach((key) => {
    if (!seen.has(key)) mismatches.push({ key, reason: "端末のコールに見つからない" });
  });
  (entry?.added ?? []).forEach((added) => {
    if (typeof added?.key !== "string" || typeof added.text !== "string" || added.text.trim() === "") return;
    const order = Number.isFinite(added.order) ? added.order : 0;
    calls.push({ key: added.key, text: added.text, type: added.type ?? "unique", start: order, end: order + 1.5, added: true });
    overrides[added.key] = { lineNo: added.lineNo, position: added.position, order };
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
