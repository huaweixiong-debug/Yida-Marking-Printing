from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    "app_name": "重汽三码合一程序",
    "database_path": "data/sanma.db",
    "operator_default": "OP001",
    "production": {
        "serial_start": 1,
        "serial_max": 9999,
        "serial_scope": "model_date",
        "allow_reprint_current_only": True,
    },
    "printer": {
        "mode": "file",
        "output_dir": "output/labels",
        "tcp_host": "192.168.1.50",
        "tcp_port": 9100,
        "raw_path": "",
        "dpi": 203,
        "label_width_mm": 56,
        "label_height_mm": 20,
    },
    "laser": {
        "mode": "file",
        "output_dir": "output/laser",
        "tcp_host": "192.168.1.60",
        "tcp_port": 5000,
        "raw_command_template": "{code22}",
    },
    "scanner": {
        "required_for_verify": False,
    },
}


def deep_merge(default: dict[str, Any], custom: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(default)
    for key, value in custom.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_config(base_dir: Path) -> dict[str, Any]:
    config_path = base_dir / "config.json"
    if not config_path.exists():
        config_path.write_text(
            json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return deepcopy(DEFAULT_CONFIG)

    custom = json.loads(config_path.read_text(encoding="utf-8"))
    return deep_merge(DEFAULT_CONFIG, custom)
