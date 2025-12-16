# Burger API CLI Installer (Windows)
#
# This script installs the Burger API CLI on Windows.
# It downloads the executable and adds it to your PATH.
#
# Usage: irm https://burger-api.com/install.ps1 | iex
#

# Make sure we stop on errors
$ErrorActionPreference = "Stop"

# Function to print colored output
function Print-Success {
    param([string]$Message)
    Write-Host "[✓] $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "[X] $Message" -ForegroundColor Red
}

function Print-Info {
    param([string]$Message)
    Write-Host "[i] $Message" -ForegroundColor Blue
}

function Print-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host $Message -ForegroundColor Cyan
    Write-Host ""
}

Print-Header " > BurgerAPI CLI Installer"

# Check if running with admin privileges (optional, but recommended)
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Print-Info "Not running as administrator"
    Print-Info "Installing to user directory (recommended)"
}

# Detect architecture
$arch = $env:PROCESSOR_ARCHITECTURE
Print-Info "Detected Architecture: $arch"

# Windows only supports x64 for now
if ($arch -ne "AMD64") {
    Print-Error "Only x64 (64-bit) Windows is supported"
    Print-Info "Your architecture: $arch"
    exit 1
}

$executableName = "burger-api.exe"

# Get the latest version from GitHub API
Print-Info "Checking for latest version..."
try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/isfhan/burger-api/releases/latest"
    $latestVersion = $response.tag_name
    Print-Success "Latest version: $latestVersion"
}
catch {
    Print-Error "Could not determine latest version"
    Print-Info "Please check your internet connection"
    exit 1
}

# Create installation directory
$installDir = Join-Path $env:USERPROFILE ".burger-api\bin"
Print-Info "Creating installation directory: $installDir"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

# Download URL
$downloadUrl = "https://github.com/isfhan/burger-api/releases/download/$latestVersion/$executableName"
$installPath = Join-Path $installDir "burger-api.exe"

# Download the executable
Print-Info "Downloading from GitHub..."
try {
    # Use WebClient for better progress indication
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($downloadUrl, $installPath)
    Print-Success "Downloaded successfully"
}
catch {
    Print-Error "Failed to download"
    Print-Info "URL: $downloadUrl"
    Print-Info "Error: $($_.Exception.Message)"
    exit 1
}

# Add to PATH if not already there
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$installDir*") {
    Print-Info "Adding to PATH..."
    try {
        [Environment]::SetEnvironmentVariable(
            "Path",
            "$userPath;$installDir",
            "User"
        )
        Print-Success "Added to PATH"
        Print-Info "You may need to restart your terminal for PATH to update"
    }
    catch {
        Print-Error "Failed to add to PATH"
        Print-Info "Please manually add $installDir to your PATH"
    }
}
else {
    Print-Success "Already in PATH"
}

# Update PATH for current session
$env:Path = "$env:Path;$installDir"

# Verify installation
Print-Header "Installation Complete!"
Print-Success "burger-api has been installed to $installPath"
Print-Info "Version: $latestVersion"
Write-Host ""
Print-Info "To verify installation, run:"
Write-Host ""
Write-Host "    burger-api --version" -ForegroundColor Cyan
Write-Host ""
Print-Info "To get started, create a new project:"
Write-Host ""
Write-Host "    burger-api create my-awesome-api" -ForegroundColor Cyan
Write-Host ""
Print-Success "Happy coding! 🎉"
Write-Host ""
Print-Info "Note: You may need to restart your terminal for the command to work"

