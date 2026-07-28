// 称号一覧モーダルを担当するファイル。
// 「称号一覧」ボタン・「称号一覧を見る」リンクからの開閉、×ボタン・背景クリック・Escキーでの
// 閉じる処理まで、この画面に関わる開閉ロジックはすべてこのファイルの中に閉じ込める。
// main.jsは初期化時にinitTitleListModal()を1回呼ぶだけでよく、開閉の詳細を知らなくてよい。
//
// 描画に使うデータはtitleProgress.jsのgetTitleListSnapshot()から取得する。
// 称号の解放条件・保存の仕組みはこのファイルからは一切参照しない（表示に徹する）。

import { getTitleListSnapshot } from "./titleProgress.js";
import { buildTitleIconMedal, buildLockedIconMedal } from "./titleIcons.js";

// 進捗ドットに表示する、出題数のラベル。
// main.jsのQUESTION_COUNT_LABELSと同じ表記に揃えている。「全曲」ではなく「全問」なのは、
// カテゴリの選択肢にも同じ「全曲」という言葉があり、紛らわしくならないよう
// 出題数側だけ「全問」と呼び分ける、というこのプロジェクト内の既存の方針に合わせるため。
const MODE_DOT_ITEMS = [
  { value: "5", label: "5問" },
  { value: "10", label: "10問" },
  { value: "20", label: "20問" },
  { value: "50", label: "50問" },
  { value: "all", label: "全問" },
];

// このモーダルが使うDOM要素一式。initTitleListModal()で受け取って保持する。
let elements = null;

function isModalOpen() {
  return elements !== null && !elements.overlay.hidden;
}

// モーダルを開く。開くたびに最新の状態で描画し直し、スクロール位置も必ず先頭へ戻す
// （前回下の方までスクロールした状態のまま次に開くと、1件目の称号が見えないため）。
function open() {
  renderTitleList();
  elements.modalCard.scrollTop = 0;
  elements.overlay.hidden = false;
}

function close() {
  elements.overlay.hidden = true;
}

// Escキーはモーダルが開いているときだけ反応させる
// （既存のルール説明モーダルと同じ考え方。閉じているときに他画面のショートカットを妨げない）。
function handleKeydown(event) {
  if (event.key !== "Escape") return;
  if (!isModalOpen()) return;
  close();
}

// オーバーレイの「背景部分」をクリックしたときだけ閉じる。
// モーダルカードの中身をクリックしたときはbubbleでここまで届くが、
// event.targetが背景要素そのものである場合だけを対象にすることで、誤って閉じないようにする。
function handleOverlayClick(event) {
  if (event.target !== elements.overlay) return;
  close();
}

// perMode称号用の、「出題数別の達成状況」という見出し＋進捗ドット（5個）をまとめて組み立てる。
// 見出しを添えるのは、ドットと数字だけでは初めて見る人に何を表しているか伝わりにくいため。
function buildProgressDots(achievedModes) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("title-progress");

  const caption = document.createElement("p");
  caption.classList.add("title-progress-caption");
  caption.textContent = "出題数別の達成状況";
  wrapper.appendChild(caption);

  const row = document.createElement("div");
  row.classList.add("title-progress-dots");

  MODE_DOT_ITEMS.forEach(({ value, label }) => {
    const item = document.createElement("div");
    item.classList.add("title-progress-dot-item");

    const dot = document.createElement("span");
    dot.classList.add("title-progress-dot");
    dot.classList.toggle("is-done", achievedModes[value] === true);
    item.appendChild(dot);

    const dotLabel = document.createElement("span");
    dotLabel.classList.add("title-progress-dot-label");
    dotLabel.textContent = label;
    item.appendChild(dotLabel);

    row.appendChild(item);
  });

  wrapper.appendChild(row);
  return wrapper;
}

// single称号用の、達成済み／未達成バッジを組み立てる。
function buildAchievedBadge(isAchieved) {
  const badge = document.createElement("span");
  badge.classList.add("title-achieved-badge");
  badge.classList.toggle("is-achieved", isAchieved === true);
  badge.textContent = isAchieved ? "達成済み" : "未達成";
  return badge;
}

// 称号名（またはロック中の「？？？」）を、アイコンメダルと横並びにした見出し行を組み立てる。
function buildCardHeader(iconMedal, nameText) {
  const header = document.createElement("div");
  header.classList.add("title-list-header");
  header.appendChild(iconMedal);

  const name = document.createElement("p");
  name.classList.add("title-list-name");
  name.textContent = nameText;
  header.appendChild(name);

  return header;
}

