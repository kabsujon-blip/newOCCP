// OCPP 1.6 WebSocket Server - With Complete Session Logging & Reports
  // Full MeterValues parsing, live dashboard, and historical logs

  const BRIDGE_URL = Deno.env.get("BRIDGE_URL");
  const BRIDGE_SECRET = Deno.env.get("BRIDGE_SECRET");

  const CALL = 2;
  const CALLRESULT = 3;
  const CALLERROR = 4;

  // Store devices, sessions, and complete history
  const connectedDevices = new Map();
  const activeSessions = new Map();
  const completedSessions = []; // Stores all completed sessions for reports
  const activityLog = [];

  console.log('🚀 OCPP WebSocket Server Starting...');
  console.log('📊 Session logging enabled - All charging records saved');
  console.log('📁 Reports available at /logs endpoint');

  function addLog(message) {
  const timestamp = new Date().toISOString();
  activityLog.unshift({ timestamp, message });
  if (activityLog.length > 50) activityLog.pop();
  console.log(message);
  }

  async function callBridge(action, data) {
  if (!BRIDGE_URL) return null;
  try {
  const response = await fetch(BRIDGE_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-bridge-secret': BRIDGE_SECRET || ''
  },
  body: JSON.stringify({ action, data })
  });
  return await response.json();
  } catch (error) {
  console.error('Bridge error:', error);
  return null;
  }
  }

  // Parse MeterValues to extract power, energy, voltage, current, temp
  function parseMeterValues(meterValue) {
    let power = 0;
    let energy = 0;
    let voltage = 0;
    let current = 0;
    let temperature = 0;

    if (!meterValue || !Array.isArray(meterValue)) return { power, energy, voltage, current, temperature };

    for (const meter of meterValue) {
      if (!meter.sampledValue || !Array.isArray(meter.sampledValue)) continue;

      for (const sample of meter.sampledValue) {
        const measurand = sample.measurand || '';
        const value = parseFloat(sample.value) || 0;

        // Power in Watts (W) - CRITICAL: This is real-time power consumption
        if (measurand === 'Power.Active.Import') {
          power = value;
        }

        // Energy in Watt-hours (Wh) - convert to kWh
        if (measurand === 'Energy.Active.Import.Register') {
          energy = value / 1000; // Wh to kWh
        }

        // Voltage (V) - typically L1-N phase
        if (measurand === 'Voltage' && sample.phase === 'L1-N') {
          voltage = value;
        }

        // Current (A) - typically L1-N phase
        if (measurand === 'Current.Import' && sample.phase === 'L1-N') {
          current = value;
        }

        // Temperature (Celsius)
        if (measurand === 'Temperature') {
          temperature = value;
        }
      }
    }

    return { power, energy, voltage, current, temperature };
  }

