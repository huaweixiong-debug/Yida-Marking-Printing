/**
 * templateConfigBlock — 模板与变量映射维护
 *
 * 职责：加载 templates.json，按型号提供三类标识模板及变量映射。
 * 输入：templates.json + 型号ID
 * 输出：模板数据（区域坐标、变量映射表）
 * 依赖：modelConfigBlock（按型号获取模板ID）
 * Mock：否（JSON 配置）
 *
 * 三类模板：
 *   qrLaserTemplate       — 二维码激光标识 (station1)
 *   labelTemplate         — 纸质标签         (station1)
 *   permanentMarkTemplate — 永久性标识文本   (station2)
 */
export class TemplateConfigBlock {
  constructor() {
    this._qrLaserTemplates = [];
    this._labelTemplates = [];
    this._permanentMarkTemplates = [];
  }

  async load(configUrl = '../config/templates.json') {
    const resp = await fetch(configUrl);
    const data = await resp.json();
    this._qrLaserTemplates = data.qrLaserTemplates || [];
    this._labelTemplates = data.labelTemplates || [];
    this._permanentMarkTemplates = data.permanentMarkTemplates || [];
  }

  /** 二维码激光模板 */
  getQrLaserTemplate(templateId) {
    return this._qrLaserTemplates.find(t => t.id === templateId) || null;
  }

  /** 纸质标签模板 */
  getLabelTemplate(templateId) {
    return this._labelTemplates.find(t => t.id === templateId) || null;
  }

  /** 永久性标识文本模板 */
  getPermanentMarkTemplate(templateId) {
    return this._permanentMarkTemplates.find(t => t.id === templateId) || null;
  }

  /** 获取指定模板的区域列表 */
  getZones(templateId, type) {
    let tpl = null;
    if (type === 'qrLaser') tpl = this.getQrLaserTemplate(templateId);
    else if (type === 'label') tpl = this.getLabelTemplate(templateId);
    else if (type === 'permanentMark') tpl = this.getPermanentMarkTemplate(templateId);
    return tpl ? tpl.zones : [];
  }

  /** 将变量映射表代入实际值 */
  resolveContent(format, variables) {
    let resolved = format;
    for (const [key, val] of Object.entries(variables)) {
      resolved = resolved.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
    }
    return resolved;
  }

  /** 获取永久性标识的内容格式字符串 */
  getPermanentMarkContent(templateId) {
    const tpl = this.getPermanentMarkTemplate(templateId);
    return tpl ? tpl.contentFormat : '';
  }
}
