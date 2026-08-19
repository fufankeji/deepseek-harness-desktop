# 插件中心开发与测试计划

本文件是插件中心 F001–F007 的内部执行清单。开发窗口使用持续运行的 Desktop Web 组合预览完成核心功能、快速预览和交互验收；每个 Feature 交付浏览器证据后，由独立桌面验收窗口编译真实 Electron 应用并检查 Desktop 专属行为。正式安装包仍只在需要验证安装/升级/恢复边界的阶段生成。

## 当前范围冻结（2026-08-15）

当前唯一交付目标是完成公开插件生态的手动搜索、一键安装、运行验证、重启保留、卸载和必要故障恢复。正在进行的 Desktop 打包与验收只围绕这条核心链路，不等待下列延期项：

| 延期 Step | 对应 Feature | 当前状态 | 后续启用条件 |
|---|---|---|---|
| 自建插件目录与运营后台 | F006 | `paused`，不继续开发自建 Registry、审核、精选、下架、遥测或运营接口 | 用户明确要求恢复自建目录后，先确认来源、运营边界和部署方案，再恢复对应任务 |
| 精准排行 | F006 | `paused`，当前公开生态搜索结果不承诺自营热门榜或精准推荐排序 | 用户明确要求恢复排行后，先确认排行信号与成功标准，再恢复对应任务 |
| Agent 自动查找后安装或更新 | F007 | `paused`，不开发对话中的自动候选选择、安装授权交接或自动更新 | 用户明确要求恢复 Agent 获取后，复用届时已验收的目录和 Desktop 事务，不新建安装权威 |

这些延期项不是当前打包、客户验收或核心插件中心交付的前置条件。暂停期间不得自动领取 F006/F007 任务，也不得因为已有半成品继续扩展。手动搜索、一键安装、运行和卸载保持启用。对于“是否允许继续开发”，本节优先于 F006/F007 的旧 Feature Map 或 Tasks 状态；这些旧条目只保留为后续需求库存。以后恢复任一项时，先更新本节状态和对应任务范围，再开始开发。

本次暂停决定只维护在这份中文内部计划中，不创建或同步英文副本；仓库其他既有双语文档不因本决定批量删除或重写。

## 文档职责与读取顺序

本文件只负责开发顺序、窗口分工、阶段汇合和统一验收，不替代产品与 Feature 文档。发生冲突时先修正上游文档，再继续代码开发：

1. 产品范围、用户旅程或验收目标变化时，先看并更新 [PRD](docs/PRD.zh.md)。
2. 跨 Feature 状态、共同约束或安全规则变化时，先看并更新[产品级 Spec](docs/specs/product-spec.zh.md)、[Feature Map](docs/specs/feature-map.zh.md)和[插件中心架构](docs/architecture/plugin-center.zh.md)。
3. 开始一个 Feature 前，依次阅读该 Feature 的 `spec.zh.md`、`plan.zh.md` 和 `tasks.zh.md`：Spec 定义行为与验收，Plan 定义实现边界与依赖，Tasks 是唯一实时任务状态和完成证据台账。
4. 开发窗口只领取依赖已满足且路径归属明确的未完成 Task。完成后把实际检查和剩余项写回对应 `tasks.zh.md` 的执行记录，不用口头“基本完成”代替勾选与证据。
5. Feature 全部 Task 通过局部检查和对应 Web 旅程后，开发窗口提交只读交接；桌面验收窗口使用同一提交编译并运行真实 Electron。该轮 Desktop 检查通过后 Feature 才正式收尾；安装器、升级和崩溃恢复证据按验收矩阵留到需要真实包体的阶段。

## 固定开发节奏

1. 启动一次 `pnpm run dev:desktop:web` 并保持运行。它以 `DSH_DESKTOP=1` 组合与 Desktop 相同的客户端 UI 名册和皮肤，页面代码使用增量构建；Desktop API 由固定开发桥接提供可重复的目录、兼容、安装进度和故障场景。
2. 每个 Feature 开发过程中只运行受影响包的类型检查、单元测试、组件测试和一条对应的 Web 用户旅程，不运行全仓构建，不打桌面安装包。
3. 每个 Feature 完成后保持 Web 服务可访问，并汇报四项内容：完成内容、浏览器验证入口、用户操作步骤、交给桌面验收窗口的真实行为清单。
4. 桌面闭环窗口在 Feature 交接后执行编译、启动和验收；如果失败路径不属于下一 Feature 开发窗口的当前占用，可直接接管该最窄路径完成修复、回归与文档闭环，无需退回上一窗口。只有修复必须触碰下一窗口正在编辑的文件时才暂停并协调所有权。
5. 当前启用的核心旅程通过后运行一次受影响范围的 GUI/Web 回归与根构建；真实安装、Host 重启、崩溃恢复、持久化和卸载按 Feature 矩阵在源码 Electron 或正式安装包中验证。F006/F007 不参与本轮收口。

开发阶段不得把 Web 模拟结果描述成真实桌面安装成功。文件系统写入、包管理器执行、IPC 所有权、Host 进程重启、应用重新启动和系统权限只能由自动化服务测试提供结构证据，最终结果以安装包验收为准。

## 双窗口开发与桌面验收规则

并行工作不改变已启用核心链路 F001 → F002 → F003 → F005 → F004 的依赖顺序。F006 与 F007 保留原编号和依赖，但处于暂停状态，不自动进入开发队列。开发窗口负责当前 Feature 的代码、开发桥接、Web 旅程和自动化；桌面闭环窗口消费已交接快照，负责真实 Electron 编译/运行、必要的目录包验证，以及不与下一 Feature 冲突的收尾修复。

