# 「正式な修正版だけ」を含む、小さい追加データパックを作るスクリプト（2026-08-29新設）。
#
# 【このスクリプトが必要な理由】
# 全曲パック（full.zip、300MB超）は、1曲だけの歌詞修正のような小さな訂正のためだけに
# 配り直すには重すぎる。data-packs/corrections-manifest.json（本人が手作業で管理する
# 「正式な修正版」曲IDの一覧）に登録済みの曲の中から、必要な分だけを選んで、
# 音源を含まない・容量の小さい「修正版パック」を作れるようにする。
#
# 【使い方】
#   cd dev && python generate_correction_pack.py <パック名> [曲ID...]
#
#   例1（今回の「僕のヒロイン」歌詞修正）：
#     python generate_correction_pack.py boku-no-heroine-lyrics-fix boku-no-heroine
#
#   例2（corrections-manifest.jsonに登録済みの修正を全部まとめる。曲IDを省略した場合）：
#     python generate_correction_pack.py all-corrections
#
# 曲IDを省略すると、data-packs/corrections-manifest.jsonに登録されている全曲・全データ種類が
# 対象になる。曲IDを指定すると、その曲についてcorrections-manifest.jsonに登録されている
# データ種類だけが対象になる（登録が無い曲IDを指定するとエラーにする＝「修正版」のつもりで
# 実は普通のデータを配ってしまう事故を防ぐため）。
#
# 【何が入るか】
# ・歌詞：assets/lyrics/local/<songId>-timing.json（存在すれば）
# ・音源：assets/audio/local/<songId>.mp3（存在すれば）
# ・コール／コールガイド：このスクリプトでは自動生成しない（PC側のdev/callEditor.html・
#   dev/callGuideGuideEditor.htmlの「書き出す」機能で出力したJSONを、生成されたフォルダへ
#   手作業で追加する必要がある。この場合はこのスクリプトの実行後、追加してから
#   package_zip.pyを実行すること）。
# 生成されるmanifest.jsonのcorrectionsフィールドには、対象にした曲ID・データ種類だけが
# 反映される（js/dataPackImport.jsのvalidateManifest()が理解する形式）。
#
# 【安全設計・著作権について】data-packs/<パック名>/自体は.gitignore対象
# （data-packs/*/*パターン）のため、生成される実データがGitへコミットされることはない。
# このスクリプト自身（生成ロジックのみ）はdev/generate_full_pack.pyと同じ理由でGit管理する。

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

DEV_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DEV_DIR.parent
SONGS_JS_PATH = PROJECT_ROOT / "js" / "data" / "songs.js"
AUDIO_LOCAL_DIR = PROJECT_ROOT / "assets" / "audio" / "local"
LYRICS_LOCAL_DIR = PROJECT_ROOT / "assets" / "lyrics" / "local"
DATA_PACKS_DIR = PROJECT_ROOT / "data-packs"
CORRECTIONS_MANIFEST_PATH = DATA_PACKS_DIR / "corrections-manifest.json"

PACK_TYPE = "equal-love-data-pack"
SCHEMA_VERSION = 1
CORRECTIONS_KEYS = ["lyrics", "audio", "calls", "callGuides"]


def load_corrections_manifest():
    if not CORRECTIONS_MANIFEST_PATH.exists():
        print(f"[エラー] {CORRECTIONS_MANIFEST_PATH} が見つかりません。先に修正対象を登録してください。")
        sys.exit(1)
    raw = json.loads(CORRECTIONS_MANIFEST_PATH.read_text(encoding="utf-8"))
    return {key: list(raw.get(key, [])) for key in CORRECTIONS_KEYS}


def load_song_titles():
    """曲ID→曲名の対応表を作る（パックのラベルを分かりやすくするためだけに使う）。"""
    if not SONGS_JS_PATH.exists():
        return {}
    import re

    text = SONGS_JS_PATH.read_text(encoding="utf-8")
    id_positions = [(m.group(1), m.start()) for m in re.finditer(r'id:\s*"([^"]+)"', text)]
    title_matches = [(m.group(1), m.start()) for m in re.finditer(r'title:\s*"([^"]+)"', text)]
    titles_by_id = {}
    for song_id, id_pos in id_positions:
        candidates = sorted((pos, title) for title, pos in title_matches if pos > id_pos)
        if candidates:
            titles_by_id[song_id] = candidates[0][1]
    return titles_by_id


