from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def make_frontend_dist(tmp_path: Path) -> Path:
    frontend_dist = tmp_path / "dist"
    (frontend_dist / "assets").mkdir(parents=True)
    (frontend_dist / "index.html").write_text(
        "<!doctype html><html><body>production-spa</body></html>",
        encoding="utf-8",
    )
    (frontend_dist / "assets" / "app.js").write_text("window.productionSpa = true", encoding="utf-8")
    return frontend_dist


def test_static_hosting_is_opt_in_for_database_scoped_test_apps(tmp_path: Path):
    database_url = f"sqlite:///{(tmp_path / 'isolated.db').as_posix()}"

    with TestClient(create_app(database_url=database_url)) as client:
        response = client.get("/app/home")

    assert response.status_code == 404
    assert response.json()["code"] == "HTTP_404"


def test_explicit_static_hosting_serves_assets_and_spa_routes(tmp_path: Path):
    database_url = f"sqlite:///{(tmp_path / 'production.db').as_posix()}"
    frontend_dist = make_frontend_dist(tmp_path)

    with TestClient(create_app(database_url=database_url, frontend_dist=frontend_dist)) as client:
        root = client.get("/")
        direct_route = client.get("/app/home")
        asset = client.get("/assets/app.js")

    assert root.status_code == 200
    assert root.text == direct_route.text
    assert "production-spa" in direct_route.text
    assert asset.status_code == 200
    assert asset.text == "window.productionSpa = true"


def test_static_spa_fallback_does_not_swallow_api_or_unsupported_methods(tmp_path: Path):
    database_url = f"sqlite:///{(tmp_path / 'production.db').as_posix()}"
    frontend_dist = make_frontend_dist(tmp_path)

    with TestClient(create_app(database_url=database_url, frontend_dist=frontend_dist)) as client:
        missing_api_root = client.get("/api")
        missing_api = client.get("/api/v1/does-not-exist")
        unsupported_method = client.post("/app/home")

    assert missing_api_root.status_code == 404
    assert missing_api_root.json()["code"] == "HTTP_404"
    assert missing_api.status_code == 404
    assert missing_api.json()["code"] == "HTTP_404"
    assert missing_api.json()["requestId"] == missing_api.headers["X-Request-Id"]
    assert unsupported_method.status_code == 405
    assert unsupported_method.json()["code"] == "HTTP_405"


def test_explicit_static_hosting_requires_a_built_frontend(tmp_path: Path):
    database_url = f"sqlite:///{(tmp_path / 'production.db').as_posix()}"

    with pytest.raises(RuntimeError, match="frontend/dist"):
        create_app(database_url=database_url, frontend_dist=tmp_path / "missing-frontend" / "dist")
