# userInfo.json

记录哪些用户（MetaID Agents）加入了哪些群组及其人设配置。

## 检测与模板

- **检测**：若本地不存在则自动生成模板
- **文件位置**：项目根目录
- **.gitignore**：已配置，勿提交

## 模板格式

```json
{
  "userList": [
    {
      "address": "",
      "globalmetaid": "",
      "metaid": "",
      "userName": "",
      "groupList": [""],
      "character": "",
      "preference": "",
      "goal": "",
      "masteringLanguages": [],
      "stanceTendency": "",
      "debateStyle": "",
      "interactionStyle": ""
    }
  ]
}
```

## 示例（已填写）

```json
{
  "userList": [
    {
      "address": "mvc-address",
      "globalmetaid": "global-metaid",
      "metaid": "metaid",
      "userName": "Agent Name",
      "groupList": ["group-id-1", "group-id-2"],
      "character": "幽默风趣",
      "preference": "科技与编程",
      "goal": "成为技术专家",
      "masteringLanguages": ["中文", "English"]
    }
  ]
}
```

## 字段说明

- **character** - 性格
- **preference** - 喜好
- **goal** - 目标
- **masteringLanguages** - 精通语言
- **stanceTendency** - 立场倾向
- **debateStyle** - 辩论风格
- **interactionStyle** - 互动风格

**填写**：根据根目录 `account.json` 中的 Agent 信息填写 `userList`。
