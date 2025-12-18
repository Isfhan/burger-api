# Burger API CLI Uninstaller (Windows)
#
# This script uninstalls the Burger API CLI from Windows.
# It removes the executable and cleans up PATH entries.
#
# Usage: irm https://burger-api.com/uninstall.ps1 | iex
#

# Make sure we stop on errors
$ErrorActionPreference = "Stop"

# Function to print colored output
function Print-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "[X] $Message" -ForegroundColor Red
}

function Print-Info {
    param([string]$Message)
    Write-Host "[i] $Message" -ForegroundColor Blue
}

function Print-Warning {
    param([string]$Message)
    Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Print-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host $Message -ForegroundColor Cyan
    Write-Host ""
}

Print-Header " > BurgerAPI CLI Uninstaller"

# Define installation paths
$installDir = Join-Path $env:USERPROFILE ".burger-api\bin"
$installPath = Join-Path $installDir "burger-api.exe"

# Check if burger-api is installed
$isInstalled = Test-Path $installPath

if (-not $isInstalled) {
    Print-Info "burger-api is not installed or has already been removed"
    Print-Info "Installation path: $installPath"
    
    # Check if directory exists but executable doesn't
    if (Test-Path $installDir) {
        Print-Info "Installation directory still exists: $installDir"
        Print-Warning "Would you like to remove it? (Y/N)"
        $removeDir = Read-Host
        
        if ($removeDir -eq "Y" -or $removeDir -eq "y") {
            try {
                Remove-Item -Path $installDir -Recurse -Force
                Print-Success "Removed installation directory"
            }
            catch {
                Print-Error "Could not remove directory: $installDir"
                Print-Info "You may need to remove it manually"
            }
        }
    }
    
    Write-Host ""
    Print-Info "Nothing else to uninstall"
    exit 0
}

# Confirmation prompt
Print-Warning "This will remove burger-api from your system"
Print-Info "Installation path: $installPath"
Write-Host ""
Print-Info "Do you want to continue? (Y/N)"
$confirmation = Read-Host

if ($confirmation -ne "Y" -and $confirmation -ne "y") {
    Print-Info "Uninstall cancelled. No changes were made."
    exit 0
}

Write-Host ""

# Remove the executable
Print-Info "Removing executable..."
try {
    if (Test-Path $installPath) {
        Remove-Item -Path $installPath -Force
        Print-Success "Removed burger-api.exe"
    }
}
catch {
    Print-Error "Could not remove executable"
    $errorMessage = $_.Exception.Message
    
    if ($errorMessage -match "being used|in use") {
        Print-Info "The file is currently in use. Close any running burger-api processes and try again."
    }
    elseif ($errorMessage -match "denied|permission") {
        Print-Info "Permission denied. Try running as administrator."
    }
    else {
        Print-Info "Error: $errorMessage"
    }
    
    Print-Info "You may need to remove it manually: $installPath"
}

# Remove from PATH
Print-Info "Removing from PATH..."
try {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    
    if ($userPath -like "*$installDir*") {
        # Remove the installation directory from PATH
        $newPath = ($userPath -split ';' | Where-Object { $_ -ne $installDir }) -join ';'
        
        [Environment]::SetEnvironmentVariable(
            "Path",
            $newPath,
            "User"
        )
        
        Print-Success "Removed from PATH"
        Print-Info "You may need to restart your terminal for PATH changes to take effect"
    }
    else {
        Print-Info "Not found in PATH (may have been removed already)"
    }
}
catch {
    Print-Error "Could not remove from PATH automatically"
    $errorMessage = $_.Exception.Message
    
    if ($errorMessage -match "denied|permission") {
        Print-Info "Permission denied. You may need to run as administrator."
    }
    else {
        Print-Info "Error: $errorMessage"
    }
    
    Print-Info "Please manually remove this from your PATH:"
    Print-Info "$installDir"
}

# Remove installation directory if empty
Print-Info "Cleaning up installation directory..."
try {
    if (Test-Path $installDir) {
        $items = Get-ChildItem -Path $installDir -Force
        
        if ($items.Count -eq 0) {
            # Directory is empty, remove it
            Remove-Item -Path $installDir -Force
            Print-Success "Removed empty installation directory"
            
            # Try to remove parent directory if also empty
            $parentDir = Split-Path $installDir -Parent
            if (Test-Path $parentDir) {
                $parentItems = Get-ChildItem -Path $parentDir -Force
                if ($parentItems.Count -eq 0) {
                    Remove-Item -Path $parentDir -Force
                    Print-Success "Removed parent directory"
                }
            }
        }
        else {
            Print-Info "Installation directory contains other files, not removing"
            Print-Info "Directory: $installDir"
        }
    }
}
catch {
    Print-Warning "Could not remove installation directory"
    Print-Info "You may want to manually remove: $installDir"
}

# Complete
Print-Header "Uninstall Complete!"
Print-Success "burger-api has been removed from your system"
Write-Host ""
Print-Info "If you reinstall later, run:"
Write-Host ""
Write-Host "    irm https://burger-api.com/install.ps1 | iex" -ForegroundColor Cyan
Write-Host ""
Print-Success "Thank you for using Burger API!"
Write-Host ""

