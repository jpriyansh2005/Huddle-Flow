"""The migrations must build exactly the schema the models describe."""

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.migrate import UnmanagedDatabaseError, alembic_config, upgrade_to_latest
from tests.conftest import make_engine


@pytest.fixture
def empty_engine():
    engine = make_engine()
    _wipe(engine)
    yield engine
    _wipe(engine)
    engine.dispose()


def _wipe(engine) -> None:
    Base.metadata.drop_all(engine)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS alembic_version"))


def test_upgrade_builds_the_models_schema_and_downgrade_removes_it(empty_engine):
    upgrade_to_latest(empty_engine)

    with empty_engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        differences = compare_metadata(context, Base.metadata)
    assert differences == []

    with empty_engine.begin() as connection:
        config = alembic_config()
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    assert set(inspect(empty_engine).get_table_names()) == {"alembic_version"}


def test_upgrading_twice_changes_nothing(empty_engine):
    upgrade_to_latest(empty_engine)
    upgrade_to_latest(empty_engine)

    assert "meetings" in inspect(empty_engine).get_table_names()


def test_a_database_made_without_migrations_is_refused(empty_engine):
    Base.metadata.create_all(empty_engine)

    with pytest.raises(UnmanagedDatabaseError):
        upgrade_to_latest(empty_engine)


OLD_ROWS = [
    "INSERT INTO users (id, name, email, password_hash, created_at) "
    "VALUES (1, 'Old Host', 'old@example.com', 'x', '2026-01-01 10:00:00')",
    "INSERT INTO meetings (id, code, host_id, title, kind, status, created_at, updated_at) "
    "VALUES (1, '11111111111', 1, 'Old', 'instant', 'ended', "
    "'2026-01-01 10:00:00', '2026-01-01 10:00:00')",
    "INSERT INTO meetings (id, code, host_id, title, kind, status, created_at, updated_at) "
    "VALUES (2, '22222222222', 1, 'Older', 'instant', 'ended', "
    "'2026-01-01 10:00:00', '2026-01-01 10:00:00')",
    "INSERT INTO participants (id, meeting_id, display_name, role, session_token, joined_at) "
    "VALUES (1, 1, 'Old Host', 'host', 'token-1', '2026-01-01 10:00:00')",
    "INSERT INTO agenda_items (id, meeting_id, position, title, duration_minutes) "
    "VALUES (1, 1, 0, 'Intro', 5)",
    "INSERT INTO notes (id, meeting_id, author_participant_id, author_name, text, created_at) "
    "VALUES (1, 1, 1, 'Old Host', 'Keep me', '2026-01-01 10:05:00')",
    "INSERT INTO action_items (id, meeting_id, text, done, created_by_participant_id, "
    "created_at, updated_at) VALUES (1, 1, 'Keep me too', 0, 1, "
    "'2026-01-01 10:05:00', '2026-01-01 10:05:00')",
    "INSERT INTO chat_messages (id, meeting_id, participant_id, sender_name, text, sent_at) "
    "VALUES (1, 1, 1, 'Old Host', 'Hello', '2026-01-01 10:06:00')",
]
CHILD_TABLES = ["participants", "agenda_items", "notes", "action_items", "chat_messages"]


def test_upgrading_keeps_existing_data_and_gives_each_meeting_a_recap_key(empty_engine):
    """The recap-key migration rebuilds the meetings table on SQLite.

    That must not cascade and delete the rows that point at meetings.
    """
    with empty_engine.begin() as connection:
        config = alembic_config()
        config.attributes["connection"] = connection
        command.upgrade(config, "8e8893567e34")
        for statement in OLD_ROWS:
            connection.execute(text(statement))

    upgrade_to_latest(empty_engine)

    with empty_engine.connect() as connection:
        counts = {
            table: connection.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            for table in CHILD_TABLES
        }
        keys = connection.execute(text("SELECT recap_key FROM meetings")).scalars().all()
        if connection.dialect.name == "sqlite":
            # Switched back on for the app once the migration is done.
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1

    assert counts == dict.fromkeys(CHILD_TABLES, 1)
    assert len(keys) == 2
    assert all(len(key) >= 40 for key in keys)
    assert keys[0] != keys[1]
