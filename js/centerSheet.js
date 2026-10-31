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
//   ・センターの判定（単独／2人／全員／歌唱メンバー／未確認）は、センター表と同じ describeCenterTableCell の結果をそのまま使う
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

// センターのマスの中身（色の帯）。1人＝1色、2人＝2色に分ける。
//   tone：members（センター）／singers（センターの区別が無いユニット曲の歌唱メンバー）／all（全員）／none（なし）／unknown（未確認）
//   swatches：[{ name, hex, textColor }]（members・singers のときだけ。色はメンバーの memberColor）
export function describeSheetCell(cell, memberByName) {
  if (cell.type === "members" || cell.type === "singers") {
    const swatches = cell.names.map((name) => {
      const hex = memberByName.get(name)?.memberColor?.hex ?? "#eeeeee";
      return { name, hex, textColor: pickReadableTextColor(hex).color };
    });
    return { tone: cell.type, swatches, names: cell.names.slice() };
  }
  return { tone: cell.type, swatches: [], names: [] };
}

function toSheetEntry(entry, group, memberByName) {
  return {
    song: entry.song,
    workId: group.workId,
    tag: group.kind === "digital" || group.kind === "other" ? OTHER_ROW_TAGS[group.kind] : null,
    cell: describeSheetCell(entry.cell, memberByName),
  };
}

// 1枚表のデータを作る。
// 戻り値：{ rows: [row], legend: [{ name, hex, textColor, isGraduated, centerCount, singerCount }], lineCount }
//   row = { key, kind（single／album／other）, label（"1st"・"アルバム"・"他"）, subLabel（アルバム名など。無ければ null）,
//           workTitle, releaseDate, workIds, lineCount, columns: { title: [sheetEntry], group: [...], unit: [...] } }
//   sheetEntry = { song, workId, tag（"配信"・"特別" または null）, cell: describeSheetCell の結果 }
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
      columns[key] = group.columns[key].map((entry) => toSheetEntry(entry, group, memberByName));
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
        .map(({ entry, group }) => toSheetEntry(entry, group, memberByName));
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

  return { rows, legend, lineCount: rows.reduce((sum, row) => sum + row.lineCount, 0) };
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
