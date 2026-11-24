// 質問AI × ＝LOVEカレンダー（2026-11-24新設）。「今週の予定は？」「来月のライブは？」「野口衣織の今後の予定は？」
// 「2026年11月に何があった？」「次のコンサートはいつ？」に、カレンダーのデータ（公式 SCHEDULE）だけで答える。
// 日付は日本時間（js/calendarModel.js の resolveDateRange）。未発表の予定を推測しない・収録していない期間は「収録できていない」と言う。
// DOM に触れない。js/qaEngine.js が detectCalendarQuestion → answerCalendarQuestion の順に呼ぶ。
import { CALENDAR_STATE, getCalendarSnapshot } from "./calendarData.js";
import { categoryLabel, describeTime, findEvents, formatDateJa, formatMonthJa, memberName, resolveDateRange, uncoveredMonths } from "./calendarModel.js";
import { EVENT_STATUS } from "./calendarCore.js";

const OFFICIAL_SCHEDULE_URL = "https://equal-love.jp/schedule/";
const MAX_LINES = 8;

// 予定の種類の言葉 → カレンダーの分類
const KIND_WORDS = [
  { category: "live", pattern: /ライブ|公演|コンサート|ツアー|フェス|イベント/ },
  { category: "meet", pattern: /お話し会|おはなし会|握手会|サイン会|ミーグリ/ },
  { category: "radio", pattern: /ラジオ/ },
  { category: "tv", pattern: /テレビ|TV|番組/ },
  { category: "release", pattern: /リリース|発売|CD|シングル|アルバム/ },
  { category: "birthday", pattern: /誕生日/ },
  { category: "media", pattern: /雑誌/ },
];
const RELATIVE = /今日|きょう|本日|明日|あした|明後日|あさって|昨日|きのう|今週|来週|先週|再来週|今月|来月|先月/;
const YEAR_WORDS = /今年|去年|昨年|来年/;
// 「○○は今何をしている？」「加入前は何をしていた？」「○○のテレビ出演は？」は今までの型（個人の活動・テレビ出演）に任せる。
// 「何をしていた」は「2025年8月は何をしていた？」のように年月があるときだけ（下の monthSpecific）
const SCHEDULE_WORDS = /予定|スケジュール|何があ|なにがあ/;
const FUTURE_WORDS = /今後|これから|この先|予定/;
const NEXT_WORDS = /次の|次回の|今度の|直近の|一番近い/;

// 質問がカレンダーで答える型か。答えないときは null（ほかの型に任せる）
// context：{ memberId, hasNews, hasSong }
export function detectCalendarQuestion(rawText, today, { memberId = null, hasNews = false, hasSong = false } = {}) {
  if (hasSong) return null;
  const raw = String(rawText ?? "").normalize("NFKC");
  const kind = KIND_WORDS.find((entry) => entry.pattern.test(raw))?.category ?? null;
  const relative = RELATIVE.test(raw) || (YEAR_WORDS.test(raw) && Boolean(kind));
  const scheduleWord = SCHEDULE_WORDS.test(raw);
  const next = NEXT_WORDS.test(raw) && Boolean(kind);
  const range = resolveDateRange(raw, today);
  const monthSpecific = /\d{1,2}月/.test(raw);
  // 「最新情報」「発表」は NEWS の型（予定の言葉が無いとき）
  if (hasNews && !scheduleWord) return null;
  // 「野口衣織の誕生日は？」（範囲も予定の言葉も無い）はメンバーの型に任せる
  const routed = relative || next || (scheduleWord && (range || memberId || kind || FUTURE_WORDS.test(raw))) || (monthSpecific && range && (kind || /何があ|なにがあ|何して|なにして|何をして/.test(raw)));
  if (!routed) return null;
  if (next) return { mode: "next", kind, memberId };
  if (range) return { mode: "range", kind, memberId, range };
  return { mode: "future", kind, memberId };
}

function evidenceOf(snapshot) {
  const checkedAt = snapshot.fetchedAt ? snapshot.fetchedAt.slice(0, 10) : null;
  return { label: "＝LOVE 公式サイトの SCHEDULE（カレンダーの自動取得）", checkedAt, urls: [OFFICIAL_SCHEDULE_URL] };
}

function lineOf({ event, date }) {
  const time = describeTime(event, date);
  const status = event.status === EVENT_STATUS.CANCELLED ? "【中止】" : event.status === EVENT_STATUS.POSTPONED ? "【延期】" : "";
  return `${formatDateJa(date)} ${categoryLabel(event.category)}：${status}${event.title}${time ? `／${time}` : ""}`;
}

