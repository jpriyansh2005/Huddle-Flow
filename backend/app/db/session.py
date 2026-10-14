"""Database engine and session factory."""

import ssl as ssl_module
from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def build_engine(
    database_url: str, *, ssl: bool = False, ssl_ca: str | None = None, **kwargs
) -> Engine:
    """Create an engine with the options each database needs."""
    if database_url.startswith("sqlite"):
        # FastAPI runs sync endpoints in a thread pool, so one connection can
        # be used from a thread other than the one that opened it.
        kwargs.setdefault("connect_args", {"check_same_thread": False})
    else:
        # Hosted databases close idle connections. Check a connection before
        # using it, and replace connections before the server drops them.
        kwargs.setdefault("pool_pre_ping", True)
        kwargs.setdefault("pool_recycle", 280)
        if ssl:
            context = ssl_module.create_default_context(cafile=ssl_ca)
            kwargs.setdefault("connect_args", {"ssl": context})

    engine = create_engine(database_url, **kwargs)

    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(dbapi_connection, _record) -> None:
            # SQLite ignores FOREIGN KEY constraints unless asked, per connection.
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


_settings = get_settings()
engine = build_engine(
    _settings.database_url, ssl=_settings.database_ssl, ssl_ca=_settings.database_ssl_ca
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one database session per request."""
    with SessionLocal() as session:
        yield session


def get_session_factory() -> sessionmaker[Session]:
    """FastAPI dependency for long-lived handlers (WebSockets).

    A WebSocket can stay open for an hour, so instead of holding one session
    for its whole life it opens a short session for each database operation.
    """
    return SessionLocal
