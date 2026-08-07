// js/membersScreen.js（メンバー一覧カード）のテスト。
// 2026-08-07追加：「プロフィールを見る」案内文言と、カード本体／☆／♡の役割分担が
// 壊れていないことを確認する恒久テスト（本人指摘：カード本体タップでプロフィールが
// 開くことに気づきにくい、という改善のための回帰防止）。
import { buildActiveMemberCard, initMembersScreen } from "../js/membersScreen.js";
import {
  isFavoriteMember,
  isMostOshiMember,
  toggleFavoriteMember,
  clearMostOshiMember,
} from "../js/oshiMembers.js";
import { assertEqual } from "./test-utils.js";

const TEST_MEMBER_ID = "test-member-view-hint";

function buildTestMember() {
  return {
    id: TEST_MEMBER_ID,
    attendanceNumber: 1,
    name: "テスト花子",
    roles: ["リーダー"],
    memberColor: { name: "テストピンク", hex: "#ff69b4" },
  };
}

function resetOshiState() {
  if (isFavoriteMember(TEST_MEMBER_ID)) toggleFavoriteMember(TEST_MEMBER_ID);
  clearMostOshiMember();
}

export function runMembersScreenTests() {
  resetOshiState();

  let selectedId = null;
  let selectCount = 0;
  initMembersScreen({
    onSelectMember: (id) => {
      selectedId = id;
      selectCount += 1;
    },
  });

  const member = buildTestMember();

  // ---- カード本体（tapTarget）はネイティブbuttonで、クリックすると詳細が開く ----
  const card = buildActiveMemberCard(member);
  document.body.appendChild(card);
  const tapTarget = card.querySelector(".member-card-tap-target");
  assertEqual(tapTarget.tagName, "BUTTON", "カード本体タップ領域はネイティブのbutton要素（キーボード操作も自然に可能）");

  tapTarget.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertEqual(selectedId, TEST_MEMBER_ID, "カード本体タップで詳細が正しいmemberIdで開く");
  assertEqual(selectCount, 1, "カード本体タップは1回だけ詳細を開く");
  document.body.removeChild(card);

  // ---- 「プロフィールを見る」案内文言はtapTarget内にあり、押しても詳細が開く ----
  selectedId = null;
  selectCount = 0;
  const card2 = buildActiveMemberCard(member);
  document.body.appendChild(card2);
  const hint = card2.querySelector(".member-card-view-hint");
  assertEqual(hint !== null, true, "「プロフィールを見る」の案内文言が表示される");
  const tapTarget2 = card2.querySelector(".member-card-tap-target");
  assertEqual(tapTarget2.contains(hint), true, "案内文言はカード本体タップ領域（button）の中にある");
  hint.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertEqual(selectedId, TEST_MEMBER_ID, "「プロフィールを見る」の文言をタップしても詳細が開く");
  document.body.removeChild(card2);

  // ---- ☆（最推し）タップでは詳細が開かず、最推し状態だけが変わる ----
  resetOshiState();
  selectedId = null;
  selectCount = 0;
  const card3 = buildActiveMemberCard(member);
  document.body.appendChild(card3);
  const starButton = card3.querySelector(".member-card-star-button");
  starButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertEqual(selectCount, 0, "☆タップでは詳細が開かない（event propagationが正しく止まっている）");
  assertEqual(isMostOshiMember(TEST_MEMBER_ID), true, "☆タップで最推しに設定される");
  document.body.removeChild(card3);

  // ---- ♡（推し）タップでは詳細が開かず、推し登録の解除だけが行われる ----
  // （☆タップの直後は「最推し設定時に自動で推しメンにもなる」既存仕様により推し登録済みのため、
  // ここでの♡タップは「解除」動作になる。既存ロジックの回帰確認が目的で、
  // 新しい仕様を作っているわけではない）。
  selectedId = null;
  selectCount = 0;
  const card4 = buildActiveMemberCard(member);
  document.body.appendChild(card4);
  const heartButton = card4.querySelector(".member-card-favorite-button");
  heartButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertEqual(selectCount, 0, "♡タップでは詳細が開かない（event propagationが正しく止まっている）");
  assertEqual(isFavoriteMember(TEST_MEMBER_ID), false, "♡タップで推し登録が解除される");
  document.body.removeChild(card4);

  resetOshiState();
}
