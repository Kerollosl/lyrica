"""End-to-end regression checks. Run with the local server listening on port 4173.

External APIs are deterministic mocks with original, authored text. Browser model
availability and translation quality still need real-device acceptance testing.
"""
import json
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright, expect
from support import (
    BASE_URL, DEMO_TITLE, DEMO_FIRST_TRANSLATION, launch, visit, navigate,
    open_demo, reader_options, original_api_fixtures, assert_no_overflow,
    set_theme, save_permitted_demo,
)


def test_reading_and_storage(browser):
    context = browser.new_context(viewport={"width": 1440, "height": 1050}, service_workers="block")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    original_api_fixtures(page)
    visit(page)
    expect(page.get_by_role("heading", name="Search songs")).to_be_visible()

    # The first keyboard destination skips the application chrome.
    page.keyboard.press("Tab")
    expect(page.get_by_role("link", name="Skip to content")).to_be_focused()
    page.keyboard.press("Enter")
    expect(page.locator("main")).to_be_focused()

    open_demo(page)
    first = page.locator(".lyric-row").first
    first.focus()
    page.keyboard.press("Space")
    expect(first).to_have_attribute("aria-pressed", "true")
    expect(first.locator(".translated")).to_have_text(DEMO_FIRST_TRANSLATION)
    page.keyboard.press("Space")
    expect(first).to_have_attribute("aria-pressed", "false")

    options = reader_options(page)
    before_size = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--lyrics-size')")
    options.get_by_role("button", name="Larger lyrics").click()
    after_size = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--lyrics-size')")
    assert before_size != after_size, "Text-size control did not change the reading size"
    options.get_by_role("button", name="Switch between columns and stacked layout").click()
    expect(page.locator('[aria-label="Bilingual lyrics"]')).to_have_class(re.compile("stacked"))
    reader_options(page).get_by_role("button", name="Switch between columns and stacked layout").click()
    expect(page.locator('[aria-label="Bilingual lyrics"]')).not_to_have_class(re.compile("stacked"))

    page.locator("#target-language").select_option("ar")
    expect(page.get_by_text("أفتح النافذة للنهار", exact=True)).to_be_visible()
    expect(page.locator(".translated").first).to_have_attribute("dir", "rtl")
    page.locator("#target-language").select_option("fr")
    expect(page.get_by_text("J’ouvre la fenêtre sur le jour", exact=True)).to_be_visible()
    page.locator("#target-language").select_option("en")
    expect(page.get_by_text(DEMO_FIRST_TRANSLATION, exact=True)).to_be_visible()

    # A bookmark can be saved while declining lyric storage.
    page.get_by_role("button", name="Favorite", exact=True).click()
    expect(page.locator("dialog")).to_be_visible()
    page.get_by_role("button", name="Keep bookmark only", exact=True).click()
    navigate(page, "library")
    expect(page.locator('[data-action="open-library"]', has_text=DEMO_TITLE)).to_be_visible()
    assert page.locator(".song-duration", has_text="Offline").count() == 0
    page.reload()
    page.wait_for_load_state("networkidle")
    expect(page.locator('[data-action="open-library"]', has_text=DEMO_TITLE)).to_be_visible()

    # Opt in explicitly, then read the demo to persist its permitted text.
    navigate(page, "settings")
    page.locator("#cache").click()
    page.get_by_role("button", name="Enable permitted offline storage").click()
    expect(page.locator("dialog")).not_to_be_visible()
    navigate(page, "library")
    page.locator('[data-action="open-library"]').first.click()
    expect(page.get_by_text(DEMO_FIRST_TRANSLATION, exact=True)).to_be_visible()
    navigate(page, "library")
    expect(page.locator(".song-duration", has_text="Offline")).to_be_visible()
    page.locator('[data-action="favorites"]').click()
    expect(page.locator('.favorite-grid .song-duration.is-offline')).to_be_visible()
    page.locator('[data-action="history"]').click()

    # Search and LRCLIB requests use original fixture material.
    navigate(page, "search")
    page.get_by_role("searchbox").fill("Test Artist")
    page.get_by_role("button", name="Search", exact=True).click()
    page.get_by_role("button", name=re.compile("A test song")).click()
    expect(page.get_by_text("Hola mundo", exact=True)).to_be_visible()
    reader_options(page).get_by_role("button", name="Paste a translation", exact=True).click()
    page.locator("#manual-text").fill("Only one line")
    page.get_by_role("button", name="Use translation", exact=True).click()
    expect(page.locator("dialog [role=alert]")).to_contain_text("one translated line")
    page.locator("#manual-text").fill("Hello world\nGood morning")
    page.get_by_role("button", name="Use translation", exact=True).click()
    expect(page.get_by_text("Hello world", exact=True)).to_be_visible()
    expect(page.locator(".verse-space")).to_have_count(1)
    expect(page.locator(".lyric-row")).to_have_count(2)

    # Replacing the original invalidates an unrelated translation.
    reader_options(page).get_by_role("button", name="Paste or replace lyrics", exact=True).click()
    page.locator("#manual-text").fill("Un jardín de papel\n\nDonde amanece la voz")
    page.get_by_role("button", name="Use lyrics", exact=True).click()
    expect(page.get_by_text("Un jardín de papel", exact=True)).to_be_visible()
    expect(page.get_by_text("Hello world", exact=True)).to_have_count(0)
    reader_options(page).get_by_role("button", name="Paste a translation", exact=True).click()
    expect(page.locator("dialog")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("dialog")).not_to_be_visible()

    set_theme(page, "dark")
    # Turning storage off asks first, because it deletes saved lyrics.
    page.locator("#cache").click()
    page.get_by_role("button", name="Turn off and remove lyrics", exact=True).click()
    expect(page.locator("#cache")).not_to_be_checked()
    navigate(page, "library")
    assert page.locator(".song-duration", has_text="Offline").count() == 0
    page.locator("#library-search").fill("Definitely no match")
    expect(page.locator('[data-action="open-library"]')).to_have_count(0)
    page.locator("#library-search").fill("")
    expect(page.locator('[data-action="open-library"]')).to_have_count(2)

    # Destructive actions require a concrete confirmation dialog.
    page.get_by_role("button", name=f"Remove {DEMO_TITLE} from library", exact=True).click()
    page.get_by_role("button", name="Remove song", exact=True).click()
    expect(page.locator('[data-action="open-library"]')).to_have_count(1)
    navigate(page, "settings")
    page.get_by_role("button", name="Delete library & history", exact=True).click()
    page.get_by_role("button", name="Delete library", exact=True).click()
    navigate(page, "library")
    expect(page.locator('[data-action="open-library"]')).to_have_count(0)
    assert not errors, errors
    context.close()
    print("PASS reading/storage: keyboard access, disclosure controls, alignment, RTL, cached language switching, opt-in, persistence, mocked search/lyrics, manual validation, invalidation, cache clearing and deletion")


