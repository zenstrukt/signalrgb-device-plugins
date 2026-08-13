#Requires -Version 5.1
<#
    Copies the plugins and LCD faces into SignalRGB's user folders.

    SignalRGB reads custom plugins and faces from Documents, not from its own
    install directory, so nothing here touches the application itself and an
    update will not wipe it.
#>

[CmdletBinding()]
param(
    [switch] $FacesOnly,
    [switch] $PluginsOnly
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$documents = [Environment]::GetFolderPath('MyDocuments')
$pluginTarget = Join-Path $documents 'WhirlwindFX\Plugins'
$faceTarget = Join-Path $documents 'WhirlwindFX\LCDFaces'

function Copy-Set {
    param([string] $Source, [string] $Target, [string] $Filter)

    if (-not (Test-Path $Source)) { return }
    if (-not (Test-Path $Target)) { New-Item -ItemType Directory -Path $Target -Force | Out-Null }

    Get-ChildItem -Path $Source -Filter $Filter -File | ForEach-Object {
        Copy-Item $_.FullName -Destination $Target -Force
        "  $($_.Name)  ->  $Target"
    }
}

if (-not $FacesOnly) {
    'Plugins:'
    Copy-Set -Source (Join-Path $root 'plugins') -Target $pluginTarget -Filter '*.js'
}

if (-not $PluginsOnly) {
    'LCD faces:'
    Copy-Set -Source (Join-Path $root 'lcd-faces') -Target $faceTarget -Filter '*.html'
}

''
'Restart SignalRGB to pick these up.'
