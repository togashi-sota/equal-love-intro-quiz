// ライブコールモードの「コールガイド」パネル（メンバーコール／曲指定コール／
// ペンライト指定曲／MIX・口上の4タブ）を組み立てるファイル。
//
// 表示するのは事実情報（色・名前・出典・使用場面の説明）のみ。コールの掛け声本文・
// MIX/口上の掛け声本文は一切扱わない（js/data/songCallCredits.js・
// js/data/mixAndKoujouGuide.jsのコメント参照）。データが無い項目は
// 「情報がありません」を大量表示せず、その項目自体を出さない。
//
// 【2026-08-24改訂・大規模改修】情報量が大きく増えたため、「①まず覚えたい→②MIX→
// ③口上→④＝LOVE固有→⑤ペンライト→⑥曲から探す」という初心者にも分かりやすい流れを
// 意識して構成している（本人指示）。④・⑥は既存の「曲指定コール」「ペンライト指定曲」
// タブと、曲の再生画面から開いたときのハイライト表示（is-current-song）がそのまま
// 該当する役割を持つため、タブ構成自体は変更せず、各タブの中身を充実させる形にした。

import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import { SONG_PENLIGHT_GUIDE } from "./data/songPenlightGuide.js";
import { SONG_CALL_CREDITS } from "./data/songCallCredits.js";
import { MIX_AND_KOUJOU_GUIDE } from "./data/mixAndKoujouGuide.js";
import { getSongById } from "./data/songs.js";
import { getAllCallGuideData } from "./callGuideStorage.js";
import { getMemberById } from "./memberUtils.js";
import { getMostOshiMemberId } from "./oshiMembers.js";

// 2026-08-17追加：本人指示の「🌟メンバー考案／📣ライブ定番／🔰初心者おすすめ」のような
// 絵文字付きバッジ表記。ライブ直前にスマホでぱっと見て分かることを優先する。
const DIFFICULTY_LABELS = {
  beginner: "🔰 初心者向け",
  intermediate: "🙂 慣れてきた人向け",
  advanced: "🔥🔥 上級者向け",
};

const FREQUENCY_LABELS = {
  common: "🔥 よく使う",
  situational: "🎯 一部の曲で使う",
  rare: "✨ 特殊",
};

// 情報の出所（sourceType）を、初心者が一目で信頼度を判断できる短いバッジに変換する
// （2026-08-17追加、本人指示：「メンバー考案／ライブ定番」等のバッジを付ける）。
// 既存のgetSourceTypeNote()（詳しい一文）とは役割を分け、こちらはカード上部に置く短いラベル用。
// 2026-08-24：曲指定コール・ペンライト指定曲タブでも同じバッジを使い、
// 「🔵公式指定／🩷メンバー発信／✨ファン定番」を混同しないという本人指示に対応する。
const SOURCE_BADGE_LABELS = {
  official: "🔵 公式情報",
  self: "🩷 メンバー発信",
  reliable: "📰 報道で確認",
  fan: "✨ ファン定番",
};

export function formatSourceBadgeLabel(sourceType) {
  return SOURCE_BADGE_LABELS[sourceType] || "❔ 出典未確認";
}

const CATEGORY_LABELS = {
  mix: "基本MIX",
  koujou: "口上",
  "song-specific-koujou": "曲専用口上",
  special: "その他",
};

export function formatDifficultyLabel(difficulty) {
  return DIFFICULTY_LABELS[difficulty] || "難易度不明";
}

export function formatFrequencyLabel(frequency) {
  return FREQUENCY_LABELS[frequency] || "使用頻度不明";
}

export function formatCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

// usedInEqualLoveの3値（true/false/null）を、画面向けの短い一言に変換する。
export function formatUsedInEqualLoveNote(usedInEqualLove) {
  if (usedInEqualLove === true) return null;
  if (usedInEqualLove === false) return "＝LOVEでの使用は確認できませんでした（参考情報）。";
  return "＝LOVEでの使用有無は今回確認できませんでした。";
}

