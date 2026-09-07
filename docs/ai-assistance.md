# AI 社区助手与辅助填写

更新日期：2026-09-07。系统提供业主社区问答、功能查询、报修整理和物业公告拟稿。

## 当前模型

当前电脑已从本机 API 配置导入 BuffLink 网关，服务前缀为 `https://api.bufflink.cc/v1`，协议为 Responses，配置请求模型为 `gpt-6-astra`。模型列表查询及实际生成请求均返回成功。该名称是网关配置及返回的模型标识，不表示模型运行在本机，也不表示直连 OpenAI 官方 API。

原先的 `demo-model` 是关键词规则模拟服务。现在 `demo/run_demo.py` 默认使用服务端已配置模型；只有显式增加 `--mock-ai` 才启动离线草稿模拟服务。模型调用失败时返回真实错误，不用模拟回答替代。

## 本机配置

本机已经完成配置。需要重新导入本机 API 配置时，在工程根目录执行：

```powershell
.\backend\.venv\Scripts\python.exe demo\configure_local_ai.py
```

该工具读取本机 `.codex/config.toml` 的当前 API 服务和 `.codex/auth.json` 中的 API Key，写入被 Git 忽略的 `backend/.env`，不输出密钥。不读取或使用账号登录令牌。其他电脑可自行配置以下模板，不依赖本机路径：

```dotenv
COMMUNITY_AI_ENABLED=true
COMMUNITY_AI_BASE_URL=https://your-provider.example/v1
COMMUNITY_AI_MODEL=your-gpt-model
COMMUNITY_AI_API_KEY=your-api-key
COMMUNITY_AI_API_MODE=responses
COMMUNITY_AI_MODE=model
COMMUNITY_AI_PROVIDER_NAME=your-provider
COMMUNITY_AI_REASONING_EFFORT=low
COMMUNITY_AI_TIMEOUT_SECONDS=90
```

模板地址与凭据需要替换为实际配置。环境变量优先于 `.env`，修改后重启服务。密钥仅放服务端，不放浏览器、文档或公开仓库。

| API 模式 | 请求接口 | 返回处理 |
|---|---|---|
| `responses` | `BASE_URL/responses` | JSON 对象格式，`store=false`，解析完成响应的 `output_text` |
| `chat_completions` | `BASE_URL/chat/completions` | 兼容原有 `response_format=json_object` 与 `choices` 响应 |

远程服务要求 HTTPS 和 API Key；回环地址的本地兼容服务可使用 HTTP。`BASE_URL` 不重复附加接口后缀。实际服务需支持所选协议和参数，费用按供应商账户计费。

## 业主社区助手

用 `owner` 登录，从左侧“社区助手”、首页入口或社区服务进入。两个页签分别为：

- 智能问答：可询问未缴费用、报修进度、停车审批规则、社区公告等，并继续追问。回答附业务入口、数据来源和更新时间。
- 功能查询：直接搜索并进入报修、缴费、车位、公告、进度和个人信息，不调用模型。

问答只读取当前业主可见的关联房屋、自己的账单、自己的报修和预约，以及本社区已发布公告。发送至配置的模型服务的是这些范围内的统计与有数量上限的明细、最近对话和当前问题；不发送应用登录令牌、模型密钥、其他住户记录或物业草稿。

对话只在当前页面会话中保存，发送最近六轮完整问答。支持停止等待、失败重试和清空。停止等待会取消前端请求，但已提交到供应商的请求仍可能产生费用。助手不执行缴费、取消、派单、审批或公告发布，业务操作需要用户进入相应页面确认。

## 草稿辅助

业主在“提交报修”中填写描述后点击“AI 整理”，检查类型、优先级、表述和待补充事项，再自行采用或放弃。

物业在“新建公告”中填写标题和要点后点击“AI 拟稿”，核实日期、范围和正文，再创建草稿并明确发布。

这两个草稿接口只发送当前表单文本，不自动附带社区记录。生成建议和采用建议均不直接写入业务记录。

## 服务状态与错误

`GET /api/v1/ai/status` 向已登录用户返回是否启用、是否已配置、模式、模型和供应商名称，不返回凭据。社区助手显示实际配置的模型；离线模式明确显示为非 GPT 演示。

问答接口为 `POST /api/v1/ai/assistant`，限业主访问；报修整理限业主，公告拟稿限物业。输入、输出、历史长度和站内入口均有约束。每用户每分钟最多八次生成尝试，不自动重试模型请求。

未配置为 503，超时为 504，上游失败或格式错误为 502，频率超限为 429。出现错误时保留人工输入，原有业务仍可手动办理。

## 本轮验证

已对问答及两种模型协议执行定向测试，并真实调用网关验证：业主问答正确返回当前 17 笔待缴、合计 1534.54 元，与服务端账单汇总一致；报修整理与公告拟稿也返回成功。数字对应验证时数据快照，后续操作会改变结果。

本轮没有执行全项目检查。当前功能和数据扩充记录见 [实施记录](assistant-data-update-plan.md)。
