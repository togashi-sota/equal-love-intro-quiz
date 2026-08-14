// ブラウザの「永続ストレージ」機能（Storage Persistence API）を扱うファイル。
//
// 音源・歌詞はIndexedDBに保存しているが、何もしなければブラウザは「ベストエフォート」
// （＝端末の空き容量が少なくなると、他のサイトのデータと一緒に自動で消されることがある）
// 扱いのままになる。navigator.storage.persist()を呼んで許可されると、
// 明示的にアプリを削除するかブラウザの設定から消さない限り、自動では消されなくなる。
//
// 対応していないブラウザ（一部のiOS Safari等）でも呼び出しごと丸ごとtry/catchで
// 囲んであるため、失敗してもアプリの動作には一切影響しない。

function isSupported() {
  return typeof navigator !== "undefined" && !!navigator.storage && typeof navigator.storage.persist === "function";
}

// 永続ストレージを要求する。結果が許可されたかどうかはgetStoragePersistenceStatus()で
// 別途確認できるため、ここでは戻り値を使わなくても呼びっぱなしで構わない設計にしている。
// 何度呼んでも安全（すでに許可済みなら、ブラウザ側が何もせずtrueを返すだけ）。
export async function requestPersistentStorage() {
  if (!isSupported()) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    // 一部ブラウザ・環境（プライベートブラウズ等）では例外を投げることがあるが、
    // 通常のストレージ機能自体は使えるはずなので、ここで握りつぶしてアプリは動かし続ける。
    return false;
  }
}

// 現在の許可状況を返す。
// supported: この端末のブラウザがStorage Persistence API自体に対応しているか
// persisted: 対応している場合、実際に永続化が許可されているか（未対応ならnull）
export async function getStoragePersistenceStatus() {
  if (!isSupported()) {
    return { supported: false, persisted: null };
  }
  try {
    const persisted = await navigator.storage.persisted();
    return { supported: true, persisted };
  } catch {
    return { supported: false, persisted: null };
  }
}