// 曲固有の口上（category:"song-specific-koujou"）のうち、指定曲IDが対象に含まれるものだけを返す。
export function findSongSpecificKoujou(songId) {
  if (!songId) return [];
  return MIX_AND_KOUJOU_GUIDE.filter(
    (entry) => entry.category === "song-specific-koujou" && entry.songIds && entry.songIds.includes(songId)
  );
}

// 2026-08-24追加：カテゴリを問わず、指定曲IDがsongIdsに含まれるガイド全件を返す。
// 曲専用口上（song-specific-koujou）だけでなく、ガチ恋キャンセルのように「koujou」カテゴリでも
// songIdsを持つようになったエントリを、曲別のコールガイドから辿れるようにするための関数
// （本人指示：「曲別のコールガイドからも辿れるようにしてください」）。
// findSongSpecificKoujou()は既存の呼び出し元・テストとの互換性のためカテゴリ限定のまま残す。
export function findSongRelatedGuideEntries(songId) {
  if (!songId) return [];
  return MIX_AND_KOUJOU_GUIDE.filter((entry) => entry.songIds && entry.songIds.includes(songId));
}

// 「まず覚える3つ」（recommendedPriority:"must-know"）を返す。
export function getMustKnowMixGuide() {
  return MIX_AND_KOUJOU_GUIDE.filter((entry) => entry.recommendedPriority === "must-know");
}

// MIX・口上タブのカテゴリ絞り込み。categoryId が null／"all" の場合は全件返す。
export function filterMixGuideByCategory(categoryId) {
  if (!categoryId || categoryId === "all") return MIX_AND_KOUJOU_GUIDE;
  return MIX_AND_KOUJOU_GUIDE.filter((entry) => entry.category === categoryId);
}

// sourceTypeごとに、情報の確からしさが伝わる短い一言を返す（本人指示どおり全種類で表示する。
// official=公式サイト・公式グループSNS・公式動画、self=メンバー本人のSNS・本人出演動画、
// reliable=音楽メディア等の報道、fan=ファンサイト・ファン動画・現場での定着情報、
// を明確に区別し、fan由来のものを「使用確認済み」のように断定しない）。
export function getSourceTypeNote(sourceType) {
  switch (sourceType) {
    case "official":
      return "公式情報・公式動画で確認";
    case "self":
      return "メンバー本人が発信";
    case "reliable":
      return "信頼できる媒体で確認";
    case "fan":
      return "ファンの間で使われている、またはライブで定着しているとされる情報です";
    default:
      return "出典が確認できていない情報です";
  }
}

// 考案／発信バッジの表示文言を組み立てる（例：「考案：大場花菜」）。
export function formatCreditLabel(credit) {
  return `${credit.creditType}：${credit.creditName}`;
}

export function findSongPenlightGuide(songId) {
  return SONG_PENLIGHT_GUIDE.find((entry) => entry.songId === songId) || null;
}

export function findSongCallCredits(songId) {
  return SONG_CALL_CREDITS.find((entry) => entry.songId === songId) || null;
}

// 2026-08-24追加：今設定されている推しメンバーの名前を返す（無ければnull）。
// 「ガチ恋口上の○○には何を入れるの？」という初心者の疑問に、可能であれば実際の推し名を
// 添えて答えるために使う。プロフィールデータの読み取りのみで、一切書き換えない
// （本人指示：「既存プロフィールデータを変更する必要はありません」）。
export function getCurrentOshiName() {
  const oshiMemberId = getMostOshiMemberId();
  if (!oshiMemberId) return null;
  const member = getMemberById(MEMBERS, oshiMemberId);
  return member ? member.name : null;
}

function buildColorChip(colorName, colorCode) {
  const chip = document.createElement("span");
  chip.className = "penlight-color-chip";
  const swatch = document.createElement("span");
  swatch.className = "penlight-color-swatch";
  swatch.style.backgroundColor = colorCode;
  swatch.setAttribute("aria-hidden", "true");
  chip.appendChild(swatch);
  chip.appendChild(document.createTextNode(colorName));
  return chip;
}

