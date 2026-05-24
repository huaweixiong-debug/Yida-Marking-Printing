/**
 * uiMapper — 界面映射器
 *
 * 职责：读取 ui-mapping.json，将功能块输出映射到 DOM 区域。
 * 不做业务逻辑，只负责「哪个数据 → 哪个 DOM 元素」。
 */
export class UiMapper {
  constructor() {
    this._mapping = null;
    this._elements = {};
  }

  /** 加载界面映射配置 */
  async load(configUrl = '../config/ui-mapping.json') {
    const resp = await fetch(configUrl);
    this._mapping = await resp.json();
  }

  /** 缓存 DOM 引用 */
  bindElements(elements) {
    this._elements = elements;
  }

  /** 根据当前 Tab 刷新所有可见区域 */
  refreshAll(tabName, blocks, context = {}) {
    const regions = this._mapping.regions;
    if (!regions) return;

    this._refreshTopInfo(tabName, regions.uiTop, blocks.modelConfig);
    this._refreshCodeInfo(tabName, regions.uiCode, blocks.serialCode);
    this._refreshDeviceStatus(tabName, regions.uiDevice, blocks.deviceAdapter);
    this._refreshRecordTable(tabName, regions.uiTable, blocks.traceLog);
    this._refreshTemplatePreview(tabName, regions.uiPreview, blocks.modelConfig, blocks.templateConfig, context);
  }

  // --- 各区域刷新 ---

  _refreshTopInfo(tabName, regionCfg, modelBlock) {
    if (!this._isVisible(tabName, regionCfg)) return;
    const fields = modelBlock.getDisplayFields();
    const el = this._elements.uiTop;
    if (!el) return;
    el.innerHTML = regionCfg.fields
      .map(f => `<span class="info-item"><strong>${this._fieldLabel(f)}</strong> ${fields[f] || '-'}</span>`)
      .join('');
  }

  _refreshCodeInfo(tabName, regionCfg, serialBlock) {
    if (!this._isVisible(tabName, regionCfg)) return;
    const info = serialBlock.getCurrentCodeInfo();
    const el = this._elements.uiCode;
    if (!el) return;
    el.innerHTML = `
      <div class="code-big">${info.code22}</div>
      <div class="code-meta">流水号: ${info.serialNo} | 日期: ${info.productionDate} | 状态: ${info.status}</div>`;
  }

  _refreshDeviceStatus(tabName, regionCfg, deviceBlock) {
    if (!this._isVisible(tabName, regionCfg)) return;
    const status = deviceBlock.getAllStatus();
    const el = this._elements.uiDevice;
    if (!el) return;
    const color = (connected) => connected ? '#15803d' : '#b91c1c';
    el.innerHTML = ['laser', 'printer', 'scanner'].map(key => {
      const s = status[key];
      return `<span class="device-badge" style="border-color:${color(s.connected)}">
        <span class="device-dot" style="background:${color(s.connected)}"></span>
        ${s.device}: ${s.mode} ${s.connected ? '✓' : '✗'}
      </span>`;
    }).join('');
  }

