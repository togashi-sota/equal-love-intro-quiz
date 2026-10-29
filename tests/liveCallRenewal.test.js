// リニューアル第3〜5段階（2026-10-30）のテスト。本物の歌詞・コールは使わない（ダミーの小さなデータだけ）。
//   A. 完成版コールデータの読み込み（同じパック2回・古いパック・曲ごとの元に戻す・取り下げ・壊れた曲・歌詞の版違い）
//   B. モードごとの使える／使えない（コール表・ライブコール・カラオケ）と、歌詞の版違いの理由
//   C. 採用していない曲は、端末に元のコールがあってもコールを出さない
//   D. 時刻 → 光っているコール（本人の開始〜終了だけ。歌詞の時刻を変えても変わらない）
//   E. 演出の分類（明示 → 決まった種類 → 短い掛け声 → 長さ → ふつう）と見直し一覧
//   F. 長いコール（「おーはい！×４」型 1:36.38–1:42.22）の間も、歌詞の行が進む（コール優先スクロール 案D）
//   G. はじめに の版・曲一覧の並べ方と絞り込み
//   H. つなぎ込み（index.html・main.js・sw.js・データベースの版）のソース確認、IndexedDB の読み書き
import { assertEqual } from "./test-utils.js";
import { computeCallsFingerprint, hashText } from "../js/callTextEdits.js";
import { computeLyricsLineFingerprint } from "../js/callReleaseImport.js";
import {
  planCallReleaseImport,
  applyPlanItem,
  undoReleasedSong,
  summarizeReleaseVersion,
  describeImportResult,
  songContentHash,
  classifyCallReleaseJson,
  stableStringify,
  RELEASE_ACTION,
} from "../js/callReleasePack.js";
import { buildReleasedCallSheet, computeModeAvailability, activeCallKeysAt, buildFollowSong, classifyReleasedCalls, buildClassificationReview, layoutCallsInOrder, SHEET_STATE } from "../js/liveCallData.js";
import { createRunner, lyricConfidence, flattenSheet } from "../js/callFollow.js";
import { stateAt, summarizeState } from "../js/callEffects.js";
import { shouldShowLiveCallNotice, sortLiveCallSongs, filterLiveCallSongs, LIVE_CALL_NOTICE_VERSION } from "../js/liveCallScreen.js";
import { getReleasedCallRecord, saveReleasedCallRecord, RELEASED_CALLS_STORE_NAME } from "../js/callStorage.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

// ---- ダミーのデータ（本物の歌詞・コールではない） ----
const LINES = [
  { line: 1, text: "ダミーの一行目", start: 10, end: 13 },
  { line: 2, text: "ダミーの二行目", start: 13.5, end: 16 },
  { line: 3, text: "ダミーの三行目", start: 16.5, end: 19 },
];
const DEVICE_CALLS = [{ type: "mix", start: 5, end: 7, text: "ダミーのコール" }];

function dummySong({ addedText = "ダミー追加", timingEnd = 11.8 } = {}) {
  return {
    textApprovedAt: "2026-10-29T00:00:00.000Z",
    timingCompletedAt: null,
    baseFingerprint: computeCallsFingerprint(DEVICE_CALLS),
    lyricsFingerprint: computeLyricsLineFingerprint(LINES),
    calls: { "mix@5.00": { lineNo: 1, position: "intro", originalTextHash: hashText("ダミーのコール") } },
    added: [{ key: "added-a", text: addedText, type: "unique", lineNo: 2, position: "after", order: 16.1 }],
    timing: { offsetSec: 0, calls: { "mix@5.00": { start: 5.25, end: 7.75 }, "added-a": { start: 11.2, end: timingEnd } } },
    containsCallText: true,
  };
}
function dummyArtifact(exportedAt, songs) {
  return { schema: "equal-love-call-release", version: 1, exportedAt, source: { editsRevision: 10, timingRevision: 20 }, songs };
}
const FP = new Map([["s1", computeLyricsLineFingerprint(LINES)], ["s2", computeLyricsLineFingerprint(LINES)]]);
const KNOWN = new Set(["s1", "s2", "s3"]);

function importOnce(artifact, existing, options = {}) {
  const plan = planCallReleaseImport({ artifact, existing, knownSongIds: KNOWN, deviceLyricsFingerprints: FP, ...options });
  const next = new Map(existing);
  for (const item of plan.items) {
    const record = applyPlanItem(item, existing.get(item.songId) ?? null, "2026-10-30T00:00:00.000Z");
    if (record) next.set(item.songId, record);
  }
  return { plan, records: next };
}

