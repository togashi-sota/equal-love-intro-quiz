// 歌詞・コールのタップで、その時刻へ移動する（2026-11-01 r7-live）。新しいライブコールと新しいカラオケの共通の部品。
// 【決まり】
//   ・移動するのは「時刻がある所」だけ。歌詞は行の開始の時刻（行単位。行の中を補間しない）、コールは本人の開始の時刻。
//     時刻の無い所（表示のために分けた行の続きなど）は、推測で移動しない（押せる見た目にもしない）。
//   ・歌詞の行：その行の開始へ。コール：その 1 秒前から（言う前に構えられるように。ライブコール・カラオケで同じ）。
//   ・スクロールしようとした指の動き（はじめに触れた所から 10px 以上動いた・その間に箱がスクロールした）はタップにしない。
//   ・再生中／一時停止中のどちらでも使える（再生の状態は変えない。呼び出し元が位置だけを動かす）。

export const CALL_TAP_PRE_ROLL_SEC = 1;
export const TAP_MOVE_TOLERANCE_PX = 10;

// 歌詞の行の移動先（純粋関数）。line.start が数でなければ null（移動しない）
export function lyricTapSeekTime(line) {
  const start = Number(line?.start);
  if (line?.start === null || line?.start === undefined || !Number.isFinite(start)) return null;
  return Math.max(0, start);
}

// コールの移動先（純粋関数）。開始の 1 秒前。開始が数でなければ null
export function callTapSeekTime(call, preRoll = CALL_TAP_PRE_ROLL_SEC) {
  const start = Number(call?.start);
  if (call?.start === null || call?.start === undefined || !Number.isFinite(start)) return null;
  return Math.max(0, start - preRoll);
}

// はじめに触れた所・箱のスクロールの位置から、タップかスクロールかを決める（純粋関数）
export function isTapGesture({ startX, startY, endX, endY, scrollBefore = 0, scrollAfter = 0 }, tolerance = TAP_MOVE_TOLERANCE_PX) {
  const moved = Math.hypot((endX ?? startX) - startX, (endY ?? startY) - startY);
  return moved < tolerance && Math.abs((scrollAfter ?? 0) - (scrollBefore ?? 0)) < 4;
}

// node を押したら onTap(event) を呼ぶ。スクロールの指の動きは除く。scroller：一緒にスクロールする箱（無ければ見ない）
// 戻り値：購読を外す関数
export function bindTapSeek(node, onTap, { scroller = null } = {}) {
  if (!node || typeof onTap !== "function") return () => {};
  let down = null;
  const onDown = (event) => {
    down = { startX: event.clientX, startY: event.clientY, scrollBefore: scroller?.scrollTop ?? 0 };
  };
  const onClick = (event) => {
    const gesture = down ? { ...down, endX: event.clientX, endY: event.clientY, scrollAfter: scroller?.scrollTop ?? 0 } : null;
    down = null;
    // キーボード（Enter）・支援技術からの click は座標が 0 のことがあるので、触れていなければそのままタップ扱い
    if (gesture && event.detail !== 0 && !isTapGesture(gesture)) return;
    onTap(event);
  };
  node.addEventListener("pointerdown", onDown, { passive: true });
  node.addEventListener("click", onClick);
  return () => {
    node.removeEventListener("pointerdown", onDown);
    node.removeEventListener("click", onClick);
  };
}
