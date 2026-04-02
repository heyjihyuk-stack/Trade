"""Application configuration."""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME = "Trading Desk Console"
    VERSION = "1.0.0"
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", 8000))

    # API Keys
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "")

    # Default watchlist
    DEFAULT_WATCHLIST = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
        "META", "TSLA", "JPM", "V", "WMT",
    ]

    # Market data refresh interval (seconds)
    MARKET_REFRESH_INTERVAL = 5


settings = Settings()
