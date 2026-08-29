# 「全曲パック」（data-packs/full/、新規ユーザー向けに全曲をまとめて配布する
# 追加データパック）を、この端末の個人アーカイブ（assets/audio/local/・
# assets/lyrics/local/）とjs/data/songs.jsから自動的に組み立て直すスクリプト
# （2026-08-27新設）。
#
# 【このスクリプトが必要な理由】
# 新しいシングルを追加するたびに、既存曲＋新曲をまとめた「全曲パック」を手作業で
# 組み立て直すのは手間がかかり、ファイルの入れ忘れ等のミスも起こりやすい。
# このスクリプトは、dev/generate_audio_metadata.pyと同じ考え方（songs.js・
# assets/*/local/を正として、生成物を機械的に作り直す）で、data-packs/full/の
# 中身をいつでも安全に最新化できるようにする。
#
# 【使い方】新しいシングルを追加するとき：
#   1. 音源（<songId>.mp3）をassets/audio/local/へ置く（今までどおりの個人アーカイブ）。
#   2. 歌詞タイミングJSON（<songId>-timing.json）があればassets/lyrics/local/へ置く
#      （無い曲は音源だけでパックに含まれる。歌詞は後から追加できる）。
#   3. js/data/songs.jsへ新曲を登録する。
#   4. このスクリプトを実行する： cd dev && python generate_full_pack.py
#   これだけで、data-packs/full/（音源・歌詞・manifest.json）が
#   songs.js登録曲・個人アーカイブの中身に合わせて、毎回ゼロから作り直される。
#
# 【安全設計・著作権について】data-packs/full/自体は.gitignore対象（data-packs/full/*、
# .gitkeepを除く）のため、このスクリプトが生成する実音源・歌詞タイミングJSONが
# Gitへコミットされることは無い。このスクリプト自身（生成ロジックのみ、著作権データを
# 一切含まない）は、dev/generate_audio_metadata.pyと同じ理由でGit管理する。
#
# 【決定論性】songs.js・assets/audio/local/・assets/lyrics/local/の中身が同じであれば、
# 何度実行してもdata-packs/full/の中身は同じになる（実行するたびの日時だけはcreatedAtに
# 反映されるが、それ以外の内容は変化しない）。

import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

DEV_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DEV_DIR.parent
SONGS_JS_PATH = PROJECT_ROOT / "js" / "data" / "songs.js"
AUDIO_LOCAL_DIR = PROJECT_ROOT / "assets" / "audio" / "local"
LYRICS_LOCAL_DIR = PROJECT_ROOT / "assets" / "lyrics" / "local"
FULL_PACK_DIR = PROJECT_ROOT / "data-packs" / "full"
CORRECTIONS_MANIFEST_PATH = PROJECT_ROOT / "data-packs" / "corrections-manifest.json"

# js/dataPackImport.jsのvalidateManifest()が認識するcorrectionsの項目名。
CORRECTIONS_KEYS = ["lyrics", "audio", "calls", "callGuides"]

PACK_TYPE = "equal-love-data-pack"
SCHEMA_VERSION = 1
PACK_ID = "all-songs"
PACK_LABEL = "全曲パック"


def list_song_ids_from_songs_js():
    """songs.jsのSONGS配列に登録されている全曲IDを、記載順のまま返す。
    dev/generate_audio_metadata.py・tools/lyrics-pipeline/common.pyと同じ正規表現方式。"""
    if not SONGS_JS_PATH.exists():
        print(f"[エラー] songs.jsが見つかりません: {SONGS_JS_PATH}")
        sys.exit(1)
    text = SONGS_JS_PATH.read_text(encoding="utf-8")
    return re.findall(r'id:\s*"([^"]+)"', text)


def load_corrections():
    """data-packs/corrections-manifest.json（本人が手作業で管理する「正式な修正版」曲IDの
    一覧）を読み込み、js/dataPackImport.jsのマニフェストcorrections項目の形へ変換する。
    ファイルが無い・全項目が空の場合はNoneを返す（manifestにcorrectionsを含めない＝
    今までどおり何も上書きしない、という安全側の既定動作のため）。"""
    if not CORRECTIONS_MANIFEST_PATH.exists():
        return None
    raw = json.loads(CORRECTIONS_MANIFEST_PATH.read_text(encoding="utf-8"))
    corrections = {key: raw.get(key, []) for key in CORRECTIONS_KEYS if raw.get(key)}
    return corrections or None


def clear_full_pack_dir():
    """前回生成したファイルを掃除してから作り直す（.gitkeepだけは残す）。
    stale（曲を削除した後も残り続けるファイル等）を防ぐため、単に上書きするのではなく
    毎回空の状態から作り直す。"""
    FULL_PACK_DIR.mkdir(parents=True, exist_ok=True)
    for existing in FULL_PACK_DIR.iterdir():
        if existing.name == ".gitkeep":
            continue
        existing.unlink()


def main():
    song_ids = list_song_ids_from_songs_js()
    clear_full_pack_dir()

    covered_audio = []
    missing_audio = []
    covered_lyrics = []

    for song_id in song_ids:
        audio_src = AUDIO_LOCAL_DIR / f"{song_id}.mp3"
        if audio_src.exists():
            shutil.copyfile(audio_src, FULL_PACK_DIR / f"{song_id}.mp3")
            covered_audio.append(song_id)
        else:
            missing_audio.append(song_id)

        lyrics_src = LYRICS_LOCAL_DIR / f"{song_id}-timing.json"
        if lyrics_src.exists():
            shutil.copyfile(lyrics_src, FULL_PACK_DIR / f"{song_id}-timing.json")
            covered_lyrics.append(song_id)

    manifest = {
        "type": PACK_TYPE,
        "schemaVersion": SCHEMA_VERSION,
        "packKind": "full",
        "packId": PACK_ID,
        "packLabel": PACK_LABEL,
        # 音源が無い曲もsongIdsには含める（js/dataPackImport.jsのmanifestSongIdsNotCovered
        # 判定が、不足を安全に警告表示してくれるため。無理に除外する必要はない）。
        "songIds": song_ids,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
    corrections = load_corrections()
    if corrections:
        manifest["corrections"] = corrections

    manifest_path = FULL_PACK_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"songs.js登録曲数: {len(song_ids)}件")
    print(f"音源をコピーできた曲: {len(covered_audio)}件")
    print(f"歌詞タイミングJSONをコピーできた曲: {len(covered_lyrics)}件")
    if corrections:
        print(f"正式な修正版として上書きを許可する曲（corrections-manifest.jsonより）: {corrections}")
    if missing_audio:
        print(f"\n[警告] 音源が見つからず全曲パックに含まれなかった曲（{len(missing_audio)}件）:")
        for song_id in missing_audio:
            print(f"  - {song_id}")
    print(f"\n書き出し完了: {manifest_path}")


if __name__ == "__main__":
    main()
