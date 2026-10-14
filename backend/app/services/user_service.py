import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import User
from app.services.auth_service import hash_password


def get_or_create_demo_user(db: Session) -> User:
    """The demo account that owns the sample meetings.

    Its password is random and never shown, so the only way in is the
    "Try the demo" button.
    """
    settings = get_settings()
    email = settings.demo_user_email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            name=settings.demo_user_name,
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
        )
        db.add(user)
        db.commit()
    return user
