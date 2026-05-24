"""
Lmc1Bridge Stub — 最小可运行桥接进程

职责:
  1. 监听 HTTP 127.0.0.1:9701
  2. 接收 POST /api JSON 命令
  3. 尝试加载 Lmc1.dll (ctypes)
  4. 探测关键导出函数
  5. 返回 JSON 结果 (严格按 bridge-protocol.json 格式)

启动:
  python bridge_stub.py              → 默认 9701 端口
  python bridge_stub.py --port 9702  → 指定端口

当前状态: 本地软件链路验证 — 不尝试真实打码动作
"""
import json
import sys
import os
import ctypes
import traceback
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# ===== 配置 =====
BRIDGE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BRIDGE_DIR / "config.json"

# 从 config.json 读取 DLL 路径，失败则用默认值
DLL_PATH = r"D:\BaiduNetdiskDownload\测试系统必要软件\激光打标\Ezcad2.14.11(20220909)\Lmc1.dll"
try:
    with open(CONFIG_PATH) as f:
        cfg = json.load(f)
    DLL_PATH = cfg.get("bridge", {}).get("dll", {}).get("path", DLL_PATH)
except Exception:
    pass

# 关键导出函数列表 (32位 Python ctypes 已验证 17/17 全部可访问)
# 标签仅用于日志展示，实际查找用 mangled 名称
KEY_EXPORTS = [
    ("lmc_OpenDriver",     "?lmc_OpenDriver@@YAHH@Z"),
    ("lmc_CloseDriver",    "?lmc_CloseDriver@@YAXXZ"),
    ("gf_GetLmcDev",       "?gf_GetLmcDev@@YAPAVCLmcDev@@XZ"),
    ("gf_InitLmcCfg",      "?gf_InitLmcCfg@@YAXAAULmcCfg@@@Z"),
    ("gf_ReadLmcCfg",      "?gf_ReadLmcCfg@@YAHAAULmcCfg@@VCString@@@Z"),
    ("InitLmc",            "?InitLmc@CLmcDev@@QAEHHH@Z"),
    ("Reset",              "?Reset@CLmcDev@@QAEHXZ"),
    ("ReadyMark",          "?ReadyMark@CLmcDev@@UAEHH@Z"),
    ("Run",                "?Run@CLmcDev@@UAEHXZ"),
    ("FinishMark",         "?FinishMark@CLmcDev@@UAEHXZ"),
    ("MarkEnt",            "?MarkEnt@CLmcDev@@QAEHPAVCEntity@@HNNPAVCMatrix2d@@@Z"),
    ("GetDevState",        "?GetDevState@CLmcDev@@QAEGXZ"),
    ("StopExecute",        "?StopExecute@CLmcDev@@QAEHXZ"),
    ("IsValidDev",         "?IsValidDev@CLmcDev@@QAEHXZ"),
    ("WaitForMarkFinish",  "?WaitForMarkFinish@CLmcDev@@QAEHXZ"),
    ("SetCurrent",         "?SetCurrent@CLmcDev@@QAEHN@Z"),
    ("SetMaxPowerRatio",   "?SetMaxPowerRatio@CLmcDev@@QAEXN@Z"),
]


