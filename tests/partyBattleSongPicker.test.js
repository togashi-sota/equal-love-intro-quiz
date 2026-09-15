// パーティー対戦「曲を選んで出題」の曲選択（2026-09-15 第4回実機QA修正・本人指示：オンライン対戦の曲選択と同じ操作感へ）のテスト。
//
// 【仕様】全84曲を1本の縦リストにせず、オンライン対戦の曲選択画面と同じ「シングルごと（1枚目／2枚目…）の折りたたみ
// グループ」に分割（js/songGroupSelectList.js。オンライン側の js/onlineBattleSongPicker.js と同じ DOM 構造・CSS）。
//   ・グループ（ページ）単位の全選択／全解除と、全曲選択／全曲解除は別
//   ・グループを移動しても・検索しても・検索を解除しても、選択状態（Set）は失われない
//   ・「選択中：N曲」は全グループを通した合計。4択回答の「異なる4曲以上」は全選択集合で判定
//   ・曲属性ラベル（表題曲／全員曲／ユニット曲…）はグループ分け後も正しい曲に付く
import { assertEqual } from "./test-utils.js";
import { SONGS } from "../js/data/songs.js";
import { buildSongGroups, CATEGORY_PILL_INFO } from "../js/songGrouping.js";
import { createSongGroupSelectList } from "../js/songGroupSelectList.js";
import { normalizePartySettings } from "../js/partyBattleState.js";

function mount() {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-3000px;top:0;width:393px;";
  const container = document.createElement("div");
  const notice = document.createElement("p");
  notice.hidden = true;
  host.append(container, notice);
  document.body.appendChild(host);
  return { host, container, notice };
}

function checkedIds(container) {
  return [...container.querySelectorAll('input[type="checkbox"]')].filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
}

function visibleRowIds(container) {
  return [...container.querySelectorAll(".song-select-row")].filter((row) => !row.hidden && !row.closest(".single-group").hidden).map((row) => row.dataset.songId);
}

