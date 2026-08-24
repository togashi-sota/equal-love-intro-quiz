// ＝LOVEについて／年表／作品一覧の3タブ画面と、作品詳細画面を担当するファイル。
// 作品名・発売日・収録曲・センターは、workIdをキーにsongs.jsから都度組み立てる
// （discography.jsには公式リンク・補足説明だけを持たせ、二重管理を避ける。5-1章の設計方針を踏襲）。
//
// 年表は3種類のイベントを日付順にマージして表示する：
//   ①リリース：songs.js/discography.jsから自動生成
//   ②卒業：members.jsのgraduationDateから自動生成（historyEvents.jsには持たせない）
//   ③それ以外（結成発表・ライブ・周年等）：historyEvents.jsに手作業で登録したもの
// このマージ方式により、卒業日・発売日をhistoryEvents.js側に二重入力せずに済む。

import { CATEGORY } from "./data/songs.js";
import { MEMBER_STATUS } from "./data/members.js";
import { getActiveMemberCount } from "./memberUtils.js";
import { buildActivityCard, sortActivitiesByStatus } from "./membersScreen.js";
import { LIVE_STATUS } from "./data/liveHistory.js";

// workIdから種別が判定できない場合だけ使う、最後のフォールバック表示。
const WORK_TYPE_LABELS_FALLBACK = {
  single: "シングル",
  album: "アルバム",
  digital: "配信限定",
  special: "特別作品",
};

// 数字を英語の序数（1st/2nd/3rd/4th…）に変換する。
// 11・12・13だけは一の位に関わらず必ず"th"になる例外に対応している（21st/22nd/23rdは正しく変換される）。
function toOrdinal(number) {
  const remainder100 = number % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${number}th`;
  const remainder10 = number % 10;
  if (remainder10 === 1) return `${number}st`;
  if (remainder10 === 2) return `${number}nd`;
  if (remainder10 === 3) return `${number}rd`;
  return `${number}th`;
}

// workId（例:"single-06"）から「6thシングル」「1stアルバム」「配信限定」「特別作品」のような
// 表示ラベルを組み立てる。番号はworkId自体から取り出すため、songs.js側に番号を
// 二重に持たせる必要がない（本人希望、年表・作品一覧・作品詳細のすべてでこの関数を使う）。
function buildWorkTypeLabel(workId, type) {
  const numberMatch = workId.match(/-(\d+)$/);
  const number = numberMatch ? Number(numberMatch[1]) : null;

  if (type === "single" && number !== null) return `${toOrdinal(number)}シングル`;
  if (type === "album" && number !== null) return `${toOrdinal(number)}アルバム`;
  if (type === "digital") return "配信限定";
  if (type === "special") return "特別作品";
  return WORK_TYPE_LABELS_FALLBACK[type] ?? type;
}

// この画面が使うDOM要素一式。initDiscographyScreen()で受け取って保持する。
let elements = null;

// "YYYY-MM-DD" を "YYYY.MM.DD" のような表示用の文字列に変換する。
function formatDate(dateString) {
  if (!dateString) return "日付未確認";
  return dateString.replaceAll("-", ".");
}

// songs（SONGS配列）とdiscographyEntries（DISCOGRAPHY配列）を突き合わせ、
// 作品詳細画面の「センター」欄に何を表示するかを、曲データから自動判定する（2026-08-03）。
// songs.jsのcenterType（"single"/"double"/"none"、73行目付近のコメント参照）を優先的に使い、
// 曲IDを個別にハードコードしない。
//   - centerTypeが"none"（センターという概念がないと確認済み）：行自体を非表示にする
//     （vocalLabelをnullにして合図。renderWorkDetail側で非表示にする）
//   - centerがある：通常通り「センター」
//   - centerは無いがmembersが1人（ソロ曲）：「ソロ歌唱」
//   - centerは無いがmembersが複数：「歌唱メンバー」
//   - どれにも当てはまらない（本当に未調査）：「センター」ラベルのまま「未確認」表示
function resolveVocalInfo(titleSong) {
  if (titleSong?.centerType === "none") {
    return { vocalLabel: null, vocalNames: [] };
  }
  if (Array.isArray(titleSong?.center) && titleSong.center.length > 0) {
    return { vocalLabel: "センター", vocalNames: titleSong.center };
  }
  if (Array.isArray(titleSong?.members) && titleSong.members.length === 1) {
    return { vocalLabel: "ソロ歌唱", vocalNames: titleSong.members };
  }
  if (Array.isArray(titleSong?.members) && titleSong.members.length > 1) {
    return { vocalLabel: "歌唱メンバー", vocalNames: titleSong.members };
  }
  return { vocalLabel: "センター", vocalNames: [] };
}

// 作品ごとに「代表曲（表題曲）のタイトル・発売日」と「収録曲一覧」を1つにまとめる。
// discography.js側にタイトル・発売日を持たせないための橋渡し役。
export function buildWorkSummaries(songs, discographyEntries) {
  const songsByWorkId = new Map();
  songs.forEach((song) => {
    if (!song.workId) return;
    if (!songsByWorkId.has(song.workId)) songsByWorkId.set(song.workId, []);
    songsByWorkId.get(song.workId).push(song);
  });

  return discographyEntries.map((entry) => {
    const workSongs = songsByWorkId.get(entry.workId) ?? [];
    // 表題曲があればそれを代表曲にする。配信限定シングル等、表題曲扱いの曲が
    // 無い作品では、収録曲の1曲目を代わりに使う。
    const titleSong = workSongs.find((song) => song.category === CATEGORY.TITLE_TRACK) ?? workSongs[0] ?? null;

    return {
      ...entry,
      title: titleSong ? titleSong.title : "（曲情報なし）",
      releaseDate: titleSong ? titleSong.releaseDate : null,
      ...resolveVocalInfo(titleSong),
      songs: workSongs,
    };
  });
}

// ---- ＝LOVEについてタブ ----

function buildTextBlock(label, data) {
  const wrapper = document.createElement("div");
  wrapper.className = "about-text-block";
  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = label;
  wrapper.appendChild(heading);
  const text = document.createElement("p");
  text.className = "about-text-body";
  text.textContent = data.text;
  wrapper.appendChild(text);
  return wrapper;
}

function buildMemberCountCard(members) {
  const card = document.createElement("div");
  card.className = "member-count-card";

  const founding = document.createElement("p");
  founding.className = "member-count-founding";
  founding.textContent = "結成時は12人体制でスタートしました";
  card.appendChild(founding);

  const current = document.createElement("div");
  current.className = "member-count-current";
  const badge = document.createElement("span");
  badge.className = "member-count-badge";
  badge.textContent = "現在";
  current.appendChild(badge);
  const text = document.createElement("span");
  text.textContent = `${getActiveMemberCount(members)}人体制で活動中`;
  current.appendChild(text);
  card.appendChild(current);

  return card;
}

function buildProducerCard(producer) {
  const card = document.createElement("div");
  card.className = "producer-card";

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "プロデューサー";
  card.appendChild(heading);

  const name = document.createElement("p");
  name.className = "producer-name";
  name.textContent = `${producer.name}（${producer.role}）`;
  card.appendChild(name);

  if (producer.facts?.length > 0) {
    const list = document.createElement("ul");
    list.className = "producer-facts";
    producer.facts.forEach((fact) => {
      const item = document.createElement("li");
      item.textContent = fact;
      list.appendChild(item);
    });
    card.appendChild(list);
  }

  const linkDefs = [
    { key: "x", label: "公式X" },
    { key: "instagram", label: "公式Instagram" },
    { key: "youtube", label: "公式YouTube" },
  ];
  linkDefs.forEach(({ key, label }) => {
    const url = producer.officialLinks?.[key];
    if (!url) return;
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    card.appendChild(link);
  });

  return card;
}

// ＝LOVE公式YouTubeチャンネル・イコノイジョイチャンネルの紹介と、主な再生リストの一覧
// （本人指示・2026-08-24追加）。再生リストがかなり多いため、チャンネルごとにアコーディオンで
// 開閉できるようにし、既定では閉じた状態にしておく（収録曲一覧の.single-groupと同じ考え方。
// URLの文字列そのものは画面に出さず、必ず「再生リスト名＋短い説明＋ボタン」の形にする）。
function buildYoutubePlaylistRow(playlist) {
  const row = document.createElement("div");
  row.className = "youtube-playlist-row";

  const info = document.createElement("div");
  info.className = "youtube-playlist-info";

  const name = document.createElement("p");
  name.className = "youtube-playlist-name";
  name.textContent = playlist.name;
  info.appendChild(name);

  const description = document.createElement("p");
  description.className = "youtube-playlist-description";
  description.textContent = playlist.description;
  info.appendChild(description);

  row.appendChild(info);

  const link = document.createElement("a");
  link.className = "youtube-playlist-link";
  link.href = playlist.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>
    再生リストを見る
  `;
  row.appendChild(link);

  return row;
}

