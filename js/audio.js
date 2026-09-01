// <audio>要素の再生・停止を担当するファイル。
// 音源ファイルが見つからない/再生に失敗しても、例外を投げっぱなしにせず
// エラーメッセージ表示用のコールバックを呼ぶだけに留め、アプリ全体を止めないようにする。
//
// PWA化に伴い、音源はサーバーの静的なパスからではなく、IndexedDB（audioStorage.js）に
// 保存されたファイルから取得する方式にしている。取得自体が非同期処理になるため、
// このファイルの関数もそれに合わせて非同期（async）にしてある。

import { getAudioBlob } from "./audioStorage.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";
import { recordAudioDiagnostic } from "./audioDiagnosticLog.js";

const audioElement = document.getElementById("intro-audio");

// 【2026-09-01新設・本人指示：起動後1問目だけ無音になる問題の根本原因調査】ここから下、
// diag()を呼んでいる箇所はすべて開発者向けの診断ログで、ユーザー向けUIには一切表示しない
// （console.log/console.warnにしか出さない）。挙動そのものは変えず、実機のブラウザ
// コンソールから「unlockと本番再生の時系列」を後から追えるようにするためだけのもの。
// 経過時間はこのファイルが読み込まれた瞬間（アプリ起動直後とほぼ同時）を基準にする。
// 【2026-09-23改訂・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
// console.logへの出力に加えて、js/audioDiagnosticLog.jsの共有タイムラインへも記録する。
// これにより、Safari/PWAの開発者コンソールに直接アクセスできない実機（iPhone）でも、
// js/debugAudioLogScreen.jsの隠し画面から同じ記録をコピーして確認できるようにする。
const diagStartTime = performance.now();
function diag(label, detail) {
  const elapsedMs = Math.round(performance.now() - diagStartTime);
  recordAudioDiagnostic(label, detail);
  if (detail !== undefined) {
    console.log(`[audio診断] +${elapsedMs}ms ${label}`, detail);
  } else {
    console.log(`[audio診断] +${elapsedMs}ms ${label}`);
  }
}
diag("audio.js読み込み完了");

// audio要素そのものが発するイベントを診断用に記録する。onerror/onplaying等は
// 曲ごとにplaySongIntro()/playSongFromRandomPosition()が直接上書きして使っているため、
// ここではそれらと競合しないaddEventListener方式で追加する（上書きされない）。
// 【null安全について】tests.html（ユニットテスト用の簡易ページ）には#intro-audio要素が
// 存在せず、audioElementがnullになるケースがある。本編（index.html）では必ず存在するが、
// 念のためここで存在チェックしてから登録する（このファイル自体は元々、audioElementが
// nullでも「取得はできるが実際に使おうとするまでは落ちない」設計だったため、それを崩さない）。
if (audioElement) {
  ["canplay", "stalled", "suspend", "abort", "ended", "waiting", "pause", "emptied"].forEach((eventName) => {
    audioElement.addEventListener(eventName, () => {
      diag(`audio要素イベント: ${eventName}`, {
        readyState: audioElement.readyState,
        networkState: audioElement.networkState,
        src: audioElement.src,
      });
    });
  });
}

// ===== 楽曲音量（2026-09-26新設・本人指示：サウンドシステム全面整備） =====
// 効果音（js/soundManager.jsのsfxVolumePercent）とは完全に独立した、曲そのものの音量。
// 通常のイントロクイズ等の楽曲再生と、歌詞クイズ対戦の答え合わせ楽曲再生（新設）の
// どちらも同じaudioElementを共有しているため、ここで一箇所設定するだけで両方に効く。
// 【Q1無音バグとの関係について・重要】この音量機能は、下のunlock・
// ensureUnlockSettled()・fail-open・タイムアウト等の「再生を開始できるかどうか」の
// ロジックには一切関与しない。audioElement.volumeプロパティを、ブラウザの既定値（1.0）
// から保存済みの音量へ変えるだけの、完全に独立した後付け機能。
const MUSIC_VOLUME_STORAGE_KEY = "equalLoveIntroQuiz.musicVolumePercent";
const DEFAULT_MUSIC_VOLUME_PERCENT = 100;

function clampMusicVolumePercent(value) {
  if (!Number.isFinite(value)) return DEFAULT_MUSIC_VOLUME_PERCENT;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readMusicVolumePercent() {
  try {
    const stored = localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY);
    if (stored === null) return DEFAULT_MUSIC_VOLUME_PERCENT;
    return clampMusicVolumePercent(Number(stored));
  } catch {
    return DEFAULT_MUSIC_VOLUME_PERCENT;
  }
}

let musicVolumePercent = readMusicVolumePercent();
if (audioElement) audioElement.volume = musicVolumePercent / 100;

export function getMusicVolumePercent() {
  return musicVolumePercent;
}

// 0〜100の整数（範囲外は自動的に丸める）。保存に失敗しても、その場の音量変更自体は
// 反映され続ける（js/soundManager.jsの同種の設定関数と同じ方針）。
export function setMusicVolumePercent(percent) {
  musicVolumePercent = clampMusicVolumePercent(percent);
  if (audioElement) audioElement.volume = musicVolumePercent / 100;
  try {
    localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(musicVolumePercent));
  } catch {
    // 保存できなくても、その場の音量変更自体は反映され続ける
  }
}

