# Flow 记账 API 文档

## 概述

Flow 记账提供 RESTful Open API，可通过 API Token 调用所有记账功能。支持接入 AI 工具（如 OpenClaw、Claude Code 等）进行财务管理和数据分析。

**Base URL**: `https://jizhang-8zk.pages.dev`

---

## 认证

所有 `/api/v1/*` 接口需要在请求头中携带 API Token：

```
Authorization: Bearer sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Token 管理**：管理员在网页端「API Token」页面生成/吊销 Token。

---

## API 端点

### 1. 全局状态

获取资金池、最近流水、系统设置。

```
GET /api/v1/state
```

**响应**:
```json
{
  "pools": [{ "id": "1", "name": "日常开销", "balance": 1500, "budget": 3000, "color": "#3b82f6", "isCardPool": 0 }],
  "transactions": [{ "id": "...", "type": "expense", "amount": 50, "currency": "CNY", "date": "2026-05-01", "note": "午餐", "poolId": "1" }],
  "baseCurrency": "CNY",
  "exchangeRates": { "CNY": 1, "USD": 7.2 }
}
```

---

### 2. 财务统计

获取本月财务状况汇总。

```
GET /api/v1/stats
```

**响应**:
```json
{
  "month": "2026-05",
  "income": 15000,
  "expense": 8200,
  "netIncome": 6800,
  "poolStats": [
    { "id": "1", "name": "日常开销", "balance": 1500, "spending": 3200, "isCardPool": 0 }
  ],
  "cards": { "active": 3, "printed": 1 },
  "bets": { "active": 2 }
}
```

---

### 3. 流水记录

#### 查询流水
```
GET /api/v1/transactions?limit=50&offset=0&type=expense&poolId=1&dateFrom=2026-05-01&dateTo=2026-05-31
```

| 参数 | 说明 | 可选 |
|------|------|------|
| `limit` | 条数上限（默认100，最大1000） | ✅ |
| `offset` | 偏移量 | ✅ |
| `type` | `income` / `expense` / `transfer` | ✅ |
| `poolId` | 资金池ID | ✅ |
| `dateFrom` | 起始日期 | ✅ |
| `dateTo` | 截止日期 | ✅ |

**响应**:
```json
{
  "transactions": [
    { "id": "...", "type": "expense", "amount": 50, "currency": "CNY", "date": "2026-05-01", "note": "午餐", "poolId": "1", "allocations": [] }
  ]
}
```

#### 创建流水（需要管理员 Token）
```
POST /api/v1/transactions
Content-Type: application/json

{
  "type": "expense",
  "amount": 50,
  "currency": "CNY",
  "date": "2026-05-01",
  "note": "午餐",
  "poolId": "1"
}
```

#### 更新流水（需要管理员 Token）
```
PATCH /api/v1/transactions/:id
Content-Type: application/json

{ "note": "更新后的备注", "amount": 60 }
```

#### 删除流水（需要管理员 Token）
```
DELETE /api/v1/transactions/:id
```

---

### 4. 资金池

```
GET /api/v1/pools
```

**响应**:
```json
{
  "pools": [
    { "id": "1", "name": "日常开销", "balance": 1500, "budget": 3000, "color": "#3b82f6", "isCardPool": 0 }
  ]
}
```

---

### 5. 对赌协议

```
GET /api/v1/bets
```

**响应**:
```json
{
  "bets": [
    { "id": "...", "title": "健身30天", "status": "active", "reward": 500, "target_amount": 30000, "current_amount": 12000, "start_date": "2026-04-01", "end_date": "2026-04-30" }
  ]
}
```

---

### 6. 虚拟储蓄卡

```
GET /api/v1/cards
```

**响应**:
```json
{
  "cards": [
    { "id": "...", "card_number": "1802402614000164", "card_holder": "张三", "denomination": 1000, "current_amount": 500, "status": "saving", "issue_date": "2026-04-22" }
  ]
}
```

---

## AI 接入示例

### Claude Code / Copilot 配置

在项目根目录或对话中设置：

```bash
# 设置 Token（从网页端获取）
export FLOW_TOKEN="sk_xxxxxxxx"

# 查询本月开销
curl -H "Authorization: Bearer $FLOW_TOKEN" https://jizhang-8zk.pages.dev/api/v1/stats
```

### AI Prompt 示例

**财务分析**:
```
我的记账API在 https://jizhang-8zk.pages.dev/api/v1/stats，Token是 sk_xxx。
帮我分析这个月的支出结构，给出优化建议。
```

**记账操作**:
```
用 Token sk_xxx 帮我在日常开销池记一笔 ¥35 的午餐开销，日期今天。
API: POST https://jizhang-8zk.pages.dev/api/v1/transactions
```

---

## 错误码

| 状态码 | 含义 |
|--------|------|
| 401 | 缺少 Token |
| 403 | Token 无效或已吊销 |
| 404 | 接口不存在 |
| 500 | 服务器错误 |

---

## Token 安全须知

- Token 仅创建时完整显示一次，请立即保存
- 可在网页端随时吊销/启用 Token
- 建议为不同用途创建不同的 Token
- 创建流水操作需要管理员 Token
- Token 格式：`sk_` + 40位小写字母+数字
