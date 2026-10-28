"""Capture a reproducible real-app review matrix using only Lyrica's authored demo.

Requires the local web server and Python Playwright. Example:
  python3 tests/web/capture.py --output /tmp/lyrica-redesign

This script uses the demo/save/permission UI to populate history. It does not
present a commercial recording, mock cloud translation, or fictional API result
as live data. Browser storage is isolated and discarded after each theme/width.
"""
from argparse import ArgumentParser
from datetime import datetime, timezone
from pathlib import Path
import json

from playwright.sync_api import sync_playwright, expect
from support import (
    BASE_URL, DEMO_FIRST_TRANSLATION, launch, visit, navigate, set_theme,
    save_permitted_demo, screenshot, assert_no_overflow,
)


def capture(args):
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    files = []
    with sync_playwright() as playwright:
        browser = launch(playwright)
        try:
            for width in args.widths:
                height = 844 if width < 600 else 1024 if width < 1000 else 1050
                for theme in args.themes:
                    context = browser.new_context(
                        viewport={"width": width, "height": height},
                        service_workers="block", reduced_motion="reduce",
                        color_scheme=theme,
                    )
                    page = context.new_page()
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    # These flows need no APIs. Fail rather than accidentally fetch third-party lyrics.
                    page.route("https://itunes.apple.com/**", lambda route: route.abort())
                    page.route("https://lrclib.net/**", lambda route: route.abort())
                    visit(page)
                    set_theme(page, theme)
                    navigate(page, "search")
                    save_permitted_demo(page)

                    def take(view):
                        assert_no_overflow(page, f"{view} {theme} {width}")
                        name = f"{view}-{theme}-{width}.png"
                        screenshot(page, output, name)
                        files.append({"file": name, "view": view, "theme": theme, "viewport": {"width": width, "height": height}})

                    expect(page.get_by_text(DEMO_FIRST_TRANSLATION, exact=True)).to_be_visible()
                    take("reader")
                    navigate(page, "library")
                    expect(page.locator('[data-action="open-library"]')).to_have_count(1)
                    page.get_by_role("button", name="Favorites", exact=True).click()
                    take("library")
                    navigate(page, "settings")
                    take("settings")
                    navigate(page, "search")
                    expect(page.get_by_role("heading", name="Understand every line.")).to_be_visible()
                    take("search")
                    assert not errors, errors
                    context.close()
        finally:
            browser.close()
    manifest = {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "baseURL": BASE_URL,
        "content": "Real application UI using the original Lyrica Studio bilingual demo; no commercial lyrics or live translation claim.",
        "captures": files,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Captured {len(files)} application screenshots in {output}")


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="/tmp/lyrica-redesign")
    parser.add_argument("--widths", type=int, nargs="+", default=[390, 768, 1440])
    parser.add_argument("--themes", nargs="+", choices=["light", "dark"], default=["light", "dark"])
    capture(parser.parse_args())
