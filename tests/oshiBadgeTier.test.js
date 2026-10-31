// 特別な称号の勲章（4段階）のテスト（2026-11-01 新設・本人指示 REQUEST の 7）。
// js/oshiBadge.js（段階の決め方・部品の付け外し）と css/oshiBadgeTiers.css（見た目）を確かめる。
// 称号の判定・保存データ・Firebase は変えていないことも確かめる（表示だけの変更）。
import {
  resolveOshiBadgeTier,
  applyOshiBadgeDecorationsFromState,
  OSHI_BADGE_TIER_NAMES,
} from "../js/oshiBadge.js";
import { getOshiBadgeStateForPlayer } from "../js/achievementProgress.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

const TIER_STATES = [
  {},
  { hasNoMissMaster: true },
  { hasNoMissMaster: true, hasEqualLoveMaster: true },
  { hasNoMissMaster: true, hasEqualLoveMaster: true, hasEqualLoveComplete: true },
];

function charmNames(element) {
  return [...element.querySelectorAll(".oshi-charm")].map((el) =>
    [...el.classList].find((name) => name.startsWith("oshi-charm--") && name !== "oshi-charm--minor").slice("oshi-charm--".length)
  );
}

function runTierResolveTests() {
  assertEqual(OSHI_BADGE_TIER_NAMES, ["称号なし", "イントロマスター", "＝LOVEマスター", "＝LOVE完全制覇"], "段階：4段階の名前");
  assertEqual(TIER_STATES.map(resolveOshiBadgeTier), [0, 1, 2, 3], "段階：なし／イントロマスター／＝LOVEマスター／＝LOVE完全制覇");
  assertEqual(resolveOshiBadgeTier({ hasEqualLoveComplete: true }), 3, "段階：古いデータで下の称号のフラグが無くても、一番上の称号で決まる");
  assertEqual(resolveOshiBadgeTier({ hasEqualLoveMaster: true }), 2, "段階：＝LOVEマスターだけでも第2段階");
  assertEqual(resolveOshiBadgeTier(null), 0, "段階：状態が無いときは0（壊れない）");
  assertEqual(resolveOshiBadgeTier(undefined), 0, "段階：undefined でも0");
  assertEqual(resolveOshiBadgeTier({ hasEqualLoveComplete: "true", hasNoMissMaster: 1 }), 0, "段階：true 以外（文字・数）は持っているとみなさない");
}

function runApplyTests() {
  const el = document.createElement("span");
  el.className = "fan-profile-swatch";

  applyOshiBadgeDecorationsFromState(el, {});
  assertEqual(el.querySelector(".oshi-badge-layer"), null, "付け外し：称号なしなら何も付けない");
  assertEqual(el.dataset.oshiBadgeTier, undefined, "付け外し：称号なしなら段階の印も無い");

  applyOshiBadgeDecorationsFromState(el, TIER_STATES[1]);
  assertEqual(el.dataset.oshiBadgeTier, "1", "付け外し：第1段階の印");
  assertEqual(charmNames(el), ["star", "note"], "第1段階：音符と星");
  assertEqual(Boolean(el.querySelector(".oshi-tier-ring")) && Boolean(el.querySelector(".oshi-tier-halo")), true, "第1段階：外周のリングと光");

  applyOshiBadgeDecorationsFromState(el, TIER_STATES[2]);
  assertEqual(charmNames(el), ["sparkle", "heart", "crown"], "第2段階：王冠・ハート・きらめき");
  assertEqual(el.querySelectorAll(".oshi-badge-layer").length, 1, "付け外し：段階が変わっても入れ物は1つだけ");

  applyOshiBadgeDecorationsFromState(el, TIER_STATES[3]);
  assertEqual(charmNames(el), ["sparkle", "sparkle2", "sparkle3", "heart", "diamond", "crown"], "第3段階：王冠とダイヤ（称号の説明の「王冠とダイヤの両方」）・ハート・きらめき3つ");
  const layer = el.querySelector(".oshi-badge-layer");
  applyOshiBadgeDecorationsFromState(el, TIER_STATES[3]);
  assertEqual(el.querySelector(".oshi-badge-layer") === layer, true, "付け外し：同じ段階なら作り直さない（何度呼んでも軽い）");
  assertEqual(layer.getAttribute("aria-hidden"), "true", "読み上げ：飾りは読み上げない（称号名は文字で出ている）");

  applyOshiBadgeDecorationsFromState(el, { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false });
  assertEqual(el.querySelector(".oshi-badge-layer"), null, "付け外し：称号が無くなったら取り除く");
  assertEqual(el.dataset.oshiBadgeTier, undefined, "付け外し：段階の印も消す");

  applyOshiBadgeDecorationsFromState(el, undefined);
  assertEqual(el.querySelector(".oshi-badge-layer"), null, "付け外し：状態を省略しても壊れない");
  applyOshiBadgeDecorationsFromState(null, TIER_STATES[3]);
  assertEqual(true, true, "付け外し：要素が無くても例外を出さない");
  assertEqual(el.querySelector(".oshi-badge, .oshi-badge--medal, .oshi-badge--crown, .oshi-badge--diamond"), null, "以前の角の丸いバッジ（銀の星など）は作らない");
}

