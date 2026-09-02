// タイムアタックのグローバルランキング（TOP10）画面を担当するファイル。
// データの取得・比較・並び替えはjs/timeAttackLeaderboardSync.js・js/timeAttackLeaderboard.jsに
// 任せ、このファイルは「取得した結果をどう画面に組み立てるか」だけに専念する。
//
// 【UI統一方針、本人指示】推しアイコン・王冠/ダイヤ装飾は、js/fanProfileCard.jsの
// buildOshiSwatch()をそのまま再利用する（みんなのプロフィール一覧・メンバーカードと
// 同じ見た目・同じ関数にすることで、3種類バラバラの実装にしない）。
import { buildOshiSwatch } from "./fanProfileCard.js";
import { getMemberById } from "./memberUtils.js";
import {
  fetchTimeAttackLeaderboardTop10,
  fetchMyTimeAttackLeaderboardEntry,
  deleteLeaderboardEntryByAdmin,
  syncRankingCandidatesToFirebase,
} from "./timeAttackLeaderboardSync.js";
import {
  LEADERBOARD_QUESTION_COUNT_VALUES,
  LEADERBOARD_CATEGORY_VALUES,
  resolveAverageSecondsPerQuestion,
} from "./timeAttackLeaderboard.js";
import { fetchPublicProfileBadgeState, getMyUid, isPublicProfileSharingEnabled } from "./publicProfileSync.js";
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { ADMIN_UID } from "./adminConfig.js";
import { TIME_ATTACK_VARIANT, TIME_ATTACK_RULE } from "./timeAttackScreen.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

const VARIANT_LABELS = {
  [TIME_ATTACK_VARIANT.INTRO]: "🎧イントロ",
  [TIME_ATTACK_VARIANT.RANDOM_PLAYBACK]: "🔀ランダム再生",
  // 2026-08-30追加、本人指示（後半③）：アウトロクイズ（通常導線）のランキングタブ。
  [TIME_ATTACK_VARIANT.OUTRO]: "🎬アウトロ",
};
const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全曲" };
// 【2026-08-16改訂・本人指示】出題数・カテゴリーのタブは、js/timeAttackLeaderboard.jsが
// 持つ「ランキング対応の値」リストをそのまま使う（このファイルで別の一覧を持つと、
// 片方だけ更新し忘れてズレる恐れがあるため）。出題数（5/10/20/50/全曲）・カテゴリー
// （表題曲のみ/表題曲＋全員曲/全曲）とも、既存クイズの全ラジオボタン値がそのまま対象。
const QUESTION_COUNT_ORDER = LEADERBOARD_QUESTION_COUNT_VALUES;

// 【2026-08-16改訂・本人指示】ルールはもうランキングの区分（タブ）ではない。ノーマル/ハード/
// LOVE連チャンをまたいで同じランキングで比較する。RULE_LABELSは、各記録がどのルールで
// 出したタイムかを行に小さく添えるバッジ表示にだけ使う（entry.ruleがnullなら何も表示しない）。
const RULE_LABELS = {
  [TIME_ATTACK_RULE.NORMAL]: "ノーマル",
  [TIME_ATTACK_RULE.HARD]: "ハード",
  [TIME_ATTACK_RULE.LOVE_CHAIN]: "LOVE連チャン",
};

// 【2026-08-16追加】プレイ方法バッジ。entry.sourceがnormalなら「通常」、timeAttackなら
// 「TA」と、行に小さく添える（本人指示セクション13：「rank/name/timeの表示を優先し、
// UIが窮屈にならない範囲でだけ表示してよい」）。
const SOURCE_LABELS = { timeAttack: "TA", normal: "通常" };

// 【2026-08-16再改訂・本人指示】略称ではなく、他画面（クイズ設定のカテゴリー選択等）と
// 完全に同じ正式表記に統一する（初見でも意味が分かるように）。
const CATEGORY_LABELS = { "title-track": "表題曲のみ", "title-and-group": "表題曲＋全員曲", all: "全曲" };
const CATEGORY_ORDER = LEADERBOARD_CATEGORY_VALUES;

