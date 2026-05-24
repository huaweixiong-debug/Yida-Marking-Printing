# Lmc1.dll 已知/未知清单

> 最后更新: 2026-05-24 — **dumpbin/pefile 探测已完成**
> 探测工具: Python pefile + reg query
> 探测脚本: `tools/probe_lmc1.py`

---

## ✅ 已确认（探测结果）

### DLL 基本信息

| 事项 | 结论 | 证据 |
|------|------|------|
| 文件存在 | ✅ Lmc1.dll, 640KB | `D:\...\Ezcad2.14.11(20220909)\` |
| 位数 | ✅ x86 32-bit | PE header Machine=0x14c |
| 配套 DLL | ✅ LMCMIO.dll(56 imports), DataMgr.dll(72 imports) | import table |
| 其他依赖 | QDib.dll, mathlib.dll, **MFC42u.DLL** | import table |
| 时间戳 | 2019-05-16 (1558010257) | PE header |
| 节数 | 5 | PE header |

### DLL 调用方式

| 事项 | 结论 | 证据 |
|------|------|------|
| **导出方式** | ✅ **C++ 导出函数 (232个符号)** — 非 COM | dumpbin: 232 exported symbols |
| 导出风格 | C++ 名称修饰 (??0CLmcDev@@...) — 无 C 包装 | mangled names |
| **COM 注册** | ❌ **未注册 COM** — 不是 COM 组件 | reg query HKEY_CLASSES_ROOT 无 LMC1/CLmcDev |
| SDK 文件 | ❌ 无头文件/官方SDK文档；仅发现 `PARAM/MarkParam.lib`（898B），用途待确认 | 目录扫描 |
| 框架依赖 | **MFC** (MFC42u.DLL) — 是 MFC C++ DLL | import table |

### 核心函数（已识别）

| 函数 | ord | 作用 | 确认程度 |
|------|-----|------|----------|
| `lmc_OpenDriver(H)` | 231 | 打开激光驱动 | ✅ 导出表 |
| `lmc_CloseDriver()` | 229 | 关闭激光驱动 | ✅ 导出表 |
| `gf_GetLmcDev()` → `CLmcDev*` | 179 | 获取/创建设备实例 | ✅ 导出表 |
| `gf_InitLmcCfg(LmcCfg&)` | 181 | 初始化配置结构 | ✅ 导出表 |
| `gf_ReadLmcCfg(LmcCfg&, CString)` | 183 | 从文件读取配置 | ✅ 导出表 |
| `CLmcDev::InitLmc(H, H)` | 99 | 初始化 LMC 设备 | ✅ 导出表 |
| `CLmcDev::Reset()` | 135 | 重置设备 | ✅ 导出表 |
| `CLmcDev::ReadyMark(H)` | 134 | 准备打码 | ✅ 导出表 |
| `CLmcDev::Run()` | 136 | 执行打码列表 | ✅ 导出表 |
| `CLmcDev::FinishMark()` | 49 | 完成打码 | ✅ 导出表 |
| `CLmcDev::GetDevState()` | 60 | 获取设备状态 | ✅ 导出表 |
| `CLmcDev::MarkEnt(CEntity*,H,NN,CMatrix2d*)` | 118 | 打标单个实体 | ✅ 导出表 |
| `CLmcDev::MarkEntArray(...)` | 119 | 打标实体数组 | ✅ 导出表 |
| `CLmcDev::WaitForMarkFinish()` | 168 | 等打码完成 | ✅ 导出表 |
| `CLmcDev::StopExecute()` | 163 | 停止执行 | ✅ 导出表 |
| `gf_StartMarkDlg(CString, CString)` | 189 | **EZCAD 内部打标对话框** | ✅ 导出表 |
| `CLmcDev::SetOwen(CWnd*)` | 157 | 设 MFC 父窗口 | ✅ 导出表 |
| `CLmcDev::IsValidDev()` | 113 | 设备有效性检查 | ✅ 导出表 |

### 协议与架构

| 事项 | 结论 |
|------|------|
| 桥接协议 | ✅ **HTTP POST http://127.0.0.1:9701/api + JSON**（已固定） |
| 协议文档 | config/bridge-protocol.json |
| 三层架构 | Node 主程序 ←HTTP→ 32位桥接进程 ←LoadLibrary→ Lmc1.dll |
| 桥接语言 | 探测阶段: Python ctypes（已验证可行）；生产桥接首选候选: C++ MFC |

---

## 🟡 高概率推断

| 事项 | 推断 | 依据 |
|------|------|------|
| `RedLight()` 功能 | `ReadyMark()` + 红框预览由 EZCAD 内部实现 | `ReadyMark` 通常启动预览；`gf_StartMarkDlg` 表明有内置 UI |
| 模板变量 | 通过 CEntity/DataMgr.dll 的实体系统设置，非简单键值对 | `MarkEnt(CEntity*)` 接受实体指针 |
| 初始化顺序 | `lmc_OpenDriver` → `gf_GetLmcDev` → `InitLmc` → `ReadyMark` → `MarkEnt` → `Run` → `WaitForMarkFinish` | 典型 EZCAD 调用模式 |
| MFC 必要性 | 需要 `AfxWinInit()` 初始化 MFC，`SetOwen(CWnd*)` 需要 MFC 窗口 | MFC42u.DLL 在导入表中 |
| DLL 可脱离 EZCAD GUI 调用 | 大概率可以 | `gf_GetLmcDev` + `InitLmc` 创建自己的设备实例 |

---

## ❌ 仍未确认

| 事项 | 优先级 | 确认方式 |
|------|--------|----------|
| CEntity 结构定义 | **高** | 需 C++ 头文件或逆向 DataMgr.dll 导出 |
| 模板 .ezd 文件格式 | **高** | EZCAD 文档或逆向 |
| 变量写入 API | **高** | 推测通过 CEntity 子类（CVarText 等） |
| `ReadyMark` 是否显示红框 | 中 | 实测 |
| `gf_StartMarkDlg` 是否是完整 EZCAD 打标窗口 | 中 | 实测 |
| MarkEnt 是否同步阻塞 | 中 | `WaitForMarkFinish` 存在，推测异步+等待 |
| LmcCfg 结构体定义 | 中 | 需头文件或逆向 |
| 是否需要完整 EZCAD 安装 | 低 | 实测 — 但 LMCMIO/DataMgr 都在同目录 |

---

## 桥接实现路线收敛（基于探测结果）

### 首选候选: C++ MFC 桥接进程（探测阶段已用 Python ctypes 验证可行）

```
bridge/
├── Lmc1Bridge.exe (32-bit x86 C++ MFC)
│   ├── AfxWinInit()  ← 初始化 MFC
│   ├── LoadLibrary("Lmc1.dll")
│   ├── GetProcAddress(232 个函数)
│   ├── lmc_OpenDriver() → gf_GetLmcDev() → InitLmc()
│   ├── HTTP 监听 127.0.0.1:9701 (用 WinHTTP 或 httplib)
│   └── 收到 JSON 命令 → 调用对应 Lmc1 函数 → 返回 JSON
```

### 为什么不是 C#

| 原因 | 说明 |
|------|------|
| MFC 依赖 | MFC42u.DLL 在导入表，DLL 内部可能调用 MFC 资源 |
| `SetOwen(CWnd*)` | 需要 MFC CWnd 指针，C# 无法构造 |
| P/Invoke MFC DLL | 理论上可行但风险极高，MFC 状态机在 CLR 中易崩溃 |

### 为什么不是 COM

直接不是 COM — 注册表无 ProgID，导出表为 C++ mangled names。

---

---

## 32位真实加载验证（2026-05-24）

| 事项 | 结论 |
|------|------|
| 32位环境 | `tools/py32/python.exe` (Python 3.12.8 embeddable, 32-bit) |
| DLL 加载 | `ctypes.CDLL(Lmc1.dll)` **成功** |
| 导出探测 | **17/17 全部可访问** (bridge_stub.py KEY_EXPORTS 全覆盖) |
| bridge 集成 | 32位 bridge stub 启动 → Node fetch Init → 返回 `{ok:true, exportsFound:17, exportsTotal:17}` |

### 验证的 17 个导出

`lmc_OpenDriver`, `lmc_CloseDriver`, `gf_GetLmcDev`, `gf_InitLmcCfg`, `gf_ReadLmcCfg`, `InitLmc`, `Reset`, `ReadyMark`, `Run`, `FinishMark`, `MarkEnt`, `GetDevState`, `StopExecute`, `IsValidDev`, `WaitForMarkFinish`, `SetCurrent`, `SetMaxPowerRatio`

---

---

## gf_GetLmcDev → InitLmc 最小初始化链路验证（2026-05-24）

| 事项 | 结论 |
|------|------|
| `gf_GetLmcDev()` 真实调用 | ✅ 已调用 |
| 返回指针 | **NULL** (`0x0`) |
| 原因推断 | 需要 EZCAD 控制卡硬件就绪，`lmc_OpenDriver(0)` 之后仍为 NULL |
| `InitLmc` 真实调用 | ❌ 被 NULL 保护拦截，返回 `LMC1_0003` |
| bridge 稳定性 | ✅ 多次调用失败后仍正常（Ping 响应正常） |

### 已观测

- `gf_GetLmcDev()` 签名正确（demangle: `CLmcDev* __cdecl gf_GetLmcDev(void)`）
- 函数可调用，不崩溃，返回 NULL
- `lmc_OpenDriver(0)` 返回 0 之后再调 `gf_GetLmcDev` 仍为 NULL
- `InitLmc` NULL 保护正确生效，bridge 未崩溃

### 高概率推断

- `gf_GetLmcDev` 需要控制卡硬件才能返回有效 `CLmcDev*`
- `gf_GetLmcDev` 不是纯内存对象工厂——它依赖底层设备驱动状态

### 仍未确认

- CLmcDev 对象内部结构
- `InitLmc(int,int)` 两个参数的语义
- `__thiscall` 在 ctypes 中的可行性（未实际到达调用点）
- 控制卡就绪后 `gf_GetLmcDev` 返回的指针是否可直接使用

---

## 下一步

1. 补齐 EZCAD 控制卡硬件
2. 接上控制卡后重新执行 `OpenDriver → GetLmcDev`，验证是否返回非空指针
3. 指针非空后调用 `InitLmc(ptr, 0, 0)`，验证返回值
4. 初始化成功后 `ReadyMark(ptr)` — 观察是否弹出 EZCAD 红框
2. 如能初始化成功，补全 Lmc1Bridge C++ 实现
3. 确认 `ReadyMark` 是否会弹出 EZCAD 红框 UI
4. 确认 `MarkEnt` / `Run` 的打码流程
5. 然后联调 Node ←HTTP→ C++ bridge
