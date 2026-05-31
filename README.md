# 重汽三码合一程序

当前主方案已经调整为：

- 软件侧生成三码数据、标签内容、激光打码内容
- 激光打码内容导出为 `TXT` 文件
- `PLC` 通过 `IO` 点触发装有激光驱动卡的电脑执行打码
- 本程序不再把 `Lmc1.dll / bridge` 作为当前默认执行链路

## 当前目录说明

- [prototype](/Y:/仪达/009%20激光打码同步标签打印/三码合一程序/prototype)  
  前端预览原型。当前激光流程默认导出 TXT 文件。

- [src](/Y:/仪达/009%20激光打码同步标签打印/三码合一程序/src)  
  本地桌面程序。`src/devices.py` 中的 `LaserAdapter` 已支持把激光内容写入 `output/laser/*.txt`。

- [docs/联调清单.md](/Y:/仪达/009%20激光打码同步标签打印/三码合一程序/docs/联调清单.md)  
  当前有效的 PLC + TXT 交接联调步骤。

- [bridge](/Y:/仪达/009%20激光打码同步标签打印/三码合一程序/bridge)  
  历史探索材料，保留用于回溯 `Lmc1.dll` 直连方案，不再作为当前主路径。

## 当前有效流程

1. 选择型号
2. 生成 22 位码
3. 打印标签
4. 软件导出激光打码 TXT 文件
5. PLC 通过 IO 点触发激光电脑读取 TXT 并执行打码

## 当前激光 TXT 输出

默认输出目录：

- 原型说明目录：`output/laser`
- 桌面程序配置：见 [config.json](/Y:/仪达/009%20激光打码同步标签打印/三码合一程序/config.json)

TXT 文件中至少包含：

- `code22`
- `modelName`
- `businessMode`
- `markType`
- 模板变量明细
- 永久性标识文本（工位二）

## 启动

### 原型预览

```powershell
npx serve prototype -p 3300
```

打开：

- [http://localhost:3300](http://localhost:3300)

### 桌面程序

```powershell
python src\main.py
```

或直接双击：

- [run.bat](/Y:/仪达/009%20激光打码同步标签打印/三码合一程序/run.bat)

## 历史说明

此前做过一轮 `Lmc1.dll + 32位 bridge` 探测与验证，相关文件仍保留在：

- [bridge/README.md](/Y:/仪达/009%20激光打码同步标签打印/三码合一程序/bridge/README.md)
- [docs/lmc1-known-unknown.md](/Y:/仪达/009%20激光打码同步标签打印/三码合一程序/docs/lmc1-known-unknown.md)

这些文件现在属于历史技术记录，不再代表当前主实施方案。