// 【2026-09-06新設・本人指示：一瞬チャレンジで音源再生失敗が再発】3→2→1カウントダウン
// （js/localReplayCountdown.js）はsetTimeoutで約1.5秒後にonComplete()（＝実際の
// audioElement.play()呼び出し）を呼ぶ。iOS Safari/PWAは「ユーザー操作から十分近い
// タイミングで呼ばれたplay()」だけを自動再生制限の対象外として許可する仕様のため、
// setTimeoutを1.5秒挟んだ時点のplay()は、たとえ元をたどればボタン操作から始まった
// 処理でも「ユーザー操作外の呼び出し」とみなされ、iOS側に拒否される可能性がある
// （PLAY_RETRY_WAIT_MS_LISTによる再試行も、同じくユーザー操作から切り離された
// タイミングで呼ばれるため救済にならない）。
// これを避けるため、ページ内で最初にユーザーが何か操作した瞬間（まだどの問題も
// 始まっていない、最も早いタイミング）に、このaudio要素を1度だけ再生→即座に停止する
// 「unlock」を行っておく。一度ユーザー操作の中でplay()が成功した要素は、その後
// ページを閉じるまで、ユーザー操作を伴わないplay()呼び出しでも許可され続ける、という
// ブラウザの一般的な仕様を利用している（本来再生したい音源とは無関係な、無音の
// データURIを一時的に使うだけなので、実際のクイズ再生には一切影響しない）。
// 【2026-09-24修正・本人の実機診断ログで確定した根本原因】以前のこのデータURIは、
// WAVヘッダーのdataチャンクのサイズが0バイト（実際の音声サンプルが1つも無い）
// という不備があった（base64をデコードして実際のバイト列を確認して判明）。
// iOS実機の診断ログでは、[UNLOCK] play()呼び出しの直後にonplaying等の後続イベントが
// 一切発生せず、audioElement.play()が返すPromiseが何秒経っても成功も失敗もせず
// pendingのまま残り続け、後から別の処理（stopAudio()等によるpause()）がこの要素へ
// 割り込んで初めてAbortErrorとして決着する、という現象が実際に記録された。
// 「再生すべきサンプルが1つも無い」音源に対してplay()を呼ぶと、実際に再生を開始した
// という進捗（onplayingイベント等）をブラウザ側が検知できず、Promiseが決着すべき
// タイミングを認識できないまま放置される、という不具合だったと判断している。
// 対策として、8-bit・8000Hz・モノラルで実際に400サンプル（50ミリ秒）分の無音
// （8-bit unsigned PCMの無音は128であり、0ではない点に注意。以前のデータには
// この判断以前にサンプル自体が無かったため、この違い自体は今回新たに埋め込んだ）
// を持つ、正しく機能するWAVデータへ差し替えた。人の耳には聞こえない短さのまま、
// 実際に「再生が開始して完了した」という進捗をブラウザが認識できるようにしている。
const SILENT_UNLOCK_DATA_URI =
  "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

// 【2026-09-08新設・本人指示：音源再生失敗の根本原因調査】unlockが実際に成功したかどうかを
// 記録しておく。「本番の再生失敗が、そもそもunlockが成立していない環境で起きているのか」を
// 診断ログから切り分けられるようにするための情報で、挙動そのものは変えない
// （unlock失敗時も、これまでどおりPLAY_RETRY_WAIT_MS_LISTの再試行に委ねる）。
let audioUnlockState = "pending"; // "pending" | "succeeded" | "failed"

// 【2026-09-01新設・本人指示：起動後1問目だけ無音になる問題の根本原因調査・本対策】
// 「今まさに進行中のattemptSilentUnlock()の後始末（play→pause、または失敗判定）が
// 終わるPromise」を覚えておく場所。
// 【なぜ必要か】attemptSilentUnlock()は呼び出し元（各画面のクリックハンドラ）から
// awaitされていない、撃ちっぱなしの関数として設計されている（unlock自体は無音・
// 一瞬なので、呼び出し側の体感速度を変えたくないため）。しかしunlock中のplay()は
// 非同期Promiseであり、その決着がつく前に本番の曲のsrcへ差し替えてしまうと、
// ブラウザは進行中のunlock用play()を中断（AbortErrorで拒否）する。iOSの自動再生許可は
// 「ユーザー操作の中で呼ばれたplay()が、実際に再生を開始できた」という実績の有無に
// 左右されるとされているため、この中断によってunlockの実績が残らないまま本番のplay()を
// 呼んでしまうと、本番側がまだ許可されない状態のまま実行されてしまう可能性がある。
// これを避けるため、playSongIntro()・playSongFromRandomPosition()はsrcを差し替える
// 直前にこのPromiseを待ち、進行中のunlockを必ず先に完了させてから本番の再生へ進む
// （ensureUnlockSettled()参照）。
let pendingUnlockPromise = null;

