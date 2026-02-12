---
name: metabot-file
description: "MetaID 文件上传与查询一体化 skill。上传：余额检查、直接/分块上传、PinID 与交易信息；查询：按 address/metaid/globalMetaID 查用户与头像，按 pinId 查文件元数据与内容。Base URL 上传为 https://file.metaid.io/metafile-uploader，索引为 https://file.metaid.io/metafile-indexer。需结合 metabot-basic 创建钱包；本 skill 含 metafs_*.ts、upload_with_balance_check.sh、query_indexer.py 等脚本。"
---

# metabot-file

提供**文件上传到 MVC 区块链 MetaID 文件系统**与**用户/文件查询**两类能力。

## 概述

`metabot-file` skill 整合了上传与索引查询：上传部分根据文件大小自动选择直接上传或分块上传，并做余额检查与任务监控；查询部分基于 Meta 文件索引服务，可查用户信息、头像与文件元数据/内容。

### 核心功能

- **智能上传选择** - 根据文件大小自动选择直接上传或分块上传(5MB 阈值)
- **余额检查** - 上传前验证钱包余额并估算所需费用
- **文件处理** - 从 `res/file/` 或自定义路径读取文件,转换为 base64 编码
- **MetaID 计算** - 使用 SHA256 从钱包地址计算 MetaID
- **任务监控** - 异步上传的实时进度追踪
- **详细结果** - 返回完整的交易信息和区块链浏览器链接

### 与其他 Skills 的关系

- **metabot-basic**: 必需,用于钱包创建和管理(含 pay、signTransaction)。上传文件前可先使用 metabot-basic 创建钱包
- 上传后可利用本 skill 的 **query_indexer.py** 根据返回的 PinID 查询文件信息（见下方「文件查询与索引」）
- **meta-file-system-uploader**: 面向开发者的 skill,用于理解后端上传逻辑。本 skill 面向用户,用于实际文件上传与查询

## 前置要求

使用本 skill 前,请确保具备:

1. **Node.js 与 metabot-file 环境**
   - Node.js >= 18
   - 在 `.claude/skills/metabot-file` 下执行过一次 `npm install`（一键脚本会在此目录执行 ts-node）。本 skill 的 metafs_*.ts 运行时依赖 metabot-basic 的 utils/api/wallet，故 metabot-basic 目录需存在且已 `npm install`

2. **Python 环境**
   - Python 3.7 或更高版本
   - `requests` 库: `pip install requests`(用于 read_file_base64.py、monitor_task.py)

3. **MetaID 钱包** (来自 metabot-basic skill)
   - MVC 地址
   - MetaID (一键脚本通过本 skill 的 metafs_account_info.ts 获取)
   - **足够的 MVC 余额** - 用于支付上传费用
     - 小文件(≤5MB): 约 1,000-5,000 satoshis
     - 大文件(>5MB): 取决于文件大小; 余额检查由本 skill 的 `metafs_check_balance.ts` 完成

4. **待上传文件**
   - 放置在 `res/file/` 目录或其他可访问路径
   - 在大小限制内(通过 API 配置查询)

5. **网络访问**
   - 上传 API: `https://file.metaid.io/metafile-uploader/`
   - 索引/查询 API: `https://file.metaid.io/metafile-indexer`（用于 query_indexer.py 及文件查询）

## 快速开始

### 步骤 1: 使用 metabot-basic 创建钱包

首先使用 metabot-basic skill 创建 MetaID 钱包:

```bash
cd .claude/skills/metabot-basic && ts-node scripts/main.ts "创建代理 myagent"
```

这将在项目根目录创建包含钱包信息的 `account.json`，与 metabot-basic 共用。

### 步骤 2: 提取钱包信息

从 `account.json` 读取钱包地址:

```bash
# 查看账户信息
cat account.json | jq '.accountList[0]'

# 提取地址
address=$(cat account.json | jq -r '.accountList[0].mvcAddress')
echo "地址: $address"
```

### 步骤 3: 计算 MetaID

```bash
python .claude/skills/metabot-file/scripts/calculate_metaid.py "$address"
```

输出:
```json
{
  "address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  "metaId": "a7f8d9e..."
}
```

### 步骤 4: 检查余额 (重要!)

在上传前检查钱包余额是否足够支付费用(本 skill 的 metafs_check_balance.ts 内部使用 metabot-basic 的 getMvcBalance/fetchMVCUtxos):

```bash
cd .claude/skills/metabot-file

# 仅检查默认账户余额
npx ts-node scripts/metafs_check_balance.ts --account-file ../../../account.json --json

# 检查余额并估算特定文件的上传费用
npx ts-node scripts/metafs_check_balance.ts --account-file ../../../account.json --file-size-mb 10.5 --json

# 按 agent 关键词或账户索引指定钱包
npx ts-node scripts/metafs_check_balance.ts --keyword "AI Eason" --file-size-mb 1 --json
npx ts-node scripts/metafs_check_balance.ts --account-index 1 --file-size-mb 1 --json
```

