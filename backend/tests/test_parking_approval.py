from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, time, timedelta
from threading import Barrier

import pytest
from sqlalchemy import select

from app.models.entities import AppUser, Community, ParkingReservation, ParkingSpace
from app.services import parking_service

from .conftest import login


def reserve(client, headers, **overrides):
    body = {
        "parkingSpaceId": 1,
        "date": (date.today() + timedelta(days=1)).isoformat(),
        "start": "09:00",
        "end": "10:00",
        **overrides,
    }
    return client.post("/api/v1/parking/reservations", headers=headers, json=body)


@pytest.fixture
def neighbors(client):
    with client.app.state.session_factory() as session:
        password_hash = session.get(AppUser, 1).password_hash
        session.add(Community(id=2, name="Other community", address="Other address"))
        session.flush()
        session.add_all([
            AppUser(id=4, community_id=1, username="neighbor", password_hash=password_hash,
                    display_name="Neighbor", role="OWNER", enabled=True),
            AppUser(id=5, community_id=2, username="other-owner", password_hash=password_hash,
                    display_name="Other owner", role="OWNER", enabled=True),
            AppUser(id=6, community_id=2, username="other-property", password_hash=password_hash,
                    display_name="Other property", role="PROPERTY", enabled=True),
            ParkingSpace(id=5, community_id=2, space_no="B-01", area_name="B", enabled=True),
        ])
        session.commit()
    return {name: login(client, name) for name in ("neighbor", "other-owner", "other-property")}


def test_pending_request_has_details_and_property_approval_records_reviewer(client):
    owner = login(client, "owner")
    response = reserve(client, owner, plateNumber="  ab12345  ")
    assert response.status_code == 201
    item = response.json()["data"]
    assert item["status"] == "PENDING"
    assert item["plateNumber"] == "AB12345"
    assert item["spaceNo"] == "A-01"
    assert item["areaName"]
    assert item["applicantName"]
    assert item["reviewNote"] is item["reviewedAt"] is item["reviewedBy"] is None
    assert item["createdAt"].endswith("Z")
    property_headers = login(client, "property")
    listed = client.get("/api/v1/parking/reservations?status=PENDING", headers=property_headers)
    assert listed.status_code == 200
    assert listed.json()["data"] == [item]
    approved = client.post(f"/api/v1/parking/reservations/{item['id']}/approve", headers=property_headers,
                           json={"note": "  Approved  "})
    assert approved.status_code == 200
    reviewed = approved.json()["data"]
    assert reviewed["status"] == "ACTIVE"
    assert reviewed["reviewNote"] == "Approved"
    assert reviewed["reviewedBy"] == 2
    assert reviewed["reviewedAt"].endswith("Z")
    assert client.get("/api/v1/parking/reservations/mine", headers=owner).json()["data"] == [reviewed]
    for action in ("approve", "reject"):
        repeated = client.post(f"/api/v1/parking/reservations/{item['id']}/{action}",
                               headers=property_headers, json={"note": "Repeated"})
        assert repeated.status_code == 409
    cancelled = client.post(f"/api/v1/parking/reservations/{item['id']}/cancel", headers=owner)
    assert cancelled.json()["data"]["status"] == "CANCELLED"
    assert cancelled.json()["data"]["reviewedBy"] == 2


def test_rejection_requires_reason_and_releases_slot(client):
    owner = login(client, "owner")
    item = reserve(client, owner).json()["data"]
    property_headers = login(client, "property")
    url = f"/api/v1/parking/reservations/{item['id']}/reject"
    for body in ({}, {"note": "  "}, {"note": "x" * 501}):
        assert client.post(url, headers=property_headers, json=body).status_code == 422
    rejected = client.post(url, headers=property_headers, json={"note": "  Missing permit  "})
    assert rejected.status_code == 200
    assert rejected.json()["data"]["status"] == "REJECTED"
    assert rejected.json()["data"]["reviewNote"] == "Missing permit"
    assert rejected.json()["data"]["reviewedBy"] == 2
    assert client.post(f"/api/v1/parking/reservations/{item['id']}/cancel", headers=owner).status_code == 409
    assert reserve(client, owner).status_code == 201