def test_search_states(browser):
    context = browser.new_context(service_workers="block")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    pending = []
    retries = {"count": 0}

    def mock_search(route):
        query = parse_qs(urlparse(route.request.url).query).get("term", [""])[0]
        if query == "Delayed":
            pending.append(route)
        elif query == "Rate limited":
            route.fulfill(status=429, json={})
        elif query == "Retry connection" and retries["count"] == 0:
            retries["count"] += 1
            route.abort("internetdisconnected")
        else:
            route.fulfill(json={"results": []})

    page.route("https://itunes.apple.com/**", mock_search)
    visit(page)
    navigate(page, "library")
    expect(page.locator('[data-action="open-library"]')).to_have_count(0)
    navigate(page, "search")

    page.keyboard.press("/")
    expect(page.locator("#song-search")).to_be_focused()
    expect(page.locator("#song-search")).to_have_value("")
    page.get_by_role("searchbox").fill("No matching music")
    page.get_by_role("button", name="Search", exact=True).click()
    expect(page.get_by_role("heading", name="No songs found", exact=True)).to_be_visible()

    # Hold a response so the loading state is asserted rather than photographed by chance.
    page.get_by_role("searchbox").fill("Delayed")
    with page.expect_request("https://itunes.apple.com/**"):
        page.get_by_role("button", name="Search", exact=True).click()
    expect(page.locator(".search-skeleton")).to_be_visible()
    page.wait_for_timeout(20)  # Dispatch the already observed request's routing callback.
    assert pending, "Delayed mock request was not intercepted"
    pending.pop().fulfill(json={"results": []})
    expect(page.get_by_role("heading", name="No songs found", exact=True)).to_be_visible()

    page.get_by_role("searchbox").fill("Rate limited")
    page.get_by_role("button", name="Search", exact=True).click()
    expect(page.get_by_text("The service is busy. Wait a minute before trying again.", exact=False)).to_be_visible(timeout=10000)
    page.get_by_role("searchbox").fill("Retry connection")
    page.get_by_role("button", name="Search", exact=True).click()
    expect(page.get_by_text("Couldn’t connect.", exact=False)).to_be_visible(timeout=10000)
    page.get_by_role("button", name="Try again", exact=True).click()
    expect(page.get_by_role("heading", name="No songs found", exact=True)).to_be_visible(timeout=10000)

    # Invalid links are rejected locally, without a web scrape.
    page.get_by_role("searchbox").fill("https://example.com/album/123")
    page.get_by_role("button", name="Search", exact=True).click()
    expect(page.get_by_text("Use a song link from music.apple.com", exact=False)).to_be_visible()
    assert not errors, errors
    context.close()
    print("PASS search states: empty library, empty results, controlled loading, rate limits, network failure/retry, URL guidance")


