"""Trading Desk Console - Main FastAPI Application."""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.routers import market, portfolio_router, analysis_router, ws
from app.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Bloomberg-style Trading Desk Console powered by AI",
)

# Include routers
app.include_router(market.router)
app.include_router(portfolio_router.router)
app.include_router(analysis_router.router)
app.include_router(ws.router)

# Serve static files
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
async def root():
    return FileResponse(str(static_dir / "index.html"))


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}
