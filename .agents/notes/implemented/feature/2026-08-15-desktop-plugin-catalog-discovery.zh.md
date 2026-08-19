# Agent Note: Desktop 插件目录发现

Status: implemented

[English](2026-08-15-desktop-plugin-catalog-discovery.md) | 中文

## 问题

Desktop 设置界面已经提供插件配置与 Loader 运行清单，但没有产品归属的发现视图。一个类似市场的页面不能安全接受渲染器传来的包名、URL 或任意 Skill 文件夹，因为目录元数据属于不可信输入，而后续 Feature 还要使用同一确定版本身份完成兼容判断、安装、激活证据与卸载。产品也需要明确 Skills 边界：打包为 DSH Bundle 的 Skill Pack 可以发现，但不能因此创建第二套原始 Skill 安装权威。

## 决策

**目录发现是 Desktop 归属的边界。** `@deepseek-ai/dsh-plugin-center-contracts` 为目录摘要、详情、筛选、兼容性、新鲜度、制品与声明运行身份定义严格的精确字段解码器。Desktop 在固定 npm registry 中搜索 `dsh-plugin`；DeepSeek Harness 文档把它定义为发现关键词。主进程再读取确定版本元数据，并只保留声明 `dsh.bundle` 的包。HTTPS origin、响应与压缩包边界、不可变完整性校验、权威缓存原子替换、离线回退和 IPC 发送方检查都归主进程所有；渲染器不能提交来源 URL、文件系统路径、包命令或可执行文件。

**插件与 Skill Pack 共用一个目录身份。** 目录条目携带 `catalogKind: plugin | skill-pack`、一个确定包版本、Bundle 成员，以及激活检查必须观察的身份。Skill Pack 是普通已校验 DSH Bundle，其声明包含 `skill` 能力，并在发布时可包含 `expectedSkillIds`；独立原始 Skill 文件夹不是市场条目，也没有单独安装路径。

**发现是一级应用页面，现有插件设置保持独立。** `@deepseek-ai/dsh-client-ui-plugin-center` 通过 `sidebar.primary.action` 贡献侧栏动作，并通过 keyed `main.page` 贡献独立页面。`ui-layout` 拥有所选 `primaryPage` 并保持 Conversation 界面挂载，`ui-workspace` 在用户新建或打开会话时关闭该页面。页面按 Codex 参考层级提供「插件/技能」导航、居中搜索与内容、已安装图标条、公开/个人范围、响应式双列无卡片外框发现条目，以及进入同页确定版本详情的面包屑导航。未安装的公开条目直接显示安装动作；已安装目录条目以当前 Profile 投影为准，并通过紧凑三点菜单只显示后台支持的更新、启用、停用或卸载动作。展开的已安装区域继续承载来源、运行状态、兼容性、配置与运行清单详情，现有设置路径仍可独立进入。安装与管理动作只通过已交接桥接合同出现，并复用确定版本预检、确认与持久事务状态。

**插件变更后的 Host 重载保留插件中心。** 安装、更新、启用、停用、卸载与恢复会启动新的 Host generation，Desktop 只在这类重载 URL 中携带受限的一级页面标识；新客户端组合据此恢复插件中心并继续读取持久操作状态，而普通应用启动仍进入会话主页。

**实时来源是预构建 npm DSH Bundle 生态，并使用多种有界发现信号。** `dsh-plugin` 关键词索引提供默认目录；非空搜索同时只执行一次有界 npm 文本查询。完整 scoped 包名以及可选的确定版本直接读取固定 Registry 的 packument 与确定版本元数据，不扫描全量索引。排序把去掉 scope 后的包名尾部视为精确匹配，因此输入 `dsh-web-ui-all` 可以返回 `@linxin666/dsh-web-ui-all`，输入完整 scoped 包名则只返回该包。关键词是社区发现信号，不代表 DeepSeek 背书，也不再是安装资格。

**明确 GitHub 仓库地址只负责定位，永远不是制品权威。** Desktop 只接受规范的 `https://github.com/<owner>/<repo>`，从固定 GitHub origin 有界读取默认分支树和有限深度 package manifest，再把 Bundle 声明映射回固定 npm Registry 的确定包。它不会 clone、构建、执行生命周期脚本或直接安装仓库源码。只有确定 npm 元数据与不可变 tarball 继续通过统一校验，才会形成安装权威；映射成功、部分源码未发布、源码-only、未找到 Bundle 与网络失败分别显示可行动提示，不再伪装成普通空结果。

**聚合 Bundle 在变更前必须声明完整归属。** tarball 校验使用 Host 自己的 YAML schema 解析 patch，只提取真正插入的 Loader 条目，不再用文本匹配近似 YAML。Bundle 自己拥有的模块必须是顶层 `dependencies` 或合理的可选依赖，并使用确定版本；git、file、workspace、tag 和 semver 范围都会被拒绝。patch 也可以复用封闭 Desktop Host 已提供的模块；允许集合在启动时从实际打包 Host manifest 的依赖表派生，不按 npm scope 或发布者名称猜测，真正缺失的第三方模块仍会被拒绝。持久目录权威按该依赖集合的确定指纹隔离；应用版本的 Host 闭包一旦变化，Bundle 就必须重新校验。Desktop 再读取包自有确定依赖的 npm 元数据，派生完整客户端模块集合。安装必须观察到完整集合，停用或卸载也把同一集合视为目标归属，因此不会再把聚合包的子客户端模块消失误判为无关运行时损失。缺少 `engines.node` 时，界面明确显示“发布者未声明”；Studio 技术运行范围只用于预检，不冒充发布者承诺。

