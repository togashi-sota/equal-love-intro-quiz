// 【2026-10-24新設】ライブ初心者ガイド・全体検索→歌詞検索の切り替えの回帰テスト。
import {
  LIVE_GUIDE_LAST_CHECKED,
  LIVE_GUIDE_KIND_LABELS,
  LIVE_GUIDE_SOURCES,
  LIVE_GUIDE_HERO,
  LIVE_GUIDE_CHAPTERS,
  LIVE_GUIDE_CHECKLIST,
  LIVE_GUIDE_FAQ,
  LIVE_GUIDE_LINKS,
  buildArrivalPlan,
} from "../js/data/liveGuideContent.js";
import { buildMemberColorRows, readChecklistState, writeChecklistState, LIVE_GUIDE_CHECKLIST_STORAGE_KEY } from "../js/liveGuideScreen.js";
import { presetLyricsSearchQuery } from "../js/lyricsSearchScreen.js";
import { buildAppSearchEntries, searchAppEntries } from "../js/appSearchIndex.js";
import { APP_SEARCH_FEATURES } from "../js/data/appSearchFeatures.js";
import { assertEqual } from "./test-utils.js";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    data,
  };
}

function allText(value) {
  return JSON.stringify(value);
}

export async function runLiveGuideAndSearchSwitchTests() {
  console.log("--- ライブ初心者ガイド・検索の切り替え ---");

  // 到着時刻の目安
  const plan = buildArrivalPlan({ openTime: "16:30", startTime: "18:00" });
  assertEqual(plan.ok, true, "目安：開場・開演があれば計算できる");
  assertEqual(plan.steps.map((s) => s.time), ["15:45", "16:30", "17:30", "18:00"], "目安：到着は開場45分前・着席は開演30分前");
  assertEqual(buildArrivalPlan({ openTime: "16:30", startTime: "18:00", bigVenue: true }).steps[0].time, "15:15", "目安：大きな会場は30分早める");
  assertEqual(buildArrivalPlan({ openTime: "16:30", startTime: "18:00", takePhotos: true }).steps[0].time, "15:25", "目安：写真を撮るなら20分早める");
  const goodsPlan = buildArrivalPlan({ openTime: "16:30", startTime: "18:00", buyGoods: true });
  assertEqual(goodsPlan.steps[0].time === null && goodsPlan.steps[0].label.includes("公式の物販案内"), true, "目安：グッズは時刻を決めつけず公式案内を確認させる");
  assertEqual(buildArrivalPlan({ openTime: "", startTime: "18:00" }).ok, false, "目安：入力が足りなければ計算しない");
  assertEqual(buildArrivalPlan({ openTime: "18:00", startTime: "17:00" }).ok, false, "目安：開演が開場より前なら計算しない");
  assertEqual(buildArrivalPlan({ openTime: "25:00", startTime: "26:00" }).ok, false, "目安：ありえない時刻は受け付けない");
  assertEqual(buildArrivalPlan({ openTime: "0:20", startTime: "1:00" }).steps[0].time, "23:35", "目安：日付をまたいでも時刻の形が崩れない");

  // 内容の整合性
  assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(LIVE_GUIDE_LAST_CHECKED), true, "内容：最終確認日がある");
  assertEqual(LIVE_GUIDE_HERO.title.includes("楽しむ"), true, "内容：冒頭で一番大切なのは楽しむことと伝える");
  assertEqual(LIVE_GUIDE_HERO.notice.includes("公式のアプリではありません"), true, "内容：公式アプリではないと明記する");
  const chapterIds = LIVE_GUIDE_CHAPTERS.map((c) => c.id);
  assertEqual(new Set(chapterIds).size, chapterIds.length, "内容：章のidが重複しない");
  assertEqual(chapterIds.length >= 11, true, "内容：11章以上ある");
  assertEqual(LIVE_GUIDE_CHAPTERS[0].id, "welcome", "内容：最初の章は導入");
  const kinds = new Set(LIVE_GUIDE_CHAPTERS.flatMap((c) => c.blocks.map((b) => b.kind)).filter(Boolean));
  assertEqual(["official", "varies", "fan", "creator"].every((k) => kinds.has(k) && LIVE_GUIDE_KIND_LABELS[k]), true, "内容：公式・公演で違う・ファン・制作者を区別している");
  const sourceIds = new Set(LIVE_GUIDE_SOURCES.map((s) => s.id));
  const usedSourceIds = LIVE_GUIDE_CHAPTERS.flatMap((c) => c.blocks.flatMap((b) => b.sourceIds ?? []));
  assertEqual(usedSourceIds.every((id) => sourceIds.has(id)), true, "内容：出典のidがすべて一覧にある");
  assertEqual(LIVE_GUIDE_SOURCES.every((s) => s.url.startsWith("https://")), true, "内容：出典はhttps");
  assertEqual(
    LIVE_GUIDE_SOURCES.filter((s) => s.kind === "official").every((s) => s.url.startsWith("https://equal-love.jp/")),
    true,
    "内容：公式の出典は公式サイト"
  );
  assertEqual(
    LIVE_GUIDE_CHAPTERS.flatMap((c) => c.blocks).filter((b) => b.kind === "official").every((b) => (b.sourceIds ?? []).length > 0),
    true,
    "内容：公式として書いた内容には必ず出典を付ける"
  );
  const goodsChapter = allText(LIVE_GUIDE_CHAPTERS.find((c) => c.id === "goods"));
  assertEqual(goodsChapter.includes("事前決済には対応していない"), true, "内容：モバイルオーダーの例は事前決済ではないと書く");
  assertEqual(goodsChapter.includes("購入は保証されない"), true, "内容：バーコードは購入保証ではないと書く");
  assertEqual(goodsChapter.includes("公演によって違う場合があります"), true, "内容：モバイルオーダーを全公演共通と決めつけない");
  const checklistIds = LIVE_GUIDE_CHECKLIST.flatMap((g) => g.items.map((i) => i.id));
  assertEqual(new Set(checklistIds).size, checklistIds.length, "内容：持ち物のidが重複しない");
  assertEqual(LIVE_GUIDE_CHECKLIST[0].id, "must", "内容：必須の持ち物が最初");
  assertEqual(LIVE_GUIDE_CHECKLIST.find((g) => g.id === "must").items.some((i) => i.id === "penlight"), false, "内容：ペンライトを必須にしない");
  assertEqual(LIVE_GUIDE_FAQ.length >= 15, true, "内容：よくある質問が15問以上");
  assertEqual(LIVE_GUIDE_LINKS.some((l) => l.action.type === "specialMode" && l.action.modeId === "liveCallMode"), true, "内容：ライブコールモードへ移れる");

  // メンバーカラー（アプリの既存データから）
  const colorRows = buildMemberColorRows();
  assertEqual(colorRows.length, 10, "メンバーカラー：現役10人");
  assertEqual(colorRows.every((r) => r.colors.length > 0 && r.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c.hex) && c.name)), true, "メンバーカラー：全員に色名と色がある");

  // チェックリストの保存（端末内だけ・壊れたデータや保存できない環境でも落ちない）
  const storage = fakeStorage();
  assertEqual(readChecklistState(storage), {}, "チェック：初回は空");
  writeChecklistState({ ticket: true }, storage);
  assertEqual(readChecklistState(storage), { ticket: true }, "チェック：保存して読み直せる");
  assertEqual(readChecklistState(fakeStorage({ [LIVE_GUIDE_CHECKLIST_STORAGE_KEY]: "{壊れた" })), {}, "チェック：壊れたデータは空として扱う");
  assertEqual(readChecklistState(fakeStorage({ [LIVE_GUIDE_CHECKLIST_STORAGE_KEY]: "[1,2]" })), {}, "チェック：配列は空として扱う");
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assertEqual(readChecklistState(throwing), {}, "チェック：保存できない環境でも読み込みで落ちない");
  writeChecklistState({ a: true }, throwing);
  assertEqual(true, true, "チェック：保存できない環境でも書き込みで落ちない");

  // 全体検索でガイドが見つかる
  assertEqual(APP_SEARCH_FEATURES.some((f) => f.id === "feature-live-guide" && f.action.selector === "#live-guide-link"), true, "検索：ガイドを機能として登録");
  const entries = buildAppSearchEntries({ today: "2026-10-24" });
  for (const query of ["ライブ", "初ライブ", "持ち物", "ペンライト", "マナー", "モバイルオーダー", "ライブ初心者ガイド"]) {
    const titles = searchAppEntries(entries, query, "all").results.map(({ entry }) => entry.title);
    assertEqual(titles.includes("ライブ初心者ガイド"), true, `検索：「${query}」でガイドが見つかる`);
  }

  // 全体検索→歌詞検索：歌詞検索が空のときだけ引き継ぐ
  assertEqual(presetLyricsSearchQuery("   "), false, "切り替え：空白だけなら引き継がない");
  assertEqual(presetLyricsSearchQuery("  テスト語 "), true, "切り替え：歌詞検索が空なら引き継ぐ");
  assertEqual(presetLyricsSearchQuery("別の語"), false, "切り替え：歌詞検索に語が残っていれば上書きしない");

  // 画面の部品（index.html）
  const html = await (await fetch("./index.html", { cache: "no-store" })).text();
  assertEqual(html.includes('id="app-search-to-lyrics-button"'), true, "画面：全体検索に「歌詞検索へ」がある");
  assertEqual(html.includes('id="live-guide-link"') && html.includes('id="live-guide-screen"'), true, "画面：ホームの入口とガイド画面がある");
  assertEqual(/id="live-guide-back-button" class="back-link"/.test(html), true, "画面：ガイドの戻るは検索から来たとき検索へ戻れる共通の戻る");
  const sw = await (await fetch("./sw.js", { cache: "no-store" })).text();
  assertEqual(sw.includes("./js/liveGuideScreen.js") && sw.includes("./js/data/liveGuideContent.js"), true, "オフライン：新しいファイルをキャッシュ対象に入れる");
}
