"""远程部署收尾：初始化 + 自检"""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.118.225.86', username='a', password='0000', timeout=10)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('gbk', errors='replace')
    err = stderr.read().decode('gbk', errors='replace')
    if out: print(out, end='')
    if err and 'Warning' not in err:
        print('  stderr:', err.strip()[:200])
    return out

PY = r'"C:\Program Files\Python312\python.exe"'  # 带空格的路径需引号

print('=== 1. 初始化数据库 ===')
run(f'cd /d D:\\三码合一程序 && {PY} src\\main.py --init-db 2>&1')

print()
print('=== 2. 联机前自检 ===')
run(f'cd /d D:\\三码合一程序 && {PY} src\\main.py --selfcheck 2>&1')

print()
print('=== 3. 验证文件输出 ===')
# 确保 output 目录存在
run(r'cmd /c mkdir D:\三码合一程序\output\laser 2>nul')
run(r'cmd /c mkdir D:\三码合一程序\output\labels 2>nul')

# 简单测试 TXT 输出
test_script = """
import sys
sys.path.insert(0, r'D:\\三码合一程序\\src')
from pathlib import Path
from devices import LaserAdapter, PrinterAdapter
from config import load_config
base = Path(r'D:\\三码合一程序')
cfg = load_config(base)
laser = LaserAdapter(base, cfg['laser'])
r1 = laser.mark('TEST001A202605290001', model_name='TEST', business_mode='LASER_QR', mark_type='station1',
    variables={'code22':'TEST001A202605290001','customerPartNo':'TEST','supplierCode':'104107'})
printer = PrinterAdapter(base, cfg['printer'])
r2 = printer.send('^XA^FO14,18^BQN,2,3^FDLA,TEST001A202605290001^FS^XZ', 'TEST001A202605290001')
print('LASER:', 'OK' if r1.ok else 'FAIL')
print('PRINT:', 'OK' if r2.ok else 'FAIL')
# 列出输出文件
for f in sorted(Path(r'D:\\三码合一程序\\output\\laser').glob('*.txt')):
    print('TXT:', f.name)
for f in sorted(Path(r'D:\\三码合一程序\\output\\labels').glob('*.zpl')):
    print('ZPL:', f.name)
"""
# 写入测试脚本
sftp = ssh.open_sftp()
sftp.putfo(__import__('io').StringIO(test_script), 'D:/三码合一程序/_test_output.py')
sftp.close()

print(run(f'cd /d D:\\三码合一程序 && {PY} _test_output.py 2>&1'))

# 清理测试脚本
run(r'del D:\三码合一程序\_test_output.py 2>nul')

ssh.close()
print()
print('=== 远程部署完成 ===')
