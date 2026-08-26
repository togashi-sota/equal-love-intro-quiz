# 音源ファイル（assets/audio/local/*.mp3）から、各曲の正確な長さ（durationSec）を
# 機械的に計測し、js/data/audioMetadata.js を自動生成するスクリプト。
#
# 【このスクリプトが必要な理由】
# ランダム再生クイズのオンライン対戦（Phase4）では、「曲のどの位置から再生を始めるか」を
# 全端末で完全に一致させる必要がある。ブラウザが実際に音源を読み込んで報告する
# audioElement.duration は、OS・ブラウザのMP3デコーダー実装差により端末ごとに
# ミリ秒〜コンマ数秒単位でズレることがあるため、乱数計算の入力には使えない。
# そのため、あらかじめこのスクリプトで全曲分の長さを1回だけ正確に計測し、
# 固定値としてjs/data/audioMetadata.jsへ保存しておく（詳細はHANDOFF.md 10-64章参照）。
#
# 【このファイルの置き場所について、2026-08-08】
# 当初はtools/audio-metadata/に置いていたが、tools/ディレクトリは丸ごと.gitignore対象
# （歌詞タイミング解析パイプライン用の重い仮想環境・試作段階のPythonコードを非公開にする
# ための設定）であり、このスクリプトはそれとは性質が異なる
# （軽量・完成済み・アプリ本体が読み込む生成物を作る）ため、本人の指示により、
# 既存の「Git管理される開発者向けツール置き場」であるdev/へ移動した
# （dev/にはこれまでlyricsEditor.js等のブラウザ用ツールしか無かったが、
# Pythonスクリプトを置いてはいけない理由は無いと判断）。
# 生成物であるjs/data/audioMetadata.js自体は、通常のjs/data/配下のファイルとして
# 引き続きGit管理される。音源ファイル本体（assets/audio/local/*.mp3）は
# 著作権保護のため、これまでどおりGit管理しない。
#
# 【使用方法・再生成コマンド】音源を追加・差し替えたときは、このスクリプトを再実行するだけでよい。
#   > cd dev
#   > python generate_audio_metadata.py
#
# 【使用ツール】ffprobe（FFmpegに含まれる、動画・音声の情報を読み取るコマンドラインツール）。
#   事前にFFmpegをインストールし、ffprobeコマンドにPATHが通っている必要がある
#   （Pythonの音声ライブラリを別途pip installする必要はない）。
#
# 【精度】小数第3位（ミリ秒相当）で統一する。全端末が同じ固定値を読み込むため、
#   JavaScript側で改めて丸め直す必要はない。
#
# 【個人情報について】このファイルは絶対パス・ユーザー名等のローカル固有情報を含まない
# （すべてPath(__file__)から相対的に解決している）。
#
# 【2026-08-27修正】このスクリプトの出力テンプレートには、以前`hasAudioSource()`関数
# （2026-08-17追加、js/songlist.js・js/customQuizScreen.jsが参照）が含まれておらず、
# 生成後に手作業でjs/data/audioMetadata.jsへ追記されていたため、このスクリプトを
# 再実行した際に消えてしまう不具合があった。この関数もテンプレートへ含めるよう修正した
# （再実行しても失われない）。

import re
import subprocess
import sys
from pathlib import Path

DEV_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DEV_DIR.parent
SONGS_JS_PATH = PROJECT_ROOT / "js" / "data" / "songs.js"
AUDIO_LOCAL_DIR = PROJECT_ROOT / "assets" / "audio" / "local"
OUTPUT_JS_PATH = PROJECT_ROOT / "js" / "data" / "audioMetadata.js"

# 「異常に短い／長い曲」と見なす閾値（秒）。エラーにはせず警告だけ表示する
# （実在する曲でこの範囲を外れることは通常ないため、取り込みミスの早期発見が目的）。
SUSPICIOUSLY_SHORT_SEC = 10.0
SUSPICIOUSLY_LONG_SEC = 600.0  # 10分。既存81曲の最長でも数分程度のため、十分な余裕を持たせた閾値

DURATION_DECIMAL_PLACES = 3


def list_song_ids_from_songs_js():
    """songs.jsのSONGS配列に登録されている全曲IDを、記載順のまま返す。
    正規表現ベースの読み取りは tools/lyrics-pipeline/common.py と同じ方式。"""
    if not SONGS_JS_PATH.exists():
        print(f"[エラー] songs.jsが見つかりません: {SONGS_JS_PATH}")
        sys.exit(1)
    text = SONGS_JS_PATH.read_text(encoding="utf-8")
    return re.findall(r'id:\s*"([^"]+)"', text)