def test_lyrics_error_state(browser):
    context = browser.new_context(service_workers="block")
    page = context.new_page()
    original_api_fixtures(page)
    page.unroute("https://lrclib.net/api/**")
    page.route("https://lrclib.net/api/get**", lambda route: route.fulfill(status=404, json={}))
    page.route("https://lrclib.net/api/search**", lambda route: route.fulfill(json=[]))
    visit(page)
    page.get_by_role("searchbox").fill("Test Artist")
    page.get_by_role("button", name="Search", exact=True).click()
    page.get_by_role("button", name=re.compile("A test song")).click()
    expect(page.get_by_text("No confident lyrics match", exact=False)).to_be_visible()
    page.get_by_role("button", name="Paste lyrics", exact=True).click()
    page.locator("#manual-text").fill("Una palabra pequeña\nUn horizonte nuevo")
    page.get_by_role("button", name="Use lyrics", exact=True).click()
    expect(page.get_by_text("Una palabra pequeña", exact=True)).to_be_visible()
    context.close()
    print("PASS lyric fallback: unavailable recording, clear status, authorized manual original")


def test_viewports(browser):
    for width, height in [(390, 844), (768, 1024), (1440, 1050)]:
        for theme in ["light", "dark"]:
            context = browser.new_context(viewport={"width": width, "height": height}, service_workers="block", reduced_motion="reduce")
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            visit(page)
            set_theme(page, theme)
            assert_no_overflow(page, f"settings {width} {theme}")
            navigate(page, "search")
            assert_no_overflow(page, f"search {width} {theme}")
            save_permitted_demo(page)
            assert_no_overflow(page, f"reader {width} {theme}")
            page.locator("#target-language").select_option("ar")
            expect(page.get_by_text("أفتح النافذة للنهار", exact=True)).to_be_visible()
            assert_no_overflow(page, f"Arabic reader {width} {theme}")
            options = reader_options(page)
            for _ in range(12):
                options.get_by_role("button", name="Larger lyrics").click()
            assert_no_overflow(page, f"large-text reader {width} {theme}")

            # Authored stress text covers long wrapping lines and an unbroken token,
            # independently of any commercial lyrics or translation model.
            options.get_by_role("button", name="Paste or replace lyrics", exact=True).click()
            long_original = "Abro otra ventana para mirar las palabras con paciencia " + "palabra" * 24
            page.locator("#manual-text").fill(long_original + "\n\nCada voz encuentra una manera distinta de volver a casa")
            page.get_by_role("button", name="Use lyrics", exact=True).click()
            expect(page.locator(".lyric-row")).to_have_count(2)
            reader_options(page).get_by_role("button", name="Paste a translation", exact=True).click()
            page.locator("#manual-text").fill("أفتح نافذة أخرى لكي أقرأ الكلمات بهدوء وأجد معنى جديداً في كل سطر " * 5 + "\n\nلكل صوت طريقته الخاصة في العودة إلى البيت")
            page.get_by_role("button", name="Use translation", exact=True).click()
            expect(page.locator("dialog")).not_to_be_visible()
            expect(page.locator(".translated").first).to_contain_text("أفتح نافذة أخرى")
            expect(page.locator(".translated").first).to_have_attribute("dir", "rtl")
            assert_no_overflow(page, f"long aligned Arabic text {width} {theme}")
            row_metrics = page.locator(".lyric-row").first.evaluate("row => ({height: row.getBoundingClientRect().height, text: row.innerText, size: getComputedStyle(row).fontSize})")
            assert row_metrics["height"] > 100, f"Long-text wrapping failed at {width} {theme}: {row_metrics}"
            options = reader_options(page)
            layout_toggle = options.get_by_role("button", name="Switch between columns and stacked layout")
            if width < 600:
                # Phones always stack, so the toggle would do nothing there.
                expect(layout_toggle).to_be_hidden()
                page.keyboard.press("Escape")
            else:
                layout_toggle.click()
            assert_no_overflow(page, f"stacked reader {width} {theme}")
            navigate(page, "library")
            assert_no_overflow(page, f"library {width} {theme}")
            page.get_by_role("button", name="Favorites", exact=True).click()
            expect(page.locator("#library-records")).to_have_class("favorite-grid")
            assert_no_overflow(page, f"favorite cards {width} {theme}")
            page.locator("#library-search").fill("No saved song has this name")
            expect(page.locator(".empty-state")).to_be_visible()
            assert_no_overflow(page, f"empty favorite grid {width} {theme}")
            assert not errors, errors
            context.close()
    print("PASS viewport matrix: 390/768/1440 in light/dark, all pages, Arabic, largest text, stacked layout")