  _refreshRecordTable(tabName, regionCfg, traceLog) {
    if (!this._isVisible(tabName, regionCfg)) return;
    const records = traceLog.getRecentRecords(10);
    const el = this._elements.uiTable;
    if (!el) return;
    if (records.length === 0) {
      el.innerHTML = '<div class="empty-hint">暂无生产记录</div>';
      return;
    }
    const rows = records.map(r =>
      `<tr><td>${r.createdAt || '-'}</td><td>${r.modelName || '-'}</td><td class="code-cell">${r.code22 || '-'}</td><td>${r.status || '-'}</td></tr>`
    ).join('');
    el.innerHTML = `<table class="data-table"><thead><tr><th>时间</th><th>型号</th><th>22位码</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  _refreshTemplatePreview(tabName, regionCfg, modelBlock, tplBlock, context) {
    if (!this._isVisible(tabName, regionCfg)) return;
    const model = modelBlock.getCurrentModel();
    const el = this._elements.uiPreview;
    if (!el || !model) {
      if (el) el.innerHTML = '<div class="empty-hint">请先选择型号</div>';
      return;
    }

    // 优先使用 BusinessData 的模板变量，回退到自拼
    const bd = context.bd;
    const vars = bd ? bd.getTemplateVars() : {
      code22: '----------------------',
      customerPartNo: model.customerPartNo || '(未配置)',
      supplierCode: model.supplierCode || '104107',
      barcodePrefix: model.barcodePrefix || '---------',
      fixedCode: model.fixedCode || '-',
      productionDate: '--------',
      dateSerial: '------------',
      serialNo: '----',
      productionBatchNo: model.productionBatchNo || '______',
    };

    let html = '';

    if (tabName === 'station1') {
      // ===== 工位一：二维码激光标识 + 纸质标签 =====
      const busMode = context.businessMode || 'LASER_QR';
      const showLaser = busMode === 'LASER_QR' || busMode === 'LASER_QR_LABEL_SYNC';
      const showLabel = busMode === 'PAPER_LABEL' || busMode === 'LASER_QR_LABEL_SYNC';

      if (showLaser) {
        const qrTpl = tplBlock.getQrLaserTemplate(model.qrLaserTemplateId);
        if (qrTpl) {
          html += `<div class="tpl-section">`;
          html += `<div class="tpl-section-title">二维码激光标识 — ${qrTpl.name}</div>`;
          html += `<div class="tpl-mockup laser-mockup">`;
          html += `<div class="mockup-left">`;
          html += `<div class="mockup-qr">[QR]</div>`;
          html += `<div class="mockup-code-small">${vars.code22}</div>`;
          html += `</div>`;
          html += `<div class="mockup-right">`;
          html += `<div class="mockup-line">${vars.customerPartNo}</div>`;
          html += `<div class="mockup-line">${vars.supplierCode}</div>`;
          html += `<div class="mockup-line">${vars.dateSerial}</div>`;
          html += `</div></div>`;
          html += `<div class="tpl-zones">`;
          (qrTpl.zones || []).forEach(z => {
            html += `<span class="zone-tag laser-zone">${z.label} [${z.type}]</span>`;
          });
          html += `</div></div>`;
        }
      }

      if (showLabel) {
        const labelTpl = tplBlock.getLabelTemplate(model.labelTemplateId);
        if (labelTpl) {
          html += `<div class="tpl-section">`;
          html += `<div class="tpl-section-title">纸质标签 — ${labelTpl.name}</div>`;
          html += `<div class="tpl-mockup label-mockup">`;
          html += `<div class="mockup-label-header">`;
          html += `<span class="mockup-logo">[LOGO]</span>`;
          html += `<span>客户件号: ${vars.customerPartNo}</span>`;
          html += `</div>`;
          html += `<div class="mockup-label-barcode">`;
          html += `<div class="mockup-barcode">||| |||| || ||| ||||</div>`;
          html += `<div class="mockup-code-small">${vars.code22}</div>`;
          html += `</div></div>`;
          html += `<div class="tpl-zones">`;
          (labelTpl.zones || []).forEach(z => {
            html += `<span class="zone-tag label-zone">${z.label} [${z.type}]</span>`;
          });
          html += `</div></div>`;
        }
      }
    } else if (tabName === 'station2') {
      // ===== 工位二：永久性标识文本 =====
      const permTpl = tplBlock.getPermanentMarkTemplate(model.permanentMarkTemplateId);
      if (permTpl) {
        const content = tplBlock.resolveContent(permTpl.contentFormat, vars);
        html += `<div class="tpl-section">`;
        html += `<div class="tpl-section-title">永久性标识 — ${permTpl.name}</div>`;
        html += `<div class="tpl-mockup permanent-mockup">`;
        html += `<div class="perm-content-display">${content}</div>`;
        html += `<div class="perm-fields">`;
        html += `<span>供应商代码: ${vars.supplierCode}</span>`;
        html += `<span>客户件号: ${vars.customerPartNo}</span>`;
        html += `<span>生产批次号: ${vars.productionBatchNo}</span>`;
        html += `</div>`;
        html += `</div>`;
        html += `<div class="tpl-zones">`;
        (permTpl.zones || []).forEach(z => {
          html += `<span class="zone-tag permanent-zone">${z.label} [${z.type}]</span>`;
        });
        html += `</div></div>`;
        html += `<div class="perm-note">由 Lmc1.dll 驱动执行 → laserEzcadAdapter</div>`;
      }
    }

    if (!html) {
      html = '<div class="empty-hint">未找到对应模板</div>';
    }
    el.innerHTML = html;
  }

  // --- 辅助 ---

  _isVisible(tabName, regionCfg) {
    if (!regionCfg || !regionCfg.visibleOn) return true;
    return regionCfg.visibleOn.includes(tabName);
  }

  _fieldLabel(key) {
    const map = {
      modelName: '型号', customerPartNo: '客户件号', supplierCode: '供应商代码',
      productionBatchNo: '批次号', barcodePrefix: '9位短码', fixedCode: '固定码',
    };
    return map[key] || key;
  }
}