- 两个窗口共享同一工作区。开发窗口在交接前拥有当前 Feature 源码；交接后，桌面闭环窗口获得上一 Feature 非冲突收尾路径的修改权，但不得覆盖、回退、格式化或顺手修复下一 Feature 与无关源码。
- 交接必须写明 Feature/Task、当前提交或文件快照、浏览器入口、已通过检查、Desktop 必验项与禁止宣称项。桌面闭环窗口以这份快照为验收基线；若直接修复，必须追加修复文件、验证证据与新的闭环状态。
- 桌面验收失败时先记录复现步骤、日志、截图和失败阶段；路径空闲时由闭环窗口直接修复并重验，路径正被下一 Feature 占用时只记录阻塞并等待释放。修复后的代码、验证证据和 Task/Map 状态都由闭环窗口一起维护。
- 开发窗口可以在桌面验收进行时继续下一个不依赖该结果的任务；依赖真实 Desktop 结果的功能不得越过失败或未完成闸门。
- Desktop 编译/运行不等于安装包通过。只有安装器、升级、签名、崩溃恢复或真实持久化边界需要时才生成正式包体。

## 当前并行安排

任务勾选状态以各 Feature 的 `tasks.zh.md` 为准；下表只规定当前窗口归属和汇合条件。

| 窗口 | 当前任务 | 拥有范围 | 暂时禁止 | 交付条件 |
|---|---|---|---|---|
| 下一 Feature 开发窗口 | 按对应 `tasks.zh.md` 推进 F005/F004，不等待 F003 重复验收 | 当前 Feature 的恢复、管理、桥接与 UI 路径；具体占用以实时文件状态和交接为准 | 不覆盖已移交给闭环窗口的 F003 打包依赖与运行验证器修复 | 完成源码/Web 阶段后按本文件再次交给桌面闭环窗口 |
| 构建、修复与闭环窗口 | F003 T010 已修复并验收 PASS；F003 正式完成 | F003 的 Desktop 包依赖闭合、运行验证器合同、最窄测试、目录包验收与状态文档 | 不修改下一 Feature 正在编辑的恢复/管理业务源码；不解除 F005 持有的生产变更闸门 | F003 T001–T010、Feature Map 和交接证据一致为 `completed`，随后等待下一次明确交接 |

### 2026-08-15 F001 Desktop 验收交接

- **验收状态：** `completed`。T001–T008、Desktop Web、真实 Electron 与打包应用目录均已闭环。
- **实际命令：** `pnpm run dev:desktop` 完成 2265 个输入的工作区构建并启动 Electron；`pnpm run package:desktop` 验证 195 个包的闭合运行时并生成 `apps/desktop/dist/mac-arm64/DeepSeek Harness.app`。未运行 `pnpm run dist:desktop`。
- **真实旅程：** 一级“插件”入口、插件/技能、公开/个人、搜索、确定版本同页详情/返回、刷新与新鲜度、会话退出、设置中的插件配置/Loader 清单/皮肤入口均 PASS；包目录启动后重复核心旅程 PASS。MCP 运行时依赖存在，默认 Profile 未启用 MCP server，因此不要求 Loader 中出现一行虚假 MCP 实例。
- **边界记录：** 为保护真实用户 Profile，本轮未人工制造陈旧缓存；陈旧、失败和重试继续由确定 Web 场景与自动化回放覆盖。16:25 生成的包目录证明 F001/F002 交接快照，不证明其后并行变化的 F003 源码。

### 2026-08-15 F002 Desktop 验收交接

- **验收状态：** `completed`。T001–T007、确定 Web 正常/拒绝场景、真实 Electron 与包目录均已闭环。
- **真实旅程：** 详情实际显示 Desktop/DSH `0.1.0-rc.5`、Node `24.18.1`、`darwin-arm64`、目录/Profile 修订、重启预期、能力与广泛权限警告。真实点击禁用“安装”后 `operation` 仍为 `null`、条目仍未安装、详情保持且无对话框，证明未进入进度或变更。
- **自动化与构建：** 修正旧测试权威为当前精确目录包名/版本后，失败集 6 个文件、49 项以及完整相关集 27 个文件、187 项均 PASS；Desktop 类型检查、插件中心 Bundle 与客户端纯度门禁通过。预检 e2e 的 32 项拒绝继续证明 Profile、锁、Bundle 顺序、Host 代次和已安装投影不变。
- **真实边界：** F002 没有下载、安装、Profile 写入或 Host 重启。真实制品字节仍由 F003 受控下载后交给校验器；本轮包目录只证明 F002 的原生展示和禁用动作，不替代 F003/F005 的事务与恢复验收。

### 2026-08-15 F003 历史基础交接（保留证据，不代表当前窗口分工）

