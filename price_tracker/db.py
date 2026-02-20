import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent.parent / "price_tracker.sqlite3"


def _db_backend() -> str:
    return os.getenv("DB_BACKEND", "sqlite").strip().lower()


def get_backend() -> str:
    return _db_backend()


def _sqlite_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _mysql_connection():
    import mysql.connector
    from mysql.connector import errorcode

    config = {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", "price_tracker"),
        "autocommit": True,
        "charset": "utf8mb4",
        "collation": "utf8mb4_unicode_ci",
    }

    try:
        return mysql.connector.connect(**config)
    except mysql.connector.Error as exc:
        if exc.errno != errorcode.ER_BAD_DB_ERROR:
            raise

    admin_config = dict(config)
    admin_config.pop("database", None)
    admin_connection = mysql.connector.connect(**admin_config)
    admin_cursor = admin_connection.cursor()
    admin_cursor.execute(
        f"CREATE DATABASE IF NOT EXISTS `{config['database']}` DEFAULT CHARACTER SET utf8mb4"
    )
    admin_cursor.close()
    admin_connection.close()

    return mysql.connector.connect(**config)


@contextmanager
def _connection():
    backend = _db_backend()
    connection = _mysql_connection() if backend == "mysql" else _sqlite_connection()
    try:
        yield connection
        if backend == "sqlite":
            connection.commit()
    finally:
        connection.close()


def _prepare_query(query: str) -> str:
    if _db_backend() == "mysql":
        return query.replace("?", "%s")
    return query


def _row_to_dict(row: sqlite3.Row | dict | None) -> dict | None:
    if row is None:
        return None
    if isinstance(row, sqlite3.Row):
        return dict(row)
    return row


def _execute(query: str, params: tuple = (), fetch: str | None = None):
    prepared = _prepare_query(query)
    backend = _db_backend()
    with _connection() as connection:
        if backend == "mysql":
            cursor = connection.cursor(dictionary=True)
            cursor.execute(prepared, params)
        else:
            cursor = connection.execute(prepared, params)

        if fetch == "one":
            return _row_to_dict(cursor.fetchone())
        if fetch == "all":
            rows = cursor.fetchall()
            return [_row_to_dict(row) for row in rows]
        return cursor


def init_db() -> None:
    if _db_backend() == "mysql":
        _init_mysql()
    else:
        _init_sqlite()


def _init_sqlite() -> None:
    with _connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                selector TEXT NOT NULL,
                selector_type TEXT NOT NULL DEFAULT 'css',
                currency TEXT NOT NULL DEFAULT '$',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS price_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                price REAL,
                raw_text TEXT,
                success INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_price_checks_item_checked_at
            ON price_checks(item_id, checked_at DESC);
            """
        )

        columns = connection.execute("PRAGMA table_info(items)").fetchall()
        column_names = {column["name"] for column in columns}
        if "currency" not in column_names:
            connection.execute("ALTER TABLE items ADD COLUMN currency TEXT NOT NULL DEFAULT '$'")
        if "user_id" not in column_names:
            connection.execute("ALTER TABLE items ADD COLUMN user_id INTEGER")

        if "tag" in column_names:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS items_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    selector TEXT NOT NULL,
                    selector_type TEXT NOT NULL DEFAULT 'css',
                    currency TEXT NOT NULL DEFAULT '$',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                INSERT INTO items_new (id, user_id, name, url, selector, selector_type, currency, created_at)
                SELECT id, user_id, name, url, selector, selector_type, currency, created_at
                FROM items;

                DROP TABLE items;
                ALTER TABLE items_new RENAME TO items;
                """
            )

        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id)"
        )


def _init_mysql() -> None:
    with _connection() as connection:
        cursor = connection.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                name VARCHAR(255) NOT NULL,
                url TEXT NOT NULL,
                selector TEXT NOT NULL,
                selector_type VARCHAR(16) NOT NULL DEFAULT 'css',
                currency VARCHAR(8) NOT NULL DEFAULT '$',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS price_checks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                item_id INT NOT NULL,
                price DOUBLE,
                raw_text TEXT,
                success TINYINT NOT NULL DEFAULT 0,
                error TEXT,
                checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
            ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            SELECT COUNT(1)
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = %s
              AND TABLE_NAME = 'price_checks'
              AND INDEX_NAME = 'idx_price_checks_item_checked_at'
            """,
            (os.getenv("DB_NAME", "price_tracker"),),
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute("CREATE INDEX idx_price_checks_item_checked_at ON price_checks(item_id, checked_at DESC)")

        cursor.execute(
            """
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'items'
            """,
            (os.getenv("DB_NAME", "price_tracker"),),
        )
        columns = {row[0] for row in cursor.fetchall()}
        if "tag" in columns:
            cursor.execute("ALTER TABLE items DROP COLUMN tag")
        if "user_id" not in columns:
            cursor.execute("ALTER TABLE items ADD COLUMN user_id INT NULL")

        cursor.execute(
            """
            SELECT COUNT(1)
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = %s
              AND TABLE_NAME = 'items'
              AND INDEX_NAME = 'idx_items_user_id'
            """,
            (os.getenv("DB_NAME", "price_tracker"),),
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute("CREATE INDEX idx_items_user_id ON items(user_id)")


def create_item(
    user_id: int,
    name: str,
    url: str,
    selector: str,
    selector_type: str,
    currency: str,
) -> int:
    cursor = _execute(
        """
        INSERT INTO items (user_id, name, url, selector, selector_type, currency)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (user_id, name, url, selector, selector_type, currency),
    )
    return int(cursor.lastrowid)


