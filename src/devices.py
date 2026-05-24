from __future__ import annotations

import socket
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class DeviceResult:
    device_type: str
    payload: str
    response: str
    elapsed_ms: int
    ok: bool
    error: str = ""

    @property
    def result_text(self) -> str:
        return "OK" if self.ok else "FAIL"


class PrinterAdapter:
    def __init__(self, base_dir: Path, config: dict[str, Any]):
        self.base_dir = base_dir
        self.config = config

    def send(self, zpl: str, code22: str) -> DeviceResult:
        started = time.perf_counter()
        mode = str(self.config.get("mode", "file")).lower()
        try:
            if mode == "file":
                output_dir = self.base_dir / self.config.get("output_dir", "output/labels")
                output_dir.mkdir(parents=True, exist_ok=True)
                target = output_dir / f"{code22}_{time.strftime('%Y%m%d_%H%M%S')}.zpl"
                target.write_text(zpl, encoding="utf-8")
                response = f"ZPL saved: {target}"
            elif mode == "tcp":
                host = self.config["tcp_host"]
                port = int(self.config.get("tcp_port", 9100))
                with socket.create_connection((host, port), timeout=5) as sock:
                    sock.sendall(zpl.encode("utf-8"))
                response = f"Sent to {host}:{port}"
            elif mode == "raw_path":
                raw_path = self.config.get("raw_path", "")
                if not raw_path:
                    raise ValueError("printer.raw_path未配置。")
                with open(raw_path, "wb") as f:
                    f.write(zpl.encode("utf-8"))
                response = f"Written to {raw_path}"
            else:
                raise ValueError(f"不支持的打印模式: {mode}")
            elapsed = int((time.perf_counter() - started) * 1000)
            return DeviceResult("printer", zpl, response, elapsed, True)
        except Exception as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            return DeviceResult("printer", zpl, "", elapsed, False, str(exc))


class LaserAdapter:
    def __init__(self, base_dir: Path, config: dict[str, Any]):
        self.base_dir = base_dir
        self.config = config

    def mark(self, code22: str, model_name: str) -> DeviceResult:
        template = str(self.config.get("raw_command_template", "{code22}"))
        payload = template.format(code22=code22, model_name=model_name)
        started = time.perf_counter()
        mode = str(self.config.get("mode", "file")).lower()
        try:
            if mode == "none":
                response = "Laser skipped by config."
            elif mode == "file":
                output_dir = self.base_dir / self.config.get("output_dir", "output/laser")
                output_dir.mkdir(parents=True, exist_ok=True)
                target = output_dir / f"{code22}_{time.strftime('%Y%m%d_%H%M%S')}.txt"
                target.write_text(payload, encoding="utf-8")
                response = f"Laser command saved: {target}"
            elif mode == "tcp":
                host = self.config["tcp_host"]
                port = int(self.config.get("tcp_port", 5000))
                with socket.create_connection((host, port), timeout=5) as sock:
                    sock.sendall(payload.encode("utf-8"))
                    try:
                        response = sock.recv(4096).decode("utf-8", errors="ignore")
                    except socket.timeout:
                        response = ""
                if not response:
                    response = f"Sent to {host}:{port}"
            else:
                raise ValueError(f"不支持的激光模式: {mode}")
            elapsed = int((time.perf_counter() - started) * 1000)
            return DeviceResult("laser", payload, response, elapsed, True)
        except Exception as exc:
            elapsed = int((time.perf_counter() - started) * 1000)
            return DeviceResult("laser", payload, "", elapsed, False, str(exc))
