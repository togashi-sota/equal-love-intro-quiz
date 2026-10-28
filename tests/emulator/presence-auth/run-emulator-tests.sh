#!/usr/bin/env bash
# 在席・アカウント保護のエミュレータ検証を1回で実行する（起動 → 検証 → 停止）。本番の Firebase には繋がない。
#
# 準備（初回だけ）：リポジトリの外のフォルダに道具を入れる（リポジトリには node_modules を置かない）
#   mkdir -p <道具のフォルダ> && cd <道具のフォルダ> && npm init -y && npm i firebase-tools firebase@10.7.1
#   Java 11 以上（Realtime Database エミュレータが使う）
# 実行：
#   EMU_TOOLS_DIR=<道具のフォルダ> bash tests/emulator/presence-auth/run-emulator-tests.sh
#
# ・プロジェクトIDは demo-equallove-presence（demo- で始まる ID は Google のサーバーに一切繋がない決まり）
# ・ポート：database 9200 / auth 9299 / hub 4420 / logging 4520、UI は使わない
# ・emulators:exec は検証が終わると自動でエミュレータを止める
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
: "${EMU_TOOLS_DIR:?EMU_TOOLS_DIR（firebase-tools と firebase@10.7.1 を入れたフォルダ）を指定してください}"

# 修正前の presenceSync.js（古い版のアプリとの組み合わせの確認用。82000d6 = 今回の修正の直前のコミット）
git -C "$REPO" show 82000d6:js/presenceSync.js > "$EMU_TOOLS_DIR/presenceSync.legacy.js"
cp "$HERE/firebase.json" "$EMU_TOOLS_DIR/firebase.json"

cd "$EMU_TOOLS_DIR"
# Windows の Java は一時フォルダの短縮名（TKGGA_~1 など）で内部の通信路を作れないことがあるため、TCP の方式を使わせる
export JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:/nonexistent-emulator-dir"
export NO_UPDATE_NOTIFIER=1
export EMU_TOOLS_DIR
export EMU_LEGACY_PRESENCE_FILE="$EMU_TOOLS_DIR/presenceSync.legacy.js"
# emulators:exec は Windows では cmd.exe で実行するため、Git Bash の /c/... ではなく C:/... の形と file:// URL を渡す
HERE_NATIVE="$(cd "$HERE" && (pwd -W 2>/dev/null || pwd))"
LOADER_URL="$(node -e "console.log(require('url').pathToFileURL(process.argv[1]).href)" "$HERE_NATIVE/loader.mjs")"
status=0
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec \
  --only database,auth --project demo-equallove-presence \
  "node --import $LOADER_URL \"$HERE_NATIVE/run.mjs\"" || status=$?

# Windows では Database エミュレータ（java）が停止の合図を無視して残ることがあるので、
# この検証が使ったポート 9200 の database エミュレータだけを止める（他の担当者のエミュレータ（別ポート）には触れない）
if command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | Where-Object { \$_.CommandLine -like '*firebase-database-emulator*--port 9200 *' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force; Write-Output ('stopped leftover database emulator pid ' + \$_.ProcessId) }" || true
fi
exit $status
