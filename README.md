# 飞书妙记导出 Markdown

一个油猴脚本（Userscript），把**飞书妙记**（Feishu Minutes / Lark Minutes）一键导出为 **Markdown**：复制到剪贴板，或下载 `.md` 文件。

导出内容默认依次包含已有的会议纪要、待办、章节纪要和完整文字记录。文字记录按说话人聚合并保留时间戳；纯前端运行，**不上传任何数据**。

---

## 🚀 一键安装

**前置条件**：先在浏览器里装一个用户脚本管理器（任选其一）：

- [Tampermonkey](https://www.tampermonkey.net/)（推荐，Chrome / Edge / Firefox / Safari）
- [Violentmonkey](https://violentmonkey.github.io/)
- [ScriptCat 脚本猫](https://scriptcat.org/)

然后点下面的链接，管理器会自动弹出安装页：

👉 **[点击安装 feishu-minutes-export.user.js](https://raw.githubusercontent.com/Icy-Cat/feishu-minutes-export/main/feishu-minutes-export.user.js)**

> 如果浏览器把它当成普通文件下载了，说明用户脚本管理器没装好或被禁用了——检查浏览器扩展页面，确认管理器已启用。

---

## 📖 使用方法

1. 打开任意一条飞书妙记，例如 `https://xxx.feishu.cn/minutes/<token>`
2. 等页面加载完，**右下角**会出现一个白色卡片：

   <img src="docs/screenshot-panel-closeup.png" width="220" alt="悬浮面板特写" />

3. 点 **复制 Markdown** 直接粘贴到笔记里；或点 **下载 .md** 保存为本地文件。

### 输出示例

```markdown
# 项目周会纪要

## 会议纪要

- **本周进展**
  - 核心链路已经打通，下周开始压测。

## 待办

- [ ] [09:09] 确认上游接口的限流策略 @李四

## 章节纪要

### [00:00] 项目进展与风险

团队同步了当前进展，并确认了下一阶段的风险项。

## 文字记录

### 张三
- [00:00] 这周主要进展是把核心链路打通了，下周开始压测…
- [00:30] 风险点是上游接口的限流策略还没确认…

### 李四
- [09:09] 关于压测，我建议先在预发环境跑一轮…
```

---

## ⚙️ 工作原理

脚本在导出时读取当前妙记的数据：

1. 从页面初始化数据和已渲染的编辑器内容中读取会议纪要、待办与章节纪要；不存在的栏目自动省略。
2. 用 URL 里的 `object_token` 调用飞书同源接口，完整读取字幕和说话人数据（`paragraph-ids` → `subtitles_v2?size=total` → `speakers`）。
3. 如果字幕仍在分页或生成中，脚本会停止导出并提示刷新重试，避免生成缺失内容的文件。

最终按「会议纪要 → 待办 → 章节纪要 → 文字记录」组装文档。文字记录用 `paragraph_to_speaker` 和 `speaker_info_map` 找到说话人，每段保留时间戳。

---

## 🔒 隐私

- 脚本只在 `*.feishu.cn/minutes/*` 和 `*.larksuite.com/minutes/*` 路径下运行
- **零外部请求**：所有数据来自飞书自家接口，不向第三方发送任何东西
- 复制 / 下载都在本地完成

---

## 🛠 兼容性

- 你能正常访问、能看到字幕的妙记 → 都能导出
- 没有妙记权限、字幕还在生成中 → 会显示对应的 HTTP、空数据或未完整加载提示
- 仅 `*.feishu.cn`（中国版）和 `*.larksuite.com`（国际版 Lark）

---

## 🐞 问题排查

| 现象 | 处理 |
| --- | --- |
| 看不到右下角卡片 | 检查管理器是否启用；F12 看 Console 有没有报错；妙记页面是不是详情页（不是列表页） |
| 点击没反应 | 第一次会调接口拉数据，看网络面板；接口失败会 toast 报错 |
| 导出内容不全 | 妙记本身字幕没生成完——刷新等一下再试 |
| 导出乱码 | 应该不会有，文件是 UTF-8；如果出现请提 issue |

---

## 🧑‍💻 本地开发

直接编辑 `feishu-minutes-export.user.js`，在 Tampermonkey 里点「**从 URL 安装**」填本地路径，或把内容贴进新建脚本。改完保存即生效，刷新妙记页面就能看到。

调试时可在浏览器网络面板查看 `/minutes/api/` 请求，并在真实妙记页面验证生成的 Markdown。

---

## 📜 License

MIT
