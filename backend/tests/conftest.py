"""Shared test setup: every test gets its own empty database.

By default that is an in-memory SQLite database. Set TEST_DATABASE_URL (CI
does, with a MySQL 8 server) to run the same tests on another database.
"""

import os

# Must be set before the app is imported, because the engine and settings are
# created at import time. This keeps tests away from the real database file.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["MIGRATE_ON_STARTUP"] = "false"
os.environ["SEED_ON_STARTUP"] = "false"
os.environ["FRONTEND_URL"] = "http://testserver.local"
os.environ["EMPTY_ROOM_GRACE_SECONDS"] = "0"

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import build_engine, get_db, get_session_factory
from app.main import app
from app.realtime.rooms import rooms
from app.services.auth_service import login_limiter

API = "/api/v1"
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite://")

HOST_NAME = "Alex Morgan"
HOST_EMAIL = "alex@example.com"
HOST_PASSWORD = "correct horse battery"


def make_engine():
    if TEST_DATABASE_URL == "sqlite://":
        # StaticPool shares one connection, so the in-memory database is the
        # same one for the test and for the app's worker threads.
        return build_engine(TEST_DATABASE_URL, poolclass=StaticPool)
    return build_engine(TEST_DATABASE_URL)


@pytest.fixture
def engine():
    engine = make_engine()
    Base.metadata.drop_all(engine)  # leftovers from an interrupted run
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def db(session_factory):
    with session_factory() as session:
        yield session


@pytest.fixture
def anon_client(session_factory):
    """A browser that has not signed in."""

    def override_get_db():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    login_limiter.clear()
    # Used as a context manager so every WebSocket in a test shares one event
    # loop. Without it each socket gets its own loop, and a message sent from
    # one connection's handler to another connection can be missed.
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    rooms._rooms.clear()


@pytest.fixture
def client(anon_client):
    """A browser signed in to a fresh account named Alex Morgan."""
    response = anon_client.post(
        f"{API}/auth/signup",
        json={"name": HOST_NAME, "email": HOST_EMAIL, "password": HOST_PASSWORD},
    )
    assert response.status_code == 201, response.text
    return anon_client


class MeetingApi:
    """Small helper so tests read as a list of user actions."""

    def __init__(self, client: TestClient) -> None:
        self.client = client

    def create_instant(self) -> dict:
        response = self.client.post(f"{API}/meetings/instant")
        assert response.status_code == 201, response.text
        return response.json()

    def schedule(self, **overrides) -> dict:
        payload = {
            "title": "Weekly Sync",
            "description": "Team catch-up",
            "scheduled_start": "2099-01-01T10:00:00Z",
            "duration_minutes": 45,
            **overrides,
        }
        response = self.client.post(f"{API}/meetings", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    def start(self, code: str) -> dict:
        response = self.client.post(f"{API}/meetings/{code}/start", json={})
        assert response.status_code == 200, response.text
        return response.json()

    def join(self, code: str, name: str = "Guest") -> dict:
        """Join as a guest: a visitor who is not signed in."""
        with signed_out(self.client):
            response = self.client.post(f"{API}/meetings/{code}/join", json={"display_name": name})
        assert response.status_code == 200, response.text
        return response.json()

    def socket(self, session: dict):
        code = session["meeting"]["code"]
        return self.client.websocket_connect(
            f"/ws/meetings/{code}?token={session['session_token']}"
        )


class signed_out:  # noqa: N801  (used like a function: `with signed_out(client):`)
    """Send the requests inside the block without the session cookie."""

    def __init__(self, client: TestClient) -> None:
        self.client = client

    def __enter__(self) -> None:
        self.saved = self.client.cookies
        self.client.cookies = httpx.Cookies()

    def __exit__(self, *_exc) -> None:
        self.client.cookies = self.saved


@pytest.fixture
def api(client) -> MeetingApi:
    return MeetingApi(client)
