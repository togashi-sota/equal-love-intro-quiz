// js/screens.js の代わり（エミュレータ検証専用）。画面切り替えの通知だけを再現する。
const listeners = [];
export function onScreenChange(callback) {
  listeners.push(callback);
}
export function emitScreenChange(screenName) {
  listeners.forEach((cb) => cb(screenName));
}
