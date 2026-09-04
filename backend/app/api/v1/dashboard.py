from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies import Role, get_session, require_roles
from app.api.v1.auth import envelope
from app.models.entities import AppUser
from app.services.dashboard_service import dashboard_summary

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(request: Request, user: AppUser = Depends(require_roles(Role.PROPERTY)), session: Session = Depends(get_session)):
    return envelope(request, dashboard_summary(session, user.community_id))
