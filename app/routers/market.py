"""Market data API endpoints."""
from fastapi import APIRouter, Query
from app.services.market_data import get_quote, get_quotes, get_chart_data, get_technicals, search_symbol
from app.config import settings

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/quote/{symbol}")
def quote(symbol: str):
    result = get_quote(symbol.upper())
    if not result:
        return {"error": f"Symbol {symbol} not found"}
    return result.model_dump()


@router.get("/quotes")
def quotes(symbols: str = Query(default="")):
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()] or settings.DEFAULT_WATCHLIST
    return [q.model_dump() for q in get_quotes(sym_list)]


@router.get("/chart/{symbol}")
def chart(symbol: str, period: str = "6mo", interval: str = "1d"):
    data = get_chart_data(symbol.upper(), period, interval)
    return [c.model_dump() for c in data]


@router.get("/technicals/{symbol}")
def technicals(symbol: str):
    return get_technicals(symbol.upper())


@router.get("/search")
def search(q: str):
    return search_symbol(q)
