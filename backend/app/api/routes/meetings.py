"""REST endpoints for meetings.

Routes stay thin: they read the request, call the service layer and shape
the response. The rules themselves live in ``app/services``.
"""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, DbSession, OptionalUser
from app.models import Participant, ParticipantRole
from app.schemas.meeting import (
    JoinMeetingIn,
    MeetingOut,
    ScheduleMeetingIn,
    SessionOut,
    StartMeetingIn,
    UpdateMeetingIn,
)
from app.schemas.recap import RecapOut
from app.services import meeting_service, participant_service, recap_service

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("/upcoming", response_model=list[MeetingOut])
def list_upcoming(db: DbSession, user: CurrentUser):
    return meeting_service.list_upcoming_meetings(db, user)


@router.get("/recent", response_model=list[MeetingOut])
def list_recent(db: DbSession, user: CurrentUser):
    return meeting_service.list_recent_meetings(db, user)


@router.post("/instant", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def create_instant(db: DbSession, user: CurrentUser):
    """Create a meeting that starts right now."""
    return meeting_service.create_instant_meeting(db, user)


@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def schedule(data: ScheduleMeetingIn, db: DbSession, user: CurrentUser):
    """Schedule a meeting for a future date and time."""
    return meeting_service.schedule_meeting(db, user, data)


@router.get("/{code}", response_model=MeetingOut)
def read_meeting(code: str, db: DbSession):
    """Look a meeting up by its ID. Used to validate an ID before joining."""
    return meeting_service.get_meeting_by_code(db, code)


@router.patch("/{code}", response_model=MeetingOut)
def update(code: str, data: UpdateMeetingIn, db: DbSession, user: CurrentUser):
    meeting = meeting_service.get_meeting_by_code(db, code)
    return meeting_service.update_meeting(db, meeting, user, data)


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
def delete(code: str, db: DbSession, user: CurrentUser):
    meeting = meeting_service.get_meeting_by_code(db, code)
    meeting_service.delete_meeting(db, meeting, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{code}/start", response_model=SessionOut)
def start(code: str, data: StartMeetingIn, db: DbSession, user: CurrentUser):
    """Host entry point: mark the meeting live and enter it as the host."""
    meeting = meeting_service.get_meeting_by_code(db, code)
    meeting_service.start_meeting(db, meeting, user)
    participant = participant_service.join_meeting(
        db,
        meeting,
        data.display_name or user.name,
        role=ParticipantRole.HOST,
        user=user,
    )
    return _session(participant)


@router.post("/{code}/join", response_model=SessionOut)
def join(code: str, data: JoinMeetingIn, db: DbSession, user: OptionalUser):
    """Guest entry point: join by meeting ID or invite link with a display name.

    No account is needed. A signed-in visitor's attendance is linked to their
    account, so the meeting can later show up for them.
    """
    meeting = meeting_service.get_meeting_by_code(db, code)
    participant = participant_service.join_meeting(db, meeting, data.display_name, user=user)
    return _session(participant)


@router.get("/{code}/recap", response_model=RecapOut)
def read_recap(
    code: str,
    db: DbSession,
    user: OptionalUser,
    key: Annotated[str | None, Query(max_length=128)] = None,
):
    """Everything the meeting produced. For the host, signed-in attendees, and
    anyone with the share link (``?key=``)."""
    return recap_service.get_recap(db, code, user, key)


def _session(participant: Participant) -> SessionOut:
    return SessionOut(
        participant_id=participant.id,
        session_token=participant.session_token,
        role=participant.role,
        display_name=participant.display_name,
        meeting=MeetingOut.model_validate(participant.meeting),
    )
