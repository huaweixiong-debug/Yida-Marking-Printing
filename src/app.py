from __future__ import annotations

import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog, ttk
from typing import Any

from config import load_config
from database import Database, today_text
from devices import DeviceResult, LaserAdapter, PrinterAdapter
from label import build_zpl_label


class SanmaApp:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.config = load_config(base_dir)
        self.db = Database(base_dir / self.config["database_path"])
        self.db.initialize()
        self.db.seed_defaults()
        self.printer = PrinterAdapter(base_dir, self.config["printer"])
        self.laser = LaserAdapter(base_dir, self.config["laser"])
        self.root = tk.Tk()
        self.root.title(self.config.get("app_name", "重汽三码合一程序"))
        self.root.geometry("1180x760")
        self.root.minsize(1040, 680)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.option_add("*Font", ("Microsoft YaHei UI", 10))

        self.models: list[dict[str, Any]] = []
        self.model_name_to_id: dict[str, int] = {}
        self.current_record_id: int | None = None
        self.running = False

        self._build_styles()
        self._build_ui()
        self.refresh_all()

    def run(self) -> None:
        self.root.mainloop()

    def on_close(self) -> None:
        self.db.close()
        self.root.destroy()

    def _build_styles(self) -> None:
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("Title.TLabel", font=("Microsoft YaHei UI", 18, "bold"))
        style.configure("Code.TLabel", font=("Consolas", 22, "bold"))
        style.configure("Danger.TLabel", foreground="#b91c1c")
        style.configure("Ok.TLabel", foreground="#15803d")
        style.configure("Primary.TButton", font=("Microsoft YaHei UI", 11, "bold"))

    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=12)
        outer.pack(fill=tk.BOTH, expand=True)

        header = ttk.Frame(outer)
        header.pack(fill=tk.X)
        ttk.Label(header, text="重汽三码合一程序", style="Title.TLabel").pack(side=tk.LEFT)
        self.status_var = tk.StringVar(value="待机")
        ttk.Label(header, textvariable=self.status_var).pack(side=tk.RIGHT)

        self.notebook = ttk.Notebook(outer)
        self.notebook.pack(fill=tk.BOTH, expand=True, pady=(12, 0))

        self._build_production_tab()
        self._build_model_tab()
        self._build_query_tab()
        self._build_log_tab()

    def _build_production_tab(self) -> None:
        tab = ttk.Frame(self.notebook, padding=12)
        self.notebook.add(tab, text="生产操作")

        top = ttk.Frame(tab)
        top.pack(fill=tk.X)

        ttk.Label(top, text="产品型号").grid(row=0, column=0, sticky=tk.W)
        self.production_model_var = tk.StringVar()
        self.production_model_combo = ttk.Combobox(
            top,
            textvariable=self.production_model_var,
            state="readonly",
            width=34,
        )
        self.production_model_combo.grid(row=1, column=0, sticky=tk.W, padx=(0, 12), pady=(4, 0))

        ttk.Label(top, text="操作员").grid(row=0, column=1, sticky=tk.W)
        self.operator_var = tk.StringVar(value=self.config.get("operator_default", "OP001"))
        ttk.Entry(top, textvariable=self.operator_var, width=18).grid(
            row=1,
            column=1,
            sticky=tk.W,
            padx=(0, 12),
            pady=(4, 0),
        )

        ttk.Button(top, text="刷新型号", command=self.refresh_models).grid(
            row=1,
            column=2,
            padx=(0, 8),
            pady=(4, 0),
        )
        ttk.Button(top, text="启动生产", style="Primary.TButton", command=self.start_production).grid(
            row=1,
            column=3,
            padx=(0, 8),
            pady=(4, 0),
        )
        ttk.Button(top, text="当前重新打印", command=self.reprint_current).grid(
            row=1,
            column=4,
            pady=(4, 0),
        )

        current = ttk.LabelFrame(tab, text="当前产品", padding=12)
        current.pack(fill=tk.X, pady=(12, 8))

        self.current_code_var = tk.StringVar(value="----------------------")
        ttk.Label(current, textvariable=self.current_code_var, style="Code.TLabel").pack(anchor=tk.W)

        self.current_info_var = tk.StringVar(value="等待选择型号并启动")
        ttk.Label(current, textvariable=self.current_info_var).pack(anchor=tk.W, pady=(6, 0))

        device_frame = ttk.Frame(current)
        device_frame.pack(fill=tk.X, pady=(8, 0))
        self.db_state_var = tk.StringVar(value=f"数据库: {self.db.path}")
        self.printer_state_var = tk.StringVar(value=f"打印: {self.config['printer'].get('mode', 'file')}")
        self.laser_state_var = tk.StringVar(value=f"激光: {self.config['laser'].get('mode', 'file')}")
        ttk.Label(device_frame, textvariable=self.db_state_var, style="Ok.TLabel").pack(side=tk.LEFT, padx=(0, 20))
        ttk.Label(device_frame, textvariable=self.printer_state_var).pack(side=tk.LEFT, padx=(0, 20))
        ttk.Label(device_frame, textvariable=self.laser_state_var).pack(side=tk.LEFT)

        lower = ttk.PanedWindow(tab, orient=tk.HORIZONTAL)
        lower.pack(fill=tk.BOTH, expand=True)

        recent_frame = ttk.LabelFrame(lower, text="最近生产记录", padding=8)
        lower.add(recent_frame, weight=3)
        self.recent_tree = ttk.Treeview(
            recent_frame,
            columns=("time", "model", "code", "status", "reprint"),
            show="headings",
            height=15,
        )
        self._setup_tree(
            self.recent_tree,
            [
                ("time", "时间", 150),
                ("model", "型号", 170),
                ("code", "22位码", 220),
                ("status", "状态", 90),
                ("reprint", "重打", 60),
            ],
        )
        self.recent_tree.pack(fill=tk.BOTH, expand=True)

        log_frame = ttk.LabelFrame(lower, text="运行提示", padding=8)
        lower.add(log_frame, weight=2)
        self.production_log = tk.Text(log_frame, height=15, wrap=tk.WORD)
        self.production_log.pack(fill=tk.BOTH, expand=True)

    def _build_model_tab(self) -> None:
        tab = ttk.Frame(self.notebook, padding=12)
        self.notebook.add(tab, text="型号维护")

        left = ttk.Frame(tab)
        left.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 12))
        self.model_tree = ttk.Treeview(
            left,
            columns=("id", "name", "prefix", "fixed", "enabled", "remark"),
            show="headings",
            height=18,
        )
        self._setup_tree(
            self.model_tree,
            [
                ("id", "ID", 50),
                ("name", "型号", 180),
                ("prefix", "9位条码号", 120),
                ("fixed", "固定码", 70),
                ("enabled", "启用", 60),
                ("remark", "备注", 260),
            ],
        )
        self.model_tree.pack(fill=tk.BOTH, expand=True)
        self.model_tree.bind("<<TreeviewSelect>>", self.on_model_selected)

        form = ttk.LabelFrame(tab, text="型号参数", padding=12)
        form.pack(side=tk.RIGHT, fill=tk.Y)
        self.model_id_var = tk.StringVar()
        self.model_name_var = tk.StringVar()
        self.model_prefix_var = tk.StringVar()
        self.model_fixed_var = tk.StringVar()
        self.model_enabled_var = tk.BooleanVar(value=True)
        self.model_remark_var = tk.StringVar()

        rows = [
            ("ID", self.model_id_var, True),
            ("型号名称", self.model_name_var, False),
            ("9位条码号", self.model_prefix_var, False),
            ("1位固定码", self.model_fixed_var, False),
            ("备注", self.model_remark_var, False),
        ]
        for idx, (label, var, readonly) in enumerate(rows):
            ttk.Label(form, text=label).grid(row=idx, column=0, sticky=tk.W, pady=(0, 6))
            state = "readonly" if readonly else "normal"
            ttk.Entry(form, textvariable=var, width=28, state=state).grid(
                row=idx,
                column=1,
                sticky=tk.W,
                pady=(0, 6),
            )
        ttk.Checkbutton(form, text="启用", variable=self.model_enabled_var).grid(
            row=len(rows),
            column=1,
            sticky=tk.W,
            pady=(0, 12),
        )
        ttk.Button(form, text="新增", command=self.add_model).grid(row=6, column=0, sticky=tk.EW, pady=(0, 8))
        ttk.Button(form, text="保存修改", command=self.save_model).grid(row=6, column=1, sticky=tk.EW, pady=(0, 8))
        ttk.Button(form, text="清空表单", command=self.clear_model_form).grid(row=7, column=0, columnspan=2, sticky=tk.EW)

    def _build_query_tab(self) -> None:
        tab = ttk.Frame(self.notebook, padding=12)
        self.notebook.add(tab, text="数据查询")

        filters = ttk.Frame(tab)
        filters.pack(fill=tk.X)
        self.query_model_var = tk.StringVar()
        self.query_date_var = tk.StringVar(value=today_text())
        self.query_code_var = tk.StringVar()

        ttk.Label(filters, text="型号").grid(row=0, column=0, sticky=tk.W)
        ttk.Entry(filters, textvariable=self.query_model_var, width=20).grid(row=1, column=0, padx=(0, 10), pady=(4, 0))
        ttk.Label(filters, text="日期YYYYMMDD").grid(row=0, column=1, sticky=tk.W)
        ttk.Entry(filters, textvariable=self.query_date_var, width=14).grid(row=1, column=1, padx=(0, 10), pady=(4, 0))
        ttk.Label(filters, text="22位码").grid(row=0, column=2, sticky=tk.W)
        ttk.Entry(filters, textvariable=self.query_code_var, width=28).grid(row=1, column=2, padx=(0, 10), pady=(4, 0))
        ttk.Button(filters, text="查询", command=self.search_records).grid(row=1, column=3, padx=(0, 8), pady=(4, 0))
        ttk.Button(filters, text="导出CSV", command=self.export_query_csv).grid(row=1, column=4, pady=(4, 0))

        self.query_tree = ttk.Treeview(
            tab,
            columns=("id", "time", "model", "code", "serial", "status", "operator", "reprint", "error"),
            show="headings",
        )
        self._setup_tree(
            self.query_tree,
            [
                ("id", "ID", 60),
                ("time", "时间", 150),
                ("model", "型号", 150),
                ("code", "22位码", 220),
                ("serial", "流水号", 80),
                ("status", "状态", 90),
                ("operator", "操作员", 90),
                ("reprint", "重打", 60),
                ("error", "异常", 260),
            ],
        )
        self.query_tree.pack(fill=tk.BOTH, expand=True, pady=(12, 0))
        self.query_rows: list[dict[str, Any]] = []

    def _build_log_tab(self) -> None:
        tab = ttk.Frame(self.notebook, padding=12)
        self.notebook.add(tab, text="日志")

        ttk.Button(tab, text="刷新日志", command=self.refresh_logs).pack(anchor=tk.W)
        panes = ttk.PanedWindow(tab, orient=tk.VERTICAL)
        panes.pack(fill=tk.BOTH, expand=True, pady=(10, 0))

        device_frame = ttk.LabelFrame(panes, text="设备通讯日志", padding=8)
        panes.add(device_frame, weight=2)
        self.device_tree = ttk.Treeview(
            device_frame,
            columns=("time", "device", "result", "elapsed", "response", "error"),
            show="headings",
        )
        self._setup_tree(
            self.device_tree,
            [
                ("time", "时间", 150),
                ("device", "设备", 90),
                ("result", "结果", 70),
                ("elapsed", "耗时ms", 80),
                ("response", "响应", 360),
                ("error", "错误", 280),
            ],
        )
        self.device_tree.pack(fill=tk.BOTH, expand=True)

        alarm_frame = ttk.LabelFrame(panes, text="报警日志", padding=8)
        panes.add(alarm_frame, weight=1)
        self.alarm_tree = ttk.Treeview(
            alarm_frame,
            columns=("time", "type", "message", "operator"),
            show="headings",
        )
        self._setup_tree(
            self.alarm_tree,
            [
                ("time", "时间", 150),
                ("type", "类型", 100),
                ("message", "内容", 560),
                ("operator", "操作员", 100),
            ],
        )
        self.alarm_tree.pack(fill=tk.BOTH, expand=True)

    def _setup_tree(self, tree: ttk.Treeview, columns: list[tuple[str, str, int]]) -> None:
        for key, title, width in columns:
            tree.heading(key, text=title)
            tree.column(key, width=width, minwidth=40, anchor=tk.W)
        yscroll = ttk.Scrollbar(tree.master, orient=tk.VERTICAL, command=tree.yview)
        tree.configure(yscrollcommand=yscroll.set)
        yscroll.pack(side=tk.RIGHT, fill=tk.Y)

    def refresh_all(self) -> None:
        self.refresh_models()
        self.refresh_recent()
        self.search_records()
        self.refresh_logs()

    def refresh_models(self) -> None:
        self.models = self.db.list_models(include_disabled=True)
        active_names = [m["name"] for m in self.models if m["enabled"]]
        self.model_name_to_id = {m["name"]: int(m["id"]) for m in self.models}
        self.production_model_combo["values"] = active_names
        if active_names and self.production_model_var.get() not in active_names:
            self.production_model_var.set(active_names[0])

        self.model_tree.delete(*self.model_tree.get_children())
        for model in self.models:
            self.model_tree.insert(
                "",
                tk.END,
                values=(
                    model["id"],
                    model["name"],
                    model["barcode_prefix"],
                    model["fixed_code"],
                    "是" if model["enabled"] else "否",
                    model["remark"],
                ),
            )

    def refresh_recent(self) -> None:
        self.recent_tree.delete(*self.recent_tree.get_children())
        for record in self.db.recent_records():
            self.recent_tree.insert(
                "",
                tk.END,
                values=(
                    record["created_at"],
                    record["model_name"],
                    record["code22"],
                    record["status"],
                    record["reprint_count"],
                ),
            )

    def refresh_logs(self) -> None:
        self.device_tree.delete(*self.device_tree.get_children())
        for row in self.db.list_device_logs():
            self.device_tree.insert(
                "",
                tk.END,
                values=(
                    row["created_at"],
                    row["device_type"],
                    row["result"],
                    row["elapsed_ms"],
                    row["response"],
                    row["error"],
                ),
            )
        self.alarm_tree.delete(*self.alarm_tree.get_children())
        for row in self.db.list_alarms():
            self.alarm_tree.insert(
                "",
                tk.END,
                values=(row["occurred_at"], row["alarm_type"], row["message"], row["operator"]),
            )

    def on_model_selected(self, _event: object) -> None:
        item = self.model_tree.focus()
        if not item:
            return
        values = self.model_tree.item(item, "values")
        self.model_id_var.set(str(values[0]))
        self.model_name_var.set(str(values[1]))
        self.model_prefix_var.set(str(values[2]))
        self.model_fixed_var.set(str(values[3]))
        self.model_enabled_var.set(str(values[4]) == "是")
        self.model_remark_var.set(str(values[5]))

    def clear_model_form(self) -> None:
        self.model_id_var.set("")
        self.model_name_var.set("")
        self.model_prefix_var.set("")
        self.model_fixed_var.set("")
        self.model_enabled_var.set(True)
        self.model_remark_var.set("")

    def add_model(self) -> None:
        try:
            self.db.add_model(
                self.model_name_var.get(),
                self.model_prefix_var.get(),
                self.model_fixed_var.get(),
                self.model_remark_var.get(),
            )
            self.clear_model_form()
            self.refresh_models()
            messagebox.showinfo("完成", "型号已新增。")
        except Exception as exc:
            messagebox.showerror("新增失败", str(exc))

    def save_model(self) -> None:
        if not self.model_id_var.get():
            messagebox.showwarning("提示", "请先选择要修改的型号。")
            return
        try:
            self.db.update_model(
                int(self.model_id_var.get()),
                self.model_name_var.get(),
                self.model_prefix_var.get(),
                self.model_fixed_var.get(),
                self.model_remark_var.get(),
                self.model_enabled_var.get(),
            )
            self.refresh_models()
            messagebox.showinfo("完成", "型号已保存。")
        except Exception as exc:
            messagebox.showerror("保存失败", str(exc))

    def start_production(self) -> None:
        if self.running:
            messagebox.showwarning("提示", "当前流程正在执行，请稍候。")
            return
        model_name = self.production_model_var.get()
        if not model_name:
            messagebox.showwarning("提示", "请选择产品型号。")
            return
        model_id = self.model_name_to_id.get(model_name)
        if model_id is None:
            messagebox.showerror("错误", "型号不存在，请刷新型号列表。")
            return

        operator = self.operator_var.get().strip() or "UNKNOWN"
        serial_max = int(self.config.get("production", {}).get("serial_max", 9999))
        try:
            record = self.db.generate_production_record(model_id, operator, serial_max)
        except Exception as exc:
            self.db.add_alarm("生成码失败", str(exc), operator)
            messagebox.showerror("生成码失败", str(exc))
            self.refresh_logs()
            return

        self.running = True
        self.current_record_id = int(record["id"])
        self.current_code_var.set(record["code22"])
        self.current_info_var.set(f"型号: {record['model_name']}  流水号: {int(record['serial_no']):04d}")
        self.status_var.set("下发中")
        self.log(f"生成22位码: {record['code22']}")
        threading.Thread(target=self._run_production_flow, args=(record,), daemon=True).start()

    def _run_production_flow(self, record: dict[str, Any]) -> None:
        operator = record["operator"]
        try:
            model = next((m for m in self.models if int(m["id"]) == record.get("model_id")), {})
            production_date = str(record.get("production_date", ""))
            serial_no = int(record.get("serial_no", 0))
            date_serial = f"{production_date}{serial_no:04d}" if production_date else f"{serial_no:04d}"
            laser_result = self.laser.mark(
                record["code22"],
                model_name=record["model_name"],
                business_mode="LASER_QR_LABEL_SYNC",
                mark_type="station1",
                template_name="qr_or_sync",
                variables={
                    "code22": record["code22"],
                    "modelName": record["model_name"],
                    "barcodePrefix": model.get("barcode_prefix", ""),
                    "fixedCode": model.get("fixed_code", ""),
                    "productionDate": production_date,
                    "serialNo": f"{serial_no:04d}",
                    "dateSerial": date_serial,
                },
            )
            self._log_device_result(laser_result)
            if not laser_result.ok:
                raise RuntimeError(f"激光下发失败: {laser_result.error}")
            self.db.mark_lasered(int(record["id"]))

            zpl = self._build_label(record, reprint_count=0)
            printer_result = self.printer.send(zpl, record["code22"])
            self._log_device_result(printer_result)
            if not printer_result.ok:
                raise RuntimeError(f"打印下发失败: {printer_result.error}")
            self.db.mark_printed(int(record["id"]))
            self.db.mark_completed(int(record["id"]))
            self.root.after(0, lambda: self._finish_flow(True, f"完成: {record['code22']}"))
        except Exception as exc:
            message = str(exc)
            self.db.mark_failed(int(record["id"]), str(exc))
            self.db.add_alarm("生产流程异常", message, operator)
            self.root.after(0, lambda message=message: self._finish_flow(False, message))

    def _finish_flow(self, ok: bool, message: str) -> None:
        self.running = False
        self.status_var.set("完成" if ok else "异常暂停")
        self.log(message)
        self.refresh_recent()
        self.refresh_logs()
        if ok:
            self.current_info_var.set(self.current_info_var.get() + "  状态: 完成")
        else:
            messagebox.showerror("流程异常", message)

    def _build_label(self, record: dict[str, Any], reprint_count: int) -> str:
        printer_cfg = self.config.get("printer", {})
        return build_zpl_label(
            record["code22"],
            record["model_name"],
            reprint_count,
            float(printer_cfg.get("label_width_mm", 56)),
            float(printer_cfg.get("label_height_mm", 20)),
            int(printer_cfg.get("dpi", 203)),
        )

    def _log_device_result(self, result: DeviceResult) -> None:
        self.db.add_device_log(
            result.device_type,
            "OUT",
            result.payload[:2000],
            result.response[:1000],
            result.elapsed_ms,
            result.result_text,
            result.error,
        )
        self.root.after(
            0,
            lambda: self.log(
                f"{result.device_type}: {result.result_text}, {result.elapsed_ms}ms, "
                f"{result.response or result.error}"
            ),
        )

    def reprint_current(self) -> None:
        if self.running:
            messagebox.showwarning("提示", "当前流程正在执行，请稍候。")
            return
        if self.current_record_id is None:
            messagebox.showwarning("提示", "没有可重新打印的当前记录。")
            return
        record = self.db.get_record(self.current_record_id)
        if not record:
            messagebox.showwarning("提示", "当前记录不存在。")
            return
        if record["status"] != "COMPLETED":
            messagebox.showwarning("提示", "只有已完成记录允许重新打印。")
            return
        reason = simpledialog.askstring("重新打印", "请输入重新打印原因，可留空：", parent=self.root) or ""
        operator = self.operator_var.get().strip() or "UNKNOWN"
        next_count = int(record["reprint_count"]) + 1
        zpl = self._build_label(record, reprint_count=next_count)
        result = self.printer.send(zpl, record["code22"])
        self._log_device_result(result)
        if not result.ok:
            message = f"重新打印失败: {result.error}"
            self.db.add_alarm("重新打印失败", message, operator)
            self.refresh_logs()
            messagebox.showerror("重新打印失败", message)
            return
        new_count = self.db.add_reprint(int(record["id"]), operator, reason, result.response)
        self.log(f"重新打印完成: {record['code22']} 第{new_count}次")
        self.current_info_var.set(f"型号: {record['model_name']}  重新打印: {new_count}次")
        self.refresh_recent()
        self.refresh_logs()

    def search_records(self) -> None:
        self.query_rows = self.db.search_records(
            model_name=self.query_model_var.get(),
            date_text_value=self.query_date_var.get(),
            code22=self.query_code_var.get(),
        )
        self.query_tree.delete(*self.query_tree.get_children())
        for row in self.query_rows:
            self.query_tree.insert(
                "",
                tk.END,
                values=(
                    row["id"],
                    row["created_at"],
                    row["model_name"],
                    row["code22"],
                    f"{int(row['serial_no']):04d}",
                    row["status"],
                    row["operator"],
                    row["reprint_count"],
                    row["error_message"],
                ),
            )

    def export_query_csv(self) -> None:
        if not self.query_rows:
            messagebox.showwarning("提示", "当前没有可导出的查询结果。")
            return
        target = filedialog.asksaveasfilename(
            title="导出CSV",
            defaultextension=".csv",
            filetypes=[("CSV", "*.csv")],
            initialfile=f"三码合一生产记录_{today_text()}.csv",
        )
        if not target:
            return
        self.db.export_records_csv(self.query_rows, Path(target))
        messagebox.showinfo("完成", f"已导出: {target}")

    def log(self, message: str) -> None:
        self.production_log.insert(tk.END, message + "\n")
        self.production_log.see(tk.END)
