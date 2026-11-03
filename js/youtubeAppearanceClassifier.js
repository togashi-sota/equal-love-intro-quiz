// 「YouTube 出演図鑑」の出演者の判定（2026-11-02新設・本人の依頼 R10-1）。
// 公式チャンネル「イコラブ ノイミー ニアジョイ チャンネル」の動画1本ごとに、
// ＝LOVE のメンバーが出ているか・誰が出ているか・何を根拠にそう言えるかを決める。
//
// 【使う所】
// - js/youtubeRefreshCore.js（scripts/youtube/refresh.mjs から。GitHub Actions でも手元でも）が、取得した動画の情報から公開用のデータを作るときに使う。
// - tests/youtubeAppearances.test.js が、判定の決まりを確かめるときに使う。
// アプリの画面は判定をしない（公開のたびに scripts/youtube/refresh.mjs が js/youtubeRefreshCore.js 経由でこのファイルを使って作った data/youtube-appearances.json を読むだけ）。
// DOM にも通信にも触れない（Node でもブラウザでも同じように動かすため）。
//
// 【判定の順番（強い根拠から）】
// 1. 手で確定したもの（tools/youtube-appearances/confirmations.json）……人が動画を見て記入したもの。いちばん強い
// 2. 説明欄の公式の出演者の表記（「▼出演メンバー」の下の名前の並び）……動画ごとに書き分けられている公式の表記
//    - ただし、3グループのほぼ全員が並ぶ表記は「全員の表記」とみなし、全員の出演の証拠にしない（本人の依頼）
//    - 並んだ名前が ≠ME・≒JOY の人だけなら除外する（＝LOVE が出ていない）
// 3. タイトルの＝LOVE のメンバーのフルネーム
// 4. 説明の本文（チャンネル登録の案内などの決まった文の部分を除く）の＝LOVE のメンバーのフルネーム
// 5. タイトル・公式の再生リストの名前の「イコラブ」「＝LOVE」……＝LOVE が出ているが、誰かは分からない
// 6. タイトル・再生リストが ≠ME・≒JOY だけ（ノイミー・ニアジョイ）……除外（名前の表記が無いので、根拠は弱い）
// 7. どれにも当たらない……「出演者未確認」
// 愛称（「ひとみ」「いおり」など）は使わない。≠ME の鈴木瞳美（ひとみ）のように、ほかのグループの人や普通の言葉と区別できないため。
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";

// 確認の状態（データの status）。画面の表示名もここで決める
export const APPEARANCE_STATUS = Object.freeze({
  MANUAL: "manual", // 手で確定
  CAST_LIST: "cast-list", // 説明欄の公式の出演者の表記
  TITLE_NAME: "title-name", // タイトルの名前（推定）
  DESCRIPTION_NAME: "description-name", // 説明の本文の名前（推定）
  GROUP_ONLY: "group-only", // ＝LOVE の出演は分かるが、メンバーは未確認
  UNCONFIRMED: "unconfirmed", // 出演者未確認（＝LOVE が出ているかも分からない）
});

export const APPEARANCE_STATUS_LABELS = Object.freeze({
  [APPEARANCE_STATUS.MANUAL]: "確定（手で確認）",
  [APPEARANCE_STATUS.CAST_LIST]: "確定（公式の出演者の表記）",
  [APPEARANCE_STATUS.TITLE_NAME]: "推定（タイトルの名前）",
  [APPEARANCE_STATUS.DESCRIPTION_NAME]: "推定（説明の名前）",
  [APPEARANCE_STATUS.GROUP_ONLY]: "＝LOVE 出演・メンバー未確認",
  [APPEARANCE_STATUS.UNCONFIRMED]: "出演者未確認",
});

// 根拠の種類（1本ごとに記録する）
export const EVIDENCE_TYPE = Object.freeze({
  MANUAL: "manual",
  CAST_LIST: "cast-list",
  TITLE_NAME: "title-name",
  DESCRIPTION_NAME: "description-name",
  TITLE_GROUP_TAG: "title-group-tag",
  PLAYLIST_GROUP: "playlist-group",
  DESCRIPTION_WRITER: "description-writer", // 【2026-11-03 R11】説明欄の文を書いた人（出演者とは限らない）
  INFERRED: "inferred", // 【R12】サムネイルの人数・公式の説明などからの推定を、本人が採用したもの（本人の確認ではない）
});

