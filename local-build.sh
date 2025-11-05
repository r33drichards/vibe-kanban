#!/bin/bash

set -e  # Exit on any error

# Detect platform and architecture
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Linux)
    PLATFORM="linux"
    ;;
  Darwin)
    PLATFORM="macos"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    PLATFORM="windows"
    ;;
  *)
    echo "❌ Unsupported OS: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64)
    PLATFORM_ARCH="${PLATFORM}-x64"
    ;;
  arm64|aarch64)
    PLATFORM_ARCH="${PLATFORM}-arm64"
    ;;
  *)
    echo "❌ Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

echo "🖥️  Detected platform: $PLATFORM_ARCH"

echo "🧹 Cleaning previous builds..."
rm -rf npx-cli/dist
mkdir -p "npx-cli/dist/$PLATFORM_ARCH"

echo "🔨 Building frontend..."
(cd frontend && npm run build)

echo "🔨 Building Rust binaries..."
cargo build --release --manifest-path Cargo.toml
cargo build --release --bin mcp_task_server --manifest-path Cargo.toml

echo "📦 Creating distribution package..."

# Determine binary extension
if [ "$PLATFORM" = "windows" ]; then
  BIN_EXT=".exe"
else
  BIN_EXT=""
fi

# Copy the main binary
cp "target/release/server${BIN_EXT}" "vibe-kanban${BIN_EXT}"
zip -q vibe-kanban.zip "vibe-kanban${BIN_EXT}"
rm -f "vibe-kanban${BIN_EXT}"
mv vibe-kanban.zip "npx-cli/dist/$PLATFORM_ARCH/vibe-kanban.zip"

# Copy the MCP binary
cp "target/release/mcp_task_server${BIN_EXT}" "vibe-kanban-mcp${BIN_EXT}"
zip -q vibe-kanban-mcp.zip "vibe-kanban-mcp${BIN_EXT}"
rm -f "vibe-kanban-mcp${BIN_EXT}"
mv vibe-kanban-mcp.zip "npx-cli/dist/$PLATFORM_ARCH/vibe-kanban-mcp.zip"

echo "✅ NPM package ready!"
echo "📁 Files created:"
echo "   - npx-cli/dist/$PLATFORM_ARCH/vibe-kanban.zip"
echo "   - npx-cli/dist/$PLATFORM_ARCH/vibe-kanban-mcp.zip"
