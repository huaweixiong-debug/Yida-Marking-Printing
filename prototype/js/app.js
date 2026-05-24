/**
 * app.js — 三码合一程序预览原型 主入口
 *
 * 启动流程：
 *   1. 加载所有 JSON 配置文件
 *   2. 初始化 7 个功能块
 *   3. 初始化 UI 映射器
 *   4. 渲染两工位界面
 *   5. 绑定交互事件
 *
 * 当前为预览原型骨架，所有设备均为 mock。
 */
import { ModelConfigBlock } from './blocks/modelConfigBlock.js';
import { TemplateConfigBlock } from './blocks/templateConfigBlock.js';
import { SerialCodeBlock } from './blocks/serialCodeBlock.js';
import { DeviceAdapterBlock } from './blocks/deviceAdapterBlock.js';
import { TraceLogBlock } from './blocks/traceLogBlock.js';
import { Station1PrintBlock } from './blocks/station1PrintBlock.js';
import { Station2MarkBlock } from './blocks/station2MarkBlock.js';
import { UiMapper } from './ui/uiMapper.js';
import { BusinessData } from './shared/businessData.js';

class App {
  constructor() {
    // --- 功能块实例 ---
    this.modelConfig = new ModelConfigBlock();
    this.templateConfig = new TemplateConfigBlock();
    this.serialCode = new SerialCodeBlock();
    this.deviceAdapter = new DeviceAdapterBlock();
    this.traceLog = new TraceLogBlock();
    this.station1 = new Station1PrintBlock();
    this.station2 = new Station2MarkBlock();
    this.uiMapper = new UiMapper();

    this._currentTab = 'station1';
    this._logCategory = 'production';
    /** @type {BusinessData|null} 统一业务数据对象 */
    this._bd = null;
    /** @type {object} 界面文案配置 */
    this._uiText = null;
  }

  async start() {
    // 1. 加载所有配置（含界面文案）
    await Promise.all([
      this.modelConfig.load(),
      this.templateConfig.load(),
      this.serialCode.load(),
      this.deviceAdapter.load(),
      this.uiMapper.load(),
      fetch('../config/ui-text.json').then(r => r.json()).then(d => { this._uiText = d; }),
    ]);

    // 2. 缓存 DOM 引用
    this.uiMapper.bindElements({
      uiTop: document.getElementById('uiTop'),
      uiAction: document.getElementById('uiAction'),
      uiPreview: document.getElementById('uiPreview'),
      uiCode: document.getElementById('uiCode'),
      uiDevice: document.getElementById('uiDevice'),
      uiTable: document.getElementById('uiTable'),
    });

    // 3. 填充型号下拉框
    this._populateModelSelect();

    // 4. 绑定事件
    this._bindEvents();

    // 5. 初始渲染
    this._selectDefaultModel();
    this._refreshUI();
    this._renderActionArea();

    // 6. 更新设备状态区初始值
    this._refreshUI();

    // 预置一条 mock 报警，演示报警区
    this.traceLog.addAlarm('INFO', '系统启动完成，所有设备处于 mock 模式。');

    window.__app = this;  // 开发调试用，暴露 app 实例
    console.log('[app] 三码合一预览原型已启动 (全部 mock)');
  }

  // ==================== UI 渲染 ====================

  _refreshUI() {
    const st1 = this.station1.getState();
    this.uiMapper.refreshAll(this._currentTab, {
      modelConfig: this.modelConfig,
      templateConfig: this.templateConfig,
      serialCode: this.serialCode,
      deviceAdapter: this.deviceAdapter,
      traceLog: this.traceLog,
      station1: this.station1,
      station2: this.station2,
      businessData: this._bd,
    }, {
      businessMode: st1.businessMode || 'LASER_QR',
      bd: this._bd,
    });

    // 额外更新报警列表
    this._renderAlarms();
  }

  _renderActionArea() {
    const el = document.getElementById('uiAction');
    if (!el) return;

    if (this._currentTab === 'station1') {
      this._renderStation1Actions(el);
    } else if (this._currentTab === 'station2') {
      this._renderStation2Actions(el);
    } else if (this._currentTab === 'maintenance') {
      this._renderMaintenancePage(el);
    } else if (this._currentTab === 'logs') {
      this._renderLogsPage(el);
    } else {
      el.innerHTML = '';
    }
  }

