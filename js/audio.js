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

// 【2026-11-XX新設・本人指示：一瞬バトル「もう一度聞く」不具合の根本修正】audio要素の
// 今のsrcが、unlock専用の無音データURIそのものかどうかを判定する。attemptSilentUnlock()の
// ハンドラクリア対策の後も、本編側のonloadedmetadata等が万一この無音URIに対して発火して
// しまわないかを二重に確認するための共通ヘルパー。
function isAudioElementOnSilentUnlockUri() {
  return audioElement.src === SILENT_UNLOCK_DATA_URI;
}

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
  if (!hadSrc) {
    // 【2026-11-XX新設・本人指示：一瞬バトル「もう一度聞く」でunlock用無音音源が実問題曲の
    // durationとして誤判定される不具合の根本修正】playSongIntro()/playSongFromRandomPosition()は
    // audioElement.onloadedmetadata/onplaying/onerrorを「.onX = ...」形式（1枠だけ）で
    // 設定しており、この無音URIへのsrc差し替えはcurrentPlaybackTokenを進めないため、
    // 直前の本編再生が設定したハンドラがそのまま生き残ってしまう。その状態でこの無音URIの
    // 読み込みが完了しloadedmetadataが発火すると、本編側のハンドラがaudioElement.duration
    // （無音URIの実際の長さ＝約0.05秒）を「今回の問題曲の長さ」として誤って受け取ってしまい、
    // 「音源が他の端末と異なる」という誤判定・試合無効化を引き起こしていた（実機診断ログで
    // 確認済み、docs/HANDOFF.md参照）。本編側は次に再生するたびに必ず自分専用のハンドラを
    // 新しく設定し直す設計のため、ここで先に消してしまっても本編側の動作には一切影響しない。
    audioElement.onloadedmetadata = null;
    audioElement.onplaying = null;
    audioElement.onerror = null;
    audioElement.src = SILENT_UNLOCK_DATA_URI;
    cumulativeSrcAssignmentCount++;
  }

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
            cumulativeLoadCallCount++;
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
          cumulativeLoadCallCount++;
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

// 【2026-11-XX新設・本人指示：一瞬バトル／一瞬協力「音源は無効です」頻発の再調査】
// 既存のunlock再試行は「初回操作時」「タブが裏→表に戻った瞬間」「本番再生の直前
// （ensureUnlockSettled経由）」の3つのタイミングでしか動かない。一方、iOSでは
// 「タブは表示されたまま・特に何も操作しない無操作区間が続く」だけでも自動再生の
// 許可が再ロックされることがあるとされ、これは上記どのタイミングにも当てはまらない
// （js/onlineInstantBattleScreen.jsのhandlePlaybackFailure()付近のコメント参照）。
// 一瞬系は1問あたりの再生がわずか0.5〜1.5秒しかなく、「全員の回答を待つ」間の
// 無操作区間が特に長くなりやすいモードのため、この再ロックの影響を最も受けやすいと
// 考えられる。対策として、対戦中は一定間隔でattemptSilentUnlock()を呼び続ける
// 「心拍」を追加し、再ロックが起きる前に先回りして解消しておく（反応的な対策だけでなく、
// 予防的な対策を足す）。attemptSilentUnlock()自体は「本物の曲が再生中でなければ何もしても
// 安全」という既存の設計（上のコメント参照）のため、この心拍が実際の再生を妨げることはない。
// 呼び出し元（各オンライン対戦の画面コントローラ）が、対戦の開始・終了に合わせて
// start/stopを呼ぶ（既存のstartTickTimer()/stopTickTimer()と同じ、setInterval1つだけの
// 単純なライフサイクル管理）。
const AUDIO_UNLOCK_HEARTBEAT_INTERVAL_MS = 10000;
let audioUnlockHeartbeatTimerId = null;

export function startAudioUnlockHeartbeat() {
  stopAudioUnlockHeartbeat();
  audioUnlockHeartbeatTimerId = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    diag("[UNLOCK] 心拍（対戦中の予防的unlock再試行）");
    attemptSilentUnlock();
  }, AUDIO_UNLOCK_HEARTBEAT_INTERVAL_MS);
}