def probe_dll(dll_path):
    """尝试加载 DLL 并探测导出函数。返回探测结果 dict。"""
    result = {
        "dllPath": dll_path,
        "dllExists": False,
        "loaded": False,
        "loadError": None,
        "exportsFound": [],
        "exportsMissing": [],
        "exportsTotalChecked": len(KEY_EXPORTS),
    }

    # 1. 文件存在性
    if not os.path.isfile(dll_path):
        result["loadError"] = f"DLL 文件不存在: {dll_path}"
        return result
    result["dllExists"] = True
    result["fileSize"] = os.path.getsize(dll_path)

    # 2. 尝试加载 (ctypes)
    dll = None
    try:
        dll = ctypes.CDLL(dll_path)
        result["loaded"] = True
    except OSError as e:
        result["loadError"] = f"ctypes 加载失败: {e}"
        # 常见原因: 32/64 位不匹配
        if "not a valid Win32" in str(e) or "%1" in str(e):
            result["loadError"] += " (Python 位数与 DLL 不匹配 — 需要 32位 Python 加载 32位 DLL)"
        return result
    except Exception as e:
        result["loadError"] = f"加载异常: {e}"
        return result

    # 3. 探测导出 (KEY_EXPORTS 为 (label, mangled_name) 元组)
    for item in KEY_EXPORTS:
        label, mangled = item if isinstance(item, tuple) else (item, item)
        try:
            getattr(dll, mangled)
            result["exportsFound"].append(label)
        except AttributeError:
            result["exportsMissing"].append(label)

    # 4. 卸载
    try:
        # ctypes 没有显式卸载，让 GC 处理
        del dll
    except Exception:
        pass

    return result


# ===== DLL 缓存（加载一次，跨请求复用） =====
_dll_handle = None

def _get_dll(dll_path=None):
    """获取缓存的 DLL 句柄，首次调用时加载"""
    global _dll_handle
    if _dll_handle is not None:
        return _dll_handle
    path = dll_path or DLL_PATH
    if not os.path.isfile(path):
        raise FileNotFoundError(f"DLL 文件不存在: {path}")
    _dll_handle = ctypes.CDLL(path)
    return _dll_handle

def _unload_dll():
    """卸载缓存的 DLL"""
    global _dll_handle
    _dll_handle = None


