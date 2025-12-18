# Installation Scripts

This directory contains all installation and uninstallation scripts for the Burger API CLI.

## Structure

```
scripts/
├── install/          # Installation scripts
│   ├── install.sh   # Linux/macOS installer
│   └── install.ps1  # Windows installer
└── uninstall/        # Uninstallation scripts
    ├── uninstall.sh # Linux/macOS uninstaller
    └── uninstall.ps1 # Windows uninstaller
```

## Quick Reference

### Installation

**Linux/macOS:**
```bash
curl -fsSL https://burger-api.com/install.sh | bash
```

**Windows:**
```powershell
irm https://burger-api.com/install.ps1 | iex
```

### Uninstallation

**Linux/macOS:**
```bash
curl -fsSL https://burger-api.com/uninstall.sh | bash
```

**Windows:**
```powershell
irm https://burger-api.com/uninstall.ps1 | iex
```

## Website Deployment

When deploying to the website repository:

1. Copy all files from `install/` to website public directory
2. Copy all files from `uninstall/` to website public directory
3. Ensure files are accessible at the root URLs:
   - `https://burger-api.com/install.sh`
   - `https://burger-api.com/install.ps1`
   - `https://burger-api.com/uninstall.sh`
   - `https://burger-api.com/uninstall.ps1`

## Features

All scripts include:
- ✅ Progress bars during downloads
- ✅ Automatic PATH configuration
- ✅ Multi-shell support (bash, zsh, fish)
- ✅ macOS M1/zsh compatibility
- ✅ Comprehensive error handling
- ✅ User-friendly error messages
- ✅ Confirmation prompts (uninstall only)
- ✅ Config file backups (uninstall only)

## Documentation

- See [`install/README.md`](./install/README.md) for installation script details
- See [`uninstall/README.md`](./uninstall/README.md) for uninstallation script details