def test_compact_layout_and_forced_colors(browser):
    # Long metadata comes through the real search flow, including an artist name
    # with no break opportunities. It must not widen the row or the page.
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    page = context.new_page()
    metadata = {
        "trackName": "Title" * 40,
        "artistName": "Artist" * 40,
        "collectionName": "Album" * 40,
    }
    page.route(
        "https://itunes.apple.com/**",
        lambda route: route.fulfill(json={"results": [{
            "kind": "song", "trackId": 789, "trackTimeMillis": 180000,
            **metadata,
        }]}),
    )
    visit(page)
    page.get_by_role("searchbox").fill("Long metadata fixture")
    page.get_by_role("button", name="Search", exact=True).click()
    row = page.locator('[data-action="open-result"]').first
    expect(row).to_be_visible()
    expect(row.locator(".song-info > span")).to_have_text(metadata["artistName"])
    assert_no_overflow(page, "unbroken song metadata at 390")
    bounds = row.bounding_box()
    for selector in [".song-info strong", ".song-info > span", ".song-info small"]:
        text_bounds = row.locator(selector).bounding_box()
        assert text_bounds["x"] >= bounds["x"] - 1, f"Metadata escapes left edge: {selector}"
        assert text_bounds["x"] + text_bounds["width"] <= bounds["x"] + bounds["width"] + 1, f"Metadata escapes right edge: {selector}"
    context.close()

    # Both permission choices remain visible inside the dialog on a small
    # viewport; checking only document width misses clipped negative overflow.
    context = browser.new_context(viewport={"width": 320, "height": 700}, service_workers="block")
    page = context.new_page()
    visit(page)
    navigate(page, "settings")
    page.locator("#cache").click()
    dialog = page.locator("dialog")
    expect(dialog).to_be_visible()
    bounds = dialog.bounding_box()
    for name in ["Not now", "Enable permitted offline storage"]:
        button = dialog.get_by_role("button", name=name, exact=True)
        expect(button).to_be_visible()
        button_bounds = button.bounding_box()
        assert button_bounds["x"] >= bounds["x"], f"Permission choice clipped on the left: {name}"
        assert button_bounds["x"] + button_bounds["width"] <= bounds["x"] + bounds["width"], f"Permission choice clipped on the right: {name}"
        assert button_bounds["y"] + button_bounds["height"] <= bounds["y"] + bounds["height"], f"Permission choice clipped below dialog: {name}"
    dialog.get_by_role("button", name="Not now", exact=True).click()
    expect(dialog).not_to_be_visible()
    context.close()

    # System high-contrast colors suppress painted backgrounds. The cache
    # control needs native checked-state rendering and selections need an edge.
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block", forced_colors="active")
    page = context.new_page()
    visit(page)
    navigate(page, "settings")
    cache = page.locator("#cache")
    assert cache.evaluate("el => getComputedStyle(el).appearance") != "none", "Cache checkbox loses native visibility in forced colors"
    cache.click()
    page.get_by_role("button", name="Enable permitted offline storage").click()
    expect(cache).to_be_checked()
    navigate(page, "search")
    open_demo(page)
    line = page.locator(".lyric-row").first
    line.click()
    expect(line).to_have_attribute("aria-pressed", "true")
    edge = line.evaluate("el => ({width: parseFloat(getComputedStyle(el).outlineWidth), style: getComputedStyle(el).outlineStyle})")
    assert edge["width"] > 0 and edge["style"] != "none", f"Selected lyric is invisible in forced colors: {edge}"
    # Reader retains the Search hash; reselecting the tab must still leave it.
    navigate(page, "search")
    open_demo(page)
    navigate(page, "library")
    selected = page.get_by_role("button", name="Favorites", exact=True)
    selected.click()
    expect(selected).to_have_attribute("aria-pressed", "true")
    edge = selected.evaluate("el => ({width: parseFloat(getComputedStyle(el).outlineWidth), style: getComputedStyle(el).outlineStyle})")
    assert edge["width"] > 0 and edge["style"] != "none", f"Selected library filter is invisible in forced colors: {edge}"
    context.close()
    print("PASS compact/high-contrast regressions: unbroken song metadata, 320px permission choices, visible cache and selected states")



