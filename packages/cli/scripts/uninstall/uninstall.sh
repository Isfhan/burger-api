#!/bin/bash

#
# Burger API CLI Uninstaller (Linux/macOS)
#
# This script uninstalls the Burger API CLI from your system.
# It removes the executable and cleans up PATH entries.
#
# Usage: curl -fsSL https://burger-api.com/uninstall.sh | bash
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
WARNING="${YELLOW}[!]${NC}"

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

print_warning() {
    echo -e "${WARNING} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}$1${NC}"
    echo ""
}

print_header " > BurgerAPI CLI Uninstaller"

# Detect OS
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
IS_MACOS=false
if [ "$OS" = "darwin" ]; then
    IS_MACOS=true
fi

# Define installation paths
INSTALL_DIR="$HOME/.burger-api/bin"
INSTALL_PATH="$INSTALL_DIR/burger-api"

# Check if burger-api is installed
if [ ! -f "$INSTALL_PATH" ]; then
    print_info "burger-api is not installed or has already been removed"
    print_info "Installation path: $INSTALL_PATH"
    
    # Check if directory exists but executable doesn't
    if [ -d "$INSTALL_DIR" ]; then
        print_info "Installation directory still exists: $INSTALL_DIR"
        echo ""
        print_warning "Would you like to remove it? (y/N)"
        read -r response < /dev/tty
        
        if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
            if rm -rf "$INSTALL_DIR"; then
                print_success "Removed installation directory"
            else
                print_error "Could not remove directory: $INSTALL_DIR"
                print_info "You may need to remove it manually"
            fi
        fi
    fi
    
    echo ""
    print_info "Nothing else to uninstall"
    exit 0
fi

# Confirmation prompt
print_warning "This will remove burger-api from your system"
print_info "Installation path: $INSTALL_PATH"
echo ""
print_info "Do you want to continue? (y/N)"
read -r confirmation < /dev/tty

if [ "$confirmation" != "y" ] && [ "$confirmation" != "Y" ]; then
    print_info "Uninstall cancelled. No changes were made."
    exit 0
fi

echo ""

# Detect and remove from shell configuration
case $(basename "$SHELL") in
fish)
    fish_config="$HOME/.config/fish/config.fish"
    
    if [ -f "$fish_config" ]; then
        print_info "Checking $fish_config"
        
        if grep -q "# BurgerAPI CLI" "$fish_config" 2>/dev/null || grep -q "burger-api" "$fish_config" 2>/dev/null; then
            # Create backup
            BACKUP_FILE="${fish_config}.backup.$(date +%Y%m%d_%H%M%S)"
            if cp "$fish_config" "$BACKUP_FILE" 2>/dev/null; then
                print_success "Created backup: $BACKUP_FILE"
                
                # Remove BurgerAPI CLI section
                if sed -i.tmp '/# BurgerAPI CLI/,/burger-api/d' "$fish_config" 2>/dev/null; then
                    rm -f "${fish_config}.tmp"
                    print_success "Removed from PATH"
                elif sed -i '/# BurgerAPI CLI/,/burger-api/d' "$fish_config" 2>/dev/null; then
                    print_success "Removed from PATH"
                else
                    print_error "Could not modify $fish_config"
                    print_info "Backup saved at: $BACKUP_FILE"
                fi
            else
                print_warning "Could not create backup, skipping for safety"
            fi
        else
            print_info "BurgerAPI CLI not found in $fish_config"
        fi
    else
        print_info "Fish config not found: $fish_config"
    fi
    ;;

zsh)
    zsh_config="$HOME/.zshrc"
    
    if [ -f "$zsh_config" ]; then
        print_info "Checking $zsh_config"
        
        if grep -q "# BurgerAPI CLI" "$zsh_config" 2>/dev/null; then
            # Create backup
            BACKUP_FILE="${zsh_config}.backup.$(date +%Y%m%d_%H%M%S)"
            if cp "$zsh_config" "$BACKUP_FILE" 2>/dev/null; then
                print_success "Created backup: $BACKUP_FILE"
                
                # Remove BurgerAPI CLI section
                if sed -i.tmp '/# BurgerAPI CLI/,/export PATH.*burger-api/d' "$zsh_config" 2>/dev/null; then
                    rm -f "${zsh_config}.tmp"
                    print_success "Removed from PATH"
                elif sed -i '/# BurgerAPI CLI/,/export PATH.*burger-api/d' "$zsh_config" 2>/dev/null; then
                    print_success "Removed from PATH"
                else
                    print_error "Could not modify $zsh_config"
                    print_info "Backup saved at: $BACKUP_FILE"
                fi
            else
                print_warning "Could not create backup, skipping for safety"
            fi
        else
            print_info "BurgerAPI CLI not found in $zsh_config"
        fi
    else
        print_info "Zsh config not found: $zsh_config"
    fi
    ;;

