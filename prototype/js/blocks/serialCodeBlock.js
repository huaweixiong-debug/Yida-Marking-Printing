/**
 * serialCodeBlock — 22位码生成与防重
 *
 * 职责：按型号+日期生成22位码，流水号递增，防重校验。
 * 输入：型号参数 + 流水号规则（serial-rules.json）
 * 输出：22位码 + 流水号状态
 * 依赖：modelConfigBlock（获取当前型号的 barcodePrefix / fixedCode）
 * Mock：是（内存计数器，无数据库事务）
 */
export class SerialCodeBlock {
  constructor() {
    this._rules = null;
    // 内存计数器：key = "modelId:YYYYMMDD"
    this._counters = new Map();
    // 已生成的码集合（防重）
    this._usedCodes = new Set();
    this._currentCode = null;
    this._currentSerial = 0;
  }

  async load(configUrl = '../config/serial-rules.json') {
    const resp = await fetch(configUrl);
    this._rules = await resp.json();
  }

  /** 生成新的22位码 */
  generateCode(model) {
    if (!this._rules) throw new Error('流水号规则未加载');

    const today = this._todayYYYYMMDD();
    const key = `${model.id}:${today}`;
    const current = this._counters.get(key) || 0;
    const maxVal = this._rules.serialRules.maxValue;

    if (current >= maxVal) {
      throw new Error(`型号 ${model.name} 当日流水号已超过${maxVal}，请联系工程师。`);
    }

    const nextSerial = current + 1;
    const code22 = `${model.barcodePrefix}${model.fixedCode}${today}${String(nextSerial).padStart(4, '0')}`;

    if (this._usedCodes.has(code22)) {
      throw new Error(`防重冲突：22位码 ${code22} 已存在。`);
    }

    this._counters.set(key, nextSerial);
    this._usedCodes.add(code22);
    this._currentCode = code22;
    this._currentSerial = nextSerial;

    return {
      code22,
      serialNo: nextSerial,
      productionDate: today,
      barcodePrefix: model.barcodePrefix,
      fixedCode: model.fixedCode,
    };
  }

  /** 校验码格式 */
  validateCode(code22) {
    return /^[0-9A-Za-z]{22}$/.test(code22);
  }

  /** 查询码是否存在（防重查询） */
  codeExists(code22) {
    return this._usedCodes.has(code22);
  }

  /** 将码标记为作废 */
  invalidateCode(code22) {
    // mock：仅从集合移除标记，不实际删除
    // 真实实现需写数据库
  }

  /** 获取当前码信息（供 uiCode 使用） */
  getCurrentCodeInfo() {
    if (!this._currentCode) {
      return { code22: '----------------------', serialNo: '-', productionDate: '', status: '待生成' };
    }
    return {
      code22: this._currentCode,
      serialNo: this._currentSerial,
      productionDate: this._currentCode.substring(10, 18),
      status: '已生成',
    };
  }

  /** 重置（调试用） */
  reset() {
    this._currentCode = null;
    this._currentSerial = 0;
  }

  _todayYYYYMMDD() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
}
