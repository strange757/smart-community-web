from datetime import UTC, datetime, timedelta, timezone

from app.models.entities import Bill, Notice, RepairEvent, RepairOrder
from app.services.notice_service import notice_view

from .conftest import login


def test_api_timestamps_from_sqlite_are_explicit_utc(client):
    near_midnight_utc = datetime(2026, 9, 3, 16, 30)
    with client.app.state.session_factory() as session:
        notice = session.get(Notice, 1)
        repair = session.get(RepairOrder, 1)
        repair_event = session.get(RepairEvent, 1)
        paid_bill = session.get(Bill, 2)
        assert notice and repair and repair_event and paid_bill
        notice.published_at = near_midnight_utc
        repair.created_at = near_midnight_utc
        repair.updated_at = near_midnight_utc
        repair_event.created_at = near_midnight_utc
        paid_bill.paid_at = near_midnight_utc
        session.commit()

    owner = login(client, "owner")
    notices = client.get("/api/v1/notices", headers=owner).json()["data"]
    repair = client.get("/api/v1/repairs/1", headers=owner).json()["data"]
    paid_bills = client.get("/api/v1/bills?status=PAID", headers=owner).json()["data"]
    payment = client.post(
        "/api/v1/bills/1/simulate-payment",
        headers={**owner, "Idempotency-Key": "timestamp-payment"},
    ).json()["data"]

    assert next(item for item in notices if item["id"] == 1)["publishedAt"] == "2026-09-03T16:30:00Z"
    assert repair["createdAt"] == "2026-09-03T16:30:00Z"
    assert repair["events"][0]["createdAt"] == "2026-09-03T16:30:00Z"
    assert next(item for item in paid_bills if item["id"] == 2)["paidAt"] == "2026-09-03T16:30:00Z"
    assert payment["paidAt"].endswith("Z")


def test_offset_timestamp_is_converted_to_utc_instead_of_relabelled():
    china_time = datetime(2026, 9, 4, 0, 30, tzinfo=timezone(timedelta(hours=8)))
    notice = Notice(
        id=99,
        community_id=1,
        title="跨日公告",
        content="测试",
        status="PUBLISHED",
        publisher_id=2,
        published_at=china_time,
        created_at=datetime.now(UTC),
    )

    assert notice_view(notice)["publishedAt"] == "2026-09-03T16:30:00Z"