def test_reader_refinement(browser):
    context = browser.new_context(viewport={"width": 1440, "height": 1050}, service_workers="block")
    page = context.new_page()
    visit(page)
    open_demo(page)

    # Language controls describe the same physical columns as the lyric cells.
    # This catches the former third status column squeezing both selectors left.
    row = page.locator(".lyric-row").first
    for control, cell in [("#source-language", ".lyric-row > span:first-child"), ("#target-language", ".lyric-row > span.translated")]:
        control_box = page.locator(control).bounding_box()
        cell_box = page.locator(cell).first.bounding_box()
        assert abs(control_box["x"] - cell_box["x"]) <= 1, f"Language/lyric column misalignment: {control_box}, {cell_box}"
        assert abs(control_box["width"] - cell_box["width"]) <= 1, f"Language/lyric column width mismatch: {control_box}, {cell_box}"
    expect(page.locator(".reader-guide")).not_to_be_visible()

    # A translated rerender must retain keyboard position on the same lyric,
    # rather than silently sending the reader to the first row.
    selected = page.locator(".lyric-row").nth(3)
    selected.focus()
    page.keyboard.press("Space")
    expect(selected).to_have_attribute("aria-pressed", "true")
    page.locator("#target-language").select_option("fr")
    expect(selected).to_be_focused()
    expect(selected).to_have_attribute("aria-pressed", "true")
    page.locator("#target-language").select_option("en")
    expect(selected).to_be_focused()

    reader_options(page).get_by_role("button", name="Paste or replace lyrics", exact=True).click()
    field = page.locator("#manual-text")
    expect(field).to_be_focused()
    field.fill("Un nuevo comienzo\n\nCada palabra vuelve a casa")
    page.keyboard.press("Escape")
    expect(page.locator("dialog")).to_be_visible()
    expect(field).to_have_value("Un nuevo comienzo\n\nCada palabra vuelve a casa")
    expect(page.get_by_role("button", name="Discard changes", exact=True)).to_be_visible()
    page.get_by_role("button", name="Discard changes", exact=True).click()
    expect(page.locator("dialog")).not_to_be_visible()
    # The disclosure closes when the dialog is used; return to its visible summary.
    expect(page.locator(".reader-options > summary")).to_be_focused()
    expect(selected).to_have_attribute("aria-pressed", "true")

    # Hold a supported API boundary to make the in-flight save observable.
    # Repeated submit events must not start a second translation preparation.
    page.evaluate("""() => {
      window.availabilityCalls = 0;
      Object.defineProperty(window, 'Translator', { configurable: true, value: {
        availability() {
          window.availabilityCalls++;
          return new Promise(resolve => { window.releaseAvailability = () => resolve('unavailable'); });
        }
      }});
    }""")
    reader_options(page).get_by_role("button", name="Paste or replace lyrics", exact=True).click()
    field.fill("Un nuevo comienzo\n\nCada palabra vuelve a casa")
    page.get_by_role("button", name="Use lyrics", exact=True).click()
    page.wait_for_function("window.availabilityCalls === 1")
    expect(page.get_by_role("button", name="Use lyrics", exact=True)).to_be_disabled()
    page.locator("#dialog-form").evaluate("form => form.requestSubmit()")
    assert page.evaluate("window.availabilityCalls") == 1, "Repeated save started another translation operation"
    page.evaluate("window.releaseAvailability()")
    expect(page.locator("dialog")).not_to_be_visible()
    expect(page.get_by_text("Un nuevo comienzo", exact=True)).to_be_visible()
    expect(page.locator('.lyric-row[aria-pressed="true"]')).to_have_count(0)

    # Validation announces the problem and returns input focus to its source.
    reader_options(page).get_by_role("button", name="Paste a translation", exact=True).click()
    field.fill("Only one line")
    page.get_by_role("button", name="Use translation", exact=True).click()
    expect(field).to_have_attribute("aria-invalid", "true")
    expect(field).to_be_focused()
    expect(page.locator("dialog [role=alert]")).to_contain_text("one translated line")
    page.get_by_role("button", name="Cancel", exact=True).click()
    expect(page.locator("dialog")).to_be_visible()
    page.get_by_role("button", name="Discard changes", exact=True).click()
    context.close()

    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block", has_touch=True)
    page = context.new_page()
    visit(page)
    open_demo(page)
    expect(page.locator(".reader-guide")).to_be_visible()
    assert_no_overflow(page, "compact reader after header consolidation")
    # Focus scrolls the lyric above the bottom tab bar and below pinned controls.
    line = page.locator(".lyric-row").last
    line.focus()
    line_box = line.bounding_box()
    bar_box = page.locator(".language-bar").bounding_box()
    nav_box = page.locator("nav").bounding_box()
    assert line_box["y"] >= bar_box["y"] + bar_box["height"] - 1, "Focused lyric is covered by sticky languages"
    assert line_box["y"] + line_box["height"] <= nav_box["y"] + 1, "Focused lyric is covered by bottom navigation"
    context.close()
    print("PASS reader refinement: shared column geometry, exact-row keyboard focus, protected drafts, single save, validation focus, original-edit reset and unobscured mobile focus")


