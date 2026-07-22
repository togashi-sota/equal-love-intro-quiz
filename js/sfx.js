// ボタン操作・正解/不正解の効果音を再生するファイル。
// イントロ音源（audio.js）とは別に、短い効果音を都度鳴らす。

const SFX_BASE_PATH = "assets/sfx/";

// 効果音を再生する。再生に失敗しても、ゲームの進行には一切影響させない。
function playSfx(fileName) {
  const audio = new Audio(`${SFX_BASE_PATH}${fileName}`);
  audio.play().catch(() => {
    // 効果音が鳴らせない環境でも、ゲーム自体は問題なく続けられるようにする
  });
}

export function playClickSound() {
  playSfx("click.mp3");
}

export function playCorrectSound() {
  playSfx("correct.mp3");
}

export function playWrongSound() {
  playSfx("wrong.mp3");
}

export function playCountUpSound() {
  playSfx("score-countup.mp3");
}
