// js/specialModeIcons.jsの恒久テスト。
// 8モードすべてに、実際にSVGアイコンが組み立てられることを確認する
// （本人指示・2026-08-07：「特別モード8個すべてにアイコン要素が存在する」）。
import { buildSpecialModeIcon } from "../js/specialModeIcons.js";
import { SPECIAL_MODES } from "../js/specialModesScreen.js";
import { assertEqual } from "./test-utils.js";

export function runSpecialModeIconsTests() {
  SPECIAL_MODES.forEach((mode) => {
    const icon = buildSpecialModeIcon(mode.id);
    assertEqual(
      icon.classList.contains("special-mode-icon") && icon.classList.contains(`is-${mode.id}`),
      true,
      `${mode.title}のアイコンに、共通クラスとモード専用クラス（is-${mode.id}）が付く`
    );
    assertEqual(
      icon.querySelector("svg") !== null,
      true,
      `${mode.title}のアイコンにSVGが組み立てられる`
    );
    assertEqual(
      icon.getAttribute("aria-hidden"),
      "true",
      `${mode.title}のアイコンは装飾目的として、スクリーンリーダーから隠される（本人指示：アイコンだけで意味を伝えない）`
    );
  });
}