def test_availability_includes_occupied_and_disabled_spaces_without_private_details(client, neighbors):
    owner = login(client, "owner")
    pending = reserve(client, owner, plateNumber="PRIVATE-123").json()["data"]
    active = reserve(client, neighbors["neighbor"], parkingSpaceId=2).json()["data"]
    property_headers = login(client, "property")
    assert client.post(f"/api/v1/parking/reservations/{active['id']}/approve", headers=property_headers).status_code == 200
    with client.app.state.session_factory() as session:
        session.get(ParkingSpace, 4).enabled = False
        session.commit()
    params = {"date": pending["date"], "start": "09:30", "end": "10:30"}
    response = client.get("/api/v1/parking/availability", headers=owner, params=params)
    assert response.status_code == 200
    snapshot = response.json()["data"]
    assert snapshot["asOf"].endswith("Z")
    spaces = snapshot["spaces"]
    assert [(s["id"], s["availability"], s["isMine"]) for s in spaces] == [
        (1, "PENDING", True), (2, "OCCUPIED", False), (3, "AVAILABLE", False), (4, "DISABLED", False),
    ]
    assert all(set(s) == {"id", "spaceNo", "areaName", "enabled", "availability", "isMine"} for s in spaces)
    assert "PRIVATE-123" not in response.text
    neighbor = client.get("/api/v1/parking/availability", headers=neighbors["neighbor"], params=params)
    assert [(s["id"], s["isMine"]) for s in neighbor.json()["data"]["spaces"]][:2] == [(1, False), (2, True)]
    free = client.get("/api/v1/parking/spaces", headers=owner, params=params).json()["data"]
    assert [s["id"] for s in free] == [3]
    adjacent = client.get("/api/v1/parking/availability", headers=owner,
                          params={**params, "start": "10:00", "end": "11:00"}).json()["data"]
    assert [s["availability"] for s in adjacent["spaces"]] == ["AVAILABLE", "AVAILABLE", "AVAILABLE", "DISABLED"]
    assert client.get("/api/v1/parking/availability", headers=property_headers, params=params).status_code == 200
    assert reserve(client, owner, parkingSpaceId=4).status_code == 404


def test_parking_roles_and_community_boundaries(client, neighbors):
    owner = login(client, "owner")
    property_headers = login(client, "property")
    maintenance = login(client, "maintenance")
    item = reserve(client, owner).json()["data"]
    other_item = reserve(client, neighbors["other-owner"], parkingSpaceId=5).json()["data"]
    for headers in (owner, maintenance):
        assert client.get("/api/v1/parking/reservations", headers=headers).status_code == 403
        for action in ("approve", "reject"):
            assert client.post(f"/api/v1/parking/reservations/{item['id']}/{action}", headers=headers,
                               json={"note": "Denied"}).status_code == 403
    params = {"date": item["date"], "start": "09:00", "end": "10:00"}
    assert client.get("/api/v1/parking/availability", headers=maintenance, params=params).status_code == 403
    for action in ("approve", "reject"):
        assert client.post(f"/api/v1/parking/reservations/{other_item['id']}/{action}", headers=property_headers,
                           json={"note": "Denied"}).status_code == 404
    for headers in (neighbors["neighbor"], neighbors["other-owner"]):
        assert client.post(f"/api/v1/parking/reservations/{item['id']}/cancel", headers=headers).status_code == 404
    assert reserve(client, owner, parkingSpaceId=5).status_code == 404
    mine = client.get("/api/v1/parking/reservations/mine", headers=owner).json()["data"]
    assert [r["id"] for r in mine] == [item["id"]]
    listed = client.get("/api/v1/parking/reservations", headers=property_headers).json()["data"]
    assert [r["id"] for r in listed] == [item["id"]]
    other_spaces = client.get("/api/v1/parking/availability", headers=neighbors["other-owner"], params=params).json()["data"]
    assert [s["id"] for s in other_spaces["spaces"]] == [5]


