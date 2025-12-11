// OCPP 1.6 WebSocket Server - Standalone with Dashboard
// Tracks connected devices and displays them in real-time

const BRIDGE_URL = Deno.env.get("BRIDGE_URL");
const BRIDGE_SECRET = Deno.env.get("BRIDGE_SECRET");

const CALL = 2;
const CALLRESULT = 3;
const CALLERROR = 4;

// Store devices and sessions in memory
const connectedDevices = new Map();
const activeSessions = new Map();
const activityLog = [];

console.log('🚀 OCPP WebSocket Server Starting...');

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

function generateDashboard() {
  const devices = Array.from(connectedDevices.values());
  const sessions = Array.from(activeSessions.values());
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ OCPP Server Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
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
    .device-grid { display: grid; gap: 15px; }
    .device-item { background: #f8fafc; border-radius: 12px; padding: 20px; border: 2px solid #e2e8f0; transition: all 0.2s; }
    .device-item:hover { border-color: #667eea; transform: translateY(-2px); }
    .device-header { display: flex; justify-content: between; align-items: center; margin-bottom: 12px; }
    .device-name { font-size: 18px; font-weight: 700; color: #1e293b; }
    .device-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; font-size: 13px; color: #64748b; }
    .session-table { width: 100%; border-collapse: collapse; }
    .session-table th { background: #f8fafc; padding: 12px; text-align: left; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }
    .session-table td { padding: 12px; border-top: 1px solid #e2e8f0; font-size: 14px; }
    .log { background: #1e293b; border-radius: 12px; padding: 20px; max-height: 300px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 12px; }
    .log-entry { color: #10b981; margin-bottom: 4px; }
    .empty { text-align: center; padding: 40px; color: #94a3b8; font-size: 14px; }
  </style>
  <script>
    setInterval(() => location.reload(), 5000);
  </script>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">⚡ OCPP Server Dashboard</div>
      <div class="subtitle">Railway Standalone Testing Environment</div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Connected Devices</div>
        <div class="stat-value" style="color: #10b981;">${devices.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Sessions</div>
        <div class="stat-value" style="color: #f59e0b;">${sessions.length}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔌 Connected Devices</div>
      ${devices.length === 0 ? 
        '<div class="empty">No devices connected yet. Configure your device to connect to this server.</div>' :
        '<div class="device-grid">' + devices.map(d => `
          <div class="device-item">
            <div class="device-header">
              <div class="device-name">${d.station_id}</div>
              <span class="badge badge-success">Online</span>
            </div>
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
      <div class="card-title">⚡ Active Charging Sessions</div>
      ${sessions.length === 0 ?
        '<div class="empty">No active sessions</div>' :
        '<table class="session-table"><thead><tr><th>Station ID</th><th>Connector</th><th>Start Time</th><th>Energy (kWh)</th><th>Status</th></tr></thead><tbody>' +
        sessions.map(s => `
          <tr>
            <td>${s.station_id}</td>
            <td>${s.connector_id}</td>
            <td>${new Date(s.start_time).toLocaleString()}</td>
            <td>${s.energy_kwh.toFixed(2)}</td>
            <td><span class="badge badge-success">Charging</span></td>
          </tr>
        `).join('') + '</tbody></table>'
      }
    </div>

    <div class="card">
      <div class="card-title">📋 Recent Activity Log</div>
      <div class="log">
        ${activityLog.length === 0 ? 
          '<div style="color: #64748b;">Server started. Waiting for device connections...</div>' :
          activityLog.slice(0, 20).map(l => `<div class="log-entry">[${new Date(l.timestamp).toLocaleTimeString()}] ${l.message}</div>`).join('')
        }
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔧 Server Information</div>
      <div class="device-meta">
        <div><strong>WebSocket URL:</strong> <code>wss://YOUR-PROJECT.up.railway.app/ocpp16/[STATION-ID]</code></div>
        <div><strong>API Endpoint:</strong> <code>https://YOUR-PROJECT.up.railway.app/api/*</code></div>
        <div><strong>Protocol:</strong> OCPP 1.6J (JSON over WebSocket)</div>
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
            const transactionId = Date.now();
            response = { transactionId, idTagInfo: { status: 'Accepted' } };
            activeSessions.set(transactionId.toString(), {
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
              transaction_id: transactionId.toString()
            });
            break;

          case 'StopTransaction':
            response = { idTagInfo: { status: 'Accepted' } };
            const session = activeSessions.get(payload.transactionId?.toString());
            if (session && payload.meterStop) {
              session.energy_kwh = (payload.meterStop / 1000).toFixed(3);
            }
            activeSessions.delete(payload.transactionId?.toString());
            await callBridge('updateSession', {
              station_id: stationId,
              updates: { 
                status: 'completed', 
                end_time: new Date().toISOString(),
                energy_delivered: session?.energy_kwh || 0
              }
            });
            break;

          case 'MeterValues':
            response = {};
            // Extract real-time power and energy from meter values
            const transId = payload.transactionId?.toString();
            if (transId && activeSessions.has(transId)) {
              const currentSession = activeSessions.get(transId);
              
              // Parse sampled values for Power.Active.Import (Watts) and Energy.Active.Import.Register (Wh)
              if (payload.meterValue && payload.meterValue[0]?.sampledValue) {
                for (const sample of payload.meterValue[0].sampledValue) {
                  if (sample.measurand === 'Power.Active.Import' && sample.value) {
                    currentSession.current_power_w = parseFloat(sample.value);
                  }
                  if (sample.measurand === 'Energy.Active.Import.Register' && sample.value) {
                    const energyWh = parseFloat(sample.value);
                    currentSession.energy_kwh = (energyWh / 1000).toFixed(3);
                  }
                }
                
                // Update Base44 database with real-time values
                await callBridge('updateSession', {
                  station_id: stationId,
                  updates: {
                    energy_delivered: parseFloat(currentSession.energy_kwh) || 0,
                    current_power: currentSession.current_power_w || 0
                  }
                });
                
                addLog(`⚡ Power: ${currentSession.current_power_w || 0}W | Energy: ${currentSession.energy_kwh || 0} kWh`);
              }
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