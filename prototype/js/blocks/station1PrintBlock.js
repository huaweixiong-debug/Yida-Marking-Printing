/**
 * station1PrintBlock — 工位一：激光打码 + 纸质标签
 *
 * 职责：工位一状态机、调试模式（Lmc1.dll 红光定位）、
 *       自动模式（4 选 1 业务）、码生成、执行下发。
 * 输入：型号选择 + 操作事件 + 22位码
 * 输出：激光/打印任务 + 工位一状态
 * 依赖：modelConfigBlock, templateConfigBlock, serialCodeBlock,
 *        laserEzcadAdapter, printerAdapter
 * Mock：是（激光+打印机 mock）
 * 日后接入：laserEzcadAdapter 接入真实 Lmc1.dll（32位 x86）
 *
 * 状态流转：
 *   IDLE -> DEBUGGING -> AUTO_READY -> EXECUTING -> COMPLETED
 *                    ↑                          ↓
 *                    └── continueDebug          PAUSED
 *
 * 调试模式：开始调试/继续调试（红光定位）/调试完毕（进入自动）
 * 自动模式：4 种业务可选
 */
export class Station1PrintBlock {
  constructor() {
    this._state = 'IDLE';
    this._currentRecord = null;
    this._businessMode = 'LASER_QR'; // 默认业务
  }

  static STATES = {
    IDLE:       { key: 'IDLE',       label: '待机' },
    DEBUGGING:  { key: 'DEBUGGING',   label: '调试中' },
    AUTO_READY: { key: 'AUTO_READY',  label: '自动模式就绪' },
    EXECUTING:  { key: 'EXECUTING',   label: '执行中' },
    COMPLETED:  { key: 'COMPLETED',   label: '工位一完成' },
    PAUSED:     { key: 'PAUSED',      label: '异常暂停' },
  };

  /** 可选业务（工位一：激光二维码 + 纸质标签 + 同步） */
  static BUSINESS_MODES = [
    { key: 'LASER_QR',              label: '激光二维码标识' },
    { key: 'PAPER_LABEL',           label: '纸质标签' },
    { key: 'LASER_QR_LABEL_SYNC',   label: '激光二维码+纸质标签同步' },
  ];

  /** 当前业务是否需要激光 */
  static needsLaser(mode) {
    return mode === 'LASER_QR' || mode === 'LASER_QR_LABEL_SYNC';
  }

  /** 当前业务是否需要打印机 */
  static needsPrinter(mode) {
    return mode === 'PAPER_LABEL' || mode === 'LASER_QR_LABEL_SYNC';
  }

  // ==================== 调试模式 ====================

  /** [调试] 开始调试 — 调用 Lmc1.dll 红光定位 */
  async startDebug(laserAdapter) {
    this._state = 'DEBUGGING';
    if (laserAdapter) {
      const result = await laserAdapter.redLightPosition();
      return { state: this._state, label: '调试中', result };
    }
    return { state: this._state, label: '调试中', result: { ok: true, message: '调试模式已进入（mock）' } };
  }

  /** [调试] 继续调试 — 再次红光定位，调整焦距/位置/大小 */
  async continueDebug(laserAdapter) {
    if (this._state !== 'DEBUGGING') throw new Error('当前不在调试模式');
    if (laserAdapter) {
      const result = await laserAdapter.redLightPosition();
      return { state: this._state, label: '调试继续中', result };
    }
    return { state: this._state, label: '调试继续中', result: { ok: true, message: '红光定位已刷新（mock）' } };
  }

  /** [调试] 调试完毕 — 退出调试，进入自动模式 */
  endDebug() {
    this._state = 'AUTO_READY';
    return { state: this._state, label: Station1PrintBlock.STATES.AUTO_READY.label };
  }

  // ==================== 自动模式 ====================

  /** 设置业务模式 */
  setBusinessMode(modeKey) {
    const valid = Station1PrintBlock.BUSINESS_MODES.find(m => m.key === modeKey);
    if (!valid) throw new Error(`无效的业务模式: ${modeKey}`);
    this._businessMode = modeKey;
    return { mode: modeKey, label: valid.label };
  }

  /** 获取当前业务模式 */
  getBusinessMode() {
    return this._businessMode;
  }

  /** 生成码 */
  generateCode(serialBlock, model) {
    const codeResult = serialBlock.generateCode(model);
    this._currentRecord = codeResult;
    return codeResult;
  }

  /** 执行当前业务 */
  async execute(laserAdapter, printerAdapter, variables) {
    if (this._state !== 'AUTO_READY') throw new Error('请先完成调试进入自动模式');
    this._state = 'EXECUTING';

    const mode = this._businessMode;
    const errors = [];
    const results = { laser: null, printer: null };

    try {
      // 激光下发
      if (Station1PrintBlock.needsLaser(mode) && laserAdapter) {
        laserAdapter.setVariables(variables);
        results.laser = await laserAdapter.startMark({
          code22: variables.code22 || '',
          modelName: variables.modelName || '',
          businessMode: mode,
          markType: 'station1',
          templateName: 'qr_or_sync',
        });
        if (!results.laser.ok) errors.push('激光: ' + (results.laser.message || '失败'));
      }

      // 打印机下发
      if (Station1PrintBlock.needsPrinter(mode) && printerAdapter) {
        const zpl = variables.zpl || `^XA^FO14,18^BQN,2,3^FDLA,${variables.code22}^FS^XZ`;
        results.printer = await printerAdapter.sendZpl(zpl);
        if (!results.printer.ok) errors.push('打印: ' + (results.printer.message || '失败'));
      }

      if (errors.length > 0) {
        this._state = 'PAUSED';
        throw new Error(errors.join('; '));
      }

      // 执行成功后回到自动模式，允许连续生产下一件
      this._state = 'AUTO_READY';
      return { state: this._state, results };
    } catch (e) {
      if (this._state !== 'PAUSED') this._state = 'PAUSED';
      throw e;
    }
  }

  /** 重新执行上一件（不生成新码） */
  async reprint(laserAdapter, printerAdapter, variables) {
    if (!this._currentRecord) throw new Error('没有可重新执行的记录');
    const mode = this._businessMode;
    const results = { laser: null, printer: null };

    if (Station1PrintBlock.needsLaser(mode) && laserAdapter) {
      laserAdapter.clearVariables();
      laserAdapter.assignVariables(variables);
      results.laser = await laserAdapter.startMark({
        code22: variables.code22 || '',
        modelName: variables.modelName || '',
        businessMode: mode,
        markType: 'station1_reprint',
        templateName: 'qr_or_sync',
      });
    }
    if (Station1PrintBlock.needsPrinter(mode) && printerAdapter) {
      const zpl = variables.zpl || `^XA^FO14,18^BQN,2,3^FDLA,${variables.code22}^FS^XZ`;
      results.printer = await printerAdapter.sendZpl(zpl);
    }
    return { ok: true, results };
  }

  // ==================== 状态查询 ====================

  getState() {
    const st = Station1PrintBlock.STATES[this._state];
    return {
      state: this._state,
      label: st ? st.label : this._state,
      businessMode: this._businessMode,
      currentRecord: this._currentRecord,
      canDebug: this._state === 'IDLE' || this._state === 'AUTO_READY' || this._state === 'COMPLETED',
      canContinueDebug: this._state === 'DEBUGGING',
      canEndDebug: this._state === 'DEBUGGING',
      canExecute: this._state === 'AUTO_READY',
      canReprint: !!this._currentRecord,
    };
  }

  reset() {
    this._state = 'IDLE';
    this._currentRecord = null;
    this._businessMode = 'LASER_QR';
  }
}
