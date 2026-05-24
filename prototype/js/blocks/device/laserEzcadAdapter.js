/**
 * laserEzcadAdapter — 激光打码设备适配器
 *
 * 对接 EZCAD 的 Lmc1.dll（32位 x86）。
 * 配套库: LMCMIO.dll / DataMgr.dll，均位于 Ezcad2.14.11 目录。
 *
 * 职责：激光设备的初始化、模板加载、变量赋值、红光定位、打码控制。
 * 不依赖页面层，不依赖其他 block。
 *
 * === 32位 Lmc1.dll 调用方案 ===
 *
 * 架构: Node 主程序 ←(TCP JSON)→ 32位桥接进程 → Lmc1.dll
 *
 * 三层结构:
 *   1. 主程序层 (Node)         — laserEzcadAdapter，发送 JSON 命令，接收结果
 *   2. 桥接通信层 (TCP/IPC)    — Lmc1BridgeClient，协议编解码、超时、重连
 *   3. Lmc1.dll 调用层 (C#/C++) — 独立 32 位进程，加载 Lmc1.dll 执行打码
 *
 * 原因:
 *   - Lmc1.dll 是 32 位 x86，Node 主进程可能是 64 位
 *   - EZCAD DLL 依赖自有 UI 线程（红框预览窗口）
 *   - DLL 崩溃不影响主进程，桥接进程可独立重启
 *   - 桥接进程编译为 32 位 x86，与 Lmc1.dll 同架构
 *
 * === 接口契约 ===
 *
 * 生命周期:
 *   init(config)     → UNINIT → INIT
 *   loadTemplate(p)  → 加载 .ezd 模板
 *   setVariables     → 设置模板变量
 *   redLightPosition → F1 红光定位
 *   startMark        → F2 执行打码
 *   getStatus        → 查询状态
 *   reset            → 恢复到 INIT
 *   dispose          → 释放资源
 *
 * 返回结构: DeviceResult { timestamp, deviceType, operation, ok, message, elapsedMs, errorCode, errorDetail, rawResult, meta }
 */
import { DeviceResult } from '../../shared/deviceResult.js';

export class LaserEzcadAdapter {
  static STATE = {
    UNINIT:  { key: 'UNINIT',  label: '未初始化' },
    INIT:    { key: 'INIT',    label: '已初始化' },
    READY:   { key: 'READY',   label: '就绪' },
    BUSY:    { key: 'BUSY',    label: '执行中' },
    ERROR:   { key: 'ERROR',   label: '故障' },
  };

  /**
   * @param {import('./lmc1Bridge.js').Lmc1BridgeClient} [bridgeClient] — 可选的桥接客户端实例
   */
  constructor(bridgeClient = null) {
    this._mode = 'mock';
    this._dllPath = '';
    this._templateDir = '';
    this._currentTemplatePath = '';
    this._bridgeHost = '127.0.0.1';
    this._bridgePort = 9701;
    this._timeoutMs = 30000;
    this._variables = new Map();
    this._lastResult = null;
    this._state = LaserEzcadAdapter.STATE.UNINIT;
    this._history = [];
    this._bridge = bridgeClient;  // Lmc1BridgeClient 引用
  }

  /** 注入桥接客户端 */
  setBridgeClient(bridge) { this._bridge = bridge; }

  // ==================== 生命周期 ====================

  /**
   * [init] 使用配置对象初始化适配器
   * @param {object} laserConfig — devices.json 中 laserEzcad 节点
   * @returns {DeviceResult}
   */
  init(laserConfig) {
    const lmc1 = laserConfig.lmc1 || {};
    this._mode = laserConfig.mode || 'mock';
    this._dllPath = lmc1.dllPath || '';
    this._templateDir = lmc1.templateDir || '';
    this._bridgeHost = lmc1.bridgeHost || '127.0.0.1';
    this._bridgePort = lmc1.bridgePort || 9701;
    this._timeoutMs = lmc1.timeoutMs || 30000;
    // 配置桥接客户端
    if (this._bridge) {
      this._bridge.configure({ host: this._bridgeHost, port: this._bridgePort, timeoutMs: this._timeoutMs });
      // 默认 forceMock=true，等有真实 bridge 时手动切换
    }
    this._state = LaserEzcadAdapter.STATE.INIT;
    return this._result('init', true, `激光适配器已初始化 (${this._mode})`);
  }

  /**
   * [reset] 恢复到 INIT 状态，清空变量和结果
   */
  reset() {
    this._variables.clear();
    this._lastResult = null;
    this._state = LaserEzcadAdapter.STATE.INIT;
    this._currentTemplatePath = '';
    return this._result('reset', true, '已重置');
  }

  /**
   * [dispose] 释放资源（真实模式: 通知桥接进程退出）
   */
  dispose() {
    this._variables.clear();
    this._lastResult = null;
    this._state = LaserEzcadAdapter.STATE.UNINIT;
    return this._result('dispose', true, '已释放');
  }

  // ==================== 模板 ====================

  /**
   * [loadTemplate] 加载 EZCAD 模板文件
   * @param {string} templatePath — .ezd 模板文件路径
   * @returns {Promise<DeviceResult>}
   */
  async loadTemplate(templatePath) {
    this._checkState([LaserEzcadAdapter.STATE.INIT, LaserEzcadAdapter.STATE.READY]);
    this._currentTemplatePath = templatePath;
    if (this._mode === 'mock') {
      await this._delay(50);
      return this._result('loadTemplate', true, `模板已加载: ${templatePath}`);
    }
    return this._result('loadTemplate', false, this._realNotImplMsg('loadTemplate'), 'EZCAD_NOT_IMPL');
  }

  // ==================== 变量 ====================