function subjectOf(question) {
  const who = question.memberId ? `${memberName(question.memberId)}の` : "";
  const what = question.kind ? categoryLabel(question.kind) : "予定";
  return { who, what };
}

// 戻り値：{ status: "answer" | "notFound", intent, text, details, evidence, links }
export function answerCalendarQuestion(question, today) {
  const snapshot = getCalendarSnapshot();
  const intent = "calendar";
  if (snapshot.state !== CALENDAR_STATE.READY && snapshot.state !== CALENDAR_STATE.STALE) {
    return {
      status: "notFound",
      intent,
      text: "＝LOVEカレンダーのデータを読み込めていないため、予定は確認できません。",
      details: ["予定は、＝LOVE 公式サイトの SCHEDULE で確かめてください。"],
      evidence: [evidenceOf(snapshot)],
      links: [{ label: "公式サイトの SCHEDULE を開く", url: OFFICIAL_SCHEDULE_URL }],
    };
  }
  const filter = { category: question.kind ?? "all", member: question.memberId ?? "all" };
  const { who, what } = subjectOf(question);
  const staleNote = snapshot.state === CALENDAR_STATE.STALE ? ["自動の更新が止まっているため、新しく発表された予定が入っていない可能性があります。"] : [];
  const calendarLink = (date) => ({ label: "カレンダーで見る", target: { kind: "calendar", date, memberId: question.memberId ?? null, category: question.kind ?? null } });

  if (question.mode === "next" || question.mode === "future") {
    const found = findEvents(snapshot.events, { from: today, filter, includeCancelled: question.mode === "future" });
    if (!found.length) {
      return {
        status: "notFound",
        intent,
        text: `現在収録されている公式予定では、${who}これからの${what}は確認できません。`,
        details: ["まだ発表されていない予定は入っていません。", ...staleNote],
        evidence: [evidenceOf(snapshot)],
        links: [calendarLink(today), { label: "公式サイトの SCHEDULE を開く", url: OFFICIAL_SCHEDULE_URL }],
      };
    }
    if (question.mode === "next") {
      const first = found[0];
      return {
        status: "answer",
        intent,
        text: `${who}次の${what}は、${formatDateJa(first.date, { withYear: true })}の${/^[「『]/.test(first.event.title) ? first.event.title : `「${first.event.title}」`}です。`,
        details: [describeTime(first.event, first.date) ? `時間：${describeTime(first.event, first.date)}` : null, ...found.slice(1, 4).map(lineOf), ...staleNote].filter(Boolean),
        evidence: [evidenceOf(snapshot)],
        links: [calendarLink(first.date), { label: "公式の予定を開く", url: first.event.url }],
      };
    }
    return {
      status: "answer",
      intent,
      text: `${who}これからの${what}は、収録されている公式予定で${found.length}件です。`,
      details: [...found.slice(0, MAX_LINES).map(lineOf), ...(found.length > MAX_LINES ? [`ほか${found.length - MAX_LINES}件（カレンダーで見られます）`] : []), ...staleNote],
      evidence: [evidenceOf(snapshot)],
      links: [calendarLink(found[0].date)],
    };
  }

  const { from, to, label } = question.range;
  const missing = uncoveredMonths(snapshot.months, from, to);
  const found = findEvents(snapshot.events, { from, to, filter });
  const coverageNote = missing.length ? [`${missing.slice(0, 3).map(formatMonthJa).join("・")}${missing.length > 3 ? "など" : ""}の公式情報は、まだ収録できていません。`] : [];
  if (!found.length) {
    return {
      status: "notFound",
      intent,
      text: `現在収録されている公式予定では、${label}の${who}${what}は確認できません。`,
      details: [...coverageNote, to >= today ? "まだ発表されていない予定は入っていません。" : null, ...staleNote].filter(Boolean),
      evidence: [evidenceOf(snapshot)],
      links: [calendarLink(from), { label: "公式サイトの SCHEDULE を開く", url: OFFICIAL_SCHEDULE_URL }],
    };
  }
  return {
    status: "answer",
    intent,
    text: `${label}（${formatDateJa(from)}${from === to ? "" : `〜${formatDateJa(to)}`}）の${who}${what}は、収録されている公式予定で${found.length}件です。`,
    details: [...found.slice(0, MAX_LINES).map(lineOf), ...(found.length > MAX_LINES ? [`ほか${found.length - MAX_LINES}件（カレンダーで見られます）`] : []), ...coverageNote, ...staleNote],
    evidence: [evidenceOf(snapshot)],
    links: [calendarLink(found[0].date)],
  };
}
