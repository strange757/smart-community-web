"""Create the initial smart-community schema.

Revision ID: 20260904_0001
Revises:
Create Date: 2026-09-04
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260904_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "community",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "app_user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("community_id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["community_id"], ["community.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_index(op.f("ix_app_user_community_id"), "app_user", ["community_id"], unique=False)
    op.create_index(op.f("ix_app_user_role"), "app_user", ["role"], unique=False)
    op.create_table(
        "house",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("community_id", sa.Integer(), nullable=False),
        sa.Column("building", sa.String(length=40), nullable=False),
        sa.Column("unit_name", sa.String(length=40), nullable=False),
        sa.Column("room_no", sa.String(length=40), nullable=False),
        sa.Column("area", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["community_id"], ["community.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("community_id", "building", "unit_name", "room_no"),
    )
    op.create_index(op.f("ix_house_community_id"), "house", ["community_id"], unique=False)
    op.create_table(
        "resident_house",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("house_id", sa.Integer(), nullable=False),
        sa.Column("relation_type", sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(["house_id"], ["house.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "house_id"),
    )
    op.create_index(op.f("ix_resident_house_house_id"), "resident_house", ["house_id"], unique=False)
    op.create_index(op.f("ix_resident_house_user_id"), "resident_house", ["user_id"], unique=False)
    op.create_table(
        "notice",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("community_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("publisher_id", sa.Integer(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["community_id"], ["community.id"]),
        sa.ForeignKeyConstraint(["publisher_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notice_community_id"), "notice", ["community_id"], unique=False)
    op.create_index(op.f("ix_notice_status"), "notice", ["status"], unique=False)
    op.create_table(
        "repair_order",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("community_id", sa.Integer(), nullable=False),
        sa.Column("house_id", sa.Integer(), nullable=False),
        sa.Column("creator_id", sa.Integer(), nullable=False),
        sa.Column("assignee_id", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("rating_comment", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assignee_id"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["community_id"], ["community.id"]),
        sa.ForeignKeyConstraint(["creator_id"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["house_id"], ["house.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_repair_order_community_id"), "repair_order", ["community_id"], unique=False)
    op.create_index(op.f("ix_repair_order_creator_id"), "repair_order", ["creator_id"], unique=False)
    op.create_index(op.f("ix_repair_order_status"), "repair_order", ["status"], unique=False)
    op.create_table(
        "repair_event",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("repair_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("from_status", sa.String(length=20), nullable=True),
        sa.Column("to_status", sa.String(length=20), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["app_user.id"]),
        sa.ForeignKeyConstraint(["repair_id"], ["repair_order.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_repair_event_repair_id"), "repair_event", ["repair_id"], unique=False)
    op.create_table(
        "bill",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("community_id", sa.Integer(), nullable=False),
        sa.Column("house_id", sa.Integer(), nullable=False),
        sa.Column("bill_type", sa.String(length=40), nullable=False),
        sa.Column("period", sa.String(length=20), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["community_id"], ["community.id"]),
        sa.ForeignKeyConstraint(["house_id"], ["house.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("house_id", "bill_type", "period"),
    )
    op.create_index(op.f("ix_bill_community_id"), "bill", ["community_id"], unique=False)
    op.create_index(op.f("ix_bill_house_id"), "bill", ["house_id"], unique=False)
    op.create_table(
        "payment_record",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("community_id", sa.Integer(), nullable=False),
        sa.Column("bill_id", sa.Integer(), nullable=False),
        sa.Column("payer_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("idempotency_key", sa.String(length=120), nullable=False),
        sa.Column("payment_ref", sa.String(length=120), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["bill_id"], ["bill.id"]),
        sa.ForeignKeyConstraint(["community_id"], ["community.id"]),
        sa.ForeignKeyConstraint(["payer_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint("payment_ref"),
    )
    op.create_index(op.f("ix_payment_record_bill_id"), "payment_record", ["bill_id"], unique=False)
    op.create_index(op.f("ix_payment_record_community_id"), "payment_record", ["community_id"], unique=False)
    op.create_table(
        "parking_space",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("community_id", sa.Integer(), nullable=False),
        sa.Column("space_no", sa.String(length=40), nullable=False),
        sa.Column("area_name", sa.String(length=80), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["community_id"], ["community.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("community_id", "space_no"),
    )
    op.create_index(op.f("ix_parking_space_community_id"), "parking_space", ["community_id"], unique=False)
    op.create_table(
        "parking_reservation",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("community_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("parking_space_id", sa.Integer(), nullable=False),
        sa.Column("booking_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["community_id"], ["community.id"]),
        sa.ForeignKeyConstraint(["parking_space_id"], ["parking_space.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_parking_reservation_booking_date"), "parking_reservation", ["booking_date"], unique=False)
    op.create_index(op.f("ix_parking_reservation_community_id"), "parking_reservation", ["community_id"], unique=False)
    op.create_index(op.f("ix_parking_reservation_parking_space_id"), "parking_reservation", ["parking_space_id"], unique=False)
    op.create_index(op.f("ix_parking_reservation_status"), "parking_reservation", ["status"], unique=False)
    op.create_index(op.f("ix_parking_reservation_user_id"), "parking_reservation", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_parking_reservation_user_id"), table_name="parking_reservation")
    op.drop_index(op.f("ix_parking_reservation_status"), table_name="parking_reservation")
    op.drop_index(op.f("ix_parking_reservation_parking_space_id"), table_name="parking_reservation")
    op.drop_index(op.f("ix_parking_reservation_community_id"), table_name="parking_reservation")
    op.drop_index(op.f("ix_parking_reservation_booking_date"), table_name="parking_reservation")
    op.drop_table("parking_reservation")
    op.drop_index(op.f("ix_parking_space_community_id"), table_name="parking_space")
    op.drop_table("parking_space")
    op.drop_index(op.f("ix_payment_record_community_id"), table_name="payment_record")
    op.drop_index(op.f("ix_payment_record_bill_id"), table_name="payment_record")
    op.drop_table("payment_record")
    op.drop_index(op.f("ix_bill_house_id"), table_name="bill")
    op.drop_index(op.f("ix_bill_community_id"), table_name="bill")
    op.drop_table("bill")
    op.drop_index(op.f("ix_repair_event_repair_id"), table_name="repair_event")
    op.drop_table("repair_event")
    op.drop_index(op.f("ix_repair_order_status"), table_name="repair_order")
    op.drop_index(op.f("ix_repair_order_creator_id"), table_name="repair_order")
    op.drop_index(op.f("ix_repair_order_community_id"), table_name="repair_order")
    op.drop_table("repair_order")
    op.drop_index(op.f("ix_notice_status"), table_name="notice")
    op.drop_index(op.f("ix_notice_community_id"), table_name="notice")
    op.drop_table("notice")
    op.drop_index(op.f("ix_resident_house_user_id"), table_name="resident_house")
    op.drop_index(op.f("ix_resident_house_house_id"), table_name="resident_house")
    op.drop_table("resident_house")
    op.drop_index(op.f("ix_house_community_id"), table_name="house")
    op.drop_table("house")
    op.drop_index(op.f("ix_app_user_role"), table_name="app_user")
    op.drop_index(op.f("ix_app_user_community_id"), table_name="app_user")
    op.drop_table("app_user")
    op.drop_table("community")
