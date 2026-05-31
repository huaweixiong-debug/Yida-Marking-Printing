# Claude Code 交接说明

## 1. 当前阶段结论

本项目的激光方案已经从：

- `Lmc1.dll / 32位 bridge 直连`

调整为：

- `PLC 通过 IO 点触发激光打码机`
- `本程序只负责输出激光打码内容到 TXT 文件`
- `装有激光驱动卡的电脑读取 TXT 并执行打码`

也就是说，**当前主方案不再继续推进 Lmc1.dll 直连链路**。  
`bridge/`、`docs/lmc1-known-unknown.md` 等内容保留为历史探索记录，但不再是当前默认实施路径。

---

## 2. 已经完成的事情

### 2.1 基线与仓库

当前“无硬件阶段收口版”已经冻结并推送到 GitHub：

- 仓库：[`huaweixiong-debug/Yida-Marking-Printing`](https://github.com/huaweixiong-debug/Yida-Marking-Printing.git)
- 分支：`main`
- 基线提交：`423ddf4`
- 提交信息：`chore: baseline freeze for no-hardware stage`

### 2.2 激光主方案切换

已经把当前主思路切换为：

- 软件端生成三码数据
- 工位一/工位二在需要激光动作时，不再默认走 bridge
- 改为导出打码 TXT 文件
- PLC 通过 IO 点触发激光电脑执行打码

### 2.3 已修改的关键文件

以下文件已经按新方案修改：

- [README.md](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/README.md>)
- [config.json](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/config.json>)
- [docs/联调清单.md](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/docs/联调清单.md>)
- [prototype/config/devices.json](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/prototype/config/devices.json>)
- [prototype/config/ui-text.json](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/prototype/config/ui-text.json>)
- [prototype/index.html](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/prototype/index.html>)
- [prototype/js/app.js](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/prototype/js/app.js>)
- [prototype/js/ui/uiMapper.js](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/prototype/js/ui/uiMapper.js>)
- [prototype/js/blocks/deviceAdapterBlock.js](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/prototype/js/blocks/deviceAdapterBlock.js>)
- [prototype/js/blocks/device/laserEzcadAdapter.js](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/prototype/js/blocks/device/laserEzcadAdapter.js>)
- [prototype/js/blocks/station1PrintBlock.js](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/prototype/js/blocks/station1PrintBlock.js>)
- [prototype/js/blocks/station2MarkBlock.js](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/prototype/js/blocks/station2MarkBlock.js>)

### 2.4 当前行为

#### 原型侧

- `prototype` 中的激光动作现在会导出 TXT 文件
- 由于浏览器限制，当前是以“下载 TXT 文件”的方式模拟输出
- 不再把 `StartMark / RedLight / ReadyMark` 作为当前主执行路径

#### 桌面程序侧

- [src/devices.py](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/src/devices.py>) 中本来就有 TXT 文件输出能力
- `LaserAdapter.mark()` 在 `mode=file` 时会写入：
  - `output/laser/*.txt`

---

## 3. 当前边界

### 3.1 现在已经明确的

- 当前主方案是 `PLC IO + TXT 文件交接`
- 不是 `Lmc1.dll` 主方案
- bridge 相关内容保留，但只作为历史记录
- 原型用于演示结构和数据流
- 真正现场落地更应该基于桌面程序 `src/` 这一侧

### 3.2 当前还没做完的

下面这些还没有按“现场可直接用”的标准收口：

1. TXT 文件格式是否完全符合激光电脑消费程序要求
2. TXT 文件输出目录是否改成现场共享目录
3. 导出后的文件命名规则是否符合现场约定
4. 工位一、工位二导出的 TXT 内容是否需要区分格式
5. 是否需要“写入完成标记 / ack 文件 / 已处理归档”机制
6. PLC 触发后，激光电脑是否需要回写执行结果

---

## 4. 接下来优先要做什么

### 第一优先级：把桌面程序收口成现场版

Claude Code 下一步应该优先做这些事情：

1. 以 [src/devices.py](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/src/devices.py>) 为主，完善激光 TXT 输出
2. 让 [config.json](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/config.json>) 可以明确配置：
   - 输出目录
   - 文件名前缀
   - TXT 格式模板
   - 是否按工位区分目录
3. 明确工位一和工位二的 TXT 文件内容
4. 明确文件命名规范
5. 如有必要，增加“处理后归档 / 防重复”机制

### 第二优先级：把原型和桌面程序的规则统一

需要统一：

- 工位一激光二维码/同步业务导出的 TXT 字段
- 工位二永久性标识导出的 TXT 字段
- `code22 / modelName / supplierCode / customerPartNo / productionBatchNo` 这些核心字段命名

### 第三优先级：补文档

建议继续补这几类文档：

1. 激光 TXT 文件格式说明
2. PLC / 激光电脑 / 本程序 三方交接流程
3. 现场共享目录约定
4. 失败重试和防重复规则

---

## 5. 不要再做什么

除非用户明确要求，否则不要再继续把精力放在这些事情上：

- 不要继续推进 `Lmc1.dll` 直连
- 不要继续推进 `bridge_stub.py` 的 `ReadyMark / Run / MarkEnt`
- 不要再把 bridge 当作当前主路径
- 不要先做复杂前端样式优化
- 不要先做维护页大改

---

## 6. 推荐给 Claude Code 的下一步任务

如果要继续开发，建议直接按下面目标推进：

### 任务目标

把桌面程序改成“可直接用于 PLC + 激光电脑 TXT 交接”的版本。

### 具体任务

1. 修改 [config.json](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/config.json>)，增强激光 TXT 输出配置
2. 修改 [src/devices.py](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/src/devices.py>)，让 `LaserAdapter` 支持：
   - 自定义输出目录
   - 自定义文件名前缀
   - 自定义 TXT 模板
   - 工位一/工位二不同内容输出
3. 如果需要，修改 [src/app.py](</Y:/仪达/009 激光打码同步标签打印/三码合一程序/src/app.py>)，把工位信息传给 `LaserAdapter`
4. 新增一份文档，说明 TXT 文件格式和目录约定

---

## 7. 交接给 Claude Code 时可直接说明

可以直接告诉 Claude Code：

> 当前项目的激光实施方案已经调整为 PLC IO 触发 + TXT 文件交接。  
> 不再继续推进 Lmc1.dll / bridge 直连。  
> 现在请你以 `src/devices.py` 和 `config.json` 为主，把桌面程序收口成现场可用的 TXT 输出版本，并补充 TXT 格式说明文档。

---

## 8. 验证建议

Claude Code 完成下一步后，应至少验证：

1. 桌面程序能正常启动
2. 执行一次生产流程后，能生成激光 TXT
3. TXT 文件名符合规则
4. TXT 文件内容包含完整字段
5. 配置改动后，TXT 输出行为会变化
6. 不影响标签打印和数据库记录
