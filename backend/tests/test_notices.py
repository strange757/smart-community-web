from .conftest import login


def test_owner_only_sees_published_notices(client):
    response = client.get("/api/v1/notices", headers=login(client, "owner"))
    assert response.status_code == 200
    assert len(response.json()["data"]) == 2
    assert {item["status"] for item in response.json()["data"]} == {"PUBLISHED"}


def test_property_can_create_publish_and_withdraw_notice(client):
    property_headers = login(client, "property")
    created = client.post(
        "/api/v1/notices",
        headers=property_headers,
        json={"title": "停水提醒", "content": "明天上午九点至十一点停水。"},
    )
    assert created.status_code == 201
    notice_id = created.json()["data"]["id"]
    assert created.json()["data"]["status"] == "DRAFT"

    published = client.post(
        f"/api/v1/notices/{notice_id}/publish", headers=property_headers
    )
    assert published.status_code == 200
    assert published.json()["data"]["status"] == "PUBLISHED"

    owner_items = client.get(
        "/api/v1/notices", headers=login(client, "owner")
    ).json()["data"]
    assert any(item["id"] == notice_id for item in owner_items)

    withdrawn = client.post(
        f"/api/v1/notices/{notice_id}/withdraw", headers=property_headers
    )
    assert withdrawn.json()["data"]["status"] == "WITHDRAWN"


def test_notice_cannot_skip_or_repeat_lifecycle_states(client):
    property_headers = login(client, "property")
    created = client.post(
        "/api/v1/notices",
        headers=property_headers,
        json={"title": "门禁维护", "content": "周五上午维护门禁系统。"},
    )
    notice_id = created.json()["data"]["id"]

    skipped = client.post(
        f"/api/v1/notices/{notice_id}/withdraw", headers=property_headers
    )
    assert skipped.status_code == 409
    assert skipped.json()["code"] == "NOTICE_INVALID_TRANSITION"

    assert client.post(
        f"/api/v1/notices/{notice_id}/publish", headers=property_headers
    ).status_code == 200
    assert client.post(
        f"/api/v1/notices/{notice_id}/withdraw", headers=property_headers
    ).status_code == 200

    repeated = client.post(
        f"/api/v1/notices/{notice_id}/publish", headers=property_headers
    )
    assert repeated.status_code == 409
    assert repeated.json()["code"] == "NOTICE_INVALID_TRANSITION"