function generateLogsPage(sessions, filters) {
  const { date, station, port } = filters;
  
  // Calculate statistics
  const totalSessions = sessions.length;
  const totalEnergy = sessions.reduce((sum, s) => sum + (parseFloat(s.energy_kwh) || 0), 0);
  const totalDuration = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const avgDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;

  // Group by date
  const byDate = {};
  sessions.forEach(s => {
    const day = s.start_time.split('T')[0];
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(s);
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📊 Charging Logs & Reports</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    .header { background: white; border-radius: 16px; padding: 30px; margin-bottom: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); }
    .title { font-size: 32px; font-weight: 800; color: #667eea; }
    .subtitle { color: #64748b; margin-top: 8px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .stat-label { color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
    .stat-value { font-size: 28px; font-weight: 700; color: #1e293b; }
    .card { background: white; border-radius: 16px; padding: 25px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .filters { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .filters input, .filters select { padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
    .btn { padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #5568d3; }
    .btn-download { background: #10b981; }
    .btn-download:hover { background: #059669; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 600; color: #64748b; font-size: 12px; text-transform: uppercase; }
    .date-group { background: #f8fafc; padding: 15px; border-radius: 12px; margin-bottom: 15px; }
    .date-header { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
    .port-badge { display: inline-block; padding: 4px 10px; background: #667eea; color: white; border-radius: 6px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">📊 Charging Logs & Reports</div>
      <div class="subtitle">Complete session history with filtering and download</div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Total Sessions</div>
        <div class="stat-value" style="color: #667eea;">${totalSessions}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Energy</div>
        <div class="stat-value" style="color: #10b981;">${totalEnergy.toFixed(2)} kWh</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Duration</div>
        <div class="stat-value" style="color: #f59e0b;">${totalDuration} min</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Duration</div>
        <div class="stat-value" style="color: #8b5cf6;">${avgDuration} min</div>
      </div>
    </div>

    <div class="card">
      <form class="filters" method="GET">
        <input type="date" name="date" value="${date || ''}" placeholder="Select Date">
        <input type="text" name="station" value="${station || ''}" placeholder="Station ID (e.g., 01)">
        <input type="number" name="port" value="${port || ''}" placeholder="Port (1-10)" min="1" max="10">
        <button type="submit" class="btn">🔍 Filter</button>
        <button type="submit" name="format" value="csv" class="btn btn-download">📥 Download CSV</button>
        <a href="/logs" class="btn" style="text-decoration:none;">🔄 Reset</a>
        <a href="/" class="btn" style="text-decoration:none;">🏠 Dashboard</a>
      </form>
    </div>

    ${Object.keys(byDate).length === 0 ? 
      '<div class="card"><p style="text-align:center;color:#64748b;">No sessions found. Start charging to see logs here!</p></div>' :
      Object.keys(byDate).sort().reverse().map(day => {
        const daySessions = byDate[day];
        const dayEnergy = daySessions.reduce((sum, s) => sum + (parseFloat(s.energy_kwh) || 0), 0);
        return `
          <div class="card">
            <div class="date-group">
              <div class="date-header">📅 ${day} - ${daySessions.length} sessions, ${dayEnergy.toFixed(2)} kWh</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>Energy (kWh)</th>
                  <th>Max Power (W)</th>
                  <th>Voltage (V)</th>
                  <th>Current (A)</th>
                </tr>
              </thead>
              <tbody>
                ${daySessions.map(s => `
                  <tr>
                    <td><span class="port-badge">Port ${s.connector_id}</span></td>
                    <td>${new Date(s.start_time).toLocaleTimeString()}</td>
                    <td>${s.end_time ? new Date(s.end_time).toLocaleTimeString() : 'Active'}</td>
                    <td>${s.duration_minutes || 0} min</td>
                    <td><strong>${(s.energy_kwh || 0).toFixed(3)}</strong></td>
                    <td>${s.current_power_w || 0} W</td>
                    <td>${(s.voltage_v || 0).toFixed(1)} V</td>
                    <td>${(s.current_a || 0).toFixed(2)} A</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('')
    }
  </div>
</body>
</html>`;
}

function generateDashboard() {
  const devices = Array.from(connectedDevices.values());
  const sessions = Array.from(activeSessions.values());
  
  // Calculate total power across all ports
  const totalPower = sessions.reduce((sum, s) => sum + (s.current_power_w || 0), 0);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ OCPP Server Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    .header { background: white; border-radius: 16px; padding: 30px; margin-bottom: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); }
    .title { font-size: 32px; font-weight: 800; color: #667eea; display: flex; align-items: center; gap: 12px; }
    .subtitle { color: #64748b; margin-top: 8px; font-size: 14px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .stat-label { color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
    .stat-value { font-size: 28px; font-weight: 700; color: #1e293b; }
    .card { background: white; border-radius: 16px; padding: 25px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .card-title { font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-success { background: #10b981; color: white; }
    .badge-danger { background: #ef4444; color: white; }
    .badge-idle { background: #64748b; color: white; }
    .ports-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .port-card { background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 20px; border: 3px solid #e2e8f0; transition: all 0.3s; }
    .port-card.active { background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-color: #10b981; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3); }
    .port-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .port-number { font-size: 24px; font-weight: 800; color: #1e293b; }
    .port-card.active .port-number { color: white; }
    .power-display { text-align: center; padding: 15px; background: rgba(0,0,0,0.05); border-radius: 8px; margin-bottom: 10px; }
    .port-card.active .power-display { background: rgba(255,255,255,0.2); }
    .power-value { font-size: 32px; font-weight: 800; color: #1e293b; font-family: 'Courier New', monospace; }
    .port-card.active .power-value { color: white; }
    .power-label { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 5px; }
    .port-card.active .power-label { color: rgba(255,255,255,0.9); }
    .energy-display { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; text-align: center; font-size: 10px; }
    .energy-item { padding: 8px; background: rgba(0,0,0,0.03); border-radius: 6px; }
    .port-card.active .energy-item { background: rgba(255,255,255,0.15); color: white; }
    .energy-value { font-weight: 700; font-size: 14px; }
    .device-grid { display: grid; gap: 15px; }
    .device-item { background: #f8fafc; border-radius: 12px; padding: 20px; border: 2px solid #e2e8f0; }
    .device-name { font-size: 18px; font-weight: 700; color: #1e293b; }
    .device-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 13px; color: #64748b; margin-top: 12px; }
    .log { background: #1e293b; border-radius: 12px; padding: 20px; max-height: 300px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 12px; }
    .log-entry { color: #10b981; margin-bottom: 4px; }
    .empty { text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; }
  </style>
  <script>
    setInterval(() => location.reload(), 3000);
  </script>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">⚡ OCPP Server Dashboard</div>
      <div class="subtitle">Live Port Monitoring - Auto-refresh every 3 seconds | <a href="/logs" style="color:#667eea;text-decoration:none;font-weight:600;">📊 View Logs & Reports</a></div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Connected Devices</div>
        <div class="stat-value" style="color: #10b981;">${devices.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Ports</div>
        <div class="stat-value" style="color: #f59e0b;">${sessions.length}/10</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Power</div>
        <div class="stat-value" style="color: #8b5cf6;">${totalPower.toFixed(0)} W</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Energy</div>
        <div class="stat-value" style="color: #06b6d4;">${sessions.reduce((sum, s) => sum + (s.energy_kwh || 0), 0).toFixed(2)} kWh</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔌 All 10 Ports - Live Status</div>
      <div class="ports-grid">
        ${Array.from({ length: 10 }, (_, i) => i + 1).map(portNum => {
          const session = sessions.find(s => s.connector_id === portNum);
          const isActive = !!session;
          const power = session?.current_power_w || 0;
          const energy = session?.energy_kwh || 0;
          const duration = session ? Math.floor((Date.now() - new Date(session.start_time)) / 60000) : 0;
          
          return `
            <div class="port-card ${isActive ? 'active' : ''}">
              <div class="port-header">
                <div class="port-number">Port ${portNum}</div>
                <span class="badge ${isActive ? 'badge-success' : 'badge-idle'}">${isActive ? 'CHARGING' : 'IDLE'}</span>
              </div>
              <div class="power-display">
                <div class="power-value">${power.toFixed(0)}</div>
                <div class="power-label">WATTS</div>
              </div>
              ${isActive ? `
                <div class="energy-display">
                  <div class="energy-item">
                    <div>⚡ Energy</div>
                    <div class="energy-value">${energy.toFixed(3)} kWh</div>
                  </div>
                  <div class="energy-item">
                    <div>⏱️ Duration</div>
                    <div class="energy-value">${duration}m</div>
                  </div>
                  <div class="energy-item">
                    <div>🔌 Voltage</div>
                    <div class="energy-value">${(session?.voltage_v || 0).toFixed(1)}V</div>
                  </div>
                  <div class="energy-item">
                    <div>⚙️ Current</div>
                    <div class="energy-value">${(session?.current_a || 0).toFixed(2)}A</div>
                  </div>
                  <div class="energy-item">
                    <div>🌡️ Temp</div>
                    <div class="energy-value">${(session?.temperature_c || 0).toFixed(0)}°C</div>
                  </div>
                </div>
              ` : '<div style="text-align: center; padding: 10px; color: #94a3b8; font-size: 12px;">No device connected</div>'}
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title">📱 Connected Devices</div>
      ${devices.length === 0 ? 
        '<div class="empty">No devices connected yet.</div>' :
        '<div class="device-grid">' + devices.map(d => `
          <div class="device-item">
            <div class="device-name">${d.station_id} <span class="badge badge-success">Online</span></div>
            <div class="device-meta">
              <div><strong>Vendor:</strong> ${d.vendor || 'N/A'}</div>
              <div><strong>Model:</strong> ${d.model || 'N/A'}</div>
              <div><strong>Firmware:</strong> ${d.firmware || 'N/A'}</div>
              <div><strong>Connected:</strong> ${new Date(d.connected_at).toLocaleTimeString()}</div>
            </div>
          </div>
        `).join('') + '</div>'
      }
    </div>

    <div class="card">
      <div class="card-title">📋 Activity Log</div>
      <div class="log">
        ${activityLog.length === 0 ? 
          '<div style="color: #64748b;">Waiting for activity...</div>' :
          activityLog.slice(0, 15).map(l => `<div class="log-entry">[${new Date(l.timestamp).toLocaleTimeString()}] ${l.message}</div>`).join('')
        }
      </div>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve({ port: 8080 }, async (req) => {
  const url = new URL(req.url);

  // Dashboard
  if (url.pathname === '/' || url.pathname === '/dashboard') {
    return new Response(generateDashboard(), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  // API Endpoints
  if (url.pathname === '/api/status') {
    return Response.json({
      success: true,
      devices: connectedDevices.size,
      sessions: activeSessions.size
    });
  }

  if (url.pathname === '/api/devices') {
    return Response.json({
      success: true,
      devices: Array.from(connectedDevices.values())
    });
  }

  if (url.pathname.startsWith('/api/sessions')) {
    const stationId = url.pathname.split('/')[3];
    const sessions = stationId ?
      Array.from(activeSessions.values()).filter(s => s.station_id === stationId) :
      Array.from(activeSessions.values());
    return Response.json({ success: true, sessions });
  }

  // Logs endpoint - view/filter completed sessions
  if (url.pathname === '/logs') {
    const date = url.searchParams.get('date'); // YYYY-MM-DD format
    const station = url.searchParams.get('station');
    const port = url.searchParams.get('port');
    const format = url.searchParams.get('format'); // 'json' or 'csv'

    let filtered = [...completedSessions];

    // Filter by date
    if (date) {
      filtered = filtered.filter(s => s.start_time.startsWith(date));
    }

    // Filter by station
    if (station) {
      filtered = filtered.filter(s => s.station_id === station);
    }

    // Filter by port
    if (port) {
      filtered = filtered.filter(s => s.connector_id === parseInt(port));
    }

    // Return CSV format for download
    if (format === 'csv') {
      const csv = [
        'Date,Station,Port,Start Time,End Time,Duration (min),Energy (kWh),Max Power (W),Avg Voltage (V),Avg Current (A)',
        ...filtered.map(s => 
          `${s.start_time.split('T')[0]},${s.station_id},${s.connector_id},${s.start_time},${s.end_time || 'N/A'},${s.duration_minutes || 0},${s.energy_kwh || 0},${s.current_power_w || 0},${s.voltage_v || 0},${s.current_a || 0}`
        )
      ].join('\n');

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="charging-logs-${date || 'all'}.csv"`
        }
      });
    }

    // HTML report page
    const html = generateLogsPage(filtered, { date, station, port });
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  // Command endpoint
  if (url.pathname === '/command' && req.method === 'POST') {
    try {
      const { station_id, action, payload } = await req.json();
      const device = connectedDevices.get(station_id);
      
      if (!device || !device.socket || device.socket.readyState !== WebSocket.OPEN) {
        return Response.json({ success: false, error: 'Station not connected' }, { status: 404 });
      }

      const messageId = Date.now().toString();
      const ocppMessage = [CALL, messageId, action, payload || {}];
      device.socket.send(JSON.stringify(ocppMessage));
      
      addLog(`📤 Sent ${action} to ${station_id}`);
      return Response.json({ success: true, message: 'Command sent', messageId });
    } catch (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  // WebSocket handling
  const pathParts = url.pathname.split('/');
  const stationId = pathParts[pathParts.length - 1];

  if (!stationId || stationId === 'ocpp16') {
    return new Response('Station ID required', { status: 400 });
  }

  if (req.headers.get('upgrade') !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    connectedDevices.set(stationId, {
      station_id: stationId,
      socket: socket,
      connected_at: new Date().toISOString(),
      vendor: 'Unknown',
      model: 'Unknown',
      firmware: 'Unknown'
    });
    addLog(`✅ Connected: ${stationId}`);
  };

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      const [messageType, messageId, action, payload] = message;

      addLog(`📨 From ${stationId}: ${action || 'Response'}`);

      if (messageType === CALL) {
        let response;

        switch (action) {
          case 'BootNotification':
            response = {
              status: 'Accepted',
              currentTime: new Date().toISOString(),
              interval: 300
            };
            // Update device info
            const device = connectedDevices.get(stationId);
            if (device) {
              device.vendor = payload.chargePointVendor || 'Unknown';
              device.model = payload.chargePointModel || 'Unknown';
              device.firmware = payload.firmwareVersion || 'Unknown';
            }
            await callBridge('registerStation', {
              station_id: stationId,
              name: `Station ${stationId}`,
              location: 'Auto-registered',
              status: 'available'
            });
            break;

          case 'Heartbeat':
            response = { currentTime: new Date().toISOString() };
            await callBridge('updateStation', {
              station_id: stationId,
              updates: { last_heartbeat: new Date().toISOString() }
            });
            break;

          case 'StatusNotification':
            response = {};
            const statusMap = {
              'Available': 'available',
              'Charging': 'charging',
              'Faulted': 'error',
              'Unavailable': 'offline'
            };
            await callBridge('updateStation', {
              station_id: stationId,
              updates: { status: statusMap[payload.status] || 'offline' }
            });
            break;

          case 'StartTransaction':
            const txId = Date.now();
            response = { transactionId: txId, idTagInfo: { status: 'Accepted' } };
            activeSessions.set(txId.toString(), {
              station_id: stationId,
              connector_id: payload.connectorId,
              start_time: new Date().toISOString(),
              energy_kwh: 0,
              current_power_w: 0
            });
            await callBridge('createSession', {
              station_id: stationId,
              start_time: new Date().toISOString(),
              status: 'active',
              transaction_id: txId.toString()
            });
            break;

          case 'StopTransaction':
            response = { idTagInfo: { status: 'Accepted' } };
            const session = activeSessions.get(payload.transactionId?.toString());
            if (session) {
              // Finalize session data
              if (payload.meterStop) {
                session.energy_kwh = (payload.meterStop / 1000).toFixed(3);
              }
              session.end_time = new Date().toISOString();
              session.duration_minutes = Math.floor((new Date(session.end_time) - new Date(session.start_time)) / 60000);
              session.status = 'completed';
              
              // Save to completed sessions log
              completedSessions.unshift({
                ...session,
                transaction_id: payload.transactionId?.toString()
              });
              
              // Keep last 1000 sessions
              if (completedSessions.length > 1000) completedSessions.pop();
              
              addLog(`✅ Session completed: Port ${session.connector_id}, ${session.energy_kwh}kWh, ${session.duration_minutes}m`);
              
              // Remove from active
              activeSessions.delete(payload.transactionId?.toString());
              
              // Update Base44
              await callBridge('updateSession', {
                station_id: stationId,
                updates: { 
                  status: 'completed', 
                  end_time: session.end_time,
                  energy_delivered: session.energy_kwh || 0,
                  duration_minutes: session.duration_minutes
                }
              });
            }
            break;

          case 'MeterValues':
            response = {};

            // Extract connector ID and transaction ID
            const connectorId = payload.connectorId;
            const transactionId = payload.transactionId?.toString();

            addLog(`📊 MeterValues from Port ${connectorId} (TxID: ${transactionId})`);

            // Find session by connector ID or transaction ID
            let sessionFound = null;
            for (const [key, session] of activeSessions.entries()) {
              if (session.connector_id === connectorId || key === transactionId) {
                sessionFound = session;
                break;
              }
            }

            if (sessionFound && payload.meterValue) {
              const { power, energy, voltage, current, temperature } = parseMeterValues(payload.meterValue);

              // Update session with ALL real values from device
              sessionFound.current_power_w = power;
              sessionFound.energy_kwh = energy;
              sessionFound.voltage_v = voltage;
              sessionFound.current_a = current;
              sessionFound.temperature_c = temperature;

              addLog(`⚡ Port ${connectorId}: ${power}W | ${energy.toFixed(3)}kWh | ${voltage}V | ${current}A | ${temperature}°C`);

              // Bridge to Base44 database - send port-specific data
              if (BRIDGE_URL) {
                try {
                  await fetch(BRIDGE_URL, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-bridge-secret': BRIDGE_SECRET || ''
                    },
                    body: JSON.stringify({
                      station_id: stationId,
                      connector_id: connectorId,
                      energy: energy,
                      power: power
                    })
                  });
                  console.log(`✅ Bridge: Port ${connectorId} → ${power}W to Base44`);
                } catch (error) {
                  console.error('Bridge error:', error);
                }
              }
            } else {
              addLog(`⚠️ No active session found for Port ${connectorId}`);
            }
            break;

          default:
            response = {};
        }

        socket.send(JSON.stringify([CALLRESULT, messageId, response]));
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  socket.onclose = () => {
    connectedDevices.delete(stationId);
    addLog(`❌ Disconnected: ${stationId}`);
  };

  socket.onerror = (error) => {
    console.error(`WebSocket error on ${stationId}:`, error);
  };

  return response;
});