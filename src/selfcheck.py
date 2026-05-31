"""
联机前自检脚本

检查项目:
  1. 配置文件存在
  2. 数据库已初始化
  3. 激光 TXT 输出目录可写
  4. 扫码串口配置
  5. 打印机配置
  6. PLC 配置 & 网络可达性

用法:
  python src/selfcheck.py
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from pathlib import Path


def ok(msg: str) -> None:
    print(f"  [OK]    {msg}")


def info(msg: str) -> None:
    print(f"  [INFO]  {msg}")


def warn(msg: str) -> None:
    print(f"  [WARN]  {msg}")


def fail(msg: str) -> None:
    print(f"  [FAIL]  {msg}")


def main() -> None:
    base = Path(__file__).resolve().parent.parent
    print("=" * 50)
    print("  三码合一程序 联机前自检")
    print("=" * 50)
    print()

    # ---- 1. 配置文件 ----
    cfg_path = base / "config.json"
    if cfg_path.is_file():
        ok(f"配置文件存在: {cfg_path.name}")
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            fail(f"config.json 格式错误: {e}")
            return
    else:
        fail(f"配置文件不存在: {cfg_path}")
        return

    # ---- 2. 数据库 ----
    db_path = base / cfg.get("database_path", "data/sanma.db")
    if db_path.is_file():
        ok(f"数据库已初始化: {db_path.name}")
    else:
        warn(f"数据库不存在: {db_path} — 请运行 python src/main.py --init-db")

    # ---- 3. 激光 TXT 输出目录 ----
    laser_cfg = cfg.get("laser", {})
    laser_dir = base / laser_cfg.get("output", {}).get("dir", "output/laser")
    try:
        laser_dir.mkdir(parents=True, exist_ok=True)
        test_file = laser_dir / ".selfcheck_write_test"
        test_file.write_text("test", encoding="utf-8")
        test_file.unlink()
        ok(f"激光 TXT 输出目录可写: {laser_dir}")
    except Exception as e:
        fail(f"激光 TXT 输出目录不可写: {laser_dir} — {e}")

    # ---- 4. 扫码串口 ----
    scanner_cfg = cfg.get("scanner", {})
    serial_cfg = scanner_cfg.get("serial", {})
    com_port = serial_cfg.get("port", "COM3")
    baud = serial_cfg.get("baudRate", 9600)

    if scanner_cfg.get("mode") == "serial" and com_port:
        try:
            import serial as pyserial
            try:
                s = pyserial.Serial(com_port, baud, timeout=1)
                s.close()
                ok(f"扫码串口可用: {com_port} @ {baud}")
            except Exception:
                info(f"扫码串口已配置但不可达: {com_port} — 检查扫码枪是否连接")
        except ImportError:
            info(f"扫码串口: {com_port} (pyserial 未安装，无法验证 — pip install pyserial)")
    else:
        info(f"扫码未配置串口模式")

    # ---- 5. 打印机 ----
    printer_cfg = cfg.get("printer", {})
    printer_mode = printer_cfg.get("mode", "file")
    port_name = printer_cfg.get("portName", "")

    if printer_mode == "usb" and port_name:
        ok(f"打印机 (USB): {port_name}")
    elif printer_mode == "usb" and not port_name:
        warn(f"打印机模式为 USB 但未配置 portName — 请用 wmic printer get Name,PortName 查找后填入 config.json")
    elif printer_mode == "file":
        labels_dir = base / printer_cfg.get("output_dir", "output/labels")
        try:
            labels_dir.mkdir(parents=True, exist_ok=True)
            ok(f"打印机 ZPL 输出目录可写: {labels_dir}")
        except Exception as e:
            fail(f"打印机 ZPL 输出目录不可写: {labels_dir} — {e}")
    else:
        info(f"打印机模式: {printer_mode}")

    # ---- 6. PLC ----
    plc_cfg = cfg.get("plc", {})
    plc_ip = plc_cfg.get("ip", "")
    points = plc_cfg.get("points", {})

    if plc_ip:
        info(f"PLC IP 已配置: {plc_ip}")
        # 尝试 ping
        try:
            result = subprocess.run(
                ["ping", "-n", "1", "-w", "1000", plc_ip],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0:
                ok(f"PLC 可达: {plc_ip}")
            else:
                warn(f"PLC 不可达: {plc_ip} — 检查网线是否插好")
        except Exception:
            warn(f"PLC 不可达: {plc_ip} — ping 失败")
    else:
        warn("PLC IP 未配置")

    if points:
        labels = [p["label"] for p in points.values()]
        info(f"PLC 点位已配置 ({len(points)} 个): {', '.join(points)}")
        for key, pt in points.items():
            print(f"    {key}: {pt['direction']} — {pt['description']}")
    else:
        warn("PLC 点位未配置")

    # ---- 总结 ----
    print()
    print("=" * 50)
    print("  自检完成")
    print("=" * 50)

    if not plc_ip or plc_cfg.get("connected") is False:
        print()
        print("注意: PLC 尚未联机。")
        print("网线插入后请重新运行自检，确认 ping 通后进入联调。")
        print(f"PLC 目标 IP: {plc_ip or '(未配置)'}")


if __name__ == "__main__":
    main()
