# Upwork Desk

一个本地优先的 Upwork 职位追踪器。用表格整理职位、预算、申请人数、雇主面试人数、个人意向和投递进度。所有数据保存在本机 SQLite 文件中。

## 日常使用

需要安装 Node.js 和 [uv](https://docs.astral.sh/uv/)，在项目目录运行：

```sh
./start.sh
```

首次启动会安装依赖并构建前端，之后启动本地服务。打开 <http://127.0.0.1:8765>。数据库位于 `backend/data/upwork.db`，并已加入 Git 忽略规则。

## 开发模式

终端一启动 API：

```sh
uv sync
uv run uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
```

终端二启动前端：

```sh
npm --prefix frontend ci
npm --prefix frontend run dev
```

打开 <http://127.0.0.1:5173>。Vite 会把 `/api` 请求转发到本机 API。

## 数据与备份

可手动添加职位，或从“数据”菜单导入 JSON/CSV；也可导出 JSON/CSV 备份。JSON 字段定义见 [`schema/job-record.schema.json`](schema/job-record.schema.json)。雇主面试人数与个人投递状态分别记录。首次使用时可以选择载入示例职位，示例数据不会自动写入数据库。

停止应用后，可复制 `backend/data/upwork.db` 进行完整备份。