function buildCreditBadge(credit) {
  const badge = document.createElement("span");
  badge.className = "call-credit-badge";
  badge.textContent = formatCreditLabel(credit);
  return badge;
}

function buildSourceNote(sourceType) {
  const note = getSourceTypeNote(sourceType);
  if (!note) return null;
  const p = document.createElement("p");
  p.className = "penlight-source-note";
  p.textContent = note;
  return p;
}

// 出所バッジ（🔵公式情報／🩷メンバー発信／✨ファン定番等）を作る共通部品。
// 2026-08-24追加：曲指定コール・ペンライト指定曲タブでも、MIX・口上タブと同じ見た目の
// バッジを使えるようにするため、buildMixGuideCard内のインライン実装から切り出した。
function buildSourceBadge(sourceType) {
  const badge = document.createElement("span");
  badge.className = `mix-type-tag mix-type-tag-source-${sourceType}`;
  badge.textContent = formatSourceBadgeLabel(sourceType);
  return badge;
}

// ===== 初心者向けの用語説明（2026-08-24追加） =====
// 「MIXとは？口上とは？ガチ恋とは？ペンライト指定とは？」を1〜2文で説明する
// （本人指示：「専門用語を並べるだけにしないでください」）。
// DOM・IndexedDBに触れない純粋なデータのため、必要ならそのままテストできる。
export const CALL_GUIDE_GLOSSARY = [
  { term: "MIX", explanation: "サビ前後の間奏などで、みんなでタイミングを合わせて唱える定番の掛け声です。" },
  { term: "口上", explanation: "曲中の長めの間奏で唱える、決まった長さのセリフのようなコールです。" },
  { term: "ガチ恋", explanation: "推しメンバーへの気持ちを込めて呼びかける、口上の一種の呼び方です。" },
  { term: "ペンライト指定", explanation: "曲によって「この色で」と決まっている、またはファンの間で定着しているペンライトの色のことです。" },
];

function buildGlossarySection() {
  const container = document.createElement("div");
  container.className = "call-guide-glossary";
  CALL_GUIDE_GLOSSARY.forEach((item) => {
    const row = document.createElement("p");
    row.className = "call-guide-glossary-row";
    const term = document.createElement("strong");
    term.textContent = item.term;
    row.appendChild(term);
    row.appendChild(document.createTextNode(`：${item.explanation}`));
    container.appendChild(row);
  });
  return container;
}

function buildNotMandatoryBanner() {
  const banner = document.createElement("p");
  banner.className = "call-guide-not-mandatory-banner";
  banner.textContent = "コールは必須ではありません。分かるところだけ一緒に楽しめばOKです。";
  return banner;
}

// ===== タブ1: メンバーコール =====
function renderMemberCallTab(container) {
  container.innerHTML = "";
  const activeMembers = MEMBERS.filter((member) => member.status === MEMBER_STATUS.ACTIVE);

  const note = document.createElement("p");
  note.className = "penlight-source-note";
  note.textContent =
    "メンバーカラーは、公式商品や本人の発信、ライブでの使用状況などを参考にした色です。公演や楽曲によって異なる場合があります。";
  container.appendChild(note);

  const list = document.createElement("div");
  list.className = "member-call-guide-list";
  activeMembers.forEach((member) => {
    const row = document.createElement("div");
    row.className = "member-call-guide-row";

    const name = document.createElement("span");
    name.className = "member-call-guide-name";
    name.textContent = member.name;
    row.appendChild(name);

    const chips = document.createElement("span");
    chips.className = "member-call-guide-chips";
    member.penlightColors.forEach((color) => {
      chips.appendChild(buildColorChip(color.name, color.hex));
    });
    row.appendChild(chips);

    list.appendChild(row);
  });
  container.appendChild(list);
}

