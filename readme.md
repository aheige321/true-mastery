
# 📘 真掌握 (TrueMastery) 开发文档

## 1. 项目简介

**真掌握** 是一款基于 Web 的轻量级 Anki 风格记忆卡片应用。它采用 Serverless 架构，利用 GitHub Gist 作为免费的云端数据库，支持多端同步、间隔重复记忆（SRS）、语音合成（TTS）以及数据可视化统计。

### 核心特性
*   **无需数据库成本**：使用 GitHub Gist 存储数据。
*   **间隔重复算法**：基于 SuperMemo-2 改良算法，支持学习阶梯和毕业机制。
*   **双引擎 TTS**：优先使用浏览器原生语音，自动降级至百度智能云 TTS（带持久化缓存）。
*   **数据安全**：支持增量同步、冲突解决、回收站机制及 JSON 导入/导出。
*   **响应式设计**：适配桌面端与移动端，支持暗黑模式。

---

## 2. 技术栈

| 领域 | 技术/工具 | 说明 |
| :--- | :--- | :--- |
| **前端** | HTML5, CSS3 | 原生开发，无框架依赖，使用 CSS Variables 实现主题切换。 |
| **逻辑** | Vanilla JavaScript (ES6+) | 单文件模块化结构 (`js/app.js`)。 |
| **后端** | Netlify Functions (Node.js) | 处理云同步逻辑和 API 代理。 |
| **依赖** | `node-fetch` (v2) | 后端用于请求 GitHub 和百度 API。 |
| **存储** | LocalStorage + GitHub Gist | 本地缓存 + 云端持久化。 |
| **工具** | Netlify CLI | 本地开发与调试环境。 |

---

## 3. 项目目录结构

```text
project-root/
├── index.html                  # 应用入口与 DOM 结构
├── netlify.toml                # Netlify 构建与路由配置文件
├── .env                        # 本地环境变量（不上传 Git）
├── css/
│   └── style.css               # 全局样式表
├── js/
│   └── app.js                  # 核心逻辑（Store, SRS, TTS, UI Controller）
└── netlify/
    └── functions/              # 后端 Serverless 函数
        ├── package.json        # 后端依赖配置 (node-fetch@2)
        ├── cloud-sync.js       # 数据同步核心逻辑
        └── baidu-tts.js        # 百度语音代理与鉴权逻辑
```

---

## 4. 环境配置与运行

### 4.1 前置要求
*   Node.js (v14.0.0 或更高)
*   Netlify CLI (`npm install -g netlify-cli`)

### 4.2 环境变量 (.env)
在项目根目录创建 `.env` 文件，填入以下密钥：

```env
# GitHub 配置 (用于数据存储)
GITHUB_TOKEN=ghp_your_personal_access_token_here
GIST_ID=your_gist_id_here

# 百度智能云配置 (用于 TTS，可选)
BAIDU_API_KEY=your_baidu_api_key
BAIDU_SECRET_KEY=your_baidu_secret_key
```

*   **GitHub Token**：需要勾选 `gist` 权限。
*   **Gist ID**：需手动创建一个 Gist，获取 URL 中的 ID。

### 4.3 安装依赖与启动
```bash
# 1. 安装后端依赖
cd netlify/functions
npm install

# 2. 回到根目录启动开发服务器
cd ../..
netlify dev
```
启动后访问 `http://localhost:8888`。

---

## 5. 核心模块详解

所有前端逻辑集中在 `js/app.js` 中，主要包含以下模块对象：

### 5.1 SRS 模块 (记忆算法)
*   **逻辑**：改良版 SM-2 算法。
*   **学习阶段**：1分钟 (Again) -> 6分钟 (Hard) -> 10分钟 (Good) -> 1天 (Easy/毕业)。
*   **复习阶段**：根据 `Ease Factor` (难度系数) 指数级增长。
*   **毕业机制**：
    *   条件：间隔 > 365 天 且 复习次数 ≥ 5次。
    *   结果：`status` 变为 `graduated`，`nextReview` 设为 `null`，不再出现。

