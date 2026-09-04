from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Community(Base):
    __tablename__ = "community"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    address: Mapped[str] = mapped_column(String(255))


class AppUser(Base):
    __tablename__ = "app_user"
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20), index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class House(Base):
    __tablename__ = "house"
    __table_args__ = (UniqueConstraint("community_id", "building", "unit_name", "room_no"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    building: Mapped[str] = mapped_column(String(40))
    unit_name: Mapped[str] = mapped_column(String(40))
    room_no: Mapped[str] = mapped_column(String(40))
    area: Mapped[Decimal] = mapped_column(Numeric(10, 2))


class ResidentHouse(Base):
    __tablename__ = "resident_house"
    __table_args__ = (UniqueConstraint("user_id", "house_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"), index=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("house.id"), index=True)
    relation_type: Mapped[str] = mapped_column(String(20), default="OWNER")


class Notice(Base):
    __tablename__ = "notice"
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", index=True)
    publisher_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RepairOrder(Base):
    __tablename__ = "repair_order"
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("house.id"))
    creator_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"), index=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(500))
    priority: Mapped[str] = mapped_column(String(20), default="NORMAL")
    status: Mapped[str] = mapped_column(String(20), default="SUBMITTED", index=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating_comment: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RepairEvent(Base):
    __tablename__ = "repair_event"
    id: Mapped[int] = mapped_column(primary_key=True)
    repair_id: Mapped[int] = mapped_column(ForeignKey("repair_order.id"), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    action: Mapped[str] = mapped_column(String(80))
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Bill(Base):
    __tablename__ = "bill"
    __table_args__ = (UniqueConstraint("house_id", "bill_type", "period"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("house.id"), index=True)
    bill_type: Mapped[str] = mapped_column(String(40))
    period: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(20), default="UNPAID")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PaymentRecord(Base):
    __tablename__ = "payment_record"
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("bill.id"), index=True)
    payer_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    payment_ref: Mapped[str] = mapped_column(String(120), unique=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ParkingSpace(Base):
    __tablename__ = "parking_space"
    __table_args__ = (UniqueConstraint("community_id", "space_no"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    space_no: Mapped[str] = mapped_column(String(40))
    area_name: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class ParkingReservation(Base):
    __tablename__ = "parking_reservation"
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.id"), index=True)
    parking_space_id: Mapped[int] = mapped_column(ForeignKey("parking_space.id"), index=True)
    booking_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
