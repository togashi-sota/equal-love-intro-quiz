// 音源ファイルをIndexedDB（ブラウザ内の保存領域）に保存・読み込みするファイル。
// PWA化に伴い、音源をサーバーから配信する static なパスではなく、
// 利用者が自分の端末で選んだファイルを、端末内だけに保存する方式に変更した。
//
// 曲ごとに独立したレコードとして保存するのがポイント。これにより、
// 「新曲が3曲増えたので、その3曲だけ選んで読み込む」という差分インポートが、
// 既存の曲のデータに一切触れずに実現できる（全部読み直す必要がない）。

import { filterSongsByAvailableAudio } from "./quiz.js";
import { computeSha256Hex } from "./contentHash.js";

const DB_NAME = "equalLoveIntroQuizAudio";
const DB_VERSION = 1;
const STORE_NAME = "audioFiles";

// 【2026-09-15改訂・本人指示：アプリ起動後1問目だけ無音になる問題のIndexedDB二重読み込み
// 調査】以前はこのファイルの関数を呼ぶたびに、毎回indexedDB.open()→使用→db.close()という
// 新しい接続を開いていた。通常のクイズの1問目は「beginQuiz()相当の処理が
// filterSongsWithImportedAudio()で1回DBを開く」→「実際の再生直前にjs/audio.jsが
// getAudioBlob()でもう1回DBを開く」という、合計2回の逐次的なIndexedDBオープンを経由して
// 初めて再生できていた（2問目以降は出題プール構築が既に終わっているため1回で済む）。
// iOSのオートプレイ許可は「ユーザー操作からどれだけ間を置かずにplay()を呼べたか」に
// 敏感なため、この2回目のDBオープン（特にコールドスタート直後は数十〜百数十ms単位の
// レイテンシになりうる）が、初回だけ無音になる一因ではないかと疑われていた。
// 実際には毎回開き直す技術的な必要は無い（DB_VERSIONを変える予定も無い）ため、
// 一度開いた接続をタブが生きている間ずっと使い回すキャッシュへ変更した。これにより、
// 同じセッション内で2回目以降にこのファイルのどの関数を呼んでも、実質的に
// indexedDB.open()の待ち時間が発生しなくなる（1問目の遅延要因を1つ減らす）。
let cachedDbPromise = null;

function openDatabase() {
  if (!cachedDbPromise) {
    cachedDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // songIdをキーにした保存領域。1曲＝1レコードにすることで、
          // 一部の曲だけを追加・上書きしても他の曲に影響しない。
          db.createObjectStore(STORE_NAME, { keyPath: "songId" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // 【安全策】通常はまず起きないが、他のタブがこのDBを削除・バージョン変更しようと
        // した場合（versionchange）や、ブラウザ側の事情で接続が閉じられた場合
        // （close）に、キャッシュを持ったまま無効な接続を使い続けてしまわないよう、
        // その場合はキャッシュを空にして次回の呼び出しで自然に開き直せるようにする。
        db.onversionchange = () => {
          db.close();
          cachedDbPromise = null;
        };
        db.onclose = () => {
          cachedDbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        // 開くこと自体に失敗した場合、キャッシュへ失敗したPromiseを残さない
        // （次の呼び出しで改めて開き直せるようにする）。
        cachedDbPromise = null;
        reject(request.error);
      };
    });
  }
  return cachedDbPromise;
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
// 【2026-08-29追加：contentHash】ファイルの中身（バイト列）そのものからSHA-256ハッシュを
// 計算し、レコードに含めて保存する。追加データパックの読み込み時、「この端末に既にある
// 音源と中身が同じか違うか」を、ファイルを毎回読み直さずに素早く比較できるようにするため
// （js/dataPackImport.js参照）。
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
    const contentHash = await computeSha256Hex(file);
    await putRecord(db, { songId, blob: file, importedAt: Date.now(), contentHash });
    savedSongIds.push(songId);
  }

  // 【2026-09-15改訂】接続はキャッシュして使い回す設計にしたため、ここでは閉じない
  // （db.close()すると、以後この関数が返したPromiseの接続は使えなくなるが、
  // cachedDbPromise自体はまだそれを指したままになってしまうため）。
  return { savedSongIds, unmatchedFileNames };
}

// 再試行の様子を調べたいときだけtrueにする（本番では常時falseのままにしておくこと）。
const DEBUG_LOGGING = false;

