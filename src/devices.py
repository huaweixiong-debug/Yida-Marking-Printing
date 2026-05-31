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
            elif mode == "usb":
                # 候选方案：通过 Windows 设备路径直接写入 ZPL。
                # 用 wmic printer get Name,PortName 查看 USB 端口号（通常 USB001）。
                # 注意：此方法待现场 Zebra 打印机实测验证。部分环境下 PortName 不可直接作为文件句柄。
                port_name = self.config.get("portName", "")
                if not port_name:
                    raise ValueError(
                        "printer.portName 未配置。请用 wmic printer get Name,PortName 查找 "
                        "Zebra 打印机对应的 USB 端口号（如 USB001），填入 config.json。"
                    )
                device_path = f"\\\\.\\{port_name}"
                try:
                    with open(device_path, "wb") as f:
                        f.write(zpl.encode("utf-8"))
                    response = f"Sent to USB printer: {device_path}"
                except (FileNotFoundError, PermissionError, OSError) as e:
                    raise ValueError(
                        f"USB 打印失败 ({device_path}): {e}。"
                        "该方案为候选实现，待现场验证。如不稳定请改用 raw_path 或 file 模式。"
                    )
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
    """
    激光适配器 — 当前主方案：PLC IO 触发 + TXT 文件交接。

    软件侧只负责把打码内容导出为结构化 TXT 文件。
    PLC 通过 IO 点触发装有激光驱动卡的电脑读取 TXT 并执行打码。

    文件命名规则: {filePrefix}_{stationPrefix}_{code22}_{timestamp}.txt
    示例: laser_mark_s1_123456789A202605240001_20260527_103015.txt
    """

    def __init__(self, base_dir: Path, config: dict[str, Any]):
        self.base_dir = base_dir
        self.config = config
        self._output_config = config.get("output", {})
        self._template = config.get("template", {})

    def mark(
        self,
        code22: str,
        model_name: str = "",
        *,
        business_mode: str = "",
        mark_type: str = "station1",
        template_name: str = "",
        variables: dict[str, Any] | None = None,
        permanent_text: str = "",
    ) -> DeviceResult:
        """
        导出激光打码 TXT 文件。

        :param code22:       22位统一码
        :param model_name:   型号名
        :param business_mode: 业务模式 (LASER_QR / PERMANENT_MARK 等)
        :param mark_type:    打码类型 (station1 / station2)
        :param template_name: 模板名称
        :param variables:    打码变量键值对 (code22 / customerPartNo / supplierCode / ...)
        :param permanent_text: 永久性标识文本 (工位二使用)
        """
        started = time.perf_counter()
        mode = str(self.config.get("mode", "txt-file")).lower()
        payload = ""
        try:
            if mode == "none":
                response = "Laser skipped by config."
            elif mode in ("txt-file", "file"):
                payload = self._build_txt_payload(
                    code22=code22,
                    model_name=model_name,
                    business_mode=business_mode,
                    mark_type=mark_type,
                    template_name=template_name,
                    variables=variables,
                    permanent_text=permanent_text,
                )
                output_dir = self.base_dir / self._output_config.get("dir", "output/laser")
                output_dir.mkdir(parents=True, exist_ok=True)
                file_name = self._build_file_name(code22, mark_type)
                target = output_dir / file_name
                target.write_text(payload, encoding="utf-8")
                response = f"Laser TXT saved: {target}"
            elif mode == "tcp":
                host = self.config.get("legacy", {}).get("tcp_host", self.config.get("tcp_host", ""))
                port = int(self.config.get("legacy", {}).get("tcp_port", self.config.get("tcp_port", 5000)))
                payload = self._build_txt_payload(
                    code22=code22, model_name=model_name,
                    business_mode=business_mode, mark_type=mark_type,
                    template_name=template_name, variables=variables,
                    permanent_text=permanent_text,
                )
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

    def _build_txt_payload(
        self, code22, model_name, business_mode, mark_type,
        template_name, variables, permanent_text,
    ) -> str:
        """构造结构化 TXT 内容"""
        generated_at = time.strftime("%Y-%m-%dT%H:%M:%S")
        output_dir = str(self._output_config.get("dir", "output/laser"))
        workflow = self.config.get("workflow", "PLC_IO_TXT")
        mode = self.config.get("mode", "txt-file")

        lines: list[str] = []
        header = self._template.get("header", [])
        if header:
            for line in header:
                lines.append(line.format(
                    generatedAt=generated_at, mode=mode, workflow=workflow,
                    code22=code22, modelName=model_name,
                    businessMode=business_mode, markType=mark_type,
                    template=template_name,
                ))
        else:
            lines.append(f"code22={code22}")
            lines.append(f"modelName={model_name}")

        # 变量区
        if variables:
            lines.append("")
            lines.append("[variables]")
            line_tpl = self._template.get("variableLine", "{key}={value}")
            for key, value in variables.items():
                lines.append(line_tpl.format(key=key, value=str(value if value is not None else "")))

        # 永久性标识文本（工位二）
        if permanent_text:
            lines.append("")
            lines.append("[permanent_mark]")
            lines.append(f"text={permanent_text}")

        # 尾部
        footer = self._template.get("footer", [])
        if footer:
            lines.append("")
            for line in footer:
                lines.append(line.format(outputDir=output_dir))

        return "\n".join(lines)

    def _build_file_name(self, code22: str, mark_type: str) -> str:
        """构造 TXT 文件名"""
        prefix = self._output_config.get("filePrefix", "laser_mark")
        station_prefix = self._output_config.get(
            "station2Prefix" if mark_type == "station2" else "station1Prefix",
            "s2" if mark_type == "station2" else "s1",
        )
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        return f"{prefix}_{station_prefix}_{code22}_{timestamp}.txt"
