# Goal Mate 身份验证系统

Goal Mate 现在配备了简单但有效的身份验证系统，确保只有授权用户才能访问应用。

## 🔐 功能特性

- **简单登录**: 用户名/密码登录方式
- **JWT认证**: 基于JSON Web Token的会话管理
- **自动重定向**: 未登录用户自动跳转到登录页面
- **会话保持**: 7天免重新登录
- **安全退出**: 一键安全退出登录

## 🚀 使用方法

### 1. 配置身份验证

在 `.env` 文件中设置以下环境变量：

```env
# 身份验证配置
AUTH_USERNAME="admin"                    # 登录用户名
AUTH_PASSWORD="your-secure-password"     # 登录密码  
AUTH_SECRET="your-jwt-secret-key"        # JWT签名密钥
```

**重要提示**:
- `AUTH_PASSWORD`: 建议使用包含大小写字母、数字和特殊字符的强密码
- `AUTH_SECRET`: 必须至少32字符长，建议使用随机生成的字符串

### 2. 生成安全的JWT密钥

使用以下命令生成安全的JWT密钥：

```bash
# 生成32字节的随机字符串
openssl rand -base64 32
```

将生成的字符串设置为 `AUTH_SECRET` 的值。

### 3. 首次登录

1. 启动应用后，访问任何页面都会自动跳转到登录页面
2. 输入在 `.env` 中配置的用户名和密码
3. 登录成功后会自动跳转到主页

### 4. 退出登录

点击右上角的用户菜单，选择"退出登录"即可安全退出。

## 🛡️ 安全特性

### 中间件保护
- 所有页面和API路由都受到身份验证保护
- 未授权访问自动重定向到登录页面
- API请求返回适当的HTTP状态码

### JWT令牌管理
- 令牌有效期：7天
- HttpOnly Cookie存储，防止XSS攻击
- 安全的签名验证机制

### 密码安全
- 环境变量存储敏感信息
- 不在代码中硬编码凭据
- 支持强密码策略

## 📁 文件结构

```
src/
├── lib/
│   └── auth.ts                 # 身份验证工具函数
├── app/
│   ├── login/
│   │   └── page.tsx           # 登录页面
│   └── api/auth/
│       ├── login/route.ts     # 登录API
│       ├── logout/route.ts    # 退出API
│       └── me/route.ts        # 用户信息API
├── components/
│   ├── LoginForm.tsx          # 登录表单组件
│   └── UserMenu.tsx           # 用户菜单组件
└── middleware.ts               # 身份验证中间件
```

## 🔧 API端点

### POST /api/auth/login
登录认证

**请求体**:
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**响应**:
```json
{
  "success": true,
  "message": "登录成功",
  "user": {
    "username": "admin"
  }
}
```

### POST /api/auth/logout
退出登录

**响应**:
```json
{
  "success": true,
  "message": "退出登录成功"
}
```

### GET /api/auth/me
获取当前用户信息

**响应**:
```json
{
  "success": true,
  "user": {
    "username": "admin"
  }
}
```

## 🎨 UI组件

### 登录页面
- 现代化设计的登录界面
- 表单验证和错误提示
- 响应式布局
- 加载状态指示

### 用户菜单
- 右上角用户头像菜单
- 显示当前登录用户
- 一键退出登录功能
- 点击外部自动关闭

## 🔄 自定义配置

### 修改会话有效期
在 `src/lib/auth.ts` 中修改：

```typescript
export function createToken(username: string): string {
  return jwt.sign({ username }, getJWTSecret(), { 
    expiresIn: '30d' // 改为30天
  });
}
```

### 添加更多用户
目前系统支持单用户。如需支持多用户，可以：

1. 使用数据库存储用户信息
2. 添加用户注册功能
3. 实现基于角色的权限控制

### 自定义登录页面
修改 `src/components/LoginForm.tsx` 来自定义登录页面的外观和行为。

## 🚨 注意事项

1. **环境变量安全**: 确保 `.env` 文件不被提交到代码仓库
2. **生产环境**: 在生产环境中使用环境变量而非 `.env` 文件
3. **HTTPS**: 生产环境建议使用HTTPS来保护登录凭据传输
4. **密钥轮换**: 定期更换JWT密钥以提高安全性

## 🐛 故障排除

### 登录失败
- 检查用户名和密码是否正确
- 确认环境变量配置无误
- 查看浏览器控制台错误信息

### 会话过期
- 重新登录即可
- 检查JWT密钥是否正确配置

### 中间件错误
- 确保 `middleware.ts` 在项目根目录
- 检查文件导入路径是否正确 