输出示例:
```
🔍 正在查询地址余额: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
============================================================
📊 余额信息
============================================================
地址: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
网络: mainnet
UTXO 数量: 3
总余额: 100,000,000 satoshis (1.00000000 MVC)

------------------------------------------------------------
📤 上传费用估算
------------------------------------------------------------
文件大小: 10.5 MB
估算费用: 2,150,000 satoshis (0.02150000 MVC)
上传后余额: 97,850,000 satoshis (0.97850000 MVC)

✅ 余额充足，可以上传！
============================================================
```

如果余额不足,脚本将:
- 显示缺少的金额
- 返回非零退出码
- 建议充值地址

### 步骤 5: 准备文件

将文件放在 `res/file/` 目录:

```bash
# 如果目录不存在则创建
mkdir -p res/file

# 复制文件
cp /path/to/your/file.png res/file/
```

### 步骤 6: 读取并编码文件

```bash
python .claude/skills/metabot-file/scripts/read_file_base64.py res/file/file.png > file_data.json
```

输出包含文件信息和 base64 内容:
```json
{
  "fileName": "file.png",
  "fileSize": 2457600,
  "fileSizeMB": 2.34,
  "contentType": "image/png;binary",
  "uploadMethod": "direct",
  "base64Content": "iVBORw0KGgoAAAANS..."
}
```

### 步骤 7: 上传文件

根据输出中的 `uploadMethod` 选择:

**小文件 (5MB 以下) - 直接上传:**

后端 DirectUpload API 仅接受 **multipart/form-data**（必填: `file`、`path`、`preTxHex`）。推荐使用一键脚本或本 skill 的 `metafs_direct_upload.ts`（本地构建单输入单输出交易、SIGHASH_SINGLE|ANYONECANPAY 签名后提交）:

```bash
# 在项目根目录执行一键脚本(内部会调用 metafs_direct_upload.ts)
./.claude/skills/metabot-file/scripts/upload_with_balance_check.sh res/file/file.png

# 或单独调用直接上传脚本(本 skill 目录下)
cd .claude/skills/metabot-file
npx ts-node scripts/metafs_direct_upload.ts --account-file ../../../account.json --file ../../../res/file/file.png --path /file --content-type "image/png"
```

**大文件 (5MB 以上) - 分块上传任务:**

分块上链需先完成 OSS 分片得到 `storageKey`，再基于 `storageKey` 做 estimate、构建并签名 merge 交易（不广播）、签 chunk/index 预交易，最后提交任务时传 `storageKey`、`chunkPreTxHex`、`indexPreTxHex`、`mergeTxHex`。**仅传 content 的 curl 方式不可用**（服务端会报 ChunkPreTxHex required）。推荐使用一键脚本或本 skill 的 `metafs_chunked_upload.ts`（仅支持 MVC，merge 由后端在 Stage 2 广播）:

```bash
# 方式 A: 一键脚本(推荐，含余额检查与账户解析)
./.claude/skills/metabot-file/scripts/upload_with_balance_check.sh res/file/largefile.mp4

# 方式 B: 仅创建分块任务(需已确认余额充足)，输出最后一行 JSON 含 taskId
cd .claude/skills/metabot-file
npx ts-node scripts/metafs_chunked_upload.ts --account-file ../../../account.json \
  --file /path/to/largefile.mp4 --path /file --content-type "video/mp4" --fee-rate 1

# 从输出解析 taskId 后监控
taskId=$(... | jq -r '.taskId')
python scripts/monitor_task.py "$taskId"
```

### 步骤 8: 监控任务 (分块上传)

```bash
# 从响应中提取 taskId
taskId="abc123def456"

# 监控直到完成（进度输出到 stderr，最终单行 JSON 到 stdout，便于 jq 解析）
python .claude/skills/metabot-file/scripts/monitor_task.py "$taskId"
# 可选：超时(秒) 与 轮询间隔(秒)
python .claude/skills/metabot-file/scripts/monitor_task.py "$taskId" 600 5
```

**monitor_task.py 输出约定**：进度与提示输出到 **stderr**，成功/失败时最终 **单行 JSON** 输出到 **stdout**（含 `indexTxId`、`pinId`、`viewUrls` 等，camelCase），便于管道 `jq -r '.indexTxId'` 解析。API 返回的 task 为 snake_case（如 `index_tx_id`），脚本内部会转换为 camelCase 输出。

## 工作流程

### 上传方式选择逻辑

skill 根据文件大小自动决定上传方式:

```
┌─────────────────────┐
│   读取文件          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  检查文件大小        │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
  5MB以下     5MB以上
     │           │
     │           │
     ▼           ▼
┌─────────┐ ┌────────────────┐
│ 直接    │ │ 分块上传任务   │
│ 上传    │ │                │
└────┬────┘ └────────┬───────┘
     │               │
     │               ▼
     │      ┌────────────────┐
     │      │ 监控任务进度   │
     │      │                │
     │      └────────┬───────┘
     │               │
     └───────┬───────┘
             │
             ▼
     ┌────────────────┐
     │ 返回结果       │
     │ - TxID         │
     │ - PinID        │
     │ - 查看链接     │
     └────────────────┘
```

### 决策标准

