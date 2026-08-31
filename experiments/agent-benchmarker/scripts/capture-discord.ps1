param(
  [Parameter(Mandatory = $true)]
  [string]$GuildId,

  [string]$OutputRoot = "./fixtures/local"
)

$ErrorActionPreference = "Stop"
$Api = "https://discord.com/api/v10"
$CapturedAt = (Get-Date).ToUniversalTime().ToString("o")
$FixtureDir = Join-Path $OutputRoot $GuildId
$RawDir = Join-Path $FixtureDir "raw"
New-Item -ItemType Directory -Force -Path $RawDir | Out-Null

$SecureToken = Read-Host "Discord bot token (used only for this capture, never written to disk)" -AsSecureString
$TokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
$Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($TokenPtr)

$Results = [ordered]@{}

function Invoke-DiscordCapture {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $Target = Join-Path $RawDir "$Name.json"
  $BodyTemp = Join-Path $env:TEMP ("cleo-discord-" + [guid]::NewGuid().ToString("N") + ".json")

  try {
    $Status = & curl.exe `
      --silent `
      --show-error `
      --connect-timeout 15 `
      --max-time 45 `
      --output $BodyTemp `
      --write-out "%{http_code}" `
      --header "Authorization: Bot $Token" `
      --header "Accept: application/json" `
      --header "User-Agent: CleoAgentBenchmarker/0.0.0" `
      "$Api$Path"

    if ($LASTEXITCODE -ne 0) {
      throw "curl exited with code $LASTEXITCODE"
    }

    $StatusCode = [int]$Status
    $RawBody = if (Test-Path $BodyTemp) { Get-Content $BodyTemp -Raw } else { "" }

    if ($StatusCode -ge 200 -and $StatusCode -lt 300) {
      if ([string]::IsNullOrWhiteSpace($RawBody)) { $RawBody = "null" }
      Set-Content -Path $Target -Value $RawBody -Encoding utf8NoBOM
      $Results[$Name] = [ordered]@{ status = $StatusCode; ok = $true; path = "raw/$Name.json" }
      Write-Host "[$StatusCode] $Name"
      return
    }

    $ErrorPayload = [ordered]@{
      _captureError = $true
      endpoint = $Path
      status = $StatusCode
      body = $RawBody
    }
    $ErrorPayload | ConvertTo-Json -Depth 20 | Set-Content -Path $Target -Encoding utf8NoBOM
    $Results[$Name] = [ordered]@{ status = $StatusCode; ok = $false; path = "raw/$Name.json" }
    Write-Warning "[$StatusCode] $Name was unavailable. The failure was recorded in the fixture."
  }
  finally {
    Remove-Item $BodyTemp -Force -ErrorAction SilentlyContinue
  }
}

try {
  Invoke-DiscordCapture "bot-user" "/users/@me"
  Invoke-DiscordCapture "guild" "/guilds/$GuildId?with_counts=true"
  Invoke-DiscordCapture "channels" "/guilds/$GuildId/channels"
  Invoke-DiscordCapture "roles" "/guilds/$GuildId/roles"
  Invoke-DiscordCapture "role-member-counts" "/guilds/$GuildId/roles/member-counts"
  Invoke-DiscordCapture "onboarding" "/guilds/$GuildId/onboarding"
  Invoke-DiscordCapture "welcome-screen" "/guilds/$GuildId/welcome-screen"
  Invoke-DiscordCapture "automod" "/guilds/$GuildId/auto-moderation/rules"
  Invoke-DiscordCapture "scheduled-events" "/guilds/$GuildId/scheduled-events?with_user_count=true"
  Invoke-DiscordCapture "active-threads" "/guilds/$GuildId/threads/active"
  Invoke-DiscordCapture "integrations" "/guilds/$GuildId/integrations"
  Invoke-DiscordCapture "invites" "/guilds/$GuildId/invites"

  $BotUserPath = Join-Path $RawDir "bot-user.json"
  if (Test-Path $BotUserPath) {
    try {
      $BotUser = Get-Content $BotUserPath -Raw | ConvertFrom-Json
      if ($BotUser.id) {
        Invoke-DiscordCapture "bot-member" "/guilds/$GuildId/members/$($BotUser.id)"
      }
    }
    catch {
      Write-Warning "Could not resolve the bot user id for bot-member capture: $($_.Exception.Message)"
    }
  }

  $Manifest = [ordered]@{
    schemaVersion = 1
    guildId = $GuildId
    capturedAt = $CapturedAt
    discordApi = "v10"
    captureMode = "read-only"
    endpoints = $Results
  }
  $Manifest | ConvertTo-Json -Depth 20 | Set-Content -Path (Join-Path $FixtureDir "manifest.json") -Encoding utf8NoBOM

  Write-Host ""
  Write-Host "Captured Discord fixture: $FixtureDir"
  Write-Host "The token was not written to the fixture. Review the raw JSON before sharing it."
}
finally {
  if ($TokenPtr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($TokenPtr)
  }
  $Token = $null
  $SecureToken = $null
}
