from typing import Literal

from pydantic import BaseModel


class SearchResult(BaseModel):
    type: Literal["project", "task", "label"]
    id: str
    label: str
    sublabel: str | None = None
    href: str