- **任务状态：** F003 T001、T004 已勾选完成；T002、T003、T005–T010 尚未完成。F003 整体状态为 `in-progress`，不能描述为安装功能闭环。
- **Host 接口：** `createHostSupervisor()` 保留 `start(): Promise<string>`，新增只读 `current: { id, origin } | undefined` 与 `restart(reason): Promise<{ id, origin }>`；`shutdown()` 仍为永久关闭。重启串行化，操作归属的退出不会触发意外退出，旧代次迟到事件不会清除新代次。
- **Profile 接口：** `@deepseek-ai/dsh-app-boot` 新增 `reconcileProfileBundles(before, after, exportsBundle)`。调用方负责确定包检查与持久化；函数只计算 Bundle 添加/移除并返回变化明细，不执行包管理器或文件写入。CLI 已切换为该共享接口。
- **自动化结果：** Host 监管器 22 项测试、app-boot Profile 17 项测试、CLI 连接 1 项测试通过；Desktop 源码、app-boot 和 CLI 局部类型检查通过。按照当前规范未运行根构建、Desktop 构建或安装包测试。全局 `verify-export-jsdoc` 仍被其他并行路径的 38 项缺失文档阻止，本轮新增导出不在报告中，交接时不得把该全局门禁写成通过。
- **路径交接：** 本窗口对 `apps/desktop/src/host-supervisor.ts`、`apps/desktop/tests/host-supervisor.spec.ts`、`packages/boot/app-boot/`、`apps/cli/src/plugin.ts` 与 `apps/cli/tests/plugin.spec.ts` 的本轮占用已结束。接手者修改前仍需检查共享 worktree 最新状态，不得回退其他窗口改动。
- **联调入口：** F002 T005–T007 完成后，F003 T002 才接管 `main.ts`、窗口生命周期与发送方 origin 策略，让现有窗口跟随 `supervisor.current` 并消费 `restart(reason)`；F005 恢复验收前不得开放真实安装动作。
- **下一安全任务：** T007 已由 T004 解锁，可在 `packages/examples/plugin-center-fixture/` 独立开发真实 Host + client fixture；T003 需先确认 Desktop runtime/打包路径无人占用。

### 2026-08-15 F003 T010 首轮 Desktop/包目录验收（FAIL，待修复）

- **仍然通过的证据：** 当前冻结 F003 产物完成源码 Electron 启动，真实 Host 使用动态 loopback origin；生产 preload 暴露操作读取/订阅桥接且 `mutationsEnabled=false`，详情页读取真实 Desktop `0.1.0-rc.5`、DSH `0.1.0-rc.5`、Node `24.18.1` 与 `darwin-arm64`。精确 T010 测试 `pnpm exec vitest run apps/desktop/tests/plugin-center-install.e2e.ts -t "relaunch without system pnpm"` 为 1/1 PASS。
- **包目录生成：** 共享工作区随后出现的 F005 半成品常量先使 `pnpm run package:desktop` 在根类型构建失败；本窗口没有修改该并行源码，而是对其出现前 17:03 已完成的冻结 F003 全量构建产物单独执行 runtime staging 与 `electron-builder --dir`。闭合运行时为 195 个包，生成 `apps/desktop/dist/mac-arm64/DeepSeek Harness.app`；未运行 `dist:desktop`。
- **干净机器安装：** 使用包内 Electron、包内 `pnpm@11.7.0`、`shell: false` 和不含系统 Node/pnpm 的外部 PATH，在隔离 Profile 真实安装插件与 Skill Pack 两个审核 tarball。Profile 精确保留两个依赖和两个 Bundle 层，重新加载投影得到 `fixture.workspace-tools` 与 `fixture.skill-pack`，此项 PASS。
- **阻塞失败：** 新包首次启动在 Host 创建前报 `ERR_MODULE_NOT_FOUND`：包内 `@deepseek-ai/dsh-app-boot/lib/index.js` 导入 `@deepseek-ai/cordis`，但 `app.asar` 不含 `/node_modules/@deepseek-ai/cordis`。因此没有产生包内 Host origin，也无法观察 Host 条目、客户端贡献、Skill 能力或执行完整退出/重启。
- **状态与下一步：** F003 和 T010 均保持 `in-progress`/未勾选，生产变更闸门仍关闭。修复所有权返回开发窗口；需要补齐 Desktop `app.asar` 的 app-boot 运行依赖闭合及最窄打包回归。新快照交接后只复验包内启动、Host/client/Skill 证据、页面刷新恢复和完整退出重启，不重复未受影响的干净 PATH 安装测试。

### 2026-08-15 F003 T010 修复后 Desktop/包目录闭环（PASS）

- **直接修复：** 闭环窗口为 Desktop 补齐 `@deepseek-ai/cordis`、`cordis-plugin-group`、`cordis-plugin-loader` 和 `dsh-launch-environment` 四个 `dsh-app-boot` 实际运行 peer，并增加打包配置回归；最终 `app.asar` 确认包含四个包，原 `ERR_MODULE_NOT_FOUND` 消失。
- **真实合同修复：** 包内 Host 进一步证明 `pluginInventory/list` 的 Typert Remote payload 必须为 `{ args: {} }`。运行验证器与独立合同测试已修正，真实接口返回 Host、客户端与 Skill 联合证据。修复路径当时未被下一 Feature 占用；下一 Feature 的 `main.ts`、恢复控制器、journal 与诊断路径未被本窗口修改。
- **验证结果：** 打包配置 11/11、运行验证器/安装/恢复相关 3 文件 4 项与 Desktop 类型检查 PASS。目录包位于 `apps/desktop/dist/mac-arm64/DeepSeek Harness.app`；真实 Desktop 基线 Profile 下首次启动、刷新、正常完整退出和再次启动均 PASS，且两次都观察到活动 `fixture.workspace-tools`、客户端“工作区工具”贡献、活动 Skill provider 与 `fixture-harness-basics`。
- **复用证据：** 先前包内 Electron + 固定 `pnpm@11.7.0` 在无系统 Node/pnpm PATH 下真实安装插件与 Skill Pack 的结果未受依赖或 RPC 修复影响，因此按“一项证据输入未变化不重复验证”规则直接复用。
- **最终边界：** F003 T001–T010 和 Feature Map 已标为 `completed`。只生成未签名目录包，未运行 `dist:desktop`；目录包更新检查因缺少正式发布元数据 `app-update.yml` 记录非终止警告。生产 `mutationsEnabled=false` 继续保留，必须等 F005 恢复验收完成后才可开放真实用户安装。

