// js/storagePersistence.jsの恒久テスト。
// 実際のブラウザAPI（navigator.storage）を使うため、値そのものの断定（許可済みかどうか等）は
// 環境依存で当てにできない。ここでは「呼んでも例外を投げない」「戻り値の形が正しい」
// という、コード側の責務だけを確認する。
import { requestPersistentStorage, getStoragePersistenceStatus } from "../js/storagePersistence.js";
import { assertEqual } from "./test-utils.js";

export async function runStoragePersistenceTests() {
  // ---- requestPersistentStorage()は例外を投げず、真偽値を返す ----
  const requestResult = await requestPersistentStorage();
  assertEqual(
    typeof requestResult === "boolean",
    true,
    "requestPersistentStorage()は例外を投げず、真偽値を返す"
  );

  // ---- getStoragePersistenceStatus()は正しい形のオブジェクトを返す ----
  const status = await getStoragePersistenceStatus();
  assertEqual(
    typeof status === "object" && status !== null && "supported" in status && "persisted" in status,
    true,
    "getStoragePersistenceStatus()は{supported, persisted}の形のオブジェクトを返す"
  );
  assertEqual(
    typeof status.supported === "boolean",
    true,
    "status.supportedは真偽値"
  );
  // 未対応ならpersistedはnull、対応していれば真偽値になる。
  assertEqual(
    status.persisted === null || typeof status.persisted === "boolean",
    true,
    "status.persistedはnullまたは真偽値"
  );
}