| 文件大小 | 方式 | API 端点 | 行为 |
|---------|------|----------|------|
| 5MB 以下 | 直接上传 | `/api/v1/files/direct-upload` | 同步,立即返回 |
| 5MB 以上 | 分块上传任务 | `/api/v1/files/chunked-upload-task` | 异步,需要监控 |

**为什么选择 5MB 阈值?**
- **网络效率**: 5MB 在典型 HTTP 请求限制内
- **用户体验**: 小文件快速上传,无需监控开销
- **可靠性**: 大文件采用分块方式,支持自动重试
- **行业标准**: 符合常见云存储实践

### 直接上传流程

对于 5MB 以下文件（由 **本 skill 的 `metafs_direct_upload.ts`** 或一键脚本完成）:

1. 读取本地文件，选取一个 ≥5000 sats 的 UTXO
2. 本地构建「基础交易」: 1 个输入(该 UTXO) + 1 个输出(接收地址, 1 sat)
3. 使用 **SIGHASH_SINGLE | SIGHASH_ANYONECANPAY** 签名，得到 `preTxHex`
4. 以 **multipart/form-data** 向 `/direct-upload` 提交: `file`、`path`、`preTxHex`、`totalInputAmount`、`metaId`、`address`、`changeAddress`、`feeRate`
5. 服务端追加 OP_RETURN 并计算找零后广播，立即返回 txId/pinId

**注意:** 需主网 MVC 余额；API 不接受 JSON body（如 content base64），仅接受 multipart。

**优势:**
- 客户端签名，私钥不离开本地
- 单次请求即可完成
- 立即获得结果

### 分块上传任务流程

对于 5MB 以上文件（**仅支持 MVC**，与 Web 一致；DOGE 暂不支持）:

1. **OSS 分片上传**: `multipart/initiate` → 按 1MB 分片 `upload-part` → `complete`，得到 **storageKey**（不把整文件当 base64 传）。
2. **Estimate**: 用 **storageKey** 调 `POST /api/v1/files/estimate-chunked-upload`（不传 content），得到 chunkPreTxFee、indexPreTxFee 等。
3. **计算金额**: chunkPreTxOutputAmount、indexPreTxOutputAmount、mergeTxFee、totalRequired。
4. **Merge 交易**: 选 UTXO，构建两笔输出（chunk / index），**只签名不广播**，得到 `mergeTxHex`，由**后端在 Stage 2 广播**。
5. **Chunk/Index 预交易**: 用 merge 的两个输出分别签 SIGHASH_NONE|ANYONECANPAY，得到 `chunkPreTxHex`、`indexPreTxHex`。
6. **提交任务**: `POST /api/v1/files/chunked-upload-task`，Body 含 **storageKey**、chunkPreTxHex、indexPreTxHex、mergeTxHex 等（**不传 content**）。
7. 收到 taskId，用 `monitor_task.py` 轮询直到完成。

**弃用说明:** 仅传 `content`（base64）的 curl 方式**不可用**，服务端会返回 ChunkPreTxHex required。请使用 `metafs_chunked_upload.ts` 或一键脚本。

**优势:**
- 可靠处理大文件
- 进度监控
- 失败自动重试
- 无超时问题

## 使用示例

### 示例 1: 小图片文件 (2.3MB) - 直接上传

使用一键脚本或 `metafs_direct_upload.ts` 直接上传小图片（本地签名 + multipart 提交）:

```bash
# 方式 A: 一键脚本(推荐，含余额检查与账户解析)
./.claude/skills/metabot-file/scripts/upload_with_balance_check.sh res/file/photo.jpg

# 方式 B: 仅直接上传(需已确认余额充足)
cd .claude/skills/metabot-file
npx ts-node scripts/metafs_direct_upload.ts --account-file ../../../account.json \
  --file ../../../res/file/photo.jpg --path /file --content-type "image/jpeg"
```

脚本输出示例:
```json
{"txId":"abc123...","pinId":"abc123...i0","status":"success","fileSize":2411520,"contentUrl":"https://file.metaid.io/metafile-indexer/api/v1/files/content/abc123...i0","accelerateUrl":"https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/abc123...i0"}
```

### 示例 2: 大视频文件 (15MB) - 异步分块上传

上传大文件并监控进度（使用一键脚本或 `metafs_chunked_upload.ts`，不传 content）:

```bash
# 方式 A: 一键脚本(推荐，含余额检查、OSS 分片、merge/预交易、提交任务与监控)
./.claude/skills/metabot-file/scripts/upload_with_balance_check.sh res/file/video.mp4

# 方式 B: 仅创建分块任务，再手动监控
cd .claude/skills/metabot-file
out=$(npx ts-node scripts/metafs_chunked_upload.ts --account-file ../../../account.json \
  --file ../../../res/file/video.mp4 --path /file --content-type "video/mp4" --fee-rate 1)
taskId=$(echo "$out" | tail -1 | jq -r '.taskId')
python scripts/monitor_task.py "$taskId" 600 5
```

### 示例 3: 从自定义路径上传

从默认 `res/file/` 目录外上传文件:

```bash
# 指定完整路径
customFile="/path/to/my/document.pdf"

# 读取文件
fileData=$(python scripts/read_file_base64.py "$customFile")

# 按前面示例继续上传...
```

### 示例 4: 批量上传多个文件

依次上传多个文件:

```bash
#!/bin/bash

# 钱包信息
address="1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
metaId=$(python scripts/calculate_metaid.py "$address" | jq -r '.metaId')

# 要上传的文件
files=(
  "res/file/image1.png"
  "res/file/image2.jpg"
  "res/file/document.pdf"
)

# 上传每个文件
for file in "${files[@]}"; do
  echo "📤 上传: $file"
  
  fileData=$(python scripts/read_file_base64.py "$file")
  fileName=$(echo "$fileData" | jq -r '.fileName')
  fileContent=$(echo "$fileData" | jq -r '.base64Content')
  contentType=$(echo "$fileData" | jq -r '.contentType')
  uploadMethod=$(echo "$fileData" | jq -r '.uploadMethod')
  
  if [ "$uploadMethod" == "direct" ]; then
    # 直接上传（需用 metafs_direct_upload.ts，API 仅接受 multipart）
    cd .claude/skills/metabot-file && npx ts-node scripts/metafs_direct_upload.ts \
      --account-file ../../../account.json --file "../../../$file" --path /file \
      --content-type "$contentType"
    cd - > /dev/null
  else
    # 分块上传：调用 metafs_chunked_upload.ts，再监控
    cd .claude/skills/metabot-file
    out=$(npx ts-node scripts/metafs_chunked_upload.ts --account-file ../../../account.json \
      --file "../../../$file" --path /file --content-type "$contentType" --fee-rate 1)
    cd - > /dev/null
    taskId=$(echo "$out" | tail -1 | jq -r '.taskId')
    python .claude/skills/metabot-file/scripts/monitor_task.py "$taskId"
  fi
  
  echo "✅ $file 已上传"
  echo "---"
done
```

### 示例 5: 使用完整的一键上传脚本 (推荐)

使用提供的完整脚本，自动处理所有步骤，包括余额检查（钱包与余额由本 skill 的 metafs_*.ts 提供，运行时依赖 metabot-basic 的 utils/api/wallet）:

```bash
# 上传单个文件（自动检查余额、选择方式、监控进度）
bash .claude/skills/metabot-file/scripts/upload_with_balance_check.sh res/file/photo.jpg

# 指定 agent 关键词选钱包（如「用 AI Eason 上传」）
bash .claude/skills/metabot-file/scripts/upload_with_balance_check.sh res/file/photo.jpg --agent "AI Eason"

# 指定账户索引
bash .claude/skills/metabot-file/scripts/upload_with_balance_check.sh res/file/photo.jpg --account-index 1
```

脚本会自动:
1. ✅ 通过本 skill 的 metafs_account_info.ts 从 account.json 解析钱包(支持 --agent/--account-index)
2. ✅ 通过本 skill 的 metafs_check_balance.ts 检查余额是否足够
3. ✅ 读取并编码文件
4. ✅ 根据大小自动选择上传方式
5. ✅ 监控上传进度（如果需要）
6. ✅ 显示详细结果和链接

输出示例:
```
ℹ️  正在上传文件: res/file/photo.jpg

ℹ️  步骤 1/6: 读取钱包信息...
✅ 地址: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
✅ MetaID: a7f8d9e1b2c3d4e5...

ℹ️  步骤 2/6: 读取文件信息...
✅ 文件名: photo.jpg
✅ 大小: 2.34 MB
✅ 上传方式: direct

ℹ️  步骤 3/6: 检查余额...
✅ 余额充足
ℹ️  当前余额: 100,000,000 satoshis (1.00000000 MVC)
ℹ️  估算费用: 1,500,000 satoshis (0.01500000 MVC)

ℹ️  步骤 4/6: 上传文件...
ℹ️  使用直接上传方式...
✅ 上传完成！

ℹ️  步骤 6/6: 上传结果

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 上传成功！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
文件名: photo.jpg
大小: 2.34 MB
方式: direct

交易 ID: abc123def456ghi789...
PinID: abc123def456ghi789...i0

🔗 在区块链上查看:
   https://www.mvcscan.com/tx/abc123def456ghi789...

🔗 查看文件 Pin:
   https://man.metaid.io/pin/abc123def456ghi789...i0

🔗 直接内容:
   https://file.metaid.io/metafile-indexer/api/v1/files/content/abc123def456ghi789...i0

🔗 加速/下载:
   https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/abc123def456ghi789...i0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 所有步骤完成！
```

**优势:**
- 一行命令完成所有操作
- 自动余额检查，避免上传失败
- 清晰的进度显示
- 错误处理和友好提示
- 彩色输出易于阅读

## 参数参考

### 必需参数

所有上传请求都需要这些参数:

| 参数 | 类型 | 说明 | 示例 |
|-----|------|------|------|
| `address` | string | MVC 区块链地址 | `"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"` |
| `metaId` | string | MetaID (地址的 SHA256) | `"a7f8d9e..."` |
| `fileName` | string | 文件名 | `"image.png"` |
| `content` | string | Base64 编码的文件内容 | `"iVBORw0KGgo..."` |

