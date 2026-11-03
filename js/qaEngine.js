// 「質問AI」（アプリ内の情報から答える）の中心（2026-11-03新設・R11-C）。DOM に触れない（tests.html から直接テストする）。
//
// 【方式】生成 AI は使わない（比較と理由は renewal-notes/r11-qa.md）。端末の中だけで動き、質問を外に送らず、保存もしない。
//   1. 質問を正規化（js/qaText.js：かな・全角半角・異体字・漢数字・序数）
//   2. 既存データから組み立てた辞書（メンバー・曲・作品・特典映像の言葉）で、固有名詞を長い順に見つける
//   3. 聞き方の言葉（js/data/qaPhrases.js）で「何を聞いているか」（型）を決める
//   4. 型ごとの回答関数が、データを読んで答えを作る（文は決まった形に値を入れるだけ。作り話をしない）
//   5. 答えられないときは「現在登録されている情報では確認できません」。読み取れないときは候補を出す
//
// 【答えの形】answerQuestion(text) の戻り値
//   status   … "answer"（答えた）／"candidates"（解釈が複数・候補）／"notFound"（型は分かったがデータに無い）／
//               "refuse"（推測・主観になるので答えない）／"unknown"（質問を読み取れない）
//   text     … 短い答え（1〜2文）
//   details  … 詳しい行（数行まで）
//   evidence … 根拠（どのデータか・確認日・出典の URL）
//   links    … アプリの中の開く先（target は全体検索と同じ形。main.js の openSearchTarget で開く）
//   candidates … 候補（question を押すと、その質問で聞き直す／target があればそのページを開く）
import { SONGS, CATEGORY } from "./data/songs.js";
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import { MEMBER_PROFILES } from "./data/memberProfiles.js";
import { MEMBER_ACTIVITIES, ACTIVITY_TYPE, ACTIVITY_STATUS } from "./data/memberActivities.js";
import { LIVE_EVENTS, LIVE_STATUS } from "./data/liveHistory.js";
import { TV_VARIETY_RECORDS, TV_VARIETY_REGULARS, TV_VARIETY_CHECKED_DATE } from "./data/tvVariety.js";
import { TV_APPEARANCES } from "./data/tvAppearances.js";
import { COMMERCIALS } from "./data/commercials.js";
import { getMemberCommercials } from "./commercialsSection.js";
// 【R12】「どんな人？」の「今の主な活動」は、個人ページと同じ選び方（js/membersScreen.js）で選ぶ（答えと個人ページを食い違わせない）
import { isCurrentActivity, sortActivitiesByDateDesc, CURRENT_ACTIVITY_LIMIT } from "./membersScreen.js";
import { getMemberActivities } from "./memberUtils.js";
import { STAGE_PRODUCTIONS, VOICE_APPEARANCES } from "./data/memberStageVoice.js";
import { CD_BONUS_WORKS, CD_BONUS_CHECKED_AT } from "./data/cdBonus.js";
import { UPCOMING_RELEASE } from "./data/upcomingRelease.js";
import { QA_MEMBER_NAME_PARTS, QA_INTENT_PHRASES, QA_BONUS_CATEGORY_WORDS, QA_FILLER_WORDS } from "./data/qaPhrases.js";
import { normalizeQuestion, normalizeTerm, normalizePhrases, includesAny, extractWorkNumber, extractYear, extractTypeLetter } from "./qaText.js";
import { cdBonusCategoryLabel, cdBonusWorkLabel, filterCdBonusVideos, describeCdBonusType, CD_BONUS_ALL } from "./cdBonusModel.js";
import { getYoutubeAppearanceSnapshot } from "./youtubeAppearanceData.js";
import { isConfirmedAppearance, allAppearingMemberIds, youtubeVideoYear } from "./youtubeAppearancesModel.js";
import { getQaNewsSnapshot, QA_NEWS_STATE } from "./qaNewsBridge.js";
import { normalizeSearchText, findApproximateSubstring } from "./searchNormalize.js";

export const QA_STATUS = Object.freeze({ ANSWER: "answer", CANDIDATES: "candidates", NOT_FOUND: "notFound", REFUSE: "refuse", UNKNOWN: "unknown" });
export const QA_NOT_FOUND_TEXT = "現在登録されている情報では確認できません。";
export const QA_SCOPE_NOTE = "アプリに登録された情報だけで答えています。登録に無いことは、実際に無かったという意味ではありません。";

const P = Object.fromEntries(Object.entries(QA_INTENT_PHRASES).map(([key, list]) => [key, normalizePhrases(list)]));
const FILLERS = normalizePhrases(QA_FILLER_WORDS).sort((a, b) => b.length - a.length);
const BONUS_CATEGORY_WORDS = Object.entries(QA_BONUS_CATEGORY_WORDS).map(([id, list]) => ({ id, words: normalizePhrases(list) }));

// ===== 小さな道具 =====