// 【2026-09-09改訂・本人指示：音源再生失敗の本対策】unlockの実処理を、ページ初回操作時
// だけでなく、対戦開始操作（「準備完了」「対戦を開始する」等の明確なユーザージェスチャー）の
// たびにも再実行できるよう、独立した関数として切り出した（exportして他ファイルから
// 呼べるようにする）。iOSでは、タブを裏に回してから戻す・PWAをしばらく操作しない等の
// 状況で、一度成立したunlockが再びロックされることがあるとされているため、
// 「本番の再生が始まる直前の、確実なユーザー操作のタイミング」でもう一度実行しておくことで、
// 初回操作から時間が経った後の対戦開始でも成立しやすくする。何度呼んでも安全（無音データURIを
// 再生→即座に停止するだけで、実際のクイズ再生・IndexedDBには一切触れない）。
export function attemptSilentUnlock() {
  // 【2026-09-13追加・本人指示：一瞬バトルで実機再生失敗が再発（原因調査）】このunlockは
  // 「今audio要素が使われていない」ときだけ安全に行える。もし本物の曲がまさに再生中
  // （!paused）のタイミングでこれを呼ぶと、pause()→currentTime=0のせいで進行中の再生を
  // 巻き戻してしまう事故になりうるため、その場合は何もしない（再生中ということは
  // その時点でunlockが機能している証拠でもあり、わざわざ試す必要も無い）。
  if (!audioElement.paused) {
    diag("[UNLOCK] 既に再生中のため何もしない（既存のunlockに委ねる）");
    return;
  }

  // 【2026-09-20修正・再監査で発見】以前はここを「audioElement.srcが何か入っているか
  // （!!audioElement.src）」だけで判定していたが、これだと「本編の曲のURLがまだ
  // audioElement.srcに残っている状態（stopAudio()呼び出し後は解放済み＝再生不可能な
  // Object URLが文字列としては残る。または、ある問題のイントロが一時停止/自然終了した
  // 直後でsrcはまだ有効な本編の曲のまま）」でも「既にsrcがある」と誤判定し、
  // 無音データURIに差し替えないまま play() してしまっていた。これにより、
  // ①解放済みURLの場合はunlockのplay()自体が失敗し、無音unlockとして機能しない、
  // ②まだ有効な本編の曲が残っている場合は、無音のはずのunlockで本編の曲が一瞬鳴る、
  // または（successハンドラでcurrentTime=0にするため）一時停止中の本編の再生位置を
  // 勝手に先頭へ巻き戻してしまう、という2種類の実害があった。
  // 対策として、「既にこのunlock専用の無音URIそのものがセットされているか」だけを
  // hadSrcの条件にする（それ以外＝本編の曲のURLや解放済みURLが残っている場合は、
  // 必ず無音URIに差し替えてからplay()する）。
  const hadSrc = audioElement.src === SILENT_UNLOCK_DATA_URI;
  if (!hadSrc) audioElement.src = SILENT_UNLOCK_DATA_URI;

  diag("[UNLOCK] play()呼び出し", { hadSrc, visibilityState: document.visibilityState });
  const playResult = audioElement.play();
  if (playResult && typeof playResult.then === "function") {
    // 【2026-09-01追加】このPromiseの決着（成功・失敗どちらでも）をpendingUnlockPromiseに
    // 保持しておく。ensureUnlockSettled()がこれを待つことで、「unlockの後始末が終わって
    // からでないと本番のsrc差し替えを行わない」という順序を保証する。このPromise自体は
    // 常にresolveし、rejectしない（catchで吸収しているため）ようにして、
    // ensureUnlockSettled()側でtry/catchを書かずに安全にawaitできるようにしている。
    const settledPromise = playResult
      .then(() => {
        audioUnlockState = "succeeded";
        diag("[UNLOCK] play()成功");
        // 【2026-09-24追加・本人の実機診断ログを受けた対策】ensureUnlockSettled()に
        // 上限時間（UNLOCK_SETTLE_TIMEOUT_MS）を設けたことで、この決着処理が、
        // 「本番のsrcが既に差し替わって再生が始まった後」に遅れて実行される
        // 可能性が生まれた。その状態でpause()・src変更をしてしまうと、せっかく
        // 始まった本番再生を誤って止めてしまう。今のsrcが依然としてunlock専用の
        // 無音データURIのままである場合だけ後片付けする（既に本番の曲へ切り替わって
        // いる場合は一切何もしない）。
        if (audioElement.src === SILENT_UNLOCK_DATA_URI) {
          audioElement.pause();
          if (hadSrc) {
            audioElement.currentTime = 0;
          } else {
            audioElement.removeAttribute("src");
            audioElement.load();
          }
        }
      })
      .catch((error) => {
        // 無音データURIですら再生が許可されない環境でも、実際のクイズ再生自体は
        // 従来どおりPLAY_RETRY_WAIT_MS_LISTの再試行に委ねるため、ここでは何もしない
        // （このunlock自体はあくまで成功率を上げるための best-effort な対策）。
        audioUnlockState = "failed";
        diag("[UNLOCK] play()失敗", { name: error?.name, message: error?.message });
        console.warn("[audio] unlockに失敗しました（本番の音源再生には別途リトライがあります）", error?.name, error?.message);
        // 【2026-09-24追加】上と同じ理由で、既に本番の曲へsrcが切り替わっている場合は
        // 一切触らない。
        if (!hadSrc && audioElement.src === SILENT_UNLOCK_DATA_URI) {
          audioElement.removeAttribute("src");
          audioElement.load();
        }
      })
      .finally(() => {
        // 自分が発行した後、誰も新しいunlockを開始していなければ後片付けする
        // （常にnullへ戻すと、別の新しいunlockが既に走り出していた場合、その進行中の
        // Promiseへの参照を誤って消してしまうため、自分自身のものだったときだけ消す）。
        if (pendingUnlockPromise === settledPromise) {
          pendingUnlockPromise = null;
        }
      });
    pendingUnlockPromise = settledPromise;
  } else {
    // 非常に古いブラウザ等、play()がPromiseを返さない場合はPromiseベースでの待ち合わせが
    // そもそもできないため、pendingUnlockPromiseは触らない（ensureUnlockSettled()は
    // 何もせず素通りする＝これまでどおりの挙動になるだけで、悪化はしない）。
    diag("[UNLOCK] play()がPromiseを返さない環境のため待ち合わせ対象外");
  }
}

// 【2026-09-24新設・本人指示：本番再生を無期限にブロックしないためのfail-open設計】
// unlockのPromiseが決着するまでの上限時間。実機診断ログで、unlock用の無音データURIの
// 不備（下記SILENT_UNLOCK_DATA_URIのコメント参照）により、play()のPromiseが何秒経っても
// 決着せず、ensureUnlockSettled()が無期限に本番再生をブロックし続けてしまう事故が
// 実際に確認された。データURI自体の不備は直したが、それでも「unlockは本番再生の
// 成功率を上げるための補助処理であり、unlockの決着を無期限に待って本番再生自体を
// 止めてはならない」という保険として、上限時間を超えたら本番再生へ進むようにする
// （本人指示：unlock失敗/timeoutは本番audioを鳴らさない理由にしない）。
const UNLOCK_SETTLE_TIMEOUT_MS = 800;

