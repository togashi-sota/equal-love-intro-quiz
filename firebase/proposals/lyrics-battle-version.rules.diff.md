# 提案：歌詞クイズ対戦の「全員に同じヒント」照合まわりのデータベースルール（2026-10-28）

**この提案は未適用。`firebase/database.rules.json` は変更していない。**
今回のアプリ側の仕組み（`js/lyricsQuizBattleCompatibility.js`）は、**今の本番ルールのままで動く**。
以下は「さらに固くしたい場合」の任意の追加で、適用するかは本人判断。

## 前提（今のルールで動く理由）

- 新しく書く値は2つだけ。どちらも本人が自分の分だけ書く。
  - `rooms/$roomId/players/$uid/lyricsCoverage/capability`（開始前：版の番号・ハッシュだけ）
  - `rooms/$roomId/players/$uid/lyricsMatchCheck`（開始後：問題ごとのハッシュだけ）
- 今のルールの `players/$uid` は `.write` が「`auth.uid === $uid`（＋ホストによる削除）」で、
  配下に `$other: false` が無いので、未知の子要素も本人なら書ける（既存の `lyricsCoverage`・
  `availableLyricsSongIds` と同じ扱い）。
- このことは `tests/lyricsQuizBattleCompatibility.test.js` の
  `runLyricsQuizBattleCompatibilityRulesTests()` が、ルールファイルを実際に読んで毎回確かめる
  （将来 `$other: false` 等が入るとテストが失敗して気づける）。

---

## 案A（推奨度：中）値の形と大きさの検証を足す

**目的**：改造クライアント・不具合で、巨大な文字列や想定外の形が書かれるのを防ぐ。
**効果の範囲**：照合そのもの（開始を止める・中止する）はアプリ側で既に動いている。
これは「変な値でロビーが重くなる・照合が壊れる」ことへの保険。
**古いアプリへの影響**：無し（古いアプリは `capability`・`lyricsMatchCheck` を書かない）。

### 差分（`firebase/database.rules.json` の `rooms/$roomId/players/$uid` の中、`presence` の後ろ）

```diff
             "presence": {
               ".write": "auth != null && auth.uid === $uid",
               ".validate": "newData.val() === 'active' || newData.val() === 'checking' || newData.val() === 'away'"
-            }
+            },
+            "lyricsCoverage": {
+              "capability": {
+                ".validate": "newData.hasChildren(['v', 'uniquenessRulesVersion', 'engineVersion', 'tablesSignature', 'catalogSignature', 'songHashes'])",
+                "v": { ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 1000" },
+                "uniquenessRulesVersion": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000" },
+                "engineVersion": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000" },
+                "tablesSignature": { ".validate": "newData.isString() && newData.val().length <= 16" },
+                "catalogSignature": { ".validate": "newData.isString() && newData.val().length <= 16" },
+                "songHashes": { ".validate": "newData.isString() && newData.val().length <= 6000" },
+                "$other": { ".validate": false }
+              }
+            },
+            "lyricsMatchCheck": {
+              ".validate": "newData.hasChildren(['v', 'matchId', 'questionCount', 'fingerprint', 'questionHashes'])",
+              "v": { ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 1000" },
+              "matchId": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 64" },
+              "questionCount": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 200" },
+              "fingerprint": { ".validate": "newData.isString() && newData.val().length <= 16" },
+              "questionHashes": { ".validate": "newData.isString() && newData.val().length <= 2000" },
+              "abortedReason": { ".validate": "newData.isString() && newData.val() === 'question-mismatch'" },
+              "abortedMismatchCount": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 20" },
+              "$other": { ".validate": false }
+            }
           }
         },
```

- 大きさの根拠：`songHashes` は「曲ID=8桁;」×歌詞クイズ対象の全曲（現在83曲で約2,000文字）。
  曲が倍になっても収まる6,000文字に。`questionHashes` は「8桁,」×最大の出題数（全曲＝83問で約750文字）。
- `lyricsCoverage` 自体（`availableCount` 等）には今までどおり検証を付けない（古いアプリが書く形を壊さない）。

### 適用前の確認
1. Firebase コンソールの Rules Playground で、次が **許可** されること：
   本人が `players/{自分}/lyricsCoverage` に `{availableCount, requiredCount, complete, poolHash, capability:{…6項目…}}` を set／
   `capability` 無しの従来の形を set（古いアプリ）／`players/{自分}/lyricsMatchCheck` に5項目（＋中止時の2項目）を set。
