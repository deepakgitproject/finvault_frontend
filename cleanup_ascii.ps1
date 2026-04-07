# cleanup_ascii.ps1
$files = Get-ChildItem -Path "src\app" -Include *.ts, *.html, *.scss -Recurse

# Define regex patterns for mojibake and special characters
$replacements = @{
    'â‚¹|₹' = 'Rs.'
    'â€¢|•|â•™|â• ' = '*'
    'â”€|â• |â• |â• |â•¦|â• |â• |â• |â•©|â• |â• |â•¦|â• |â• |â–‘|â–’|â–“|═|─|─|─' = '-'
    'â€”|—' = '-'
    'â€¦|…' = '...'
    'â†’|&rarr;' = '->'
}

foreach ($file in $files) {
    try {
        $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
        $original = $content
        
        foreach ($pattern in $replacements.Keys) {
            $content = [regex]::Replace($content, $pattern, $replacements[$pattern])
        }
        
        # Specific fix for long decorative lines
        $content = [regex]::Replace($content, '═{2,}|─{2,}|━{2,}', { param($m) '-' * $m.Length })

        # Fix broken template literals
        $content = [regex]::Replace($content, '\?\{', '${')
        $content = [regex]::Replace($content, '\?event', '$event')
        $content = [regex]::Replace($content, '\?index', '$index')
        $content = [regex]::Replace($content, '\?0', '$0')
        $content = [regex]::Replace($content, '\?1', '$1')

        if ($content -ne $original) {
            Write-Host "Updating $($file.FullName)"
            [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)
        }
    } catch {
        Write-Host "Error processing $($file.FullName): $($_.Exception.Message)"
    }
}
