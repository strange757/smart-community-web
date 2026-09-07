from datetime import UTC, date, datetime, time, timedelta, timezone

from sqlalchemy import and_, select, text
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time_utils import utc_isoformat
from app.models.entities import AppUser, ParkingReservation, ParkingSpace


BLOCKING_STATUSES = ("PENDING", "ACTIVE")
# Present and future Shanghai bookings use UTC+08:00, including on Windows
# installations without an IANA timezone database.
SHANGHAI = timezone(timedelta(hours=8), name="Asia/Shanghai")


def space_view(space: ParkingSpace) -> dict:
    return {"id": space.id, "spaceNo": space.space_no, "areaName": space.area_name, "enabled": space.enabled}


def reservation_view(item: ParkingReservation, space: ParkingSpace, applicant: AppUser) -> dict:
    return {
        "id": item.id,
        "parkingSpaceId": item.parking_space_id,
        "spaceNo": space.space_no,
        "areaName": space.area_name,
        "date": item.booking_date,
        "start": item.start_time,
        "end": item.end_time,
        "status": item.status,
        "plateNumber": item.plate_number,
        "applicantName": applicant.display_name,
        "reviewNote": item.review_note,
        "reviewedAt": utc_isoformat(item.reviewed_at),
        "reviewedBy": item.reviewed_by,
        "createdAt": utc_isoformat(item.created_at),
    }


def _reservation_query(community_id: int):
    return (
        select(ParkingReservation, ParkingSpace, AppUser)
        .join(ParkingSpace, and_(ParkingSpace.id == ParkingReservation.parking_space_id,
                                ParkingSpace.community_id == ParkingReservation.community_id))
        .join(AppUser, and_(AppUser.id == ParkingReservation.user_id,
                           AppUser.community_id == ParkingReservation.community_id))
        .where(ParkingReservation.community_id == community_id)
    )


def _reservation_result(session: Session, item: ParkingReservation) -> dict:
    row = session.execute(_reservation_query(item.community_id).where(ParkingReservation.id == item.id)).one()
    return reservation_view(*row)


def _validate_interval(start: time, end: time) -> None:
    if start.tzinfo is not None or end.tzinfo is not None or end <= start:
        raise AppError("VALIDATION_ERROR", 422, "预约日期或时间不合法")


def _overlapping(community_id: int, booking_date: date, start: time, end: time):
    return select(ParkingReservation).where(
        ParkingReservation.community_id == community_id,
        ParkingReservation.booking_date == booking_date,
        ParkingReservation.status.in_(BLOCKING_STATUSES),
        ParkingReservation.start_time < end,
        ParkingReservation.end_time > start,
    )


def _lock_writes(session: Session) -> None:
    # SQLite has no row locks: acquire its write lock before reading decisions.
    # Other databases use FOR UPDATE on the reservation and stable space rows.
    if session.get_bind().dialect.name == "sqlite":
        session.execute(text("BEGIN IMMEDIATE"))


def list_spaces(session: Session, user: AppUser, booking_date: date | None = None,
                start: time | None = None, end: time | None = None) -> list[dict]:
    rows = session.scalars(select(ParkingSpace).where(
        ParkingSpace.community_id == user.community_id, ParkingSpace.enabled.is_(True)
    ).order_by(ParkingSpace.space_no)).all()
    if booking_date and start and end:
        _validate_interval(start, end)
        blocked = {item.parking_space_id for item in session.scalars(
            _overlapping(user.community_id, booking_date, start, end)
        )}
        rows = [space for space in rows if space.id not in blocked]
    return [space_view(space) for space in rows]


def availability(session: Session, user: AppUser, booking_date: date, start: time, end: time) -> dict:
    _validate_interval(start, end)
    as_of = datetime.now(UTC)
    # One outer join gives a consistent snapshot and never selects applicant or plate data.
    rows = session.execute(
        select(ParkingSpace, ParkingReservation.status, ParkingReservation.user_id)
        .outerjoin(ParkingReservation, and_(
            ParkingReservation.parking_space_id == ParkingSpace.id,
            ParkingReservation.community_id == ParkingSpace.community_id,
            ParkingReservation.booking_date == booking_date,
            ParkingReservation.status.in_(BLOCKING_STATUSES),
            ParkingReservation.start_time < end,
            ParkingReservation.end_time > start,
        ))
        .where(ParkingSpace.community_id == user.community_id)
        .order_by(ParkingSpace.space_no)
    ).all()
    spaces = {}
    for space, reservation_status, owner_id in rows:
        item = spaces.setdefault(space.id, {
            **space_view(space),
            "availability": "AVAILABLE" if space.enabled else "DISABLED",
            "isMine": False,
        })
        if reservation_status:
            item["isMine"] = item["isMine"] or owner_id == user.id
            if space.enabled and item["availability"] != "OCCUPIED":
                item["availability"] = "OCCUPIED" if reservation_status == "ACTIVE" else "PENDING"
    return {"asOf": utc_isoformat(as_of), "spaces": list(spaces.values())}