2. 次が **拒否** されること：`capability` に7個目の項目、`songHashes` が6,001文字、他人の `players/{uid}/lyricsMatchCheck` への書き込み。
3. `tests/lyricsQuizBattleCompatibility.test.js` の「今のルール」テストは、適用後は `hasValidate: true` になるため
   期待値を `{ selfWritable: true, hasValidate: true, blockedByOther: false }` に直す（`lyricsCoverage` 自体は `hasValidate: false` のまま）。

### ロールバック
- 追加した `"lyricsCoverage": {…}` と `"lyricsMatchCheck": {…}` の2ブロックを消して公開し直すだけ。
- アプリはこの検証に依存していないので、いつ戻しても対戦は動く（テストの期待値だけ元に戻す）。

---

## 案B（推奨度：低〜中・本人判断）古いアプリの「ホスト」にもサーバー側で開始させない

**今のアプリ側の仕組みで残る穴**：新しいホストが作った部屋（除外ルールの版あり）で、ホストが
古いアプリの人に交代した場合、古いホストは照合をしない。今回の対応では、新しいアプリの参加者が
「ホストに合わせて除外なしで作る」（`resolveQuestionSettingsForHost()`）ので問題はそろうが、
除外ルールは効かない（紛らわしい行が出うる）。

**古いアプリでも止まる唯一の方法**：古いアプリが既に持っている拒否の仕組み
「`settings.battleRuleVersion` が自分の知っている版（2）と違えば『対戦ルールのバージョンが一致しません。
アプリを更新してください。』で開始しない」を使う。そのためには新しいアプリが `battleRuleVersion: 3` を
書く必要があり、今のルール（`=== 2`）が拒否するので、ルール変更が必要。

### 差分（`rooms/$roomId/settings/battleRuleVersion`）

```diff
           "battleRuleVersion": {
-            ".validate": "newData.isNumber() && newData.val() === 2"
+            ".validate": "newData.isNumber() && (newData.val() === 2 || newData.val() === 3)"
           },
```

### アプリ側でセットで必要な変更（ルール公開の後のリリースで行う。今回は未実施）
- `js/battleRules/classicRule.js`・`stealRule.js`・`comboRule.js` の `ruleVersion` を 3 に。
- `js/lyricsQuizBattleSecurityRules.js` の `isValidBattleRuleVersion()` を 2・3 を許す形に、関連テストの期待値も更新。
- 注意：`battleRuleVersion` は本来「配点・勝敗の決め方」の版。出題の作り方の互換のために上げるのは
  意味の混同になる（コメント・仕様書に理由を残すこと）。

### 効果と限界
- 古いアプリがホストの場合：ロビーで「対戦ルールのバージョンが一致しません。アプリを更新してください。」が
  古いアプリ自身の画面に出て、開始できなくなる（＝古いアプリの人に更新を促せる唯一の経路）。
- 古いアプリが参加者の場合：古いアプリの参加者側にはこの文言は出ない（古いアプリは参加者側で設定を
  検証しない）。開始は新しいホストの照合で既に止まる。

### 順番（逆にすると新しいホストが設定を保存できなくなる）
1. ルールを公開（2 と 3 の両方を許す）。
2. アプリを `ruleVersion: 3` で公開。

### ロールバック
1. アプリを `ruleVersion: 2` に戻して公開し、全員の端末が更新されるのを待つ。
2. その後でルールを `=== 2` に戻す（先にルールを戻すと、まだ3を書く端末が設定を保存できなくなる）。

---

## 案C（推奨度：低）試合ごとの指紋を、試合のデータの中へ書き込み一回きりで残す

`rooms/$roomId/matches/$matchId/lyricsQuestionChecks/$uid` に、参加者本人が試合中だけ1回書ける場所を作る案。
指紋を後から書き換えられない・試合のデータと一緒に残る利点があるが、再接続で作り直した指紋を書けない
（write-once）ため扱いが複雑になる。今の `players/$uid/lyricsMatchCheck`（毎回上書き）で目的は果たせるので、
今回は提案のみ（差分は省略。必要になったら `answers/$questionIndex/$uid` の書き込み条件を参考に作る）。
