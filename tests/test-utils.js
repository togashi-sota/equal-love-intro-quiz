// 自作の超シンプルなテストヘルパー。
// JestやVitestのような外部ツールを使わず、最小限の仕組みで
// 「実際の結果が期待した結果と一致しているか」を確認する。

let passCount = 0;
let failCount = 0;

// actual（実際の値）とexpected（期待する値）を比較し、結果をコンソールに出す。
export function assertEqual(actual, expected, description) {
  const isPass = JSON.stringify(actual) === JSON.stringify(expected);
  if (isPass) {
    passCount++;
    console.log(`✅ ${description}`);
  } else {
    failCount++;
    console.error(`❌ ${description} — 期待値: ${JSON.stringify(expected)} / 実際: ${JSON.stringify(actual)}`);
  }
  return isPass;
}

// ここまでの結果をコンソールにまとめて表示し、件数を返す。
export function printSummary() {
  console.log(`\n合計: ${passCount + failCount}件中 ${passCount}件成功 / ${failCount}件失敗`);
  return { passCount, failCount };
}
