param([string]$Executable)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$project = Split-Path -Parent $PSScriptRoot
if (-not $Executable) { $Executable = Join-Path $project 'release/win-unpacked/CSV nyaan Viewer.exe' }
$file = (Get-Item -LiteralPath $Executable).FullName
$signature = Get-AuthenticodeSignature -LiteralPath $file
$status = $signature.Status.ToString()
$testThumbprint = $env:CSV_TEST_CERT_THUMBPRINT
$requireSignature = $env:CSV_REQUIRE_CODE_SIGNATURE -match '^(true|1)$' -or -not [string]::IsNullOrWhiteSpace($env:WIN_CSC_LINK) -or -not [string]::IsNullOrWhiteSpace($env:CSC_LINK) -or -not [string]::IsNullOrWhiteSpace($testThumbprint)
if ($requireSignature -and $status -ne 'Valid') { throw "Windowsコード署名検証に失敗しました: $status" }
if ($status -notin @('Valid', 'NotSigned')) { throw "無効なWindows署名です: $status" }
$cert = $signature.SignerCertificate
if ($testThumbprint) {
  if (-not $cert -or $cert.Thumbprint -ne $testThumbprint) { throw '実行ファイルの署名と検証用証明書が一致しません。' }
  $public = Join-Path $project 'release/test-signing.cer'
  $publicCert = [Security.Cryptography.X509Certificates.X509Certificate2]::new($public)
  if ($publicCert.Thumbprint -ne $cert.Thumbprint -or $publicCert.HasPrivateKey) { throw '配布する公開証明書が不正です。' }
  $packagedCert = Join-Path (Split-Path -Parent $file) 'test-signing.cer'
  if ((Get-FileHash -LiteralPath $packagedCert).Hash -ne (Get-FileHash -LiteralPath $public).Hash) { throw '同梱された公開証明書が一致しません。' }
}
$report = [ordered]@{
  executable = [IO.Path]::GetFileName($file)
  sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  status = $status
  signed = $status -eq 'Valid'
  trustModel = $(if ($testThumbprint) { 'self-signed-test' } elseif ($cert) { 'certificate' } else { 'unsigned' })
  certificateImportRequired = [bool]$testThumbprint
  trustScope = $(if ($testThumbprint) { 'Verified on the build runner with the test certificate trusted; other machines must trust the certificate separately.' } else { 'Verified by Windows on the build runner.' })
  signerSubject = $(if ($cert) { $cert.Subject } else { $null })
  issuer = $(if ($cert) { $cert.Issuer } else { $null })
  thumbprint = $(if ($cert) { $cert.Thumbprint } else { $null })
  certificateExpiresAt = $(if ($cert) { $cert.NotAfter.ToUniversalTime().ToString('o') } else { $null })
  checkedAt = [DateTime]::UtcNow.ToString('o')
}
$json = $report | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $project 'release/SIGNATURE.json'), $json + "`n", [Text.UTF8Encoding]::new($false))
Write-Output $json
