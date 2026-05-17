"""Sprint analytics schemas — burndown and velocity payloads."""

from datetime import date

from pydantic import BaseModel


class BurndownPoint(BaseModel):
    # ISO date string. The day this point represents (end-of-day snapshot).
    day: date
    # Number of tasks NOT in 'done' status as of end-of-day.
    remaining: int
    # Idealised straight-line target for the same day. Frontend renders this
    # as the dashed "ideal" trace.
    ideal: float


class BurndownResponse(BaseModel):
    sprint_id: str
    total: int  # tasks in this sprint
    start: date
    end: date
    points: list[BurndownPoint]


class VelocityBar(BaseModel):
    sprint_id: str
    sprint_name: str
    end_at: date | None
    total: int
    completed: int


class VelocityResponse(BaseModel):
    project_id: str
    bars: list[VelocityBar]