def test_theme_and_cache_target(browser):
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block", color_scheme="light")
    page = context.new_page()
    visit(page)
    navigate(page, "settings")
    page.locator("#theme").select_option("system")
    page.emulate_media(color_scheme="dark")
    expect(page.locator('meta[name="theme-color"]')).to_have_attribute("content", "#111")
    page.emulate_media(color_scheme="light")
    expect(page.locator('meta[name="theme-color"]')).to_have_attribute("content", "#fff")
    page.locator("#theme").select_option("dark")
    expect(page.locator('meta[name="theme-color"]')).to_have_attribute("content", "#111")
    page.locator("#theme").select_option("light")
    page.emulate_media(color_scheme="dark")
    expect(page.locator('meta[name="theme-color"]')).to_have_attribute("content", "#fff")
    target = page.locator(".cache-setting")
    bounds = target.bounding_box()
    assert bounds["height"] >= 44, "Offline setting has no full-height touch target"
    target.locator("span").first.click()
    expect(page.locator("dialog")).to_be_visible()
    page.get_by_role("button", name="Not now", exact=True).click()
    expect(page.locator("#cache")).not_to_be_checked()
    context.close()
    print("PASS theme/cache targets: browser chrome follows system and explicit themes, full-row cache label opens consent without opting in")


def test_offline_shell(browser):
    context = browser.new_context(service_workers="allow")
    page = context.new_page()
    visit(page)
    page.evaluate("navigator.serviceWorker.ready")
    page.reload()
    page.wait_for_load_state("networkidle")
    context.set_offline(True)
    page.reload()
    page.wait_for_load_state("networkidle")
    expect(page.get_by_role("button", name="Open example")).to_be_visible()
    open_demo(page)
    context.close()
    print("PASS offline: service-worker shell and authored bilingual demo")


# Song routing, study mode, keyboard reading, storage safety, backup and resilience.
DEMO_ROUTE = "#song/lyrica-original-demo"


def new_page(browser, **options):
    context = browser.new_context(service_workers="block", **options)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("https://itunes.apple.com/**", lambda route: route.abort())
    page.route("https://lrclib.net/**", lambda route: route.abort())
    return context, page, errors


def test_routing(browser):
    context, page, errors = new_page(browser, viewport={"width": 1280, "height": 900})
    visit(page)
    open_demo(page)
    assert page.evaluate("location.hash") == DEMO_ROUTE
    # Refresh keeps the song open.
    page.reload()
    expect(page.get_by_role("heading", name=DEMO_TITLE)).to_be_visible()
    expect(page.get_by_text(DEMO_FIRST_TRANSLATION, exact=True)).to_be_visible()
    # Browser Back returns to Search inside the app; Forward reopens the song.
    page.go_back()
    expect(page.get_by_role("heading", name="Search songs")).to_be_visible()
    page.go_forward()
    expect(page.get_by_role("heading", name=DEMO_TITLE)).to_be_visible()
    # The reader's Back control returns to where the song was opened.
    navigate(page, "library")
    page.locator('[data-action="open-library"]').first.click()
    expect(page.get_by_role("button", name="Library", exact=True)).to_be_visible()
    page.get_by_role("button", name="Library", exact=True).click()
    expect(page.get_by_role("heading", name="Library", exact=True)).to_be_visible()
    expect(page.locator('[data-action="open-library"]').first).to_be_focused()
    # A link to a song that isn't saved and isn't an Apple ID falls back to Search.
    page.goto(f"{BASE_URL}/#song/not-a-song")
    expect(page.get_by_role("heading", name="Search songs")).to_be_visible()
    expect(page.locator("#toast")).to_contain_text("isn’t in this browser’s library")
    assert not errors, errors
    context.close()
    print("PASS routing: song URLs, refresh, browser Back/Forward, reader Back focus, unknown links")


