"""Opt-in, additive community-scale fixtures, separate from the small test seed."""

from datetime import UTC, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.time_utils import utc_isoformat
from app.models.entities import (
    AppUser, Bill, Community, DemoDataBatch, House, Notice, ParkingReservation, ParkingSpace,
    PaymentRecord, RepairEvent, RepairOrder, ResidentHouse,
)


DEMO_DATA_VERSION = "community-scale-v1"
SHANGHAI = timezone(timedelta(hours=8), name="Asia/Shanghai")
MODELS = (AppUser, House, ResidentHouse, Notice, RepairOrder, RepairEvent,
          Bill, PaymentRecord, ParkingSpace, ParkingReservation)

def _counts(session: Session, community_id: int) -> dict[str, int]:
    return {model.__tablename__: session.scalar(
        select(func.count()).select_from(model).where(model.community_id == community_id)
    ) for model in MODELS}


def _summary(session: Session, community_id: int, owner_id: int, generated_at: datetime,
             before: dict[str, int] | None) -> dict:
    totals = _counts(session, community_id)
    house_ids = select(ResidentHouse.house_id).where(
        ResidentHouse.community_id == community_id, ResidentHouse.user_id == owner_id,
    )
    visible_queries = {
        "houses": select(func.count()).select_from(ResidentHouse).where(
            ResidentHouse.community_id == community_id, ResidentHouse.user_id == owner_id),
        "bills": select(func.count()).select_from(Bill).where(
            Bill.community_id == community_id, Bill.house_id.in_(house_ids)),
        "repairs": select(func.count()).select_from(RepairOrder).where(
            RepairOrder.community_id == community_id, RepairOrder.creator_id == owner_id),
        "reservations": select(func.count()).select_from(ParkingReservation).where(
            ParkingReservation.community_id == community_id, ParkingReservation.user_id == owner_id),
    }
    return {
        "version": DEMO_DATA_VERSION,
        "community_id": community_id,
        "already_populated": before is None,
        "generated_at": utc_isoformat(generated_at),
        "added": {key: total - before[key] if before is not None else 0 for key, total in totals.items()},
        "totals": totals,
        "owner_visible": {"user_id": owner_id, **{key: session.scalar(query) for key, query in visible_queries.items()}},
    }