function buildYoutubeChannelGroup(channel) {
  const wrapper = document.createElement("div");
  wrapper.className = "youtube-channel-group";

  const header = document.createElement("button");
  header.type = "button";
  header.className = "youtube-channel-header";
  header.innerHTML = `
    <svg class="chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span class="youtube-channel-name">${channel.name}</span>
    <span class="youtube-channel-count-chip">${channel.playlists.length}件の再生リスト</span>
  `;
  header.addEventListener("click", () => {
    wrapper.classList.toggle("is-open");
  });
  wrapper.appendChild(header);

  const body = document.createElement("div");
  body.className = "youtube-channel-body";

  const description = document.createElement("p");
  description.className = "youtube-channel-description";
  description.textContent = channel.description;
  body.appendChild(description);

  const channelLink = document.createElement("a");
  channelLink.className = "official-link-button";
  channelLink.href = channel.url;
  channelLink.target = "_blank";
  channelLink.rel = "noopener noreferrer";
  channelLink.textContent = "チャンネルを見る";
  body.appendChild(channelLink);

  const playlistHeading = document.createElement("p");
  playlistHeading.className = "youtube-playlist-heading";
  playlistHeading.textContent = "主な再生リスト";
  body.appendChild(playlistHeading);

  const list = document.createElement("div");
  list.className = "youtube-playlist-list";
  channel.playlists.forEach((playlist) => list.appendChild(buildYoutubePlaylistRow(playlist)));
  body.appendChild(list);

  wrapper.appendChild(body);
  return wrapper;
}

function buildYoutubeChannelsSection(youtubeChannels) {
  const wrapper = document.createElement("div");
  if (!youtubeChannels || youtubeChannels.length === 0) return wrapper;

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "＝LOVEの公式YouTube";
  wrapper.appendChild(heading);

  const list = document.createElement("div");
  list.className = "youtube-channels-list";
  youtubeChannels.forEach((channel) => list.appendChild(buildYoutubeChannelGroup(channel)));
  wrapper.appendChild(list);

  return wrapper;
}

// グループ冠番組・レギュラー番組のセクション（メンバー個人ではなく、グループ全体としての
// 活動）。カードの組み立てはメンバー個人活動と共通のbuildActivityCard()をそのまま使う
// （見た目・情報の持たせ方を個人・グループで揃えるため）。
function buildGroupActivitiesSection(groupActivities) {
  const wrapper = document.createElement("div");

  if (!groupActivities || groupActivities.length === 0) {
    return wrapper;
  }

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "グループ活動・レギュラー番組";
  wrapper.appendChild(heading);

  const list = document.createElement("div");
  list.className = "activity-list";
  sortActivitiesByStatus(groupActivities).forEach((activity) => list.appendChild(buildActivityCard(activity)));
  wrapper.appendChild(list);

  return wrapper;
}

const GROUP_LINK_LABELS = {
  website: "公式サイト",
  x: "公式X",
  instagram: "公式Instagram",
  tiktok: "公式TikTok",
  youtube: "公式YouTube",
  showroom: "公式SHOWROOM",
  store: "公式ストア",
};

function buildGroupLinksSection(officialLinks) {
  const wrapper = document.createElement("div");
  const availableLinks = Object.entries(officialLinks ?? {}).filter(([, url]) => url);

  if (availableLinks.length === 0) {
    const notice = document.createElement("p");
    notice.className = "empty-state-note";
    notice.textContent = "公式リンクは準備中です";
    wrapper.appendChild(notice);
    return wrapper;
  }

  availableLinks.forEach(([key, url]) => {
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = GROUP_LINK_LABELS[key] ?? key;
    wrapper.appendChild(link);
  });

  return wrapper;
}

