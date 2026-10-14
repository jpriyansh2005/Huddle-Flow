"""Meeting recaps: who can read them and what they contain."""

from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from app.models import Meeting, MeetingStatus, Participant, ParticipantRole
from app.services import recap_service
from app.services.recap_service import attendees
from tests.conftest import API, signed_out
from tests.test_records import connected


@pytest.fixture
def meeting(api):
    """A started meeting with a note, an action item and a chat message."""
    code = api.schedule(title="Design review")["code"]
    host = api.start(code)
    priya = api.join(code, "Priya")
    with connected(api, host, priya) as (host_socket, priya_socket):
        priya_socket.send_json({"type": "note_add", "text": "Go with option B"})
        host_socket.receive_json()
        priya_socket.receive_json()
        host_socket.send_json(
            {
                "type": "action_add",
                "text": "Write it up",
                "owner_participant_id": priya["participant_id"],
            }
        )
        host_socket.receive_json()
        priya_socket.receive_json()
        priya_socket.send_json({"type": "chat", "text": "Thanks all"})
        host_socket.receive_json()
        priya_socket.receive_json()
    return code


def recap(client, code, key=None):
    params = {"key": key} if key is not None else {}
    return client.get(f"{API}/meetings/{code}/recap", params=params)


def key_of(db, code) -> str:
    return db.scalar(select(Meeting.recap_key).where(Meeting.code == code))


def sign_up_as_someone_else(client, email="stranger@example.com"):
    client.post(f"{API}/auth/logout")
    response = client.post(
        f"{API}/auth/signup",
        json={"name": "Stranger", "email": email, "password": "password123"},
    )
    assert response.status_code == 201


# --- what the host sees ---------------------------------------------------------


def test_the_host_sees_everything_the_meeting_produced(client, meeting, db):
    response = recap(client, meeting)

    assert response.status_code == 200
    body = response.json()
    assert body["meeting"]["title"] == "Design review"
    assert [note["text"] for note in body["notes"]] == ["Go with option B"]
    assert [item["owner_name"] for item in body["action_items"]] == ["Priya"]
    assert [message["text"] for message in body["chat"]] == ["Thanks all"]
    assert body["chat_total"] == 1
    assert [person["name"] for person in body["attendees"]] == ["Alex Morgan", "Priya"]
    assert body["attendees"][0]["is_host"] is True
    assert body["viewer"] == {"is_host": True, "signed_in": True}


def test_the_host_gets_a_share_link_with_the_meetings_key(client, meeting, db):
    share_url = recap(client, meeting).json()["share_url"]

    parsed = urlparse(share_url)
    assert parsed.path == f"/recap/{meeting}"
    assert parse_qs(parsed.query)["key"] == [key_of(db, meeting)]


def test_a_meeting_that_never_started_has_no_recap_yet(api, client):
    code = api.schedule()["code"]

    response = recap(client, code)

    assert response.status_code == 409
    assert "not started" in response.json()["detail"]


def test_an_unknown_meeting_is_not_found(client):
    assert recap(client, "12345678901").status_code == 404


# --- who else may read it ----------------------------------------------------


def test_without_an_account_or_a_key_you_are_asked_to_sign_in(client, meeting):
    with signed_out(client):
        assert recap(client, meeting).status_code == 401


def test_the_share_link_works_without_an_account(client, meeting, db):
    with signed_out(client):
        response = recap(client, meeting, key_of(db, meeting))

    assert response.status_code == 200
    body = response.json()
    assert body["viewer"] == {"is_host": False, "signed_in": False}
    # Only the host can hand out the link.
    assert body["share_url"] is None


def test_a_wrong_key_or_another_meetings_key_is_refused(api, client, meeting, db):
    other = api.schedule(title="Other")["code"]
    api.start(other)

    with signed_out(client):
        assert recap(client, meeting, "not-the-key").status_code == 404
        assert recap(client, meeting, key_of(db, other)).status_code == 404
        assert recap(client, meeting, "").status_code == 404


def test_an_overlong_key_is_rejected_before_any_lookup(client, meeting):
    with signed_out(client):
        assert recap(client, meeting, "k" * 129).status_code == 422


