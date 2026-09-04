from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import Role, get_current_user, get_session, require_roles
from app.api.v1.auth import envelope
from app.models.entities import AppUser
from app.schemas.repairs import RepairAssign, RepairComplete, RepairCreate, RepairRate
from app.services.repair_service import action_repair, assign_repair, create_repair, get_repair, list_repairs, repair_view

router = APIRouter(prefix="/api/v1/repairs", tags=["repairs"])


@router.get("")
def repairs(request: Request, status_filter: str | None = None, status: str | None = None, user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return envelope(request, list_repairs(session, user, status or status_filter))


@router.post("", status_code=status.HTTP_201_CREATED)
def create(body: RepairCreate, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, create_repair(session, user, body.house_id, body.category, body.description, body.priority))


@router.get("/{repair_id}")
def detail(repair_id: int, request: Request, user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return envelope(request, repair_view(session, get_repair(session, user, repair_id)))


@router.post("/{repair_id}/assign")
def assign(repair_id: int, body: RepairAssign, request: Request, user: AppUser = Depends(require_roles(Role.PROPERTY)), session: Session = Depends(get_session)):
    return envelope(request, assign_repair(session, user, repair_id, body.assignee_id))


@router.post("/{repair_id}/start")
def start(repair_id: int, request: Request, user: AppUser = Depends(require_roles(Role.MAINTENANCE)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "start"))


@router.post("/{repair_id}/complete")
def complete(repair_id: int, request: Request, body: RepairComplete | None = None, user: AppUser = Depends(require_roles(Role.MAINTENANCE)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "complete", note=body.note if body else ""))


@router.post("/{repair_id}/confirm")
def confirm(repair_id: int, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "confirm"))


@router.post("/{repair_id}/rate")
def rate(repair_id: int, body: RepairRate, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "rate", rating=body.rating, comment=body.comment))


@router.post("/{repair_id}/cancel")
def cancel(repair_id: int, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "cancel"))
