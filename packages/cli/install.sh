#!/bin/bash

#
# Burger API CLI Installer (Linux/macOS)
#
# This script installs the Burger API CLI on your system.
# It downloads the appropriate executable and adds it to your PATH.
#
# Usage: curl -fsSL https://burger-api.com/install.sh | bash
#

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Symbols
CHECKMARK="${GREEN}[✓]${NC}"
CROSS="${RED}[X]${NC}"
INFO="${BLUE}[i]${NC}"

# Print functions
print_success() {
    echo -e "${CHECKMARK} $1"
}

print_error() {
    echo -e "${CROSS} $1"
}

print_info() {
    echo -e "${INFO} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}$1${NC}"
    echo ""
}

# Check if curl is installed
if ! command -v curl &> /dev/null; then
    print_error "curl is required but not installed"
    print_info "Install curl and try again"
    exit 1
fi

print_header " > BurgerAPI CLI Installer"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

print_info "Detected OS: $OS"
print_info "Detected Architecture: $ARCH"

# Determine which executable to download
if [ "$OS" = "linux" ]; then
    if [ "$ARCH" = "x86_64" ]; then
        EXECUTABLE_NAME="burger-api-linux"
    elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        print_error "ARM64 Linux is not supported yet"
        exit 1
    else
        print_error "Unsupported architecture: $ARCH"
        exit 1
    fi
elif [ "$OS" = "darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        EXECUTABLE_NAME="burger-api-mac"
    elif [ "$ARCH" = "x86_64" ]; then
        EXECUTABLE_NAME="burger-api-mac-intel"
    else
        print_error "Unsupported architecture: $ARCH"
        exit 1
    fi
else
    print_error "Unsupported OS: $OS"
    print_info "This installer only works on Linux and macOS"
    print_info "For Windows, please use install.ps1"
    exit 1
fi

# Get the latest version from GitHub API
print_info "Checking for latest version..."
LATEST_VERSION=$(curl -s https://api.github.com/repos/isfhan/burger-api/releases/latest | grep '"tag_name"' | cut -d '"' -f 4)

if [ -z "$LATEST_VERSION" ]; then
    print_error "Could not determine latest version"
    print_info "Please check your internet connection"
    exit 1
fi

print_success "Latest version: $LATEST_VERSION"

# Create installation directory
INSTALL_DIR="$HOME/.burger-api/bin"
print_info "Creating installation directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Download URL
DOWNLOAD_URL="https://github.com/isfhan/burger-api/releases/download/$LATEST_VERSION/$EXECUTABLE_NAME"
INSTALL_PATH="$INSTALL_DIR/burger-api"

# Download the executable
print_info "Downloading from GitHub..."
if curl -fsSL -o "$INSTALL_PATH" "$DOWNLOAD_URL"; then
    print_success "Downloaded successfully"
else
    print_error "Failed to download"
    print_info "URL: $DOWNLOAD_URL"
    exit 1
fi

# Make it executable
chmod +x "$INSTALL_PATH"
print_success "Made executable"

# Add to PATH if not already there
SHELL_CONFIG=""
if [ -n "$BASH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
elif [ -n "$ZSH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
else
    # Try to detect from SHELL variable
    case "$SHELL" in
        */bash)
            SHELL_CONFIG="$HOME/.bashrc"
            ;;
        */zsh)
            SHELL_CONFIG="$HOME/.zshrc"
            ;;
        *)
            print_error "Could not detect shell configuration file"
            print_info "Please manually add $INSTALL_DIR to your PATH"
            ;;
    esac
fi

# Check if already in PATH
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    if [ -n "$SHELL_CONFIG" ] && [ -f "$SHELL_CONFIG" ]; then
        print_info "Adding to PATH in $SHELL_CONFIG"
        echo "" >> "$SHELL_CONFIG"
        echo "# > BurgerAPI CLI" >> "$SHELL_CONFIG"
        echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> "$SHELL_CONFIG"
        print_success "Added to PATH"
        
        # Source the config file
        print_info "To use burger-api in this session, run:"
        echo ""
        echo "    source $SHELL_CONFIG"
        echo ""
    fi
else
    print_success "Already in PATH"
fi

# Verify installation
print_header "Installation Complete!"
print_success "burger-api has been installed to $INSTALL_PATH"
print_info "Version: $LATEST_VERSION"
echo ""
print_info "To verify installation, run:"
echo ""
echo "    burger-api --version"
echo ""
print_info "To get started, create a new project:"
echo ""
echo "    burger-api create my-awesome-api"
echo ""
print_success "Happy coding! 🎉"