function runImportTests() {
  console.log("--- リニューアル3 A：完成版コールデータの読み込み ---");
  const v1 = dummyArtifact("2026-10-29T03:00:00.000Z", { s1: dummySong(), s2: dummySong() });
  const first = importOnce(v1, new Map());
  assertEqual([first.plan.ok, first.plan.counts.add, first.records.size], [true, 2, 2], "A: 初めての読み込みは2曲とも追加");
  const again = importOnce(v1, first.records);
  assertEqual([again.plan.counts.unchanged, again.plan.counts.add + again.plan.counts.update], [2, 0], "A: 同じパックをもう一度：全部「変更なし」");
  assertEqual(again.records.get("s1"), first.records.get("s1"), "A: 同じパックをもう一度：レコードは書き換わらない");
  assertEqual(
    applyPlanItem(again.plan.items[0], first.records.get("s1"), "x"),
    null,
    "A: 「変更なし」は保存しない（applyPlanItem が null）",
  );
  // 1曲だけ中身が変わった新しい版
  const v2 = dummyArtifact("2026-10-30T03:00:00.000Z", { s1: dummySong({ addedText: "ダミー追加・直した" }), s2: dummySong() });
  const second = importOnce(v2, first.records);
  assertEqual([second.plan.counts.update, second.plan.counts.unchanged], [1, 1], "A: 新しい版：中身が変わった1曲だけ更新、もう1曲は変更なし");
  assertEqual(second.records.get("s1").previous.contentHash, first.records.get("s1").current.contentHash, "A: 更新した曲は1つ前の版を残す");
  assertEqual(second.records.get("s2"), first.records.get("s2"), "A: 変わっていない曲は触らない");
  // 古いパックを後から読み込む
  const older = importOnce(v1, second.records);
  assertEqual([older.plan.counts.older, older.plan.counts.unchanged], [1, 1], "A: 古いパック：新しい版の曲は「古いので読み込まない」");
  assertEqual(older.records.get("s1"), second.records.get("s1"), "A: 古いパック：本人の確認なしに上書きしない");
  const rolled = importOnce(v1, second.records, { allowRollback: true });
  assertEqual(rolled.plan.counts.rollback, 1, "A: 本人が「古い版に戻す」を選んだときだけ戻す");
  assertEqual(rolled.records.get("s1").current.contentHash, first.records.get("s1").current.contentHash, "A: 戻した版は古い成果物の中身");
  // 曲ごとの元に戻す（入れ替え。もう一度で元へ）
  const undone = undoReleasedSong(second.records.get("s1"), "t");
  assertEqual(undone.current.contentHash, first.records.get("s1").current.contentHash, "A: 元に戻す：1つ前の版が今の版になる");
  assertEqual(undoReleasedSong(undone, "t2").current.contentHash, second.records.get("s1").current.contentHash, "A: もう一度元に戻すと、また新しい版");
  assertEqual(undoReleasedSong(first.records.get("s1"), "t"), null, "A: 1つ前の版が無ければ戻せない");
  // 新しい版で採用から外れた曲＝コール表なし（前の版は残す）
  const v3 = dummyArtifact("2026-10-31T03:00:00.000Z", { s2: dummySong() });
  const withdrawn = importOnce(v3, second.records);
  assertEqual([withdrawn.plan.counts.withdraw, withdrawn.records.get("s1").current, Boolean(withdrawn.records.get("s1").previous)], [1, null, true], "A: 新しい版に無い曲はコール表なし（前の版は残す）");
  assertEqual(importOnce(v1, withdrawn.records).plan.items.find((item) => item.songId === "s1").action, RELEASE_ACTION.OLDER, "A: 取り下げより古いパックで、取り下げを取り消さない");
  assertEqual(importOnce(dummyArtifact("2026-10-28T00:00:00.000Z", {}), second.records).plan.counts.withdraw, 0, "A: 古い成果物では取り下げない");
  // 壊れた曲・知らない曲は、その曲だけ読み込まない
  const broken = dummySong();
  broken.timing = { offsetSec: 0, calls: { "added-a": { start: 3, end: 2 } } };
  const mixed = importOnce(dummyArtifact("2026-10-30T00:00:00.000Z", { s1: broken, s2: dummySong(), zz: dummySong() }), new Map());
  assertEqual([mixed.plan.counts.invalid, mixed.plan.counts[RELEASE_ACTION.UNKNOWN_SONG], mixed.plan.counts.add, mixed.records.has("s1")], [1, 1, 1, false], "A: 壊れた曲・アプリに無い曲だけ飛ばし、ほかは読み込む");
  // 歌詞の版違いは数える（データは入れる。表示は歌詞が合ってから）
  const fpOther = new Map([["s1", { lineCount: 3, hash: "deadbeef" }]]);
  const mismatch = planCallReleaseImport({ artifact: v1, existing: new Map(), knownSongIds: KNOWN, deviceLyricsFingerprints: fpOther });
  assertEqual([mismatch.counts.add, mismatch.counts.lyricsMismatch], [2, 2], "A: 端末の歌詞の版が違う曲（無い曲も）は「歌詞の版が違う」に数える");
  // 全体の形
  assertEqual(planCallReleaseImport({ artifact: { schema: "x" } }).ok, false, "A: 違う形式のファイルは読み込まない");
  assertEqual(planCallReleaseImport({ artifact: { ...v1, exportedAt: undefined } }).ok, false, "A: 書き出した日時が無ければ読み込まない（新旧を比べられない）");
  assertEqual(planCallReleaseImport({ artifact: { ...v1, displayLyricsPrivate: {} } }).ok, false, "A: コール表のファイルに歌詞の文章があれば読み込まない");
  // 表示用の歌詞（別ファイル）
  const display = { schema: "equal-love-call-display-private", version: 1, source: { editsRevision: 10 }, songs: { s1: { lineTexts: { 1: { originalTextHash: hashText("ダミーの一行目"), text: "ダミー表示" } }, lyricsFingerprint: computeLyricsLineFingerprint(LINES) } } };
  const withDisplay = importOnce(v1, new Map(), { display });
  assertEqual(Boolean(withDisplay.records.get("s1").current.display), true, "A: 表示用の歌詞は曲ごとに入る");
  assertEqual(importOnce(v1, withDisplay.records).plan.counts.unchanged, 2, "A: 表示用の歌詞の無いパックをあとで読み込んでも、同じ版なら引き継いで「変更なし」");
  const otherRevision = importOnce(v1, new Map(), { display: { ...display, source: { editsRevision: 99 } } });
  assertEqual([otherRevision.records.get("s1").current.display, otherRevision.plan.errors.length > 0], [null, true], "A: 別の版の表示用の歌詞は使わない（理由を出す）");
  assertEqual(songContentHash({ a: 1, b: 2 }, null) === songContentHash({ b: 2, a: 1 }, null), true, "A: 中身の指紋はキーの順番に左右されない");
  assertEqual(stableStringify({ b: [1, { d: 1, c: 2 }], a: null }), '{"a":null,"b":[1,{"c":2,"d":1}]}', "A: 順番をそろえた文字列化");
  assertEqual([classifyCallReleaseJson(v1), classifyCallReleaseJson(display), classifyCallReleaseJson({})], ["artifact", "display", null], "A: ファイルの種類の見分け");
  // データ管理の表示
  const summary = summarizeReleaseVersion(second.records);
  assertEqual([summary.songCount, summary.latest.exportedAt, summary.latest.editsRevision, summary.mixed], [2, "2026-10-30T03:00:00.000Z", 10, true], "A: 今の版（曲数・一番新しい書き出し日時・rev。1曲だけ更新したので「別の版の曲がある」）");
  assertEqual(summarizeReleaseVersion(first.records).mixed, false, "A: 全曲が同じ版なら「別の版の曲」は無い");
  assertEqual(summarizeReleaseVersion(new Map()).latest, null, "A: 何も読み込んでいなければ版なし");
  const lines = describeImportResult(second.plan, (id) => `曲${id}`);
  assertEqual(lines[0], "更新 1曲（新しく 0・中身が変わった 1）／変更なし 1曲／古いので読み込まなかった 0曲／歌詞の版が違う 0曲", "A: 結果の1行目（更新・変更なし・古い・歌詞の版違いの数）");
  assertEqual(lines.includes("更新した曲：曲s1"), true, "A: 結果に曲名");
}

