from datetime import timedelta

from sqlalchemy import select

from app.core.time import utc_now
from app.models import Meeting, MeetingKind, MeetingStatus, User
from tests.conftest import API, HOST_EMAIL


def codes(response) -> list[str]:
    return [meeting["code"] for meeting in response.json()]


# --- signed-in user ---------------------------------------------------------


def test_meeting_routes_require_sign_in(anon_client):
    for method, path in (
        ("get", "/meetings/upcoming"),
        ("get", "/meetings/recent"),
        ("post", "/meetings/instant"),
        ("post", "/meetings"),
    ):
        response = getattr(anon_client, method)(f"{API}{path}")
        assert response.status_code == 401, path


# --- instant meetings -------------------------------------------------------


def test_instant_meeting_is_live_with_id_and_invite_link(api):
    meeting = api.create_instant()

    assert meeting["kind"] == "instant"
    assert meeting["status"] == "live"
    assert len(meeting["code"]) == 11 and meeting["code"].isdigit()
    assert meeting["join_url"] == f"http://testserver.local/j/{meeting['code']}"
    assert meeting["title"] == "Alex Morgan's huddle"


def test_each_instant_meeting_gets_its_own_id(api):
    assert api.create_instant()["code"] != api.create_instant()["code"]


# --- scheduling -------------------------------------------------------------


def test_scheduled_meeting_is_stored_and_listed_as_upcoming(client, api):
    meeting = api.schedule(title="Roadmap Review", duration_minutes=30)

    assert meeting["kind"] == "scheduled"
    assert meeting["status"] == "scheduled"
    assert meeting["scheduled_start"] == "2099-01-01T10:00:00Z"
    assert meeting["duration_minutes"] == 30
    assert meeting["join_url"].endswith(f"/j/{meeting['code']}")

    assert codes(client.get(f"{API}/meetings/upcoming")) == [meeting["code"]]
    assert codes(client.get(f"{API}/meetings/recent")) == []


def test_schedule_converts_other_timezones_to_utc(api):
    meeting = api.schedule(scheduled_start="2099-01-01T15:30:00+05:30")

    assert meeting["scheduled_start"] == "2099-01-01T10:00:00Z"


def test_upcoming_meetings_are_ordered_soonest_first(client, api):
    later = api.schedule(scheduled_start="2099-06-01T10:00:00Z")
    sooner = api.schedule(scheduled_start="2099-01-01T10:00:00Z")

    assert codes(client.get(f"{API}/meetings/upcoming")) == [sooner["code"], later["code"]]


def test_schedule_rejects_a_start_time_in_the_past(client):
    response = client.post(
        f"{API}/meetings",
        json={"title": "Old", "scheduled_start": "2001-01-01T10:00:00Z", "duration_minutes": 30},
    )

    assert response.status_code == 400
    assert "past" in response.json()["detail"]


def test_schedule_rejects_a_time_without_timezone(client):
    response = client.post(
        f"{API}/meetings",
        json={"title": "No zone", "scheduled_start": "2099-01-01T10:00:00", "duration_minutes": 30},
    )

    assert response.status_code == 422


def test_schedule_rejects_blank_title_and_zero_duration(client):
    for payload in (
        {"title": "   ", "scheduled_start": "2099-01-01T10:00:00Z", "duration_minutes": 30},
        {"title": "Ok", "scheduled_start": "2099-01-01T10:00:00Z", "duration_minutes": 0},
    ):
        assert client.post(f"{API}/meetings", json=payload).status_code == 422


# --- looking a meeting up ---------------------------------------------------


def test_meeting_can_be_found_by_plain_or_formatted_id(client, api):
    code = api.schedule()["code"]
    formatted = f"{code[:3]} {code[3:7]} {code[7:]}"

    assert client.get(f"{API}/meetings/{code}").json()["code"] == code
    assert client.get(f"{API}/meetings/{formatted}").json()["code"] == code


def test_unknown_meeting_id_returns_404(client):
    response = client.get(f"{API}/meetings/00000000000")

    assert response.status_code == 404
    assert "not valid" in response.json()["detail"]


# --- dashboard lists --------------------------------------------------------


def test_recent_lists_instant_ended_and_past_meetings_newest_first(client, api, db):
    instant = api.create_instant()
    host = db.scalar(select(User).where(User.email == HOST_EMAIL))
    now = utc_now()
    missed = Meeting(
        code="11111111111",
        host=host,
        title="Missed yesterday",
        kind=MeetingKind.SCHEDULED,
        status=MeetingStatus.SCHEDULED,
        scheduled_start=now - timedelta(days=1),
        duration_minutes=30,
    )
    in_progress = Meeting(
        code="22222222222",
        host=host,
        title="Started ten minutes ago",
        kind=MeetingKind.SCHEDULED,
        status=MeetingStatus.LIVE,
        scheduled_start=now - timedelta(minutes=10),
        duration_minutes=60,
        started_at=now - timedelta(minutes=10),
    )
    db.add_all([missed, in_progress])
    db.commit()

    assert codes(client.get(f"{API}/meetings/recent")) == [instant["code"], "11111111111"]
    # Still inside its planned time slot, so it stays in the upcoming list.
    assert codes(client.get(f"{API}/meetings/upcoming")) == ["22222222222"]


# --- editing and deleting ---------------------------------------------------


def test_update_changes_only_the_fields_sent(client, api):
    meeting = api.schedule(title="Before", description="Keep me")

    response = client.patch(f"{API}/meetings/{meeting['code']}", json={"title": "After"})

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "After"
    assert body["description"] == "Keep me"
    assert body["duration_minutes"] == 45


def test_update_can_clear_the_description(client, api):
    meeting = api.schedule(description="Remove me")

    response = client.patch(f"{API}/meetings/{meeting['code']}", json={"description": ""})

    assert response.json()["description"] is None


def test_instant_meetings_cannot_be_edited(client, api):
    meeting = api.create_instant()

    response = client.patch(f"{API}/meetings/{meeting['code']}", json={"title": "Nope"})

    assert response.status_code == 400


def test_delete_removes_a_scheduled_meeting(client, api):
    code = api.schedule()["code"]

    assert client.delete(f"{API}/meetings/{code}").status_code == 204
    assert client.get(f"{API}/meetings/{code}").status_code == 404
    assert codes(client.get(f"{API}/meetings/upcoming")) == []


def test_a_live_meeting_cannot_be_deleted(client, api):
    code = api.create_instant()["code"]

    assert client.delete(f"{API}/meetings/{code}").status_code == 409
