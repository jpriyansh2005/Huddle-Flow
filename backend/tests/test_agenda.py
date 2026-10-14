from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.exceptions import DomainError
from app.models import AgendaItem, Meeting
from app.services import agenda_service, meeting_service
from app.services.agenda_service import AgendaFullError, EmptyAgendaError
from tests.conftest import API

AGENDA = [
    {"title": "Updates", "duration_minutes": 5},
    {"title": "Blockers", "duration_minutes": 10},
    {"title": "Next steps", "duration_minutes": 15},
]
T0 = datetime(2026, 1, 1, 10, 0, tzinfo=UTC)


def titles(meeting: dict) -> list[str]:
    return [item["title"] for item in meeting["agenda"]]


def meeting_row(db, code: str) -> Meeting:
    return db.scalar(select(Meeting).where(Meeting.code == code))


def state(meeting: Meeting) -> list[tuple[bool, bool]]:
    """(started, ended) for each item, in order."""
    db_items = meeting.agenda_items
    return [(item.started_at is not None, item.ended_at is not None) for item in db_items]


# --- planning the agenda over the API ----------------------------------------------


def test_scheduled_meeting_keeps_its_agenda_in_order(api):
    meeting = api.schedule(agenda=AGENDA)

    assert titles(meeting) == ["Updates", "Blockers", "Next steps"]
    assert [item["position"] for item in meeting["agenda"]] == [0, 1, 2]
    assert all(item["started_at"] is None for item in meeting["agenda"])


def test_meetings_without_an_agenda_have_an_empty_list(api):
    assert api.schedule()["agenda"] == []
    assert api.create_instant()["agenda"] == []


def test_upcoming_list_includes_each_agenda(client, api):
    api.schedule(agenda=AGENDA)

    upcoming = client.get(f"{API}/meetings/upcoming").json()

    assert titles(upcoming[0]) == ["Updates", "Blockers", "Next steps"]


@pytest.mark.parametrize(
    "agenda",
    [
        [{"title": "Too long", "duration_minutes": 241}],
        [{"title": "Zero", "duration_minutes": 0}],
        [{"title": "   ", "duration_minutes": 5}],
        [{"title": "x" * 201, "duration_minutes": 5}],
        [{"title": f"Item {n}", "duration_minutes": 5} for n in range(21)],
    ],
)
def test_invalid_agendas_are_refused(client, agenda):
    response = client.post(
        f"{API}/meetings",
        json={
            "title": "Planning",
            "scheduled_start": "2099-01-01T10:00:00Z",
            "duration_minutes": 30,
            "agenda": agenda,
        },
    )

    assert response.status_code == 422


def test_editing_replaces_the_agenda_only_when_sent(client, api):
    code = api.schedule(agenda=AGENDA)["code"]

    untouched = client.patch(f"{API}/meetings/{code}", json={"title": "Renamed"}).json()
    replaced = client.patch(
        f"{API}/meetings/{code}", json={"agenda": [{"title": "Only this", "duration_minutes": 20}]}
    ).json()
    cleared = client.patch(f"{API}/meetings/{code}", json={"agenda": []}).json()

    assert titles(untouched) == ["Updates", "Blockers", "Next steps"]
    assert titles(replaced) == ["Only this"]
    assert cleared["agenda"] == []


def test_the_agenda_of_a_live_meeting_cannot_be_replaced(client, api):
    code = api.schedule(agenda=AGENDA)["code"]
    api.start(code)

    response = client.patch(f"{API}/meetings/{code}", json={"agenda": []})

    assert response.status_code == 409


def test_deleting_a_meeting_deletes_its_agenda(client, api, db):
    code = api.schedule(agenda=AGENDA)["code"]

    client.delete(f"{API}/meetings/{code}")

    assert db.scalar(select(func.count()).select_from(AgendaItem)) == 0


# --- moving through the agenda --------------------------------------------------------


@pytest.fixture
def planned(api, db) -> Meeting:
    code = api.schedule(agenda=AGENDA)["code"]
    return meeting_row(db, code)


def test_next_starts_the_first_item_then_moves_on(db, planned):
    agenda_service.advance(db, planned, T0)
    assert state(planned) == [(True, False), (False, False), (False, False)]

    agenda_service.advance(db, planned, T0 + timedelta(minutes=6))
    first, second, _ = planned.agenda_items
    assert first.ended_at == second.started_at == T0 + timedelta(minutes=6)
    assert state(planned) == [(True, True), (True, False), (False, False)]


def test_next_on_the_last_item_finishes_the_agenda(db, planned):
    for minute in range(3):
        agenda_service.advance(db, planned, T0 + timedelta(minutes=minute))
    agenda_service.advance(db, planned, T0 + timedelta(minutes=30))

    assert state(planned) == [(True, True)] * 3
    assert agenda_service.current_item(planned) is None

    agenda_service.advance(db, planned, T0 + timedelta(minutes=40))  # nothing left: no change
    assert planned.agenda_items[-1].ended_at == T0 + timedelta(minutes=30)


def test_back_undoes_the_last_next(db, planned):
    agenda_service.advance(db, planned, T0)
    agenda_service.advance(db, planned, T0 + timedelta(minutes=5))

    agenda_service.go_back(db, planned)

    first = planned.agenda_items[0]
    assert state(planned) == [(True, False), (False, False), (False, False)]
    assert first.started_at == T0  # resumed with its original start