def test_reading_controls(browser):
    context, page, errors = new_page(browser, viewport={"width": 1280, "height": 900})
    context.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE_URL)
    visit(page)
    open_demo(page)
    rows = page.locator(".lyric-row")
    # One Tab stop for the lyrics; arrow keys move the highlighted line.
    expect(page.locator('.lyric-row[tabindex="0"]')).to_have_count(1)
    rows.first.focus()
    page.keyboard.press("ArrowDown")
    expect(rows.nth(1)).to_be_focused()
    expect(rows.nth(1)).to_have_attribute("aria-pressed", "true")
    page.keyboard.press("End")
    expect(rows.last).to_be_focused()
    page.keyboard.press("Escape")
    expect(page.locator('.lyric-row[aria-pressed="true"]')).to_have_count(0)

    # Selecting text to copy a phrase doesn't toggle the highlight.
    page.evaluate("""() => {
      const span = document.querySelector('.lyric-row span');
      const range = document.createRange();
      range.setStart(span.firstChild, 0);
      range.setEnd(span.firstChild, 4);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      span.closest('.lyric-row').click();
    }""")
    expect(rows.first).to_have_attribute("aria-pressed", "false")
    page.evaluate("getSelection().removeAllRanges()")

    # Copy lyrics pairs each original line with its translation.
    reader_options(page).get_by_role("button", name="Copy lyrics & translation").click()
    expect(page.locator("#toast")).to_contain_text("copied")
    copied = page.evaluate("navigator.clipboard.readText()")
    assert "Abro la ventana al día\nI open the window to the day" in copied, copied
    assert copied.rstrip().endswith(f"{DEMO_TITLE} · Lyrica Studio"), copied

    # Study mode hides translations until a line is tapped.
    reader_options(page).get_by_role("button", name="Hide translations").click()
    expect(page.locator(".translated.concealed")).to_have_count(rows.count())
    expect(page.get_by_text(DEMO_FIRST_TRANSLATION, exact=True)).to_be_hidden()
    rows.first.click()
    expect(rows.first.locator(".translated")).to_have_text(DEMO_FIRST_TRANSLATION)
    expect(page.locator(".translated.concealed")).to_have_count(rows.count() - 1)
    # The preference persists, and Settings offers the same switch.
    page.reload()
    expect(page.locator(".translated.concealed").first).to_be_attached()
    navigate(page, "settings")
    expect(page.locator("#study")).to_be_checked()
    assert not errors, errors
    context.close()
    print("PASS reading controls: roving focus, arrow keys, selectable text, copy, study mode and its setting")


def test_storage_safety(browser):
    context, page, errors = new_page(browser, viewport={"width": 1280, "height": 900})
    visit(page)
    open_demo(page)
    # Offline storage is offered once, on the first favorite.
    favorite = page.get_by_role("button", name="Favorite", exact=True)
    favorite.click()
    page.get_by_role("button", name="Keep bookmark only", exact=True).click()
    expect(favorite).to_have_attribute("aria-pressed", "true")
    favorite.click()
    expect(favorite).to_have_attribute("aria-pressed", "false")
    favorite.click()
    expect(page.locator("dialog")).not_to_be_visible()
    expect(page.locator("#toast")).to_contain_text("Added to favorites")

    # Turning offline storage off asks first; declining keeps it on.
    navigate(page, "settings")
    page.locator("#cache").click()
    page.get_by_role("button", name="Enable permitted offline storage").click()
    expect(page.locator("#cache")).to_be_checked()
    page.locator("#cache").click()
    expect(page.locator("dialog")).to_contain_text("Turn off offline reading?")
    page.get_by_role("button", name="Keep offline lyrics", exact=True).click()
    expect(page.locator("#cache")).to_be_checked()

    # Unfavoriting from the grid can be undone.
    navigate(page, "library")
    page.get_by_role("button", name="Favorites", exact=True).click()
    page.get_by_role("button", name=f"Remove {DEMO_TITLE} from favorites").click()
    expect(page.locator(".favorite-grid .empty-state")).to_be_visible()
    page.locator("#toast").get_by_role("button", name="Undo").click()
    expect(page.locator('.favorite-grid [data-action="open-library"]')).to_have_count(1)
    assert not errors, errors
    context.close()
    print("PASS storage safety: storage offered once, confirmation before deleting lyrics, undo unfavorite")


def test_backup(browser):
    context, page, errors = new_page(browser, viewport={"width": 1280, "height": 900}, accept_downloads=True)
    visit(page)
    open_demo(page)
    page.get_by_role("button", name="Favorite", exact=True).click()
    page.get_by_role("button", name="Enable permitted offline storage").click()
    navigate(page, "settings")
    with page.expect_download() as download_info:
        page.get_by_role("button", name="Export library backup").click()
    with TemporaryDirectory() as folder:
        path = Path(folder) / "backup.json"
        download_info.value.save_as(path)
        data = json.loads(path.read_text())
        assert data["app"] == "lyrica-web" and len(data["songs"]) == 1, data
        page.get_by_role("button", name="Delete library & history", exact=True).click()
        page.get_by_role("button", name="Delete library", exact=True).click()
        expect(page.locator(".storage-summary")).to_contain_text("0 favorites")
        page.locator("#import-file").set_input_files(str(path))
        expect(page.locator("#toast")).to_contain_text("Imported 1 song")
        expect(page.locator(".storage-summary")).to_contain_text("1 song saved offline · 1 favorite.")
        # A file that isn't a backup is rejected with a clear message.
        bogus = Path(folder) / "other.json"
        bogus.write_text('{"hello": "world"}')
        page.locator("#import-file").set_input_files(str(bogus))
        expect(page.locator("#toast")).to_contain_text("isn’t a Lyrica library backup")
    assert not errors, errors
    context.close()
    print("PASS backup: export, delete, import restores favorites and permitted lyrics, invalid files rejected")


