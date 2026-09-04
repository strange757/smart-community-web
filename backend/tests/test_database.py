from sqlalchemy import inspect, text


AUDIT_COLUMNS = {"created_at", "updated_at"}
COMMUNITY_SCOPED_TABLES = {
    "app_user",
    "house",
    "resident_house",
    "notice",
    "repair_order",
    "repair_event",
    "bill",
    "payment_record",
    "parking_space",
    "parking_reservation",
}


def test_temporary_database_has_exactly_the_eleven_domain_tables(client):
    engine = client.app.state.session_factory.kw["bind"]
    assert set(inspect(engine).get_table_names()) == {
        "community",
        "app_user",
        "house",
        "resident_house",
        "notice",
        "repair_order",
        "repair_event",
        "bill",
        "payment_record",
        "parking_space",
        "parking_reservation",
    }


def test_every_sqlite_connection_enforces_foreign_keys(client):
    engine = client.app.state.session_factory.kw["bind"]

    with engine.connect() as connection:
        assert connection.scalar(text("PRAGMA foreign_keys")) == 1

    engine.dispose()
    with engine.connect() as replacement_connection:
        assert replacement_connection.scalar(text("PRAGMA foreign_keys")) == 1


def test_business_tables_have_community_and_audit_columns(client):
    inspector = inspect(client.app.state.session_factory.kw["bind"])

    for table_name in inspector.get_table_names():
        columns = {column["name"]: column for column in inspector.get_columns(table_name)}
        assert AUDIT_COLUMNS <= columns.keys(), f"{table_name} must be auditable"
        for audit_column in AUDIT_COLUMNS:
            assert columns[audit_column]["nullable"] is False
            assert columns[audit_column]["default"] is not None

    for table_name in COMMUNITY_SCOPED_TABLES:
        columns = {column["name"] for column in inspector.get_columns(table_name)}
        assert "community_id" in columns, f"{table_name} must carry its community boundary"