// 姉妹グループ（＝LOVE以外の、指原莉乃プロデュースグループ）を紹介する小さなカード列。
// プロデューサー欄のすぐ近くに置く（本人指示）。メンバー一覧・楽曲一覧などは対象外で、
// グループ名・一言紹介・公式リンクだけを持つ最小限の紹介にとどめる。
function buildSisterGroupCard(group) {
  const card = document.createElement("div");
  card.className = "sister-group-card";

  const nameRow = document.createElement("p");
  nameRow.className = "sister-group-name";
  nameRow.textContent = group.name;
  const reading = document.createElement("span");
  reading.className = "sister-group-reading";
  reading.textContent = group.reading;
  nameRow.appendChild(reading);
  card.appendChild(nameRow);

  const description = document.createElement("p");
  description.className = "sister-group-description";
  description.textContent = group.description;
  card.appendChild(description);

  // 【2026-08-23追加】以前は＝LOVEについてページ内に「リーダー：山本杏奈」という単独表示が
  // あったが、姉妹グループカードのすぐ下にあって紛らわしい（＝LOVE自身のリーダー表記なのに
  // 姉妹グループのリーダーのように見えてしまう）ため削除し、代わりに各姉妹グループ自身の
  // リーダーをこのカード内に小さく表示する形にした（本人指示）。
  if (group.leader) {
    const leaderLine = document.createElement("p");
    leaderLine.className = "sister-group-leader";
    leaderLine.textContent = `リーダー：${group.leader}`;
    card.appendChild(leaderLine);
  }

  const linkDefs = [
    { key: "website", label: "公式サイト" },
    { key: "youtube", label: "公式YouTube" },
  ];
  const linkRow = document.createElement("div");
  linkRow.className = "sister-group-links";
  linkDefs.forEach(({ key, label }) => {
    const url = group.officialLinks?.[key];
    if (!url) return;
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    linkRow.appendChild(link);
  });
  card.appendChild(linkRow);

  return card;
}

// ＝LOVE公式の個人ファンクラブアプリ「＝LOVE LINK」を紹介するカード。
// sister-group-cardと同じ見た目のクラスを流用し、他の公式サービス紹介と統一感を持たせる
// （本人指示：既存デザインを崩さず、他の公式サービスと統一感のあるカードにする。2026-08-23新設）。
// メンバー個別の＝LOVE LINKページはmembers.jsのofficialLinks.others側（メンバー詳細画面）に
// 別途追加しており、このカードはサービス自体の紹介・公式サイト/ストアへの導線に専念する。
// ＝LOVE Official Fan Club（従来型の有料会員制ファンクラブ）を紹介するカード。
// ＝LOVE LINK（buildFanClubAppCard、個人メッセージアプリ）とは別サービスなので、
// 混同されないよう見出し・説明文を分けて掲載する。料金は「新規入会」と「継続会員」の
// 2本立てで必ず説明し、価格改定前の440円だけを表示しないよう注意する
// （本人指示。2026-08-23新設）。
function buildOfficialFanClubCard(officialFanClub) {
  const wrapper = document.createElement("div");
  if (!officialFanClub) return wrapper;

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = officialFanClub.name;
  wrapper.appendChild(heading);

  const card = document.createElement("div");
  card.className = "sister-group-card";

  if (officialFanClub.description) {
    const description = document.createElement("p");
    description.className = "sister-group-description";
    description.textContent = officialFanClub.description.text;
    card.appendChild(description);
  }

  if (officialFanClub.pricingNote) {
    const pricing = document.createElement("p");
    pricing.className = "sister-group-leader";
    pricing.textContent = officialFanClub.pricingNote.text;
    card.appendChild(pricing);
  }

  if (officialFanClub.benefits?.length > 0) {
    const benefitsList = document.createElement("ul");
    benefitsList.className = "producer-facts";
    officialFanClub.benefits.forEach((benefit) => {
      const item = document.createElement("li");
      item.textContent = benefit;
      benefitsList.appendChild(item);
    });
    card.appendChild(benefitsList);
  }

  const linkDefs = [
    { key: "join", label: "入会・詳細はこちら" },
    { key: "website", label: "ファンクラブを見る" },
  ];
  const linkRow = document.createElement("div");
  linkRow.className = "sister-group-links";
  linkDefs.forEach(({ key, label }) => {
    const url = officialFanClub.officialLinks?.[key];
    if (!url) return;
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    linkRow.appendChild(link);
  });
  card.appendChild(linkRow);

  wrapper.appendChild(card);
  return wrapper;
}

// 公式グッズショップへの導線。officialLinks.storeと同じURLだが、ファンクラブ紹介の近くに
// 説明文付きで改めて紹介する（本人指示。具体的な商品は書かず、導線のみでよい）。
function buildOfficialShopCard(officialShop) {
  const wrapper = document.createElement("div");
  if (!officialShop) return wrapper;

  const card = document.createElement("div");
  card.className = "sister-group-card";

  const nameRow = document.createElement("p");
  nameRow.className = "sister-group-name";
  nameRow.textContent = "＝LOVE OFFICIAL SHOP";
  card.appendChild(nameRow);

  const description = document.createElement("p");
  description.className = "sister-group-description";
  description.textContent = officialShop.description;
  card.appendChild(description);

  const linkRow = document.createElement("div");
  linkRow.className = "sister-group-links";
  const link = document.createElement("a");
  link.className = "official-link-button";
  link.href = officialShop.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "公式グッズを見る";
  linkRow.appendChild(link);
  card.appendChild(linkRow);

  wrapper.appendChild(card);
  return wrapper;
}

