# 激光打码 TXT 文件格式说明

> 当前实施方案：`PLC IO 触发 + TXT 文件交接`
>
> 当前状态：
> - 桌面程序 `src/` 已完整落地 **工位一 (`s1`)** TXT 输出
> - 工位二 (`s2`) 的 TXT 格式已定义，但桌面程序调用路径 **尚未补齐**
> - 原型 `prototype/` 侧已经能按工位一/工位二分别导出 TXT

## 1. 文件命名规则

```text
{filePrefix}_{stationPrefix}_{code22}_{timestamp}.txt
```

示例：

```text
laser_mark_s1_123456789A202605270001_20260527_103015.txt
laser_mark_s2_123456789A202605270001_20260527_103030.txt
```

字段说明：

- `filePrefix`
  来源：`config.json -> laser.output.filePrefix`
- `stationPrefix`
  `s1` 表示工位一，`s2` 表示工位二
- `code22`
  当前 22 位统一码
- `timestamp`
  文件生成时间，格式 `YYYYMMDD_HHmmss`

## 2. 输出目录

默认输出目录：

```text
output/laser
```

配置位置：

- [config.json](/Y:/仪达/009%20激光打码同步标签打印/三码合一程序/config.json)
- `laser.output.dir`

现场部署时建议改为激光电脑可读取的共享目录，例如：

- `D:\LaserExchange\inbox`
- `\\laser-pc\laser-exchange\inbox`

## 3. 当前桌面程序已落地的工位一格式

当前桌面程序 `src/app.py -> LaserAdapter.mark()` 实际已输出的工位一字段如下：

```ini
# 三码合一激光打码交接文件
generatedAt=2026-05-27T10:30:15
mode=txt-file
workflow=PLC_IO_TXT
code22=123456789A202605270001
modelName=AZ123456-发动机控制单元
businessMode=LASER_QR_LABEL_SYNC
markType=station1
template=qr_or_sync

[variables]
code22=123456789A202605270001
modelName=AZ123456-发动机控制单元
barcodePrefix=123456789
fixedCode=A
productionDate=20260527
serialNo=0001
dateSerial=202605270001

[notes]
说明=由 PLC IO 点触发激光电脑执行，本文件仅提供打码内容
建议目录=output/laser
```

## 4. 工位二目标格式

工位二的目标格式已经定义，但桌面程序当前还没有真实调用路径。目标格式如下：

```ini
# 三码合一激光打码交接文件
generatedAt=2026-05-27T10:30:30
mode=txt-file
workflow=PLC_IO_TXT
code22=123456789A202605270001
modelName=AZ123456-发动机控制单元
businessMode=PERMANENT_MARK
markType=station2
template=permanent_text

[variables]
supplierCode=104107
customerPartNo=YZ167182100263/1
productionBatchNo=260312
code22=123456789A202605270001

[permanent_mark]
text=ID: 104107 YZ167182100263/1 260312

[notes]
说明=由 PLC IO 点触发激光电脑执行，本文件仅提供打码内容
建议目录=output/laser
```

## 5. 当前桌面程序字段清单

### 已经真实输出的字段

| 字段 | 来源 |
|---|---|
| `code22` | `production_record.code22` |
| `modelName` | `production_record.model_name` |
| `businessMode` | `src/app.py` 写死为当前工位一业务模式 |
| `markType` | `src/app.py` 当前写死为 `station1` |
| `template` | `src/app.py` 当前传 `qr_or_sync` |
| `barcodePrefix` | `product_model.barcode_prefix` |
| `fixedCode` | `product_model.fixed_code` |
| `productionDate` | `production_record.production_date` |
| `serialNo` | `production_record.serial_no` |
| `dateSerial` | `production_date + serialNo(4位)` |

### 当前桌面程序尚未提供的字段

下面这些字段在 `prototype/` 里已有概念，但桌面程序 `src/` 的当前数据库模型还没有对应字段：

| 字段 | 当前状态 |
|---|---|
| `customerPartNo` | 未落地到 `src/` 数据模型 |
| `supplierCode` | 未落地到 `src/` 数据模型 |
| `productionBatchNo` | 未落地到 `src/` 数据模型 |

如果现场必须由桌面程序直接输出这些字段，后续需要扩展：

- `src/database.py`
- `src/app.py`
- 型号维护 UI

## 6. 配置方式

当前配置结构：

```json
{
  "laser": {
    "mode": "txt-file",
    "workflow": "PLC_IO_TXT",
    "output": {
      "dir": "output/laser",
      "filePrefix": "laser_mark",
      "station1Prefix": "s1",
      "station2Prefix": "s2"
    },
    "template": {
      "header": ["..."],
      "variableLine": "{key}={value}",
      "footer": ["..."]
    }
  }
}
```

关键配置项：

- `laser.output.dir`
  TXT 输出目录
- `laser.output.filePrefix`
  文件名前缀
- `laser.output.station1Prefix`
  工位一前缀
- `laser.output.station2Prefix`
  工位二前缀
- `laser.template.header`
  头部行模板
- `laser.template.variableLine`
  变量区每行模板
- `laser.template.footer`
  尾部说明模板

## 7. 当前桌面程序调用方式

当前工位一实际调用方式：

```python
result = laser.mark(
    code22,
    model_name=model_name,
    business_mode="LASER_QR_LABEL_SYNC",
    mark_type="station1",
    template_name="qr_or_sync",
    variables={
        "code22": code22,
        "modelName": model_name,
        "barcodePrefix": barcode_prefix,
        "fixedCode": fixed_code,
        "productionDate": production_date,
        "serialNo": serial_no,
        "dateSerial": date_serial,
    },
)
```

## 8. 下一步建议

如果要把桌面程序继续收口成完整现场版，优先顺序建议如下：

1. 给 `src/` 补型号字段：
   - `customerPartNo`
   - `supplierCode`
   - `productionBatchNo`
2. 补工位二桌面程序调用路径
3. 确认激光电脑实际消费的 TXT 格式
4. 按现场格式微调 `header / variables / footer`
