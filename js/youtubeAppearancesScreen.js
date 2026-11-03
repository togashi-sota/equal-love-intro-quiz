// 「YouTube 出演図鑑」の画面（#youtube-appearances-screen。2026-11-02新設・本人の依頼 R10-1）。
// 公式チャンネル「イコラブ ノイミー ニアジョイ チャンネル」の動画のうち、＝LOVE のメンバーが出ている動画を、推しメン別に探せるようにする。
// ・絞り込み：メンバー（1人／複数。いずれか・全員）・年・キーワード・種類（通常／Shorts／ライブ配信）・並び（古い順〈初め〉／新しい順）
// ・動画のカード：YouTube のサムネイル（i.ytimg.com の画像をその場で表示。保存しない）・タイトル・公開日・出演メンバー・種類・［YouTube で見る］
//   画像が読めないとき（オフライン・消えた動画など）は、文字だけの代わりの表示にする
// ・出演の根拠（説明欄の公式の出演者の表記・タイトルの名前など）と確認の状態をカードごとに見られる。推定・未確認は印を付ける
// ・条件・表示した件数は、この画面を離れても保つ（［戻る］で帰ってきたときに元のまま。スクロールの位置は main.js が保つ）
// データは data/youtube-appearances.json（公開のたびに作るファイル。js/youtubeAppearanceData.js が読む）を読むだけ。利用者に API キーやダウンロードは要らない。
// 【2026-11-03】30日ルール：データの取得から30日を過ぎたら、動画の情報を出さずに「更新が止まっています」と案内する。
//   出演の形：企画に出演（memberIds）と、ライブ映像などで映像に登場（footageMemberIds）を分けて表示する。
import { YOUTUBE_CHANNEL, YOUTUBE_TERMS_URL, GOOGLE_PRIVACY_POLICY_URL } from "./data/youtubeAppearances.js";
import { APPEARANCE_CONFIDENCE_LABELS, confidenceOf } from "./youtubeAppearanceAudit.js";
import { YOUTUBE_DATA_STATE, getYoutubeAppearanceSnapshot, loadYoutubeAppearanceData, onYoutubeAppearanceDataChange } from "./youtubeAppearanceData.js";
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import {
  APPEARANCE_STATUS,
  APPEARANCE_STATUS_LABELS,
  YOUTUBE_DEFAULT_FILTER,
  YOUTUBE_KIND_LABELS,
  availableYoutubeKinds,
  availableYoutubeYears,
  countYoutubeByMember,
  describeYoutubeEvidence,
  filterYoutubeVideos,
  formatYoutubeDate,
  isDefaultYoutubeFilter,
  youtubeThumbnailUrl,
  youtubeVideoYear,
  youtubeWatchUrl,
} from "./youtubeAppearancesModel.js";

// 一度に出す本数（続きは［もっと見る］）。画像を一度にたくさん読まないように
export const YOUTUBE_PAGE_SIZE = 24;

export const YOUTUBE_RIGHTS_NOTE = "サムネイルは YouTube が提供する画像をその場で表示しています（アプリには保存しません）。動画・画像の権利は各権利者に帰属します。";

let container = null;
let callbacks = {};
// source：今の画面が使うデータ。state は js/youtubeAppearanceData.js の YOUTUBE_DATA_STATE。injected＝テストで差し替えた
let source = { state: YOUTUBE_DATA_STATE.IDLE, videos: [], data: null, channel: YOUTUBE_CHANNEL, injected: false };
let unsubscribeData = null;
// サムネイルの URL の作り方（テストでは YouTube に繋がないものに差し替える）
let thumbnailUrlOf = youtubeThumbnailUrl;
let resultsElement = null;
let countElement = null;
let resetButton = null;
let modeRow = null;
let memberHint = null;
const controls = {};
const state = { ...YOUTUBE_DEFAULT_FILTER, memberIds: [] };
let shownCount = YOUTUBE_PAGE_SIZE;
const memberById = new Map(MEMBERS.map((member) => [member.id, member]));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function formatIsoDay(iso) {
  const [year, month, day] = String(iso ?? "").slice(0, 10).split("-").map(Number);
  return year ? `${year}年${month}月${day}日` : "";
}

