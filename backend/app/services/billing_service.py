from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.time_utils import utc_isoformat
from app.models.entities import AppUser, Bill, PaymentRecord, ResidentHouse


def bill_view(bill: Bill) -> dict:
    return {"id": bill.id, "type": bill.bill_type, "period": bill.period, "amount": f"{bill.amount:.2f}", "status": bill.status, "paidAt": utc_isoformat(bill.paid_at)}


def payment_view(payment: PaymentRecord) -> dict:
    return {"billId": payment.bill_id, "amount": f"{payment.amount:.2f}", "status": "PAID", "paymentRef": payment.payment_ref, "paidAt": utc_isoformat(payment.paid_at)}


def list_bills(session: Session, user: AppUser, status: str | None = None) -> list[dict]:
    if user.role != "OWNER":
        raise AppError("FORBIDDEN", 403, "只有业主可以查看个人账单")
    house_ids = select(ResidentHouse.house_id).where(ResidentHouse.user_id == user.id)
    query = select(Bill).where(Bill.community_id == user.community_id, Bill.house_id.in_(house_ids))
    if status:
        query = query.where(Bill.status == status)
    return [bill_view(item) for item in session.scalars(query.order_by(Bill.status.desc(), Bill.period.desc())).all()]


def pay_bill(session: Session, user: AppUser, bill_id: int, key: str) -> dict:
    if user.role != "OWNER":
        raise AppError("FORBIDDEN", 403, "只有业主可以缴费")
    if not key:
        raise AppError("VALIDATION_ERROR", 422, "缺少 Idempotency-Key")

    # SQLite has no row-level locks, so acquire its writer lock before reading bill state.
    if session.get_bind().dialect.name == "sqlite":
        session.execute(text("BEGIN IMMEDIATE"))

    bill = session.scalar(select(Bill).where(Bill.id == bill_id).with_for_update())
    relation = session.scalar(select(ResidentHouse).where(ResidentHouse.user_id == user.id, ResidentHouse.house_id == bill.house_id if bill else False))
    if not bill or bill.community_id != user.community_id or not relation:
        raise AppError("RESOURCE_NOT_FOUND", 404, "账单不存在")
    previous = session.scalar(select(PaymentRecord).where(PaymentRecord.idempotency_key == key))
    if previous:
        if previous.bill_id != bill.id or previous.payer_id != user.id or previous.community_id != user.community_id:
            raise AppError("IDEMPOTENCY_KEY_CONFLICT", 409, "幂等键已用于另一笔缴费")
        return payment_view(previous)
    if bill.status == "PAID":
        raise AppError("BILL_ALREADY_PAID", 409, "账单已经缴费")
    now = datetime.now(UTC)
    payment = PaymentRecord(community_id=user.community_id, bill_id=bill.id, payer_id=user.id, amount=bill.amount, idempotency_key=key, payment_ref=f"DEMO-{uuid4().hex[:10].upper()}", paid_at=now)
    bill.status = "PAID"
    bill.paid_at = now
    session.add(payment)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        previous = session.scalar(
            select(PaymentRecord).where(PaymentRecord.idempotency_key == key)
        )
        if previous:
            if previous.bill_id != bill_id or previous.payer_id != user.id or previous.community_id != user.community_id:
                raise AppError("IDEMPOTENCY_KEY_CONFLICT", 409, "幂等键已用于另一笔缴费") from exc
            return payment_view(previous)
        raise
    session.refresh(payment)
    return payment_view(payment)
