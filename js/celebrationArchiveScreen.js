// 「記念ポップアップ」の一覧（2026-11-25新設・本人の依頼）。
// 起動時には自動で出さなくなったお祝い・お知らせのポップアップを、利用者が自分の意思で見返す画面。
// 一覧のデータは js/centerCelebration.js の listCelebrationArchive()（お祝いを1件足せば、ここは作り直さずに一覧に出る）。
// 「見る」を押すと、前と同じポップアップ（画像・MV のサムネイル・「MVを見る」「見た！」）を開く。「見た！」で閉じると、この一覧へ戻る。
// 外のリンク（YouTube）は新しいタブで開く（noopener）。文字は textContent で入れる。
import { listCelebrationArchive } from "./centerCelebration.js";

let elements = null;
let options = {};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

export function renderCelebrationArchive() {
  if (!elements?.container) return;
  const container = elements.container;
  container.textContent = "";
  container.appendChild(el("p", "cel-archive-note", "これまでのお祝い・お知らせのポップアップを、もう一度見られます。アプリを開いたときには出ません。"));
  const list = el("ul", "cel-archive-list");
  const entries = listCelebrationArchive();
  if (!entries.length) {
    container.appendChild(el("p", "cel-archive-empty", "まだ記念ポップアップはありません。"));
    return;
  }
  entries.forEach((entry) => {
    const item = el("li", "cel-archive-item");
    item.dataset.celebrationId = entry.id;
    const thumb = el("img", "cel-archive-thumb");
    thumb.src = entry.imageSrc;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.decoding = "async";
    const text = el("div", "cel-archive-text");
    text.append(el("p", "cel-archive-title", entry.title), el("p", "cel-archive-desc", entry.description));
    const actions = el("div", "cel-archive-actions");
    const open = el("button", "cel-archive-open", "見る");
    open.type = "button";
    open.setAttribute("aria-label", `${entry.title}を見る`);
    open.addEventListener("click", () => options.onOpen?.(entry.id));
    actions.appendChild(open);
    if (entry.youtubeUrl) {
      const mv = el("a", "cel-archive-mv", "YouTube で MV を見る");
      mv.href = entry.youtubeUrl;
      mv.target = "_blank";
      mv.rel = "noopener noreferrer";
      actions.appendChild(mv);
    }
    text.appendChild(actions);
    item.append(thumb, text);
    list.appendChild(item);
  });
  container.appendChild(list);
}

// 閉じたあと、開いた項目の「見る」へ戻す（キーボード・読み上げで迷わないように）
export function focusCelebrationArchiveItem(celebrationId) {
  const button = elements?.container?.querySelector(`.cel-archive-item[data-celebration-id="${celebrationId}"] .cel-archive-open`);
  button?.focus({ preventScroll: true });
}

// screenElements：{ container }／screenOptions.onOpen(id)：「見る」を押したとき（main.js がポップアップを開く）
export function initCelebrationArchiveScreen(screenElements, screenOptions = {}) {
  elements = screenElements;
  options = screenOptions;
  renderCelebrationArchive();
}
