"""远程安装 Python"""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.118.225.86', username='a', password='0000', timeout=10)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('gbk', errors='replace')
    err = stderr.read().decode('gbk', errors='replace')
    if out: print(out.strip())
    if err: print('  ERR:', err.strip()[:200])
    return out

# 检查 winget
print('=== 检查 winget ===')
result = run('winget --version 2>&1')

if 'v1.' in result or 'v2.' in result:
    print('winget 可用，安装 Python 3.12...')
    run('winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements --silent 2>&1')
    time.sleep(30)
else:
    print('winget 不可用，尝试 PowerShell 下载...')
    ps_cmd = (
        'powershell -Command "'
        "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe' "
        "-OutFile 'C:\\python-installer.exe'; "
        "Start-Process -FilePath 'C:\\python-installer.exe' -ArgumentList '/quiet','InstallAllUsers=1','PrependPath=1' -Wait"
        '"'
    )
    print(run(ps_cmd)[:300])
    time.sleep(30)

# 检查安装结果
print()
print('=== 验证 Python ===')
for path in ['C:\\Python312\\python.exe', 'C:\\Program Files\\Python312\\python.exe']:
    result = run(f'{path} --version 2>&1')
    if 'Python' in result:
        print(f'Python 安装成功: {path}')
        break
else:
    print('Python 未找到，请手动安装: https://www.python.org/downloads/')

ssh.close()