function externalIcon() {
  const svgNs = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNs, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("class", "yta-external-icon");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", "M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5");
  icon.appendChild(path);
  return icon;
}

function buildMemberTag(memberId) {
  const member = memberById.get(memberId);
  const tag = el("span", "yta-member");
  const dot = el("i", "yta-member-dot");
  dot.setAttribute("aria-hidden", "true");
  if (member?.memberColor?.hex) dot.style.background = member.memberColor.hex;
  tag.append(dot, document.createTextNode(member?.name ?? memberId));
  if (member?.status === MEMBER_STATUS.GRADUATED) tag.appendChild(el("small", "yta-member-former", "元"));
  return tag;
}

// サムネイル：画像が読めなければ、文字の代わりの表示に切り替える
function buildThumbnail(video) {
  const link = el("a", "yta-thumb");
  link.href = youtubeWatchUrl(video);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  // 同じ行き先の［YouTube で見る］があるので、読み上げ・Tab では飛ばす（指で押す所としてだけ使う）
  link.tabIndex = -1;
  link.setAttribute("aria-hidden", "true");
  if (video.kind === "short") link.classList.add("is-short");
  const fallback = el("span", "yta-thumb-fallback");
  fallback.append(el("span", "yta-thumb-fallback-mark", "▶"), el("span", "yta-thumb-fallback-text", "画像を表示できません"));
  const image = el("img", "yta-thumb-image");
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.width = 320;
  image.height = 180;
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => link.classList.add("is-broken"), { once: true });
  image.src = thumbnailUrlOf(video.id);
  link.append(fallback, image);
  if (video.kind !== "video") link.appendChild(el("span", `yta-kind yta-kind--${video.kind}`, YOUTUBE_KIND_LABELS[video.kind] ?? ""));
  return link;
}

