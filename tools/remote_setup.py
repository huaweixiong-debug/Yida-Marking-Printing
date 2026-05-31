"""远程电脑一键部署"""
import paramiko, os, time

REMOTE = '100.118.225.86'
USER = 'a'
PASS = '0000'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(REMOTE, username=USER, password=PASS, timeout=10)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('gbk', errors='replace')
    err = stderr.read().decode('gbk', errors='replace')
    if err:
        print('  stderr:', err[:200])
    return out

# === 1. 安装 Python 3.12 ===
print('=== 步骤 1: 安装 Python 3.12.8 ===')
has_python = run('python --version 2>&1')
if 'Python 3.12' in has_python or 'Python 3.13' in has_python or 'Python 3.14' in has_python:
    print('Python 已安装:', has_python.strip())
else:
    print('安装 Python 3.12.8 到 C:\\Python312 ...')
    # 下载 Python 安装器
    run('curl -L -o C:\\python-installer.exe https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe')
    time.sleep(2)
    # 静默安装（加入 PATH，安装 pip）
    print(run('C:\\python-installer.exe /quiet InstallAllUsers=1 PrependPath=1 Include_test=0'))
    time.sleep(10)
    # 刷新 PATH 后检查
    print(run('C:\\Python312\\python.exe --version 2>&1'))

# === 2. 同步文件（scp） ===
print()
print('=== 步骤 2: 同步项目文件 ===')
local_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

sftp = ssh.open_sftp()
files_to_sync = ['config.json', 'run.bat', 'deploy_remote.bat']
src_files = ['src/config.py', 'src/devices.py', 'src/app.py', 'src/main.py',
             'src/codegen.py', 'src/label.py', 'src/database.py', 'src/selfcheck.py',
             'src/config.py']

for f in files_to_sync:
    local_path = os.path.join(local_dir, f)
    remote_path = f'D:/三码合一程序/{f}'
    if os.path.exists(local_path):
        sftp.put(local_path, remote_path)
        print(f'  已同步: {f}')

for f in src_files:
    local_path = os.path.join(local_dir, f)
    remote_path = f'D:/三码合一程序/{f}'
    if os.path.exists(local_path):
        sftp.put(local_path, remote_path)
        print(f'  已同步: {f}')

# 创建 output 目录
try: sftp.mkdir('D:/三码合一程序/output/laser')
except: pass
try: sftp.mkdir('D:/三码合一程序/output/labels')
except: pass
print('  output 目录已创建')

sftp.close()

# === 3. 初始化数据库 ===
print()
print('=== 步骤 3: 初始化数据库 ===')
print(run('cd /d D:\\三码合一程序 && C:\\Python312\\python.exe src\\main.py --init-db 2>&1'))

# === 4. 自检 ===
print()
print('=== 步骤 4: 联机前自检 ===')
print(run('cd /d D:\\三码合一程序 && C:\\Python312\\python.exe src\\main.py --selfcheck 2>&1'))

ssh.close()
print()
print('=== 远程部署完成 ===')