bash)
    # Check multiple bash config files
    bash_configs=(
        "$HOME/.bash_profile"
        "$HOME/.bashrc"
    )
    
    if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
        bash_configs+=(
            "$XDG_CONFIG_HOME/.bash_profile"
            "$XDG_CONFIG_HOME/.bashrc"
        )
    fi
    
    found_config=false
    for bash_config in "${bash_configs[@]}"; do
        if [ -f "$bash_config" ]; then
            print_info "Checking $bash_config"
            
            if grep -q "# BurgerAPI CLI" "$bash_config" 2>/dev/null; then
                # Create backup
                BACKUP_FILE="${bash_config}.backup.$(date +%Y%m%d_%H%M%S)"
                if cp "$bash_config" "$BACKUP_FILE" 2>/dev/null; then
                    print_success "Created backup: $BACKUP_FILE"
                    
                    # Remove BurgerAPI CLI section
                    if sed -i.tmp '/# BurgerAPI CLI/,/export PATH.*burger-api/d' "$bash_config" 2>/dev/null; then
                        rm -f "${bash_config}.tmp"
                        print_success "Removed from PATH in $bash_config"
                        found_config=true
                    elif sed -i '/# BurgerAPI CLI/,/export PATH.*burger-api/d' "$bash_config" 2>/dev/null; then
                        print_success "Removed from PATH in $bash_config"
                        found_config=true
                    else
                        print_error "Could not modify $bash_config"
                        print_info "Backup saved at: $BACKUP_FILE"
                    fi
                else
                    print_warning "Could not create backup of $bash_config, skipping for safety"
                fi
            fi
        fi
    done
    
    if [ "$found_config" = false ]; then
        print_info "BurgerAPI CLI not found in any bash config files"
    fi
    ;;

*)
    print_warning "Unknown shell: $(basename "$SHELL")"
    print_info "You may need to manually remove PATH entries from your shell config"
    ;;
esac

# Remove the executable
print_info "Removing executable..."
if [ -f "$INSTALL_PATH" ]; then
    if rm -f "$INSTALL_PATH"; then
        print_success "Removed burger-api executable"
    else
        print_error "Could not remove executable"
        print_info "Permission denied. Check file permissions or if it's in use."
        print_info "You may need to remove it manually: $INSTALL_PATH"
    fi
fi

# Remove installation directory if empty
print_info "Cleaning up installation directory..."
if [ -d "$INSTALL_DIR" ]; then
    # Check if directory is empty
    if [ -z "$(ls -A "$INSTALL_DIR")" ]; then
        if rmdir "$INSTALL_DIR" 2>/dev/null; then
            print_success "Removed empty installation directory"
            
            # Try to remove parent directory if also empty
            PARENT_DIR=$(dirname "$INSTALL_DIR")
            if [ -d "$PARENT_DIR" ] && [ -z "$(ls -A "$PARENT_DIR")" ]; then
                if rmdir "$PARENT_DIR" 2>/dev/null; then
                    print_success "Removed parent directory"
                fi
            fi
        else
            print_warning "Could not remove directory: $INSTALL_DIR"
            print_info "You may want to manually remove it"
        fi
    else
        print_info "Installation directory contains other files, not removing"
        print_info "Directory: $INSTALL_DIR"
    fi
fi

# Complete
print_header "Uninstall Complete!"
print_success "burger-api has been removed from your system"
echo ""
print_info "To apply PATH changes, restart your terminal or run:"
echo ""
case $(basename "$SHELL") in
    fish)
        echo "    exec $SHELL"
        ;;
    zsh)
        echo "    exec $SHELL"
        ;;
    bash)
        if [ -f "$HOME/.bash_profile" ]; then
            echo "    source $HOME/.bash_profile"
        elif [ -f "$HOME/.bashrc" ]; then
            echo "    source $HOME/.bashrc"
        fi
        ;;
esac
echo ""
print_info "If you reinstall later, run:"
echo ""
echo "    curl -fsSL https://burger-api.com/install.sh | bash"
echo ""
print_success "Thank you for using Burger API!"
echo ""

