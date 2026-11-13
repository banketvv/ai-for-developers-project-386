from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.booking import Booking


class MeetingType(Base):
    """Тип встречи: серия встреч с названием, описанием и длительностью."""

    __tablename__ = "meeting_types"
    __table_args__ = (
        CheckConstraint(
            "duration_minutes IN (15, 30, 45, 60)",
            name="duration_minutes",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(1000))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=30, server_default="30")
    created_at: Mapped[datetime] = mapped_column(DateTime)

    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="meeting_type",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
