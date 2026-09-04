from sqlalchemy import inspect


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
