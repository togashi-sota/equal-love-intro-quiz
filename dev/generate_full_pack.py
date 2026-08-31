# 「全曲パック」（data-packs/full/、新規ユーザー向けに全曲をまとめて配布する
# 追加データパック）を、この端末の個人アーカイブ（assets/audio/local/・
# assets/lyrics/local/・assets/calls/local/）とjs/data/songs.jsから自動的に
# 組み立て直すスクリプト（2026-08-27新設、2026-09-06にコール・コールガイドの
# 取り込みを追加）。
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
# 【コールデータ・コールガイドの取り込み方（2026-09-06新設）】
# コールデータはPCのdev/callEditor.htmlでしか作成できず、曲ごとのファイルではなく
# 「全コールデータを書き出す」ボタンで曲をまとめた1つのJSON（type: "equal-love-call-data"）
# として書き出す設計になっている（js/callStorage.jsのexportAllCallData()参照）。
# 同様にコールガイドはdev/callGuideEditor.htmlの書き出しボタンで1つのJSON
# （type: "equal-love-call-guide-data"）になる（js/callGuideStorage.jsの
# exportAllCallGuideData()参照）。このスクリプトは、書き出したファイルを以下の場所に
# 置いておけば、全曲パックへそのまま取り込む：
#   assets/calls/local/calls-export.json         … 「全コールデータを書き出す」の出力
#   assets/calls/local/call-guides-export.json   … コールガイド書き出しの出力
# どちらも無ければ、音源・歌詞だけのパックとして今までどおり生成される（必須ではない）。
# 曲ごとに分けて置く必要はなく、この端末に保存されている全曲分をまとめて書き出した
# ファイルをそのまま置くだけでよい（js/dataPackImport.jsの取り込み側は、ファイル名では
# なく中身のtypeで判別するため、ファイル名はこの2つに固定しなくても動作はするが、
# このスクリプトが自動で拾えるよう上記の名前を推奨する）。
#
# 【安全設計・著作権について】data-packs/full/自体は.gitignore対象（data-packs/full/*、
# .gitkeepを除く）のため、このスクリプトが生成する実音源・歌詞タイミングJSON・
# コールデータがGitへコミットされることは無い。assets/calls/local/も同じ理由で
# .gitignore対象にしてある。このスクリプト自身（生成ロジックのみ、著作権データを
# 一切含まない）は、dev/generate_audio_metadata.pyと同じ理由でGit管理する。
#
# 【決定論性】songs.js・assets/audio/local/・assets/lyrics/local/・assets/calls/local/の
# 中身が同じであれば、何度実行してもdata-packs/full/の中身は同じになる（実行するたびの
# 日時だけはcreatedAtに反映されるが、それ以外の内容は変化しない）。

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
CALLS_LOCAL_DIR = PROJECT_ROOT / "assets" / "calls" / "local"
CALLS_EXPORT_PATH = CALLS_LOCAL_DIR / "calls-export.json"
CALL_GUIDES_EXPORT_PATH = CALLS_LOCAL_DIR / "call-guides-export.json"
CALL_DATA_TYPE = "equal-love-call-data"
CALL_GUIDE_DATA_TYPE = "equal-love-call-guide-data"
FULL_PACK_DIR = PROJECT_ROOT / "data-packs" / "full"

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


def copy_call_export(src_path, expected_type, count_field):
    """コール／コールガイドの書き出しJSONを検証してからdata-packs/full/へコピーする。
    存在しなければ（None, "見つからない"）、typeが違えば（None, "type不一致"）を返し、
    誤って別の種類のJSONを取り込まないようにする（js/dataPackImport.jsのclassifyJsonContent()
    と同じ判定基準＝中身のtypeフィールドで見分ける）。"""
    if not src_path.exists():
        return None, "見つからない"
    try:
        data = json.loads(src_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None, "JSONとして読み込めない"
    if not isinstance(data, dict) or data.get("type") != expected_type:
        return None, f"typeが{expected_type}ではない"
    shutil.copyfile(src_path, FULL_PACK_DIR / src_path.name)
    count = len(data.get(count_field, []) or [])
    return count, None


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

    # 【2026-09-06新設】コールデータ・コールガイドは曲ごとのファイルではなく、この端末の
    # 全曲分をまとめて書き出した1つのJSONを丸ごと取り込む（copy_call_export()参照）。
    call_count, call_skip_reason = copy_call_export(CALLS_EXPORT_PATH, CALL_DATA_TYPE, "songs")
    guide_count, guide_skip_reason = copy_call_export(CALL_GUIDES_EXPORT_PATH, CALL_GUIDE_DATA_TYPE, "guides")

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

    manifest_path = FULL_PACK_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"songs.js登録曲数: {len(song_ids)}件")
    print(f"音源をコピーできた曲: {len(covered_audio)}件")
    print(f"歌詞タイミングJSONをコピーできた曲: {len(covered_lyrics)}件")
    if missing_audio:
        print(f"\n[警告] 音源が見つからず全曲パックに含まれなかった曲（{len(missing_audio)}件）:")
        for song_id in missing_audio:
            print(f"  - {song_id}")

    if call_count is not None:
        print(f"コールデータ: {call_count}曲分を取り込みました（{CALLS_EXPORT_PATH.name}）")
    else:
        print(f"コールデータ: 取り込みませんでした（{call_skip_reason}: {CALLS_EXPORT_PATH}）")
    if guide_count is not None:
        print(f"コールガイド: {guide_count}件を取り込みました（{CALL_GUIDES_EXPORT_PATH.name}）")
    else:
        print(f"コールガイド: 取り込みませんでした（{guide_skip_reason}: {CALL_GUIDES_EXPORT_PATH}）")

    print(f"\n書き出し完了: {manifest_path}")


if __name__ == "__main__":
    main()
