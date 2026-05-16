# 光鸭云盘已知接口整理

> 来源：当前浏览器页面 `https://www.guangyapan.com/#/home/all` 的运行时网络请求与前端打包文件 `static/js/index.b3cc0716.js` 反查。
> 说明：以下为前端已暴露和只读验证过的接口信息；删除、移动、上传、分享等会改变账号数据的接口仅做静态分析，未实际触发。

## 1. 基础信息

- 站点：`https://www.guangyapan.com`
- 账号域：`https://account.guangyapan.com`
- 业务 API：`https://api.guangyapan.com`
- 支付域：`https://paycenter.guangyapan.com`
- 当前页面：`/#/home/all`
- 前端入口：`/static/js/index.b3cc0716.js`

## 2. 认证与公共请求

- 业务接口主要使用 `POST`。
- 请求体默认为 JSON，上传种子解析接口使用 `multipart/form-data`。
- 前端请求封装会自动设置：
  - `Content-Type: application/json`
  - `Authorization: Bearer <access_token>`
  - `dt: 4`
  - `did: <device id>`
  - `traceparent: 00-<trace id>-<span id>-01`
- 认证 token 来自前端登录 SDK，不应写入脚本或文档。
- 业务返回成功判断：`code` 为空或 `0` 视为成功，`msg` 为服务端消息，`data` 为业务数据。

### 2.1 刷新 Access Token

- `POST https://account.guangyapan.com/v1/auth/token`
- 用途：使用 `refresh_token` 刷新业务接口所需的 `access_token`。
- 请求域名：账号域 `account.guangyapan.com`，不是业务 API 域 `api.guangyapan.com`。
- 请求体：

```json
{
  "client_id": "客户端 id",
  "grant_type": "refresh_token",
  "refresh_token": "刷新凭证"
}
```

- 额外请求头：

```text
x-action: 401
x-client-id: <client_id>
```

- 通用请求头仍包含：
  - `Content-Type: application/json`
  - `Origin: https://www.guangyapan.com`
  - `Referer: https://www.guangyapan.com/#/transfer/cloud`
  - `dt: 4`
  - `traceparent: 00-<trace id>-<span id>-01`
- 返回字段兼容两种结构，前端/脚本读取：
  - `access_token` / `accessToken`
  - `refresh_token` / `refreshToken`
  - `token_type` / `tokenType`
  - `expires_in` / `expiresIn`
  - `expires_at` / `expiresAt`
  - 或上述字段位于 `data` 内。
- 刷新成功后，后续业务接口继续使用：

```text
Authorization: Bearer <access_token>
```

- 备注：`refresh_token` 通常来自登录 SDK 写入的本地 credentials，不应写入文档或脚本源码。

## 3. 类型与排序字段

### 3.1 文件类型 `fileTypes`

```text
UNKNOWN=0
IMAGE=1
VIDEO=2
AUDIO=3
DOCUMENT=4
ARCHIVE=5
SUBTITLE=6
FONT=7
INSTALLER=8
TORRENT=9
CODE=10
OTHER=11
```

### 3.2 资源类型 `resType`

- `1`：文件
- `2`：文件夹

### 3.3 列表排序字段

全部文件页：

```text
0 文件名
1 文件大小
2 创建时间
3 修改时间
4 文件类型
```

回收站页：

```text
10 文件名
11 保留时间
12 删除时间
13 文件大小
14 文件类型
```

`sortType` 从前端使用方式看为升降序标记，当前默认常见值为 `1`。

## 4. 文件列表与检索

### 4.1 全部文件列表

- `POST /userres/v1/file/get_file_list`
- 用途：获取目录文件列表。
- 当前根目录实际请求体：

```json
{
  "parentId": "",
  "pageSize": 100,
  "orderBy": 3,
  "sortType": 1,
  "fileTypes": []
}
```

- 分页由通用查询封装补 `page` 字段；首次请求可能不带 `page`。
- 返回体前端读取：`data.list`、`data.total`。
- 只读验证结果：当前账号根目录返回 `{"msg":"success","data":{}}`，页面也显示空目录。

### 4.2 分类列表