def _users(session: Session, community_id: int) -> tuple[list[AppUser], list[AppUser], list[AppUser]]:
    existing = session.scalars(select(AppUser).where(
        AppUser.community_id == community_id, AppUser.enabled.is_(True),
    ).order_by(AppUser.id)).all()
    taken = set(session.scalars(select(AppUser.username)).all())
    password_hash = hash_password("123456")
    groups = []
    surnames = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜"
    given_names = ("知远", "清禾", "明悦", "安宁", "景行", "书言", "思齐", "若琳", "嘉禾", "云舟")
    for role, account, target in [("OWNER", "owner", 150), ("PROPERTY", "property", 4), ("MAINTENANCE", "maintenance", 12)]:
        group = sorted((user for user in existing if user.role == role), key=lambda user: (user.username != account, user.id))
        for index in range(target - len(group)):
            stem = f"demo_c{community_id}_{account}_{index + 1:03d}"
            username = stem
            suffix = 1
            while username in taken:
                suffix += 1
                username = f"{stem}_{suffix}"
            taken.add(username)
            name = surnames[index % len(surnames)] + given_names[(index // len(surnames)) % len(given_names)]
            if role == "PROPERTY":
                name += "管家"
            elif role == "MAINTENANCE":
                name += "师傅"
            user = AppUser(community_id=community_id, username=username, password_hash=password_hash,
                           display_name=name, role=role, enabled=True)
            session.add(user)
            group.append(user)
        groups.append(group)
    session.flush()
    return tuple(groups)


def _houses(session: Session, community_id: int, owners: list[AppUser]) -> tuple[list[House], dict[int, int]]:
    houses = list(session.scalars(select(House).where(House.community_id == community_id).order_by(House.id)))
    existing_keys = {(house.building, house.unit_name, house.room_no) for house in houses}
    building_counts = {f"{building}号楼": sum(house.building == f"{building}号楼" for house in houses) for building in range(1, 9)}
    new_houses = []
    for building in range(1, 9):
        building_name = f"{building}号楼"
        for unit in range(1, 3):
            for floor in range(1, 7):
                for room in range(1, 3):
                    key = (building_name, f"{unit}单元", f"{floor}{room:02d}")
                    if building_counts[building_name] >= 24 or key in existing_keys:
                        continue
                    area = (Decimal("76.80"), Decimal("89.50"), Decimal("108.20"), Decimal("118.00"))[(building + unit + room) % 4]
                    house = House(community_id=community_id, building=key[0], unit_name=key[1], room_no=key[2], area=area)
                    session.add(house)
                    new_houses.append(house)
                    building_counts[building_name] += 1
                    existing_keys.add(key)
    session.flush()
    houses.extend(new_houses)
    relations = list(session.scalars(select(ResidentHouse).where(ResidentHouse.community_id == community_id).order_by(ResidentHouse.id)))
    payer_by_house = {relation.house_id: relation.user_id for relation in reversed(relations)}
    primary_owner = owners[0]
    primary_houses = {relation.house_id for relation in relations if relation.user_id == primary_owner.id}
    for house in new_houses + houses:
        if len(primary_houses) >= 3:
            break
        if house.id in payer_by_house:
            continue
        session.add(ResidentHouse(community_id=community_id, user_id=primary_owner.id, house_id=house.id, relation_type="OWNER"))
        payer_by_house[house.id] = primary_owner.id
        primary_houses.add(house.id)
    others = owners[1:] or owners
    index = 0
    for house in houses:
        if house.id not in payer_by_house:
            owner = others[index % len(others)]
            session.add(ResidentHouse(community_id=community_id, user_id=owner.id, house_id=house.id, relation_type="OWNER"))
            payer_by_house[house.id] = owner.id
            index += 1
    session.flush()
    return houses, payer_by_house


def _bills(session: Session, community_id: int, houses: list[House], payer_by_house: dict[int, int],
           owner_id: int, now: datetime) -> None:
    today = now.astimezone(SHANGHAI).date()
    types = ("物业服务费", "水费", "电费", "停车管理费", "公共能耗费", "垃圾清运费")
    existing = {(bill.house_id, bill.bill_type, bill.period) for bill in session.scalars(select(Bill).where(Bill.community_id == community_id))}
    for index, house in enumerate(houses):
        periods = 3 if payer_by_house[house.id] == owner_id else 1
        for offset in range(periods):
            month_index = today.year * 12 + today.month - 1 - offset
            year, month = divmod(month_index, 12)
            period = f"{year:04d}-{month + 1:02d}"
            created_at = min(datetime(year, month + 1, 1, 9, tzinfo=SHANGHAI).astimezone(UTC), now - timedelta(days=2))
            amounts = (
                house.area * Decimal("3.00"), Decimal(18 + index % 28) * Decimal("4.20"),
                Decimal(96 + index * 17 % 520) * Decimal("0.58"), Decimal(100 + index % 4 * 20),
                Decimal("12.50") + Decimal(index % 17) * Decimal("0.70"), Decimal("15.00"),
            )
            for type_index, bill_type in enumerate(types):
                if (house.id, bill_type, period) in existing:
                    continue
                paid = (index + type_index + offset) % 3 != 0
                paid_at = min(created_at + timedelta(days=2 + index % 9, hours=type_index), now - timedelta(hours=1)) if paid else None
                bill = Bill(community_id=community_id, house_id=house.id, bill_type=bill_type, period=period,
                            amount=amounts[type_index].quantize(Decimal("0.01")), status="PAID" if paid else "UNPAID",
                            paid_at=paid_at, created_at=created_at, updated_at=paid_at or created_at)
                session.add(bill)
                session.flush()
                if paid:
                    reference = f"{DEMO_DATA_VERSION}:c{community_id}:bill:{bill.id}"
                    session.add(PaymentRecord(community_id=community_id, bill_id=bill.id,
                        payer_id=payer_by_house[house.id], amount=bill.amount, idempotency_key=reference,
                        payment_ref=f"DEMO-{community_id}-{bill.id:06d}", paid_at=paid_at,
                        created_at=paid_at, updated_at=paid_at))


def _repairs(session: Session, community_id: int, houses: list[House], payer_by_house: dict[int, int],
             owners: list[AppUser], properties: list[AppUser], maintenance: list[AppUser], now: datetime) -> None:
    topics = (
        ("水电维修", "厨房水龙头关闭后持续滴水，需要检查阀芯"),
        ("公共设施", "楼道感应灯延时过短，晚间经过时照明不足"),
        ("门禁安防", "单元门门禁刷卡响应较慢，偶尔无法开门"),
        ("电梯维护", "电梯到站提示音异常，请检查扬声器与控制模块"),
        ("环境卫生", "公共走廊排水口积水，请安排清理"),
        ("水电维修", "卫生间地漏排水缓慢，请检查管道"),
        ("公共设施", "阳台窗户把手松动，需要重新紧固"),
        ("门禁安防", "地下车库道闸识别后抬杆延迟"),
        ("绿化养护", "楼下绿化喷灌接头漏水，地面持续积水"),
        ("公共设施", "楼梯扶手固定件松动，存在使用隐患"),
        ("水电维修", "客厅插座面板发热，申请排查线路"),
        ("环境卫生", "垃圾分类点冲洗水管接口渗漏"),
    )
    statuses = ("SUBMITTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED", "RATED", "CANCELLED")
    primary_houses = [house for house in houses if payer_by_house[house.id] == owners[0].id]
    count = max(199, 200 - session.scalar(select(func.count()).select_from(RepairOrder).where(RepairOrder.community_id == community_id)))
    for index in range(count):
        house = primary_houses[index % len(primary_houses)] if index < 14 else houses[(index * 17) % len(houses)]
        creator_id = payer_by_house[house.id]
        status = statuses[index % len(statuses)]
        assignee = maintenance[0] if index < 14 else maintenance[(index // len(statuses)) % len(maintenance)]
        manager = properties[index % len(properties)]
        category, description = topics[index % len(topics)]
        created_at = now - timedelta(days=2 + index % 45, hours=index % 6)
        repair = RepairOrder(community_id=community_id, house_id=house.id, creator_id=creator_id,
            assignee_id=None if status == "SUBMITTED" else assignee.id,
            category=category, description=f"{house.building}{house.unit_name}{house.room_no}：{description}",
            priority=("NORMAL", "NORMAL", "URGENT")[index % 3], status=status,
            rating=3 + index % 3 if status == "RATED" else None,
            rating_comment=("处理及时，现场已清理", "故障已解决，建议加强日常巡检", "沟通清楚，维修效果满意")[index % 3] if status == "RATED" else None,
            created_at=created_at, updated_at=created_at)
        session.add(repair)
        session.flush()
        stages = [("CREATE", None, "SUBMITTED", creator_id, "业主提交报修，已登记现场情况")]
        if status != "SUBMITTED":
            stages.append(("ASSIGN", "SUBMITTED", "ASSIGNED", manager.id, f"已指派给{assignee.display_name}"))
        if status == "CANCELLED":
            stages.append(("CANCEL", "ASSIGNED", "CANCELLED", creator_id, "业主调整上门计划，取消本次报修"))
        elif status != "SUBMITTED":
            for target, action, actor, note in [
                ("IN_PROGRESS", "START", assignee.id, "已到场排查，正在检修"),
                ("COMPLETED", "COMPLETE", assignee.id, "故障处理完成，已进行现场功能测试"),
                ("CONFIRMED", "CONFIRM", creator_id, "业主确认故障已解决"),
                ("RATED", "RATE", creator_id, "业主完成服务评价"),
            ]:
                if stages[-1][2] == status:
                    break
                stages.append((action, stages[-1][2], target, actor, note))
        for step, (action, previous, target, actor_id, note) in enumerate(stages):
            at = created_at + timedelta(hours=step * 2)
            session.add(RepairEvent(community_id=community_id, repair_id=repair.id, actor_id=actor_id,
                action=action, from_status=previous, to_status=target, note=note, created_at=at, updated_at=at))
            repair.updated_at = at


def _parking(session: Session, community_id: int, owners: list[AppUser], properties: list[AppUser], now: datetime) -> None:
    spaces = list(session.scalars(select(ParkingSpace).where(ParkingSpace.community_id == community_id).order_by(ParkingSpace.space_no)))
    known = {space.space_no for space in spaces}
    for zone in "ABCD":
        for index in range(1, 25):
            space_no = f"{zone}-{index:02d}"
            if space_no in known:
                continue
            space = ParkingSpace(community_id=community_id, space_no=space_no, area_name=f"{zone}区",
                                 enabled=not (zone in "CD" and index >= 23))
            session.add(space)
            spaces.append(space)
    session.flush()
    available = sorted((space for space in spaces if space.enabled), key=lambda space: space.space_no)
    blocking = list(session.scalars(select(ParkingReservation).where(
        ParkingReservation.community_id == community_id, ParkingReservation.status.in_(("PENDING", "ACTIVE")),
    )))
    today = now.astimezone(SHANGHAI).date()
    slots = ((time(8), time(12)), (time(13), time(17)), (time(18), time(22)))
    statuses = ("PENDING", "ACTIVE", "REJECTED", "CANCELLED")
    for index in range(80):
        owner = owners[0] if index < 8 else owners[1 + (index - 8) % (len(owners) - 1)]
        booking_date = today + timedelta(days=1 + index % 14)
        start, end = slots[(index // 4) % len(slots)]
        status = statuses[index % len(statuses)]
        # Search other spaces and then days if existing resident bookings occupy a slot.
        while True:
            space = next((candidate for candidate in available[index % len(available):] + available[:index % len(available)]
                if not any(item.parking_space_id == candidate.id and item.booking_date == booking_date
                    and item.start_time < end and item.end_time > start for item in blocking)), None)
            if space is not None:
                break
            booking_date += timedelta(days=1)
        created_at = now - timedelta(hours=1 + index % 72)
        reviewed = status in {"ACTIVE", "REJECTED"}
        reservation = ParkingReservation(community_id=community_id, user_id=owner.id, parking_space_id=space.id,
            booking_date=booking_date, start_time=start, end_time=end, status=status,
            plate_number=f"演示{community_id:02d}{index + 1:04d}",
            review_note=("住户信息已核对，预约通过" if status == "ACTIVE" else "申请材料需补充，请核实车辆信息后重新预约") if reviewed else None,
            reviewed_by=properties[index % len(properties)].id if reviewed else None,
            reviewed_at=created_at + timedelta(minutes=30) if reviewed else None,
            created_at=created_at, updated_at=created_at + timedelta(minutes=30) if status != "PENDING" else created_at)
        session.add(reservation)
        if status in {"PENDING", "ACTIVE"}:
            blocking.append(reservation)


def _notices(session: Session, community_id: int, properties: list[AppUser], now: datetime) -> None:
    topics = (
        ("季度消防设施检查", "本周将对各楼栋消防栓、灭火器和疏散通道进行例行检查，请勿在公共通道堆放物品。"),
        ("二次供水设施清洗", "物业将分楼栋开展水箱清洗消毒，具体时间由楼栋管家提前通知，请住户合理安排用水。"),
        ("车库照明节能改造", "地下车库分区更换照明设备，施工区域设置围挡，进出车辆请按现场指引慢行。"),
        ("中秋邻里活动报名", "社区活动室开放手作与邻里交流活动，住户可向楼栋管家登记参与人数。"),
        ("生活垃圾分类提醒", "请将厨余、可回收物和其他垃圾分类投放，大件废弃物请先联系物业预约清运。"),
        ("电动车集中充电巡检", "物业将巡查集中充电区域的插座、保护开关与消防设备，请规范停放并及时移走已充满车辆。"),
        ("公共绿地养护安排", "本周分片开展草坪修剪与补植，养护区域临时设置提示牌，请住户留意现场安排。"),
        ("便民维修服务日", "服务中心安排集中便民维修受理，可登记门窗、水电与公共设施问题，工作人员将逐项确认。"),
        ("电梯年度检验计划", "各楼栋电梯将错峰开展年度检验，检验期间暂停使用相应电梯，恢复后现场撤除提示。"),
        ("社区阅览室开放安排", "阅览室工作日及周末分时开放，借阅登记请在服务台办理，共同维护安静整洁的阅读环境。"),
        ("雨季排水设施排查", "物业正在检查屋面落水口和地下车库排水沟，发现堵塞或积水可通过报修提交具体位置。"),
        ("访客车辆登记提醒", "访客车辆请提前登记，进入车库后按已预约区域停放，保持消防车道与装卸区域畅通。"),
        ("楼道门窗检修", "维修人员将检查公共楼道门窗合页、闭门器和玻璃固定件，发现松动问题将集中处理。"),
        ("宠物文明饲养倡议", "请住户在公共区域牵引宠物，及时清理排泄物，避免影响邻里正常休息。"),
        ("物业服务意见征集", "本月征集保洁、安保、维修与绿化服务意见，服务中心将汇总诉求并公布后续处理安排。"),
        ("社区应急演练安排", "服务中心将组织消防疏散与应急联络演练，各楼栋联络员按通知时间到场。"),
        ("地下车库地坪修补", "车库局部地坪将分时修补，施工期间使用临时通行路线，请按现场标识绕行。"),
        ("公共能耗账单说明", "本期公共照明、电梯和供水设备能耗费用已核对，住户可到服务中心查阅分摊说明。"),
        ("健身器材安全检查", "活动区健身器材进行紧固与润滑保养，检修标识撤除后可正常使用。"),
        ("快递暂存区整理", "服务中心将整理快递暂存区，住户收到取件提醒后请及时领取，贵重物品请当面签收。"),
        ("楼栋管家值班调整", "服务中心将调整周末值班安排，紧急维修与夜间安保服务保持正常受理。"),
    )
    for index, (title, content) in enumerate(topics):
        status = "DRAFT" if index % 7 == 5 else "WITHDRAWN" if index % 7 == 6 else "PUBLISHED"
        created_at = now - timedelta(days=index + 1, hours=2)
        session.add(Notice(community_id=community_id, title=title, content=content, status=status,
            publisher_id=properties[index % len(properties)].id,
            published_at=created_at + timedelta(hours=1) if status != "DRAFT" else None,
            created_at=created_at, updated_at=created_at + timedelta(hours=2)))


def populate_demo_data(session: Session, community_id: int = 1) -> dict:
    """Commit one synthetic batch for a seeded community; never update existing rows.

    Use a dedicated session. Repeated calls return current counts and add nothing,
    including when users have since changed or deleted generated business data.
    """
    if session.get(Community, community_id) is None:
        raise ValueError(f"Unknown community: {community_id}")
    # Batch identity survives edits to business records and calendar changes.
    batch = session.get(DemoDataBatch, (community_id, DEMO_DATA_VERSION))
    if batch is not None:
        return _summary(session, community_id, batch.summary["owner_id"], batch.created_at, None)
    before = _counts(session, community_id)
    now = datetime.now(UTC)
    try:
        owners, properties, maintenance = _users(session, community_id)
        houses, payer_by_house = _houses(session, community_id, owners)
        _bills(session, community_id, houses, payer_by_house, owners[0].id, now)
        _repairs(session, community_id, houses, payer_by_house, owners, properties, maintenance, now)
        _parking(session, community_id, owners, properties, now)
        _notices(session, community_id, properties, now)
        session.flush()
        session.add(DemoDataBatch(community_id=community_id, version=DEMO_DATA_VERSION,
            summary={"owner_id": owners[0].id, "totals": _counts(session, community_id)},
            created_at=now, updated_at=now))
        session.commit()
    except Exception:
        session.rollback()
        raise
    return _summary(session, community_id, owners[0].id, now, before)