### 2026-08-15 F005 源码与 Web 交接（待真实 Desktop 闭环）

- **任务状态：** T001–T007 完成。T005 已由 F003 真实安装执行器与 F004 真实启用、禁用、更新、卸载执行器闭环；T008 已完成 macOS arm64 子集，仍缺 Windows x64 包体崩溃验收。
- **实现结果：** 操作日志使用版本化不可变头、只追加阶段和显式提交标记；Profile 快照对白名单文件、根身份和内容哈希做绑定，恢复通过固定包管理器重建旧包状态，并在旧 Host、客户端和 Skill 证据完全一致后写入 `rolled-back`。崩溃遗留锁只允许同一 operation id 在原进程明确死亡后接管，二次中断可继续恢复。
- **失败边界：** 开放日志先于普通 Host 启动恢复；无法验证时只打开受保护恢复页，提供同事务重试与用户选择路径的脱敏诊断。未来版本或损坏日志不会被猜测解析，也不会启动未知组合。当前日志和快照永不清理；仅已验证关闭的历史按 20 份日志和 8 份快照保留。
- **自动化证据：** 五类真实执行器在 11 个提交前故障点共 55 项恢复场景通过；最新 F005 关联回归为 10 个测试文件 95 项，Desktop 测试 TypeScript 与本轮文件 `oxlint` 通过。本窗口没有执行根构建、Electron 编译或桌面打包。
- **浏览器验收：** 保持 `http://127.0.0.1:3081/?pluginCenterRecovery=failed` 可访问。用户可查看恢复失败提示、原因、重试和诊断入口；浏览器桥接只模拟状态与导出结果，不写真实文件，也不证明 Host/Profile 已恢复。
- **桌面必验：** Windows x64 必须验证开放日志时普通 Host 未启动、已加载插件文件释放后再恢复、安装或管理过程中杀进程后重启先恢复旧组合、恢复中再次杀进程仍可继续、失败重试保留 operation id、诊断由原生保存框导出且不含路径/内容，以及无开放日志的普通启动不变。T008 完成前不得解除 `mutationsEnabled=false`。

### 2026-08-15 F005 macOS 目录包阶段验收（部分 PASS）

- **验收制品：** 初始 F005 交接快照执行完整 `pnpm run package:desktop` 成功，闭合运行时包含 195 个 workspace 包；验收目录包为 `apps/desktop/dist/mac-arm64/DeepSeek Harness.app`，未签名且未运行 `dist:desktop`。该包早于 F004 最终管理执行器与本轮真实恢复矩阵，因此只保留为 macOS F005 子集证据，不记作最新全量源码构建 PASS。
- **恢复失败与诊断：** 使用隔离 `DSH_HOME`、隔离 Electron `user-data-dir` 和未来版本日志启动真实目录包，普通 Host 未启动，只出现独立恢复页；同 operation id 重试继续失败并保持原原因码。通过原生 macOS 保存框实际导出 JSON，确认不含 Profile 路径、内容、令牌或预置 canary，且未在用户文档目录留下验收文件。
- **真实崩溃回滚：** 在装有插件 fixture 与 Skill Pack fixture 的隔离 Profile 中制造安装事务中断并强杀包体。重启后恢复使用包内固定 `pnpm@11.7.0`，四个快照文件逐字节哈希一致，两类 fixture 包重新存在，真实 Host 返回 137 个 Loader 条目、41 个客户端模块和 1 个 Skill；目标 Loader 均为 active，客户端贡献与 `fixture-harness-basics` 均恢复。事务只在上述证据通过后成为 `rolled-back` 并进入普通 Host。
- **二次中断与重启：** 将同一隔离日志回放到最后一个持久恢复边界后，目录包在 `recovery-restoring-profile / before-side-effect` 被真实 `SIGKILL`；日志保持开放且普通 UI 未放行。再次启动自动重放同一事务并收敛为 `rolled-back`。随后完整退出与再次启动仍直接进入普通 Host，快照哈希、Loader/客户端/Skill 证据和 `mutationsEnabled=false` 均保持不变。
- **验收中直接修复：** `package-manager.ts` 为包内 pnpm 增加 `CI=true`，避免无 TTY 恢复拒绝清理依赖；`runtime-verifier.ts` 只投影真实 Host 清单字段，以模块名稳定化 Cordis 每次重启生成的 8 位 Loader ID，并兼容旧日志中尚无模块名的匿名条目；`recovery-controller.ts` 把窗口导航延后到 Host 健康和旧运行证据全部验证成功之后。相关 4 个测试文件共 14 项、局部 lint 和改动文件 `git diff --check` 均 PASS。
- **仍未闭环：** T005 的真实执行器逐阶段矩阵已经完成；T008 仍只有 macOS arm64 子集，Windows x64 未执行。因此 F005 和 T008 保持 `in-progress`/未勾选，生产 `mutationsEnabled=false` 不解除。

### 2026-08-15 F004 源码与 Web 交接（待真实 Desktop 闭环）

