from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.db.base import Base
from app.models import entities  # noqa: F401


BACKEND_ROOT = Path(__file__).resolve().parents[1]


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
        assert {column["name"] for column in inspector.get_columns(table_name)} == set(table.columns.keys())
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