def build_pack_label(selected, titles_by_id):
    # 【表示上の注意】js/main.jsの結果メッセージ側が、packLabelを既に「」で囲んで表示する
    # （例：「<packLabel>」を読み込みました）ため、ここでは二重かっこにならないよう
    # packLabel自体には「」を含めない。
    involved_song_ids = sorted({sid for ids in selected.values() for sid in ids})
    if len(involved_song_ids) == 1:
        title = titles_by_id.get(involved_song_ids[0], involved_song_ids[0])
        kinds = [key for key, ids in selected.items() if ids]
        kind_label = "・".join(
            {"lyrics": "歌詞", "audio": "音源", "calls": "コール", "callGuides": "コールガイド"}[k] for k in kinds
        )
        return f"{title} {kind_label}修正版パック"
    return f"修正版パック（{len(involved_song_ids)}曲）"


def main():
    if len(sys.argv) < 2:
        print("使い方: python generate_correction_pack.py <パック名> [曲ID...]")
        sys.exit(1)

    pack_name = sys.argv[1]
    requested_song_ids = sys.argv[2:]

    all_corrections = load_corrections_manifest()

    if requested_song_ids:
        selected = {key: [sid for sid in ids if sid in requested_song_ids] for key, ids in all_corrections.items()}
        covered = {sid for ids in selected.values() for sid in ids}
        missing = [sid for sid in requested_song_ids if sid not in covered]
        if missing:
            print(
                f"[エラー] 指定した曲ID {missing} は corrections-manifest.json に登録されていません。\n"
                "先にdata-packs/corrections-manifest.jsonへ登録してから実行してください"
                "（未登録の曲を修正版パックに含めてしまう事故を防ぐため、あえてエラーにしています）。"
            )
            sys.exit(1)
    else:
        selected = all_corrections

    if not any(selected.values()):
        print("[エラー] 対象になる曲がありません（corrections-manifest.jsonの中身、または指定した曲IDを確認してください）。")
        sys.exit(1)

    pack_dir = DATA_PACKS_DIR / pack_name
    pack_dir.mkdir(parents=True, exist_ok=True)
    for existing in pack_dir.iterdir():
        if existing.name != ".gitkeep":
            existing.unlink()

    copied_lyrics, missing_lyrics = [], []
    for song_id in selected["lyrics"]:
        src = LYRICS_LOCAL_DIR / f"{song_id}-timing.json"
        if src.exists():
            shutil.copyfile(src, pack_dir / f"{song_id}-timing.json")
            copied_lyrics.append(song_id)
        else:
            missing_lyrics.append(song_id)

    copied_audio, missing_audio = [], []
    for song_id in selected["audio"]:
        src = AUDIO_LOCAL_DIR / f"{song_id}.mp3"
        if src.exists():
            shutil.copyfile(src, pack_dir / f"{song_id}.mp3")
            copied_audio.append(song_id)
        else:
            missing_audio.append(song_id)

    if selected["calls"] or selected["callGuides"]:
        print(
            "[注意] corrections-manifest.jsonにcalls/callGuidesの修正が登録されていますが、"
            "このスクリプトは自動でファイルを持ってきません。dev/callEditor.html・"
            "dev/callGuideEditor.htmlの「書き出す」機能で出力したJSONを、手作業で"
            f"{pack_dir} へ追加してから package_zip.py を実行してください。"
        )

    titles_by_id = load_song_titles()
    involved_song_ids = sorted({sid for ids in selected.values() for sid in ids})
    manifest = {
        "type": PACK_TYPE,
        "schemaVersion": SCHEMA_VERSION,
        "packKind": "correction",
        "packId": pack_name,
        "packLabel": build_pack_label(selected, titles_by_id),
        "songIds": involved_song_ids,
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "corrections": {key: ids for key, ids in selected.items() if ids},
    }
    manifest_path = pack_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"パック名: {pack_name}")
    print(f"パックラベル: {manifest['packLabel']}")
    print(f"対象曲: {involved_song_ids}")
    print(f"歌詞をコピー: {copied_lyrics}" + (f"（見つからず未コピー: {missing_lyrics}）" if missing_lyrics else ""))
    print(f"音源をコピー: {copied_audio}" + (f"（見つからず未コピー: {missing_audio}）" if missing_audio else ""))
    print(f"\n書き出し完了: {manifest_path}")
    print(f"次は: cd dev && python package_zip.py {pack_name}")


if __name__ == "__main__":
    main()
