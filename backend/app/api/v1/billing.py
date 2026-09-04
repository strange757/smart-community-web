from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.api.dependencies import Role, get_session, require_roles
from app.api.v1.auth import envelope
from app.models.entities import AppUser
from app.services.billing_service import list_bills, pay_bill

router = APIRouter(prefix="/api/v1/bills", tags=["billing"])


@router.get("")
def bills(request: Request, status: str | None = None, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, list_bills(session, user, status))


@router.post("/{bill_id}/simulate-payment")
def payment(bill_id: int, request: Request, idempotency_key: str = Header(default="", alias="Idempotency-Key"), user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, pay_bill(session, user, bill_id, idempotency_key))
