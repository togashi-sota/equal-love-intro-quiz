// 効果音の詳細設定モーダル（2026-08-10新設）を担当するファイル。
// 設定の実体（保存・読み込み・音の合成）はjs/soundManager.jsに任せ、
// ここでは画面の組み立て（開閉・3つのON/OFFトグル・テーマ選択・音量スライダー・試聴）だけを扱う。
//
// 【2026-09-26改訂・本人指示：サウンドシステム全面整備】「テーマを選ぶだけでも使える」
// ＋「詳細設定でイベントごとに個別カスタマイズできる」の二段構成に拡張した。
// 楽曲音量（js/audio.js、効果音とは別の独立した音量）もこの同じモーダルから調整する。
import {
  SFX_THEME_INFO,
  CUSTOMIZABLE_SFX_EVENT_INFO,
  getSfxSettings,
  setSfxMasterEnabled,
  setSfxUiEnabled,
  setSfxGameEnabled,
  setSfxTheme,
  setSfxVolumePercent,
  previewSfxTheme,
  previewSfxEvent,
  getEventThemeOverride,
  getEffectiveThemeForEvent,
  setEventThemeOverride,
  hasAnyEventThemeOverrides,
  clearAllEventThemeOverrides,
} from "./soundManager.js";
import { getMusicVolumePercent, setMusicVolumePercent } from "./audio.js";
// 【2026-09-26追加・本人指示：サウンドシステム全面整備5章】皮肉にも効果音設定画面自身の
// ボタン（開く・閉じる・トグル・テーマ選択）にSFXが1件も無かった（本人指示の監査で発覚）。
import { SFX_EVENTS, playSfx } from "./soundManager.js";

let elements = null;

function isModalOpen() {
  return elements !== null && !elements.overlay.hidden;
}

function open() {
  playSfx(SFX_EVENTS.UI_CLICK);
  renderSettings();
  elements.overlay.hidden = false;
}

function close() {
  playSfx(SFX_EVENTS.UI_BACK);
  elements.overlay.hidden = true;
}

function handleKeydown(event) {
  if (event.key !== "Escape") return;
  if (!isModalOpen()) return;
  close();
}

function handleOverlayClick(event) {
  if (event.target !== elements.overlay) return;
  close();
}

// ON/OFFトグルボタン1個分の見た目（ラベル・is-mutedクラス）を、現在の状態に合わせる。
function syncToggleButton(button, enabled) {
  button.classList.toggle("is-muted", !enabled);
  const label = button.querySelector(".sfx-settings-toggle-button-label");
  if (label) label.textContent = enabled ? "ON" : "OFF";
}

// サウンドテーマの選択肢（3枚）を組み立てる。選択中のテーマにはis-selectedを付ける。
// 【2026-09-26改訂・本人指示：サウンドシステム全面整備2・4・14章】各カードに
// 「▶ テーマを試聴」を追加し（カード選択とは独立したクリックにする＝
// stopPropagation()）、テーマを切り替える操作では、詳細設定で個別カスタム済みの
// イベントがあれば確認ダイアログを出してから切り替える（本人指示：「知らないうちに
// カスタムが消えるのは避けてください」）。
function renderThemeOptions(currentTheme) {
  elements.themeList.innerHTML = "";
  SFX_THEME_INFO.forEach((theme) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "sfx-theme-option";
    option.classList.toggle("is-selected", theme.id === currentTheme);
    option.dataset.themeId = theme.id;

    const name = document.createElement("p");
    name.className = "sfx-theme-option-name";
    name.textContent = theme.name;
    option.appendChild(name);

    const description = document.createElement("p");
    description.className = "sfx-theme-option-description";
    description.textContent = theme.description;
    option.appendChild(description);

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "sfx-theme-option-preview-button";
    previewButton.textContent = "▶ テーマを試聴";
    previewButton.addEventListener("click", (event) => {
      event.stopPropagation();
      previewSfxTheme(theme.id);
    });
    option.appendChild(previewButton);

    option.addEventListener("click", () => {
      if (theme.id === currentTheme) return;
      if (hasAnyEventThemeOverrides()) {
        const confirmed = window.confirm(
          `テーマを「${theme.name}」に変更すると、音ごとに個別カスタマイズした効果音は、このテーマの標準サウンドセットに切り替わります。よろしいですか？`
        );
        if (!confirmed) return;
        clearAllEventThemeOverrides();
      }
      playSfx(SFX_EVENTS.UI_CONFIRM);
      setSfxTheme(theme.id);
      renderThemeOptions(theme.id);
      renderAdvancedEventList();
    });

    elements.themeList.appendChild(option);
  });
}

