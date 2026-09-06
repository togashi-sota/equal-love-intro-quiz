// オンライン対戦ルームの「定員（maxPlayers）チェック」に関するFirebase Realtime
// Databaseセキュリティルール案の「意図」をJavaScriptの純粋関数として再現した
// シミュレーター（2026-09-06新設、本人指示：真の同時実行テストで発見した定員超過
// 不具合の最優先修正）。js/lyricsQuizBattleSecurityRules.js・
// js/audioTroubleRecoverySecurityRules.jsと全く同じ位置づけ・同じ限界を持つ
// （実際のFirebase Rules言語そのものではなく、意図をコードとして書き下し、
// 様々なシナリオが期待どおりの許可/拒否になるかを自動テストするためのもの）。
//
// 【発見された不具合】js/onlineBattle.jsのjoinRoom()・promoteSpectatorToPlayer()は
// 「読む→現在の人数を確認→自分の枠だけ書く」というトランザクション無しの方式で、
// 定員チェック自体はクライアント側のJavaScriptだけで行っていた。複数のclientが
// 真に同時に参加を試みると、全員が同じ「まだ空きがある」という古い読み取り結果を
// 見てしまい、定員を超えて全員参加できてしまうことを実機の真の同時実行テストで
// 確認した（2人部屋に2人が同時参加で4/4回とも3人になる等）。
//
// 【なぜruntTransaction()・numChildren()のどちらも使わないか】
// ・runTransaction()：過去の実機不具合（Firebase RTDB SDK側の未解明の癖）により不採用。
//   加えてplayersコレクション全体への書き込み権限がどのプレイヤーにも無いため、
//   そもそも権限的に成立しない。
// ・newData.numChildren()：クライアントSDKのDataSnapshotにのみ存在するメソッドで、
//   Firebase Realtime Database Security Rulesの式言語（RuleDataSnapshot）には
//   存在しない（本番Firebase Consoleへの公開時に「No such method/property
//   'numChildren'」で実際に拒否されることを過去に確認済み。docs/HANDOFF.md参照）。
//
// 【採用した方式：カウンタパターン】rooms/$roomId/playerCountという専用の数値
// フィールドを新設し、参加者エントリの追加/削除と必ず同じupdate()（複数パス同時
// 書き込み）の中でこの値も±1だけ更新する。Firebase Rules側のplayerCountの
// .validateは、val()・isNumber()等の実在が確認済みのメソッドだけを使い、
// 「新しい値は、サーバーが実際に保持している値からちょうど±1で、かつmaxPlayers
// 以下であること」だけを検証する。複数の同時書き込みがあっても、Firebase Realtime
// Databaseは同じパスへの書き込みを1件ずつ順に確定・評価するため、2件目以降の
// 書き込みは「既に更新済みの実際の値」に対して±1を計算し直さない限り拒否される
// ＝本当の意味での定員超過防止が実現できる。また、players/{uid}とplayerCountを
// 同じupdate()にまとめることで、Firebaseの「複数パス更新はall-or-nothingで適用
// される」という保証により、「参加者エントリだけ作られてplayerCountが更新
// されない」という不整合は起こり得ない。

// 【2026-09-06追記・独立レビューで指摘・是正】当初のFirebase Rules案は".write": "auth != null"
// だけだったため、このルームの参加者でも観戦者でもない無関係な認証済みユーザーが単独で
// playerCountだけを書き換えられてしまい（±1・maxPlayers以下という.validateだけは通る）、
// players一覧との整合性が崩れて定員超過が再発しうるという穴があった。実際のFirebase Rules
// （firebase/database.rules.jsonのplayerCount）には、書き込み元を「このルームの
// 書き込み後の参加者」または「このルームの書き込み前の参加者」のどちらかに限定する
// 認可条件を追加した（players/$uidの.write権限を持つのは常にその本人か、キックする
// ホストのどちらかであり、その全パターンを過不足なくカバーする）。この認可条件は
// canWritePlayerCount()のfuzzテストとは別に、tests/onlineBattleCapacityRaceRegression.test.js
// でルールファイルの実際の文言を確認している。

// rooms/$roomId/playerCountへの書き込み可否（新規参加・観戦者昇格・退出・キックの
// どれも、最終的にこの1つの検証を通る）。この関数は.validateの検証内容だけを再現する
// （.writeの認可条件＝「呼び出し元が実際にこのルームの参加者かどうか」は、
// tests/onlineBattleCapacityRaceRegression.test.jsで別途、実際のルール文言を確認する）。
//
// previousCount: 書き込み直前の、サーバーが実際に保持しているplayerCountの値
//   （undefined/nullなら「まだこのフィールドが存在しない」＝ルーム作成時の初回書き込み）。
// newCount: このクライアントが書き込もうとしている値。
export function canWritePlayerCount({ authUid, previousCount, newCount, maxPlayers }) {
  if (authUid == null) return false;
  if (typeof newCount !== "number") return false;
  if (newCount > maxPlayers) return false;
  if (previousCount == null) return true; // ルーム作成時の初回書き込み（上位のルームcreateルール側で厳密にvalを縛る）
  return newCount === previousCount + 1 || newCount === previousCount - 1;
}
