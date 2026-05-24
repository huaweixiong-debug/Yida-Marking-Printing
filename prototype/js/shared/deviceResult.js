/**
 * DeviceResult — 统一设备操作结果结构
 *
 * 所有设备适配器（laser / printer / scanner）的返回值均使用此结构。
 * mock 和真实调用共用，traceLogBlock 和页面层无需区分来源。
 */

// ===== 错误码常量 =====
export const DEVICE_ERRORS = {
  // Lmc1.dll 层
  LMC1_0001: 'Lmc1.dll 文件未找到',
  LMC1_0002: 'Lmc1.dll 加载失败',
  LMC1_0003: 'Lmc1.dll 初始化失败',
  LMC1_1001: '打码超时',
  LMC1_1002: '打码执行失败',
  LMC1_1003: '模板变量未设置或格式错误',
  LMC1_2001: '红框定位失败',
  LMC1_3001: '模板文件未找到',
  LMC1_3002: '模板加载失败',
  LMC1_9001: '未知命令',
  LMC1_9999: '桥接进程内部异常',
  // 桥接通信层
  BRIDGE_0001: '桥接进程未运行 (连接被拒绝)',
  BRIDGE_0002: '桥接通信超时',
  BRIDGE_0003: '桥接响应格式错误',
  BRIDGE_0004: '响应 ID 不匹配',
  // 通用
  DEVICE_NOT_IMPL: '设备真实模式未实现',
  DEVICE_MOCK: 'Mock 模式返回',
  DEVICE_TIMEOUT: '设备操作超时',
  DEVICE_UNKNOWN: '未知设备错误',
};

export class DeviceResult {
  /**
   * @param {object} opts
   * @param {string} opts.deviceType   — 'laserEzcad' | 'printer' | 'scanner'
   * @param {string} opts.operation    — 'init' | 'redLight' | 'startMark' | 'loadTemplate' | 'sendZpl' | 'scan' | ...
   * @param {boolean} opts.ok          — 是否成功
   * @param {string} [opts.message]
   * @param {number} [opts.elapsedMs]
   * @param {string} [opts.errorCode]  — 错误码，见 DEVICE_ERRORS
   * @param {string} [opts.errorDetail]
   * @param {string} [opts.source]     — 'mock' | 'real' | 'real_error'
   * @param {*} [opts.rawResult]       — 原始返回数据
   * @param {object} [opts.meta]       — { code22, recordId, ... }
   */
  constructor(opts = {}) {
    this.timestamp = new Date().toISOString();
    this.deviceType = opts.deviceType || 'unknown';
    this.operation = opts.operation || 'unknown';
    this.ok = Boolean(opts.ok);
    this.message = opts.message || (this.ok ? 'OK' : 'FAIL');
    this.elapsedMs = opts.elapsedMs ?? 0;
    this.errorCode = opts.errorCode || '';
    this.errorDetail = opts.errorDetail || '';
    this.source = opts.source || 'unknown';   // 'mock' | 'real' | 'real_error'
    this.rawResult = opts.rawResult ?? null;
    this.meta = opts.meta || {};
  }

  /** 是否为 mock 响应 */
  isMock() { return this.source === 'mock'; }
  /** 是否为真实设备响应 */
  isReal() { return this.source === 'real'; }
  /** 是否尝试了真实连接但失败 */
  isRealError() { return this.source === 'real_error'; }

  static ok(deviceType, operation, message = 'OK', elapsedMs = 0, meta = {}, source = 'mock') {
    return new DeviceResult({ deviceType, operation, ok: true, message, elapsedMs, meta, source });
  }

  static fail(deviceType, operation, message, errorCode = '', elapsedMs = 0, meta = {}, source = 'mock') {
    return new DeviceResult({ deviceType, operation, ok: false, message, errorCode, errorDetail: message, elapsedMs, meta, source });
  }

  /** 转为 traceLogBlock 设备日志条目 */
  toLogEntry() {
    return {
      timestamp: this.timestamp,
      deviceType: this.deviceType,
      operation: this.operation,
      direction: 'OUT',
      result: this.ok ? 'OK' : 'FAIL',
      elapsedMs: this.elapsedMs,
      message: this.message,
      errorCode: this.errorCode,
      source: this.source,
      code22: this.meta.code22 || '',
    };
  }
}
