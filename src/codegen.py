from __future__ import annotations

import re
from dataclasses import dataclass


CODE_RE = re.compile(r"^[0-9A-Za-z]{22}$")


@dataclass(frozen=True)
class CodeParts:
    barcode_prefix: str
    fixed_code: str
    production_date: str
    serial_no: int

    @property
    def code22(self) -> str:
        return build_code22(
            self.barcode_prefix,
            self.fixed_code,
            self.production_date,
            self.serial_no,
        )


def validate_barcode_prefix(value: str) -> str:
    cleaned = value.strip().upper()
    if not re.fullmatch(r"[0-9A-Z]{9}", cleaned):
        raise ValueError("9位条码号必须由数字或大写字母组成。")
    return cleaned


def validate_fixed_code(value: str) -> str:
    cleaned = value.strip().upper()
    if not re.fullmatch(r"[0-9A-Z]", cleaned):
        raise ValueError("固定码必须是1位数字或大写字母。")
    return cleaned


def validate_date(value: str) -> str:
    cleaned = value.strip()
    if not re.fullmatch(r"\d{8}", cleaned):
        raise ValueError("日期必须为YYYYMMDD格式。")
    return cleaned


def build_code22(
    barcode_prefix: str,
    fixed_code: str,
    production_date: str,
    serial_no: int,
) -> str:
    prefix = validate_barcode_prefix(barcode_prefix)
    fixed = validate_fixed_code(fixed_code)
    date_text = validate_date(production_date)
    if serial_no < 1 or serial_no > 9999:
        raise ValueError("流水号必须在0001到9999之间。")
    return f"{prefix}{fixed}{date_text}{serial_no:04d}"


def parse_code22(code22: str) -> CodeParts:
    cleaned = code22.strip().upper()
    if not CODE_RE.fullmatch(cleaned):
        raise ValueError("22位码格式不正确。")
    return CodeParts(
        barcode_prefix=cleaned[:9],
        fixed_code=cleaned[9],
        production_date=cleaned[10:18],
        serial_no=int(cleaned[18:22]),
    )
