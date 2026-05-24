/**
 * Lmc1BridgeClient — EZCAD Lmc1.dll 32位桥接客户端
 *
 * === 技术路线 ===
 * Node 主程序 ←(HTTP POST JSON)→ 32位桥接进程 ←(LoadLibrary)→ Lmc1.dll (C++ 导出, x86)
 *
 * 协议已固定: HTTP POST http://127.0.0.1:9701/api → JSON 响应
 * 协议定义: config/bridge-protocol.json
 *
 * === 通信模式 ===
 * 1. REAL  — fetch() HTTP POST 到 bridge，连接失败返回 BRIDGE_0001
 * 2. MOCK  — 不尝试连接，直接返回模拟结果
 *
 * === 使用方式 ===
 *   const bridge = new Lmc1BridgeClient();
 *   bridge.configure({ host: '127.0.0.1', port: 9701 });
 *   const resp = await bridge.send('Mark', { variables: {...} });
 *   // resp.source: 'real' | 'mock' | 'real_error'
 */
export class Lmc1BridgeClient {
  constructor() {
    this._host = '127.0.0.1';
    this._port = 9701;
    this._timeoutMs = 5000;       // 连接超时 5s
    this._reqCounter = 0;
    this._state = 'DISCONNECTED'; // DISCONNECTED | CONNECTED | ERROR | MOCK
    this._forceMock = false;      // 默认真实请求优先；bridge 不可用时自动回退 mock
    this._lastCallSource = null;  // 'real' | 'mock' | 'real_error'
    this._lastError = null;
  }

  configure(opts = {}) {
    this._host = opts.host || '127.0.0.1';
    this._port = opts.port || 9701;
    this._timeoutMs = opts.timeoutMs || 5000;
    this._forceMock = opts.forceMock !== undefined ? opts.forceMock : this._forceMock;
  }

  /**
   * 发送命令
   * @param {string} cmd
   * @param {object} params
   * @returns {Promise<{id:string, ok:boolean, source:string, data?:object, error?:{code:string, message:string}}>}
   */
  async send(cmd, params = {}) {
    const id = `lmc1-${++this._reqCounter}`;

    // --- 尝试真实连接 ---
    if (!this._forceMock) {
      try {
        const realResp = await this._realSend(id, cmd, params);
        this._state = 'CONNECTED';
        this._lastCallSource = 'real';
        return realResp;
      } catch (e) {
        this._lastError = e.message;
        this._lastCallSource = 'real_error';
        // 返回明确的桥接不可用错误，由上层决定是否 fallback
        return {
          id, ok: false, source: 'real_error',
          error: { code: e.code || 'BRIDGE_0001', message: e.message },
        };
      }
    }

    // --- Mock 模式 ---
    this._state = 'MOCK';
    this._lastCallSource = 'mock';
    const mockResp = this._mockSend(id, cmd, params);
    mockResp.source = 'mock';
    return mockResp;
  }

  /**
   * 真实 TCP/HTTP 通信
   * 浏览器环境用 fetch，Node 环境用 net 模块
   * 当前实现: fetch to http://host:port (桥接进程需实现 HTTP 接口)
   */
  async _realSend(id, cmd, params) {
    const url = `http://${this._host}:${this._port}/api`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this._timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, cmd, params }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = new Error(`桥接返回 HTTP ${response.status}`);
        err.code = 'BRIDGE_0003';
        throw err;
      }

      const data = await response.json();
      data.source = 'real';
      return data;
    } catch (e) {
      if (e.name === 'AbortError') {
        const err = new Error(`桥接通信超时 (${this._timeoutMs}ms)`);
        err.code = 'BRIDGE_0002';
        throw err;
      }
      if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        const err = new Error(`桥接进程未运行: ${this._host}:${this._port}`);
        err.code = 'BRIDGE_0001';
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Mock 响应生成
   */
  _mockSend(id, cmd, params) {
    switch (cmd) {
      case 'Ping':
        return { id, ok: true, source: 'mock', data: { pong: true, uptimeSeconds: 0 } };
      case 'Init':
        return { id, ok: true, source: 'mock', data: { message: '桥接已初始化 (mock)', dllLoaded: true } };
      case 'LoadTemplate':
        return { id, ok: true, source: 'mock', data: { message: `模板已加载 (mock): ${params.path || ''}` } };
      case 'SetVariables':
        return { id, ok: true, source: 'mock', data: { message: '变量已设置 (mock)', count: Object.keys(params.variables || {}).length } };
      case 'RedLight':
        return { id, ok: true, source: 'mock', data: { message: '红框定位已显示 (mock)' } };
      case 'StartMark':
        return { id, ok: true, source: 'mock', data: { message: '打码完成 (mock)', markCount: 1, elapsedMs: 500 } };
      case 'GetStatus':
        return { id, ok: true, source: 'mock', data: { state: 'READY', dllLoaded: true, templateLoaded: '(mock)', lastError: null } };
      case 'GetLastResult':
        return { id, ok: true, source: 'mock', data: { lastMarkOk: true, lastMarkMessage: '(mock)', lastMarkTime: new Date().toISOString() } };
      case 'Reset':
        return { id, ok: true, source: 'mock', data: { message: '已重置 (mock)' } };
      case 'Shutdown':
        this._state = 'DISCONNECTED';
        return { id, ok: true, source: 'mock', data: { message: '桥接已关闭 (mock)' } };
      default:
        return { id, ok: false, source: 'mock', error: { code: 'LMC1_9001', message: `未知命令: ${cmd}` } };
    }
  }

  /** 强制模式切换 */
  setForceMock(force) { this._forceMock = force; }

  /** 获取上一次调用的来源 */
  getLastCallSource() { return this._lastCallSource; }

  /** 获取最后一次错误 */
  getLastError() { return this._lastError; }

  getStatus() {
    return {
      bridge: `${this._host}:${this._port}`,
      state: this._state,
      forceMock: this._forceMock,
      lastCallSource: this._lastCallSource,
      lastError: this._lastError,
      arch: 'x86',
      dll: 'Lmc1.dll (32位)',
      supportDlls: ['LMCMIO.dll', 'DataMgr.dll'],
    };
  }

  isConnected() { return this._state === 'CONNECTED'; }
}
