from .conftest import login


def test_owner_can_login_and_restore_session(client):
    headers = login(client, "owner")
    response = client.get("/api/v1/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["data"] == {
        "id": 1,
        "displayName": "张三",
        "role": "OWNER",
        "communityId": 1,
    }


def test_wrong_password_returns_stable_error(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "owner", "password": "wrong"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "AUTH_INVALID"
    assert response.json()["requestId"]


def test_missing_token_returns_auth_required_error(client):
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.json()["code"] == "AUTH_REQUIRED"


def test_owner_can_list_only_its_houses(client):
    response = client.get("/api/v1/me/houses", headers=login(client, "owner"))
    assert response.status_code == 200
    assert response.json()["data"] == [
        {
            "id": 1,
            "communityId": 1,
            "building": "1号楼",
            "unit": "1单元",
            "roomNo": "101",
            "area": "89.50",
        }
    ]


def test_owner_cannot_list_maintenance_users(client):
    response = client.get(
        "/api/v1/users?role=MAINTENANCE",
        headers=login(client, "owner"),
    )
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"
