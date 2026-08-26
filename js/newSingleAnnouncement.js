// 新曲追加のお知らせバナー（2026-08-27新設）。
// ホーム画面上部に、新しいシングルの音源・歌詞データパックを取り込むよう案内する
// 控えめなバナーを表示する。「あとで」（この起動中だけ非表示、次回また表示）と
// 「追加済み・今後表示しない」（永久に非表示）の2種類の閉じ方を用意し、さらに
// 対象曲の音源が実際にこの端末へ揃っていることを検知できた場合は、ボタンを押さなくても
// 自動的に「追加済み」扱いにする（本人指示：単純なフラグだけでなく、実際の所持状況で
// 安全に判定する。「あとで」を押しただけでは絶対に「追加済み」扱いにしない）。
//
// 【永続化の考え方】お祝いポップアップ（js/centerCelebration.js）と違い、こちらは
// プレイヤーごとではなく端末全体で1つの状態として扱う（対象データはIndexedDB内の
// 音源・歌詞であり、プレイヤーごとに分かれているものではないため）。
//   ・「あとで」        → sessionStorage（この起動中だけ有効、次回の起動でリセットされる）
//   ・「追加済み」       → localStorage（端末に残り続ける、明示的に消さない限り消えない）
//
// 【テスト方針】js/centerCelebration.jsのfindEligibleCelebration()と同じ考え方で、
// 「表示すべきお知らせを決める」ロジック（isAnnouncementFullyAvailable・
// findEligibleAnnouncementSync）はIndexedDBに触れない純粋関数として切り出し、
// tests/newSingleAnnouncement.test.jsで直接テストできるようにしている
// （sessionStorage/localStorageは実ブラウザで直接読み書きする、既存テストと同じ手法）。
// IndexedDBへ実際に触れる部分（getAvailableSongIds）だけを薄いラッパー
// （initNewSingleAnnouncement・recheckNewSingleAnnouncementAfterImport）に分離している。
//
// 【将来の拡張】22枚目以降の新曲でも同じ仕組みを使えるよう、お知らせの内容は
// NEW_SINGLE_ANNOUNCEMENTS配列に1件ずつ持たせる設計にしている（js/centerCelebration.jsの
// CELEBRATIONS配列と同じ考え方）。今回は21stシングルの1件だけを登録する。

import { getAvailableSongIds, AVAILABLE_DATA_KIND } from "./availableSongs.js";

export const NEW_SINGLE_ANNOUNCEMENTS = [
  {
    id: "single-21",
    title: "21枚目の楽曲データが追加されました！",
    body: "新しい音源・歌詞を「追加データパックを読み込む」から取り込んでください。",
    // このお知らせを「追加済み」と自動判定するために、実際に音源が揃っているか確認する曲ID。
    requiredAudioSongIds: ["koi-hajimemashita", "natsunagori-summer-tune", "yume-no-tsuzuki"],
  },
];

function buildDoneStorageKey(announcementId) {
  return `equalLoveIntroQuiz.newSingleAnnouncementDone.${announcementId}`;
}

function buildLaterStorageKey(announcementId) {
  return `equalLoveIntroQuiz.newSingleAnnouncementHiddenThisSession.${announcementId}`;
}

function isDone(announcementId) {
  try {
    return localStorage.getItem(buildDoneStorageKey(announcementId)) === "true";
  } catch {
    return false; // localStorageが使えない環境でも、常に表示される側に倒れて安全（機能自体は失われるだけ）
  }
}

function markDone(announcementId) {
  try {
    localStorage.setItem(buildDoneStorageKey(announcementId), "true");
  } catch {
    // 保存できなくても致命的ではない（次回起動時にまた自動判定・表示されるだけ）
  }
}

function isHiddenThisSession(announcementId) {
  try {
    return sessionStorage.getItem(buildLaterStorageKey(announcementId)) === "true";
  } catch {
    return false;
  }
}

function markHiddenThisSession(announcementId) {
  try {
    sessionStorage.setItem(buildLaterStorageKey(announcementId), "true");
  } catch {
    // 保存できなくても致命的ではない
  }
}