def get_item(item_id: int, user_id: int | None = None) -> dict | None:
    if user_id is None:
        return _execute(
            "SELECT * FROM items WHERE id = ?",
            (item_id,),
            fetch="one",
        )

    return _execute(
        "SELECT * FROM items WHERE id = ? AND user_id = ?",
        (item_id, user_id),
        fetch="one",
    )


def list_items(user_id: int | None = None) -> list[dict]:
    if user_id is None:
        return _execute(
            "SELECT * FROM items ORDER BY created_at DESC",
            fetch="all",
        )

    return _execute(
        "SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
        fetch="all",
    )


def list_items_with_stats(user_id: int) -> list[dict]:
    return _execute(
        """
        SELECT
            i.*,
            latest.price AS current_price,
            latest.checked_at AS last_checked_at,
            min_price.lowest_price
        FROM items i
        LEFT JOIN (
            SELECT pc.item_id, pc.price, pc.checked_at
            FROM price_checks pc
            JOIN (
                SELECT item_id, MAX(checked_at) AS checked_at
                FROM price_checks
                WHERE success = 1
                GROUP BY item_id
            ) latest_per_item
            ON pc.item_id = latest_per_item.item_id
            AND pc.checked_at = latest_per_item.checked_at
        ) latest ON latest.item_id = i.id
        LEFT JOIN (
            SELECT item_id, MIN(price) AS lowest_price
            FROM price_checks
            WHERE success = 1
            GROUP BY item_id
        ) min_price ON min_price.item_id = i.id
        WHERE i.user_id = ?
        ORDER BY i.created_at DESC
        """,
        (user_id,),
        fetch="all",
    )


def insert_price_check(
    item_id: int,
    success: bool,
    price: float | None,
    raw_text: str | None,
    error: str | None,
) -> None:
    _execute(
        """
        INSERT INTO price_checks (item_id, price, raw_text, success, error)
        VALUES (?, ?, ?, ?, ?)
        """,
        (item_id, price, raw_text, 1 if success else 0, error),
    )


def get_item_history(item_id: int, user_id: int, limit: int = 100) -> list[dict]:
    return _execute(
        """
        SELECT pc.*
        FROM price_checks pc
        JOIN items i ON i.id = pc.item_id
        WHERE pc.item_id = ? AND i.user_id = ?
        ORDER BY checked_at DESC
        LIMIT ?
        """,
        (item_id, user_id, limit),
        fetch="all",
    )


def get_item_stats(item_id: int, user_id: int) -> dict[str, Any]:
    row = _execute(
        """
        SELECT
            COUNT(*) AS total_checks,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful_checks,
            MIN(CASE WHEN success = 1 THEN price END) AS lowest_price,
            MAX(CASE WHEN success = 1 THEN price END) AS highest_price
        FROM price_checks pc
        JOIN items i ON i.id = pc.item_id
        WHERE pc.item_id = ? AND i.user_id = ?
        """,
        (item_id, user_id),
        fetch="one",
    )

    if row is None:
        return {
            "total_checks": 0,
            "successful_checks": 0,
            "lowest_price": None,
            "highest_price": None,
        }

    return {
        "total_checks": row["total_checks"] or 0,
        "successful_checks": row["successful_checks"] or 0,
        "lowest_price": row["lowest_price"],
        "highest_price": row["highest_price"],
    }


def delete_item(item_id: int, user_id: int) -> int:
    cursor = _execute(
        "DELETE FROM items WHERE id = ? AND user_id = ?",
        (item_id, user_id),
    )
    return cursor.rowcount


def update_item_currency(item_id: int, currency: str, user_id: int | None = None) -> None:
    if user_id is None:
        _execute(
            "UPDATE items SET currency = ? WHERE id = ?",
            (currency[:8], item_id),
        )
        return

    _execute(
        "UPDATE items SET currency = ? WHERE id = ? AND user_id = ?",
        (currency[:8], item_id, user_id),
    )


def update_item_selector(item_id: int, selector: str, selector_type: str, user_id: int) -> int:
    cursor = _execute(
        "UPDATE items SET selector = ?, selector_type = ? WHERE id = ? AND user_id = ?",
        (selector, selector_type, item_id, user_id),
    )
    return cursor.rowcount


def create_user(email: str, password_hash: str) -> int | None:
    existing = get_user_by_email(email)
    if existing:
        return None

    cursor = _execute(
        "INSERT INTO users (email, password_hash) VALUES (?, ?)",
        (email.lower(), password_hash),
    )
    return int(cursor.lastrowid)


def get_user(user_id: int) -> dict | None:
    return _execute(
        "SELECT * FROM users WHERE id = ?",
        (user_id,),
        fetch="one",
    )


def get_user_by_email(email: str) -> dict | None:
    return _execute(
        "SELECT * FROM users WHERE email = ?",
        (email.lower(),),
        fetch="one",
    )