- **任务状态：** T001–T008 完成。T009 的 Host 启动前应用兼容回放和 Windows 停 Host 模拟通过，真实 macOS/Windows 验收未执行，因此 F004 保持 `in-progress`。
- **实现结果：** 已安装视图从 Profile、确定包、目录、保护身份、日志和运行清单实时派生；系统、目录与本地来源不混淆。目录条目通过同一事务执行启用、停用、确定更新和卸载，保留活动/停用意图，并在目标运行证据通过后提交。设置中的配置和高级清单入口保持可达。
- **破坏边界：** 普通卸载默认保留配置与自有数据。确定包仍存在时，Desktop 把声明路径绑定到卸载 operation；只有卸载提交后的独立确认才能删除插件存储根下所选声明。穿越、未声明路径、重叠、符号链接、系统和本地身份都被拒绝。
- **应用升级：** 普通 Host 启动前核对已审核外部 Bundle；不兼容项只进入 `disabledBundles`，包与本地/系统状态不变。已安装页面显示原因且不提供启用。
- **浏览器验收：** 使用 `http://127.0.0.1:3081/` 打开插件中心和已安装面板；安装“工作区效率工具”后可验证停用、启用、更新、卸载确认及卸载后的独立数据保留/删除选择。`?pluginCenterScenario=compatibility-denied` 展示应用升级不兼容的停用解释。所有动作和数据删除都是开发桥接模拟。
- **自动化边界：** Desktop、Desktop 测试与插件中心客户端 TypeScript 程序通过；局部合同、Profile、投影、管理、数据删除、应用升级与 UI 测试通过。此前未接线的 `pluginOwnedDataRemover` 已接入固定 IPC，当前局部 Desktop 类型检查不再受该问题阻塞。
- **Desktop 必验：** 真实目录包依次执行停用→重启→启用→更新→卸载，核对 Host/客户端/Skill 证据、配置保留、卸载后的真实数据删除和完整应用重启；Windows 必须确认已加载文件释放后才执行更新/卸载。闭环前不得解除 `mutationsEnabled=false`。

### 2026-08-15 F004 macOS 目录包阶段验收（部分 PASS）

- **制品与闸门：** 定向 Host/客户端/Web/Desktop 构建、runtime staging 与 `electron-builder --dir` 成功，生成未签名 `apps/desktop/dist/mac-arm64/DeepSeek Harness.app`，未运行 `dist:desktop`。原始包实测 `mutationsEnabled=false`；真实动作只在 `/tmp` 副本中以可核对的不同 asar 哈希临时接通既有管理控制器。
- **已安装与动作：** 真实包正确展示两个 system 组件和目录插件/Skill Pack，系统项受保护且运行中，目录项运行中并提供管理动作；先前同输入的真实停用→完整重启→启用证据继续有效。本轮在无系统 Node/pnpm 的 PATH 下真实卸载 `fixture.workspace-tools`，Host 从一代动态 origin 切换到下一代后才提交，工作区插件的 Host/客户端证据消失，Skill Pack 和系统运行证据保持健康。
- **数据决定：** 修复 Host 换代造成 renderer 状态丢失后，重新进入插件中心会从已提交日志和 operation 绑定声明恢复独立数据弹窗。默认“保留数据”会持久关闭 offer 并保留 `cache`、`logs` 和配置；另一隔离 Profile 只选择 `cache` 删除后，`logs` 与配置继续存在。完整退出重启后卸载状态、无 offer、保留数据和其余运行证据均保持。
- **验收中修复：** 合同允许真实 Host 发出的 `include:`/`module:` 证据身份；系统 Bundle 的显式禁用 Loader 行不再被误判为整体失败；pnpm remove 使用 pnpm 11 支持的 `--config.ignore-scripts=true` 与固定 registry 参数；提交后的数据 offer/保留决定通过固定 IPC 和持久 authority 恢复。相关 7 个测试文件 81 项、合同生成、Desktop 类型检查和插件中心客户端 Bundle 通过。
- **透明边界：** 首次隔离回放使用 `/tmp` 别名而 pnpm Store 记录 `/private/tmp`，触发 `ERR_PNPM_UNEXPECTED_STORE` 后由 F005 成功回滚；改用实体路径并预物化同一固定 Store 后通过，不计产品失败。目录包更新检查缺少正式 `app-update.yml` 的非终止警告仍存在，与 F004 无关。
- **仍未闭环：** 内置目录没有高于已安装版本的真实制品，无法执行确定更新；没有上一版/不兼容发行包，无法做真实应用升级停用；当前环境不是 Windows x64，无法验证已加载文件释放。因此 F004/T009 保持 `in-progress`，生产闸门继续关闭。

### 2026-08-15 公开 npm 生态最新目录包验收（macOS PASS）

- **最新制品：** 恢复锁文件对应依赖后，根 Host/客户端/Web、Desktop 类型检查与构建、195 个 workspace 包的 runtime staging、`electron-builder --dir` 和包内 runtime 核对通过；生成未签名 `apps/desktop/dist/mac-arm64/DeepSeek Harness.app`，未运行 `dist:desktop`。正式 preload 实测 `mutationsEnabled=true`。
- **干净首次启动：** 使用实体 `/private/tmp` 隔离 `DSH_HOME`、隔离 Electron user data，并把 PATH 限定为系统基础目录。首轮发现插件中心兼容指纹早于 Web Profile 自动初始化，导致空 Profile 启动失败；Desktop 现只在没有待恢复事务、即将启动普通 Host 时创建 shipped Web Profile，再执行兼容回放。修复后的同一空目录正常启动真实 Host。
- **真实公开生态：** 页面从 npm 在线目录发现 `dsh-latex-tools@0.1.2`。点击安装只打开确定版本与广泛运行权限确认，操作日志保持上一条已提交事务；勾选信任并确认后才创建安装事务 `686243b0-ebbb-4a06-8647-fe6495c921ff`，Host 换代到第 4 代后提交。已安装投影显示 catalog 来源、enabled、running、`include:dsh-latex-tools` Loader 与 `dsh-latex-tools` 客户端证据。
- **真实卸载：** 通过条目三点菜单、保留配置/数据确认后执行卸载事务 `e3e693b3-1d02-4c7b-ab1d-3f0bd2644a5e`；Host 换代到第 3 代后提交，已安装投影中该包为空。显式安装重跑后页面显示三点管理入口且不再显示安装按钮。
- **验收修补：** 客户端严格可选属性下的菜单 className 与设置测试夹具各做一处最小类型修补；完整客户端构建和 Desktop 源码/测试类型检查通过。目录包缺少发布期 `app-update.yml` 仍只产生非终止更新检查警告。

