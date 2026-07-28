// ボタン操作・正解/不正解の効果音を再生するファイル。
//
// 以前はmp3ファイルを再生する方式だったが、そのファイルの出どころ・ライセンスを
// 確実に確認できなかったため、Web Audio API（ブラウザ標準の音声合成の仕組み）で
// その場で単純な音を合成する方式に変更した。外部の音源ファイルを一切使わないため、
// 著作権のあいまいさが構造的に発生しない。
//
// 音の善し悪しよりも「まず著作権上安全であること」を優先したシンプルな実装。
// より作り込んだ効果音への磨き込みは、機能追加が一段落してから別途行う方針
// （HANDOFF.md参照）。

let audioContext = null;

// AudioContextは初めて音を鳴らすとき（＝必ずクリック等のユーザー操作の中）に作る。
// ブラウザの自動再生制限により、生成直後は一時停止状態のことがあるため、そのときは再開させる。
function getAudioContext() {
  if (audioContext === null) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

// 単純な音（指定した周波数の1音）を短く鳴らす。
// 音量は指数関数的に0まで下げることで、電子音特有の「プツッ」という音切れを防いでいる。
function playTone(frequency, durationSec, { type = "sine", volume = 0.15, delaySec = 0 } = {}) {
  const context = getAudioContext();
  const startTime = context.currentTime + delaySec;

  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;

  const gainNode = context.createGain();
  gainNode.gain.setValueAtTime(volume, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + durationSec);
}

// 効果音の再生に失敗しても（AudioContextが使えない環境など）、ゲームの進行には影響させない。
function playSfxSafely(playSound) {
  try {
    playSound();
  } catch {
    // 何もしない。効果音は補助的な演出のため。
  }
}

// ボタンを押したときの、短く控えめなクリック音。
export function playClickSound() {
  playSfxSafely(() => playTone(700, 0.06, { type: "square", volume: 0.08 }));
}

// 正解したときの、上昇する2音チャイム。
export function playCorrectSound() {
  playSfxSafely(() => {
    playTone(880, 0.12, { volume: 0.15 });
    playTone(1318.5, 0.16, { volume: 0.15, delaySec: 0.08 });
  });
}

// 不正解のときの、低いブザー風の音。
export function playWrongSound() {
  playSfxSafely(() => playTone(160, 0.25, { type: "sawtooth", volume: 0.12 }));
}

// 結果画面の得点カウントアップに合わせて鳴らす、上昇するスイープ音。
export function playCountUpSound() {
  playSfxSafely(() => {
    const context = getAudioContext();
    const startTime = context.currentTime;
    const durationSec = 0.8;

    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, startTime);
    oscillator.frequency.linearRampToValueAtTime(1046.5, startTime + durationSec);

    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(0.1, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + durationSec);
  });
}