- `POST /userres/v1/file/get_file_list`
- 用途：视频、图片、文档等分类页。
- 视频页请求体：

```json
{
  "parentId": "*",
  "pageSize": 100,
  "fileTypes": [2],
  "orderBy": 3,
  "sortType": 1,
  "resType": 1,
  "needPlayRecord": true
}
```

- 图片页请求体：

```json
{
  "parentId": "*",
  "pageSize": 100,
  "fileTypes": [1],
  "orderBy": 3,
  "sortType": 1,
  "resType": 1
}
```

- 文档页请求体：

```json
{
  "parentId": "*",
  "pageSize": 100,
  "fileTypes": [4],
  "orderBy": 3,
  "sortType": 1,
  "resType": 1
}
```

### 4.3 文件夹树/仅目录列表

- `POST /userres/v1/file/get_file_list`
- 用途：复制到、移动到、保存到等目录选择器。
- 请求体：

```json
{
  "page": 0,
  "pageSize": 100,
  "parentId": "父目录 fileId，根目录为空字符串",
  "resType": 2,
  "needSubFolderStat": true
}
```

### 4.4 搜索云盘文件

- `POST /userres/v1/file/search_files`
- 用途：搜索当前账号文件。
- 前端请求体：

```json
{
  "page": 0,
  "pageSize": 8,
  "name": "关键词"
}
```

- 分享页搜索使用另一个接口：`POST /userres/v1/share_page_search_files`。

### 4.5 最近文件

- `POST /userres/v1/get_user_action`
- 用途：最近查看/最近操作。
- 当前页面实际请求体：

```json
{
  "cursor": "",
  "pageSize": 100
}
```

- 首页卡片实际请求体：

```json
{
  "pageSize": 2,
  "cursor": "",
  "fileTypes": [2]
}
```

```json
{
  "pageSize": 2,
  "cursor": "",
  "excludeFileTypes": [2]
}
```

### 4.6 最近转存/还原列表

- `POST /userres/v1/get_restore_list`
- 当前首页卡片实际请求体：

```json
{
  "pageSize": 4,
  "cursor": 0,
  "orderBy": 2,
  "sortType": 1
}
```

## 5. 文件详情、打开与下载

### 5.1 文件详情

- `POST /userres/v1/file/get_file_detail`
- 用途：打开文件、查看详情、定位父目录、获取视频资源等。
- 请求体：

```json
{
  "fileId": "文件 fileId"
}
```

- 前端读取字段：
  - `data.fileInfo`
  - `data.location`
  - `data.videoResource`

### 5.2 按文件 ID 获取信息

- `POST /userres/v1/file/get_info_by_file_id`
- 用途：云添加任务完成后通过 `fileId` 打开资源。
- 请求体：

```json
{
  "fileId": "文件 fileId"
}
```

### 5.3 获取普通下载地址

- `POST /userres/v1/get_res_download_url`
- 用途：单文件直接下载、图片预览、音频播放、种子文件下载。
- 请求体：

```json
{
  "fileId": "文件 fileId"
}
```

- 前端读取字段：
  - `data.signedURL`
  - `data.requestId`

### 5.4 获取视频下载/播放地址

- `POST /userres/v1/file/get_vod_download_url`
- 用途：视频播放相关，前端存在封装但当前未触发验证。
- 请求体由前端透传，静态代码未进一步展开到具体字段。

### 5.5 多文件打包下载

- `POST /scheduler/v1/create_packaging_task`
- 用途：多选下载时创建打包任务。
- 请求体：

```json
{
  "fileIds": ["文件 fileId"]
}
```

- 分享页下载可额外带：

```json
{
  "fileIds": ["文件 fileId"],
  "accessToken": "分享访问 token",
  "orderId": "可选订单 id"
}
```

### 5.6 查询打包任务

- `POST /scheduler/v1/query_packaging_task`
- 用途：轮询打包任务，直到返回下载地址。
- 请求体：

```json
{
  "taskId": "打包任务 id",
  "accessToken": "分享访问 token，可选"
}
```

- 前端读取：`data.signedURL`。

## 6. 文件管理操作

