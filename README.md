# 贷后管理智能体项目 - 前端

## 项目简介

本项目是贷后管理智能体项目的前端应用，提供报告查看、客户管理、数据源配置、知识库管理等功能的 Web 界面。

系统采用三栏式报告展示布局，支持：
- 贷后管理报告的生成、查看、导出
- 客户基本信息的 CRUD 管理
- 数据采集器和解析器的动态配置
- 风险判定规则和场景标签的管理（场景完整 CRUD、规则标签联动场景下拉、Tab 切换；行业/产品/风险类型标签预留）
- 通过 Know-Kit 智能体触发分析和报告生成

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| React | 18.x | UI框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 8.x | 构建工具 |
| Ant Design | 5.x | UI组件库 |
| React Router | 6.x | 路由管理 |
| Zustand | 5.x | 轻量状态管理 |
| Axios | 1.x | HTTP请求 |
| Day.js | 1.x | 日期处理 |

## 架构思路

### 页面布局

```
+----------+------------------------------+----------+
| 侧边导航  |          内容区               |          |
|          |                              |          |
| .报告管理 |   根据路由切换页面:             |          |
| .客户管理 |                              |          |
| .数据配置 |   ReportList   报告列表        |          |
| .知识库   |   ReportView   报告查看        |          |
|          |   ReportCreate 报告生成        |          |
|          |   CustomerList 客户管理        |          |
|          |   DataConfig   数据源配置      |          |
|          |   RuleList     知识库管理      |          |
+----------+------------------------------+----------+
```

### 路由设计

| 路由 | 页面 | 说明 |
|------|------|------|
| `/login` | Login | 登录页（账号密码认证，JWT Token） |
| `/reports` | ReportList | 报告列表，支持查看/删除 |
| `/report/:id` | ReportView | 报告详情，三栏式布局 |
| `/report-create` | ReportCreate | 选择客户，一键生成报告 |
| `/customers` | CustomerList | 客户CRUD管理 |
| `/data-config` | DataConfig | 采集器/解析器配置 |
| `/rules` | RuleList | 知识库管理（规则/场景 Tab + 条件/标签 CRUD，标签仅作分类属性） |
| `/users` | UserList | 用户管理（仅管理员） |
| `/roles` | RoleList | 角色管理（仅管理员） |

### 数据流

```
用户操作 --> 页面组件 --> API模块(axios) --> 后端 POST /api/report/create?customerId=1（一键采集+分析+生成）
                                                  |
                                            后端内部串联:
                                              ① DataCollectService 遍历启用采集器，按客户采集
                                              ② KnowKitService 加载所有启用规则 + Mock 分析
                                              ③ ReportService 生成 H5 HTML
                                                  |
                                            报告HTML --> ReportView渲染
```

### 状态管理策略

- **全局状态**（当前客户、当前报告）：使用 Zustand store
- **页面级数据**（列表数据、表单数据）：使用 React useState
- **服务端数据缓存**：由 API 模块直接返回，组件内管理 loading/error 状态

### 报告查看页设计

报告查看页是核心页面，设计为三栏布局：

- **左栏**：报告目录导航，锚点链接到各章节，支持"只看有动态模块"筛选
- **中间**：报告正文，15个章节卡片，包含风险洞察、财务分析、司法信息等
- **右栏**：侧边栏，展示溯源数据、深度分析、知识单元等辅助信息

交互设计参考产品原型 `技术架构/贷后管理报告.html`：
- 每个章节支持"查看溯源信息"和"深度分析"
- 右键菜单：查看溯源、人工填写、修改文段
- 目录滚动高亮
- 侧边栏折叠/全屏切换
- 支持下载 Word

## 项目结构

```
bosz-agent-frontend/
├── index.html
├── package.json
├── vite.config.ts
└── src/
    ├── main.tsx                     # 应用入口
    ├── App.tsx                      # 根组件（ConfigProvider + Router）
    ├── index.css                    # 全局样式
    ├── types/
    │   └── index.ts                 # TypeScript类型定义（所有实体）
    ├── api/
    │   ├── request.ts               # Axios实例 + Token拦截器 + 401处理
    │   ├── auth.ts                  # 认证API（登录）
    │   ├── customer.ts              # 客户API
    │   ├── dataConfig.ts            # 数据源配置API
    │   ├── knowledge.ts             # 知识库API
    │   ├── knowkit.ts               # Know-Kit API
    │   └── report.ts                # 报告API
    ├── store/
    │   └── index.ts                 # Zustand全局状态
    ├── router/
    │   └── index.tsx                # 路由配置
    ├── components/
    │   └── layout/
    │       ├── MainLayout.tsx       # 主布局（侧边栏+顶栏+用户信息+退出）
    │       └── AuthGuard.tsx        # 路由守卫（未登录重定向/login）
    └── pages/
        ├── Login.tsx                # 登录页
        ├── report/
        │   ├── ReportList.tsx       # 报告列表页
        │   ├── ReportView.tsx       # 报告查看页
        │   └── ReportCreate.tsx     # 报告生成页（客户+场景标签→一键生成）
        ├── data/
        │   ├── CustomerList.tsx     # 客户管理页
        │   └── DataConfig.tsx       # 数据源配置页
        └── knowledge/
            └── RuleList.tsx         # 知识库管理页（规则+场景Tab、条件/标签CRUD、标签联动场景下拉）
        └── system/
            ├── UserList.tsx         # 用户管理页
            └── RoleList.tsx         # 角色管理页
```

## 启动方式

```bash
cd frontend
npm install
npm run dev

# 开发服务器: http://localhost:5173
```

```bash
# 生产构建
npm run build     # 输出到 dist/
npm run preview   # 预览构建结果
```

## 开发进度

- [x] 报告查看页（ReportView）三栏式完整布局（后端渲染 HTML）
- [x] 报告 HTML 渲染引擎（基于 `贷后管理报告.html` 原型）
- [x] 数据源配置页完善采集器/解析器表单（5种采集器+4种解析器动态示例）
- [x] 知识库管理页：规则/场景 Tab 切换，场景完整 CRUD（增删改查），标签联动场景下拉选择
- [x] 知识库规则页条件/标签的完整 CRUD（增删改查）
- [x] 报告生成页：选择客户一键生成，标签仅作规则分类属性不参与报告筛选
- [x] 报告导出 Word（MSO 兼容 HTML，直接下载 .doc）
- [x] 报告导出 HTML（一键下载 .html）
- [ ] 报告导出 PDF（后续按需实现）
- [ ] SFTP 文件采集和文件上传采集从采集器中剥离，改为独立功能模块（当前混在采集器里，但这两者是客户经理人工操作，与自动采集器的定位不符）
- [ ] 报告列表支持按客户筛选（后端已支持，前端未做筛选器）
- [x] 用户登录认证（JWT Token + BCrypt 加密 + 路由守卫 + 角色菜单权限可配置 + 顶栏改密）
- [x] 枚举值全量中文化（规则类型、连接符、采集/解析器类型、标签类型、报告状态、启用状态）
