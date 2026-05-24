/**
 * scannerAdapter — 扫码枪适配器 (Zebra DS2278 / 兼容)
 *
 * 真实模式: hid 键盘 / serial 串口
 * 当前 mock，按钮模拟扫码。返回统一 DeviceResult。
 */
import { DeviceResult } from '../../shared/deviceResult.js';

export class ScannerAdapter {
  constructor() {
    this._mode = 'mock';
    this._port = '';
    this._baudRate = 9600;
    this._lastScan = null;
    this._history = [];
  }

  /** 初始化 */
  init(scannerConfig) {
    this._mode = scannerConfig.mode || 'mock';
    const serial = scannerConfig.serial || {};
    this._port = serial.port || '';
    this._baudRate = serial.baudRate || 9600;
    return new DeviceResult({ deviceType: 'scanner', operation: 'init', ok: true, message: `扫码枪已初始化 (${this._mode})` });
  }

  /**
   * [mock] 模拟扫码
   * 真实模式时此方法替换为 hid/serial 事件监听
   * @param {string} code22
   * @returns {Promise<DeviceResult>}
   */
  async simulateScan(code22) {
    const t0 = performance.now();
    try {
      if (this._mode === 'mock') {
        await this._delay(100);
        this._lastScan = { code: code22, timestamp: new Date().toISOString(), valid: true };
        this._history.push(this._lastScan);
        const elapsed = Math.round(performance.now() - t0);
        return this._ok('scan', `扫码: ${code22}`, elapsed, { code22 });
      }
      return DeviceResult.fail('scanner', 'scan', '真实扫码枪模式未实现', 'SCANNER_NOT_IMPL', 0, { code22 });
    } catch (e) {
      return this._fail('scan', e.message, 'SCANNER_ERROR', Math.round(performance.now() - t0), { code22 });
    }
  }

  getLastScan() { return this._lastScan; }
  getScanHistory() { return [...this._history]; }
  clearLastScan() { this._lastScan = null; }

  getStatus() {
    return {
      device: 'scanner',
      connected: this._mode === 'mock',
      mode: this._mode,
      port: this._port,
      lastScan: this._lastScan ? this._lastScan.code : '(无)',
    };
  }

  _ok(op, msg, elapsed, meta) {
    this._lastResult = DeviceResult.ok('scanner', op, msg, elapsed, meta);
    return this._lastResult;
  }
  _fail(op, msg, code, elapsed, meta) {
    this._lastResult = DeviceResult.fail('scanner', op, msg, code, elapsed, meta);
    return this._lastResult;
  }
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
