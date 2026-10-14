from sqlalchemy import func, select

from app.db.seed import RECENT, UPCOMING, seed_database
from app.models import Meeting, Participant
from tests.conftest import API


def test_seed_fills_both_dashboard_lists_of_the_demo_account(anon_client, db):
    assert seed_database(db) is True
    client = anon_client
    assert client.post(f"{API}/auth/demo").status_code == 200

    upcoming = client.get(f"{API}/meetings/upcoming").json()
    recent = client.get(f"{API}/meetings/recent").json()

    assert [meeting["title"] for meeting in upcoming] == [row[0] for row in UPCOMING]
    assert [meeting["title"] for meeting in recent] == [row[0] for row in RECENT]
    assert db.scalar(select(func.count()).select_from(Participant)) > len(RECENT)


def test_seed_does_nothing_when_meetings_already_exist(db):
    seed_database(db)
    count = db.scalar(select(func.count()).select_from(Meeting))

    assert seed_database(db) is False
    assert db.scalar(select(func.count()).select_from(Meeting)) == count
