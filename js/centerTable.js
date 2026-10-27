// 歴代センター一覧の「センター表」表示（2026-10-28新設）のための、画面に依存しない計算だけを集めたファイル。
// DOM を触らないので、tests.html から直接テストできる（tests/centersAndSetlists.test.js）。
//
// 表の形（本人の参考画像の「行＝シングル、列＝表題曲／全員曲／ユニット曲とそれぞれのセンター」を、
// 画像を写すのではなく songs.js のデータから毎回組み立てる）：
//   ・1作品（シングル1枚・アルバム1枚・配信シングル1曲・特別曲）＝ 表の1グループ
//   ・グループは「シングル → アルバム → 配信限定 → その他」の区分ごとに、発売順に並べる
//   ・列は 表題曲 / 全員曲（シングルではカップリング）/ ユニット曲 の3つ。1つのマスに複数の曲があれば縦に積む
// 作品の一覧は songs.js の workId から作るので、新しいシングルの曲を songs.js に足せば表にも自動で出る。
import { CATEGORY } from "./data/songs.js";
import { CENTER_SOURCES } from "./data/centerSources.js";
import { classifyCenter, describeWork } from "./centerChart.js";

// 表の列（並び順どおり）。label は列見出し、centerLabel は隣の「センター」列の見出し。
export const CENTER_TABLE_COLUMNS = [
  { key: "title", label: "表題曲" },
  { key: "group", label: "全員曲" },
  { key: "unit", label: "ユニット曲" },
];

// 作品の区分（表の中の見出し）と並び順
export const CENTER_TABLE_SECTIONS = [
  { kind: "single", label: "シングル" },
  { kind: "album", label: "アルバム" },
  { kind: "digital", label: "配信限定シングル" },
  { kind: "other", label: "その他" },
];

// 曲のカテゴリから列を決める。Overture のような特別収録曲は表に出さない（null）。
export function pickCenterTableColumn(song) {
  if (song.category === CATEGORY.TITLE_TRACK) return "title";
  if (song.category === CATEGORY.GROUP_SONG) return "group";
  if (song.category === CATEGORY.UNIT_SONG) return "unit";
  return null;
}

// 1曲ぶんの「センター欄に何を出すか」。
//   members … センターのメンバー（1人＝単独、2人以上＝Wセンター等。メンバーカラーのマスで出す）
//   all     … 全員（特定のメンバーの色を使わない共通の表示）
//   singers … センターの区別が無いユニット曲（ソロ・2人の曲など）。センターと見間違えないよう、歌唱メンバーとして小さく出す
//   none    … センターなし（資料で確認済み）
//   unknown … センター未確認
export function describeCenterTableCell(song, center) {
  switch (center.state) {
    case "single":
    case "double":
      return { type: "members", names: center.centerNames };
    case "all":
      return { type: "all", names: [] };
    case "none":
      return center.isConfirmed ? { type: "none", names: [] } : { type: "unknown", names: [] };
    case "solo":
    case "duo":
      return { type: "singers", names: Array.isArray(song.members) ? song.members : [] };
    default:
      // 3人以上のユニット曲でセンターが未入力のときは、歌唱メンバーが分かればそれを出す
      if (Array.isArray(song.members) && song.members.length > 0) return { type: "singers", names: song.members };
      return { type: "unknown", names: [] };
  }
}

// 作品名：songs.js の single 欄（例：1stシングル「＝LOVE」収録）の「」の中。無ければ表題曲（無ければ先頭の曲）の曲名
function pickWorkTitle(workSongs) {
  for (const song of workSongs) {
    const match = /「(.+)」/.exec(song.single ?? "");
    if (match) return match[1];
  }
  const titleSong = workSongs.find((song) => song.category === CATEGORY.TITLE_TRACK) ?? workSongs[0];
  return titleSong?.title ?? "";
}

// 区分の左端に大きく出す短い番号（"21st" "1st" など）と、その下の小さな種類名
function describeWorkBadge(workId, kind) {
  const work = describeWork(workId);
  const ordinal = /^(\d+(?:st|nd|rd|th))/.exec(work.label)?.[1] ?? null;
  if (kind === "single") return { badge: ordinal ?? "—", badgeNote: "シングル" };
  if (kind === "album") return { badge: ordinal ?? "—", badgeNote: "アルバム" };
  if (kind === "digital") return { badge: "配信", badgeNote: "配信限定" };
  return { badge: "他", badgeNote: work.kind === "special" ? "特別曲" : "その他" };
}

// 作品の種類：discography.js（あれば）の type を優先し、無ければ workId の頭（single- 等）から決める
function resolveWorkKind(workId, discographyTypeById) {
  const type = discographyTypeById.get(workId) ?? describeWork(workId).kind;
  return ["single", "album", "digital"].includes(type) ? type : "other";
}