  _renderStation1Actions(el) {
    const st1 = this.station1.getState();
    const modes = Station1PrintBlock.BUSINESS_MODES;
    const currentMode = st1.businessMode;
    const t = (p, v) => this._t('station1.' + p, v);
    el.innerHTML = `
      <div class="action-panel">
        <!-- 调试区 -->
        <div class="section-label">${t('sectionDebug')}</div>
        <div class="action-buttons" id="debugBtns">
          ${st1.canContinueDebug ? `
            <button id="btnContinueDebug" class="btn">${t('btnContinueDebug')}</button>
            <button id="btnEndDebug" class="btn primary">${t('btnEndDebug')}</button>
          ` : `
            <button id="btnStartDebug" class="btn" ${st1.canDebug ? '' : 'disabled'}>${t('btnStartDebug')}</button>
          `}
        </div>

        <!-- 自动模式区 -->
        <div class="section-label">${t('sectionAuto')}</div>
        <div class="mode-radio-group" id="modeRadios">
          ${modes.map(m => `
            <label class="mode-radio ${currentMode === m.key ? 'selected' : ''}">
              <input type="radio" name="businessMode" value="${m.key}" ${currentMode === m.key ? 'checked' : ''}
                ${st1.canExecute ? '' : 'disabled'}>
              ${m.label}
            </label>
          `).join('')}
        </div>

        <!-- 执行区 -->
        <div class="action-buttons" id="execBtns">
          <button id="btnExecute" class="btn primary" ${st1.canExecute ? '' : 'disabled'}>${t('btnExecute')}</button>
          <button id="btnReprint" class="btn" ${st1.canReprint ? '' : 'disabled'}>${t('btnReprint')}</button>
        </div>

        <!-- 状态 + 日志 -->
        <div class="action-status">
          工位一状态: <span class="status-badge ${this._stateClass(st1.state)}" id="st1StateLabel">${st1.label}</span>
          <span class="mode-hint">| 当前业务: ${(modes.find(m => m.key === currentMode) || {}).label || currentMode}</span>
        </div>
        <div class="action-log" id="st1Log"></div>
      </div>`;
    this._bindStation1Actions();
  }

  _renderStation2Actions(el) {
    const st2 = this.station2.getState();
    const permContent = this._bd
      ? this._bd.getPermanentMarkContent()
      : 'ID: ______ ______ ______';
    const t = (p, v) => this._t('station2.' + p, v);

    el.innerHTML = `
      <div class="action-panel">
        <!-- 调试区 -->
        <div class="section-label">${t('sectionDebug')}</div>
        <div class="action-buttons" id="debugBtns2">
          ${st2.canContinueDebug ? `
            <button id="btnContinueDebug2" class="btn">${t('btnContinueDebug')}</button>
            <button id="btnEndDebug2" class="btn primary">${t('btnEndDebug')}</button>
          ` : `
            <button id="btnStartDebug2" class="btn" ${st2.canDebug ? '' : 'disabled'}>${t('btnStartDebug')}</button>
          `}
        </div>

        <!-- 永久性标识预览 -->
        <div class="section-label">${t('sectionPermanentPreview')}</div>
        <div class="permanent-preview">
          <div class="perm-label">供应商代码 + 客户件号 + 生产批次号</div>
          <div class="perm-content">${permContent}</div>
        </div>

        <!-- 扫码区（自动模式） -->
        <div class="section-label">${t('sectionAuto')}</div>
        <div class="action-buttons">
          <button id="btnSimScan2" class="btn primary" ${st2.canScan ? '' : 'disabled'}>${t('btnSimScan')}</button>
          <button id="btnReset2" class="btn" ${st2.canReset ? '' : 'disabled'}>${t('btnReset')}</button>
        </div>
        <div class="scan-info" id="scanInfo"></div>

        <div class="action-status">
          工位二状态: <span class="status-badge ${this._stateClass(st2.state)}" id="st2StateLabel">${st2.label}</span>
        </div>
        <div class="action-log" id="st2Log"></div>
      </div>`;
    this._bindStation2Actions();
  }

