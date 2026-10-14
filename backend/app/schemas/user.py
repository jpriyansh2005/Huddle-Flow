"""Request and response shapes for accounts."""

import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def _check_email(value: str) -> str:
    if not _EMAIL_PATTERN.fullmatch(value):
        raise ValueError("Enter a valid email address.")
    return value


def _check_new_password(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Use at least {MIN_PASSWORD_LENGTH} characters for your password.")
    if not value.strip():
        raise ValueError("The password cannot be only spaces.")
    return value


Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, min_length=3, max_length=255),
    AfterValidator(_check_email),
]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
# Passwords are not trimmed: spaces are allowed and count.
NewPassword = Annotated[
    str, StringConstraints(max_length=MAX_PASSWORD_LENGTH), AfterValidator(_check_new_password)
]
Password = Annotated[str, StringConstraints(min_length=1, max_length=MAX_PASSWORD_LENGTH)]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str


class SignupIn(BaseModel):
    name: PersonName
    email: Email
    password: NewPassword


class LoginIn(BaseModel):
    email: Email
    password: Password