let elements = null;
let members = [];
let currentVariant = TIME_ATTACK_VARIANT.INTRO;
let currentQuestionCountValue = "5";
let currentCategoryFilterValue = "title-track";
// 連打・タブ切り替え中の描画競合を防ぐための世代番号（js/audio.jsのcurrentPlaybackTokenと
// 同じ考え方）。古い非同期取得が後から戻ってきても、世代が古ければ描画結果を捨てる。
let renderToken = 0;
// 2026-08-17追加：この端末が管理者（js/adminConfig.jsのADMIN_UID）かどうか。
// ADMIN_UIDがnullの間は誰であってもfalseになり、削除ボタンは一切表示されない。
let isAdminUser = false;
// 削除確認モーダルで「削除する」が押されたときに対象を特定するための一時保持。
let pendingAdminDeleteEntry = null;

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

function buildRankBadge(rank) {
  const badge = document.createElement("span");
  badge.className = "leaderboard-rank-badge";
  if (rank === 1) badge.classList.add("is-gold");
  else if (rank === 2) badge.classList.add("is-silver");
  else if (rank === 3) badge.classList.add("is-bronze");
  badge.textContent = String(rank);
  return badge;
}

// isAdmin/onAdminDeleteRequestは2026-08-17追加。isAdminがtrueのときだけ、行の右端に
// 管理者専用の削除ボタンを追加する（一般ユーザーには絶対に見えない導線。
// js/fanProfileCard.jsのbuildProfileCardと同じ考え方だが、この行はbutton要素ではなく
// div要素のため、button-in-buttonの制約なく直接子要素として追加できる）。
function buildLeaderboardRow(
  entry,
  rank,
  badgeState,
  isOwnRow,
  variant,
  questionCountValue,
  categoryFilterValue,
  { isAdmin = false, onAdminDeleteRequest = null } = {}
) {
  const row = document.createElement("div");
  row.className = "leaderboard-row";
  row.classList.toggle("is-own-row", isOwnRow);

  row.appendChild(buildRankBadge(rank));
  row.appendChild(buildOshiSwatch(members, entry.oshiMemberId, badgeState));

  const body = document.createElement("div");
  body.className = "leaderboard-row-body";

  const name = document.createElement("p");
  name.className = "leaderboard-row-name";
  name.textContent = entry.displayName;
  body.appendChild(name);

  const oshiMember = entry.oshiMemberId ? getMemberById(members, entry.oshiMemberId) : null;
  const oshi = document.createElement("p");
  oshi.className = "leaderboard-row-oshi";
  oshi.textContent = oshiMember ? `推し：${oshiMember.name}` : "推し：未設定";
  body.appendChild(oshi);

  // プレイ方法・ルールの小さなバッジ（2026-08-16追加、本人指示セクション13）。
  // どちらも参考情報のため、値が無ければ静かに何も表示しない（古い記録には無い場合がある）。
  const sourceLabel = SOURCE_LABELS[entry.source];
  const ruleLabel = RULE_LABELS[entry.rule];
  if (sourceLabel || ruleLabel) {
    const meta = document.createElement("p");
    meta.className = "leaderboard-row-meta";
    meta.textContent = [sourceLabel, ruleLabel].filter(Boolean).join(" ・ ");
    body.appendChild(meta);
  }

  row.appendChild(body);

  const timeBlock = document.createElement("div");
  timeBlock.className = "leaderboard-row-time-block";

  const time = document.createElement("p");
  time.className = "leaderboard-row-time";
  time.textContent = `${formatSeconds(entry.clearTimeMs)}秒`;
  timeBlock.appendChild(time);

  // 1問あたりの平均タイム（2026-08-24追加、本人指示：「今後ランキングは必ず平均も乗せる」）。
  // 【2026-08-29改訂】記録自身が持つactualQuestionCount（実際に出題された問題数）を
  // 最優先に使うことで、出題数「全曲」の記録でも平均を計算できるようにした
  // （js/timeAttackLeaderboard.jsのresolveAverageSecondsPerQuestion参照）。
  const averageSeconds = resolveAverageSecondsPerQuestion(entry, variant, questionCountValue, categoryFilterValue);
  if (averageSeconds !== null) {
    const average = document.createElement("p");
    average.className = "leaderboard-row-average";
    average.textContent = `平均 ${averageSeconds.toFixed(2)}秒/問`;
    timeBlock.appendChild(average);
  }

  row.appendChild(timeBlock);

  if (isAdmin) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "leaderboard-admin-delete-button";
    deleteButton.setAttribute("aria-label", `${entry.displayName}さんの記録を削除（管理者用）`);
    deleteButton.textContent = "🗑️";
    deleteButton.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      onAdminDeleteRequest?.(entry);
    });
    row.appendChild(deleteButton);
  }

  return row;
}