// 【2026-09-26新設・本人指示：サウンドシステム全面整備3章】詳細設定：イベントごとに
// 「テーマに従う」か「特定のテーマの音を使う」かを選べる一覧を組み立てる。
function renderAdvancedEventList() {
  if (!elements.advancedList) return;
  elements.advancedList.innerHTML = "";

  CUSTOMIZABLE_SFX_EVENT_INFO.forEach((eventInfo) => {
    const row = document.createElement("div");
    row.className = "sfx-settings-advanced-row";

    const labelBlock = document.createElement("div");
    labelBlock.className = "sfx-settings-advanced-row-label-block";
    const label = document.createElement("span");
    label.className = "sfx-settings-advanced-row-label";
    label.textContent = eventInfo.label;
    labelBlock.appendChild(label);

    const override = getEventThemeOverride(eventInfo.id);
    if (override !== null) {
      const badge = document.createElement("span");
      badge.className = "sfx-settings-advanced-row-badge";
      badge.textContent = "カスタム";
      labelBlock.appendChild(badge);
    }
    row.appendChild(labelBlock);

    const controls = document.createElement("div");
    controls.className = "sfx-settings-advanced-row-controls";

    const select = document.createElement("select");
    select.className = "sfx-settings-advanced-row-select";
    select.setAttribute("aria-label", `${eventInfo.label}の音`);
    const followOption = document.createElement("option");
    followOption.value = "";
    followOption.textContent = "テーマに従う";
    select.appendChild(followOption);
    SFX_THEME_INFO.forEach((theme) => {
      const themeOption = document.createElement("option");
      themeOption.value = theme.id;
      themeOption.textContent = `${theme.name}の音`;
      select.appendChild(themeOption);
    });
    select.value = override ?? "";
    select.addEventListener("change", () => {
      setEventThemeOverride(eventInfo.id, select.value === "" ? null : select.value);
      renderAdvancedEventList();
      refreshAdvancedBadge();
    });
    controls.appendChild(select);

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "sfx-settings-advanced-row-preview-button";
    previewButton.textContent = "▶";
    previewButton.setAttribute("aria-label", `${eventInfo.label}の音を試聴`);
    previewButton.addEventListener("click", () => {
      previewSfxEvent(eventInfo.id, getEffectiveThemeForEvent(eventInfo.id));
    });
    controls.appendChild(previewButton);

    row.appendChild(controls);
    elements.advancedList.appendChild(row);
  });
}

// 詳細設定の見出しに出す「カスタム」バッジ・「すべて標準に戻す」ボタンの表示可否。
function refreshAdvancedBadge() {
  const hasOverrides = hasAnyEventThemeOverrides();
  if (elements.advancedBadge) elements.advancedBadge.hidden = !hasOverrides;
  if (elements.resetOverridesButton) elements.resetOverridesButton.hidden = !hasOverrides;
}

function renderSettings() {
  const settings = getSfxSettings();
  syncToggleButton(elements.masterToggle, settings.masterEnabled);
  syncToggleButton(elements.uiToggle, settings.uiEnabled);
  syncToggleButton(elements.gameToggle, settings.gameEnabled);
  renderThemeOptions(settings.theme);
  elements.volumeRange.value = String(settings.volumePercent);
  elements.volumeValue.textContent = `${settings.volumePercent}%`;
  renderAdvancedEventList();
  refreshAdvancedBadge();
  if (elements.musicVolumeRange) {
    const musicVolumePercent = getMusicVolumePercent();
    elements.musicVolumeRange.value = String(musicVolumePercent);
    if (elements.musicVolumeValue) elements.musicVolumeValue.textContent = `${musicVolumePercent}%`;
  }
}