// 【2026-09-24新設・再監査に伴うテスト追加】promiseが上限時間内に決着すれば"settled"、
// 決着しないまま時間切れになれば"timeout"を返す、単純なPromise/state制御のユーティリティ。
// 実際のiOS挙動やDOMに一切依存しない純粋なロジックのため、tests/audio.test.jsから
// 「絶対に解決しないPromiseを渡しても、短いタイムアウト経過後には必ず抜けられるか」を
// 直接検証できるよう、ensureUnlockSettled()から切り出してexportしてある。
export function raceUnlockPromiseWithTimeout(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    promise.then(() => finish("settled"));
    setTimeout(() => finish("timeout"), timeoutMs);
  });
}

// 【2026-09-01新設・本人指示：起動後1問目だけ無音になる問題の本対策】直前に走っている
// かもしれないattemptSilentUnlock()の後始末を待つ。pendingUnlockPromiseがnull
// （unlockが進行中でない）なら何もせず即座に返る。
// playSongIntro()・playSongFromRandomPosition()が、audio要素のsrcを本番の曲へ
// 差し替える直前に必ず呼ぶことで、「unlockのplay()がまだ未解決のうちにsrcを
// 差し替えてしまい、unlockが実績を残す前に中断されてしまう」というレースを防ぐ。
// 【2026-09-20追加・再監査に伴うテスト追加】もともとこのファイル内だけで使う想定の
// 非公開関数だったが、tests/audio.test.jsから「unlock進行中は正しく待つか」
// 「unlockが無ければ即座に返るか」「unlockが失敗しても先に進むか」を直接検証するために
// exportした。
// 【2026-09-24改訂・本人指示：本番再生を無期限にブロックしない】上限時間
// （UNLOCK_SETTLE_TIMEOUT_MS）を超えてもunlockが決着しない場合は、"timeout"として
// 諦めて本番再生へ進む（raceUnlockPromiseWithTimeout()参照）。決着そのものを
// キャンセルすることはできないため、pendingUnlockPromise自体はそのまま残り、
// 後から実際に決着したときの後片付けは、上のattemptSilentUnlock()側のガード
// （audioElement.srcが依然として無音データURIのままかの確認）に委ねる。
export async function ensureUnlockSettled() {
  if (!pendingUnlockPromise) return;
  diag("[UNLOCK] 本番再生: 進行中のunlock完了待ち開始");
  const result = await raceUnlockPromiseWithTimeout(pendingUnlockPromise, UNLOCK_SETTLE_TIMEOUT_MS);
  diag(`[UNLOCK] 本番再生: unlock完了待ち終了 (${result})`);
}

// 【2026-09-20新設・再監査に伴うテスト追加】pendingUnlockPromiseの有無・audioUnlockStateを
// 外部（テストコード）から読み取るためだけの、副作用の無い読み取り専用ヘルパー。
// 本番の呼び出し元（js/main.js等）はこれを使う必要が無い（getCurrentPlaybackState()と同様、
// 診断・テスト用の補助関数として追加するだけで、既存ロジックには一切影響しない）。
export function getAudioUnlockDiagnostics() {
  return {
    audioUnlockState,
    hasPendingUnlock: pendingUnlockPromise !== null,
  };
}

function unlockAudioElementOnFirstInteraction() {
  const unlock = () => {
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
    diag("初回ユーザー操作を検知（pointerdown/keydown）");
    attemptSilentUnlock();
  };
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}
unlockAudioElementOnFirstInteraction();

// 【2026-09-13新設・本人指示：一瞬バトルで実機再生失敗が再発（原因調査）】タブ・PWAを
// 裏に回してから戻ってきた瞬間にも、念のためunlockを試みる。iOSでは、バックグラウンドに
// なっている間・他アプリへ切り替えている間に、一度成立したunlockが再びロックされることが
// あるとされているが、この再ロックはユーザーが何か操作するまで検知しようがない。
// 「アプリの画面へ戻ってきた」という、対戦中でも自然に何度も起こるタイミングを使うことで、
// 次の問題の再生が始まる前に再ロックへ気付ける可能性を上げる（本人指示のとおり、対戦中に
// 明確な「操作」を挟まなくても回復のきっかけを増やすための保険。既存のロビーボタンでの
// unlockを置き換えるものではなく、追加の安全策）。
document.addEventListener("visibilitychange", () => {
  diag("visibilitychange", { visibilityState: document.visibilityState });
  if (document.visibilityState === "visible") {
    attemptSilentUnlock();
  }
});

// 今「現在の曲」として再生中・再生準備中のObject URL（Blobを再生できる形にしたもの）。
// 曲を切り替えるたびに、前のURLを解放してからでないとメモリに残り続けてしまうため、
// ここに保持しておいて次回の再生開始時に片付ける。
let currentObjectUrl = null;

// playSongIntro()・playSongFromRandomPosition()が呼ばれるたびに1つ増える「世代番号」。
// 【この番号が必要な理由】これらの関数はIndexedDBからの読み込み・再生開始が非同期のため、
// 「次の問題へ進む→また呼ばれる」が速いと、前の呼び出しの処理がまだ裏で残ったまま、
// 後から追いついてくることがある。追いついてきた古い処理が今の曲を勝手に上書き・エラー扱い
// にしてしまわないよう、各呼び出しは「自分が発行された時点の番号」を覚えておき、
// 実際にaudio要素を操作する直前に「今の最新番号と一致しているか」を確認する。
// 一致していなければ、自分はもう用済み（追い越された）と判断して何もしない。
//
// 【2026-08-08追記】ランダム再生モード（js/randomPlaybackEngine.js）追加にあたり、
// この世代番号・Object URL管理の仕組みは一切変更せず、そのまま共有している
// （別のaudio要素や独自の競合対策を新設しない、という本人の明確な要望どおり）。
let currentPlaybackToken = 0;

