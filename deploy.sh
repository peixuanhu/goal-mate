#!/bin/bash

# Goal Mate 应用部署脚本
# 作者: Goal Mate Team
# 用法: ./deploy.sh [option]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${2}${1}${NC}"
}

# 检查是否安装了 Docker 和 Docker Compose
check_docker() {
    print_message "检查 Docker 安装..." $BLUE
    
    if ! command -v docker &> /dev/null; then
        print_message "❌ Docker 未安装。请先安装 Docker。" $RED
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_message "❌ Docker Compose 未安装。请先安装 Docker Compose。" $RED
        exit 1
    fi
    
    print_message "✅ Docker 和 Docker Compose 已安装" $GREEN
}

# 检查环境变量文件
check_env() {
    print_message "检查环境变量配置..." $BLUE
    
    if [ ! -f .env ]; then
        print_message "⚠️  .env 文件不存在，正在创建模板..." $YELLOW
        cat > .env << EOF
# 数据库连接URL（连接到你的独立数据库）
DATABASE_URL=your-database-url

# OpenAI API 配置
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1

# 如果使用阿里云通义千问，请注释上面的OPENAI_BASE_URL，取消注释下面的行
# OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 身份验证配置
AUTH_USERNAME=admin
AUTH_PASSWORD=your-secure-password
AUTH_SECRET=your-jwt-secret-key-at-least-32-chars-long
EOF
        
        print_message "📝 请编辑 .env 文件设置正确的环境变量，然后重新运行此脚本" $YELLOW
        print_message "   nano .env" $BLUE
        print_message "" $NC
        print_message "💡 提示：" $YELLOW
        print_message "   1. AUTH_PASSWORD 建议使用强密码" $BLUE
        print_message "   2. AUTH_SECRET 必须至少32字符，可用命令生成：openssl rand -base64 32" $BLUE
        print_message "   3. 详细配置说明请查看 ENV_TEMPLATE.md" $BLUE
        exit 1
    fi
    
    # 检查是否配置了必需的环境变量
    source .env
    
    if [[ "$DATABASE_URL" == "your-database-url" ]] || [[ -z "$DATABASE_URL" ]]; then
        print_message "❌ 请在 .env 文件中设置 DATABASE_URL" $RED
        exit 1
    fi
    
    if [[ "$OPENAI_API_KEY" == "your-openai-api-key" ]] || [[ -z "$OPENAI_API_KEY" ]]; then
        print_message "❌ 请在 .env 文件中设置 OPENAI_API_KEY" $RED
        exit 1
    fi
    
    if [[ "$AUTH_USERNAME" == "admin" ]] && [[ "$AUTH_PASSWORD" == "your-secure-password" ]]; then
        print_message "⚠️  警告：你还在使用默认的身份验证配置，建议修改 AUTH_PASSWORD" $YELLOW
    fi
    
    if [[ "$AUTH_SECRET" == "your-jwt-secret-key-at-least-32-chars-long" ]] || [[ -z "$AUTH_SECRET" ]]; then
        print_message "❌ 请在 .env 文件中设置 AUTH_SECRET（至少32字符）" $RED
        exit 1
    fi
    
    if [[ ${#AUTH_SECRET} -lt 32 ]]; then
        print_message "❌ AUTH_SECRET 必须至少32字符长" $RED
        exit 1
    fi
    
    print_message "✅ 环境变量配置检查通过" $GREEN
}

# 构建和启动服务
start_services() {
    print_message "开始构建和启动服务..." $BLUE
    
    # 构建镜像
    print_message "🔨 构建应用镜像..." $BLUE
    docker-compose build --no-cache
    
    # 启动服务
    print_message "🚀 启动服务..." $BLUE
    docker-compose up -d
    
    # 等待服务启动
    print_message "⏳ 等待服务启动..." $BLUE
    sleep 15
    
    # 检查服务状态
    print_message "📊 检查服务状态..." $BLUE
    docker-compose ps
}

# 停止服务
stop_services() {
    print_message "停止所有服务..." $YELLOW
    docker-compose down
    print_message "✅ 服务已停止" $GREEN
}

# 重启服务
restart_services() {
    print_message "重启服务..." $BLUE
    docker-compose restart
    print_message "✅ 服务已重启" $GREEN
}

# 查看日志
show_logs() {
    print_message "显示应用日志..." $BLUE
    docker-compose logs -f app
}

# 清理 Docker
cleanup() {
    print_message "清理 Docker 资源..." $YELLOW
    
    read -p "确定要清理未使用的 Docker 资源吗？(y/N): " confirm
    if [[ $confirm =~ ^[Yy]$ ]]; then
        docker system prune -f
        print_message "✅ Docker 资源清理完成" $GREEN
    else
        print_message "取消清理操作" $BLUE
    fi
}

# 显示帮助信息
show_help() {
    echo "Goal Mate 部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  start     - 检查环境并启动服务"
    echo "  stop      - 停止所有服务"
    echo "  restart   - 重启服务"
    echo "  logs      - 查看应用日志"
    echo "  cleanup   - 清理 Docker 资源"
    echo "  status    - 查看服务状态"
    echo "  help      - 显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 start    # 首次部署"
    echo "  $0 logs     # 查看日志"
}

# 查看服务状态
show_status() {
    print_message "服务状态:" $BLUE
    docker-compose ps
    
    echo ""
    print_message "应用访问地址:" $GREEN
    echo "  本地: http://localhost:3000"
    echo "  网络: http://$(hostname -I | awk '{print $1}'):3000"
}

# 主函数
main() {
    case "${1:-help}" in
        "start")
            check_docker
            check_env
            start_services
            show_status
            print_message "🎉 Goal Mate 应用部署成功！" $GREEN
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            restart_services
            ;;
        "logs")
            show_logs
            ;;
        "cleanup")
            cleanup
            ;;
        "status")
            show_status
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# 确保脚本在项目根目录运行
if [ ! -f "package.json" ]; then
    print_message "❌ 请在项目根目录运行此脚本" $RED
    exit 1
fi

# 运行主函数
main "$@" 