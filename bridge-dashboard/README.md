# AI 协作桥接看板 V0.4

## 用途

AI 协作桥接看板是一个本地、只读的 GitHub PR 监控看板，用于清晰展示 GPT、Codex 与人工审批之间的协作状态。页面集中显示最新 PR 编号、PR 状态、当前阶段、最后更新时间、三个角色的状态、任务时间线和下一步操作。

浏览器只访问本机 `127.0.0.1` 上的只读桥接层。桥接层复用本机 GitHub CLI 或 Git Credential Manager 登录，仅通过 GitHub REST API 的 `GET` 请求读取私有仓库 `rivers205/amazon-ops-core`；凭据不会进入浏览器、页面文件、配置文件、日志或 Git 提交。系统不会执行外部写入，也不包含 Amazon API。

## 本地打开

先确认 GitHub CLI 已登录：

```sh
gh auth status
```

若 `gh auth status` 显示已登录，在 `bridge-dashboard` 目录直接启动无依赖本地桥接：

```sh
node server.js
```

若本机没有已登录的 `gh`，请创建仅限 `rivers205/amazon-ops-core` 的 fine-grained PAT，并只授予以下读取权限：

- Contents：Read-only
- Issues：Read-only
- Pull requests：Read-only
- Commit statuses：Read-only
- Metadata：GitHub 自动提供读取权限

然后运行安全启动脚本：

```powershell
.\start-readonly.ps1
```

脚本会遮蔽输入，只把凭据放入当前 Node.js 子进程环境；服务结束后立即清除环境变量并释放内存，不把凭据写入任何项目文件。

访问 `http://127.0.0.1:8765/`。不能再通过 `file://` 直接打开页面，因为浏览器不会也不应直接持有私有仓库凭据。

## 数据来源

`status.json` 不保存演示状态或凭据，仅保存英文配置键、目标仓库和本地桥接地址。浏览器只请求：

```text
GET http://127.0.0.1:8765/api/github-state
```

桥接层将访问范围固定为 `rivers205/amazon-ops-core` 的 Pull Requests、Issues、Commits 和 Commit Status。所有 GitHub 请求均为 `GET`；服务拒绝浏览器的 `POST`、`PUT`、`PATCH` 和 `DELETE`。

## 身份验证

桥接层优先调用已登录的 `gh api --method GET`。若 `gh` 不可用，可通过 `start-readonly.ps1` 在进程环境中提供仓库级 fine-grained PAT；最后才尝试 Git Credential Manager。凭据只短暂保留在进程内存中，并只发送给 `https://api.github.com`。任何身份验证失败都会返回通用错误，不会把命令输出、Token、PAT、Cookie 或响应细节发送给浏览器。

## 阶段映射

GitHub 不提供 GPT、Codex 或人工负责人字段，因此 V0.4 根据 PR 生命周期应用以下只读显示规则：

- 暂无 PR：等待 Codex 创建 PR。
- 草稿 PR：Codex 执行中。
- 开放且非草稿 PR：等待 GPT 审核。
- 已合并 PR：流程完成，人工审批完成。
- 已关闭但未合并 PR：等待人工决定是否重新打开或新建 PR。

所有用户界面文本保持中文；内部状态键保持英文。页面每 120 秒通过本地桥接重新读取一次，并在读取失败时显示错误而不伪造状态。
