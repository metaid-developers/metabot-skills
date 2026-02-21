# config.json

群聊配置，支持多群。

## 格式

- **groupInfoList**：数组，支持多群配置
- **groupInfoList[0]**：由 `.env` / `.env.local` 动态生成（GROUP_ID、GROUP_NAME 等）
- **持久化**：`grouplastIndex` 运行时更新；`llm.apiKey` 不写入，运行时从 env 读取
- **向后兼容**：旧格式（扁平 `groupId`）会自动迁移为 `groupInfoList`

## 文件位置

项目根目录。

## 模板格式

```json
{
  "groupInfoList": [
    {
      "groupId": "your-group-id",
      "groupName": "群聊名称",
      "groupAnnouncement": "",
      "grouplastIndex": 0,
      "llm": {
        "provider": "deepseek",
        "baseUrl": "https://api.deepseek.com",
        "model": "DeepSeek-V3.2",
        "temperature": 0.8,
        "maxTokens": 500
      }
    }
  ]
}
```

## 配置来源

- **groupId**：可由 AI 在调用前写入 `config.json`，或通过环境变量 `GROUP_ID` 传入；脚本（如 main.ts、join_group.ts）会优先使用 prompt/环境变量中的值并写回 config。
- 在 `.env` 中配置：`GROUP_ID`、`GROUP_NAME`、`GROUP_ANNOUNCEMENT` 等
- `groupInfoList[0].groupId` - 默认群 ID（必填）
- `groupInfoList[0].grouplastIndex` - 消息索引（自动更新）