export function getTodayInJapan(now = new Date()) {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function formatQaDate(dateText) {
  const [year, month, day] = String(dateText ?? "").split("-").map(Number);
  if (!year) return "";
  if (!month) return `${year}年`;
  if (!day) return `${year}年${month}月`;
  return `${year}年${month}月${day}日`;
}

function joinNames(list, limit = 6) {
  const shown = list.slice(0, limit).join("・");
  return list.length > limit ? `${shown} ほか${list.length - limit}件` : shown;
}

function ageOn(birthday, today) {
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

const MEMBER_BY_ID = new Map(MEMBERS.map((member) => [member.id, member]));
const PROFILE_BY_ID = new Map(MEMBER_PROFILES.map((profile) => [profile.memberId, profile]));
const SONG_BY_ID = new Map(SONGS.map((song) => [song.id, song]));
const WORK_BY_ID = new Map(CD_BONUS_WORKS.map((work) => [work.workId, work]));
const nameOf = (memberId) => MEMBER_BY_ID.get(memberId)?.name ?? null;
const SINGLES = CD_BONUS_WORKS.filter((work) => work.kind === "single").sort((a, b) => a.number - b.number);
const MAX_SINGLE = SINGLES.at(-1)?.number ?? 0;

function evidence(label, { checkedAt = null, urls = [] } = {}) {
  return { label, checkedAt, urls: (urls ?? []).filter(Boolean).slice(0, 4) };
}

function result(status, intent, fields = {}) {
  return { status, intent, text: "", details: [], evidence: [], links: [], candidates: [], note: QA_SCOPE_NOTE, ...fields };
}

function notFound(intent, text, fields = {}) {
  return result(QA_STATUS.NOT_FOUND, intent, { text: text ? `${text}` : QA_NOT_FOUND_TEXT, ...fields });
}

const memberLink = (memberId) => ({ label: `${nameOf(memberId)}の個人ページ`, target: { kind: MEMBER_BY_ID.get(memberId)?.status === MEMBER_STATUS.GRADUATED ? "membersList" : "member", memberId } });
const workLink = (workId) => {
  const work = WORK_BY_ID.get(workId);
  return { label: work ? `${cdBonusWorkLabel(work)}「${work.title}」の作品ページ` : "作品ページ", target: { kind: "work", workId } };
};
const cdBonusLink = (workId, typeId = null, videoId = null, label = null) => {
  const work = WORK_BY_ID.get(workId);
  return { label: label ?? `CD・特典映像図鑑で「${work?.title ?? ""}」を見る`, target: { kind: "cdBonus", workId, typeId, videoId } };
};
const songLink = (songId) => ({ label: `収録曲一覧で「${SONG_BY_ID.get(songId)?.title ?? ""}」を見る`, target: { kind: "song", songId } });

// ===== 辞書（既存のデータから組み立てる） =====

function memberTerms(member) {
  const parts = QA_MEMBER_NAME_PARTS[member.id] ?? {};
  const profile = PROFILE_BY_ID.get(member.id);
  const terms = [member.name, member.reading, parts.family, parts.given, parts.familyReading];
  if (parts.givenReadingSafe) terms.push(parts.givenReading);
  (profile?.nicknames ?? []).forEach((nickname) => terms.push(nickname.text));
  return terms.filter(Boolean);
}

// 曲：曲名・読み・別名。「＝LOVE」（1st の表題曲）は、グループ名と区別できないので「」付きのときだけ（下の findSongs）
function songTerms(song) {
  const aliases = (song.searchAliases ?? []).flatMap((alias) => (typeof alias === "string" ? [alias] : [alias.text, alias.reading]));
  return [song.title, song.searchReading, ...aliases].filter(Boolean);
}

let lexicon = null;
function getLexicon() {
  if (lexicon) return lexicon;
  const entries = [];
  MEMBERS.forEach((member) => {
    memberTerms(member).forEach((term) => {
      const loose = normalizeTerm(term);
      const strict = normalizeTerm(term, { loose: false });
      if (loose.length >= 2) entries.push({ kind: "member", id: member.id, loose, strict });
    });
  });
  SONGS.forEach((song) => {
    if (song.id === "love") return;
    songTerms(song).forEach((term) => {
      const loose = normalizeTerm(term);
      // 「LOVE」だけの別名などは、グループ名と区別できないので使わない
      if (loose.length >= 2 && loose !== "love") entries.push({ kind: "song", id: song.id, loose, strict: loose });
    });
  });
  // 作品名が曲名と違う作品（アルバム「全部、内緒。」）
  CD_BONUS_WORKS.filter((work) => !SONGS.some((song) => song.workId === work.workId && normalizeTerm(song.title) === normalizeTerm(work.title))).forEach((work) => {
    const loose = normalizeTerm(work.title);
    if (loose.length >= 2) entries.push({ kind: "work", id: work.workId, loose, strict: loose });
  });
  lexicon = entries.sort((a, b) => b.loose.length - a.loose.length);
  return lexicon;
}

// 質問の中の固有名詞を、長い順・重ならないように見つける
function findEntities(loose, strict) {
  const hits = [];
  getLexicon().forEach((entry) => {
    let index = loose.indexOf(entry.loose);
    while (index !== -1) {
      hits.push({ ...entry, start: index, end: index + entry.loose.length });
      index = loose.indexOf(entry.loose, index + 1);
    }
  });
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken = [];
  const accepted = [];
  hits.forEach((hit) => {
    const overlapsOther = taken.some((span) => hit.start < span.end && span.start < hit.end && !(span.start === hit.start && span.end === hit.end));
    if (overlapsOther) return;
    if (!taken.some((span) => span.start === hit.start && span.end === hit.end)) taken.push({ start: hit.start, end: hit.end });
    accepted.push(hit);
  });
  // 同じ場所に複数のメンバー（「さいとう」「斎藤」）：異体字をそろえない形でぴったり当たる人がいれば、その人だけ
  const bySpan = new Map();
  accepted.forEach((hit) => {
    const key = `${hit.start}:${hit.end}:${hit.kind}`;
    if (!bySpan.has(key)) bySpan.set(key, []);
    bySpan.get(key).push(hit);
  });
  const groups = [...bySpan.values()].map((group) => {
    const ids = [...new Set(group.map((hit) => hit.id))];
    if (ids.length > 1 && group[0].kind === "member") {
      const strictIds = [...new Set(group.filter((hit) => strict.includes(hit.strict)).map((hit) => hit.id))];
      if (strictIds.length === 1) return { kind: "member", ids: strictIds, start: group[0].start, end: group[0].end, term: group[0].loose };
    }
    return { kind: group[0].kind, ids, start: group[0].start, end: group[0].end, term: group[0].loose };
  });
  return groups.sort((a, b) => a.start - b.start);
}

// ===== 解析 =====

export function parseQuestion(rawText) {
  const raw = String(rawText ?? "").trim();
  const loose = normalizeQuestion(raw);
  const strict = normalizeQuestion(raw, { loose: false });
  const entities = findEntities(loose, strict);
  const memberGroups = entities.filter((entity) => entity.kind === "member");
  const songGroups = entities.filter((entity) => entity.kind === "song");
  const workGroups = entities.filter((entity) => entity.kind === "work");
  // 「＝LOVE」（曲）：「」『』で囲んだときだけ
  if (/[「『]\s*[=＝]\s*LOVE\s*[」』]/i.test(raw.normalize("NFKC").replace(/＝/g, "="))) songGroups.unshift({ kind: "song", ids: ["love"], start: -1, end: -1, term: "love" });
  const has = (key) => includesAny(loose, P[key]);
  return {
    raw,
    loose,
    strict,
    entities,
    memberIds: [...new Set(memberGroups.filter((group) => group.ids.length === 1).map((group) => group.ids[0]))],
    ambiguousMembers: memberGroups.filter((group) => group.ids.length > 1),
    songIds: [...new Set(songGroups.flatMap((group) => group.ids))],
    workIds: [...new Set(workGroups.flatMap((group) => group.ids))],
    workNumber: extractWorkNumber(loose),
    year: extractYear(loose),
    typeLetter: extractTypeLetter(loose),
    has,
  };
}

// ===== 回答関数 =====

function workOfSong(song) {
  return WORK_BY_ID.get(song.workId) ?? null;
}

function typesContainingSong(work, songId) {
  return work.types.filter((type) => type.tracks.some((track) => track.songId === songId && !track.instrumental && !track.version)).map((type) => type.id);
}

function describeTypeSpread(work, songId) {
  const ids = typesContainingSong(work, songId);
  if (!ids.length) return null;
  return ids.length === work.types.length ? "すべての TYPE に収録" : `Type-${ids.join("・")} に収録`;
}

const songEvidence = () => evidence("楽曲データ（作品・発売日・センター）");
const cdEvidence = () => evidence("CD・特典映像図鑑（＝LOVE 公式サイトの各 TYPE のページ）", { checkedAt: CD_BONUS_CHECKED_AT });

function answerWorkNumberOfSong(song) {
  const work = workOfSong(song);
  if (song.workId?.startsWith("single") && work) {
    const isTitle = song.category === CATEGORY.TITLE_TRACK;
    const text = isTitle
      ? `「${song.title}」は${work.number}枚目のシングルです（${formatQaDate(work.releaseDate)}発売）。`
      : `「${song.title}」は、${work.number}枚目のシングル「${work.title}」に入っている曲です（表題曲ではありません）。`;
    return result(QA_STATUS.ANSWER, "workNumberOfSong", {
      text,
      details: [describeTypeSpread(work, song.id)].filter(Boolean),
      evidence: [songEvidence(), cdEvidence()],
      links: [workLink(work.workId), cdBonusLink(work.workId)],
    });
  }
  if (song.workId?.startsWith("album") && work) {
    return result(QA_STATUS.ANSWER, "workNumberOfSong", {
      text: `「${song.title}」はシングルではなく、${cdBonusWorkLabel(work)}「${work.title}」の曲です（${formatQaDate(work.releaseDate)}発売）。`,
      details: [describeTypeSpread(work, song.id)].filter(Boolean),
      evidence: [songEvidence(), cdEvidence()],
      links: [workLink(work.workId), cdBonusLink(work.workId)],
    });
  }
  return result(QA_STATUS.ANSWER, "workNumberOfSong", {
    text: `「${song.title}」は CD のシングルではありません。登録上は「${song.single}」です（${formatQaDate(song.releaseDate)}）。`,
    evidence: [songEvidence()],
    links: [songLink(song.id)],
  });
}

function titleTrackOf(work) {
  return SONGS.find((song) => song.workId === work.workId && song.category === CATEGORY.TITLE_TRACK) ?? SONGS.find((song) => song.workId === work.workId);
}

function centerText(song) {
  if (!song?.center?.length) return null;
  return song.center.join("・");
}

function newsItemsMatching(predicate) {
  const snapshot = getQaNewsSnapshot();
  return { snapshot, items: snapshot.items.filter(predicate).sort((a, b) => String(b.publishedOn).localeCompare(String(a.publishedOn))) };
}

function newsEvidence(snapshot) {
  return evidence("＝LOVE 最新情報（公式 NEWS の自動収集）", { checkedAt: snapshot.fetchedAt ?? snapshot.items[0]?.fetchedAt ?? null });
}

function answerWorkByNumber(number, parsed) {
  // 「アルバム」と書いてあればアルバム（「3枚目のアルバム」の「枚目」でシングルにしない）
  const isAlbum = parsed.has("album");
  const work = isAlbum ? CD_BONUS_WORKS.find((entry) => entry.kind === "album" && entry.number === number) : SINGLES.find((entry) => entry.number === number);
  if (!work) {
    // 登録に無い番号：最新情報（公式 NEWS）に発表があるかを見る。無ければ答えない（推測しない）
    const patterns = [`${number}th`, `${number}st`, `${number}nd`, `${number}rd`, `${number}枚目`].map((text) => normalizeTerm(text));
    const { snapshot, items } = newsItemsMatching((item) => patterns.some((pattern) => normalizeTerm(item.title).includes(pattern)));
    const lastWork = isAlbum ? CD_BONUS_WORKS.filter((entry) => entry.kind === "album").at(-1) : SINGLES.at(-1);
    const registered = lastWork ? `アプリに登録されている${isAlbum ? "アルバム" : "シングル"}は、${cdBonusWorkLabel(lastWork)}「${lastWork.title}」までです。` : "";
    if (items.length) {
      return result(QA_STATUS.ANSWER, "newsOfWork", {
        text: `公式の発表があります：「${items[0].title}」（${formatQaDate(items[0].publishedOn)}）。`,
        details: [...items.slice(1, 3).map((item) => `ほかの発表：「${item.title}」（${formatQaDate(item.publishedOn)}）`), "収録内容・TYPE などは、アプリの図鑑にはまだ登録されていません。公式の発表を確かめてください。", registered].filter(Boolean),
        evidence: [newsEvidence(snapshot)],
        links: items.slice(0, 3).map((item) => ({ label: `公式の発表を開く：${item.title}`, url: item.url })),
      });
    }
    if (UPCOMING_RELEASE && UPCOMING_RELEASE.number === number) {
      return result(QA_STATUS.ANSWER, "upcomingWork", { text: `${number}枚目のシングルは発売予定として登録されています（${formatQaDate(UPCOMING_RELEASE.releaseDate)}）。`, evidence: [songEvidence()] });
    }
    const newsNote = snapshot.state === QA_NEWS_STATE.READY ? "最新情報（公式 NEWS）にも、この番号の発表は見つかりませんでした。" : "最新情報（公式 NEWS）のデータを読み込めていないため、新しい発表があったかは確かめられません。";
    return notFound(isAlbum ? "albumByNumber" : "singleByNumber", `${QA_NOT_FOUND_TEXT}${number}枚目の${isAlbum ? "アルバム" : "シングル"}は、アプリに登録されていません。`, {
      details: [registered, newsNote].filter(Boolean),
      evidence: [songEvidence(), newsEvidence(snapshot)],
      links: lastWork ? [workLink(lastWork.workId)] : [],
    });
  }
  const title = titleTrackOf(work);
  const tracks = uniqueTracks(work);
  if (parsed.has("center")) return answerCenterOfSong(title, work);
  return result(QA_STATUS.ANSWER, isAlbum ? "albumByNumber" : "singleByNumber", {
    text: `${cdBonusWorkLabel(work)}は「${work.title}」です（${formatQaDate(work.releaseDate)}発売）。`,
    details: [
      work.kind === "single" && centerText(title) ? `表題曲のセンター：${centerText(title)}` : null,
      `収録曲：${joinNames(tracks.map((track) => track.title), 8)}`,
      `TYPE：${work.types.length}種`,
    ].filter(Boolean),
    evidence: [songEvidence(), cdEvidence()],
    links: [workLink(work.workId), cdBonusLink(work.workId)],
  });
}

// その作品の、楽器だけの音源を除いた曲（TYPE をまたいで重ならないように、出てきた順）
function uniqueTracks(work) {
  const seen = new Map();
  const longest = work.types.slice().sort((a, b) => b.tracks.length - a.tracks.length);
  longest.forEach((type) => type.tracks.forEach((track) => {
    if (track.instrumental || track.version) return;
    const key = track.songId ?? normalizeTerm(track.title);
    if (!seen.has(key)) seen.set(key, track);
  }));
  return [...seen.values()];
}

function answerCenterOfSong(song, work = workOfSong(song)) {
  const center = centerText(song);
  if (!center) {
    return notFound("centerOfSong", `${QA_NOT_FOUND_TEXT}「${song.title}」のセンターは、アプリに登録されていません。`, { evidence: [songEvidence()], links: [songLink(song.id)] });
  }
  const kind = song.center.length >= 3 ? "（複数のセンター）" : song.center.length === 2 ? "（Wセンター）" : "";
  const everyone = song.center.includes("全員");
  return result(QA_STATUS.ANSWER, "centerOfSong", {
    text: everyone ? `「${song.title}」は、アプリの記録では特定のセンターを決めず「全員」としています。` : `「${song.title}」のセンターは${center}です${kind}。`,
    details: [work ? `${cdBonusWorkLabel(work)}「${work.title}」（${formatQaDate(work.releaseDate)}発売）` : `「${song.single}」`],
    evidence: [songEvidence()],
    links: [work ? workLink(work.workId) : songLink(song.id), { label: "歴代センターを見る", target: { kind: "feature", action: { type: "click", selector: '[data-home-action="centers"]' } } }],
  });
}

function answerSongsCenteredBy(memberId) {
  const name = nameOf(memberId);
  const songs = SONGS.filter((song) => (song.center ?? []).includes(name)).sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)));
  if (!songs.length) return notFound("songsCenteredBy", `${QA_NOT_FOUND_TEXT}${name}がセンターの曲は、アプリに登録されていません。`, { evidence: [songEvidence()], links: [memberLink(memberId)] });
  const titleSongs = songs.filter((song) => song.category === CATEGORY.TITLE_TRACK);
  const label = (song) => `${song.title}${song.center.length === 2 ? "（W）" : song.center.length >= 3 ? "（複数）" : ""}`;
  return result(QA_STATUS.ANSWER, "songsCenteredBy", {
    text: `${name}がセンター（Wセンターなどを含む）の曲は、登録上${songs.length}曲です。`,
    details: [
      titleSongs.length ? `表題曲：${titleSongs.map(label).join("・")}` : "表題曲：登録なし",
      songs.length > titleSongs.length ? `ほかの曲：${joinNames(songs.filter((song) => song.category !== CATEGORY.TITLE_TRACK).map(label), 8)}` : null,
    ].filter(Boolean),
    evidence: [songEvidence()],
    links: [memberLink(memberId), { label: "歴代センターを見る", target: { kind: "feature", action: { type: "click", selector: '[data-home-action="centers"]' } } }],
  });
}

