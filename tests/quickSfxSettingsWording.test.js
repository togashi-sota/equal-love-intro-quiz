// 問題中に開ける簡易効果音設定（#quick-sfx-settings-modal）の見出し文言変更
// （「効果音の音量」→「正解・不正解音の音量」、2026-09-05、本人指示）の回帰防止テスト。
// index.htmlは静的HTMLでJSモジュールとしてimportできないため、ソーステキストを検査する。
import { assertEqual } from "./test-utils.js";

export async function runQuickSfxSettingsWordingTests() {
  const response = await fetch("index.html");
  const html = await response.text();
  assertEqual(html.length > 1000, true, "index.htmlのソースを取得できた（前提条件）");

  const modalStart = html.indexOf('id="quick-sfx-settings-modal"');
  assertEqual(modalStart !== -1, true, "#quick-sfx-settings-modalが存在する（前提条件）");
  const modalBlock = html.slice(modalStart, modalStart + 1200);

  assertEqual(
    modalBlock.includes("正解・不正解音の音量"),
    true,
    "問題中の簡易効果音設定に「正解・不正解音の音量」という見出しがある"
  );
  assertEqual(
    modalBlock.includes("効果音の音量</p>"),
    false,
    "問題中の簡易効果音設定に、旧見出し「効果音の音量」が残っていない"
  );
  // 説明文に「問題の楽曲の音量には影響しない」という趣旨が残っていることも確認する
  // （見出し変更に合わせて、本人指示どおり自然な日本語へ調整済みであることの確認）。
  assertEqual(
    modalBlock.includes("楽曲") && modalBlock.includes("音量には影響しません"),
    true,
    "説明文に「問題の楽曲の音量には影響しない」という趣旨が残っている"
  );
}
