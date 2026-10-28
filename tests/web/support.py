"""Shared deterministic Playwright support for the static Lyrica companion."""
from pathlib import Path
import os
import shutil

BASE_URL = os.environ.get("LYRICA_BASE_URL", "http://127.0.0.1:4173").rstrip("/")
DEMO_TITLE = "Donde empieza el día"
DEMO_FIRST_TRANSLATION = "I open the window to the day"


def launch(playwright):
    """Prefer the installed Chromium; allow Playwright's managed browser elsewhere."""
    executable = os.environ.get("LYRICA_CHROMIUM") or shutil.which("chromium")
    return playwright.chromium.launch(
        executable_path=executable or None,
        headless=True,
        args=["--no-sandbox"],
    )


def visit(page, path=""):
    page.goto(f"{BASE_URL}/{path}")
    page.wait_for_load_state("networkidle")
    page.locator("main h1").wait_for()


def navigate(page, destination):
    page.locator(f'[data-nav="{destination}"]').click()
    page.locator("main h1").wait_for()


def reader_options(page):
    """Open the native disclosure before interacting with its reader controls."""
    details = page.locator("details.reader-options")
    if not details.count():
        details = page.locator("details", has=page.get_by_text("Reader options", exact=True))
    if details.get_attribute("open") is None:
        details.locator("summary").click()
    return details


def original_api_fixtures(page):
    """Mock APIs with authored fixture text; never embed commercial song lyrics."""
    page.route(
        "https://itunes.apple.com/**",
        lambda route: route.fulfill(json={"results": [{
            "kind": "song", "trackId": 123, "trackName": "A test song",
            "artistName": "Test Artist", "collectionName": "Test Album",
            "trackTimeMillis": 180000,
        }]}),
    )
    page.route(
        "https://lrclib.net/api/**",
        lambda route: route.fulfill(json={
            "id": 1, "trackName": "A test song", "artistName": "Test Artist",
            "albumName": "Test Album", "duration": 180, "instrumental": False,
            "plainLyrics": "Hola mundo\n\nBuenos días",
        }),
    )


def assert_no_overflow(page, label):
    metrics = page.evaluate("""() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    })""")
    assert max(metrics["document"], metrics["body"]) <= metrics["viewport"], f"Horizontal overflow on {label}: {metrics}"


def set_theme(page, theme):
    navigate(page, "settings")
    page.locator("#theme").select_option(theme)
    assert page.locator("html").get_attribute("data-theme") == theme


def open_demo(page):
    page.get_by_role("button", name="Open the bilingual demo").click()
    page.get_by_text(DEMO_FIRST_TRANSLATION, exact=True).wait_for()


def save_permitted_demo(page):
    """Populate history through the real UI, using only the app's original demo."""
    open_demo(page)
    page.get_by_role("button", name="Save favorite", exact=True).click()
    page.get_by_role("button", name="Enable permitted offline storage").click()
    page.locator("dialog").wait_for(state="hidden")


def screenshot(page, output, name):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    page.evaluate("document.fonts.ready")
    page.screenshot(path=str(output / name), full_page=page.viewport_size["width"] >= 600, animations="disabled")
