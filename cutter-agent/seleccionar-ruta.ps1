param(
    [ValidateSet('Folder', 'Plan', 'Watermark', 'OutputFolder', 'OutputVideo')]
    [string]$Mode = 'Folder',
    [string]$InitialDirectory = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$startDirectory = $PWD.Path
if ($InitialDirectory -and (Test-Path -LiteralPath $InitialDirectory -PathType Container)) {
    $startDirectory = (Resolve-Path -LiteralPath $InitialDirectory).Path
}
elseif (Test-Path -LiteralPath (Join-Path $env:USERPROFILE 'Videos') -PathType Container) {
    $startDirectory = (Resolve-Path -LiteralPath (Join-Path $env:USERPROFILE 'Videos')).Path
}

switch ($Mode) {
    'Folder' {
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Selecciona la carpeta que contiene los episodios de anime'
        $dialog.ShowNewFolderButton = $false
        $dialog.SelectedPath = $startDirectory
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            [Console]::WriteLine($dialog.SelectedPath)
        }
        $dialog.Dispose()
    }
    'OutputFolder' {
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Selecciona dónde guardar el video final y los archivos del montaje'
        $dialog.ShowNewFolderButton = $true
        $dialog.SelectedPath = $startDirectory
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            [Console]::WriteLine($dialog.SelectedPath)
        }
        $dialog.Dispose()
    }
    'Plan' {
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = 'Selecciona edit-plan-reviewed.json'
        $dialog.Filter = 'Plan revisado (*.json)|*.json|Todos los archivos (*.*)|*.*'
        $dialog.CheckFileExists = $true
        $dialog.Multiselect = $false
        $dialog.InitialDirectory = $startDirectory
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            [Console]::WriteLine($dialog.FileName)
        }
        $dialog.Dispose()
    }
    'Watermark' {
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Title = 'Selecciona una imagen para la marca de agua'
        $dialog.Filter = 'Imágenes compatibles (*.png;*.jpg;*.jpeg;*.webp)|*.png;*.jpg;*.jpeg;*.webp|Todos los archivos (*.*)|*.*'
        $dialog.CheckFileExists = $true
        $dialog.Multiselect = $false
        $dialog.InitialDirectory = $startDirectory
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            [Console]::WriteLine($dialog.FileName)
        }
        $dialog.Dispose()
    }
    'OutputVideo' {
        $dialog = New-Object System.Windows.Forms.SaveFileDialog
        $dialog.Title = 'Elige el nombre del video final'
        $dialog.Filter = 'Video MP4 (*.mp4)|*.mp4'
        $dialog.DefaultExt = 'mp4'
        $dialog.AddExtension = $true
        $dialog.OverwritePrompt = $false
        $dialog.InitialDirectory = $startDirectory
        $dialog.FileName = 'temporada-final.mp4'
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            [Console]::WriteLine($dialog.FileName)
        }
        $dialog.Dispose()
    }
}
