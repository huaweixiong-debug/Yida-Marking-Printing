/**
 * traceLogBlock — 追溯与日志
 *
 * 职责：生产记录、扫码记录、设备日志、报警日志的存储和查询。
 * 输入：各模块事件数据
 * 输出：查询结果、日志列表
 * Mock：是（纯内存存储，不写数据库）
 */
export class TraceLogBlock {
  constructor() {
    this._records = [];       // 生产记录
    this._scanLogs = [];     // 扫码记录
    this._deviceLogs = [];   // 设备通讯日志
    this._alarms = [];       // 报警记录
  }

  /** 添加生产记录 */
  addRecord(record) {
    this._records.unshift({
      ...record,
      id: this._records.length + 1,
      createdAt: new Date().toISOString(),
    });
  }

  /** 添加扫码记录 */
  addScanLog(entry) {
    this._scanLogs.unshift({
      ...entry,
      id: this._scanLogs.length + 1,
      timestamp: new Date().toISOString(),
    });
  }

  /** 添加设备日志 */
  addDeviceLog(entry) {
    this._deviceLogs.unshift({
      ...entry,
      id: this._deviceLogs.length + 1,
      timestamp: new Date().toISOString(),
    });
  }

  /** 添加报警 */
  addAlarm(type, message) {
    this._alarms.unshift({
      id: this._alarms.length + 1,
      type,
      message,
      occurredAt: new Date().toISOString(),
      recoveredAt: null,
    });
  }

  /** 获取最近生产记录（供 uiTable 使用） */
  getRecentRecords(limit = 20) {
    return this._records.slice(0, limit);
  }

  /** 获取最近报警（供 uiTable 使用） */
  getRecentAlarms(limit = 20) {
    return this._alarms.slice(0, limit);
  }

  /** 获取设备日志 */
  getDeviceLogs(limit = 50) {
    return this._deviceLogs.slice(0, limit);
  }

  /** 获取扫码日志 */
  getScanLogs(limit = 50) {
    return this._scanLogs.slice(0, limit);
  }

  /** 获取各类别数量 */
  getCategoryCounts() {
    return {
      production: this._records.length,
      scan: this._scanLogs.length,
      device: this._deviceLogs.length,
      alarm: this._alarms.length,
    };
  }

  /** 按类别获取日志 */
  getByCategory(category, limit = 50) {
    switch (category) {
      case 'production': return this._records.slice(0, limit);
      case 'scan': return this._scanLogs.slice(0, limit);
      case 'device': return this._deviceLogs.slice(0, limit);
      case 'alarm': return this._alarms.slice(0, limit);
      default: return [];
    }
  }

  /** 查询生产记录（简单过滤） */
  queryRecords({ modelName, date, code22 } = {}) {
    let result = [...this._records];
    if (modelName) result = result.filter(r => r.modelName && r.modelName.includes(modelName));
    if (date) result = result.filter(r => r.productionDate === date);
    if (code22) result = result.filter(r => r.code22 && r.code22.includes(code22));
    return result;
  }

  /** 清空（调试用） */
  clear() {
    this._records = [];
    this._scanLogs = [];
    this._deviceLogs = [];
    this._alarms = [];
  }
}
