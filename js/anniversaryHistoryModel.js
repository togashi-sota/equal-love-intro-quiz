// 「＝LOVEの歩み・周年ヒストリー」の並べ方を決める純粋関数（2026-10-29新設）。DOM に触れない（tests/historyPages.test.js で確かめる）。
// データは js/data/anniversaryHistory.js（周年の区切り ANNIVERSARY_PERIODS と、出来事 ANNIVERSARY_EVENTS）。

export const ANNIVERSARY_CATEGORY_LABELS = {
  concert: "ライブ",
  milestone: "初めて・節目",
  release: "リリース",
  tv: "テレビ",
  member: "メンバー",
  award: "受賞",
  other: "そのほか",
};

// 周年ごとの見出しに出す出来事の数（カードが長くなりすぎないように）
const HEADLINE_LIMIT = 3;

// "2021-09-17" → "2021年9月17日"、"2021-09" → "2021年9月"
export function formatHistoryDate(date) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(date ?? ""));
  if (!match) return "";
  const [, year, month, day] = match;
  return day ? `${year}年${Number(month)}月${Number(day)}日` : `${year}年${Number(month)}月`;
}

// 期間の表示（"2020年9月〜2021年9月"）。始まりの無い期間（結成・デビュー）・終わりの無い期間（これから）にも対応する
export function formatPeriodRange(period) {
  const ym = (date) => (date ? formatHistoryDate(date.slice(0, 7)) : "");
  if (!period?.from && period?.to) return `〜${ym(period.to)}`;
  if (period?.from && !period?.to) return `${ym(period.from)}〜`;
  if (period?.from && period?.to) return `${ym(period.from)}〜${ym(period.to)}`;
  return "";
}

// 周年ごとにまとめる。出来事が1つも無い周年は除く。見出し＝highlight の出来事（日付順に最大3件、無ければ最初の出来事）
export function buildAnniversaryModel(periods, events) {
  const byPeriod = new Map();
  [...(events ?? [])]
    .sort((a, b) => (a.date === b.date ? String(a.id).localeCompare(String(b.id)) : a.date < b.date ? -1 : 1))
    .forEach((event) => {
      if (!byPeriod.has(event.period)) byPeriod.set(event.period, []);
      byPeriod.get(event.period).push(event);
    });
  return (periods ?? [])
    .filter((period) => byPeriod.has(period.period))
    .map((period) => {
      const list = byPeriod.get(period.period);
      const highlights = list.filter((event) => event.highlight);
      return { ...period, events: list, headlines: (highlights.length ? highlights : list).slice(0, HEADLINE_LIMIT) };
    });
}

// 最初に開く周年：予定ではない（10＝これから以外の）いちばん新しい周年
export function defaultAnniversaryPeriod(model) {
  const past = (model ?? []).filter((entry) => entry.period < 10);
  return past.length ? past[past.length - 1].period : (model?.[0]?.period ?? null);
}

// 出来事から飛べる先（アプリの中の別のページ）。存在する ID だけを返す（壊れたリンクを作らない）
export function relatedTargets(event, { liveIds = new Set(), songIds = new Set(), workIds = new Set(), memberIds = new Set() } = {}) {
  const related = event?.related ?? {};
  const targets = [];
  if (related.liveHistoryId && liveIds.has(related.liveHistoryId)) targets.push({ kind: "live", liveId: related.liveHistoryId, label: "ライブ履歴" });
  if (related.songId && songIds.has(related.songId)) targets.push({ kind: "song", songId: related.songId, label: "収録曲" });
  if (related.workId && workIds.has(related.workId)) targets.push({ kind: "work", workId: related.workId, label: "作品" });
  if (related.memberId && memberIds.has(related.memberId)) targets.push({ kind: "member", memberId: related.memberId, label: "メンバー" });
  if (event?.category === "tv" && related.tvAppearanceDate) targets.push({ kind: "tv", date: related.tvAppearanceDate, label: "音楽番組出演" });
  return targets;
}

// 周年記念公演そのものか（「その周年の記念公演」と「周年期間中に起きた出来事」を分けて見せるため）
export function isAnniversaryConcert(event) {
  return event?.category === "concert" && /周年/.test(event?.title ?? "");
}

// 1つの周年を「記念公演」「おもな出来事（見出し）」「そのほか」に分ける（どれにも重ならない）
export function splitPeriodEvents(entry) {
  const events = entry?.events ?? [];
  const concerts = events.filter(isAnniversaryConcert);
  const rest = events.filter((event) => !isAnniversaryConcert(event));
  return { concerts, highlights: rest.filter((event) => event.highlight), others: rest.filter((event) => !event.highlight) };
}

// 年表（暦の年ごと）：[{ year, events }]（古い順）
export function groupEventsByCalendarYear(events) {
  const groups = [];
  [...(events ?? [])]
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))
    .forEach((event) => {
      const year = String(event.date).slice(0, 4);
      if (!groups.length || groups[groups.length - 1].year !== year) groups.push({ year, events: [] });
      groups[groups.length - 1].events.push(event);
    });
  return groups;
}