function sheetFor(record, { lines = LINES, deviceCalls = DEVICE_CALLS, contentHash = null } = {}) {
  return buildReleasedCallSheet({ record, lyricsRecord: { lines, contentHash }, deviceCalls });
}

function runAvailabilityTests() {
  console.log("--- リニューアル3 B・C：使える／使えない・採用していない曲 ---");
  const record = { songId: "s1", current: { entry: dummySong(), display: null } };
  const sheet = sheetFor(record);
  assertEqual([sheet.state, sheet.calls.length], [SHEET_STATE.READY, 2], "B: 採用した曲はコール表を組み立てられる");
  assertEqual(sheet.calls.map((c) => [c.key, c.start, c.end]), [["mix@5.00", 5.25, 7.75], ["added-a", 11.2, 11.8]], "B: 時刻は本人の値そのまま（コール表の並び順）");
  assertEqual(layoutCallsInOrder(sheet.layout).map((c) => c.key), ["mix@5.00", "added-a"], "B: 並び順は js/callTextLayout.js の並び（前奏のブロック→2行目の後）");
  const ok = computeModeAvailability({ sheet, hasAudio: true, lyricsRecord: { lines: LINES } });
  assertEqual([ok.sheet.ok, ok.live.ok, ok.karaoke.ok], [true, true, true], "B: コール表・時刻・音源・歌詞がそろえば3つとも使える");
  const noAudio = computeModeAvailability({ sheet, hasAudio: false, lyricsRecord: { lines: LINES } });
  assertEqual([noAudio.sheet.ok, noAudio.live.ok, noAudio.karaoke.ok], [true, false, false], "B: 音源が無い：コール表だけ使える");
  assertEqual(noAudio.live.reason.includes("音源"), true, "B: 使えない理由（音源）");
  // 採用していない曲：端末に元のコールがあってもコールを出さない。カラオケは使える
  const none = sheetFor(null);
  assertEqual([none.state, none.calls.length, none.layout], [SHEET_STATE.NO_SHEET, 0, null], "C: 採用していない曲は、端末に元のコールがあってもコールを出さない");
  assertEqual(none.message, "この曲のコール表はまだありません。", "C: 「コールのない曲」ではなく「コール表はまだありません」");
  const noneAvail = computeModeAvailability({ sheet: none, hasAudio: true, lyricsRecord: { lines: LINES } });
  assertEqual([noneAvail.sheet.ok, noneAvail.live.ok, noneAvail.karaoke.ok], [false, false, true], "C: 採用していない曲でもカラオケは使える");
  assertEqual(sheetFor({ songId: "s1", current: null, previous: record.current }).state, SHEET_STATE.NO_SHEET, "C: 取り下げた曲（前の版だけある）もコールを出さない");
  // 歌詞の版違い：違う行にコールを出さない。理由を分ける
  const changed = [...LINES.slice(0, 2), { ...LINES[2], text: "ダミーの三行目（直した）" }];
  const differs = sheetFor(record, { lines: changed });
  assertEqual([differs.state, differs.calls.length], [SHEET_STATE.LYRICS_DIFFERENT, 0], "B: 歌詞の版が違えばコールを出さない");
  assertEqual(differs.message.includes("最新の歌詞パック"), true, "B: 何を読み込めばよいかを書く");
  assertEqual(sheetFor(record, { lines: [] }).state, SHEET_STATE.LYRICS_MISSING, "B: 歌詞が無い");
  const supersededHash = "82acd8ea633be128453cc84d1127a6f5021f9bcc1fc624895a02a20a89203769";
  assertEqual(sheetFor({ ...record, songId: "want-you-want-you" }, { lines: changed, contentHash: supersededHash }).state, SHEET_STATE.LYRICS_OLD, "B: 端末の歌詞が「古い版の一覧」にあれば「歌詞データが古い版」");
  assertEqual(sheetFor(record, { deviceCalls: [{ ...DEVICE_CALLS[0], text: "別の版" }] }).state, SHEET_STATE.CALLS_MISMATCH, "B: 元のコールの版が違えばコールを出さない");
  const mismatchAvail = computeModeAvailability({ sheet: differs, hasAudio: true, lyricsRecord: { lines: changed } });
  assertEqual([mismatchAvail.live.ok, mismatchAvail.karaoke.ok], [false, true], "B: 歌詞の版違いでも音源（カラオケ）は使える");
  // 表示用の歌詞：指紋が合うときだけ
  const display = { lineTexts: { 1: { originalTextHash: hashText("ダミーの一行目"), text: "ダミー表示の一行目" } }, lyricsFingerprint: computeLyricsLineFingerprint(LINES) };
  const withDisplay = sheetFor({ songId: "s1", current: { entry: dummySong(), display } });
  assertEqual([withDisplay.displayApplied, withDisplay.layout.items.find((i) => i.kind === "line").text], [true, "ダミー表示の一行目"], "B: 表示用の歌詞は、歌詞の版が同じなら当てはめる");
  const wrongDisplay = sheetFor({ songId: "s1", current: { entry: dummySong(), display: { ...display, lyricsFingerprint: { lineCount: 3, hash: "x" } } } });
  assertEqual([wrongDisplay.ok, wrongDisplay.displayApplied], [true, false], "B: 表示用の歌詞の版が違えば、元の歌詞で出す（コールは出す）");
  // 時刻の無いコールは光らせない
  const noTime = dummySong();
  delete noTime.timing.calls["added-a"];
  const partial = sheetFor({ songId: "s1", current: { entry: noTime, display: null } });
  assertEqual([partial.calls.length, layoutCallsInOrder(partial.layout).length], [1, 2], "B: 時刻の無いコールは表には出すが、光らせない");
}

