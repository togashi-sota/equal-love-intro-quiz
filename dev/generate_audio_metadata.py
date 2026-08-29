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
#
# 【2026-08-30追加】アウトロクイズ（曲の最後5秒を聞いて曲名を当てるモード）用に、
# 「実際に音が鳴っている状態で終わる5秒間」の開始位置（outroStartSec）も、
# このスクリプトでまとめて計測するようにした。
#
# 単純に「曲の長さ-5秒」を再生開始位置にすると、フェードアウト・末尾の無音のせいで
# 「アウトロクイズを始めたら無音しか流れない」という事故が起こりうる。これを防ぐため、
# ffmpegの`silencedetect`フィルター（曲の音量を解析し、無音区間を検出する機能。
# 新たにライブラリをpip installする必要はなく、既存のffmpeg依存だけで動く）を使い、
# 曲の終わり側で「無音のまま曲が終わっている区間」を検出し、そこを避けた5秒間を
# 逆算する。具体的には：
#   1. silencedetectで検出された無音区間のうち、最後の「無音開始」時刻を見る
#   2. その無音が曲の終わりまで続いている（＝末尾の無音・フェードアウト）と判断できれば、
#      「無音が始まる時刻」を「実際に音が鳴っている部分の終わり」とみなす
#   3. そこから5秒さかのぼった時刻を outroStartSec とする（無音区間には絶対に入らない）
#   4. 曲の途中に短い無音（ブレイク等）があっても、それが「最後の無音区間」でなければ
#      （＝その後にまだ音が鳴る部分が続くなら）影響しない
# 誤判定を検知しやすくするため、計算結果が不自然な値（曲の長さに対して短すぎる等）の
# 場合は警告を出し、値自体はそのまま採用する（このあと人が目視で曲を実際に確認できるように）。

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

# アウトロ検出用の設定。
OUTRO_WINDOW_SEC = 5.0  # アウトロクイズの再生時間（本人指示：5秒固定）
SILENCE_NOISE_THRESHOLD_DB = "-40dB"  # これより静かな区間を「無音」とみなす
SILENCE_MIN_DURATION_SEC = 0.3  # これより短い静かな区間は無視する（曲中の一瞬の間等と区別）
# 「末尾の無音」とみなすため、無音の終了時刻がファイルの終わりからこの秒数以内なら
# 「曲の最後まで無音が続いている」と判断する（ffmpegの解析誤差・ID3タグ分の余白を考慮）。
TRAILING_SILENCE_TOLERANCE_SEC = 0.5
# outroStartSecが「曲の長さ - この秒数」より小さい（＝曲のかなり手前からしか鳴っていない）
# 場合は、目視確認を促すため警告を出す（値自体はそのまま採用する）。
SUSPICIOUSLY_LONG_TRAILING_SILENCE_SEC = 20.0


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