**首屏采用缓存先显与后台补齐。** Desktop 把严格解码后的关键词与查询候选、发现引用写入独立的 `npm-discovery-v2.json`，进入页面先展示上次成功结果，再在首屏完成后刷新完整索引。旧 schema 安全失效并回退网络或已有已校验权威，不猜测迁移。发现缓存只提供卡片元数据，不进入已校验目录权威；用户打开或安装缓存条目时必须先重新读取确定元数据，再下载确定 tarball 并走完整制品校验。每次查询最多为排序后的 96 个候选读取确定元数据，与 npm 报告的总量独立。真正无缓存的首次启动只校验并返回首屏 6 个插件，随后后台补齐 24 个条目和完整索引。客户端在首批结果到达前显示与最终布局一致的两列骨架及已安装图标骨架，刷新期间保留已有内容，网络失败也不会清空可用缓存。

**目录视觉身份按可信度降级。** 发布者可以在 `dsh.pluginCenter.icon` 中声明符合 `CatalogMedia` 合同且来自允许 HTTPS 域名的插件 Logo，并通过 `brandColor` 声明六位十六进制品牌色。未声明 Logo 时，Desktop 只在 npm 元数据明确指向 GitHub 仓库时使用该仓库所有者或组织头像作为发布者身份兜底；这不等同于插件专属 Logo。其余条目使用由包名稳定生成的颜色和首字母，不抓取 README 图片、网站 favicon 或相似品牌图标。搜索卡片、详情页和目录来源的已安装条目复用同一视觉元数据；远程图片加载失败时仍显示字母兜底。

**浏览器开发使用完整 Desktop UI 组合与显式 fixture 接缝，而不是第二套生产权威。** `pnpm run dev:desktop:web`（兼容别名 `dev:plugin-center`）以 `DSH_DESKTOP=1` 启用与 Desktop 相同的客户端 UI 名册和皮肤，通过 Host 注入的开发标记与确定只读桥接启用同一插件页面，并把 `DSH_HOME` 隔离在项目工件目录。页面根节点提供可检查的开发数据标记和悬停说明，不额外插入破坏参考 UI 的横幅；URL 场景覆盖正常、空目录、陈旧缓存与读取失败。该入口不能启动真实 MCP、Electron IPC、文件系统、包管理器、Host 重启或安装动作，Desktop 始终优先使用 preload 桥接。

## 曾考虑的替代方案

**让 React 客户端直接加载公共 registry。** 不采用：这会把网络策略、缓存归属和来源选择移入不可信渲染器，并让后续变更依赖客户端提供的权威。

**把任意本地 Skill 文件夹视为市场条目。** 不采用：原始 Skill 不具备安全一键生命周期所需的确定版本包、Bundle、兼容性、完整性与运行证据合同。

**用市场替换现有插件设置页。** 不采用：配置卡片和 Loader 清单承载不同的已安装状态与诊断旅程，不属于发现功能。

**在后端合同交接前渲染安装控件。** 不采用：缺少 F002 兼容证据和 F003/F005 事务与恢复链路时，安装入口会宣传产品无法验证的生命周期。

## 验证

合同测试覆盖畸形目录输入、确定身份、npm 制品 origin、Skill Pack 要求、缓存归属、原子替换与陈旧回退。Desktop 测试覆盖固定桥接方法、发送方/origin 拒绝、关键词与有界文本发现、短名/完整名/带版本名、明确 GitHub 映射、聚合依赖拒绝、封闭 Host 模块复用、Host 闭包缓存失效、确定 tarball 补全、离线权威复用、安装与管理事务以及恢复。真实 npm 验收已解析 `@tt-a1i/archify-dsh@0.1.0`，从实际 Desktop Host manifest 接受其 `@deepseek-ai/dsh-skill-filesystem` 引用，并生成包含 `archify-skill-filesystem` Loader 条目的可安装详情。macOS 真实验收还通过短名、完整名、带版本名和仓库 URL 解析并校验 `@linxin666/dsh-web-ui-all@0.1.19`，观察 13 个 Loader 条目与 12 个客户端模块，在隔离 Profile 安装、完整重启保留，并最终提交卸载且目标运行证据全部消失。客户端测试继续覆盖一级页面、搜索、详情、确认、进度、已安装管理和浏览器开发旅程。`pnpm run dev:desktop:web` 仍是 UI 开发入口，真实包变更必须使用 Desktop。

## 后果

Desktop 用户可以搜索公开 DSH 生态，并安装、运行、更新、停用、启用或卸载已校验的 npm 确定版本 Bundle，而渲染器不会因此获得来源选择或包管理器权威。兼容、变更、恢复与已安装投影消费同一套严格身份和证据词汇。代价是生态包仍是拥有广泛进程权限的社区代码；校验证明不可变身份与激活声明，不等于官方代码审计。
