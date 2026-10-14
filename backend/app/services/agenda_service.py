"""The agenda: planning it with a meeting, and moving through it live.

Live progress is stored on the items themselves (``started_at`` and
``ended_at``), so a refresh, a reconnect or a server restart keeps it, and
the recap can compare planned and actual time.
"""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy.orm import Session, object_session

from app.core.exceptions import DomainError
from app.core.time import utc_now
from app.models import AgendaItem, Meeting
from app.models.agenda_item import MAX_AGENDA_ITEMS, MAX_ITEM_MINUTES
from app.schemas.meeting import AgendaItemIn


class AgendaFullError(DomainError):
    message = f"An agenda can have at most {MAX_AGENDA_ITEMS} items."


class EmptyAgendaError(DomainError):
    message = "This meeting has no agenda yet. Add an item first."


def replace_agenda(meeting: Meeting, items: Sequence[AgendaItemIn]) -> None:
    """Set the planned agenda (the caller commits). Used when scheduling or editing."""
    if len(items) > MAX_AGENDA_ITEMS:
        raise AgendaFullError()
    meeting.agenda_items.clear()
    session = object_session(meeting)
    if session is not None:
        # Delete the old items before inserting the new ones. Left to itself
        # the session inserts first, and the new item 0 would collide with
        # the old item 0 on the (meeting_id, position) unique constraint.
        session.flush()
    meeting.agenda_items.extend(
        AgendaItem(position=index, title=item.title, duration_minutes=item.duration_minutes)
        for index, item in enumerate(items)
    )


def current_item(meeting: Meeting) -> AgendaItem | None:
    """The item being discussed: started and not ended."""
    return next(
        (item for item in meeting.agenda_items if item.started_at and not item.ended_at),
        None,
    )


def advance(db: Session, meeting: Meeting, now: datetime | None = None) -> None:
    """Host's "Next": finish the current item and start the next one.

    With nothing started yet this starts the first item; on the last item it
    finishes the agenda.
    """
    if not meeting.agenda_items:
        raise EmptyAgendaError()
    now = now or utc_now()
    running = current_item(meeting)
    if running is not None:
        running.ended_at = now
    upcoming = next((item for item in meeting.agenda_items if item.started_at is None), None)
    if upcoming is not None:
        upcoming.started_at = now
    db.commit()


def go_back(db: Session, meeting: Meeting) -> None:
    """Host's "Back": undo the last "Next".

    The current item returns to not started, and the item before it is
    resumed, keeping its original start so its timer is honest.
    """
    running = current_item(meeting)
    if running is not None:
        running.started_at = None
    finished = [item for item in meeting.agenda_items if item.ended_at is not None]
    if finished:
        finished[-1].ended_at = None
    db.commit()


def add_item(db: Session, meeting: Meeting, title: str, duration_minutes: int) -> None:
    """Host adds a topic at the end, during the meeting."""
    title = title.strip()
    if not title or len(title) > 200:
        raise DomainError("An agenda item needs a title of 1 to 200 characters.")
    if not 1 <= duration_minutes <= MAX_ITEM_MINUTES:
        raise DomainError(f"Give the item between 1 and {MAX_ITEM_MINUTES} minutes.")
    if len(meeting.agenda_items) >= MAX_AGENDA_ITEMS:
        raise AgendaFullError()
    meeting.agenda_items.append(
        AgendaItem(
            position=len(meeting.agenda_items),
            title=title,
            duration_minutes=duration_minutes,
        )
    )
    db.commit()


def close_running_item(meeting: Meeting, now: datetime) -> None:
    """When the meeting ends, the topic being discussed ends with it (caller commits)."""
    running = current_item(meeting)
    if running is not None:
        running.ended_at = now
