# Lmc1Bridge — 32位桥接进程

## 当前状态

**软件验证阶段已完成。等待 EZCAD 控制卡硬件就位后可进入联调。**

| 项目 | 状态 | 说明 |
|------|------|------|
| 协议 | ✅ 已固定 | HTTP POST `http://127.0.0.1:9701/api` + JSON |
| 桥接进程 | ✅ 可运行 | 32位 Python + ctypes，`bridge_stub.py` |
| DLL 加载 | ✅ 已验证 | 32位 ctypes.CDLL 加载 Lmc1.dll 成功 |
| 导出探测 | ✅ 17/17 | 全部关键导出可访问 |
| `lmc_OpenDriver` | ✅ 真实调用 | 返回 0 |
| `lmc_CloseDriver` | ✅ 真实调用 | void，正常 |
| `gf_GetLmcDev` | ✅ 真实调用 | 返回 NULL — 无控制卡 |
| `InitLmc` | ⚠️ 保护路径 | NULL 拦截，未到达实际 thiscall |
| `ReadyMark` | ❌ 未调用 | 需要 CLmcDev* 非空 |
| `Run` / `MarkEnt` | ❌ 未调用 | 需要控制卡硬件 |

## 架构

```
prototype/ (Node 主程序, 浏览器)
    │  HTTP POST http://127.0.0.1:9701/api
    ▼
bridge/ (32位 Python 进程)
    │  ctypes.CDLL
    ▼
Lmc1.dll (Ezcad2.14.11, x86)
```

## 快速启动

```cmd
cd "Y:\仪达\009 激光打码同步标签打印\三码合一程序"
tools\py32\python.exe bridge\bridge_stub.py --port 9701
```

启动后应看到：
```
[Lmc1Bridge Stub] 启动在 http://127.0.0.1:9701/api
[Lmc1Bridge Stub] DLL 路径: D:\...\Lmc1.dll
[Lmc1Bridge Stub] 支持命令: Ping, Init, OpenDriver, CloseDriver, GetLmcDev, InitLmc, GetStatus
```

## 支持的命令

| 命令 | 真实调用? | 说明 |
|------|-----------|------|
| `Ping` | - | 心跳检测 |
| `Init` | ✅ | DLL 加载 + 17 导出探测 |
| `OpenDriver` | ✅ | `lmc_OpenDriver(0)` → 0 |
| `CloseDriver` | ✅ | `lmc_CloseDriver()` → void |
| `GetLmcDev` | ✅ | `gf_GetLmcDev()` → NULL（无控制卡） |
| `InitLmc` | ⚠️ 保护 | NULL 拦截 → `LMC1_0003` |
| `GetStatus` | - | 返回桥接和 DLL 状态 |

## 控制卡到位后第一步

```js
// 1. 验证 bridge 在线
fetch('http://127.0.0.1:9701/api', {method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({id:'1',cmd:'Ping'})}).then(r=>r.json())

// 2. OpenDriver
fetch('http://127.0.0.1:9701/api', {method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({id:'2',cmd:'OpenDriver',params:{driverIndex:0}})}).then(r=>r.json())
// 预期: {ok:true, data:{returnValue:0}}

// 3. GetLmcDev — 关键验证点
fetch('http://127.0.0.1:9701/api', {method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({id:'3',cmd:'GetLmcDev'})}).then(r=>r.json())
// 有控制卡预期: {ok:true, data:{returnValue:"0x...", isNull:false}}
// 无控制卡当前: {ok:true, data:{returnValue:"NULL", isNull:true}}
```

## 文件结构

```
bridge/
├── README.md          ← 本文件
├── config.json        ← 桥接配置 (DLL路径/端口)
├── bridge_stub.py     ← Python 桥接进程
├── start_bridge.bat   ← Windows 启动脚本
└── src/
    └── Program.cs     ← [保留] C# 参考方案
```

## 相关文档

- `config/bridge-protocol.json` — 协议正式定义（12条命令 + 14个错误码）
- `docs/lmc1-known-unknown.md` — Lmc1.dll 探测全记录
- `docs/联调清单.md` — 控制卡到位后联调步骤
