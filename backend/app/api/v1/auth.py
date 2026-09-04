from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import Role, get_current_user, get_session, require_roles
from app.core.errors import AppError
from app.core.security import create_token, verify_password
from app.models.entities import AppUser, House, ResidentHouse
from app.schemas.auth import LoginRequest

router = APIRouter(prefix="/api/v1", tags=["auth"])


def envelope(request: Request, data):
    return {"data": data, "requestId": request.state.request_id}


def user_view(user: AppUser) -> dict:
    return {"id": user.id, "displayName": user.display_name, "role": user.role, "communityId": user.community_id}


@router.post("/auth/login")
def login(body: LoginRequest, request: Request, session: Session = Depends(get_session)):
    user = session.scalar(select(AppUser).where(AppUser.username == body.username))
    if not user or not user.enabled or not verify_password(body.password, user.password_hash):
        raise AppError("AUTH_INVALID", 401, "账号或密码错误")
    settings = request.app.state.settings
    token = create_token(user.id, user.community_id, user.role, settings.jwt_secret, settings.jwt_hours)
    return envelope(request, {"token": token, "expiresInSeconds": settings.jwt_hours * 3600, **user_view(user)})


@router.get("/me")
def me(request: Request, user: AppUser = Depends(get_current_user)):
    return envelope(request, user_view(user))


@router.get("/me/houses")
def houses(request: Request, user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)):
    rows = session.execute(
        select(House).join(ResidentHouse, ResidentHouse.house_id == House.id).where(ResidentHouse.user_id == user.id)
    ).scalars().all()
    return envelope(request, [{"id": h.id, "communityId": h.community_id, "building": h.building, "unit": h.unit_name, "roomNo": h.room_no, "area": str(h.area)} for h in rows])


@router.get("/users")
def users(
    request: Request,
    role: Role,
    current: AppUser = Depends(require_roles(Role.PROPERTY)),
    session: Session = Depends(get_session),
):
    rows = session.scalars(select(AppUser).where(AppUser.community_id == current.community_id, AppUser.role == role.value, AppUser.enabled.is_(True))).all()
    return envelope(request, [{"id": u.id, "displayName": u.display_name, "role": u.role} for u in rows])
