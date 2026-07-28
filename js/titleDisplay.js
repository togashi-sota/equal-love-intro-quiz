// 結果画面での、称号（実績）獲得演出を担当するファイル。
// titleProgress.jsが判定・保存まで済ませたイベント配列を受け取り、
// 「どう表示するか」だけに徹する。称号の条件や保存状態を自分で参照することはない。
//
// 称号ごとの見た目の出し分け（アイコン・色など）はCSS側の責任にする。
// このファイルはチップに`data-title-id`属性としてidを出力するだけで、
// 称号ID単位のif文はここには書かない（ランクバッジがCSSクラスの出し分けだけで
// S/A/B/Cの見た目を変えているのと同じ考え方）。
//
// 現時点ではrenderResultTitleEvents()を呼びっぱなしにする運用で問題ないが、
// 将来、画面遷移やリセット処理が増えたときのために、明示的に後始末できる
// destroyTitleDisplay()（進行中のキュー・タイマー・リスナーをすべて片付ける関数）を
// 追加できる余地を残しておく。今のところ呼び出し側がいないので未実装。

import { buildTitleIconMedal } from "./titleIcons.js";

// 「repeat」（再獲得）のイベントを結果画面で見せるかどうか。
// 一度取得した称号をその後も達成し続けると、毎回同じ表示が繰り返されて結果画面が
// 賑やかになりすぎるため、現時点ではNEW系（unlock-and-new/new）だけを見せる。
// 将来、設定として切り替えられるようにしたくなったときに、この値を差し替える口として残している。
const SHOW_REPEAT_EVENTS = false;

// 1件のチップのCSSアニメーションが万が一発火しなかった場合の保険時間（ミリ秒）。
// CSS側にまだアニメーションを実装していない間や、アニメーションを無効化した環境でも
// キューが止まったままにならないよう、この時間が経てば自動的に次へ進める。
const ANIMATION_FALLBACK_MS = 1500;

// チップの「登場演出」に使うCSSアニメーションの名前（animation-nameと一致させる）。
// 将来、チップの中の文字や装飾に別のアニメーションを足しても、この名前のアニメーションが
// 終わったときだけ次のイベントへ進むようにするための目印。実際のCSSを書くときは、
// チップの登場アニメーションに必ずこの名前を付ける。
const ENTRANCE_ANIMATION_NAME = "title-event-enter";

// これから表示するイベントの残りキュー。
let queue = [];
// 現在チップを追加している入れ物（renderResultTitleEvents呼び出しごとに更新する）。
let currentContainer = null;
// キューを全部出し終えたときに呼ぶコールバック（「称号一覧を見る」リンクの表示に使う）。
let onQueueDrained = null;
// 今アニメーション中のチップ要素。animationendの解除に使う。
let activeChip = null;
let fallbackTimeoutId = null;

// activeChipに登録したanimationendリスナー本体。
// チップの子要素にも将来アニメーションが付く可能性があるため、
// 「chip自身の、登場演出アニメーションが終わったときだけ」次へ進むよう絞り込む。
// event.targetがactiveChip自身であることに加え、animationNameが登場演出のものと
// 一致することも確認する（bubbleしてきた子要素のanimationendを誤って拾わないため）。
function handleChipAnimationEnd(event) {
  if (event.target !== activeChip) return;
  if (event.animationName !== ENTRANCE_ANIMATION_NAME) return;
  advanceQueue();
}

// 進行中の演出をすべて中断し、状態をまっさらに戻す。
// renderResultTitleEventsが呼ばれるたびに最初に実行することで、
// 「前の演出が終わらないうちに次の演出が呼ばれる」二重実行・連打を防ぐ。
// fallbackTimeoutの解除だけでなく、activeChipに登録したanimationendリスナーも
// 明示的に取り除くため、前回の呼び出しに紐づくコールバックが後から発火することはない。
function resetAnimationState() {
  queue = [];
  currentContainer = null;
  onQueueDrained = null;

  if (fallbackTimeoutId !== null) {
    clearTimeout(fallbackTimeoutId);
    fallbackTimeoutId = null;
  }
  if (activeChip !== null) {
    activeChip.removeEventListener("animationend", handleChipAnimationEnd);
    activeChip = null;
  }
}

