// パーティー対戦 設定画面のレイアウト回帰テスト（2026-09-15 第1回実機QA修正）。
//
// 【背景】本人のiPhone／iPad実機（ホーム画面版PWA）で、設定画面のfieldsetがviewportの右へはみ出す・
// タブレットの2列で隣のfieldsetと重なる、という崩れが見つかった。原因はiOS Safariでの
// 「fieldset の既定 min-inline-size:min-content」「grid の 1fr（＝minmax(auto,1fr)）」「auto-fill」
// 「入力欄の固有幅」の組み合わせで、列の最小幅がviewportを超えていたこと。
//
// 【このテストの方法】本物の index.html から設定画面のsectionを取り出し、本物の css/style.css を読み込んだ
// iframe（幅を375〜1366pxに変えながら）へ流し込んで実際にレイアウトさせ、
//   ・横スクロールが発生しない（documentのscrollWidthが幅以内）
//   ・すべてのfieldsetがiframe幅の中に収まる
//   ・fieldset同士が重ならない
//   ・スマホ幅では1カラム、720px以上では2カラム
//   ・ラジオ／ボタン／入力欄がそれぞれのfieldsetの中に収まる
// を機械的に確認する。JSが動的に作る部分（名前入力4件・最近の名前チップ・3人の席図・問題数・
// プレイリスト選択・曲を選ぶ行）は、実際の描画と同じクラス構造で長い文字列を入れて再現する。
// 【限界】このテストはChrome上での計算であり、iOS Safari固有の挙動そのものは再現できない。
// そのためCSS構造（minmax(0,1fr)・min-inline-size:0・auto-fill不使用）の検査も別途行う。

import { assertEqual } from "./test-utils.js";

const VIEWPORT_WIDTHS = [320, 375, 393, 430, 768, 820, 1024, 1366];
const TABLET_MIN_WIDTH = 720;

function extractSetupSection(html) {
  const start = html.indexOf('<section id="party-battle-setup-screen"');
  const end = html.indexOf("</section>", start) + "</section>".length;
  return html.slice(start, end);
}

function buildDynamicMarkup() {
  const nameRows = [0, 1, 2, 3]
    .map(
      (index) =>
        `<label class="party-player-name-row"><span class="party-player-badge">P${index + 1}</span>` +
        `<input type="text" class="party-player-name-input" maxlength="12" value="とても長いなまえのひと${index}"></label>`
    )
    .join("");
  const chips = ["とても長いなまえのひと", "ゆい", "さな", "りん", "あいうえおかきくけこさし"]
    .map((name) => `<button type="button" class="party-recent-name-chip">${name}</button>`)
    .join("");
  const seats = ["topLeft", "topRight", "bottomLeft", "bottomRight"]
    .map(
      (seatId, index) =>
        `<button type="button" class="party-seat-tile${index === 3 ? " is-empty" : ""}" data-color="${["red", "blue", "green", "yellow"][index]}">` +
        `<span class="party-seat-tile-title">席${index + 1}（レッド）</span><span class="party-seat-tile-desc">タップして空席にする</span></button>`
    )
    .join("");
  const counts = ["5問", "10問", "20問", "50問", "全曲"]
    .map((label) => `<label><input type="radio" name="party-question-count"> ${label}</label>`)
    .join("");
  return { nameRows, chips, seats, counts };
}

function loadIframe(width, sectionHtml) {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.width = `${width}px`;
    iframe.style.height = "900px";
    iframe.style.position = "fixed";
    iframe.style.left = "0";
    iframe.style.top = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);
    const { nameRows, chips, seats, counts } = buildDynamicMarkup();
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
        `<link rel="stylesheet" href="css/style.css"></head>` +
        `<body data-screen="partyBattleSetup"><main class="game-frame">${sectionHtml}</main></body></html>`
    );
    doc.close();
    const finish = () => {
      const section = doc.getElementById("party-battle-setup-screen");
      section.classList.add("is-active");
      doc.getElementById("party-player-name-fields").innerHTML = nameRows;
      doc.getElementById("party-recent-names").hidden = false;
      doc.getElementById("party-recent-names-chips").innerHTML = chips;
      doc.getElementById("party-seat-fieldset").hidden = false;
      doc.getElementById("party-seat-figure").innerHTML = seats;
      doc.getElementById("party-question-count-options").innerHTML = counts;
      doc.getElementById("party-instant-fieldset").hidden = false;
      doc.getElementById("party-voice-fieldset").hidden = false;
      doc.getElementById("party-manual-source-row").hidden = false;
      doc.getElementById("party-playlist-source-row").hidden = false;
      doc.getElementById("party-playlist-select").innerHTML =
        '<option>とても長い名前のプレイリストとても長い名前のプレイリスト（84曲）</option>';
      // スタイルシートの適用を待ってから測る（requestAnimationFrameはタブ非表示時に止まるためsetTimeout）
      setTimeout(() => resolve({ iframe, doc }), 50);
    };
    const link = doc.querySelector("link");
    let finished = false;
    const finishOnce = () => {
      if (finished) return;
      finished = true;
      finish();
    };
    if (link.sheet) finishOnce();
    else {
      link.addEventListener("load", finishOnce, { once: true });
      link.addEventListener("error", finishOnce, { once: true });
      // load が既に済んでいた／来ない場合の保険
      setTimeout(finishOnce, 3000);
    }
  });
}

