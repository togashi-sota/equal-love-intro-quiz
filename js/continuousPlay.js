// 連続再生機能のキュー生成・再生制御を担当するファイル（画面のDOM組み立てはcontinuousPlayScreen.jsが行う）。
// 「全曲／お気に入り／プレイリスト」のいずれかから再生キュー（曲の並び）を作り、
// 順に自動再生する。音源はaudio.js・songlist.jsと同じくIndexedDB（audioStorage.js）から
// 取得し、複製は一切行わない。歌詞も、収録曲一覧と同じjs/lyricsSync.jsをそのまま呼ぶだけで、
// 歌詞データの複製は行わない（2026-08-04新設、Step1で基本機能、同日中に1画面UI・リピート・
// 歌詞連携を追加）。

import { SONGS, getSongById } from "./data/songs.js";
import { getFavoriteSongIds } from "./favoriteSongs.js";
import { getPlaylistById } from "./playlists.js";
import { getAudioBlob, getImportedSongIds } from "./audioStorage.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";

const audioElement = document.getElementById("continuous-play-audio");
const lyricsPanelElement = document.getElementById("continuous-play-lyrics-panel");

// 再生用の一時URL。曲を切り替えるたびに前のURLを解放する（audio.js・songlist.jsと同じ考え方）。
let currentObjectUrl = null;
function releaseCurrentObjectUrl() {
  if (currentObjectUrl !== null) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

// 状態は、この5つだけで表現する。
// "idle"    : まだ何も再生元を選んでいない（起動直後の状態）
// "playing" : 再生中
// "paused"  : 一時停止中（本人が一時停止した場合と、他の音声が始まって自動的に
//             一時停止させられた場合の両方を含む。どちらの理由でも再開の操作は同じでよいため）
// "finished": キューの最後まで再生し終えた（リピートなしのときだけ到達する）
// "empty"   : 選んだ再生元に曲がない、または音源のある曲が1曲もなかった（errorMessage参照）
let status = "idle";
let queue = []; // 実際に再生する曲データの配列（音源が見つかった曲だけ、必要ならシャッフル済み）
let currentIndex = -1;

// 今アクティブな（実際に再生中/一時停止中の）設定。設定パネルを開いたときの初期値にも使う。
let activeSource = "all"; // "all" | "favorites" | "playlist"
let activePlaylistId = null;
let activeShuffle = false;
let repeatMode = "none"; // "none" | "all" | "one" -- こちらは「即時反映」の設定

let unavailableCount = 0; // 音源が端末に見つからず、キューから除外された曲数
let errorMessage = ""; // 再生元が空だった場合などの案内文（statusが"empty"のときに参照）
let hasLyrics = false; // 今の曲に同期歌詞データがあるか

// 歌詞の取得は非同期のため、曲を素早く切り替えたときに「古い曲の歌詞取得結果」が
// 後から届いて新しい曲の表示を上書きしてしまわないよう、リクエストごとに番号を振って
// 「今のリクエストと一致するときだけ結果を反映する」形にする（songlist.jsのplayPreview()と
// 同じ考え方を、非同期関数内でも安全に使えるよう明示的なトークンにしている）。
let playRequestToken = 0;

const stateChangeListeners = new Set();

function notifyStateChange() {
  stateChangeListeners.forEach((listener) => listener(getPlaybackState()));
}

const ORDER_LABELS = { false: "順番再生", true: "シャッフル再生" };
const REPEAT_LABELS = { none: "リピートなし", all: "全体リピート", one: "1曲リピート" };

function resolveSourceLabel() {
  if (activeSource === "all") return `全${SONGS.length}曲`;
  if (activeSource === "favorites") return `お気に入り${getFavoriteSongIds().length}曲`;
  const playlist = activePlaylistId ? getPlaylistById(activePlaylistId) : null;
  return playlist ? `プレイリスト：${playlist.playlistName || "名前未設定"}` : "プレイリスト";
}

// 「次に流れる曲」のキュー内での位置を求める。1曲リピート中は同じ位置（同じ曲がもう一度）、
// キューの途中なら次の位置、全体リピート中で最後の曲まで来ていれば先頭（0）を返す
// （実際に折り返す瞬間にはreshuffleAvoidingRepeatBoundary()で並びが変わることがあるが、
// あくまで「この後どうなるか」の目安表示なので、先読みの時点では今のキューの並びを
// そのまま参照する）。リピートなしで最後の曲のときは、次の曲が無いので-1を返す。
function resolveNextIndex() {
  if (currentIndex < 0 || queue.length === 0) return -1;
  if (repeatMode === "one") return currentIndex;
  if (currentIndex < queue.length - 1) return currentIndex + 1;
  if (repeatMode === "all") return 0;
  return -1;
}

// 画面側は、この関数が返す情報だけを見て表示を組み立てればよい。
export function getPlaybackState() {
  return {
    status,
    source: activeSource,
    playlistId: activePlaylistId,
    shuffle: activeShuffle,
    repeatMode,
    sourceLabel: resolveSourceLabel(),
    orderLabel: ORDER_LABELS[activeShuffle],
    repeatLabel: REPEAT_LABELS[repeatMode],
    unavailableCount,
    errorMessage,
    queue,
    queueLength: queue.length,
    currentIndex,
    currentSong: currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null,
    nextIndex: resolveNextIndex(),
    nextSong: resolveNextIndex() >= 0 ? queue[resolveNextIndex()] : null,
    canGoPrevious: currentIndex > 0,
    canGoNext: currentIndex >= 0 && currentIndex < queue.length - 1,
    hasLyrics,
  };
}

export function onPlaybackStateChange(listener) {
  stateChangeListeners.add(listener);
  return () => stateChangeListeners.delete(listener);
}

// Fisher-Yatesシャッフル。元の配列は変更せず、新しい配列を返す。
function shuffleSongs(songs) {
  const result = [...songs];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 全体リピートで1周し終えたときの再シャッフル。可能な範囲で、直前に流れ終えた曲と
// 次の1曲目が同じにならないようにする（2曲以上あるときだけ意味のある調整）。
function reshuffleAvoidingRepeatBoundary(songs, lastSongId) {
  const reshuffled = shuffleSongs(songs);
  if (reshuffled.length > 1 && reshuffled[0].id === lastSongId) {
    [reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]];
  }
  return reshuffled;
}

// 候補曲のリストから、実際に再生できるキューを作る共通処理。
// - 同じ曲が重複しないようにする（Mapでid単位にまとめる）
// - 端末に音源が読み込まれていない曲は、この時点で除外する
//   （再生中に何度もスキップが起きて不安定に見えるのを避けるため、始める前にまとめて判定する。
//   除外した曲数は`unavailableCount`として、キューを作り直すたびに1回だけ画面に表示する）
async function buildAndStartQueue({ source, playlistId, songs, shuffle, emptySourceMessage }) {
  // 選んだ内容（再生元・プレイリスト・シャッフル）は、この後の結果が空であっても反映する。
  // 次に設定パネルを開いたときに「さっき選んだ内容」がそのまま表示されるようにするため
  // （曲が無かったからといって、こっそり前の選択に戻ってしまうと分かりにくい）。
  activeSource = source;
  activePlaylistId = playlistId;
  activeShuffle = shuffle;

  const dedupedById = new Map(songs.map((song) => [song.id, song]));
  const deduped = [...dedupedById.values()];

  if (deduped.length === 0) {
    setEmptyState(emptySourceMessage);
    return;
  }

  const importedIds = new Set(await getImportedSongIds());
  const playable = deduped.filter((song) => importedIds.has(song.id));
  unavailableCount = deduped.length - playable.length;

  if (playable.length === 0) {
    setEmptyState("この再生元には、音源が読み込まれている曲が1曲もありません。スタート画面の「音源を読み込む」から追加してください。");
    return;
  }

  queue = shuffle ? shuffleSongs(playable) : playable;
  currentIndex = 0;
  errorMessage = "";
  playCurrentIndex();
}

function setEmptyState(message) {
  queue = [];
  currentIndex = -1;
  status = "empty";
  errorMessage = message;
  hasLyrics = false;
  destroyLyricsSync();
  notifyStateChange();
}

// 全曲から再生キューを作る。
export async function startFromAllSongs(shuffle) {
  await buildAndStartQueue({
    source: "all",
    playlistId: null,
    songs: SONGS,
    shuffle,
    emptySourceMessage: "収録曲がありません。",
  });
}

// お気に入り曲から再生キューを作る。
export async function startFromFavorites(shuffle) {
  const songs = getFavoriteSongIds().map(getSongById).filter(Boolean);
  await buildAndStartQueue({
    source: "favorites",
    playlistId: null,
    songs,
    shuffle,
    emptySourceMessage: "お気に入り曲がまだありません。収録曲一覧から♡を押して登録できます。",
  });
}

// 指定したプレイリストから再生キューを作る。
export async function startFromPlaylist(playlistId, shuffle) {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return;
  const songs = playlist.songIds.map(getSongById).filter(Boolean);
  await buildAndStartQueue({
    source: "playlist",
    playlistId,
    songs,
    shuffle,
    emptySourceMessage: "このプレイリストにはまだ曲が入っていません。",
  });
}

// リピート方式を変える（設定パネルの「適用」を待たず即時反映する。キューの並び自体は
// 変えないため、再生を止め直す必要がないという判断。本人と合意済み）。
export function setRepeatMode(mode) {
  repeatMode = mode;
  notifyStateChange();
}

// 今のキューの位置（currentIndex）の曲を再生し、同期歌詞も合わせて読み込む。
async function playCurrentIndex() {
  if (currentIndex < 0 || currentIndex >= queue.length) {
    status = "finished";
    notifyStateChange();
    return;
  }

  const song = queue[currentIndex];
  const blob = await getAudioBlob(song.id);
  if (!blob) {
    // buildAndStartQueue()で事前に音源の有無を確認しているため通常は起きないが、
    // 万一取得できなかった場合に処理を止めないよう、次の曲へ安全に進める。
    advanceToNextOnEnded();
    return;
  }

  // 連続再生の音声を鳴らす直前に、クイズ・試聴など他の音声を止める
  // （playbackCoordinator.js参照）。
  notifyPlaybackStarting("continuousPlay");

  releaseCurrentObjectUrl();
  currentObjectUrl = URL.createObjectURL(blob);
  audioElement.src = currentObjectUrl;
  audioElement.play().catch(() => {
    // 再生に失敗した場合は、試聴と同じ考え方で静かに一時停止扱いにする
    // （エラーダイアログ等は出さず、操作ボタンから再開・次の曲へ進めるようにする）。
    status = "paused";
    notifyStateChange();
  });

  status = "playing";
  hasLyrics = false; // 歌詞の取得結果が届くまでは「歌詞なし」扱いにしておく（前の曲の歌詞が一瞬残るのを防ぐ）
  notifyStateChange();

  // 同期歌詞（js/lyricsSync.jsを収録曲一覧と共通で使う。歌詞データの複製はしない）。
  const requestToken = ++playRequestToken;
  const lyricsFound = await loadLyricsForSong(song.id, audioElement, lyricsPanelElement);
  if (requestToken !== playRequestToken) return; // その間にさらに曲が切り替わっていたら、この結果は無視する
  hasLyrics = lyricsFound;
  notifyStateChange();
}

// 曲が終わったときの共通処理。「なし」は次の曲（無ければ停止）、「全体」は最後で先頭に戻る、
// 「1曲」はhandleEnded()側で個別に扱うためここには来ない。
function advanceToNextOnEnded() {
  if (currentIndex < queue.length - 1) {
    currentIndex += 1;
    playCurrentIndex();
    return;
  }

  if (repeatMode === "all" && queue.length > 0) {
    const lastSongId = queue[currentIndex].id;
    if (activeShuffle) {
      queue = reshuffleAvoidingRepeatBoundary(queue, lastSongId);
    }
    currentIndex = 0;
    playCurrentIndex();
    return;
  }

  // キューの最後まで再生し終えた。ここで自動的に最初へ戻したり繰り返したりしない
  // （リピート「なし」のときの本来の挙動）。
  audioElement.pause();
  audioElement.currentTime = 0;
  status = "finished";
  notifyStateChange();
}

// 曲が終わったら、自動的に次の曲へ進む（リピート方式に応じて挙動が変わる）。
audioElement.addEventListener("ended", () => {
  if (repeatMode === "one") {
    audioElement.currentTime = 0;
    audioElement.play().catch(() => {});
    return;
  }
  advanceToNextOnEnded();
});

export function togglePlayPause() {
  if (status === "playing") {
    audioElement.pause();
    status = "paused";
    notifyStateChange();
  } else if (status === "paused" && currentIndex >= 0) {
    notifyPlaybackStarting("continuousPlay");
    audioElement.play().catch(() => {});
    status = "playing";
    notifyStateChange();
  }
}

// 前へ/次への手動操作は、リピート方式に関わらず常に「隣の曲へ移動する」だけの
// 単純な動作にする（本人の希望：リピート中でも手動操作はいつも通り動くようにしたい）。
export function goToNextManually() {
  if (currentIndex >= 0 && currentIndex < queue.length - 1) {
    currentIndex += 1;
    playCurrentIndex();
  }
}

export function goToPrevious() {
  if (currentIndex > 0) {
    currentIndex -= 1;
    playCurrentIndex();
  }
}

// 再生キュー画面で、曲を直接タップして再生位置を移動するための操作。
// goToPrevious/goToNextManuallyと同じく、リピート方式に関わらず単純に指定位置へ移動する。
export function jumpToIndex(index) {
  if (index < 0 || index >= queue.length || index === currentIndex) return;
  currentIndex = index;
  playCurrentIndex();
}

// 再生キュー画面のドラッグ並び替え・↑↓ボタンから呼ぶ。fromIndexの曲をtoIndexの位置へ動かす。
// 並び替えは配列の中身を動かすだけで、<audio>要素・再生状態には一切触れない
// （再生中の曲を動かしても音声が途切れない設計。UI/UX再設計で追加）。
// 現在再生中の曲がどの位置に動いても指し示す対象がずれないよう、位置ではなく曲idで
// currentIndexを再特定してから並び替え後の配列に反映する。
export function reorderQueue(fromIndex, toIndex) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= queue.length ||
    toIndex >= queue.length
  ) {
    return;
  }
  const currentSongId = currentIndex >= 0 ? queue[currentIndex].id : null;
  const [movedSong] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, movedSong);
  if (currentSongId !== null) {
    currentIndex = queue.findIndex((song) => song.id === currentSongId);
  }
  notifyStateChange();
}

