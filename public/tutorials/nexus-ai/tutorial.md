开始前，请先登录 Nexus AI。接下来按顺序创建 API 密钥、导入 CC Switch，再选择要使用的模型。

## 准备工作

### 1. 登录 Nexus AI

登录 Nexus AI，进入控制台。

### 2. 打开 API 密钥页面

在左侧菜单点击 **API 密钥**。

![Nexus AI 控制台中的 API 密钥入口](/tutorials/nexus-ai/image.png)

## 创建 API 密钥

### 3. 新建密钥

在 API 密钥页面点击 **创建密钥**。

![创建密钥按钮](/tutorials/nexus-ai/image%201.png)

### 4. 填写密钥信息

在创建界面填写以下内容：

- **名称**：填写便于自己识别的名称，后续可以修改。
- **厂商**：在 Claude Code 中使用请选择 **Anthropic**；在 Codex 中使用请选择 **OpenAI**。使用除 DeepSeek 外的国产模型，也请选择 **OpenAI**。
- **分组**：按需要选择。不同分组会影响价格和性能。

确认无误后，点击 **创建**。

![密钥名称、厂商和分组设置](/tutorials/nexus-ai/image%202.png)

### 5. 确认创建成功

密钥创建完成后会显示如下页面。

![创建完成后的密钥页面](/tutorials/nexus-ai/image%203.png)

## 导入 CC Switch

### 6. 选择使用方式

如果熟悉 API 调用命令和配置，可以点击 **使用密钥**，自行完成配置。

如果希望通过 CC Switch 配置，请先安装 CC Switch，再点击 **导入到 CCS**。跳转后点击 **导入**。

![CC Switch 的导入确认界面](/tutorials/nexus-ai/image%204.png)

### 7. 启用配置

导入完成后，CC Switch 会显示新配置。点击 **启用** 即可应用；点击“启用”右侧的图标可以继续配置。

![CC Switch 中导入的配置](/tutorials/nexus-ai/image%205.png)

### 8. 选择模型

在配置界面点击 **高级选项**，向下滚动到模型设置。

![CC Switch 高级选项入口](/tutorials/nexus-ai/image%206.png)

按图中顺序操作：

1. 点击 **获取模型列表**，拉取最新可用模型。
2. 打开刚获取的模型列表，选择要使用的模型。
3. 点击一键设置按钮，最后保存配置。

![获取模型列表、选择模型并保存设置](/tutorials/nexus-ai/image%207.png)
