#define MyAppName "Suite Control"
#ifndef MyAppVersion
#define MyAppVersion "1.2.0"
#endif
#define MyAppPublisher "Suite Control"
#define MyAppURL "http://127.0.0.1:3100"
#define MyAppExeName "SuiteControl.exe"

[Setup]
AppId={{8F3A2C91-4D6E-4B1A-9C7F-51A7E0C01110}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\SuiteControl
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableWelcomePage=no
OutputDir=..\dist
OutputBaseFilename=SuiteControl-Setup-{#MyAppVersion}
SetupIconFile=app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no
UsePreviousAppDir=yes
UninstallDisplayName={#MyAppName}
VersionInfoVersion={#MyAppVersion}
VersionInfoProductName={#MyAppName}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Centro de mando local para la salud de tus proyectos
SetupLogging=yes

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
WelcomeLabel2=Esto instala Suite Control solo en tu usuario de Windows.%n%nNo pide administrador. Escucha únicamente 127.0.0.1:3100 — no se publica a internet.%n%nTus tokens y el catálogo quedan en %%LOCALAPPDATA%%\SuiteControl\data.

[Tasks]
Name: "desktopicon"; Description: "Crear un icono en el escritorio"; GroupDescription: "Accesos:"; Flags: checkedonce

[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Abrir Suite Control en este PC"
Name: "{group}\Cerrar Suite Control"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--quit"; Comment: "Detener el proceso local"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; Comment: "Centro de mando local"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Suite Control ahora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#MyAppExeName}"; Parameters: "--quit"; RunOnceId: "StopSuiteControl"; Flags: runhidden

[UninstallDelete]
Type: files; Name: "{localappdata}\SuiteControl\suite.pid"

[Code]
function InitializeUninstall(): Boolean;
begin
  Result := True;
  if MsgBox('¿También borrar tokens, PIN y el catálogo de proyectos?' + #13#10 + #13#10 +
            'Elegí No para conservar %LOCALAPPDATA%\SuiteControl\data.',
            mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
  begin
    DelTree(ExpandConstant('{localappdata}\SuiteControl\data'), True, True, True);
  end;
end;
