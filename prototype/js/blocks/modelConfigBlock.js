/**
 * modelConfigBlock — 型号基础参数维护
 *
 * 职责：加载 models.json，提供型号查询接口。
 * 输入：models.json 配置文件
 * 输出：型号列表、当前型号业务参数
 * 依赖：无
 * Mock：否（直接使用 JSON 配置）
 */
export class ModelConfigBlock {
  constructor() {
    this._models = [];
    this._currentModelId = null;
  }

  /** 从 JSON 配置加载 */
  async load(configUrl = '../config/models.json') {
    const resp = await fetch(configUrl);
    const data = await resp.json();
    this._models = data.models || [];
    return this._models.length;
  }

  /** 获取所有启用的型号 */
  getEnabledModels() {
    return this._models.filter(m => m.enabled);
  }

  /** 获取全部型号（含停用） */
  getAllModels() {
    return [...this._models];
  }

  /** 按 ID 获取型号 */
  getModelById(id) {
    return this._models.find(m => m.id === id) || null;
  }

  /** 设置当前选中型号 */
  setCurrentModel(id) {
    this._currentModelId = id;
  }

  /** 获取当前型号完整参数 */
  getCurrentModel() {
    return this.getModelById(this._currentModelId);
  }

  /** 获取当前型号的界面展示字段（供 uiTop 使用） */
  getDisplayFields() {
    const m = this.getCurrentModel();
    if (!m) return {};
    return {
      modelName: m.name,
      customerPartNo: m.customerPartNo,
      supplierCode: m.supplierCode,
      productionBatchNo: m.productionBatchNo || '',
      barcodePrefix: m.barcodePrefix,
      fixedCode: m.fixedCode,
    };
  }
}
