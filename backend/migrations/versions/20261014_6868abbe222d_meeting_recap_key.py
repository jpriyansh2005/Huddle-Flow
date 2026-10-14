"""A secret recap share key for every meeting.

Revision ID: 6868abbe222d
Revises: 8e8893567e34
Create Date: 2026-10-14 20:05:00

Existing meetings get their own random key, so their recaps can be shared too.
The column is added as nullable, filled in, then made required and unique.
"""

import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "6868abbe222d"
down_revision: str | Sequence[str] | None = "8e8893567e34"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KEY_TYPE = sa.String(length=64).with_variant(
    mysql.VARCHAR(length=64, charset="ascii", collation="ascii_bin"), "mysql"
)


def upgrade() -> None:
    with op.batch_alter_table("meetings") as batch:
        batch.add_column(sa.Column("recap_key", KEY_TYPE, nullable=True))

    meetings = sa.table("meetings", sa.column("id", sa.Integer), sa.column("recap_key", KEY_TYPE))
    connection = op.get_bind()
    for (meeting_id,) in connection.execute(sa.select(meetings.c.id)).all():
        connection.execute(
            meetings.update()
            .where(meetings.c.id == meeting_id)
            .values(recap_key=secrets.token_urlsafe(32))
        )

    with op.batch_alter_table("meetings") as batch:
        batch.alter_column("recap_key", existing_type=KEY_TYPE, nullable=False)
        batch.create_unique_constraint("uq_meetings_recap_key", ["recap_key"])


def downgrade() -> None:
    with op.batch_alter_table("meetings") as batch:
        batch.drop_constraint("uq_meetings_recap_key", type_="unique")
        batch.drop_column("recap_key")
