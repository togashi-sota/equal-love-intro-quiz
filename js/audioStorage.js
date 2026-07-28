// 音源ファイルをIndexedDB（ブラウザ内の保存領域）に保存・読み込みするファイル。
// PWA化に伴い、音源をサーバーから配信する static なパスではなく、
// 利用者が自分の端末で選んだファイルを、端末内だけに保存する方式に変更した。
//
// 曲ごとに独立したレコードとして保存するのがポイント。これにより、
// 「新曲が3曲増えたので、その3曲だけ選んで読み込む」という差分インポートが、
// 既存の曲のデータに一切触れずに実現できる（全部読み直す必要がない）。

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

// 指定したsongIdの音源データ（Blob）を取得する。未読み込みならnullを返す。
export async function getAudioBlob(songId) {
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
