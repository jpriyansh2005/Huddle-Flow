"""Shared test setup: every test gets its own empty in-memory database."""

import os

# Must be set before the app is imported, because the engine and settings are
# created at import time. This keeps tests away from the real database file.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SEED_ON_STARTUP"] = "false"
os.environ["FRONTEND_URL"] = "http://testserver.local"
os.environ["EMPTY_ROOM_GRACE_SECONDS"] = "0"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import build_engine, get_db, get_session_factory
from app.main import app
from app.realtime.rooms import rooms

API = "/api/v1"


@pytest.fixture
def session_factory():
    # StaticPool shares one connection, so the in-memory database is the same
    # one for the test and for the app's worker threads.
    engine = build_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    engine.dispose()


@pytest.fixture
def db(session_factory):
    with session_factory() as session:
        yield session


@pytest.fixture
def client(session_factory):
    def override_get_db():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    # Used as a context manager so every WebSocket in a test shares one event
    # loop. Without it each socket gets its own loop, and a message sent from
    # one connection's handler to another connection can be missed.
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    rooms._rooms.clear()


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
        response = self.client.post(f"{API}/meetings/{code}/join", json={"display_name": name})
        assert response.status_code == 200, response.text
        return response.json()

    def socket(self, session: dict):
        code = session["meeting"]["code"]
        return self.client.websocket_connect(
            f"/ws/meetings/{code}?token={session['session_token']}"
        )


@pytest.fixture
def api(client) -> MeetingApi:
    return MeetingApi(client)