def create_reservation(session: Session, user: AppUser, space_id: int, booking_date: date,
                       start: time, end: time, plate_number: str | None = None) -> dict:
    if user.role != "OWNER":
        raise AppError("FORBIDDEN", 403, "只有业主可以预约车位")
    _validate_interval(start, end)
    _lock_writes(session)
    space = session.scalar(select(ParkingSpace).where(
        ParkingSpace.id == space_id, ParkingSpace.community_id == user.community_id
    ).with_for_update())
    if not space or not space.enabled:
        raise AppError("RESOURCE_NOT_FOUND", 404, "车位不可用")
    if datetime.combine(booking_date, start, SHANGHAI) < datetime.now(SHANGHAI):
        raise AppError("VALIDATION_ERROR", 422, "预约开始时间不能早于当前时间")
    conflict = session.scalar(_overlapping(user.community_id, booking_date, start, end).where(
        ParkingReservation.parking_space_id == space_id
    ).limit(1))
    if conflict:
        raise AppError("PARKING_SLOT_CONFLICT", 409, "该时段已被预约")
    item = ParkingReservation(
        community_id=user.community_id, user_id=user.id, parking_space_id=space_id,
        booking_date=booking_date, start_time=start, end_time=end, status="PENDING",
        plate_number=plate_number, created_at=datetime.now(UTC),
    )
    session.add(item)
    session.commit()
    return _reservation_result(session, item)


def list_mine(session: Session, user: AppUser) -> list[dict]:
    rows = session.execute(_reservation_query(user.community_id).where(
        ParkingReservation.user_id == user.id
    ).order_by(ParkingReservation.created_at.desc(), ParkingReservation.id.desc())).all()
    return [reservation_view(*row) for row in rows]


def list_reservations(session: Session, user: AppUser, status: str | None = None,
                      booking_date: date | None = None) -> list[dict]:
    query = _reservation_query(user.community_id)
    if status:
        query = query.where(ParkingReservation.status == status)
    if booking_date:
        query = query.where(ParkingReservation.booking_date == booking_date)
    rows = session.execute(query.order_by(ParkingReservation.created_at.desc(), ParkingReservation.id.desc())).all()
    return [reservation_view(*row) for row in rows]


def cancel_reservation(session: Session, user: AppUser, reservation_id: int) -> dict:
    _lock_writes(session)
    item = session.scalar(select(ParkingReservation).where(
        ParkingReservation.id == reservation_id, ParkingReservation.community_id == user.community_id,
        ParkingReservation.user_id == user.id,
    ).with_for_update())
    if not item:
        raise AppError("RESOURCE_NOT_FOUND", 404, "预约不存在")
    if item.status not in BLOCKING_STATUSES:
        raise AppError("RESERVATION_ALREADY_CANCELLED", 409, "当前预约不可取消")
    item.status = "CANCELLED"
    session.commit()
    return _reservation_result(session, item)


def review_reservation(session: Session, user: AppUser, reservation_id: int,
                       approve: bool, note: str | None = None) -> dict:
    if user.role != "PROPERTY":
        raise AppError("FORBIDDEN", 403, "只有物业可以审核车位预约")
    _lock_writes(session)
    item = session.scalar(select(ParkingReservation).where(
        ParkingReservation.id == reservation_id, ParkingReservation.community_id == user.community_id
    ).with_for_update())
    if not item:
        raise AppError("RESOURCE_NOT_FOUND", 404, "预约不存在")
    if item.status != "PENDING":
        raise AppError("RESERVATION_ALREADY_REVIEWED", 409, "预约已审核或取消，请刷新列表")
    if approve:
        space = session.scalar(select(ParkingSpace).where(
            ParkingSpace.id == item.parking_space_id, ParkingSpace.community_id == user.community_id
        ).with_for_update())
        if not space or not space.enabled:
            raise AppError("PARKING_SPACE_DISABLED", 409, "车位已停用，无法批准")
        if datetime.combine(item.booking_date, item.end_time, SHANGHAI) <= datetime.now(SHANGHAI):
            raise AppError("RESERVATION_EXPIRED", 409, "预约时段已结束，无法批准")
        conflict = session.scalar(_overlapping(user.community_id, item.booking_date, item.start_time, item.end_time).where(
            ParkingReservation.parking_space_id == item.parking_space_id, ParkingReservation.id != item.id
        ).limit(1))
        if conflict:
            raise AppError("PARKING_SLOT_CONFLICT", 409, "该时段已被其他预约占用")
    item.status = "ACTIVE" if approve else "REJECTED"
    item.review_note = (note.strip() or None) if note is not None else None
    item.reviewed_at = datetime.now(UTC)
    item.reviewed_by = user.id
    session.commit()
    return _reservation_result(session, item)