function runActiveCallTests() {
  console.log("--- リニューアル3 D：時刻 → 光っているコール ---");
  const calls = [
    { key: "a", start: 5.25, end: 7.75 },
    { key: "b", start: 7, end: 8 },
    { key: "c", start: 96.38, end: 102.22 },
  ];
  assertEqual(activeCallKeysAt(calls, 5.249), [], "D: 開始の直前は光らない");
  assertEqual(activeCallKeysAt(calls, 5.25), ["a"], "D: 開始ちょうどで光る");
  assertEqual(activeCallKeysAt(calls, 7.2), ["a", "b"], "D: 重なっているコールは両方光る");
  assertEqual(activeCallKeysAt(calls, 7.75), ["b"], "D: 終了ちょうどで消える");
  assertEqual(activeCallKeysAt(calls, 99), ["c"], "D: 長いコールは終わりまで光る");
  assertEqual(activeCallKeysAt(calls, 102.22), [], "D: 長いコールも終了で消える");
  // 歌詞の時刻（AI）を変えても、光るコールは変わらない
  const record = { songId: "s1", current: { entry: dummySong(), display: null } };
  const shifted = LINES.map((l) => ({ ...l, start: l.start + 2.5, end: l.end + 2.5 }));
  const a = sheetFor(record);
  const b = sheetFor(record, { lines: shifted });
  assertEqual(b.calls, a.calls, "D: 歌詞の時刻をずらしても、コールの時刻・光り方は1つも変わらない");
  const times = [4, 5.3, 6, 7.7, 11.5, 12];
  assertEqual(times.map((t) => activeCallKeysAt(b.calls, t)), times.map((t) => activeCallKeysAt(a.calls, t)), "D: どの時刻でも同じコールが光る");
  // 全体オフセットは足すだけ（それ以外は変えない）
  const offsetSong = dummySong();
  offsetSong.timing.offsetSec = 0.3;
  const offset = sheetFor({ songId: "s1", current: { entry: offsetSong, display: null } });
  assertEqual(offset.calls.map((c) => [c.start, c.end]), [[5.55, 8.05], [11.5, 12.1]], "D: 全体オフセットを足した時刻");
}

