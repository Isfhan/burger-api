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
    $errorMessage = $_.Exception.Message
    
    if ($errorMessage -match "Could not resolve|Unable to connect") {
        Print-Info "Could not connect to GitHub API. Please check your internet connection."
    }
    elseif ($errorMessage -match "403|rate limit") {
        Print-Info "GitHub API rate limit exceeded. Please try again later."
    }
    else {
        Print-Info "GitHub API might be temporarily unavailable."
        Print-Info "Please check your internet connection and try again."
    }
    
    exit 1
}

# Create installation directory
$installDir = Join-Path $env:USERPROFILE ".burger-api\bin"
Print-Info "Creating installation directory: $installDir"

try {
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
}
catch {
    Print-Error "Could not create installation directory"
    $errorMessage = $_.Exception.Message
    
    if ($errorMessage -match "denied|permission") {
        Print-Info "Permission denied. Try running as administrator or check directory permissions."
    }
    elseif ($errorMessage -match "path|long") {
        Print-Info "Installation path is too long or invalid."
    }
    else {
        Print-Info "Error: $errorMessage"
    }
    
    Print-Info "Directory: $installDir"
    exit 1
}

# Download URL
$downloadUrl = "https://github.com/isfhan/burger-api/releases/download/$latestVersion/$executableName"
$installPath = Join-Path $installDir "burger-api.exe"

# Download the executable
Print-Info "Downloading from GitHub..."

try {
    $webClient = New-Object System.Net.WebClient
    $webClient.Headers.Add("User-Agent", "BurgerAPI-Installer/1.0")
    
    # Progress tracking with script scope
    $script:lastPercent = -1
    $progressAction = {
        param($sender, $e)
        if ($e.TotalBytesToReceive -gt 0) {
            $percent = [math]::Round(($e.BytesReceived / $e.TotalBytesToReceive) * 100)
            if ($percent -ne $script:lastPercent) {
                $downloadedMB = [math]::Round($e.BytesReceived / 1MB, 1)
                $totalMB = [math]::Round($e.TotalBytesToReceive / 1MB, 1)
                Write-Progress -Activity "Downloading burger-api" -Status "$percent% ($downloadedMB MB / $totalMB MB)" -PercentComplete $percent
                $script:lastPercent = $percent
            }
        }
    }
    
    $webClient.add_DownloadProgressChanged($progressAction)
    $webClient.DownloadFileAsync([uri]$downloadUrl, $installPath)
    
    # Wait for completion
    while ($webClient.IsBusy) {
        Start-Sleep -Milliseconds 50
    }
    
    Write-Progress -Activity "Downloading burger-api" -Completed
    $webClient.Dispose()
    
    Write-Host ""
    Print-Success "Downloaded successfully"
}
catch {
    Write-Host ""
    Print-Error "Failed to download the executable"
    
    # Provide user-friendly error messages based on exception type
    $errorMessage = $_.Exception.Message
    
    if ($errorMessage -match "Could not resolve|Unable to connect|No such host") {
        Print-Info "Could not connect to GitHub. Please check your internet connection."
    }
    elseif ($errorMessage -match "404|Not Found") {
        Print-Info "The file does not exist or is not accessible."
        Print-Info "This might be a temporary issue. Please try again later."
    }
    elseif ($errorMessage -match "403|Forbidden") {
        Print-Info "Access denied. GitHub might be rate limiting requests."
        Print-Info "Please wait a moment and try again."
    }
    elseif ($errorMessage -match "timeout") {
        Print-Info "Download timed out. Please check your internet connection."
    }
    elseif ($errorMessage -match "denied|permission") {
        Print-Info "Permission denied. Try running as administrator or check file permissions."
    }
    elseif ($errorMessage -match "disk|space") {
        Print-Info "Not enough disk space to install. Please free up some space."
    }
    else {
        Print-Info "Download failed: $errorMessage"
        Print-Info "Please check your internet connection and try again."
    }
    
    Print-Info "Download URL: $downloadUrl"
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
        Print-Error "Could not add to PATH automatically"
        Print-Info "Permission denied or registry access failed."
        Print-Info "Please manually add this to your PATH:"
        Print-Info "$installDir"
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
Print-Success "Happy coding!"
Write-Host ""
Print-Info "Note: You may need to restart your terminal for the command to work"

