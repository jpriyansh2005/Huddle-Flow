"""Notes, action items and saved chat: in the room, and afterwards."""

from contextlib import ExitStack, contextmanager
from datetime import date

import pytest
from sqlalchemy import func, select

from app.models import ActionItem, ChatMessage, Meeting, Note
from app.models.note import MAX_NOTES_PER_MEETING
from app.services.record_service import CHAT_HISTORY_LIMIT
from tests.conftest import API, signed_out


@pytest.fixture
def room(api):
    """A live meeting with the host (signed in) and two guests.

    A scheduled meeting, because an instant one ends as soon as its room is
    empty, and some tests reconnect after everyone has left.
    """
    code = api.schedule()["code"]
    return api.start(code), api.join(code, "Priya"), api.join(code, "Daniel")


@contextmanager
def connected(api, *sessions):
    """Open sockets for the sessions and read the messages that greet them.

    Each socket first gets room_state, then one participant_joined for every
    session that connects after it. The sockets are always closed, even when
    a test fails half-way, so a failure cannot leave the test client waiting.
    """
    with ExitStack() as stack:
        sockets = [stack.enter_context(api.socket(session)) for session in sessions]
        for index, socket in enumerate(sockets):
            socket.receive_json()  # room_state
            for _ in range(len(sockets) - index - 1):
                socket.receive_json()  # participant_joined
        yield sockets


def everyone_receives(sockets) -> dict:
    """Read the next message on every socket; they must all be the same."""
    messages = [socket.receive_json() for socket in sockets]
    assert all(message == messages[0] for message in messages)
    return messages[0]