function runClassificationTests() {
  console.log("--- リニューアル3 E：演出の分類 ---");
  const calls = [
    { key: "k1", text: "超絶かわいい！ダミー", start: 1, end: 3.6 },
    { key: "k2", text: "タイガー！ファイヤー！", start: 4, end: 7 },
    { key: "k3", text: "あーフッフー！", start: 8, end: 8.8 },
    { key: "k4", text: "はい！×４", start: 9, end: 15 },
    { key: "k5", text: "ダミーの長いコール", start: 16, end: 21 },
    { key: "k6", text: "ダミー", start: 22, end: 22.6 },
    { key: "k7", text: "Hey！", start: 23, end: 23.3 },
  ];
  const preps = classifyReleasedCalls(calls);
  assertEqual(preps.map((p) => p.type), ["cute", "mix", "chant", "shout", "long", "normal", "shout"], "E: 優先順位どおり（超絶かわいい→MIX→フッフー→短い掛け声（6秒でも言葉で決める）→4秒以上→ふつう）");
  assertEqual(preps.map((p) => [p.start, p.end]), calls.map((c) => [c.start, c.end]), "E: 分類しても開始・終了は変えない");
  const explicit = classifyReleasedCalls([calls[5]], { k6: { type: "name", memberIds: ["dummy"], textHash: hashText("ダミー") } }, hashText);
  assertEqual([explicit[0].type, explicit[0].basis], ["name", "explicit"], "E: 本人の明示（文章の指紋が合う）が一番強い");
  const stale = classifyReleasedCalls([calls[5]], { k6: { type: "name", textHash: hashText("別の文章") } }, hashText);
  assertEqual(stale[0].type, "normal", "E: 文章の指紋が合わない明示は使わない（ふつうに倒れる）");
  const review = buildClassificationReview(classifyReleasedCalls([...calls, { key: "k8", text: "フゥフー", start: 30, end: 30.5 }]), { nameWords: ["ダミー"] });
  assertEqual(review.map((r) => r.key).sort(), ["k5", "k6", "k8"], "E: 見直し一覧＝近い書き方の掛け声・長さだけで決めたもの・名前らしい言葉（超絶かわいいは除く）");
  // 同じ時刻なら同じ見た目（シーク・一時停止に強い）
  const opts = { design: "c", intensity: "std", reduced: false, shoutStyle: "combo", shoutFx: true };
  const samples = [[0, 2], [1, 5], [3, 9.5], [4, 18]];
  const forward = samples.map(([i, t]) => summarizeState(stateAt(preps[i], t, opts)));
  const backward = [...samples].reverse().map(([i, t]) => summarizeState(stateAt(preps[i], t, opts))).reverse();
  assertEqual(backward, forward, "E: 演出は時刻だけで決まる（逆順に計算しても同じ）");
  const reduced = stateAt(preps[3], 9.1, { ...opts, reduced: true });
  assertEqual([reduced.textS, reduced.textY], [1, 0], "E: 視差効果を減らす設定では動かさない");
  const off = stateAt(preps[0], 2, { ...opts, intensity: "off" });
  assertEqual([off.textS, off.ringO, off.hearts.length], [1, 0, 0], "E: 演出オフでは動き・飾りを出さない");
}

