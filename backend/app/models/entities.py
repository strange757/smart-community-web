from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, ForeignKeyConstraint, Integer, Numeric, String, Text, Time, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )


class Community(TimestampMixin, Base):
    __tablename__ = "community"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    address: Mapped[str] = mapped_column(String(255))


class AppUser(TimestampMixin, Base):
    __tablename__ = "app_user"
    __table_args__ = (UniqueConstraint("id", "community_id", name="uq_app_user_id_community"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20), index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class House(TimestampMixin, Base):
    __tablename__ = "house"
    __table_args__ = (
        UniqueConstraint("community_id", "building", "unit_name", "room_no"),
        UniqueConstraint("id", "community_id", name="uq_house_id_community"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    building: Mapped[str] = mapped_column(String(40))
    unit_name: Mapped[str] = mapped_column(String(40))
    room_no: Mapped[str] = mapped_column(String(40))
    area: Mapped[Decimal] = mapped_column(Numeric(10, 2))


class ResidentHouse(TimestampMixin, Base):
    __tablename__ = "resident_house"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "community_id"],
            ["app_user.id", "app_user.community_id"],
            name="fk_resident_house_user_community",
        ),
        ForeignKeyConstraint(
            ["house_id", "community_id"],
            ["house.id", "house.community_id"],
            name="fk_resident_house_house_community",
        ),
        UniqueConstraint("user_id", "house_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    user_id: Mapped[int] = mapped_column(index=True)
    house_id: Mapped[int] = mapped_column(index=True)
    relation_type: Mapped[str] = mapped_column(String(20), default="OWNER")


class Notice(TimestampMixin, Base):
    __tablename__ = "notice"
    __table_args__ = (
        ForeignKeyConstraint(
            ["publisher_id", "community_id"],
            ["app_user.id", "app_user.community_id"],
            name="fk_notice_publisher_community",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", index=True)
    publisher_id: Mapped[int] = mapped_column()
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RepairOrder(TimestampMixin, Base):
    __tablename__ = "repair_order"
    __table_args__ = (
        ForeignKeyConstraint(
            ["house_id", "community_id"],
            ["house.id", "house.community_id"],
            name="fk_repair_order_house_community",
        ),
        ForeignKeyConstraint(
            ["creator_id", "community_id"],
            ["app_user.id", "app_user.community_id"],
            name="fk_repair_order_creator_community",
        ),
        ForeignKeyConstraint(
            ["assignee_id", "community_id"],
            ["app_user.id", "app_user.community_id"],
            name="fk_repair_order_assignee_community",
        ),
        UniqueConstraint("id", "community_id", name="uq_repair_order_id_community"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    house_id: Mapped[int] = mapped_column()
    creator_id: Mapped[int] = mapped_column(index=True)
    assignee_id: Mapped[int | None] = mapped_column(nullable=True)
    category: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(500))
    priority: Mapped[str] = mapped_column(String(20), default="NORMAL")
    status: Mapped[str] = mapped_column(String(20), default="SUBMITTED", index=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating_comment: Mapped[str | None] = mapped_column(String(200), nullable=True)


class RepairEvent(TimestampMixin, Base):
    __tablename__ = "repair_event"
    __table_args__ = (
        ForeignKeyConstraint(
            ["repair_id", "community_id"],
            ["repair_order.id", "repair_order.community_id"],
            name="fk_repair_event_repair_community",
        ),
        ForeignKeyConstraint(
            ["actor_id", "community_id"],
            ["app_user.id", "app_user.community_id"],
            name="fk_repair_event_actor_community",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    repair_id: Mapped[int] = mapped_column(index=True)
    actor_id: Mapped[int] = mapped_column()
    action: Mapped[str] = mapped_column(String(80))
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class Bill(TimestampMixin, Base):
    __tablename__ = "bill"
    __table_args__ = (
        ForeignKeyConstraint(
            ["house_id", "community_id"],
            ["house.id", "house.community_id"],
            name="fk_bill_house_community",
        ),
        UniqueConstraint("house_id", "bill_type", "period"),
        UniqueConstraint("id", "community_id", name="uq_bill_id_community"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    house_id: Mapped[int] = mapped_column(index=True)
    bill_type: Mapped[str] = mapped_column(String(40))
    period: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(20), default="UNPAID")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PaymentRecord(TimestampMixin, Base):
    __tablename__ = "payment_record"
    __table_args__ = (
        ForeignKeyConstraint(
            ["bill_id", "community_id"],
            ["bill.id", "bill.community_id"],
            name="fk_payment_record_bill_community",
        ),
        ForeignKeyConstraint(
            ["payer_id", "community_id"],
            ["app_user.id", "app_user.community_id"],
            name="fk_payment_record_payer_community",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    bill_id: Mapped[int] = mapped_column(index=True)
    payer_id: Mapped[int] = mapped_column()
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    payment_ref: Mapped[str] = mapped_column(String(120), unique=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ParkingSpace(TimestampMixin, Base):
    __tablename__ = "parking_space"
    __table_args__ = (
        UniqueConstraint("community_id", "space_no"),
        UniqueConstraint("id", "community_id", name="uq_parking_space_id_community"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    space_no: Mapped[str] = mapped_column(String(40))
    area_name: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class ParkingReservation(TimestampMixin, Base):
    __tablename__ = "parking_reservation"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "community_id"],
            ["app_user.id", "app_user.community_id"],
            name="fk_parking_reservation_user_community",
        ),
        ForeignKeyConstraint(
            ["parking_space_id", "community_id"],
            ["parking_space.id", "parking_space.community_id"],
            name="fk_parking_reservation_space_community",
        ),
        ForeignKeyConstraint(
            ["reviewed_by", "community_id"],
            ["app_user.id", "app_user.community_id"],
            name="fk_parking_reservation_reviewer_community",
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), index=True)
    user_id: Mapped[int] = mapped_column(index=True)
    parking_space_id: Mapped[int] = mapped_column(index=True)
    booking_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    plate_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    review_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[int | None] = mapped_column(nullable=True)


class DemoDataBatch(TimestampMixin, Base):
    __tablename__ = "demo_data_batch"
    community_id: Mapped[int] = mapped_column(ForeignKey("community.id"), primary_key=True)
    version: Mapped[str] = mapped_column(String(80), primary_key=True)
    summary: Mapped[dict] = mapped_column(JSON)