// 解放済みの称号1件分のカードを組み立てる（アイコン・名前・条件・進捗表示）。
function buildUnlockedCard(entry) {
  const card = document.createElement("div");
  card.classList.add("title-list-card", "is-unlocked");
  card.dataset.titleId = entry.id;

  card.appendChild(buildCardHeader(buildTitleIconMedal(entry.id), entry.name));

  const condition = document.createElement("p");
  condition.classList.add("title-list-condition");
  condition.textContent = entry.conditionText;
  card.appendChild(condition);

  if (entry.storageScope === "perMode") {
    card.appendChild(buildProgressDots(entry.achievedModes));
  } else {
    card.appendChild(buildAchievedBadge(entry.isAchieved));
  }

  return card;
}

// 開発用プレビュー（dev/preview.html）専用のエクスポート。通常のゲーム本編からは呼ばれない。
// 未解放の称号も強制的に「解放済み」の見た目にして、全カードを一覧表示する。
// 保存データは一切書き換えず、表示だけを差し替えている。
export function debugPreviewAllTitleCards(container) {
  const snapshot = getTitleListSnapshot();
  container.innerHTML = "";
  snapshot.forEach((entry) => {
    const previewEntry = entry.isUnlocked
      ? entry
      : {
          ...entry,
          isUnlocked: true,
          achievedModes:
            entry.storageScope === "perMode"
              ? { "5": false, "10": false, "20": false, "50": false, all: false }
              : null,
          isAchieved: entry.storageScope === "single" ? false : null,
        };
    container.appendChild(buildUnlockedCard(previewEntry));
  });
}
// ▲▲▲ 一時的な確認用ここまで ▲▲▲

// ロック中の称号1件分のカードを組み立てる（名前は「？？？」、ヒント文だけ見せる）。
// アイコンも称号ごとの絵柄ではなく、正体が分からない「？」だけのメダルにする。
function buildLockedCard(entry) {
  const card = document.createElement("div");
  card.classList.add("title-list-card", "is-locked");
  card.dataset.titleId = entry.id;

  card.appendChild(buildCardHeader(buildLockedIconMedal(), "？？？"));

  const hint = document.createElement("p");
  hint.classList.add("title-list-hint");
  hint.textContent = entry.lockedHint;
  card.appendChild(hint);

  return card;
}

// 現在の状態を読み込み直して、称号一覧の中身を描画する。
// モーダルを開くたびに呼ぶことで、前回開いたとき以降に増えた進捗も必ず反映される。
function renderTitleList() {
  const snapshot = getTitleListSnapshot();
  elements.listContainer.innerHTML = "";

  snapshot.forEach((entry) => {
    const card = entry.isUnlocked ? buildUnlockedCard(entry) : buildLockedCard(entry);
    elements.listContainer.appendChild(card);
  });
}

// 称号一覧モーダルを使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   overlay: モーダルの背景を含む、開閉をhiddenで切り替える要素,
//   modalCard: スクロールする実体（.modal-card）。開くたびにscrollTopを0に戻すために使う,
//   closeButton: ×ボタン,
//   listContainer: 称号カードを並べる入れ物,
//   openTriggers: クリックすると開く要素の配列
//     （スタート画面の「称号一覧」ボタン、結果画面の「称号一覧を見る」リンクなど。
//       将来、称号チップ自体をタップして開けるようにする等、入口が増えても
//       この配列に足すだけで対応できる）,
// }
//
// 戻り値は { open, close, destroy } の3つの関数を持つオブジェクト。
// main.jsから直接モーダルを開閉したくなった場合や、将来画面全体を破棄する処理を
// 追加したくなった場合に備えて、内部で完結させず外に見える形で返している。
export function initTitleListModal(newElements) {
  elements = newElements;

  elements.openTriggers.forEach((trigger) => {
    trigger.addEventListener("click", open);
  });
  elements.closeButton.addEventListener("click", close);
  elements.overlay.addEventListener("click", handleOverlayClick);
  document.addEventListener("keydown", handleKeydown);

  function destroy() {
    elements.openTriggers.forEach((trigger) => {
      trigger.removeEventListener("click", open);
    });
    elements.closeButton.removeEventListener("click", close);
    elements.overlay.removeEventListener("click", handleOverlayClick);
    document.removeEventListener("keydown", handleKeydown);
    elements = null;
  }

  return { open, close, destroy };
}