### 可选参数

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `path` | string | `"/file"` | MetaID 协议路径 |
| `operation` | string | `"create"` | 操作类型 (`create`, `modify`, `revoke`) |
| `contentType` | string | 自动检测 | MIME 类型 (非文本添加 `;binary`) |
| `feeRate` | integer | `1` | 费率(聪/字节) |
| `chain` | string | `"mvc"` | 区块链(仅支持 `mvc`) |

### 参数详情

#### address

从 metabot-basic 钱包(account.json)获取的 MVC 区块链地址。

```bash
# 从 account.json 获取
cat account.json | jq -r '.accountList[0].mvcAddress'
```

#### metaId

地址的 SHA256 哈希。计算方式:

```bash
python scripts/calculate_metaid.py <address>
```

或从 account.json 获取已注册的 MetaID:

```bash
cat account.json | jq -r '.accountList[0].globalMetaId'
```

#### fileName

文件的原始名称。用于显示和引用。

#### content

Base64 编码的文件内容。生成方式:

```bash
python scripts/read_file_base64.py <file_path> | jq -r '.base64Content'
```

#### path

MetaID 协议路径。常用值:
- `/file` - 通用文件存储(默认)
- `/avatar` - 个人头像
- `/banner` - 横幅图片

#### contentType

带可选 `;binary` 后缀的 MIME 类型:
- 文本类型: `text/plain`, `application/json` (无后缀)
- 二进制类型: `image/png;binary`, `video/mp4;binary`

由 `read_file_base64.py` 脚本自动检测。

#### feeRate

交易费率:
- `1` 聪/字节 - 标准(推荐)
- `5-10` 聪/字节 - 更快确认
- 紧急交易使用更高值

## 输出格式

### 成功上传响应

**直接上传 (5MB 以下):**

一键脚本或 `metafs_direct_upload.ts` 输出单行 JSON（无外层 code/data）:

```json
{"txId":"abc123def456...","pinId":"abc123def456...i0","status":"success","fileSize":12345,"contentUrl":"https://file.metaid.io/metafile-indexer/api/v1/files/content/abc123def456...i0","accelerateUrl":"https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/abc123def456...i0"}
```

**分块上传任务 (5MB 以上):**

- 创建任务：`metafs_chunked_upload.ts` 或一键脚本会输出一行 JSON，含 `taskId`。
- 监控完成：`monitor_task.py` 将**单行 JSON** 输出到 stdout（进度输出到 stderr），含 `indexTxId`、`pinId`、`chunkTxIds`、`viewUrls` 等；一键脚本会解析该 JSON 并展示交易/Pin/内容链接。

创建任务时的初始响应:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": "task_abc123",
    "status": "created",
    "message": "任务创建成功"
  }
}
```

监控完成后的最终响应:

```json
{
  "success": true,
  "taskId": "task_abc123",
  "status": "success",
  "indexTxId": "def456ghi789...",
  "pinId": "def456ghi789...i0",
  "chunkTxIds": [
    "chunk1_abc...",
    "chunk2_def...",
    "chunk3_ghi..."
  ],
  "chunkCount": 3,
  "viewUrls": {
    "transaction": "https://www.mvcscan.com/tx/def456ghi789...",
    "pin": "https://man.metaid.io/pin/def456ghi789...i0",
    "content": "https://file.metaid.io/metafile-indexer/api/v1/files/content/def456ghi789...i0",
    "accelerate": "https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/def456ghi789...i0"
  }
}
```

### 错误响应

```json
{
  "code": 1001,
  "message": "文件过大",
  "data": null
}
```

或来自监控脚本:

```json
{
  "success": false,
  "error": "任务监控失败或超时",
  "taskId": "task_abc123"
}
```

### 响应字段

| 字段 | 类型 | 说明 |
|-----|------|------|
| `txId` / `indexTxId` | string | 区块链上的主交易 ID |
| `pinId` | string | Pin 标识符,用于访问文件(格式: `{txId}i0`) |
| `contentUrl` | string | 直接内容链接(indexer),仅直接上传 JSON 返回 |
| `accelerateUrl` | string | 加速/下载链接(indexer),仅直接上传 JSON 返回 |
| `taskId` | string | 任务 ID,用于监控(仅分块上传) |
| `chunkTxIds` | array | 分块交易 ID 列表(仅分块上传) |
| `viewUrls` | object | 便捷 URL: transaction、pin、content(直接内容)、accelerate(加速/下载) |

### 使用结果

**在区块链上查看交易:**
```
https://www.mvcscan.com/tx/{txId}
```

**在 MetaID 上查看文件 pin:**
```
https://man.metaid.io/pin/{pinId}
```

**直接内容**（indexer，GET 返回文件流）:
```
https://file.metaid.io/metafile-indexer/api/v1/files/content/{pinId}
```

**加速/下载**（indexer，307 重定向至 OSS，适合下载或前端）:
```
https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/{pinId}
```

**通过本 skill 的 query_indexer.py 查询文件信息:**
```bash
# 使用 pinId 查询文件信息
curl https://file.metaid.io/metafile-indexer/api/v1/file/{pinId}
```

## 与 metabot-basic 集成

本 skill 需要来自 metabot-basic 的钱包信息。完整集成流程:

### 步骤 1: 使用 metabot-basic 创建钱包

```bash
# 创建新的 MetaID 代理
cd .claude/skills/metabot-basic && ts-node scripts/main.ts "创建代理 myagent"
```

这将在项目根目录创建 `account.json`:

```json
{
  "accountList": [
    {
      "mnemonic": "word1 word2 ... word12",
      "mvcAddress": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      "btcAddress": "...",
      "dogeAddress": "...",
      "publicKey": "...",
      "userName": "myagent",
      "globalMetaId": "a7f8d9e...",
      "metaIdPins": [...]
    }
  ]
}
```

### 步骤 2: 提取所需信息

```bash
# 提取地址
address=$(cat account.json | jq -r '.accountList[0].mvcAddress')