// 他の音声（クイズ・試聴）が始まったときに、この再生を一時停止するための関数。
// 「利用者が自分で再開するまで、勝手に再開しない」という本人の希望に沿い、
// ここでは一時停止するだけで、再開はtogglePlayPause()を通じて本人の操作でのみ行う。
// 歌詞表示はそのまま残す（一時停止しただけで曲は変わっていないため）。
function pauseDueToConflict() {
  if (status !== "playing") return;
  audioElement.pause();
  status = "paused";
  notifyStateChange();
}

registerPlaybackStopper("continuousPlay", pauseDueToConflict);

// 再生を完全に止め、キューも空にしてidle状態へ戻す共通処理。
// 一時停止（pauseDueToConflict）と違い、「もう一度開いたら続きから」ではなく、
// 完全にリセットしたいとき（ミニプレイヤーの×ボタン・プレイヤー切替）に使う。
function resetToIdle() {
  audioElement.pause();
  audioElement.currentTime = 0;
  releaseCurrentObjectUrl();
  queue = [];
  currentIndex = -1;
  status = "idle";
  errorMessage = "";
  hasLyrics = false;
  destroyLyricsSync();
  notifyStateChange();
}

// ミニプレイヤーの×ボタンなど、「一時停止ではなく完全に止めたい」ときに呼ぶ
// （UI/UX再設計：他の画面にいる間も「今何が流れているか」が分かるミニプレイヤーを追加した際、
// そこから再生を完全に止める手段として新設）。
export function stopPlayback() {
  resetToIdle();
}

// プレイヤーを切り替えたときに呼ぶ（main.js）。お気に入り・プレイリストはプレイヤーごとの
// データのため、切替後もそのまま再生を続けると「前のプレイヤーの曲」を鳴らし続けることになる。
// 「全曲」はプレイヤーに関係なく同じ内容なので、そのときだけは何もしない。
export function handlePlayerChanged() {
  if (activeSource === "all") return;
  resetToIdle();
}
