"""AI meeting summaries. Off unless an LLM API key is configured."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import FeatureDisabledError
from app.schemas.summary import SummaryOut
from app.services import meeting_service, summary_service
from app.services.llm import JsonModel, get_json_model

router = APIRouter(prefix="/meetings", tags=["summaries"])

ConfiguredModel = Annotated[JsonModel | None, Depends(get_json_model)]


@router.post("/{code}/summary", response_model=SummaryOut)
def create_summary(code: str, db: DbSession, user: CurrentUser, model: ConfiguredModel):
    """Write (or rewrite) the meeting's summary. For the host only.

    This waits for the model, which usually takes a few seconds. FastAPI runs
    plain ``def`` routes in a worker thread, so other requests carry on.
    """
    if model is None:
        raise FeatureDisabledError("AI summaries are switched off on this server.")
    meeting = meeting_service.get_meeting_by_code(db, code)
    summary = summary_service.generate_summary(db, meeting, user, model)
    return SummaryOut(**summary.content, model=summary.model, created_at=summary.created_at)
