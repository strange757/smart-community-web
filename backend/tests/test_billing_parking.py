from datetime import date, time, timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, BrokenBarrierError

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.models.entities import ParkingReservation, PaymentRecord

from .conftest import login


def test_payment_is_idempotent_and_server_owns_amount(client):
    headers = login(client, "owner")
    headers["Idempotency-Key"] = "payment-test-001"
    first = client.post("/api/v1/bills/1/simulate-payment", headers=headers)
    second = client.post("/api/v1/bills/1/simulate-payment", headers=headers)
    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["amount"] == "268.00"
    assert first.json()["data"]["paymentRef"] == second.json()["data"]["paymentRef"]


def test_idempotency_key_cannot_return_another_bill_payment(client):
    headers = login(client, "owner")
    headers["Idempotency-Key"] = "payment-key-bound-to-bill"
    assert client.post("/api/v1/bills/1/simulate-payment", headers=headers).status_code == 200

    replay_for_another_bill = client.post("/api/v1/bills/2/simulate-payment", headers=headers)
    assert replay_for_another_bill.status_code == 409
    assert replay_for_another_bill.json()["code"] == "IDEMPOTENCY_KEY_CONFLICT"


@pytest.mark.parametrize("keys", [("same-key", "same-key"), ("first-key", "second-key")])
def test_concurrent_bill_payments_are_idempotent_or_conflicted_without_duplicates(client, keys):
    engine = client.app.state.session_factory.kw["bind"]
    barrier = Barrier(2)

    def synchronize_pending_payment(session):
        if session.bind is engine and any(isinstance(item, PaymentRecord) for item in session.new):
            try:
                barrier.wait(timeout=0.5)
            except BrokenBarrierError:
                pass

    event.listen(Session, "before_commit", synchronize_pending_payment)
    try:
        headers = login(client, "owner")

        def pay(key):
            return client.post(
                "/api/v1/bills/1/simulate-payment",
                headers={**headers, "Idempotency-Key": key},
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            first, second = executor.map(pay, keys)
    finally:
        event.remove(Session, "before_commit", synchronize_pending_payment)

    responses = [first, second]
    with client.app.state.session_factory() as session:
        payments = session.scalars(select(PaymentRecord).where(PaymentRecord.bill_id == 1)).all()

    assert len(payments) == 1
    if keys[0] == keys[1]:
        assert [response.status_code for response in responses] == [200, 200]
        assert responses[0].json()["data"]["paymentRef"] == responses[1].json()["data"]["paymentRef"]
    else:
        assert sorted(response.status_code for response in responses) == [200, 409]
        assert next(response for response in responses if response.status_code == 409).json()["code"] == "BILL_ALREADY_PAID"


@pytest.mark.parametrize("username,path", [("property", "/api/v1/bills"), ("maintenance", "/api/v1/parking/reservations/mine")])
def test_non_owners_are_denied_billing_and_parking_operations(client, username, path):
    response = client.get(path, headers=login(client, username))
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


def test_property_dashboard_returns_community_summary_and_denies_owner(client):
    summary = client.get("/api/v1/dashboard/summary", headers=login(client, "property"))
    assert summary.status_code == 200
    assert summary.json()["data"] == {
        "pendingRepairCount": 1,
        "completedRepairCount": 0,
        "unpaidAmount": "268.00",
        "activeReservationCount": 0,
    }

    denied = client.get("/api/v1/dashboard/summary", headers=login(client, "owner"))
    assert denied.status_code == 403
    assert denied.json()["code"] == "FORBIDDEN"


def test_parking_allows_adjacent_slots_and_rejects_overlap(client):
    headers = login(client, "owner")
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    first = client.post(
        "/api/v1/parking/reservations",
        headers=headers,
        json={"parkingSpaceId": 1, "date": tomorrow, "start": "09:00", "end": "10:00"},
    )
    assert first.status_code == 201

    adjacent = client.post(
        "/api/v1/parking/reservations",
        headers=headers,
        json={"parkingSpaceId": 1, "date": tomorrow, "start": "10:00", "end": "11:00"},
    )
    assert adjacent.status_code == 201

    overlap = client.post(
        "/api/v1/parking/reservations",
        headers=headers,
        json={"parkingSpaceId": 1, "date": tomorrow, "start": "09:30", "end": "10:30"},
    )
    assert overlap.status_code == 409
    assert overlap.json()["code"] == "PARKING_SLOT_CONFLICT"

    cancelled = client.post(
        f"/api/v1/parking/reservations/{first.json()['data']['id']}/cancel",
        headers=headers,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["status"] == "CANCELLED"

    repeated_cancel = client.post(
        f"/api/v1/parking/reservations/{first.json()['data']['id']}/cancel",
        headers=headers,
    )
    assert repeated_cancel.status_code == 409
    assert repeated_cancel.json()["code"] == "RESERVATION_ALREADY_CANCELLED"


def test_concurrent_identical_parking_requests_create_one_active_reservation(client):
    engine = client.app.state.session_factory.kw["bind"]
    barrier = Barrier(2)

    def synchronize_pending_reservations(session):
        if session.bind is engine and any(isinstance(item, ParkingReservation) for item in session.new):
            try:
                barrier.wait(timeout=0.5)
            except BrokenBarrierError:
                pass

    event.listen(Session, "before_commit", synchronize_pending_reservations)
    try:
        headers = login(client, "owner")
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        request_body = {
            "parkingSpaceId": 1,
            "date": tomorrow,
            "start": "14:00",
            "end": "15:00",
        }

        def reserve():
            return client.post(
                "/api/v1/parking/reservations",
                headers=headers,
                json=request_body,
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            first, second = executor.map(lambda _: reserve(), range(2))
    finally:
        event.remove(Session, "before_commit", synchronize_pending_reservations)

    responses = [first, second]
    assert sorted(response.status_code for response in responses) == [201, 409]
    assert next(response for response in responses if response.status_code == 409).json()["code"] == "PARKING_SLOT_CONFLICT"

    with client.app.state.session_factory() as session:
        active = session.scalars(
            select(ParkingReservation).where(
                ParkingReservation.parking_space_id == 1,
                ParkingReservation.booking_date == date.fromisoformat(tomorrow),
                ParkingReservation.start_time == time(14, 0),
                ParkingReservation.end_time == time(15, 0),
                ParkingReservation.status == "ACTIVE",
            )
        ).all()
    assert len(active) == 1
