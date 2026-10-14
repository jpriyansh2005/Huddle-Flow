"""Sample data so the dashboard is not empty on first run.

Dates are relative to "now", so the upcoming meetings are always in the
future no matter when the database is created. Run it by hand with::

    python -m app.db.seed
"""

import secrets
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.time import utc_now
from app.models import (
    ActionItem,
    AgendaItem,
    ChatMessage,
    Meeting,
    MeetingKind,
    MeetingStatus,
    Note,
    Participant,
    ParticipantRole,
    User,
)
from app.services.meeting_code import generate_meeting_code
from app.services.user_service import get_or_create_demo_user

# (title, description, starts in, duration in minutes)
UPCOMING = [
    (
        "Daily Standup",
        "Yesterday, today, blockers. Keep it to fifteen minutes.",
        timedelta(hours=2),
        15,
    ),
    (
        "Product Roadmap Review",
        "Walk through the Q4 roadmap and agree on priorities.",
        timedelta(days=1, hours=1),
        60,
    ),
    (
        "Design Critique: Onboarding Flow",
        "Review the new onboarding screens with the design team.",
        timedelta(days=2, hours=4),
        45,
    ),
    (
        "1:1 with Priya",
        None,
        timedelta(days=5),
        30,
    ),
]

# Planned agendas of the upcoming meetings: (topic, minutes).
UPCOMING_AGENDAS = {
    "Daily Standup": [("Yesterday", 5), ("Today", 5), ("Blockers", 5)],
    "Product Roadmap Review": [
        ("Q3 results", 10),
        ("Q4 priorities", 30),
        ("Risks", 10),
        ("Decisions", 10),
    ],
    "Design Critique: Onboarding Flow": [("Walkthrough", 15), ("Feedback", 20), ("Next steps", 10)],
}

# Agendas of past meetings: (topic, planned minutes, minutes it really took).
RECENT_AGENDAS = {
    "Sprint Planning": [
        ("Review the last sprint", 10, 12),
        ("Pick the stories", 25, 28),
        ("Estimate and commit", 20, 15),
    ],
    "Engineering All Hands": [("Company update", 15, 18), ("Demos", 30, 32), ("Q&A", 15, 12)],
}

# What past meetings produced. Action items owned by "host" go to the demo
# account; others to the named guest. (text, owner, due in days or None, done)
RECENT_RECORDS = {
    "Sprint Planning": {
        "notes": [
            ("Priya Sharma", "Velocity last sprint: 34 points, two stories carried over."),
            ("Daniel Kim", "Payments work is blocked until the API keys arrive."),
        ],
        "action_items": [
            ("Chase the payments API keys", "host", 1, False),
            ("Split the onboarding story into two", "Priya Sharma", 3, False),
            ("Share the sprint board link", "host", None, True),
        ],
        "chat": [
            ("Priya Sharma", "Board is up to date"),
            ("Daniel Kim", "Thanks, looks good"),
        ],
    },
    "Engineering All Hands": {
        "notes": [("Wei Chen", "New on-call rota starts next Monday.")],
        "action_items": [("Write the incident review", "host", 5, False)],
        "chat": [("Wei Chen", "Slides are in the shared drive")],
    },
}

# (title, ended how long ago, length in minutes, guests who attended)
RECENT = [
    ("Sprint Planning", timedelta(hours=20), 55, ["Priya Sharma", "Daniel Kim", "Sofia Rossi"]),
    ("Customer Interview: Acme Corp", timedelta(days=2), 40, ["Jordan Lee"]),
    ("Engineering All Hands", timedelta(days=4), 62, ["Priya Sharma", "Daniel Kim", "Wei Chen"]),
    ("Interview Debrief", timedelta(days=6), 25, ["Sofia Rossi", "Wei Chen"]),
]