@pytest.mark.parametrize("plate,expected", [(None, None), ("   ", None), (" ab-12 ", "AB-12")])
def test_optional_plate_is_normalized(client, plate, expected):
    response = reserve(client, login(client, "owner"), plateNumber=plate)
    assert response.status_code == 201
    assert response.json()["data"]["plateNumber"] == expected


def test_plate_and_interval_validation(client):
    owner = login(client, "owner")
    for overrides in ({"plateNumber": "x" * 21}, {"start": "11:00", "end": "10:00"},
                      {"start": "09:00+08:00"}, {"date": "2020-01-01"}):
        assert reserve(client, owner, **overrides).status_code == 422
    for params in ({}, {"date": "2030-01-01", "start": "11:00", "end": "10:00"},
                   {"date": "2030-01-01", "start": "09:00+08:00", "end": "10:00"}):
        assert client.get("/api/v1/parking/availability", headers=owner, params=params).status_code == 422


def test_today_validation_uses_shanghai_time_and_expired_requests_cannot_be_approved(client, monkeypatch):
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            frozen = datetime(2026, 9, 7, 16, 30, tzinfo=UTC)
            return frozen.astimezone(tz) if tz else frozen.replace(tzinfo=None)

    monkeypatch.setattr(parking_service, "datetime", FrozenDateTime)
    owner = login(client, "owner")
    assert reserve(client, owner, date="2026-09-08", start="00:00", end="01:00").status_code == 422
    assert reserve(client, owner, date="2026-09-07", start="23:00", end="23:59").status_code == 422
    assert reserve(client, owner, date="2026-09-08", start="01:00", end="02:00").status_code == 201
    with client.app.state.session_factory() as session:
        expired = ParkingReservation(community_id=1, user_id=1, parking_space_id=2,
                                     booking_date=date(2026, 9, 8), start_time=time(0), end_time=time(0, 30), status="PENDING")
        session.add(expired)
        session.commit()
        expired_id = expired.id
    response = client.post(f"/api/v1/parking/reservations/{expired_id}/approve", headers=login(client, "property"))
    assert response.status_code == 409
    assert response.json()["code"] == "RESERVATION_EXPIRED"


def test_property_list_filters_status_and_date(client):
    owner = login(client, "owner")
    first = reserve(client, owner).json()["data"]
    second = reserve(client, owner, parkingSpaceId=2, date=(date.today() + timedelta(days=2)).isoformat()).json()["data"]
    property_headers = login(client, "property")
    assert client.post(f"/api/v1/parking/reservations/{second['id']}/approve", headers=property_headers).status_code == 200
    for params, ids in [({"status": "PENDING"}, [first["id"]]), ({"date": second["date"]}, [second["id"]]),
                        ({"status": "ACTIVE", "date": first["date"]}, [])]:
        response = client.get("/api/v1/parking/reservations", headers=property_headers, params=params)
        assert response.status_code == 200
        assert [r["id"] for r in response.json()["data"]] == ids
    assert client.get("/api/v1/parking/reservations?status=UNKNOWN", headers=property_headers).status_code == 422


