// データの「内容が同じか違うか」を判定するための、SHA-256ハッシュ計算の共通ユーティリティ
// （2026-08-29新設）。
//
// 【使いみち】追加データパックの読み込み時、「この曲のデータはこの端末に既にあるが、
// 中身が同じか違うか」を判定するために使う（音源Blob・歌詞/コール/コールガイドの
// 内容、どれもこの1つの関数で扱えるようにする）。songIdの有無だけで新規/更新を
// 判定していた以前の方式（2026-08-28〜29）は、「同じ曲IDだが中身が修正されている」
// ケース（実例：『僕のヒロイン』の歌詞誤登録の修正）を検出できなかったため、
// 内容そのものを比較する方式に置き換える。
//
// ブラウザ標準のSubtleCrypto APIだけを使い、外部ライブラリは使わない（CLAUDE.mdの
// 「素のJS優先」方針に沿う）。iOS Safari・Android Chromeともに対応済みのAPI。

// 文字列・Blob/File・ArrayBuffer・Uint8Arrayのいずれかから、SHA-256ハッシュ値を
// 16進数の文字列（64文字）として計算する。
export async function computeSha256Hex(source) {
  const bytes = await toBytes(source);
  const digestBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digestBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function toBytes(source) {
  if (typeof source === "string") {
    return new TextEncoder().encode(source);
  }
  if (source instanceof Blob) {
    return new Uint8Array(await source.arrayBuffer());
  }
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  if (source instanceof Uint8Array) {
    return source;
  }
  throw new TypeError("computeSha256Hex: 文字列・Blob・ArrayBuffer・Uint8Array以外は扱えません");
}