// 【2026-09-03改訂】以前は「nullだったら150ms待って1回だけ再試行」だったが、
// 本人指示（大型改修㉒番）で「オンライン対戦の参加者端末で、1問目の音源だけ
// 『読み込まれていません』になることがある」不具合が再発したと報告があった。
// 単発の150ms再試行では、実機（特にiPhone Safari）でのIndexedDBコールドスタート時の
// 遅延を待ちきれないケースがあると判断し、間隔を空けながら複数回まで再試行するよう強化した。
// 待ち時間の合計は最大でも1秒強に収まるため、本当に未インポートの曲での「未読み込み」表示が
// 大きく遅れることもない。
const RETRY_WAIT_MS_LIST = [150, 300, 600];

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
  return blob;
}

// 指定したsongIdの音源データ（Blob）を取得する。未読み込みならnullを返す。
//
// 【nullだった場合に間隔を空けながら複数回再試行する理由】オンライン対戦の参加者端末など、
// このセッションで初めてIndexedDBへアクセスするタイミングが「1問目の音源取得」と
// 重なるケースで、1回目の取得がnullになることが実機テストで報告された
// （原因はコードレビューでは断定できていないが、症状が「参加者端末の新しいルームの
// 1問目だけ・2試合目以降は正常」という一時的なものだったため、コールドスタート時の
// タイミングを疑い、保険として追加した）。
// 本当に音源が未インポートの曲を何度も再試行しないよう、このリトライはRETRY_WAIT_MS_LISTの
// 回数だけに限定する（最後まで全部nullなら、そのまま「未読み込み」としてnullを返す）。
//
// 【呼び出し元（js/audio.js）の世代番号との関係】この再試行の待ち時間は、単に
// getAudioBlob()の完了が少し遅れるだけなので、待っている間に呼び出し元が次の問題へ
// 進んでいれば、js/audio.js側の世代番号チェックによって「追い越された古い呼び出し」として
// 静かに無視される。そのための特別な連携はこちら側には持たせていない（責務を分けたまま）。
export async function getAudioBlob(songId) {
  const firstResult = await getAudioBlobOnce(songId);
  if (firstResult) return firstResult;

  for (let attempt = 0; attempt < RETRY_WAIT_MS_LIST.length; attempt++) {
    const waitMs = RETRY_WAIT_MS_LIST[attempt];
    if (DEBUG_LOGGING) console.log(`[audioStorage] ${songId}: ${attempt + 1}回目の再試行前に${waitMs}ms待ちます。`);
    await sleep(waitMs);

    const result = await getAudioBlobOnce(songId);
    if (result) {
      if (DEBUG_LOGGING) console.log(`[audioStorage] ${songId}: ${attempt + 1}回目の再試行で取得できました。`);
      return result;
    }
  }

  if (DEBUG_LOGGING) console.log(`[audioStorage] ${songId}: 全ての再試行後もnullでした（未読み込みと判断）。`);
  return null;
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
  return ids;
}

