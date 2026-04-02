"""Portfolio management service (in-memory simulation)."""
from datetime import datetime
from typing import Optional
from app.models import PortfolioPosition, TradeOrder
from app.services.market_data import get_quote

# In-memory portfolio state
_portfolio: dict[str, dict] = {}
_cash: float = 1_000_000.00  # Starting cash $1M
_trade_history: list[dict] = []


def get_cash() -> float:
    return _cash


def get_positions() -> list[PortfolioPosition]:
    """Get all current positions with live P&L."""
    positions = []
    for symbol, pos in _portfolio.items():
        if pos["shares"] == 0:
            continue
        quote = get_quote(symbol)
        current_price = quote.price if quote else pos["avg_cost"]
        market_value = current_price * pos["shares"]
        cost_basis = pos["avg_cost"] * pos["shares"]
        unrealized_pnl = market_value - cost_basis
        unrealized_pnl_pct = (unrealized_pnl / cost_basis * 100) if cost_basis else 0

        positions.append(PortfolioPosition(
            symbol=symbol,
            shares=pos["shares"],
            avg_cost=round(pos["avg_cost"], 2),
            current_price=round(current_price, 2),
            market_value=round(market_value, 2),
            unrealized_pnl=round(unrealized_pnl, 2),
            unrealized_pnl_pct=round(unrealized_pnl_pct, 2),
        ))
    return positions


def get_portfolio_summary() -> dict:
    """Get portfolio summary with total value, P&L, etc."""
    positions = get_positions()
    total_market_value = sum(p.market_value for p in positions)
    total_cost = sum(p.avg_cost * p.shares for p in positions)
    total_unrealized_pnl = sum(p.unrealized_pnl for p in positions)
    total_value = _cash + total_market_value

    return {
        "cash": round(_cash, 2),
        "positions_value": round(total_market_value, 2),
        "total_value": round(total_value, 2),
        "total_unrealized_pnl": round(total_unrealized_pnl, 2),
        "total_unrealized_pnl_pct": round(
            (total_unrealized_pnl / total_cost * 100) if total_cost else 0, 2
        ),
        "num_positions": len(positions),
        "positions": [p.model_dump() for p in positions],
    }


def execute_trade(order: TradeOrder) -> dict:
    """Execute a trade order."""
    global _cash

    quote = get_quote(order.symbol)
    if not quote:
        return {"success": False, "error": f"Cannot get price for {order.symbol}"}

    price = order.limit_price if order.order_type == "LIMIT" and order.limit_price else quote.price
    total_cost = price * order.quantity

    if order.side == "BUY":
        if total_cost > _cash:
            return {"success": False, "error": f"Insufficient cash. Need ${total_cost:,.2f}, have ${_cash:,.2f}"}

        _cash -= total_cost

        if order.symbol in _portfolio:
            pos = _portfolio[order.symbol]
            total_shares = pos["shares"] + order.quantity
            pos["avg_cost"] = (
                (pos["avg_cost"] * pos["shares"] + price * order.quantity)
                / total_shares
            )
            pos["shares"] = total_shares
        else:
            _portfolio[order.symbol] = {
                "shares": order.quantity,
                "avg_cost": price,
            }

    elif order.side == "SELL":
        if order.symbol not in _portfolio or _portfolio[order.symbol]["shares"] < order.quantity:
            available = _portfolio.get(order.symbol, {}).get("shares", 0)
            return {"success": False, "error": f"Insufficient shares. Have {available}, need {order.quantity}"}

        _cash += total_cost
        _portfolio[order.symbol]["shares"] -= order.quantity

        if _portfolio[order.symbol]["shares"] == 0:
            del _portfolio[order.symbol]

    trade_record = {
        "symbol": order.symbol,
        "side": order.side,
        "quantity": order.quantity,
        "price": round(price, 2),
        "total": round(total_cost, 2),
        "timestamp": datetime.now().isoformat(),
    }
    _trade_history.append(trade_record)

    return {"success": True, "trade": trade_record, "cash_remaining": round(_cash, 2)}


def get_trade_history() -> list[dict]:
    return list(reversed(_trade_history))