// 【2026-09-21新設・本人指示：Q1無音の再調査】このセッションで「本物の曲」が実際に
// playing状態へ入ったことを一度でも確認できたかどうか。診断ログのタグ分け
// （[FIRST_REAL_AUDIO] / [NORMAL_AUDIO]）に使う。「play()のPromiseが成功した」だけでは
// 「音が聞こえた」ことの証明にならない、という本人指示に基づき、実際にonplayingが発火し、
// かつ少し時間を置いてcurrentTimeが本当に進んでいることまで確認できて初めてtrueにする
// （verifyRealPlaybackStarted()参照）。unlock用の無音データURI再生はここには含めない
// （あくまで「本物の曲」が対象）。
let hasConfirmedFirstRealPlayback = false;

// 【2026-09-21新設・本人指示：Q1無音の再調査】onplayingが発火した直後の音源要素の状態を
// 詳しく記録し、さらに少し時間を置いてcurrentTimeが実際に進んでいるかまで確認する。
// 「play()のPromiseが成功した」「onplayingが発火した」だけで「音が聞こえた」と判断せず、
// 実際に再生位置が進んでいることまで見る（本人指示のとおり）。
// diagnosticContext: "intro, song=xxx" 等、呼び出し元のplaySongIntro()/
// playSongFromRandomPosition()が渡す識別用の文字列。
function verifyRealPlaybackStarted(myToken, diagnosticContext) {
  const tag = hasConfirmedFirstRealPlayback ? "NORMAL_AUDIO" : "FIRST_REAL_AUDIO";
  const currentTimeAtPlayingEvent = audioElement.currentTime;
  diag(`[${tag}] onplayingイベント発火 (${diagnosticContext})`, {
    readyState: audioElement.readyState,
    networkState: audioElement.networkState,
    currentTime: audioElement.currentTime,
    paused: audioElement.paused,
    muted: audioElement.muted,
    volume: audioElement.volume,
    duration: audioElement.duration,
    src: audioElement.currentSrc,
  });
  // onplayingの直後だけでは「再生位置が本当に進み続けているか」までは分からないため、
  // 少し時間を置いてから改めて確認する（この時点で既に次の曲に追い越されていたら、
  // 今の曲についての確認は意味が無いので何もしない）。
  setTimeout(() => {
    if (myToken !== currentPlaybackToken) return;
    const currentTimeNow = audioElement.currentTime;
    const actuallyAdvanced = !audioElement.paused && currentTimeNow > currentTimeAtPlayingEvent;
    diag(`[${tag}] 再生位置の進行確認 (${diagnosticContext})`, {
      currentTimeAtPlayingEvent,
      currentTimeNow,
      actuallyAdvanced,
      paused: audioElement.paused,
      readyState: audioElement.readyState,
    });
    if (actuallyAdvanced) {
      hasConfirmedFirstRealPlayback = true;
    } else {
      console.warn(
        `[audio] [${tag}] onplayingは発火したが、再生位置が進んでいない疑いがあります (${diagnosticContext})`,
        { currentTimeAtPlayingEvent, currentTimeNow, paused: audioElement.paused }
      );
    }
  }, 200);
}

// 今の再生トークンに対応する曲id（currentPlaybackTokenと必ずセットで更新する）。
// 【2026-09-16新設・本人指示：「音が出ない」救済ボタン共通基盤】呼び出し元（各画面）が
// 「今audio.jsが再生している／しようとしているのはどの曲か」を、自分で別に持ち回らずとも
// 取得できるようにするために追加した（下のgetCurrentPlaybackState()参照）。
let currentPlaybackSongId = null;