### 2026-08-17 短名、GitHub 映射与聚合 Bundle 验收（macOS PASS）

- **发现规则：** 输入 `dsh-web-ui-all`、`@linxin666/dsh-web-ui-all` 和 `@linxin666/dsh-web-ui-all@0.1.19` 均把同一确定版本排在第 1；短名同时如实返回另一个同尾名 scope，不擅自选择发布者。明确仓库 `https://github.com/zhu1090093659/dsh-web-ui` 有界解析出 21 个已发布 Bundle，最终回归中目标位于第 15。普通 npm 文本搜索只取一页，确定元数据读取另设每次 96 个候选硬上限；GitHub 映射、部分源码未发布、源码-only、无 Bundle 和网络失败分别显示可行动提示。
- **资格与制品：** `@linxin666/dsh-web-ui-all@0.1.19` 没有 `dsh-plugin` 关键词和 `engines.node`，但固定 Registry 的确定版本、SHA-512 tarball、`dsh.bundle.patch`、13 个 Loader 条目与 13 个确定顶层依赖均通过。页面明确显示发布者未声明 Node.js 范围，不把 Studio 的技术运行范围冒充发布者承诺。
- **真实安装与重启：** 使用项目内隔离 `DSH_HOME` 和 Electron user data 从真实 Desktop 确认高权限风险后安装。事务提交后 13 个目标 Loader 条目 active，12 个目标客户端模块存在；完整退出并重新启动 Desktop 后，任务看板、SSH 等真实界面贡献及相同运行证据继续存在。修补归属后再以新候选安装一次，事务 `ad223db9-e2a1-4c01-91dd-a650e388b701` 提交；验收结束时 Studio 保持运行且隔离 Profile 已安装该插件。
- **聚合卸载修补：** 首次卸载暴露聚合包归属缺口：旧候选只声明顶层客户端模块，运行校验把子模块消失误判为无关损失并自动 `rolled-back`。修复后使用 Host 同源 YAML schema 结构化解析实际插入 Loader 树，再读取其确定依赖 npm 元数据，候选拥有完整 12 个客户端模块；再次卸载事务 `committed`，Profile 依赖、Bundle 层和安装目录均消失。该失败没有越过快照/回滚边界。
- **用户 Profile 隔离：** 验收前后真实 `~/.dsh/profiles/web/package.json` 的 SHA-256 均为 `1c6804fe337b5e554bf7c06deb2a87ac811b1797bf2db52a51ea6b99d1d31344`，未修改老师真实 Profile。验收结束后 Studio 继续以隔离 Profile 运行。
- **自动化：** npm 发现、YAML 结构、查询上限、缓存重新取证与聚合依赖 12 项，连同安装/管理代表测试共 19 项 PASS；Desktop 类型检查、GUI 287 文件 3,859 项与全量 build 通过。扩大到现有全部插件中心用例时，仍有与本改动无关的 rc.5→rc.7 版本断言 1 项和既有恢复矩阵 fixture 客户端声明 12 项失败，单独保留为基线债务。

## F002 与 F003 的汇合条件

F003 只能消费 F002 的可信结果，不能重新发明兼容判断或接受渲染器提供的安装权威：

1. Renderer 只提交 `pluginId`、确定 `version` 和封闭 `action`，不能提交包名、URL、路径、产物证据、环境、策略或 `allowed`。
2. Electron 根据当前目录版本、环境、Profile、系统组件和操作状态生成 `CompatibilityDecision`；拒绝结果不能进入 F003 进度，也不能改变 Profile。
3. F003 开始任何变更前必须重新解析确定目录版本并针对当前指纹执行预检。旧的允许结果、旧 ETag 或旧 Profile revision 不能授权变更。
4. [F002 T007](docs/specs/F002-compatibility-risk-preflight/tasks.zh.md)证明全部拒绝路径的 Profile、锁文件、Bundle 顺序、Host 代次和已安装投影保持不变后，F003 才能连接操作日志、锁、快照、包变更和 Host 重启。
5. 汇合完成后，F002 继续拥有兼容与风险语义，F003 只拥有已授权操作的持久事务和运行验证。

## 不可偏离的开发边界

- 外部浏览器是 F001–F007 每轮 UI 开发和人工验收的固定入口，不得因为生产实现使用 Electron preload，就退回到每完成一个 Feature 都构建或打包 Desktop。
- 外部入口必须使用 `DSH_DESKTOP=1` 组合完整 Desktop 客户端 UI 名册与皮肤，但必须使用隔离的 `DSH_HOME` 和确定开发桥接；它不能读取真实用户 Profile，也不能启动真实 MCP、包管理器或 Electron IPC。
- 插件中心固定通过 `sidebar.primary.action` 作为左侧一级入口，并通过 keyed `main.page` 打开独立主页面；不得再塞回设置标签。设置继续独立承载插件配置与 Loader 运行清单，会话/新会话入口负责退出一级页面并回到会话主界面。
- 生产环境继续由 Electron 持有目录缓存、文件系统、包管理器、Host 重启和安装事务权限；Web 开发桥接只提供确定的页面数据、状态变化和故障场景，不获得真实系统变更权限。
- 一个 Feature 如果增加了新的 Desktop 状态或动作，就必须在同一轮扩展 Web 开发桥接。浏览器页面根节点保留可检查的开发模式标记与悬停说明，但不额外插入破坏参考 UI 的大幅提示。浏览器中不可到达的页面或状态不能被记为该轮 UI 已完成。
- `pnpm run dev:desktop` 由桌面验收窗口用于逐 Feature 的真实 Electron 检查；`pnpm run package:desktop` 或 `pnpm run dist:desktop` 只在该 Feature 明确需要包体边界或最终统一收口时执行。
- Web 模式与 Desktop 模式复用同一组客户端组件和状态合同。开发桥接不得复制第二套页面，也不得改变生产桥接的安全边界。

