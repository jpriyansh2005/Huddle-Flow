"""Bring the database schema up to date with the Alembic migrations."""

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect

from app.core.config import BACKEND_DIR


class UnmanagedDatabaseError(RuntimeError):
    """The database has tables but no migration history."""


def alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    # The app has its own logging; do not let alembic.ini replace it.
    config.attributes["configure_logger"] = False
    return config


def upgrade_to_latest(engine: Engine) -> None:
    """Apply every migration that has not run on this database yet."""
    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        if tables and "alembic_version" not in tables:
            # Made by an older version of the app with create_all. Alembic
            # would try to create the tables again and fail half-way.
            raise UnmanagedDatabaseError(
                "The database was created before migrations were added. For a local "
                "SQLite database, delete the file and start the app again."
            )
        config = alembic_config()
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