def handle_request(req_body):
    """处理桥接请求。返回 (status_code, response_dict)。"""
    try:
        req = json.loads(req_body)
    except json.JSONDecodeError:
        return 400, {"id": "?", "ok": False, "error": {"code": "BRIDGE_0003", "message": "请求 JSON 解析失败"}}

    req_id = req.get("id", "?")
    cmd = req.get("cmd", "")
    params = req.get("params", {})

    if cmd == "Ping":
        return 200, {"id": req_id, "ok": True, "data": {"pong": True, "bridge": "Lmc1Bridge Stub (Python)"}}

    if cmd == "Init":
        dll_path = params.get("dllPath", DLL_PATH)
        print(f"[bridge] Init: probing {dll_path}")
        probe = probe_dll(dll_path)
        if probe["loaded"]:
            return 200, {"id": req_id, "ok": True, "data": {
                "message": f"DLL 加载成功",
                "dllPath": dll_path,
                "fileSize": probe.get("fileSize", 0),
                "exportsFound": len(probe["exportsFound"]),
                "exportsTotal": probe["exportsTotalChecked"],
                "exportsMissing": probe["exportsMissing"],
                "exportsSample": probe["exportsFound"][:5],
            }}
        else:
            return 200, {"id": req_id, "ok": False, "error": {
                "code": "LMC1_0002" if probe["dllExists"] else "LMC1_0001",
                "message": probe["loadError"],
                "detail": {
                    "dllExists": probe["dllExists"],
                    "exportsFound": probe["exportsFound"],
                    "exportsMissing": probe["exportsMissing"],
                }
            }}

    if cmd == "OpenDriver":
        # 签名: int __cdecl lmc_OpenDriver(int)
        # 参数: driverIndex (0 = 默认设备)
        driver_index = int(params.get("driverIndex", 0))
        try:
            dll = _get_dll(params.get("dllPath"))
            func = getattr(dll, "?lmc_OpenDriver@@YAHH@Z")
            func.restype = ctypes.c_int
            func.argtypes = [ctypes.c_int]
            ret = func(driver_index)
            print(f"[bridge] OpenDriver({driver_index}) -> {ret}")
            return 200, {"id": req_id, "ok": True, "data": {
                "function": "lmc_OpenDriver",
                "signature": "int __cdecl lmc_OpenDriver(int)",
                "arguments": {"driverIndex": driver_index},
                "returnValue": ret,
                "returnHex": hex(ret) if ret < 0 else f"0x{ret:X}",
                "note": "返回值含义待厂商文档/头文件/控制卡验证确认。当前仅记录观测结果: OpenDriver(0)=0, OpenDriver(1)=1, OpenDriver(-1)=1。不能据此推断语义。"
            }}
        except FileNotFoundError as e:
            return 200, {"id": req_id, "ok": False, "error": {"code": "LMC1_0001", "message": str(e)}}
        except Exception as e:
            print(f"[bridge] OpenDriver ERROR: {e}")
            return 200, {"id": req_id, "ok": False, "error": {"code": "LMC1_9999", "message": f"调用 lmc_OpenDriver 异常: {e}"}}

    if cmd == "CloseDriver":
        # 签名: void __cdecl lmc_CloseDriver()
        try:
            dll = _get_dll(params.get("dllPath"))
            func = getattr(dll, "?lmc_CloseDriver@@YAXXZ")
            func.restype = None  # void
            func()
            _unload_dll()
            print(f"[bridge] CloseDriver() -> OK, DLL unloaded")
            return 200, {"id": req_id, "ok": True, "data": {
                "function": "lmc_CloseDriver",
                "signature": "void __cdecl lmc_CloseDriver()",
                "returnValue": None,
                "note": "DLL 已卸载"
            }}
        except Exception as e:
            print(f"[bridge] CloseDriver ERROR: {e}")
            return 200, {"id": req_id, "ok": False, "error": {"code": "LMC1_9999", "message": f"调用 lmc_CloseDriver 异常: {e}"}}

    if cmd == "GetLmcDev":
        # 签名: CLmcDev* __cdecl gf_GetLmcDev(void)
        # 返回 CLmcDev 对象指针，无参数
        try:
            dll = _get_dll(params.get("dllPath"))
            func = getattr(dll, "?gf_GetLmcDev@@YAPAVCLmcDev@@XZ")
            func.restype = ctypes.c_void_p
            ptr = func()
            print(f"[bridge] GetLmcDev() -> {hex(ptr) if ptr else 'NULL'}")
            return 200, {"id": req_id, "ok": True, "data": {
                "function": "gf_GetLmcDev",
                "signature": "CLmcDev* __cdecl gf_GetLmcDev(void)",
                "returnValue": hex(ptr) if ptr else "NULL",
                "isNull": ptr is None or ptr == 0,
                "ptrValue": ptr if isinstance(ptr, int) else 0,
                "note": "非空指针表示已获取到 CLmcDev 对象实例。内部结构未知，不能推断对象是否有效。"
            }}
        except FileNotFoundError as e:
            return 200, {"id": req_id, "ok": False, "error": {"code": "LMC1_0001", "message": str(e)}}
        except Exception as e:
            print(f"[bridge] GetLmcDev ERROR: {e}")
            return 200, {"id": req_id, "ok": False, "error": {"code": "LMC1_9999", "message": f"调用 gf_GetLmcDev 异常: {e}"}}

    if cmd == "InitLmc":
        # 签名: int __thiscall CLmcDev::InitLmc(int, int)
        # 参数推测: (cardNo, boardType?) — 未确认，用保守值(0,0)
        # 调用方式假设: ctypes 将 this 指针作为第一参数传递（x86 __thiscall 常见相容行为）
        param1 = int(params.get("param1", 0))
        param2 = int(params.get("param2", 0))
        try:
            dll = _get_dll(params.get("dllPath"))
            # 先获取 CLmcDev* 指针
            getDev = getattr(dll, "?gf_GetLmcDev@@YAPAVCLmcDev@@XZ")
            getDev.restype = ctypes.c_void_p
            dev_ptr = getDev()
            if not dev_ptr:
                return 200, {"id": req_id, "ok": False, "error": {
                    "code": "LMC1_0003", "message": "无法获取 CLmcDev* 指针 (gf_GetLmcDev 返回 NULL)"
                }}
            # 尝试调用 InitLmc（__thiscall: this 指针作为第一参数）
            func = getattr(dll, "?InitLmc@CLmcDev@@QAEHHH@Z")
            func.restype = ctypes.c_int
            func.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]  # this + param1 + param2
            ret = func(dev_ptr, param1, param2)
            print(f"[bridge] InitLmc(this={hex(dev_ptr)}, {param1}, {param2}) -> {ret}")
            return 200, {"id": req_id, "ok": True, "data": {
                "function": "InitLmc",
                "signature": "int __thiscall CLmcDev::InitLmc(int, int) [调用方式假设: this 指针作第一参数]",
                "thisPtr": hex(dev_ptr),
                "arguments": {"param1": param1, "param2": param2},
                "returnValue": ret,
                "callingConventionNote": "x86 __thiscall 在 ctypes 中通过将 this 作为第一参数传递尝试调用。此方式在 MSVC x86 下常见可行，但非标准保证。",
                "returnValueNote": "返回值含义待厂商文档确认。不能据此推断'设备初始化成功'。"
            }}
        except FileNotFoundError as e:
            return 200, {"id": req_id, "ok": False, "error": {"code": "LMC1_0001", "message": str(e)}}
        except Exception as e:
            print(f"[bridge] InitLmc ERROR: {e}")
            return 200, {"id": req_id, "ok": False, "error": {"code": "LMC1_9999", "message": f"调用 InitLmc 异常: {e}"}}

    if cmd == "GetStatus":
        return 200, {"id": req_id, "ok": True, "data": {
            "state": "READY",
            "dllLoaded": _dll_handle is not None,
            "dllPath": DLL_PATH,
            "note": "bridge stub — 支持: Ping, Init, OpenDriver, CloseDriver, GetLmcDev, InitLmc, GetStatus"
        }}

    # 其他命令: 未实现
    return 200, {"id": req_id, "ok": False, "error": {
        "code": "LMC1_9001",
        "message": f"命令 '{cmd}' 在当前 bridge stub 中未实现。已支持: Ping, Init, OpenDriver, CloseDriver, GetLmcDev, InitLmc, GetStatus"
    }}