def detect_outro_start_sec(mp3_path, duration_sec):
    """ffmpegのsilencedetectフィルターを使い、「実際に音が鳴っている状態で終わる
    5秒間」の開始位置（秒）を計測する。末尾に無音・フェードアウトが無い曲は
    duration_sec - OUTRO_WINDOW_SEC をそのまま返す。
    戻り値: (outro_start_sec, 警告メッセージ or None)"""
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-i", str(mp3_path),
                "-af", f"silencedetect=noise={SILENCE_NOISE_THRESHOLD_DB}:d={SILENCE_MIN_DURATION_SEC}",
                "-f", "null",
                "-",
            ],
            capture_output=True,
            timeout=60,
        )
    except FileNotFoundError:
        return None, "ffmpegコマンドが見つかりません（FFmpegがインストールされているか確認してください）"
    except subprocess.TimeoutExpired:
        return None, "ffmpegの実行がタイムアウトしました"

    # silencedetectのログはstderrに出力される（-fオプションでの変換自体は正常終了しうるため、
    # returncodeでは判定しない）。音源のID3タグに日本語（Shift-JIS等）が含まれている場合、
    # 環境のデフォルト文字コード（Windowsではcp932）ではデコードに失敗することがあるため、
    # 生のbytesで受け取ってUTF-8（decode不能な部分は無視）でデコードする
    # （このログの内容自体は無音区間の秒数だけを正規表現で拾うため、文字化けしても影響しない）。
    log = result.stderr.decode("utf-8", errors="ignore")

    silence_starts = [float(m) for m in re.findall(r"silence_start:\s*(-?[\d.]+)", log)]
    silence_ends = [float(m) for m in re.findall(r"silence_end:\s*(-?[\d.]+)", log)]

    fallback = round(max(0.0, duration_sec - OUTRO_WINDOW_SEC), DURATION_DECIMAL_PLACES)

    if not silence_starts:
        # 無音区間が検出されなかった＝曲の最後まで実際に音が鳴っている。
        return fallback, None

    last_silence_start = silence_starts[-1]
    # 対応するsilence_endが記録されているか（＝無音がファイルの途中で終わり、また音が
    # 鳴り始めたか）を確認する。silence_startの数よりsilence_endの数が少なければ、
    # 最後の無音はファイルの終わりまで続いた（＝silence_endが出力されないまま終了した）ことを意味する。
    last_silence_is_trailing = len(silence_ends) < len(silence_starts)
    if not last_silence_is_trailing:
        # silence_endは記録されているが、それが曲の終わり近くであれば、
        # 実質的に「最後まで無音（に近い状態）」とみなしてよい。
        last_silence_end = silence_ends[-1]
        last_silence_is_trailing = (duration_sec - last_silence_end) <= TRAILING_SILENCE_TOLERANCE_SEC

    if not last_silence_is_trailing:
        # 最後に検出された無音の後にも、まだ実際に音が鳴っている区間がある
        # （曲中のブレイク等）＝末尾の無音ではないため、無視してよい。
        return fallback, None

    outro_start_sec = round(max(0.0, last_silence_start - OUTRO_WINDOW_SEC), DURATION_DECIMAL_PLACES)
    warning = None
    if duration_sec - outro_start_sec > OUTRO_WINDOW_SEC + SUSPICIOUSLY_LONG_TRAILING_SILENCE_SEC:
        warning = (
            f"末尾の無音区間が{duration_sec - last_silence_start:.1f}秒と長めです。"
            "実際に曲を聴いて確認することをおすすめします。"
        )
    return outro_start_sec, warning


def main():
    song_ids = list_song_ids_from_songs_js()

    audio_files = sorted(AUDIO_LOCAL_DIR.glob("*.mp3")) if AUDIO_LOCAL_DIR.exists() else []
    audio_id_set = {path.stem for path in audio_files}

    missing_audio = [song_id for song_id in song_ids if song_id not in audio_id_set]
    orphan_audio = sorted(audio_id_set - set(song_ids))

    metadata = {}
    outro_metadata = {}
    failed = []
    suspicious = []
    outro_failed = []
    outro_warnings = []

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

        outro_start_sec, outro_message = detect_outro_start_sec(mp3_path, duration_sec)
        if outro_start_sec is None:
            outro_failed.append((song_id, outro_message))
            continue
        outro_metadata[song_id] = outro_start_sec
        if outro_message:
            outro_warnings.append((song_id, outro_message))

    # ===== 結果の報告 =====
    print(f"songs.js登録曲数: {len(song_ids)}件")
    print(f"assets/audio/local/内のmp3ファイル数: {len(audio_files)}件")
    print(f"durationSecを生成できた曲: {len(metadata)}件")
    print(f"outroStartSecを生成できた曲: {len(outro_metadata)}件")

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

    if outro_failed:
        print(f"\n[エラー] outroStartSecの取得に失敗した曲（{len(outro_failed)}件）:")
        for song_id, error in outro_failed:
            print(f"  - {song_id}: {error}")

    if outro_warnings:
        print(f"\n[注意] アウトロの無音区間が長めだった曲（{len(outro_warnings)}件、目視確認推奨・値はそのまま採用）:")
        for song_id, warning in outro_warnings:
            print(f"  - {song_id}: {warning}")

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
    lines.append("//")
    lines.append("// outroStartSec：アウトロクイズ（曲の最後5秒を聞いて当てるモード）用に、")
    lines.append("// 「実際に音が鳴っている状態で終わる5秒間」の開始位置を機械計測した値。")
    lines.append("// フェードアウト・末尾の無音を自動検出し、それを避けた位置になっている")
    lines.append("// （ffmpegのsilencedetectフィルターで解析。詳細はこのスクリプト内のコメント参照）。")
    lines.append("// 末尾の無音が検出されなかった曲は durationSec - 5 がそのまま入っている。")
    lines.append("export const AUDIO_METADATA = {")
    for song_id in song_ids:
        if song_id not in metadata:
            continue
        duration_sec = metadata[song_id]
        outro_start_sec = outro_metadata.get(song_id)
        outro_field = f", outroStartSec: {outro_start_sec:.3f}" if outro_start_sec is not None else ""
        lines.append(f'  "{song_id}": {{ durationSec: {duration_sec:.3f}{outro_field} }},')
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
