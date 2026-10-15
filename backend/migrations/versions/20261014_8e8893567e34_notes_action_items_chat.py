"""Notes, action items and saved chat: what a meeting produces.

Revision ID: 8e8893567e34
Revises: c78cbb9bb365
Create Date: 2026-10-14 19:10:38
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "8e8893567e34"
down_revision: str | Sequence[str] | None = "c78cbb9bb365"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "action_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column("owner_name", sa.String(length=64), nullable=True),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("done", sa.Boolean(), nullable=False),
        sa.Column("created_by_participant_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["created_by_participant_id"], ["participants.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("action_items", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_action_items_meeting_id"), ["meeting_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_action_items_owner_user_id"), ["owner_user_id"], unique=False
        )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("participant_id", sa.Integer(), nullable=True),
        sa.Column("sender_name", sa.String(length=64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "sent_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("chat_messages", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_chat_messages_meeting_id"), ["meeting_id"], unique=False
        )

    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_id", sa.Integer(), nullable=False),
        sa.Column("author_participant_id", sa.Integer(), nullable=True),
        sa.Column("author_name", sa.String(length=64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["author_participant_id"], ["participants.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_notes_meeting_id"), ["meeting_id"], unique=False)


def downgrade() -> None:
    # Dropping a table drops its indexes too. Dropping an index first fails on
    # MySQL when a foreign key needs it.
    op.drop_table("notes")
    op.drop_table("chat_messages")
    op.drop_table("action_items")