class BridgeHandler(BaseHTTPRequestHandler):
    """HTTP 请求处理器"""
    def do_POST(self):
        if self.path != "/api":
            self.send_error(404)
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"

        status, resp = handle_request(body)

        resp_bytes = json.dumps(resp, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(resp_bytes)))
        self.end_headers()
        self.wfile.write(resp_bytes)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[bridge] {args[0]}")


def main():
    parser = argparse.ArgumentParser(description="Lmc1Bridge Stub")
    parser.add_argument("--port", type=int, default=9701, help="监听端口 (默认 9701)")
    parser.add_argument("--dll", type=str, default="", help="Lmc1.dll 路径 (覆盖 config)")
    args = parser.parse_args()

    # 通过 sys.modules['__main__'] 修改的是当前运行模块的全局变量，
    # 而非 import 产生的新副本，确保 handle_request() 读到修改后的值。
    main_module = sys.modules.get('__main__')
    if args.dll and main_module:
        main_module.DLL_PATH = args.dll

    server = HTTPServer(("127.0.0.1", args.port), BridgeHandler)
    print(f"[Lmc1Bridge Stub] 启动在 http://127.0.0.1:{args.port}/api")
    print(f"[Lmc1Bridge Stub] DLL 路径: {main_module.DLL_PATH if main_module else DLL_PATH}")
    print(f"[Lmc1Bridge Stub] 支持命令: Ping, Init, OpenDriver, CloseDriver, GetLmcDev, InitLmc, GetStatus")
    print(f"[Lmc1Bridge Stub] Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Lmc1Bridge Stub] 已停止")
        server.shutdown()


if __name__ == "__main__":
    main()
