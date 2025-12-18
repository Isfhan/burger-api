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
    print_info "Could not connect to GitHub API. Please check your internet connection."
    print_info "If the problem persists, GitHub API might be temporarily unavailable."
    exit 1
fi

print_success "Latest version: $LATEST_VERSION"

# Create installation directory
INSTALL_DIR="$HOME/.burger-api/bin"
print_info "Creating installation directory: $INSTALL_DIR"
if ! mkdir -p "$INSTALL_DIR"; then
    print_error "Could not create installation directory"
    print_info "Permission denied. You may need to check directory permissions."
    print_info "Directory: $INSTALL_DIR"
    exit 1
fi

# Download URL
DOWNLOAD_URL="https://github.com/isfhan/burger-api/releases/download/$LATEST_VERSION/$EXECUTABLE_NAME"
INSTALL_PATH="$INSTALL_DIR/burger-api"

# Download the executable
print_info "Downloading from GitHub..."
echo ""

# Use curl with progress bar for better user experience
if curl -fL --progress-bar -o "$INSTALL_PATH" "$DOWNLOAD_URL"; then
    echo ""
    print_success "Downloaded successfully"
else
    EXIT_CODE=$?
    echo ""
    print_error "Failed to download the executable"
    
    # Provide user-friendly error messages based on curl exit codes
    case $EXIT_CODE in
        6|7)
            print_info "Could not connect to GitHub. Please check your internet connection."
            ;;
        22)
            print_info "The file does not exist or is not accessible."
            print_info "This might be a temporary issue. Please try again later."
            ;;
        28)
            print_info "Download timed out. Please check your internet connection."
            ;;
        *)
            print_info "Download failed with error code: $EXIT_CODE"
            print_info "Please check your internet connection and try again."
            ;;
    esac
    
    print_info "Download URL: $DOWNLOAD_URL"
    exit 1
fi

# Make it executable
if chmod +x "$INSTALL_PATH"; then
    print_success "Made executable"
else
    print_error "Could not make file executable"
    print_info "Permission denied. Check file permissions."
    print_info "File: $INSTALL_PATH"
    exit 1
fi

# Add to PATH - Check if already in PATH first
if command -v burger-api >/dev/null 2>&1; then
    print_success "burger-api is already in PATH"
    refresh_command=""
elif echo "$PATH" | grep -q "$INSTALL_DIR"; then
    print_success "Already in PATH"
    refresh_command=""
else
    # Detect shell and add to appropriate config file
    refresh_command=""
    bin_env="\$HOME/.burger-api/bin"
    
    case $(basename "$SHELL") in
    fish)
        commands=(
            "set --export PATH $bin_env \$PATH"
        )
        
        fish_config="$HOME/.config/fish/config.fish"
        
        # Ensure fish config directory exists
        if [ ! -d "$HOME/.config/fish" ]; then
            mkdir -p "$HOME/.config/fish" || {
                print_error "Could not create fish config directory"
                print_info "Please manually add to your PATH:"
                print_info "  set --export PATH $bin_env \$PATH"
                exit 1
            }
        fi
        
        if [[ -w "$fish_config" ]] || [[ ! -e "$fish_config" ]]; then
            {
                echo -e '\n# BurgerAPI CLI'
                for command in "${commands[@]}"; do
                    echo "$command"
                done
            } >>"$fish_config"
            
            print_success "Added to PATH in $fish_config"
            refresh_command="exec $SHELL"
        else
            print_error "Cannot write to $fish_config"
            echo "Manually add the directory to $fish_config:"
            for command in "${commands[@]}"; do
                print_info "  $command"
            done
        fi
        ;;
    
    zsh)
        commands=(
            "export PATH=\"$bin_env:\$PATH\""
        )
        
        zsh_config="$HOME/.zshrc"
        
        if [[ -w "$zsh_config" ]] || [[ ! -e "$zsh_config" ]]; then
            {
                echo -e '\n# BurgerAPI CLI'
                for command in "${commands[@]}"; do
                    echo "$command"
                done
            } >>"$zsh_config"
            
            print_success "Added to PATH in $zsh_config"
            refresh_command="exec $SHELL"
        else
            print_error "Cannot write to $zsh_config"
            echo "Manually add the directory to $zsh_config:"
            for command in "${commands[@]}"; do
                print_info "  $command"
            done
        fi
        ;;
    
    bash)
        commands=(
            "export PATH=\"$bin_env:\$PATH\""
        )
        
        # Check multiple bash config files in order of preference
        bash_configs=(
            "$HOME/.bash_profile"
            "$HOME/.bashrc"
        )
        
        # Add XDG config paths if XDG_CONFIG_HOME is set
        if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
            bash_configs+=(
                "$XDG_CONFIG_HOME/.bash_profile"
                "$XDG_CONFIG_HOME/.bashrc"
            )
        fi
        
        set_manually=true
        for bash_config in "${bash_configs[@]}"; do
            if [[ -w "$bash_config" ]] || [[ ! -e "$bash_config" ]]; then
                {
                    echo -e '\n# BurgerAPI CLI'
                    for command in "${commands[@]}"; do
                        echo "$command"
                    done
                } >>"$bash_config"
                
                print_success "Added to PATH in $bash_config"
                refresh_command="source $bash_config"
                set_manually=false
                break
            fi
        done
        
        if [[ "$set_manually" = true ]]; then
            print_error "Cannot write to any bash config file"
            echo "Manually add the directory to ~/.bash_profile or ~/.bashrc:"
            for command in "${commands[@]}"; do
                print_info "  $command"
            done
        fi
        ;;
    
    *)
        print_error "Could not detect shell: $(basename "$SHELL")"
        echo "Manually add the directory to your shell config file:"
        print_info "  export PATH=\"$bin_env:\$PATH\""
        ;;
    esac
    
    # Show how to refresh the shell
    if [[ -n "$refresh_command" ]]; then
        echo ""
        print_info "To use burger-api in this session, run:"
        echo ""
        echo "    $refresh_command"
        echo ""
    fi
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

