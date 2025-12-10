// Standalone OCPP 1.6 Server with Web Dashboard
// Deploy on Railway - Test devices WITHOUT Base44 first

const OCPP_PORT = 8080;

// OCPP 1.6 Message Types
const CALL = 2;
const CALLRESULT = 3;
const CALLERROR = 4;

// In-memory storage for demo (use database in production)
const connectedDevices = new Map(); // stationId -> { socket, info, lastSeen }
const chargingSessions = new Map(); // sessionId -> session data
const statusHistory = []; // Array of status events

console.log('🚀 Standalone OCPP Server Starting...');

Deno.serve({ port: OCPP_PORT }, async (req) => {
  const url = new URL(req.url);

  // ======================
  // WEB DASHBOARD (HTML UI)
  // ======================
  if (url.pathname === '/') {
    return new Response(`
<!DOCTYPE html>
<html>
<head>
  <title>OCPP Server Dashboard</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 {
      color: #667eea;
      margin-bottom: 10px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: bold;
    }
    .badge-success { background: #10b981; color: white; }
    .badge-danger { background: #ef4444; color: white; }
    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .device-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 15px;
    }
    .device-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 8px;
      padding: 15px;
    }
    .device-card h3 { margin-bottom: 10px; }
    .device-info { font-size: 14px; margin-bottom: 5px; }
    .btn {
      background: white;
      color: #667eea;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      margin-top: 10px;
    }
    .btn:hover { opacity: 0.9; }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th { background: #f9fafb; font-weight: bold; }
    .status-online { color: #10b981; font-weight: bold; }
    .status-offline { color: #ef4444; font-weight: bold; }
    .log-entry {
      background: #f9fafb;
      padding: 10px;
      border-left: 3px solid #667eea;
      margin-bottom: 10px;
      font-family: monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ OCPP Server Dashboard</h1>
      <p>Railway Standalone Testing Environment</p>
      <p style="margin-top: 10px;">
        <span class="badge badge-success" id="device-count">0 Devices</span>
        <span class="badge badge-danger" id="session-count">0 Sessions</span>
      </p>
    </div>

    <div class="card">
      <h2>📡 Connected Devices</h2>
      <div class="device-grid" id="devices">
        <p style="color: #9ca3af;">No devices connected yet. Configure your device to connect to this server.</p>
      </div>
    </div>

    <div class="card">
      <h2>🔌 Active Charging Sessions</h2>
      <table id="sessions-table">
        <thead>
          <tr>
            <th>Station ID</th>
            <th>Connector</th>
            <th>Start Time</th>
            <th>Energy (kWh)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="sessions">
          <tr><td colspan="5" style="text-align: center; color: #9ca3af;">No active sessions</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>📋 Recent Activity Log</h2>
      <div id="log" style="max-height: 400px; overflow-y: auto;">
        <p style="color: #9ca3af;">Server started. Waiting for device connections...</p>
      </div>
    </div>

    <div class="card">
      <h2>🔧 Server Information</h2>
      <table>
        <tr>
          <td><strong>WebSocket URL:</strong></td>
          <td><code>wss://YOUR-PROJECT.up.railway.app/ocpp16/[STATION-ID]</code></td>
        </tr>
        <tr>
          <td><strong>API Endpoint:</strong></td>
          <td><code>https://YOUR-PROJECT.up.railway.app/api/*</code></td>
        </tr>
        <tr>
          <td><strong>Protocol:</strong></td>
          <td>OCPP 1.6J (JSON over WebSocket)</td>
        </tr>
      </table>
    </div>
  </div>

  <script>
    // Auto-refresh data every 2 seconds
    setInterval(async () => {
      try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        // Update device count
        document.getElementById('device-count').textContent = `${data.devices.length} Devices`;
        document.getElementById('session-count').textContent = `${data.sessions.length} Sessions`;
        
        // Update devices
        const devicesDiv = document.getElementById('devices');
        if (data.devices.length === 0) {
          devicesDiv.innerHTML = '<p style="color: #9ca3af;">No devices connected yet.</p>';
        } else {
          devicesDiv.innerHTML = data.devices.map(device => `
            <div class="device-card">
              <h3>🔌 ${device.id}</h3>
              <div class="device-info">Status: ${device.status}</div>
              <div class="device-info">Firmware: ${device.firmware || 'Unknown'}</div>
              <div class="device-info">Last Seen: ${new Date(device.lastSeen).toLocaleTimeString()}</div>
              <button class="btn" onclick="sendCommand('${device.id}', 'Reset')">Reset Device</button>
            </div>
          `).join('');
        }
        
        // Update sessions
        const sessionsBody = document.getElementById('sessions');
        if (data.sessions.length === 0) {
          sessionsBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #9ca3af;">No active sessions</td></tr>';
        } else {
          sessionsBody.innerHTML = data.sessions.map(session => `
            <tr>
              <td>${session.stationId}</td>
              <td>${session.connector}</td>
              <td>${new Date(session.startTime).toLocaleString()}</td>
              <td>${session.energy.toFixed(2)}</td>
              <td class="status-online">${session.status}</td>
            </tr>
          `).join('');
        }
        
        // Update log (last 10 entries)
        const logDiv = document.getElementById('log');
        if (data.log.length > 0) {
          logDiv.innerHTML = data.log.slice(-10).reverse().map(entry => `
            <div class="log-entry">${new Date(entry.time).toLocaleTimeString()} - ${entry.message}</div>
          `).join('');
        }
      } catch (error) {
        console.error('Error fetching status:', error);
      }
    }, 2000);

    async function sendCommand(stationId, action) {
      try {
        const response = await fetch(`/api/command/${stationId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, payload: { type: 'Soft' } })
        });
        const result = await response.json();
        alert(result.success ? 'Command sent!' : 'Failed: ' + result.error);
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  </script>
</body>
</html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  // ======================
  // API: Get Server Status
  // ======================
  if (url.pathname === '/api/status') {
    const devices = Array.from(connectedDevices.entries()).map(([id, data]) => ({
      id,
      status: data.info.status || 'Available',
      firmware: data.info.firmware,
      lastSeen: data.lastSeen
    }));

    const sessions = Array.from(chargingSessions.values()).map(session => ({
      stationId: session.stationId,
      connector: session.connector,
      startTime: session.startTime,
      energy: session.energy || 0,
      status: session.status
    }));

    return Response.json({
      devices,
      sessions,
      log: statusHistory
    });
  }

  // ======================
  // API: Send Command to Device
  // ======================
  if (url.pathname.startsWith('/api/command/') && req.method === 'POST') {
    const stationId = url.pathname.split('/').pop();
    const device = connectedDevices.get(stationId);

    if (!device || device.socket.readyState !== WebSocket.OPEN) {
      return Response.json({ success: false, error: 'Device not connected' }, { status: 404 });
    }

    const { action, payload } = await req.json();
    const messageId = Date.now().toString();
    const ocppMessage = [CALL, messageId, action, payload || {}];

    device.socket.send(JSON.stringify(ocppMessage));
    addLog(`Command sent to ${stationId}: ${action}`);

    return Response.json({ success: true, messageId });
  }

  // ======================
  // API: Get All Devices (for Base44)
  // ======================
  if (url.pathname === '/api/devices') {
    const devices = Array.from(connectedDevices.entries()).map(([id, data]) => ({
      station_id: id,
      status: data.info.status || 'available',
      firmware_version: data.info.firmware,
      last_heartbeat: data.lastSeen,
      connected: true
    }));

    return Response.json({ success: true, devices });
  }

  // ======================
  // API: Get Device Sessions (for Base44)
  // ======================
  if (url.pathname.startsWith('/api/sessions/')) {
    const stationId = url.pathname.split('/').pop();
    const sessions = Array.from(chargingSessions.values())
      .filter(s => s.stationId === stationId)
      .map(session => ({
        station_id: session.stationId,
        connector_id: session.connector,
        start_time: session.startTime,
        energy_delivered: session.energy || 0,
        status: session.status,
        transaction_id: session.transactionId
      }));

    return Response.json({ success: true, sessions });
  }

  // ======================
  // OCPP WebSocket Connection
  // ======================
  const pathParts = url.pathname.split('/');
  const stationId = pathParts[pathParts.length - 1];

  if (!stationId || stationId === 'ocpp16') {
    return new Response('Station ID required. Use: /ocpp16/[station_id]', { status: 400 });
  }

  if (req.headers.get('upgrade') !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log(`✅ Device Connected: ${stationId}`);
    connectedDevices.set(stationId, {
      socket,
      info: {},
      lastSeen: new Date().toISOString()
    });
    addLog(`Device ${stationId} connected`);
  };

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      const [messageType, messageId, action, payload] = message;

      console.log(`📨 From ${stationId}:`, action, payload);
      
      const device = connectedDevices.get(stationId);
      if (device) {
        device.lastSeen = new Date().toISOString();
      }

      if (messageType === CALL) {
        let responsePayload;

        switch (action) {
          case 'BootNotification':
            responsePayload = {
              status: 'Accepted',
              currentTime: new Date().toISOString(),
              interval: 300
            };
            if (device) {
              device.info.firmware = payload.firmwareVersion;
              device.info.status = 'Available';
            }
            addLog(`${stationId} booted (FW: ${payload.firmwareVersion})`);
            break;

          case 'Heartbeat':
            responsePayload = { currentTime: new Date().toISOString() };
            addLog(`${stationId} heartbeat`);
            break;

          case 'StatusNotification':
            responsePayload = {};
            if (device) {
              device.info.status = payload.status;
            }
            addLog(`${stationId} status: ${payload.status}`);
            break;

          case 'StartTransaction':
            const transactionId = Date.now();
            responsePayload = {
              transactionId,
              idTagInfo: { status: 'Accepted' }
            };
            chargingSessions.set(transactionId, {
              stationId,
              connector: payload.connectorId || 1,
              startTime: new Date().toISOString(),
              meterStart: payload.meterStart || 0,
              energy: 0,
              status: 'Active',
              transactionId
            });
            addLog(`${stationId} started charging (ID: ${transactionId})`);
            break;

          case 'StopTransaction':
            responsePayload = { idTagInfo: { status: 'Accepted' } };
            const session = chargingSessions.get(payload.transactionId);
            if (session) {
              session.status = 'Completed';
              session.energy = (payload.meterStop - session.meterStart) / 1000;
              addLog(`${stationId} stopped charging (${session.energy.toFixed(2)} kWh)`);
            }
            break;

          case 'MeterValues':
            responsePayload = {};
            // Update session energy in real-time
            break;

          default:
            responsePayload = {};
            addLog(`${stationId} unknown action: ${action}`);
        }

        socket.send(JSON.stringify([CALLRESULT, messageId, responsePayload]));
      }
    } catch (error) {
      console.error('Error:', error);
      addLog(`Error processing message from ${stationId}: ${error.message}`);
    }
  };

  socket.onclose = () => {
    console.log(`❌ Device Disconnected: ${stationId}`);
    connectedDevices.delete(stationId);
    addLog(`Device ${stationId} disconnected`);
  };

  return response;
});

function addLog(message) {
  statusHistory.push({
    time: new Date().toISOString(),
    message
  });
  // Keep only last 100 entries
  if (statusHistory.length > 100) {
    statusHistory.shift();
  }
}

console.log(`✅ Server running on port ${OCPP_PORT}`);
console.log(`🌐 Dashboard: http://localhost:${OCPP_PORT}`);
console.log(`📡 WebSocket: ws://localhost:${OCPP_PORT}/ocpp16/[STATION-ID]`);