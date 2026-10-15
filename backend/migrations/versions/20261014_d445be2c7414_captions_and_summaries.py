"""Live captions (a saved transcript, and a room switch) and AI summaries.

Revision ID: d445be2c7414
Revises: 6868abbe222d
Create Date: 2026-10-14 21:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "d445be2c7414"
down_revision: str | Sequence[str] | None = "6868abbe222d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _datetime() -> sa.types.TypeEngine:
    return sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")


def upgrade() -> None:
    # A server default fills the new column for existing meetings.
    with op.batch_alter_table("meetings") as batch:
        batch.add_column(
            sa.Column("captions_on", sa.Boolean(), server_default=sa.false(), nullable=False)
        )

    op.create_table(
        "transcript_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("participant_id", sa.Integer(), nullable=True),
        sa.Column("speaker_name", sa.String(length=64), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column("spoken_at", _datetime(), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("transcript_lines") as batch:
        batch.create_index("ix_transcript_lines_meeting_id", ["meeting_id"], unique=False)

    op.create_table(
        "meeting_summaries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("created_at", _datetime(), nullable=False),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("meeting_id", name="uq_meeting_summaries_meeting"),
    )


def downgrade() -> None:
    # Dropping a table drops its indexes too. Dropping an index first fails on
    # MySQL when a foreign key needs it.
    op.drop_table("meeting_summaries")
    op.drop_table("transcript_lines")
    with op.batch_alter_table("meetings") as batch:
        batch.drop_column("captions_on")