  /** 批量设置模板变量 */
  setVariables(map) {
    if (!map || typeof map !== 'object') throw new Error('setVariables 需要一个对象');
    this._variables.clear();
    for (const [k, v] of Object.entries(map)) {
      this._variables.set(k, String(v != null ? v : ''));
    }
  }

  /** 单个变量设置 */
  setVariable(name, value) {
    if (!name) throw new Error('变量名不能为空');
    this._variables.set(name, String(value != null ? value : ''));
  }

  /** 获取当前变量快照 */
  getVariables() { return Object.fromEntries(this._variables); }

  // ==================== 控制 ====================

  /**
   * [F1] 红框定位
   * 真实模式: 通过桥接发送 { cmd: "RedLight" }
   */
  async redLightPosition() {
    this._checkState([LaserEzcadAdapter.STATE.INIT, LaserEzcadAdapter.STATE.READY]);
    this._state = LaserEzcadAdapter.STATE.BUSY;
    const t0 = performance.now();
    try {
      if (this._bridge && !this._bridge._forceMock) {
        const resp = await this._bridge.send('RedLight');
        this._state = LaserEzcadAdapter.STATE.READY;
        if (resp.ok) {
          return this._result('redLight', true, resp.data?.message || 'OK', Math.round(performance.now() - t0), {}, 'real');
        }
        return this._result('redLight', false, resp.error?.message || 'FAIL', Math.round(performance.now() - t0), { _errorCode: resp.error?.code || 'LMC1_2001' }, 'real_error');
      }
      // mock fallback
      await this._delay(200);
      this._state = LaserEzcadAdapter.STATE.READY;
      return this._result('redLight', true, '红框定位已显示 (mock)', Math.round(performance.now() - t0));
    } catch (e) {
      this._state = LaserEzcadAdapter.STATE.ERROR;
      return this._result('redLight', false, e.message, Math.round(performance.now() - t0), { _errorCode: 'LMC1_ERROR' }, 'real_error');
    }
  }

  /**
   * [F2] 启动打码
   * 真实模式: 通过桥接发送 { cmd: "Mark", variables: {...} }
   * @param {object} [meta] — 附加信息，如 { code22, modelName }
   */
  async startMark(meta = {}) {
    this._checkState([LaserEzcadAdapter.STATE.READY]);
    this._state = LaserEzcadAdapter.STATE.BUSY;
    const t0 = performance.now();
    try {
      if (this._bridge && !this._bridge._forceMock) {
        const resp = await this._bridge.send('StartMark', { variables: this.getVariables(), meta });
        this._state = LaserEzcadAdapter.STATE.READY;
        if (resp.ok) {
          const elapsed = Math.round(performance.now() - t0);
          const result = this._result('startMark', true, resp.data?.message || '打码完成', elapsed, meta, 'real');
          result.rawResult = resp.data;
          return result;
        }
        return this._result('startMark', false, resp.error?.message || 'FAIL', Math.round(performance.now() - t0), { _errorCode: resp.error?.code || 'LMC1_1002', ...meta }, 'real_error');
      }
      // mock fallback
      await this._delay(500);
      const elapsed = Math.round(performance.now() - t0);
      this._state = LaserEzcadAdapter.STATE.READY;
      const result = this._result('startMark', true, '打码完成 (mock)', elapsed, meta);
      result.rawResult = { variables: this.getVariables(), mock: true };
      return result;
    } catch (e) {
      this._state = LaserEzcadAdapter.STATE.ERROR;
      return this._result('startMark', false, e.message, Math.round(performance.now() - t0), { _errorCode: 'LMC1_ERROR', ...meta }, 'real_error');
    }
  }

  // ==================== 查询 ====================

  /** 获取最后一次操作结果 */
  getLastResult() { return this._lastResult; }

  /** 获取操作历史 */
  getHistory(limit = 20) { return this._history.slice(-limit); }

  // ==================== 状态 ====================

  getStatus() {
    return {
      device: 'laserEzcad',
      state: this._state.key,
      stateLabel: this._state.label,
      connected: this._mode === 'mock' || this._state.key === 'READY',
      ready: this._state.key === 'READY',
      mode: this._mode,
      dllPath: this._dllPath || '(未配置)',
      templateDir: this._templateDir || '(未配置)',
      currentTemplate: this._currentTemplatePath || '(未加载)',
      bridge: `${this._bridgeHost}:${this._bridgePort}`,
      variableCount: this._variables.size,
      lastResult: this._lastResult ? (this._lastResult.ok ? 'OK' : 'FAIL') : 'NONE',
    };
  }

  isReady() { return this._state.key === 'READY'; }

  // ==================== 内部 ====================

  _result(operation, ok, message, elapsedMs = 0, meta = {}, source = 'mock') {
    this._lastResult = new DeviceResult({
      deviceType: 'laserEzcad',
      operation,
      ok,
      message,
      elapsedMs,
      errorCode: ok ? '' : (meta._errorCode || ''),
      errorDetail: ok ? '' : message,
      source,
      meta: { ...meta, state: this._state.key },
    });
    this._history.push(this._lastResult);
    if (this._history.length > 100) this._history = this._history.slice(-50);
    return this._lastResult;
  }

  _checkState(allowed) {
    const keys = allowed.map(s => s.key);
    if (!keys.includes(this._state.key)) {
      throw new Error(`laserEzcad 状态[${this._state.label}]不允许此操作，需: ${keys.join('/')}`);
    }
  }

  _realNotImplMsg(method) {
    return `${method}: 真实 DLL 模式未实现。请通过 32 位桥接进程 ${this._bridgeHost}:${this._bridgePort} 加载 ${this._dllPath || 'Lmc1.dll'}。`;
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
}