function buildFanClubAppCard(fanClubApp) {
  const wrapper = document.createElement("div");
  if (!fanClubApp) return wrapper;

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "＝LOVE LINK（公式個人ファンクラブアプリ）";
  wrapper.appendChild(heading);

  const card = document.createElement("div");
  card.className = "sister-group-card";

  const nameRow = document.createElement("p");
  nameRow.className = "sister-group-name";
  nameRow.textContent = fanClubApp.name;
  card.appendChild(nameRow);

  if (fanClubApp.description) {
    const description = document.createElement("p");
    description.className = "sister-group-description";
    description.textContent = fanClubApp.description.text;
    card.appendChild(description);
  }

  const linkDefs = [
    { key: "website", label: "公式サイト" },
    { key: "appStore", label: "App Store" },
    { key: "googlePlay", label: "Google Play" },
  ];
  const linkRow = document.createElement("div");
  linkRow.className = "sister-group-links";
  linkDefs.forEach(({ key, label }) => {
    const url = fanClubApp.officialLinks?.[key];
    if (!url) return;
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    linkRow.appendChild(link);
  });
  card.appendChild(linkRow);

  wrapper.appendChild(card);
  return wrapper;
}

// ＝LOVEのライブ衣装・MV衣装を数多く手がけるクリエイティブディレクターを紹介するカード。
// プロデューサーカードと同じ見た目（.producer-card）を流用し、「指原莉乃と並ぶ重要な
// 裏方の一人」という位置づけを表現する（本人指示。2026-08-23新設）。
function buildCostumeDirectorCard(costumeCreativeDirector) {
  const wrapper = document.createElement("div");
  if (!costumeCreativeDirector) return wrapper;

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "衣装を支える人";
  wrapper.appendChild(heading);

  const card = document.createElement("div");
  card.className = "producer-card";

  const name = document.createElement("p");
  name.className = "producer-name";
  name.textContent = `${costumeCreativeDirector.name}（${costumeCreativeDirector.role}）`;
  card.appendChild(name);

  if (costumeCreativeDirector.introduction) {
    const description = document.createElement("p");
    description.className = "sister-group-description";
    description.textContent = costumeCreativeDirector.introduction.text;
    card.appendChild(description);
  }

  const linkDefs = [
    { key: "x", label: "公式X" },
    { key: "website", label: "オサレカンパニー公式サイト" },
  ];
  linkDefs.forEach(({ key, label }) => {
    const url = costumeCreativeDirector.officialLinks?.[key];
    if (!url) return;
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    card.appendChild(link);
  });

  wrapper.appendChild(card);
  return wrapper;
}

// ＝LOVE・≠MEメンバーが出演したドラマ・映像作品を紹介するカード。
// sister-group-cardと同じ見た目を流用しつつ、W主題歌の一覧だけは専用の小さなリストで表示する。
// ＝LOVE本編の主題歌（好きって、言えなかった）には、収録曲一覧へ直接移動できるボタンを付ける
// （本人指示：ドラマ紹介⇔楽曲ページを相互リンクさせたい。js/main.jsのapp-navigateイベント経由。
// 2026-08-23新設）。
function buildDramaCard(drama) {
  const card = document.createElement("div");
  card.className = "sister-group-card";

  const nameRow = document.createElement("p");
  nameRow.className = "sister-group-name";
  nameRow.textContent = `『${drama.title}』`;
  card.appendChild(nameRow);

  const broadcastRow = document.createElement("p");
  broadcastRow.className = "sister-group-reading";
  broadcastRow.textContent = `${drama.broadcastYear} ／ ${drama.broadcastDetail}`;
  card.appendChild(broadcastRow);

  const description = document.createElement("p");
  description.className = "sister-group-description";
  description.textContent = drama.summary;
  card.appendChild(description);

  if (drama.castNote) {
    const castNote = document.createElement("p");
    castNote.className = "sister-group-description";
    castNote.textContent = drama.castNote.text;
    card.appendChild(castNote);
  }

  if (drama.themeSongs?.length > 0) {
    const themeSongsHeading = document.createElement("p");
    themeSongsHeading.className = "sister-group-description";
    themeSongsHeading.textContent = "W主題歌：";
    card.appendChild(themeSongsHeading);

    const themeSongsList = document.createElement("ul");
    themeSongsList.className = "producer-facts";
    drama.themeSongs.forEach((themeSong) => {
      const item = document.createElement("li");
      const label = [themeSong.group, themeSong.title, themeSong.note].filter(Boolean).join(" ／ ");
      if (themeSong.group === "＝LOVE") {
        const navButton = document.createElement("button");
        navButton.type = "button";
        navButton.className = "track-credit-link";
        navButton.textContent = `${label}（収録曲一覧へ）`;
        navButton.addEventListener("click", () => {
          window.dispatchEvent(new CustomEvent("app-navigate", { detail: { screen: "songlist" } }));
        });
        item.appendChild(navButton);
      } else {
        item.textContent = label;
      }
      themeSongsList.appendChild(item);
    });
    card.appendChild(themeSongsList);
  }

  const linkDefs = [
    { key: "website", label: "ドラマ公式サイト" },
    { key: "news", label: "出演情報を見る" },
  ];
  const linkRow = document.createElement("div");
  linkRow.className = "sister-group-links";
  linkDefs.forEach(({ key, label }) => {
    const url = drama.officialLinks?.[key];
    if (!url) return;
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    linkRow.appendChild(link);
  });
  card.appendChild(linkRow);

  return card;
}

function buildDramaSection(dramaAppearances) {
  const wrapper = document.createElement("div");
  if (!dramaAppearances || dramaAppearances.length === 0) return wrapper;

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "ドラマ・映像作品";
  wrapper.appendChild(heading);

  const list = document.createElement("div");
  list.className = "sister-group-list";
  dramaAppearances.forEach((drama) => list.appendChild(buildDramaCard(drama)));
  wrapper.appendChild(list);

  return wrapper;
}

// ＝LOVE・≠ME・≒JOYの3グループ合同で展開している公式ゲーム等を紹介するカード。
// ＝LOVE LINK（buildFanClubAppCard）と同じsister-group-cardを流用し、他の公式サービス
// 紹介と統一感を持たせる（本人指示。2026-08-23新設）。
function buildRelatedGameCard(game) {
  const card = document.createElement("div");
  card.className = "sister-group-card";

  const nameRow = document.createElement("p");
  nameRow.className = "sister-group-name";
  nameRow.textContent = game.name;
  card.appendChild(nameRow);

  if (game.description) {
    const description = document.createElement("p");
    description.className = "sister-group-description";
    description.textContent = game.description.text;
    card.appendChild(description);
  }

  const linkDefs = [
    { key: "website", label: "公式サイト" },
    { key: "x", label: "公式X" },
    { key: "appStore", label: "App Store" },
    { key: "googlePlay", label: "Google Play" },
  ];
  const linkRow = document.createElement("div");
  linkRow.className = "sister-group-links";
  linkDefs.forEach(({ key, label }) => {
    const url = game.officialLinks?.[key];
    if (!url) return;
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    linkRow.appendChild(link);
  });
  card.appendChild(linkRow);

  return card;
}

