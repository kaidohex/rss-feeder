# Easy build entry point for the Marginalia desktop app.
#
# Tauri needs the MSVC toolchain on Windows, and rustc only finds link.exe
# when the Visual Studio developer environment is loaded. This script loads
# that environment for you, then runs the Tauri CLI, so it works from any
# plain PowerShell window.
#
#   .\build.ps1            # production bundle (installers in src-tauri\target\release\bundle)
#   .\build.ps1 dev        # dev window with hot reload
#   .\build.ps1 build --debug   # extra args are passed straight to `tauri build`

[CmdletBinding()]
param(
    [ValidateSet("build", "dev")]
    [string]$Mode = "build",

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-VsDevCmd {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vswhere)) {
        throw "Visual Studio Installer not found. Install 'Build Tools for Visual Studio' with the 'Desktop development with C++' workload."
    }

    $installPath = & $vswhere -latest -products * `
        -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
        -property installationPath

    if (-not $installPath) {
        throw "No Visual Studio installation with the C++ toolset (VC.Tools.x86.x64) was found."
    }

    $devCmd = Join-Path $installPath "Common7\Tools\VsDevCmd.bat"
    if (-not (Test-Path $devCmd)) {
        throw "VsDevCmd.bat missing at $devCmd"
    }

    return $devCmd
}

function Import-VsEnvironment {
    param([string]$DevCmd)

    Write-Host "Loading MSVC environment..." -ForegroundColor DarkGray
    $lines = & cmd.exe /c "`"$DevCmd`" -arch=x64 -host_arch=x64 >nul && set"
    if ($LASTEXITCODE -ne 0) {
        throw "VsDevCmd.bat failed to initialise the developer environment."
    }

    foreach ($line in $lines) {
        $split = $line.IndexOf("=")
        if ($split -gt 0) {
            $name = $line.Substring(0, $split)
            $value = $line.Substring($split + 1)
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

function Get-CargoPath {
    $cmd = Get-Command cargo -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $fallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
    if (Test-Path $fallback) { return $fallback }

    throw "cargo not found. Install Rust from https://rustup.rs and reopen the terminal."
}

Import-VsEnvironment (Get-VsDevCmd)

$cargo = Get-CargoPath
Write-Host "cargo: $cargo" -ForegroundColor DarkGray

Push-Location $repoRoot
try {
    $tauriArgs = if ($Mode -eq "dev") { @("tauri", "dev") } else { @("tauri", "build") }
    if ($ExtraArgs) { $tauriArgs += $ExtraArgs }

    Write-Host "Running: npx $($tauriArgs -join ' ')" -ForegroundColor Cyan
    & npx.cmd @tauriArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