export function stopAudioUnlockHeartbeat() {
  if (audioUnlockHeartbeatTimerId !== null) {
    clearInterval(audioUnlockHeartbeatTimerId);
    audioUnlockHeartbeatTimerId = null;
  }
}

// 【2026-11-XX新設・再監査に伴うテスト追加】実際に10秒待たなくても、start/stopの
// ライフサイクル（二重起動でタイマーが増えない・stopで確実に止まる）をテストコードから
// 検証できるようにするための、副作用の無い読み取り専用ヘルパー（getAudioUnlockDiagnostics()
// と同じ位置づけ）。
export function hasActiveAudioUnlockHeartbeat() {
  return audioUnlockHeartbeatTimerId !== null;
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

// 【2026-09-05新設・本人指示：オフラインの簡易効果音設定パネル】パネルを開いている間、
// 問題の楽曲を「止める」（stopAudio()、位置が0へ戻る）のではなく「一時停止する」
// （位置を保持したまま止め、閉じたら同じ位置から再開する）ための状態。
// pausedByExternalUiは、pauseAudioForExternalUi()自身が止めた場合だけtrueにする
// （既にstopAudio()等で止まっている音を誤って再開しないための、呼び出し元非依存の安全策）。
let pausedByExternalUi = false;
// playSongFromRandomPosition()（ランダム再生・アウトロクイズ共通）が持つ「指定秒数だけ
// 鳴らしたら自動的に一時停止する」タイマーは、以前は同関数のローカル変数だったため
// 外部から一時停止・再開できなかった。一時停止中に経過した時間ぶんタイマーが進んで
// しまわないよう、モジュールスコープへ持ち上げ、残り時間を計算し直せるようにする。
let autoStopState = null; // { timeoutId, remainingMs, scheduledAtMs, callback } | null

function scheduleAutoStop(remainingMs, callback) {
  if (autoStopState?.timeoutId !== null && autoStopState?.timeoutId !== undefined) {
    clearTimeout(autoStopState.timeoutId);
  }
  autoStopState = { timeoutId: null, remainingMs, scheduledAtMs: Date.now(), callback };
  autoStopState.timeoutId = setTimeout(() => {
    autoStopState = null;
    callback();
  }, remainingMs);
}

function clearAutoStopTimerForPause() {
  if (!autoStopState || autoStopState.timeoutId === null) return;
  clearTimeout(autoStopState.timeoutId);
  const elapsedMs = Date.now() - autoStopState.scheduledAtMs;
  autoStopState = {
    ...autoStopState,
    timeoutId: null,
    remainingMs: Math.max(0, autoStopState.remainingMs - elapsedMs),
  };
}

function resumeAutoStopTimerAfterPause() {
  if (!autoStopState || autoStopState.timeoutId !== null) return;
  scheduleAutoStop(autoStopState.remainingMs, autoStopState.callback);
}

// 問題の楽曲を、今の再生位置を保ったまま一時停止する（stopAudio()と違い、位置は0へ
// 戻さない）。既に止まっている（もともと鳴っていない）場合は何もしない。
export function pauseAudioForExternalUi() {
  if (audioElement.paused) return;
  audioElement.pause();
  pausedByExternalUi = true;
  clearAutoStopTimerForPause();
}

// pauseAudioForExternalUi()で止めた楽曲を、止めた位置からそのまま再開する。
// 自分（pauseAudioForExternalUi）が止めたのでなければ何もしない
// （stopAudio()等で既に止まっている音を誤って再生し始めることを防ぐ）。
export function resumeAudioForExternalUi() {
  if (!pausedByExternalUi) return;
  pausedByExternalUi = false;
  audioElement.play().catch(() => {});
  resumeAutoStopTimerAfterPause();
}

// 【2026-11-XX新設・本人指示：Bug A（オンライン対戦の音源トラブル）継続調査】
// audioElement.errorのリセット自体は正しく機能したにもかかわらず実機で失敗が再発したため
// （docs/HANDOFF.md 83章参照）、「audio要素側の一時的な状態」だけでなく「同じページを
// 開いたまま累積してきた使用量」に何か関係があるのではという新しい仮説を検証するための、
// 軽量な累計カウンタ群。ここではカウントを増やすだけで、既存の再生ロジック・制御フローには
// 一切影響しない（read-onlyな観測用の副作用のみ）。ページを離れるまでリセットされない
// （セッション全体の累積値であることが今回の仮説検証に必要なため、意図的にリセットしない）。
let cumulativeObjectUrlCreatedCount = 0;
let cumulativeObjectUrlRevokedCount = 0;
let cumulativeStopAudioCallCount = 0;
let cumulativeSrcAssignmentCount = 0;
let cumulativeLoadCallCount = 0;
let cumulativePlayCallCount = 0;
let cumulativePlaySuccessCount = 0;
let cumulativePlayFailureCount = 0;
let cumulativeNotSupportedErrorCount = 0;

// 診断ログへ埋め込む用の、上記カウンタ群のスナップショット。aliveObjectUrlCountは
// 「作った数−解放した数」で、その時点で生きているはずのObject URL数の目安になる
// （0付近であるべきで、増え続けているならリーク疑いの手がかりになる）。
function getAudioLifecycleDiagnosticsSnapshot() {
  return {
    cumulativeObjectUrlCreatedCount,
    cumulativeObjectUrlRevokedCount,
    aliveObjectUrlCount: cumulativeObjectUrlCreatedCount - cumulativeObjectUrlRevokedCount,
    cumulativeStopAudioCallCount,
    cumulativeSrcAssignmentCount,
    cumulativeLoadCallCount,
    cumulativePlayCallCount,
    cumulativePlaySuccessCount,
    cumulativePlayFailureCount,
    cumulativeNotSupportedErrorCount,
  };
}

// 【2026-11-XX新設・再監査に伴うテスト追加】外部（テストコード・将来のデバッグ画面）から
// 読み取れるようにexportする、副作用の無い読み取り専用ヘルパー
// （getAudioUnlockDiagnostics()と同じ位置づけ）。
export function getAudioLifecycleDiagnostics() {
  return getAudioLifecycleDiagnosticsSnapshot();
}

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

// 【2026-11-XX修正・実機バグ調査：再戦/一瞬系 仕様総監査で発見】stopAudio()は、
// audio要素自身のイベントハンドラ（onloadedmetadataでのduration不一致判定など）から
// 同期的に呼ばれることがある。その瞬間、currentObjectUrlはaudioElement.srcへ設定済みの
// 「今まさに読み込み中／発火中のイベントの対象そのもの」であり、これを同期的にrevokeすると、
// 上のreleasePreviousObjectUrlAfterSrcSwap()のコメントで説明している「現役srcのblob URLを
// revokeするとiOS Safari等でaudio要素が予期せぬエラー状態に遷移する」という同じ不具合を、
// 「前の曲」ではなく「今まさに判定中の曲自身」に対して引き起こしてしまう
// （本当は正常な音源なのに、この自己流revokeの副作用で以後のリトライまで失敗しやすくなり、
// 「音源は無効です」の頻発につながっていた）。呼び出し元を個別に作り分けるのではなく、
// releaseCurrentObjectUrl()自体を「呼び出し元のイベントハンドラが完全に終わってから」
// 実際に解放する設計へ統一する（currentObjectUrlの論理状態＝nullは即座に反映するため、
// 直後にclaimAsCurrentPlayback()が呼ばれても前の曲の扱いを誤らない）。
function releaseCurrentObjectUrl() {
  if (currentObjectUrl !== null) {
    const urlToRevoke = currentObjectUrl;
    diag("[OBJECT_URL] revoke予約（stopAudio等、再生を完全に止める経路）", {
      url: urlToRevoke,
      matchesCurrentSrc: audioElement.src === urlToRevoke,
    });
    currentObjectUrl = null;
    setTimeout(() => {
      URL.revokeObjectURL(urlToRevoke);
      cumulativeObjectUrlRevokedCount++;
    }, 0);
  }
}

// 【2026-09-30新設・本人指示：一瞬バトル/一瞬協力の音源誤判定・第2/3問での再調査】
// 前の曲のObject URLを、claimAsCurrentPlayback()の時点ではまだ解放しない。
// 【発見した不具合】以前はclaimAsCurrentPlayback()の中で即座にreleaseCurrentObjectUrl()を
// 呼んでいたが、その時点ではaudioElement.srcへの新しいURLの代入（呼び出し元が数行後に行う）
// がまだ済んでおらず、audioElement.srcは「今まさにrevokeしようとしている前のURL」のままだった。
// 1問目だけcurrentObjectUrlがnullでこの処理がスキップされ無事故になる一方、2問目以降は
// 毎回「現役でsrcに設定されたままのURLをrevokeする」瞬間が発生していた。iOS Safari等では
// 現役srcのblob URLをrevokeすると、audio要素が予期せぬエラー状態に遷移することがあるため
// （2026-09-30調査エージェントによる実機報告との整合性確認、docs/HANDOFF.md参照）、
// 前のURLの解放は、呼び出し元が新しいURLへのsrc切り替えを終えたあと
// （releasePreviousObjectUrlAfterSrcSwap()）まで遅らせる。
let pendingPreviousObjectUrl = null;

// 世代番号を発行し、音源データを取得する。取得完了時点で既に追い越されていたら
// stale:trueを返す（呼び出し側は何もせず終わってよい）。
// playSongIntro()・playSongFromRandomPosition()の共通の前半処理。
async function acquireBlobForNewPlayback(song) {
  const myToken = ++currentPlaybackToken;
  currentPlaybackSongId = song.id;
  diag(`IndexedDB取得開始 song=${song.id} token=${myToken}`);
  const blob = await getAudioBlob(song.id);
  diag(`IndexedDB取得完了 song=${song.id} token=${myToken}`, {
    hasBlob: !!blob,
    stale: myToken !== currentPlaybackToken,
    blobSize: blob?.size ?? null,
    // 【2026-09-05追加】blobTypeは常にaudioStorage.js側で正規化済みの値（audio/mpeg）に
    // なる（js/audioStorage.jsのtoPlayableAudioBlob()参照）。originalBlobTypeBeforeNormalize
    // には正規化前の元の値（大抵は空文字）を残し、「この曲は元々どんな状態だったか」を
    // 実機ログから後で区別できるようにする（ID3タグ無し音源のNotSupportedError調査用）。
    blobType: blob?.type ?? null,
    originalBlobTypeBeforeNormalize: blob?.originalTypeBeforeNormalization ?? null,
  });
  if (myToken !== currentPlaybackToken) {
    return { myToken, blob: null, stale: true };
  }
  return { myToken, blob, stale: false };
}

// 【2026-11-XX新設・実機バグ調査：オンライン対戦「イントロ対戦」開始直後の音源トラブル】
// 本人の実機ログ解析で判明した仮説：audio要素が一度NotSupportedError等でエラー状態に
// なった後、srcの再代入だけでは要素の内部状態（audioElement.error）が完全にはリセット
// されない場合がある（一部ブラウザ実装で知られる挙動）。実機ログでは、3回連続して
// 「新しいIndexedDB取得・新しいBlob・新しいObject URL」を使ったにも関わらず、
// 待機時間の長さに関係なく毎回同じNotSupportedErrorが即座に発生していた
// （js/audioDiagnosticLog.js経由の実機ログで確認、docs/HANDOFF.md 81章参照）。
// 「新しいデータなのに毎回同じ失敗をする」という現象は、Blob側ではなくaudio要素側に
// 持続的な原因があることを示唆するため、新しいsrcを設定する直前に、audio要素が
// エラー状態（.error !== null）であれば、既存のattemptSilentUnlock()の後始末
// （removeAttribute("src") → load()）と全く同じ手順で明示的にリセットする。
// 【まだ「確定した根本原因」ではない点に注意】この対策を入れても、実機で今回と同じ
// NotSupportedErrorが再発する場合、それは"audio要素のエラー残留"以外の原因である
// ことの強い証拠になる（下のdiag()ログで、リセット前のaudioElement.errorの中身を
// 必ず記録しておくことで、次回の実機ログから両方の可能性を判別できるようにしている）。
function resetAudioElementIfInErrorState(diagnosticContext) {
  const existingError = audioElement.error;
  if (existingError === null || existingError === undefined) return;
  diag(`[ERROR_RESET] audio要素がエラー状態のまま新しい再生を開始しようとしている (${diagnosticContext})`, {
    errorCode: existingError.code,
    errorMessage: existingError.message,
    currentSrcBeforeReset: audioElement.currentSrc,
    readyStateBeforeReset: audioElement.readyState,
    networkStateBeforeReset: audioElement.networkState,
  });
  audioElement.removeAttribute("src");
  audioElement.load();
  cumulativeLoadCallCount++;
  diag(`[ERROR_RESET] audio要素をload()で明示的にリセットした (${diagnosticContext})`, {
    errorAfterReset: audioElement.error,
    readyStateAfterReset: audioElement.readyState,
    networkStateAfterReset: audioElement.networkState,
    ...getAudioLifecycleDiagnosticsSnapshot(),
  });
}

// 取得したblobを「現在再生中」として確定させる。前の曲のURLはまだ解放せず
// （pendingPreviousObjectUrlへ退避するだけ）、自分のURLを新しい「現在再生中」として
// 登録してから、再生用のURLを返す。前の曲のURLの実際の解放は、呼び出し元が
// audioElement.srcを新しいURLへ切り替えたあとにreleasePreviousObjectUrlAfterSrcSwap()を
// 呼ぶことで行う（playSongIntro()・playSongFromRandomPosition()の共通処理）。
function claimAsCurrentPlayback(blob) {
  // クイズの音声を鳴らす直前に、試聴・連続再生など他の音声を止める
  // （playbackCoordinator.js参照、2026-08-04追加）。
  notifyPlaybackStarting("quiz");
  if (pendingPreviousObjectUrl !== null) {
    // 前回のclaimAsCurrentPlayback()の後始末がまだ済んでいなかった場合の保険
    // （通常は毎回releasePreviousObjectUrlAfterSrcSwap()が先に呼ばれるため発生しないが、
    // 万一未解放のまま次が来ても、ここで確実に解放してからでないと取りこぼしになるため）。
    diag("[OBJECT_URL] 前回分の解放漏れを検知、ここで解放", { url: pendingPreviousObjectUrl });
    URL.revokeObjectURL(pendingPreviousObjectUrl);
    cumulativeObjectUrlRevokedCount++;
    pendingPreviousObjectUrl = null;
  }
  pendingPreviousObjectUrl = currentObjectUrl;
  const myObjectUrl = URL.createObjectURL(blob);
  cumulativeObjectUrlCreatedCount++;
  currentObjectUrl = myObjectUrl;
  return myObjectUrl;
}

// claimAsCurrentPlayback()が退避しておいた「前の曲のURL」を、audioElement.srcが
// 新しいURLへ実際に切り替わったあとに解放する。playSongIntro()・
// playSongFromRandomPosition()の共通の後半処理（audioElement.src代入の直後に必ず呼ぶこと）。
function releasePreviousObjectUrlAfterSrcSwap() {
  if (pendingPreviousObjectUrl !== null) {
    diag("[OBJECT_URL] revoke（前の曲。src切り替え後のため安全）", {
      url: pendingPreviousObjectUrl,
      currentSrc: audioElement.src,
    });
    URL.revokeObjectURL(pendingPreviousObjectUrl);
    cumulativeObjectUrlRevokedCount++;
    pendingPreviousObjectUrl = null;
  }
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

// 【2026-11-XX追加・実機バグ調査：一瞬バトル／一瞬協力の「この問題は無効です」頻発】
// audioElement.play()が返すPromiseは通常なら数十〜数百msで決着するが、稀に決着自体が
// 起きない（resolveもrejectもしない）ケースがあることが実機調査で判明した。この場合、
// 下のattemptPlay()のawaitがそのままハングし、失敗report・エラー表示のどちらも発生
// せずに無言で止まってしまう（「この問題は無効です」とは別の、より悪い実害）。
// ensureUnlockSettled()が既に使っているraceUnlockPromiseWithTimeout()と全く同じ
// 考え方で、決着しなければ諦めて次の再試行（または失敗として報告）へ進めるようにする。
const PLAY_SETTLE_TIMEOUT_MS = 3000;

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
      // 【2026-11-XX追加・実機バグ調査】play()のPromise自体がハングして無期限に
      // 決着しないケースへの保険。PLAY_SETTLE_TIMEOUT_MS以内にresolve/rejectしなければ、
      // ここでは「決着しなかった」ことを検知できるだけの素朴なタイムアウト用Promiseと
      // Promise.raceする。play()呼び出し自体（audioElement.play()）は取り消せないため、
      // 万一その後に本当にresolve/rejectしても、追い越し判定（myToken !== currentPlaybackToken）
      // が安全側に処理する（下の既存ロジックと同じ枠組み）。
      cumulativePlayCallCount++;
      const settleResult = await Promise.race([
        audioElement.play().then(() => "resolved"),
        new Promise((resolve) => setTimeout(() => resolve("timeout"), PLAY_SETTLE_TIMEOUT_MS)),
      ]);
      if (settleResult === "timeout") {
        throw new Error("play()のPromiseがタイムアウトまでに決着しませんでした");
      }
      lastError = null;
      // 【本人指示：play()のPromiseが成功しただけでは「音が聞こえた」ことにならない】
      // ここではあくまで「ブラウザがplay()呼び出し自体は拒否しなかった」ことしか
      // 分かっていない。実際に音が鳴り始めたかどうかは、この後発火する（はずの）
      // onplayingイベント側のverifyRealPlaybackStarted()が、readyState・currentTimeの
      // 実際の進行まで確認して初めて判断する。
      cumulativePlaySuccessCount++;
      diag(`[${playbackTag}] play()のPromiseは成功（※音が鳴ったことの確認ではない） (${diagnosticContext}) attempt=${attempt}`, {
        readyState: audioElement.readyState,
        paused: audioElement.paused,
        muted: audioElement.muted,
        volume: audioElement.volume,
        ...getAudioLifecycleDiagnosticsSnapshot(),
      });
      break;
    } catch (error) {
      lastError = error;
      cumulativePlayFailureCount++;
      if (error?.name === "NotSupportedError") cumulativeNotSupportedErrorCount++;
      // 【2026-11-XX追加・実機バグ調査】原因の切り分けのため、失敗時点のaudio要素の
      // 状態（.error・readyState・networkState・currentSrc）もあわせて記録する。
      // 「なぜ最初のNotSupportedErrorが起きたか」と「なぜその後も同じエラーが続くか」を
      // 後から区別できるようにするため（docs/HANDOFF.md 81章参照）。
      // 【2026-11-XX追加・83章のセッション累積使用量仮説】これに加えて、ページを開いてから
      // このセッションで累計何回のObject URL生成・破棄・play()呼び出し・src差し替え・
      // load()呼び出しを行ってきたかのスナップショットも記録する。「何回目の再生で
      // 何個Object URLが生きている状態で失敗が起きたか」を後から実機ログだけで追えるように
      // するため（挙動そのものへの影響は無い、純粋な観測用の追加情報）。
      diag(`[${playbackTag}] play()失敗 (${diagnosticContext}) attempt=${attempt}`, {
        name: error?.name,
        message: error?.message,
        audioElementErrorCode: audioElement.error?.code ?? null,
        audioElementErrorMessage: audioElement.error?.message ?? null,
        readyState: audioElement.readyState,
        networkState: audioElement.networkState,
        currentSrc: audioElement.currentSrc,
        duration: audioElement.duration,
        ...getAudioLifecycleDiagnosticsSnapshot(),
      });
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

  resetAudioElementIfInErrorState(`intro, song=${song.id}`);

  const myObjectUrl = claimAsCurrentPlayback(blob);

  audioElement.onerror = () => {
    // 自分より新しい呼び出しに既に追い越されている場合、このエラーはもう
    // 今の問題とは関係ない曲のものなので、画面には出さず無視する。
    if (myToken !== currentPlaybackToken) return;
    // 【2026-11-XX追加・本人指示：一瞬協力Q1のNotSupportedError次回調査】これまでconsole.warn
    // だけで、実機で簡単に確認できる診断ログ（js/audioDiagnosticLog.js）には残っていなかった。
    // play()のPromiseが拒否される失敗（attemptPlay()側で記録済み）とは別に、audio要素自体が
    // 発する`error`イベント（デコード失敗・ネットワーク断など）もこの後diagへ記録する。
    diag(`[ERROR_EVENT] onerrorイベント発火 (intro, song=${song.id})`, {
      code: audioElement.error?.code ?? null,
      message: audioElement.error?.message ?? null,
      readyState: audioElement.readyState,
      networkState: audioElement.networkState,
      currentTime: audioElement.currentTime,
      currentSrc: audioElement.currentSrc,
      unlock: audioUnlockState,
    });
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
    // 【2026-11-XX新設・本人指示：一瞬バトル「もう一度聞く」不具合の防御的二重チェック】
    // 上のattemptSilentUnlock()側でハンドラをクリアする対策が主だが、万一何らかの経路で
    // このハンドラが生き残ったままunlock用の無音データURIに対して発火した場合の保険として、
    // 今のsrcが無音データURIでないことも確認する。
    if (isAudioElementOnSilentUnlockUri()) {
      diag(`[GUARD] onloadedmetadataがunlock用の無音音源に対して発火したため無視 (intro, song=${song.id})`);
      return;
    }
    audioElement.currentTime = song.introLeadInSec || 0;
  };
  const playbackTag = hasConfirmedFirstRealPlayback ? "NORMAL_AUDIO" : "FIRST_REAL_AUDIO";
  diag(`[${playbackTag}] src設定 (intro, song=${song.id})`, { unlock: audioUnlockState });
  audioElement.src = myObjectUrl;
  cumulativeSrcAssignmentCount++;
  // 前の曲のURLは、audioElement.srcが自分のURLへ切り替わった今なら安全に解放できる。
  releasePreviousObjectUrlAfterSrcSwap();

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

  resetAudioElementIfInErrorState(`randomPosition, song=${song.id}`);

  const myObjectUrl = claimAsCurrentPlayback(blob);

  audioElement.onerror = () => {
    if (myToken !== currentPlaybackToken) return;
    // 【2026-11-XX追加・本人指示：一瞬協力Q1のNotSupportedError次回調査】上のplaySongIntro()と
    // 同じ理由・同じ対策（詳しいコメントはそちら参照）。
    diag(`[ERROR_EVENT] onerrorイベント発火 (randomPosition, song=${song.id})`, {
      code: audioElement.error?.code ?? null,
      message: audioElement.error?.message ?? null,
      readyState: audioElement.readyState,
      networkState: audioElement.networkState,
      currentTime: audioElement.currentTime,
      currentSrc: audioElement.currentSrc,
      unlock: audioUnlockState,
    });
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
    // 【2026-09-05改訂・本人指示：オフラインの簡易効果音設定パネル】このタイマーは
    // 以前はここのローカル変数だったが、pauseAudioForExternalUi()から一時停止・
    // 残り時間を計算し直せるよう、モジュールスコープのscheduleAutoStop()へ差し替えた
    // （タイマーの発火条件・myTokenチェックは変更していない）。
    scheduleAutoStop(playDurationSec * 1000, () => {
      if (myToken !== currentPlaybackToken) return;
      audioElement.pause();
      onAutoStop();
    });
  };
  audioElement.onloadedmetadata = () => {
    if (myToken !== currentPlaybackToken) return;
    // 【2026-11-XX新設・本人指示：一瞬バトル「もう一度聞く」不具合の防御的二重チェック】
    // 上のattemptSilentUnlock()側でハンドラをクリアする対策が主だが、万一何らかの経路で
    // このハンドラが生き残ったままunlock用の無音データURIに対して発火した場合の保険として、
    // 今のsrcが無音データURIでないことも確認する。ここで防げないと、無音URIの実際の長さ
    // （約0.05秒）がcomputeStartTimeSec()（js/onlineInstantBattleScreen.js等）へ「今回の
    // 問題曲の長さ」として渡ってしまい、「音源が他の端末と異なる」という誤判定・試合無効化を
    // 引き起こしていた（実機診断ログで確認済み、docs/HANDOFF.md参照）。
    if (isAudioElementOnSilentUnlockUri()) {
      diag(`[GUARD] onloadedmetadataがunlock用の無音音源に対して発火したため無視 (randomPosition, song=${song.id})`);
      return;
    }
    audioElement.currentTime = computeStartTimeSec(audioElement.duration);
  };
  const randomPositionPlaybackTag = hasConfirmedFirstRealPlayback ? "NORMAL_AUDIO" : "FIRST_REAL_AUDIO";
  diag(`[${randomPositionPlaybackTag}] src設定 (randomPosition, song=${song.id})`, { unlock: audioUnlockState });
  audioElement.src = myObjectUrl;
  cumulativeSrcAssignmentCount++;
  // 前の曲のURLは、audioElement.srcが自分のURLへ切り替わった今なら安全に解放できる。
  releasePreviousObjectUrlAfterSrcSwap();

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
  cumulativeStopAudioCallCount++;
  diag("[STOP_AUDIO] 呼び出し", {
    caller: getStopAudioCallerLabel(),
    tokenBefore: currentPlaybackToken,
    ...getAudioLifecycleDiagnosticsSnapshot(),
  });
  // 世代番号を進めることで、この時点で裏に残っている古いplaySongIntro()/
  // playSongFromRandomPosition()の処理（自動停止タイマーを含む）をすべて「無効」にする
  // （stopAudio()の後に遅れて鳴り出す事故を防ぐ）。
  currentPlaybackToken++;
  currentPlaybackSongId = null;
  troubleReportedToken = null;
  audioElement.pause();
  audioElement.currentTime = 0;
  releaseCurrentObjectUrl();
  // 【2026-09-05新設・本人指示：オフラインの簡易効果音設定パネル】明示的に停止した
  // （位置が0へ戻った）以上、「一時停止からの再開」「自動停止の残り時間」という概念自体が
  // もう意味を持たない。次にpauseAudioForExternalUi()等が呼ばれたときに古い状態を
  // 引きずらないよう、ここで確実にリセットする。
  pausedByExternalUi = false;
  if (autoStopState?.timeoutId !== null && autoStopState?.timeoutId !== undefined) {
    clearTimeout(autoStopState.timeoutId);
  }
  autoStopState = null;
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

// 【2026-11-XX追加・実機バグ調査：答え合わせ音源が鳴らないことがある不具合】呼び出し元が
// audio要素そのものを持っていないため、診断ログ用に「今のcurrentTime・再生中かどうか」
// だけを安全に読み取れる関数を追加する。audioElement自体はこのモジュール外へ公開しない
// （既存の設計方針どおり、再生の制御は必ずこのファイルの関数経由で行う）。
export function getAudioElementDiagnosticSnapshot() {
  return {
    currentTime: audioElement.currentTime,
    paused: audioElement.paused,
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
