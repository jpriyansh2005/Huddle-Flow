"""Shapes of live-caption transcripts and AI meeting summaries."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, StringConstraints

# The model is asked for at most six of each; anything beyond eight is dropped
# rather than failing a summary that is otherwise fine.
MAX_POINTS = 8


def _first_points(value: object) -> object:
    return value[:MAX_POINTS] if isinstance(value, list) else value


Point = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
Points = Annotated[list[Point], BeforeValidator(_first_points)]


class SummaryContent(BaseModel):
    """What the model must send back. Checked before anything is saved."""

    model_config = ConfigDict(extra="forbid")

    overview: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=3000)
    ]
    key_points: Points
    decisions: Points
    open_questions: Points


# The same shape as JSON Schema, sent with the request so the provider makes
# the model's answer match it ("structured outputs", strict mode).
_POINT_LIST = {"type": "array", "items": {"type": "string"}}
SUMMARY_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "overview": {"type": "string"},
        "key_points": _POINT_LIST,
        "decisions": _POINT_LIST,
        "open_questions": _POINT_LIST,
    },
    "required": ["overview", "key_points", "decisions", "open_questions"],
    "additionalProperties": False,
}


class SummaryOut(SummaryContent):
    model: str
    created_at: datetime


class TranscriptLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    participant_id: int | None
    speaker_name: str
    text: str
    spoken_at: datetime
