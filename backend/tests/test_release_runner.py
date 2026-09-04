from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def load_reset_function():
    run_script = BACKEND_ROOT / "run.py"
    assert run_script.is_file(), "backend/run.py is required for the production demo runner"
    from run import reset_sqlite_database

    return reset_sqlite_database


def test_reset_removes_only_the_selected_sqlite_database(tmp_path: Path):
    reset_sqlite_database = load_reset_function()
    demo_database = tmp_path / "demo.db"
    neighboring_database = tmp_path / "keep.db"
    demo_database.write_bytes(b"demo")
    neighboring_database.write_bytes(b"keep")

    reset_sqlite_database(f"sqlite:///{demo_database.as_posix()}")

    assert not demo_database.exists()
    assert neighboring_database.read_bytes() == b"keep"


def test_reset_rejects_non_sqlite_database_urls():
    reset_sqlite_database = load_reset_function()

    with pytest.raises(ValueError, match="SQLite"):
        reset_sqlite_database("postgresql://localhost/community")


def test_reset_rejects_a_non_database_file(tmp_path: Path):
    reset_sqlite_database = load_reset_function()
    protected_file = tmp_path / "notes.txt"
    protected_file.write_text("keep", encoding="utf-8")

    with pytest.raises(ValueError, match="extension"):
        reset_sqlite_database(f"sqlite:///{protected_file.as_posix()}")

    assert protected_file.read_text(encoding="utf-8") == "keep"
