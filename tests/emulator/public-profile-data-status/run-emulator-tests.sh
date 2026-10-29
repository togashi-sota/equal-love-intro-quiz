#!/usr/bin/env bash
# 公開プロフィールの dataStatus（データの状態の曲数）が、今の本番 Rules で書けるかをエミュレータで確かめる（起動 → 検証 → 停止）。
# 本番の Firebase には繋がない（demo- のプロジェクトID・外部通信の遮断は ../presence-auth/lib.mjs）。
# 準備は ../presence-auth/run-emulator-tests.sh と同じ（EMU_TOOLS_DIR に firebase-tools と firebase@10.7.1）。
# 実行：EMU_TOOLS_DIR=<道具のフォルダ> bash tests/emulator/public-profile-data-status/run-emulator-tests.sh
# ポート：database 9330 / auth 9339 / hub 4430 / logging 4530（在席の検証の 9200 等とはぶつからない）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${EMU_TOOLS_DIR:?EMU_TOOLS_DIR（firebase-tools と firebase@10.7.1 を入れたフォルダ）を指定してください}"
WORK="$EMU_TOOLS_DIR/ds-run"
mkdir -p "$WORK"
cp "$HERE/firebase.json" "$WORK/firebase.json"
cd "$WORK"
export JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:/nonexistent-emulator-dir"
export NO_UPDATE_NOTIFIER=1
export EMU_TOOLS_DIR
export EMU_DB_PORT=9330
export EMU_AUTH_PORT=9339
HERE_NATIVE="$(cd "$HERE" && (pwd -W 2>/dev/null || pwd))"
LOADER_URL="$(node -e "console.log(require('url').pathToFileURL(process.argv[1]).href)" "$HERE_NATIVE/../presence-auth/loader.mjs")"
status=0
node "$EMU_TOOLS_DIR/node_modules/firebase-tools/lib/bin/firebase.js" emulators:exec \
  --only database,auth --project demo-equallove-presence \
  "node --import $LOADER_URL \"$HERE_NATIVE/run.mjs\"" || status=$?
if command -v powershell >/dev/null 2>&1; then
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | Where-Object { \$_.CommandLine -like '*firebase-database-emulator*--port 9330 *' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force; Write-Output ('stopped leftover database emulator pid ' + \$_.ProcessId) }" || true
fi
exit $status
