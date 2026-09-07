import io
import json
from pathlib import Path

import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from PIL import Image, ImageOps
from sqlalchemy import MetaData, Table, event, inspect, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.seed import seed_database
from app.db.session import make_engine
from app.main import create_app
from app.models.entities import AppUser, Community, House, RepairEvent, RepairOrder

from .conftest import login


BODY = {"houseId": 1, "category": "Lighting", "description": "The corridor light is broken", "priority": "NORMAL"}
UPLOAD_URL = "/api/v1/repairs/with-images"


@pytest.fixture
def image_client(tmp_path, monkeypatch):
    monkeypatch.setenv("COMMUNITY_REPAIR_UPLOAD_DIR", str(tmp_path / "private-images"))
    app = create_app(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    with TestClient(app) as client:
        yield client


def picture(format="PNG", size=(40, 24), **save_options):
    output = io.BytesIO()
    Image.new("RGB", size, "red").save(output, format=format, **save_options)
    return output.getvalue()


def upload(client, headers, images=None, body=None):
    files = [("data", (None, json.dumps(body or BODY), "application/json"))]
    files.extend(("images", image) for image in (images or []))
    return client.post(UPLOAD_URL, headers=headers, files=files)


def assert_no_new_records_or_files(client):
    with client.app.state.session_factory() as session:
        assert session.scalars(select(RepairOrder.id)).all() == [1]
        assert session.scalars(select(RepairEvent.id)).all() == [1]
        assert session.execute(text("select count(*) from repair_image")).scalar_one() == 0
    root = client.app.state.settings.repair_upload_dir
    assert not root.exists() or list(root.iterdir()) == []


def test_json_and_multipart_allow_no_images(image_client):
    owner = login(image_client, "owner")
    for response in (
        image_client.post("/api/v1/repairs", headers=owner, json=BODY),
        upload(image_client, owner),
    ):
        assert response.status_code == 201
        assert response.json()["data"]["images"] == []
    assert image_client.get("/api/v1/repairs/1", headers=owner).json()["data"]["images"] == []


@pytest.mark.parametrize(("format", "content_type", "extension"), [("JPEG", "image/jpeg", ".jpg"), ("PNG", "image/png", ".png"), ("WEBP", "image/webp", ".webp")])
def test_upload_uses_actual_format_and_returns_private_image(image_client, format, content_type, extension):
    owner = login(image_client, "owner")
    response = upload(image_client, owner, [("../../leak.exe", picture(format), "text/plain")])
    assert response.status_code == 201
    repair = response.json()["data"]
    attachment = repair["images"][0]
    assert attachment["contentType"] == content_type
    assert attachment["fileName"] == "leak" + extension
    assert attachment["width"] == 40 and attachment["height"] == 24
    assert attachment["createdAt"].endswith("Z")
    assert attachment["url"] == f"/api/v1/repairs/{repair['id']}/images/{attachment['id']}"
    downloaded = image_client.get(attachment["url"], headers=owner)
    assert downloaded.status_code == 200
    assert downloaded.headers["content-type"] == content_type
    assert downloaded.headers["cache-control"] == "private, no-store"
    assert downloaded.headers["x-content-type-options"] == "nosniff"
    assert len(downloaded.content) == attachment["size"]
    with Image.open(io.BytesIO(downloaded.content)) as decoded:
        assert decoded.format == format
        assert decoded.size == (40, 24)
    assert image_client.get(f"/api/v1/repairs/{repair['id']}", headers=owner).json()["data"]["images"] == [attachment]
    listed = image_client.get("/api/v1/repairs", headers=owner).json()["data"]
    assert next(row for row in listed if row["id"] == repair["id"])["images"] == [attachment]
    stored = list(image_client.app.state.settings.repair_upload_dir.iterdir())
    assert len(stored) == 1 and stored[0].name != attachment["fileName"]


def test_exif_orientation_and_large_dimensions_are_normalized(image_client):
    exif = Image.Exif()
    exif[274] = 6
    exif[270] = "private photo note"
    response = upload(image_client, login(image_client, "owner"), [("camera.jpg", picture("JPEG", (3000, 1500), exif=exif), "image/jpeg")])
    assert response.status_code == 201
    attachment = response.json()["data"]["images"][0]
    assert (attachment["width"], attachment["height"]) == (1280, 2560)
    stored = next(image_client.app.state.settings.repair_upload_dir.iterdir())
    with Image.open(stored) as decoded:
        assert not decoded.getexif()
        assert "exif" not in decoded.info


def test_image_preparation_does_not_block_another_database_writer(image_client, monkeypatch):
    owner = login(image_client, "owner")
    original_transpose = ImageOps.exif_transpose
    engine = image_client.app.state.session_factory.kw["bind"]
    def transpose_while_another_writer_updates(image, *args, **kwargs):
        with engine.begin() as connection:
            connection.execute(text("update repair_order set priority='URGENT' where id=1"))
        return original_transpose(image, *args, **kwargs)
    monkeypatch.setattr(ImageOps, "exif_transpose", transpose_while_another_writer_updates)
    response = upload(image_client, owner, [("camera.jpg", picture("JPEG"), "image/jpeg")])
    assert response.status_code == 201
    with image_client.app.state.session_factory() as session:
        assert session.get(RepairOrder, 1).priority == "URGENT"


@pytest.mark.parametrize("invalid", [b"not an image", b"<svg xmlns='http://www.w3.org/2000/svg'/>", picture("GIF"), picture("PNG")[:40]])
def test_invalid_images_leave_no_repair_or_attachment(image_client, invalid):
    response = upload(image_client, login(image_client, "owner"), [("good.png", picture(), "image/png"), ("fake.png", invalid, "image/png")])
    assert response.status_code == 422
    assert response.json()["code"] == "REPAIR_IMAGE_INVALID"
    assert response.json()["requestId"]
    assert_no_new_records_or_files(image_client)


def test_animated_image_is_rejected(image_client):
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buffer, format="PNG", save_all=True, append_images=[Image.new("RGB", (8, 8), "blue")], duration=100, loop=0)
    response = upload(image_client, login(image_client, "owner"), [("animation.png", buffer.getvalue(), "image/png")])
    assert response.status_code == 422
    assert_no_new_records_or_files(image_client)