## 一次性开发入口

后续 Feature 固定使用 `pnpm run dev:desktop:web`；`pnpm run dev:plugin-center` 仅保留为兼容别名。该命令负责：

- 启动可增量更新的本地 Web 页面并输出固定访问地址；
- 以 `DSH_DESKTOP=1` 启用与 Desktop 相同的客户端 UI Bundle 和皮肤，并增量监听全部 `dsh.client` 包，不触发 Electron 构建或全仓重新构建；
- 注入仅限开发环境的固定桥接，支持正常、空目录、离线缓存、兼容拒绝、安装进度和恢复故障场景；
- 在页面根节点标记“Web 开发模式”并提供悬停说明，避免把模拟桥接误认为真实桌面能力；
- 使用项目内隔离 Profile，保持一级插件入口、会话返回路径、桌面皮肤、现有插件配置页和 Loader 清单可达，避免新页面遮断旧旅程；
- 明确不把浏览器中的开发桥接结果当作真实 MCP、IPC、文件系统、Host 重启或安装证据；这些由桌面验收窗口逐 Feature 回传。

默认访问地址为 `http://127.0.0.1:3081`。开发桥接支持默认正常目录，以及通过 `pluginCenterScenario=empty`、`pluginCenterScenario=stale`、`pluginCenterScenario=compatibility-denied`、`pluginCenterScenario=error` 切换空目录、陈旧缓存、F002 有序兼容拒绝和读取失败；后续 Feature 在同一入口继续增加自己的确定场景，不另建开发页面。

## Feature 验收矩阵

当前开发顺序在 F004 后停止新增 Feature，进入核心 Desktop 打包验收。F006 与 F007 暂停，只有用户明确恢复后才重新进入队列。

### 各阶段文档与闭环入口

| 阶段 | 开始时阅读 | 开发队列与闭环条件 |
|---|---|---|
| F001 目录发现 | [Spec](docs/specs/F001-catalog-discovery/spec.zh.md) · [Plan](docs/specs/F001-catalog-discovery/plan.zh.md) · [Tasks](docs/specs/F001-catalog-discovery/tasks.zh.md) | 自动化 Task 已全部完成；Desktop Web 组合预览通过用户验收后交给桌面窗口，后续 Feature 的变更动作保持不渲染 |
| F002 兼容与风险预检 | [Spec](docs/specs/F002-compatibility-risk-preflight/spec.zh.md) · [Plan](docs/specs/F002-compatibility-risk-preflight/plan.zh.md) · [Tasks](docs/specs/F002-compatibility-risk-preflight/tasks.zh.md) | 完成固定桥接、风险展示和拒绝不变性矩阵；只交付可信决定，不改变 Profile |
| F003 可信安装 | [Spec](docs/specs/F003-trusted-installation/spec.zh.md) · [Plan](docs/specs/F003-trusted-installation/plan.zh.md) · [Tasks](docs/specs/F003-trusted-installation/tasks.zh.md) | 先做路径隔离的基础 Task，F002 闭环后再连接成功安装事务；全部 Task 完成后仍由 F005 阻止公开变更 |
| F005 事务与恢复 | [Spec](docs/specs/F005-transaction-recovery/spec.zh.md) · [Plan](docs/specs/F005-transaction-recovery/plan.zh.md) · [Tasks](docs/specs/F005-transaction-recovery/tasks.zh.md) | 完成快照、日志、逐阶段故障注入、启动恢复、恢复失败 UI 和打包崩溃验收后，才能解除真实变更闸门 |
| F004 已安装组合管理 | [Spec](docs/specs/F004-installed-composition-management/spec.zh.md) · [Plan](docs/specs/F004-installed-composition-management/plan.zh.md) · [Tasks](docs/specs/F004-installed-composition-management/tasks.zh.md) | 复用 F002/F003/F005 完成启停、升级、卸载、保护与数据边界，全部动作具有运行证据和重启一致性 |
| F006 目录运营与排行 | [Spec](docs/specs/F006-catalog-operations-ranking/spec.zh.md) · [Plan](docs/specs/F006-catalog-operations-ranking/plan.zh.md) · [Tasks](docs/specs/F006-catalog-operations-ranking/tasks.zh.md) | `paused`：自建目录后台与精准排行均不属于本轮交付；用户明确恢复前不继续开发 |
| F007 Agent 辅助获取 | [Spec](docs/specs/F007-agent-assisted-plugin-acquisition/spec.zh.md) · [Plan](docs/specs/F007-agent-assisted-plugin-acquisition/plan.zh.md) · [Tasks](docs/specs/F007-agent-assisted-plugin-acquisition/tasks.zh.md) | `paused`：Agent 自动查找后安装或更新不属于本轮交付；用户明确恢复前不继续开发 |