export const EVIDENCE_TYPE_LABELS = Object.freeze({
  [EVIDENCE_TYPE.MANUAL]: "手で確認した記録",
  [EVIDENCE_TYPE.CAST_LIST]: "説明欄の公式の出演者の表記",
  [EVIDENCE_TYPE.TITLE_NAME]: "タイトルのメンバーの名前",
  [EVIDENCE_TYPE.DESCRIPTION_NAME]: "説明の本文のメンバーの名前",
  [EVIDENCE_TYPE.TITLE_GROUP_TAG]: "タイトルのグループ名",
  [EVIDENCE_TYPE.PLAYLIST_GROUP]: "公式の再生リストの名前",
  [EVIDENCE_TYPE.DESCRIPTION_WRITER]: "説明欄の文を書いたメンバー（出演者の全部ではない）",
  [EVIDENCE_TYPE.INFERRED]: "推定（本人が採用。一人ずつの確認はまだ）",
});

// 説明の本文の、＝LOVE のメンバーの名前の役わけ（2026-11-03 R11）
// - writers：説明欄の文を書いた人。名前だけの行（署名。「＝LOVE 山本杏奈」「山本杏奈より」も）・「(概要欄：○○)」「文：○○」
// - selfIntroduced：「＝LOVE の○○です」と名乗って話している人（その回に出ている見込みが高い）
// - performers：selfIntroduced と、文の中で名前が出た人（「○○と△△が挑戦」など）。出演者の全部とは限らない
const TIMESTAMP_LINE_PATTERN = /^[^\p{L}\p{N}]*\d{1,2}:\d{2}(?::\d{2})?/u;
export function analyzeDescriptionNames(description, nameIndex = buildEqualLoveNameIndex()) {
  const writers = new Set();
  const selfIntroduced = new Set();
  const mentioned = new Set();
  extractDescriptionBody(description)
    .split(/\r?\n/)
    .forEach((rawLine) => {
      const line = rawLine.trim();
      // かっこの中（「(概要欄：○○)」）の名前も読む（名前の比べ方はかっこの中を消すので、先にかっこだけ外す）
      const ids = findEqualLoveNamesInText(line.replace(/[()（）]/g, " "), nameIndex);
      if (!ids.length) return;
      const bare = normalizePersonName(line)
        .replace(/[＝=]LOVE|イコラブ/gi, "")
        .replace(/^[(（［\[【]?(概要欄|文|説明文?|コメント|text|by)[：:]?/i, "")
        .replace(/(より|から|です|でした)?[)）\]］】!！。、,.♪☆★♡♥💓💗🌸✨〜~ー-]*$/u, "")
        .replace(/[^\p{L}\p{N}]/gu, "");
      const nameKeys = ids.map((memberId) => nameIndex.find((entry) => entry.memberId === memberId)?.key ?? "");
      const isSignature = nameKeys.join("") === bare || nameKeys.some((key) => key === bare);
      const isCredit = /^[(（［\[]?\s*(概要欄|文|説明文?|コメント)\s*[：:]/.test(line);
      if (isSignature || isCredit) {
        ids.forEach((memberId) => writers.add(memberId));
        return;
      }
      if (/^[＝=]?\s*(LOVE|イコラブ)?\s*の?\s*\S+\s*です/i.test(line) && /です/.test(line.slice(0, 40))) {
        ids.forEach((memberId) => selfIntroduced.add(memberId));
        return;
      }
      ids.forEach((memberId) => mentioned.add(memberId));
    });
  // 【R11】目次の時刻の行（「0:10:00：名前」）は、その時刻にその人の場面がある＝出ている見込みが高い（説明欄のどこにあっても読む）
  String(description ?? "")
    .split(/\r?\n/)
    .filter((line) => TIMESTAMP_LINE_PATTERN.test(line.trim()))
    .forEach((line) => findEqualLoveNamesInText(line, nameIndex).forEach((memberId) => mentioned.add(memberId)));
  const performers = [...new Set([...selfIntroduced, ...mentioned])];
  return { writers: [...writers].filter((memberId) => !performers.includes(memberId)), selfIntroduced: [...selfIntroduced], performers };
}

// 除外の理由（tools の除外の一覧に書く）
export const EXCLUDE_REASON = Object.freeze({
  CAST_LIST_OTHER_GROUPS_ONLY: "cast-list-other-groups-only",
  TITLE_OTHER_GROUPS_ONLY: "title-other-groups-only",
  NOT_PUBLIC: "not-public",
  MANUAL: "manual",
});

export const EXCLUDE_REASON_LABELS = Object.freeze({
  [EXCLUDE_REASON.CAST_LIST_OTHER_GROUPS_ONLY]: "説明欄の公式の出演者の表記が ≠ME・≒JOY の人だけ",
  [EXCLUDE_REASON.TITLE_OTHER_GROUPS_ONLY]: "タイトル・再生リストが ≠ME・≒JOY だけ（出演者の表記なし。根拠は弱い）",
  [EXCLUDE_REASON.NOT_PUBLIC]: "公開されていない（非公開・削除）",
  [EXCLUDE_REASON.MANUAL]: "手で確認して除外",
});

// 「テンプレートの全員の表記」の見分け方（2026-11-03 改め）
// 以前は「25人以上の表記」を一律に全員の表記とみなしていたが、実際のチャンネルでは3グループ合同の回（大運動会・初対バン・特番など）が
// 1本ごとに34人前後の出演者を正しく書いていたため、本物の出演の表記まで捨ててしまっていた。
// 今は「同じ大人数の表記（ROSTER_TEMPLATE_MIN_NAMES 人以上）が、別々の動画に ROSTER_TEMPLATE_MIN_REPEATS 回以上そのまま繰り返される」ものだけを
// テンプレートとみなす（build のスクリプトがチャンネル全体から数えて rosterTemplateKeys で渡す）。2026-11-02 の取得では該当なし。
export const ROSTER_TEMPLATE_MIN_NAMES = 25;
export const ROSTER_TEMPLATE_MIN_REPEATS = 8;

// 出演者の表記を比べるための印（名前を比べる形にして並べ替え、つないだもの）
export function castSignature(names) {
  return [...new Set((names ?? []).map(normalizePersonName))].sort().join("|");
}

// 名前の比べ方：空白・かっこの中（ローマ字）を除き、異体字をそろえる（髙→高、齋・齊・斎→斉）
export function normalizePersonName(text) {
  return String(text ?? "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s　・･]/g, "")
    .replace(/髙/g, "高")
    .replace(/[齋齊斎]/g, "斉")
    .replace(/﨑/g, "崎")
    .trim();
}

// ＝LOVE のメンバー（元メンバーを含む）のフルネームの一覧（比べる形にしたもの）
export function buildEqualLoveNameIndex(members = MEMBERS) {
  return members.map((member) => ({
    memberId: member.id,
    graduated: member.status === MEMBER_STATUS.GRADUATED,
    key: normalizePersonName(member.name),
  }));
}

// 説明欄の「出演メンバー」の並びを取り出す。見つからなければ null。
// 公式の書き方：「▼出演メンバー」の行の下に1行1人（「大谷 映美里 (Emiri Otani)」）、空行か「★」「▼」の行で終わる。
// 1本の説明に「▼出演メンバー（ロケパート）」「▼出演メンバー（発表パート）」のように複数あるときは、全部を合わせる。
// 昔の動画の「【出演】」「出演：」「出演メンバー：」の書き方も読む。
// 見出しは「出演メンバー」の言葉だけの行（後ろは（…）の補足・閉じかっこ・「：名前」だけ）。
// 「出演メンバーのサイン入りグッズ…」のような文は見出しにしない。
// 見出しの前の印は「▼」「♥」「💓」など、文字・数字以外の3文字まで。
// 「※○○は不参加になります。」のような注記の行（※で始まる行）は名前にしない（不参加の人を出演にしないため）。
// 【2026-11-03 直し】2020年ごろの書き方は、名前の下に本人の SNS の URL の行があり、グループごとに空行で区切る
//   （「▼出演」→「・ゲストの名前」→ URL →（空行）→「・=LOVE」→「メンバーの名前」→ URL …）。
//   以前は URL の行・1つの空行で並びを打ち切っていたため、この書き方の＝LOVE のメンバーを読み落としていた。
//   今は URL の行は飛ばし、空行が2つ続くか、次の見出し・「▼」「★」などの印の行・「公式」の行で終わる。行頭の「・」は外す。
const CAST_HEADING_PATTERN = /^[\s　]*[^\p{L}\p{N}\s]{0,3}[\s　]*(?:出演メンバー|出演者|出演)[\s　]*(?:[（(][^）)]*[）)])?[\s　]*[】\]]?[\s　]*(?:[:：][\s　]*(.*))?$/u;
export function extractCastNames(description) {
  const lines = String(description ?? "").split(/\r?\n/);
  const names = [];
  let found = false;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(CAST_HEADING_PATTERN);
    if (!match) continue;
    found = true;
    const block = [];
    // 同じ行に名前が続く書き方（「出演：大谷映美里、野口衣織」）
    const inline = Boolean(match[1] && match[1].trim());
    if (inline) block.push(...splitInlineNames(match[1]));
    let next = index + 1;
    let blankRun = 0;
    for (; next < lines.length; next += 1) {
      const line = lines[next].trim();
      if (!line) {
        blankRun += 1;
        // 「出演：A、B」のように見出しの行に名前があるときは、最初の空行で終わる
        if (block.length && (blankRun >= 2 || inline)) break;
        continue;
      }
      blankRun = 0;
      // 「♥=LOVE」「◆≠ME」「💓=LOVE」のようなグループの小見出しは並びの中に残す。「♥=LOVE（イコールラブ）公式サイト」のような「公式」の行で終わる
      // 【R11】「●MC」のような小見出しは並びの中に残す（2020年の生放送で、MC の下の＝LOVE の人を読み落としていた）
      if (/^[▼■★☆【#＃]/.test(line) || /公式|チャンネル登録|お問い合わせ/.test(line) || CAST_HEADING_PATTERN.test(line)) break;
      if (/^https?:\/\//.test(line) || /^[※＊*]/.test(line)) continue;
      block.push(...splitInlineNames(line.replace(/^[・･●○\-－]\s*/, "")));
    }
    names.push(...block);
    index = next - 1;
  }
  const cleaned = [...new Set(names.map((name) => name.trim()).filter((name) => name && name.length <= 30))];
  return found && cleaned.length ? cleaned : null;
}

function splitInlineNames(text) {
  // 「、」「,」「/」で区切った並びにも対応（かっこの中のローマ字の「,」は先に消す）
  return String(text)
    .replace(/[（(][^）)]*[）)]/g, "")
    .split(/[、,，/／]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// 説明の本文（チャンネル登録の案内・問い合わせ・公式 X・素材の表記・出演者の表記などの「どの動画にも付く部分」を除いたもの）
const TEMPLATE_START_PATTERN = /^[\s　]*(?:▼|★|■|素材音源|写真提供|BGM|#|＃)/;
export function extractDescriptionBody(description) {
  const lines = String(description ?? "").split(/\r?\n/);
  const body = [];
  for (const line of lines) {
    if (TEMPLATE_START_PATTERN.test(line)) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

// 説明の要約：本文の最初の意味のある1行だけを短く（長い説明は写さない。URL・ハッシュタグ・「プロモーション」の表記は除く）
export const SUMMARY_MAX_LENGTH = 40;
export function summarizeDescription(description) {
  const body = extractDescriptionBody(description);
  const line = body
    .split(/\r?\n/)
    .map((text) => text.replace(/https?:\/\/\S+/g, "").replace(/[#＃]\S+/g, "").trim())
    .find((text) => text && !/^プロモーション|^PR\b|^提供|^協力/.test(text));
  if (!line) return "";
  const chars = [...line];
  return chars.length > SUMMARY_MAX_LENGTH ? `${chars.slice(0, SUMMARY_MAX_LENGTH).join("")}…` : line;
}

// 文の中の＝LOVE のメンバーのフルネーム（空白・異体字の違いは吸収）
export function findEqualLoveNamesInText(text, nameIndex = buildEqualLoveNameIndex()) {
  const normalized = normalizePersonName(text);
  return nameIndex.filter((entry) => normalized.includes(entry.key)).map((entry) => entry.memberId);
}

// タイトルだけで使う「下の名前」（例：「樹愛羅、人生初の舟券購入」）。≠ME・≒JOY の人の名前や普通の言葉と重ならないものだけ。
// 「瞳」（≠ME の鈴木瞳美と重なる・普通の言葉）、「なぎさ」（渚・普通の言葉）は入れない。
export const TITLE_GIVEN_NAMES = Object.freeze({
  "otani-emiri": "映美里",
  "oba-hana": "花菜",
  "otoshima-risa": "莉沙",
  "saito-kiara": "樹愛羅",
  "sasaki-maika": "舞香",
  "takiwaki-shoko": "笙古",
  "noguchi-iori": "衣織",
  "morohashi-sana": "沙夏",
  "yamamoto-anna": "杏奈",
  "satake-nonno": "のん乃",
});

export function findGivenNamesInTitle(title, members = MEMBERS) {
  const known = new Set(members.map((member) => member.id));
  return Object.entries(TITLE_GIVEN_NAMES)
    .filter(([memberId, givenName]) => known.has(memberId) && String(title ?? "").includes(givenName))
    .map(([memberId]) => memberId);
}

// グループ名の書き方（タイトル・再生リストの名前）
const GROUP_PATTERNS = {
  equalLove: /イコラブ|[＝=]\s*LOVE/i,
  notEqualMe: /ノイミー|≠\s*ME/i,
  nearlyEqualJoy: /ニアジョイ|≒\s*JOY/i,
};
// 「イコノイジョイ」は3グループ合同の名前（＝LOVE が出ているとは限らないので、＝LOVE の根拠にしない）
const JOINT_NAME_PATTERN = /イコノイジョイ|いこのいじょい/i;

export function detectGroupsInText(text) {
  const source = String(text ?? "").replace(JOINT_NAME_PATTERN, "");
  return {
    equalLove: GROUP_PATTERNS.equalLove.test(source),
    notEqualMe: GROUP_PATTERNS.notEqualMe.test(source),
    nearlyEqualJoy: GROUP_PATTERNS.nearlyEqualJoy.test(source),
    joint: JOINT_NAME_PATTERN.test(String(text ?? "")),
  };
}

function unique(list) {
  return [...new Set(list)];
}

// 動画1本を判定する。
// video: { id, title, description, playlistTitles?: string[], privacyStatus? }
// manual: 本人が確かめた判定（js/data/youtubeVerifiedJudgments.js を toClassifierManual で変換したもの。無ければ null）。
//   { memberIds?: string[]（企画に出演）, footageMemberIds?: string[]（映像で登場）, exclude?: boolean, unconfirmed?: boolean, note?: string, groupOnly?: boolean }
// 戻り値：{ included, status, memberIds, evidence: [{ type, detail }], excludedReason?, castNames?, otherCastNames? }
// otherGroupNames：≠ME・≒JOY の人の名前（比べる形。build のスクリプトが、チャンネルの出演者の表記から集めて渡す）。
//   タイトルにその人たちの名前だけがあるときに除外するために使う。
// rosterTemplateKeys：テンプレートとみなす表記の castSignature の集まり（build のスクリプトが渡す）
export function classifyYoutubeVideo(video, { manual = null, members = MEMBERS, otherGroupNames = [], rosterTemplateKeys = new Set() } = {}) {
  const nameIndex = buildEqualLoveNameIndex(members);
  const memberIdSet = new Set(members.map((member) => member.id));
  const evidence = [];

  if (video.privacyStatus && video.privacyStatus !== "public") {
    return { included: false, status: null, memberIds: [], evidence, excludedReason: EXCLUDE_REASON.NOT_PUBLIC };
  }

  // 1. 手で確定したもの
  if (manual) {
    const note = typeof manual.note === "string" ? manual.note : "";
    if (manual.exclude) {
      return { included: false, status: null, memberIds: [], evidence: [{ type: EVIDENCE_TYPE.MANUAL, detail: note }], excludedReason: EXCLUDE_REASON.MANUAL };
    }
    // 確かめられないので保留（本人の方針「確かめられない → 未確認として保留」。2026-11-03）
    if (manual.unconfirmed) {
      return { included: true, status: APPEARANCE_STATUS.UNCONFIRMED, memberIds: [], evidence: [{ type: EVIDENCE_TYPE.MANUAL, detail: note }] };
    }
    const manualIds = unique((manual.memberIds ?? []).filter((memberId) => memberIdSet.has(memberId)));
    // 【2026-11-03】出演の形：ライブ映像・過去の映像・回想で映像に登場した人（企画の出演者とは分けて持つ）
    const footageIds = unique((manual.footageMemberIds ?? []).filter((memberId) => memberIdSet.has(memberId) && !manualIds.includes(memberId)));
    // 【R12】サムネイルに写っている人（本編の出演・映像で登場とは分けて持つ）
    const thumbnailIds = unique((manual.thumbnailMemberIds ?? []).filter((memberId) => memberIdSet.has(memberId) && !manualIds.includes(memberId) && !footageIds.includes(memberId)));
    if (manualIds.length || footageIds.length || thumbnailIds.length || manual.groupOnly) {
      return {
        included: true,
        status: manualIds.length || footageIds.length || thumbnailIds.length ? APPEARANCE_STATUS.MANUAL : APPEARANCE_STATUS.GROUP_ONLY,
        memberIds: manualIds,
        footageMemberIds: footageIds,
        thumbnailMemberIds: thumbnailIds,
        evidence: [{ type: EVIDENCE_TYPE.MANUAL, detail: note }],
      };
    }
  }

  // 公式の再生リスト（「=LOVE💓」などグループ名の入った再生リスト）。＝LOVE が出ている裏付けとして、どの判定にも記録する
  const playlistTitles = video.playlistTitles ?? [];
  const playlistGroups = playlistTitles.map((title) => ({ title, groups: detectGroupsInText(title) }));
  const equalLovePlaylists = playlistGroups.filter((entry) => entry.groups.equalLove).map((entry) => entry.title);
  const playlistEvidence = equalLovePlaylists.length ? [{ type: EVIDENCE_TYPE.PLAYLIST_GROUP, detail: equalLovePlaylists.join("・") }] : [];

  // 2. 説明欄の公式の出演者の表記
  const castNames = extractCastNames(video.description);
  if (castNames) {
    const castIds = unique(castNames.flatMap((name) => findEqualLoveNamesInText(name, nameIndex)));
    const otherCastNames = castNames.filter((name) => findEqualLoveNamesInText(name, nameIndex).length === 0);
    const isRosterTemplate = rosterTemplateKeys.has(castSignature(castNames));
    if (!isRosterTemplate) {
      if (castIds.length) {
        return {
          included: true,
          status: APPEARANCE_STATUS.CAST_LIST,
          memberIds: castIds,
          evidence: [{ type: EVIDENCE_TYPE.CAST_LIST, detail: `${castNames.length}人の表記（うち＝LOVE ${castIds.length}人）` }, ...playlistEvidence],
          castNames,
          otherCastNames,
        };
      }
      if (otherCastNames.length) {
        return {
          included: false,
          status: null,
          memberIds: [],
          evidence: [{ type: EVIDENCE_TYPE.CAST_LIST, detail: `${castNames.length}人の表記に＝LOVE のメンバーがいない` }],
          excludedReason: EXCLUDE_REASON.CAST_LIST_OTHER_GROUPS_ONLY,
          castNames,
          otherCastNames,
        };
      }
    } else {
      evidence.push({ type: EVIDENCE_TYPE.CAST_LIST, detail: `${castNames.length}人の全員の表記（出演の証拠にしない）` });
    }
  }

  // 3. タイトルの名前（フルネーム、無ければ重ならない下の名前）
  const titleFullIds = findEqualLoveNamesInText(video.title, nameIndex);
  const titleIds = titleFullIds.length ? titleFullIds : findGivenNamesInTitle(video.title, members);
  if (titleIds.length) {
    return {
      included: true,
      status: APPEARANCE_STATUS.TITLE_NAME,
      memberIds: titleIds,
      evidence: [...evidence, { type: EVIDENCE_TYPE.TITLE_NAME, detail: titleFullIds.length ? "" : "下の名前" }, ...playlistEvidence],
    };
  }

  // 4. 説明の本文の名前（決まった文・出演者の表記は除いた本文だけ）
  // 【2026-11-03 R11 直し】説明欄の文を書いた人（最後の署名の行「山本杏奈」・「(概要欄：○○)」）は、出演者として数えない。
  //   以前はこの署名を「出演者の全部」として扱い、全員が出るチャンネル始動の回（2020-05-01）を山本杏奈1人と表示していた。
  //   書いた人は writerMemberIds に分けて記録し、画面では「説明欄の文：○○」として出す（出演者の数・絞り込みには入れない）
  const bodyNames = analyzeDescriptionNames(video.description, nameIndex);
  if (bodyNames.performers.length) {
    return {
      included: true,
      status: APPEARANCE_STATUS.DESCRIPTION_NAME,
      memberIds: bodyNames.performers,
      writerMemberIds: bodyNames.writers.filter((memberId) => !bodyNames.performers.includes(memberId)),
      evidence: [...evidence, { type: EVIDENCE_TYPE.DESCRIPTION_NAME, detail: bodyNames.selfIntroduced.length ? "自己紹介の文" : "" }, ...playlistEvidence],
    };
  }

  // 5. グループ名（タイトル・公式の再生リスト）、または説明欄の文を書いた人が＝LOVE のメンバー
  const titleGroups = detectGroupsInText(video.title);
  if (titleGroups.equalLove || equalLovePlaylists.length || bodyNames.writers.length) {
    const groupEvidence = [];
    if (titleGroups.equalLove) groupEvidence.push({ type: EVIDENCE_TYPE.TITLE_GROUP_TAG, detail: "イコラブ／＝LOVE" });
    groupEvidence.push(...playlistEvidence);
    if (bodyNames.writers.length) groupEvidence.push({ type: EVIDENCE_TYPE.DESCRIPTION_WRITER, detail: "" });
    return { included: true, status: APPEARANCE_STATUS.GROUP_ONLY, memberIds: [], writerMemberIds: bodyNames.writers, evidence: [...evidence, ...groupEvidence] };
  }

  // 6. ≠ME・≒JOY だけ（タイトルにその人たちの名前だけ／グループ名だけ）
  const normalizedTitle = normalizePersonName(video.title);
  const otherNamesInTitle = otherGroupNames.filter((name) => name && normalizedTitle.includes(name));
  if (otherNamesInTitle.length && !titleGroups.joint) {
    return {
      included: false,
      status: null,
      memberIds: [],
      evidence: [...evidence, { type: EVIDENCE_TYPE.TITLE_NAME, detail: `≠ME・≒JOY の人の名前：${otherNamesInTitle.join("・")}` }],
      excludedReason: EXCLUDE_REASON.TITLE_OTHER_GROUPS_ONLY,
    };
  }
  const otherOnlyInTitle = (titleGroups.notEqualMe || titleGroups.nearlyEqualJoy) && !titleGroups.joint;
  const otherOnlyInPlaylists = playlistGroups.length > 0 && playlistGroups.some((entry) => entry.groups.notEqualMe || entry.groups.nearlyEqualJoy);
  if (otherOnlyInTitle || (otherOnlyInPlaylists && !titleGroups.joint)) {
    const detail = [
      otherOnlyInTitle ? "タイトル：ノイミー／ニアジョイ" : "",
      otherOnlyInPlaylists ? `再生リスト：${playlistGroups.filter((entry) => entry.groups.notEqualMe || entry.groups.nearlyEqualJoy).map((entry) => entry.title).join("・")}` : "",
    ]
      .filter(Boolean)
      .join("／");
    return {
      included: false,
      status: null,
      memberIds: [],
      evidence: [...evidence, { type: otherOnlyInTitle ? EVIDENCE_TYPE.TITLE_GROUP_TAG : EVIDENCE_TYPE.PLAYLIST_GROUP, detail }],
      excludedReason: EXCLUDE_REASON.TITLE_OTHER_GROUPS_ONLY,
    };
  }

  // 7. 分からない
  return { included: true, status: APPEARANCE_STATUS.UNCONFIRMED, memberIds: [], evidence };
}