// 「おーはい！×４」型：1つの長いコール（96.38–102.22）の間に、歌詞が3行進む（ダミーの文面・幾何）
function overlapSong() {
  const song = { id: "x", duration: 120, sheet: [], calls: {}, lyrics: {}, markers: [], sectionMarkers: [] };
  const call = (id, start, end) => (song.calls[id] = { id, text: "ダミー", start, end });
  call("call:long", 96.38, 102.22);
  call("call:after", 104, 105);
  const lyric = (n, start, end) => {
    const id = `lyric:${n}:0`;
    song.lyrics[id] = { id, order: n, text: `ダミー${n}`, ai: { start, end }, owner: null, ownerEnd: null, suspect: false };
    return id;
  };
  const rows = [
    [1, 90, 92.5, [], [], []],
    [2, 93, 96, [], [], []],
    [3, 96.4, 98.3, [], ["call:long"], []],
    [4, 98.5, 100.3, [], [], []],
    [5, 100.4, 102.1, [], [], []],
    [6, 102.5, 103.9, [], [], ["call:after"]],
    [7, 106, 108, [], [], []],
  ];
  for (const [n, s, e, before, inline, after] of rows) song.sheet.push({ kind: "line", id: lyric(n, s, e), before, inlineStart: [], inline, after });
  const geom = { items: {}, contentH: 0 };
  let y = 0;
  for (const f of flattenSheet(song)) {
    geom.items[f.id] = { top: y, bottom: y + 30 };
    y += 40;
  }
  geom.contentH = y + 400;
  return { song, geom };
}