def test_resilience(browser):
    # Storage blocked: Lyrica keeps working for the session.
    context, page, errors = new_page(browser, viewport={"width": 390, "height": 844})
    page.add_init_script("""
      Object.defineProperty(window, 'indexedDB', { configurable: true, get() {
        return { open() { throw new DOMException('blocked', 'SecurityError'); } };
      }});
    """)
    visit(page)
    expect(page.locator("#toast")).to_contain_text("blocking storage")
    open_demo(page)
    navigate(page, "library")
    expect(page.locator('[data-action="open-library"]', has_text=DEMO_TITLE)).to_be_visible()
    assert not errors, errors
    context.close()

    # Typing in Search keeps the caret where the reader put it.
    context = browser.new_context(service_workers="block", viewport={"width": 1280, "height": 900})
    page = context.new_page()
    original_api_fixtures(page)
    visit(page)
    field = page.locator("#song-search")
    field.fill("Test Artist")
    expect(page.get_by_role("heading", name="Choose your recording")).to_be_visible()
    field.press("Home")
    for _ in range(4):
        field.press("ArrowRight")
    field.type("X")
    page.wait_for_timeout(700)
    expect(field).to_have_value("TestX Artist")
    assert field.evaluate("el => el.selectionStart") == 5
    # Arrow keys move from the field into the results (iTunes requests are paced).
    expect(page.locator('[data-action="open-result"]').first).to_be_visible(timeout=10000)
    field.focus()
    field.press("ArrowDown")
    expect(page.locator('[data-action="open-result"]').first).to_be_focused()
    context.close()
    print("PASS resilience: session storage fallback, stable caret while searching, arrow keys into results")


def test_fewer_steps(browser):
    context = browser.new_context(service_workers="block", viewport={"width": 390, "height": 844})
    page = context.new_page()
    original_api_fixtures(page)
    visit(page)
    # Pasting an Apple Music link goes straight to the reader.
    page.get_by_role("searchbox").fill("https://music.apple.com/us/song/a-test-song/123")
    page.get_by_role("button", name="Search", exact=True).click()
    expect(page.get_by_role("heading", name="A test song")).to_be_visible()
    expect(page.get_by_text("Hola mundo", exact=True)).to_be_visible()
    # Without a browser language detector the source is guessed from the words,
    # so no "choose the language" step. (Playwright's Chromium has no detector.)
    page.evaluate("() => {}")
    context.close()

    context = browser.new_context(service_workers="block", viewport={"width": 390, "height": 844})
    page = context.new_page()
    original_api_fixtures(page)
    page.route("https://lrclib.net/api/**", lambda route: route.fulfill(json={
        "id": 2, "trackName": "A test song", "artistName": "Test Artist", "albumName": "Test Album",
        "duration": 180, "instrumental": False,
        "plainLyrics": "Abro la ventana al día\ny la luz me viene a encontrar\n\nCada calle guarda una historia\ncada voz un nuevo lugar",
    }))
    visit(page)
    page.get_by_role("searchbox").fill("Test Artist")
    page.get_by_role("button", name="Search", exact=True).click()
    page.get_by_role("button", name=re.compile("A test song")).click()
    expect(page.locator("#source-language")).to_have_value("es", timeout=10000)
    expect(page.locator("#translation-status")).not_to_contain_text("couldn’t tell which language")
    context.close()
    print("PASS fewer steps: pasted link opens the reader, language guessed without a browser detector")


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = launch(playwright)
        try:
            test_reading_and_storage(browser)
            test_search_states(browser)
            test_lyrics_error_state(browser)
            test_viewports(browser)
            test_compact_layout_and_forced_colors(browser)
            test_reader_refinement(browser)
            test_theme_and_cache_target(browser)
            test_offline_shell(browser)
            test_routing(browser)
            test_reading_controls(browser)
            test_storage_safety(browser)
            test_backup(browser)
            test_resilience(browser)
            test_fewer_steps(browser)
        finally:
            browser.close()
    print(f"All browser checks passed against {BASE_URL}.")
