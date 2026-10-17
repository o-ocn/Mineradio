# 项目同步申请单 (AI_HUB_SYNC.md)

> 📌 **统一入口声明**：本项目采用本文件作为向 `AI-Project-Hub` 提交状态同步与索引更新的标准入口文件。  
> 存放位置：存放在项目代码工程根目录 `E:\Document\Gemini\Mineradio`。

---

## 一、项目基础信息
- **项目名称**：Mineradio 音乐播放客户端
- **项目物理路径 / 仓库地址**：`E:\Document\Gemini\Mineradio` / `https://github.com/o-ocn/Mineradio`
- **当前所处阶段**：阶段完成 / 稳定运行 (活跃 v1.0.0-beta)
- **同步申请类型**：
  - [ ] 新项目接入 (New Ingestion)
  - [ ] 状态增量更新 (State Update)
  - [x] 里程碑/阶段完成 (Milestone Completed)
  - [ ] 转入长期维护 (Long-Term Maintenance)

---

## 二、提议 Hub 变更内容 (Proposed Hub Changes)
- **PROJECT_INDEX.md 拟更新项**：
  - 更新独立仓库登记项：`repo:Mineradio`
  - 类型：类型 A (Public 仓)
  - 维护状态：阶段完成 / 稳定运行 (活跃 v1.0.0-beta)
  - 详细状态唯一事实源：`https://github.com/o-ocn/Mineradio/blob/main/PROJECT_STATE.md`（本地: `E:\Document\Gemini\Mineradio`）
  - 核心说明：原生轻量架构，零打包编译，双击即启；底栏精简居中、音源/音质移入歌曲详情、动画抗卡顿；借鉴Folia强化本地曲库（文件夹封面优先与目录级哈希缓存去重、外挂多格式歌词与翻译自动关联）、演职员制作名单智能剥离、实时歌词广播API；Last.fm代理穿透与防重复弹窗授权、全局弹窗右上角关闭按钮视觉归一；自由选定本地缓存位置；移除酷狗并原生接入YouTube Music，支持调用系统原生默认浏览器一键同步与解锁彩蛋门禁；106模块自检及单元测试全绿
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