function rectsOverlap(a, b, tolerance = 1) {
  return a.left < b.right - tolerance && b.left < a.right - tolerance && a.top < b.bottom - tolerance && b.top < a.bottom - tolerance;
}

export async function runPartyBattleSetupLayoutTests() {
  const html = await (await fetch("index.html", { cache: "no-store" })).text();
  const sectionHtml = extractSetupSection(html);
  assertEqual(sectionHtml.includes('class="party-setup-col"'), true, "設定画面は2つの列要素（.party-setup-col）で構成される");

  for (const width of VIEWPORT_WIDTHS) {
    const { iframe, doc } = await loadIframe(width, sectionHtml);
    const label = `幅${width}px`;
    const fieldsets = [...doc.querySelectorAll("#party-battle-setup-screen fieldset")].filter((element) => !element.hidden);
    assertEqual(fieldsets.length, 10, `${label}：fieldset 10件（席・一瞬・音声を表示した状態）を測定対象にする`);

    assertEqual(doc.documentElement.scrollWidth <= width, true, `${label}：横スクロールが発生しない（scrollWidth=${doc.documentElement.scrollWidth}）`);

    let outside = [];
    let overlaps = [];
    const rects = fieldsets.map((fieldset) => ({ fieldset, rect: fieldset.getBoundingClientRect() }));
    rects.forEach(({ fieldset, rect }) => {
      if (rect.left < -1 || rect.right > width + 1) outside.push(`${fieldset.querySelector("legend")?.textContent}:${Math.round(rect.left)}-${Math.round(rect.right)}`);
    });
    assertEqual(outside, [], `${label}：すべてのfieldsetがviewport幅の中に収まる`);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (rectsOverlap(rects[i].rect, rects[j].rect)) {
          overlaps.push(`${rects[i].fieldset.querySelector("legend")?.textContent}×${rects[j].fieldset.querySelector("legend")?.textContent}`);
        }
      }
    }
    assertEqual(overlaps, [], `${label}：fieldset同士が重ならない`);

    // 列の並び：スマホ幅は1カラム（2列目は1列目の下）、720px以上は2カラム（横並び）
    const [col1, col2] = doc.querySelectorAll(".party-setup-col");
    const r1 = col1.getBoundingClientRect();
    const r2 = col2.getBoundingClientRect();
    if (width < TABLET_MIN_WIDTH) {
      assertEqual(r2.top >= r1.bottom - 1, true, `${label}：スマホ幅では1カラム（選曲以降は下に積まれる）`);
      assertEqual(Math.abs(r1.width - r2.width) <= 1, true, `${label}：1カラムでは両列の幅が同じ`);
    } else {
      assertEqual(r2.left >= r1.right - 1, true, `${label}：タブレット以上では2カラム（左右に並ぶ）`);
      assertEqual(r1.right <= width && r2.right <= width + 1, true, `${label}：2カラムがviewport内に収まる`);
    }

    // 各操作要素がfieldsetの中に収まる（押せない要素が無い）
    let escaped = [];
    fieldsets.forEach((fieldset) => {
      const bounds = fieldset.getBoundingClientRect();
      fieldset.querySelectorAll("label, button, input[type='text'], select").forEach((element) => {
        if (element.offsetParent === null && element.tagName !== "INPUT") return;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0) return;
        if (rect.right > bounds.right + 1 || rect.left < bounds.left - 1) {
          escaped.push(`${fieldset.querySelector("legend")?.textContent}/${element.tagName}:${Math.round(rect.left)}-${Math.round(rect.right)} in ${Math.round(bounds.left)}-${Math.round(bounds.right)}`);
        }
      });
    });
    assertEqual(escaped, [], `${label}：ラジオ・ボタン・入力欄がfieldsetの外へ出ない`);

    iframe.remove();
  }

  // ===== CSS構造の検査（iOS Safari固有の原因を除去していること） =====
  const css = await (await fetch("css/style.css", { cache: "no-store" })).text();
  const setupBlock = css.slice(css.indexOf("/* ---------- 設定画面 ---------- */"), css.indexOf(".party-help-row {"));
  assertEqual(setupBlock.includes("grid-template-columns: minmax(0, 1fr);"), true, "設定画面の1カラムは minmax(0,1fr)（min-contentを参照しない）");
  assertEqual(setupBlock.includes("grid-template-columns: repeat(2, minmax(0, 1fr));"), true, "2カラム・出題タイプ・回答方式は repeat(2, minmax(0,1fr))");
  assertEqual(setupBlock.includes("repeat(auto-fill"), false, "repeat(auto-fill) は使わない（iOS Safariのmin-content計算で列幅が膨らむ原因）");
  assertEqual(setupBlock.includes("min-inline-size: 0;"), true, "fieldsetの既定 min-inline-size:min-content を0に上書きする");
  assertEqual(setupBlock.includes("columns: 2"), false, "段組み（columns）は使わない");
  assertEqual(/\.party-player-name-input \{[^}]*width: 0;/.test(css), true, "名前入力欄は width:0＋flex で固有幅を寄与させない");
}
