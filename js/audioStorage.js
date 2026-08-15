// 音源ファイルをIndexedDB（ブラウザ内の保存領域）に保存・読み込みするファイル。
// PWA化に伴い、音源をサーバーから配信する static なパスではなく、
// 利用者が自分の端末で選んだファイルを、端末内だけに保存する方式に変更した。
//
// 曲ごとに独立したレコードとして保存するのがポイント。これにより、
// 「新曲が3曲増えたので、その3曲だけ選んで読み込む」という差分インポートが、
// 既存の曲のデータに一切触れずに実現できる（全部読み直す必要がない）。

import { filterSongsByAvailableAudio } from "./quiz.js";

const DB_NAME = "equalLoveIntroQuizAudio";
const DB_VERSION = 1;
const STORE_NAME = "audioFiles";

// IndexedDBのデータベースを開く（なければ作る）。
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // songIdをキーにした保存領域。1曲＝1レコードにすることで、
        // 一部の曲だけを追加・上書きしても他の曲に影響しない。
        db.createObjectStore(STORE_NAME, { keyPath: "songId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 選んだファイル群のうち、ファイル名（拡張子を除いた部分）がsongs.jsの`id`と
// 一致するものだけを保存する。ファイル名の命名規則（id.mp3）はローカル音源時代と
// 同じものをそのまま使っているので、曲ごとの手動対応付けは不要。
// 一部の曲だけを選んでも、選んだ分だけが追加・上書きされる（差分インポート）。
//
// 戻り値: { savedSongIds: string[], unmatchedFileNames: string[] }
//   savedSongIds       : 保存できた曲のsongId一覧
//   unmatchedFileNames : 拡張子が.mp3でない等の理由で保存できなかったファイル名一覧
export async function importAudioFiles(fileList) {
  const db = await openDatabase();
  const savedSongIds = [];
  const unmatchedFileNames = [];

  for (const file of fileList) {
    const match = file.name.match(/^(.+)\.mp3$/i);
    if (!match) {
      unmatchedFileNames.push(file.name);
      continue;
    }
    const songId = match[1];
    await putRecord(db, { songId, blob: file, importedAt: Date.now() });
    savedSongIds.push(songId);
  }

  db.close();
  return { savedSongIds, unmatchedFileNames };
}

// 再試行の様子を調べたいときだけtrueにする（本番では常時falseのままにしておくこと）。
const DEBUG_LOGGING = false;

// nullだった場合に、もう一度だけ取得し直すまでに空ける待ち時間（ミリ秒）。
const RETRY_WAIT_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// IndexedDBから1回だけ取得する処理そのもの。例外（DBが開けない等）はここでは
// 一切もみ消さず、そのまま呼び出し元へ伝える（原因を隠さないため）。
async function getAudioBlobOnce(songId) {
  const db = await openDatabase();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(songId);
    request.onsuccess = () => resolve(request.result ? request.result.blob : null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

// 指定したsongIdの音源データ（Blob）を取得する。未読み込みならnullを返す。
//
// 【nullだったときだけ1回だけ再試行する理由】オンライン対戦の参加者端末など、
// このセッションで初めてIndexedDBへアクセスするタイミングが「1問目の音源取得」と
// 重なるケースで、ごく稀に1回目の取得がnullになることが実機テストで報告された
// （原因はコードレビューでは断定できていないが、症状が「参加者端末の新しいルームの
// 1問目だけ・2試合目以降は正常」という一時的なものだったため、コールドスタート時の
// タイミングを疑い、保険として追加した）。
// 本当に音源が未インポートの曲を何度も再試行しないよう、このリトライは1回だけに限定する
// （2回目もnullなら、そのまま「未読み込み」としてnullを返す＝案内が長時間遅れることもない）。
//
// 【呼び出し元（js/audio.js）の世代番号との関係】この再試行の待ち時間は、単に
// getAudioBlob()の完了が少し遅れるだけなので、待っている間に呼び出し元が次の問題へ
// 進んでいれば、js/audio.js側の世代番号チェックによって「追い越された古い呼び出し」として
// 静かに無視される。そのための特別な連携はこちら側には持たせていない（責務を分けたまま）。
export async function getAudioBlob(songId) {
  const firstResult = await getAudioBlobOnce(songId);
  if (firstResult) return firstResult;

  if (DEBUG_LOGGING) console.log(`[audioStorage] ${songId}: 1回目がnullでした。${RETRY_WAIT_MS}ms待って再試行します。`);
  await sleep(RETRY_WAIT_MS);

  const secondResult = await getAudioBlobOnce(songId);
  if (DEBUG_LOGGING) {
    console.log(
      secondResult
        ? `[audioStorage] ${songId}: 再試行で取得できました。`
        : `[audioStorage] ${songId}: 再試行してもnullでした（未読み込みと判断）。`
    );
  }
  return secondResult;
}

// 読み込み済みの曲のsongId一覧を取得する。
// 「未読み込みの曲が何曲あるか」の判定・表示に使う。
export async function getImportedSongIds() {
  const db = await openDatabase();
  const ids = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return ids;
}

// songs（js/data/songs.jsの曲オブジェクト配列）のうち、この端末に音源が読み込み済みの
// 曲だけを返す（IndexedDBに実際に触れる、薄いラッパー関数）。
// クイズの出題・4択のダミー選択肢を「実際にこの端末で聴ける曲」だけに絞り込むために使う
// （本人指示・2026-08-15：音源を読み込んでいない曲は、出題にも選択肢にも一切出さない。
// js/lyricsQuizQuestionBuilder.jsのloadSongsWithLyrics()と同じ役割分担の考え方）。
export async function filterSongsWithImportedAudio(songs) {
  const importedIds = await getImportedSongIds();
  return filterSongsByAvailableAudio(songs, importedIds);
}
