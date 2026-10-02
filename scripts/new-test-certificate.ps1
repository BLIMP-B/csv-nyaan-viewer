$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$project = Split-Path -Parent $PSScriptRoot
$info = Get-Content -LiteralPath (Join-Path $project 'electron/app-info.json') -Raw | ConvertFrom-Json
$name = $info.observer
$subject = 'CN="' + $name.Replace('"', '\"') + '"'
Write-Output 'Creating test code-signing certificate...'
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject -FriendlyName 'CSV nyaan Viewer test signing' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -NotAfter (Get-Date).AddDays(90)
if ($cert.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -ne $name) { throw '証明書の署名者名が指定名と一致しません。' }
$release = Join-Path $project 'release'
New-Item -ItemType Directory -Path $release -Force | Out-Null
$public = Join-Path $release 'test-signing.cer'
Export-Certificate -Cert $cert -FilePath $public -Type CERT -Force | Out-Null
$env:CSV_TEST_CERT_THUMBPRINT = $cert.Thumbprint
$env:CSV_TEST_ROOT_SCOPE = $(if ($env:GITHUB_ACTIONS -eq 'true') { 'LocalMachine' } else { 'CurrentUser' })
$env:CSV_REQUIRE_CODE_SIGNATURE = 'true'
$env:WIN_CSC_LINK = ''
$env:CSC_LINK = ''
if ($env:GITHUB_ENV) {
  Add-Content -LiteralPath $env:GITHUB_ENV -Value "CSV_TEST_CERT_THUMBPRINT=$($cert.Thumbprint)"
  Add-Content -LiteralPath $env:GITHUB_ENV -Value "CSV_TEST_ROOT_SCOPE=$env:CSV_TEST_ROOT_SCOPE"
  Add-Content -LiteralPath $env:GITHUB_ENV -Value 'CSV_REQUIRE_CODE_SIGNATURE=true'
  Add-Content -LiteralPath $env:GITHUB_ENV -Value 'WIN_CSC_LINK='
  Add-Content -LiteralPath $env:GITHUB_ENV -Value 'CSC_LINK='
}
# The hosted runner is an isolated administrator environment. Machine-store
# import avoids the interactive CurrentUser root-certificate confirmation.
Write-Output 'Trusting the public certificate in the isolated test environment...'
if ($env:GITHUB_ACTIONS -eq 'true') {
  & certutil.exe -addstore -f Root $public
  if ($LASTEXITCODE -ne 0) { throw '検証環境への公開証明書登録に失敗しました。' }
} else {
  Import-Certificate -FilePath $public -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
}
Write-Output "Created non-exportable test code-signing key; public certificate thumbprint: $($cert.Thumbprint)"
