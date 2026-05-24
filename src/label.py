from __future__ import annotations

from html import escape


def mm_to_dots(mm: float, dpi: int) -> int:
    return int(round(mm / 25.4 * dpi))


def zpl_safe(value: str) -> str:
    return value.replace("^", "").replace("~", "").replace("\n", " ").strip()


def build_zpl_label(
    code22: str,
    model_name: str,
    reprint_count: int,
    width_mm: float = 56,
    height_mm: float = 20,
    dpi: int = 203,
) -> str:
    width = mm_to_dots(width_mm, dpi)
    height = mm_to_dots(height_mm, dpi)
    model = zpl_safe(model_name)[:24]
    code = zpl_safe(code22)
    repeat_line = ""
    if reprint_count > 0:
        repeat_line = f"^FO120,136^A0N,16,16^FDREPRINT {reprint_count}^FS\n"

    return (
        "^XA\n"
        "^CI28\n"
        f"^PW{width}\n"
        f"^LL{height}\n"
        "^LH0,0\n"
        "^FO14,18^BQN,2,3^FDLA,"
        + code
        + "^FS\n"
        f"^FO120,18^A0N,20,18^FD{model}^FS\n"
        f"^FO120,46^BY1,2,48^BCN,48,Y,N,N^FD{code}^FS\n"
        f"^FO120,114^A0N,17,17^FD{code}^FS\n"
        + repeat_line
        + "^XZ\n"
    )


def build_preview_text(code22: str, model_name: str, reprint_count: int) -> str:
    repeat = f"\nREPRINT {reprint_count}" if reprint_count else ""
    return (
        f"型号: {escape(model_name)}\n"
        f"二维码/条形码/激光码: {escape(code22)}"
        f"{repeat}"
    )
