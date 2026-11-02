# YouTube 出演図鑑の自動更新：最初の設定（本人用）

一度だけ設定すれば、あとは毎週自動で YouTube のデータが取り直され、規約（取得から30日まで）どおりに公開されます。
**キーやトークンは、このチャットや Claude・ChatGPT には貼らないでください。** 下の画面に直接入れます。

所要時間の目安：20〜30分（パソコンのブラウザで。コマンドの入力は要りません）

---

## 全体の形（なにが自動か）
```
毎週月曜 3時（日本時間）  Google Apps Script（本人の Google アカウント）
        │  GitHub に「今週の更新をして」と合図（workflow_dispatch）
        ▼
GitHub Actions（このリポジトリ）
        │  YouTube API で動画を取り直す → 出演を判定 → 検査
        │  → data/youtube-appearances.json を作り、Pages にだけ載せる（git にはコミットしない）
        ▼
アプリ（GitHub Pages）  取得から30日を過ぎたデータは表示しない
```
- 失敗したら：GitHub に Issue が自動でできる（メールが届く）。前の週の更新が止まっていたら、Apps Script からもメールが届く
- 予備：GitHub の定期実行（毎週木曜）も動く（リポジトリを60日更新しないと、この予備だけ止まる。月曜の合図は止まらない）

---

## 1. GitHub に YouTube の API キーを登録する
1. https://github.com/togashi-sota/equal-love-intro-quiz を開く
2. 上の［Settings］→ 左の［Secrets and variables］→［Actions］
3. ［New repository secret］
4. Name に `YOUTUBE_API_KEY`、Secret に API キー（パソコンの `C:\EqualLove-tools\youtube_api_key.txt` の1行目）を貼る →［Add secret］
   - 一度保存すると、GitHub の画面でも中身は見えません（ログでも伏せ字になります）

## 2. GitHub の「合図用のトークン」を作る（期限なし・このリポジトリだけ・最小の権限）
1. GitHub の右上の自分のアイコン →［Settings］→ 左の一番下［Developer settings］
2. ［Personal access tokens］→［Fine-grained tokens］→［Generate new token］
3. 次のように選ぶ
   - Token name：`youtube-weekly-dispatch`
   - Expiration：**No expiration**（期限なし）
   - Repository access：**Only select repositories** → `equal-love-intro-quiz`
   - Permissions →［Repository permissions］→ **Actions：Read and write** だけ（Metadata：Read-only は自動で付く。ほかは触らない）
4. ［Generate token］→ 表示された文字列をコピー（この画面を閉じると二度と見られません。次の 3 ですぐ使う）
   - このトークンでできるのは「このリポジトリの Actions を動かす・止める」ことだけです。コードの書き換え・公開の設定はできません

## 3. Google Apps Script に「毎週の合図」を置く
1. https://script.google.com を開く（API キーを作ったのと同じ Google アカウント）→［新しいプロジェクト］
2. 名前を `EqualLove YouTube 週1の合図` にする
3. 最初からある中身を消して、リポジトリの `scripts/youtube/apps-script/Code.gs` の中身を全部貼る → 保存（Ctrl＋S）
4. 左の歯車［プロジェクトの設定］→ 一番下の［スクリプト プロパティを追加］
   - プロパティ：`GITHUB_TOKEN`、値：2 でコピーしたトークン →［スクリプト プロパティを保存］
5. 左の［エディタ］に戻る → 上の関数の選択で `installWeeklyTrigger` を選ぶ →［実行］
   - 初回は「承認が必要です」と出るので、自分のアカウントを選び、［許可］（外部への接続：GitHub と、公開中のアプリのデータの確認に使います）
6. 左の時計［トリガー］に `weeklyRefresh`（週ごと・月曜・午前3時〜4時）が1つあれば完了

## 4. 動き始めたかを確かめる（公開の仕組みが有効になったあと）
- 統合の担当が `.github/workflows/deploy-pages.yml` を新しい形に置き換えて公開したら、1回だけ：
  - Apps Script のエディタで `weeklyRefresh` を選んで［実行］→ エラーが出なければ OK
  - GitHub の［Actions］に「Deploy to GitHub Pages」が動いた記録が1つ増え、緑のチェックになれば成功
- アプリの YouTube 出演の画面の一番下に「○年○月○日に…調べ」と、その日の日付が出れば成功

## 5. 通知を受け取れるようにする（最初に1回確かめる）
- GitHub：右上のアイコン →［Settings］→［Notifications］で、「Watching」の Issues の通知がメールで届く設定になっているか
- リポジトリの上の［Watch］が「All Activity」か「Participating and @mentions」以外（Issues を含む）になっているか

---

## 困ったとき
| 届いたもの | 意味 | すること |
|---|---|---|
| GitHub の Issue「YouTube 出演図鑑の自動更新：確認が必要です」 | 取得・検査に失敗した／説明欄の出演者の表記が前と変わった動画がある | 本文の「結果」を読む。キーの問題なら 1 をやり直す。表記の変化なら、動画を見て `js/data/youtubeVerifiedJudgments.js` に書く（Claude に頼んでよい。キーは渡さない） |
| Apps Script のメール「Your script has recently failed…」 | GitHub への合図が通らない／前の週の更新が止まっている | メールの中の理由を読む。「HTTP 401／403」ならトークンが消えた・権限が足りない → 2 と 3-4 をやり直す |
| アプリに「YouTube の情報の更新が止まっています」 | 30日以上、更新できていない | 上の2つの通知を確かめる。GitHub の［Actions］→「Deploy to GitHub Pages」→［Run workflow］で手でも動かせる |

## キーが漏れたかもしれないとき
- Google Cloud Console →［API とサービス］→［認証情報］→ そのキーを削除 → 新しいキーを作る（API の制限：YouTube Data API v3 だけ）→ 1 で Secret を上書き
- トークンなら GitHub の［Fine-grained tokens］で削除 → 2・3-4 をやり直す
