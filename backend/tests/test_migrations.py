import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

BACKEND_DIR = Path(__file__).resolve().parents[1]


def upgrade_to_head(path: Path) -> None:
    """Прогоняет миграции Alembic на временной базе."""
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite+aiosqlite:///{path.as_posix()}")
    command.upgrade(config, "head")


def test_migration_creates_both_tables_and_enforces_durations(tmp_path: Path) -> None:
    path = tmp_path / "migrated.db"

    upgrade_to_head(path)

    with sqlite3.connect(path) as connection:
        tables = {
            row[0]
            for row in connection.execute("select name from sqlite_master where type = 'table'")
        }
        assert {"meeting_types", "bookings"} <= tables
        table_sql = connection.execute(
            "select sql from sqlite_master where type = 'table' and name = 'meeting_types'"
        ).fetchone()[0]
        assert "CHECK" in table_sql.upper()
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "insert into meeting_types (title, duration_minutes, created_at) "
                "values ('Тип', 20, '2026-11-16 09:00:00')"
            )


def test_migration_cascades_bookings_with_their_type(tmp_path: Path) -> None:
    path = tmp_path / "migrated.db"
    upgrade_to_head(path)

    with sqlite3.connect(path) as connection:
        connection.execute("pragma foreign_keys=on")
        connection.execute(
            "insert into meeting_types (id, title, duration_minutes, created_at) "
            "values (1, 'Тип', 30, '2026-11-16 09:00:00')"
        )
        connection.execute(
            "insert into bookings "
            "(meeting_type_id, guest_name, guest_email, start, created_at) "
            "values (1, 'Гость', 'guest@example.com', '2026-11-16 09:00:00', "
            "'2026-11-16 08:00:00')"
        )

        connection.execute("delete from meeting_types where id = 1")

        assert connection.execute("select count(*) from bookings").fetchone()[0] == 0
