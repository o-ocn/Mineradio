# 项目同步申请单 (AI_HUB_SYNC.md)

> 📌 **统一入口声明**：本项目采用本文件作为向 `AI-Project-Hub` 提交状态同步与索引更新的标准入口文件。  
> 存放位置：存放在项目代码工程根目录 `E:\Document\Gemini\Mineradio`。

---

## 一、项目基础信息
- **项目名称**：Mineradio 音乐播放客户端
- **项目物理路径 / 仓库地址**：`E:\Document\Gemini\Mineradio` / `https://github.com/o-ocn/Mineradio`
- **当前所处阶段**：阶段完成 / 稳定运行（`v2.2.0` 个人源码分支）
- **同步申请类型**：
  - [ ] 新项目接入 (New Ingestion)
  - [x] 状态增量更新 (State Update)
  - [ ] 里程碑/阶段完成 (Milestone Completed)
  - [ ] 转入长期维护 (Long-Term Maintenance)

---

## 二、提议 Hub 变更内容 (Proposed Hub Changes)
- **PROJECT_INDEX.md 拟更新项**：
  - 更新独立仓库登记项：`repo:Mineradio`
  - 类型：类型 A (Public 仓)
  - 维护状态：阶段完成 / 稳定运行（`v2.2.0` 个人源码分支）
  - 详细状态唯一事实源：`https://github.com/o-ocn/Mineradio/blob/main/PROJECT_STATE.md`（本地: `E:\Document\Gemini\Mineradio`）
  - 核心说明：原生轻量架构，零打包编译，双击即启；当前无 GitHub Release 预编译安装包，实际通过 `main` 源码运行/构建（`README.md` 与 `SECURITY.md` 已于 2026-11-21 校准）；公开源码中非本人内置 Last.fm 凭据已于 2026-11-21 清理移除，改由本机未跟踪配置或环境变量读取；详见独立仓库正式状态。
- **Hub 内项目状态指针 / 档案更新**：
  - 本项目属于类型 A 独立仓库，根据单一事实源铁律，完整状态由本仓库自身维护，Hub 仅保留地图指针，不建立重复状态副本。

---

## 三、对应事实源文件与实测证据
> 📌 **填写原则**：只写本次同步的验证方式与结论，长期状态与详细数据见唯一事实源。

- **项目唯一事实源**：[`PROJECT_STATE.md`](PROJECT_STATE.md)（已包含完整六大核心支柱）
- **核心实测证据摘要**：执行自动化检查脚本 `node scripts/quick-check.js` 106 个客户端模块全绿通过，覆盖语法合规性、底栏三栏居中布局与视觉设置无悬停白盒校验；`node --test tests/local-music-library-persistence.test.js` 7/7 项单元测试 100% 全绿通过；`node --test tests/provider-login-state-recovery.test.js` 10/10 项单元测试 100% 全绿通过。

---

## 四、安全与合规声明
- [x] 已确认无任何密码、Token、Cookie、API Key 或私钥明文；
- [x] 已确认无 AI 聊天记录、推理思考过程或操作流水账；
- [x] 变更内容经实际运行验证通过，具备真实性。
