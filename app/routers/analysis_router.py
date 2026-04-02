"""AI Analysis API endpoints."""
from fastapi import APIRouter
from app.models import AnalysisRequest
from app.services.analysis import run_analysis, get_cached_analysis

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.post("/run")
def analyze(req: AnalysisRequest):
    result = run_analysis(req.symbol.upper(), req.analysis_date)
    return result.model_dump()


@router.get("/cached/{symbol}")
def cached(symbol: str):
    result = get_cached_analysis(symbol.upper())
    if not result:
        return {"error": "No cached analysis"}
    return result.model_dump()
