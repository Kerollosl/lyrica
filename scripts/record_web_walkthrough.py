#!/usr/bin/env python3
"""Record the real redesigned Lyrica web UI using its original bilingual demo.

Start the web app, then run:
    python3 scripts/record_web_walkthrough.py

Requirements: Python Playwright, Chromium, ffmpeg, and Playwright's video encoder
(`python3 -m playwright install ffmpeg`). No third-party APIs or commercial lyrics
are used. A fresh, temporary browser profile is discarded after recording.
"""
from argparse import ArgumentParser
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import shutil
import subprocess
import time

from playwright.sync_api import expect, sync_playwright


REPOSITORY = Path(__file__).resolve().parents[1]


def record(base_url: str, output: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg is required to produce an H.264 MP4.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="lyrica-walkthrough-") as scratch:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=os.environ.get("LYRICA_CHROMIUM") or shutil.which("chromium"),
                headless=True,
                args=["--no-sandbox"],
            )
            context = browser.new_context(
                viewport={"width": 1280, "height": 900},
                record_video_dir=scratch,
                record_video_size={"width": 1280, "height": 900},
                device_scale_factor=1,
                color_scheme="light",
                reduced_motion="reduce",
                service_workers="block",
            )
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            # The recording is intentionally self-contained and uses authored demo content.
            page.route("https://itunes.apple.com/**", lambda route: route.abort())
            page.route("https://lrclib.net/**", lambda route: route.abort())
            page.goto(base_url.rstrip("/") + "/")
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts.ready")
            expect(page.get_by_role("heading", name="Search songs")).to_be_visible()
            started = time.monotonic()
            page.evaluate("""() => {
                const style = document.createElement('style');
                style.textContent = `
                    #walkthrough-caption {
                        position:fixed;bottom:22px;left:50%;transform:translateX(-50%);
                        z-index:9999;max-width:calc(100vw - 64px);box-sizing:border-box;
                        background:#1c1c1ef5;color:#fff;padding:15px 24px;border-radius:8px;
                        font:500 14px/1.5 system-ui,sans-serif;
                        text-align:center;pointer-events:none;
                    }
                    #walkthrough-pointer {
                        position:fixed;width:22px;height:22px;border:2px solid #0066CC;
                        border-radius:50%;background:#0066CC22;z-index:99999;
                        pointer-events:none;left:1140px;top:760px;
                        transform:translate(-50%,-50%);
                    }`;
                document.head.append(style);
                const caption = document.createElement('div');
                caption.id='walkthrough-caption'; document.body.append(caption);
                const pointer = document.createElement('div');
                pointer.id='walkthrough-pointer'; document.body.append(pointer);
                document.addEventListener('mousemove', event => {
                    pointer.style.left=event.clientX+'px'; pointer.style.top=event.clientY+'px';
                });
            }""")

            def caption(text: str, hold: int = 1800) -> None:
                page.locator("#walkthrough-caption").evaluate("(element, text) => element.textContent = text", text)
                page.wait_for_timeout(hold)

            def click(locator, pause: int = 550) -> None:
                locator.scroll_into_view_if_needed()
                box = locator.bounding_box()
                if not box:
                    raise AssertionError("Walkthrough target is not visible")
                page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=14)
                page.wait_for_timeout(180)
                locator.click()
                page.wait_for_timeout(pause)

            def options() -> None:
                details = page.locator("details.reader-options")
                if details.get_attribute("open") is None:
                    click(details.locator("summary[aria-label='Reader options']"), 350)

            caption("Lyrica · Lyrics and translations", 2200)
            click(page.locator("#song-search"), 250)
            caption("Find a song or paste an Apple Music song link. No account needed.", 2000)
            page.keyboard.press("Escape")
            click(page.get_by_role("heading", name="Search songs"), 200)
            caption("Explore an original Spanish verse with included example translations.", 1500)
            click(page.get_by_role("button", name="Open example"))
            expect(page.get_by_text("I open the window to the day", exact=True)).to_be_visible()
            caption("Original Spanish on the left. Its English meaning alongside it.", 2200)
            click(page.locator(".lyric-row").first)
            caption("Tap a line to highlight both versions and keep your place.", 1800)

            page.locator("#target-language").select_option("ar")
            page.wait_for_timeout(550)
            expect(page.locator(".lyric-row .translated").first).to_have_attribute("dir", "rtl")
            caption("Switch to Arabic. Each translation keeps its own reading direction.", 2400)
            page.locator("#target-language").select_option("fr")
            page.wait_for_timeout(550)
            caption("Included French examples are ready instantly, too.", 2100)
            page.locator("#target-language").select_option("en")
            page.wait_for_timeout(450)

            options()
            caption("Reader options bring text size, layout, and manual pasting together.", 2000)
            click(page.locator('[data-action="layout"]'), 350)
            page.keyboard.press("Escape")
            expect(page.locator(".bilingual-panel")).to_have_class("bilingual-panel stacked")
            caption("Choose stacked reading when you want a little more room.", 2100)
            page.mouse.wheel(0, 320)
            page.wait_for_timeout(900)
            page.mouse.wheel(0, -1000)
            page.wait_for_timeout(700)
            options()
            click(page.locator('[data-action="layout"]'), 350)
            page.keyboard.press("Escape")

            click(page.get_by_role("button", name="Save favorite", exact=True), 500)
            caption("Keep a favorite. Saving permitted lyrics offline is optional.", 1800)
            click(page.get_by_role("button", name="Enable permitted offline storage"), 500)
            expect(page.locator("dialog")).not_to_be_visible()
            click(page.locator('[data-nav="library"]'))
            click(page.locator('[data-action="favorites"]'), 450)
            expect(page.locator("#library-records")).to_have_class("favorite-grid")
            caption("Your favorites, collected with artwork and song details.", 2200)
            click(page.locator('[data-action="open-library"]'), 500)
            caption("Reopen saved originals and their previously available translations.", 1800)

            click(page.locator('[data-nav="settings"]'), 450)
            page.locator("#theme").select_option("dark")
            page.wait_for_timeout(500)
            caption("Choose your reading size, language, appearance, and local storage.", 2200)
            click(page.locator('[data-nav="search"]'), 450)
            expect(page.locator('.recent-cards [data-action="open-library"]')).to_have_count(1)
            page.locator(".recently-read").scroll_into_view_if_needed()
            caption("Pick up where you left off, from your real reading history.", 2200)
            page.mouse.wheel(0, -1400)
            page.wait_for_timeout(650)
            caption("Original demo lyrics + included translations. Live translation depends on browser support.", 3400)
            # Keep a comfortable one-minute pacing across fast and slower machines.
            remaining = 59 - (time.monotonic() - started)
            if remaining > 0:
                page.wait_for_timeout(remaining * 1000)
            if errors:
                raise AssertionError(f"Browser errors during recording: {errors}")
            video = page.video
            context.close()
            source = Path(scratch) / "walkthrough.webm"
            video.save_as(str(source))
            browser.close()

        subprocess.run([
            ffmpeg, "-y", "-i", str(source), "-an", "-r", "30",
            "-c:v", "libx264", "-preset", "slow", "-crf", "24",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    print(f"Recorded actual Lyrica demo UI: {output}")


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:4173")
    parser.add_argument("--output", type=Path, default=REPOSITORY / "docs" / "lyrica-walkthrough.mp4")
    arguments = parser.parse_args()
    record(arguments.base_url, arguments.output.resolve())
