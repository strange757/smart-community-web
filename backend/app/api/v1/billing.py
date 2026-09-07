from typing import Literal

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies import Role, get_session, require_roles
from app.api.v1.auth import envelope
from app.models.entities import AppUser
from app.services.billing_service import list_bills, pay_bill
from app.services.community_billing_service import list_community_bills

router = APIRouter(prefix="/api/v1/bills", tags=["billing"])


@router.get("/community")
def community_bills(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, alias="pageSize", ge=1, le=100),
    status: Literal["UNPAID", "PAID"] | None = None,
    bill_type: str | None = Query(default=None, alias="billType", max_length=40),
    period: str | None = Query(default=None, max_length=20),
    search: str | None = Query(default=None, max_length=160),
    user: AppUser = Depends(require_roles(Role.PROPERTY)),
    session: Session = Depends(get_session),
):
    return envelope(request, list_community_bills(
        session, user, page=page, page_size=page_size, status=status,
        bill_type=bill_type, period=period, search=search,
    ))


@router.get("")
def bills(request: Request, status: str | None = None, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, list_bills(session, user, status))


@router.post("/{bill_id}/simulate-payment")
def payment(bill_id: int, request: Request, idempotency_key: str = Header(default="", alias="Idempotency-Key"), user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, pay_bill(session, user, bill_id, idempotency_key))
