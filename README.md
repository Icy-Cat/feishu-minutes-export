# 飞书妙记导出 Markdown

一个油猴脚本（Userscript），把**飞书妙记**（Feishu Minutes / Lark Minutes）的字幕文字记录一键导出为 **Markdown**：复制到剪贴板，或下载 `.md` 文件。

按说话人聚合，带时间戳，纯前端运行，**不上传任何数据**。

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

## 张三
- [00:00] 这周主要进展是把核心链路打通了，下周开始压测…
- [00:30] 风险点是上游接口的限流策略还没确认…

## 李四
- [09:09] 关于压测，我建议先在预发环境跑一轮…
```

---

## ⚙️ 工作原理

脚本通过两条路径拿到字幕：

1. **拦截网络请求**：劫持 `window.fetch` 和 `XMLHttpRequest`，缓存以下接口的响应：
   - `/minutes/api/subtitles_v2` — 字幕段落 + 句子 + 字
   - `/minutes/api/speakers` — 说话人映射
2. **主动兜底**：如果你打开页面前没刷新，缓存为空时，脚本会用 URL 里的 `object_token` 直接调一次接口（`paragraph-ids` → `subtitles_v2?size=total` → `speakers`）。

格式化逻辑：按段落 → 用 `paragraph_to_speaker` + `speaker_info_map` 找到说话人 → 同一说话人连续段落合并到一个 `## 名字` 下，每段一个时间戳列表项。

---

## 🔒 隐私

- 脚本只在 `*.feishu.cn/minutes/*` 和 `*.larksuite.com/minutes/*` 路径下运行
- **零外部请求**：所有数据来自飞书自家接口，不向第三方发送任何东西
- 复制 / 下载都在本地完成

---

## 🛠 兼容性

- 你能正常访问、能看到字幕的妙记 → 都能导出
- 没有妙记权限、字幕还在生成中 → 接口 401 / 数据为空，会提示「字幕数据未抓到」
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

调试建议：

- 在 Console 里直接读 `window.__lastSubtitles` / `__lastSpeakers`（如需可自行加全局赋值）
- 用 [Playwright MCP](https://github.com/microsoft/playwright-mcp) / bb-browser 自动化抓接口验证 schema

---

## 📜 License

MIT
