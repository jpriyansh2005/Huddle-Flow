"""Live captions: the host's room switch, and the transcript it saves."""

import pytest
from sqlalchemy import select

from app.models import Meeting, TranscriptLine
from app.services import caption_service
from tests.conftest import API
from tests.test_records import connected, everyone_receives


@pytest.fixture
def room(api):
    """A live scheduled meeting with the host and one guest."""
    code = api.schedule()["code"]
    return api.start(code), api.join(code, "Priya")


def turn_captions(sockets, enabled: bool) -> dict:
    sockets[0].send_json({"type": "captions_set", "enabled": enabled})
    return everyone_receives(sockets)


def say(socket, text, final=True):
    socket.send_json({"type": "caption", "text": text, "final": final})


def lines(db) -> list[tuple[str, str]]:
    return [(line.speaker_name, line.text) for line in db.scalars(select(TranscriptLine))]


def sync(sockets):
    """Send a chat message and read it everywhere, so anything sent before
    it has been handled (messages from one socket are handled in order)."""
    sockets[-1].send_json({"type": "chat", "text": "sync"})
    for socket in sockets:
        assert socket.receive_json()["type"] == "chat"


def test_the_host_turns_captions_on_for_everyone(api, room, db):
    with connected(api, *room) as sockets:
        assert turn_captions(sockets, True) == {"type": "captions_updated", "enabled": True}

    assert db.scalar(select(Meeting.captions_on)) is True


def test_joining_later_shows_whether_captions_are_on(api, room):
    host, priya = room
    with connected(api, host) as sockets:
        turn_captions(sockets, True)
    with api.socket(priya) as socket:
        assert socket.receive_json()["captions_on"] is True


def test_guests_cannot_switch_captions(api, room, db):
    with connected(api, *room) as sockets:
        sockets[1].send_json({"type": "captions_set", "enabled": True})
        error = sockets[1].receive_json()

    assert error["type"] == "error"
    assert db.scalar(select(Meeting.captions_on)) is False


def test_finished_captions_reach_everyone_and_are_saved(api, room, db):
    host, priya = room
    with connected(api, host, priya) as sockets:
        turn_captions(sockets, True)
        say(sockets[1], "  Let's ship on Friday  ")
        event = everyone_receives(sockets)

    assert event == {
        "type": "caption",
        "participant_id": priya["participant_id"],
        "speaker_name": "Priya",
        "text": "Let's ship on Friday",
        "final": True,
    }
    assert lines(db) == [("Priya", "Let's ship on Friday")]


def test_unfinished_captions_are_shown_but_not_saved(api, room, db):
    with connected(api, *room) as sockets:
        turn_captions(sockets, True)
        say(sockets[1], "Let's sh", final=False)
        assert everyone_receives(sockets)["final"] is False

    assert lines(db) == []


def test_nothing_is_sent_or_saved_while_captions_are_off(api, room, db):
    with connected(api, *room) as sockets:
        say(sockets[1], "Private remark")
        sync(sockets)  # the caption produced no message before the chat

        turn_captions(sockets, True)
        turn_captions(sockets, False)
        say(sockets[1], "Also private")
        sync(sockets)

    assert lines(db) == []


@pytest.mark.parametrize(
    "payload",
    [
        {"text": "", "final": True},
        {"text": "   ", "final": True},
        {"text": "x" * 501, "final": True},
        {"text": "hello", "final": "true"},
        {"text": 42, "final": True},
        {"final": True},
    ],
    ids=["empty", "spaces", "too-long", "final-as-text", "number", "missing-text"],
)
def test_invalid_captions_are_refused_for_the_sender_only(api, room, db, payload):
    with connected(api, *room) as sockets:
        turn_captions(sockets, True)
        sockets[1].send_json({"type": "caption", **payload})
        assert sockets[1].receive_json()["type"] == "error"
        sync(sockets)  # the host got nothing before the chat

    assert lines(db) == []


def test_a_full_transcript_still_shows_captions_but_stops_saving(api, room, db, monkeypatch):
    monkeypatch.setattr(caption_service, "MAX_TRANSCRIPT_LINES", 1)
    with connected(api, *room) as sockets:
        turn_captions(sockets, True)
        for text in ["First", "Second"]:
            say(sockets[0], text)
            assert everyone_receives(sockets)["text"] == text

    assert lines(db) == [("Alex Morgan", "First")]


def test_the_recap_includes_the_transcript(api, client, room):
    host, priya = room
    with connected(api, host, priya) as sockets:
        turn_captions(sockets, True)
        for socket, text in [(sockets[0], "Welcome"), (sockets[1], "Thanks")]:
            say(socket, text)
            everyone_receives(sockets)

    body = client.get(f"{API}/meetings/{host['meeting']['code']}/recap").json()

    assert [(line["speaker_name"], line["text"]) for line in body["transcript"]] == [
        ("Alex Morgan", "Welcome"),
        ("Priya", "Thanks"),
    ]
    assert body["transcript_total"] == 2
