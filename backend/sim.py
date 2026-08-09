"""HTTP-Schicht des Simulations-Endpunkts (dünn — die Logik liegt in core.py)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .convert import ConvertError
from .core import run_shot_simulation

router = APIRouter(prefix="/api/sim", tags=["simulation"])


class ShotRequest(BaseModel):
    values: dict[str, float]
    curve: list[list[float]] = Field(min_length=1, max_length=50)
    count: int = Field(400, ge=50, le=2000)
    process: dict | None = None
    vacuum: dict | None = None


@router.post("/shot")
def simulate_shot(req: ShotRequest):
    try:
        return run_shot_simulation(req.values, req.curve, count=req.count,
                                   process=req.process, vacuum=req.vacuum)
    except ConvertError as error:
        raise HTTPException(status_code=422, detail=str(error))
