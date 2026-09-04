from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time_utils import utc_isoformat
from app.models.entities import AppUser, House, RepairEvent, RepairOrder, ResidentHouse

ALLOWED = {
    "SUBMITTED": {"ASSIGNED", "CANCELLED"},
    "ASSIGNED": {"IN_PROGRESS", "CANCELLED"},
    "IN_PROGRESS": {"COMPLETED"},
    "COMPLETED": {"CONFIRMED"},
    "CONFIRMED": {"RATED"},
    "RATED": set(),
    "CANCELLED": set(),
}


def _event_view(event: RepairEvent) -> dict:
    return {
        "id": event.id,
        "actorId": event.actor_id,
        "action": event.action,
        "fromStatus": event.from_status,
        "toStatus": event.to_status,
        "note": event.note,
        "createdAt": utc_isoformat(event.created_at),
    }


def repair_view(session: Session, repair: RepairOrder) -> dict:
    events = session.scalars(select(RepairEvent).where(RepairEvent.repair_id == repair.id).order_by(RepairEvent.created_at, RepairEvent.id)).all()
    return {
        "id": repair.id,
        "communityId": repair.community_id,
        "houseId": repair.house_id,
        "creatorId": repair.creator_id,
        "assigneeId": repair.assignee_id,
        "category": repair.category,
        "description": repair.description,
        "priority": repair.priority,
        "status": repair.status,
        "rating": repair.rating,
        "ratingComment": repair.rating_comment,
        "createdAt": utc_isoformat(repair.created_at),
        "events": [_event_view(event) for event in events],
    }


def _visible(repair: RepairOrder, user: AppUser) -> bool:
    return repair.community_id == user.community_id and (
        user.role == "PROPERTY"
        or (user.role == "OWNER" and repair.creator_id == user.id)
        or (user.role == "MAINTENANCE" and repair.assignee_id == user.id)
    )


def get_repair(session: Session, user: AppUser, repair_id: int) -> RepairOrder:
    repair = session.get(RepairOrder, repair_id)
    if not repair or not _visible(repair, user):
        raise AppError("RESOURCE_NOT_FOUND", 404, "报修不存在")
    return repair


def list_repairs(session: Session, user: AppUser, status: str | None = None) -> list[dict]:
    rows = session.scalars(select(RepairOrder).where(RepairOrder.community_id == user.community_id).order_by(RepairOrder.created_at.desc())).all()
    return [repair_view(session, row) for row in rows if _visible(row, user) and (not status or row.status == status)]


def create_repair(session: Session, user: AppUser, house_id: int, category: str, description: str, priority: str) -> dict:
    relation = session.scalar(
        select(ResidentHouse)
        .join(House, ResidentHouse.house_id == House.id)
        .where(
            ResidentHouse.user_id == user.id,
            ResidentHouse.house_id == house_id,
            House.community_id == user.community_id,
        )
    )
    if user.role != "OWNER" or relation is None:
        raise AppError("FORBIDDEN", 403, "只能为自己的房屋提交报修")
    now = datetime.now(UTC)
    repair = RepairOrder(community_id=user.community_id, house_id=house_id, creator_id=user.id, category=category, description=description, priority=priority, status="SUBMITTED", created_at=now, updated_at=now)
    session.add(repair)
    session.flush()
    session.add(RepairEvent(community_id=user.community_id, repair_id=repair.id, actor_id=user.id, action="CREATE", from_status=None, to_status="SUBMITTED", note="业主提交报修", created_at=now, updated_at=now))
    session.commit()
    return repair_view(session, repair)


def _transition(session: Session, repair: RepairOrder, user: AppUser, to_status: str, action: str, note: str) -> None:
    if to_status not in ALLOWED.get(repair.status, set()):
        raise AppError("REPAIR_INVALID_TRANSITION", 409, "当前状态不允许此操作")
    previous = repair.status
    repair.status = to_status
    repair.updated_at = datetime.now(UTC)
    session.add(RepairEvent(community_id=repair.community_id, repair_id=repair.id, actor_id=user.id, action=action, from_status=previous, to_status=to_status, note=note, created_at=repair.updated_at, updated_at=repair.updated_at))


def assign_repair(session: Session, user: AppUser, repair_id: int, assignee_id: int) -> dict:
    repair = get_repair(session, user, repair_id)
    assignee = session.get(AppUser, assignee_id)
    if user.role != "PROPERTY" or not assignee or assignee.role != "MAINTENANCE" or assignee.community_id != user.community_id:
        raise AppError("FORBIDDEN", 403, "只能派给本社区维修人员")
    repair.assignee_id = assignee.id
    _transition(session, repair, user, "ASSIGNED", "ASSIGN", f"已指派给{assignee.display_name}")
    session.commit()
    return repair_view(session, repair)


def action_repair(session: Session, user: AppUser, repair_id: int, action: str, note: str = "", rating: int | None = None, comment: str = "") -> dict:
    repair = get_repair(session, user, repair_id)
    config = {
        "start": ("MAINTENANCE", "IN_PROGRESS", "START", "维修人员开始处理"),
        "complete": ("MAINTENANCE", "COMPLETED", "COMPLETE", note or "维修完成"),
        "confirm": ("OWNER", "CONFIRMED", "CONFIRM", "业主确认完成"),
        "rate": ("OWNER", "RATED", "RATE", "业主完成评价"),
        "cancel": ("OWNER", "CANCELLED", "CANCEL", "业主取消报修"),
    }
    expected_role, to_status, event_action, event_note = config[action]
    if user.role != expected_role:
        raise AppError("FORBIDDEN", 403, "无权执行此操作")
    if user.role == "MAINTENANCE" and repair.assignee_id != user.id:
        raise AppError("FORBIDDEN", 403, "该工单未指派给当前维修人员")
    _transition(session, repair, user, to_status, event_action, event_note)
    if action == "rate":
        repair.rating = rating
        repair.rating_comment = comment
    session.commit()
    return repair_view(session, repair)