def probe_duration_sec(mp3_path):
    """ffprobeを呼び出し、音源ファイルの長さ（秒）を取得する。
    失敗した場合は (None, エラー内容の文字列) を返す。"""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(mp3_path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError:
        return None, "ffprobeコマンドが見つかりません（FFmpegがインストールされているか確認してください）"
    except subprocess.TimeoutExpired:
        return None, "ffprobeの実行がタイムアウトしました"

    if result.returncode != 0:
        return None, f"ffprobeがエラー終了しました: {result.stderr.strip()}"

    raw = result.stdout.strip()
    try:
        value = float(raw)
    except ValueError:
        return None, f"ffprobeの出力を数値として解釈できません: {raw!r}"

    if not (value == value) or value in (float("inf"), float("-inf")):  # NaN・無限大の検出
        return None, f"ffprobeが不正な値を返しました: {raw!r}"
    if value <= 0:
        return None, f"曲の長さが0以下です: {value}"

    return round(value, DURATION_DECIMAL_PLACES), None


def main():
    song_ids = list_song_ids_from_songs_js()

    audio_files = sorted(AUDIO_LOCAL_DIR.glob("*.mp3")) if AUDIO_LOCAL_DIR.exists() else []
    audio_id_set = {path.stem for path in audio_files}

    missing_audio = [song_id for song_id in song_ids if song_id not in audio_id_set]
    orphan_audio = sorted(audio_id_set - set(song_ids))

    metadata = {}
    failed = []
    suspicious = []

    for song_id in song_ids:
        if song_id in missing_audio:
            continue
        mp3_path = AUDIO_LOCAL_DIR / f"{song_id}.mp3"
        duration_sec, error = probe_duration_sec(mp3_path)
        if error:
            failed.append((song_id, error))
            continue
        if duration_sec < SUSPICIOUSLY_SHORT_SEC or duration_sec > SUSPICIOUSLY_LONG_SEC:
            suspicious.append((song_id, duration_sec))
        metadata[song_id] = duration_sec

    # ===== 結果の報告 =====
    print(f"songs.js登録曲数: {len(song_ids)}件")
    print(f"assets/audio/local/内のmp3ファイル数: {len(audio_files)}件")
    print(f"durationSecを生成できた曲: {len(metadata)}件")

    if missing_audio:
        print(f"\n[警告] 音源ファイルが見つからない曲（{len(missing_audio)}件、durationSecは生成されません）:")
        for song_id in missing_audio:
            print(f"  - {song_id}")

    if orphan_audio:
        print(f"\n[警告] songs.jsに存在しない曲IDの音源ファイル（{len(orphan_audio)}件、無視されます）:")
        for song_id in orphan_audio:
            print(f"  - {song_id}.mp3")

    if failed:
        print(f"\n[エラー] durationSecの取得に失敗した曲（{len(failed)}件）:")
        for song_id, error in failed:
            print(f"  - {song_id}: {error}")

    if suspicious:
        print(f"\n[注意] 長さが{SUSPICIOUSLY_SHORT_SEC}秒未満、または{SUSPICIOUSLY_LONG_SEC}秒超だった曲（取り込みミスの可能性、値はそのまま採用）:")
        for song_id, duration_sec in suspicious:
            print(f"  - {song_id}: {duration_sec}秒")

    # ===== js/data/audioMetadata.js の生成 =====
    # song_idsの記載順（songs.jsの並び順）をそのまま使うため、同じ入力（同じsongs.js・
    # 同じ音源ファイル群）に対しては、何度実行しても出力内容が1バイトも変わらない
    # （決定論的な生成。本人の指示どおり、diffが出ないことを確認済み。HANDOFF.md参照）。
    lines = []
    lines.append("// 音源ファイルから機械的に計測した、曲ごとの長さ（durationSec、秒・小数第3位）のデータ。")
    lines.append("// dev/generate_audio_metadata.py により自動生成される。")
    lines.append("// 【手で編集しないこと】音源を追加・差し替えたときは、このファイルを直接編集せず、")
    lines.append("// 生成スクリプトを再実行すること。")
    lines.append("//")
    lines.append("// 【用途】ランダム再生クイズの「曲のどこから再生を始めるか」の乱数計算は、")
    lines.append("// 端末ごとにブレうるaudioElement.durationではなく、必ずこの固定値を使う")
    lines.append("// （詳細はjs/randomPlaybackEngine.js・HANDOFF.md 10-64章参照）。")
    lines.append("export const AUDIO_METADATA = {")
    for song_id in song_ids:
        if song_id not in metadata:
            continue
        duration_sec = metadata[song_id]
        lines.append(f'  "{song_id}": {{ durationSec: {duration_sec:.3f} }},')
    lines.append("};")
    lines.append("")
    lines.append("// この曲の音源が実際に存在するかどうか（2026-08-17追加、本人指示）。")
    lines.append("// 「この端末が音源を読み込み済みか」（js/audioStorage.jsのgetAudioBlob、IndexedDBの")
    lines.append("// 話）とは別で、こちらは「そもそも音源という実体がこの世に存在するか」を表す。")
    lines.append("// AUDIO_METADATAはdev/generate_audio_metadata.pyが実際の音源ファイルから機械生成する")
    lines.append("// ため、ここに載っていない＝まだ音源自体が存在しない曲、と機械的に判定できる。")
    lines.append("// 表題曲だけ先行登録されていて音源がまだ無い21st以降のシングルのような曲を、")
    lines.append("// 曲名のハードコードなしに自動判定するために使う（js/songlist.js・js/customQuizScreen.js参照）。")
    lines.append("export function hasAudioSource(song) {")
    lines.append("  return Boolean(AUDIO_METADATA[song.id]);")
    lines.append("}")
    lines.append("")

    OUTPUT_JS_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n書き出し完了: {OUTPUT_JS_PATH}")

    if missing_audio or failed:
        print("\n未解決の問題があります。上記を確認してください。")
        sys.exit(1)


if __name__ == "__main__":
    main()
