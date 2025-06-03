# 环境变量配置模板

请复制以下内容到你的 `.env` 文件中，并根据实际情况修改相应的值：

```env
# 数据库连接URL（连接到你的独立数据库）
DATABASE_URL="postgresql://username:password@your-db-host:5432/goalmate"

# OpenAI API 配置
OPENAI_API_KEY="your-openai-api-key"
OPENAI_BASE_URL="https://api.openai.com/v1"

# 如果使用阿里云通义千问，请注释上面的OPENAI_BASE_URL，取消注释下面的行
# OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

# 身份验证配置
AUTH_USERNAME="admin"
AUTH_PASSWORD="your-secure-password"
AUTH_SECRET="your-jwt-secret-key-at-least-32-chars-long"
```

## 配置说明

### 数据库配置
- `DATABASE_URL`: PostgreSQL数据库连接字符串，格式为 `postgresql://用户名:密码@主机:端口/数据库名`

### OpenAI API配置
- `OPENAI_API_KEY`: OpenAI API密钥，获取地址：https://platform.openai.com/api-keys
- `OPENAI_BASE_URL`: API基础URL，默认为OpenAI官方地址

### 身份验证配置
- `AUTH_USERNAME`: 登录用户名，可以自定义
- `AUTH_PASSWORD`: 登录密码，建议使用强密码
- `AUTH_SECRET`: JWT签名密钥，必须至少32字符长，用于加密登录令牌

## 安全建议

1. **密码安全**: `AUTH_PASSWORD` 应该使用强密码，包含大小写字母、数字和特殊字符
2. **JWT密钥**: `AUTH_SECRET` 应该是随机生成的长字符串，可以使用以下命令生成：
   ```bash
   openssl rand -base64 32
   ```
3. **环境隔离**: 不要将 `.env` 文件提交到代码仓库，确保它在 `.gitignore` 中
4. **生产环境**: 在生产环境中，建议使用环境变量而不是 `.env` 文件来配置敏感信息

## 示例配置

```env
# 示例配置 - 请替换为实际值
DATABASE_URL="postgresql://goalmate_user:MySecurePassword123@localhost:5432/goalmate"
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
OPENAI_BASE_URL="https://api.openai.com/v1"
AUTH_USERNAME="admin"
AUTH_PASSWORD="MyVerySecurePassword123!"
AUTH_SECRET="abcdef1234567890abcdef1234567890abcdef1234567890"
``` 