def seed_database(db: Session) -> bool:
    """Give the demo account sample meetings, if there are no meetings yet.

    Returns True if it inserted them. Nothing is seeded when the demo account
    is switched off, because the sample meetings belong to it.
    """
    if not get_settings().demo_enabled:
        return False
    if db.scalar(select(func.count()).select_from(Meeting)):
        return False

    host = get_or_create_demo_user(db)
    now = _round_up_to_half_hour(utc_now())

    for title, description, starts_in, duration in UPCOMING:
        db.add(
            Meeting(
                code=generate_meeting_code(db),
                host=host,
                title=title,
                description=description,
                kind=MeetingKind.SCHEDULED,
                status=MeetingStatus.SCHEDULED,
                scheduled_start=now + starts_in,
                duration_minutes=duration,
                agenda_items=[
                    AgendaItem(position=index, title=topic, duration_minutes=minutes)
                    for index, (topic, minutes) in enumerate(UPCOMING_AGENDAS.get(title, []))
                ],
            )
        )
        db.flush()  # make the new code visible to the next uniqueness check

    for title, ended_ago, length, guests in RECENT:
        ended_at = now - ended_ago
        started_at = ended_at - timedelta(minutes=length)
        meeting = Meeting(
            code=generate_meeting_code(db),
            host=host,
            title=title,
            kind=MeetingKind.SCHEDULED,
            status=MeetingStatus.ENDED,
            scheduled_start=started_at,
            duration_minutes=length,
            started_at=started_at,
            ended_at=ended_at,
        )
        meeting.participants = [
            _attendance(host.name, ParticipantRole.HOST, started_at, ended_at, user=host),
            *[
                _attendance(guest, ParticipantRole.PARTICIPANT, started_at, ended_at)
                for guest in guests
            ],
        ]
        meeting.agenda_items = _past_agenda(RECENT_AGENDAS.get(title, []), started_at)
        db.add(meeting)
        db.flush()
        _add_records(db, meeting, host, RECENT_RECORDS.get(title), ended_at)

    db.commit()
    return True


def _attendance(
    name: str,
    role: ParticipantRole,
    joined_at: datetime,
    left_at: datetime,
    user: User | None = None,
) -> Participant:
    return Participant(
        user=user,
        display_name=name,
        role=role,
        session_token=secrets.token_urlsafe(32),
        joined_at=joined_at,
        left_at=left_at,
    )


def _past_agenda(items: list[tuple[str, int, int]], start: datetime) -> list[AgendaItem]:
    """Agenda items that ran one after the other from ``start``."""
    agenda = []
    for index, (topic, planned, actual) in enumerate(items):
        end = start + timedelta(minutes=actual)
        agenda.append(
            AgendaItem(
                position=index,
                title=topic,
                duration_minutes=planned,
                started_at=start,
                ended_at=end,
            )
        )
        start = end
    return agenda


def _add_records(
    db: Session, meeting: Meeting, host: User, records: dict | None, ended_at: datetime
) -> None:
    """Notes, action items and chat for a past meeting, written by its attendees."""
    if not records:
        return
    by_name = {participant.display_name: participant for participant in meeting.participants}
    written_at = ended_at - timedelta(minutes=10)
    for author, text in records["notes"]:
        db.add(
            Note(
                meeting=meeting,
                author_participant_id=by_name[author].id,
                author_name=author,
                text=text,
                created_at=written_at,
            )
        )
    for text, owner, due_in, done in records["action_items"]:
        owner_is_host = owner == "host"
        db.add(
            ActionItem(
                meeting=meeting,
                text=text,
                owner_name=host.name if owner_is_host else owner,
                owner_user_id=host.id if owner_is_host else None,
                due_date=(ended_at + timedelta(days=due_in)).date() if due_in else None,
                done=done,
                created_by_participant_id=by_name[host.name].id,
                created_at=written_at,
            )
        )
    for sender, text in records["chat"]:
        db.add(
            ChatMessage(
                meeting=meeting,
                participant_id=by_name[sender].id,
                sender_name=sender,
                text=text,
                sent_at=written_at,
            )
        )


def _round_up_to_half_hour(moment: datetime) -> datetime:
    """Meetings look more natural starting at :00 or :30."""
    moment = moment.replace(second=0, microsecond=0)
    minutes_over = moment.minute % 30
    return moment + timedelta(minutes=30 - minutes_over)


if __name__ == "__main__":
    from app.db.migrate import upgrade_to_latest
    from app.db.session import SessionLocal, engine

    upgrade_to_latest(engine)
    with SessionLocal() as session:
        created = seed_database(session)
    print("Sample data inserted." if created else "Database already has meetings; nothing to do.")
