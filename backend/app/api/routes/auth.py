"""Sign up, sign in, sign out.

A successful sign-in sets an HttpOnly cookie holding the session token, so
the browser sends it automatically and page scripts can never read it.
"""

from fastapi import APIRouter, Request, Response, status

from app.api.deps import CurrentUser, DbSession, session_token
from app.core.config import get_settings
from app.core.exceptions import FeatureDisabledError
from app.models import User
from app.schemas.user import LoginIn, SignupIn, UserOut
from app.services import auth_service
from app.services.user_service import get_or_create_demo_user

router = APIRouter(prefix="/auth", tags=["auth"])


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_days * 24 * 60 * 60,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        # Lax: sent when following a link to the site, never with requests
        # that other websites make in the background.
        samesite="lax",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _sign_in(request: Request, response: Response, db: DbSession, user: User) -> User:
    # Signing in again from the same browser replaces its old session.
    auth_service.end_session(db, session_token(request))
    set_session_cookie(response, auth_service.start_session(db, user))
    return user


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(data: SignupIn, request: Request, response: Response, db: DbSession):
    """Create an account and sign in to it."""
    user = auth_service.create_user(db, data.name, data.email, data.password)
    return _sign_in(request, response, db, user)


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, request: Request, response: Response, db: DbSession):
    user = auth_service.authenticate(db, data.email, data.password)
    return _sign_in(request, response, db, user)


@router.post("/demo", response_model=UserOut)
def demo(request: Request, response: Response, db: DbSession):
    """Sign in to the shared demo account, which holds the sample meetings."""
    if not get_settings().demo_enabled:
        raise FeatureDisabledError("The demo account is switched off.")
    return _sign_in(request, response, db, get_or_create_demo_user(db))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: DbSession):
    auth_service.end_session(db, session_token(request))
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    """The signed-in user. Answers 401 when nobody is signed in."""
    return user
