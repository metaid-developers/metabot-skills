# config.json

配置文件位于 **项目根目录**（MetaApp-Skill/）。由 `.env` / `.env.local` 动态生成，`grouplastIndex` 运行时更新，不应提交到 Git。

## 格式

- **groupInfoList**：数组，支持多群配置
- **groupInfoList[0]**：由 `.env` / `.env.local` 动态生成（GROUP_ID、GROUP_NAME 等）
- **持久化**：`grouplastIndex` 运行时更新；`llm.apiKey` 不写入，运行时从 env 读取
- **向后兼容**：旧格式（扁平 `groupId`）会自动迁移为 `groupInfoList`

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

在 `.env` / `.env.local` 中配置：

```bash
GROUP_ID=your-group-id
GROUP_NAME=Group Name
GROUP_ANNOUNCEMENT=Group announcement
GROUP_LAST_INDEX=0
```

- `groupInfoList[0].groupId` - 群 ID（必填）
- `groupInfoList[0].grouplastIndex` - 消息索引，运行时自动更新
