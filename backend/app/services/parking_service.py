from datetime import UTC, date, datetime, time

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models.entities import AppUser, ParkingReservation, ParkingSpace


def space_view(space: ParkingSpace) -> dict:
    return {"id": space.id, "spaceNo": space.space_no, "areaName": space.area_name, "enabled": space.enabled}


def reservation_view(item: ParkingReservation) -> dict:
    return {"id": item.id, "parkingSpaceId": item.parking_space_id, "date": item.booking_date, "start": item.start_time, "end": item.end_time, "status": item.status}


def list_spaces(session: Session, user: AppUser, booking_date: date | None = None, start: time | None = None, end: time | None = None) -> list[dict]:
    rows = session.scalars(select(ParkingSpace).where(ParkingSpace.community_id == user.community_id, ParkingSpace.enabled.is_(True)).order_by(ParkingSpace.space_no)).all()
    if booking_date and start and end:
        blocked = set(session.scalars(select(ParkingReservation.parking_space_id).where(ParkingReservation.community_id == user.community_id, ParkingReservation.booking_date == booking_date, ParkingReservation.status == "ACTIVE", ParkingReservation.start_time < end, ParkingReservation.end_time > start)).all())
        rows = [space for space in rows if space.id not in blocked]
    return [space_view(space) for space in rows]


def create_reservation(session: Session, user: AppUser, space_id: int, booking_date: date, start: time, end: time) -> dict:
    if user.role != "OWNER":
        raise AppError("FORBIDDEN", 403, "只有业主可以预约车位")
    if booking_date < date.today() or end <= start:
        raise AppError("VALIDATION_ERROR", 422, "预约日期或时间不合法")
    # Serialize the conflict probe with competing writers on SQLite. Databases
    # with row locks instead protect the stable parking-space parent row.
    if session.get_bind().dialect.name == "sqlite":
        session.execute(text("BEGIN IMMEDIATE"))
    space = session.scalar(
        select(ParkingSpace).where(ParkingSpace.id == space_id).with_for_update()
    )
    if not space or space.community_id != user.community_id or not space.enabled:
        raise AppError("RESOURCE_NOT_FOUND", 404, "车位不可用")
    conflict = session.scalar(select(ParkingReservation.id).where(ParkingReservation.community_id == user.community_id, ParkingReservation.parking_space_id == space_id, ParkingReservation.booking_date == booking_date, ParkingReservation.status == "ACTIVE", ParkingReservation.start_time < end, ParkingReservation.end_time > start).limit(1))
    if conflict:
        raise AppError("PARKING_SLOT_CONFLICT", 409, "该时段已被预约")
    item = ParkingReservation(community_id=user.community_id, user_id=user.id, parking_space_id=space_id, booking_date=booking_date, start_time=start, end_time=end, status="ACTIVE", created_at=datetime.now(UTC))
    session.add(item)
    session.commit()
    session.refresh(item)
    return reservation_view(item)


def list_mine(session: Session, user: AppUser) -> list[dict]:
    rows = session.scalars(select(ParkingReservation).where(ParkingReservation.user_id == user.id, ParkingReservation.community_id == user.community_id).order_by(ParkingReservation.created_at.desc())).all()
    return [reservation_view(item) for item in rows]


def cancel_reservation(session: Session, user: AppUser, reservation_id: int) -> dict:
    item = session.get(ParkingReservation, reservation_id)
    if not item or item.community_id != user.community_id or item.user_id != user.id:
        raise AppError("RESOURCE_NOT_FOUND", 404, "预约不存在")
    if item.status != "ACTIVE":
        raise AppError("RESERVATION_ALREADY_CANCELLED", 409, "预约已经取消")
    item.status = "CANCELLED"
    session.commit()
    return reservation_view(item)
