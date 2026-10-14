"""Business rules for creating, listing, changing and ending meetings."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    DomainError,
    MeetingEndedError,
    MeetingInProgressError,
    MeetingNotFoundError,
    NotMeetingHostError,
)
from app.core.time import utc_now
from app.models import Meeting, MeetingKind, MeetingStatus, Participant, User
from app.schemas.meeting import ScheduleMeetingIn, UpdateMeetingIn
from app.services import agenda_service
from app.services.meeting_code import generate_meeting_code, normalize_meeting_code

RECENT_LIMIT = 20
# Allow a start time slightly in the past so "start now" is not rejected
# because of the seconds spent filling in the form.
_PAST_START_GRACE = timedelta(minutes=5)


def create_instant_meeting(db: Session, host: User) -> Meeting:
    """Create a meeting that is live straight away (the "New Meeting" button)."""
    now = utc_now()
    meeting = Meeting(
        code=generate_meeting_code(db),
        host=host,
        title=f"{host.name}'s huddle",
        kind=MeetingKind.INSTANT,
        status=MeetingStatus.LIVE,
        started_at=now,
    )
    db.add(meeting)
    db.commit()
    return meeting


def schedule_meeting(db: Session, host: User, data: ScheduleMeetingIn) -> Meeting:
    _ensure_not_in_past(data.scheduled_start)
    meeting = Meeting(
        code=generate_meeting_code(db),
        host=host,
        title=data.title,
        description=data.description or None,
        kind=MeetingKind.SCHEDULED,
        status=MeetingStatus.SCHEDULED,
        scheduled_start=data.scheduled_start,
        duration_minutes=data.duration_minutes,
    )
    agenda_service.replace_agenda(meeting, data.agenda)
    db.add(meeting)
    db.commit()
    return meeting


def get_meeting_by_code(db: Session, raw_code: str) -> Meeting:
    """Look a meeting up by its public ID. Raises if it does not exist."""
    code = normalize_meeting_code(raw_code)
    meeting = db.scalar(
        select(Meeting).where(Meeting.code == code).options(selectinload(Meeting.host))
    )
    if meeting is None:
        raise MeetingNotFoundError()
    return meeting


def list_upcoming_meetings(db: Session, host: User) -> list[Meeting]:
    """Scheduled meetings whose planned end has not passed, soonest first."""
    now = utc_now()
    candidates = db.scalars(
        select(Meeting)
        .where(
            Meeting.host_id == host.id,
            Meeting.kind == MeetingKind.SCHEDULED,
            Meeting.status != MeetingStatus.ENDED,
        )
        .options(selectinload(Meeting.host))
        .order_by(Meeting.scheduled_start)
    ).all()
    # The end time is start + duration, which is awkward to compute portably
    # in SQL. The query already narrows to one host's open meetings, so the
    # final check runs in Python on a handful of rows.
    return [meeting for meeting in candidates if meeting.is_upcoming(now)]


def list_recent_meetings(db: Session, host: User) -> list[Meeting]:
    """Everything that is not upcoming, most recent activity first."""
    now = utc_now()
    meetings = db.scalars(
        select(Meeting).where(Meeting.host_id == host.id).options(selectinload(Meeting.host))
    ).all()
    recent = [meeting for meeting in meetings if not meeting.is_upcoming(now)]
    recent.sort(key=_last_activity, reverse=True)
    return recent[:RECENT_LIMIT]


def update_meeting(db: Session, meeting: Meeting, user: User, data: UpdateMeetingIn) -> Meeting:
    ensure_host(meeting, user)
    if meeting.kind != MeetingKind.SCHEDULED:
        raise DomainError("Only scheduled meetings can be edited.")
    if meeting.status == MeetingStatus.ENDED:
        raise MeetingEndedError()

    # exclude_unset keeps "field not sent" apart from "field sent as null".
    changes = data.model_dump(exclude_unset=True)
    if "description" in changes:
        meeting.description = changes.pop("description") or None
    agenda = changes.pop("agenda", None)
    if agenda is not None:
        if meeting.status != MeetingStatus.SCHEDULED:
            # Replacing it would wipe the live progress; the host changes the
            # agenda of a running meeting from inside the meeting.
            raise MeetingInProgressError()
        agenda_service.replace_agenda(meeting, data.agenda or [])
    # The remaining columns are required, so a null means "leave unchanged".
    for field, value in changes.items():
        if value is None:
            continue
        if field == "scheduled_start":
            _ensure_not_in_past(value)
        setattr(meeting, field, value)
    db.commit()
    return meeting


def delete_meeting(db: Session, meeting: Meeting, user: User) -> None:
    ensure_host(meeting, user)
    if meeting.status == MeetingStatus.LIVE:
        raise MeetingInProgressError("End the meeting before deleting it.")
    db.delete(meeting)
    db.commit()


def start_meeting(db: Session, meeting: Meeting, user: User) -> Meeting:
    """Mark a meeting as live. Only its host may do this."""
    ensure_host(meeting, user)
    if meeting.status == MeetingStatus.ENDED:
        raise MeetingEndedError()
    if meeting.status != MeetingStatus.LIVE:
        meeting.status = MeetingStatus.LIVE
        meeting.started_at = utc_now()
        db.commit()
    return meeting


def end_meeting(db: Session, meeting: Meeting) -> Meeting:
    """End the meeting for everyone and close all open attendance records."""
    if meeting.status == MeetingStatus.ENDED:
        return meeting
    now = utc_now()
    meeting.status = MeetingStatus.ENDED
    meeting.ended_at = now
    agenda_service.close_running_item(meeting, now)
    still_present = db.scalars(
        select(Participant).where(
            Participant.meeting_id == meeting.id, Participant.left_at.is_(None)
        )
    )
    for participant in still_present:
        participant.left_at = now
    db.commit()
    return meeting


def ensure_host(meeting: Meeting, user: User) -> None:
    if meeting.host_id != user.id:
        raise NotMeetingHostError()


def _ensure_not_in_past(start) -> None:
    if start < utc_now() - _PAST_START_GRACE:
        raise DomainError("The meeting cannot be scheduled in the past.")


def _last_activity(meeting: Meeting):
    return meeting.ended_at or meeting.started_at or meeting.scheduled_start or meeting.created_at
