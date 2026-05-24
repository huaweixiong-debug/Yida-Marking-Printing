/**
 * BusinessData — 统一业务数据对象
 *
 * 职责：各模块间唯一的数据载体。不散落字符串拼接，不各自构造 record。
 *
 * 使用方式：
 *   const bd = BusinessData.fromModel(modelConfig)        // 型号选中时
 *   bd.attachCode(serialBlock, modelConfig)                // 码生成后
 *   const vars = bd.getTemplateVars()                      // 模板变量替换
 *   const record = bd.toRecord('STATION1_COMPLETED')      // traceLog 入库
 *   const content = bd.getPermanentMarkContent(tplBlock)   // 永久性标识内容
 */
export class BusinessData {
  /**
   * @param {object} model — modelConfigBlock.getCurrentModel() 的输出
   */
  constructor(model) {
    // --- 型号基础字段 ---
    this.modelId = model.id || '';
    this.modelName = model.name || '';
    this.customerPartNo = model.customerPartNo || '';
    this.supplierCode = model.supplierCode || '104107';
    this.productionBatchNo = model.productionBatchNo || '';
    this.barcodePrefix = model.barcodePrefix || '';
    this.fixedCode = model.fixedCode || '';

    // --- 码字段（generateCode 后填充） ---
    this.code22 = '';
    this.productionDate = '';
    this.serialNo = 0;

    // --- 运行态 ---
    this.status = 'IDLE';
    this.createdAt = new Date().toISOString();
    this.businessMode = 'LASER_QR';
    this.reprintCount = 0;
  }

  /** 静态工厂 */
  static fromModel(model) {
    return new BusinessData(model);
  }

  // ==================== 码生成 ====================

  /**
   * 绑定 serialCodeBlock 生成的码数据，填充所有衍生字段
   * @param {object} codeResult — serialCodeBlock.generateCode() 返回值
   */
  attachCode(codeResult) {
    this.code22 = codeResult.code22 || '';
    this.productionDate = codeResult.productionDate || '';
    this.serialNo = codeResult.serialNo || 0;
    this.status = 'CODE_GENERATED';
    this.createdAt = new Date().toISOString();
    return this;
  }

  // ==================== 模板变量 ====================

  /** 返回所有模板可用的变量 map（供 templateConfigBlock 使用） */
  getTemplateVars() {
    return {
      code22: this.code22 || '----------------------',
      customerPartNo: this.customerPartNo || '(未配置)',
      supplierCode: this.supplierCode,
      productionBatchNo: this.productionBatchNo || '______',
      barcodePrefix: this.barcodePrefix || '---------',
      fixedCode: this.fixedCode || '-',
      productionDate: this.productionDate || '--------',
      serialNo: String(this.serialNo || '----'),
      dateSerial: this._buildDateSerial(),
    };
  }

  // ==================== 模板变量（按角色分配） ====================

  /** 给 EZCAD 激光打码用的变量（二维码激光标识） */
  getQrLaserVariables() {
    return {
      code22: this.code22,
      customerPartNo: this.customerPartNo,
      supplierCode: this.supplierCode,
      dateSerial: this._buildDateSerial(),
    };
  }

  /** 给 Zebra 打印机用的变量（纸质标签） */
  getLabelVariables() {
    return {
      code22: this.code22,
      customerPartNo: this.customerPartNo,
    };
  }

  /** 给 EZCAD 激光打码用的变量（永久性标识文本） */
  getPermanentMarkVariables() {
    return {
      supplierCode: this.supplierCode,
      customerPartNo: this.customerPartNo,
      productionBatchNo: this.productionBatchNo || '______',
    };
  }

  // ==================== 标识内容 ====================

  /** 永久性标识文本 */
  getPermanentMarkContent() {
    return `ID: ${this.supplierCode} ${this.customerPartNo} ${this.productionBatchNo || '______'}`;
  }

  /** 二维码标识右侧文本三行 */
  getQrTextLines() {
    return {
      line1: this.customerPartNo || '(未配置)',
      line2: this.supplierCode,
      line3: this._buildDateSerial(),
    };
  }

  /** 标签顶部件号文本 */
  getLabelPartNoText() {
    return `客户件号: ${this.customerPartNo || '(未配置)'}`;
  }

  // ==================== traceLog ====================

  /** 产生统一格式的生产记录 */
  toRecord(status) {
    return {
      modelId: this.modelId,
      modelName: this.modelName,
      customerPartNo: this.customerPartNo,
      supplierCode: this.supplierCode,
      barcodePrefix: this.barcodePrefix,
      fixedCode: this.fixedCode,
      code22: this.code22,
      productionDate: this.productionDate,
      serialNo: this.serialNo,
      status: status || this.status,
      businessMode: this.businessMode,
      reprintCount: this.reprintCount,
      createdAt: new Date().toISOString(),
    };
  }

  // ==================== 显示信息 ====================

  getDisplayFields() {
    return {
      modelName: this.modelName,
      customerPartNo: this.customerPartNo,
      supplierCode: this.supplierCode,
      productionBatchNo: this.productionBatchNo,
      barcodePrefix: this.barcodePrefix,
      fixedCode: this.fixedCode,
    };
  }

  getCodeSummary() {
    return {
      code22: this.code22 || '----------------------',
      serialNo: this.serialNo || '-',
      productionDate: this.productionDate || '',
      status: this.status,
    };
  }

  // ==================== 内部 ====================

  _buildDateSerial() {
    if (!this.code22 || this.code22.length < 22) return '------------';
    return this.code22.substring(10, 18) + this.code22.substring(18, 22);
  }
}