function buildCard(video) {
  const item = el("li", "yta-card");
  item.dataset.id = video.id;
  item.appendChild(buildThumbnail(video));
  const body = el("div", "yta-body");
  const meta = el("p", "yta-meta");
  meta.appendChild(el("span", "yta-date", formatYoutubeDate(video)));
  meta.appendChild(el("span", "yta-kind-text", YOUTUBE_KIND_LABELS[video.kind] ?? ""));
  body.appendChild(meta);
  body.appendChild(el("p", "yta-title", video.title));

  // 【R11】出演者の確かさは4つだけ（確認済み・一部確認・推定・未確認）。確認済みは印を出さず、ほかは印と短い一言を出す
  const confidence = confidenceOf(video);
  const people = el("div", "yta-people");
  if (confidence !== "confirmed") people.classList.add("is-uncertain");
  if (video.memberIds?.length) video.memberIds.forEach((memberId) => people.appendChild(buildMemberTag(memberId)));
  else if (confidence !== "unconfirmed") people.appendChild(el("span", "yta-badge is-group", "＝LOVE（出演者は未確認）"));
  // 【2026-11-03 R11 最終】名前が1人も無いのに「推定」などを並べると意味が矛盾して見えるので、名前があるときだけ確かさの印を出す
  if (confidence !== "confirmed" && (video.memberIds?.length || confidence === "unconfirmed")) people.appendChild(el("span", `yta-badge is-${confidence}`, APPEARANCE_CONFIDENCE_LABELS[confidence]));
  if (video.verified) people.appendChild(el("span", "yta-badge is-verified", "本人が確認"));
  body.appendChild(people);
  if (video.memberIds?.length && (confidence === "estimated" || confidence === "partial")) body.appendChild(el("p", "yta-uncertain-note", "ほかの出演者は分かっていません"));
  // 映像で登場した人（ライブ映像・過去の映像・回想など）。企画の出演者と見分けがつくように、別の行に控えめに出す
  if (video.footageMemberIds?.length) {
    const footage = el("div", "yta-people yta-people--footage");
    footage.appendChild(el("span", "yta-footage-label", "映像で登場"));
    video.footageMemberIds.forEach((memberId) => footage.appendChild(buildMemberTag(memberId)));
    body.appendChild(footage);
  }

  item.appendChild(body);

  // 下の段（サムネイルの下まで広げる）：［YouTube で見る］と、たたんだ「出演の根拠・内容」
  const actions = el("div", "yta-actions");
  const watch = el("a", "yta-watch", "YouTube で見る");
  watch.href = youtubeWatchUrl(video);
  watch.target = "_blank";
  watch.rel = "noopener noreferrer";
  watch.setAttribute("aria-label", `「${video.title}」（${formatYoutubeDate(video)}）を YouTube で見る（新しいタブ）`);
  watch.appendChild(externalIcon());
  actions.appendChild(watch);
  const why = el("details", "yta-why");
  why.appendChild(el("summary", "yta-why-summary", "くわしく（出演の根拠）"));
  const list = el("ul", "yta-why-list");
  // 一般の人に分かる言葉で、まず「どのくらい確か か」と「なぜそう言えるか」を書く（技術的な言葉は最後の「根拠」の行だけ）
  list.appendChild(el("li", null, `出演者：${APPEARANCE_CONFIDENCE_LABELS[confidence]}（${describeConfidenceReason(video)}）`));
  if (confidence !== "confirmed" && video.memberIds?.length) list.appendChild(el("li", null, `名前が分かっている人：${video.memberIds.map((memberId) => memberById.get(memberId)?.name ?? memberId).join("・")}（出演者の全部とは限りません）`));
  if (video.writerMemberIds?.length) list.appendChild(el("li", null, `説明欄の文を書いた人：${video.writerMemberIds.map((memberId) => memberById.get(memberId)?.name ?? memberId).join("・")}（書いた人で、出演者の全部ではありません）`));
  if (video.footageMemberIds?.length) list.appendChild(el("li", null, "「映像で登場」の人は、ライブ映像・過去の映像などに映る人です（企画そのものの出演者ではありません）"));
  if (video.hold) list.appendChild(el("li", null, "説明欄の出演者の表記が前と変わったため、前の判定のまま確認を待っています"));
  const evidence = describeYoutubeEvidence(video);
  list.appendChild(el("li", "yta-why-technical", `根拠の種類：${evidence.length ? evidence.join("／") : "見つかっていません"}`));
  if (video.summary) list.appendChild(el("li", null, `説明の冒頭：${video.summary}`));
  if (video.series?.length) list.appendChild(el("li", null, `公式の再生リスト：${video.series.join("・")}`));
  if (video.kindEstimated) list.appendChild(el("li", null, "種類（通常／Shorts／ライブ配信）は動画の長さなどからの推定です"));
  why.appendChild(list);
  actions.appendChild(why);
  item.appendChild(actions);
  return item;
}

// 確かさの理由（一般の人向けの言葉）
function describeConfidenceReason(video) {
  switch (video.status) {
    case APPEARANCE_STATUS.MANUAL:
      return video.partial ? "本人が動画で一部の人を確かめました" : "本人が動画を見て確かめました";
    case APPEARANCE_STATUS.CAST_LIST:
      return "説明欄の「出演メンバー」の欄に名前があります";
    case APPEARANCE_STATUS.TITLE_NAME:
      return "タイトルに名前があります";
    case APPEARANCE_STATUS.DESCRIPTION_NAME:
      return "説明の文に名前があります";
    case APPEARANCE_STATUS.GROUP_ONLY:
      return "＝LOVE の動画ですが、出演者の名前は分かっていません";
    default:
      return "出演者を確かめられていません";
  }
}

