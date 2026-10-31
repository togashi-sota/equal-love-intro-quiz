// 歴代センターの「1枚表」（2026-11-01 R8・本人の依頼 3 で新設）のための、画面に依存しない計算だけを集めたファイル。
// DOM を触らないので、tests.html から直接テストできる（tests/centerSheet.test.js）。
//
// 本人の参考画像（紙のセンター表）の形：
//   ・縦＝ 1st〜（最新の）シングル と アルバム と「他」（配信限定・特別曲）
//   ・横＝ 表題曲／全員曲／ユニット曲。それぞれ「曲名」と「センター（メンバーカラーの地にメンバー名）」の2マス
//   ・センターが2人なら、センターのマスを2色に分ける
// 画像を写すのではなく、js/centerTable.js の buildCenterTableModel（songs.js から作る作品ごとの表）を並べ替えて作る。
// そのため、22nd の曲を songs.js に足せば、1枚表にも自動で行が増える。
//
// 既存の「センター表」（js/centerTable.js）との違い：
//   ・アルバムを、シングルの間の発売順の位置（8th と 9th の間）に置く（参考画像と同じ）
//   ・配信限定シングル（4作）と特別曲（866）は、1行の「他」にまとめる（曲名の横に「配信」「特別」の小さな札）
//   ・センターの判定（単独／2人／全員／歌唱メンバー／未確認）は、センター表と同じ describeCenterTableCell の結果から始める
//
// 【2026-11-01 R8 本人の決定】センターが決まっていない曲（「全員」の曲・センターの区別の無いユニット曲・どこが好きか言って など）は、
// 1枚表では「その曲を歌っている全員」をセンターとして扱い、全員分の色で出す（resolveSingingMembers）。
//   ・歌う人は、アプリのデータだけで決める：songs.js の members（ユニットのメンバー）があればそれ。
//     無ければ（グループ全員の曲）、発売日に在籍していたメンバー（members.js の joinDate〜graduationDate）。
//   ・在籍が決められない人がいる（加入日が無く、卒業日が発売日より後）ときは推測で足さず、今までの表示のまま残す（866 が該当）。
//   ・この扱いは 1枚表だけ。一覧カード・センター表・songs.js のセンターのデータは変えない。
import { MEMBERS } from "./data/members.js";
import { buildCenterTableModel, CENTER_TABLE_COLUMNS } from "./centerTable.js";
import { pickReadableTextColor } from "./centerChart.js";

// 表の寸法（px、拡大・縮小する前の大きさ）。css/centerSheet.css の値と同じにする（変えるときは両方）。
// 文字の大きさは 12px が基準。曲名が長いマスだけ、マスに収まるよう小さくする（fitSheetFontSize）。
export const CENTER_SHEET_SIZE = {
  labelWidth: 56, // 左端の「1st」などの列
  songWidth: 168, // 曲名の列
  centerWidth: 150, // センターの列
  lineHeight: 20, // 1曲ぶんの高さ
  headHeight: 24, // 列の見出し（表題曲・全員曲・ユニット曲）
  captionHeight: 30, // 表の題名
  legendLineHeight: 22, // 凡例1行ぶん
  baseFontSize: 12,
  minFontSize: 7,
};

// 「他」の行で、曲名の横に付ける札（作品の種類）
const OTHER_ROW_TAGS = { digital: "配信", other: "特別" };

// 曲名をマスの幅に収める文字の大きさ（px）。全角1文字＝1、半角1文字＝0.56 として幅を見積もる。
// 基準（12px）より大きくはしない。最小は 7px（それより長い曲名は、画面の CSS で「…」で切る）。
export function fitSheetFontSize(text, boxWidth, { base = CENTER_SHEET_SIZE.baseFontSize, min = CENTER_SHEET_SIZE.minFontSize } = {}) {
  const units = [...String(text ?? "")].reduce((sum, char) => sum + (/[\u0000-\u00ff]/.test(char) ? 0.56 : 1), 0);
  if (units <= 0) return base;
  const fitted = Math.floor((boxWidth / units) * 10) / 10;
  return Math.max(min, Math.min(base, fitted));
}

// 発売日（date）に在籍していたメンバー。members.js の加入日・卒業日だけで決める。
// 加入日が無く、卒業日も発売日より前ではない人がいると、在籍していたかどうか決められないので isCertain: false
export function membersAtDate(members, date) {
  if (!date) return { names: [], isCertain: false, unknownNames: [] };
  const names = [];
  const unknownNames = [];
  members.forEach((member) => {
    const graduated = member.graduationDate && member.graduationDate <= date;
    if (graduated) return;
    if (member.joinDate && member.joinDate <= date) names.push(member.name);
    else if (!member.joinDate) unknownNames.push(member.name);
    // 加入日が発売日より後の人は数えない
  });
  return { names, isCertain: unknownNames.length === 0 && names.length > 0, unknownNames };
}