function answerTracks(work, typeLetter = null) {
  if (typeLetter) return answerTypeContents(work, typeLetter);
  // 曲数は、いちばん曲の多い TYPE の数（TYPE をまたいで足すと、実際の CD に無い数になるため）
  const longest = work.types.slice().sort((a, b) => b.tracks.filter((track) => !track.instrumental && !track.version).length - a.tracks.filter((track) => !track.instrumental && !track.version).length)[0];
  const main = longest.tracks.filter((track) => !track.instrumental && !track.version);
  const mainKeys = new Set(main.map((track) => track.songId ?? normalizeTerm(track.title)));
  const extras = uniqueTracks(work).filter((track) => !mainKeys.has(track.songId ?? normalizeTerm(track.title)));
  const label = (track) => `${track.title}${track.artist && !track.title.includes(track.artist) ? `（${track.artist}）` : ""}`;
  return result(QA_STATUS.ANSWER, "tracksOfWork", {
    text: `${cdBonusWorkLabel(work)}「${work.title}」の収録曲は${main.length}曲です（${longest.name}）。`,
    details: [
      main.map((track, index) => `${index + 1}. ${label(track)}`).join("　"),
      ...extras.map((track) => `${label(track)}：${describeTypeSpread(work, track.songId) ?? "一部の TYPE に収録"}`),
    ].filter(Boolean),
    evidence: [cdEvidence()],
    links: [cdBonusLink(work.workId), workLink(work.workId)],
  });
}

function answerTypeContents(work, typeLetter) {
  const type = work.types.find((entry) => entry.id === typeLetter);
  if (!type) {
    return notFound("typeContents", `${QA_NOT_FOUND_TEXT}「${work.title}」に Type-${typeLetter} はありません（TYPE は ${work.types.map((entry) => entry.id).join("・")} の${work.types.length}種）。`, { evidence: [cdEvidence()], links: [cdBonusLink(work.workId)] });
  }
  const videos = type.videos;
  return result(QA_STATUS.ANSWER, "typeContents", {
    text: `「${work.title}」${type.name}（${describeCdBonusType(type)}）の中身です。`,
    details: [
      `CD：${type.tracks.filter((track) => !track.instrumental).map((track) => track.title).join("・")}`,
      videos.length ? `${type.disc}：${[...new Set(videos.map((video) => video.group).filter(Boolean))].map((group) => `${group}／`).join("")}${joinNames(videos.map((video) => video.title), 4)}` : "映像特典なし",
      type.inserts.length ? `封入特典：${joinNames(type.inserts, 3)}` : null,
      `品番：${type.catalog}`,
    ].filter(Boolean),
    evidence: [cdEvidence()],
    links: [cdBonusLink(work.workId, type.id, null, `CD・特典映像図鑑で ${type.name} を見る`)],
  });
}

function answerReleaseDate(song, work) {
  if (work) {
    return result(QA_STATUS.ANSWER, "releaseDate", {
      text: `${cdBonusWorkLabel(work)}「${work.title}」の発売日は${formatQaDate(work.releaseDate)}です。`,
      evidence: [cdEvidence()],
      links: [workLink(work.workId)],
    });
  }
  return result(QA_STATUS.ANSWER, "releaseDate", {
    text: `「${song.title}」は${formatQaDate(song.releaseDate)}に出た曲です（${song.single}）。`,
    evidence: [songEvidence()],
    links: [songLink(song.id)],
  });
}

function answerMusicTvOfSong(song) {
  const records = TV_APPEARANCES.filter((record) => (record.songs ?? []).some((entry) => entry.songId === song.id)).sort((a, b) => a.date.localeCompare(b.date));
  if (!records.length) return notFound("musicTvOfSong", `${QA_NOT_FOUND_TEXT}「${song.title}」を音楽番組で披露した記録は、アプリに登録されていません。`, { evidence: [evidence("音楽番組の出演記録（披露曲が確認できたもの）")], links: [songLink(song.id)] });
  const last = records.at(-1);
  return result(QA_STATUS.ANSWER, "musicTvOfSong", {
    text: `「${song.title}」を音楽番組で披露した記録は、登録上${records.length}回です。`,
    details: [`最初：${formatQaDate(records[0].date)}「${records[0].program}」`, `最近：${formatQaDate(last.date)}「${last.program}」`],
    evidence: [evidence("音楽番組の出演記録（披露曲が確認できたもの）")],
    links: [{ label: "音楽番組の記録で見る", target: { kind: "tvAppearances", focusDate: last.date } }],
  });
}

// ---- メンバー ----

function profileEvidence(field, label) {
  return evidence(label, { checkedAt: field?.lastVerifiedDate ?? null, urls: field?.sourceUrls ?? [] });
}

// ---- 「どんな人？」（2026-11-03 R12 本人の依頼）----
// ホームのひとこと紹介（homeLead）は使わない。個人ページに登録された情報（紹介文・加入前の活動・役割・今の主な活動）から、
// 決まった型に「データの中の文を、文の単位のまま」つないで 2〜4文の紹介にする（言い換え・新しい形容をしない）。
//   1. だれか（＝LOVE のリーダー／メンバー／元メンバー）
//   2. グループの中での役割の文（紹介文の中の「最年少・最年長・センター・リーダー・愛称」などが出てくる文）
//   3. 本人の特徴の文（「知られる・大切に・理想・好き」などが出てくる文）
//   4. 代表的な活動（【R12 本人の決定】新しい順ではなく、そのメンバーを知るのに大事な活動）：
//      個人ページの「これまでの代表的な活動」と同じ印（memberActivities.js の highlightFor）の付いた活動から、
//      今も続いているもの（始まりの古い＝長く続けている順）→ 終わったもの（新しい順）で3つまで。印が無い人は「今の主な活動」
//   加入前の活動・オーディションのいきさつは、ここには入れない（「なぜ入ったの？」「昔はどんな活動？」の答えで詳しく出す）。
//   元メンバー（紹介文が無い）は、登録の範囲（加入前の活動・今の活動）で答える
const ROLE_WORDS = ["リーダー", "最年少", "最年長", "センター", "デビュー曲", "愛称", "役に回"];
const TRAIT_WORD_TIERS = [["知られ", "親しまれ"], ["大切に", "心がけ", "理想", "役に回", "支える"], ["大好き", "好きで", "趣味", "ファン"], ["目指"]];
// 2つ目の特徴の文には「目指した」（加入前のいきさつ）の文を使わない（今の人物像を中心にする）
const SECOND_TRAIT_WORD_TIERS = TRAIT_WORD_TIERS.slice(0, 3);
const PRE_DEBUT_WORD_TIERS = [["グループ", "ユニット", "アイドル「"], ["候補生", "ストリート生", "オーディション"]];
const MAX_SENTENCE_LENGTH = 140;

