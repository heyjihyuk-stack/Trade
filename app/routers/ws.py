"""WebSocket endpoints for real-time data streaming."""
import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.market_data import get_quotes
from app.config import settings

router = APIRouter()

# Connected clients
_clients: set[WebSocket] = set()


@router.websocket("/ws/market")
async def market_stream(websocket: WebSocket):
    """Stream real-time market data to connected clients."""
    await websocket.accept()
    _clients.add(websocket)

    # Get initial watchlist from query params or use default
    watchlist = list(settings.DEFAULT_WATCHLIST)

    try:
        while True:
            # Check for incoming messages (watchlist updates)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                msg = json.loads(data)
                if msg.get("type") == "watchlist":
                    watchlist = [s.upper() for s in msg.get("symbols", [])]
                elif msg.get("type") == "add_symbol":
                    sym = msg.get("symbol", "").upper()
                    if sym and sym not in watchlist:
                        watchlist.append(sym)
                elif msg.get("type") == "remove_symbol":
                    sym = msg.get("symbol", "").upper()
                    if sym in watchlist:
                        watchlist.remove(sym)
            except asyncio.TimeoutError:
                pass

            # Fetch and send quotes
            quotes = await asyncio.to_thread(get_quotes, watchlist)
            await websocket.send_json({
                "type": "quotes",
                "data": [q.model_dump() for q in quotes],
            })

            await asyncio.sleep(settings.MARKET_REFRESH_INTERVAL)

    except WebSocketDisconnect:
        _clients.discard(websocket)
    except Exception:
        _clients.discard(websocket)
