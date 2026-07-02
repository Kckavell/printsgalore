$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:3000/')
$listener.Start()
Write-Host "Serving at http://localhost:3000"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css'
  '.js'   = 'application/javascript'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.woff2'= 'font/woff2'
  '.woff' = 'font/woff'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response

  $urlPath = $req.Url.LocalPath
  if ($urlPath -eq '/') { $urlPath = '/index.html' }
  $filePath = Join-Path $root $urlPath.TrimStart('/')

  if (Test-Path $filePath -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($filePath)
    $ct = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $res.ContentType = $ct
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes('Not found')
    $res.OutputStream.Write($msg, 0, $msg.Length)
  }
  $res.OutputStream.Close()
}