def test_back_after_the_end_reopens_the_last_item(db, planned):
    for minute in range(4):
        agenda_service.advance(db, planned, T0 + timedelta(minutes=minute))

    agenda_service.go_back(db, planned)

    assert state(planned) == [(True, True), (True, True), (True, False)]


def test_back_before_the_start_changes_nothing(db, planned):
    agenda_service.go_back(db, planned)

    assert state(planned) == [(False, False)] * 3


def test_next_on_an_empty_agenda_is_an_error(api, db):
    meeting = meeting_row(db, api.create_instant()["code"])

    with pytest.raises(EmptyAgendaError):
        agenda_service.advance(db, meeting)


def test_items_can_be_added_during_the_meeting_up_to_the_limit(api, db):
    meeting = meeting_row(db, api.create_instant()["code"])

    for number in range(20):
        agenda_service.add_item(db, meeting, f"  Topic {number}  ", 5)

    assert meeting.agenda_items[0].title == "Topic 0"
    assert [item.position for item in meeting.agenda_items] == list(range(20))
    with pytest.raises(AgendaFullError):
        agenda_service.add_item(db, meeting, "One too many", 5)


@pytest.mark.parametrize(("title", "minutes"), [("", 5), ("x" * 201, 5), ("Ok", 0), ("Ok", 241)])
def test_invalid_items_cannot_be_added(api, db, title, minutes):
    meeting = meeting_row(db, api.create_instant()["code"])

    with pytest.raises(DomainError):
        agenda_service.add_item(db, meeting, title, minutes)
    assert meeting.agenda_items == []


def test_ending_the_meeting_ends_the_running_item(db, planned):
    agenda_service.advance(db, planned)

    meeting_service.end_meeting(db, planned)

    assert state(planned)[0] == (True, True)
    assert planned.agenda_items[0].ended_at == planned.ended_at


# --- the live room --------------------------------------------------------------------------


@pytest.fixture
def room(api):
    code = api.schedule(agenda=AGENDA)["code"]
    return api.start(code), api.join(code, "Guest")


def test_room_state_includes_the_agenda_and_the_server_time(api, room):
    host, _guest = room

    with api.socket(host) as socket:
        state_message = socket.receive_json()

    assert [item["title"] for item in state_message["agenda"]] == [
        "Updates",
        "Blockers",
        "Next steps",
    ]
    assert datetime.fromisoformat(state_message["server_time"]).tzinfo is not None


def test_host_moves_the_agenda_for_everyone(api, room):
    host, guest = room

    with api.socket(host) as host_socket, api.socket(guest) as guest_socket:
        host_socket.receive_json()  # room_state
        host_socket.receive_json()  # guest joined
        guest_socket.receive_json()  # room_state

        host_socket.send_json({"type": "agenda_next"})

        for socket in (host_socket, guest_socket):
            update = socket.receive_json()
            assert update["type"] == "agenda_updated"
            assert update["agenda"][0]["started_at"] is not None
            assert update["agenda"][1]["started_at"] is None
            assert "server_time" in update


def test_progress_survives_a_reconnect(api, room):
    host, _guest = room

    with api.socket(host) as socket:
        socket.receive_json()
        socket.send_json({"type": "agenda_next"})
        socket.receive_json()

    with api.socket(host) as socket:
        state_message = socket.receive_json()

    assert state_message["agenda"][0]["started_at"] is not None


def test_guests_cannot_move_or_change_the_agenda(api, room):
    host, guest = room

    with api.socket(host) as host_socket, api.socket(guest) as guest_socket:
        host_socket.receive_json()
        host_socket.receive_json()
        guest_socket.receive_json()

        for action in (
            {"type": "agenda_next"},
            {"type": "agenda_back"},
            {"type": "agenda_add", "title": "Sneaky", "duration_minutes": 5},
        ):
            guest_socket.send_json(action)
            assert guest_socket.receive_json()["type"] == "error"

        host_socket.send_json({"type": "chat", "text": "still unchanged"})
        assert host_socket.receive_json()["type"] == "chat"


def test_host_adds_an_item_during_the_meeting(api, room):
    host, guest = room

    with api.socket(host) as host_socket, api.socket(guest) as guest_socket:
        host_socket.receive_json()
        host_socket.receive_json()
        guest_socket.receive_json()

        host_socket.send_json({"type": "agenda_add", "title": " Q&A ", "duration_minutes": 10})

        update = guest_socket.receive_json()
        assert update["agenda"][-1]["title"] == "Q&A"
        assert update["agenda"][-1]["position"] == 3


@pytest.mark.parametrize(
    "message",
    [
        {"type": "agenda_add", "title": "No minutes"},
        {"type": "agenda_add", "title": "Text minutes", "duration_minutes": "ten"},
        {"type": "agenda_add", "title": "Boolean minutes", "duration_minutes": True},
        {"type": "agenda_add", "title": "", "duration_minutes": 5},
    ],
)
def test_bad_agenda_items_get_an_error_only_for_the_host(api, room, message):
    host, _guest = room

    with api.socket(host) as socket:
        socket.receive_json()
        socket.send_json(message)
        reply = socket.receive_json()

    assert reply["type"] == "error"


def test_next_without_an_agenda_tells_the_host(api):
    session = api.start(api.create_instant()["code"])

    with api.socket(session) as socket:
        socket.receive_json()
        socket.send_json({"type": "agenda_next"})
        reply = socket.receive_json()

    assert reply == {"type": "error", "message": EmptyAgendaError.message}
