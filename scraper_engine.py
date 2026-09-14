import asyncio
import time
import json
import re
from typing import Dict, Any, List, Optional
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

# In-memory cache for sub-10ms instant response on repeated lookups
_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 300

class FastScraper:
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    async def get_client(self) -> httpx.AsyncClient:
        """Lazily creates or reuses an httpx.AsyncClient tied to the active event loop."""
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if self._client is None or self._client.is_closed or self._loop != current_loop:
            self._loop = current_loop
            self._client = httpx.AsyncClient(
                headers=HEADERS,
                follow_redirects=True,
                timeout=httpx.Timeout(connect=6.0, read=12.0, write=5.0, pool=6.0),
                http2=True,
                verify=False,
                limits=httpx.Limits(max_keepalive_connections=30, max_connections=60)
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def scrape(
        self,
        url: str,
        custom_selectors: Optional[List[Dict[str, str]]] = None,
        bypass_cache: bool = False
    ) -> Dict[str, Any]:
        start_time = time.perf_counter()

        # Sanitize and normalize URL
        url = (url or "").strip().strip('\'"')
        if not url:
            return {
                "success": False,
                "url": "",
                "error": "URL cannot be empty.",
                "duration_ms": 0,
                "duration_sec": 0
            }

        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        clean_url = url.strip()

        # Instant Cache check (< 1ms)
        now = time.time()
        if not bypass_cache and clean_url in _cache:
            entry = _cache[clean_url]
            if now - entry["cached_at"] < CACHE_TTL_SECONDS:
                result = dict(entry["data"])
                result["from_cache"] = True
                result["duration_ms"] = round((time.perf_counter() - start_time) * 1000, 2)
                result["duration_sec"] = round(result["duration_ms"] / 1000, 3)
                return result

        fetch_start = time.perf_counter()
        resp = None

        # Primary fetch with HTTP/2 client
        try:
            client = await self.get_client()
            resp = await client.get(clean_url)
        except Exception as primary_err:
            # Automatic fallback to standard HTTP/1.1 if HTTP/2 or pool fails
            try:
                async with httpx.AsyncClient(
                    headers=HEADERS,
                    follow_redirects=True,
                    timeout=httpx.Timeout(10.0),
                    verify=False
                ) as fallback_client:
                    resp = await fallback_client.get(clean_url)
            except Exception as final_err:
                total_duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
                return {
                    "success": False,
                    "url": clean_url,
                    "error": f"Connection failed: {str(final_err)}",
                    "duration_ms": total_duration_ms,
                    "duration_sec": round(total_duration_ms / 1000, 3),
                }

        fetch_duration_ms = round((time.perf_counter() - fetch_start) * 1000, 2)
        status_code = resp.status_code
        html_content = resp.text or ""
        final_url = str(resp.url)

        parse_start = time.perf_counter()
        
        # High-speed HTML parse using lxml with html.parser fallback
        try:
            soup = BeautifulSoup(html_content, "lxml")
        except Exception:
            soup = BeautifulSoup(html_content, "html.parser")

        # 1. Page Metadata
        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        if not title:
            og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "twitter:title"})
            title = og_title.get("content", "").strip() if og_title else ""

        description = ""
        meta_desc = (
            soup.find("meta", attrs={"name": "description"}) or 
            soup.find("meta", property="og:description") or
            soup.find("meta", attrs={"name": "twitter:description"})
        )
        if meta_desc:
            description = meta_desc.get("content", "").strip()

        og_image = ""
        meta_img = (
            soup.find("meta", property="og:image") or 
            soup.find("meta", attrs={"name": "twitter:image"})
        )
        if meta_img and meta_img.get("content"):
            og_image = urljoin(final_url, meta_img.get("content", "").strip())

        favicon = ""
        icon_tag = soup.find("link", rel=lambda x: x and ("icon" in x.lower() or "shortcut" in x.lower()))
        if icon_tag and icon_tag.get("href"):
            favicon = urljoin(final_url, icon_tag.get("href"))
        else:
            parsed = urlparse(final_url)
            favicon = f"{parsed.scheme}://{parsed.netloc}/favicon.ico"

        # 2. Headings (h1, h2, h3)
        headings = []
        for tag in soup.find_all(["h1", "h2", "h3"]):
            text = tag.get_text(strip=True)
            if text and len(text) < 200:
                headings.append({"tag": tag.name, "text": text})
            if len(headings) >= 50:
                break

        # 3. Links
        links = []
        seen_links = set()
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            link_text = a.get_text(strip=True)
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue
            abs_href = urljoin(final_url, href)
            if abs_href not in seen_links:
                seen_links.add(abs_href)
                links.append({"text": link_text or abs_href, "url": abs_href})
            if len(links) >= 50:
                break

        # 4. Images
        images = []
        seen_imgs = set()
        for img in soup.find_all("img"):
            src = (img.get("src") or img.get("data-src") or "").strip()
            alt = img.get("alt", "").strip()
            if src and not src.startswith("data:"):
                abs_src = urljoin(final_url, src)
                if abs_src not in seen_imgs:
                    seen_imgs.add(abs_src)
                    images.append({"src": abs_src, "alt": alt})
            if len(images) >= 40:
                break

        # 5. Structured Data (JSON-LD)
        json_ld_data = []
        for script in soup.find_all("script", type="application/ld+json"):
            if script.string:
                try:
                    parsed_json = json.loads(script.string.strip())
                    json_ld_data.append(parsed_json)
                except Exception:
                    pass

        # 6. Custom CSS Selectors
        custom_results = {}
        if custom_selectors:
            for item in custom_selectors:
                field_name = item.get("name", "custom")
                selector = item.get("selector", "")
                if selector:
                    try:
                        matches = []
                        for matched in soup.select(selector):
                            val = matched.get_text(strip=True)
                            if val:
                                matches.append(val)
                        custom_results[field_name] = matches
                    except Exception as err:
                        custom_results[field_name] = f"Selector error: {str(err)}"

        # 7. Main Text Preview
        for elem in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            elem.decompose()
        raw_text = soup.get_text(separator=" ", strip=True)
        cleaned_text = re.sub(r"\s+", " ", raw_text)[:2500]

        parse_duration_ms = round((time.perf_counter() - parse_start) * 1000, 2)
        total_duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        is_success = 200 <= status_code < 400
        error_message = None if is_success else f"HTTP {status_code}: {resp.reason_phrase or 'Server Error'}"

        data = {
            "success": is_success,
            "error": error_message,
            "url": final_url,
            "status_code": status_code,
            "title": title or ("(No Title Found)" if is_success else f"HTTP {status_code}"),
            "description": description,
            "og_image": og_image,
            "favicon": favicon,
            "headings": headings,
            "links": links,
            "images": images,
            "json_ld": json_ld_data,
            "text_sample": cleaned_text,
            "custom_data": custom_results,
            "page_size_kb": round(len(html_content) / 1024, 2),
            "fetch_duration_ms": fetch_duration_ms,
            "parse_duration_ms": parse_duration_ms,
            "duration_ms": total_duration_ms,
            "duration_sec": round(total_duration_ms / 1000, 3),
            "under_2_sec": total_duration_ms <= 2000.0,
            "from_cache": False,
        }

        # Cache successful response
        if status_code == 200:
            _cache[clean_url] = {
                "cached_at": now,
                "data": data
            }

        return data