// センター表のもとになるデータを組み立てる（画面はこれをそのまま描くだけ）。
// songs：SONGS、options.sources：CENTER_SOURCES、options.discography：DISCOGRAPHY（省略可）
// 戻り値：{ sections: [{ kind, label, groups: [group] }], groups: [group]（全グループを表の並び順で） }
//   group = { workId, kind, badge, badgeNote, workTitle, releaseDate, lineCount, columns: { title: [entry], group: [entry], unit: [entry] } }
//   entry = { song, center（classifyCenter の結果）, cell（describeCenterTableCell の結果） }
export function buildCenterTableModel(songs, { sources = CENTER_SOURCES, discography = [] } = {}) {
  const discographyTypeById = new Map(discography.map((entry) => [entry.workId, entry.type]));
  const songsByWork = new Map();
  songs.forEach((song, index) => {
    if (!song.workId || !pickCenterTableColumn(song)) return;
    if (!songsByWork.has(song.workId)) songsByWork.set(song.workId, []);
    songsByWork.get(song.workId).push({ song, index });
  });

  const groups = [...songsByWork.entries()].map(([workId, items]) => {
    const kind = resolveWorkKind(workId, discographyTypeById);
    // 作品の中は songs.js に書かれた順（表題曲が2曲ある 18th のような作品も、その順のまま）
    const workSongs = items.sort((a, b) => a.index - b.index).map((item) => item.song);
    const columns = { title: [], group: [], unit: [] };
    workSongs.forEach((song) => {
      const center = classifyCenter(song, sources);
      columns[pickCenterTableColumn(song)].push({ song, center, cell: describeCenterTableCell(song, center) });
    });
    const releaseDate = workSongs.map((song) => song.releaseDate ?? "").filter(Boolean).sort()[0] ?? null;
    return {
      workId,
      kind,
      ...describeWorkBadge(workId, kind),
      workTitle: pickWorkTitle(workSongs),
      releaseDate,
      lineCount: Math.max(columns.title.length, columns.group.length, columns.unit.length),
      columns,
    };
  });

  // 発売日の古い順（同じ日なら workId 順）。日付の無い作品は最後へ
  groups.sort((a, b) => {
    const dateA = a.releaseDate ?? "9999";
    const dateB = b.releaseDate ?? "9999";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.workId.localeCompare(b.workId);
  });

  const sections = CENTER_TABLE_SECTIONS.map((section) => ({
    ...section,
    groups: groups.filter((group) => group.kind === section.kind),
  })).filter((section) => section.groups.length > 0);
  return { sections, groups: sections.flatMap((section) => section.groups) };
}

// 1曲がメンバー・曲名の条件に合うか。
//   memberName：センターに含む（一覧カードと同じ基準。センターの区別が無い曲の「歌唱メンバー」は数えない）
//   query：曲名・読み仮名の一部（normalize で、カタカナ⇔ひらがな等の違いを吸収する）
export function centerTableEntryMatches(entry, { memberName = null, query = "", normalize = (text) => text } = {}) {
  if (memberName && !(entry.cell.type === "members" && entry.cell.names.includes(memberName))) return false;
  const normalizedQuery = normalize(String(query ?? "").trim());
  if (normalizedQuery) {
    const haystacks = [entry.song.title, entry.song.searchReading ?? ""].map((text) => normalize(text));
    if (!haystacks.some((text) => text.includes(normalizedQuery))) return false;
  }
  return true;
}

// 絞り込み：条件に合う曲が1曲も無い作品（行のまとまり）は表から外し、
// 残した作品の中で条件に合わない曲には isDimmed を付ける（作品の並び・ほかの曲は見えたまま、該当曲だけ目立たせる）。
// 条件が空なら、すべての曲をそのまま返す（isDimmed はすべて false）。
export function filterCenterTableModel(model, filters = {}) {
  const hasFilter = Boolean(filters.memberName) || String(filters.query ?? "").trim() !== "";
  const sections = model.sections
    .map((section) => {
      const groups = section.groups
        .map((group) => {
          const columns = {};
          let matchCount = 0;
          Object.entries(group.columns).forEach(([key, entries]) => {
            columns[key] = entries.map((entry) => {
              const isMatch = !hasFilter || centerTableEntryMatches(entry, filters);
              if (isMatch) matchCount += 1;
              return { ...entry, isDimmed: !isMatch };
            });
          });
          return { ...group, columns, matchCount };
        })
        .filter((group) => group.matchCount > 0);
      return { ...section, groups };
    })
    .filter((section) => section.groups.length > 0);
  return { sections, groups: sections.flatMap((section) => section.groups) };
}
