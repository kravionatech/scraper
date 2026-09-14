import os
import uuid
import asyncio
from typing import List, Optional, Dict
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from scraper_engine import FastScraper
from ga_traffic import GA4TrafficGenerator

app = FastAPI(title="Ultra-Fast Web Scraper", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scraper = FastScraper()
ga_generator = GA4TrafficGenerator()

class ScrapeRequest(BaseModel):
    url: str
    custom_selectors: Optional[List[Dict[str, str]]] = None
    bypass_cache: Optional[bool] = False

class TrafficRequest(BaseModel):
    url: str
    user_count: Optional[int] = 1000
    duration_minutes: Optional[float] = 0.0
    device: Optional[str] = "all"
    location: Optional[str] = "global"
    proxy: Optional[str] = None
    concurrency: Optional[int] = 40
    measurement_id: Optional[str] = None

class CancelRequest(BaseModel):
    job_id: str

@app.post("/api/scrape")
async def scrape_endpoint(payload: ScrapeRequest):
    raw_url = (payload.url or "").strip()
    if not raw_url:
        raise HTTPException(status_code=400, detail="URL cannot be empty.")
    result = await scraper.scrape(
        url=raw_url,
        custom_selectors=payload.custom_selectors,
        bypass_cache=payload.bypass_cache or False
    )
    return result

@app.post("/api/ga-traffic")
async def ga_traffic_endpoint(payload: TrafficRequest):
    raw_url = (payload.url or "").strip()
    if not raw_url:
        raise HTTPException(status_code=400, detail="URL cannot be empty.")
    count = min(max(payload.user_count or 100, 1), 10000)
    concurrency = min(max(payload.concurrency or 40, 5), 100)
    duration_minutes = max(float(payload.duration_minutes or 0.0), 0.0)
    job_id = str(uuid.uuid4())[:8]

    # Initialize job entry
    ga_generator.create_traffic_job(
        job_id=job_id,
        url=raw_url,
        count=count,
        duration_minutes=duration_minutes,
        device_choice=payload.device or "all",
        location_choice=payload.location or "global",
        proxy_url=payload.proxy
    )

    # Launch background non-blocking execution safely
    asyncio.create_task(
        ga_generator.start_background_traffic(
            job_id=job_id,
            url=raw_url,
            count=count,
            duration_minutes=duration_minutes,
            device_choice=payload.device or "all",
            location_choice=payload.location or "global",
            proxy_url=payload.proxy,
            concurrency=concurrency,
            custom_measurement_id=payload.measurement_id
        )
    )

    return {
        "success": True,
        "job_id": job_id,
        "status": "running",
        "message": f"Job {job_id} initiated. Monitoring live telemetry...",
        "target_count": count
    }

@app.post("/api/ga-cancel")
async def ga_cancel_endpoint(payload: CancelRequest):
    stopped = ga_generator.cancel_job(payload.job_id)
    return {"job_id": payload.job_id, "stopped": stopped}

@app.get("/api/ga-status/{job_id}")
async def ga_status_endpoint(job_id: str):
    info = ga_generator.get_job_status(job_id)
    if not info:
        raise HTTPException(status_code=404, detail="Job not found")
    return info

@app.get("/api/presets")
async def get_presets():
    return [
        {
            "name": "Hacker News (Fast Frontpage)",
            "url": "https://news.ycombinator.com",
            "description": "Tech news headlines, links, and points",
            "selectors": [{"name": "stories", "selector": ".titleline > a"}]
        },
        {
            "name": "Wikipedia - Special:Random",
            "url": "https://en.wikipedia.org/wiki/Special:Random",
            "description": "Knowledge article title, headings, and excerpts",
            "selectors": [{"name": "firstHeading", "selector": "#firstHeading"}]
        },
        {
            "name": "Quotes to Scrape (Demo Site)",
            "url": "https://quotes.toscrape.com",
            "description": "Quotes, authors, and tags",
            "selectors": [
                {"name": "quotes", "selector": ".quote span.text"},
                {"name": "authors", "selector": ".quote small.author"}
            ]
        },
        {
            "name": "Books to Scrape (Demo E-Commerce)",
            "url": "https://books.toscrape.com",
            "description": "Book titles, prices, stock availability",
            "selectors": [
                {"name": "book_titles", "selector": "h3 a"},
                {"name": "prices", "selector": ".price_color"}
            ]
        }
    ]

# Mount frontend static assets (supports both public/ for Vercel and static/ for local)
static_dir = "public" if os.path.exists("public") else ("static" if os.path.exists("static") else None)
if static_dir:
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