function currentFilter() {
  return { ...state, memberIds: [...state.memberIds] };
}

export function getYoutubeFilterState() {
  return currentFilter();
}

// データが無い・期限切れ・読み込み中のときの案内
function buildStateMessage() {
  const box = el("div", "yta-empty");
  const { state: dataState, data } = source;
  if (dataState === YOUTUBE_DATA_STATE.LOADING || dataState === YOUTUBE_DATA_STATE.IDLE) {
    box.appendChild(el("p", null, "動画の一覧を読み込んでいます…"));
    return box;
  }
  if (dataState === YOUTUBE_DATA_STATE.EXPIRED) {
    box.appendChild(el("p", null, `YouTube の情報の更新が止まっています（最後の更新：${formatIsoDay(data?.fetchedAt) || "不明"}）。`));
    box.appendChild(el("p", "yta-note", "YouTube の規約に合わせて、取得から30日を過ぎた動画の情報は表示していません。更新が戻ると、また表示されます。"));
  } else if (dataState === YOUTUBE_DATA_STATE.ERROR) {
    box.appendChild(el("p", null, "動画の一覧を読み込めませんでした（通信を確かめてください）。"));
  } else if (dataState === YOUTUBE_DATA_STATE.INVALID) {
    box.appendChild(el("p", null, "動画の一覧のデータが壊れているため、表示できません。"));
  } else {
    box.appendChild(el("p", null, "動画の一覧は、まだ準備中です。"));
  }
  box.appendChild(el("p", "yta-note", "公式チャンネルを直接開くと、すべての動画を見られます。"));
  box.appendChild(buildChannelLink());
  return box;
}

function renderResults() {
  const { videos } = source;
  const filtered = filterYoutubeVideos(videos, currentFilter());
  const total = videos.filter((video) => state.includeUnconfirmed || video.status !== APPEARANCE_STATUS.UNCONFIRMED).length;
  countElement.textContent = isDefaultYoutubeFilter(state) ? `全${total}本` : `${filtered.length}本（全${total}本中）`;
  resetButton.hidden = isDefaultYoutubeFilter(state);
  modeRow.hidden = state.memberIds.length < 2;
  memberHint.hidden = state.memberIds.length === 0;
  resultsElement.replaceChildren();
  if (source.state !== YOUTUBE_DATA_STATE.READY || !videos.length) {
    resultsElement.appendChild(buildStateMessage());
    return;
  }
  if (!filtered.length) {
    resultsElement.appendChild(el("p", "yta-empty", "この条件の動画は見つかりませんでした。条件を減らすか、［条件を戻す］を押してください。"));
    return;
  }
  // 公開年ごとの見出しの下に並べる（古い順でも新しい順でも、年が変わる所で区切る）
  let list = null;
  let lastYear = null;
  filtered.slice(0, shownCount).forEach((video) => {
    const year = youtubeVideoYear(video);
    if (year !== lastYear) {
      resultsElement.appendChild(el("h3", "yta-year", `${year}年`));
      list = el("ol", "yta-list");
      resultsElement.appendChild(list);
      lastYear = year;
    }
    list.appendChild(buildCard(video));
  });
  const rest = filtered.length - shownCount;
  if (rest > 0) {
    const more = el("button", "yta-more", `もっと見る（あと${rest}本）`);
    more.type = "button";
    more.addEventListener("click", () => {
      const firstNewId = filtered[shownCount]?.id;
      shownCount += YOUTUBE_PAGE_SIZE;
      renderResults();
      // 足した最初の1本へ、読み上げ・キーボードの位置を移す
      const firstNew = resultsElement.querySelector(`.yta-card[data-id="${CSS.escape(firstNewId ?? "")}"] .yta-watch`);
      firstNew?.focus({ preventScroll: true });
    });
    resultsElement.appendChild(more);
  }
}

// 条件が変わったとき：表示する本数を初めに戻して描き直す
function update() {
  shownCount = YOUTUBE_PAGE_SIZE;
  renderResults();
}