def test_a_signed_in_stranger_needs_the_key(client, meeting, db):
    key = key_of(db, meeting)
    sign_up_as_someone_else(client)

    assert recap(client, meeting).status_code == 404
    response = recap(client, meeting, key)
    assert response.status_code == 200
    assert response.json()["viewer"] == {"is_host": False, "signed_in": True}


def test_a_signed_in_attendee_can_read_it_without_the_key(api, client):
    code = api.schedule()["code"]
    api.start(code)
    sign_up_as_someone_else(client, "attendee@example.com")
    # Joining while signed in links the attendance to this account.
    joined = client.post(f"{API}/meetings/{code}/join", json={"display_name": "Sam"})
    assert joined.status_code == 200

    response = recap(client, code)

    assert response.status_code == 200
    assert response.json()["share_url"] is None


def test_everyone_in_the_room_receives_the_key(api, meeting, db):
    guest = api.join(meeting, "Late guest")
    with api.socket(guest) as socket:
        state = socket.receive_json()

    assert state["type"] == "room_state"
    assert state["recap_key"] == key_of(db, meeting)


def test_every_meeting_gets_its_own_key(api, db):
    first = api.schedule()["code"]
    second = api.create_instant()["code"]

    assert key_of(db, first) != key_of(db, second)
    assert len(key_of(db, first)) >= 40


# --- contents ----------------------------------------------------------------------


def test_long_chats_show_the_latest_messages_and_the_total(api, client, meeting, monkeypatch):
    monkeypatch.setattr(recap_service, "RECAP_CHAT_LIMIT", 2)
    host = api.start(meeting)
    with connected(api, host) as (socket,):
        for text in ["two", "three"]:
            socket.send_json({"type": "chat", "text": text})
            socket.receive_json()

    body = recap(client, meeting).json()

    assert [message["text"] for message in body["chat"]] == ["two", "three"]
    assert body["chat_total"] == 3


T0 = datetime(2026, 10, 14, 9, 0, tzinfo=UTC)


def at(minutes: float) -> datetime:
    return T0 + timedelta(minutes=minutes)


def visit(name, joined, left, *, user_id=None, host=False, row_id=0):
    return Participant(
        id=row_id,
        display_name=name,
        user_id=user_id,
        role=ParticipantRole.HOST if host else ParticipantRole.PARTICIPANT,
        joined_at=at(joined),
        left_at=None if left is None else at(left),
    )


def ended_meeting(*visits, ended=60):
    return Meeting(
        status=MeetingStatus.ENDED,
        started_at=T0,
        ended_at=at(ended),
        participants=list(visits),
    )


def test_someone_who_rejoined_is_listed_once_with_both_visits_added():
    meeting = ended_meeting(
        visit("priya", 0, 10, row_id=1),
        visit("Priya", 20, 30, row_id=2),
    )

    [priya] = attendees(meeting, now=at(90))

    assert priya.name == "Priya"  # the latest name used
    assert priya.seconds_present == 20 * 60
    assert priya.first_joined_at == at(0)


def test_overlapping_visits_from_two_tabs_count_once():
    meeting = ended_meeting(
        visit("Sam", 0, 30, user_id=7, row_id=1),
        visit("Sam on phone", 10, 40, user_id=7, row_id=2),
    )

    [sam] = attendees(meeting, now=at(90))

    assert sam.seconds_present == 40 * 60


def test_guests_with_different_names_are_different_people():
    meeting = ended_meeting(visit("Priya", 0, 10, row_id=1), visit("Daniel", 0, 10, row_id=2))

    assert len(attendees(meeting, now=at(90))) == 2


def test_the_host_comes_first_then_by_arrival():
    meeting = ended_meeting(
        visit("Early guest", 0, 60, row_id=1),
        visit("Host", 5, 60, user_id=1, host=True, row_id=2),
        visit("Late guest", 30, 60, row_id=3),
    )

    names = [person.name for person in attendees(meeting, now=at(90))]

    assert names == ["Host", "Early guest", "Late guest"]


def test_a_visit_without_a_leave_time_ends_with_the_meeting_or_now():
    ended = ended_meeting(visit("Priya", 0, None), ended=45)
    assert attendees(ended, now=at(90))[0].seconds_present == 45 * 60

    live = Meeting(status=MeetingStatus.LIVE, started_at=T0, participants=[visit("Priya", 0, None)])
    assert attendees(live, now=at(12))[0].seconds_present == 12 * 60