  _renderLogsPage(el) {
    const cats = [
      { key: 'production', label: '生产记录' },
      { key: 'scan', label: '扫码记录' },
      { key: 'device', label: '设备日志' },
      { key: 'alarm', label: '报警记录' },
    ];
    const counts = this.traceLog.getCategoryCounts();
    const activeCat = this._logCategory || 'production';

    el.innerHTML = `
      <div class="logs-panel">
        <div class="log-filters">
          ${cats.map(c => `
            <button class="log-filter-btn ${activeCat === c.key ? 'active' : ''}" data-cat="${c.key}">
              ${c.label} (${counts[c.key] || 0})
            </button>
          `).join('')}
        </div>
        <div class="log-table-wrap" id="logTableWrap"></div>
      </div>`;

    // 绑定分类切换
    el.querySelectorAll('.log-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._logCategory = btn.dataset.cat;
        this._renderActionArea();
      });
    });

    // 渲染当前分类的表格
    this._renderLogTable(activeCat);
  }

  _renderLogTable(category) {
    const wrap = document.getElementById('logTableWrap');
    if (!wrap) return;
    const rows = this.traceLog.getByCategory(category, 50);

    if (rows.length === 0) {
      wrap.innerHTML = '<div class="empty-hint">暂无记录</div>';
      return;
    }

    let cols, mapper;
    switch (category) {
      case 'production':
        cols = ['时间', '型号', '22位码', '状态'];
        mapper = r => [r.createdAt || '-', r.modelName || '-', r.code22 || '-', r.status || '-'];
        break;
      case 'scan':
        cols = ['时间', '扫码内容', '阶段', '关联记录'];
        mapper = r => [r.timestamp || '-', r.code || '-', r.phase || '-', r.recordId || '-'];
        break;
      case 'device':
        cols = ['时间', '设备', '方向', '结果', '耗时ms'];
        mapper = r => [r.timestamp || '-', r.deviceType || '-', r.direction || '-', r.result || '-', r.elapsedMs || '-'];
        break;
      case 'alarm':
        cols = ['时间', '类型', '内容'];
        mapper = r => [r.occurredAt || '-', r.type || '-', r.message || '-'];
        break;
      default: return;
    }

    wrap.innerHTML = `
      <table class="data-table">
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${mapper(r).map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
  }

  _renderMaintenancePage(el) {
    const models = this.modelConfig.getAllModels();
    const currentModel = this.modelConfig.getCurrentModel();
    el.innerHTML = `
      <div class="maintenance-panel">
        <!-- 型号列表 -->
        <div class="maint-section">
          <div class="section-label">型号配置 (config/models.json)</div>
          <table class="data-table">
            <thead><tr><th>ID</th><th>型号名</th><th>客户件号</th><th>供应商代码</th><th>批次号</th><th>短码</th><th>固定码</th><th>启用</th></tr></thead>
            <tbody>${models.map(m => `
              <tr class="${m.enabled ? '' : 'disabled-row'}">
                <td>${m.id}</td><td>${m.name}</td><td>${m.customerPartNo}</td>
                <td>${m.supplierCode}</td><td>${m.productionBatchNo || '-'}</td>
                <td>${m.barcodePrefix}</td><td>${m.fixedCode}</td>
                <td>${m.enabled ? '是' : '否'}</td>
              </tr>`).join('')}</tbody>
          </table>
          <div class="maint-hint">当前选中: ${currentModel ? currentModel.name : '无'}</div>
        </div>

        <!-- 三类模板概览 -->
        <div class="maint-section">
          <div class="section-label">模板配置 (config/templates.json)</div>
          <div class="maint-cards">
            <div class="maint-card">
              <div class="maint-card-title">二维码激光标识模板</div>
              <div class="maint-card-body">
                内容: QR(22位码) + 右侧三行文字<br>
                字段: code22, customerPartNo, supplierCode, dateSerial<br>
                设备: laserEzcadAdapter → Lmc1.dll
              </div>
            </div>
            <div class="maint-card">
              <div class="maint-card-title">纸质标签模板</div>
              <div class="maint-card-body">
                内容: Logo + 件号 + 条形码 + 22位数字<br>
                字段: code22, customerPartNo<br>
                设备: printerAdapter → Zebra ZD888T
              </div>
            </div>
            <div class="maint-card">
              <div class="maint-card-title">永久性标识文本模板</div>
              <div class="maint-card-body">
                内容: 供应商代码 + 客户件号 + 生产批次号<br>
                字段: supplierCode, customerPartNo, productionBatchNo<br>
                设备: laserEzcadAdapter → Lmc1.dll
              </div>
            </div>
          </div>
        </div>

        <!-- 字段映射关系 -->
        <div class="maint-section">
          <div class="section-label">统一码源 → 三类标识映射</div>
          <table class="data-table">
            <thead><tr><th>字段</th><th>来源</th><th>二维码标识</th><th>纸质标签</th><th>永久性标识</th></tr></thead>
            <tbody>
              <tr><td>22位码</td><td>serialCodeBlock</td><td>QR内容</td><td>条形码+底部数字</td><td>—</td></tr>
              <tr><td>客户件号</td><td>modelConfigBlock</td><td>右侧第1行</td><td>标签顶部</td><td>文本组成</td></tr>
              <tr><td>供应商代码</td><td>modelConfigBlock</td><td>右侧第2行</td><td>—</td><td>文本组成</td></tr>
              <tr><td>日期+流水</td><td>serialCodeBlock</td><td>右侧第3行</td><td>—</td><td>—</td></tr>
              <tr><td>生产批次号</td><td>modelConfigBlock</td><td>—</td><td>—</td><td>文本组成</td></tr>
            </tbody>
          </table>
        </div>

        <!-- 配置来源 -->
        <div class="maint-section">
          <div class="section-label">配置文件索引</div>
          <div class="maint-hint">
            config/models.json — 型号参数<br>
            config/templates.json — 三类模板<br>
            config/devices.json — 设备连接参数<br>
            config/serial-rules.json — 22位码规则<br>
            config/ui-mapping.json — 界面映射
          </div>
        </div>
      </div>`;
  }

  _renderAlarms() {
    const alarms = this.traceLog.getRecentAlarms(5);
    const container = document.getElementById('alarmList');
    if (!container) return;
    if (alarms.length === 0) {
      container.innerHTML = '<div class="empty-hint">无报警</div>';
      return;
    }
    container.innerHTML = alarms.map(a =>
      `<div class="alarm-item alarm-${(a.type || 'INFO').toLowerCase()}">[${a.occurredAt}] ${a.type}: ${a.message}</div>`
    ).join('');
  }

  // ==================== 事件绑定 ====================

  _bindEvents() {
    // Tab 切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
    });

    // 型号下拉
    const sel = document.getElementById('modelSelect');
    if (sel) {
      sel.addEventListener('change', () => this._onModelChange(sel.value));
    }
  }

  _bindStation1Actions() {
    // --- 调试模式按钮 ---
    const btnStartDebug = document.getElementById('btnStartDebug');
    const btnContinueDebug = document.getElementById('btnContinueDebug');
    const btnEndDebug = document.getElementById('btnEndDebug');

    if (btnStartDebug) {
      btnStartDebug.addEventListener('click', async () => {
        this._st1Log(this._t('station1.logDebugEnter'));
        const result = await this.station1.startDebug(this.deviceAdapter.laser);
        this._st1Log(result.result.message || '红光已显示，请调整焦距和红框位置/大小。');
        this._renderActionArea();
      });
    }

    if (btnContinueDebug) {
      btnContinueDebug.addEventListener('click', async () => {
        this._st1Log(this._t('station1.logDebugContinue'));
        const result = await this.station1.continueDebug(this.deviceAdapter.laser);
        this._st1Log(result.result.message || '红光已刷新。');
        this._renderActionArea();
      });
    }

    if (btnEndDebug) {
      btnEndDebug.addEventListener('click', () => {
        this.station1.endDebug();
        this._st1Log(this._t('station1.logDebugEnd'));
        this._renderActionArea();
      });
    }

    // --- 业务模式切换 ---
    document.querySelectorAll('input[name="businessMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.station1.setBusinessMode(e.target.value);
        // 更新选中样式
        document.querySelectorAll('.mode-radio').forEach(l => l.classList.remove('selected'));
        e.target.closest('.mode-radio')?.classList.add('selected');
        // 刷新模板预览区
        this._refreshUI();
      });
    });

    // --- 执行按钮 ---
    const btnExec = document.getElementById('btnExecute');
    if (btnExec) {
      btnExec.addEventListener('click', async () => {
        const model = this.modelConfig.getCurrentModel();
        if (!model) { this._st1Log('请先选择型号。'); return; }
        try {
          // 生成码 → 绑定到 BusinessData
          const codeResult = this.station1.generateCode(this.serialCode, model);
          this._bd.attachCode(codeResult);
          this._st1Log(this._t('station1.logCodeGenerated', { code22: this._bd.code22 }));

          // 构建变量（ZPL 从配置读取模板）
          const vars = this._bd.getTemplateVars();
          vars.zpl = this._buildZpl(this._bd.code22);

          // 执行
          const result = await this.station1.execute(
            this.deviceAdapter.laser, this.deviceAdapter.printer, vars);

          const busMode = this.station1.getBusinessMode();
          const modeLabel = Station1PrintBlock.BUSINESS_MODES.find(m => m.key === busMode)?.label || busMode;
          this._st1Log(this._t('station1.logExecuteDone', { mode: modeLabel, code22: this._bd.code22 }));

          // 设备日志 (DeviceResult.toLogEntry)
          if (result.results.laser) {
            this.traceLog.addDeviceLog(result.results.laser.toLogEntry());
          }
          if (result.results.printer) {
            this.traceLog.addDeviceLog(result.results.printer.toLogEntry());
          }

          // 统一记录
          this._bd.businessMode = busMode;
          this.traceLog.addRecord(this._bd.toRecord('STATION1_COMPLETED'));
          this._refreshUI();
        } catch (e) {
          this._st1Log(`错误: ${e.message}`);
          this.traceLog.addAlarm('STATION1_ERROR', e.message);
        }
        this._renderActionArea();
      });
    }

    // --- 重新执行 ---
    const btnReprint = document.getElementById('btnReprint');
    if (btnReprint) {
      btnReprint.addEventListener('click', async () => {
        const st = this.station1.getState();
        if (!st.canReprint) { this._st1Log('当前无可重新执行的记录。'); return; }
        try {
          const vars = this._bd ? this._bd.getTemplateVars() : {};
          vars.zpl = this._bd ? this._buildZpl(this._bd.code22) : '';
          await this.station1.reprint(this.deviceAdapter.laser, this.deviceAdapter.printer, vars);
          this._st1Log(this._t('station1.logReprintDone', { code22: this._bd ? this._bd.code22 : '-' }));
          if (this._bd) {
            this._bd.reprintCount++;
            this.traceLog.addRecord(this._bd.toRecord('REPRINTED'));
          }
          this._refreshUI();
        } catch (e) {
          this._st1Log(`重新执行失败: ${e.message}`);
        }
      });
    }
  }

  _bindStation2Actions() {
    // --- 调试模式 ---
    const btnStartDebug2 = document.getElementById('btnStartDebug2');
    const btnContinueDebug2 = document.getElementById('btnContinueDebug2');
    const btnEndDebug2 = document.getElementById('btnEndDebug2');

    if (btnStartDebug2) {
      btnStartDebug2.addEventListener('click', async () => {
        this._st2Log(this._t('station2.logDebugEnter'));
        const result = await this.station2.startDebug(this.deviceAdapter.laser);
        this._st2Log(result.result.message || '红光已显示，请调整焦距和红框位置。');
        this._renderActionArea();
      });
    }
    if (btnContinueDebug2) {
      btnContinueDebug2.addEventListener('click', async () => {
        this._st2Log(this._t('station1.logDebugContinue'));
        const result = await this.station2.continueDebug(this.deviceAdapter.laser);
        this._st2Log(result.result.message || '红光已刷新。');
      });
    }
    if (btnEndDebug2) {
      btnEndDebug2.addEventListener('click', () => {
        this.station2.endDebug();
        this._st2Log(this._t('station2.logDebugEnd'));
        this._renderActionArea();
      });
    }

    // --- 模拟扫码（第一次=识别，第二次=触发打码） ---
    const btnScan2 = document.getElementById('btnSimScan2');
    if (btnScan2) {
      btnScan2.addEventListener('click', async () => {
        const info = document.getElementById('scanInfo');
        const model = this.modelConfig.getCurrentModel();
        try {
          const records = this.traceLog.getRecentRecords(100);
          const completedRecords = records.filter(r =>
            r.status === 'STATION1_COMPLETED' || r.status === 'COMPLETED');
          if (completedRecords.length === 0) {
            this._st2Log('没有可匹配的生产记录。请先在工位一完成生产。');
            if (info) info.innerHTML = '<span class="err">无记录</span>';
            return;
          }
          const code = completedRecords[0].code22;
          await this.deviceAdapter.scanner.simulateScan(code);

          const result = await this.station2.handleScan(
            code, completedRecords, model, this.deviceAdapter.laser,
          );

          if (info) info.innerHTML = `<span class="ok">${result.message}</span>`;
          this._st2Log(`扫码: ${code} — ${result.message}`);
          this.traceLog.addScanLog({ code, phase: result.phase });

          if (result.phase === 'second' && this._bd) {
            this.traceLog.addRecord(this._bd.toRecord('PERMANENT_MARKED'));
            if (result.markResult) {
              this.traceLog.addDeviceLog(result.markResult.toLogEntry());
            }
          }
        } catch (e) {
          if (info) info.innerHTML = `<span class="err">${e.message}</span>`;
          this._st2Log(`错误: ${e.message}`);
          this.traceLog.addAlarm('STATION2_ERROR', e.message);
        }
        this._renderActionArea();
        this._refreshUI();
      });
    }

    // --- 完成/重置 ---
    const btnReset2 = document.getElementById('btnReset2');
    if (btnReset2) {
      btnReset2.addEventListener('click', () => {
        this.station2.reset();
        this._st2Log(this._t('station2.logReset'));
        this._renderActionArea();
        this._refreshUI();
      });
    }
  }

  // ==================== 辅助 ====================

  /** 状态 → CSS 类名 */
  _stateClass(stateKey) {
    const map = {
      IDLE: 'status-idle', DEBUGGING: 'status-debug', AUTO_READY: 'status-auto',
      EXECUTING: 'status-exec', SCANNED: 'status-exec', MARKING: 'status-exec',
      POSITIONING: 'status-debug', COMPLETED: 'status-ok', CONFIRMED: 'status-ok',
      PAUSED: 'status-err',
    };
    return map[stateKey] || 'status-idle';
  }

  /** 从 ui-text.json 取文案，支持 {key} 替换 */
  _t(path, vars = {}) {
    if (!this._uiText) return path;
    const keys = path.split('.');
    let val = this._uiText;
    for (const k of keys) {
      if (val == null) return path;
      val = val[k];
    }
    if (typeof val !== 'string') return path;
    return val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
  }

  _buildZpl(code22) {
    const tpl = this._t('zplTemplate.default', { code22 });
    return tpl.replace(/\{code22\}/g, code22);
  }

  _switchTab(tabName) {
    this._currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabName}"]`)?.classList.add('active');
    this._refreshUI();
    this._renderActionArea();
  }

  _populateModelSelect() {
    const sel = document.getElementById('modelSelect');
    if (!sel) return;
    sel.innerHTML = this.modelConfig.getEnabledModels()
      .map(m => `<option value="${m.id}">${m.name}</option>`)
      .join('');
  }

  _selectDefaultModel() {
    const enabled = this.modelConfig.getEnabledModels();
    if (enabled.length > 0) {
      this.modelConfig.setCurrentModel(enabled[0].id);
      const sel = document.getElementById('modelSelect');
      if (sel) sel.value = enabled[0].id;
      this._bd = BusinessData.fromModel(this.modelConfig.getCurrentModel());
    }
  }

  _onModelChange(modelId) {
    this.modelConfig.setCurrentModel(modelId);
    this._bd = BusinessData.fromModel(this.modelConfig.getCurrentModel());
    this.serialCode.reset();
    this.station1.reset();
    this.station2.reset();
    this._refreshUI();
    this._renderActionArea();
  }

  _st1Log(msg) {
    const el = document.getElementById('st1Log');
    if (el) el.innerHTML += `<div>${msg}</div>`;
  }

  _st2Log(msg) {
    const el = document.getElementById('st2Log');
    if (el) el.innerHTML += `<div>${msg}</div>`;
  }
}

// --- 启动 ---
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.start().catch(err => {
    console.error('[app] 启动失败:', err);
    const body = document.body;
    if (body) body.innerHTML = `<div style="color:red;padding:20px;">启动失败: ${err.message}</div>`;
  });
});
