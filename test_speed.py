import sys
import asyncio

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from scraper_engine import FastScraper

async def run_benchmark():
    test_urls = [
        ("https://news.ycombinator.com", [{"name": "stories", "selector": ".titleline > a"}]),
        ("https://books.toscrape.com", [{"name": "titles", "selector": "h3 a"}]),
        ("https://quotes.toscrape.com", [{"name": "quotes", "selector": ".quote span.text"}]),
    ]

    scraper = FastScraper()
    print("=== STARTING SPEED & SCRAPER BENCHMARK ===")
    
    all_passed = True
    try:
        for url, selectors in test_urls:
            res = await scraper.scrape(url, custom_selectors=selectors, bypass_cache=True)
            status = "⚡ PASSED (<2s)" if res["under_2_sec"] else f"⏱️ COMPLETED ({res['duration_sec']}s)"
            print(f"\n[Test] {url}")
            print(f"  Status: {'SUCCESS' if res.get('success') else 'FAILED'}")
            print(f"  Benchmark Target: {status}")
            print(f"  Total Duration: {res['duration_sec']}s ({res['duration_ms']} ms)")
            print(f"  Network Fetch: {res['fetch_duration_ms']} ms | Parse: {res['parse_duration_ms']} ms")
            print(f"  Title: {res.get('title', '')[:40]}")
            print(f"  Extracted Headings: {len(res.get('headings', []))} | Links: {len(res.get('links', []))}")
            if res.get("custom_data"):
                for k, v in res["custom_data"].items():
                    cnt = len(v) if isinstance(v, list) else 1
                    print(f"  Custom '{k}': {cnt} items matched")
            
            assert res.get("success"), f"Scraper failed on {url}: {res.get('error')}"
    finally:
        await scraper.close()

    print("\n✅ All benchmark tests completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