function buildChannelLink() {
  const link = el("a", "yta-channel-link", "公式チャンネルを開く");
  link.href = source.channel?.url ?? YOUTUBE_CHANNEL.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `YouTube「${source.channel?.title ?? YOUTUBE_CHANNEL.title}」を新しいタブで開く`);
  link.appendChild(externalIcon());
  return link;
}

function buildChip(item, onClick) {
  const chip = el("button", "yta-chip");
  chip.type = "button";
  chip.dataset.value = item.id;
  if (item.dotColor) {
    const dot = el("i", "yta-member-dot");
    dot.setAttribute("aria-hidden", "true");
    dot.style.background = item.dotColor;
    chip.appendChild(dot);
  }
  chip.appendChild(document.createTextNode(item.label));
  if (Number.isFinite(item.count)) chip.appendChild(el("span", "yta-chip-count", String(item.count)));
  chip.addEventListener("click", () => {
    onClick(item.id);
    syncControls();
    update();
  });
  return chip;
}

// 1つだけ選ぶ札の組（種類・並び・いずれか／全員）
function buildSingleChoice(className, label, items, key) {
  const group = el("div", className);
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", label);
  items.forEach((item) => group.appendChild(buildChip(item, (value) => (state[key] = value))));
  group.sync = () => {
    group.querySelectorAll(".yta-chip").forEach((chip) => {
      const active = chip.dataset.value === state[key];
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
  };
  return group;
}

// メンバー：何人でも選べる（「指定なし」で全部外す）
function buildMemberChoice() {
  const box = el("div", "yta-member-choice");
  const { videos } = source;
  const makeRow = (members, rowLabel) => {
    const row = el("div", "yta-chips yta-chips--members");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", rowLabel);
    members.forEach((member) =>
      row.appendChild(
        buildChip({ id: member.id, label: member.name, dotColor: member.memberColor?.hex ?? null, count: videos.length ? countYoutubeByMember(videos, member.id) : undefined }, (memberId) => {
          state.memberIds = state.memberIds.includes(memberId) ? state.memberIds.filter((id) => id !== memberId) : [...state.memberIds, memberId];
        })
      )
    );
    return row;
  };
  const allRow = el("div", "yta-chips");
  allRow.appendChild(buildChip({ id: "all", label: "指定なし（全員）" }, () => (state.memberIds = [])));
  box.appendChild(allRow);
  box.appendChild(makeRow(MEMBERS.filter((member) => member.status !== MEMBER_STATUS.GRADUATED), "現役メンバー"));
  const graduated = MEMBERS.filter((member) => member.status === MEMBER_STATUS.GRADUATED);
  if (graduated.length) {
    box.appendChild(el("p", "yta-sublabel", "元メンバー"));
    box.appendChild(makeRow(graduated, "元メンバー"));
  }
  box.sync = () => {
    box.querySelectorAll(".yta-chip").forEach((chip) => {
      const active = chip.dataset.value === "all" ? state.memberIds.length === 0 : state.memberIds.includes(chip.dataset.value);
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
  };
  return box;
}

function syncControls() {
  controls.search.value = state.query;
  controls.year.value = state.year;
  controls.includeUnconfirmed.checked = state.includeUnconfirmed;
  controls.members.sync();
  controls.mode.sync();
  controls.kind.sync();
  controls.sort.sync();
}

function buildControls() {
  const { videos } = source;
  const box = el("div", "yta-controls");
  controls.search = el("input", "yta-search");
  controls.search.type = "search";
  controls.search.placeholder = window.innerWidth < 360 ? "タイトル・企画で探す" : "タイトル・企画で探す（例：料理）";
  controls.search.setAttribute("aria-label", "タイトル・企画・メンバーの名前で探す");
  controls.search.addEventListener("input", () => {
    state.query = controls.search.value;
    update();
  });
  box.appendChild(controls.search);

  box.appendChild(el("p", "yta-label", "メンバー（何人でも選べます）"));
  controls.members = buildMemberChoice();
  box.appendChild(controls.members);
  modeRow = el("div", "yta-mode-row");
  controls.mode = buildSingleChoice(
    "yta-chips yta-chips--mode",
    "選んだメンバーの絞り方",
    [
      { id: "any", label: "だれか1人でも出ている" },
      { id: "all", label: "全員がそろって出ている" },
    ],
    "memberMode"
  );
  modeRow.appendChild(controls.mode);
  box.appendChild(modeRow);
  memberHint = el("p", "yta-hint", "メンバーで絞ると、出演者の名前が分からない動画は出ません。札の数には「推定」も含みます。");
  box.appendChild(memberHint);

  box.appendChild(el("p", "yta-label", "種類"));
  controls.kind = buildSingleChoice(
    "yta-chips",
    "動画の種類",
    [{ id: "all", label: "すべて" }, ...availableYoutubeKinds(videos).map((kind) => ({ id: kind, label: YOUTUBE_KIND_LABELS[kind] }))],
    "kind"
  );
  box.appendChild(controls.kind);

  const row = el("div", "yta-select-row");
  controls.year = el("select", "yta-select");
  controls.year.setAttribute("aria-label", "公開年で絞り込む");
  [["all", "すべての年"], ...availableYoutubeYears(videos).map((year) => [year, `${year}年`])].forEach(([value, text]) => {
    const option = el("option", null, text);
    option.value = value;
    controls.year.appendChild(option);
  });
  controls.year.addEventListener("change", () => {
    state.year = controls.year.value;
    update();
  });
  row.appendChild(controls.year);
  controls.sort = buildSingleChoice(
    "yta-chips yta-chips--sort",
    "並び順",
    [
      { id: "asc", label: "古い順（初期から）" },
      { id: "desc", label: "新しい順" },
    ],
    "sort"
  );
  row.appendChild(controls.sort);
  box.appendChild(row);

  const unconfirmedCount = videos.filter((video) => video.status === APPEARANCE_STATUS.UNCONFIRMED).length;
  const toggle = el("label", "yta-toggle");
  controls.includeUnconfirmed = el("input");
  controls.includeUnconfirmed.type = "checkbox";
  controls.includeUnconfirmed.addEventListener("change", () => {
    state.includeUnconfirmed = controls.includeUnconfirmed.checked;
    update();
  });
  toggle.append(controls.includeUnconfirmed, document.createTextNode(`「出演者未確認」の動画も出す（${unconfirmedCount}本）`));
  toggle.hidden = unconfirmedCount === 0;
  box.appendChild(toggle);

  const countRow = el("div", "yta-count-row");
  countElement = el("p", "yta-count");
  countElement.setAttribute("aria-live", "polite");
  resetButton = el("button", "yta-reset", "条件を戻す");
  resetButton.type = "button";
  resetButton.addEventListener("click", () => {
    Object.assign(state, YOUTUBE_DEFAULT_FILTER, { memberIds: [] });
    syncControls();
    update();
  });
  countRow.append(countElement, resetButton);
  box.appendChild(countRow);
  return box;
}

function buildPage() {
  const { data, channel } = source;
  container.replaceChildren();
  const intro = el("p", "yta-intro");
  intro.textContent = `公式 YouTube「${channel?.title ?? YOUTUBE_CHANNEL.title}」の動画のうち、＝LOVE のメンバーが出ている動画です（≠ME・≒JOY だけの動画は入れていません）。`;
  container.appendChild(intro);
  container.appendChild(buildControls());
  resultsElement = el("div", "yta-results");
  container.appendChild(resultsElement);
  const notes = el("div", "yta-notes");
  if (source.state === YOUTUBE_DATA_STATE.READY && data?.counts) {
    const counts = data.counts;
    notes.appendChild(
      el(
        "p",
        "yta-note",
        `${formatIsoDay(data.fetchedAt)}に公式チャンネルの公開動画${counts.checked}本を調べ、＝LOVE のメンバーが出ている${counts.included}本を載せています（ほかに出演者未確認${counts.unconfirmed}本）。動画の情報は自動で取り直しています。`
      )
    );
    if (counts.byConfidence) {
      const by = counts.byConfidence;
      notes.appendChild(el("p", "yta-note", `出演者の確かさ：確認済み ${by.confirmed}本・一部確認 ${by.partial}本・推定 ${by.estimated}本・未確認 ${by.unconfirmed}本。「推定」は、名前が出ていても出演者の全部とは限りません。`));
    }
    if (counts.ended > 0) notes.appendChild(el("p", "yta-note", `公開が終わった動画（削除・非公開など）${counts.ended}本は表示していません。`));
  }
  notes.appendChild(
    el(
      "p",
      "yta-note",
      "出演者は、説明欄の公式の出演者の表記をもとにしています。表記が無い動画は、タイトルの名前などからの推定（印つき）か「出演者未確認」です。「本人が確認」の印がある動画のほかは、動画を見て確かめたものではありません。"
    )
  );
  notes.appendChild(el("p", "yta-note", YOUTUBE_RIGHTS_NOTE));
  notes.appendChild(buildChannelLink());
  notes.appendChild(buildDataNotice());
  container.appendChild(notes);
}

// 「YouTube のデータについて」：YouTube API Services の規約（利用規約・プライバシーポリシーへのリンク、公式と誤認されない一文）。
// このアプリが実際にしていることだけを書く（取っていない情報を取っているように書かない）
export const YOUTUBE_DATA_NOTICE_LINES = Object.freeze([
  "このページの動画の情報（タイトル・公開日・公開状態・説明の冒頭・再生リストの名前）は、YouTube API サービスを使って、YouTube で公開されている情報だけを取り出したものです。",
  "取り出しは、このアプリを公開する仕組みが定期的に行います。皆さんの端末から YouTube の API を呼ぶことはありません。取り出してから30日を過ぎた情報は表示しません。",
  "サムネイル画像は、表示するときに皆さんの端末が YouTube（i.ytimg.com）から直接読み込みます。そのとき、YouTube（Google）に端末の IP アドレスなどが届きます。［YouTube で見る］を押すと YouTube のページが開きます。",
  "このアプリは YouTube のアカウントを使わず、皆さんの YouTube に関する情報を集めたり保存したりしません。",
  "出演の判定（誰が出ているか）は、このアプリが独自にまとめたものです。YouTube・Google・＝LOVE の公式の情報ではありません。",
  "このアプリは、YouTube・Google・＝LOVE の運営とは関係のない、非公式のファンの制作物です。",
  // 【2026-11-03】YouTube API Services の規約 III.A.1：利用者が YouTube の利用規約に同意することを、アプリの側で示す
  "このページ（YouTube 出演図鑑）を使うことで、YouTube の利用規約に同意したものとみなされます。",
]);

function buildExternalLink(className, text, href) {
  const link = el("a", className, text);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.appendChild(externalIcon());
  return link;
}

function buildDataNotice() {
  const details = el("details", "yta-data-notice");
  details.appendChild(el("summary", "yta-data-notice-summary", "YouTube のデータについて"));
  const list = el("ul", "yta-why-list");
  YOUTUBE_DATA_NOTICE_LINES.forEach((line) => list.appendChild(el("li", null, line)));
  details.appendChild(list);
  const links = el("p", "yta-data-notice-links");
  links.append(
    buildExternalLink("yta-text-link", "YouTube 利用規約", YOUTUBE_TERMS_URL),
    buildExternalLink("yta-text-link", "Google プライバシーポリシー", GOOGLE_PRIVACY_POLICY_URL)
  );
  details.appendChild(links);
  return details;
}

// 今のデータ（js/youtubeAppearanceData.js の読み込みの結果）を画面のデータにする。テストで差し替えたときは使わない
function adoptSnapshot() {
  if (source.injected) return false;
  const snapshot = getYoutubeAppearanceSnapshot();
  const changed = snapshot.state !== source.state || snapshot.videos !== source.videos || snapshot.data !== source.data;
  source = { state: snapshot.state, videos: snapshot.videos ?? [], data: snapshot.data, channel: YOUTUBE_CHANNEL, injected: false };
  return changed;
}

// データが変わったとき（読み込みが終わった・期限切れになった）：条件はそのまま、画面だけ作り直す
function rebuildKeepingState() {
  if (!container || !resultsElement) return;
  buildPage();
  syncControls();
  renderResults();
}

// options.memberIds：そのメンバーで絞って開く／options.year：その年／options.sort："asc"・"desc"／options.query：言葉を入れて開く
// options.returnScreen：［戻る］の行き先（省略時は今いる画面）。開くたびに条件を初めに戻す（［戻る］で帰ってきたときはこの関数を通らないので条件はそのまま）
// 【2026-11-03】形は変えていない（メンバーの担当の画面からも呼ばれるため）
export function openYoutubeAppearances(options = {}) {
  if (!container) return;
  if (adoptSnapshot() || !resultsElement) buildPage();
  Object.assign(state, YOUTUBE_DEFAULT_FILTER, { memberIds: [] });
  if (Array.isArray(options.memberIds)) state.memberIds = options.memberIds.filter((memberId) => memberById.has(memberId));
  if (options.memberMode === "all" || options.memberMode === "any") state.memberMode = options.memberMode;
  if (options.year !== undefined && options.year !== null && /^\d{4}$/.test(String(options.year))) state.year = String(options.year);
  if (options.sort === "asc" || options.sort === "desc") state.sort = options.sort;
  if (typeof options.query === "string") state.query = options.query;
  if (typeof options.kind === "string" && (options.kind === "all" || Object.hasOwn(YOUTUBE_KIND_LABELS, options.kind))) state.kind = options.kind;
  syncControls();
  update();
  // まだ読んでいなければ読む（終わったら onYoutubeAppearanceDataChange で描き直す）
  if (!source.injected && (source.state === YOUTUBE_DATA_STATE.IDLE || source.state === YOUTUBE_DATA_STATE.ERROR)) loadYoutubeAppearanceData();
  const returnScreen = options.returnScreen ?? (typeof document !== "undefined" ? document.body.dataset.screen : null);
  callbacks.onShow?.({ returnScreen });
}

// elements: { container }。options.onShow({ returnScreen })：画面を切り替える（main.js）。
// テスト用：options.videos（と options.data・options.dataState）でデータを差し替える。options.thumbnailUrl で画像の URL を差し替える
export function initYoutubeAppearancesScreen(elements, options = {}) {
  container = elements.container;
  callbacks = { onShow: options.onShow ?? null };
  if (Array.isArray(options.videos) || options.dataState) {
    source = {
      state: options.dataState ?? YOUTUBE_DATA_STATE.READY,
      videos: options.videos ?? [],
      data: options.data ?? null,
      channel: YOUTUBE_CHANNEL,
      injected: true,
    };
  } else {
    source = { state: YOUTUBE_DATA_STATE.IDLE, videos: [], data: null, channel: YOUTUBE_CHANNEL, injected: false };
    adoptSnapshot();
  }
  thumbnailUrlOf = typeof options.thumbnailUrl === "function" ? options.thumbnailUrl : youtubeThumbnailUrl;
  resultsElement = null;
  Object.assign(state, YOUTUBE_DEFAULT_FILTER, { memberIds: [] });
  shownCount = YOUTUBE_PAGE_SIZE;
  unsubscribeData?.();
  unsubscribeData = onYoutubeAppearanceDataChange(() => {
    if (adoptSnapshot()) rebuildKeepingState();
  });
}
