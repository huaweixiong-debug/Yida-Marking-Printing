from __future__ import annotations

import csv
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from codegen import build_code22, validate_barcode_prefix, validate_fixed_code


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def today_text() -> str:
    return datetime.now().strftime("%Y%m%d")


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.execute("PRAGMA journal_mode = WAL")

    def close(self) -> None:
        with self._lock:
            self.conn.close()

    def initialize(self) -> None:
        with self._lock:
            self.conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS product_model (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    barcode_prefix TEXT NOT NULL,
                    fixed_code TEXT NOT NULL,
                    label_template TEXT NOT NULL DEFAULT 'default',
                    laser_template TEXT NOT NULL DEFAULT 'default',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    remark TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS serial_counter (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_id INTEGER NOT NULL REFERENCES product_model(id),
                    production_date TEXT NOT NULL,
                    current_serial INTEGER NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(model_id, production_date)
                );

                CREATE TABLE IF NOT EXISTS production_record (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_id INTEGER NOT NULL REFERENCES product_model(id),
                    model_name TEXT NOT NULL,
                    code22 TEXT NOT NULL UNIQUE,
                    barcode_prefix TEXT NOT NULL,
                    fixed_code TEXT NOT NULL,
                    production_date TEXT NOT NULL,
                    serial_no INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    operator TEXT NOT NULL,
                    print_time TEXT,
                    laser_time TEXT,
                    complete_time TEXT,
                    reprint_count INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(model_id, production_date, serial_no)
                );

                CREATE TABLE IF NOT EXISTS reprint_record (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    production_id INTEGER NOT NULL REFERENCES production_record(id),
                    code22 TEXT NOT NULL,
                    reprint_index INTEGER NOT NULL,
                    operator TEXT NOT NULL,
                    reason TEXT NOT NULL DEFAULT '',
                    printed_at TEXT NOT NULL,
                    result_message TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS device_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_type TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    response TEXT NOT NULL DEFAULT '',
                    elapsed_ms INTEGER NOT NULL DEFAULT 0,
                    result TEXT NOT NULL,
                    error TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS alarm_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alarm_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    recovered_at TEXT,
                    operator TEXT NOT NULL DEFAULT ''
                );

                CREATE INDEX IF NOT EXISTS idx_production_query
                    ON production_record(model_name, production_date, serial_no);
                CREATE INDEX IF NOT EXISTS idx_device_log_created
                    ON device_log(created_at);
                CREATE INDEX IF NOT EXISTS idx_alarm_log_created
                    ON alarm_log(occurred_at);
                """
            )
            self.conn.commit()

    def seed_defaults(self) -> None:
        if self.list_models(include_disabled=True):
            return
        self.add_model(
            name="示例型号",
            barcode_prefix="123456789",
            fixed_code="A",
            remark="首次运行自动创建，可修改或停用。",
        )

    def _row_to_dict(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return dict(row)

    def list_models(self, include_disabled: bool = False) -> list[dict[str, Any]]:
        sql = "SELECT * FROM product_model"
        params: list[Any] = []
        if not include_disabled:
            sql += " WHERE enabled = 1"
        sql += " ORDER BY enabled DESC, name ASC"
        with self._lock:
            return [dict(row) for row in self.conn.execute(sql, params).fetchall()]

    def get_model(self, model_id: int) -> dict[str, Any] | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT * FROM product_model WHERE id = ?",
                (model_id,),
            ).fetchone()
            return self._row_to_dict(row)

    def add_model(
        self,
        name: str,
        barcode_prefix: str,
        fixed_code: str,
        remark: str = "",
    ) -> int:
        model_name = name.strip()
        if not model_name:
            raise ValueError("型号名称不能为空。")
        prefix = validate_barcode_prefix(barcode_prefix)
        fixed = validate_fixed_code(fixed_code)
        ts = now_text()
        with self._lock:
            cur = self.conn.execute(
                """
                INSERT INTO product_model
                    (name, barcode_prefix, fixed_code, remark, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (model_name, prefix, fixed, remark.strip(), ts, ts),
            )
            self.conn.commit()
            return int(cur.lastrowid)

    def update_model(
        self,
        model_id: int,
        name: str,
        barcode_prefix: str,
        fixed_code: str,
        remark: str,
        enabled: bool,
    ) -> None:
        model_name = name.strip()
        if not model_name:
            raise ValueError("型号名称不能为空。")
        prefix = validate_barcode_prefix(barcode_prefix)
        fixed = validate_fixed_code(fixed_code)
        with self._lock:
            self.conn.execute(
                """
                UPDATE product_model
                SET name = ?, barcode_prefix = ?, fixed_code = ?, remark = ?,
                    enabled = ?, updated_at = ?
                WHERE id = ?
                """,
                (model_name, prefix, fixed, remark.strip(), 1 if enabled else 0, now_text(), model_id),
            )
            self.conn.commit()

    def generate_production_record(
        self,
        model_id: int,
        operator: str,
        serial_max: int = 9999,
    ) -> dict[str, Any]:
        op = operator.strip() or "UNKNOWN"
        production_date = today_text()
        with self._lock:
            cur = self.conn.cursor()
            cur.execute("BEGIN IMMEDIATE")
            try:
                model = cur.execute(
                    "SELECT * FROM product_model WHERE id = ? AND enabled = 1",
                    (model_id,),
                ).fetchone()
                if model is None:
                    raise ValueError("型号不存在或已停用。")

                counter = cur.execute(
                    """
                    SELECT * FROM serial_counter
                    WHERE model_id = ? AND production_date = ?
                    """,
                    (model_id, production_date),
                ).fetchone()
                next_serial = 1 if counter is None else int(counter["current_serial"]) + 1
                if next_serial > serial_max:
                    raise ValueError("当天该型号流水号已超过9999，请联系工程师处理。")

                code22 = build_code22(
                    model["barcode_prefix"],
                    model["fixed_code"],
                    production_date,
                    next_serial,
                )
                ts = now_text()
                if counter is None:
                    cur.execute(
                        """
                        INSERT INTO serial_counter
                            (model_id, production_date, current_serial, updated_at)
                        VALUES (?, ?, ?, ?)
                        """,
                        (model_id, production_date, next_serial, ts),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE serial_counter
                        SET current_serial = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (next_serial, ts, counter["id"]),
                    )

                cur.execute(
                    """
                    INSERT INTO production_record
                        (model_id, model_name, code22, barcode_prefix, fixed_code,
                         production_date, serial_no, status, operator, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        model_id,
                        model["name"],
                        code22,
                        model["barcode_prefix"],
                        model["fixed_code"],
                        production_date,
                        next_serial,
                        "CREATED",
                        op,
                        ts,
                        ts,
                    ),
                )
                record_id = int(cur.lastrowid)
                self.conn.commit()
            except Exception:
                self.conn.rollback()
                raise
            return self.get_record(record_id) or {}

    def get_record(self, record_id: int) -> dict[str, Any] | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT * FROM production_record WHERE id = ?",
                (record_id,),
            ).fetchone()
            return self._row_to_dict(row)

    def mark_lasered(self, record_id: int) -> None:
        self._update_record_status(record_id, status="LASERED", laser_time=now_text())

    def mark_printed(self, record_id: int) -> None:
        self._update_record_status(record_id, status="PRINTED", print_time=now_text())

    def mark_completed(self, record_id: int) -> None:
        self._update_record_status(record_id, status="COMPLETED", complete_time=now_text())

    def mark_failed(self, record_id: int, message: str) -> None:
        self._update_record_status(record_id, status="FAILED", error_message=message)

    def _update_record_status(self, record_id: int, status: str, **fields: Any) -> None:
        assignments = ["status = ?", "updated_at = ?"]
        params: list[Any] = [status, now_text()]
        for key, value in fields.items():
            assignments.append(f"{key} = ?")
            params.append(value)
        params.append(record_id)
        sql = f"UPDATE production_record SET {', '.join(assignments)} WHERE id = ?"
        with self._lock:
            self.conn.execute(sql, params)
            self.conn.commit()

    def add_reprint(
        self,
        production_id: int,
        operator: str,
        reason: str,
        result_message: str,
    ) -> int:
        with self._lock:
            cur = self.conn.cursor()
            cur.execute("BEGIN IMMEDIATE")
            try:
                record = cur.execute(
                    "SELECT * FROM production_record WHERE id = ?",
                    (production_id,),
                ).fetchone()
                if record is None:
                    raise ValueError("生产记录不存在。")
                next_index = int(record["reprint_count"]) + 1
                ts = now_text()
                cur.execute(
                    """
                    UPDATE production_record
                    SET reprint_count = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (next_index, ts, production_id),
                )
                cur.execute(
                    """
                    INSERT INTO reprint_record
                        (production_id, code22, reprint_index, operator, reason,
                         printed_at, result_message)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        production_id,
                        record["code22"],
                        next_index,
                        operator.strip() or "UNKNOWN",
                        reason.strip(),
                        ts,
                        result_message,
                    ),
                )
                self.conn.commit()
                return next_index
            except Exception:
                self.conn.rollback()
                raise

    def search_records(
        self,
        model_name: str = "",
        date_text_value: str = "",
        code22: str = "",
        limit: int = 300,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if model_name:
            clauses.append("model_name LIKE ?")
            params.append(f"%{model_name.strip()}%")
        if date_text_value:
            clauses.append("production_date = ?")
            params.append(date_text_value.strip())
        if code22:
            clauses.append("code22 LIKE ?")
            params.append(f"%{code22.strip().upper()}%")

        sql = "SELECT * FROM production_record"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        with self._lock:
            return [dict(row) for row in self.conn.execute(sql, params).fetchall()]

    def recent_records(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT * FROM production_record ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(row) for row in rows]

    def add_device_log(
        self,
        device_type: str,
        direction: str,
        payload: str,
        response: str,
        elapsed_ms: int,
        result: str,
        error: str = "",
    ) -> None:
        with self._lock:
            self.conn.execute(
                """
                INSERT INTO device_log
                    (device_type, direction, payload, response, elapsed_ms,
                     result, error, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (device_type, direction, payload, response, elapsed_ms, result, error, now_text()),
            )
            self.conn.commit()

    def add_alarm(self, alarm_type: str, message: str, operator: str = "") -> None:
        with self._lock:
            self.conn.execute(
                """
                INSERT INTO alarm_log (alarm_type, message, occurred_at, operator)
                VALUES (?, ?, ?, ?)
                """,
                (alarm_type, message, now_text(), operator.strip()),
            )
            self.conn.commit()

    def list_device_logs(self, limit: int = 200) -> list[dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT * FROM device_log ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(row) for row in rows]

    def list_alarms(self, limit: int = 200) -> list[dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT * FROM alarm_log ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(row) for row in rows]

    def export_records_csv(self, rows: Iterable[dict[str, Any]], target: Path) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        fieldnames = [
            "id",
            "model_name",
            "code22",
            "production_date",
            "serial_no",
            "status",
            "operator",
            "print_time",
            "laser_time",
            "complete_time",
            "reprint_count",
            "error_message",
            "created_at",
        ]
        with target.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