以下接口会改变账号数据，仅做静态分析，未实际调用。

### 6.1 新建文件夹

- `POST /userres/v1/file/create_dir`
- 请求体：

```json
{
  "parentId": "父目录 fileId，根目录为空字符串",
  "dirName": "文件夹名",
  "failIfNameExist": true
}
```

- 前端允许业务码：`159`。
- 返回体前端读取：`data.fileId`。

### 6.2 重命名

- `POST /userres/v1/file/rename`
- 请求体：

```json
{
  "fileId": "文件或文件夹 fileId",
  "newName": "新名称"
}
```

### 6.3 删除/彻底删除

- `POST /userres/v1/file/delete_file`
- 请求体：

```json
{
  "fileIds": ["文件或文件夹 fileId"]
}
```

- 返回体前端读取：`data.taskId`，再轮询任务状态。

### 6.4 还原回收站文件

- `POST /userres/v1/file/recycle_file`
- 请求体：

```json
{
  "fileIds": ["文件或文件夹 fileId"]
}
```

### 6.5 清空回收站

- `POST /userres/v1/file/clear_recycle_bin`
- 前端调用未传请求体。
- 返回体前端读取：`data.taskId`。

### 6.6 移动

- `POST /userres/v1/file/move_file`
- 请求体：

```json
{
  "fileIds": ["文件或文件夹 fileId"],
  "parentId": "目标文件夹 fileId"
}
```

### 6.7 复制

- `POST /userres/v1/file/copy_file`
- 请求体：

```json
{
  "fileIds": ["文件或文件夹 fileId"],
  "parentId": "目标文件夹 fileId"
}
```

### 6.8 查询异步任务状态

- `POST /userres/v1/get_task_status`
- 用途：删除、复制、移动、分享转存等异步任务状态轮询。
- 请求体由前端透传，常见字段为：

```json
{
  "taskId": "任务 id"
}
```

## 7. 上传流程

上传不是直接把文件传给 `api.guangyapan.com`，而是先向业务 API 申请资源中心 token/任务，再使用返回的对象存储参数上传，最后轮询任务完成。

### 7.1 创建上传任务/获取对象存储参数

- `POST /userres/v1/get_res_center_token`
- 请求体：

```json
{
  "capacity": 2,
  "name": "文件名",
  "res": {
    "fileSize": 123456,
    "md5": "小文件可带 md5，可选"
  },
  "parentId": "目标文件夹 fileId"
}
```

- 前端额外设置头：`dt: 4`。
- 前端允许业务码：`156`，该码表示可走秒传/快速完成分支。
- 返回体前端读取字段：
  - `data.taskId`
  - `data.region`
  - `data.bucketName`
  - `data.endPoint`
  - `data.objectPath`
  - `data.provider`
  - `data.creds.accessKeyID`
  - `data.creds.secretAccessKey`
  - `data.creds.sessionToken`
  - `data.creds.expiration`

### 7.2 续传刷新 token

- `POST /userres/v1/get_res_center_resume_token`
- 请求体：

```json
{
  "capacity": 2,
  "res": {
    "fileSize": 123456
  },
  "taskId": "上传任务 id",
  "object": {
    "objectPath": "对象存储路径",
    "provider": "对象存储 provider"
  }
}
```

### 7.3 秒传检查

- `POST /userres/v1/check_can_flash_upload`
- 请求体：

```json
{
  "taskId": "上传任务 id",
  "gcid": "前端 Worker 计算的文件 gcid"
}
```

- 前端读取字段：
  - `data.canFlashUpload`
  - `data.taskId`

### 7.4 对象存储分片上传

- 前端使用对象存储 SDK 创建客户端：

```text
region = data.region
bucket = data.bucketName
endpoint = data.endPoint
accessKeyId = data.creds.accessKeyID
accessKeySecret = data.creds.secretAccessKey
stsToken = data.creds.sessionToken
```

- 上传调用：`client.multipartUpload(data.objectPath, file, { checkpoint, partSize, timeout, progress })`。
- 分片大小前端按文件大小选择：
  - 小于等于 `100MiB`：`1MiB`
  - 小于等于 `1GiB`：`2MiB`
  - 小于等于 `10GiB`：`4MiB`
  - 更大：`8MiB`
