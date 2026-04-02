"""Market data service using yfinance."""
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional
from app.models import TickerQuote, CandleData

# Cache for ticker info to avoid repeated API calls
_ticker_cache: dict = {}
_quote_cache: dict = {}
_cache_expiry: dict = {}
CACHE_TTL = 10  # seconds


def _get_ticker(symbol: str) -> yf.Ticker:
    if symbol not in _ticker_cache:
        _ticker_cache[symbol] = yf.Ticker(symbol)
    return _ticker_cache[symbol]


def get_quote(symbol: str) -> Optional[TickerQuote]:
    """Get real-time quote for a symbol."""
    now = datetime.now()
    if symbol in _quote_cache and symbol in _cache_expiry:
        if now < _cache_expiry[symbol]:
            return _quote_cache[symbol]

    try:
        ticker = _get_ticker(symbol)
        info = ticker.fast_info
        hist = ticker.history(period="2d")

        if hist.empty:
            return None

        current = hist.iloc[-1]
        prev_close = hist.iloc[-2]["Close"] if len(hist) > 1 else current["Open"]
        price = current["Close"]
        change = price - prev_close
        change_pct = (change / prev_close) * 100 if prev_close else 0

        quote = TickerQuote(
            symbol=symbol,
            price=round(price, 2),
            change=round(change, 2),
            change_pct=round(change_pct, 2),
            volume=int(current.get("Volume", 0)),
            high=round(current["High"], 2),
            low=round(current["Low"], 2),
            open=round(current["Open"], 2),
            prev_close=round(prev_close, 2),
            market_cap=getattr(info, "market_cap", None),
            name=symbol,
            timestamp=now.isoformat(),
        )

        _quote_cache[symbol] = quote
        _cache_expiry[symbol] = now + timedelta(seconds=CACHE_TTL)
        return quote
    except Exception as e:
        print(f"Error fetching quote for {symbol}: {e}")
        return None


def get_quotes(symbols: list[str]) -> list[TickerQuote]:
    """Get quotes for multiple symbols."""
    quotes = []
    for sym in symbols:
        q = get_quote(sym)
        if q:
            quotes.append(q)
    return quotes


def get_chart_data(
    symbol: str, period: str = "6mo", interval: str = "1d"
) -> list[CandleData]:
    """Get OHLCV candle data for charting."""
    try:
        ticker = _get_ticker(symbol)
        hist = ticker.history(period=period, interval=interval)

        candles = []
        for idx, row in hist.iterrows():
            candles.append(
                CandleData(
                    time=idx.strftime("%Y-%m-%d"),
                    open=round(row["Open"], 2),
                    high=round(row["High"], 2),
                    low=round(row["Low"], 2),
                    close=round(row["Close"], 2),
                    volume=int(row["Volume"]),
                )
            )
        return candles
    except Exception as e:
        print(f"Error fetching chart data for {symbol}: {e}")
        return []


def get_technicals(symbol: str) -> dict:
    """Get technical indicators for a symbol."""
    try:
        ticker = _get_ticker(symbol)
        hist = ticker.history(period="1y", interval="1d")

        if hist.empty or len(hist) < 50:
            return {}

        close = hist["Close"]

        # Moving averages
        sma_20 = close.rolling(20).mean().iloc[-1]
        sma_50 = close.rolling(50).mean().iloc[-1]
        sma_200 = close.rolling(200).mean().iloc[-1] if len(close) >= 200 else None

        # RSI (14-period)
        delta = close.diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))

        # MACD
        ema12 = close.ewm(span=12).mean()
        ema26 = close.ewm(span=26).mean()
        macd_line = ema12 - ema26
        signal_line = macd_line.ewm(span=9).mean()
        macd_hist = macd_line - signal_line

        # Bollinger Bands
        bb_mid = sma_20
        bb_std = close.rolling(20).std().iloc[-1]
        bb_upper = bb_mid + 2 * bb_std
        bb_lower = bb_mid - 2 * bb_std

        # Volume average
        vol_avg = hist["Volume"].rolling(20).mean().iloc[-1]

        current_price = close.iloc[-1]

        return {
            "price": round(current_price, 2),
            "sma_20": round(sma_20, 2),
            "sma_50": round(sma_50, 2),
            "sma_200": round(sma_200, 2) if sma_200 else None,
            "rsi": round(rsi.iloc[-1], 2),
            "macd": round(macd_line.iloc[-1], 4),
            "macd_signal": round(signal_line.iloc[-1], 4),
            "macd_histogram": round(macd_hist.iloc[-1], 4),
            "bb_upper": round(bb_upper, 2),
            "bb_middle": round(bb_mid, 2),
            "bb_lower": round(bb_lower, 2),
            "volume_avg_20d": int(vol_avg),
            "above_sma_20": current_price > sma_20,
            "above_sma_50": current_price > sma_50,
            "above_sma_200": current_price > sma_200 if sma_200 else None,
        }
    except Exception as e:
        print(f"Error calculating technicals for {symbol}: {e}")
        return {}


def search_symbol(query: str) -> list[dict]:
    """Search for ticker symbols."""
    try:
        results = []
        ticker = yf.Ticker(query.upper())
        info = ticker.info
        if info and info.get("symbol"):
            results.append({
                "symbol": info["symbol"],
                "name": info.get("shortName", info.get("longName", "")),
                "exchange": info.get("exchange", ""),
                "type": info.get("quoteType", ""),
            })
        return results
    except Exception:
        return []
