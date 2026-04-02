"""Data models for the trading desk."""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TickerQuote(BaseModel):
    symbol: str
    price: float
    change: float
    change_pct: float
    volume: int
    high: float
    low: float
    open: float
    prev_close: float
    market_cap: Optional[float] = None
    name: Optional[str] = None
    timestamp: str


class CandleData(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class NewsItem(BaseModel):
    title: str
    source: str
    url: str
    published: str
    summary: Optional[str] = None
    sentiment: Optional[str] = None


class PortfolioPosition(BaseModel):
    symbol: str
    shares: float
    avg_cost: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float


class TradeOrder(BaseModel):
    symbol: str
    side: str  # BUY or SELL
    quantity: float
    order_type: str = "MARKET"  # MARKET, LIMIT
    limit_price: Optional[float] = None


class AnalysisRequest(BaseModel):
    symbol: str
    analysis_date: Optional[str] = None


class AnalysisResult(BaseModel):
    symbol: str
    decision: str
    confidence: Optional[float] = None
    fundamental_summary: Optional[str] = None
    technical_summary: Optional[str] = None
    sentiment_summary: Optional[str] = None
    news_summary: Optional[str] = None
    risk_assessment: Optional[str] = None
    timestamp: str
