/**
 * deviceAdapterBlock — 设备统一适配聚合层
 *
 * 页面层只通过此模块访问所有设备，不直接碰底层适配器细节。
 *
 * 三个子适配器（各自独立文件）:
 *   device/laserEzcadAdapter.js — 激光打码 (32位 Lmc1.dll)
 *   device/printerAdapter.js    — 标签打印机 (Zebra ZPL)
 *   device/scannerAdapter.js    — 扫码枪 (HID/Serial)
 *
 * 使用方式:
 *   const dev = new DeviceAdapterBlock();
 *   await dev.load(configUrl);
 *   const result = await dev.laser.startMark({ code22 });
 *   dev.getAllStatus();  // 供页面设备状态区使用
 */
import { LaserEzcadAdapter } from './device/laserEzcadAdapter.js';
import { PrinterAdapter } from './device/printerAdapter.js';
import { ScannerAdapter } from './device/scannerAdapter.js';
import { Lmc1BridgeClient } from './device/lmc1Bridge.js';

// 重新导出供外部直接引用（不破坏已有 import 路径）
export { LaserEzcadAdapter } from './device/laserEzcadAdapter.js';
export { PrinterAdapter } from './device/printerAdapter.js';
export { ScannerAdapter } from './device/scannerAdapter.js';
export { Lmc1BridgeClient } from './device/lmc1Bridge.js';

export class DeviceAdapterBlock {
  constructor() {
    this.bridge = new Lmc1BridgeClient();
    this.laser = new LaserEzcadAdapter(this.bridge);
    this.printer = new PrinterAdapter();
    this.scanner = new ScannerAdapter();
  }

  /** 从 devices.json 加载配置并初始化所有设备 */
  async load(configUrl = '../config/devices.json') {
    const resp = await fetch(configUrl);
    const cfg = await resp.json();
    this.laser.init(cfg.laserEzcad || {});
    this.printer.init(cfg.printer || {});
    this.scanner.init(cfg.scanner || {});
  }

  /** 切换桥接到真实模式（未来联调时调用） */
  enableRealBridge() {
    this.bridge.setForceMock(false);
  }

  /** 获取所有设备状态（供 uiDevice 区域使用） */
  getAllStatus() {
    return {
      laser: this.laser.getStatus(),
      printer: this.printer.getStatus(),
      scanner: this.scanner.getStatus(),
    };
  }
}