def count(db, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


def meeting_of(db, session) -> Meeting:
    return db.scalar(select(Meeting).where(Meeting.code == session["meeting"]["code"]))


def add_action(socket, **fields):
    socket.send_json({"type": "action_add", **fields})


# --- notes ---------------------------------------------------------------------


def test_a_note_reaches_everyone_with_its_author(api, room):
    host, priya, daniel = room
    with connected(api, host, priya, daniel) as sockets:
        sockets[1].send_json({"type": "note_add", "text": "  Ship on Friday  "})
        event = everyone_receives(sockets)

    assert event["type"] == "note_added"
    assert event["note"]["text"] == "Ship on Friday"
    assert event["note"]["author_name"] == "Priya"
    assert event["note"]["author_participant_id"] == priya["participant_id"]


@pytest.mark.parametrize("text", ["", "spaces", "too-long", None], ids=str)
def test_invalid_notes_are_refused_for_the_sender_only(api, room, text):
    text = {"spaces": "   ", "too-long": "x" * 2001}.get(text, text)
    host, priya, _ = room
    with connected(api, host, priya) as sockets:
        sockets[1].send_json({"type": "note_add", "text": text})
        assert sockets[1].receive_json()["type"] == "error"
        sockets[1].send_json({"type": "chat", "text": "next"})
        assert sockets[0].receive_json()["type"] == "chat"  # the host got no note
        sockets[1].receive_json()


def test_only_the_author_or_the_host_can_delete_a_note(api, room, db):
    host, priya, daniel = room
    with connected(api, host, priya, daniel) as sockets:
        sockets[1].send_json({"type": "note_add", "text": "Priya's note"})
        note_id = everyone_receives(sockets)["note"]["id"]

        sockets[2].send_json({"type": "note_delete", "id": note_id})
        assert sockets[2].receive_json()["type"] == "error"
        assert count(db, Note) == 1

        sockets[0].send_json({"type": "note_delete", "id": note_id})
        assert everyone_receives(sockets) == {"type": "note_deleted", "note_id": note_id}
        assert count(db, Note) == 0

        sockets[0].send_json({"type": "note_delete", "id": note_id})
        assert sockets[0].receive_json()["type"] == "error"  # already gone


def test_the_author_can_delete_their_own_note(api, room):
    host, priya, _ = room
    with connected(api, host, priya) as sockets:
        sockets[1].send_json({"type": "note_add", "text": "mine"})
        note_id = everyone_receives(sockets)["note"]["id"]
        sockets[1].send_json({"type": "note_delete", "id": note_id})
        assert everyone_receives(sockets)["type"] == "note_deleted"


def test_the_note_limit_is_enforced(api, room, db):
    host, *_ = room
    meeting = meeting_of(db, host)
    db.add_all(
        Note(meeting_id=meeting.id, author_name="Bulk", text=str(n))
        for n in range(MAX_NOTES_PER_MEETING)
    )
    db.commit()

    with connected(api, host) as (socket,):
        socket.send_json({"type": "note_add", "text": "one too many"})
        assert "at most" in socket.receive_json()["message"]


# --- action items ----------------------------------------------------------------


def test_an_action_item_for_someone_in_the_room_is_linked_to_their_account(api, room):
    host, priya, _ = room
    with connected(api, host, priya) as sockets:
        add_action(
            sockets[1],
            text="Send the deck",
            owner_participant_id=host["participant_id"],
            due_date="2099-02-01",
        )
        item = everyone_receives(sockets)["action_item"]

    assert item["text"] == "Send the deck"
    assert item["owner_name"] == "Alex Morgan"
    assert item["owner_user_id"] is not None  # the host is signed in
    assert item["due_date"] == "2099-02-01"
    assert item["done"] is False


def test_an_action_item_can_go_to_any_name_or_nobody(api, room):
    host, *_ = room
    with connected(api, host) as (socket,):
        add_action(socket, text="Book a room", owner_name="Office team")
        named = socket.receive_json()["action_item"]
        add_action(socket, text="Unassigned task")
        unassigned = socket.receive_json()["action_item"]

    assert (named["owner_name"], named["owner_user_id"]) == ("Office team", None)
    assert unassigned["owner_name"] is None


@pytest.mark.parametrize(
    "fields",
    [
        {"text": ""},
        {"text": "x" * 501},
        {"text": "Bad date", "due_date": "not-a-date"},
        {"text": "Bad date", "due_date": "2099-02-30"},
        {"text": "Stranger", "owner_participant_id": 999_999},
    ],
    ids=["empty", "too-long", "not-a-date", "impossible-date", "unknown-owner"],
)
def test_invalid_action_items_are_refused(api, room, fields):
    host, *_ = room
    with connected(api, host) as (socket,):
        add_action(socket, **fields)
        assert socket.receive_json()["type"] == "error"


def test_an_owner_from_another_meeting_is_refused(api, room):
    host, *_ = room
    other = api.join(api.schedule()["code"], "Elsewhere")
    with connected(api, host) as (socket,):
        add_action(socket, text="Wrong room", owner_participant_id=other["participant_id"])
        assert "in this meeting" in socket.receive_json()["message"]


def test_anyone_can_tick_off_or_edit_an_action_item(api, room):
    host, priya, _ = room
    with connected(api, host, priya) as sockets:
        add_action(sockets[0], text="Draft", owner_name="Priya", due_date="2099-01-01")
        item_id = everyone_receives(sockets)["action_item"]["id"]

        sockets[1].send_json(
            {"type": "action_update", "id": item_id, "done": True, "text": "Final draft"}
        )
        updated = everyone_receives(sockets)["action_item"]

        # Sending the owner fields as null removes the owner; the date is cleared too.
        sockets[1].send_json(
            {
                "type": "action_update",
                "id": item_id,
                "owner_participant_id": None,
                "owner_name": None,
                "due_date": None,
            }
        )
        cleared = everyone_receives(sockets)["action_item"]

    assert (updated["done"], updated["text"], updated["owner_name"]) == (
        True,
        "Final draft",
        "Priya",
    )
    assert (cleared["owner_name"], cleared["due_date"], cleared["done"]) == (None, None, True)


def test_only_the_creator_or_the_host_can_delete_an_action_item(api, room, db):
    host, priya, daniel = room
    with connected(api, host, priya, daniel) as sockets:
        add_action(sockets[1], text="Priya's task")
        item_id = everyone_receives(sockets)["action_item"]["id"]

        sockets[2].send_json({"type": "action_delete", "id": item_id})
        assert sockets[2].receive_json()["type"] == "error"

        sockets[1].send_json({"type": "action_delete", "id": item_id})
        assert everyone_receives(sockets) == {
            "type": "action_item_deleted",
            "action_item_id": item_id,
        }
    assert count(db, ActionItem) == 0


def test_unknown_action_items_cannot_be_changed(api, room):
    host, *_ = room
    with connected(api, host) as (socket,):
        for message in (
            {"type": "action_update", "id": 424242, "done": True},
            {"type": "action_delete", "id": 424242},
            {"type": "action_update", "done": True},
            {"type": "action_delete", "id": "1"},
        ):
            socket.send_json(message)
            assert socket.receive_json()["type"] == "error"


def test_action_items_of_another_meeting_cannot_be_changed(api, room):
    host, *_ = room
    other_host = api.start(api.schedule()["code"])
    with connected(api, other_host) as (socket,):
        add_action(socket, text="Elsewhere")
        foreign_id = socket.receive_json()["action_item"]["id"]

    with connected(api, host) as (socket,):
        socket.send_json({"type": "action_update", "id": foreign_id, "done": True})
        assert socket.receive_json()["type"] == "error"


# --- saved chat ------------------------------------------------------------------


def test_chat_is_saved_and_comes_back_after_a_refresh(api, room, db):
    host, priya, _ = room
    with connected(api, host, priya) as sockets:
        sockets[1].send_json({"type": "chat", "text": "Hello"})
        sent = everyone_receives(sockets)["message"]
    assert isinstance(sent["id"], int)
    assert count(db, ChatMessage) == 1

    # Everyone has left; Priya refreshes her page and reconnects.
    with api.socket(priya) as socket:
        state = socket.receive_json()

    assert [message["text"] for message in state["chat"]] == ["Hello"]
    assert state["chat"][0]["sender_name"] == "Priya"
    assert state["chat"][0]["sender_id"] == priya["participant_id"]


def test_room_state_sends_only_the_latest_chat(api, room, db):
    host, *_ = room
    meeting = meeting_of(db, host)
    db.add_all(
        ChatMessage(meeting_id=meeting.id, sender_name="Bulk", text=f"message {n}")
        for n in range(CHAT_HISTORY_LIMIT + 5)
    )
    db.commit()

    with api.socket(host) as socket:
        chat = socket.receive_json()["chat"]

    assert len(chat) == CHAT_HISTORY_LIMIT
    assert chat[0]["text"] == "message 5"  # the oldest five are left out
    assert chat[-1]["text"] == f"message {CHAT_HISTORY_LIMIT + 4}"


def test_room_state_includes_notes_and_action_items(api, room):
    host, priya, _ = room
    with connected(api, host, priya) as sockets:
        sockets[0].send_json({"type": "note_add", "text": "A note"})
        everyone_receives(sockets)
        add_action(sockets[0], text="A task")
        everyone_receives(sockets)

    with api.socket(priya) as socket:
        state = socket.receive_json()

    assert [note["text"] for note in state["notes"]] == ["A note"]
    assert [item["text"] for item in state["action_items"]] == ["A task"]


def test_deleting_a_meeting_deletes_what_it_produced(api, client, db):
    code = api.schedule()["code"]
    session = api.start(code)
    with connected(api, session) as (socket,):
        socket.send_json({"type": "note_add", "text": "note"})
        socket.receive_json()
        add_action(socket, text="task")
        socket.receive_json()
        socket.send_json({"type": "chat", "text": "hi"})
        socket.receive_json()
        socket.send_json({"type": "end_meeting"})
        socket.receive_json()

    assert client.delete(f"{API}/meetings/{code}").status_code == 204
    assert count(db, Note) == count(db, ActionItem) == count(db, ChatMessage) == 0


# --- the Action items page -------------------------------------------------------


def test_my_action_items_needs_sign_in(anon_client):
    assert anon_client.get(f"{API}/action-items").status_code == 401


def test_my_list_has_items_assigned_to_me_and_from_my_meetings(api, client):
    code = api.schedule()["code"]
    host = api.start(code)
    priya = api.join(code, "Priya")
    with connected(api, host) as (socket,):
        add_action(socket, text="Late task", owner_participant_id=host["participant_id"])
        socket.receive_json()
        add_action(
            socket,
            text="Due soon",
            owner_participant_id=host["participant_id"],
            due_date="2099-01-05",
        )
        socket.receive_json()
        add_action(socket, text="Priya's job", owner_participant_id=priya["participant_id"])
        socket.receive_json()

    items = client.get(f"{API}/action-items").json()

    # Items with a due date first, soonest first; then the rest, newest first.
    assert [item["text"] for item in items] == ["Due soon", "Priya's job", "Late task"]
    assert [item["assigned_to_me"] for item in items] == [True, False, True]
    assert items[0]["meeting"]["code"] == code


def test_finished_items_come_last(api, client):
    host = api.start(api.schedule()["code"])
    with connected(api, host) as (socket,):
        add_action(socket, text="Finished", due_date="2099-01-01")
        finished_id = socket.receive_json()["action_item"]["id"]
        add_action(socket, text="Open")
        socket.receive_json()
        socket.send_json({"type": "action_update", "id": finished_id, "done": True})
        socket.receive_json()

    assert [item["text"] for item in client.get(f"{API}/action-items").json()] == [
        "Open",
        "Finished",
    ]


def test_owner_and_host_can_tick_items_off_but_others_cannot(api, client, db):
    host = api.start(api.schedule()["code"])
    with connected(api, host) as (socket,):
        add_action(socket, text="Host task", owner_participant_id=host["participant_id"])
        item_id = socket.receive_json()["action_item"]["id"]

    response = client.patch(f"{API}/action-items/{item_id}", json={"done": True})
    assert response.status_code == 200 and response.json()["done"] is True

    client.post(f"{API}/auth/logout")
    client.post(
        f"{API}/auth/signup",
        json={"name": "Stranger", "email": "stranger@example.com", "password": "password123"},
    )
    assert client.patch(f"{API}/action-items/{item_id}", json={"done": False}).status_code == 404
    assert client.patch(f"{API}/action-items/999999", json={"done": False}).status_code == 404
    assert client.get(f"{API}/action-items").json() == []
    assert db.get(ActionItem, item_id).done is True


def test_a_guest_owner_is_not_linked_to_any_account(api, room):
    host, priya, _ = room
    with connected(api, host) as (socket,):
        add_action(socket, text="Guest task", owner_participant_id=priya["participant_id"])
        item = socket.receive_json()["action_item"]

    assert item["owner_name"] == "Priya"
    assert item["owner_user_id"] is None
    with signed_out(api.client):
        assert api.client.get(f"{API}/action-items").status_code == 401


def test_due_dates_are_plain_calendar_days(api, room, db):
    host, *_ = room
    with connected(api, host) as (socket,):
        add_action(socket, text="Dated", due_date="2099-12-31")
        socket.receive_json()

    assert db.scalar(select(ActionItem)).due_date == date(2099, 12, 31)
