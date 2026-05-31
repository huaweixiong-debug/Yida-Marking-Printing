"""远程生产模拟测试"""
import sys
sys.path.insert(0, r'D:\三码合一程序\src')
from pathlib import Path
from devices import LaserAdapter, PrinterAdapter
from config import load_config

base = Path(r'D:\三码合一程序')
cfg = load_config(base)

# 工位一：激光二维码+标签同步
laser = LaserAdapter(base, cfg['laser'])
r1 = laser.mark(
    '123456789A202605290001',
    model_name='AZ123456',
    business_mode='LASER_QR_LABEL_SYNC',
    mark_type='station1',
    template_name='qr_or_sync',
    variables={
        'code22': '123456789A202605290001',
        'customerPartNo': 'YZ167182100263/1',
        'supplierCode': '104107',
        'productionBatchNo': '260312',
        'barcodePrefix': '123456789',
        'fixedCode': 'A',
        'productionDate': '20260529',
        'serialNo': '0001',
        'dateSerial': '202605290001',
    },
)
print('LASER:', 'OK' if r1.ok else 'FAIL', '-', r1.response)

# 标签 ZPL
printer = PrinterAdapter(base, cfg['printer'])
r2 = printer.send(
    '^XA^FO14,18^BQN,2,3^FDLA,123456789A202605290001^FS^XZ',
    '123456789A202605290001',
)
print('PRINT:', 'OK' if r2.ok else 'FAIL', '-', r2.response)

# 列出输出
print()
for f in sorted(Path(r'D:\三码合一程序\output\laser').glob('*.txt')):
    print('TXT:', f.name)
for f in sorted(Path(r'D:\三码合一程序\output\labels').glob('*.zpl')):
    print('ZPL:', f.name)