function runOverlapTests() {
  console.log("--- リニューアル3 F：長いコールの間も歌詞が進む ---");
  const { song, geom } = overlapSong();
  const conf = lyricConfidence(song);
  assertEqual(["lyric:3:0", "lyric:4:0", "lyric:5:0"].map((id) => conf.get(id)), ["high", "high", "high"], "F: 長いコールと重なる行も、時刻が素直なら信頼できる行");
  const runner = createRunner("callFirst", song, geom, 200, { variant: "combo" });
  const seen = [];
  let longAlwaysVisible = true;
  for (let i = 0; i <= 30 * 8; i += 1) {
    const t = 95 + i / 30;
    const r = runner.step(t, i === 0 ? 0 : 1 / 30, { seeked: i === 0 });
    if (t >= 96.4 && t < 102.2) {
      if (r.litLyric && seen[seen.length - 1] !== r.litLyric) seen.push(r.litLyric);
      const g = geom.items["call:long"];
      if (!(g.bottom > r.scrollTop && g.top < r.scrollTop + 200)) longAlwaysVisible = false;
      if (!r.litCalls.has("call:long")) longAlwaysVisible = false;
    }
  }
  assertEqual(seen, ["lyric:3:0", "lyric:4:0", "lyric:5:0"], "F: 長いコールの間に、歌詞の行が3行とも順に進む（止まらない）");
  assertEqual(longAlwaysVisible, true, "F: 長いコールは光っている間ずっと画面の中");
  // 並び（層1）と時刻（層2）は書き換えない
  const before = JSON.stringify(song);
  runner.step(97, 0, { seeked: true });
  assertEqual(JSON.stringify(song), before, "F: スクロールの計算は、並び・時刻を書き換えない");
  // シークしても同じ時刻なら同じ場所
  const a = createRunner("callFirst", song, geom, 200, { variant: "combo" }).step(99, 0, { seeked: true }).scrollTop;
  const runner2 = createRunner("callFirst", song, geom, 200, { variant: "combo" });
  runner2.step(80, 0, { seeked: true });
  const b = runner2.step(99, 0, { seeked: true }).scrollTop;
  assertEqual(a, b, "F: シークした先の位置は、どこから来ても同じ");
  // アプリのコール表の形 → スクロール用の形
  const record = { songId: "s1", current: { entry: dummySong(), display: null } };
  const sheet = sheetFor(record);
  const follow = buildFollowSong({ layout: sheet.layout, calls: sheet.calls, lines: LINES });
  assertEqual(
    [Object.keys(follow.calls), follow.sheet.map((row) => row.kind), follow.lyrics["lyric:1:0"].ai],
    [["call:mix@5.00", "call:added-a"], ["block", "line", "line", "line"], { start: 10, end: 13 }],
    "F: コール表の並びから、スクロール用の形を作る（歌詞の時刻は表示行の最初の行だけ）",
  );
}

function runListTests() {
  console.log("--- リニューアル3 G：はじめに・曲一覧 ---");
  assertEqual([shouldShowLiveCallNotice(null), shouldShowLiveCallNotice(String(LIVE_CALL_NOTICE_VERSION)), shouldShowLiveCallNotice("0")], [true, false, true], "G: はじめにを見ていない・古い版を見た → 出す。今の版を見た → 出さない");
  assertEqual(shouldShowLiveCallNotice("1", 2), true, "G: 版を上げたらもう一度出す");
  const songs = [
    { id: "a", title: "カキク", searchReading: "かきく", releaseDate: "2020-01-01" },
    { id: "b", title: "アイウ", searchReading: "あいう", releaseDate: "2022-01-01" },
    { id: "c", title: "Zダミー", searchReading: "さしす", releaseDate: "2021-01-01" },
  ];
  assertEqual(sortLiveCallSongs(songs, "gojuon").map((s) => s.id), ["b", "a", "c"], "G: 五十音順（よみ）");
  assertEqual(sortLiveCallSongs(songs, "release").map((s) => s.id), ["a", "c", "b"], "G: 発売順");
  assertEqual(sortLiveCallSongs(songs, "newest").map((s) => s.id), ["b", "c", "a"], "G: 新しい順");
  assertEqual(filterLiveCallSongs(songs, { query: "イウ" }).map((s) => s.id), ["b"], "G: 検索：カタカナでも、途中の文字でも見つかる");
  assertEqual(filterLiveCallSongs(songs, { query: "ｶｷ" }).map((s) => s.id), ["a"], "G: 検索：半角カナもそろえる");
  assertEqual(filterLiveCallSongs(songs, { filter: "sheet", sheetIds: new Set(["c"]) }).map((s) => s.id), ["c"], "G: 絞り込み：コール表あり");
  assertEqual(filterLiveCallSongs(songs, { filter: "audio", audioIds: new Set(["a", "b"]) }).map((s) => s.id), ["a", "b"], "G: 絞り込み：音源あり");
}