function releaseCurrentObjectUrl() {
  if (currentObjectUrl !== null) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

// 世代番号を発行し、音源データを取得する。取得完了時点で既に追い越されていたら
// stale:trueを返す（呼び出し側は何もせず終わってよい）。
// playSongIntro()・playSongFromRandomPosition()の共通の前半処理。
async function acquireBlobForNewPlayback(song) {
  const myToken = ++currentPlaybackToken;
  currentPlaybackSongId = song.id;
  diag(`IndexedDB取得開始 song=${song.id} token=${myToken}`);
  const blob = await getAudioBlob(song.id);
  diag(`IndexedDB取得完了 song=${song.id} token=${myToken}`, { hasBlob: !!blob, stale: myToken !== currentPlaybackToken });
  if (myToken !== currentPlaybackToken) {
    return { myToken, blob: null, stale: true };
  }
  return { myToken, blob, stale: false };
}

// 取得したblobを「現在再生中」として確定させる。それまでの再生中URLを解放し、
// 自分のURLを新しい「現在再生中」として登録してから、再生用のURLを返す。
// playSongIntro()・playSongFromRandomPosition()の共通処理。
function claimAsCurrentPlayback(blob) {
  // クイズの音声を鳴らす直前に、試聴・連続再生など他の音声を止める
  // （playbackCoordinator.js参照、2026-08-04追加）。
  notifyPlaybackStarting("quiz");
  releaseCurrentObjectUrl();
  const myObjectUrl = URL.createObjectURL(blob);
  currentObjectUrl = myObjectUrl;
  return myObjectUrl;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 【2026-09-03新設・本人指摘：オンライン対戦で実機の約5回に1回、1問目でplay()自体が
// 失敗する（「音源を再生できませんでした」）ことが報告された。音源データ自体は
// 取得できていた（getAudioBlob()側の再試行強化だけでは直らなかった）ため、原因は
// IndexedDBの取得タイミングとは別に、play()呼び出し自体が一時的に失敗する
// （iOS Safariの自動再生ポリシー関連の一時的な拒否等が疑われるが、コードレビューだけでは
// 断定できない）ケースがあると判断した。srcを変えずにplay()だけを間隔を空けて
// 数回まで再試行することで、こうした一時的な失敗から自動的に回復できるようにする。
const PLAY_RETRY_WAIT_MS_LIST = [300, 600];

// audioElement.play()を試み、成功/失敗のどちらでも「追い越された場合の後始末」まで行う。
// 戻り値：trueなら再生が実際に始まった（かつ自分がまだ最新）、falseなら失敗または追い越された。
// playSongIntro()・playSongFromRandomPosition()の共通の後半処理。
// 【2026-09-08改訂・本人指示：音源再生失敗の根本原因調査】diagnosticContext（曲id・
// 再生方式等の文字列）を受け取り、失敗時にerror.name/messageと一緒にconsole.warnへ残す
// ようにした。本番でも出す（ユーザー向けの表示文言onErrorは一切変えない、あくまで
// 実機のブラウザコンソールから原因を切り分けるための追加ログ）。
async function attemptPlay(myToken, myObjectUrl, onError, diagnosticContext) {
  // 【2026-09-21新設・本人指示：Q1無音の再調査】このplay()呼び出しが、このセッションで
  // まだ一度も確認できていない「本物の初回再生」なのか、既に確認済みの通常再生なのかを
  // タグとして残す（本人指示のログ識別要件）。呼び出し開始時点の値を固定して使う
  // （途中でhasConfirmedFirstRealPlaybackが変わっても、この1回の呼び出し内では
  // 一貫したタグにするため）。
  const playbackTag = hasConfirmedFirstRealPlayback ? "NORMAL_AUDIO" : "FIRST_REAL_AUDIO";
  let lastError = null;
  for (let attempt = 0; attempt <= PLAY_RETRY_WAIT_MS_LIST.length; attempt++) {
    if (attempt > 0) {
      await sleep(PLAY_RETRY_WAIT_MS_LIST[attempt - 1]);
      // 再試行までの待ち時間の間に、追い越されている／再生が別の理由で既に始まっている
      // 可能性があるため、その場合は再試行そのものを行わない。
      if (myToken !== currentPlaybackToken) return false;
      if (!audioElement.paused) return true;
    }
    diag(`[${playbackTag}] play()呼び出し (${diagnosticContext}) attempt=${attempt}`, {
      readyState: audioElement.readyState,
      networkState: audioElement.networkState,
      src: audioElement.src,
    });
    try {
      await audioElement.play();
      lastError = null;
      // 【本人指示：play()のPromiseが成功しただけでは「音が聞こえた」ことにならない】
      // ここではあくまで「ブラウザがplay()呼び出し自体は拒否しなかった」ことしか
      // 分かっていない。実際に音が鳴り始めたかどうかは、この後発火する（はずの）
      // onplayingイベント側のverifyRealPlaybackStarted()が、readyState・currentTimeの
      // 実際の進行まで確認して初めて判断する。
      diag(`[${playbackTag}] play()のPromiseは成功（※音が鳴ったことの確認ではない） (${diagnosticContext}) attempt=${attempt}`, {
        readyState: audioElement.readyState,
        paused: audioElement.paused,
        muted: audioElement.muted,
        volume: audioElement.volume,
      });
      break;
    } catch (error) {
      lastError = error;
      diag(`[${playbackTag}] play()失敗 (${diagnosticContext}) attempt=${attempt}`, { name: error?.name, message: error?.message });
    }
  }

  if (lastError) {
    // 再生開始前後にsrcが差し替えられた場合、ブラウザはこのplay()を失敗させる
    // （AbortError等）。それが「追い越されたことによる失敗」なら、エラー表示は不要。
    if (myToken !== currentPlaybackToken) return false;
    console.warn(
      `[audio] play()失敗 (${diagnosticContext}) unlock=${audioUnlockState}`,
      lastError?.name,
      lastError?.message
    );
    onError("音源を再生できませんでした");
    return false;
  }

  // 通常はsrcの差し替えでplay()自体が上のcatchに落ちるが、タイミング次第では
  // 追い越された後でもplay()が成功扱いになることがあるため、念のためここでも確認する。
  // 【URLの後片付けについて】自分（古い呼び出し）が最新だった間は必ずcurrentObjectUrlに
  // 自分のURLを登録しているため、既に追い越されているこの時点では、自分を追い越した
  // 呼び出し側のreleaseCurrentObjectUrl()が自分のURLを片付け終えている（「現在再生中の
  // URLはstopAudio()または次の有効な再生処理だけが破棄する」という役割分担のとおり）。
  // そのため、ここで自分から改めてrevokeする必要はない。
  if (myToken !== currentPlaybackToken) {
    // audio要素が既に自分以外の（もっと新しい）曲のURLに切り替わっている場合、
    // ここでpause()すると新しい曲の再生を誤って止めてしまうため、
    // 「今のsrcがまだ自分のURLのままか」を確認してからにする。
    if (audioElement.src === myObjectUrl) {
      audioElement.pause();
    }
    return false;
  }
  return true;
}

// 曲のイントロを再生する。再生できなかった場合や、音源が未読み込みの場合は onError を呼ぶ。
// onPlaybackStart : 曲が実際に鳴り始めた瞬間（playingイベント）に呼ばれる。
//                    結果画面の回答時間表示など、正確な計測に使う。
//
// song.introLeadInSec が設定されている曲は、その秒数の位置まで頭出ししてから再生する
// （曲の頭に無音区間があるケースで、その無音を聞かせないようにするため）。
// 曲の長さなどのメタデータが読み込まれるまでは0秒以外へのシークが正しく効かないことがあるため、
// loadedmetadataイベントを待ってから頭出しする。
//
// この関数はasyncだが、呼び出し側（main.js）はawaitせずに呼びっぱなしにしている。
// markPlaybackStarted()・startTimer()は元々この関数の完了を待たずに動く設計のため、
// 呼び出し側を変更する必要はない。
export async function playSongIntro(song, onError, onPlaybackStart) {
  const { myToken, blob, stale } = await acquireBlobForNewPlayback(song);
  if (stale) return;

  if (!blob) {
    onError("この曲の音源が読み込まれていません。スタート画面の「音源を読み込む」から追加してください");
    return;
  }

  // 【2026-09-01追加・本人指示：起動後1問目だけ無音になる問題の本対策】このsrc差し替えで
  // 進行中のunlock用play()を巻き込んで中断させてしまわないよう、srcを触る前に
  // 進行中のunlockの後始末を待つ（ensureUnlockSettled()参照。unlockが動いていなければ
  // 即座に返るので、通常時の体感速度への影響は無い）。
  await ensureUnlockSettled();
  if (myToken !== currentPlaybackToken) return;

  const myObjectUrl = claimAsCurrentPlayback(blob);

  audioElement.onerror = () => {
    // 自分より新しい呼び出しに既に追い越されている場合、このエラーはもう
    // 今の問題とは関係ない曲のものなので、画面には出さず無視する。
    if (myToken !== currentPlaybackToken) return;
    console.warn(`[audio] onerror (intro, song=${song.id}) unlock=${audioUnlockState}`, audioElement.error?.code, audioElement.error?.message);
    onError("音源を再生できませんでした");
  };
  audioElement.onplaying = () => {
    if (myToken !== currentPlaybackToken) return;
    verifyRealPlaybackStarted(myToken, `intro, song=${song.id}`);
    onPlaybackStart();
  };
  audioElement.onloadedmetadata = () => {
    if (myToken !== currentPlaybackToken) return;
    audioElement.currentTime = song.introLeadInSec || 0;
  };
  const playbackTag = hasConfirmedFirstRealPlayback ? "NORMAL_AUDIO" : "FIRST_REAL_AUDIO";
  diag(`[${playbackTag}] src設定 (intro, song=${song.id})`, { unlock: audioUnlockState });
  audioElement.src = myObjectUrl;

  await attemptPlay(myToken, myObjectUrl, onError, `intro, song=${song.id}`);
}

// 【2026-08-08新設・ランダム再生モード用】曲の任意の位置から再生し、指定秒数後に
// 自動的に一時停止する。playSongIntro()と全く同じ世代番号・Object URL管理を共有する
// （別のaudio要素や独自の競合対策を新設しない）。
//
// computeStartTimeSec(durationSec) : 曲の長さ（秒、audioElement.durationから取得）を受け取り、
//   実際に再生を始める位置（秒）を返す関数。呼び出し側（js/randomPlaybackEngine.js）が
//   seed・songId・questionIndex等から純粋関数として計算したものを渡す想定で、
//   このファイル自身は「どこから再生するか」の計算には一切関与しない
//   （エンジン部分〈このファイル〉とルール・計算部分〈呼び出し側〉の責務を分離するため）。
// playDurationSec : この秒数だけ再生したら自動的に一時停止する。
// onPlaybackStart : 実際に鳴り始めた瞬間に呼ばれる（playSongIntro()と同じ役割）。
// onAutoStop      : 指定秒数が経過し、自動的に一時停止した瞬間に呼ばれる（新規）。
//                    曲が短くて再生秒数に達する前に自然終了した場合は呼ばれない
//                    （その場合はonerror/onplaying以外のイベントが発生しないため、
//                    呼び出し側でタイムアウト等の別の後始末をする必要はない。
//                    自然終了時に鳴りっぱなしになることもない＝audio要素自体が止まるため）。
export async function playSongFromRandomPosition(song, computeStartTimeSec, playDurationSec, onError, onPlaybackStart, onAutoStop) {
  const { myToken, blob, stale } = await acquireBlobForNewPlayback(song);
  if (stale) return;

  if (!blob) {
    onError("この曲の音源が読み込まれていません。スタート画面の「音源を読み込む」から追加してください");
    return;
  }

  // 【2026-09-01追加・本人指示：起動後1問目だけ無音になる問題の本対策】playSongIntro()と
  // 同じ理由（ensureUnlockSettled()のコメント参照）。
  await ensureUnlockSettled();
  if (myToken !== currentPlaybackToken) return;

  const myObjectUrl = claimAsCurrentPlayback(blob);
  let autoStopTimeoutId = null;

  audioElement.onerror = () => {
    if (myToken !== currentPlaybackToken) return;
    console.warn(`[audio] onerror (randomPosition, song=${song.id}) unlock=${audioUnlockState}`, audioElement.error?.code, audioElement.error?.message);
    onError("音源を再生できませんでした");
  };
  audioElement.onplaying = () => {
    if (myToken !== currentPlaybackToken) return;
    verifyRealPlaybackStarted(myToken, `randomPosition, song=${song.id}`);
    onPlaybackStart();
    // 指定秒数だけ鳴らしたら自動的に一時停止する。
    // タイマー発火時に既に追い越されていた場合は何もしない（stopAudio()や次の
    // playSongIntro()/playSongFromRandomPosition()が世代番号を進めているはずなので、
    // ここで誤って別の曲を止めてしまうことはない）。
    if (autoStopTimeoutId !== null) {
      clearTimeout(autoStopTimeoutId);
    }
    autoStopTimeoutId = setTimeout(() => {
      if (myToken !== currentPlaybackToken) return;
      audioElement.pause();
      onAutoStop();
    }, playDurationSec * 1000);
  };
  audioElement.onloadedmetadata = () => {
    if (myToken !== currentPlaybackToken) return;
    audioElement.currentTime = computeStartTimeSec(audioElement.duration);
  };
  const randomPositionPlaybackTag = hasConfirmedFirstRealPlayback ? "NORMAL_AUDIO" : "FIRST_REAL_AUDIO";
  diag(`[${randomPositionPlaybackTag}] src設定 (randomPosition, song=${song.id})`, { unlock: audioUnlockState });
  audioElement.src = myObjectUrl;

  await attemptPlay(myToken, myObjectUrl, onError, `randomPosition, song=${song.id}`);
}

// 【2026-09-22新設・本人指示：全モード共通「新規プレイのQ1だけ無音」の再調査】呼び出し元の
// 関数名を、new Error().stack から機械的に抜き出す（呼び出し側に一切手を加える必要がない
// よう、stopAudio()の内側だけで完結させる）。スタックの1行目は必ずこの関数自身
// （getStopAudioCallerLabel）、2行目がstopAudio()自身、3行目が「stopAudio()を呼んだ関数」
// になる想定。ブラウザ間でのスタック文字列の書式差を吸収しきれない場合は、
// そのまま生の1行を返す（診断用途のため、多少読みにくくても実害は無い）。
function getStopAudioCallerLabel() {
  try {
    const stackLines = new Error().stack?.split("\n") ?? [];
    // 先頭の"Error"という文字列の行を除き、自分自身(getStopAudioCallerLabel)・
    // 呼び出し元のstopAudio()自身の行を飛ばして、その次の行（＝本当の呼び出し元）を使う。
    const callerLine = stackLines.find(
      (line, index) => index >= 1 && !line.includes("getStopAudioCallerLabel") && !line.includes("stopAudio")
    );
    return callerLine ? callerLine.trim() : "(呼び出し元不明)";
  } catch {
    return "(スタック取得不可)";
  }
}

// 再生を止める（画面遷移時などに呼ぶ）。
export function stopAudio() {
  // 【2026-09-22新設・本人指示：全モード共通「新規プレイのQ1だけ無音」の再調査】どの関数から
  // stopAudio()が呼ばれたかを診断ログに残す。「Q1の再生開始直後に、想定外の場所から
  // stopAudio()が遅れて呼ばれて再生を打ち切っていないか」を実機ログから追えるようにする。
  diag("[STOP_AUDIO] 呼び出し", { caller: getStopAudioCallerLabel(), tokenBefore: currentPlaybackToken });
  // 世代番号を進めることで、この時点で裏に残っている古いplaySongIntro()/
  // playSongFromRandomPosition()の処理（自動停止タイマーを含む）をすべて「無効」にする
  // （stopAudio()の後に遅れて鳴り出す事故を防ぐ）。
  currentPlaybackToken++;
  currentPlaybackSongId = null;
  troubleReportedToken = null;
  audioElement.pause();
  audioElement.currentTime = 0;
  releaseCurrentObjectUrl();
}

registerPlaybackStopper("quiz", stopAudio);

// ===== 【2026-09-16新設・本人指示：「音が出ない」救済ボタン共通基盤】=====
// ユーザーが「音が出ない」ボタンを押して自己申告したことを扱うための、汎用的な仕組み。
// オフライン各モード（js/main.js・js/timeAttackScreen.js等）専用の作りにはせず、第2段階
// （オンライン対戦）でもそのまま再利用できるよう、このファイルの既存ロジック（世代番号・
// Object URL管理・unlock）には一切手を加えず、それとは独立した薄い層として追加する。
//
// 【できること／できないこと】ここで行うのはあくまで「ユーザーの自己申告を受け取り、
// 呼び出し元（各画面）が『再生し直す』『別の曲に差し替える』等の判断をしやすいよう、
// 今の再生状態を返す」ことだけ。実際の音声検出（マイクで実際に鳴っているかを調べる等）は
// 一切行わない。

// 「音が出ない」の申告があった再生トークン。申告が無ければnull。
// 新しい再生（playSongIntro()・playSongFromRandomPosition()の呼び出し）やstopAudio()で
// currentPlaybackTokenが進むたびに自動的に無効化されるため（下のgetCurrentPlaybackState()の
// hasTroubleReportは常に「今のトークンと一致するか」で判定する）、古い申告が別の曲へ
// 誤って引き継がれることはない。
let troubleReportedToken = null;

// 呼び出し元（各画面）が、「今audio.jsが再生している（しようとしている）のは何か」を
// 取得するための関数。トラブル報告の要否判断・差し替え後の整合性チェック等に使う想定。
export function getCurrentPlaybackState() {
  return {
    token: currentPlaybackToken,
    songId: currentPlaybackSongId,
    hasTroubleReport: troubleReportedToken !== null && troubleReportedToken === currentPlaybackToken,
  };
}

// 「今再生中（または再生しようとした）曲について、音が出ないという申告があった」ことを
// 記録する。戻り値は記録した瞬間の再生状態（getCurrentPlaybackState()と同じ形）で、
// 呼び出し元はtoken・songIdを見て「まだこの申告が今表示している問題に対して有効か」
// （画面側で保持しているcurrentIndex等の曲と食い違っていないか）を確認してから、
// 「再生し直す」「差し替える」等の対応を行う想定。
export function reportPlaybackTrouble() {
  troubleReportedToken = currentPlaybackToken;
  diag("音が出ない申告を受け取りました", { token: currentPlaybackToken, songId: currentPlaybackSongId });
  return getCurrentPlaybackState();
}

// 申告への対応を終えた（再生し直した、差し替えた、ランを中断した等）タイミングで呼び、
// 記録を明示的に消す。新しい再生を始めるだけでもトークンが進んで申告は自動的に無効化されるため
// 必須ではないが、呼び出し元が「対応済み」の状態をはっきりさせたい場合のために用意する。
export function clearPlaybackTroubleReport() {
  troubleReportedToken = null;
}
