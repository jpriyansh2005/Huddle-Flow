"""Declarative base class and column types shared by every model.

The app runs on SQLite locally and in the tests, and on MySQL in production.
The helpers here hide the few differences between the two.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import TypeDecorator, TypeEngine

from app.core.time import to_utc


class Base(DeclarativeBase):
    pass


def enum_column(enum_class: type[enum.Enum], constraint_name: str) -> Enum:
    """Column type that stores an enum as its lowercase value.

    Neither SQLite nor this app's MySQL setup uses a native enum type, so this
    becomes a VARCHAR with a CHECK constraint, named ``constraint_name``, that
    only allows the enum's values.
    """
    return Enum(
        enum_class,
        name=constraint_name,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda members: [member.value for member in members],
    )


def token_column(length: int) -> TypeEngine:
    """A column for random secrets (session tokens).

    MySQL compares text case-insensitively by default, which would make
    ``aB3`` and ``Ab3`` the same token and weaken the unique index. On MySQL the
    column therefore uses a binary collation; SQLite already compares exactly.
    """
    return String(length).with_variant(
        mysql.VARCHAR(length, charset="ascii", collation="ascii_bin"), "mysql"
    )


class UTCDateTime(TypeDecorator):
    """A datetime column that is always timezone-aware UTC in Python.

    Neither SQLite nor MySQL stores a timezone, and both hand back naive
    datetimes, so values are converted to UTC on the way in and tagged as UTC
    on the way out. That keeps "naive or aware?" bugs out of the rest of the
    code. On MySQL the column keeps microseconds, which it drops by default.
    """

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "mysql":
            return dialect.type_descriptor(mysql.DATETIME(fsp=6))
        return dialect.type_descriptor(DateTime())

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return to_utc(value).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        return to_utc(value)
