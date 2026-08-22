# FF - LLM Wiki DSH Plugin

`@fufan/dsh-plugin-llm-wiki` 是 FF - LLM Wiki 完整产品的 DeepSeek Harness 启动插件。插件不替换 DSH 主页面，也不重写知识库界面；它只在侧栏注册一个启动入口，并运行 npm 包中预构建的原版应用。

## 产品边界

- `application/` 保存从 `LLMWikiReproduction` 同步的完整产品源码；
- `runtime/web/` 是该源码生成的静态前端，页面布局、G6 图谱、流式问答、评估与设置均与独立产品一致；
- `runtime/api/` 是相同后端源码生成的 Node.js 服务；
- DSH 只提供启动入口和 `DEEPSEEK_API_KEY`，不会把产品页面注入 `main.page`；
- 文档、Wiki、图谱和 SQLite 数据写入 DSH Home 下的插件专属目录，卸载时可由插件中心统一清理。

点击 DSH 侧栏的 `FF - LLM Wiki` 后，Desktop 会在系统浏览器打开独立应用。DSH 原页面、导航、主题和工作区保持不变。

应用启动会校验 `content/.wiki.lock` 中的进程 PID；上次异常退出留下的锁会被立即回收，正在运行的编译进程则继续持有互斥锁。

## 安装

在 DeepSeek Harness 插件中心搜索 `@fufan/dsh-plugin-llm-wiki` 并安装；离线环境可选择本项目产出的 `.tgz`。安装完成并重启 Host 后，侧栏会出现启动入口。

模型密钥继续由 DSH 凭证中心托管。应用启动时读取 `DEEPSEEK_API_KEY`，设置页可真实验证 `deepseek-v4-flash` 与 `deepseek-v4-pro`。

## 开发与打包

```bash
pnpm run typecheck:host
pnpm run typecheck:client
pnpm run bundle
pnpm run pack:plugin
```

`bundle` 会从 `application/` 生成独立运行制品。产品页面发生变化时，先从最终源码重新同步 `application/`，再构建新版本，避免维护第二套 UI。

## Known Limitations and Deferred Work

- 应用目前通过系统浏览器打开独立界面；在 Electron 窗口内嵌完整知识库界面尚未实现。
- 插件不会携带或写死 DeepSeek API Key；运行环境必须由用户通过 DSH 凭证中心配置。
- `runtime/` 是可重新生成的打包产物；Desktop 发布流程会从 `application/` 重建它，普通源码提交不把生成结果作为事实源。
