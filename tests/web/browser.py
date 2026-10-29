"""End-to-end regression checks. Run with the local server listening on port 4173.

External APIs are deterministic mocks with original, authored text. Browser model
availability and translation quality still need real-device acceptance testing.
"""
import re
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
    page.get_by_role("button", name="Save favorite", exact=True).click()
    expect(page.locator("dialog")).to_be_visible()
    page.get_by_role("button", name="Cancel", exact=True).click()
    navigate(page, "library")
    expect(page.locator('[data-action="open-library"]', has_text=DEMO_TITLE)).to_be_visible()
    assert page.locator(".song-duration", has_text="Saved").count() == 0
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
    expect(page.locator(".song-duration", has_text="Saved")).to_be_visible()
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
    page.locator("#cache").uncheck()
    navigate(page, "library")
    assert page.locator(".song-duration", has_text="Saved").count() == 0
    page.locator("#library-search").fill("Definitely no match")
    expect(page.locator('[data-action="open-library"]')).to_have_count(0)
    page.locator("#library-search").fill("")
    expect(page.locator('[data-action="open-library"]')).to_have_count(2)

    # Destructive actions require a concrete confirmation dialog.
    page.get_by_role("button", name=f"Remove {DEMO_TITLE}", exact=True).click()
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
            options.get_by_role("button", name="Switch between columns and stacked layout").click()
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
    for name in ["Cancel", "Enable permitted offline storage"]:
        button = dialog.get_by_role("button", name=name, exact=True)
        expect(button).to_be_visible()
        button_bounds = button.bounding_box()
        assert button_bounds["x"] >= bounds["x"], f"Permission choice clipped on the left: {name}"
        assert button_bounds["x"] + button_bounds["width"] <= bounds["x"] + bounds["width"], f"Permission choice clipped on the right: {name}"
        assert button_bounds["y"] + button_bounds["height"] <= bounds["y"] + bounds["height"], f"Permission choice clipped below dialog: {name}"
    dialog.get_by_role("button", name="Cancel", exact=True).click()
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


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = launch(playwright)
        try:
            test_reading_and_storage(browser)
            test_search_states(browser)
            test_lyrics_error_state(browser)
            test_viewports(browser)
            test_compact_layout_and_forced_colors(browser)
            test_offline_shell(browser)
        finally:
            browser.close()
    print(f"All browser checks passed against {BASE_URL}.")