def test_image_pixel_limit_is_enforced_before_decoding(image_client):
    response = upload(image_client, login(image_client, "owner"), [("huge.png", picture(size=(5001, 5000)), "image/png")])
    assert response.status_code == 413
    assert_no_new_records_or_files(image_client)


def test_individual_file_size_limit_is_enforced(image_client):
    response = upload(image_client, login(image_client, "owner"), [("large.png", picture() + b"x" * (5 * 1024 * 1024), "image/png")])
    assert response.status_code == 413
    assert_no_new_records_or_files(image_client)


def test_six_images_allowed_and_seven_rejected(image_client):
    owner = login(image_client, "owner")
    files = [(f"{index}.png", picture(), "image/png") for index in range(7)]
    rejected = upload(image_client, owner, files)
    assert rejected.status_code == 422
    assert_no_new_records_or_files(image_client)
    accepted = upload(image_client, owner, files[:6])
    assert accepted.status_code == 201
    assert len(accepted.json()["data"]["images"]) == 6


@pytest.mark.parametrize("include_length", [False, True])
def test_total_request_limit_covers_chunked_uploads(image_client, include_length):
    owner = login(image_client, "owner")
    prefix = b'--repair-boundary\r\nContent-Disposition: form-data; name="images"; filename="large.png"\r\nContent-Type: image/png\r\n\r\n'
    suffix = b"\r\n--repair-boundary--\r\n"
    headers = {**owner, "Content-Type": "multipart/form-data; boundary=repair-boundary"}
    if include_length:
        headers["Content-Length"] = str(len(prefix) + 33 * 1024 * 1024 + len(suffix))
    def chunks():
        yield prefix
        for _ in range(33):
            yield b"x" * 1024 * 1024
        yield suffix
    response = image_client.post(UPLOAD_URL, headers=headers, content=chunks())
    assert response.status_code == 413
    assert response.json()["code"] == "REPAIR_IMAGE_TOO_LARGE"
    assert_no_new_records_or_files(image_client)


@pytest.mark.parametrize(("username", "house_id", "expected"), [(None, 1, 401), ("property", 1, 403), ("maintenance", 1, 403), ("owner", 2, 403), ("owner", 999, 403)])
def test_creation_authorization_precedes_image_validation(image_client, username, house_id, expected):
    headers = login(image_client, username) if username else {}
    response = upload(image_client, headers, [("fake.png", b"invalid", "image/png")], {**BODY, "houseId": house_id})
    assert response.status_code == expected
    assert_no_new_records_or_files(image_client)


def test_download_is_scoped_to_repair_visibility(image_client):
    owner = login(image_client, "owner")
    property_headers = login(image_client, "property")
    maintenance = login(image_client, "maintenance")
    with image_client.app.state.session_factory() as session:
        session.add(Community(id=2, name="Other community", address="Other street"))
        session.flush()
        session.add_all([
            AppUser(id=4, community_id=1, username="other-owner", password_hash=hash_password("123456"), display_name="Other owner", role="OWNER"),
            AppUser(id=5, community_id=2, username="other-property", password_hash=hash_password("123456"), display_name="Other property", role="PROPERTY"),
            House(id=3, community_id=2, building="B", unit_name="1", room_no="101", area=80),
        ])
        session.commit()
    response = upload(image_client, owner, [("light.png", picture(), "image/png")])
    assert response.status_code == 201
    repair = response.json()["data"]
    url = repair["images"][0]["url"]
    assert image_client.get(url).status_code == 401
    for headers in (maintenance, login(image_client, "other-owner"), login(image_client, "other-property")):
        assert image_client.get(url, headers=headers).status_code == 404
    assert image_client.get(url, headers=property_headers).status_code == 200
    assert image_client.post(f"/api/v1/repairs/{repair['id']}/assign", headers=property_headers, json={"assigneeId": 3}).status_code == 200
    assert image_client.get(url, headers=maintenance).status_code == 200
    assert image_client.get(f"/api/v1/repairs/1/images/{repair['images'][0]['id']}", headers=owner).status_code == 404
    assert image_client.get(f"/api/v1/repairs/{repair['id']}/images/999", headers=owner).status_code == 404
    assert upload(image_client, owner, [("fake.png", b"bad", "image/png")], {**BODY, "houseId": 3}).status_code == 403