// 読み込み済みの全曲について、songId→contentHashの対応表を取得する（2026-08-29追加）。
// getAll()はBlob本体（音源ファイル）も一緒に返すが、BlobはJSのメモリ上では「参照」に
// すぎず、.arrayBuffer()等で明示的に読みにいかない限り実際のバイト列は読み込まれないため、
// 84曲分でもこの処理自体は軽量（音源ファイルを毎回読み直す必要はない）。
// 追加データパックの読み込み時、「既にある音源と中身が同じか違うか」を判定するために使う。
export async function getAudioContentHashes() {
  const db = await openDatabase();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Map(records.map((record) => [record.songId, record.contentHash ?? null]));
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

// ===== 【2026-09-21新設・本人指示：起動後1問目だけ無音になる問題の再調査】=====
//
// 【今回のGit履歴調査で判明した実際の原因】このファイルのgetAudioBlob()には、
// 「df5c1a1（2026-08-05）：音源未読み込み判定に、null時のみ1回だけ再試行する保険を追加」
// という、非常に古い時点からのコミットで既に、次の症状が報告・記録されていた：
//   「オンライン対戦の参加者端末で、新しいルームの1試合目1問目にだけ、実際には音源が
//    読み込まれているのに『音源が読み込まれていません』と誤って出ることがある」
// これはまさに「このセッションで初めてIndexedDBへ実際にアクセスするタイミング」が
// 「1問目の音源取得」と重なると、その1回目のアクセス（.get()）が本来あるはずの
// レコードに対してnullを返す、または通常より大きく遅れる、というIndexedDBの
// コールドスタート特有の不安定さがある、ということを示している。
// この後、35c2ee6・8a4cab7と、再試行の回数・待ち時間（150ms→150/300/600ms）を
// 強化する対策が重ねられてきたが、いずれも「不安定な1回目のアクセスへの後追いの
// 再試行」でしかなく、「なぜ1回目だけ不安定なのか」という根本原因（＝このセッションで
// 一度もIndexedDBに触れていない、コールドな状態）そのものは解消されていなかった。
//
// 【今回の対策：ユーザーのタップより前に、見えないところで「1回目の不安定なアクセス」を
// 済ませておく】ユーザーが実際にクイズを始める操作（スタートボタン等）をする頃には、
// 通常すでにアプリの起動・ホーム画面表示から数秒以上が経過している。この「暇な時間」を
// 使って、アプリ起動直後（このファイルが読み込まれた瞬間）に、実際の音源取得と全く同じ
// コード経路（openDatabase()→getAllKeys()→get()）を一度だけ通しておくことで、
// 「不安定になりがちな1回目のアクセス」を、ユーザーの操作とは無関係なタイミングへ
// 前倒しする。これにより、実際にユーザーがスタートを押して1問目の音源を取得する頃には
// 既にIndexedDBが「温まった」状態になっており、getAudioBlob()の再試行ロジックが
// 発動する必要自体がなくなる（＝スタート操作から実際のplay()呼び出しまでの間に挟まる
// 非同期処理の時間を、再試行の分だけ短縮できる）ことを狙っている。
//
// 【安全性】読み取り専用の操作のみで、結果は使い捨てる（呼び出し元には一切影響しない）。
// 失敗しても（IndexedDB自体が使えない環境等）例外を握りつぶし、既存のどの処理にも
// 影響を与えない、完全にbest-effortな先読みに徹する。

// 開発者向け診断ログ（console.logのみ。ユーザー向けUIには一切表示しない）。
// js/audio.jsのdiag()と同じ考え方・同じ経過時間の基準で、Q1無音バグの原因調査のため、
// このファイル単体でも起動直後からの時系列を追えるようにする。
const warmupDiagStartTime = performance.now();
function warmupDiag(label, detail) {
  const elapsedMs = Math.round(performance.now() - warmupDiagStartTime);
  if (detail !== undefined) {
    console.log(`[audioStorage診断] +${elapsedMs}ms ${label}`, detail);
  } else {
    console.log(`[audioStorage診断] +${elapsedMs}ms ${label}`);
  }
}

// アプリ起動直後、ユーザーのどの操作も待たずに1回だけ実行する（below、自己実行）。
// 「1曲分の実際のBlob取得」まで含めて経路を一致させるため、getImportedSongIds()だけでなく、
// 読み込み済みの曲が1曲でもあればgetAudioBlobOnce()も1回だけ通す
// （リトライ機構であるgetAudioBlob()ではなく、あえて内部のgetAudioBlobOnce()を直接呼ぶ。
// 再試行込みのgetAudioBlob()を使うと、コールドスタートで1回目がnullだった場合に
// 150〜1050ms分もこのウォームアップ自体が待ってしまい、後続の他の起動処理を無駄に
// 遅らせる可能性があるため。ウォームアップの目的は「実際に1問目を取得する瞬間より前に
// 一度触れておくこと」であり、ここでnullが返ってきても再試行する必要はない）。
async function warmUpAudioDatabase() {
  try {
    warmupDiag("ウォームアップ開始");
    await openDatabase();
    warmupDiag("openDatabase()完了");
    const ids = await getImportedSongIds();
    warmupDiag("getImportedSongIds()完了", { count: ids.length });
    if (ids.length > 0) {
      const blob = await getAudioBlobOnce(ids[0]);
      warmupDiag("getAudioBlobOnce()完了（1曲分の試し読み）", { songId: ids[0], hasBlob: !!blob });
    }
    warmupDiag("ウォームアップ完了");
  } catch (error) {
    // best-effortな先読みのため、失敗しても何もしない
    // （後続の実際の取得は、従来どおりgetAudioBlob()の再試行に委ねられる）。
    warmupDiag("ウォームアップ失敗（実害なし、後続の実際の取得へ委ねる）", {
      name: error?.name,
      message: error?.message,
    });
  }
}
warmUpAudioDatabase();