// センターが決まっていない曲の「歌っている全員」（本人の決定。上の説明を参照）。
// 戻り値：{ names, basis: "unit"（songs.js の members）｜"group"（発売日の在籍メンバー） } または null（データで決められない）
export function resolveSingingMembers(song, members = MEMBERS) {
  if (Array.isArray(song.members) && song.members.length > 0) return { names: song.members.slice(), basis: "unit" };
  if (song.category === "表題曲" || song.category === "全員曲") {
    const atDate = membersAtDate(members, song.releaseDate);
    return atDate.isCertain ? { names: atDate.names, basis: "group" } : null;
  }
  return null;
}

// センターのマスの中身（色の帯）。1人＝1色、2人＝2色、3人以上＝細い色の帯を並べて短い名前（「全員」「4人」）。
//   tone：members（センター）／all（全員・データで歌う人を決められない曲）／none（なし）／unknown（未確認）
//         singers（センターの区別が無い曲。resolve を使わないときだけ。1枚表では members にする）
//   swatches：[{ name, hex, textColor }]（色はメンバーの memberColor）
//   basis：center（songs.js のセンター）／unit（センターが決まっていないので、ユニットの全員）／group（発売日の在籍メンバー全員）
//   shortLabel：3人以上のときにマスに出す短い名前（group＝「全員」、unit＝「4人」など）。2人以下は null（名前を出す）
export function describeSheetCell(cell, memberByName, { song = null, members = null } = {}) {
  const toSwatches = (names) =>
    names.map((name) => {
      const hex = memberByName.get(name)?.memberColor?.hex ?? "#eeeeee";
      return { name, hex, textColor: pickReadableTextColor(hex).color };
    });
  if (cell.type === "members") {
    return { tone: "members", swatches: toSwatches(cell.names), names: cell.names.slice(), basis: "center", shortLabel: cell.names.length >= 3 ? `${cell.names.length}人` : null };
  }
  const resolved = song && members ? resolveSingingMembers(song, members) : null;
  if (resolved) {
    const shortLabel = resolved.names.length >= 3 ? (resolved.basis === "group" ? "全員" : `${resolved.names.length}人`) : null;
    return { tone: "members", swatches: toSwatches(resolved.names), names: resolved.names.slice(), basis: resolved.basis, shortLabel };
  }
  if (cell.type === "singers") {
    return { tone: "singers", swatches: toSwatches(cell.names), names: cell.names.slice(), basis: "unit", shortLabel: null };
  }
  return { tone: cell.type, swatches: [], names: [], basis: null, shortLabel: null };
}

function toSheetEntry(entry, group, memberByName, members) {
  return {
    song: entry.song,
    workId: group.workId,
    tag: group.kind === "digital" || group.kind === "other" ? OTHER_ROW_TAGS[group.kind] : null,
    cell: describeSheetCell(entry.cell, memberByName, { song: entry.song, members }),
  };
}

// 1枚表のデータを作る。
// 戻り値：{ rows: [row], legend: [{ name, hex, textColor, isGraduated, centerCount, singerCount }], lineCount }
//   row = { key, kind（single／album／other）, label（"1st"・"アルバム"・"他"）, subLabel（アルバム名など。無ければ null）,
//           workTitle, releaseDate, workIds, lineCount, columns: { title: [sheetEntry], group: [...], unit: [...] } }
//   sheetEntry = { song, workId, tag（"配信"・"特別" または null）, cell: describeSheetCell の結果 }
//   unresolved = センターが決まっておらず、歌う人もデータで決められなかった曲（今までの表示のまま。報告用）
export function buildCenterSheetModel(songs, { discography = [], members = MEMBERS } = {}) {
  const memberByName = new Map(members.map((member) => [member.name, member]));
  const tableModel = buildCenterTableModel(songs, { discography });

  // シングルとアルバムは、発売日の順に1作品＝1行（アルバムは 8th と 9th の間に入る）
  const mainGroups = tableModel.groups
    .filter((group) => group.kind === "single" || group.kind === "album")
    .slice()
    .sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999") || a.workId.localeCompare(b.workId));

  const rows = mainGroups.map((group) => {
    const columns = {};
    CENTER_TABLE_COLUMNS.forEach(({ key }) => {
      columns[key] = group.columns[key].map((entry) => toSheetEntry(entry, group, memberByName, members));
    });
    const isAlbum = group.kind === "album";
    return {
      key: group.workId,
      kind: group.kind,
      label: isAlbum ? "アルバム" : group.badge,
      subLabel: isAlbum ? group.workTitle : null,
      workTitle: group.workTitle,
      releaseDate: group.releaseDate,
      workIds: [group.workId],
      lineCount: Math.max(group.lineCount, 1),
      columns,
    };
  });

  // 配信限定・特別曲は「他」の1行にまとめる（それぞれの列の中は発売日の順）
  const otherGroups = tableModel.groups.filter((group) => group.kind === "digital" || group.kind === "other");
  if (otherGroups.length > 0) {
    const columns = {};
    CENTER_TABLE_COLUMNS.forEach(({ key }) => {
      columns[key] = otherGroups
        .flatMap((group) => group.columns[key].map((entry) => ({ entry, group })))
        .sort((a, b) => (a.entry.song.releaseDate ?? "9999").localeCompare(b.entry.song.releaseDate ?? "9999"))
        .map(({ entry, group }) => toSheetEntry(entry, group, memberByName, members));
    });
    rows.push({
      key: "other",
      kind: "other",
      label: "他",
      subLabel: "配信・特別",
      workTitle: "配信限定・特別曲",
      releaseDate: null,
      workIds: otherGroups.map((group) => group.workId),
      lineCount: Math.max(1, ...CENTER_TABLE_COLUMNS.map(({ key }) => columns[key].length)),
      columns,
    });
  }

  // 凡例：表に出てくるメンバーだけを、members.js の並び（現役→卒業）で
  const counts = new Map();
  rows.forEach((row) =>
    CENTER_TABLE_COLUMNS.forEach(({ key }) =>
      row.columns[key].forEach((entry) =>
        entry.cell.names.forEach((name) => {
          const count = counts.get(name) ?? { centerCount: 0, singerCount: 0 };
          if (entry.cell.tone === "members") count.centerCount += 1;
          else count.singerCount += 1;
          counts.set(name, count);
        })
      )
    )
  );
  const legend = members
    .filter((member) => counts.has(member.name))
    .map((member) => {
      const hex = member.memberColor?.hex ?? "#eeeeee";
      return {
        name: member.name,
        hex,
        textColor: pickReadableTextColor(hex).color,
        isGraduated: member.status !== "active",
        ...counts.get(member.name),
      };
    });

  const unresolved = rows.flatMap((row) =>
    CENTER_TABLE_COLUMNS.flatMap(({ key }) => row.columns[key].filter((entry) => entry.cell.tone !== "members").map((entry) => entry.song))
  );
  return { rows, legend, unresolved, lineCount: rows.reduce((sum, row) => sum + row.lineCount, 0) };
}

