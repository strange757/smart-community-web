from collections.abc import Generator
from enum import StrEnum

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import decode_token
from app.models.entities import AppUser


class Role(StrEnum):
    OWNER = "OWNER"
    PROPERTY = "PROPERTY"
    MAINTENANCE = "MAINTENANCE"


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_session(request: Request) -> Generator[Session, None, None]:
    with request.app.state.session_factory() as session:
        yield session


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> AppUser:
    if not token:
        raise AppError("AUTH_REQUIRED", 401, "请先登录")
    try:
        payload = decode_token(token, request.app.state.settings.jwt_secret)
        user = session.get(AppUser, int(payload["sub"]))
    except Exception as exc:
        raise AppError("AUTH_EXPIRED", 401, "登录已过期，请重新登录") from exc
    if not user or not user.enabled:
        raise AppError("AUTH_INVALID", 401, "账号不可用")
    return user


def require_roles(*roles: Role):
    allowed = {role.value for role in roles}

    def dependency(user: AppUser = Depends(get_current_user)) -> AppUser:
        if user.role not in allowed:
            raise AppError("FORBIDDEN", 403, "无权执行此操作")
        return user

    return dependency