// 実際の CSS を読み込んで、見た目の約束（中央を隠さない・小さい表示は簡略版・動きの扱い）を確かめる
async function loadTierCss() {
  if (document.querySelector('link[data-test-oshi-tier-css]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/oshiBadgeTiers.css";
  link.dataset.testOshiTierCss = "true";
  await new Promise((resolve) => {
    link.addEventListener("load", resolve);
    link.addEventListener("error", resolve);
    document.head.appendChild(link);
  });
}

function buildSandboxSwatch(size, tier, small = false) {
  const el = document.createElement("span");
  el.className = `fan-profile-swatch${small ? " fan-profile-swatch--sm" : ""}`;
  el.style.cssText = `position:relative;display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:#9b6fe0;margin:40px`;
  applyOshiBadgeDecorationsFromState(el, TIER_STATES[tier]);
  return el;
}

async function runCssTests() {
  await loadTierCss();
  const sandbox = document.createElement("div");
  sandbox.style.cssText = "position:absolute;left:-9999px;top:0";
  document.body.appendChild(sandbox);
  try {
    // 中央を隠さない：飾りはアバターの中心から半径 0.3 の円に一切かからない（大・中・小の全段階）
    let centerCovered = [];
    let ringOutside = true;
    [52, 44, 22].forEach((size) => {
      [1, 2, 3].forEach((tier) => {
        const el = buildSandboxSwatch(size, tier, size === 22);
        sandbox.appendChild(el);
        const box = el.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const keepRadius = size * 0.3;
        el.querySelectorAll(".oshi-charm").forEach((charm) => {
          if (getComputedStyle(charm).display === "none") return;
          const r = charm.getBoundingClientRect();
          const nearestX = Math.max(r.left, Math.min(cx, r.right));
          const nearestY = Math.max(r.top, Math.min(cy, r.bottom));
          if (Math.hypot(nearestX - cx, nearestY - cy) < keepRadius) centerCovered.push(`${size}px-${tier}-${charm.className}`);
        });
        // リングはアバターより外に広がっている（中に描いていない）
        const ring = el.querySelector(".oshi-tier-ring").getBoundingClientRect();
        if (!(ring.width > box.width && ring.height > box.height)) ringOutside = false;
      });
    });
    assertEqual(centerCovered, [], "見た目：飾りがアバターの中央（半径30%）にかからない（52・44・22px／第1〜3段階）");
    assertEqual(ringOutside, true, "見た目：リングはアバターの外側に広がる");

    // リングのマスクで中が透明（真ん中は描かない）であること
    const ringHost = buildSandboxSwatch(44, 3);
    sandbox.appendChild(ringHost);
    const ringStyle = getComputedStyle(ringHost.querySelector(".oshi-tier-ring"));
    const maskImage = ringStyle.maskImage || ringStyle.webkitMaskImage || "";
    assertEqual(/radial-gradient\(closest-side, (transparent|rgba\(0, 0, 0, 0\))/.test(maskImage), true, "見た目：リングは中心を透明にした輪");

    // 小さい表示（22px）は簡略版：細かい飾りを隠し、主役の飾りは残す。動かない
    const small3 = buildSandboxSwatch(22, 3, true);
    sandbox.appendChild(small3);
    const visibleSmall = [...small3.querySelectorAll(".oshi-charm")].filter((c) => getComputedStyle(c).display !== "none").map((c) => c.className);
    assertEqual(visibleSmall.length, 1, "小さい表示：第3段階は主役の飾り1つ（大きなダイヤ）だけ");
    assertEqual(visibleSmall[0].includes("oshi-charm--diamond"), true, "小さい表示：第3段階は王冠ではなく宝石（第2段階の王冠と形で見分ける）");
    assertEqual(getComputedStyle(small3.querySelector(".oshi-tier-ring")).animationName, "none", "小さい表示：動かない（一覧で何十個並んでも軽い）");
    const small2 = buildSandboxSwatch(22, 2, true);
    const small1 = buildSandboxSwatch(22, 1, true);
    sandbox.append(small2, small1);
    const visibleCount = (el) => [...el.querySelectorAll(".oshi-charm")].filter((c) => getComputedStyle(c).display !== "none").length;
    assertEqual([visibleCount(small1), visibleCount(small2), visibleCount(small3)], [1, 1, 1], "小さい表示：主役の飾りは1つずつ");
    const visibleCharm = (el) => [...el.querySelectorAll(".oshi-charm")].find((c) => getComputedStyle(c).display !== "none").className;
    assertEqual([visibleCharm(small1), visibleCharm(small2), visibleCharm(small3)].map((name) => name.match(/oshi-charm--(\w+)/)[1]), ["note", "crown", "diamond"], "小さい表示：第1＝音符／第2＝王冠／第3＝ダイヤ（形がすべて違う）");
    const smallRingWidth = (el) => el.querySelector(".oshi-tier-ring").getBoundingClientRect().width;
    assertEqual(smallRingWidth(small3) > smallRingWidth(small2) * 1.1, true, "小さい表示：第3段階の虹の輪は第2段階よりはっきり大きい");

    // 動き：第1段階は動かない。第2・第3段階のリングだけがゆっくり回る
    const mid1 = buildSandboxSwatch(44, 1);
    const mid2 = buildSandboxSwatch(44, 2);
    const mid3 = buildSandboxSwatch(44, 3);
    sandbox.append(mid1, mid2, mid3);
    const ringAnim = (el) => getComputedStyle(el.querySelector(".oshi-tier-ring")).animationName;
    assertEqual([ringAnim(mid1), ringAnim(mid2), ringAnim(mid3)], ["none", "oshi-ring-spin", "oshi-ring-spin"], "動き：第1段階は静止、第2・第3段階はリングの光が回る");
    const spinSeconds = (el) => parseFloat(getComputedStyle(el.querySelector(".oshi-tier-ring")).animationDuration);
    assertEqual(spinSeconds(mid2) >= 8 && spinSeconds(mid3) >= 8, true, "動き：回る速さは控えめ（1周8秒以上）");

    // 上の段ほど豪華（外周の広がりが大きい）
    const ringWidth = (el) => el.querySelector(".oshi-tier-ring").getBoundingClientRect().width;
    assertEqual(ringWidth(mid1) < ringWidth(mid2) && ringWidth(mid2) < ringWidth(mid3), true, "見た目：上の段ほどリングが大きい");
  } finally {
    sandbox.remove();
  }

  const css = await fetchText("css/oshiBadgeTiers.css");
  assertEqual(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*animation: none !important/.test(css), true, "視差効果を減らす設定：すべての動きを止める");
  const animatedProps = [...css.matchAll(/@keyframes [\w-]+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
  assertEqual(animatedProps.length >= 3 && animatedProps.every((body) => !/(width|height|left|top|box-shadow|filter)\s*:/.test(body)), true, "軽さ：動きは transform と opacity だけ（画面の再計算を起こさない）");
}

async function runMarkupTests() {
  const [html, sw] = await Promise.all([fetchText("index.html"), fetchText("sw.js")]);
  const doc = new DOMParser().parseFromString(html, "text/html");
  assertEqual(Boolean(doc.querySelector('link[href="css/oshiBadgeTiers.css"]')), true, "画面：勲章の CSS を読み込む");
  assertEqual(sw.includes('"./css/oshiBadgeTiers.css"'), true, "オフライン：勲章の CSS を APP_SHELL に入れた");
}

// プレイヤーの切り替えの一覧で使う、ほかのプレイヤーの状態の読み取り（読むだけ・書かない）
function runPlayerStateTests() {
  const key = "equalLoveIntroQuiz.player.r7-test-player.achievements";
  const before = localStorage.getItem(key);
  try {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 2, unlockedAchievementIds: ["no_miss_master", "equal_love_master"], unlockedAtById: {} }));
    const snapshot = localStorage.getItem(key);
    const lengthBefore = localStorage.length;
    assertEqual(
      getOshiBadgeStateForPlayer("r7-test-player"),
      { hasNoMissMaster: true, hasEqualLoveMaster: true, hasEqualLoveComplete: false },
      "プレイヤーの切り替え：その人の称号から勲章の状態を読む"
    );
    assertEqual(resolveOshiBadgeTier(getOshiBadgeStateForPlayer("r7-test-player")), 2, "プレイヤーの切り替え：その人は第2段階");
    assertEqual([localStorage.getItem(key) === snapshot, localStorage.length === lengthBefore], [true, true], "プレイヤーの切り替え：読むだけで保存データを変えない");
    localStorage.setItem(key, "{壊れたデータ");
    assertEqual(getOshiBadgeStateForPlayer("r7-test-player"), { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false }, "プレイヤーの切り替え：壊れたデータでも勲章なしで続ける");
    assertEqual(getOshiBadgeStateForPlayer("r7-no-such-player"), { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false }, "プレイヤーの切り替え：記録の無い人は勲章なし");
  } finally {
    if (before === null) localStorage.removeItem(key);
    else localStorage.setItem(key, before);
  }
}

export async function runOshiBadgeTierTests() {
  runTierResolveTests();
  runApplyTests();
  runPlayerStateTests();
  await runCssTests();
  await runMarkupTests();
}
