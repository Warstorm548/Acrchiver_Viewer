#!/bin/bash

# OpenCloud Archive Viewer Installation Script
# This script installs the Archive Viewer app into an OpenCloud instance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  OpenCloud Archive Viewer Installer   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${YELLOW}Warning: Running as root. Consider using a regular user.${NC}"
fi

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}Error: pnpm is not installed${NC}"
    echo "Install pnpm: npm install -g pnpm"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Install Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

# Install dependencies
echo "Installing dependencies..."
pnpm install --frozen-lockfile

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to install dependencies${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Build the application
echo "Building application..."
pnpm build

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Build completed${NC}"
echo ""

# Prompt for installation directory
read -p "Enter OpenCloud apps directory path [/var/lib/opencloud/apps]: " APPS_DIR
APPS_DIR=${APPS_DIR:-/var/lib/opencloud/apps}

# Create directory if it doesn't exist
if [ ! -d "$APPS_DIR" ]; then
    echo "Creating apps directory: $APPS_DIR"
    mkdir -p "$APPS_DIR"
fi

# Copy files
APP_DEST="$APPS_DIR/archive-viewer"
echo "Installing to: $APP_DEST"

if [ -d "$APP_DEST" ]; then
    read -p "Directory exists. Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled"
        exit 0
    fi
    rm -rf "$APP_DEST"
fi

cp -r dist "$APP_DEST"

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to copy files${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Files copied${NC}"
echo ""

# Set permissions
echo "Setting permissions..."
chmod -R 755 "$APP_DEST"

echo -e "${GREEN}✓ Permissions set${NC}"
echo ""

# Update OpenCloud configuration
echo -e "${YELLOW}Manual step required:${NC}"
echo "Add the following to your OpenCloud config.json:"
echo ""
echo -e "${GREEN}{
  \"apps\": [
    {
      \"id\": \"archive-viewer\",
      \"path\": \"$APP_DEST\"
    }
  ]
}${NC}"
echo ""

# Docker deployment option
read -p "Deploy using Docker? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Building Docker image..."
    docker build -t opencloud/web-app-archive-viewer:1.0.0 .
    
    echo "Starting container..."
    docker-compose up -d
    
    echo -e "${GREEN}✓ Docker deployment complete${NC}"
    echo "Access the app at: http://localhost:8080/archive-viewer"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Installation completed! 🎉         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "1. Restart your OpenCloud instance"
echo "2. Refresh the web interface"
echo "3. Open an archive file to use Archive Viewer"
echo ""
echo "For documentation, visit:"
echo "https://docs.opencloud.eu/apps/archive-viewer"