// キューの先頭を1件取り出して表示し、そのチップの登場アニメーションが終わったら
// （またはANIMATION_FALLBACK_MS経っても終わらなければ）自分自身を呼び出して次へ進む。
// キューが空になったら、onQueueDrainedを呼んで一連の演出の終わりを知らせる。
function advanceQueue() {
  if (fallbackTimeoutId !== null) {
    clearTimeout(fallbackTimeoutId);
    fallbackTimeoutId = null;
  }
  if (activeChip !== null) {
    activeChip.removeEventListener("animationend", handleChipAnimationEnd);
    activeChip = null;
  }

  const nextEvent = queue.shift();
  if (!nextEvent) {
    onQueueDrained?.();
    return;
  }

  const chip = buildTitleChip(nextEvent);
  currentContainer.appendChild(chip);

  activeChip = chip;
  // event.target・animationNameの確認をhandleChipAnimationEnd側で行うため、
  // ここでは{ once: true }を使わない（子要素のbubbleを1回目で誤って消費してしまうと、
  // 本来のchip自身のanimationendを取りこぼすため、条件を満たしたときだけ自分で解除する）。
  activeChip.addEventListener("animationend", handleChipAnimationEnd);
  fallbackTimeoutId = setTimeout(advanceQueue, ANIMATION_FALLBACK_MS);
}

// イベント1件の種類に応じた、称号名の後に続くキャプション文言を組み立てる。
function buildCaptionText(event) {
  switch (event.type) {
    case "unlock-and-new":
      return "解放＆獲得！";
    case "new":
      return "獲得！";
    case "repeat":
    default:
      return "今回も達成！";
  }
}

// イベント1件分のチップ要素を組み立てる。
// class名に種類（unlock-and-new/new/repeat）を含めておき、CSS側でNEWの強調演出の
// 有無や、称号ごとの色・アイコンを出し分けられるようにする。
//
// 中身を「NEWバッジ／称号名／キャプション」の3つの要素に分けているのは、
// CSSでNEWバッジだけを目立つ色にする、称号名を太字にする、といった
// 見た目の作り込みをしやすくするため（表示構造だけの調整で、判定ロジックには関係しない）。
// NEWバッジは、新しい進捗があったとき（isNewProgress）だけ追加する。
function buildTitleChip(event) {
  const chip = document.createElement("div");
  chip.classList.add("title-event", `title-event--${event.type}`);
  chip.dataset.titleId = event.id;

  chip.appendChild(buildTitleIconMedal(event.id));

  if (event.isNewProgress) {
    const badge = document.createElement("span");
    badge.classList.add("title-event-badge");
    badge.textContent = "NEW";
    chip.appendChild(badge);
  }

  const name = document.createElement("span");
  name.classList.add("title-event-name");
  name.textContent = event.name;
  chip.appendChild(name);

  const caption = document.createElement("span");
  caption.classList.add("title-event-caption");
  caption.textContent = buildCaptionText(event);
  chip.appendChild(caption);

  return chip;
}

// 結果画面に、今回の称号イベントを演出付きで表示する。
//
// events  : titleProgress.jsのevaluateAndSaveTitlesが返す、称号イベントの配列。
//           表示順は並べ替えず、渡された配列の順番（＝TITLES定義の並び順）のまま使う。
// elements: 描画先のDOM要素をまとめたオブジェクト。
//           { chipContainer: 称号チップを並べる入れ物,
//             titleListLinkElement: 「称号一覧を見る」リンク }
//
// 「称号一覧を見る」リンクは、称号一覧の内容を確認する入口として毎回必ず表示する
// （新しく祝う称号がない回でも、「今どこまで進んでいるか」を確認したい場面はあるため）。
// ただし、新しく祝うイベントがある回だけは、チップの演出が一通り終わってから表示する
// （NEW！→NEW！→NEW！→称号一覧を見る、という流れを保つため）。
// 表示対象の判定は、repeatを除いた後のvisibleEventsを基準にする。
export function renderResultTitleEvents(events, elements) {
  const { chipContainer, titleListLinkElement } = elements;

  resetAnimationState();
  chipContainer.innerHTML = "";

  const visibleEvents = SHOW_REPEAT_EVENTS
    ? events
    : events.filter((event) => event.type !== "repeat");

  if (visibleEvents.length === 0) {
    // 祝う対象がない回は、演出を待たせる理由がないのですぐにリンクを見せる。
    titleListLinkElement.hidden = false;
    return;
  }

  titleListLinkElement.hidden = true; // 演出が終わるまでは隠しておく

  queue = [...visibleEvents];
  currentContainer = chipContainer;
  onQueueDrained = () => {
    titleListLinkElement.hidden = false;
  };

  advanceQueue();
}

// 称号を扱わない結果表示（復習モードの結果画面）のときに呼ぶ。
// renderResultTitleEvents()を空配列で呼ぶのとは違い、「称号一覧を見る」リンクを
// 必ず非表示のままにする（renderResultTitleEventsは祝う対象がなくてもリンクを表示する
// 仕様のため、そのまま流用すると復習結果でリンクが出てしまう）。
// resetAnimationState()も呼ぶため、直前の通常プレイの称号演出が終わりきる前に
// 復習へ進んだ場合でも、進行中のタイマー・リスナーを確実に片付けられる。
export function clearResultTitleEvents({ chipContainer, titleListLinkElement }) {
  resetAnimationState();
  chipContainer.innerHTML = "";
  titleListLinkElement.hidden = true;
}
