#!/bin/bash

# TaskHub MCP Server - Production Deployment Script
# This script handles building and deploying the TaskHub MCP server

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IMAGE_NAME="taskhub-mcp"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CONTAINER_NAME="taskhub-mcp-server"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
TaskHub MCP Server Deployment Script

Usage: $0 [OPTIONS] COMMAND

Commands:
    build       Build the Docker image
    deploy      Deploy the container
    restart     Restart the container
    stop        Stop the container
    logs        Show container logs
    health      Check container health
    clean       Clean up old images and containers

Options:
    -t, --tag TAG       Docker image tag (default: latest)
    -e, --env FILE      Environment file (default: .env)
    -h, --help          Show this help message

Examples:
    $0 build
    $0 deploy --env .env.production
    $0 restart
    $0 logs --follow
    $0 clean

EOF
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log_error "package.json not found. Are you in the correct directory?"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Build Docker image
build_image() {
    log_info "Building Docker image: $IMAGE_NAME:$IMAGE_TAG"
    
    cd "$PROJECT_ROOT"
    
    # Build the image
    docker build \
        --tag "$IMAGE_NAME:$IMAGE_TAG" \
        --tag "$IMAGE_NAME:latest" \
        --build-arg NODE_ENV=production \
        .
    
    log_success "Docker image built successfully"
}

# Deploy container
deploy_container() {
    local env_file="${ENV_FILE:-.env}"
    
    log_info "Deploying container with environment file: $env_file"
    
    cd "$PROJECT_ROOT"
    
    # Check if environment file exists
    if [[ ! -f "$env_file" ]]; then
        log_warning "Environment file $env_file not found. Creating from template..."
        cp .env.production "$env_file"
        log_warning "Please edit $env_file with your configuration before running again"
        exit 1
    fi
    
    # Stop existing container if running
    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        log_info "Stopping existing container..."
        docker stop "$CONTAINER_NAME" || true
        docker rm "$CONTAINER_NAME" || true
    fi
    
    # Deploy using docker-compose
    ENV_FILE="$env_file" docker-compose up -d
    
    log_success "Container deployed successfully"
    
    # Wait for health check
    log_info "Waiting for health check..."
    sleep 10
    
    if docker ps -q -f name="$CONTAINER_NAME" -f health=healthy | grep -q .; then
        log_success "Container is healthy and running"
    else
        log_warning "Container may not be healthy. Check logs with: $0 logs"
    fi
}

# Restart container
restart_container() {
    log_info "Restarting container..."
    
    cd "$PROJECT_ROOT"
    docker-compose restart
    
    log_success "Container restarted"
}

# Stop container
stop_container() {
    log_info "Stopping container..."
    
    cd "$PROJECT_ROOT"
    docker-compose down
    
    log_success "Container stopped"
}

# Show logs
show_logs() {
    local follow_flag=""
    if [[ "${1:-}" == "--follow" ]]; then
        follow_flag="-f"
    fi
    
    cd "$PROJECT_ROOT"
    docker-compose logs $follow_flag
}

# Check health
check_health() {
    log_info "Checking container health..."
    
    if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
        local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
        
        case "$health_status" in
            "healthy")
                log_success "Container is healthy"
                ;;
            "unhealthy")
                log_error "Container is unhealthy"
                exit 1
                ;;
            "starting")
                log_info "Container is starting..."
                ;;
            *)
                log_warning "Health status unknown or container not found"
                ;;
        esac
    else
        log_error "Container is not running"
        exit 1
    fi
}

# Clean up
clean_up() {
    log_info "Cleaning up old images and containers..."
    
    # Remove stopped containers
    docker container prune -f
    
    # Remove unused images
    docker image prune -f
    
    # Remove old versions of our image (keep latest 3)
    docker images "$IMAGE_NAME" --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}" | \
        tail -n +2 | sort -k2 -r | tail -n +4 | awk '{print $1}' | \
        xargs -r docker rmi || true
    
    log_success "Cleanup completed"
}

# Parse command line arguments
ENV_FILE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -e|--env)
            ENV_FILE="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        build|deploy|restart|stop|logs|health|clean)
            COMMAND="$1"
            shift
            break
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Check if command was provided
if [[ -z "${COMMAND:-}" ]]; then
    log_error "No command provided"
    show_help
    exit 1
fi

# Run the command
case "$COMMAND" in
    build)
        check_prerequisites
        build_image
        ;;
    deploy)
        check_prerequisites
        build_image
        deploy_container
        ;;
    restart)
        restart_container
        ;;
    stop)
        stop_container
        ;;
    logs)
        show_logs "${1:-}"
        ;;
    health)
        check_health
        ;;
    clean)
        clean_up
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