# 提取或计算 MetaID
# 方式 A: 使用已注册的 MetaID(如果有)
metaId=$(cat account.json | jq -r '.accountList[0].globalMetaId')

# 方式 B: 从地址计算
metaId=$(python scripts/calculate_metaid.py "$address" | jq -r '.metaId')

echo "地址: $address"
echo "MetaID: $metaId"
```

### 步骤 3: 在上传中使用

小文件直接上传请使用 **本 skill 的 metafs_direct_upload.ts** 或**一键脚本**（内部会调用该脚本），不要用 curl 发 JSON body——后端 DirectUpload 只接受 multipart/form-data（file + preTxHex 等）。

### 多个钱包

如果 `account.json` 中有多个钱包:

```bash
# 列出所有钱包
cat account.json | jq -r '.accountList[] | "\(.userName): \(.mvcAddress)"'

# 按索引选择特定钱包
address=$(cat account.json | jq -r '.accountList[1].mvcAddress')

# 按用户名选择
address=$(cat account.json | jq -r '.accountList[] | select(.userName=="myagent") | .mvcAddress')
```

### 一句话文件上链

用户可以说「把 res/file/xxx 上链」或「帮我把这个文件上链」后，Agent 推荐流程:

1. **使用 metabot-basic 的 account.json** 获取当前账户的 `mvcAddress`(如 `accountList[0].mvcAddress`)。
2. **按现有流程执行**: 余额检查(本 skill 的 `metafs_check_balance.ts`)、读取文件(`read_file_base64.py` 用于分块上传或由直接上传脚本自行读文件)，根据文件大小选择:
   - **5MB 以下**: 调用 **本 skill 的 `metafs_direct_upload.ts`**（或执行一键脚本）—— 本地构建并签名基础交易，再以 multipart 提交 DirectUpload(PreUpload→签名→DirectUpload)，无需在对话里手动调 API。
   - **5MB 以上**: 调用 **本 skill 的 `metafs_chunked_upload.ts`**（或一键脚本）完成 OSS 分片 → estimate → merge 签名 → 预交易 → 提交 task，再使用 `monitor_task.py` 监控。
3. 签名环节: 直接上传由 `metafs_direct_upload.ts` 内部通过 metabot-basic 的 `signTransaction` 完成；分块任务由后端或现有流程处理。

## 错误处理

### 常见错误及解决方案

#### 1. 文件未找到

**错误:**
```
Error: File not found: res/file/image.png
```

**解决方案:**
- 检查文件路径是否正确
- 确保文件存在于指定位置
- 验证文件权限

#### 2. 文件过大

**错误:**
```json
{
  "code": 1001,
  "message": "文件大小超出限制"
}
```

**解决方案:**
- 通过 `/api/v1/config` 检查当前大小限制
- 如可能压缩文件
- 拆分为多个文件

#### 3. 地址或 MetaID 无效

**错误:**
```json
{
  "code": 1002,
  "message": "地址格式无效"
}
```

**解决方案:**
- 验证地址是有效的 MVC 地址
- 使用 `calculate_metaid.py` 重新计算 MetaID
- 检查是否有拼写错误或多余空格

#### 4. 任务超时

**错误:**
```
⏰ 超时 300 秒后
```

**解决方案:**
- 增加超时参数: `python monitor_task.py <taskId> 600`
- 通过 API 手动检查任务状态
- 验证网络连接

#### 5. 网络错误

**错误:**
```
⚠️  网络错误: 连接超时
```

**解决方案:**
- 检查互联网连接
- 验证 API 端点可访问
- 使用更长超时重试
- 检查 API 是否维护中

### 调试技巧

**1. 详细输出**

为脚本启用详细输出:

```bash
# curl 请求添加 -v 标志
curl -v -X POST ...

# Python 脚本重定向 stderr
python scripts/monitor_task.py taskId 2>&1 | tee debug.log
```

**2. 验证文件数据**

上传前验证文件数据:

```bash
# 检查文件信息
python scripts/read_file_base64.py res/file/test.png | jq '{
  fileName,
  fileSizeMB,
  contentType,
  uploadMethod,
  base64Length
}'
```

**3. 测试 API 连接**

```bash
# 检查 API 健康
curl https://file.metaid.io/metafile-uploader/health

