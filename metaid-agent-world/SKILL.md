---
name: metaid-agent-world
description: 查询指定 metaID 在链上的动作（发过的 pin、按 path/时间/群/被指向 等）。当需要（1）按 path 或协议查用户 pin、（2）按时间窗口查用户近期 pin、（3）查用户在某一群内的消息、（4）查「指向该用户」的 pin、（5）想知道现在有什么协议时用 pins_by_path_paged 且 path 为 /protocols/metaprotocol、（6）查某 metaID 的 User 节点及 path 为 /info/name、/info/chatpubkey 的最新 PIN 与 Content、（7）分页查该用户 pinID 列表（含总数）、（8）按 pinID 查 Content 或 PIN 节点时使用本技能；优先通过 scripts 下 Python 脚本调用接口（pins_by_path、pins_by_path_paged、pins_in_window、pins_in_window_by_path、group_messages、pins_pointing、user_node、user_pins、content_node、pin_node），完整 API 定义见 references/mcp-falkordb-pin-query.json。
---

# MetaID Agent World

## Overview

本技能用于根据用户需求查询某个 metaID 在链上的动作，通过执行 **scripts** 下脚本发起请求。返回多为 pin 列表（及可选 content），每项为强类型 PinWithContent；另有 User/Pin/Content 节点查询（user_node、user_pins、content_node、pin_node）。Base URL 可通过环境变量 `METAID_WORLD_BASE_URL` 覆盖，未设置时默认为 `https://www.metaweb.world/world-base/api/v1`。

## 如何选脚本

| 用户需求 | 使用脚本 | 说明 |
|---------|----------|------|
| 按 path/协议查该用户 pin，或查该用户全部 pin | `scripts/pins_by_path.py` | path 可选；path 以 * 结尾为前缀匹配，否则精确匹配；path 为空即全部。常见 path 见下方「语义与 path 对应」。 |
| 想知道现在有什么协议 / 按 path 分页查全库 pin（不按用户） | `scripts/pins_by_path_paged.py` | path 必填；查协议时 path 用 `/protocols/metaprotocol`；不需 metaID。 |
| 按时间窗口查该用户发出的 pin（最近 N 小时/分钟） | `scripts/pins_in_window.py` | 仅需 metaID + 可选 hours 或 minutes；不传则服务端默认 24 小时，最多 1000 条 |
| 按 path 与开始/结束时间查该用户 pin | `scripts/pins_in_window_by_path.py` | 必填 metaID、path、startTime、endTime（毫秒时间戳）；时间区间闭区间，最多 1000 条 |
| 查该用户在某个群里的消息 | `scripts/group_messages.py` | 必填 metaID、groupID；可选 hours/minutes、limit（默认 50，最大 1000） |
| 查「指向该用户」的 pin（如被@、被回复） | `scripts/pins_pointing.py` | metaID 为被指向者；可选 hours/minutes、limit（默认 100，最大 1000） |
| 查 User 节点及 /info/name、/info/chatpubkey 信息 | `scripts/user_node.py` | 仅需 metaID；返回 data.user、data.namePinId、data.nameContent、data.chatpubkeyPinId、data.chatpubkeyContent |
| 分页查该用户 pinID 列表（含总数） | `scripts/user_pins.py` | 必填 metaID；可选 offset、limit（默认 0、20，最大 1000）；返回 data.total、data.pinIDs、data.count |
| 按 pinID 查 Content 节点 | `scripts/content_node.py` | 必填 pinID；返回 data（Content 及关联） |
| 按 pinID 查 PIN 节点 | `scripts/pin_node.py` | 必填 pinID；返回 data（PIN 及关联） |

## 语义与 path 对应

用户说法与推荐 path、脚本对应关系：

| 用户语义 | 推荐 path | 说明 |
|----------|-----------|------|
| 找 buzz、贴、动态 等 | `/protocols/simplebuzz` | 用 `pins_by_path.py --path /protocols/simplebuzz` |
| 笔记 等 | `/protocols/simplenote` | 用 `pins_by_path.py --path /protocols/simplenote` |
| 群聊消息 | `/protocols/simplegroupchat` | 若用户指定了**群 ID**，用 `group_messages.py --metaID --groupID`；若只是按 path 查 pin，用 `pins_by_path.py --path /protocols/simplegroupchat` |
| 现在有什么协议、有哪些协议 | `/protocols/metaprotocol` | 用 `pins_by_path_paged.py --path /protocols/metaprotocol [--offset 0] [--limit 20]` |