// announcementが指す曲の音源が、availableAudioSongIds（この端末が実際に持っている音源の
// 曲ID一覧）にすべて含まれているかどうかを判定する純粋関数（IndexedDBには一切触れない）。
export function isAnnouncementFullyAvailable(announcement, availableAudioSongIds) {
  const availableSet =
    availableAudioSongIds instanceof Set ? availableAudioSongIds : new Set(availableAudioSongIds ?? []);
  return announcement.requiredAudioSongIds.every((songId) => availableSet.has(songId));
}

// 表示すべきお知らせを1件だけ返す純粋関数（IndexedDBには一切触れない。availableAudioSongIdsは
// 呼び出し側が事前に取得したものを渡す）。sessionStorage/localStorageは
// js/centerCelebration.jsのfindEligibleCelebration()と同じく直接読み書きする
// （テストではブラウザの実際のsessionStorage/localStorageをそのまま使う）。
// 「音源がすでに揃っている」announcementは、本来ここに来る前に自動でdone化されている想定だが、
// 万一done化が漏れていても、ここで二重にチェックして安全側に倒す。
export function findEligibleAnnouncementSync(availableAudioSongIds) {
  for (const announcement of NEW_SINGLE_ANNOUNCEMENTS) {
    if (isDone(announcement.id)) continue;
    if (isAnnouncementFullyAvailable(announcement, availableAudioSongIds)) continue;
    if (isHiddenThisSession(announcement.id)) continue;
    return announcement;
  }
  return null;
}

// elements: { banner, titleText, bodyText, openButton, laterButton, doneButton }
// onOpenDataManagement: 「データ管理を開く」が押されたときに呼ぶコールバック
//   （データ管理セクションの折りたたみを開き、スクロールする処理はjs/main.js側が担当する。
//   本ファイルはDOM構造の詳細〈details要素かどうか等〉を知らなくてよいようにするため）。
export async function initNewSingleAnnouncement(elements, onOpenDataManagement) {
  const availableAudioSongIds = await getAvailableSongIds(AVAILABLE_DATA_KIND.AUDIO);

  // 音源がすでに揃っているお知らせは、ボタンを押されなくても先に自動で「追加済み」にする
  // （本人指示：単純なフラグだけでなく、実際の所持状況で安全に判定する）。
  for (const announcement of NEW_SINGLE_ANNOUNCEMENTS) {
    if (!isDone(announcement.id) && isAnnouncementFullyAvailable(announcement, availableAudioSongIds)) {
      markDone(announcement.id);
    }
  }

  const announcement = findEligibleAnnouncementSync(availableAudioSongIds);
  if (!announcement) {
    elements.banner.hidden = true;
  } else {
    elements.titleText.textContent = announcement.title;
    elements.bodyText.textContent = announcement.body;
    elements.banner.hidden = false;
    elements.banner.dataset.announcementId = announcement.id;
  }

  elements.laterButton.addEventListener("click", () => {
    const currentId = elements.banner.dataset.announcementId;
    if (currentId) markHiddenThisSession(currentId);
    elements.banner.hidden = true;
  });

  elements.doneButton.addEventListener("click", () => {
    const currentId = elements.banner.dataset.announcementId;
    if (currentId) markDone(currentId);
    elements.banner.hidden = true;
  });

  elements.openButton.addEventListener("click", () => {
    onOpenDataManagement();
  });
}

// データパックの読み込みに成功した直後など、端末の所持曲が変わったタイミングで呼ぶ。
// 対象の音源がすべて揃っていれば、ボタンを押さなくてもバナーを自動的に閉じる
// （本人指示・項目8：インポート成功後の自動非表示）。まだ揃っていなければ何もしない
// （表示中のバナーはそのまま残る）。
export async function recheckNewSingleAnnouncementAfterImport(elements) {
  const currentId = elements.banner.dataset.announcementId;
  if (!currentId || elements.banner.hidden) return;
  const announcement = NEW_SINGLE_ANNOUNCEMENTS.find((item) => item.id === currentId);
  if (!announcement) return;

  const availableAudioSongIds = await getAvailableSongIds(AVAILABLE_DATA_KIND.AUDIO);
  if (isAnnouncementFullyAvailable(announcement, availableAudioSongIds)) {
    markDone(announcement.id);
    elements.banner.hidden = true;
  }
}