# 获取 API 配置
curl https://file.metaid.io/metafile-uploader/api/v1/config | jq '.'
```

**4. 验证钱包余额**

**强烈建议**在上传前检查余额(本 skill 的 metafs_check_balance.ts，内部使用 metabot-basic 的 getMvcBalance/fetchMVCUtxos):

```bash
cd .claude/skills/metabot-file

# 检查默认账户余额
npx ts-node scripts/metafs_check_balance.ts --account-file ../../../account.json --json

# 估算特定文件的上传费用
npx ts-node scripts/metafs_check_balance.ts --account-file ../../../account.json --file-size-mb 10.5 --json
```

余额不足时的解决方案:
- 向地址充值 MVC
- 使用测试网进行测试: `--network testnet`
- 在浏览器查看: `https://www.mvcscan.com/address/{address}`

## 高级用法

### 自定义重试逻辑

为失败上传实现自定义重试:

```bash
#!/bin/bash

max_retries=3
retry_count=0

while [ $retry_count -lt $max_retries ]; do
  response=$(curl -s -X POST ... 上传请求 ...)
  
  if echo "$response" | jq -e '.code == 0' > /dev/null; then
    echo "✅ 上传成功"
    break
  else
    retry_count=$((retry_count + 1))
    echo "⚠️  重试 $retry_count/$max_retries"
    sleep 5
  fi
done
```

### 进度回调

使用自定义进度处理监控任务:

```python
#!/usr/bin/env python3
import time
import requests

def monitor_with_callback(task_id, callback):
    while True:
        response = requests.get(f"{API_BASE}/api/v1/files/task/{task_id}")
        task = response.json()['data']
        
        # 自定义回调
        callback(task)
        
        if task['status'] in ['success', 'failed']:
            break
        
        time.sleep(5)

def my_callback(task):
    print(f"进度: {task['progress']}% - {task['stage']}")
    # 发送通知、更新数据库等

monitor_with_callback("task_id", my_callback)
```

### 并行上传

并行上传多个文件:

```bash
#!/bin/bash

# 后台上传文件
for file in res/file/*; do
  (upload_file "$file") &
done

# 等待所有上传完成
wait

echo "所有上传已完成"
```

## 最佳实践

### 1. 文件组织

```
project/
├── res/
│   └── file/
│       ├── images/      # 按类型组织
│       ├── videos/
│       └── documents/
└── uploads/
    └── logs/            # 保存上传日志
```

### 2. 错误恢复

- 始终保存分块上传的 taskId
- 记录所有上传尝试
- 为临时失败实现重试逻辑
- 删除本地文件前验证上传成功

### 3. 性能优化

- 对 5MB 以下文件使用直接上传(更快)
- 批量上传多个小文件
- 监控网络状况
- 根据文件大小调整轮询间隔

### 4. 安全考虑

- 绝不将 `account.json` 提交到版本控制
- 安全存储钱包信息
- 上传前验证文件内容
- 使用适当的文件权限

## 故障排查

### 问题: 脚本不可执行

**症状:**
```
permission denied: ./scripts/calculate_metaid.py
```

**解决方案:**
```bash
chmod +x .claude/skills/metabot-file/scripts/*.py
```

### 问题: 缺少依赖

**症状:**
```
ModuleNotFoundError: No module named 'requests'
```

**解决方案:**
```bash
pip install requests
```

### 问题: 任务卡在处理中

**症状:**
任务长时间保持"处理中"状态。

**解决方案:**
1. 通过 API 手动检查任务状态
2. 验证后端服务健康
3. 如问题持续请联系 API 支持
4. 任务可能仍会完成 - 延长监控时间

### 问题: 分块上传后 jq 解析失败或未显示 TxID/PinID

**症状:**
一键脚本在「步骤 5: 监控上传进度」后报 `jq: parse error` 或最终结果里交易 ID/PinID 为空。

**解决方案:**
1. 任务可能已在服务端成功完成。手动查询任务结果获取 `index_tx_id` 与 PinID（即 `{index_tx_id}i0`）：
   ```bash
   curl -s "https://file.metaid.io/metafile-uploader/api/v1/files/task/<taskId>" | jq '.data | {status, index_tx_id, chunk_tx_ids}'
   ```
2. 确保使用最新版 `monitor_task.py`：进度输出到 stderr、最终单行 JSON 到 stdout，且解析 API 返回的 snake_case（`index_tx_id`）并输出 camelCase（`indexTxId`）供 shell/jq 使用。

### 问题: Base64 内容过大

**症状:**
请求实体过大错误。

**解决方案:**
- 文件超出 API 限制
- 通过 `/api/v1/config` 检查当前限制
- 对大文件使用分块上传
- 上传前压缩文件

## 文件查询与索引

本 skill 提供基于 Meta 文件索引服务的查询能力（Base URL: **`https://file.metaid.io/metafile-indexer`**）。

### Base URL

所有索引请求的基础路径为：**`https://file.metaid.io/metafile-indexer`**（不要使用其他 domain）。

### 查询用户信息

