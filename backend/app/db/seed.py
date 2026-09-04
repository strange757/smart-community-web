from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.entities import AppUser, Bill, Community, House, Notice, ParkingSpace, RepairEvent, RepairOrder, ResidentHouse


def seed_database(session: Session) -> None:
    if session.scalar(select(Community.id).limit(1)) is not None:
        return
    now = datetime.now(UTC)
    session.add(Community(id=1, name="和邻社区", address="滨河路 18 号"))
    session.add_all(
        [
            AppUser(id=1, community_id=1, username="owner", password_hash=hash_password("123456"), display_name="张三", role="OWNER", enabled=True),
            AppUser(id=2, community_id=1, username="property", password_hash=hash_password("123456"), display_name="林管家", role="PROPERTY", enabled=True),
            AppUser(id=3, community_id=1, username="maintenance", password_hash=hash_password("123456"), display_name="陈师傅", role="MAINTENANCE", enabled=True),
        ]
    )
    session.add_all(
        [
            House(id=1, community_id=1, building="1号楼", unit_name="1单元", room_no="101", area=Decimal("89.50")),
            House(id=2, community_id=1, building="2号楼", unit_name="2单元", room_no="1202", area=Decimal("118.00")),
            ResidentHouse(id=1, user_id=1, house_id=1, relation_type="OWNER"),
        ]
    )
    session.add_all(
        [
            Notice(id=1, community_id=1, title="周六邻里花园开放", content="本周六上午九点，邻里花园开放春季种植活动。", status="PUBLISHED", publisher_id=2, published_at=now, created_at=now),
            Notice(id=2, community_id=1, title="1号楼电梯维护", content="今晚十点至十一点进行例行维护，请提前安排出行。", status="PUBLISHED", publisher_id=2, published_at=now, created_at=now),
            Notice(id=3, community_id=1, title="内部排期草案", content="物业内部草稿。", status="DRAFT", publisher_id=2, published_at=None, created_at=now),
        ]
    )
    repair = RepairOrder(id=1, community_id=1, house_id=1, creator_id=1, category="公共设施", description="楼道感应灯偶尔不亮", priority="NORMAL", status="SUBMITTED", created_at=now, updated_at=now)
    session.add(repair)
    session.add(RepairEvent(id=1, repair_id=1, actor_id=1, action="CREATE", from_status=None, to_status="SUBMITTED", note="业主提交报修", created_at=now))
    session.add_all(
        [
            Bill(id=1, community_id=1, house_id=1, bill_type="物业服务费", period="2026-09", amount=Decimal("268.00"), status="UNPAID"),
            Bill(id=2, community_id=1, house_id=1, bill_type="停车管理费", period="2026-08", amount=Decimal("120.00"), status="PAID", paid_at=now),
        ]
    )
    session.add_all([ParkingSpace(id=i, community_id=1, space_no=f"A-{i:02d}", area_name="A区", enabled=True) for i in range(1, 5)])
    session.commit()