// 文の単位に分ける（「。」で区切る。かっこの中の「。」では区切らない）
export function splitJapaneseSentences(text) {
  const sentences = [];
  let depth = 0;
  let current = "";
  for (const char of String(text ?? "")) {
    current += char;
    if ("「『（(【".includes(char)) depth += 1;
    else if ("」』）)】".includes(char)) depth = Math.max(0, depth - 1);
    else if (char === "。" && depth === 0) {
      sentences.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) sentences.push(current.trim());
  return sentences;
}

// それだけ読んでも意味が分かる文（「その」「この」で前の文を指していない・長すぎない）
function isStandalone(sentence) {
  return sentence.length <= MAX_SENTENCE_LENGTH && !/^(その|この|それ|そこ|そう|これ)/.test(sentence);
}

function pickByTiers(sentences, tiers, used) {
  for (const words of tiers) {
    const hit = sentences.find((sentence) => !used.has(sentence) && isStandalone(sentence) && words.some((word) => sentence.includes(word)));
    if (hit) return hit;
  }
  return null;
}

export function currentActivitiesForMember(memberId, today) {
  return sortActivitiesByDateDesc(getMemberActivities(MEMBER_ACTIVITIES, memberId))
    .filter((activity) => isCurrentActivity(activity, today))
    .slice(0, CURRENT_ACTIVITY_LIMIT);
}

// 代表的な活動（個人ページの「これまでの代表的な活動」と同じ印 highlightFor）。今も続くもの（長く続けている順）→ 終わったもの（新しい順）
export function representativeActivitiesForMember(memberId, today, limit = 3) {
  const marked = getMemberActivities(MEMBER_ACTIVITIES, memberId).filter((activity) => Boolean(activity.highlightFor?.[memberId]));
  const current = marked.filter((activity) => isCurrentActivity(activity, today)).sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"));
  const others = marked.filter((activity) => !isCurrentActivity(activity, today)).sort((a, b) => (b.startDate ?? "0000").localeCompare(a.startDate ?? "0000"));
  return [...current, ...others].slice(0, limit);
}

export function buildMemberIntroduction(memberId, today) {
  const member = MEMBER_BY_ID.get(memberId);
  const profile = PROFILE_BY_ID.get(memberId);
  const graduated = member.status === MEMBER_STATUS.GRADUATED;
  const isLeader = (member.roles ?? []).includes("リーダー");
  const sentences = [];
  // 1. だれか
  if (graduated) {
    sentences.push(`${member.name}（${member.reading}）は、＝LOVE の元メンバーです（${member.joinDate ? `${formatQaDate(member.joinDate)}加入・` : ""}${member.graduationDate ? `${formatQaDate(member.graduationDate)}卒業` : "卒業"}）。`);
  } else {
    sentences.push(`${member.name}（${member.reading}）は、＝LOVE の${isLeader ? "リーダー" : "メンバー"}です。`);
  }
  // 2・3. 紹介文から、役割の文と特徴の文（紹介文の1文目が「＝LOVEのリーダー。」のような、1. と同じ内容の文は使わない）
  const intro = splitJapaneseSentences(profile?.introduction?.text).filter((sentence) => !/^＝LOVEのリーダー。$/.test(sentence));
  const used = new Set();
  const role = intro.find((sentence) => isStandalone(sentence) && ROLE_WORDS.some((word) => sentence.includes(word)));
  if (role) used.add(role);
  const trait = pickByTiers(intro, TRAIT_WORD_TIERS, used);
  if (trait) used.add(trait);
  // 役割の文が無いときは、特徴の文をもう1つ（紹介を短くしすぎない）
  const secondTrait = role ? null : pickByTiers(intro, SECOND_TRAIT_WORD_TIERS, used);
  // 紹介文の中の順のまま並べる（文の流れを変えない）
  intro.filter((sentence) => sentence === role || sentence === trait || sentence === secondTrait).forEach((sentence) => sentences.push(sentence));
  // 元メンバー（紹介文が無い）だけ、登録の範囲として加入前の活動の文を使う
  let preSentence = null;
  if (!intro.length) {
    const pre = splitJapaneseSentences(profile?.preDebutActivity?.text);
    const preCandidates = pre.filter((sentence) => !sentence.endsWith("とされる。"));
    preSentence = pickByTiers(preCandidates, PRE_DEBUT_WORD_TIERS, new Set()) ?? pickByTiers(pre, PRE_DEBUT_WORD_TIERS, new Set()) ?? pre.find(isStandalone) ?? null;
    if (preSentence) sentences.push(/^[^、]{1,12}は、/.test(preSentence) ? `＝LOVE 加入前、${preSentence}` : `＝LOVE 加入前は、${preSentence}`);
  }
  // 4. 代表的な活動（印が無い人は、今の主な活動）
  const representative = representativeActivitiesForMember(memberId, today);
  const activities = representative.length ? representative : currentActivitiesForMember(memberId, today).slice(0, 3);
  if (activities.length) {
    // 活動の名前は、個人ページと同じ書き方のまま（「」を足さない。名前の中にも「」があるため）。「／」で区切る
    sentences.push(`${representative.length ? "代表的な活動" : "今の主な活動"}には、${activities.map((activity) => activity.title).join("／")}があります。`);
  }
  return { sentences, usedIntroduction: Boolean(role || trait || secondTrait), usedPreDebut: Boolean(preSentence), activities, representative: representative.length > 0 };
}

function answerMemberProfile(memberId, today) {
  const member = MEMBER_BY_ID.get(memberId);
  const profile = PROFILE_BY_ID.get(memberId);
  const graduated = member.status === MEMBER_STATUS.GRADUATED;
  const intro = buildMemberIntroduction(memberId, today);
  return result(QA_STATUS.ANSWER, "memberProfile", {
    text: intro.sentences.join(""),
    details: [
      member.memberColor ? `メンバーカラー：${member.memberColor.name}` : null,
      member.birthday ? `誕生日：${formatQaDate(member.birthday)}${graduated ? "" : `（${ageOn(member.birthday, today)}歳）`}` : null,
      member.birthplace ? `出身：${member.birthplace}` : null,
      member.joinDate && !graduated ? `加入：${formatQaDate(member.joinDate)}` : null,
    ].filter(Boolean),
    evidence: [
      intro.usedIntroduction ? profileEvidence(profile?.introduction, "メンバー紹介（公式・本人のインタビューなど）") : null,
      intro.usedPreDebut ? profileEvidence(profile?.preDebutActivity, "加入前の活動") : null,
      intro.activities.length ? evidence(intro.representative ? "これまでの代表的な活動（個人ページと同じ印）" : "今の主な活動（個人ページと同じもの）", { urls: intro.activities.flatMap((activity) => activity.sourceUrls ?? []).slice(0, 2) }) : null,
      evidence("メンバーのプロフィール（公式サイト）", { checkedAt: member.profileSource?.lastVerifiedDate, urls: member.profileSource?.urls }),
    ].filter(Boolean),
    links: [{ ...memberLink(memberId), label: "詳しいプロフィールを見る" }],
  });
}

function firstSentence(text) {
  return splitJapaneseSentences(text)[0] ?? "";
}

// 「なぜ＝LOVE に入ったの？」「加入までの経緯は？」「昔はどんな活動？」：本人が公表したオーディション・過去の経験を詳しく（R12）
function answerJoinStory(memberId, focus) {
  const member = MEMBER_BY_ID.get(memberId);
  const profile = PROFILE_BY_ID.get(memberId);
  const isPre = focus === "preDebut";
  const main = isPre ? profile?.preDebutActivity : profile?.auditionMotivation;
  const sub = isPre ? profile?.auditionMotivation : profile?.preDebutActivity;
  const mainLabel = isPre ? "加入前の活動" : "＝LOVE に入ったきっかけ";
  const subLabel = isPre ? "＝LOVE に入ったきっかけ" : "加入前の活動";
  const intent = isPre ? "memberPreDebut" : "memberJoinReason";
  const profileLink = { ...memberLink(memberId), label: "詳しいプロフィールを見る" };
  if (!main?.text && !sub?.text) return notFound(intent, `${QA_NOT_FOUND_TEXT}${member.name}の${mainLabel}は、アプリに登録されていません。`, { links: [profileLink] });
  return result(QA_STATUS.ANSWER, intent, {
    text: main?.text ? `${member.name}の${mainLabel}：${main.text}` : `${QA_NOT_FOUND_TEXT}${member.name}の${mainLabel}は登録されていません。`,
    details: [sub?.text ? `${subLabel}：${sub.text}` : null, member.joinDate ? `加入：${formatQaDate(member.joinDate)}` : null].filter(Boolean),
    evidence: [main?.text ? profileEvidence(main, mainLabel) : null, sub?.text ? profileEvidence(sub, subLabel) : null].filter(Boolean),
    links: [profileLink],
  });
}

function answerMemberBasic(memberId, key, today) {
  const member = MEMBER_BY_ID.get(memberId);
  const ev = [evidence("メンバーのプロフィール（公式サイト）", { checkedAt: member.profileSource?.lastVerifiedDate, urls: member.profileSource?.urls })];
  const links = [memberLink(memberId)];
  if (key === "color") {
    if (!member.memberColor) return notFound("memberColor", null, { links });
    const penlight = (member.penlightColors ?? []).map((color) => color.name).join("×");
    return result(QA_STATUS.ANSWER, "memberColor", { text: `${member.name}のメンバーカラーは${member.memberColor.name}です。`, details: penlight ? [`ペンライトの色：${penlight}`] : [], evidence: ev, links });
  }
  if (key === "birthday") {
    if (!member.birthday) return notFound("memberBirthday", null, { links });
    const graduated = member.status === MEMBER_STATUS.GRADUATED;
    return result(QA_STATUS.ANSWER, "memberBirthday", { text: `${member.name}の誕生日は${formatQaDate(member.birthday)}です${graduated ? "" : `（${formatQaDate(today)}の時点で${ageOn(member.birthday, today)}歳）`}。`, evidence: ev, links });
  }
  const fields = { birthplace: ["birthplace", "出身", "memberBirthplace"], height: ["heightCm", "身長", "memberHeight"], bloodType: ["bloodType", "血液型", "memberBloodType"] };
  const [field, label, intent] = fields[key];
  if (!member[field]) return notFound(intent, `${QA_NOT_FOUND_TEXT}${member.name}の${label}は、アプリに登録されていません。`, { links });
  return result(QA_STATUS.ANSWER, intent, { text: `${member.name}の${label}は${member[field]}${field === "heightCm" ? "cm" : ""}です。`, evidence: ev, links });
}

function tvEvidence() {
  return evidence("テレビ出演の記録（＝LOVE 公式サイトのスケジュール）", { checkedAt: TV_VARIETY_CHECKED_DATE });
}

function answerMemberTv(memberId, parsed) {
  const name = nameOf(memberId);
  let records = TV_VARIETY_RECORDS.filter((record) => (record.memberIds ?? []).includes(memberId));
  if (parsed.year) records = records.filter((record) => record.date.startsWith(String(parsed.year)));
  const programs = new Set(records.map((record) => record.program));
  const regulars = parsed.year ? [] : dedupeRegulars(TV_VARIETY_REGULARS.filter((regular) => (regular.memberIds ?? []).includes(memberId)));
  const yearText = parsed.year ? `${parsed.year}年の` : "";
  if (!records.length && !regulars.length) return notFound("memberTv", `${QA_NOT_FOUND_TEXT}${name}の${yearText}テレビ出演は、アプリに登録されていません。`, { evidence: [tvEvidence()], links: [memberLink(memberId)] });
  const sorted = records.slice().sort((a, b) => b.date.localeCompare(a.date));
  return result(QA_STATUS.ANSWER, "memberTv", {
    text: `${name}の${yearText}テレビ出演（登録上）：単発の出演 ${records.length}回／${programs.size}番組${parsed.year ? "" : `／レギュラーなど ${regulars.length}件`}です。`,
    details: [
      sorted.length ? `最近の出演：${sorted.slice(0, 3).map((record) => `${formatQaDate(record.date)}「${record.program}」`).join("、")}` : null,
      regulars.length ? `レギュラーなど：${joinNames(regulars.map((regular) => `${regular.program}（${regular.kind}）`), 4)}` : null,
      "＝LOVE 名義（個人名の無い）出演と、音楽番組は数えていません。",
    ].filter(Boolean),
    evidence: [tvEvidence()],
    links: [{ label: `テレビ出演を${name}で絞って見る`, target: { kind: "tvVariety", memberId } }, memberLink(memberId)],
  });
}

function dedupeRegulars(list) {
  const seen = new Set();
  return list.filter((regular) => {
    const key = `${regular.program}|${(regular.memberIds ?? []).join(",")}|${regular.firstDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 今のレギュラー：放送の記録の最終日が、確認日（TV_VARIETY_CHECKED_DATE）の45日前より後のもの
function currentRegulars(memberId = null) {
  const border = addDays(TV_VARIETY_CHECKED_DATE, -45);
  return dedupeRegulars(TV_VARIETY_REGULARS.filter((regular) => regular.lastDate >= border && (!memberId || (regular.memberIds ?? []).includes(memberId))));
}

function answerRegulars(memberId) {
  const list = currentRegulars(memberId);
  const name = memberId ? nameOf(memberId) : null;
  const radio = memberId ? activeActivities(memberId).filter((activity) => activity.type === ACTIVITY_TYPE.RADIO) : [];
  if (!list.length && !radio.length) return notFound("regulars", `${QA_NOT_FOUND_TEXT}${name ? `${name}の` : ""}今のレギュラー番組は、アプリに登録されていません。`, { evidence: [tvEvidence()] });
  const label = (regular) => `${regular.program}（${regular.kind}${regular.memberIds?.length ? `：${regular.memberIds.map(nameOf).join("・")}` : "：＝LOVE"}）`;
  return result(QA_STATUS.ANSWER, "regulars", {
    text: `${name ? `${name}の` : "メンバーの"}今のレギュラー番組など（登録上、最近まで放送が確認できたもの）は${list.length + radio.length}件です。`,
    details: [list.length ? `テレビ：${list.map(label).join("、")}` : null, radio.length ? `ラジオ：${radio.map((activity) => activity.title).join("、")}` : null, `テレビは、公式スケジュールで${formatQaDate(TV_VARIETY_CHECKED_DATE)}までに確かめた放送の記録から判断しています。`].filter(Boolean),
    evidence: [tvEvidence()],
    links: [{ label: "テレビ出演のページで見る", target: { kind: "tvVariety", memberId: memberId ?? undefined } }],
  });
}

// 質問の中の、レギュラーなどの番組の名前（4文字以上でぴったり含まれるもの）
function findRegularProgram(parsed) {
  const strip = (name) => normalizeTerm(name.replace(/[（(].*?[)）]/g, ""));
  const hits = TV_VARIETY_REGULARS.filter((regular) => {
    const name = strip(regular.program);
    return name.length >= 4 && normalizeQuestion(parsed.raw, { removeGroupName: false }).includes(name);
  });
  if (!hits.length) return null;
  const name = strip(hits[0].program);
  return hits.filter((regular) => strip(regular.program) === name);
}

function answerProgram(regulars) {
  const memberIds = [...new Set(regulars.flatMap((regular) => regular.memberIds ?? []))];
  const first = regulars.map((regular) => regular.firstDate).sort()[0];
  const last = regulars.map((regular) => regular.lastDate).sort().at(-1);
  return result(QA_STATUS.ANSWER, "program", {
    text: `「${regulars[0].program}」（${regulars[0].kind}）に出ているのは${memberIds.length ? memberIds.map(nameOf).join("・") : "＝LOVE（メンバーの名前の登録なし）"}です（登録上）。`,
    details: [`放送の記録：${formatQaDate(first)}〜${formatQaDate(last)}`],
    evidence: [tvEvidence()],
    links: [{ label: "テレビ出演のページで見る", target: { kind: "tvVariety", query: regulars[0].program } }],
  });
}

function isActiveActivity(activity, today) {
  const status = activity.status === ACTIVITY_STATUS.UPCOMING && activity.startDate && activity.startDate <= today ? ACTIVITY_STATUS.ONGOING : activity.status;
  if (status === ACTIVITY_STATUS.ONGOING) return true;
  if (status === ACTIVITY_STATUS.LIMITED) return !activity.endDate || activity.endDate >= today;
  return false;
}

let todayForActivities = getTodayInJapan();
function activeActivities(memberId, today = todayForActivities) {
  return MEMBER_ACTIVITIES.filter((activity) => (activity.memberId === memberId || (activity.relatedMemberIds ?? []).includes(memberId)) && isActiveActivity(activity, today));
}

// 「今何をしている？」「今の仕事は？」「個人活動は？」：個人ページの「今の主な活動」と同じもの・同じ順（R12）
function answerActivities(memberId, today) {
  const name = nameOf(memberId);
  const list = currentActivitiesForMember(memberId, today);
  if (!list.length) return notFound("memberActivities", `${QA_NOT_FOUND_TEXT}${name}の今の活動は、アプリに登録されていません。`, { links: [memberLink(memberId)] });
  return result(QA_STATUS.ANSWER, "memberActivities", {
    text: `${name}の今の主な活動は、個人ページの「今の主な活動」と同じ${list.length}件です。`,
    details: list.map((activity) => `${activity.title}${activity.description ? `：${firstSentence(activity.description)}` : ""}`),
    evidence: [evidence("個人活動の記録（公式・本人の発表など）", { urls: list.flatMap((activity) => activity.sourceUrls ?? []).slice(0, 3) })],
    links: [memberLink(memberId)],
  });
}

function cmDate(cm) {
  return cm.date ?? cm.startDate ?? "";
}

function answerCommercials(memberId, parsed) {
  if (memberId) {
    const name = nameOf(memberId);
    // CM のページ（個人ページの CM の欄）と同じ数え方
    const list = getMemberCommercials(memberId);
    if (!list.length) return notFound("memberCommercials", `${QA_NOT_FOUND_TEXT}${name}の個人の CM・企業コラボは、アプリに登録されていません。`, { details: ["＝LOVE 名義（グループ）の CM は「最近の企業コラボは？」で聞けます。"], links: [memberLink(memberId)] });
    return result(QA_STATUS.ANSWER, "memberCommercials", {
      text: `${name}の個人の CM・企業コラボは、登録上${list.length}件です。`,
      details: list.slice(0, 4).map((cm) => `${formatQaDate(cmDate(cm))}：${cm.brand}`),
      evidence: [evidence("CM・企業コラボの記録", { urls: list.flatMap((cm) => cm.sourceUrls ?? []).slice(0, 2) })],
      links: [memberLink(memberId)],
    });
  }
  const list = COMMERCIALS.slice().sort((a, b) => cmDate(b).localeCompare(cmDate(a)));
  const shown = list.slice(0, 5);
  return result(QA_STATUS.ANSWER, "recentCommercials", {
    text: `登録されている CM・企業コラボの新しいものは、${formatQaDate(cmDate(shown[0]))}の「${shown[0].brand}」です。`,
    details: shown.map((cm) => `${formatQaDate(cmDate(cm))}：${cm.brand}${cm.isGroup ? "（＝LOVE）" : (cm.memberIds ?? []).length ? `（${(cm.memberIds ?? []).map(nameOf).filter(Boolean).join("・")}）` : ""}`),
    evidence: [evidence("CM・企業コラボの記録", { urls: shown.flatMap((cm) => cm.sourceUrls ?? []).slice(0, 2) })],
    links: [{ label: "CM・企業コラボのページで見る", target: { kind: "feature", action: { type: "click", selector: '[data-home-action="commercials"]' } } }],
  });
}

function answerWorks(memberId, kind) {
  const name = nameOf(memberId);
  const pools = { stage: STAGE_PRODUCTIONS, voice: VOICE_APPEARANCES };
  const label = { stage: "舞台", voice: "声優（アニメ・ゲームなど）" }[kind];
  const list = (pools[kind] ?? []).filter((work) => (work.casts ?? []).some((cast) => cast.memberId === memberId)).sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
  if (!list.length) return notFound(`member${kind}`, `${QA_NOT_FOUND_TEXT}${name}の${label}の出演は、アプリに登録されていません。`, { links: [memberLink(memberId)] });
  return result(QA_STATUS.ANSWER, `member${kind}`, {
    text: `${name}の${label}の出演は、登録上${list.length}件です。`,
    details: list.slice(0, 5).map((work) => {
      const role = work.casts.find((cast) => cast.memberId === memberId)?.role;
      return `${work.yearLabel}「${work.title}」${role ? `（${role}）` : ""}`;
    }),
    evidence: [evidence("舞台・声優の出演記録", { urls: list.flatMap((work) => (work.links ?? []).map((link) => link.url)).slice(0, 2) })],
    links: [memberLink(memberId)],
  });
}

function answerDrama(memberId) {
  const name = nameOf(memberId);
  const list = MEMBER_ACTIVITIES.filter((activity) => (activity.memberId === memberId || (activity.relatedMemberIds ?? []).includes(memberId)) && /ドラマ|映画/.test(`${activity.title}${activity.description ?? ""}`));
  if (!list.length) return notFound("memberDrama", `${QA_NOT_FOUND_TEXT}${name}のドラマ・映画の出演は、アプリに登録されていません。`, { links: [memberLink(memberId)] });
  return result(QA_STATUS.ANSWER, "memberDrama", {
    text: `${name}のドラマ・映画の出演（登録上）は${list.length}件です。`,
    details: list.slice(0, 5).map((activity) => `${activity.startDate ? `${formatQaDate(activity.startDate)}：` : ""}${activity.title}`),
    evidence: [evidence("個人活動の記録", { urls: list.flatMap((activity) => activity.sourceUrls ?? []).slice(0, 2) })],
    links: [memberLink(memberId)],
  });
}

// ---- YouTube ----

function answerYoutube(memberIds, parsed) {
  const snapshot = getYoutubeAppearanceSnapshot();
  const all = (snapshot?.videos ?? []).filter(isConfirmedAppearance);
  if (!all.length) return notFound("youtube", "YouTube 出演のデータを読み込めていないため、確認できません。", { details: ["通信できるときに、YouTube 出演図鑑を開いてから、もう一度聞いてください。"], links: [{ label: "YouTube 出演図鑑を開く", target: { kind: "youtubeAppearances" } }] });
  let videos = all;
  if (memberIds.length) videos = videos.filter((video) => memberIds.every((id) => allAppearingMemberIds(video).includes(id)));
  if (parsed.year) videos = videos.filter((video) => Number(youtubeVideoYear(video)) === parsed.year);
  const who = memberIds.length ? memberIds.map(nameOf).join("と") : "＝LOVE";
  const yearText = parsed.year ? `${parsed.year}年の` : "";
  if (!videos.length) return notFound("youtube", `${QA_NOT_FOUND_TEXT}${who}が出演した${yearText}動画は、YouTube 出演図鑑に登録されていません。`, { links: [{ label: "YouTube 出演図鑑を開く", target: { kind: "youtubeAppearances", memberIds, year: parsed.year ?? undefined } }] });
  const old = parsed.has("past");
  const sorted = videos.slice().sort((a, b) => String(a.publishedAt).localeCompare(String(b.publishedAt)) * (old ? 1 : -1));
  return result(QA_STATUS.ANSWER, "youtube", {
    text: `${who}が出演した${yearText}動画は、YouTube 出演図鑑に${videos.length}本あります（公式チャンネル「イコラブ ノイミー ニアジョイ チャンネル」）。`,
    details: [`${old ? "古い順" : "新しい順"}：${sorted.slice(0, 3).map((video) => `「${video.title}」（${String(video.publishedAt).slice(0, 10)}）`).join("、")}`, "出演者の判定には、説明欄などからの推定を含みます（図鑑の表示と同じ）。"],
    evidence: [evidence("YouTube 出演図鑑（YouTube のデータ）", { checkedAt: snapshot.data?.fetchedAt ? String(snapshot.data.fetchedAt).slice(0, 10) : null })],
    links: [{ label: "YouTube 出演図鑑で見る", target: { kind: "youtubeAppearances", memberIds, year: parsed.year ?? undefined } }],
  });
}

// ---- ライブ ----

function liveEvidence() {
  return evidence("ライブの記録（代表的な単独公演・ツアー・フェスなどを登録。すべての出演ではありません）");
}

function answerLivesInYear(year, today) {
  const list = LIVE_EVENTS.filter((event) => {
    const start = Number(String(event.startDate).slice(0, 4));
    const end = Number(String(event.endDate ?? event.startDate).slice(0, 4));
    return start <= year && year <= end && event.status !== LIVE_STATUS.CANCELLED;
  }).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  if (!list.length) return notFound("livesInYear", `${QA_NOT_FOUND_TEXT}${year}年のライブは、アプリに登録されていません。`, { evidence: [liveEvidence()] });
  return result(QA_STATUS.ANSWER, "livesInYear", {
    text: `${year}年のライブは、登録上${list.length}件です。`,
    details: list.map((event) => `${event.title}（${formatQaDate(event.startDate)}${event.endDate && event.endDate !== event.startDate ? `〜${formatQaDate(event.endDate)}` : ""}）${event.startDate > today ? "※予定" : ""}`),
    evidence: [liveEvidence()],
    links: list.slice(0, 3).map((event) => ({ label: `ライブページで「${event.title}」を見る`, target: { kind: "liveHub", view: "history", liveId: event.id } })),
  });
}

function answerLiveByName(parsed) {
  const residual = residualText(parsed, [...P.live, ...P.releaseDate, "どこ", "会場", "開催", "行われた"]);
  if (residual.length < 3) return null;
  const list = LIVE_EVENTS.filter((event) => normalizeTerm(event.title).includes(residual));
  if (!list.length) return null;
  if (list.length > 1) {
    return result(QA_STATUS.CANDIDATES, "liveByName", {
      text: "いくつかのライブが当てはまります。どれのことですか？",
      candidates: list.slice(0, 6).map((event) => ({ label: event.title, target: { kind: "liveHub", view: "history", liveId: event.id } })),
      evidence: [liveEvidence()],
    });
  }
  const event = list[0];
  return result(QA_STATUS.ANSWER, "liveByName", {
    text: `「${event.title}」は${formatQaDate(event.startDate)}${event.endDate && event.endDate !== event.startDate ? `〜${formatQaDate(event.endDate)}` : ""}です。`,
    details: [(event.venues ?? []).length ? `会場：${joinNames(event.venues.map((venue) => venue.name).filter(Boolean), 4)}` : null].filter(Boolean),
    evidence: [evidence("ライブの記録", { checkedAt: event.lastVerifiedDate, urls: event.sourceUrls })],
    links: [{ label: "ライブページで見る", target: { kind: "liveHub", view: "history", liveId: event.id } }],
  });
}

// ---- 特典映像 ----

// 質問から、見つけた固有名詞・聞き方の言葉を除いた残り
function residualText(parsed, extraWords = []) {
  let text = parsed.loose;
  parsed.entities.forEach((entity) => {
    text = text.split(entity.term).join(" ");
  });
  [...normalizePhrases(extraWords), ...FILLERS].sort((a, b) => b.length - a.length).forEach((word) => {
    text = text.split(word).join(" ");
  });
  // 取り除いた残りの、1文字だけのひらがな（「入ってる」の「る」など）は言葉にしない
  return text.split(/\s+/).filter((piece) => piece && !(piece.length <= 1 && /^[ぁ-ゖ]$/.test(piece))).join("");
}

function bonusCategoriesIn(parsed) {
  return BONUS_CATEGORY_WORDS.filter((category) => includesAny(parsed.loose, category.words)).map((category) => category.id);
}

function answerBonus(parsed) {
  const workId = parsed.workIds[0] ?? (parsed.songIds.length ? SONG_BY_ID.get(parsed.songIds[0])?.workId : null) ?? (parsed.workNumber ? SINGLES.find((work) => work.number === parsed.workNumber)?.workId : null);
  const work = workId ? WORK_BY_ID.get(workId) : null;
  if (work && parsed.typeLetter) return answerTypeContents(work, parsed.typeLetter);
  const categories = bonusCategoriesIn(parsed);
  // 条件2つ以上：「2024年のCDでライブ映像が入ったもの」
  if (parsed.year) {
    const works = CD_BONUS_WORKS.filter((entry) => entry.releaseDate.startsWith(String(parsed.year)));
    const rows = works.flatMap((entry) => entry.types.flatMap((type) => type.videos.filter((video) => !categories.length || categories.some((id) => video.categories.includes(id))).map((video) => ({ work: entry, type, video }))));
    const byType = new Map();
    rows.forEach((row) => {
      const key = `${row.work.workId}:${row.type.id}`;
      if (!byType.has(key)) byType.set(key, { ...row, count: 0 });
      byType.get(key).count += 1;
    });
    const categoryText = categories.length ? categories.map(cdBonusCategoryLabel).join("・") : "映像";
    if (!byType.size) return notFound("bonusByYear", `${QA_NOT_FOUND_TEXT}${parsed.year}年に出た CD で、${categoryText}が入ったものは登録されていません。`, { evidence: [cdEvidence()] });
    const list = [...byType.values()];
    return result(QA_STATUS.ANSWER, "bonusByYear", {
      text: `${parsed.year}年に出た CD で、${categoryText}が入っているのは${list.length}つの TYPE です。`,
      details: list.map((row) => {
        const titles = rows.filter((entry) => entry.work === row.work && entry.type === row.type).map((entry) => entry.video.title);
        return `${cdBonusWorkLabel(row.work)}「${row.work.title}」${row.type.name}：${joinNames(titles, 2)}`;
      }),
      evidence: [cdEvidence()],
      links: list.slice(0, 3).map((row) => cdBonusLink(row.work.workId, row.type.id, null, `${row.work.title} ${row.type.name} を見る`)),
    });
  }
  if (work && !categories.length) {
    const types = work.types.filter((type) => type.videos.length);
    if (!types.length) return notFound("bonusOfWork", `「${work.title}」には映像の入った TYPE がありません（すべて CD のみ）。`, { evidence: [cdEvidence()], links: [cdBonusLink(work.workId)] });
    return result(QA_STATUS.ANSWER, "bonusOfWork", {
      text: `${cdBonusWorkLabel(work)}「${work.title}」で映像が入っているのは Type-${types.map((type) => type.id).join("・")} です。`,
      details: types.map((type) => `${type.name}：${joinNames(type.videos.map((video) => video.title), 3)}`),
      evidence: [cdEvidence()],
      links: [cdBonusLink(work.workId)],
    });
  }
  // 言葉で探す（関連の言葉はぴったり、題名は含まれていれば。「富士山」で「富士急」を出さない）
  const residual = residualText(parsed, [...P.whichCd, ...P.bonus, ...P.cd, ...BONUS_CATEGORY_WORDS.flatMap((category) => category.words)]);
  let groups = [];
  if (residual.length >= 1) groups = filterCdBonusVideos({ query: residual, category: categories.length === 1 ? categories[0] : CD_BONUS_ALL });
  if (!groups.length && !residual && categories.length) groups = filterCdBonusVideos({ category: categories[0] });
  const rows = groups.flatMap((group) => group.rows);
  if (!rows.length) {
    const word = residual || categories.map(cdBonusCategoryLabel).join("・");
    return notFound("bonusSearch", `${QA_NOT_FOUND_TEXT}${word ? `「${word}」の` : ""}特典映像は、CD・特典映像図鑑に登録されていません。`, {
      details: ["図鑑は、公式サイトの題名に出てくる言葉とぴったり同じ言葉で探します（似た言葉の映像は出しません）。"],
      evidence: [cdEvidence()],
      links: [{ label: "CD・特典映像図鑑で探す", target: { kind: "cdBonus" } }],
    });
  }
  return result(QA_STATUS.ANSWER, "bonusSearch", {
    text: rows.length === 1
      ? `「${rows[0].video.title}」は、${cdBonusWorkLabel(rows[0].work)}「${rows[0].work.title}」の ${rows[0].type.name}（${describeCdBonusType(rows[0].type)}）に入っています。`
      : `当てはまる特典映像は${rows.length}本です。`,
    details: rows.length === 1 ? [] : rows.slice(0, 6).map((row) => `${row.video.title} → ${cdBonusWorkLabel(row.work)}「${row.work.title}」${row.type.name}`).concat(rows.length > 6 ? [`ほか${rows.length - 6}本`] : []),
    evidence: [cdEvidence()],
    links: rows.slice(0, 3).map((row) => cdBonusLink(row.work.workId, row.type.id, row.video.id, `${row.work.title} ${row.type.name} の映像を開く`)),
  });
}

// ---- 最新情報 ----

function answerNews(parsed) {
  if (parsed.workNumber && !parsed.songIds.length) return answerWorkByNumber(parsed.workNumber, parsed);
  const snapshot = getQaNewsSnapshot();
  if (snapshot.state !== QA_NEWS_STATE.READY) {
    return notFound("news", "最新情報（公式 NEWS）のデータを読み込めていないため、新しい発表は確認できません。", { details: ["発表を確かめるときは、＝LOVE 公式サイトの NEWS を見てください。"], evidence: [newsEvidence(snapshot)] });
  }
  let items = snapshot.items;
  if (parsed.memberIds.length) items = items.filter((item) => parsed.memberIds.some((id) => (item.memberIds ?? []).includes(id)));
  items = items.slice().sort((a, b) => String(b.publishedOn).localeCompare(String(a.publishedOn)));
  const who = parsed.memberIds.map(nameOf).join("・");
  if (!items.length) return notFound("news", `${QA_NOT_FOUND_TEXT}${who ? `${who}に関する` : ""}最新情報は見つかりませんでした。`, { evidence: [newsEvidence(snapshot)] });
  return result(QA_STATUS.ANSWER, "news", {
    text: `${who ? `${who}に関する` : ""}新しい公式の発表は「${items[0].title}」（${formatQaDate(items[0].publishedOn)}）です。`,
    details: items.slice(1, 5).map((item) => `${formatQaDate(item.publishedOn)}：${item.title}`),
    evidence: [newsEvidence(snapshot)],
    links: items.slice(0, 3).map((item) => ({ label: `公式の発表を開く：${item.title}`, url: item.url })),
  });
}

// ---- グループ ----

function answerLeader() {
  const leaders = MEMBERS.filter((member) => (member.roles ?? []).includes("リーダー"));
  if (!leaders.length) return notFound("leader", null);
  return result(QA_STATUS.ANSWER, "leader", { text: `＝LOVE のリーダーは${leaders.map((member) => member.name).join("・")}です。`, evidence: [evidence("メンバーのデータ（役割）")], links: leaders.map((member) => memberLink(member.id)) });
}

function answerMemberList(graduatedOnly = false) {
  const list = MEMBERS.filter((member) => (graduatedOnly ? member.status === MEMBER_STATUS.GRADUATED : member.status === MEMBER_STATUS.ACTIVE));
  return result(QA_STATUS.ANSWER, graduatedOnly ? "graduatedMembers" : "memberList", {
    text: graduatedOnly ? `＝LOVE の元メンバーは、登録上${list.length}人です：${list.map((member) => member.name).join("・")}。` : `今の＝LOVE のメンバーは${list.length}人です：${list.map((member) => member.name).join("・")}。`,
    evidence: [evidence("メンバーのデータ")],
    links: [{ label: "メンバー紹介を見る", target: { kind: "membersList", memberId: list[0]?.id } }],
  });
}

// ---- アプリの機能・受け皿（全体検索） ----

let searchEntries = null;
let searchModule = null;
// 全体検索は大きいので、要るときだけ読み込む（質問AIの最初の表示を軽くする）
export async function prepareQaSearch() {
  if (searchEntries) return;
  searchModule = await import("./appSearchIndex.js");
  searchEntries = searchModule.buildAppSearchEntries();
}

function searchCandidates(text, category = "all", limit = 5) {
  if (!searchEntries) return [];
  const words = normalizePhrases([...QA_INTENT_PHRASES.feature, "は", "の", "を", "って", "どこ", "ですか", "ある", "見る", "したい", "したいです"]);
  let query = String(text);
  const tokens = [];
  // 全体検索は空白で区切った言葉が全部当たる必要があるので、質問から聞き方の言葉を外してから探す
  let normalized = normalizeQuestion(query, { removeGroupName: false });
  words.sort((a, b) => b.length - a.length).forEach((word) => (normalized = normalized.split(word).join(" ")));
  normalized.split(/\s+/).filter((token) => token.length >= 2).forEach((token) => tokens.push(token));
  if (!tokens.length) return [];
  const { results } = searchModule.searchAppEntries(searchEntries, tokens.join(" "), category);
  return results.slice(0, limit).map(({ entry }) => ({ label: entry.title, sublabel: entry.categoryLabel, target: entry.action?.target ?? null }));
}

function answerFeature(parsed) {
  const candidates = searchCandidates(parsed.raw, "feature", 3);
  if (!candidates.length) return null;
  return result(QA_STATUS.ANSWER, "feature", {
    text: `「${candidates[0].label}」の機能が当てはまります。`,
    details: candidates.slice(1).map((candidate) => `ほかの候補：${candidate.label}`),
    evidence: [evidence("アプリの機能の一覧（全体検索）")],
    links: candidates.filter((candidate) => candidate.target).map((candidate) => ({ label: `「${candidate.label}」を開く`, target: candidate.target })),
  });
}

function unknownResult(parsed) {
  const candidates = searchCandidates(parsed.raw);
  return result(QA_STATUS.UNKNOWN, "unknown", {
    text: candidates.length ? "質問の形を読み取れませんでした。こちらの情報を探していますか？" : "質問の形を読み取れませんでした。曲名・メンバー名・作品の番号などを入れて、聞き直してください。",
    candidates,
    details: ["例：「呪って呪っては何枚目？」「野口衣織がセンターの曲は？」「人狼の特典映像はどのCD？」"],
  });
}

// ---- あいまいなメンバー ----

function memberCandidates(parsed) {
  const group = parsed.ambiguousMembers[0];
  const original = parsed.raw;
  return result(QA_STATUS.CANDIDATES, "ambiguousMember", {
    text: "当てはまるメンバーが複数います。どちらのことですか？",
    candidates: group.ids.map((id) => {
      const member = MEMBER_BY_ID.get(id);
      const replaced = replaceLoosely(original, group.term, member.name);
      return { label: `${member.name}${member.status === MEMBER_STATUS.GRADUATED ? "（元メンバー）" : ""}`, question: replaced };
    }),
    evidence: [evidence("メンバーのデータ")],
  });
}

// 質問の中の、ある言葉（正規化した形）に当たる部分を名前に置き換える（候補の「聞き直す」用）
function replaceLoosely(original, normalizedTerm, name) {
  for (let start = 0; start < original.length; start += 1) {
    for (let end = start + 1; end <= original.length; end += 1) {
      if (normalizeQuestion(original.slice(start, end), { removeGroupName: false }) === normalizedTerm) return `${original.slice(0, start)}${name}${original.slice(end)}`;
    }
  }
  return `${name} ${original}`;
}

// ---- 誤字（固有名詞が1つも見つからないとき）：曲名・メンバー名と1〜2文字違いのものを「もしかして」の候補に出す。決めつけて答えない ----
function typoCandidates(parsed) {
  const found = [];
  const consider = (kind, id, label, term) => {
    const normalized = normalizeTerm(term);
    if (normalized.length < 3) return;
    const maxDistance = normalized.length >= 7 ? 2 : 1;
    const hit = findApproximateSubstring(parsed.loose, normalized, maxDistance);
    if (hit && hit.distance > 0) found.push({ kind, id, label, term: normalized, distance: hit.distance, end: hit.end });
  };
  SONGS.forEach((song) => song.id !== "love" && consider("song", song.id, song.title, song.title));
  MEMBERS.forEach((member) => consider("member", member.id, member.name, member.name));
  if (!found.length) return null;
  found.sort((a, b) => a.distance - b.distance || b.term.length - a.term.length);
  const best = found.filter((entry) => entry.distance === found[0].distance).slice(0, 3);
  return result(QA_STATUS.CANDIDATES, "typo", {
    text: "名前を読み取れませんでした。もしかして、こちらですか？（押すと、その名前で聞き直します）",
    candidates: best.map((entry) => ({ label: entry.label, question: replaceApproximate(parsed.raw, entry.label) })),
  });
}

// 誤字の部分を正しい名前に置き換えた質問（いちばん近い部分を探す。見つからなければ名前を前に足す）
function replaceApproximate(original, name) {
  const target = normalizeTerm(name);
  let best = null;
  for (let start = 0; start < original.length; start += 1) {
    for (let end = start + 1; end <= Math.min(original.length, start + name.length + 3); end += 1) {
      const piece = normalizeQuestion(original.slice(start, end), { removeGroupName: false });
      if (!piece) continue;
      const hit = findApproximateSubstring(piece, target, 2);
      if (hit && piece.length >= target.length - 2 && piece.length <= target.length + 2) {
        const score = hit.distance * 10 + Math.abs(piece.length - target.length);
        if (!best || score < best.score) best = { start, end, score };
      }
    }
  }
  return best ? `${original.slice(0, best.start)}${name}${original.slice(best.end)}` : `${name} ${original}`;
}

// ===== 型の判定と答え =====

function decide(parsed, today) {
  const has = parsed.has;
  const memberId = parsed.memberIds[0] ?? null;
  const song = parsed.songIds.length ? SONG_BY_ID.get(parsed.songIds[0]) : null;
  const workFromEntity = parsed.workIds.length ? WORK_BY_ID.get(parsed.workIds[0]) : null;

  if (!parsed.loose) return result(QA_STATUS.UNKNOWN, "empty", { text: "質問を入れてください。", note: "" });
  if (has("speculation")) {
    return result(QA_STATUS.REFUSE, "speculation", {
      text: "推測や好みの質問には答えられません。アプリに登録された事実だけを答えます。",
      details: ["発表された情報を知りたいときは、「最新情報」や公式サイトを見てください。"],
    });
  }
  if (parsed.ambiguousMembers.length && !memberId) return memberCandidates(parsed);
  if (has("lyricist")) {
    return notFound("lyricist", `${QA_NOT_FOUND_TEXT}作詞・作曲・振り付けの情報は、アプリにまだ登録されていません。`, { details: ["曲のクレジットは、＝LOVE 公式サイトの DISCOGRAPHY で確かめられます。"], links: song ? [songLink(song.id)] : [] });
  }
  // 特典映像・TYPE の中身
  const bonusKeyword = has("bonus") || (parsed.typeLetter && (song || workFromEntity || parsed.workNumber)) || (has("whichCd") && !song && !memberId);
  if (bonusKeyword && !has("musicTv")) return answerBonus(parsed);
  if (has("news") && !song) return answerNews(parsed);
  // センター
  if (has("center")) {
    if (song) return answerCenterOfSong(song);
    if (parsed.workNumber) return answerWorkByNumber(parsed.workNumber, parsed);
    if (workFromEntity) return answerCenterOfSong(titleTrackOf(workFromEntity), workFromEntity);
    if (memberId) return answerSongsCenteredBy(memberId);
  }
  if (song && (has("workNumberQuestion") || has("whichCd"))) return answerWorkNumberOfSong(song);
  if (workFromEntity && has("workNumberQuestion")) return answerWorkNumberOfSong(titleTrackOf(workFromEntity));
  if (parsed.workNumber && !memberId && (has("single") || has("album")) && !has("youtube") && !has("live")) {
    const pool = has("album") ? CD_BONUS_WORKS.filter((entry) => entry.kind === "album") : SINGLES;
    const numbered = pool.find((entry) => entry.number === parsed.workNumber);
    if (numbered && has("tracks")) return answerTracks(numbered);
    if (numbered && has("releaseDate")) return answerReleaseDate(null, numbered);
    return answerWorkByNumber(parsed.workNumber, parsed);
  }
  if ((song || workFromEntity) && has("tracks")) return answerTracks(workFromEntity ?? workOfSong(song) ?? null, parsed.typeLetter);
  if (song && has("musicTv")) return answerMusicTvOfSong(song);
  if ((song || workFromEntity) && has("releaseDate")) return answerReleaseDate(song, workFromEntity && !song ? workFromEntity : null);
  if (has("youtube")) return answerYoutube(parsed.memberIds, parsed);
  // メンバー
  if (memberId) {
    if (has("joinDate") || (parsed.loose.includes("いつ") && has("joinReason"))) {
      const member = MEMBER_BY_ID.get(memberId);
      if (member.joinDate) return result(QA_STATUS.ANSWER, "memberJoinDate", { text: `${member.name}の＝LOVE への加入は${formatQaDate(member.joinDate)}です。`, evidence: [evidence("メンバーのデータ（加入日）")], links: [memberLink(memberId)] });
    }
    if (has("preDebut")) return answerJoinStory(memberId, "preDebut");
    if (has("joinReason")) return answerJoinStory(memberId, "joinReason");
    if (has("color")) return answerMemberBasic(memberId, "color", today);
    if (has("birthday")) return answerMemberBasic(memberId, "birthday", today);
    if (has("birthplace")) return answerMemberBasic(memberId, "birthplace", today);
    if (has("height")) return answerMemberBasic(memberId, "height", today);
    if (has("bloodType")) return answerMemberBasic(memberId, "bloodType", today);
    if (has("radio")) {
      const radio = MEMBER_ACTIVITIES.filter((activity) => activity.type === ACTIVITY_TYPE.RADIO && (activity.memberId === memberId || (activity.relatedMemberIds ?? []).includes(memberId)));
      const name = nameOf(memberId);
      if (!radio.length) return notFound("memberRadio", `${QA_NOT_FOUND_TEXT}${name}のラジオの活動は、アプリに登録されていません。`, { links: [memberLink(memberId)] });
      const current = radio.filter((activity) => isActiveActivity(activity, today));
      return result(QA_STATUS.ANSWER, "memberRadio", {
        text: `${name}のラジオ（登録上）は${radio.length}件${current.length ? `で、今も続いているのは${current.length}件` : ""}です。`,
        details: radio.slice(0, 5).map((activity) => `${activity.title}${isActiveActivity(activity, today) ? "（継続中）" : ""}`),
        evidence: [evidence("個人活動の記録", { urls: radio.flatMap((activity) => activity.sourceUrls ?? []).slice(0, 2) })],
        links: [memberLink(memberId)],
      });
    }
    if (has("regular")) return answerRegulars(memberId);
    if (has("cm")) return answerCommercials(memberId, parsed);
    if (has("stage")) return answerWorks(memberId, "stage");
    if (has("voice")) return answerWorks(memberId, "voice");
    if (has("drama")) return answerDrama(memberId);
    if (has("tv")) return answerMemberTv(memberId, parsed);
    if (has("activities") || has("nowWork")) return answerActivities(memberId, today);
    return answerMemberProfile(memberId, today);
  }
  const program = findRegularProgram(parsed);
  if (program) return answerProgram(program);
  if (has("regular")) return answerRegulars(null);
  if (has("cm")) return answerCommercials(null, parsed);
  if (has("live")) {
    if (parsed.year) return answerLivesInYear(parsed.year, today);
    const named = answerLiveByName(parsed);
    if (named) return named;
  }
  if (has("leader")) return answerLeader();
  if (has("graduated")) return answerMemberList(true);
  if (has("memberCount")) return answerMemberList(false);
  if (song) {
    const work = workOfSong(song);
    return result(QA_STATUS.ANSWER, "songSummary", {
      text: work ? `「${song.title}」は、${cdBonusWorkLabel(work)}「${work.title}」の曲です（${formatQaDate(work.releaseDate)}発売）。` : `「${song.title}」（${song.single}）`,
      details: [centerText(song) ? `センター：${centerText(song)}` : null, work ? describeTypeSpread(work, song.id) : null].filter(Boolean),
      evidence: [songEvidence()],
      links: [songLink(song.id), ...(work ? [workLink(work.workId)] : [])],
    });
  }
  if (workFromEntity) return answerTracks(workFromEntity);
  if (!parsed.entities.length) {
    const typo = typoCandidates(parsed);
    if (typo) return typo;
  }
  if (has("feature")) {
    const feature = answerFeature(parsed);
    if (feature) return feature;
  }
  return unknownResult(parsed);
}

// 質問に答える。options.today（日付のテスト用）
export function answerQuestion(text, options = {}) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const today = options.today ?? getTodayInJapan();
  todayForActivities = today;
  const parsed = parseQuestion(text);
  let answer;
  try {
    answer = decide(parsed, today);
  } catch (error) {
    answer = result(QA_STATUS.UNKNOWN, "error", { text: "答えを作れませんでした。言い方を変えて聞き直してください。", details: [] });
  }
  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { ...answer, question: parsed.raw, tookMs: Math.round((ended - started) * 10) / 10 };
}

export { parseQuestion as parseQaQuestion, normalizeSearchText as qaNormalizeSearchText };
