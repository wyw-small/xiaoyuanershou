# 基于Node.js的校园二手交易与失物招领系统的设计与实现

本项目是软件技术专业毕业设计《基于Node.js的校园二手交易与失物招领系统的设计与实现》配套的可运行原型系统。系统面向校园学生提供二手商品发布、失物招领、信息检索、收藏和管理员内容审核功能，采用 Node.js 原生模块、HTML、CSS 和 JavaScript 实现，不依赖第三方 npm 包。

## 1. 主要功能

- 用户注册、登录与身份验证
- 二手商品发布、检索、分类筛选、收藏和详情查看
- 寻物启事、失物招领信息发布与检索
- “我的发布”状态跟踪
- 管理员待审列表、审核通过/驳回和统计看板
- JSON 文件持久化，首次运行自动生成演示数据
- 内置自动化测试，覆盖密码、令牌、数据存储和主要 API

## 2. 运行环境

- Node.js 18 或更高版本
- Windows、Linux、macOS 均可运行
- 浏览器：Chrome、Edge、Firefox 等现代浏览器

## 3. 启动方式

```bash
cd campus-service-system
node server.js
```

然后访问：`http://127.0.0.1:3000`

初次启动会自动创建演示账号：

| 角色 | 用户名 | 密码 |
|---|---|---|
| 管理员 | `admin` | `Admin1234` |
| 学生 | `demo` | `Demo1234` |

正式使用前请通过环境变量修改管理员密码和签名密钥：

```powershell
$env:APP_SECRET="replace-with-a-long-random-secret"
$env:ADMIN_PASSWORD="YourStrongPassword123"
node server.js
```

## 4. 测试

```bash
node --test
```

测试文件位于 `test/` 目录，测试过程使用临时数据文件，不会修改正式数据。

## 5. 项目结构

```text
campus-service-system/
├─ server.js               HTTP 服务、路由和接口校验
├─ src/auth.js             密码哈希、令牌生成与验证
├─ src/store.js            JSON 数据访问与业务数据维护
├─ public/index.html       单页应用页面结构
├─ public/styles.css       响应式界面样式
├─ public/app.js           前端交互与 API 调用
├─ test/                   自动化测试
├─ docs/接口文档.md         API 说明
└─ docs/数据库设计.md       数据模型与字段说明
```

## 6. 设计说明

系统采用前后端分离思路组织代码，但部署时由同一个 Node.js 进程托管静态页面和 REST API，降低毕业设计演示环境配置成本。前端使用单页应用切换视图，后端使用原生 `http` 模块实现路由，数据通过 `data/store.json` 持久化。

安全方面：

1. 密码使用 `scrypt` 加随机盐哈希，不保存明文密码。
2. 登录令牌由 HMAC-SHA256 签名并设置过期时间。
3. 用户输入在服务端进行长度、类型和取值范围校验。
4. 页面输出使用 HTML 转义，防止基础 XSS 注入。
5. 静态文件路径进行目录边界检查，避免路径穿越。
6. 管理员接口进行角色检查，普通用户不能审核内容。

## 7. 二次开发建议

- 将 JSON 存储替换为 MySQL 或 PostgreSQL，并增加数据库事务。
- 增加图片上传、对象存储和图片压缩功能。
- 增加站内消息、举报、信用评价和违规用户管理。
- 使用 HTTPS、HttpOnly Cookie 和刷新令牌提升会话安全性。
- 增加分页组件、操作日志和更完整的接口自动化测试。