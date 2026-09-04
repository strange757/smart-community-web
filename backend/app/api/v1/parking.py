from datetime import date, time

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import Role, get_current_user, get_session, require_roles
from app.api.v1.auth import envelope
from app.models.entities import AppUser
from app.schemas.parking import ReservationCreate
from app.services.parking_service import cancel_reservation, create_reservation, list_mine, list_spaces

router = APIRouter(prefix="/api/v1/parking", tags=["parking"])


@router.get("/spaces")
def spaces(request: Request, date_value: date | None = None, date: date | None = None, start: time | None = None, end: time | None = None, user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return envelope(request, list_spaces(session, user, date or date_value, start, end))


@router.post("/reservations", status_code=status.HTTP_201_CREATED)
def reserve(body: ReservationCreate, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, create_reservation(session, user, body.parking_space_id, body.date, body.start, body.end))


@router.get("/reservations/mine")
def mine(request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, list_mine(session, user))


@router.post("/reservations/{reservation_id}/cancel")
def cancel(reservation_id: int, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, cancel_reservation(session, user, reservation_id))
