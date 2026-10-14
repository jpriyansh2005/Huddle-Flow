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
from app.models import Meeting, MeetingKind, MeetingStatus, Participant, ParticipantRole, User
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
        db.add(meeting)
        db.flush()

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