// ===== タブ2: 曲指定コール（考案・発信情報） =====
function renderSongCallTab(container, currentSongId) {
  container.innerHTML = "";

  const intro = document.createElement("p");
  intro.className = "penlight-source-note";
  intro.textContent =
    "メンバー本人が考えた・呼びかけたことが確認できているコールの一覧です（＝LOVE固有のコール）。バッジで出典の確からしさを示しています。";
  container.appendChild(intro);

  if (SONG_CALL_CREDITS.length === 0) {
    const empty = document.createElement("p");
    empty.className = "call-guide-empty-state";
    empty.textContent = "確認できている情報がまだありません。";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "song-call-guide-list";
  SONG_CALL_CREDITS.forEach((entry) => {
    const song = getSongById(entry.songId);
    if (!song) return;

    const row = document.createElement("div");
    row.className = "song-call-guide-row";
    row.classList.toggle("is-current-song", entry.songId === currentSongId);

    const title = document.createElement("span");
    title.className = "song-call-guide-title";
    title.textContent = song.title;
    row.appendChild(title);

    const badges = document.createElement("span");
    badges.className = "song-call-guide-badges";
    entry.credits.forEach((credit) => {
      badges.appendChild(buildCreditBadge(credit));
      badges.appendChild(buildSourceBadge(credit.sourceType));
    });
    row.appendChild(badges);

    // 考案／発信の確からしさ（本人発信／ファン定着など）も、他タブと同じ表現で必ず併記する。
    entry.credits.forEach((credit) => {
      const note = buildSourceNote(credit.sourceType);
      if (note) row.appendChild(note);
    });

    list.appendChild(row);
  });
  container.appendChild(list);
}

// ===== タブ3: ペンライト指定曲 =====
function renderSongColorTab(container, currentSongId) {
  container.innerHTML = "";

  const intro = document.createElement("p");
  intro.className = "penlight-source-note";
  intro.textContent =
    "曲によって色が決まっている、またはファンの間で定着しているペンライトカラーの一覧です。🔵公式指定・🩷メンバー発信・✨ファン定番を区別して表示しています。";
  container.appendChild(intro);

  if (SONG_PENLIGHT_GUIDE.length === 0) {
    const empty = document.createElement("p");
    empty.className = "call-guide-empty-state";
    empty.textContent = "確認できている情報がまだありません。";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "song-penlight-guide-list";
  SONG_PENLIGHT_GUIDE.forEach((entry) => {
    const song = getSongById(entry.songId);
    if (!song) return;

    const card = document.createElement("div");
    card.className = "song-penlight-guide-card";
    card.classList.toggle("is-current-song", entry.songId === currentSongId);

    const title = document.createElement("span");
    title.className = "song-penlight-guide-title";
    title.textContent = song.title;
    card.appendChild(title);

    card.appendChild(buildSourceBadge(entry.sourceType));

    const chips = document.createElement("span");
    chips.className = "song-penlight-guide-chips";
    entry.colors.forEach((color) => {
      const chip = buildColorChip(color.colorName, color.colorCode);
      if (color.position) {
        chip.appendChild(document.createTextNode(`（${color.position}）`));
      }
      chips.appendChild(chip);
    });
    card.appendChild(chips);

    if (entry.note) {
      const note = document.createElement("p");
      note.className = "mix-type-summary";
      note.textContent = entry.note;
      card.appendChild(note);
    }

    const sourceNote = buildSourceNote(entry.sourceType);
    if (sourceNote) card.appendChild(sourceNote);

    const relatedCredits = findSongCallCredits(entry.songId);
    if (relatedCredits) {
      const badges = document.createElement("span");
      badges.className = "song-call-guide-badges";
      relatedCredits.credits.forEach((credit) => badges.appendChild(buildCreditBadge(credit)));
      card.appendChild(badges);
    }

    list.appendChild(card);
  });
  container.appendChild(list);
}

// ===== タブ4: MIX・口上 =====

const MIX_CATEGORY_FILTERS = [
  { id: "all", label: "すべて" },
  { id: "mix", label: "基本MIX" },
  { id: "koujou", label: "口上" },
  { id: "song-specific-koujou", label: "曲専用口上" },
  { id: "special", label: "その他" },
];

// このタブ内だけで使う絞り込み状態。モーダルを開き直しても選択を保持する
// （タブを切り替えるたびに毎回「すべて」に戻ると使いにくいため）。
let activeMixCategoryFilter = "all";

// 掛け声本文の表示元を決める（2026-08-17追加）。
// 優先順位：①端末に読み込み済みのJSONデータ（本人が追加・更新したもの）
//         ②アプリに標準搭載された本文（entry.textLines、基本MIXのみ）
//         ③どちらも無ければ「読み込まれていません」の案内
// これにより、基本MIXはインストール直後から読める一方、既存ユーザーが端末に読み込んだ
// JSONデータ（上書き・追加）はそのまま尊重される（本人指示：「既存ユーザーのJSONデータを
// 消したり上書きしたりしないよう注意」）。
function resolveGuideTextSource(entry, localGuide) {
  if (localGuide && localGuide.textLines.length > 0) {
    return { textLines: localGuide.textLines, pronunciationLines: localGuide.pronunciationLines, segmentNote: localGuide.segmentNote };
  }
  if (entry.textLines.length > 0) {
    return { textLines: entry.textLines, pronunciationLines: entry.pronunciationLines, segmentNote: null };
  }
  return null;
}

function buildGuideTextSection(entry, localGuide) {
  const container = document.createDocumentFragment();
  const source = resolveGuideTextSource(entry, localGuide);

  if (source) {
    const heading = document.createElement("p");
    heading.className = "mix-type-text-heading";
    heading.textContent = "① 単語ごとに覚える";
    container.appendChild(heading);

    const list = document.createElement("ol");
    list.className = "mix-type-text-lines";
    source.textLines.forEach((line, index) => {
      const li = document.createElement("li");
      li.textContent = line;
      const reading = source.pronunciationLines[index];
      if (reading) {
        const rt = document.createElement("span");
        rt.className = "mix-type-text-reading";
        rt.textContent = `（${reading}）`;
        li.appendChild(rt);
      }
      list.appendChild(li);
    });
    container.appendChild(list);

    if (source.segmentNote) {
      const segment = document.createElement("p");
      segment.className = "mix-type-summary";
      segment.textContent = `区切り：${source.segmentNote}`;
      container.appendChild(segment);
    }

    // 2026-08-24追加：「①単語ごとに覚える」だけでなく「②実際に続けて唱える形」も
    // 併記する（本人指示：「単語は分かったけど、どういう順番で全部言うの？と
    // ならないUIにしてください」）。アプリ標準のcontinuousTextがある場合だけ表示する
    // （端末に読み込んだ独自データにはこのフィールドが無いため、その場合は①だけになる）。
    if (entry.continuousText) {
      const continuousHeading = document.createElement("p");
      continuousHeading.className = "mix-type-text-heading";
      continuousHeading.textContent = "② 実際に続けて唱えるとこうなる";
      container.appendChild(continuousHeading);

      const continuousLine = document.createElement("p");
      continuousLine.className = "mix-type-continuous-line";
      continuousLine.textContent = entry.continuousText;
      container.appendChild(continuousLine);

      if (entry.continuousNote) {
        const continuousNote = document.createElement("p");
        continuousNote.className = "mix-type-summary";
        continuousNote.textContent = entry.continuousNote;
        container.appendChild(continuousNote);
      }
    }
  } else {
    const notLoaded = document.createElement("p");
    notLoaded.className = "call-guide-empty-state";
    notLoaded.textContent = "掛け声本文は、この端末にまだ読み込まれていません。";
    container.appendChild(notLoaded);

    const guidance = document.createElement("p");
    guidance.className = "call-guide-empty-state";
    guidance.textContent = "データ管理からコールガイドJSONを読み込んでください。";
    container.appendChild(guidance);
  }

  return container;
}

function buildMixGuideCard(entry, isSongSpecificHighlight, localGuideMap) {
  const card = document.createElement("div");
  card.className = "mix-type-card";
  if (isSongSpecificHighlight) card.classList.add("is-current-song");

  const headerRow = document.createElement("div");
  headerRow.className = "mix-type-header-row";

  const label = document.createElement("span");
  label.className = "mix-type-label";
  label.textContent = entry.name;
  headerRow.appendChild(label);

  if (entry.category === "song-specific-koujou") {
    const songBadge = document.createElement("span");
    songBadge.className = "mix-type-song-specific-badge";
    songBadge.textContent = "この曲だけで使います";
    headerRow.appendChild(songBadge);
  }
  card.appendChild(headerRow);

  // バッジ行：難易度・使用頻度・出所（本人指示の「🌟メンバー考案／📣ライブ定番／
  // 🔰初心者おすすめ」のような、一目で分かる絵文字付きバッジ）を並べる（2026-08-17改訂）。
  const badgeRow = document.createElement("div");
  badgeRow.className = "mix-type-badge-row";
  const difficultyBadge = document.createElement("span");
  difficultyBadge.className = `mix-type-tag mix-type-tag-difficulty-${entry.difficulty}`;
  difficultyBadge.textContent = formatDifficultyLabel(entry.difficulty);
  badgeRow.appendChild(difficultyBadge);
  const frequencyBadge = document.createElement("span");
  frequencyBadge.className = "mix-type-tag";
  frequencyBadge.textContent = formatFrequencyLabel(entry.frequency);
  badgeRow.appendChild(frequencyBadge);
  badgeRow.appendChild(buildSourceBadge(entry.sourceType));
  card.appendChild(badgeRow);

  // 【2026-08-17改訂・本人指示】「掛け声→使われる場面→タイミング→ワンポイント」の順で
  // 視線が流れる、ライブ直前にスマホで見てすぐ覚えられる構成にする。
  card.appendChild(buildGuideTextSection(entry, localGuideMap?.get(entry.id) ?? null));

  if (entry.usageScene) {
    const scene = document.createElement("p");
    scene.className = "mix-type-summary";
    scene.textContent = `使われる場面：${entry.usageScene}`;
    card.appendChild(scene);
  }

  if (entry.startCue) {
    const cue = document.createElement("p");
    cue.className = "mix-type-summary";
    cue.textContent = `始めるタイミング：${entry.startCue}`;
    card.appendChild(cue);
  }

  // 2026-08-24追加：「○○」には何を入れるのか、という初心者の疑問への説明。
  // 可能であれば、今設定されている推しメンバーの名前を添える（本人指示）。
  if (entry.placeholderNote) {
    const placeholder = document.createElement("p");
    placeholder.className = "mix-type-beginner-tip";
    const oshiName = getCurrentOshiName();
    placeholder.textContent = oshiName
      ? `💡 ${entry.placeholderNote}（今の推し設定：${oshiName}さん）`
      : `💡 ${entry.placeholderNote}`;
    card.appendChild(placeholder);
  }

  if (entry.beginnerNote) {
    const tip = document.createElement("p");
    tip.className = "mix-type-beginner-tip";
    tip.textContent = `💡 ワンポイント：${entry.beginnerNote}`;
    card.appendChild(tip);
  }

  if (entry.differenceFromStandard) {
    const diff = document.createElement("p");
    diff.className = "mix-type-summary";
    diff.textContent = entry.differenceFromStandard;
    card.appendChild(diff);
  }

  if (entry.creditNote) {
    const credit = document.createElement("p");
    credit.className = "mix-type-summary";
    credit.textContent = entry.creditNote;
    card.appendChild(credit);
  }

  if (entry.usageNote) {
    const note = document.createElement("p");
    note.className = "mix-type-summary";
    note.textContent = entry.usageNote;
    card.appendChild(note);
  }

  const sourceNote = buildSourceNote(entry.sourceType);
  if (sourceNote) card.appendChild(sourceNote);

  const usedNote = formatUsedInEqualLoveNote(entry.usedInEqualLove);
  if (usedNote) {
    const p = document.createElement("p");
    p.className = "penlight-source-note";
    p.textContent = usedNote;
    card.appendChild(p);
  }

  return card;
}

// 端末に保存されているコールガイド本文（js/callGuideStorage.js）を、guideIdで引けるMapにする。
async function loadLocalGuideMap() {
  const records = await getAllCallGuideData();
  return new Map(records.map((record) => [record.guideId, record]));
}

async function renderMixTab(container, currentSongId) {
  container.innerHTML = "";
  const localGuideMap = await loadLocalGuideMap();

  // 2026-08-24追加：初心者向けの前置き（用語説明＋「コールは必須ではない」）。
  container.appendChild(buildNotMandatoryBanner());
  container.appendChild(buildGlossarySection());

  const venueNote = document.createElement("p");
  venueNote.className = "penlight-source-note";
  venueNote.textContent =
    "多くはファン文化として定着したもので、公式が定めたものではありません。会場や公演によって使用状況が異なる場合があるため、当日の案内や周囲への配慮を優先してください。";
  container.appendChild(venueNote);

  const songSpecificEntries = findSongRelatedGuideEntries(currentSongId);
  if (songSpecificEntries.length > 0) {
    const banner = document.createElement("p");
    banner.className = "mix-song-specific-banner";
    banner.textContent = "この曲に関連するコールがあります";
    container.appendChild(banner);
    songSpecificEntries.forEach((entry) => container.appendChild(buildMixGuideCard(entry, true, localGuideMap)));
  }

  const mustKnowEntries = getMustKnowMixGuide();
  if (mustKnowEntries.length > 0) {
    const heading = document.createElement("p");
    heading.className = "mix-must-know-heading";
    heading.textContent = "① まず覚えたいMIX";
    container.appendChild(heading);
    const heroList = document.createElement("div");
    heroList.className = "mix-type-list";
    mustKnowEntries.forEach((entry) => heroList.appendChild(buildMixGuideCard(entry, false, localGuideMap)));
    container.appendChild(heroList);
  }

  const filterRow = document.createElement("div");
  filterRow.className = "mix-category-filter-row";
  MIX_CATEGORY_FILTERS.forEach((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mix-category-filter-button";
    button.classList.toggle("is-active", filter.id === activeMixCategoryFilter);
    button.textContent = filter.label;
    button.addEventListener("click", () => {
      activeMixCategoryFilter = filter.id;
      renderMixTab(container, currentSongId);
    });
    filterRow.appendChild(button);
  });
  container.appendChild(filterRow);

  const filteredEntries = filterMixGuideByCategory(activeMixCategoryFilter);
  const list = document.createElement("div");
  list.className = "mix-type-list";
  filteredEntries.forEach((entry) => {
    list.appendChild(buildMixGuideCard(entry, false, localGuideMap));
  });
  container.appendChild(list);
}

const TAB_RENDERERS = {
  member: renderMemberCallTab,
  songCall: renderSongCallTab,
  songColor: renderSongColorTab,
  mix: renderMixTab,
};

// tabPanels: { member, songCall, songColor, mix } の各タブ中身コンテナ。
// currentSongId：ライブコールモード再生画面で今開いている曲（曲一覧から開いた場合はnull）。
// 曲指定コール／ペンライト指定曲タブで、今の曲の行に.is-current-songを付けて目立たせる。
// mixタブはjs/callGuideStorage.js（IndexedDB）からの読み込みを伴うため非同期。
export async function renderCallGuideTab(tabId, tabPanels, currentSongId) {
  const renderer = TAB_RENDERERS[tabId];
  const panel = tabPanels[tabId];
  if (!renderer || !panel) return;
  await renderer(panel, currentSongId);
}
