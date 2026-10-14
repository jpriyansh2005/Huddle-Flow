"""Request and response shapes for the meetings API."""

from datetime import datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    computed_field,
)

from app.core.config import get_settings
from app.core.time import to_utc
from app.models import MeetingKind, MeetingStatus, ParticipantRole
from app.models.agenda_item import MAX_AGENDA_ITEMS, MAX_ITEM_MINUTES
from app.schemas.user import UserOut

MAX_DURATION_MINUTES = 24 * 60

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
Duration = Annotated[int, Field(ge=1, le=MAX_DURATION_MINUTES)]
# AwareDatetime rejects times without a timezone, so "10:00" can never be
# silently read in the server's timezone instead of the user's. The value is
# then converted to UTC, the only timezone the backend works in.
UtcDatetime = Annotated[AwareDatetime, AfterValidator(to_utc)]
AgendaMinutes = Annotated[int, Field(ge=1, le=MAX_ITEM_MINUTES)]


class AgendaItemIn(BaseModel):
    title: Title
    duration_minutes: AgendaMinutes


class AgendaItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    title: str
    duration_minutes: int
    started_at: datetime | None
    ended_at: datetime | None


Agenda = Annotated[list[AgendaItemIn], Field(max_length=MAX_AGENDA_ITEMS)]


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    title: str
    description: str | None
    kind: MeetingKind
    status: MeetingStatus
    scheduled_start: datetime | None
    duration_minutes: int | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    host: UserOut
    # The ORM attribute is agenda_items; the API calls it agenda.
    agenda: list[AgendaItemOut] = Field(validation_alias="agenda_items")

    @computed_field
    @property
    def join_url(self) -> str:
        """The shareable invite link for this meeting."""
        return f"{get_settings().frontend_url.rstrip('/')}/j/{self.code}"


class ScheduleMeetingIn(BaseModel):
    title: Title
    description: Description | None = None
    scheduled_start: UtcDatetime
    duration_minutes: Duration
    agenda: Agenda = []


class UpdateMeetingIn(BaseModel):
    """Partial update: only the fields that are sent are changed."""

    title: Title | None = None
    description: Description | None = None
    scheduled_start: UtcDatetime | None = None
    duration_minutes: Duration | None = None
    # When sent, the whole agenda is replaced by this list.
    agenda: Agenda | None = None


class JoinMeetingIn(BaseModel):
    display_name: DisplayName


class StartMeetingIn(BaseModel):
    # Optional: the host's own name is used when this is left out.
    display_name: DisplayName | None = None


class SessionOut(BaseModel):
    """What a browser needs to enter a meeting room."""

    participant_id: int
    session_token: str
    role: ParticipantRole
    display_name: str
    meeting: MeetingOut