| Feature | 本地 Desktop Web 阶段 | 自动化阶段 | 真实 Desktop 阶段 |
|---|---|---|---|
| F001 目录发现 | 从左侧一级“插件”入口进入独立页面，验证插件/技能切换、搜索、公开/个人范围、精选/热门/最近更新、同页详情与返回、空态、离线陈旧提示与重试；不展示后续 Feature 的变更按钮 | 目录解码、缓存原子替换、200/304、陈旧回退、只读桥接、一级页面选择、会话返回和现有设置路径回归 | 验证真实应用可从侧栏进入插件中心、目录缓存位于正确 Profile、断网后仍显示缓存，且页面不能越权提供 URL/路径或变更动作 |
| F002 兼容与风险预检 | 验证允许/拒绝结果、平台与版本原因、冲突、撤回、风险说明和验证不等于沙箱的提示；拒绝项不能进入安装进度 | 精确版本输入、稳定原因顺序、产物只读检查、恶意压缩包与身份冲突测试 | 用当前 macOS/Windows 环境和真实下载产物验证结果与 Web 表达一致，篡改产物不能改变 Profile |
| F003 可信安装 | 用固定桥接验证确认、进度、Host 重连、运行证据与完成态；Web 只证明交互和状态机 | 包管理器参数边界、单操作锁、日志、Bundle 核对、Host 监管与激活证据集成测试 | 真实安装一个已审核插件和一个 Bundle 封装 Skill Pack；窗口不退出，Host 重启后能力可用，完整重启应用后继续存在 |
| F005 事务与崩溃恢复 | 验证失败提示、恢复中、已恢复和恢复失败页面，保留可执行的重试与诊断入口 | 在下载、变更、Host 启动和运行验证各阶段注入故障，验证日志和旧组合恢复 | 安装中强制退出应用后重新启动，验证先恢复最后健康组合；无法恢复时必须停在明确故障态，不能假装成功 |
| F004 已安装组合管理 | 验证系统/目录/本地来源、启用、停用、升级、卸载确认、配置保留、Skill Pack 运行证据和旧配置/清单入口 | 已安装投影、确定 Bundle 顺序、受保护组件、证据出现/消失、配置与自有数据边界测试 | 真实执行启停、升级和卸载；重启后状态一致，默认保留配置，插件与 Skill id 的运行证据消失后才报告卸载成功 |
| F006 目录运营与排行 | 验证真实排序字段、分页/刷新、撤回与不可安装状态、离线缓存和运营元数据异常 | 目录签名/完整性、稳定排序、ETag、缓存过期、撤回和异常数据拒绝测试 | 在线刷新后断网重启，验证缓存与撤回策略；目录故障不能破坏已安装本地真相 |
| F007 Agent 辅助获取 | 验证明确请求、候选解释、用户确认、歧义不变更和同一进度视图 | Agent 工具参数、授权边界、幂等、忙碌冲突及复用 F002–F005 流程测试 | 通过真实 Desktop Agent 完成一次插件和一次 Skill Pack 获取；模糊推荐不得变更，明确确认必须走同一持久事务 |

## Web 阶段统一收口

当前核心 Desktop 链路进入交付收口时执行一次；不等待 F006/F007：

- 插件中心当前启用 Feature 的浏览器旅程回放；
- 现有插件配置页、Loader 清单、设置导航和基础会话旅程回归；
- 受影响包的完整类型检查与测试；
- 全量 GUI 测试；
- 只读 Web 构建产物回放；
- 根构建。

这些统一检查用于最终发布收口，不替代桌面验收窗口已经逐 Feature 完成的真实 Electron 检查。单项失败先定位到对应 Feature，不通过反复全仓构建试错。

## 桌面安装包统一验收

### 1. 包体与安装

- 生成 macOS 安装包；具备 Windows 环境时同步生成 Windows 安装包。
- 在干净测试 Profile 安装，验证首次启动、应用版本、资源完整性和卸载入口。
- 验证安装包不依赖系统预装 Node 或 pnpm。

### 2. 核心业务闭环

- 发现一个插件和一个 Skill Pack；
- 查看确定版本、兼容性、风险与权限；
- 一键安装并观察窗口存活、Host 重启、重连和运行证据；
- 完整退出并重新打开应用，确认状态持久；
- 至少验证卸载；停用、启用和升级若当前验收样本具备条件可顺带检查，但不阻塞本次核心交付；
- 确认配置默认保留，未授权数据不删除。

### 3. 故障与恢复

- 断网、目录超时、缓存陈旧、产物篡改和兼容拒绝；
- 安装过程中退出应用、Host 启动失败和运行证据缺失；
- 恢复成功时回到最后健康组合，恢复失败时提供明确诊断；
- 不相关插件、会话、工作区和配置保持不变。

### 4. 升级与回归

- 从上一可发布版本安装或覆盖升级到当前包；
- 验证 Profile、目录缓存、已安装状态和配置迁移；
- 重跑当前启用的 F001–F005 核心桌面旅程；F006/F007 在恢复开发前不进入回归范围；
- 记录安装包版本、测试系统、测试 Profile、通过项、失败项和可复现步骤。

## 每个 Feature 的汇报格式

- **任务状态：** 明确 Feature/Task 编号、已勾选项和仍未完成项，不使用“基本完成”。
- **已完成：** 本轮交付的用户能力与代码边界。
- **协作接口：** 新增或变更的方法、类型、拥有路径、下游消费者和仍禁止的调用。
- **你可以验证：** 本地 Web 地址、入口和最短操作步骤。
- **自动化结果：** 本轮实际运行的局部检查，不列未运行项目。
- **桌面待验收：** 本 Feature 交给桌面验收窗口的真实 Electron/安装包行为。
- **路径交接：** 下一窗口可以接管的文件和仍由当前窗口拥有的文件。
- **下一步：** 只执行当前启用范围；F006/F007 未经用户明确恢复不得开发。