function buildRelatedGamesSection(relatedGames) {
  const wrapper = document.createElement("div");
  if (!relatedGames || relatedGames.length === 0) return wrapper;

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "＝LOVE関連公式サービス・ゲーム";
  wrapper.appendChild(heading);

  const list = document.createElement("div");
  list.className = "sister-group-list";
  relatedGames.forEach((game) => list.appendChild(buildRelatedGameCard(game)));
  wrapper.appendChild(list);

  return wrapper;
}

// ＝LOVEと姉妹グループによる合同楽曲を紹介するカード。sister-group-cardと同じ見た目を流用し、
// 参加グループのバッジ・年・説明文・（あれば）クレジット・MVを見るボタンを表示する
// （本人指示：姉妹グループが増えるにつれ合同楽曲の規模も広がった流れが伝わる構成に。2026-08-23新設）。
function buildCollaborationSongCard(song) {
  const card = document.createElement("div");
  card.className = "sister-group-card";

  const nameRow = document.createElement("p");
  nameRow.className = "sister-group-name";
  nameRow.textContent = song.title;
  const yearSpan = document.createElement("span");
  yearSpan.className = "sister-group-reading";
  yearSpan.textContent = song.year;
  nameRow.appendChild(yearSpan);
  card.appendChild(nameRow);

  const groupsLine = document.createElement("p");
  groupsLine.className = "sister-group-leader";
  groupsLine.textContent = song.participatingGroups.join(" × ");
  card.appendChild(groupsLine);

  const description = document.createElement("p");
  description.className = "sister-group-description";
  description.textContent = song.description;
  card.appendChild(description);

  if (song.credits) {
    const credits = document.createElement("p");
    credits.className = "sister-group-leader";
    credits.textContent = song.credits;
    card.appendChild(credits);
  }

  if (song.mvUrl) {
    const mvLink = document.createElement("a");
    mvLink.className = "mv-link-button";
    mvLink.href = song.mvUrl;
    mvLink.target = "_blank";
    mvLink.rel = "noopener noreferrer";
    mvLink.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>
      MVを見る
    `;
    card.appendChild(mvLink);
  }

  return card;
}

function buildCollaborationSongsSection(collaborationSongs) {
  const wrapper = document.createElement("div");
  if (!collaborationSongs || collaborationSongs.length === 0) return wrapper;

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "グループ合同楽曲";
  wrapper.appendChild(heading);

  const list = document.createElement("div");
  list.className = "sister-group-list";
  collaborationSongs.forEach((song) => list.appendChild(buildCollaborationSongCard(song)));
  wrapper.appendChild(list);

  return wrapper;
}

function buildSisterGroupsSection(sisterGroups) {
  const wrapper = document.createElement("div");
  if (!sisterGroups || sisterGroups.length === 0) return wrapper;

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "姉妹グループ";
  wrapper.appendChild(heading);

  const list = document.createElement("div");
  list.className = "sister-group-list";
  sisterGroups.forEach((group) => list.appendChild(buildSisterGroupCard(group)));
  wrapper.appendChild(list);

  return wrapper;
}

function renderAboutTab(members, groupInfo, groupActivities, sisterGroups) {
  elements.aboutContent.innerHTML = "";

  if (groupInfo.introduction) {
    elements.aboutContent.appendChild(buildTextBlock("＝LOVEについて", groupInfo.introduction));
  }
  if (groupInfo.nameOrigin) {
    elements.aboutContent.appendChild(buildTextBlock("グループ名の由来", groupInfo.nameOrigin));
  }
  if (groupInfo.formationSummary) {
    elements.aboutContent.appendChild(buildTextBlock("結成からデビューまで", groupInfo.formationSummary));
  }

  elements.aboutContent.appendChild(buildMemberCountCard(members));

  if (groupInfo.producer) {
    elements.aboutContent.appendChild(buildProducerCard(groupInfo.producer));
  }

  elements.aboutContent.appendChild(buildCostumeDirectorCard(groupInfo.costumeCreativeDirector));

  elements.aboutContent.appendChild(buildSisterGroupsSection(sisterGroups));

  elements.aboutContent.appendChild(buildCollaborationSongsSection(groupInfo.collaborationSongs));

  elements.aboutContent.appendChild(buildYoutubeChannelsSection(groupInfo.youtubeChannels));

  elements.aboutContent.appendChild(buildGroupActivitiesSection(groupActivities));

  elements.aboutContent.appendChild(buildDramaSection(groupInfo.dramaAppearances));

  const linksHeading = document.createElement("p");
  linksHeading.className = "section-heading";
  linksHeading.textContent = "＝LOVE公式リンク";
  elements.aboutContent.appendChild(linksHeading);
  elements.aboutContent.appendChild(buildGroupLinksSection(groupInfo.officialLinks));

  elements.aboutContent.appendChild(buildOfficialFanClubCard(groupInfo.officialFanClub));
  elements.aboutContent.appendChild(buildOfficialShopCard(groupInfo.officialShop));

  elements.aboutContent.appendChild(buildFanClubAppCard(groupInfo.fanClubApp));

  elements.aboutContent.appendChild(buildRelatedGamesSection(groupInfo.relatedGames));
}

// ---- 年表タブ ----

function buildTimelineItem(date, title, typeClass) {
  const item = document.createElement("div");
  item.className = `timeline-item ${typeClass}`;

  const dateElement = document.createElement("p");
  dateElement.className = "timeline-date";
  dateElement.textContent = formatDate(date);
  item.appendChild(dateElement);

  const titleElement = document.createElement("p");
  titleElement.className = "timeline-title";
  titleElement.textContent = title;
  item.appendChild(titleElement);

  return item;
}

// リリース・卒業・その他の手作業イベントを1本の年表データにマージする。
// dateが無いイベント（発売日未確認の作品等）は年表には出さない（並び替えができないため）。
function buildTimelineEntries(members, workSummaries, historyEvents) {
  const releaseEntries = workSummaries
    .filter((work) => work.releaseDate)
    .map((work) => ({
      date: work.releaseDate,
      title: `${buildWorkTypeLabel(work.workId, work.type)}「${work.title}」発売`,
      typeClass: "type-release",
    }));

  const graduationEntries = members
    .filter((member) => member.status === MEMBER_STATUS.GRADUATED && member.graduationDate)
    .map((member) => ({
      date: member.graduationDate,
      title: `${member.name} 卒業`,
      typeClass: "type-graduation",
    }));

  const milestoneEntries = historyEvents.map((event) => ({
    date: event.date,
    title: event.title,
    typeClass: "type-milestone",
  }));

  return [...releaseEntries, ...graduationEntries, ...milestoneEntries];
}

// 年表の丸の色が何を表すかの凡例。type-release/type-graduation/type-milestoneの色分けは
// css/style.cssの.timeline-item系クラスと対応させている（初めて見る人にも分かるよう2026-08-03追加）。
const TIMELINE_LEGEND_ITEMS = [
  { typeClass: "type-release", label: "シングル・アルバム等のリリース" },
  { typeClass: "type-graduation", label: "メンバーの卒業" },
  { typeClass: "type-milestone", label: "結成・グループの節目" },
  { typeClass: "type-live", label: "初出演・初単独公演など" },
  { typeClass: "type-anniversary", label: "周年記念コンサート" },
];

function buildTimelineLegend() {
  const wrapper = document.createElement("div");
  wrapper.className = "timeline-legend";
  TIMELINE_LEGEND_ITEMS.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "timeline-legend-chip";
    const dot = document.createElement("span");
    dot.className = `timeline-legend-dot ${item.typeClass}`;
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(item.label));
    wrapper.appendChild(chip);
  });
  return wrapper;
}

function renderHistoryTab(members, workSummaries, historyEvents) {
  const entriesAscending = buildTimelineEntries(members, workSummaries, historyEvents).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  elements.timeline.innerHTML = "";
  elements.timeline.appendChild(buildTimelineLegend());
  let currentYear = null;
  entriesAscending.forEach((entry) => {
    const year = entry.date.slice(0, 4);
    if (year !== currentYear) {
      currentYear = year;
      const yearHeading = document.createElement("p");
      yearHeading.className = "timeline-year";
      yearHeading.textContent = year;
      elements.timeline.appendChild(yearHeading);
    }
    elements.timeline.appendChild(buildTimelineItem(entry.date, entry.title, entry.typeClass));
  });
}

// ---- 作品一覧タブ ----

function buildWorkCard(work) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "work-card";
  card.addEventListener("click", () => elements.onSelectWork(work.workId));

  const info = document.createElement("div");
  info.className = "work-card-info";

  const typeTag = document.createElement("span");
  typeTag.className = "work-card-type";
  typeTag.textContent = buildWorkTypeLabel(work.workId, work.type);
  info.appendChild(typeTag);

  const title = document.createElement("p");
  title.className = "work-card-title";
  title.textContent = work.title;
  info.appendChild(title);

  const date = document.createElement("p");
  date.className = "work-card-date";
  date.textContent = formatDate(work.releaseDate);
  info.appendChild(date);

  card.appendChild(info);
  card.appendChild(buildChevron());

  return card;
}

function buildChevron() {
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("class", "work-card-chevron");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("fill", "none");
  chevron.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M9 5 16 12 9 19");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.4");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  chevron.appendChild(path);
  return chevron;
}

// 発売前の作品（js/data/upcomingRelease.js）を知らせる小さなカード。
// 通常のwork-cardとは別枠で扱う（曲データがまだ無く、タップしても作品詳細を開けないため）。
function buildUpcomingReleaseCard(upcomingRelease) {
  const card = document.createElement("div");
  card.className = "upcoming-release-card";

  const badge = document.createElement("span");
  badge.className = "upcoming-release-badge";
  badge.textContent = "発売予定";
  card.appendChild(badge);

  const label = document.createElement("p");
  label.className = "upcoming-release-label";
  label.textContent = buildWorkTypeLabel(`single-${upcomingRelease.singleNumber}`, upcomingRelease.workType);
  card.appendChild(label);

  const title = document.createElement("p");
  title.className = "upcoming-release-title";
  title.textContent = upcomingRelease.title;
  card.appendChild(title);

  const date = document.createElement("p");
  date.className = "upcoming-release-date";
  date.textContent = `${formatDate(upcomingRelease.releaseDate)} 発売`;
  card.appendChild(date);

  const officialUrl = upcomingRelease.officialLinks?.official;
  if (officialUrl) {
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = officialUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "公式サイトを見る";
    card.appendChild(link);
  }

  return card;
}

function renderWorksTab(workSummaries, upcomingRelease) {
  // 作品一覧も年表タブと同じ古い順（結成→現在）にする。同じ画面の複数タブで
  // 読む方向が逆にならないようにするための判断（本人と合意済み、詳細は14章参照）。
  const worksAscending = [...workSummaries].sort((a, b) =>
    (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "")
  );

  elements.workList.innerHTML = "";
  if (upcomingRelease) {
    elements.workList.appendChild(buildUpcomingReleaseCard(upcomingRelease));
  }
  worksAscending.forEach((work) => {
    elements.workList.appendChild(buildWorkCard(work));
  });
}

// タブ切替（＝LOVEについて／年表／作品一覧／ライブ）。画面遷移は伴わず、同じ画面内の表示だけを切り替える。
const TAB_NAMES = ["about", "history", "works", "live"];

// ---- ライブタブ ----

// venuesの1件を「会場名（都市）」の形にまとめる。会場名が未確認（null）の場合は
// 「会場未確認」と表示し、無いことをごまかさない（本人方針：未確認の情報を断定しない）。
// showDateがtrueのときだけ、会場ごとの開催日も添える（例:「IGアリーナ（愛知）・2025.11.16」）。
// 1会場だけのカードでは、カード上部の日付表示（formatDateRange）と重複するため付けない。
// 複数会場にまたがるツアーカードで、映像商品が会場ごとに別々に発売されている場合など、
// どの会場・日程の公演かをボタンと一緒に判別しやすくするために2026-08-23追加。
function formatVenue(venue, showDate = false) {
  const name = venue.name ?? "会場未確認";
  const base = venue.city ? `${name}（${venue.city}）` : name;
  return showDate && venue.date ? `${base}・${formatDate(venue.date)}` : base;
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return "日付未確認";
  if (!endDate || endDate === startDate) return formatDate(startDate);
  return `${formatDate(startDate)}〜${formatDate(endDate)}`;
}

const LIVE_TYPE_LABELS = { tour: "ツアー", festival: "フェス出演", solo: "単独公演" };

function buildLiveEventCard(event) {
  const card = document.createElement("div");
  card.className = "live-event-card";

  const tagRow = document.createElement("div");
  tagRow.className = "live-event-tag-row";

  const typeTag = document.createElement("span");
  typeTag.className = "live-event-tag";
  typeTag.textContent = LIVE_TYPE_LABELS[event.type] ?? event.type;
  tagRow.appendChild(typeTag);

  if (event.isAnniversary) {
    const anniversaryTag = document.createElement("span");
    anniversaryTag.className = "live-event-tag is-anniversary";
    anniversaryTag.textContent = "周年記念";
    tagRow.appendChild(anniversaryTag);
  }

  if (event.isGraduation) {
    const graduationTag = document.createElement("span");
    graduationTag.className = "live-event-tag is-graduation";
    graduationTag.textContent = "卒業公演";
    tagRow.appendChild(graduationTag);
  }

  // 発表済みだが未開催の公演は、実績と混同しないよう必ず見分けられるタグを付ける。
  if (event.status === LIVE_STATUS.ANNOUNCED) {
    const announcedTag = document.createElement("span");
    announcedTag.className = "live-event-tag is-announced";
    announcedTag.textContent = "開催予定";
    tagRow.appendChild(announcedTag);
  }

  // 映像商品化されている公演は、下部のリンクボタンだけでなくタグ行でも一目で分かるようにする
  // （本人指示：「映像作品一覧」ではなく「＝LOVEの歴史」として、映像化の有無が一目で分かるように。
  // 2026-08-23追加）。
  if (event.blurayReleased) {
    const videoTag = document.createElement("span");
    videoTag.className = "live-event-tag is-video-available";
    videoTag.textContent = "映像作品あり";
    tagRow.appendChild(videoTag);
  }

  card.appendChild(tagRow);

  const title = document.createElement("p");
  title.className = "live-event-title";
  title.textContent = event.title;
  card.appendChild(title);

  const date = document.createElement("p");
  date.className = "live-event-date";
  date.textContent = formatDateRange(event.startDate, event.endDate);
  card.appendChild(date);

  const showVenueDate = event.venues.length > 1;
  event.venues.forEach((venue) => {
    const venueLine = document.createElement("p");
    venueLine.className = "live-event-venue";
    venueLine.textContent = formatVenue(venue, showVenueDate);
    card.appendChild(venueLine);
  });

  // 開場・開演時間など、会場名だけでは伝わらない補足情報（データはあったが今まで未使用だった
  // episodeNoteフィールドをここで初めて表示する。2026-08-23）。
  if (event.episodeNote) {
    const noteLine = document.createElement("p");
    noteLine.className = "live-event-note";
    noteLine.textContent = event.episodeNote;
    card.appendChild(noteLine);
  }

  // Blu-ray/DVDの購入ページ（productLinks）が確認できている場合だけボタンを出す。
  // 未確認のまま推測でリンクを出さない・販売終了時もページ全体は壊れない設計（本人方針）。
  const productLinks = event.productLinks ?? [];
  if (productLinks.length > 0) {
    const linkRow = document.createElement("div");
    linkRow.className = "live-event-product-links";
    productLinks.forEach((link) => {
      const a = document.createElement("a");
      a.className = "official-link-button live-event-product-link";
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = link.label;
      linkRow.appendChild(a);
    });
    card.appendChild(linkRow);
  } else if (event.blurayReleased) {
    const bluray = document.createElement("p");
    bluray.className = "live-event-bluray";
    bluray.textContent = "Blu-ray / DVD化あり（購入ページ未確認）";
    card.appendChild(bluray);
  }

  return card;
}

function renderLiveTab(liveEvents) {
  // 開催予定（announced）は年代が先でも末尾に別枠でまとめ、実績と混同しないようにする。
  const heldEvents = liveEvents.filter((event) => event.status === LIVE_STATUS.HELD);
  const announcedEvents = liveEvents.filter((event) => event.status === LIVE_STATUS.ANNOUNCED);
  const heldAscending = [...heldEvents].sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  elements.liveList.innerHTML = "";

  const notice = document.createElement("p");
  notice.className = "live-list-notice";
  notice.textContent = "公式情報を確認できた主な単独公演・周年公演・ツアーを掲載しています（お渡し会・サイン会等は対象外）。";
  elements.liveList.appendChild(notice);

  const list = document.createElement("div");
  list.className = "live-event-list";
  heldAscending.forEach((event) => list.appendChild(buildLiveEventCard(event)));
  elements.liveList.appendChild(list);

  if (announcedEvents.length > 0) {
    const heading = document.createElement("p");
    heading.className = "section-heading";
    heading.textContent = "開催予定";
    elements.liveList.appendChild(heading);
    const announcedList = document.createElement("div");
    announcedList.className = "live-event-list";
    announcedEvents.forEach((event) => announcedList.appendChild(buildLiveEventCard(event)));
    elements.liveList.appendChild(announcedList);
  }
}

function switchDiscographyTab(tabName) {
  TAB_NAMES.forEach((name) => {
    const isActive = name === tabName;
    elements.tabButtons[name].classList.toggle("is-active", isActive);
    elements.tabButtons[name].setAttribute("aria-selected", String(isActive));
    elements.tabPanels[name].classList.toggle("is-active", isActive);
  });
}

// ---- 作品詳細画面 ----

function buildFactRow(label, value) {
  const row = document.createElement("div");
  row.className = "fact-row";
  const k = document.createElement("span");
  k.className = "fact-row-key";
  k.textContent = label;
  row.appendChild(k);
  const v = document.createElement("span");
  v.className = "fact-row-value";
  v.textContent = value;
  row.appendChild(v);
  return row;
}

function buildTrackRow(song) {
  const row = document.createElement("div");
  row.className = "discography-track-row";

  const tag = document.createElement("span");
  const isTitleTrack = song.category === CATEGORY.TITLE_TRACK;
  tag.className = `track-tag ${isTitleTrack ? "is-title" : "is-coupling"}`;
  tag.textContent = isTitleTrack ? "表題" : "c/w";
  row.appendChild(tag);

  const name = document.createElement("span");
  name.className = "track-name";
  name.textContent = song.title;
  row.appendChild(name);

  if (Array.isArray(song.center) && song.center.length > 0) {
    const center = document.createElement("span");
    center.className = "track-center";
    center.textContent = `センター：${song.center.join("・")}`;
    row.appendChild(center);
  }

  return row;
}

const WORK_LINK_LABELS = {
  official: "公式サイト",
  store: "公式ストア",
  mv: "公式MV / YouTube",
  streaming: "配信サービスで聴く",
};

function buildOfficialLinksSection(officialLinks) {
  const wrapper = document.createElement("div");
  const availableLinks = Object.entries(officialLinks ?? {}).filter(([, url]) => url);

  if (availableLinks.length === 0) {
    const notice = document.createElement("p");
    notice.className = "empty-state-note";
    notice.textContent = "公式リンクは準備中です";
    wrapper.appendChild(notice);
    return wrapper;
  }

  availableLinks.forEach(([key, url]) => {
    const link = document.createElement("a");
    link.className = "official-link-button";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = WORK_LINK_LABELS[key] ?? key;
    wrapper.appendChild(link);
  });

  return wrapper;
}

function renderWorkDetail(work) {
  elements.workDetailTitle.textContent = work.title;

  elements.workDetailContent.innerHTML = "";

  const hero = document.createElement("div");
  hero.className = "detail-hero";
  const typeBadge = document.createElement("span");
  typeBadge.className = "type-badge";
  typeBadge.textContent = buildWorkTypeLabel(work.workId, work.type);
  hero.appendChild(typeBadge);
  const factList = document.createElement("div");
  factList.className = "fact-list";
  factList.appendChild(buildFactRow("発売日", formatDate(work.releaseDate)));
  // センターという概念がない作品（songs.jsのcenterType:"none"）ではvocalLabelがnullになり、
  // 行自体を出さない（「未確認」に見せて情報収集漏れと誤解されないようにするため）。
  if (work.vocalLabel) {
    factList.appendChild(
      buildFactRow(work.vocalLabel, work.vocalNames.length > 0 ? work.vocalNames.join("・") : "未確認")
    );
  }
  hero.appendChild(factList);
  elements.workDetailContent.appendChild(hero);

  // 公式リンクが1件も無い作品では、「準備中」を出さずセクションごと非表示にする
  // （全26作品が「準備中」に見えて未完成感が出るのを避けるため、2026-08-03変更）。
  const hasOfficialLinks = Object.values(work.officialLinks ?? {}).some(Boolean);
  if (hasOfficialLinks) {
    const linksHeading = document.createElement("p");
    linksHeading.className = "section-heading";
    linksHeading.textContent = "公式リンク";
    elements.workDetailContent.appendChild(linksHeading);
    elements.workDetailContent.appendChild(buildOfficialLinksSection(work.officialLinks));
  }

  const tracksHeading = document.createElement("p");
  tracksHeading.className = "section-heading";
  tracksHeading.textContent = "収録曲";
  elements.workDetailContent.appendChild(tracksHeading);
  const trackList = document.createElement("div");
  trackList.className = "track-list";
  work.songs.forEach((song) => trackList.appendChild(buildTrackRow(song)));
  elements.workDetailContent.appendChild(trackList);

  if (work.description) {
    const descHeading = document.createElement("p");
    descHeading.className = "section-heading";
    descHeading.textContent = "その他情報";
    elements.workDetailContent.appendChild(descHeading);
    const desc = document.createElement("p");
    desc.className = "work-description";
    desc.textContent = work.description;
    elements.workDetailContent.appendChild(desc);
  }
}

// ディスコグラフィー画面全体（3タブ）を描画する。渡すデータが変わることは実質無い
// （曲・メンバー・年表イベントの追加はあっても頻繁ではない）ため、開くたびの再描画で十分。
export function renderDiscographyScreen({
  songs,
  members,
  discographyEntries,
  historyEvents,
  groupInfo,
  groupActivities,
  liveEvents,
  sisterGroups,
  upcomingRelease,
}) {
  const workSummaries = buildWorkSummaries(songs, discographyEntries);
  renderAboutTab(members, groupInfo, groupActivities, sisterGroups);
  renderHistoryTab(members, workSummaries, historyEvents);
  renderWorksTab(workSummaries, upcomingRelease);
  renderLiveTab(liveEvents);
}

// 作品一覧・年表のカードがタップされたときに、作品詳細画面へ渡すデータを組み立てる。
export function openWorkDetail(songs, discographyEntries, workId) {
  const workSummaries = buildWorkSummaries(songs, discographyEntries);
  const work = workSummaries.find((candidate) => candidate.workId === workId);
  if (!work) return;
  renderWorkDetail(work);
}

// ディスコグラフィー画面・作品詳細画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   tabButtons: { about, history, works, live } のタブボタン,
//   tabPanels: { about, history, works, live } のタブの中身,
//   aboutContent: ＝LOVEについてタブの中身,
//   timeline: 年表タブの中身,
//   workList: 作品一覧タブの中身,
//   liveList: ライブタブの中身,
//   workDetailTitle, workDetailContent: 作品詳細画面の中身,
//   onSelectWork: 作品カードがタップされたときに呼ばれるコールバック（workIdを受け取る）,
// }
export function initDiscographyScreen(newElements) {
  elements = newElements;

  TAB_NAMES.forEach((name) => {
    elements.tabButtons[name].addEventListener("click", () => switchDiscographyTab(name));
  });
}