- 上传完成后轮询 `POST /userres/v1/file/get_info_by_task_id`。

### 7.5 查询上传完成结果

- `POST /userres/v1/file/get_info_by_task_id`
- 请求体：

```json
{
  "taskId": "上传任务 id"
}
```

- 前端允许业务码：`145`、`146`、`155`、`163`。
- 成功后前端读取：`data.fileId`，并生成 `pan://file?id=<fileId>`。

### 7.6 删除上传任务

- `POST /userres/v1/file/delete_upload_task`
- 请求体：

```json
{
  "taskIds": ["上传任务 id"]
}
```

### 7.7 上传任务统计

- `POST /userres/v1/query_uploading_tasks_stat`
- 前端无请求体。
- 只读验证结果：当前返回 `{"msg":"success","data":{}}`。

### 7.8 清理上传任务

- `POST /userres/v1/detete_uploading_tasks`
- 注意：前端接口名中为 `detete`，不是 `delete`。
- 前端无请求体。

## 8. 云添加

### 8.1 解析链接资源

- `POST /cloudcollection/v1/resolve_res`
- 用途：把用户输入的 URL / magnet / ed2k 解析为可选资源。
- 请求体：

```json
{
  "url": "下载链接或 magnet"
}
```

- 前端读取字段：
  - `data.resType`
  - `data.btResInfo`
  - `data.urlResInfo`
  - `data.emuleResInfo`
  - `data.url`

### 8.2 解析 BT 种子

- `POST /cloudcollection/v1/resolve_torrent`
- Content-Type：`multipart/form-data`
- 表单字段：
  - `torrent`: `.torrent` 文件
- 成功后前端把 `data.btResInfo.infoHash` 转成：

```text
magnet:?xt=urn:btih:<infoHash>
```

### 8.3 创建云添加任务

- `POST /cloudcollection/v1/create_task`
- 单链接请求体：

```json
{
  "url": "下载链接或 magnet",
  "parentId": "保存目录 fileId",
  "newName": "可选的新名称"
}
```

- BT 子文件选择请求体：

```json
{
  "fileIndexes": [0, 1],
  "url": "magnet 或原始链接",
  "parentId": "保存目录 fileId",
  "newName": "可选的新名称"
}
```

- 返回体前端读取：`data.taskId`。

### 8.4 查询云添加任务

- `POST /cloudcollection/v1/list_task`
- 用途：列表页与任务轮询。
- 目前已确认的请求体有三类：

```json
{
  "pageSize": 100,
  "status": [0, 1, 3, 4]
}
```

```json
{
  "pageSize": 100,
  "status": [2, 5]
}
```

```json
{
  "taskIds": ["云添加任务 id"]
}
```

- 状态码：

```text
0 排队中
1 进行中
2 已完成
3 已失败
4 已取消
5 部分已完成
```

- 只读验证返回字段：
  - `statusCounts`
  - `cursor`
  - `list`
  - `total`
- 已确认的任务字段样例：

```json
{
  "taskId": "...",
  "fileName": "...",
  "totalSize": 3654988327,
  "status": 2,
  "createTime": 1778846001,
  "res": "magnet:?xt=urn:btih:...",
  "resType": 1,
  "progress": 80,
  "fileId": "...",
  "isDir": true
}
```

- 前端行操作：
  - `复制`：复制 `res`
  - `打开文件夹`：仅 `已完成 / 部分已完成` 可见，使用 `fileId`
  - `重试`：`已失败 / 已取消 / 部分已完成` 可见
  - `删除`：所有任务可见
- 页签级操作：
  - 进行中：`全部刷新`、`全部重试`、`全部取消`
  - 已完成：`全部刷新`、`清空全部记录`；有选中项时显示 `清空记录`

### 8.5 删除云添加任务

- `POST /cloudcollection/v2/delete_task`
- 前端请求体存在两种形式：

```json
{
  "status": [0, 1, 3, 4]
}
```

```json
{
  "taskIds": ["云添加任务 id"]
}
```

