// 対戦コード（js/localBattle.js）・結果コード（js/localBattleResult.js）の両方で共通して使う、
// 「複数の小さな数値を、ビット単位で隙間なく詰め込んで短いBase32文字列にする」ための
// 汎用ユーティリティ。
//
// 【なぜビット単位が必要か】各項目（バージョン番号・シード・正解数など）を素直に1バイト単位で
// 保存すると、実際に使う範囲より無駄に大きい枠を持ってしまい、コードが長くなる。
// 例えば「バージョン番号」は当分0〜数個の値しか使わないのに1バイト（256通り）確保するのは
// もったいない。ここでは各項目に「本当に必要なビット数」だけを割り当てて隙間なく詰め、
// コードをできるだけ短くする（2026-08-07、本人からの「コードをもっと短くしたい」という
// 要望を受けて、対戦コード・結果コードの両方をこの方式に作り直した）。

// 見間違えやすい I・L・O・U を除いた32文字（Crockford's Base32と同じ考え方）。
export const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// fields: [{ value, bits }, ...] を先頭から順に「上位ビット→下位ビット」の並びで詰め込み、
// Base32文字列にして返す。文字数に対してビット数が足りない端数分は、末尾に0を詰めて埋める。
export function packFieldsToBase32(fields) {
  const totalBits = fields.reduce((sum, field) => sum + field.bits, 0);
  const codeCharLength = Math.ceil(totalBits / 5);
  const paddingBits = codeCharLength * 5 - totalBits;

  let value = 0n;
  for (const { value: fieldValue, bits } of fields) {
    value = (value << BigInt(bits)) | BigInt(fieldValue);
  }
  value <<= BigInt(paddingBits);

  let text = "";
  for (let i = codeCharLength - 1; i >= 0; i--) {
    const chunk = Number((value >> BigInt(i * 5)) & 0x1fn);
    text += BASE32_ALPHABET[chunk];
  }
  return text;
}

// Base32文字列を、指定したビット幅の並び（bitsList）にしたがって数値の配列に戻す。
// 文字数が合わない・使えない文字が含まれる場合はnullを返す（入力ミスの検出に使う）。
export function unpackBase32ToFields(text, bitsList) {
  const totalBits = bitsList.reduce((sum, bits) => sum + bits, 0);
  const codeCharLength = Math.ceil(totalBits / 5);
  const paddingBits = codeCharLength * 5 - totalBits;

  const chars = text.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (chars.length !== codeCharLength) return null;

  let value = 0n;
  for (const char of chars) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5n) | BigInt(index);
  }
  value >>= BigInt(paddingBits);

  // 詰め込んだときと逆順（下位ビット側）から1項目ずつ取り出すため、
  // 最後にreverse()して元の並び順に戻す。
  const reversedValues = [];
  for (const bits of [...bitsList].reverse()) {
    const mask = (1n << BigInt(bits)) - 1n;
    reversedValues.push(Number(value & mask));
    value >>= BigInt(bits);
  }
  return reversedValues.reverse();
}

// checksumBitsの範囲に収まるよう、valueをchecksumBitsごとのかたまりに分けてXORで畳み込む。
// これにより、値の上位ビット側の変化も必ずチェック値に反映されるようになる
// （単純にsum % modulusだけで求めると、大きな値の上位ビットの変化は「余りを取る」際に
// 消えてしまい、検出できない場合があることが分かったため。2026-08-07、ミスペナルティ選択の
// 追加作業中に総当たりテストで発見・修正）。
function foldToBits(value, bits) {
  const modulus = 2 ** bits;
  let folded = 0;
  let remaining = value;
  while (remaining > 0) {
    folded ^= remaining % modulus;
    remaining = Math.floor(remaining / modulus);
  }
  return folded;
}

// foldedをbits幅の中で左に回転させる。項目ごとに回転量をずらしてから合計することで、
// 複数の項目の変化が偶然打ち消し合ってチェック値が一致してしまう可能性を減らす。
function rotateLeft(value, shift, bits) {
  const mask = (1 << bits) - 1;
  const s = shift % bits;
  if (s === 0) return value & mask;
  return ((value << s) | (value >>> (bits - s))) & mask;
}

// 詰め込んだ項目の値から、指定したビット数のチェック値を作る。
// 対戦コード・結果コードのチェック値（入力ミスの簡易検出）として共通で使う。
export function computeChecksum(values, checksumBits) {
  const modulus = 2 ** checksumBits;
  let sum = 0;
  values.forEach((value, index) => {
    const folded = foldToBits(value, checksumBits);
    sum = (sum + rotateLeft(folded, index, checksumBits)) % modulus;
  });
  return sum;
}

// 表示・手入力用に、4文字ごとにハイフンを入れる（例："K7F9XQ3M8L" → "K7F9-XQ3M-8L"）。
export function formatCodeForDisplay(code) {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}
