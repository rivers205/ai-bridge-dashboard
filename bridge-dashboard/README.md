# AI 协作桥接看板 V0.3

## 用途

AI 协作桥接看板是一个静态控制看板原型，用于清晰展示 GPT、Codex 与人工审批之间的协作状态。页面集中显示当前任务、负责人、三个角色的状态、任务时间线和下一步操作。

本版本没有后端、数据库、身份验证或外部服务，也不会执行任何外部写入操作。

## 本地打开

可以直接在浏览器中打开 `index.html`。页面内置了中文示例状态，因此通过本地文件方式打开时仍可正常显示。

若要让页面读取 `status.json`，请在 `bridge-dashboard` 目录运行任意静态文件服务器，例如：

```sh
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 状态数据结构

`status.json` 使用英文属性名和英文状态枚举，界面通过 `index.html` 中的中文映射表显示状态。

- GPT 状态：`IDLE`、`THINKING`、`REVIEWING` 或 `COMPLETED`
- Codex 状态：`IDLE`、`WORKING` 或 `COMPLETED`
- 人工状态：`IDLE`、`WAITING` 或 `COMPLETED`
- 桥接状态示例：`WAITING_FOR_GPT_REVIEW`
- 当前负责人：`GPT`、`CODEX` 或 `HUMAN`

## GitHub 集成准备

V0.3 仅预留数据结构，不连接 GitHub API：

- `sourceType` 标记当前数据来源为 `STATIC`。
- `github.repository` 保存未来目标仓库名称。
- `github.integrationStatus` 明确标记为 `NOT_CONNECTED`。
- `loadDashboardState()` 将数据加载与界面渲染分离；未来适配器只需返回相同的数据结构。

接入 GitHub 时，可以在获得明确授权后增加只读或读写适配器，并在运行环境中安全提供凭据。当前版本不会发送外部请求，不包含 Amazon API，也不会改动任何远程仓库。
