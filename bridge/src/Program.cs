/**
 * Lmc1Bridge — C# stub 骨架 (32位 x86)
 *
 * 编译方式:
 *   Visual Studio → 新建控制台项目 (.NET Framework 4.8)
 *   → 项目属性 → 生成 → 目标平台: x86
 *   → 引用 → 添加 COM 引用 → Lmc1.dll
 *
 * 运行:
 *   Lmc1Bridge.exe
 *   → 监听 http://127.0.0.1:9701/api
 *   → 等待 Node 主程序调用
 *
 * 当前状态: STUB — 等待确认 Lmc1.dll 的调用方式后补充真实逻辑。
 */

using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;

namespace Lmc1Bridge
{
    // ===== 协议数据类 =====
    class Request
    {
        public string id { get; set; }
        public string cmd { get; set; }
        public JsonElement? Params { get; set; }
    }

    class Response
    {
        public string id { get; set; }
        public bool ok { get; set; }
        public object data { get; set; }
        public object error { get; set; }
    }

    // ===== Lmc1.dll 封装 (STUB — 待确认导出函数签名) =====
    class Lmc1Wrapper
    {
        private bool _loaded = false;

        public bool Initialize(string dllPath)
        {
            // === STUB ===
            // 真实实现:
            //   方法A (COM):  Type lmcType = Type.GetTypeFromProgID("LMC1.Application");
            //                  _lmc = Activator.CreateInstance(lmcType);
            //   方法B (P/Invoke): [DllImport("Lmc1.dll")] static extern int Lmc1_Init();
            Console.WriteLine($"[Lmc1Wrapper] STUB: Initialize({dllPath})");
            _loaded = true;
            return true;
        }

        public bool LoadTemplate(string path)
        {
            Console.WriteLine($"[Lmc1Wrapper] STUB: LoadTemplate({path})");
            return _loaded;
        }

        public bool SetVariables(object variables)
        {
            Console.WriteLine($"[Lmc1Wrapper] STUB: SetVariables({JsonSerializer.Serialize(variables)})");
            return _loaded;
        }

        public bool RedLight()
        {
            Console.WriteLine($"[Lmc1Wrapper] STUB: RedLight()");
            return _loaded;
        }

        public bool StartMark()
        {
            Console.WriteLine($"[Lmc1Wrapper] STUB: StartMark()");
            return _loaded;
        }

        public bool Reset()
        {
            Console.WriteLine($"[Lmc1Wrapper] STUB: Reset()");
            return _loaded;
        }

        public void Dispose()
        {
            Console.WriteLine($"[Lmc1Wrapper] STUB: Dispose()");
            _loaded = false;
        }
    }

    // ===== 主程序 =====
    class Program
    {
        static Lmc1Wrapper _lmc = new Lmc1Wrapper();

        static void Main(string[] args)
        {
            var port = args.Length > 0 ? int.Parse(args[0]) : 9701;
            var listener = new HttpListener();
            listener.Prefixes.Add($"http://127.0.0.1:{port}/api/");

            try
            {
                listener.Start();
                Console.WriteLine($"[Lmc1Bridge] 监听 http://127.0.0.1:{port}/api/ (32位 x86)");

                while (true)
                {
                    var ctx = listener.GetContext();
                    ThreadPool.QueueUserWorkItem(_ => HandleRequest(ctx));
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Lmc1Bridge] 启动失败: {ex.Message}");
            }
        }

        static void HandleRequest(HttpListenerContext ctx)
        {
            Response resp = null;
            try
            {
                using var reader = new StreamReader(ctx.Request.InputStream);
                var body = reader.ReadToEnd();
                var req = JsonSerializer.Deserialize<Request>(body);

                resp = ExecuteCommand(req);
            }
            catch (Exception ex)
            {
                resp = new Response { id = "?", ok = false, error = new { code = "LMC1_9999", message = ex.Message } };
            }

            var json = JsonSerializer.Serialize(resp);
            var bytes = Encoding.UTF8.GetBytes(json);
            ctx.Response.ContentType = "application/json";
            ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            ctx.Response.Close();
        }

        static Response ExecuteCommand(Request req)
        {
            var resp = new Response { id = req.id };
            try
            {
                switch (req.cmd)
                {
                    case "Ping":
                        resp.ok = true; resp.data = new { pong = true }; break;
                    case "Init":
                        var path = GetParam(req.Params, "dllPath", "");
                        resp.ok = _lmc.Initialize(path);
                        resp.data = new { message = "OK", dllLoaded = true }; break;
                    case "LoadTemplate":
                        var tpl = GetParam(req.Params, "path", "");
                        resp.ok = _lmc.LoadTemplate(tpl);
                        resp.data = new { message = "OK" }; break;
                    case "SetVariables":
                        var vars = GetParam(req.Params, "variables", new { });
                        resp.ok = _lmc.SetVariables(vars);
                        resp.data = new { message = "OK" }; break;
                    case "RedLight":
                        resp.ok = _lmc.RedLight();
                        resp.data = new { message = "OK" }; break;
                    case "StartMark":
                        resp.ok = _lmc.StartMark();
                        resp.data = new { message = "OK", markCount = 1 }; break;
                    case "GetStatus":
                        resp.ok = true; resp.data = new { state = "READY", dllLoaded = true }; break;
                    case "Reset":
                        resp.ok = _lmc.Reset(); resp.data = new { message = "OK" }; break;
                    case "Shutdown":
                        _lmc.Dispose();
                        resp.ok = true; resp.data = new { message = "OK" };
                        Environment.Exit(0); break;
                    default:
                        resp.ok = false;
                        resp.error = new { code = "LMC1_9001", message = $"未知命令: {req.cmd}" }; break;
                }
            }
            catch (Exception ex)
            {
                resp.ok = false;
                resp.error = new { code = "LMC1_9999", message = ex.Message };
            }
            return resp;
        }

        static string GetParam(JsonElement? elem, string key, string def)
        {
            if (elem == null) return def;
            var je = elem.Value;
            if (je.TryGetProperty(key, out var val) && val.ValueKind == JsonValueKind.String)
                return val.GetString();
            return def;
        }

        static object GetParam(JsonElement? elem, string key, object def)
        {
            if (elem == null) return def;
            var je = elem.Value;
            if (je.TryGetProperty(key, out var val))
                return JsonSerializer.Deserialize<object>(val.GetRawText());
            return def;
        }
    }
}
