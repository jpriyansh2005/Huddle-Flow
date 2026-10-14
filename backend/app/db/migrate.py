"""Bring the database schema up to date with the Alembic migrations."""

from collections.abc import Iterator
from contextlib import contextmanager

from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, inspect

from app.core.config import BACKEND_DIR


class UnmanagedDatabaseError(RuntimeError):
    """The database has tables but no migration history."""


class MigrationIntegrityError(RuntimeError):
    """A migration left rows pointing at rows that do not exist."""


def alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    # The app has its own logging; do not let alembic.ini replace it.
    config.attributes["configure_logger"] = False
    return config


def upgrade_to_latest(engine: Engine) -> None:
    """Apply every migration that has not run on this database yet."""
    with engine.connect() as connection, sqlite_foreign_keys_off(connection):
        with connection.begin():
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
            check_foreign_keys(connection)


@contextmanager
def sqlite_foreign_keys_off(connection: Connection) -> Iterator[None]:
    """Switch SQLite's foreign keys off while migrations run, then on again.

    SQLite cannot change most column properties in place, so a migration
    rebuilds the table: copy it, drop the old one, rename the copy. With
    foreign keys on, dropping the old ``meetings`` table would cascade and
    delete every participant, note and agenda item. This is the procedure the
    SQLite manual gives for such changes. Other databases are left alone.

    The setting only takes effect outside a transaction, so this must wrap
    the transaction, never run inside one.
    """
    if connection.dialect.name != "sqlite":
        yield
        return
    _set_sqlite_foreign_keys(connection, enabled=False)
    try:
        yield
    finally:
        _set_sqlite_foreign_keys(connection, enabled=True)


def check_foreign_keys(connection: Connection) -> None:
    """Fail, and so roll the migration back, if any reference is broken.

    SQLite does not check references while foreign keys are off, so this
    checks them all once at the end.
    """
    if connection.dialect.name != "sqlite":
        return
    problems = connection.exec_driver_sql("PRAGMA foreign_key_check").all()
    if problems:
        raise MigrationIntegrityError(f"Broken references after migrating: {problems[:5]}")


def _set_sqlite_foreign_keys(connection: Connection, *, enabled: bool) -> None:
    connection.exec_driver_sql(f"PRAGMA foreign_keys={'ON' if enabled else 'OFF'}")
    connection.commit()
    actual = connection.exec_driver_sql("PRAGMA foreign_keys").scalar()
    connection.commit()
    if bool(actual) != enabled:
        # Never migrate with cascades live: that is how data gets lost.
        raise RuntimeError("Could not change SQLite's foreign_keys setting.")
