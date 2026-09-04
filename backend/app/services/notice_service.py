from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time_utils import utc_isoformat
from app.models.entities import AppUser, Notice


NOTICE_TRANSITIONS = {
    "DRAFT": {"PUBLISHED"},
    "PUBLISHED": {"WITHDRAWN"},
    "WITHDRAWN": set(),
}


def notice_view(notice: Notice) -> dict:
    return {
        "id": notice.id,
        "communityId": notice.community_id,
        "title": notice.title,
        "content": notice.content,
        "status": notice.status,
        "publishedAt": utc_isoformat(notice.published_at),
        "publisherId": notice.publisher_id,
    }


def list_notices(session: Session, user: AppUser) -> list[dict]:
    query = select(Notice).where(Notice.community_id == user.community_id)
    if user.role != "PROPERTY":
        query = query.where(Notice.status == "PUBLISHED")
    rows = session.scalars(query.order_by(Notice.created_at.desc())).all()
    return [notice_view(row) for row in rows]


def create_notice(session: Session, user: AppUser, title: str, content: str) -> dict:
    notice = Notice(community_id=user.community_id, title=title, content=content, status="DRAFT", publisher_id=user.id, created_at=datetime.now(UTC))
    session.add(notice)
    session.commit()
    session.refresh(notice)
    return notice_view(notice)


def change_notice_status(session: Session, user: AppUser, notice_id: int, status: str) -> dict:
    notice = session.get(Notice, notice_id)
    if not notice or notice.community_id != user.community_id:
        raise AppError("RESOURCE_NOT_FOUND", 404, "公告不存在")
    if status not in NOTICE_TRANSITIONS.get(notice.status, set()):
        raise AppError("NOTICE_INVALID_TRANSITION", 409, "当前状态不允许此操作")
    notice.status = status
    if status == "PUBLISHED":
        notice.published_at = datetime.now(UTC)
    session.commit()
    session.refresh(notice)
    return notice_view(notice)
