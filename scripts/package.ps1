$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$projectRoot = (Get-Location).Path
$sourceFiles = @(node scripts/release.mjs manifest | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Publication checks failed' }
$outputFolder = Join-Path $projectRoot 'dist'
$null = New-Item -ItemType Directory -Path $outputFolder -Force
$archivePath = Join-Path $outputFolder 'flowforge-source.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relativePath in $sourceFiles) {
        $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $relativePath))
        if (-not $sourcePath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Source path is outside the project' }
        $entryName = 'flowforge/' + $relativePath.Replace('\', '/')
        $null = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $sourcePath, $entryName)
    }
} finally { $archive.Dispose(); $stream.Dispose() }
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  flowforge-source.zip" | Set-Content -LiteralPath ($archivePath + '.sha256') -Encoding utf8
Write-Host "Created dist/flowforge-source.zip ($($sourceFiles.Count) source files)."
