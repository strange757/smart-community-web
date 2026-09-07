from datetime import date, time
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, Table, create_engine, inspect, select, update
from sqlalchemy.exc import IntegrityError

from app.db.base import Base
from app.db.session import configure_sqlite_foreign_keys
from app.models import entities  # noqa: F401


BACKEND_ROOT = Path(__file__).resolve().parents[1]

EXPECTED_SCOPED_FOREIGN_KEYS = {
    "resident_house": {
        (("community_id",), "community", ("id",)),
        (("user_id", "community_id"), "app_user", ("id", "community_id")),
        (("house_id", "community_id"), "house", ("id", "community_id")),
    },
    "notice": {
        (("community_id",), "community", ("id",)),
        (("publisher_id", "community_id"), "app_user", ("id", "community_id")),
    },
    "repair_order": {
        (("community_id",), "community", ("id",)),
        (("house_id", "community_id"), "house", ("id", "community_id")),
        (("creator_id", "community_id"), "app_user", ("id", "community_id")),
        (("assignee_id", "community_id"), "app_user", ("id", "community_id")),
    },
    "repair_event": {
        (("community_id",), "community", ("id",)),
        (("repair_id", "community_id"), "repair_order", ("id", "community_id")),
        (("actor_id", "community_id"), "app_user", ("id", "community_id")),
    },
    "bill": {
        (("community_id",), "community", ("id",)),
        (("house_id", "community_id"), "house", ("id", "community_id")),
    },
    "payment_record": {
        (("community_id",), "community", ("id",)),
        (("bill_id", "community_id"), "bill", ("id", "community_id")),
        (("payer_id", "community_id"), "app_user", ("id", "community_id")),
    },
    "parking_reservation": {
        (("community_id",), "community", ("id",)),
        (("parking_space_id", "community_id"), "parking_space", ("id", "community_id")),
        (("user_id", "community_id"), "app_user", ("id", "community_id")),
        (("reviewed_by", "community_id"), "app_user", ("id", "community_id")),
    },
}


def _type_signature(column_type) -> tuple:
    return (
        column_type._type_affinity,
        getattr(column_type, "length", None),
        getattr(column_type, "precision", None),
        getattr(column_type, "scale", None),
    )


def _normalize_default(value) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().upper()
    while normalized.startswith("(") and normalized.endswith(")"):
        normalized = normalized[1:-1].strip()
    return "".join(normalized.split())