export async function runPartyBattleSongPickerTests() {
  const { host, container, notice } = mount();
  const selected = new Set();
  let changeCount = 0;
  const list = createSongGroupSelectList({ container, songs: SONGS, selectedSongIds: selected, onSelectionChange: () => { changeCount += 1; }, noResultsNotice: notice });
  list.render();

  // ===== ページ（シングルごとのグループ）分割 =====
  const groups = buildSongGroups(SONGS);
  const groupElements = [...container.querySelectorAll(".single-group")];
  assertEqual(groupElements.length, groups.length, `全${SONGS.length}曲がシングルごとの${groups.length}グループに分割される（1本の長いリストにしない）`);
  assertEqual(groups.length >= 10, true, "グループ数は十分に多い（1ページに全曲を並べない）");
  assertEqual(container.querySelectorAll(".song-select-row").length, SONGS.length, "全曲がいずれかのグループに1回ずつ入る");
  assertEqual(groupElements[0].classList.contains("is-open") && !groupElements[1].classList.contains("is-open"), true, "初期状態は最初のグループだけ開く（オンライン側と同じ）");
  assertEqual(groupElements[0].querySelector(".single-group-name").textContent, groups[0].label, "見出しは「Nthシングル 表題曲名」（buildSongGroups のラベル）");
  assertEqual(groupElements.every((element) => element.querySelector(".single-group-bulk-actions button:first-child").textContent === "全選択" && element.querySelector(".single-group-bulk-actions button:last-child").textContent === "全解除"), true, "各グループに「全選択」「全解除」（オンライン側と同じ表記）");
  assertEqual(groupElements.every((element) => /^0\/\d+曲選択$/.test(element.querySelector(".track-count-chip").textContent)), true, "各グループに「n/m曲選択」チップ");

  // ===== ページ移動（グループの開閉） =====
  groupElements[1].querySelector(".single-group-header").click();
  assertEqual(groupElements[1].classList.contains("is-open"), true, "見出しタップで2ページ目（2枚目）が開く");
  groupElements[1].querySelector(".single-group-header").click();
  assertEqual(groupElements[1].classList.contains("is-open"), false, "もう一度タップで閉じる");

  // ===== ページ全選択 → 別ページで数曲追加 → 最初のページの選択が残る =====
  const page1Ids = groups[0].songs.map((song) => song.id);
  groupElements[0].querySelector(".single-group-bulk-actions button:first-child").click();
  assertEqual([...selected].sort(), [...page1Ids].sort(), "1ページ目を全選択：そのページの曲だけが選択される");
  assertEqual(groupElements[0].querySelector(".track-count-chip").textContent, `${page1Ids.length}/${page1Ids.length}曲選択`, "1ページ目のチップが n/n");
  const page2Rows = [...groupElements[1].querySelectorAll(".song-select-row")];
  page2Rows[0].querySelector("input").click();
  page2Rows[1].querySelector("input").click();
  assertEqual(selected.size, page1Ids.length + 2, "2ページ目で2曲追加すると合計に加わる");
  assertEqual(page1Ids.every((id) => selected.has(id)), true, "1ページ目へ戻っても最初の選択状態が残っている");
  assertEqual(checkedIds(container).length, selected.size, "DOM のチェック状態と選択集合が一致");
  assertEqual(changeCount > 0, true, "選択が変わるたびに合計の更新コールバックが呼ばれる");

  // ===== ページ全解除は他のページに影響しない =====
  groupElements[0].querySelector(".single-group-bulk-actions button:last-child").click();
  assertEqual(page1Ids.some((id) => selected.has(id)), false, "1ページ目を全解除：そのページの曲だけ解除");
  assertEqual(selected.size, 2, "2ページ目の2曲は残る（ページ単位の操作と全曲操作を混同しない）");

  // ===== 検索中も選択を失わない／検索解除後も維持 =====
  const keptBefore = [...selected];
  list.setSearchQuery("＝LOVE");
  const visibleDuringSearch = visibleRowIds(container);
  assertEqual(visibleDuringSearch.includes("love"), true, "検索「＝LOVE」で ＝LOVE が表示される");
  assertEqual(visibleDuringSearch.length < SONGS.length, true, "検索で一覧が絞られる");
  assertEqual([...selected], keptBefore, "検索中も別ページで選んだ曲の選択は失われない");
  // 検索結果の曲を選ぶ → 検索解除後も残る
  const loveCheckbox = container.querySelector('input[value="love"]');
  loveCheckbox.click();
  assertEqual(selected.has("love"), true, "検索結果から選択できる");
  list.setSearchQuery("");
  assertEqual(visibleRowIds(container).length, SONGS.length, "検索解除で全曲が戻る");
  assertEqual(selected.has("love") && keptBefore.every((id) => selected.has(id)), true, "検索解除後も選択状態を維持");
  list.setSearchQuery("ぜったいにそんざいしないきょく");
  assertEqual(notice.hidden, false, "該当なしの案内");
  assertEqual(selected.size, keptBefore.length + 1, "該当なしでも選択は消えない");
  list.setSearchQuery("");
  assertEqual(notice.hidden, true, "検索解除で案内が消える");

  // ===== 選択中の曲だけ表示 =====
  list.setShowSelectedOnly(true);
  assertEqual(visibleRowIds(container).sort(), [...selected].sort(), "「選択中の曲だけ表示」で選択曲だけが見える");
  list.setShowSelectedOnly(false);
  assertEqual(visibleRowIds(container).length, SONGS.length, "解除で全曲");

  // ===== 全曲選択／全曲解除（検索で隠れている曲も含む） =====
  list.setSearchQuery("＝LOVE");
  list.selectAll();
  assertEqual(selected.size, SONGS.length, "全曲選択は検索で隠れている曲も含めて全曲");
  list.setSearchQuery("");
  assertEqual(checkedIds(container).length, SONGS.length, "DOM のチェックも全曲");
  list.deselectAll();
  assertEqual(selected.size, 0, "全曲解除で0曲");
  assertEqual(checkedIds(container).length, 0, "DOM のチェックも0");

  // ===== 曲属性ラベル：グループ分け後も正しい曲に付く =====
  let labelChecked = 0;
  container.querySelectorAll(".song-select-row").forEach((row) => {
    const song = SONGS.find((entry) => entry.id === row.dataset.songId);
    const pill = row.querySelector(".category-pill");
    assertEqual(pill.textContent, CATEGORY_PILL_INFO[song.category].text, `「${song.title}」の属性ラベル`);
    assertEqual(row.querySelector(".song-select-title").textContent, song.title, `「${song.title}」の曲名`);
    labelChecked += 1;
  });
  assertEqual(labelChecked, SONGS.length, "全曲の属性ラベルを検査した");
  assertEqual(["表題曲", "全員曲", "ユニット曲"].every((text) => [...container.querySelectorAll(".category-pill")].some((pill) => pill.textContent === text)), true, "表題曲／全員曲／ユニット曲のラベルが存在する");

  // ===== 4択の4曲以上条件は「全選択集合」で判定（現在ページの曲数ではない） =====
  const fourChoice = normalizePartySettings({ answerMethod: "fourChoice" });
  const needsFour = (count) => fourChoice.answerMethod === "fourChoice" && count < 4;
  page2Rows[0].querySelector("input").click();
  page2Rows[1].querySelector("input").click();
  groupElements[2].querySelectorAll(".song-select-row input")[0].click();
  groupElements[3].querySelectorAll(".song-select-row input")[0].click();
  assertEqual(selected.size, 4, "4ページにまたがって1曲ずつでも合計4曲");
  assertEqual(needsFour(selected.size), false, "合計4曲なら4択の開始条件を満たす（今のページに3曲しかなくても不可にしない）");
  assertEqual(needsFour(3), true, "3曲では不足");

  // ===== render し直しても選択が残り、選択済みのグループは開く =====
  list.render();
  assertEqual(checkedIds(container).sort(), [...selected].sort(), "再描画後もチェック状態が復元される");
  assertEqual([...container.querySelectorAll(".single-group")].filter((element) => element.classList.contains("is-open")).length >= 4, true, "選択済みの曲があるグループは開いた状態で復元（オンライン側と同じ）");

  host.remove();

  // ===== 画面側の配線：index.html／partyBattleScreen.js／sw.js =====
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const html = await fetchText("index.html");
  ["party-song-picker-count", "party-song-picker-min-notice", "party-song-picker-select-all-button", "party-song-picker-deselect-all-button", "party-song-picker-search-input", "party-song-picker-selected-only-checkbox", "party-song-picker-list", "party-song-picker-no-results-notice", "party-song-picker-sticky-bar", "party-song-picker-sticky-count", "party-song-picker-sticky-confirm-button", "party-song-picker-review-chips"].forEach((id) => {
    assertEqual(html.includes(`id="${id}"`), true, `index.html：選曲画面の要素 #${id} がある`);
  });
  const screen = await fetchText("js/partyBattleScreen.js");
  assertEqual(screen.includes('from "./songGroupSelectList.js"'), true, "partyBattleScreen.js：共通部品 songGroupSelectList を使う");
  assertEqual(screen.includes("pickerList?.selectAll()") && screen.includes("pickerList?.deselectAll()"), true, "partyBattleScreen.js：全曲選択／全曲解除は共通部品へ委譲");
  assertEqual(screen.includes("settings.answerMethod === PARTY_ANSWER_METHOD.FOUR_CHOICE && count < 4"), true, "partyBattleScreen.js：4択の4曲以上は全選択集合（count=pickerSelected.size）で判定");
  const online = await fetchText("js/onlineBattleSongPicker.js");
  assertEqual(online.includes("songGroupSelectList"), false, "オンライン対戦の曲選択（onlineBattleSongPicker.js）は今回変更していない");
  const sw = await fetchText("sw.js");
  assertEqual(sw.includes('"./js/songGroupSelectList.js"'), true, "sw.js：新規JS songGroupSelectList.js が APP_SHELL に登録されている");
  const shared = await fetchText("js/songGroupSelectList.js");
  assertEqual(shared.includes('from "./songGrouping.js"') && shared.includes('from "./songSearch.js"') && shared.includes("buildSongGroups") && shared.includes("songMatchesSearch"), true, "songGroupSelectList.js：既存の共通関数（buildSongGroups／CATEGORY_PILL_INFO／songMatchesSearch）を再利用");
  const songlist = await fetchText("js/songlist.js");
  assertEqual(songlist.includes('import { CATEGORY_PILL_INFO, buildSongGroups } from "./songGrouping.js";') && songlist.includes("export { CATEGORY_PILL_INFO, buildSongGroups };"), true, "songlist.js：CATEGORY_PILL_INFO／buildSongGroups は songGrouping.js から再export（既存の呼び出し元は無変更）");
  assertEqual(sw.includes('"./js/songGrouping.js"'), true, "sw.js：songGrouping.js が APP_SHELL に登録されている");
}
