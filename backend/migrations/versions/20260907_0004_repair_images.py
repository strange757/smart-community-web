"""Add privately stored repair image metadata.

Revision ID: 20260907_0004
Revises: 20260907_0003
Create Date: 2026-09-07
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260907_0004"
down_revision: str | None = "20260907_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "repair_image",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("community_id", sa.Integer(), nullable=False),
        sa.Column("repair_id", sa.Integer(), nullable=False),
        sa.Column("uploader_id", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=80), nullable=False),
        sa.Column("file_name", sa.String(length=160), nullable=False),
        sa.Column("content_type", sa.String(length=40), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.ForeignKeyConstraint(["community_id"], ["community.id"]),
        sa.ForeignKeyConstraint(["repair_id", "community_id"], ["repair_order.id", "repair_order.community_id"], name="fk_repair_image_repair_community"),
        sa.ForeignKeyConstraint(["uploader_id", "community_id"], ["app_user.id", "app_user.community_id"], name="fk_repair_image_uploader_community"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index("ix_repair_image_community_id", "repair_image", ["community_id"])
    op.create_index("ix_repair_image_repair_id", "repair_image", ["repair_id"])


def downgrade() -> None:
    op.drop_index("ix_repair_image_repair_id", table_name="repair_image")
    op.drop_index("ix_repair_image_community_id", table_name="repair_image")
    op.drop_table("repair_image")
