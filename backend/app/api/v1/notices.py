from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import Role, get_current_user, get_session, require_roles
from app.api.v1.auth import envelope
from app.models.entities import AppUser
from app.schemas.notices import NoticeCreate
from app.services.notice_service import change_notice_status, create_notice, list_notices

router = APIRouter(prefix="/api/v1/notices", tags=["notices"])


@router.get("")
def notices(request: Request, user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return envelope(request, list_notices(session, user))


@router.post("", status_code=status.HTTP_201_CREATED)
def create(body: NoticeCreate, request: Request, user: AppUser = Depends(require_roles(Role.PROPERTY)), session: Session = Depends(get_session)):
    return envelope(request, create_notice(session, user, body.title, body.content))


@router.post("/{notice_id}/publish")
def publish(notice_id: int, request: Request, user: AppUser = Depends(require_roles(Role.PROPERTY)), session: Session = Depends(get_session)):
    return envelope(request, change_notice_status(session, user, notice_id, "PUBLISHED"))


@router.post("/{notice_id}/withdraw")
def withdraw(notice_id: int, request: Request, user: AppUser = Depends(require_roles(Role.PROPERTY)), session: Session = Depends(get_session)):
    return envelope(request, change_notice_status(session, user, notice_id, "WITHDRAWN"))
