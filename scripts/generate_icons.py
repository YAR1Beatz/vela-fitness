#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)

LOGO = """
<svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 12.5c2.1-4.6 4.4-7.2 6-8.5 1.6 1.3 3.9 3.9 6 8.5" stroke="#1EE0C8" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M5.2 12.5c1.4-3 2.9-4.7 3.8-5.6 1 0.9 2.4 2.6 3.8 5.6" stroke="#1EE0C8" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>
</svg>
"""

def page_html(size, logo_size):
    return f"""<!DOCTYPE html>
<html><head><style>
  html,body{{margin:0;padding:0;background:#07111F;width:{size}px;height:{size}px;overflow:hidden}}
  .wrap{{width:{size}px;height:{size}px;display:flex;align-items:center;justify-content:center;background:#07111F}}
  svg{{width:{logo_size}px;height:{logo_size}px;display:block}}
</style></head>
<body><div class="wrap">{LOGO}</div></body></html>"""

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        specs = [
            ("icon-192.png", 192, 118),
            ("icon-512.png", 512, 300),
            ("apple-touch-icon.png", 180, 110),
        ]
        for name, size, logo in specs:
            page = browser.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
            page.set_content(page_html(size, logo))
            page.locator("body").screenshot(path=str(OUT / name), omit_background=False)
            page.close()
            print("wrote", OUT / name)
        browser.close()

if __name__ == "__main__":
    main()
