# 光鸭云盘磁力播放助手

一个 Tampermonkey/Greasemonkey 用户脚本，用于在网页中识别 `magnet` 链接，调用光鸭云盘解析并保存资源，再使用 ArtPlayer 播放。

## 功能

- 自动识别页面中的磁力链接，并追加“光鸭播放”按钮。
- 支持手动输入磁力链接解析。
- 支持选择 BT 子文件、搜索和按类型筛选。
- 支持保存后在线播放、选集、复制/打开播放地址。
- 支持从光鸭官网同步认证，并使用 `refresh_token` 刷新 `access_token`。
- 保存/等待云添加阶段可退出并取消云添加任务。

## 文件说明

- `guangyapan_magnet_player.user.js`：用户脚本入口、元信息、全局配置和启动逻辑。
- `gyp-auth-api.js`：认证同步、Token 刷新、接口请求、云添加和文件读取流程。
- `gyp-magnet.js`：磁力链接识别、页面扫描和内联按钮注入。
- `gyp-dialogs.js`：弹窗、设置面板、解析选择面板、Toast 和样式。
- `gyp-player.js`：ArtPlayer 播放器、选集列表和播放资源清理。
- `光鸭云盘-interfaces.md`：已整理的光鸭云盘接口文档。

## 使用方式

1. 安装 Tampermonkey 或兼容的用户脚本管理器。
2. 安装 `guangyapan_magnet_player.user.js`。
3. 打开并登录 `https://www.guangyapan.com`。
4. 在脚本菜单中执行“同步官网认证”，或打开“配置认证”手动配置。
5. 在任意网页点击磁力链接或“光鸭播放”按钮。

## 发布注意

- 修改脚本后需要同步更新 `guangyapan_magnet_player.user.js` 中的 `@version`。
- 远程模块通过 `@require ...?v=<version>` 加载，发布时也要同步更新缓存参数。
- 不要把真实 token、refresh token 或账号私密信息提交到仓库。

## 开发检查

```bash
node --check guangyapan_magnet_player.user.js
node --check gyp-auth-api.js
node --check gyp-magnet.js
node --check gyp-dialogs.js
node --check gyp-player.js
```
