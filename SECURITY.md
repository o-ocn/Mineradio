# Security Policy

## Supported Versions

当前只维护最新公开版本。

## Installer & Source Acquisition Notice

`v1.0.10` 及更早旧安装包不再建议继续安装或传播。请将旧 `.exe` 安装包视为不可信历史产物并隔离保留。

当前 `o-ocn/Mineradio` 公开仓库**未发布任何 GitHub Release 预编译安装包**（`v2.2.0` 标签与 `release/2.2.0` 分支均为上游历史发布快照，`main` 已在其基础上继续迭代并关闭软件内自动更新）。当前唯一可验证的获取方式是从本仓库 `main` 分支拉取源码，按 [`README.md`](./README.md) 本地运行（`npm start`）或自行执行 `npm run build:win` 构建安装包。

## Reporting a Vulnerability

如果你发现安全问题，请通过 GitHub Issues 或仓库作者主页联系作者。

请不要在公开 Issue 中直接贴出 Cookie、Token、账号信息、私密链接或可复现的敏感数据。

## Sensitive Data

Mineradio 不应收集或上传用户 Cookie。用户登录状态应保存在本地用户数据目录中。

如果你要提交问题反馈，请先确认没有附带：

- `.cookie`
- `.qq-cookie`
- 本地音乐文件
- 用户账号截图
- 调试日志中的 Cookie、Token 或隐私路径
