from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models.entities import AppUser, Bill, House, ResidentHouse
from app.services.billing_service import bill_view


def list_community_bills(
    session: Session,
    user: AppUser,
    *,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    bill_type: str | None = None,
    period: str | None = None,
    search: str | None = None,
) -> dict:
    if user.role != "PROPERTY":
        raise AppError("FORBIDDEN", 403, "只有物业可以查看社区账单")

    query = select(Bill, House).join(
        House, and_(House.id == Bill.house_id, House.community_id == Bill.community_id)
    ).where(Bill.community_id == user.community_id)
    if status:
        query = query.where(Bill.status == status)
    if bill_type:
        query = query.where(Bill.bill_type == bill_type)
    if period:
        query = query.where(Bill.period == period)
    if search and search.strip():
        term = search.strip()
        owner_match = select(ResidentHouse.id).join(
            AppUser,
            and_(AppUser.id == ResidentHouse.user_id, AppUser.community_id == ResidentHouse.community_id),
        ).where(
            ResidentHouse.house_id == Bill.house_id,
            ResidentHouse.community_id == user.community_id,
            AppUser.role == "OWNER",
            AppUser.display_name.icontains(term, autoescape=True),
        ).exists()
        house_label = House.building + " " + House.unit_name + " " + House.room_no
        query = query.where(or_(house_label.icontains(term, autoescape=True), owner_match))

    # Aggregate the bill/house relation before loading its multiple resident links.
    total, unpaid_amount, paid_amount, unpaid_count, paid_count = session.execute(
        query.with_only_columns(
            func.count(Bill.id),
            func.coalesce(func.sum(case((Bill.status == "UNPAID", Bill.amount), else_=0)), 0),
            func.coalesce(func.sum(case((Bill.status == "PAID", Bill.amount), else_=0)), 0),
            func.coalesce(func.sum(case((Bill.status == "UNPAID", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Bill.status == "PAID", 1), else_=0)), 0),
        )
    ).one()
    rows = session.execute(
        query.order_by(Bill.period.desc(), Bill.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    house_ids = {bill.house_id for bill, _house in rows}
    owners: dict[int, list[str]] = {}
    if house_ids:
        residents = session.execute(
            select(ResidentHouse.house_id, AppUser.display_name).join(
                AppUser,
                and_(AppUser.id == ResidentHouse.user_id, AppUser.community_id == ResidentHouse.community_id),
            ).where(
                ResidentHouse.community_id == user.community_id,
                ResidentHouse.house_id.in_(house_ids),
                AppUser.role == "OWNER",
            ).order_by(AppUser.id)
        ).all()
        for house_id, name in residents:
            owners.setdefault(house_id, []).append(name)

    community_bills = select(Bill).where(Bill.community_id == user.community_id)
    return {
        "items": [
            {
                **bill_view(bill),
                "houseLabel": f"{house.building} {house.unit_name} {house.room_no}",
                "ownerName": "、".join(owners.get(bill.house_id, [])) or "未关联住户",
            }
            for bill, house in rows
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "summary": {
            "unpaidAmount": f"{unpaid_amount:.2f}",
            "paidAmount": f"{paid_amount:.2f}",
            "unpaidCount": unpaid_count,
            "paidCount": paid_count,
        },
        "types": list(session.scalars(community_bills.with_only_columns(Bill.bill_type).distinct().order_by(Bill.bill_type))),
        "periods": list(session.scalars(community_bills.with_only_columns(Bill.period).distinct().order_by(Bill.period.desc()))),
    }
