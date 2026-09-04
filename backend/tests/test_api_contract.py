import pytest


@pytest.mark.parametrize(
    ("method", "path", "status_code", "code"),
    [
        ("get", "/api/v1/does-not-exist", 404, "HTTP_404"),
        ("post", "/api/v1/me", 405, "HTTP_405"),
    ],
)
def test_framework_http_errors_use_the_api_error_envelope(client, method, path, status_code, code):
    response = getattr(client, method)(path)

    assert response.status_code == status_code
    assert response.json()["code"] == code
    assert response.json()["message"]
    assert response.json()["requestId"] == response.headers["X-Request-Id"]
