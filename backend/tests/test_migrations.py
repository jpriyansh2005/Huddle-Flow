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
