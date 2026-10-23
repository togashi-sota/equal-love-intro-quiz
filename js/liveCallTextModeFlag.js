// ライブコール「文字モード」をこの端末で表示するかどうか（2026-10-24新設）。
// 本人がコールの配置を確認・承認するまでは、アプリのURLに ?calltext=on を付けて開いた端末だけに出す。
// 画面のファイル（js/liveCallModeScreen.js）は読み込んだだけで再生の調停に登録されるため、
// この切り替えだけを独立させている（テストや他の画面から、再生の仕組みに触れずに使えるように）。
export const LIVE_CALL_TEXT_MODE_FLAG_KEY = "liveCallTextMode.enabled";

export function isLiveCallTextModeEnabled() {
  try {
    return localStorage.getItem(LIVE_CALL_TEXT_MODE_FLAG_KEY) === "on";
  } catch {
    return false;
  }
}

export function setLiveCallTextModeEnabled(enabled) {
  try {
    if (enabled) localStorage.setItem(LIVE_CALL_TEXT_MODE_FLAG_KEY, "on");
    else localStorage.removeItem(LIVE_CALL_TEXT_MODE_FLAG_KEY);
  } catch {
    // 保存できない環境では何もしない（文字モードが出ないだけ）
  }
}
