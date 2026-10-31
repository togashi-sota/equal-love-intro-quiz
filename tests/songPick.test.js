// 「曲を選んで再生」（2026-11-01 r8-music・本人の依頼 R8-2）のテスト。
// 確かめること：
//   A. 選ぶ・外す・まとめて選ぶ・全部解除の計算（選んだ順＝番号の順）
//   B. 選んだ曲 → 再生キュー（順番＝選んだ順／シャッフル＝同じ曲の並べ替え／音源の無い曲は除いて数える）
//   C. まとめての追加：プレイリスト（既存・新しく作る）とお気に入り。重複は入れない・数の案内
//   D. 保存：別のキー（…pickedSongs）に保存し、お気に入り・プレイリストのキーの形は変えない
//   E. 今の再生元（全曲・お気に入り・プレイリスト）のキューの作り方が今までどおり（回帰）
//   F. 画面の部品（index.html・HOME_ACTIONS・画面の名前・戻り先・sw.js）がそろっている
import { SONGS, getSongById } from "../js/data/songs.js";
import {
  loadPickedSongIds,
  savePickedSongIds,
  normalizePickedSongIds,
  togglePickedSong,
  addPickedSongs,
  removePickedSongs,
  resolvePickedSongs,
  countPlayablePicked,
  PICK_FILTERS,
  songMatchesPickFilter,
  splitForBulkAdd,
  describeBulkAddResult,
  describePickedSummary,
} from "../js/songPickSelection.js";
import { planPlaybackQueue, shuffleSongs } from "../js/continuousPlayQueuePlan.js";
import { getPlaylists, createPlaylist, addSongsToPlaylist, deletePlaylist } from "../js/playlists.js";
import { getFavoriteSongIds, addFavoriteSongs, removeFavoriteSongs } from "../js/favoriteSongs.js";
import { getPlayerKeyPrefix } from "../js/playerProfile.js";
import { HOME_ACTIONS } from "../js/homeScreen.js";
import { listScreenNames } from "../js/screens.js";
import { HUB_OF_SCREEN, GUIDE_RETURN_HUBS_OF_SCREEN } from "../js/appNavigationStack.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