## Script 用法

- **pins_by_path.py**：`python scripts/pins_by_path.py --metaID <metaID> [--path /protocols/x] [--limit 20] [--order desc]`
- **pins_by_path_paged.py**：`python scripts/pins_by_path_paged.py --path <path> [--offset 0] [--limit 20]`
- **pins_in_window.py**：`python scripts/pins_in_window.py --metaID <metaID> [--hours 24]` 或 `[--minutes 60]`
- **pins_in_window_by_path.py**：`python scripts/pins_in_window_by_path.py --metaID <metaID> --path <path> --startTime <毫秒> --endTime <毫秒>`
- **group_messages.py**：`python scripts/group_messages.py --metaID <metaID> --groupID <groupID> [--hours 24] [--limit 50]`
- **pins_pointing.py**：`python scripts/pins_pointing.py --metaID <metaID> [--hours 24] [--limit 100]`
- **user_node.py**：`python scripts/user_node.py --metaID <metaID>`
- **user_pins.py**：`python scripts/user_pins.py --metaID <metaID> [--offset 0] [--limit 20]`
- **content_node.py**：`python scripts/content_node.py --pinID <pinID>`
- **pin_node.py**：`python scripts/pin_node.py --pinID <pinID>`

脚本成功时向 stdout 输出 JSON 响应；失败时向 stderr 输出错误并 exit 1。

## 各脚本用法要点

- **pins_by_path.py**：`--metaID` 必填；`--path` 可选；`--limit` 默认 20；`--order` 默认 desc。返回在 `data.pins`。
- **pins_by_path_paged.py**：`--path` 必填；`--offset` 默认 0；`--limit` 默认 20；不需 metaID。返回在 `data.pins`，分页信息在 `data.total`、`data.offset`、`data.limit`。
- **pins_in_window.py**：`--metaID` 必填；`--hours` 与 `--minutes` 可选（二选一）。返回在 `data.pins`，每条 content 可能为空。
- **pins_in_window_by_path.py**：`--metaID`、`--path`、`--startTime`、`--endTime` 必填（startTime/endTime 为毫秒时间戳，startTime 不能大于 endTime）。返回在 `data.pins`，含 `data.startTs`、`data.endTs`、`data.pathFilter`。
- **group_messages.py**：`--metaID`、`--groupID` 必填；`--limit` 默认 50。返回在 `data.messages`。
- **pins_pointing.py**：`--metaID` 必填；`--limit` 默认 100。返回在 `data.pins`。
- **user_node.py**：`--metaID` 必填。返回在 `data.user`（User 节点）、`data.namePinId`/`data.nameContent`（path 为 /info/name 的最新 PIN 及 Content）、`data.chatpubkeyPinId`/`data.chatpubkeyContent`（path 为 /info/chatpubkey 的最新 PIN 及 Content）；无则 pinId 为空字符串、Content 为 null。
- **user_pins.py**：`--metaID` 必填；`--offset` 默认 0；`--limit` 默认 20，最大 1000。返回在 `data.pinIDs`、`data.total`、`data.offset`、`data.limit`、`data.count`。
- **content_node.py**：`--pinID` 必填。返回在 `data`（Content 节点及关联）。
- **pin_node.py**：`--pinID` 必填。返回在 `data`（PIN 节点及关联）。

所有列表项均为 **PinWithContent**：顶层含 `pinID`、`path`；`pin` 为 PIN 节点强类型（含 timestamp、operation、contentType、chainName 等）；`content` 为 Content 节点强类型（可为空），含 content、contentHash、jsonFields 等。

## Resources

- 优先通过 **scripts** 下 Python 脚本调用接口；完整请求/响应 schema 见 [references/mcp-falkordb-pin-query.json](references/mcp-falkordb-pin-query.json)。
- 接口路径与参数速查见 [references/mcp-falkordb-pin-tools.md](references/mcp-falkordb-pin-tools.md)。
