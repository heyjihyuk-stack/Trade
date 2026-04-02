"""Portfolio API endpoints."""
from fastapi import APIRouter
from app.models import TradeOrder
from app.services.portfolio import (
    get_portfolio_summary,
    execute_trade,
    get_trade_history,
)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/summary")
def summary():
    return get_portfolio_summary()


@router.post("/trade")
def trade(order: TradeOrder):
    return execute_trade(order)


@router.get("/history")
def history():
    return get_trade_history()