根据 **address**、**metaid** 或 **globalMetaID** 任选一种方式查询，使用 `/api/info/*` 路径（MetaID 兼容格式）：

| 查询依据      | 路径 |
|---------------|------|
| address       | `GET /api/info/address/:address` |
| metaid        | `GET /api/info/metaid/:metaidOrGlobalMetaId`（同时支持 metaid 或 globalMetaId） |
| globalMetaID  | `GET /api/info/globalmetaid/:globalMetaID` |

- 成功响应：`{ "code": 1, "data": MetaIDUserInfo }`。
- 展示用字段：`globalMetaId`, `metaid`, `name`, `address`, `avatar`, `avatarId`。其中 `avatar` 为相对路径如 `/content/{avatarPinId}`，`avatarId` 即头像的 pinId。

也可使用 v1 路径：`/api/v1/users/address/:address`、`/api/v1/users/metaid/:metaId`（v1 的 metaid 不支持 globalMetaId，需单独用 `/api/info/globalmetaid/:globalMetaID`）。v1 响应为 `{ "code": 0, "data": IndexerUserInfo }`，头像字段为 `avatarPinId`。

### 头像展示

- **判断是否有头像**：用户信息中 `avatarId`（MetaID 格式）或 `avatarPinId`（v1）非空即有头像。
- **头像图片 URL**（任选其一）：
  - `{BASE}/content/{avatarPinId}`（推荐，根路径）
  - `{BASE}/api/v1/users/avatar/content/{pinId}`
- 示例：`https://file.metaid.io/metafile-indexer/content/abc123...`
- 在 Markdown 中展示：`![avatar](https://file.metaid.io/metafile-indexer/content/{avatarPinId})`

### 根据 pinId 查询文件

1. **文件元数据**：`GET /api/v1/files/:pinId` → 返回 IndexerFileResponse（pinId、name、size、contentType 等）。
2. **文件内容**：
   - 直接内容：`GET /api/v1/files/content/:pinId` → 二进制流，按 Content-Type/文件名处理。
   - 加速（重定向 OSS）：`GET /api/v1/files/accelerate/content/:pinId` → 307 重定向，适合前端或下载链接。

流程：先用 `/api/v1/files/:pinId` 取元数据，再按需调用 content 或 accelerate 获取内容或下载链接。

### 使用请求脚本

本 skill 提供可执行脚本 `scripts/query_indexer.py`，对上述 Base URL 发起 GET 请求。

- **查用户**（三选一）：
  - `python3 .claude/skills/metabot-file/scripts/query_indexer.py user --address <address>`
  - `python3 .claude/skills/metabot-file/scripts/query_indexer.py user --metaid <metaid>`
  - `python3 .claude/skills/metabot-file/scripts/query_indexer.py user --globalmetaid <globalMetaID>`
- **查文件**：
  - `python3 .claude/skills/metabot-file/scripts/query_indexer.py file --pinid <pinId>`

（在项目根执行时使用上述路径；若已 `cd .claude/skills/metabot-file` 则可写 `python3 scripts/query_indexer.py`。）

脚本内 Base URL 固定为 `https://file.metaid.io/metafile-indexer`；可通过环境变量 `METAFS_INDEXER_BASE_URL` 覆盖。

- **输出**：stdout 为完整 JSON（便于管道处理，如 `| jq`）；摘要行打印到 stderr：有头像时输出 `AVATAR_URL=<完整头像图片 URL>`，查文件时输出 `CONTENT_URL=` 与 `ACCELERATE_URL=`。

索引 API 详细路径与响应字段见 [references/api.md](references/api.md)。

## 弃用说明

- **原 metafs-uploader 与 metafs-indexer**：已合并为本 skill（metabot-file），请统一使用本 skill 的脚本与文档。
- **check_balance.py**：已移除，余额检查请使用本 skill 的 `metafs_check_balance.ts`。
- **calculate_metaid.py**：为可选工具，主流程不依赖；需要单独从地址计算 metaId 时可用（一键脚本通过 `metafs_account_info.ts` 直接输出 metaId）。
- **直接上传 (curl JSON)**：后端 DirectUpload 仅接受 multipart/form-data（file + preTxHex 等），不再接受 JSON body。小文件直接上传由 **本 skill 的 `metafs_direct_upload.ts`** 实现（本地构建并签名基础交易后以 multipart 提交）；一键脚本在「直接上传」分支会调用该脚本。

## 参考

详细的 API 规范和额外示例,请参阅:

- **[API 参考](references/api_reference.md)** - 完整 API 文档
- **[上传示例](references/upload_examples.md)** - 实际使用示例

## 相关资源

- **MetaID 文档**: https://docs.metaid.io/
- **MVC 区块链浏览器**: https://www.mvcscan.com/
- **MetaID Pin 浏览器**: https://man.metaid.io/
- **API Swagger 文档**: https://file.metaid.io/metafile-uploader/swagger/index.html

## 支持

如有问题:

1. 查看本文档和错误处理部分
2. 查阅 API 参考了解详细规范
3. 验证钱包和网络配置
4. 联系 API 支持团队

---

**最后更新**: 2025-02-12
