from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session, aliased

from app.core.time_utils import utc_isoformat
from app.models.entities import AppUser, Bill, Community, House, Notice, ParkingReservation, ParkingSpace, RepairOrder, ResidentHouse


DESTINATIONS = {
    "repairs": {"label": "报修工单", "path": "/app/repairs"},
    "bills": {"label": "生活缴费", "path": "/app/bills"},
    "parking": {"label": "车位预约", "path": "/app/parking"},
    "notices": {"label": "社区公告", "path": "/app/notices"},
    "progress": {"label": "我的进度", "path": "/app/progress"},
    "profile": {"label": "个人信息", "path": "/app/profile"},
}
SOURCE_LABELS = {"guide": "功能说明", "houses": "我的房屋", "bills": "我的账单", "repairs": "我的报修", "parking": "我的预约", "notices": "已发布公告"}
STATUS_LABELS = {
    "SUBMITTED": "待派单", "ASSIGNED": "已指派", "IN_PROGRESS": "处理中", "COMPLETED": "待业主确认",
    "CONFIRMED": "待评价", "RATED": "已完成", "CANCELLED": "已取消", "PENDING": "待审批",
    "ACTIVE": "已通过", "REJECTED": "已驳回", "PAID": "已缴", "UNPAID": "待缴",
}
FEATURE_GUIDE = [
    {"feature": "repairs", "instructions": "报修工单中提交报修，选择本人的房屋、类型、优先级并填写描述，可使用AI整理。物业派单后由维修人员处理。维修完成后业主确认并评价。仅待派单和已指派状态可由业主取消。"},
    {"feature": "bills", "instructions": "生活缴费中查看待缴和已缴账单，核对房屋、费项、账期及金额。在账单详情打开确认缴费，再确认模拟缴费。系统不发生真实资金扣款；收费单价、逾期规则未配置，不得自行编造。"},
    {"feature": "parking", "instructions": "车位预约先选日期、时段和区域，在平面图点击空闲车位，可填写车牌并提交申请。待审批期间暂占时段，物业通过后生效，驳回或取消后释放。已占用和停用位置不可选，状态每3秒更新。图为编号示意，不是传感器实时检测。"},
    {"feature": "notices", "instructions": "消息中查看本社区已发布公告。业主不能查看物业草稿，不能发布或撤回公告。实际活动、维护安排只能依据公告正文，日期含相对措辞时结合发布时间谨慎解释。"},
    {"feature": "progress", "instructions": "我的进度按报修和车位预约查看当前状态。停车审批意见可在我的预约记录查看；助手不会代替用户取消或提交业务。"},
    {"feature": "profile", "instructions": "我的页面查看当前身份和房屋信息。当前系统未提供公开物业联系电话、在线客服派单、门禁设备、退款或紧急呼叫功能。需要未知信息时请联系物业，不编造号码或服务承诺。"},
]


def _counts(session: Session, model, conditions: list) -> dict:
    return {STATUS_LABELS.get(status, status): count for status, count in session.execute(
        select(model.status, func.count()).where(*conditions).group_by(model.status)
    )}


def build_assistant_context(session: Session, user: AppUser) -> dict:
    community = session.get(Community, user.community_id)
    houses = session.scalars(select(House).join(ResidentHouse, and_(
        ResidentHouse.house_id == House.id, ResidentHouse.community_id == House.community_id,
    )).where(ResidentHouse.user_id == user.id, House.community_id == user.community_id).order_by(House.id)).all()
    house_labels = {house.id: f"{house.building} {house.unit_name} {house.room_no}" for house in houses}
    bill_scope = [Bill.community_id == user.community_id, Bill.house_id.in_(house_labels)]
    bill_totals = session.execute(select(Bill.status, func.count(), func.sum(Bill.amount)).where(*bill_scope).group_by(Bill.status)).all()
    bills = session.scalars(select(Bill).where(*bill_scope).order_by(Bill.status.desc(), Bill.period.desc(), Bill.id.desc()).limit(24)).all()
    repair_scope = [RepairOrder.community_id == user.community_id, RepairOrder.creator_id == user.id]
    staff = aliased(AppUser)
    repairs = session.execute(select(RepairOrder, staff.display_name).outerjoin(staff, and_(
        staff.id == RepairOrder.assignee_id, staff.community_id == RepairOrder.community_id,
    )).where(*repair_scope).order_by(RepairOrder.updated_at.desc(), RepairOrder.id.desc()).limit(20)).all()
    parking_scope = [ParkingReservation.community_id == user.community_id, ParkingReservation.user_id == user.id]
    parking = session.execute(select(ParkingReservation, ParkingSpace).join(ParkingSpace, and_(
        ParkingSpace.id == ParkingReservation.parking_space_id, ParkingSpace.community_id == ParkingReservation.community_id,
    )).where(*parking_scope).order_by(ParkingReservation.booking_date.desc(), ParkingReservation.id.desc()).limit(16)).all()
    notices = session.scalars(select(Notice).where(
        Notice.community_id == user.community_id, Notice.status == "PUBLISHED",
    ).order_by(Notice.published_at.desc(), Notice.id.desc()).limit(8)).all()
    return {
        "asOf": utc_isoformat(datetime.now(UTC)), "timeZone": "Asia/Shanghai",
        "community": {"name": community.name, "address": community.address} if community else None,
        "houses": [{"label": label, "area": str(house.area)} for house, label in ((house, house_labels[house.id]) for house in houses)],
        "bills": {
            "totals": {STATUS_LABELS.get(status, status): {"count": count, "amount": f"{Decimal(amount or 0):.2f}"} for status, count, amount in bill_totals},
            "recordsLimit": 24,
            "records": [{"id": bill.id, "house": house_labels[bill.house_id], "type": bill.bill_type, "period": bill.period, "amount": f"{bill.amount:.2f}", "status": STATUS_LABELS.get(bill.status, bill.status)} for bill in bills],
        },
        "repairs": {
            "counts": _counts(session, RepairOrder, repair_scope), "recordsLimit": 20,
            "records": [{"id": item.id, "house": house_labels.get(item.house_id), "category": item.category, "description": item.description, "status": STATUS_LABELS.get(item.status, item.status), "priority": item.priority, "assignee": name, "updatedAt": utc_isoformat(item.updated_at)} for item, name in repairs],
        },
        "parking": {
            "counts": _counts(session, ParkingReservation, parking_scope), "recordsLimit": 16,
            "records": [{"id": item.id, "space": space.space_no, "area": space.area_name, "date": item.booking_date.isoformat(), "start": item.start_time.isoformat(timespec="minutes"), "end": item.end_time.isoformat(timespec="minutes"), "status": STATUS_LABELS.get(item.status, item.status), "reviewNote": item.review_note} for item, space in parking],
        },
        "notices": [{"id": item.id, "title": item.title, "content": item.content[:1800], "publishedAt": utc_isoformat(item.published_at)} for item in notices],
    }
