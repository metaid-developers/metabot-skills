# FalkorDB Pin 查询 MCP 工具摘要

本技能同时提供 **scripts** 下 5 个 Python 脚本封装上述接口，用法见 SKILL.md。

Base URL：`https://www.metaweb.world/world-base/api/v1`（可通过环境变量 `METAID_WORLD_BASE_URL` 覆盖；与 mcp-falkordb-pin-query.json 中 domain + basePath 一致）。

---

## 1. falkordb_pins_by_path

按 path 模式查询用户 Pin 列表；path 可选，为空时返回该用户下所有 pin。

- **Method**: GET
- **Path**: `/falkordb/users/{metaID}/pins-by-path`
- **Path 参数**: `metaID`（必填，string）
- **Query 参数**: `path`（可选）、`limit`（可选，默认 20，最大 1000）、`order`（可选，desc/asc，默认 desc）
- **返回**: `data.pins`（数组，每项 PinWithContent）

---

## 2. falkordb_pins_in_window

按时间窗口查询该用户发出的 pin；未传时间时默认 24 小时，最多 1000 条。

- **Method**: GET
- **Path**: `/falkordb/users/{metaID}/pins-in-window`
- **Path 参数**: `metaID`（必填，string）
- **Query 参数**: `hours`（可选）、`minutes`（可选，与 hours 二选一）
- **返回**: `data.pins`（数组，每项 PinWithContent，content 可能为空）

---

## 3. falkordb_user_group_messages

查询该用户在指定群内的消息。

- **Method**: GET
- **Path**: `/falkordb/users/{metaID}/groups/{groupID}/messages`
- **Path 参数**: `metaID`（必填）、`groupID`（必填）
- **Query 参数**: `hours`（可选）、`minutes`（可选）、`limit`（可选，默认 50，最大 1000）
- **返回**: `data.messages`（数组，每项 PinWithContent）

---

## 4. falkordb_pins_pointing

查询「指向该 metaID」的 pin（如被@、被回复）。

- **Method**: GET
- **Path**: `/falkordb/users/{metaID}/pins-pointing`
- **Path 参数**: `metaID`（必填，被指向的用户 MetaID）
- **Query 参数**: `hours`（可选）、`minutes`（可选）、`limit`（可选，默认 100，最大 1000）
- **返回**: `data.pins`（数组，每项 PinWithContent）

---

## 5. falkordb_pins_by_path_paged

按 path 分页查询全库 Pin 列表（不按用户）；path 必填，支持前缀或精确；返回 total、offset、limit 与当前页 pins。查「现在有什么协议」时使用 path=`/protocols/metaprotocol`。

- **Method**: GET
- **Path**: `/falkordb/pins-by-path-paged`
- **Path 参数**: 无（不需要 metaID）
- **Query 参数**: `path`（必填）、`offset`（可选，默认 0）、`limit`（可选，默认 20，最大 1000）
- **返回**: `data.total`、`data.offset`、`data.limit`、`data.pins`（数组，每项 PinWithContent）

---

## 6. falkordb_user_node

根据 metaID 查询 User 节点（仅节点本身，不包含关联 Content/PIN）。

- **Method**: GET
- **Path**: `/falkordb/users/{metaID}`
- **Path 参数**: `metaID`（必填，string）
- **Query 参数**: 无
- **返回**: `data.user`（User 节点本身）

---

## 7. falkordb_user_pin_ids

分页查询该用户发布的 Pin ID 列表，返回总数与当前页。

- **Method**: GET
- **Path**: `/falkordb/users/{metaID}/pins`
- **Path 参数**: `metaID`（必填，string）
- **Query 参数**: `offset`（可选，默认 0）、`limit`（可选，默认 20，最大 1000）
- **返回**: `data.metaID`、`data.total`、`data.pinIDs`、`data.offset`、`data.limit`、`data.count`

---

## 8. falkordb_content_node

根据 pinID 查询 Content 节点及其关联的 User 和 PIN。

- **Method**: GET
- **Path**: `/falkordb/contents/{pinID}`
- **Path 参数**: `pinID`（必填，string）
- **Query 参数**: 无
- **返回**: `data`（Content 节点及关联 users、pins）

---

## 9. falkordb_pin_node

根据 pinID 查询 PIN 节点及其关联的 User 和 Content。

- **Method**: GET
- **Path**: `/falkordb/pins/{pinID}`
- **Path 参数**: `pinID`（必填，string）
- **Query 参数**: 无
- **返回**: `data`（PIN 节点及关联 users、contents）

---

## PinWithContent 结构（简要）

每条列表项包含：`pinID`、`path`、`pin`（PIN 节点：pinID、path、firstPath、timestamp、operation、contentType、chainName、txID、blockHeight、creatorAddress、ownerAddress、extra 等）、`content`（Content 节点，可为空：pinID、path、content、contentHash、jsonFields、contentType、timestamp 等）。

完整请求/响应结构见本技能 [mcp-falkordb-pin-query.json](mcp-falkordb-pin-query.json)。