- 另一个批量分支用于已完成任务：

```json
{
  "status": [2, 5]
}
```

### 8.6 重试云添加任务

- `POST /cloudcollection/v2/retry_task`
- 前端请求体存在两种形式：

```json
{
  "status": [0, 1, 3, 4]
}
```

```json
{
  "taskIds": ["云添加任务 id"]
}
```

### 8.7 磁力到下载链接完整链路

> 这是目前按前端代码和只读验证拼出的完整路径。这里不使用直链，只走普通下载链接。

1. 解析磁力或普通链接：

```http
POST /cloudcollection/v1/resolve_res
```

```json
{
  "url": "magnet:?xt=urn:btih:..."
}
```

2. 若是 `.torrent` 文件，先解析种子：

```http
POST /cloudcollection/v1/resolve_torrent
```

返回的 `data.btResInfo.infoHash` 会被拼成：

```text
magnet:?xt=urn:btih:<infoHash>
```

3. 创建云添加任务：

```http
POST /cloudcollection/v1/create_task
```

单链接请求体：

```json
{
  "url": "下载链接或 magnet",
  "parentId": "保存目录 fileId",
  "newName": "可选的新名称"
}
```

BT 选择子文件时额外传：

```json
{
  "fileIndexes": [0, 1],
  "url": "magnet 或原始链接",
  "parentId": "保存目录 fileId",
  "newName": "可选的新名称"
}
```

4. 轮询任务状态：

```http
POST /cloudcollection/v1/list_task
```

已完成/部分完成任务会返回 `fileId`，并在文件列表里落到一个“来自：云添加”的顶层目录下。

5. 进入任务结果目录：

```http
POST /userres/v1/file/get_info_by_file_id
POST /userres/v1/file/get_file_detail
POST /userres/v1/file/get_file_list
```

已验证样例里：

- 顶层目录：`来自：云添加`
- 任务目录：云添加返回的 `fileId`
- 最终文件：目录内的实际媒体文件

6. 对最终文件获取普通下载链接：

```http
POST /userres/v1/get_res_download_url
```

```json
{
  "fileId": "最终文件 fileId"
}
```

前端读取 `data.signedURL` 和 `data.requestId`，其中 `signedURL` 就是普通下载链接。

当前账号只读验证结果：对样例文件调用 `get_res_download_url` 返回 `code:101`、`msg:"服务器内部错误，请稍后重试"`，未拿到 `signedURL`。

## 9. 分享与直链

### 9.1 创建分享

- `POST /userres/v1/share_file`
- 单文件播放页请求体示例：

```json
{
  "fileIds": ["文件 fileId"],
  "title": "分享标题",
  "validateDuration": 0,
  "shareType": 0,
  "downloadType": 1,
  "maxRestoreCount": 0
}
```

- 返回体前端读取：
  - `data.shareUrl`
  - `data.code`
  - `data.shareId`

### 9.2 更新分享

- `POST /userres/v1/update_share`
- 请求体为创建分享参数加：

```json
{
  "id": "分享记录 id"
}
```

### 9.3 删除分享

- `POST /userres/v1/delete_share`
- 请求体：

```json
{
  "ids": ["分享记录 id"]
}
```

### 9.4 分享列表

- `POST /userres/v1/get_share_list`
- 常见请求体：

```json
{
  "page": 0,
  "pageSize": 20
}
```

### 9.5 分享页摘要

- `POST /userres/v1/get_share_summary`
- 前端允许业务码：`200`、`201`、`202`。

### 9.6 获取分享访问 token

- `POST /userres/v1/get_share_access_token`

### 9.7 分享页文件列表

- `POST /userres/v1/get_share_page_files_list`
- 使用 cursor 分页。

### 9.8 分享页下载单文件

- `POST /userres/v1/get_share_download_url`
- 请求体：

```json
{
  "fileId": "分享内文件 fileId",
  "accessToken": "分享访问 token",
  "orderId": "可选订单 id"
}
```

- 前端允许业务码：`205`、`206`、`207`、`504`，这些码会进入付费/限额处理。
- 成功后前端读取：`data.downloadUrl`。

