# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

侧边栏外壳插件：负责品牌行、New Session 操作、一级应用动作 seat `sidebar.primary.action`、布局持有的折叠控件、可感知滚动的区域 seat，以及固定在底部的 Settings seat。[ui-workspace](../ui-workspace/README.zh.md) 持有渲染到 `sidebar.workspaces` 的 Workspace 与 Session 浏览器；本包既不派生其中的行，也不持有其视图偏好。折叠仍属于本地呈现行为：布局拥有的轨道在 Web、Windows 与 Linux 中为 56px；macOS 桌面端为 90px，使原生交通灯组留有右侧余量。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)。

展开的品牌行把 `sidebar.brand.mark` 与 `sidebar.brand.name` 渲染为两个独立的 single slot，收起轨道则渲染同一个 mark slot。没有占位者时，外壳使用鱼形标记，以及带有构建期 7 位 `DSH_CLIENT_COMMIT_HASH` 徽标的 `DSH Local Build` 标签。部署包可以单独替换任一值，而无须替换 New Session 控件或轨道几何；声明感知的 `slots.inject()` 让这种包无论先于还是后于侧边栏激活都能生效。

在 macOS 上，Electron document 会显示侧栏顶部拖拽条；拖拽条与侧栏内容在 32px 处相接，使 logo 行直接从交通灯下方开始，其内部 60px 几何保持不变。Windows 使用普通的展开态 6px 与轨道态 18px 顶部间距，不显示侧栏拖拽条，因为窗口拖动由会话窗口按钮行负责。存在平台拖拽条时，侧栏控件保持 `no-drag`。Web 不预留原生标题栏空间。在 macOS 与 Windows 上，侧栏根节点保持透明以显示布局持有的原生材质；Linux 仍使用普通侧栏填充色。

New Session 会启动运行时的页面局部前端 Session Intent。运行时优先使用作用域操作明确指定的 Workspace，否则使用当前 Session 所属 Workspace，再否则使用最近活跃 Workspace；一个 Workspace 都没有时则清空选择，进入空白 New Session 页面。Workspace 专属控件与共享选择器由 ui-workspace 持有。

`SidebarRootComponentProps` 组合布局 owner share（包括当前 `primaryPage`）、全局 `useSessions` 和 `useWorkspaces` 钩子、已声明的品牌、`sidebar.primary.action`、`sidebar.workspaces`、`sidebar.footer.action` 与 `sidebar.settings` 子 slot，以及注入的 `startSession` 与侧边栏切换回调。这里没有插件 store。

实时收起时，外壳会把展开内容固定在当前宽度，并用 150ms 将其淡出。随后，上方四个控件——外壳的侧栏切换与新建会话，以及通过 `sidebar.workspaces` 渲染的添加和搜索——共用一次 150ms 的淡入与左移，在布局的 300ms 栏滑动结束时一起进入轨道；56px 轨道对应 49px，macOS 的 90px 轨道对应 66px。每个 36px 控件盒都会沿同一条路径到达轨道中的居中位置：56px 轨道的横向内边距为 10px，macOS 轨道则为 27px。固定在底部的 `sidebar.settings` 控件只共用淡入时序，不发生横向位移。页面初始即为收起状态时会静态渲染轨道；减少动态效果模式会禁用两段过渡。

栏内的滚动条是一种指针可供性：只要指针不在栏内，外壳就把 ui-theme 的[滚动条间接层](../ui-theme/README.zh.md)重新绑定为 `transparent`；指针离开后滑块再保留 2 秒，因此没人指向的列表不会带着滚动条。避免行位移的空间预留属于滚动区域本身（[ui-workspace](../ui-workspace/README.zh.md)），所以显示滑块不会引起重排。

页脚在展开与折叠两种宽度下，都会把 `sidebar.footer.action` 的所有占位者纵向排列在固定于底部的 `sidebar.settings` seat 上方。每个占位者只接收栏状态（`wide`），并自行持有行或轨道按钮几何；ui-settings 在最后一个 seat 注册 Settings 触发行和面板。

`/client` 导出表层只包含插件主体（`apply`／`inject`）及约定类型；SidebarRoot、行组件和树派生仍由 slot 注册封装在包内。

## 模型体验

无。侧边栏渲染浏览器会话列表；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **Session 状态点渲染由 [ui-workspace](../ui-workspace/README.zh.md) 持有**：没有可用的 done/error 通知数据源。
- **Workspace 浏览行为由组合持有**：分组、排序、搜索与行状态都属于 [ui-workspace](../ui-workspace/README.zh.md)，不属于此外壳。
- **「New task completed」未读标记是本地查看状态**：完成时间 > 上次查看时间这一事实永远不会到达宿主。
