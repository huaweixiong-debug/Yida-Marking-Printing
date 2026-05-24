/**
 * printerAdapter — 标签打印机适配器 (Zebra ZD888T / 兼容 ZPL)
 *
 * 真实模式: file / tcp:9100 / raw_path
 * 当前 mock，返回统一 DeviceResult。
 */
import { DeviceResult } from '../../shared/deviceResult.js';

export class PrinterAdapter {
  constructor() {
    this._mode = 'mock';
    this._host = '';
    this._port = 9100;
    this._rawPath = '';
    this._labelW = 56;
    this._labelH = 20;
    this._dpi = 203;
    this._lastResult = null;
  }

  /** 初始化 */
  init(printerConfig) {
    this._mode = printerConfig.mode || 'mock';
    const tcp = printerConfig.tcp || {};
    this._host = tcp.host || '';
    this._port = tcp.port || 9100;
    this._rawPath = printerConfig.rawPath || '';
    this._labelW = printerConfig.labelWidthMm || 56;
    this._labelH = printerConfig.labelHeightMm || 20;
    this._dpi = printerConfig.dpi || 203;
    return new DeviceResult({ deviceType: 'printer', operation: 'init', ok: true, message: `打印机已初始化 (${this._mode})` });
  }

  /**
   * 下发 ZPL 指令
   * @param {string} zpl — ZPL 指令串
   * @param {object} [meta] — 附加信息如 { code22 }
   * @returns {Promise<DeviceResult>}
   */
  async sendZpl(zpl, meta = {}) {
    const t0 = performance.now();
    try {
      if (this._mode === 'mock') {
        await this._delay(150);
        const elapsed = Math.round(performance.now() - t0);
        return this._ok('sendZpl', `ZPL 已下发 (${zpl.length}B)`, elapsed, meta);
      }
      // 真实模式在此处分发: file / tcp / raw_path
      return DeviceResult.fail('printer', 'sendZpl', '真实打印机模式未实现', 'PRINTER_NOT_IMPL', 0, meta);
    } catch (e) {
      return this._fail('sendZpl', e.message, 'PRINTER_ERROR', Math.round(performance.now() - t0), meta);
    }
  }

  getStatus() {
    return {
      device: 'printer',
      connected: this._mode === 'mock',
      mode: this._mode,
      host: this._host,
      port: this._port,
      label: `${this._labelW}x${this._labelH}mm @${this._dpi}dpi`,
    };
  }

  getLastResult() { return this._lastResult; }

  _ok(op, msg, elapsed, meta) {
    this._lastResult = DeviceResult.ok('printer', op, msg, elapsed, meta);
    return this._lastResult;
  }
  _fail(op, msg, code, elapsed, meta) {
    this._lastResult = DeviceResult.fail('printer', op, msg, code, elapsed, meta);
    return this._lastResult;
  }
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
