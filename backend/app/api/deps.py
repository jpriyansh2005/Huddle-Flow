"""Dependencies shared by the API routes."""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotAuthenticatedError
from app.db.session import get_db
from app.models import User
from app.services import auth_service

DbSession = Annotated[Session, Depends(get_db)]


def session_token(request: Request) -> str | None:
    """The session token from the browser's cookie, if it sent one."""
    return request.cookies.get(get_settings().session_cookie_name)


def get_optional_user(request: Request, db: DbSession) -> User | None:
    """The signed-in user, or None for a visitor without a valid session."""
    return auth_service.user_for_token(db, session_token(request))


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def get_current_user(user: OptionalUser) -> User:
    """The signed-in user. Routes that need one answer 401 without it."""
    if user is None:
        raise NotAuthenticatedError()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
