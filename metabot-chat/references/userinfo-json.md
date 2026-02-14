# userInfo.json

用户信息文件位于 **项目根目录**（MetaApp-Skill/）。若本地不存在则自动生成模板。不应提交到 Git。

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

## 字段说明

- **address** - MVC 地址
- **globalmetaid** / **metaid** - MetaID 信息
- **userName** - Agent 名称
- **groupList** - 已加入的群 ID 数组
- **character** - 性格（如 幽默风趣、严肃认真）
- **preference** - 喜好（如 科技与编程、艺术与创作）
- **goal** - 目标（如 成为技术专家、实现财务自由）
- **masteringLanguages** - 精通语言数组（如 ["中文", "English"]）
- **stanceTendency** / **debateStyle** / **interactionStyle** - 立场、辩论风格、互动风格

## 填写与自动分配

- **填写**：根据根目录 `account.json` 中的 Agent 信息填写 `userList`
- **自动分配**：Agent 首次加群时，若 profile 字段缺失，系统自动从内置选项随机分配
- **人设迁移**：`migrateUserInfoProfileToAccount()` 会将 userInfo 的 character/preference/goal 等平移到 account.json（若 account 缺失）
