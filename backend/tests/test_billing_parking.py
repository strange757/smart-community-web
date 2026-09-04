from datetime import date, timedelta

import pytest

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