@pytest.mark.parametrize("failure", ["write", "commit", "rollback"])
def test_storage_or_database_failure_rolls_back_and_cleans_files(image_client, monkeypatch, failure):
    owner = login(image_client, "owner")
    if failure == "write":
        original_open = Path.open
        writes = 0
        def failing_open(path, mode="r", *args, **kwargs):
            nonlocal writes
            if mode == "xb":
                writes += 1
                if writes == 2:
                    raise OSError("simulated full disk")
            return original_open(path, mode, *args, **kwargs)
        monkeypatch.setattr(Path, "open", failing_open)
    else:
        def failed_commit(session):
            raise SQLAlchemyError("simulated commit failure")
        monkeypatch.setattr(Session, "commit", failed_commit)
        if failure == "rollback":
            original_rollback = Session.rollback
            def failed_rollback(session):
                original_rollback(session)
                raise SQLAlchemyError("simulated rollback connection failure")
            monkeypatch.setattr(Session, "rollback", failed_rollback)
    response = upload(image_client, owner, [("one.png", picture(), "image/png"), ("two.png", picture(), "image/png")])
    assert response.status_code == 500
    assert response.json()["code"] == "REPAIR_IMAGE_SAVE_FAILED"
    assert_no_new_records_or_files(image_client)


@pytest.mark.parametrize("fields", [[], [("data", (None, "not json"))], [("data", (None, "{}"))], [("data", (None, json.dumps(BODY))), ("extra", (None, "x"))]])
def test_malformed_multipart_data_uses_error_envelope(image_client, fields):
    files = [*fields, ("images", ("light.png", picture(), "image/png"))]
    response = image_client.post(UPLOAD_URL, headers=login(image_client, "owner"), files=files)
    assert response.status_code == 422
    assert response.json()["requestId"]
    assert_no_new_records_or_files(image_client)


def test_incomplete_multipart_does_not_silently_drop_the_image(image_client):
    request = httpx.Request("POST", "http://testserver" + UPLOAD_URL, files=[
        ("data", (None, json.dumps(BODY))),
        ("images", ("light.png", picture(), "image/png")),
    ])
    content = request.read()
    truncated = content[:content.rfind(b"\r\n--")]
    response = image_client.post(UPLOAD_URL, headers={**login(image_client, "owner"), "Content-Type": request.headers["content-type"]}, content=truncated)
    assert response.status_code == 422
    assert_no_new_records_or_files(image_client)


def test_image_metadata_is_loaded_once_for_repair_list(image_client):
    owner = login(image_client, "owner")
    for index in range(3):
        assert upload(image_client, owner, [(f"{index}.png", picture(), "image/png")]).status_code == 201
    engine = image_client.app.state.session_factory.kw["bind"]
    statements = []
    def capture(connection, cursor, statement, parameters, context, executemany):
        if "FROM repair_image" in statement:
            statements.append(statement)
    event.listen(engine, "before_cursor_execute", capture)
    try:
        response = image_client.get("/api/v1/repairs", headers=owner)
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    assert response.status_code == 200
    assert len(statements) == 1


def test_image_migration_preserves_repairs_and_enforces_community_keys(tmp_path):
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    database_url = f"sqlite:///{(tmp_path / 'migration.db').as_posix()}"
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "20260907_0003")
    engine = make_engine(database_url)
    with Session(engine) as session:
        seed_database(session)
        session.add(Community(id=2, name="Other", address="Other"))
        session.flush()
        session.add(AppUser(id=4, community_id=2, username="other", password_hash="hash", display_name="Other", role="OWNER"))
        session.commit()
    command.upgrade(config, "head")
    assert "repair_image" in inspect(engine).get_table_names()
    table = Table("repair_image", MetaData(), autoload_with=engine)
    values = {"community_id": 1, "repair_id": 1, "uploader_id": 1, "storage_key": "a" * 32 + ".png", "file_name": "light.png", "content_type": "image/png", "size": 100, "width": 40, "height": 24}
    with engine.begin() as connection:
        assert connection.execute(text("select description from repair_order where id=1")).scalar_one()
        connection.execute(table.insert().values(**values))
    for invalid in ({**values, "storage_key": "b.png", "uploader_id": 4}, {**values, "storage_key": "c.png", "community_id": 2, "uploader_id": 4}, values):
        with engine.begin() as connection:
            with pytest.raises(IntegrityError):
                connection.execute(table.insert().values(**invalid))
    command.downgrade(config, "20260907_0003")
    assert "repair_image" not in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert connection.execute(text("select count(*) from repair_order")).scalar_one() == 1
