// 【Stage1・本人指示】presence（フレンド一覧用オンライン状態）を、公開プロフィールの
// ON/OFF設定へ連動させる修正の再発防止テスト。
//
// 【なぜソーステキストの構造チェックなのか】js/presenceSync.js・js/publicProfileSync.js・
// js/main.jsはFirebase SDKの初期化・匿名ログイン・DOM初期化を伴い、このプロジェクトには
// Firebaseエミュレーター環境が無いため、実際にimportして関数を呼び出す形の自動テストには
// できない（js/lyricsQuizBattleFirebase.js系・tests/serviceWorkerCacheCompleteness.test.js
// と同じ理由・同じ手法）。そのため、ソースコードをテキストとして取得し、
// 「意図した実装が実際にそこにあるか」「以前の（公開設定を無視する）実装が
// 復活していないか」を文字列レベルで確認する。
import { assertEqual } from "./test-utils.js";

export async function runPresenceStage1RegressionTests() {
  // ===== firebase/database.rules.json：presence書き込みルールの回帰防止 =====
  const rulesResponse = await fetch("firebase/database.rules.json");
  const rulesText = await rulesResponse.text();
  assertEqual(rulesText.length > 500, true, "database.rules.jsonのソースを取得できた（前提条件）");

  const rules = JSON.parse(rulesText);
  const presenceRules = rules?.rules?.presence;
  assertEqual(typeof presenceRules === "object" && presenceRules !== null, true, "presenceルールが存在する（前提条件）");

  assertEqual(
    presenceRules?.[".read"],
    "auth != null",
    "presenceの読み取りルールはStage1で変更していない（read制限の再設計は将来課題のため）"
  );
  assertEqual(
    presenceRules?.["$uid"]?.[".write"],
    "auth != null && auth.uid === $uid && (!newData.exists() || root.child('publicProfiles/' + $uid).exists())",
    "presence書き込みは、本人のuidが条件。新規作成/更新はpublicProfiles/{uid}が存在する" +
      "場合だけ許可し、削除（!newData.exists()）はpublicProfilesの有無に関係なく許可する" +
      "（2026-09-09追記・本人指示：削除までpublicProfiles存在必須にすると、先にpublicProfilesが" +
      "消えた場合にpresenceを二度と削除できなくなる『詰み』状態が実機で再現したため修正）"
  );

  // ===== js/presenceSync.js：停止処理でonDisconnect予約を明示的にcancelしているか =====
  const presenceSyncResponse = await fetch("js/presenceSync.js");
  const presenceSyncSource = await presenceSyncResponse.text();
  assertEqual(presenceSyncSource.length > 500, true, "js/presenceSync.jsのソースを取得できた（前提条件）");

  assertEqual(
    presenceSyncSource.includes("export async function deleteFriendPresence"),
    true,
    "presence/{uid}を丸ごと削除するdeleteFriendPresence()が存在する"
  );

  const stopFnStart = presenceSyncSource.indexOf("export function stopFriendPresenceTracking");
  assertEqual(stopFnStart !== -1, true, "stopFriendPresenceTracking()の定義が見つかる（前提条件）");
  // 関数本体には複数のif文（入れ子の中括弧）が含まれるため、最初の"\n}"では
  // 関数全体を捉えられない（内側のif блокの閉じ括弧で止まってしまう）。
  // 次に定義されているdeleteFriendPresence()の開始位置までを関数本体とみなす。
  const stopFnEnd = presenceSyncSource.indexOf("export async function deleteFriendPresence", stopFnStart);
  assertEqual(stopFnEnd !== -1, true, "stopFriendPresenceTracking()の後にdeleteFriendPresence()が続く（前提条件）");
  const stopFnBody = presenceSyncSource.slice(stopFnStart, stopFnEnd);
  // 【前提条件】onDisconnect(...)の引数にref(database, ...)のような入れ子の括弧を
  // 含む呼び方があるため、正規表現で丸ごと1回にマッチさせるのは避け、
  // "onDisconnect("の出現数と".cancel()"の出現数をそれぞれ数える（3箇所＝
  // connections用・lastSeen用・isPlaying用のonDisconnect登録に対応するはず）。
  const onDisconnectCallCount = (stopFnBody.match(/onDisconnect\(/g) ?? []).length;
  const cancelCallCount = (stopFnBody.match(/\.cancel\(\)/g) ?? []).length;
  assertEqual(
    onDisconnectCallCount >= 3 && cancelCallCount >= 3,
    true,
    "停止処理内でonDisconnect(...).cancel()が3箇所（connection・lastSeen・isPlaying）呼ばれている"
  );

  // ===== js/publicProfileSync.js：ON/OFFの後始末と、順序・連動ロジックの回帰防止 =====
  const publicProfileSyncResponse = await fetch("js/publicProfileSync.js");
  const publicProfileSyncSource = await publicProfileSyncResponse.text();
  assertEqual(publicProfileSyncSource.length > 500, true, "js/publicProfileSync.jsのソースを取得できた（前提条件）");

  assertEqual(
    publicProfileSyncSource.includes("export function syncFriendPresenceToActivePlayer"),
    true,
    "現在のアクティブプレイヤーの設定にpresence trackingを合わせ直すsyncFriendPresenceToActivePlayer()が存在する"
  );

  // OFF時の後始末（applyPublicProfileSharingDisabled）が
  // stop → presence削除 → publicProfile削除 の順で呼ばれているかを、
  // ソース中の出現位置（インデックス）の大小関係で確認する。
  const disabledFnStart = publicProfileSyncSource.indexOf("async function applyPublicProfileSharingDisabled");
  assertEqual(disabledFnStart !== -1, true, "applyPublicProfileSharingDisabled()の定義が見つかる（前提条件）");
  const disabledFnEnd = publicProfileSyncSource.indexOf("\n}", disabledFnStart);
  const disabledFnBody = publicProfileSyncSource.slice(disabledFnStart, disabledFnEnd);

  const stopIndex = disabledFnBody.indexOf("stopFriendPresenceTracking()");
  const deletePresenceIndex = disabledFnBody.indexOf("deleteFriendPresence()");
  const deleteProfileIndex = disabledFnBody.indexOf("deletePublicProfile()");
  assertEqual(
    stopIndex !== -1 && deletePresenceIndex !== -1 && deleteProfileIndex !== -1,
    true,
    "OFF時の後始末に、停止・presence削除・publicProfile削除の3つの呼び出しがすべて含まれる（前提条件）"
  );
  assertEqual(
    stopIndex < deletePresenceIndex && deletePresenceIndex < deleteProfileIndex,
    true,
    "OFF時の後始末は「停止→presence削除→publicProfile削除」の順（Rules変更後、" +
      "publicProfileを先に消すとpresence削除自体が拒否されうるため、この順序が重要）"
  );

  // ON時の後始末（applyPublicProfileSharingEnabled）が、publicProfile同期に
  // 成功した場合だけpresenceを開始する作りになっているかを確認する。
  const enabledFnStart = publicProfileSyncSource.indexOf("async function applyPublicProfileSharingEnabled");
  assertEqual(enabledFnStart !== -1, true, "applyPublicProfileSharingEnabled()の定義が見つかる（前提条件）");
  const enabledFnEnd = publicProfileSyncSource.indexOf("\n}", enabledFnStart);
  const enabledFnBody = publicProfileSyncSource.slice(enabledFnStart, enabledFnEnd);
  assertEqual(
    enabledFnBody.includes("if (success)") && enabledFnBody.includes("startFriendPresenceTracking()"),
    true,
    "ON時は、publicProfileの作成・確認に成功した場合だけstartFriendPresenceTracking()を呼ぶ"
  );

  // 【自己修復・2026-09-09追加】syncFriendPresenceToActivePlayer()のOFF側（else分岐）が、
  // 「このセッションで既にtrackingを開始していた場合だけ」停止・削除する早期returnを
  // 持たないこと（＝公開OFFであれば、過去のセッションの残骸であっても毎回stop・削除を
  // 試みる作りになっていること）を確認する。実機で、presence削除の通信が一度失敗すると
  // 二度と自動的には消えなくなる不具合が見つかったため、この自己修復を追加した経緯がある。
  const syncFnStart = publicProfileSyncSource.indexOf("export function syncFriendPresenceToActivePlayer");
  assertEqual(syncFnStart !== -1, true, "syncFriendPresenceToActivePlayer()の定義が見つかる（前提条件）");
  const syncFnEnd = publicProfileSyncSource.indexOf(
    "// TOP10ランキング",
    syncFnStart
  );
  assertEqual(syncFnEnd !== -1, true, "syncFriendPresenceToActivePlayer()の後に次のセクションが続く（前提条件）");
  const syncFnBody = publicProfileSyncSource.slice(syncFnStart, syncFnEnd);

  const elseIndex = syncFnBody.indexOf("} else {");
  assertEqual(elseIndex !== -1, true, "syncFriendPresenceToActivePlayer()にOFF側のelse分岐がある（前提条件）");
  const elseBranchBody = syncFnBody.slice(elseIndex);

  // 【前提条件】説明コメント中に関数名だけが登場すること自体は問題ないため（実際、今回の
  // 自己修復を追加した経緯を説明するコメント中に関数名が出てくる）、実際の「呼び出して
  // 早期returnする」形（ ...()) return ）だけを対象にする。js/main.jsの
  // startFriendPresenceTracking()呼び出し検出と同じ考え方。
  assertEqual(
    /hasActiveFriendPresenceTracking\(\)\)\s*return/.test(elseBranchBody),
    false,
    "OFF側の分岐に「このセッションで既に追跡していたか」による早期returnが残っていない" +
      "（残っていると、過去のセッションの残骸presenceを次回起動時に自己修復できないため）"
  );
  assertEqual(
    elseBranchBody.includes("stopFriendPresenceTracking()") && elseBranchBody.includes("deleteFriendPresence()"),
    true,
    "OFF側の分岐は、条件なしでstopFriendPresenceTracking()とdeleteFriendPresence()の" +
      "両方を必ず試みる（自己修復設計）"
  );

  // ===== js/main.js：起動時の無条件呼び出しが廃止され、連動する呼び出しに置き換わっているか =====
  const mainResponse = await fetch("js/main.js");
  const mainSource = await mainResponse.text();
  assertEqual(mainSource.length > 500, true, "js/main.jsのソースを取得できた（前提条件）");

  // 【前提条件】この判定は「関数呼び出しとして」startFriendPresenceTracking()が
  // main.js中に存在しないことを確認するためのもの。説明コメント中に関数名だけが
  // 登場すること自体は問題ないため、呼び出し特有の形（開き括弧・閉じ括弧・セミコロンが
  // 直後に続く形）だけを対象にする。
  assertEqual(
    /startFriendPresenceTracking\(\);/.test(mainSource),
    false,
    "js/main.jsはstartFriendPresenceTracking()を直接呼んでいない" +
      "（公開設定を無視した無条件開始が復活していないことの回帰確認）"
  );

  const syncCallCount = (mainSource.match(/syncFriendPresenceToActivePlayer\s*\(\s*\)/g) ?? []).length;
  assertEqual(
    syncCallCount >= 2,
    true,
    "js/main.jsはsyncFriendPresenceToActivePlayer()を2箇所以上（起動時・プレイヤー切り替え時）で呼んでいる"
  );

  const onPlayerChangedStart = mainSource.indexOf("onPlayerChanged: () => {");
  assertEqual(onPlayerChangedStart !== -1, true, "onPlayerChangedコールバックの定義が見つかる（前提条件）");
  const onPlayerChangedEnd = mainSource.indexOf("},", onPlayerChangedStart);
  const onPlayerChangedBody = mainSource.slice(onPlayerChangedStart, onPlayerChangedEnd);
  assertEqual(
    onPlayerChangedBody.includes("syncFriendPresenceToActivePlayer()"),
    true,
    "プレイヤー切り替え時のonPlayerChangedが、切り替え後の設定でpresenceを合わせ直している"
  );
}
