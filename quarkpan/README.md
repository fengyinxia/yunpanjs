# 夸克网盘 HTML5 播放器

一个 Tampermonkey/Greasemonkey 用户脚本，用于在夸克网盘分享页拦截视频文件点击，转存后通过 Video.js 播放，并支持播放列表、画质切换和分享页下载接管。

## 功能

- 自动拦截分享页视频文件点击，弹出 HTML5 播放器。
- 使用夸克播放接口获取多档清晰度，并补充原画下载地址作为画质选项。
- 支持同目录视频列表、上一集/下一集、播放进度和倍速控制。
- 支持接管分享页下载按钮，转存后触发浏览器下载。
- 播放或下载完成后自动清理脚本创建的临时文件。

## 文件说明

- `quarkpan_html5_player.user.js`：用户脚本入口、元信息、远程模块声明和启动逻辑。
- `qkp-core.js`：共享状态、通用工具、下载文件名处理和视频格式判断。
- `qkp-ui.js`：Video.js 样式注入、播放器模态框、Toast 和基础 DOM 事件。
- `qkp-share.js`：分享页文件上下文缓存、分享 ID 监听和页面接口响应拦截。
- `qkp-api.js`：Cookie 初始化、夸克接口请求、转存播放、下载和临时文件清理流程。
- `qkp-player.js`：Video.js 播放器、自定义控制条、播放列表、画质和倍速菜单。
- `qkp-interactions.js`：文件点击、下载按钮点击和动态内容监听。

## 使用方式

1. 安装 Tampermonkey 或兼容的用户脚本管理器。
2. 安装 `quarkpan_html5_player.user.js`。
3. 打开 `https://pan.quark.cn/s/*` 分享页。
4. 点击视频文件即可用脚本播放器播放。

## 发布注意

- 修改脚本后需要同步更新 `quarkpan_html5_player.user.js` 中的 `@version`。
- 远程模块通过 `@require ...?v=<version>` 加载，发布时也要同步更新缓存参数。
- 不要在脚本或文档中写入真实 Cookie、账号信息或私密分享数据。
- `@require` 模块按声明顺序执行，模块文件不要使用 ES Module 的 `import/export`。

## 开发检查

```bash
node --check quarkpan_html5_player.user.js
node --check qkp-core.js
node --check qkp-ui.js
node --check qkp-share.js
node --check qkp-api.js
node --check qkp-player.js
node --check qkp-interactions.js
```
