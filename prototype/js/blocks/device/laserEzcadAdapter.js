/**
 * laserEzcadAdapter
 *
 * 当前主方案：
 * 1. PLC 通过 IO 点触发装有激光驱动卡的电脑执行打码。
 * 2. 本程序不再直接控制激光卡，不再把 Lmc1/bridge 作为主执行链路。
 * 3. 软件侧只负责把当前打码内容导出为 TXT 文件，供激光电脑读取执行。
 *
 * 历史说明：
 * bridge / Lmc1.dll 相关文件保留为历史探索材料，但不再是当前默认路径。
 */
import { DeviceResult } from '../../shared/deviceResult.js';

export class LaserEzcadAdapter {
  static STATE = {
    UNINIT: { key: 'UNINIT', label: '未初始化' },
    INIT: { key: 'INIT', label: '已初始化' },
    READY: { key: 'READY', label: '就绪' },
    BUSY: { key: 'BUSY', label: '执行中' },
    ERROR: { key: 'ERROR', label: '故障' },
  };

  constructor(bridgeClient = null) {
    this._mode = 'txt-file';
    this._templateDir = '';
    this._currentTemplatePath = '';
    this._timeoutMs = 30000;
    this._variables = new Map();
    this._lastResult = null;
    this._state = LaserEzcadAdapter.STATE.UNINIT;
    this._history = [];
    this._bridge = bridgeClient;
    this._txtOutputDir = 'output/laser';
    this._txtFilePrefix = 'laser_mark';
    this._lastExportFileName = '';
  }

  setBridgeClient(bridge) {
    this._bridge = bridge;
  }

  init(laserConfig = {}) {
    this._mode = laserConfig.mode || 'txt-file';
    this._templateDir = laserConfig.templateDir || '';
    this._timeoutMs = laserConfig.timeoutMs || 30000;

    const txtExport = laserConfig.txtExport || {};
    this._txtOutputDir = txtExport.outputDir || 'output/laser';
    this._txtFilePrefix = txtExport.filePrefix || 'laser_mark';

    this._state = LaserEzcadAdapter.STATE.READY;
    return this._result('init', true, `激光适配器已初始化 (${this._mode})`, 0, {
      outputDir: this._txtOutputDir,
    }, this._mode === 'mock' ? 'mock' : 'real');
  }

  reset() {
    this._variables.clear();
    this._lastResult = null;
    this._state = LaserEzcadAdapter.STATE.READY;
    this._currentTemplatePath = '';
    return this._result('reset', true, '已重置');
  }

  dispose() {
    this._variables.clear();
    this._lastResult = null;
    this._state = LaserEzcadAdapter.STATE.UNINIT;
    return this._result('dispose', true, '已释放');
  }

  async loadTemplate(templatePath) {
    this._checkState([LaserEzcadAdapter.STATE.INIT, LaserEzcadAdapter.STATE.READY]);
    this._currentTemplatePath = templatePath;
    await this._delay(20);
    return this._result('loadTemplate', true, `模板已记录: ${templatePath}`);
  }

  setVariables(map) {
    if (!map || typeof map !== 'object') throw new Error('setVariables 需要对象参数');
    this._variables.clear();
    for (const [k, v] of Object.entries(map)) {
      this._variables.set(k, String(v != null ? v : ''));
    }
  }

  setVariable(name, value) {
    if (!name) throw new Error('变量名不能为空');
    this._variables.set(name, String(value != null ? value : ''));
  }

  clearVariables() {
    this._variables.clear();
  }

  assignVariables(map) {
    this.setVariables(map);
  }

  getVariables() {
    return Object.fromEntries(this._variables);
  }

  async redLightPosition() {
    this._checkState([LaserEzcadAdapter.STATE.INIT, LaserEzcadAdapter.STATE.READY]);
    this._state = LaserEzcadAdapter.STATE.BUSY;
    const t0 = performance.now();

    try {
      await this._delay(80);
      this._state = LaserEzcadAdapter.STATE.READY;

      if (this._mode === 'mock') {
        return this._result('redLight', true, '红光定位已模拟完成 (mock)', Math.round(performance.now() - t0));
      }

      return this._result(
        'redLight',
        true,
        '当前方案由 PLC IO 触发激光，软件侧不执行红光定位。',
        Math.round(performance.now() - t0),
        { plcDriven: true },
        'real',
      );
    } catch (e) {
      this._state = LaserEzcadAdapter.STATE.ERROR;
      return this._result('redLight', false, e.message, Math.round(performance.now() - t0), {
        _errorCode: 'DEVICE_UNKNOWN',
      }, 'real_error');
    }
  }