// 全体を再描画するmain.js側の関数（スタート画面のクイックトグルとこのモーダルの
// マスタートグルの表示を一致させるために、main.js側からも呼べるようにエクスポートする）。
export function refreshSfxSettingsUI() {
  if (elements === null) return;
  const settings = getSfxSettings();
  syncToggleButton(elements.masterToggle, settings.masterEnabled);
}

export function initSoundSettingsScreen(newElements) {
  elements = newElements;

  elements.openTriggers.forEach((trigger) => trigger.addEventListener("click", open));
  elements.closeButton.addEventListener("click", close);
  elements.overlay.addEventListener("click", handleOverlayClick);
  document.addEventListener("keydown", handleKeydown);

  // 【2026-09-26追加・本人指示：サウンドシステム全面整備5章】トグルON後にUI_CLICKを鳴らす。
  // OFFにした直後はplaySfx()自身が「その設定はもうOFF」と判定して何も鳴らさないため
  // （js/soundManager.jsのplaySfx()参照）、ここで条件分岐せずに常に呼ぶだけで、
  // 「ONにしたときだけ聞こえる」という自然な挙動になる。
  elements.masterToggle.addEventListener("click", () => {
    const settings = getSfxSettings();
    setSfxMasterEnabled(!settings.masterEnabled);
    syncToggleButton(elements.masterToggle, !settings.masterEnabled);
    elements.onMasterToggle?.(!settings.masterEnabled);
    playSfx(SFX_EVENTS.UI_CLICK);
  });
  elements.uiToggle.addEventListener("click", () => {
    const settings = getSfxSettings();
    setSfxUiEnabled(!settings.uiEnabled);
    syncToggleButton(elements.uiToggle, !settings.uiEnabled);
    playSfx(SFX_EVENTS.UI_CLICK);
  });
  elements.gameToggle.addEventListener("click", () => {
    const settings = getSfxSettings();
    setSfxGameEnabled(!settings.gameEnabled);
    syncToggleButton(elements.gameToggle, !settings.gameEnabled);
    playSfx(SFX_EVENTS.UI_CLICK);
  });

  elements.volumeRange.addEventListener("input", () => {
    const percent = Number(elements.volumeRange.value);
    setSfxVolumePercent(percent);
    elements.volumeValue.textContent = `${percent}%`;
  });

  // 【2026-09-26改訂・本人指示：サウンドシステム全面整備4章】試聴ボタンはテーマカード
  // 内（renderThemeOptions）・詳細設定の各行（renderAdvancedEventList）に移した。
  // 「すべて標準に戻す」：詳細設定の個別カスタムを一括で消し、テーマ標準へ戻す。
  if (elements.resetOverridesButton) {
    elements.resetOverridesButton.addEventListener("click", () => {
      const confirmed = window.confirm("音ごとの個別カスタム設定をすべて解除し、テーマの標準サウンドセットに戻します。よろしいですか？");
      if (!confirmed) return;
      clearAllEventThemeOverrides();
      renderAdvancedEventList();
      refreshAdvancedBadge();
      playSfx(SFX_EVENTS.UI_CLICK);
    });
  }

  // 【2026-09-26新設・本人指示：サウンドシステム全面整備11章】楽曲音量は効果音音量とは
  // 独立した設定（js/audio.jsのgetMusicVolumePercent/setMusicVolumePercent）。
  if (elements.musicVolumeRange) {
    elements.musicVolumeRange.addEventListener("input", () => {
      const percent = Number(elements.musicVolumeRange.value);
      setMusicVolumePercent(percent);
      if (elements.musicVolumeValue) elements.musicVolumeValue.textContent = `${percent}%`;
    });
  }
}
