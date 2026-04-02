"""AI Analysis service - integrates with TradingAgents framework."""
import asyncio
from datetime import datetime
from typing import Optional
from app.models import AnalysisResult
from app.services.market_data import get_technicals, get_quote

# Cache for analysis results
_analysis_cache: dict[str, AnalysisResult] = {}


def _generate_basic_analysis(symbol: str) -> AnalysisResult:
    """Generate analysis using technical indicators when TradingAgents is not available."""
    technicals = get_technicals(symbol)
    quote = get_quote(symbol)

    if not technicals or not quote:
        return AnalysisResult(
            symbol=symbol,
            decision="HOLD",
            confidence=0.5,
            fundamental_summary="Unable to fetch data for analysis.",
            technical_summary="No technical data available.",
            sentiment_summary="N/A",
            news_summary="N/A",
            risk_assessment="Unable to assess risk without data.",
            timestamp=datetime.now().isoformat(),
        )

    # Simple rule-based analysis from technicals
    signals = []
    bullish = 0
    bearish = 0

    # RSI signals
    rsi = technicals.get("rsi", 50)
    if rsi < 30:
        signals.append(f"RSI ({rsi}) indicates oversold - bullish signal")
        bullish += 2
    elif rsi > 70:
        signals.append(f"RSI ({rsi}) indicates overbought - bearish signal")
        bearish += 2
    elif rsi < 50:
        signals.append(f"RSI ({rsi}) below midline - mild bearish")
        bearish += 1
    else:
        signals.append(f"RSI ({rsi}) above midline - mild bullish")
        bullish += 1

    # Moving average signals
    if technicals.get("above_sma_20"):
        signals.append("Price above SMA(20) - short-term bullish")
        bullish += 1
    else:
        signals.append("Price below SMA(20) - short-term bearish")
        bearish += 1

    if technicals.get("above_sma_50"):
        signals.append("Price above SMA(50) - medium-term bullish")
        bullish += 1
    else:
        signals.append("Price below SMA(50) - medium-term bearish")
        bearish += 1

    if technicals.get("above_sma_200") is not None:
        if technicals["above_sma_200"]:
            signals.append("Price above SMA(200) - long-term bullish")
            bullish += 1
        else:
            signals.append("Price below SMA(200) - long-term bearish")
            bearish += 1

    # MACD signals
    macd_hist = technicals.get("macd_histogram", 0)
    if macd_hist > 0:
        signals.append(f"MACD histogram positive ({macd_hist:.4f}) - bullish momentum")
        bullish += 1
    else:
        signals.append(f"MACD histogram negative ({macd_hist:.4f}) - bearish momentum")
        bearish += 1

    # Bollinger Band signals
    price = technicals.get("price", 0)
    bb_upper = technicals.get("bb_upper", 0)
    bb_lower = technicals.get("bb_lower", 0)
    if price and bb_upper and bb_lower:
        if price > bb_upper:
            signals.append("Price above upper Bollinger Band - potentially overbought")
            bearish += 1
        elif price < bb_lower:
            signals.append("Price below lower Bollinger Band - potentially oversold")
            bullish += 1

    total = bullish + bearish
    confidence = max(bullish, bearish) / total if total else 0.5

    if bullish > bearish + 2:
        decision = "STRONG BUY"
    elif bullish > bearish:
        decision = "BUY"
    elif bearish > bullish + 2:
        decision = "STRONG SELL"
    elif bearish > bullish:
        decision = "SELL"
    else:
        decision = "HOLD"

    tech_summary = "\n".join(f"  • {s}" for s in signals)

    fundamental_summary = (
        f"${quote.symbol} trading at ${quote.price:.2f} "
        f"({'▲' if quote.change >= 0 else '▼'} {abs(quote.change):.2f}, {quote.change_pct:+.2f}%)\n"
        f"  • Day Range: ${quote.low:.2f} - ${quote.high:.2f}\n"
        f"  • Volume: {quote.volume:,}\n"
        f"  • Market Cap: ${quote.market_cap/1e9:.1f}B" if quote.market_cap else
        f"${quote.symbol} at ${quote.price:.2f} ({quote.change_pct:+.2f}%)"
    )

    risk_level = "LOW" if abs(quote.change_pct) < 1 else "MEDIUM" if abs(quote.change_pct) < 3 else "HIGH"
    bb_width = ((bb_upper - bb_lower) / technicals.get("bb_middle", 1) * 100) if technicals.get("bb_middle") else 0

    risk_assessment = (
        f"Risk Level: {risk_level}\n"
        f"  • Daily volatility: {abs(quote.change_pct):.2f}%\n"
        f"  • Bollinger Band width: {bb_width:.1f}%\n"
        f"  • RSI: {rsi:.1f} ({'Overbought zone' if rsi > 70 else 'Oversold zone' if rsi < 30 else 'Neutral zone'})"
    )

    return AnalysisResult(
        symbol=symbol,
        decision=decision,
        confidence=round(confidence, 2),
        fundamental_summary=fundamental_summary,
        technical_summary=tech_summary,
        sentiment_summary="Technical analysis mode - sentiment analysis requires LLM API key configuration.",
        news_summary="Technical analysis mode - news analysis requires LLM API key configuration.",
        risk_assessment=risk_assessment,
        timestamp=datetime.now().isoformat(),
    )


def _try_tradingagents_analysis(symbol: str, analysis_date: Optional[str] = None) -> Optional[AnalysisResult]:
    """Try to use TradingAgents framework for comprehensive AI analysis."""
    try:
        from tradingagents.graph.trading_graph import TradingAgentsGraph
        from tradingagents.default_config import DEFAULT_CONFIG

        ta = TradingAgentsGraph(config=DEFAULT_CONFIG)
        date = analysis_date or datetime.now().strftime("%Y-%m-%d")
        _, decision = ta.propagate(symbol, date)

        return AnalysisResult(
            symbol=symbol,
            decision=decision.get("action", "HOLD"),
            confidence=decision.get("confidence"),
            fundamental_summary=decision.get("fundamental_report", ""),
            technical_summary=decision.get("technical_report", ""),
            sentiment_summary=decision.get("sentiment_report", ""),
            news_summary=decision.get("news_report", ""),
            risk_assessment=decision.get("risk_report", ""),
            timestamp=datetime.now().isoformat(),
        )
    except ImportError:
        return None
    except Exception as e:
        print(f"TradingAgents error: {e}")
        return None


def run_analysis(symbol: str, analysis_date: Optional[str] = None) -> AnalysisResult:
    """Run full analysis on a symbol. Tries TradingAgents first, falls back to basic."""
    # Try TradingAgents first
    result = _try_tradingagents_analysis(symbol, analysis_date)
    if result:
        _analysis_cache[symbol] = result
        return result

    # Fallback to built-in technical analysis
    result = _generate_basic_analysis(symbol)
    _analysis_cache[symbol] = result
    return result


def get_cached_analysis(symbol: str) -> Optional[AnalysisResult]:
    return _analysis_cache.get(symbol)
