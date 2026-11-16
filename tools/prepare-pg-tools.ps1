param(
    [string]$ToolDirectory = (Join-Path ([System.IO.Path]::GetTempPath()) 'ssc-pgtools-18.6')
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $projectDirectory '.runtime'
$resolvedToolDirectory = [System.IO.Path]::GetFullPath($ToolDirectory)
if ($resolvedToolDirectory -match '[^\x00-\x7F]') {
    throw 'Use an ASCII path for PostgreSQL Windows tools.'
}
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $resolvedToolDirectory -Force | Out-Null
$archiveFile = Join-Path $runtimeDirectory 'postgresql-18.6-windows-x64.zip'
if (-not (Test-Path -LiteralPath $archiveFile)) {
    Invoke-WebRequest -Uri 'https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip' -OutFile $archiveFile -UseBasicParsing
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archiveFile)
try {
    foreach ($entry in $archive.Entries) {
        if (-not $entry.FullName.StartsWith('pgsql/bin/') -or $entry.FullName.EndsWith('/')) { continue }
        $relativeName = $entry.FullName.Substring('pgsql/bin/'.Length)
        $destination = [System.IO.Path]::GetFullPath((Join-Path $resolvedToolDirectory $relativeName))
        if (-not $destination.StartsWith($resolvedToolDirectory.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Archive entry is outside the tool directory.'
        }
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
    }
}
finally { $archive.Dispose() }
foreach ($binaryName in @('pg_dump.exe', 'pg_restore.exe')) {
    & (Join-Path $resolvedToolDirectory $binaryName) --version
    if ($LASTEXITCODE -ne 0) { throw "$binaryName verification failed." }
}
[System.IO.File]::WriteAllText((Join-Path $runtimeDirectory 'pg-tools-location.txt'), $resolvedToolDirectory, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'Portable PostgreSQL client tools ready. No OS service was installed.'
