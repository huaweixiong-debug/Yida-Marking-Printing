/**
 * station2MarkBlock — 工位二：扫码识别 + 永久性标识激光打码
 *
 * 职责：
 *   1. 调试模式 — F1 红光定位（Lmc1.dll），调整焦距/位置
 *   2. 自动模式 — 一次扫码识别型号+记录，二次扫码触发永久性标识打码
 *
 * 永久性标识内容：供应商代码 + 客户件号 + 生产批次号
 *   例：ID: 104107 YZ167182100263/1 260312
 *
 * 依赖：scannerAdapter, laserEzcadAdapter, modelConfigBlock
 * Mock：是（扫码枪 + 激光 mock）
 * 日后接入：laserEzcadAdapter 接入真实 Lmc1.dll（32位 x86）
 *
 * 状态流转：
 *   IDLE -> DEBUGGING -> AUTO_READY -> SCANNED -> MARKING -> COMPLETED
 */
export class Station2MarkBlock {
  constructor() {
    this._state = 'IDLE';
    this._firstScan = null;
    this._lockedRecord = null;
    this._lastMarkResult = null;
  }

  static STATES = {
    IDLE:       { key: 'IDLE',       label: '待机' },
    DEBUGGING:  { key: 'DEBUGGING',   label: '调试中' },
    AUTO_READY: { key: 'AUTO_READY',  label: '自动模式就绪' },
    SCANNED:    { key: 'SCANNED',     label: '已识别，等待二次扫码打码' },
    MARKING:    { key: 'MARKING',     label: '打码中' },
    COMPLETED:  { key: 'COMPLETED',   label: '工位二完成' },
    PAUSED:     { key: 'PAUSED',      label: '异常暂停' },
  };

  // ==================== 调试模式 ====================

  /** 开始调试 — 调用 Lmc1.dll 红光定位 */
  async startDebug(laserAdapter) {
    this._state = 'DEBUGGING';
    const result = laserAdapter
      ? await laserAdapter.redLightPosition()
      : { ok: true, message: '红光定位已显示（mock）' };
    return { state: this._state, label: '调试中', result };
  }

  /** 继续调试 — 刷新红光定位 */
  async continueDebug(laserAdapter) {
    if (this._state !== 'DEBUGGING') throw new Error('当前不在调试模式');
    const result = laserAdapter
      ? await laserAdapter.redLightPosition()
      : { ok: true, message: '红光定位已刷新（mock）' };
    return { state: this._state, label: '调试继续中', result };
  }

  /** 调试完毕 — 进入自动模式 */
  endDebug() {
    this._state = 'AUTO_READY';
    return { state: this._state, label: Station2MarkBlock.STATES.AUTO_READY.label };
  }

  // ==================== 自动模式：扫码触发 ====================

  /**
   * 扫码处理：
   *   - 第一次扫码 → 识别型号+记录，锁定额
   *   - 第二次扫码（同码）→ 触发永久性标识激光打码
   *
   * @param {string} code22 - 扫码内容
   * @param {Array} allRecords - 全部生产记录
   * @param {object} modelConfig - 当前型号配置
   * @param {object} laserAdapter - 激光适配器（第二次扫码时需要）
   */
  async handleScan(code22, allRecords, modelConfig, laserAdapter) {
    if (this._state !== 'AUTO_READY' && this._state !== 'SCANNED') {
      throw new Error('请先完成调试进入自动模式');
    }

    const matchedRecord = allRecords.find(r => r.code22 === code22);

    if (!this._firstScan) {
      // ===== 第一次扫码：识别型号 =====
      if (!matchedRecord) {
        this._state = 'PAUSED';
        throw new Error(`扫码 ${code22} 无法匹配任何生产记录，禁止打码。`);
      }
      this._firstScan = { code: code22, timestamp: new Date().toISOString() };
      this._lockedRecord = matchedRecord;
      this._state = 'SCANNED';
      return {
        phase: 'first',
        state: this._state,
        record: matchedRecord,
        message: '型号已识别。请再次扫码以触发永久性标识打码。',
      };
    } else {
      // ===== 第二次扫码：触发打码 =====
      if (code22 !== this._firstScan.code) {
        this._state = 'PAUSED';
        throw new Error(`二次扫码 ${code22} 与首次 ${this._firstScan.code} 不一致！`);
      }

      this._state = 'MARKING';

      // 构建永久性标识变量
      const variables = {
        supplierCode: modelConfig ? modelConfig.supplierCode : '104107',
        customerPartNo: modelConfig ? modelConfig.customerPartNo : '-',
        productionBatchNo: modelConfig ? (modelConfig.productionBatchNo || '______') : '______',
        code22: code22,
      };

      // 执行激光打码
      let markResult;
      if (laserAdapter) {
        laserAdapter.setVariables(variables);
        markResult = await laserAdapter.startMark();
      } else {
        markResult = { ok: true, message: '永久性标识已打码（mock）', elapsedMs: 500 };
      }

      this._lastMarkResult = markResult;

      if (markResult.ok) {
        this._state = 'COMPLETED';
      } else {
        this._state = 'PAUSED';
        throw new Error('永久性标识打码失败：' + (markResult.message || '未知错误'));
      }

      return {
        phase: 'second',
        state: this._state,
        record: this._lockedRecord,
        markResult,
        message: '永久性标识打码完成。',
      };
    }
  }

  // ==================== 状态查询 ====================

  getState() {
    const st = Station2MarkBlock.STATES[this._state];
    return {
      state: this._state,
      label: st ? st.label : this._state,
      firstScan: this._firstScan,
      lockedRecord: this._lockedRecord,
      lastMarkResult: this._lastMarkResult,

      canDebug: this._state === 'IDLE' || this._state === 'AUTO_READY' || this._state === 'COMPLETED',
      canContinueDebug: this._state === 'DEBUGGING',
      canEndDebug: this._state === 'DEBUGGING',
      canScan: this._state === 'AUTO_READY' || this._state === 'SCANNED',
      canReset: this._state === 'COMPLETED' || this._state === 'PAUSED',
    };
  }

  /** 重置 — 回到自动模式，可立即处理下一件（无需重新调试） */
  reset() {
    this._state = 'AUTO_READY';
    this._firstScan = null;
    this._lockedRecord = null;
    this._lastMarkResult = null;
  }
}
