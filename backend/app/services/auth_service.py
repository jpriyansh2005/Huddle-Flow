"""Accounts: signing up, checking passwords, and signed-in sessions."""

import hashlib
import secrets
from datetime import timedelta

from pwdlib import PasswordHash
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.exceptions import EmailTakenError, InvalidCredentialsError, TooManyAttemptsError
from app.core.rate_limit import FailureLimiter
from app.core.time import utc_now
from app.models import User, UserSession

# Argon2 with the library's recommended parameters.
_hasher = PasswordHash.recommended()
# Checked against when the email is unknown, so a wrong email takes as long as
# a wrong password and response times do not reveal which emails exist.
_DUMMY_HASH = _hasher.hash("an unused password, only for timing")
# Session tokens longer than this are certainly forged; skip the lookup.
_MAX_TOKEN_LENGTH = 128

_settings = get_settings()
login_limiter = FailureLimiter(
    max_failures=_settings.login_max_failures,
    window=timedelta(minutes=_settings.login_lockout_minutes),
)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_user(db: Session, name: str, email: str, password: str) -> User:
    """Register an account. Raises EmailTakenError if the email is in use."""
    email = normalize_email(email)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise EmailTakenError()
    user = User(name=name, email=email, password_hash=hash_password(password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two sign-ups with the same email at the same moment: the UNIQUE
        # index rejects the second one.
        db.rollback()
        raise EmailTakenError() from None
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    """Return the account for these credentials, or raise.

    Too many wrong passwords for one email lock that email for a while.
    """
    email = normalize_email(email)
    if login_limiter.is_blocked(email):
        raise TooManyAttemptsError()

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        _hasher.verify(password, _DUMMY_HASH)
        login_limiter.record_failure(email)
        raise InvalidCredentialsError()

    valid, updated_hash = _hasher.verify_and_update(password, user.password_hash)
    if not valid:
        login_limiter.record_failure(email)
        raise InvalidCredentialsError()
    if updated_hash is not None:
        # The library's recommended parameters changed since this hash was
        # made; store a fresh one now that the password is known.
        user.password_hash = updated_hash
        db.commit()
    login_limiter.reset(email)
    return user


def start_session(db: Session, user: User) -> str:
    """Create a session for the user and return its token (for the cookie)."""
    now = utc_now()
    token = secrets.token_urlsafe(32)
    # Housekeeping: drop this user's expired sessions so the table stays small.
    db.execute(
        delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at <= now)
    )
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=_hash_token(token),
            expires_at=now + timedelta(days=_settings.session_days),
        )
    )
    db.commit()
    return token


def user_for_token(db: Session, token: str | None) -> User | None:
    """The account a session token belongs to, or None if it is not valid."""
    if not token or len(token) > _MAX_TOKEN_LENGTH:
        return None
    session = db.scalar(
        select(UserSession)
        .where(UserSession.token_hash == _hash_token(token))
        .options(selectinload(UserSession.user))
    )
    if session is None:
        return None
    if session.expires_at <= utc_now():
        db.delete(session)
        db.commit()
        return None
    return session.user


def end_session(db: Session, token: str | None) -> None:
    """Sign out: forget the session. Unknown tokens are ignored."""
    if not token or len(token) > _MAX_TOKEN_LENGTH:
        return
    db.execute(delete(UserSession).where(UserSession.token_hash == _hash_token(token)))
    db.commit()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
