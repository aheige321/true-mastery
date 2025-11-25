太棒了！这是将您的“真掌握”应用从本地推向世界的最后一步。

因为您的项目中包含了 **敏感信息**（如 GitHub Token, Baidu API Key），所以在上传到 GitHub 时必须非常小心，**千万不能把 `.env` 文件上传上去**。

请严格按照以下步骤操作：

---

### 第一步：准备 Git 忽略文件 (安全第一！)

在项目**根目录**下创建一个名为 **`.gitignore`** 的文件（注意前面有个点），如果没有扩展名，就叫 `.gitignore`。

**用记事本打开它，填入以下内容：**

```text
.env
node_modules
netlify/functions/node_modules
.netlify
.DS_Store
```

> **⚠️ 警告**：这一步至关重要！它能防止您的 API Key 泄露给全世界。

---

### 第二步：上传代码到 GitHub

1.  **登录 GitHub**：打开 [github.com](https://github.com/) 并登录。
2.  **创建新仓库**：
    *   点击右上角的 **+** 号 -> **New repository**。
    *   Repository name 填：`true-mastery` (或者您喜欢的名字)。
    *   **不要**勾选 "Add a README file" 或其他初始化选项（我们需要一个空仓库）。
    *   点击 **Create repository**。
3.  **推送本地代码**：
    回到您的 **PowerShell** (项目根目录)，依次执行以下命令（一行一行执行）：

```powershell
# 1. 初始化 Git 仓库
git init

# 2. 添加所有文件 (除了 .gitignore 里排除的)
git add .

# 3. 提交第一次修改
git commit -m "Initial commit: Flashcard App"

# 4. 将分支重命名为 main (现在的标准)
git branch -M main

# 5. 关联远程仓库 (请将下面的 URL 换成您刚才在 GitHub 创建的仓库地址！！！)
# 格式类似：git remote add origin https://github.com/您的用户名/true-mastery.git
git remote add origin https://github.com/aheige321/true-mastery.git

# 6. 推送到 GitHub
git push -u origin main
```

*执行完后，刷新 GitHub 页面，您应该能看到代码了，而且**没有** `.env` 文件。*

---

### 第三步：在 Netlify 上部署

1.  **登录 Netlify**：打开 [netlify.com](https://www.netlify.com/) 并登录。
2.  **新建站点**：
    *   点击 **"Add new site"** -> **"Import from an existing project"**。
3.  **连接 GitHub**：
    *   选择 **GitHub**。
    *   授权 Netlify 访问您的 GitHub 账号。
    *   在列表中选择您刚才创建的 `true-mastery` 仓库。
4.  **配置构建设置** (Netlify 通常会自动识别 `netlify.toml`，确认一下即可)：
    *   **Base directory**: (留空)
    *   **Build command**: (留空)
    *   **Publish directory**: `.` (或者留空)
    *   **Functions directory**: `netlify/functions`
    *   点击 **Deploy site**。

---

### 第四步：配置环境变量 (最关键的一步)

因为我们没有上传 `.env` 文件，Netlify 的服务器现在还不知道您的 Token 和 Key，所以现在的网站虽然能打开，但同步和朗读会报错。**我们需要手动告诉 Netlify 这些密码。**

1.  在 Netlify 的站点概览页面，点击 **"Site configuration"** (或 Settings)。
2.  在左侧菜单找到 **"Environment variables"**。
3.  点击 **"Add a variable"** -> **"Add a single variable"**。
4.  依次添加您本地 `.env` 文件里的 4 个变量：

| Key (键) | Value (值) - *填您真实的值* |
| :--- | :--- |
| `GITHUB_TOKEN` | `ghp_xxxxxxxx...` |
| `GIST_ID` | `xxxxxxxx...` |
| `BAIDU_API_KEY` | `xxxxxxxx...` |
| `BAIDU_SECRET_KEY` | `xxxxxxxx...` |

5.  添加完成后，需要**重新触发一次部署**才能生效：
    *   点击顶部的 **"Deploys"**。
    *   点击 **"Trigger deploy"** -> **"Deploy site"**。

---

### 第五步：大功告成！

等待部署状态变成 **Published** (绿色)，点击 Netlify 提供的链接（例如 `https://true-mastery-xxxx.netlify.app`）。

**现在测试一下：**
1.  **同步**：点击同步按钮，应该能成功拉取 Gist 数据。
2.  **朗读**：点击朗读，应该能听到声音（如果开启了百度优先，会调用百度接口）。

🎉 **恭喜！您现在拥有了一个属于自己的、永久免费托管的、数据云同步的背单词应用！** 您可以将这个链接发到手机上，随时随地开始学习。