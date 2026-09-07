"""Add nullable parking application and review details without changing history.

Revision ID: 20260907_0002
Revises: 20260904_0001
Create Date: 2026-09-07
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260907_0002"
down_revision: str | None = "20260904_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("parking_reservation") as batch_op:
        batch_op.add_column(sa.Column("plate_number", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("review_note", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("reviewed_by", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_parking_reservation_reviewer_community", "app_user",
            ["reviewed_by", "community_id"], ["id", "community_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("parking_reservation") as batch_op:
        batch_op.drop_constraint("fk_parking_reservation_reviewer_community", type_="foreignkey")
        batch_op.drop_column("reviewed_by")
        batch_op.drop_column("reviewed_at")
        batch_op.drop_column("review_note")
        batch_op.drop_column("plate_number")
