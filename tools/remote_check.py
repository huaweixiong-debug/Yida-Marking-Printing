import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('100.118.225.86', username='a', password='0000', timeout=10)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode('gbk', errors='replace')

print('=== D盘目录 ===')
print(run('dir D:\\'))

print('=== Python ===')
print(run('where python'))
print(run('python --version 2>&1'))

print('=== 现有项目 ===')
print(run('dir D:\\三码合一程序 2>&1')[:500])

ssh.close()
