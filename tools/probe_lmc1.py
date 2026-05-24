"""Lmc1.dll 探测脚本 — 分析导出表、导入表、PE 头信息"""
import pefile
import sys

DLL_PATH = r"D:\BaiduNetdiskDownload\测试系统必要软件\激光打标\Ezcad2.14.11(20220909)\Lmc1.dll"

try:
    pe = pefile.PE(DLL_PATH)
except Exception as e:
    print(f"ERROR: Cannot open DLL: {e}")
    sys.exit(1)

print("=" * 60)
print("PE HEADER")
print("=" * 60)
m = pe.FILE_HEADER.Machine
arch = "x86 (32-bit)" if m == 0x14c else "x64 (64-bit)" if m == 0x8664 else f"Unknown ({hex(m)})"
print(f"  Architecture: {arch}")
print(f"  Sections: {pe.FILE_HEADER.NumberOfSections}")
print(f"  Characteristics: {hex(pe.FILE_HEADER.Characteristics)}")
print(f"  Timestamp: {pe.FILE_HEADER.TimeDateStamp}")

print()
print("=" * 60)
print("EXPORT TABLE")
print("=" * 60)
if hasattr(pe, 'DIRECTORY_ENTRY_EXPORT'):
    exp = pe.DIRECTORY_ENTRY_EXPORT
    print(f"  DLL Name: {exp.name.decode() if exp.name else '(unnamed)'}")
    print(f"  Total exported symbols: {len(exp.symbols)}")
    print()
    for sym in exp.symbols:
        name = sym.name.decode() if sym.name else '(ordinal only)'
        ordinal = sym.ordinal
        addr = hex(sym.address) if sym.address else 'N/A'
        print(f"  ord:{ordinal:4d}  addr:{addr:10s}  {name}")
else:
    print("  *** NO EXPORT TABLE FOUND ***")
    print("  This means Lmc1.dll does NOT export C-style functions.")
    print("  It is likely a COM component or a .NET assembly.")

print()
print("=" * 60)
print("IMPORT TABLE (DLL dependencies)")
print("=" * 60)
if hasattr(pe, 'DIRECTORY_ENTRY_IMPORT'):
    for entry in pe.DIRECTORY_ENTRY_IMPORT:
        dll_name = entry.dll.decode() if entry.dll else '(unknown)'
        imp_count = len(entry.imports)
        print(f"  {dll_name} ({imp_count} imports)")
        for imp in entry.imports[:3]:
            name = imp.name.decode() if imp.name else f'ord({imp.ordinal})'
            print(f"    - {name}")
        if imp_count > 3:
            print(f"    ... and {imp_count - 3} more")
else:
    print("  No import table found")

print()
print("=" * 60)
print("CONCLUSION")
print("=" * 60)
if hasattr(pe, 'DIRECTORY_ENTRY_EXPORT') and len(pe.DIRECTORY_ENTRY_EXPORT.symbols) > 0:
    print("  Lmc1.dll HAS exported C functions.")
    print("  Bridge can use: P/Invoke (C#) or LoadLibrary/GetProcAddress (C++)")
else:
    print("  Lmc1.dll has NO exported C functions.")
    print("  Likely a COM component. Check registry for ProgID.")
    print("  Bridge may need: COM Interop (C#) or CoCreateInstance (C++)")