  async startMark(meta = {}) {
    this._checkState([LaserEzcadAdapter.STATE.READY]);
    this._state = LaserEzcadAdapter.STATE.BUSY;
    const t0 = performance.now();

    try {
      if (this._mode === 'mock') {
        await this._delay(200);
        this._state = LaserEzcadAdapter.STATE.READY;
        const result = this._result('startMark', true, '打码内容已模拟输出 (mock)', Math.round(performance.now() - t0), meta, 'mock');
        result.rawResult = { variables: this.getVariables(), mock: true };
        return result;
      }

      const payload = this._buildTxtPayload(meta);
      const fileName = this._buildFileName(meta);
      this._downloadTxt(fileName, payload);

      this._lastExportFileName = fileName;
      this._state = LaserEzcadAdapter.STATE.READY;
      const result = this._result(
        'startMark',
        true,
        `已导出激光打码 TXT: ${fileName}`,
        Math.round(performance.now() - t0),
        { ...meta, fileName, outputDir: this._txtOutputDir },
        'real',
      );
      result.rawResult = {
        fileName,
        outputDir: this._txtOutputDir,
        payload,
        payloadLength: payload.length,
        mode: this._mode,
      };
      return result;
    } catch (e) {
      this._state = LaserEzcadAdapter.STATE.ERROR;
      return this._result('startMark', false, e.message, Math.round(performance.now() - t0), {
        _errorCode: 'LMC1_1002',
        ...meta,
      }, 'real_error');
    }
  }

  getLastResult() {
    return this._lastResult;
  }

  getHistory(limit = 20) {
    return this._history.slice(-limit);
  }

  getStatus() {
    return {
      device: 'laserEzcad',
      state: this._state.key,
      stateLabel: this._state.label,
      connected: this._mode === 'mock' || this._mode === 'txt-file' || this._state.key === 'READY',
      ready: this._state.key === 'READY',
      mode: this._mode,
      templateDir: this._templateDir || '(未配置)',
      currentTemplate: this._currentTemplatePath || '(未加载)',
      txtOutputDir: this._txtOutputDir,
      filePrefix: this._txtFilePrefix,
      lastExportFileName: this._lastExportFileName || '(无)',
      variableCount: this._variables.size,
      lastResult: this._lastResult ? (this._lastResult.ok ? 'OK' : 'FAIL') : 'NONE',
      workflow: 'PLC_IO_TXT',
    };
  }

  isReady() {
    return this._state.key === 'READY';
  }

  _buildTxtPayload(meta = {}) {
    const vars = this.getVariables();
    const code22 = meta.code22 || vars.code22 || '';
    const modelName = meta.modelName || vars.modelName || '';
    const lines = [
      '# 三码合一激光打码交接文件',
      `generatedAt=${new Date().toISOString()}`,
      `mode=${this._mode}`,
      `workflow=PLC_IO_TXT`,
      `code22=${code22}`,
      `modelName=${modelName}`,
      `businessMode=${meta.businessMode || ''}`,
      `markType=${meta.markType || ''}`,
      `template=${meta.templateName || this._currentTemplatePath || ''}`,
      '',
      '[variables]',
    ];

    Object.entries(vars).forEach(([key, value]) => {
      lines.push(`${key}=${String(value ?? '')}`);
    });

    if (meta.permanentText) {
      lines.push('');
      lines.push('[permanent_mark]');
      lines.push(`text=${meta.permanentText}`);
    }

    lines.push('');
    lines.push('[notes]');
    lines.push('说明=由 PLC IO 点触发激光电脑执行，本文件仅提供打码内容');
    lines.push(`建议目录=${this._txtOutputDir}`);
    return lines.join('\r\n');
  }

  _buildFileName(meta = {}) {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const code22 = meta.code22 || this.getVariables().code22 || 'NO_CODE';
    const markType = meta.markType || 'laser';
    return `${this._txtFilePrefix}_${markType}_${code22}_${stamp}.txt`;
  }

  _downloadTxt(fileName, content) {
    if (typeof document === 'undefined') {
      throw new Error('当前环境不支持自动导出 TXT 文件');
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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
    const keys = allowed.map((s) => s.key);
    if (!keys.includes(this._state.key)) {
      throw new Error(`laserEzcad 状态[${this._state.label}]不允许此操作，需: ${keys.join('/')}`);
    }
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
