from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Bill, ParkingReservation, RepairOrder


def dashboard_summary(session: Session, community_id: int) -> dict:
    pending = session.scalar(
        select(func.count())
        .select_from(RepairOrder)
        .where(
            RepairOrder.community_id == community_id,
            RepairOrder.status.in_(["SUBMITTED", "ASSIGNED", "IN_PROGRESS"]),
        )
    ) or 0
    completed = session.scalar(
        select(func.count())
        .select_from(RepairOrder)
        .where(
            RepairOrder.community_id == community_id,
            RepairOrder.status.in_(["COMPLETED", "CONFIRMED", "RATED"]),
        )
    ) or 0
    unpaid = session.scalar(
        select(func.coalesce(func.sum(Bill.amount), 0)).where(
            Bill.community_id == community_id,
            Bill.status == "UNPAID",
        )
    ) or Decimal("0")
    active = session.scalar(
        select(func.count())
        .select_from(ParkingReservation)
        .where(
            ParkingReservation.community_id == community_id,
            ParkingReservation.status == "ACTIVE",
        )
    ) or 0
    return {
        "pendingRepairCount": pending,
        "completedRepairCount": completed,
        "unpaidAmount": f"{unpaid:.2f}",
        "activeReservationCount": active,
    }
