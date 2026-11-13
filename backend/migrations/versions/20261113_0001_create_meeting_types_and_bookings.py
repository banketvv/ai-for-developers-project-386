"""create meeting types and bookings

Revision ID: 20261113_0001
Revises:
Create Date: 2026-11-13 00:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20261113_0001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    """Создаёт обе таблицы домена: типы встреч и брони."""
    op.create_table(
        "meeting_types",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), server_default="30", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "duration_minutes IN (15, 30, 45, 60)",
            name="ck_meeting_types_duration_minutes",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_meeting_types"),
    )
    op.create_table(
        "bookings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("meeting_type_id", sa.Integer(), nullable=False),
        sa.Column("guest_name", sa.String(length=100), nullable=False),
        sa.Column("guest_email", sa.String(length=320), nullable=False),
        sa.Column("start", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["meeting_type_id"],
            ["meeting_types.id"],
            name="fk_bookings_meeting_type_id_meeting_types",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_bookings"),
        sa.UniqueConstraint(
            "meeting_type_id",
            "start",
            name="uq_bookings_meeting_type_start",
        ),
    )
    op.create_index("ix_bookings_meeting_type_id", "bookings", ["meeting_type_id"])


def downgrade() -> None:
    """Удаляет таблицы домена в порядке, обратном созданию."""
    op.drop_index("ix_bookings_meeting_type_id", table_name="bookings")
    op.drop_table("bookings")
    op.drop_table("meeting_types")
