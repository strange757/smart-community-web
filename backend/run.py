from __future__ import annotations

import argparse
import json
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url

from app.main import create_app


BACKEND_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = BACKEND_ROOT.parent
DEFAULT_DATABASE = BACKEND_ROOT / "community.db"
FRONTEND_DIST = REPOSITORY_ROOT / "frontend" / "dist"


def sqlite_url(database_path: Path) -> str:
    resolved = database_path.resolve()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{resolved.as_posix()}"


def reset_sqlite_database(database_url: str) -> Path:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite":
        raise ValueError("Demo reset is limited to a configured SQLite database file")
    if not url.database or url.database == ":memory:":
        raise ValueError("Demo reset requires a configured SQLite database file")

    database_file = Path(url.database).resolve()
    if database_file.suffix.lower() not in {".db", ".sqlite", ".sqlite3"}:
        raise ValueError("Configured SQLite file must use a .db, .sqlite, or .sqlite3 extension")
    if database_file.exists():
        if not database_file.is_file():
            raise ValueError(f"Configured SQLite path is not a file: {database_file}")
        database_file.unlink()
    return database_file


def migrate_database(database_url: str) -> None:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build database state and serve the smart-community demo")
    parser.add_argument("--host", default="0.0.0.0", help="Listening host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Listening port (default: 8000)")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE, help="SQLite database file")
    parser.add_argument("--reset", action="store_true", help="Delete only the selected demo SQLite file before migration")
    parser.add_argument("--demo-data", action="store_true", help="Add the community-scale synthetic demo batch once, preserving existing records")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    index_file = FRONTEND_DIST / "index.html"
    if not index_file.is_file():
        raise SystemExit(
            f"frontend/dist is missing ({FRONTEND_DIST}). Run 'npm run build' in frontend first."
        )

    database_url = sqlite_url(args.database)
    if args.reset:
        reset_sqlite_database(database_url)
    migrate_database(database_url)
    app = create_app(database_url=database_url, frontend_dist=FRONTEND_DIST)
    if args.demo_data:
        from app.db.demo_data import populate_demo_data

        with app.state.session_factory() as session:
            summary = populate_demo_data(session)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
