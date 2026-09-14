$ErrorActionPreference = "Stop"

$secureToken = Read-Host "请输入仅具读取权限的 GitHub fine-grained PAT" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
    $env:GH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    node "$PSScriptRoot\server.js"
}
finally {
    Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    $secureToken.Dispose()
}
