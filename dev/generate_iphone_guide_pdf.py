# guide-data-pack.html（データパックの入れ方ガイド）のうち、iPhone向けの手順部分だけを
# 配布用PDFとして書き出すスクリプト（2026-08-27新設）。
#
# 【このスクリプトが必要な理由】
# 本人から「iPhone版の説明を、友達に配れるようにPDF化してほしい」との依頼があった。
# ガイドのHTML・CSS・スクリーンショットをPDF用に作り直すのではなく、実際にアプリ内で
# 使っているguide-data-pack.htmlをブラウザ（Playwright）でそのまま開いて印刷することで、
# アプリ本体の見た目と常に一致した状態を保てるようにしている（本人が今後ガイドの文言や
# 写真を更新した場合も、このスクリプトを再実行するだけでPDFに反映される）。
#
# 【使い方】
#   0. （初回だけ）Playwrightとブラウザ本体を用意する：
#        pip install playwright
#        python -m playwright install chromium
#   1. ローカルの開発用サーバーを起動しておく（例: python -m http.server 8123 をプロジェクト
#      ルートで実行）。
#   2. cd dev && python generate_iphone_guide_pdf.py
#   → dist/equal-love-intro-quiz-data-pack-guide-iphone.pdf が生成される。
#
# 【著作権について】このPDFにはアプリの操作画面キャプチャ（本人が個人情報を加工済みの
# ものを含む）が含まれるが、実際の楽曲音源・歌詞本文などの著作権保護コンテンツは含まれない。

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

DEV_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DEV_DIR.parent
OUTPUT_DIR = PROJECT_ROOT / "dist"
OUTPUT_PATH = OUTPUT_DIR / "equal-love-intro-quiz-data-pack-guide-iphone.pdf"
GUIDE_URL = "http://localhost:8123/guide-data-pack.html"

# PDF化にあたって、印刷物には不要な部分を隠したり、ページ区切りが不自然にならないように
# するための追加CSS。アプリ本体のcss/style.cssやguide-data-pack.html自体は一切変更しない
# （見た目の差分はこのスクリプト側だけで完結させる）。
PRINT_CSS = """
  @page { size: A4; margin: 14mm 12mm; }
  body { background: #fff5f8 !important; }
  .guide-back-link { display: none !important; }
  /* Androidの説明はiPhone版PDFには不要なので非表示にする */
  h2.pdf-hide-heading,
  .pdf-hide-until-next-h2 { display: none !important; }
  /* このページ限定の案内文（docs/data-pack-guide.mdへの言及）は配布物には不要 */
  .guide-section > p:last-of-type { display: none !important; }
  .guide-step-block, .guide-flow-card, .guide-mini-reminder, .guide-callout {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .guide-step-arrow-down { page-break-after: avoid; }
"""


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(color_scheme="light")
        page.goto(GUIDE_URL, wait_until="networkidle")

        # Service Workerが古いキャッシュを返さないよう、念のため解除してから再取得する
        page.evaluate(
            """
            async () => {
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const r of regs) await r.unregister();
            }
            """
        )
        page.reload(wait_until="networkidle")

        # 「🤖 Androidの場合」の見出しと、その次のh2が出てくるまでの中身に印を付けて
        # 非表示にする（本文のHTML構造自体は変更しない、見た目だけの後処理。
        # 2026-08-28、見出し文言を「Android・PCの場合」→「Androidの場合」へ変更したのに
        # 合わせてこの一致文字列も更新した）。
        page.evaluate(
            """
            () => {
              const headings = Array.from(document.querySelectorAll('h2'));
              const androidHeading = headings.find(h => h.textContent.includes('Androidの場合'));
              if (!androidHeading) return;
              androidHeading.classList.add('pdf-hide-heading');
              let el = androidHeading.nextElementSibling;
              while (el && el.tagName !== 'H2') {
                el.classList.add('pdf-hide-until-next-h2');
                el = el.nextElementSibling;
              }
            }
            """
        )

        page.add_style_tag(content=PRINT_CSS)

        page.pdf(
            path=str(OUTPUT_PATH),
            format="A4",
            print_background=True,
            margin={"top": "14mm", "bottom": "16mm", "left": "12mm", "right": "12mm"},
            display_header_footer=True,
            header_template="<span></span>",
            footer_template=(
                '<div style="font-size:8px; width:100%; text-align:center; color:#999;">'
                '＝LOVEイントロクイズ データパックの入れ方（iPhone版） '
                '- <span class="pageNumber"></span> / <span class="totalPages"></span></div>'
            ),
        )
        browser.close()

    print(f"書き出し完了: {OUTPUT_PATH}")


if __name__ == "__main__":
    sys.exit(main())
