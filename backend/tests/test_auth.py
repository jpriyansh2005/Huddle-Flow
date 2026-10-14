from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.time import utc_now
from app.models import Participant, User, UserSession
from tests.conftest import API, HOST_EMAIL, HOST_PASSWORD, MeetingApi, signed_out

COOKIE = get_settings().session_cookie_name


def signup(client, name="Priya Sharma", email="priya@example.com", password="a long password"):
    return client.post(
        f"{API}/auth/signup", json={"name": name, "email": email, "password": password}
    )


def login(client, email=HOST_EMAIL, password=HOST_PASSWORD):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


def me(client):
    return client.get(f"{API}/auth/me")


# --- signing up ---------------------------------------------------------------


def test_signup_creates_an_account_and_signs_in(anon_client, db):
    response = signup(anon_client, email="  Priya@Example.COM ")

    assert response.status_code == 201
    assert response.json() == {
        "id": response.json()["id"],
        "name": "Priya Sharma",
        "email": "priya@example.com",
    }
    assert me(anon_client).json()["email"] == "priya@example.com"
    stored = db.scalar(select(User).where(User.email == "priya@example.com"))
    assert stored.password_hash.startswith("$argon2")
    assert "a long password" not in stored.password_hash


def test_session_cookie_is_http_only_and_lax(anon_client):
    response = signup(anon_client)

    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE}=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert "Max-Age=" in cookie


def test_session_cookie_is_secure_when_configured(anon_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "cookie_secure", True)

    assert "Secure" in signup(anon_client).headers["set-cookie"]


def test_an_email_can_only_be_used_once_whatever_its_case(anon_client):
    assert signup(anon_client).status_code == 201

    with signed_out(anon_client):
        again = signup(anon_client, email="PRIYA@example.com")

    assert again.status_code == 409
    assert "already exists" in again.json()["detail"]


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("password", "short", "at least 8 characters"),
        ("password", "        ", "only spaces"),
        ("password", "x" * 129, "at most 128"),
        ("email", "not-an-email", "valid email"),
        ("email", "two@@example.com", "valid email"),
        ("name", "   ", "at least 1"),
    ],
)
def test_signup_rejects_invalid_details(anon_client, field, value, message):
    details = {"name": "Priya", "email": "priya@example.com", "password": "a long password"}
    details[field] = value

    response = anon_client.post(f"{API}/auth/signup", json=details)

    assert response.status_code == 422
    assert message in response.json()["detail"][0]["msg"]


# --- signing in and out ---------------------------------------------------------


def test_login_with_the_right_password(client):
    client.post(f"{API}/auth/logout")

    response = login(client, email=" ALEX@example.com ")

    assert response.status_code == 200
    assert response.json()["name"] == "Alex Morgan"
    assert me(client).status_code == 200


def test_wrong_password_and_unknown_email_get_the_same_answer(client):
    client.post(f"{API}/auth/logout")

    wrong_password = login(client, password="not the password")
    unknown_email = login(client, email="nobody@example.com")

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    assert me(client).status_code == 401


def test_too_many_wrong_passwords_lock_the_email(client):
    client.post(f"{API}/auth/logout")
    limit = get_settings().login_max_failures

    for _ in range(limit):
        assert login(client, password="wrong password").status_code == 401
    locked = login(client)  # even the right password is refused now

    assert locked.status_code == 429
    # Other accounts are not affected.
    assert login(client, email="someone@example.com", password="whatever").status_code == 401


def test_a_successful_login_clears_earlier_failures(client):
    client.post(f"{API}/auth/logout")
    limit = get_settings().login_max_failures

    for _ in range(limit - 1):
        login(client, password="wrong password")
    assert login(client).status_code == 200
    for _ in range(limit - 1):
        login(client, password="wrong password")

    assert login(client).status_code == 200


def test_logout_ends_the_session_on_the_server(client):
    token = client.cookies[COOKIE]

    response = client.post(f"{API}/auth/logout")

    assert response.status_code == 204
    assert COOKIE not in client.cookies
    assert me(client).status_code == 401
    client.cookies.set(COOKIE, token)  # a copy of the old cookie no longer works
    assert me(client).status_code == 401


def test_logout_without_a_session_is_harmless(anon_client):
    assert anon_client.post(f"{API}/auth/logout").status_code == 204


def test_signing_in_again_replaces_the_old_session(client, db):
    old_token = client.cookies[COOKIE]

    assert login(client).status_code == 200

    assert client.cookies[COOKIE] != old_token
    assert db.scalar(select(UserSession).where(UserSession.user.has(email=HOST_EMAIL))) is not None
    sessions = db.scalars(select(UserSession)).all()
    assert len(sessions) == 1


def test_an_expired_session_is_refused_and_its_cookie_cleared(client, db):
    session = db.scalar(select(UserSession))
    session.expires_at = utc_now() - timedelta(seconds=1)
    db.commit()

    response = me(client)

    assert response.status_code == 401
    assert f'{COOKIE}=""' in response.headers["set-cookie"]
    assert db.scalar(select(UserSession)) is None


@pytest.mark.parametrize("token", ["forged-token", "x" * 500, ""])
def test_a_forged_session_cookie_is_refused(anon_client, token):
    anon_client.cookies.set(COOKIE, token)

    assert me(anon_client).status_code == 401


# --- the demo account ---------------------------------------------------------------


def test_demo_sign_in_needs_no_password(anon_client):
    response = anon_client.post(f"{API}/auth/demo")

    assert response.status_code == 200
    assert response.json()["email"] == get_settings().demo_user_email
    assert me(anon_client).status_code == 200


def test_the_demo_account_cannot_be_entered_with_a_password(anon_client):
    anon_client.post(f"{API}/auth/demo")
    anon_client.post(f"{API}/auth/logout")
    demo_email = get_settings().demo_user_email

    for guess in ("demo", "password", "huddleflow", "huddleflow-demo"):
        assert login(anon_client, email=demo_email, password=guess).status_code == 401


def test_demo_can_be_switched_off(anon_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_enabled", False)

    assert anon_client.post(f"{API}/auth/demo").status_code == 404


# --- accounts are kept apart -----------------------------------------------------------


def test_people_only_see_and_change_their_own_meetings(client):
    alex = MeetingApi(client)
    code = alex.schedule(title="Alex only")["code"]

    client.post(f"{API}/auth/logout")
    assert signup(client).status_code == 201  # now signed in as Priya

    assert client.get(f"{API}/meetings/upcoming").json() == []
    assert client.patch(f"{API}/meetings/{code}", json={"title": "Taken"}).status_code == 403
    assert client.delete(f"{API}/meetings/{code}").status_code == 403
    assert client.post(f"{API}/meetings/{code}/start", json={}).status_code == 403
    # Joining as a guest is still allowed: that is what invite links are for.
    assert (
        client.post(f"{API}/meetings/{code}/join", json={"display_name": "Priya"}).status_code
        == 200
    )


def test_joining_while_signed_in_links_the_account(client, db):
    code = MeetingApi(client).create_instant()["code"]

    session = client.post(
        f"{API}/meetings/{code}/join", json={"display_name": "Alex (phone)"}
    ).json()

    participant = db.get(Participant, session["participant_id"])
    assert participant.user is not None
    assert participant.user.email == HOST_EMAIL
    assert session["role"] == "participant"