// 行を2段（左右）に分ける：行（作品）の途中では切らず、左右の曲の行数がなるべく同じになる所で分ける。
// 戻り値：[左の行の配列, 右の行の配列]（行の順番は変えない）
export function splitSheetRows(rows) {
  const total = rows.reduce((sum, row) => sum + row.lineCount, 0);
  let best = { index: rows.length, diff: Infinity };
  let left = 0;
  for (let index = 1; index < rows.length; index += 1) {
    left += rows[index - 1].lineCount;
    const diff = Math.abs(total - left - left);
    if (diff < best.diff) best = { index, diff };
  }
  return [rows.slice(0, best.index), rows.slice(best.index)];
}

// 表の大きさ（拡大・縮小する前、px）の見積もり。columnsCount：1段なら1、2段なら2
export function estimateSheetSize(lineCountPerColumn, columnsCount, legendLines, size = CENTER_SHEET_SIZE) {
  const tableWidth = size.labelWidth + CENTER_TABLE_COLUMNS.length * (size.songWidth + size.centerWidth);
  const gap = 16;
  return {
    width: tableWidth * columnsCount + gap * (columnsCount - 1),
    height: size.captionHeight + size.headHeight + lineCountPerColumn * size.lineHeight + legendLines * size.legendLineHeight + 8,
  };
}

// 1段／2段のうち、画面（available：{ width, height }）に全体を入れたときに大きく見える（倍率が大きい）ほうを選ぶ。
// 倍率は maxScale（既定 1.4）より大きくしない。
//   model：buildCenterSheetModel の結果
//   戻り値：{ layout: "single" | "double", scale, size: { width, height } }
export function pickSheetLayout(model, available, { maxScale = 1.4, size = CENTER_SHEET_SIZE } = {}) {
  const legendLinesFor = (columnsCount) => {
    // 凡例は1人 ≒ 92px、記号の説明 ≒ 3 × 170px として、表の幅に何行で入るかを見積もる
    const width = estimateSheetSize(0, columnsCount, 0, size).width;
    const needed = model.legend.length * 92 + 3 * 170;
    return Math.max(1, Math.ceil(needed / width));
  };
  const [left, right] = splitSheetRows(model.rows);
  const sumLines = (rows) => rows.reduce((sum, row) => sum + row.lineCount, 0);
  const candidates = [
    { layout: "single", size: estimateSheetSize(model.lineCount, 1, legendLinesFor(1), size) },
    { layout: "double", size: estimateSheetSize(Math.max(sumLines(left), sumLines(right)), 2, legendLinesFor(2), size) },
  ].map((candidate) => ({
    ...candidate,
    scale: Math.min(maxScale, available.width / candidate.size.width, available.height / candidate.size.height),
  }));
  // 同じくらい（差が 3% 未満）なら、読み順が素直な1段を選ぶ
  const [single, double] = candidates;
  return double.scale > single.scale * 1.03 ? double : single;
}

// 実際に描いた表の大きさ（natural）を、画面（available）に収める倍率
export function fitSheetScale(natural, available, maxScale = 1.4) {
  if (!natural.width || !natural.height) return 1;
  return Math.max(0.05, Math.min(maxScale, available.width / natural.width, available.height / natural.height));
}
