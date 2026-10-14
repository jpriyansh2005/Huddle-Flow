"""How Alembic connects to the database and finds the models.

Migrations run against the app's own engine settings (DATABASE_URL and the
SSL options), or against a connection passed in by the caller: the app's
start-up and the tests do that, so they migrate exactly the database they use.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection

from app import models  # noqa: F401  (registers every table on Base.metadata)
from app.core.config import get_settings
from app.db.base import Base, UTCDateTime
from app.db.migrate import check_foreign_keys, sqlite_foreign_keys_off
from app.db.session import build_engine

config = context.config
# Logging from alembic.ini only when run from the command line; the app and
# the tests configure their own.
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def render_item(type_: str, obj, autogen_context):
    """Write the app's own column types as plain SQLAlchemy in new migrations.

    A migration must not import app code: the app changes over time, and old
    migrations have to keep working.
    """
    if type_ == "type" and isinstance(obj, UTCDateTime):
        autogen_context.imports.add("from sqlalchemy.dialects import mysql")
        return 'sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")'
    return False


def run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # SQLite cannot alter most column properties in place; batch mode
        # rebuilds the table instead. Other databases ignore the flag.
        render_as_batch=connection.dialect.name == "sqlite",
        compare_type=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        run_migrations(connection)
        return
    settings = get_settings()
    engine = build_engine(
        settings.database_url, ssl=settings.database_ssl, ssl_ca=settings.database_ssl_ca
    )
    # From the command line: the same SQLite protection as the app's start-up
    # (see app/db/migrate.py), so rebuilding a table cannot cascade deletes.
    with engine.connect() as fresh_connection, sqlite_foreign_keys_off(fresh_connection):
        run_migrations(fresh_connection)
        check_foreign_keys(fresh_connection)
        fresh_connection.commit()
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline (SQL script) migrations are not supported; run them online.")
run_online()
