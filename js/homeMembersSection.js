// ホームの「メンバーを知る」（現役メンバーのカード）を組み立てるファイル（2026-11-03 新設・本人の依頼 R10-3）。
//
// 【何をするか】
// 現役メンバー（members.js の status: active）を、正式な順（出席番号順）でカードにして並べる。
// カードには、名前・メンバーカラー（色の点と下の帯）・ひとことの紹介（memberProfiles.js の homeLead）・
// 「プロフィール」（押すと個人ページへ移ることが分かる表示）を出す。
// 写真は使わない（権利が確かめられないため。色と文字だけで作る）。
//
// 【なぜ別のファイルか】
// ホームの画面の部品（js/homeScreen.js）はすでに大きいので、データからカードを作る所だけをここに分けた。
// DOM の部品を作るだけで、画面の切り替え（個人ページを開く・戻る）は main.js が受け持つ（onSelect で受け取る）。

import { getActiveMembers, getMemberProfile } from "./memberUtils.js";

// 1人分のカードの中身（DOM を作る前の、表示する文字と色）。テストで中身を確かめやすいように分けている。
export function buildHomeMemberCardModels(members, profiles) {
  return getActiveMembers(members).map((member) => ({
    memberId: member.id,
    name: member.name,
    colorName: member.memberColor?.name ?? null,
    colorHex: member.memberColor?.hex ?? null,
    role: member.roles?.[0] ?? null,
    // 「|」は改行してよい所の目印（表示しない）。読み上げ・比べるときは取り除いた文を使う
    lead: getMemberProfile(profiles, member.id)?.homeLead?.text?.replaceAll("|", "") ?? null,
    leadPhrases: splitLeadPhrases(getMemberProfile(profiles, member.id)?.homeLead?.text ?? ""),
  }));
}

// 【2026-11-03 R11-A】ひとこと紹介を「・」の区切りごとのまとまり（span）にする。
// 「・」は前のまとまりの最後に付けるので、改行しても行の頭に「・」が来ない（以前は「…加入／・愛称は」のようになっていた）。
// 長い文は、データの「|」（表示しない）の所でも区切る（例：「ファッションブランドを|手がける」）。
// まとまりは CSS で途中改行しない（inline-block）。1つのまとまりが幅より長いときだけ、その中で折り返す。
export function splitLeadPhrases(text) {
  // 「・」の後で区切り（「・」は前のまとまりに付ける）、「|」の所でも区切る（「|」は表示しない）
  return text
    .split("・")
    .filter((part) => part.length > 0)
    .flatMap((part, index, parts) => {
      const pieces = part.split("|").filter((piece) => piece.length > 0);
      if (index < parts.length - 1) pieces[pieces.length - 1] += "・";
      return pieces;
    });
}

function buildLeadPhrases(phrases) {
  return phrases.map((phrase) => {
    const span = document.createElement("span");
    span.className = "home-member-lead-part";
    span.textContent = phrase;
    return span;
  });
}

// カード1枚（button）。押す所はカード全体の1つだけ（中にボタンを入れない）
export function buildHomeMemberCard(model, onSelect) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "home-member";
  button.dataset.memberId = model.memberId;
  if (model.colorHex) button.style.setProperty("--member", model.colorHex);
  // 読み上げ：名前・役割・紹介・行き先をまとめて1つの名前にする
  const who = model.role ? `${model.name}（${model.role}）` : model.name;
  button.setAttribute("aria-label", `${who}のプロフィールを見る${model.lead ? `。${model.lead}` : ""}`);

  const head = document.createElement("span");
  head.className = "home-member-head";
  const dot = document.createElement("span");
  dot.className = "home-member-dot";
  dot.setAttribute("aria-hidden", "true");
  const name = document.createElement("b");
  name.className = "home-member-name";
  name.textContent = model.name;
  head.append(dot, name);
  button.appendChild(head);

  const meta = document.createElement("span");
  meta.className = "home-member-meta";
  meta.setAttribute("aria-hidden", "true");
  // 役割の札（例：リーダー）。ひとこと紹介に同じ言葉があれば、札は重ねて出さない（2026-11-03：山本杏奈のひとことに「リーダー」を入れた）
  if (model.role && !(model.lead ?? "").includes(model.role)) {
    const role = document.createElement("span");
    role.className = "home-member-role";
    role.textContent = model.role;
    meta.appendChild(role);
  }
  if (model.colorName) {
    const color = document.createElement("span");
    color.className = "home-member-color";
    color.textContent = model.colorName;
    meta.appendChild(color);
  }
  button.appendChild(meta);

  if (model.lead) {
    const lead = document.createElement("span");
    lead.className = "home-member-lead";
    lead.setAttribute("aria-hidden", "true");
    lead.append(...buildLeadPhrases(model.leadPhrases ?? splitLeadPhrases(model.lead)));
    button.appendChild(lead);
  }

  const go = document.createElement("span");
  go.className = "home-member-go";
  go.setAttribute("aria-hidden", "true");
  go.textContent = "プロフィール ›";
  button.appendChild(go);

  button.addEventListener("click", () => onSelect(model.memberId));
  return button;
}

// ホームの「メンバーを知る」へカードを並べる（起動時に1回。データはアプリと一緒に配る固定のもの）
export function renderHomeMembers(container, members, profiles, onSelect) {
  if (!container) return;
  const models = buildHomeMemberCardModels(members, profiles);
  container.replaceChildren(...models.map((model) => buildHomeMemberCard(model, onSelect)));
}
