"""Meeting recaps: who may read one, and what goes in it.

A recap can be read by
- the host,
- a signed-in person who attended the meeting,
- anyone with the share link, whose ``key`` matches the meeting's ``recap_key``.
"""

import secrets
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DomainError, NotAuthenticatedError
from app.core.time import utc_now
from app.models import ChatMessage, Meeting, Participant, ParticipantRole, User
from app.schemas.meeting import MeetingOut
from app.schemas.meeting_record import ActionItemOut, ChatMessageOut, NoteOut
from app.schemas.recap import AttendeeOut, RecapOut, RecapViewerOut
from app.services import meeting_service

# A recap shows at most this many chat messages, the latest ones.
RECAP_CHAT_LIMIT = 1000


class RecapNotFoundError(DomainError):
    status_code = 404
    message = "This recap link is not valid, or the recap is not yours to see."


class RecapNotReadyError(DomainError):
    status_code = 409
    message = "There is no recap yet: this meeting has not started."


def recap_url(meeting: Meeting) -> str:
    """The share link: opens the recap for anyone who has it."""
    base = get_settings().frontend_url.rstrip("/")
    return f"{base}/recap/{meeting.code}?key={meeting.recap_key}"


def get_recap(db: Session, code: str, user: User | None, key: str | None) -> RecapOut:
    meeting = meeting_service.get_meeting_by_code(db, code)
    is_host = user is not None and meeting.host_id == user.id
    allowed = (
        is_host
        or (user is not None and _attended(db, meeting, user))
        or (key is not None and secrets.compare_digest(key.encode(), meeting.recap_key.encode()))
    )
    if not allowed:
        # Without a key or an account there is nothing to check yet: sign in.
        if user is None and key is None:
            raise NotAuthenticatedError()
        # Otherwise the same answer whether the meeting exists or not.
        raise RecapNotFoundError()
    if meeting.started_at is None:
        raise RecapNotReadyError()

    return RecapOut(
        meeting=MeetingOut.model_validate(meeting),
        attendees=attendees(meeting, utc_now()),
        notes=[NoteOut.model_validate(note) for note in meeting.notes],
        action_items=[ActionItemOut.model_validate(item) for item in meeting.action_items],
        chat=[ChatMessageOut.model_validate(message) for message in _chat(db, meeting)],
        chat_total=db.scalar(select(func.count()).where(ChatMessage.meeting_id == meeting.id)),
        viewer=RecapViewerOut(is_host=is_host, signed_in=user is not None),
        share_url=recap_url(meeting) if is_host else None,
    )


def _attended(db: Session, meeting: Meeting, user: User) -> bool:
    return (
        db.scalar(
            select(Participant.id)
            .where(Participant.meeting_id == meeting.id, Participant.user_id == user.id)
            .limit(1)
        )
        is not None
    )


def _chat(db: Session, meeting: Meeting) -> list[ChatMessage]:
    newest = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.meeting_id == meeting.id)
        .order_by(ChatMessage.id.desc())
        .limit(RECAP_CHAT_LIMIT)
    ).all()
    return list(reversed(newest))


@dataclass
class _Person:
    name: str
    is_host: bool
    first_joined_at: datetime
    visits: list[tuple[datetime, datetime]]


def attendees(meeting: Meeting, now: datetime) -> list[AttendeeOut]:
    """Everyone who came, once each, with the time they were really there.

    Each entry to the room is its own participant row, so someone who
    rejoined has several. Rows are grouped by account, or by name for guests,
    and overlapping visits (two tabs) are counted once. The host comes first,
    then people in the order they arrived.
    """
    people: dict[tuple[str, object], _Person] = {}
    for row in sorted(meeting.participants, key=lambda p: (p.joined_at, p.id)):
        key = ("user", row.user_id) if row.user_id else ("guest", row.display_name.casefold())
        end = row.left_at or meeting.ended_at or now
        visit = (row.joined_at, max(row.joined_at, end))
        person = people.get(key)
        if person is None:
            people[key] = _Person(
                name=row.display_name,
                is_host=row.role == ParticipantRole.HOST,
                first_joined_at=row.joined_at,
                visits=[visit],
            )
        else:
            person.name = row.display_name  # the latest name they used
            person.is_host = person.is_host or row.role == ParticipantRole.HOST
            person.visits.append(visit)

    result = [
        AttendeeOut(
            name=person.name,
            is_host=person.is_host,
            first_joined_at=person.first_joined_at,
            seconds_present=_covered_seconds(person.visits),
        )
        for person in people.values()
    ]
    return sorted(result, key=lambda a: (not a.is_host, a.first_joined_at))


def _covered_seconds(visits: list[tuple[datetime, datetime]]) -> int:
    """Total length of the time ranges, counting overlaps once."""
    total = 0.0
    current_start, current_end = None, None
    for start, end in sorted(visits):
        if current_end is None or start > current_end:
            if current_end is not None:
                total += (current_end - current_start).total_seconds()
            current_start, current_end = start, end
        else:
            current_end = max(current_end, end)
    if current_end is not None:
        total += (current_end - current_start).total_seconds()
    return round(total)
