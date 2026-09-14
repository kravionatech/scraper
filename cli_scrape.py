import sys
import asyncio

# Ensure UTF-8 output on Windows terminal
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from scraper_engine import FastScraper

async def main():
    if len(sys.argv) > 1:
        url = sys.argv[1].strip()
    else:
        url = input("\n👉 Apna Website URL yahan enter karein: ").strip()

    if not url:
        print("URL khali nahi ho sakta!")
        return

    print(f"\n⚡ Scraping shuru ho rahi hai: {url} ...")
    scraper = FastScraper()
    try:
        res = await scraper.scrape(url, bypass_cache=True)
    finally:
        await scraper.close()

    if not res.get("success"):
        print(f"❌ Error: {res.get('error')}")
        if res.get("status_code"):
            print(f"HTTP Status: {res.get('status_code')}")
        return

    print("=" * 60)
    print(f"✅ DATA MIL GAYA! (Time: {res['duration_sec']}s / {res['duration_ms']}ms)")
    print("=" * 60)
    print(f"📌 Page Title: {res.get('title')}")
    print(f"📄 Description: {res.get('description') or 'N/A'}")
    print(f"🔗 Total Links: {len(res.get('links', []))}")
    print(f"🖼️ Total Images: {len(res.get('images', []))}")
    print(f"📑 Total Headings: {len(res.get('headings', []))}")
    
    print("\n--- Kuch Sample Links ---")
    for link in res.get('links', [])[:5]:
        print(f"  • {link.get('text')} -> {link.get('url')}")

    print("\n--- Website Ka Text (Preview) ---")
    print(res.get('text_sample', '')[:300] + "...")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