def test_legacy_active_reservation_remains_visible_and_blocks_new_requests(client):
    booking_date = date.today() + timedelta(days=1)
    with client.app.state.session_factory() as session:
        legacy = ParkingReservation(community_id=1, user_id=1, parking_space_id=1,
                                    booking_date=booking_date, start_time=time(9), end_time=time(10), status="ACTIVE")
        session.add(legacy)
        session.commit()
        legacy_id = legacy.id
    owner = login(client, "owner")
    item = client.get("/api/v1/parking/reservations/mine", headers=owner).json()["data"][0]
    assert item["id"] == legacy_id
    assert item["status"] == "ACTIVE"
    assert item["spaceNo"] == "A-01"
    assert item["plateNumber"] is item["reviewedBy"] is item["reviewNote"] is item["reviewedAt"] is None
    assert reserve(client, owner).status_code == 409
    snapshot = client.get("/api/v1/parking/availability", headers=owner,
                          params={"date": booking_date.isoformat(), "start": "09:00", "end": "10:00"}).json()["data"]
    assert snapshot["spaces"][0]["availability"] == "OCCUPIED"
    assert client.post(f"/api/v1/parking/reservations/{legacy_id}/approve", headers=login(client, "property")).status_code == 409


def test_approval_rechecks_disabled_space_and_legacy_conflict(client):
    owner = login(client, "owner")
    property_headers = login(client, "property")
    item = reserve(client, owner).json()["data"]
    with client.app.state.session_factory() as session:
        session.get(ParkingSpace, 1).enabled = False
        session.commit()
    url = f"/api/v1/parking/reservations/{item['id']}/approve"
    disabled = client.post(url, headers=property_headers)
    assert disabled.status_code == 409
    assert disabled.json()["code"] == "PARKING_SPACE_DISABLED"
    with client.app.state.session_factory() as session:
        session.get(ParkingSpace, 1).enabled = True
        session.add(ParkingReservation(community_id=1, user_id=1, parking_space_id=1,
                                       booking_date=date.fromisoformat(item["date"]), start_time=time(9, 30),
                                       end_time=time(10, 30), status="ACTIVE"))
        session.commit()
    conflict = client.post(url, headers=property_headers)
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "PARKING_SLOT_CONFLICT"
    stored = client.get("/api/v1/parking/reservations?status=PENDING", headers=property_headers).json()["data"]
    assert stored[0]["id"] == item["id"]
    assert stored[0]["reviewedBy"] is None


def test_concurrent_approval_and_cancellation_never_restore_cancelled_reservation(client):
    owner = login(client, "owner")
    property_headers = login(client, "property")
    item = reserve(client, owner).json()["data"]
    barrier = Barrier(2)

    def decide(action):
        barrier.wait(timeout=5)
        return client.post(f"/api/v1/parking/reservations/{item['id']}/{action}",
                           headers=owner if action == "cancel" else property_headers)

    with ThreadPoolExecutor(max_workers=2) as executor:
        approved, cancelled = executor.map(decide, ("approve", "cancel"))
    assert cancelled.status_code == 200
    assert approved.status_code in (200, 409)
    stored = client.get("/api/v1/parking/reservations/mine", headers=owner).json()["data"][0]
    assert stored["status"] == "CANCELLED"
    assert stored["reviewedBy"] == (2 if approved.status_code == 200 else None)


@pytest.mark.parametrize("actions", [("approve", "approve"), ("approve", "reject"), ("reject", "cancel"), ("cancel", "cancel")])
def test_concurrent_reservation_decisions_do_not_overwrite_each_other(client, actions):
    owner = login(client, "owner")
    property_headers = login(client, "property")
    item = reserve(client, owner).json()["data"]
    barrier = Barrier(2)

    def decide(action):
        barrier.wait(timeout=5)
        return client.post(f"/api/v1/parking/reservations/{item['id']}/{action}",
                           headers=owner if action == "cancel" else property_headers, json={"note": "Decision"})

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(decide, actions))
    assert sorted(r.status_code for r in results) == [200, 409]
    winning = next(r.json()["data"] for r in results if r.status_code == 200)
    with client.app.state.session_factory() as session:
        stored = session.scalar(select(ParkingReservation).where(ParkingReservation.id == item["id"]))
        assert stored.status == winning["status"]