### 5.2 Store 模块 (数据管理)
*   **存储**：封装 `localStorage`。
*   **软删除**：删除卡片或库时，仅标记 `deleted: true` 并更新 `lastModified`，以便同步时通知云端删除。
*   **Activity**：每日学习时记录 `stats.activity`，用于生成热力图。

### 5.3 TTS 模块 (语音合成)
*   **策略**：优先调用 `window.speechSynthesis`。
*   **降级**：失败则请求 `/.netlify/functions/baidu-tts`。
*   **缓存**：使用浏览器 `Cache API` (Cache Storage `tts-audio-v1`) 缓存百度返回的 MP3 数据，避免重复消耗流量。

### 5.4 SyncService (同步服务)
*   **Endpoint**: `/.netlify/functions/cloud-sync`
*   **模式**：
    *   `SYNC`: 双向智能合并（基于时间戳）。
    *   `OVERWRITE_CLOUD`: 强制上传本地数据。
    *   `OVERWRITE_LOCAL`: 强制下载云端数据。

---

## 6. 后端 API 接口说明

### 6.1 Cloud Sync (`cloud-sync.js`)
处理数据的读取、合并与写入。支持多文件拆分以突破 Gist 单文件大小限制。

*   **Method**: `POST`
*   **Body 参数**:
    *   `method`: "SYNC" | "OVERWRITE_CLOUD" | "OVERWRITE_LOCAL"
    *   `data`: 本地数据对象
    *   `userId`: 用户标识（默认为 "user_shared_account"）
*   **文件拆分**: 自动维护 Gist 中的 `cards.json`, `decks.json`, `meta.json`。

### 6.2 Baidu TTS (`baidu-tts.js`)
代理百度 API 请求，隐藏 Secret Key，处理跨域。

*   **Method**: `POST` (Query参数)
*   **Params**: `text` (文本), `lang` (zh/en)
*   **返回**: Base64 编码的 MP3 音频数据。
*   **特性**: 服务器端内存缓存 Access Token，减少鉴权请求。

---

## 7. 数据结构参考

### 卡片对象 (Card Object)
```json
{
  "id": 1715662839402,
  "deckId": "1715662810000",
  "front": "Apple",
  "back": "苹果",
  "tags": ["名词", "水果"],
  "status": "learning",  // new, learning, review, graduated
  "interval": 10,        // 下次复习间隔（分钟）
  "easeFactor": 2.5,     // 难度系数
  "reviewCount": 3,
  "lastModified": "2024-05-14T10:00:00.000Z",
  "nextReview": "2024-05-14T10:10:00.000Z",
  "createdAt": "2024-05-14T09:00:00.000Z",
  "deleted": false       // 软删除标记
}
```

---

## 8. 部署指南

本项目针对 **Netlify** 平台优化。

1.  **推送到 GitHub**: 将代码上传至 GitHub 仓库。
2.  **新建 Site**: 在 Netlify Dashboard 中选择 "Import from Git"。
3.  **构建设置**:
    *   Base directory: (留空)
    *   Build command: (留空，或填 `echo "Build success"`)
    *   Publish directory: `.` (根目录)
    *   Functions directory: `netlify/functions` (Netlify 会自动识别 netlify.toml，通常无需手动填)
4.  **环境变量**: 在 Site Settings > Environment Variables 中添加：
    *   `GITHUB_TOKEN`
    *   `GIST_ID`
    *   `BAIDU_API_KEY`
    *   `BAIDU_SECRET_KEY`
5.  **完成**: 等待部署完成即可访问。

---

## 9. 常见问题 (FAQ)

**Q: 为什么同步时报错 `500`？**
A: 检查 Netlify 环境变量是否配置正确。如果是本地开发，检查 `.env` 文件是否存在且格式正确。

**Q: 如何修复云端数据损坏？**
A: 进入应用“设置” -> 点击“强制覆盖云端 (修复)”。这将使用当前的本地数据重置 Gist 文件结构。

**Q: 朗读没有声音？**
A: 检查设备是否静音。如果使用的是百度语音，检查 API Key 是否欠费或填写错误。在浏览器控制台查看 Network 请求是否有报错。

**Q: 修改了后端代码不生效？**
A: 如果在本地开发，修改 `functions` 目录下的代码必须重启 `netlify dev` 才能生效。