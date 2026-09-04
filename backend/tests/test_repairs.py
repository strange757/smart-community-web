import pytest

from .conftest import login


def create_repair(client, headers) -> int:
    response = client.post(
        "/api/v1/repairs",
        headers=headers,
        json={
            "houseId": 1,
            "category": "公共设施",
            "description": "楼道灯不亮",
            "priority": "NORMAL",
        },
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def test_repair_moves_through_complete_role_workflow(client):
    owner = login(client, "owner")
    property_headers = login(client, "property")
    maintenance = login(client, "maintenance")

    created = client.post(
        "/api/v1/repairs",
        headers=owner,
        json={
            "houseId": 1,
            "category": "公共设施",
            "description": "楼道灯不亮",
            "priority": "NORMAL",
        },
    )
    assert created.status_code == 201
    repair_id = created.json()["data"]["id"]
    assert created.json()["data"]["status"] == "SUBMITTED"

    transitions = [
        (property_headers, "assign", {"assigneeId": 3}, "ASSIGNED"),
        (maintenance, "start", None, "IN_PROGRESS"),
        (maintenance, "complete", {"note": "已更换灯管"}, "COMPLETED"),
        (owner, "confirm", None, "CONFIRMED"),
        (owner, "rate", {"rating": 5, "comment": "处理及时"}, "RATED"),
    ]
    for headers, action, body, expected in transitions:
        response = client.post(
            f"/api/v1/repairs/{repair_id}/{action}", headers=headers, json=body
        )
        assert response.status_code == 200
        assert response.json()["data"]["status"] == expected

    detail = client.get(f"/api/v1/repairs/{repair_id}", headers=owner).json()["data"]
    assert detail["rating"] == 5
    assert len(detail["events"]) == 6


def test_illegal_repair_transition_returns_conflict(client):
    owner = login(client, "owner")
    repair_id = client.post(
        "/api/v1/repairs",
        headers=owner,
        json={
            "houseId": 1,
            "category": "水电维修",
            "description": "厨房水管漏水",
            "priority": "URGENT",
        },
    ).json()["data"]["id"]
    response = client.post(f"/api/v1/repairs/{repair_id}/confirm", headers=owner)
    assert response.status_code == 409
    assert response.json()["code"] == "REPAIR_INVALID_TRANSITION"


@pytest.mark.parametrize(
    ("steps", "action", "headers_name", "body", "expected_status"),
    [
        ([], "cancel", "owner", None, "CANCELLED"),
        (["assign"], "cancel", "owner", None, "CANCELLED"),
        (["assign"], "start", "maintenance", None, "IN_PROGRESS"),
        (["assign", "start"], "complete", "maintenance", {"note": "完成"}, "COMPLETED"),
        (["assign", "start", "complete"], "confirm", "owner", None, "CONFIRMED"),
        (["assign", "start", "complete", "confirm"], "rate", "owner", {"rating": 4}, "RATED"),
    ],
)
def test_each_legal_repair_boundary_is_allowed(client, steps, action, headers_name, body, expected_status):
    headers = {name: login(client, name) for name in ("owner", "property", "maintenance")}
    repair_id = create_repair(client, headers["owner"])
    for step in steps:
        actor = "property" if step == "assign" else "maintenance" if step in {"start", "complete"} else "owner"
        payload = {"assigneeId": 3} if step == "assign" else {"note": "完成"} if step == "complete" else None
        response = client.post(f"/api/v1/repairs/{repair_id}/{step}", headers=headers[actor], json=payload)
        assert response.status_code == 200
    response = client.post(f"/api/v1/repairs/{repair_id}/{action}", headers=headers[headers_name], json=body)
    assert response.status_code == 200
    assert response.json()["data"]["status"] == expected_status


@pytest.mark.parametrize(
    ("steps", "action", "headers_name"),
    [
        (["assign"], "complete", "maintenance"),
        (["assign"], "confirm", "owner"),
        (["assign", "start"], "cancel", "owner"),
        (["assign", "start", "complete"], "rate", "owner"),
        (["assign", "start", "complete", "confirm", "rate"], "cancel", "owner"),
        (["cancel"], "assign", "property"),
    ],
)
def test_each_illegal_repair_boundary_is_rejected(client, steps, action, headers_name):
    headers = {name: login(client, name) for name in ("owner", "property", "maintenance")}
    repair_id = create_repair(client, headers["owner"])
    for step in steps:
        actor = "property" if step == "assign" else "maintenance" if step in {"start", "complete"} else "owner"
        payload = {"assigneeId": 3} if step == "assign" else {"note": "完成"} if step == "complete" else {"rating": 5} if step == "rate" else None
        assert client.post(f"/api/v1/repairs/{repair_id}/{step}", headers=headers[actor], json=payload).status_code == 200
    body = (
        {"assigneeId": 3}
        if action == "assign"
        else {"rating": 5}
        if action == "rate"
        else None
    )
    response = client.post(f"/api/v1/repairs/{repair_id}/{action}", headers=headers[headers_name], json=body)
    assert response.status_code == 409
    assert response.json()["code"] == "REPAIR_INVALID_TRANSITION"