function buildTabButton(label, isActive, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "leaderboard-tab-button";
  button.classList.toggle("is-active", isActive);
  button.textContent = label;
  button.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    onClick();
  });
  return button;
}

function renderTabs() {
  elements.variantTabs.innerHTML = "";
  Object.values(TIME_ATTACK_VARIANT).forEach((variant) => {
    elements.variantTabs.appendChild(
      buildTabButton(VARIANT_LABELS[variant], variant === currentVariant, () => {
        currentVariant = variant;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });

  elements.questionCountTabs.innerHTML = "";
  QUESTION_COUNT_ORDER.forEach((questionCountValue) => {
    elements.questionCountTabs.appendChild(
      buildTabButton(QUESTION_COUNT_LABELS[questionCountValue], questionCountValue === currentQuestionCountValue, () => {
        currentQuestionCountValue = questionCountValue;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });

  // 【2026-08-16追加】カテゴリータブ。
  elements.categoryTabs.innerHTML = "";
  CATEGORY_ORDER.forEach((categoryFilterValue) => {
    elements.categoryTabs.appendChild(
      buildTabButton(CATEGORY_LABELS[categoryFilterValue], categoryFilterValue === currentCategoryFilterValue, () => {
        currentCategoryFilterValue = categoryFilterValue;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });
}

function setStateVisibility({ loading, offline, empty, list }) {
  elements.loadingState.hidden = !loading;
  elements.offlineState.hidden = !offline;
  elements.emptyState.hidden = !empty;
  elements.listContainer.hidden = !list;
}

// TOP10各行の王冠・ダイヤ装飾を、みんなのプロフィールと同じ見た目で添える（可能なら、の対応）。
// 本人指示「全ユーザー件数を毎回取得しないこと」を守るため、今回表示する最大10人分だけを
// 並行して個別取得する（全件ダウンロードにはしない）。1件でも失敗しても他の行の表示は続ける。
async function fetchBadgeStatesForEntries(entries) {
  const results = await Promise.all(
    entries.map((entry) =>
      fetchPublicProfileBadgeState(entry.uid).catch(() => ({
        hasNoMissMaster: false,
        hasEqualLoveMaster: false,
        hasEqualLoveComplete: false,
      }))
    )
  );
  const badgeStateByUid = new Map();
  entries.forEach((entry, index) => badgeStateByUid.set(entry.uid, results[index]));
  return badgeStateByUid;
}

async function loadAndRenderLeaderboard() {
  const myRenderToken = ++renderToken;
  setStateVisibility({ loading: true, offline: false, empty: false, list: false });
  elements.myRecordSection.hidden = true;
  // 【2026-08-16バグ修正】以前はこの時点でlistContainerの中身を消していなかったため、
  // CSSの.leaderboard-list[hidden]漏れ（上のCSS修正）と組み合わさって、出題タイプ・
  // 出題数・カテゴリーを切り替えた直後に「前のタブのTOP10行」が残って見えるバグがあった。
  // hidden属性だけに頼らず、読み込み開始時点で必ず空にしておく（CSS側の不具合が
  // 将来また紛れ込んでも、古い行が残り続けることがないようにするための保険）。
  elements.listContainer.innerHTML = "";

  const result = await fetchTimeAttackLeaderboardTop10(
    currentVariant,
    currentQuestionCountValue,
    currentCategoryFilterValue
  );
  if (myRenderToken !== renderToken) return; // タブが切り替わった後に古い結果が戻ってきた場合は捨てる

  if (!result.ok) {
    setStateVisibility({ loading: false, offline: true, empty: false, list: false });
    return;
  }

  if (result.entries.length === 0) {
    setStateVisibility({ loading: false, offline: false, empty: true, list: false });
    renderMyRecordIfNeeded(myRenderToken, []);
    return;
  }

  const badgeStateByUid = await fetchBadgeStatesForEntries(result.entries);
  if (myRenderToken !== renderToken) return;

  result.entries.forEach((entry, index) => {
    const rank = index + 1;
    const isOwnRow = elements.currentUid && entry.uid === elements.currentUid;
    elements.listContainer.appendChild(
      buildLeaderboardRow(
        entry,
        rank,
        badgeStateByUid.get(entry.uid),
        isOwnRow,
        currentVariant,
        currentQuestionCountValue,
        currentCategoryFilterValue,
        { isAdmin: isAdminUser, onAdminDeleteRequest: openAdminDeleteConfirm }
      )
    );
  });
  setStateVisibility({ loading: false, offline: false, empty: false, list: true });

  renderMyRecordIfNeeded(myRenderToken, result.entries);
}

// 「あなたの記録」：TOP10にすでに含まれていれば重ねて表示しない。含まれていなければ、
// 自分のuidの記録だけを軽量に取得して「あなたのベスト ○○秒」の形で表示する
// （本人指示：「順位計算が重い場合は、あなたのベストだけでも可」）。
async function renderMyRecordIfNeeded(myRenderToken, top10Entries) {
  const alreadyInTop10 = elements.currentUid && top10Entries.some((entry) => entry.uid === elements.currentUid);
  if (alreadyInTop10) {
    elements.myRecordSection.hidden = true;
    return;
  }

  const myResult = await fetchMyTimeAttackLeaderboardEntry(
    currentVariant,
    currentQuestionCountValue,
    currentCategoryFilterValue
  );
  if (myRenderToken !== renderToken) return;
  elements.currentUid = myResult.uid ?? elements.currentUid;

  if (!myResult.ok || !myResult.entry) {
    elements.myRecordSection.hidden = true;
    return;
  }

  const myAverageSeconds = resolveAverageSecondsPerQuestion(
    myResult.entry,
    currentVariant,
    currentQuestionCountValue,
    currentCategoryFilterValue
  );
  const myAverageSuffix = myAverageSeconds !== null ? `（平均 ${myAverageSeconds.toFixed(2)}秒/問）` : "";
  elements.myRecordText.textContent = `あなたのベスト：${formatSeconds(myResult.entry.clearTimeMs)}秒${myAverageSuffix}`;
  elements.myRecordSection.hidden = false;
}

// 自分のUIDを確認し、管理者判定を更新する（2026-08-17追加）。
// ADMIN_UIDがnullの間は誰であってもfalseのままになり、削除ボタンは一切表示されない。
async function refreshAdminState() {
  const uid = await getMyUid();
  isAdminUser = ADMIN_UID !== null && uid !== null && uid === ADMIN_UID;
}

// ---- 管理者限定：ランキング記録削除の確認モーダル（2026-08-17追加） ----
// buildLeaderboardRow()のonAdminDeleteRequestから、対象entryを引数に呼ばれる。
function openAdminDeleteConfirm(entry) {
  pendingAdminDeleteEntry = entry;
  elements.adminDeleteName.textContent = entry.displayName;
  elements.adminDeleteTime.textContent = `${formatSeconds(entry.clearTimeMs)}秒`;
  elements.adminDeleteVariant.textContent = VARIANT_LABELS[currentVariant] ?? currentVariant;
  elements.adminDeleteQuestionCount.textContent = QUESTION_COUNT_LABELS[currentQuestionCountValue] ?? currentQuestionCountValue;
  elements.adminDeleteCategory.textContent = CATEGORY_LABELS[currentCategoryFilterValue] ?? currentCategoryFilterValue;
  elements.adminDeleteOverlay.hidden = false;
}

function closeAdminDeleteConfirm() {
  playSfx(SFX_EVENTS.UI_BACK);
  pendingAdminDeleteEntry = null;
  elements.adminDeleteOverlay.hidden = true;
}

function handleAdminDeleteOverlayClick(event) {
  if (event.target !== elements.adminDeleteOverlay) return;
  closeAdminDeleteConfirm();
}

function handleAdminDeleteKeydown(event) {
  if (event.key !== "Escape") return;
  if (elements.adminDeleteOverlay.hidden) return;
  closeAdminDeleteConfirm();
}

// 「削除する」確定時。表示中のタブ状態（variant/questionCount/category）と
// 対象entryのuidから、一意な1件だけを削除する。削除後は一覧を再読み込みする。
async function handleAdminDeleteConfirmClick() {
  if (!isAdminUser || !pendingAdminDeleteEntry) return;
  playSfx(SFX_EVENTS.UI_CONFIRM);
  const targetUid = pendingAdminDeleteEntry.uid;
  elements.adminDeleteConfirmButton.disabled = true;
  try {
    await deleteLeaderboardEntryByAdmin(
      currentVariant,
      currentQuestionCountValue,
      currentCategoryFilterValue,
      targetUid
    );
  } catch (error) {
    console.warn("管理者によるランキング記録削除に失敗しました", error);
  } finally {
    elements.adminDeleteConfirmButton.disabled = false;
    closeAdminDeleteConfirm();
    loadAndRenderLeaderboard();
  }
}

// タイムアタック設定画面・結果画面・通常クイズ結果画面から呼ぶ入口。直前にプレイした条件を
// 最初に表示する（本人指示：「直前にプレイした条件のランキングを最初に表示」）。
// 【2026-08-16改訂】ruleはもう区分ではないため引数から削除。未指定・不正な値なら
// 安全な既定値（5問・表題曲のみ）にフォールバックする。
// 【2026-08-17更新】管理者判定を、タブ描画・一覧読み込みより先に済ませる
// （削除ボタンをカード生成時点で正しく反映するため。js/fanProfilesScreen.jsと同じ順序）。
export async function showTimeAttackLeaderboard(variant, questionCountValue, categoryFilterValue) {
  currentVariant = variant ?? TIME_ATTACK_VARIANT.INTRO;
  currentQuestionCountValue = QUESTION_COUNT_ORDER.includes(questionCountValue) ? questionCountValue : "5";
  currentCategoryFilterValue = CATEGORY_ORDER.includes(categoryFilterValue) ? categoryFilterValue : "title-track";
  await refreshAdminState();
  renderTabs();
  loadAndRenderLeaderboard();

  // 【2026-08-16追加、本人指示】公開ON状態のままランキング画面を開いたときも、
  // オフライン等で前回同期できなかった記録の「安全な再試行の機会」として使う
  // （本人指示：新しいポーリング・タイマーは追加せず、既存の画面遷移に便乗するだけにする）。
  // 表示中の一覧をブロックしないよう、結果を待たずに呼び捨てる。
  const playerKeyPrefix = getPlayerKeyPrefix();
  if (isPublicProfileSharingEnabled(playerKeyPrefix)) {
    syncRankingCandidatesToFirebase(playerKeyPrefix);
  }
}

// elements: {
//   variantTabs, questionCountTabs, categoryTabs: タブボタンを並べるコンテナ,
//   loadingState, offlineState, emptyState: 状態ごとの案内文,
//   listContainer: TOP10の行を並べる場所,
//   myRecordSection, myRecordText: 「あなたの記録」欄,
//   backButton, onBack,
//   adminDeleteOverlay, adminDeleteName, adminDeleteTime, adminDeleteVariant,
//   adminDeleteQuestionCount, adminDeleteCategory, adminDeleteCancelButton, adminDeleteConfirmButton:
//     管理者限定の記録削除確認モーダル（2026-08-17追加、2026-08-16にruleを区分から除いた）,
// }
export function initTimeAttackLeaderboardScreen(newElements, membersList) {
  elements = { ...newElements, currentUid: null };
  members = membersList;
  elements.backButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    elements.onBack?.();
  });

  elements.adminDeleteCancelButton.addEventListener("click", closeAdminDeleteConfirm);
  elements.adminDeleteConfirmButton.addEventListener("click", handleAdminDeleteConfirmClick);
  elements.adminDeleteOverlay.addEventListener("click", handleAdminDeleteOverlayClick);
  document.addEventListener("keydown", handleAdminDeleteKeydown);
}