### 9.9 转存分享

- `POST /userres/v1/restore_share`
- 请求体：

```json
{
  "accessToken": "分享访问 token",
  "fileIds": ["分享内文件 fileId"],
  "parentId": "保存目录 fileId"
}
```

### 9.10 开启直链空间

- `POST /userres/v1/set_direct_link`
- 用途：把一个顶层目录启用为直链空间。前端菜单仅在 `parentId` 为空且 `resType=2` 的目录上展示。
- 请求体：

```json
{
  "fileId": "文件 fileId"
}
```

### 9.11 取消直链空间

- `POST /userres/v1/unset_direct_link`
- 请求体：

```json
{
  "fileId": "文件 fileId"
}
```

### 9.12 获取直链

- `POST /userres/v1/get_direct_link`
- 用途：获取直链空间内文件的短链或长链。前端菜单仅在 `resType=1` 且 `dirType=5` 的文件上展示。
- 请求体：

```json
{
  "fileId": "文件 fileId",
  "shortLink": true
}
```

- 前端读取：`data.directLink`。
- `shortLink: true` 返回短链，`shortLink: false` 返回长链。
- 当前账号只读验证：对普通目录内云添加结果调用返回 `code:248`、`msg:"会员专属功能"`，说明直链为会员/权限受限功能。

## 10. 压缩包在线解压

### 10.1 获取压缩包文件列表

- `POST /userres/v1/get_compress_file_list`
- 前端允许业务码：`300`，需要密码时弹窗重试。
- 常见请求体：

```json
{
  "fileId": "压缩包 fileId",
  "pageSize": 100,
  "password": "可选密码",
  "fullPath": "可选压缩包内路径"
}
```

### 10.2 创建解压任务

- `POST /userres/v1/decompress_files`
- 前端允许业务码：`300`。
- 请求体：

```json
{
  "fileId": "压缩包 fileId",
  "password": "可选密码",
  "filePaths": ["压缩包内路径"],
  "toFileId": "解压目标目录 fileId"
}
```

### 10.3 查询解压状态

- `POST /userres/v1/query_decompress_status`
- 请求体：

```json
{
  "taskId": "解压任务 id"
}
```

## 11. 账号资产与辅助接口

### 11.1 资产信息

- `POST /assets/v1/get_assets`
- 只读验证返回字段示例：

```json
{
  "msg": "success",
  "data": {
    "totalSpaceSize": 2199023255552,
    "vipStatus": 3,
    "vipLeftTime": 721237,
    "svipStatus": 1,
    "vipExpireTime": 1778124399,
    "systemTime": 1778845636
  }
}
```

### 11.2 全局配置

- `POST /misc/v1/get_global_config`

### 11.3 Banner 列表

- `POST /misc/v1/get_banner_list`
- 当前页面实际请求体：

```json
{
  "position": 1
}
```

### 11.4 下载记录

- `POST /assets/v1/get_download_records`
- 静态代码存在封装；只读尝试使用 `page/pageSize` 返回 `code:112` 参数错误，说明参数结构还需继续从页面触发或反查。

### 11.5 流量购买记录

- `POST /assets/v1/get_traffic_purchase_history`

### 11.6 流量统计

- `POST /assets/v1/get_traffic_statistics`

## 12. 已枚举接口清单

### 12.0 账号认证

- `POST https://account.guangyapan.com/v1/auth/token`

### 12.1 文件与任务

- `POST /userres/v1/file/get_file_list`
- `POST /userres/v1/file/get_file_page_data`
- `POST /userres/v1/file/get_file_detail`
- `POST /userres/v1/file/get_info_by_file_id`
- `POST /userres/v1/file/get_info_by_task_id`
- `POST /userres/v1/file/get_vod_download_url`
- `POST /userres/v1/file/create_dir`
- `POST /userres/v1/file/rename`
- `POST /userres/v1/file/delete_file`
- `POST /userres/v1/file/recycle_file`
- `POST /userres/v1/file/move_file`
- `POST /userres/v1/file/copy_file`
- `POST /userres/v1/file/delete_upload_task`
- `POST /userres/v1/file/clear_recycle_bin`
- `POST /userres/v1/file/search_files`
- `POST /userres/v1/get_res_center_token`
- `POST /userres/v1/get_res_center_resume_token`
- `POST /userres/v1/get_res_download_url`
- `POST /userres/v1/check_can_flash_upload`
- `POST /userres/v1/query_uploading_tasks_stat`
- `POST /userres/v1/detete_uploading_tasks`
- `POST /userres/v1/get_task_status`
- `POST /scheduler/v1/create_packaging_task`
- `POST /scheduler/v1/query_packaging_task`