async function runWiringTests() {
  console.log("--- リニューアル3 H：つなぎ込み・データベース ---");
  const base = new URL("../", import.meta.url); // tests/ の1つ上＝アプリの置き場所（どのページから読み込んでも同じ）
  const [html, main, sw, storage, screens] = await Promise.all(["index.html", "js/main.js", "sw.js", "js/callStorage.js", "js/screens.js"].map((file) => fetchText(new URL(file, base))));
  assertEqual(/id="live-call-screen"[\s\S]*?class="back-link"/.test(html), true, "H: 新しいライブコールの画面に［戻る］（.back-link：端末の戻るも同じ動き）");
  assertEqual(html.includes('id="call-release-import-input"') && html.includes('accept=".json,application/json,.zip,application/zip"'), true, "H: データ管理に「完成版コールデータを読み込む」（JSON・ZIP）");
  assertEqual(html.includes('id="data-pack-import-input"'), true, "H: 追加データパックの読み込みはそのまま残っている");
  assertEqual(main.includes("setLiveCallEntryHandler(() => openLiveCallFrom("), true, "H: ホームのライブコールは差し替え口から新しい流れへ");
  assertEqual(/modeId === "liveCallMode"\) \{[\s\S]{0,400}openLiveCallFrom\("gameHub"\)/.test(main), true, "H: ゲーム画面のライブコールモードも新しい流れへ");
  assertEqual(screens.includes('liveCall: document.getElementById("live-call-screen")'), true, "H: 画面の登録");
  assertEqual(/const DB_VERSION = 2;/.test(storage) && storage.includes('db.createObjectStore(STORE_NAME, { keyPath: "songId" })') && storage.includes("db.createObjectStore(RELEASED_CALLS_STORE_NAME, { keyPath: \"songId\" })"), true, "H: データベースは版2。元の callData ストア（keyPath songId）はそのまま、releasedCalls を足すだけ");
  assertEqual(/if \(!db\.objectStoreNames\.contains\(STORE_NAME\)\)/.test(storage) && /if \(!db\.objectStoreNames\.contains\(RELEASED_CALLS_STORE_NAME\)\)/.test(storage), true, "H: 版を上げるときは、無いストアを作るだけ（今あるストア・記録を消さない）");
  const files = ["./js/callReleaseImport.js", "./js/callReleasePack.js", "./js/callReleaseImportUi.js", "./js/liveCallData.js", "./js/liveCallScreen.js", "./js/callEffects.js", "./js/callEffectsRenderer.js", "./js/shoutWords.js", "./js/callFollow.js", "./js/data/callEffects.js", "./css/liveCall.css"];
  assertEqual(files.filter((file) => !sw.includes(`"${file}"`)), [], "H: 新しいファイルを APP_SHELL に入れた");
  const version = Number(/CACHE_VERSION = "v(\d+)"/.exec(sw)?.[1]);
  assertEqual(version >= 391, true, "H: CACHE_VERSION を上げた（v391 以上）");
  assertEqual(html.includes('href="css/liveCall.css"'), true, "H: 新しい見た目のファイルを読み込む");
  // 本物の IndexedDB：版2で開いて、完成版コールデータを読み書きできる（テスト用の曲ID。終わったら元に戻せないので、テスト専用のIDだけを使う）
  const testId = "__test-live-call-renewal__";
  const record = { songId: testId, current: { entry: { dummy: true }, display: null, contentHash: "h", exportedAt: "2026-10-30T00:00:00.000Z", source: {} }, previous: null, updatedAt: "t" };
  try {
    await saveReleasedCallRecord(record);
    assertEqual((await getReleasedCallRecord(testId))?.current?.contentHash, "h", `H: IndexedDB の ${RELEASED_CALLS_STORE_NAME} に保存・読み込みできる`);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("equalLoveIntroQuizCalls");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    assertEqual([db.version >= 2, [...db.objectStoreNames].sort()], [true, ["callData", "releasedCalls"]], "H: データベースの中身は callData と releasedCalls の2つ");
    await new Promise((resolve) => {
      const tx = db.transaction(RELEASED_CALLS_STORE_NAME, "readwrite");
      tx.objectStore(RELEASED_CALLS_STORE_NAME).delete(testId);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  } catch (error) {
    assertEqual(String(error), "", "H: IndexedDB の読み書き");
  }
}

export async function runLiveCallRenewalTests() {
  runImportTests();
  runAvailabilityTests();
  runActiveCallTests();
  runClassificationTests();
  runOverlapTests();
  runListTests();
  await runWiringTests();
}
