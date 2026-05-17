from datetime import datetime

from pydantic import BaseModel

from app.schemas.task import TaskResponse


class DependencyCreate(BaseModel):
    blocker_task_id: str
    blocked_task_id: str


class DependencyResponse(BaseModel):
    id: str
    blocker_task_id: str
    blocked_task_id: str
    created_at: datetime


class DependencyLink(BaseModel):
    # The row id of the task_dependencies entry. Surfacing it on the
    # response lets the frontend issue DELETE /dependencies/:id without
    # a second roundtrip to look up the row by (blocker, blocked) pair.
    dependency_id: str
    task: TaskResponse


class TaskDependencies(BaseModel):
    # "Who blocks me" — tasks whose completion this task is waiting on.
    blockers: list[DependencyLink]
    # "Whom I block" — tasks waiting on this task.
    blocking: list[DependencyLink]
