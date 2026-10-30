// 【2026-10-31新設】名前コールの判定（js/callNameColors.js・js/data/callNameDictionary.js）の回帰テスト。
// 本物のコール本文は使わず、ダミーの文字列だけで確かめる（名前の書き方だけは、対応表にある書き方を使う）。
import { classifyCallNames, memberAccentStyle } from "../js/callNameColors.js";
import { CALL_NAME_ENTRIES, NOT_NAME_PHRASES } from "../js/data/callNameDictionary.js";
import { MEMBERS } from "../js/data/members.js";
import { assertEqual } from "./test-utils.js";

const colorOf = (memberId) => MEMBERS.find((m) => m.id === memberId).memberColor.hex;
const joined = (result) => result.parts.map((p) => p.text).join("");
const names = (result) => result.parts.filter((p) => p.memberId).map((p) => `${p.text}=${p.memberId}`);

export function runCallNameColorsTests() {
  console.log("--- 名前コールの判定（メンバーカラー） ---");

  // 1人
  const single = classifyCallNames("ダミー！ひとみ！ダミー");
  assertEqual(single.kind, "single", "1人：kind は single");
  assertEqual(names(single), ["ひとみ=takamatsu-hitomi"], "1人：名前の所だけ memberId を持つ");
  assertEqual(single.parts.find((p) => p.memberId).color, colorOf("takamatsu-hitomi"), "1人：色は members.js のメンバーカラー");
  assertEqual(single.members, [{ memberId: "takamatsu-hitomi", color: colorOf("takamatsu-hitomi") }], "1人：members は1人");
  assertEqual(joined(single), "ダミー！ひとみ！ダミー", "1人：parts をつなげると元どおり");
  assertEqual(memberAccentStyle(single), colorOf("takamatsu-hitomi"), "光の色：1人ならその色（文字列）");
  assertEqual(classifyCallNames("ひーとみ！×４").kind, "single", "1人：伸ばした書き方と回数（×４）");
  assertEqual(names(classifyCallNames("ひーとみ！×４ ひーとみ！×２")), ["ひーとみ=takamatsu-hitomi", "ひーとみ=takamatsu-hitomi"], "1人：同じ人を2回呼んでも");
  assertEqual(classifyCallNames("ひーとみ！×４ ひーとみ！×２").members.length, 1, "1人：同じ人を2回呼んでも members は1人");
  assertEqual(names(classifyCallNames("超絶かわいい！さなつん！")), ["さなつん=morohashi-sana"], "1人：「超絶かわいい！」の後ろの名前");
  assertEqual(names(classifyCallNames("あーさなつん！")), ["さなつん=morohashi-sana"], "1人：「あー」のすぐ後ろの名前");
  assertEqual(names(classifyCallNames("あーんな！")), ["あーんな=yamamoto-anna"], "1人：「あーんな」は「あー」＋「んな」ではなく名前");
  assertEqual(names(classifyCallNames("頑張れ頑張れきあら！")), ["きあら=saito-kiara"], "1人：「頑張れ」の後ろの名前");
  assertEqual(names(classifyCallNames("きあらー！")), ["きあらー=saito-kiara"], "1人：後ろの伸ばし「ー」も名前の所に含める");
  assertEqual(names(classifyCallNames("ヒトミ！")), ["ヒトミ=takamatsu-hitomi"], "1人：カタカナの書き方");
  assertEqual(names(classifyCallNames("瀧脇笙古！")), ["瀧脇笙古=takiwaki-shoko"], "1人：漢字のフルネーム（最長一致）");
  assertEqual(names(classifyCallNames("しょこちゃん")), ["しょこちゃん=takiwaki-shoko"], "1人：「ちゃん」付きを丸ごと名前に");
  assertEqual(names(classifyCallNames("オ・オ・タ・ニ！")), ["オ・オ・タ・ニ=otani-emiri"], "1人：区切り「・」入りの書き方");
  assertEqual(classifyCallNames("のんの！").members[0].color, colorOf("satake-nonno"), "元メンバー：members.js の色に合わせる");

  // 複数（候補ではない）
  const multi = classifyCallNames("まいか！あんな！");
  assertEqual(multi.kind, "multi", "複数：kind は multi");
  assertEqual(multi.members.map((m) => m.memberId), ["sasaki-maika", "yamamoto-anna"], "複数：出てきた順に1人1回");
  assertEqual(multi.parts.filter((p) => p.memberId).map((p) => p.color), [colorOf("sasaki-maika"), colorOf("yamamoto-anna")], "複数：名前ごとにそれぞれの色");
  assertEqual(memberAccentStyle(multi), [colorOf("sasaki-maika"), colorOf("yamamoto-anna")], "光の色：複数なら色の並び（配列）");

  // or（候補を並べた形）
  const or = classifyCallNames("みりにゃ！ or ひとみ！");
  assertEqual(or.kind, "or", "or：「A！ or B！」");
  assertEqual(joined(or), "みりにゃ！ or ひとみ！", "or：parts をつなげると元どおり");
  assertEqual(memberAccentStyle(or), [colorOf("otani-emiri"), colorOf("takamatsu-hitomi")], "or：光の色は候補の色の並び");
  assertEqual(classifyCallNames("はなちゃん！×４orしょこちゃん！×４").kind, "or", "or：空白なしの「×４or」");
  assertEqual(classifyCallNames("はなちゃん!orきあら!orさなつん！").members.length, 3, "or：半角！と空白なしの or で3人");
  assertEqual(classifyCallNames("はなちゃん!orきあら!orさなつん！").kind, "or", "or：3人の候補");
  assertEqual(classifyCallNames("いおり／あんな").kind, "or", "or：「A／B」");
  assertEqual(classifyCallNames("超絶かわいい！りさちゃん！ OR まいか！").kind, "or", "or：大文字の OR");
  assertEqual(classifyCallNames("ダミー or ダミー").kind, "none", "or：名前が無ければ none");

  // 名前ではない言葉
  for (const text of ["わーわー！", "オイ！", "Hey！", "フッフー！", "あーフッフー！", "おい！×１６", "L・O・V・E", "◯◯！", "Forever", "", "ダミー"]) {
    const result = classifyCallNames(text);
    assertEqual([result.kind, result.members.length, joined(result)], ["none", 0, text], `名前ではない：「${text}」`);
  }
  assertEqual(memberAccentStyle(classifyCallNames("Hey！")), null, "光の色：名前が無ければ null");
  assertEqual(memberAccentStyle(null), null, "光の色：結果が無くても null");
  assertEqual(classifyCallNames(null).kind, "none", "文字列でなければ none（例外を出さない）");
  assertEqual(classifyCallNames("Forever or Miss you").kind, "none", "英語の or があっても名前が無ければ none");

  // 長い文字列の一部（名前に見えるが名前ではない）
  assertEqual(classifyCallNames("楽しみましょこ！").kind, "none", "一部：「楽しみましょこ」の「しょこ」は名前にしない");
  assertEqual(classifyCallNames("スーパーいおりターイム！").kind, "none", "一部：「いおりターイム」の「いおり」は名前にしない");
  assertEqual(classifyCallNames("いおりのセリフからの　あ～").kind, "none", "一部：説明書き「いおりの〜」は名前にしない");
  assertEqual(classifyCallNames("ダミーあんなダミー").kind, "none", "一部：前後が区切りでない「あんな」は名前にしない");
  assertEqual(classifyCallNames("あんなに好き！").kind, "none", "一部：「あんなに」は名前にしない");
  assertEqual(classifyCallNames("ありさ！").kind, "none", "一部：「ありさ」の「りさ」は名前にしない（前が区切りでない）");
  assertEqual(classifyCallNames("はなび！").kind, "none", "一部：「はなび」の「はな」は名前にしない（後ろが区切りでない）");
  assertEqual(classifyCallNames("お姫様！").kind, "none", "確信できない愛称（姫）は名前にしない");
  assertEqual(classifyCallNames("ミリ！").kind, "none", "確信できない書き方（ミリ）は名前にしない");
  assertEqual(classifyCallNames("リーダー！").kind, "none", "役割の言葉（リーダー）は名前にしない");

  // 境界（区切りの種類）
  for (const [text, label] of [
    ["ひとみ", "文字列の始まりと終わり"],
    [" ひとみ ", "半角空白"],
    ["　ひとみ　", "全角空白"],
    ["\nひとみ\n", "改行"],
    ["ダミー、ひとみ。", "読点・句点"],
    ["ひとみ？", "？"],
    ["ひとみ×２", "×２（！なし）"],
  ]) {
    const result = classifyCallNames(text);
    assertEqual([result.kind, joined(result)], ["single", text], `境界：${label}`);
  }
  assertEqual(names(classifyCallNames("\nみーりにゃ！×４\n")), ["みーりにゃ=otani-emiri"], "境界：前後の改行は名前に含めない");

  // 文字列を1文字も変えない（絵文字・サロゲートペア・記号を含むダミー）
  for (const text of ["👏 👏👏 👏\nダミー！ きあら！ or 👏", "あーフっフー！ はな！", "ﾀﾞﾐｰ ひとみ！×4 or いーおり！×4\n", "♡（ダミー）！まいか！"]) {
    assertEqual(joined(classifyCallNames(text)), text, `元どおり：${JSON.stringify(text)}`);
  }

  // 対応表の整合：全員が members.js にいて、色があること。例外の言葉は名前にならないこと
  for (const entry of CALL_NAME_ENTRIES) {
    const member = MEMBERS.find((m) => m.id === entry.memberId);
    assertEqual(Boolean(member && /^#[0-9a-f]{6}$/i.test(member.memberColor?.hex ?? "")), true, `対応表：${entry.memberId} は members.js にいて色がある`);
    for (const form of entry.forms) {
      const result = classifyCallNames(`${form}！`);
      assertEqual(result.members.map((m) => m.memberId), [entry.memberId], `対応表：「${form}」は ${entry.memberId}`);
    }
  }
  const allFormOwners = new Map();
  let duplicated = [];
  for (const entry of CALL_NAME_ENTRIES) for (const form of entry.forms) {
    if (allFormOwners.has(form) && allFormOwners.get(form) !== entry.memberId) duplicated.push(form);
    allFormOwners.set(form, entry.memberId);
  }
  assertEqual(duplicated, [], "対応表：同じ書き方が2人に割り当てられていない");
  for (const phrase of NOT_NAME_PHRASES) {
    assertEqual(classifyCallNames(`${phrase}！`).kind, "none", `例外：「${phrase}」は名前ではない`);
  }
}
