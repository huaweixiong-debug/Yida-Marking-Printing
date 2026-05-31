import { LaserEzcadAdapter } from './device/laserEzcadAdapter.js';
import { PrinterAdapter } from './device/printerAdapter.js';
import { ScannerAdapter } from './device/scannerAdapter.js';
import { Lmc1BridgeClient } from './device/lmc1Bridge.js';

export { LaserEzcadAdapter } from './device/laserEzcadAdapter.js';
export { PrinterAdapter } from './device/printerAdapter.js';
export { ScannerAdapter } from './device/scannerAdapter.js';
export { Lmc1BridgeClient } from './device/lmc1Bridge.js';

/**
 * deviceAdapterBlock
 *
 * 当前主方案：
 * - 激光：导出 TXT 文件
 * - PLC：通过 IO 点触发装有驱动卡的电脑执行激光打码
 * - 打印机/扫码枪：保留 mock/后续真实适配结构
 *
 * 旧 bridge 客户端保留为历史参考，但默认强制 mock，不再参与主执行路径。
 */
export class DeviceAdapterBlock {
  constructor() {
    this.bridge = new Lmc1BridgeClient();
    this.laser = new LaserEzcadAdapter(this.bridge);
    this.printer = new PrinterAdapter();
    this.scanner = new ScannerAdapter();
  }

  async load(configUrl = '../config/devices.json') {
    const resp = await fetch(configUrl);
    const cfg = await resp.json();

    this.bridge.setForceMock(true);
    this.laser.init(cfg.laserEzcad || {});
    this.printer.init(cfg.printer || {});
    this.scanner.init(cfg.scanner || {});
  }

  enableRealBridge() {
    this.bridge.setForceMock(false);
  }

  getAllStatus() {
    return {
      laser: this.laser.getStatus(),
      printer: this.printer.getStatus(),
      scanner: this.scanner.getStatus(),
    };
  }
}
