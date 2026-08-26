# data-packs/21st/ や data-packs/full/ の中身（manifest.json＋音源mp3＋歌詞JSON…）を、
# 配布しやすい1個のZIPファイルへまとめるスクリプト（2026-08-27新設）。
#
# 【このスクリプトが必要な理由】
# 「追加データパックを読み込む」は、以前は複数ファイルをまとめて選択する方式のみだった。
# 実機（iPhone）で試すと、ファイル選択画面で保存場所まで移動して複数ファイルを選ぶ操作が
# 分かりにくいとの指摘を受けた（本人フィードバック）。js/zipPackImport.jsがブラウザ側で
# ZIP1個の展開に対応したので、こちらはその配布物（ZIP）を作る側のスクリプトになる。
#
# 【使い方】
#   cd dev && python package_zip.py 21st   … data-packs/21st/ → data-packs/21st.zip
#   cd dev && python package_zip.py full   … data-packs/full/ → data-packs/full.zip
#
# 【安全設計・著作権について】data-packs/21st/・data-packs/full/自体が.gitignore対象なのと
# 同じ理由で、ここで生成するdata-packs/*.zipも.gitignore対象にしてある（実音源・歌詞入りの
# ZIPがGitへコミットされることは無い）。このスクリプト自身（ZIP化ロジックのみ、著作権
# データを一切含まない）はGit管理する。
#
# 【圧縮方式について】zipfile.ZIP_DEFLATEDを使う（js/zipPackImport.jsがブラウザ標準の
# DecompressionStream("deflate-raw")でこの方式だけ解凍できるようにしてあるため）。
# フォルダ構成はフラット（サブフォルダなし）のまま、ファイル名だけをZIPへ格納する
# （data-packs/README.mdに書かれている、このプロジェクトのパック形式と同じ前提）。

import sys
import zipfile
from pathlib import Path

DEV_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DEV_DIR.parent
DATA_PACKS_DIR = PROJECT_ROOT / "data-packs"


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("21st", "full"):
        print("使い方: python package_zip.py <21st|full>")
        sys.exit(1)

    pack_name = sys.argv[1]
    source_dir = DATA_PACKS_DIR / pack_name
    if not source_dir.is_dir():
        print(f"[エラー] パックのフォルダが見つかりません: {source_dir}")
        sys.exit(1)

    # .gitkeepだけのフォルダ（＝実データがまだ投入されていない）でZIPを作っても
    # 意味が無いため、事前に気付けるよう警告する。
    source_files = [f for f in source_dir.iterdir() if f.is_file() and f.name != ".gitkeep"]
    if not source_files:
        print(f"[警告] {source_dir} には.gitkeep以外のファイルがありません。先にパックを組み立ててください。")
        sys.exit(1)

    zip_path = DATA_PACKS_DIR / f"{pack_name}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_path in sorted(source_files):
            zip_file.write(file_path, arcname=file_path.name)

    print(f"{len(source_files)}件のファイルをまとめました: {zip_path}")


if __name__ == "__main__":
    main()