// 決まった順の「乱数」（シャッフルのテストを毎回同じ結果にするため）
function fixedRandom(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

function runSelectionTests() {
  // A. 選ぶ・外す
  let picked = [];
  picked = togglePickedSong(picked, "b");
  picked = togglePickedSong(picked, "a");
  picked = togglePickedSong(picked, "c");
  assertEqual(picked, ["b", "a", "c"], "A: タップした順に並ぶ（＝番号の順・順番に再生する順）");
  picked = togglePickedSong(picked, "a");
  assertEqual(picked, ["b", "c"], "A: 外すとその曲だけ抜け、ほかの順は変わらない");
  picked = togglePickedSong(picked, "a");
  assertEqual(picked, ["b", "c", "a"], "A: 選び直すと最後に付く");
  assertEqual(addPickedSongs(["b"], ["a", "b", "c", "a"]), ["b", "a", "c"], "A: まとめて選ぶ：選んでいる曲の位置はそのまま、新しい曲だけ後ろへ（重複なし）");
  assertEqual(removePickedSongs(["a", "b", "c", "d"], ["b", "d", "x"]), ["a", "c"], "A: まとめて外す（作品ごと・表示中の曲）");
  assertEqual(removePickedSongs(["a", "b"], ["a", "b"]), [], "A: 全部解除で空になる");
  assertEqual(normalizePickedSongIds(["a", "a", 3, null, "", "b"]), ["a", "b"], "A: 保存値の重複・文字列以外・空文字は捨てる");
  assertEqual(normalizePickedSongIds({ a: 1 }), [], "A: 配列でない保存値は空として扱う");

  // 絞り込み
  const sets = { pickedIds: new Set(["a"]), favoriteIds: new Set(["b"]), importedIds: new Set(["a", "c"]) };
  assertEqual(
    ["a", "b", "c"].filter((id) => songMatchesPickFilter(id, PICK_FILTERS.ALL, sets)),
    ["a", "b", "c"],
    "A: 絞り込み「すべて」"
  );
  assertEqual(["a", "b", "c"].filter((id) => songMatchesPickFilter(id, PICK_FILTERS.FAVORITES, sets)), ["b"], "A: 絞り込み「お気に入り」");
  assertEqual(["a", "b", "c"].filter((id) => songMatchesPickFilter(id, PICK_FILTERS.PICKED, sets)), ["a"], "A: 絞り込み「選んだ曲」");
  assertEqual(["a", "b", "c"].filter((id) => songMatchesPickFilter(id, PICK_FILTERS.PLAYABLE, sets)), ["a", "c"], "A: 絞り込み「音源あり」");

  // 選んだ数の文
  assertEqual(describePickedSummary(countPlayablePicked([], new Set())), { main: "曲をタップして選んでください", sub: "" }, "A: 0曲のときは選び方の案内");
  assertEqual(describePickedSummary(countPlayablePicked(["a", "c"], sets.importedIds)), { main: "2曲を選択中", sub: "" }, "A: 全部再生できるとき");
  assertEqual(
    describePickedSummary(countPlayablePicked(["a", "b", "c"], sets.importedIds)),
    { main: "3曲を選択中", sub: "再生できるのは2曲（1曲は音源なし）" },
    "A: 音源の無い曲があるときは、再生できる数を添える"
  );
  assertEqual(
    describePickedSummary(countPlayablePicked(["b"], sets.importedIds)),
    { main: "1曲を選択中", sub: "音源のある曲がありません（追加はできます）" },
    "A: 音源のある曲が無いとき（再生は押せない・追加はできる）"
  );
}

function runQueueTests() {
  // B. 選んだ曲 → キュー
  const picked = [SONGS[5].id, SONGS[0].id, SONGS[20].id, "no-such-song", SONGS[0].id];
  const songs = resolvePickedSongs(picked, getSongById);
  assertEqual(songs.map((song) => song.id), [SONGS[5].id, SONGS[0].id, SONGS[20].id], "B: 曲データに無い id・重複は飛ばし、選んだ順のまま");

  const allImported = new Set(SONGS.map((song) => song.id));
  const sequential = planPlaybackQueue({ songs, importedIds: allImported, shuffle: false });
  assertEqual(sequential.kind, "ok", "B: 選んだ曲でキューができる");
  assertEqual(sequential.queue.map((song) => song.id), songs.map((song) => song.id), "B: 順番に再生＝選んだ順");
  assertEqual(sequential.unavailableCount, 0, "B: 全部音源があれば除外は0曲");

  const shuffled = planPlaybackQueue({ songs, importedIds: allImported, shuffle: true, random: fixedRandom([0, 0.5, 0.9]) });
  assertEqual(
    [...shuffled.queue.map((song) => song.id)].sort(),
    [...songs.map((song) => song.id)].sort(),
    "B: シャッフルは選んだ曲だけの並べ替え（増えも減りもしない）"
  );
  assertEqual(
    shuffled.queue.map((song) => song.id),
    shuffleSongs(songs, fixedRandom([0, 0.5, 0.9])).map((song) => song.id),
    "B: シャッフルの並べ方は今までの連続再生と同じ（Fisher-Yates）"
  );
  assertEqual(songs.map((song) => song.id), [SONGS[5].id, SONGS[0].id, SONGS[20].id], "B: シャッフルしても元の選択の順は変わらない");

  const partial = planPlaybackQueue({ songs, importedIds: new Set([SONGS[0].id, SONGS[20].id]), shuffle: false });
  assertEqual(partial.queue.map((song) => song.id), [SONGS[0].id, SONGS[20].id], "B: 音源の無い曲はキューから除く（順はそのまま）");
  assertEqual(partial.unavailableCount, 1, "B: 除いた曲の数を返す（画面に「1曲は音源が…」と出す）");

  const none = planPlaybackQueue({ songs, importedIds: new Set(), shuffle: false });
  assertEqual([none.kind, none.queue.length, none.unavailableCount], ["no-playable", 0, 3], "B: 音源のある曲が無ければ再生しない");
  assertEqual(planPlaybackQueue({ songs: [], importedIds: allImported, shuffle: true }).kind, "empty-source", "B: 1曲も選んでいなければ空");

  // E. 今の再生元（回帰）：全曲・お気に入り・プレイリストのキューの作り方は今までどおり
  const all = planPlaybackQueue({ songs: SONGS, importedIds: allImported, shuffle: false });
  assertEqual(all.queue.map((song) => song.id), SONGS.map((song) => song.id), "E: 全曲・順番再生＝一覧の順で全曲");
  assertEqual(all.queue.length, SONGS.length, `E: 全曲は${SONGS.length}曲`);
  const allShuffled = planPlaybackQueue({ songs: SONGS, importedIds: allImported, shuffle: true });
  assertEqual(new Set(allShuffled.queue.map((song) => song.id)).size, SONGS.length, "E: 全曲・シャッフルも全曲（重複なし）");
  const favoriteLike = [SONGS[3], SONGS[1], SONGS[3]];
  assertEqual(
    planPlaybackQueue({ songs: favoriteLike, importedIds: allImported, shuffle: false }).queue.map((song) => song.id),
    [SONGS[3].id, SONGS[1].id],
    "E: お気に入り・プレイリストの重複は今までどおり1回だけ（最初の位置）"
  );
  const someMissing = planPlaybackQueue({ songs: SONGS.slice(0, 4), importedIds: new Set([SONGS[1].id, SONGS[3].id]), shuffle: false });
  assertEqual([someMissing.queue.map((song) => song.id), someMissing.unavailableCount], [[SONGS[1].id, SONGS[3].id], 2], "E: 音源の無い曲を除いて数える（今までと同じ）");
}

function runBulkAddTests() {
  // C. まとめての追加
  assertEqual(splitForBulkAdd(["a", "b", "c"], ["b", "x"]), { toAdd: ["a", "c"], already: ["b"] }, "C: もう入っている曲と、新しく入る曲に分ける");
  assertEqual(splitForBulkAdd(["a"], ["a"]), { toAdd: [], already: ["a"] }, "C: 全部入っているとき");
  assertEqual(describeBulkAddResult("お気に入り", 3, 0), "お気に入りに3曲を追加しました", "C: 案内：全部新しく入ったとき");
  assertEqual(describeBulkAddResult("「通勤用」", 4, 1), "「通勤用」に4曲を追加しました（1曲はもう入っていたので、そのままです）", "C: 案内：重複があったとき");
  assertEqual(describeBulkAddResult("お気に入り", 0, 2), "選んだ2曲は、すべてお気に入りに入っています", "C: 案内：1曲も増えなかったとき");

  // 本物のプレイリスト・お気に入りの保存で確かめる（テストのあとで元に戻す）
  const prefix = getPlayerKeyPrefix();
  const keys = [`equalLoveIntroQuiz.${prefix}playlists`, `equalLoveIntroQuiz.${prefix}favoriteSongs`, `equalLoveIntroQuiz.${prefix}pickedSongs`];
  const saved = keys.map((key) => localStorage.getItem(key));
  try {
    const [first, second, third] = [SONGS[0].id, SONGS[1].id, SONGS[2].id];
    const playlist = createPlaylist("テスト用");
    addSongsToPlaylist(playlist.playlistId, [second]);
    const split = splitForBulkAdd([first, second, third], getPlaylists().find((p) => p.playlistId === playlist.playlistId).songIds);
    const added = addSongsToPlaylist(playlist.playlistId, [first, second, third]);
    assertEqual([added, split.already.length], [2, 1], "C: 既存のプレイリストへ：入っていた1曲は二重に入れず、2曲だけ足す");
    assertEqual(getPlaylists().find((p) => p.playlistId === playlist.playlistId).songIds, [second, first, third], "C: プレイリストの元の曲順は変えず、後ろへ足す");
    const fresh = createPlaylist("  新しいリスト  ");
    assertEqual(addSongsToPlaylist(fresh.playlistId, [third, first]), 2, "C: 新しく作ったプレイリストへ選んだ順で入る");
    assertEqual(getPlaylists().find((p) => p.playlistId === fresh.playlistId).playlistName, "新しいリスト", "C: 新しいプレイリストの名前は前後の空白を除く（今までの作成と同じ）");
    deletePlaylist(playlist.playlistId);
    deletePlaylist(fresh.playlistId);

    const before = getFavoriteSongIds();
    const favoriteSplit = splitForBulkAdd([first, third], before);
    addFavoriteSongs(favoriteSplit.toAdd);
    assertEqual(getFavoriteSongIds().filter((id) => id === first || id === third).length, 2, "C: お気に入りへまとめて追加");
    addFavoriteSongs([first, third]);
    assertEqual(getFavoriteSongIds().length, new Set(getFavoriteSongIds()).size, "C: 2回押してもお気に入りは重複しない");
    removeFavoriteSongs(favoriteSplit.toAdd);
    assertEqual(getFavoriteSongIds(), before, "C: 「元に戻す」は今回足した曲だけを外し、前からのお気に入りはそのまま");

    // D. 保存
    savePickedSongIds([third, first, third, 5]);
    assertEqual(localStorage.getItem(keys[2]), JSON.stringify([third, first]), "D: 選んだ曲は …pickedSongs に、選んだ順の id の配列で保存");
    assertEqual(loadPickedSongIds(), [third, first], "D: 読み直しても同じ");
    localStorage.setItem(keys[2], "{壊れた値");
    assertEqual(loadPickedSongIds(), [], "D: 壊れた保存値でも止まらず空として扱う");
    assertEqual(Array.isArray(JSON.parse(localStorage.getItem(keys[0]) ?? "[]")), true, "D: プレイリストのキーの形（配列）は変わらない");
  } finally {
    keys.forEach((key, index) => {
      if (saved[index] === null) localStorage.removeItem(key);
      else localStorage.setItem(key, saved[index]);
    });
  }
}

async function runWiringTests() {
  // F. 画面の部品
  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ids = [
    "song-pick-screen", "song-pick-back-button", "song-pick-search-input", "song-pick-groups", "song-pick-select-visible-button",
    "song-pick-bar", "song-pick-bar-main", "song-pick-clear-button", "song-pick-play-button", "song-pick-shuffle-button",
    "song-pick-playlist-button", "song-pick-favorite-button", "song-pick-toast", "song-pick-playlist-modal",
    "song-pick-playlist-options", "song-pick-playlist-new-name", "song-pick-playlist-create-button",
    "continuous-play-picked-block", "continuous-play-picked-edit-button", "song-pick-link", "songlist-pick-songs-link",
  ];
  assertEqual(ids.filter((id) => !doc.getElementById(id)), [], "F: 「曲を選んで再生」の部品が index.html にそろっている");
  assertEqual(
    [...doc.querySelectorAll(".continuous-play-source-button")].map((button) => button.dataset.source),
    ["all", "favorites", "playlist", "picked"],
    "F: 連続再生の再生元は 全曲／お気に入り／プレイリスト／選んだ曲（今までの3つはそのまま）"
  );
  assertEqual(
    [...doc.querySelectorAll("#song-pick-screen .song-pick-filter")].map((button) => button.dataset.filter),
    Object.values(PICK_FILTERS),
    "F: 絞り込みは すべて／お気に入り／選んだ曲／音源あり"
  );
  assertEqual(doc.getElementById("song-pick-bar").closest(".game-frame"), null, "F: 下の帯は .game-frame の外（ミニプレイヤーと同じく画面の下に固定できる）");
  assertEqual(doc.getElementById("song-pick-bar").hasAttribute("hidden"), true, "F: 下の帯は最初は隠れている（この画面のときだけ出す）");
  assertEqual(doc.querySelector('[data-home-action="pick-songs"]') !== null, true, "F: ホームの「聴く」に「曲を選んで再生」");
  assertEqual(HOME_ACTIONS["pick-songs"], { type: "click", value: "song-pick-link" }, "F: ホームの入口は楽曲・歌詞の画面の入口と同じ処理");
  assertEqual(listScreenNames().includes("songPick"), true, "F: 画面の名前 songPick");
  assertEqual([HUB_OF_SCREEN.songPick, GUIDE_RETURN_HUBS_OF_SCREEN.songPick], ["musicHub", ["guide"]], "F: 戻り先（楽曲・歌詞の画面／ガイド）");
  const sw = await fetchText("sw.js");
  assertEqual(
    ["./js/songPickSelection.js", "./js/songPickScreen.js", "./js/continuousPlayQueuePlan.js", "./css/songPick.css"].filter((file) => !sw.includes(`"${file}"`)),
    [],
    "F: 新しいファイルはオフラインでも使えるよう sw.js に入っている"
  );
  assertEqual(Number(/const CACHE_VERSION = "v(\d+)";/.exec(sw)?.[1]) >= 408, true, "F: CACHE_VERSION を統合で上げた（v408 以上）");
  const css = await fetchText("css/songPick.css");
  assertEqual(css.includes("@media (prefers-reduced-motion: no-preference)"), true, "F: 押したときの縮みは「動きを減らす」設定では付けない");
  assertEqual(css.includes("body:has(#mini-player:not([hidden])) .song-pick-bar"), true, "F: ミニプレイヤーが出ているときは帯と重ならない");
  const playScript = await fetchText("js/continuousPlay.js");
  assertEqual(playScript.includes("planPlaybackQueue({ songs, importedIds, shuffle })"), true, "E: 連続再生は共通のキューの組み立て（js/continuousPlayQueuePlan.js）を使う");
}

export async function runSongPickTests() {
  runSelectionTests();
  runQueueTests();
  runBulkAddTests();
  await runWiringTests();
}
