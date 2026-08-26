// js/newSingleAnnouncement.js のテスト。
// IndexedDBに触れる部分（getAvailableSongIds）は自動テストの対象外にし
// （このプロジェクトの既存テストと同じ方針）、IndexedDBに一切触れない純粋関数
// （isAnnouncementFullyAvailable・findEligibleAnnouncementSync）だけを対象にする。
// sessionStorage/localStorageは、tests/centerCelebration.test.jsと同じく、実際の
// ブラウザのストレージを直接読み書きして確認する。

import {
  NEW_SINGLE_ANNOUNCEMENTS,
  isAnnouncementFullyAvailable,
  findEligibleAnnouncementSync,
} from "../js/newSingleAnnouncement.js";
import { assertEqual } from "./test-utils.js";

const ANNOUNCEMENT = NEW_SINGLE_ANNOUNCEMENTS[0]; // "single-21"
const DONE_KEY = `equalLoveIntroQuiz.newSingleAnnouncementDone.${ANNOUNCEMENT.id}`;
const LATER_KEY = `equalLoveIntroQuiz.newSingleAnnouncementHiddenThisSession.${ANNOUNCEMENT.id}`;

function cleanup() {
  localStorage.removeItem(DONE_KEY);
  sessionStorage.removeItem(LATER_KEY);
}

export function runNewSingleAnnouncementTests() {
  cleanup();

  // ---- isAnnouncementFullyAvailable：正常系 ----
  assertEqual(
    isAnnouncementFullyAvailable(ANNOUNCEMENT, ANNOUNCEMENT.requiredAudioSongIds),
    true,
    "対象曲がすべて含まれていればtrueを返す"
  );
  assertEqual(
    isAnnouncementFullyAvailable(ANNOUNCEMENT, [ANNOUNCEMENT.requiredAudioSongIds[0]]),
    false,
    "対象曲の一部しか含まれていなければfalseを返す"
  );
  assertEqual(isAnnouncementFullyAvailable(ANNOUNCEMENT, []), false, "1曲も含まれていなければfalseを返す");
  assertEqual(
    isAnnouncementFullyAvailable(ANNOUNCEMENT, new Set(ANNOUNCEMENT.requiredAudioSongIds)),
    true,
    "Setを渡してもArrayと同じ判定になる"
  );
  assertEqual(
    isAnnouncementFullyAvailable(ANNOUNCEMENT, [...ANNOUNCEMENT.requiredAudioSongIds, "他の無関係な曲id"]),
    true,
    "対象外の曲idが余分に含まれていても、対象曲が揃っていればtrueを返す"
  );

  // ---- findEligibleAnnouncementSync：初期状態（未対応・未読了）では表示対象になる ----
  assertEqual(
    findEligibleAnnouncementSync([])?.id,
    ANNOUNCEMENT.id,
    "音源が1つも無く、まだ既読/対応済みでなければ表示対象になる"
  );

  // ---- 対象曲の音源がすべて揃っている場合は、doneフラグが立っていなくても対象外 ----
  assertEqual(
    findEligibleAnnouncementSync(ANNOUNCEMENT.requiredAudioSongIds),
    null,
    "対象曲の音源がすべて揃っていれば、doneフラグの有無に関わらず表示対象外になる（安全側の二重チェック）"
  );

  cleanup();

  // ---- 「あとで」（セッション限定の非表示）は、doneフラグを立てない ----
  sessionStorage.setItem(LATER_KEY, "true");
  assertEqual(
    findEligibleAnnouncementSync([]),
    null,
    "セッション限定で非表示にした場合、この起動中は表示対象外になる"
  );
  assertEqual(
    localStorage.getItem(DONE_KEY),
    null,
    "「あとで」（セッション限定の非表示）は、永久非表示（done）フラグには一切影響しない"
  );

  cleanup();

  // ---- 「追加済み・今後表示しない」（永久非表示）は、音源が揃っていなくても対象外にする ----
  localStorage.setItem(DONE_KEY, "true");
  assertEqual(
    findEligibleAnnouncementSync([]),
    null,
    "永久に非表示（done）にした場合、音源がまだ無くても表示対象外になる（明示的な意思表示を優先）"
  );

  cleanup();

  // ---- 「あとで」を解除する新しい起動（セッションがリセットされた状態）では、再び対象になる ----
  sessionStorage.setItem(LATER_KEY, "true");
  sessionStorage.removeItem(LATER_KEY); // 新しい起動＝sessionStorageがリセットされた状態を再現
  assertEqual(
    findEligibleAnnouncementSync([])?.id,
    ANNOUNCEMENT.id,
    "「あとで」は次回の起動（sessionStorageのリセット）で再び表示対象になる"
  );

  cleanup();
}
