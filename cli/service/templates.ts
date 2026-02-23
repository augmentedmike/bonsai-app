export interface TemplateVariables {
  serviceName: string;
  displayName: string;
  nodePath: string;
  tsxPath: string;
  heartbeatScriptPath: string;
  workingDirectory: string;
  logFilePath: string;
  intervalSeconds: number;
}

export function generateLaunchAgentPlist(vars: TemplateVariables): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${vars.serviceName}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${vars.nodePath}</string>
        <string>${vars.tsxPath}</string>
        <string>${vars.heartbeatScriptPath}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${vars.workingDirectory}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>BONSAI_ENV</key>
        <string>prod</string>
        <key>DISABLE_AUTOUPDATER</key>
        <string>1</string>
    </dict>

    <key>StartInterval</key>
    <integer>${vars.intervalSeconds}</integer>

    <key>StandardOutPath</key>
    <string>${vars.logFilePath}</string>

    <key>StandardErrorPath</key>
    <string>${vars.logFilePath}</string>

    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;
}

export function generateSystemdService(vars: TemplateVariables): string {
  return `[Unit]
Description=${vars.displayName}
After=network.target

[Service]
Type=oneshot
ExecStart=${vars.nodePath} ${vars.tsxPath} ${vars.heartbeatScriptPath}
WorkingDirectory=${vars.workingDirectory}
Environment="BONSAI_ENV=prod"
Environment="DISABLE_AUTOUPDATER=1"
StandardOutput=append:${vars.logFilePath}
StandardError=append:${vars.logFilePath}

[Install]
WantedBy=default.target
`;
}

export function generateSystemdTimer(vars: TemplateVariables): string {
  const serviceName = vars.serviceName.replace(/^com\./, '').replace(/\./g, '-');

  return `[Unit]
Description=${vars.displayName} Timer
Requires=${serviceName}.service

[Timer]
OnBootSec=30sec
OnUnitActiveSec=${vars.intervalSeconds}sec
AccuracySec=1sec

[Install]
WantedBy=timers.target
`;
}
