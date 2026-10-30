#!/usr/bin/env python3
"""Record the real Lyrica app on phone and desktop into one captioned MP4.

Start the local web server, then run this script. Requires Python Playwright,
Chromium, ffmpeg (with libass), and Playwright's video encoder. Both recordings
use fresh, temporary browser profiles and original fictional demo material.
Captions sit outside the captured app viewport; no controls are obscured.
"""
from argparse import ArgumentParser
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import os
import shutil
import subprocess
import time

from playwright.sync_api import expect, sync_playwright

REPOSITORY = Path(__file__).resolve().parents[1]


def run(command):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-6000:])
    return result.stdout


def ass_time(seconds):
    centiseconds = round(seconds * 100)
    hours, centiseconds = divmod(centiseconds, 360000)
    minutes, centiseconds = divmod(centiseconds, 6000)
    seconds, centiseconds = divmod(centiseconds, 100)
    return f"{hours}:{minutes:02}:{seconds:02}.{centiseconds:02}"


def subtitles(path, entries, duration, phone):
    # ASS margins constrain phone captions to the empty left side of the frame.
    # Desktop captions use a separate 80px band below the application viewport.
    margin_left, margin_right = (60, 920) if phone else (50, 50)
    style = f"Style: Caption,DejaVu Sans,{24 if phone else 21},&H00202020,&H00202020,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,{4 if phone else 2},{margin_left},{margin_right},{0 if phone else 26},1"
    content = """[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 900
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
""" + style + """
Style: Title,DejaVu Sans,36,&H00202020,&H00202020,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,60,920,180,1
Style: Mode,DejaVu Sans,17,&H00606065,&H00606065,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,60,920,235,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    if phone:
        content += f"Dialogue: 0,0:00:00.00,{ass_time(duration)},Title,,0,0,0,,Lyrica\n"
        content += f"Dialogue: 0,0:00:00.00,{ass_time(duration)},Mode,,0,0,0,,Phone · Web app\n"
    for index, (start, text) in enumerate(entries):
        end = entries[index + 1][0] if index + 1 < len(entries) else duration
        safe = text.replace("\\", "").replace("{", "").replace("}", "").replace("\n", r"\N")
        content += f"Dialogue: 1,{ass_time(start)},{ass_time(end)},Caption,,0,0,0,,{safe}\n"
    path.write_text(content)


def record_scene(browser, scratch, base_url, phone):
    scene = "phone" if phone else "desktop"
    width, height = (390, 844) if phone else (1280, 820)
    context = browser.new_context(
        viewport={"width": width, "height": height},
        record_video_dir=str(scratch / scene),
        record_video_size={"width": width, "height": height},
        device_scale_factor=1, color_scheme="light", reduced_motion="reduce",
        service_workers="block", has_touch=phone,
    )
    page = context.new_page()
    started = time.monotonic()
    entries = [(0, "Search songs and read their lyrics alongside a translation.")]
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    # Avoid fetching or recording commercial lyrics. This is an interface demo,
    # not evidence that a browser translation model has been downloaded.
    page.route("https://itunes.apple.com/**", lambda route: route.abort())
    page.route("https://lrclib.net/**", lambda route: route.abort())
    try:
        page.goto(base_url.rstrip("/") + "/")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("heading", name="Search songs", exact=True)).to_be_visible()
        page.evaluate("document.fonts.ready")
        def caption(text, hold=1600):
            entries.append((time.monotonic() - started, text))
            page.wait_for_timeout(hold)

        def click(locator, pause=400):
            locator.scroll_into_view_if_needed()
            box = locator.bounding_box()
            if not box:
                raise AssertionError("Walkthrough control is not visible")
            locator.click()
            page.wait_for_timeout(pause)

        def options():
            details = page.locator("details.reader-options")
            if details.get_attribute("open") is None:
                click(details.locator("summary"), 250)

        caption("Search by song, artist, or album. Apple Music song links work too.", 2100)
        click(page.get_by_role("button", name="Open example", exact=True))
        expect(page.get_by_text("I open the window to the day", exact=True)).to_be_visible()
        if phone:
            caption("On a phone, original and translated lines stack naturally.", 2300)
            click(page.locator(".lyric-row").first)
            caption("Tap a line to highlight both versions and keep your place.", 2200)
            page.locator("#target-language").select_option("ar")
            expect(page.locator(".translated").first).to_have_attribute("dir", "rtl")
            caption("Arabic keeps its own reading direction. These are included example translations.", 2800)
            page.mouse.wheel(0, 235)
            page.wait_for_timeout(1000)
            page.mouse.wheel(0, -1500)
            page.wait_for_timeout(500)
            page.locator("#target-language").select_option("en")
            click(page.get_by_role("button", name="Save favorite", exact=True))
            expect(page.locator("dialog")).to_be_visible()
            caption("A favorite can be a bookmark. Saving permitted lyrics offline is optional.", 2600)
            click(page.get_by_role("button", name="Enable permitted offline storage", exact=True))
            expect(page.locator("dialog")).not_to_be_visible()
            click(page.locator('[data-nav="library"]'))
            click(page.get_by_role("button", name="Favorites", exact=True))
            expect(page.locator('[data-action="open-library"]')).to_have_count(1)
            caption("Saved favorites stay in your library. Offline labels identify stored content.", 2400)
            click(page.locator('[data-nav="settings"]'))
            page.locator("#theme").select_option("dark")
            caption("Choose a default language, text size, appearance, and local storage.", 2500)
            click(page.locator('[data-nav="library"]'))
            click(page.locator('[data-action="open-library"]'))
            expect(page.get_by_text("I open the window to the day", exact=True)).to_be_visible()
            caption("Reopen the saved original and its available translations in dark appearance.", 2300)
            minimum = 40
            remaining = minimum - (time.monotonic() - started)
            if remaining > 2:
                page.wait_for_timeout((remaining - 2) * 1000)
            caption("Next: the same reader on a larger screen.", 2000)
        else:
            caption("On a larger screen, both languages share aligned rows and one scroll surface.", 2400)
            click(page.locator(".lyric-row").nth(2))
            caption("One selection highlights the original and its translation together.", 2000)
            page.locator("#target-language").select_option("fr")
            expect(page.get_by_text("J’ouvre la fenêtre sur le jour", exact=True)).to_be_visible()
            caption("Change the translation language. Included French examples appear immediately.", 2200)
            page.locator("#target-language").select_option("en")
            options()
            click(page.get_by_role("button", name="Larger lyrics", exact=True), 250)
            click(page.get_by_role("button", name="Larger lyrics", exact=True), 250)
            caption("Reader options adjust text size, layout, and manual lyrics or translations.", 2000)
            click(page.locator('[data-action="layout"]'))
            page.keyboard.press("Escape")
            expect(page.locator(".bilingual-panel")).to_have_class("bilingual-panel stacked")
            caption("Switch to a stacked layout whenever it feels more comfortable.", 2200)
            options()
            click(page.locator('[data-action="layout"]'))
            page.keyboard.press("Escape")
            click(page.locator('[data-nav="settings"]'))
            page.locator("#theme").select_option("dark")
            caption("System fonts, clear controls, and light or dark appearance.", 2000)
            click(page.locator('[data-nav="search"]'))
            click(page.get_by_role("button", name="Open example", exact=True))
            caption("Original fictional demo lyrics with included translations. Live translation depends on browser support.", 3200)
            minimum = 34
        remaining = minimum - (time.monotonic() - started)
        if remaining > 0:
            page.wait_for_timeout(remaining * 1000)
        if errors:
            raise AssertionError(f"Browser errors in {scene}: {errors}")
        video = page.video
        context.close()
        source = scratch / f"{scene}.webm"
        video.save_as(str(source))
        return source, entries
    finally:
        context.close()


def record(base_url, output):
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("ffmpeg and ffprobe are required to produce the MP4.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="lyrica-walkthrough-") as directory:
        scratch = Path(directory)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=os.environ.get("LYRICA_CHROMIUM") or shutil.which("chromium"),
                headless=True, args=["--no-sandbox"],
            )
            try:
                scenes = [record_scene(browser, scratch, base_url, phone) for phone in [True, False]]
            finally:
                browser.close()
        rendered = []
        for phone, (source, entries) in zip([True, False], scenes):
            name = "phone" if phone else "desktop"
            duration = float(json.loads(run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(source)]))["format"]["duration"])
            captions = scratch / f"{name}.ass"
            subtitles(captions, entries, duration, phone)
            destination = scratch / f"{name}.mp4"
            placement = "pad=1280:900:(ow-iw)/2:(oh-ih)/2:color=0xf5f5f7" if phone else "pad=1280:900:0:0:color=0xf5f5f7"
            run([ffmpeg, "-y", "-i", str(source), "-an", "-vf", f"{placement},subtitles={captions}",
                 "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", str(destination)])
            rendered.append(destination)
        playlist = scratch / "scenes.txt"
        playlist.write_text("".join(f"file '{path}'\n" for path in rendered))
        run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(playlist), "-c", "copy", "-movflags", "+faststart", str(output)])
    print(f"Recorded actual phone + desktop Lyrica UI: {output}")


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:4173")
    parser.add_argument("--output", type=Path, default=REPOSITORY / "docs" / "lyrica-walkthrough.mp4")
    args = parser.parse_args()
    record(args.base_url, args.output.resolve())