def test_alembic_upgrades_an_empty_database_to_the_current_schema(tmp_path: Path):
    alembic_ini = BACKEND_ROOT / "alembic.ini"
    assert alembic_ini.is_file(), "backend/alembic.ini is required for production migrations"

    database_url = f"sqlite:///{(tmp_path / 'migrated.db').as_posix()}"
    config = Config(str(alembic_ini))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    inspector = inspect(engine)
    expected_tables = set(Base.metadata.tables)
    actual_tables = set(inspector.get_table_names()) - {"alembic_version"}

    assert actual_tables == expected_tables
    for table_name, table in Base.metadata.tables.items():
        migrated_columns = {column["name"]: column for column in inspector.get_columns(table_name)}
        assert set(migrated_columns) == set(table.columns.keys())
        for column in table.columns:
            migrated = migrated_columns[column.name]
            assert _type_signature(migrated["type"]) == _type_signature(column.type)
            assert migrated["nullable"] is column.nullable
            expected_default = None
            if column.server_default is not None:
                expected_default = _normalize_default(
                    column.server_default.arg.compile(dialect=engine.dialect)
                )
            assert _normalize_default(migrated["default"]) == expected_default
        assert tuple(inspector.get_pk_constraint(table_name)["constrained_columns"]) == tuple(
            column.name for column in table.primary_key.columns
        )
        assert {
            (
                tuple(foreign_key["constrained_columns"]),
                foreign_key["referred_table"],
                tuple(foreign_key["referred_columns"]),
            )
            for foreign_key in inspector.get_foreign_keys(table_name)
        } == {
            (
                tuple(element.parent.name for element in constraint.elements),
                constraint.referred_table.name,
                tuple(element.column.name for element in constraint.elements),
            )
            for constraint in table.foreign_key_constraints
        }
        assert {
            tuple(index["column_names"])
            for index in inspector.get_indexes(table_name)
        } == {
            tuple(column.name for column in index.columns)
            for index in table.indexes
        }
        assert {
            tuple(constraint["column_names"])
            for constraint in inspector.get_unique_constraints(table_name)
        } == {
            tuple(column.name for column in constraint.columns)
            for constraint in table.constraints
            if constraint.__class__.__name__ == "UniqueConstraint"
        }

    for table_name, expected_foreign_keys in EXPECTED_SCOPED_FOREIGN_KEYS.items():
        assert {
            (
                tuple(foreign_key["constrained_columns"]),
                foreign_key["referred_table"],
                tuple(foreign_key["referred_columns"]),
            )
            for foreign_key in inspector.get_foreign_keys(table_name)
        } == expected_foreign_keys

    for table_name in expected_tables:
        columns = {column["name"]: column for column in inspector.get_columns(table_name)}
        for audit_column in ("created_at", "updated_at"):
            assert audit_column in columns
            assert columns[audit_column]["nullable"] is False
            assert _normalize_default(columns[audit_column]["default"]) == "CURRENT_TIMESTAMP"

    command.check(config)


def test_parking_approval_migration_preserves_active_history_and_scopes_reviewer(tmp_path: Path):
    database_url = f"sqlite:///{(tmp_path / 'parking-history.db').as_posix()}"
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "20260904_0001")
    engine = create_engine(database_url)
    configure_sqlite_foreign_keys(engine)
    metadata = MetaData()
    community = Table("community", metadata, autoload_with=engine)
    user = Table("app_user", metadata, autoload_with=engine)
    space = Table("parking_space", metadata, autoload_with=engine)
    reservation = Table("parking_reservation", metadata, autoload_with=engine)
    with engine.begin() as connection:
        connection.execute(community.insert(), [
            {"id": 1, "name": "Original", "address": "One"},
            {"id": 2, "name": "Other", "address": "Two"},
        ])
        connection.execute(user.insert(), [
            {"id": 1, "community_id": 1, "username": "owner", "display_name": "Owner", "password_hash": "hash", "role": "OWNER", "enabled": True},
            {"id": 2, "community_id": 1, "username": "property", "display_name": "Property", "password_hash": "hash", "role": "PROPERTY", "enabled": True},
            {"id": 3, "community_id": 2, "username": "other", "display_name": "Other", "password_hash": "hash", "role": "PROPERTY", "enabled": True},
        ])
        connection.execute(space.insert(), {"id": 1, "community_id": 1, "space_no": "A-01", "area_name": "A", "enabled": True})
        connection.execute(reservation.insert(), {"id": 12, "community_id": 1, "user_id": 1, "parking_space_id": 1,
                                                 "booking_date": date(2030, 1, 1), "start_time": time(9), "end_time": time(10), "status": "ACTIVE"})
        before = dict(connection.execute(select(reservation)).mappings().one())
    command.upgrade(config, "head")
    migrated = Table("parking_reservation", MetaData(), autoload_with=engine)
    with engine.begin() as connection:
        after = dict(connection.execute(select(migrated)).mappings().one())
        assert {key: after[key] for key in before} == before
        assert {key: after[key] for key in ("plate_number", "review_note", "reviewed_at", "reviewed_by")} == {
            "plate_number": None, "review_note": None, "reviewed_at": None, "reviewed_by": None,
        }
        connection.execute(update(migrated).values(reviewed_by=2))
    with engine.begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(update(migrated).values(reviewed_by=3))
