#pragma codepage utf-8

#define AppName "Transcript"
#ifndef AppVersion
#define AppVersion "2.0.0"
#endif
#ifndef SourceDir
#define SourceDir "..\..\artifacts\transcript-windows-x64"
#endif
#ifndef OutputDir
#define OutputDir "..\..\release-assets"
#endif

[Setup]
AppId={{D9C9E157-5096-4F11-8D02-2F0844E87A1F}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Barış Kısır
AppPublisherURL=https://www.bariskisir.com
AppSupportURL=https://github.com/bariskisir/Transcript
AppUpdatesURL=https://github.com/bariskisir/Transcript/releases
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=transcript-{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=..\..\src\Transcript.Presentation\Resources\AppIcon\icon.ico
UninstallDisplayIcon={app}\Transcript.Presentation.exe
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Transcript"; Filename: "{app}\Transcript.Presentation.exe"
Name: "{autodesktop}\Transcript"; Filename: "{app}\Transcript.Presentation.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Transcript.Presentation.exe"; Description: "Launch Transcript"; Flags: nowait postinstall skipifsilent