### 12.2 云添加

- `POST /cloudcollection/v1/resolve_res`
- `POST /cloudcollection/v1/resolve_torrent`
- `POST /cloudcollection/v1/create_task`
- `POST /cloudcollection/v1/list_task`
- `POST /cloudcollection/v2/delete_task`
- `POST /cloudcollection/v2/retry_task`

### 12.3 分享与直链

- `POST /userres/v1/share_file`
- `POST /userres/v1/update_share`
- `POST /userres/v1/delete_share`
- `POST /userres/v1/get_share_list`
- `POST /userres/v1/get_share_summary`
- `POST /userres/v1/get_share_access_token`
- `POST /userres/v1/get_share_page_files_list`
- `POST /userres/v1/share_page_search_files`
- `POST /userres/v1/get_share_files_size`
- `POST /userres/v1/get_share_download_url`
- `POST /userres/v1/restore_share`
- `POST /userres/v1/set_direct_link`
- `POST /userres/v1/unset_direct_link`
- `POST /userres/v1/get_direct_link`

### 12.4 解压、播放与行为

- `POST /userres/v1/get_compress_file_list`
- `POST /userres/v1/decompress_files`
- `POST /userres/v1/query_decompress_status`
- `POST /userres/v1/get_play_record`
- `POST /userres/v1/report_play_record`
- `POST /userres/v1/report_action`
- `POST /userres/v1/get_user_action`
- `POST /userres/v1/get_user_action_detail`
- `POST /userres/v1/delete_user_action`
- `POST /userres/v1/get_restore_list`

### 12.5 资产、活动与支付

- `POST /assets/v1/get_assets`
- `POST /assets/v1/get_download_records`
- `POST /assets/v1/get_traffic_purchase_history`
- `POST /assets/v1/get_traffic_statistics`
- `POST /misc/v1/get_global_config`
- `POST /misc/v1/get_banner_list`
- `POST /misc/v1/query_client_id_info`
- `POST /misc/v1/anonymous_signup`
- `POST /activity/v1/get_activity`
- `POST /activity/v1/get_invite_link`
- `POST /activity/v1/get_invite_reward_detail`
- `POST /activity/v1/get_invite_install_reward`
- `POST /activity/v1/get_reward_info`
- `POST /activity/v1/get_user_data`
- `POST /activity/v1/set_user_data`
- `POST /activity/v1/get_user_info_by_invite_code`
- `POST /pay/v1/get_product_list`
- `POST /pay/v1/get_order_info`
- `POST /pay/v1/apply_refund`

## 13. 已验证与未验证

### 13.1 已只读验证

- `POST /assets/v1/get_assets`
- `POST /userres/v1/file/get_file_list`
- `POST /userres/v1/file/search_files`
- `POST /userres/v1/get_user_action`
- `POST /userres/v1/get_restore_list`
- `POST /userres/v1/query_uploading_tasks_stat`
- `POST /cloudcollection/v1/list_task`
- `POST /userres/v1/get_share_list`

### 13.2 未触发验证

- 上传、删除、新建文件夹、重命名、复制、移动、分享、直链、云添加创建、解压创建等会改变账号状态的接口。
- 这些接口目前仅来自前端静态代码和调用参数反查。

## 14. 待补充

- 非空目录下 `data.list` 文件对象完整字段样例。
- 上传任务返回的对象存储 provider 与 endpoint 实例。
- `get_download_records` 的正确请求体。
- 分享访问 token 的完整获取参数。
- 各业务错误码的完整含义。
