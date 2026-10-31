// 「テレビ出演（バラエティ・情報番組）」の絞り込み・検索・並べ方を決める純粋関数（2026-11-01新設・本人の依頼）。
// DOM に触れない（tests/tvVariety.test.js で確かめる）。データは js/data/tvVariety.js（自動で作るファイル）。
// 歌の披露は「音楽番組」のページ（tvAppearanceModel.js）の担当で、ここでは扱わない。
import { normalizeSearchText } from "./searchNormalize.js";

// 出演の形。group は「告知に個人名が無い出演」で、全員が出たとは限らない
export const TV_VARIETY_FORMS = [
  { id: "all", label: "全部" },
  { id: "group", label: "＝LOVE 名義" },
  { id: "solo", label: "個人" },
  { id: "multiple", label: "複数人" },
];
export const TV_VARIETY_FORM_LABELS = { group: "＝LOVE 名義", solo: "個人", multiple: "複数人" };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function yearOf(record) {
  return String(record?.date ?? "").slice(0, 4);
}

// 「2026年10月27日（火）」。連日の告知をまとめた回は「〜11月22日」まで
export function formatTvVarietyDate(record) {
  const format = (text, withYear) => {
    const [year, month, day] = String(text).split("-").map(Number);
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return `${withYear ? `${year}年` : ""}${month}月${day}日（${weekday}）`;
  };
  if (!record?.date) return "";
  const start = format(record.date, true);
  if (!record.dateEnd || record.dateEnd === record.date) return start;
  return `${start}〜${format(record.dateEnd, record.dateEnd.slice(0, 4) !== record.date.slice(0, 4))}`;
}

// 「2020年9月〜2026年3月」（レギュラー番組の、公式の告知があった期間）
export function formatRegularPeriod(regular) {
  const format = (text) => {
    const [year, month] = String(text ?? "").split("-").map(Number);
    return year && month ? `${year}年${month}月` : "";
  };
  const start = format(regular?.firstDate);
  const end = format(regular?.lastDate);
  if (!start) return "";
  return start === end ? start : `${start}〜${end}`;
}

// 「ヴ」の書き方の揺れを揃える（「ラヴィット」を「らびっと」「ラビット」でも見つけられるように）。この画面の検索だけで使う
const VU_FOLDS = [["ゔぁ", "ば"], ["ゔぃ", "び"], ["ゔぇ", "べ"], ["ゔぉ", "ぼ"], ["ゔ", "ぶ"]];
function normalizeTvVarietyText(text) {
  return VU_FOLDS.reduce((result, [from, to]) => result.split(from).join(to), normalizeSearchText(text));
}

// 番組名の検索に使う文字（番組名と放送局。かな・カナ・全角・半角の違いは normalizeSearchText で揃える）
export function tvVarietySearchText(record) {
  return normalizeTvVarietyText(`${record?.program ?? ""} ${record?.station ?? ""}`);
}

function splitQuery(query) {
  return String(query ?? "").split(/[\s　]+/).map(normalizeTvVarietyText).filter(Boolean);
}

// 絞り込みの条件の初めの値
export const TV_VARIETY_DEFAULT_FILTER = Object.freeze({
  form: "all",
  memberId: "all",
  year: "all",
  station: "all",
  query: "",
  includeComment: true,
  includeStreaming: true,
});

// 条件で絞り込む。query は空白区切りの言葉（すべてを含む回だけ）
export function filterTvVariety(records, filter = {}) {
  const f = { ...TV_VARIETY_DEFAULT_FILTER, ...filter };
  const words = splitQuery(f.query);
  return (records ?? []).filter((record) => {
    if (f.form !== "all" && record.form !== f.form) return false;
    if (f.memberId !== "all" && !(record.memberIds ?? []).includes(f.memberId)) return false;
    if (f.year !== "all" && yearOf(record) !== String(f.year)) return false;
    if (f.station !== "all" && record.stationFilter !== f.station) return false;
    if (!f.includeComment && record.commentOnly) return false;
    if (!f.includeStreaming && record.streaming) return false;
    if (!words.length) return true;
    const text = tvVarietySearchText(record);
    return words.every((word) => text.includes(word));
  });
}

// 条件が初めのままか（「条件を戻す」を出すかどうか）
export function isDefaultTvVarietyFilter(filter = {}) {
  const f = { ...TV_VARIETY_DEFAULT_FILTER, ...filter };
  return Object.keys(TV_VARIETY_DEFAULT_FILTER).every((key) => (key === "query" ? !String(f.query).trim() : f[key] === TV_VARIETY_DEFAULT_FILTER[key]));
}

function compareNewestFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// 新しい順に並べ、年ごとにまとめる：[{ year, records }]
export function groupTvVarietyByYear(records) {
  const groups = [];
  [...(records ?? [])].sort(compareNewestFirst).forEach((record) => {
    const year = yearOf(record);
    if (!groups.length || groups[groups.length - 1].year !== year) groups.push({ year, records: [] });
    groups[groups.length - 1].records.push(record);
  });
  return groups;
}

// データにある年（新しい順）
export function availableTvVarietyYears(records) {
  return [...new Set((records ?? []).map(yearOf))].filter(Boolean).sort((a, b) => (a < b ? 1 : -1));
}

// 放送局の区分のうち、データに1件以上あるもの（件数つき）
export function availableTvVarietyStations(records, stationFilters) {
  const counts = new Map();
  (records ?? []).forEach((record) => counts.set(record.stationFilter, (counts.get(record.stationFilter) ?? 0) + 1));
  return (stationFilters ?? []).filter((station) => counts.has(station.id)).map((station) => ({ ...station, count: counts.get(station.id) }));
}

// メンバーごとの件数（メンバーのページの導線・全体検索で使う）
export function countTvVarietyByMember(records, memberId) {
  return (records ?? []).filter((record) => (record.memberIds ?? []).includes(memberId)).length;
}

// レギュラー番組（別枠）の絞り込み：メンバーを選んでいるときはその人が出ている番組だけ、番組名の検索も効かせる
export function filterTvVarietyRegulars(regulars, { memberId = "all", query = "" } = {}) {
  const words = splitQuery(query);
  return (regulars ?? []).filter((regular) => {
    if (memberId !== "all" && !(regular.memberIds ?? []).includes(memberId)) return false;
    const text = normalizeTvVarietyText(regular.program);
    return words.every((word) => text.includes(word));
  });
}

// 全体検索用：番組ごとにまとめる（同じ番組の回を1件にする。番組名の表記は新しい回のもの）
// 戻り値：[{ program, count, firstDate, lastDate, memberIds, stations }]（回数の多い順）
export function groupTvVarietyByProgram(records) {
  const groups = new Map();
  [...(records ?? [])].sort(compareNewestFirst).forEach((record) => {
    const key = normalizeSearchText(record.program);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { key, program: record.program, count: 0, firstDate: record.date, lastDate: record.date, memberIds: [], stations: [] });
    const group = groups.get(key);
    group.count += 1;
    group.firstDate = record.date < group.firstDate ? record.date : group.firstDate;
    (record.memberIds ?? []).forEach((memberId) => {
      if (!group.memberIds.includes(memberId)) group.memberIds.push(memberId);
    });
    if (record.station && !group.stations.includes(record.station)) group.stations.push(record.station);
  });
  return [...groups.values()].sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : -1));
}
