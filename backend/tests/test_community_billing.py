from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.entities import AppUser, Bill, Community, House, ResidentHouse

from .conftest import login


@pytest.fixture
def community_billing(client):
    with client.app.state.session_factory() as session:
        password_hash = session.scalar(select(AppUser.password_hash).where(AppUser.username == "property"))
        session.add_all([
            Community(id=800, name="账单测试社区", address="测试路"),
            Community(id=801, name="外部社区", address="外部路"),
        ])
        session.flush()
        session.add_all([
            AppUser(id=800, community_id=800, username="billing-property", password_hash=password_hash, display_name="账单管家", role="PROPERTY"),
            AppUser(id=801, community_id=800, username="billing-owner", password_hash=password_hash, display_name="王晓明", role="OWNER"),
            AppUser(id=802, community_id=800, username="billing-joint-owner", password_hash=password_hash, display_name="陈雨", role="OWNER"),
            AppUser(id=803, community_id=801, username="billing-outside-owner", password_hash=password_hash, display_name="外部住户", role="OWNER"),
            AppUser(id=804, community_id=801, username="billing-outside-property", password_hash=password_hash, display_name="外部管家", role="PROPERTY"),
            House(id=800, community_id=800, building="8号楼", unit_name="2单元", room_no="801", area=Decimal("100.00")),
            House(id=801, community_id=800, building="9号楼", unit_name="1单元", room_no="901", area=Decimal("90.00")),
            House(id=802, community_id=801, building="外部楼", unit_name="1单元", room_no="101", area=Decimal("80.00")),
        ])
        session.flush()
        session.add_all([
            ResidentHouse(community_id=800, user_id=801, house_id=800, relation_type="OWNER"),
            ResidentHouse(community_id=800, user_id=802, house_id=800, relation_type="OWNER"),
            ResidentHouse(community_id=801, user_id=803, house_id=802, relation_type="OWNER"),
            Bill(id=800, community_id=800, house_id=800, bill_type="物业服务费", period="2026-09", amount=Decimal("268.10"), status="UNPAID"),
            Bill(id=801, community_id=800, house_id=800, bill_type="水费", period="2026-09", amount=Decimal("31.20"), status="PAID", paid_at=datetime(2026, 9, 1, tzinfo=UTC)),
            Bill(id=802, community_id=800, house_id=801, bill_type="物业服务费", period="2026-08", amount=Decimal("240.30"), status="UNPAID"),
            Bill(id=803, community_id=801, house_id=802, bill_type="外部费用", period="2025-01", amount=Decimal("999.00"), status="UNPAID"),
        ])
        session.commit()
    return login(client, "billing-property")


def test_community_bills_are_property_only(client):
    assert client.get("/api/v1/bills/community").status_code == 401
    for username in ("owner", "maintenance"):
        response = client.get("/api/v1/bills/community", headers=login(client, username))
        assert response.status_code == 403
        assert response.json()["code"] == "FORBIDDEN"


def test_community_bills_do_not_duplicate_joint_owners_or_leak_other_communities(client, community_billing):
    response = client.get("/api/v1/bills/community", headers=community_billing)
    assert response.status_code == 200
    data = response.json()["data"]
    assert (data["total"], data["page"], data["pageSize"]) == (3, 1, 20)
    assert [item["id"] for item in data["items"]] == [801, 800, 802]
    assert data["summary"] == {"unpaidAmount": "508.40", "paidAmount": "31.20", "unpaidCount": 2, "paidCount": 1}
    assert set(data["types"]) == {"物业服务费", "水费"}
    assert data["periods"] == ["2026-09", "2026-08"]
    paid = data["items"][0]
    assert paid["amount"] == "31.20"
    assert paid["paidAt"] == "2026-09-01T00:00:00Z"
    assert paid["houseLabel"] == "8号楼 2单元 801"
    assert "王晓明" in paid["ownerName"] and "陈雨" in paid["ownerName"]
    assert data["items"][2]["ownerName"] == "未关联住户"
    outside = client.get("/api/v1/bills/community", headers=login(client, "billing-outside-property")).json()["data"]
    assert [item["id"] for item in outside["items"]] == [803]
    assert outside["summary"]["unpaidAmount"] == "999.00"


def test_community_bill_pagination_keeps_filtered_totals(client, community_billing):
    first = client.get("/api/v1/bills/community?page=1&pageSize=2", headers=community_billing).json()["data"]
    second = client.get("/api/v1/bills/community?page=2&pageSize=2", headers=community_billing).json()["data"]
    assert [item["id"] for item in first["items"]] == [801, 800]
    assert [item["id"] for item in second["items"]] == [802]
    assert second["page"] == 2 and second["pageSize"] == 2
    assert first["total"] == second["total"] == 3
    assert first["summary"] == second["summary"]


def test_owner_bills_identify_multiple_houses_without_exposing_other_houses(client, community_billing):
    with client.app.state.session_factory() as session:
        session.add(ResidentHouse(community_id=800, user_id=801, house_id=801, relation_type="OWNER"))
        session.add(Bill(id=804, community_id=800, house_id=801, bill_type="物业服务费", period="2026-09", amount=Decimal("240.30"), status="UNPAID"))
        session.commit()
    response = client.get("/api/v1/bills?status=UNPAID", headers=login(client, "billing-owner"))
    assert response.status_code == 200
    bills = response.json()["data"]
    assert [bill["id"] for bill in bills] == [804, 800, 802]
    assert {(bill["houseId"], bill["houseLabel"]) for bill in bills} == {
        (800, "8号楼 2单元 801"), (801, "9号楼 1单元 901"),
    }
    joint_owner = client.get("/api/v1/bills", headers=login(client, "billing-joint-owner")).json()["data"]
    assert {bill["id"] for bill in joint_owner} == {800, 801}
    assert {bill["houseId"] for bill in joint_owner} == {800}


@pytest.mark.parametrize(("filters", "ids", "unpaid", "paid"), [
    ({"status": "UNPAID"}, [800, 802], "508.40", "0.00"),
    ({"billType": "物业服务费", "period": "2026-08"}, [802], "240.30", "0.00"),
    ({"search": " 陈雨 "}, [801, 800], "268.10", "31.20"),
    ({"search": "8号楼 2单元 801", "status": "PAID"}, [801], "0.00", "31.20"),
    ({"search": "外部住户"}, [], "0.00", "0.00"),
    ({"search": "%"}, [], "0.00", "0.00"),
])
def test_community_bill_filters_match_rows_and_amounts(client, community_billing, filters, ids, unpaid, paid):
    response = client.get("/api/v1/bills/community", headers=community_billing, params=filters)
    assert response.status_code == 200
    data = response.json()["data"]
    assert [item["id"] for item in data["items"]] == ids
    assert data["total"] == len(ids)
    assert data["summary"]["unpaidAmount"] == unpaid
    assert data["summary"]["paidAmount"] == paid


@pytest.mark.parametrize("query", ["page=0", "pageSize=0", "pageSize=101", "status=INVALID"])
def test_community_bill_query_rejects_invalid_pagination_and_status(client, community_billing, query):
    response = client.get(f"/api/v1/bills/community?{query}", headers=community_billing)
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
