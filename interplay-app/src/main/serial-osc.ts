import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import dgram from 'dgram';
import { forwardToWebSocket } from './osc-bridge';

// OSC message encoding
function encodeOSCMessage(address: string, value: number): Buffer {
  // Pad string to 4-byte boundary
  const padString = (s: string): Buffer => {
    const buf = Buffer.from(s + '\0');
    const padLen = 4 - (buf.length % 4);
    return padLen < 4 ? Buffer.concat([buf, Buffer.alloc(padLen)]) : buf;
  };

  const addressBuf = padString(address);
  const typeBuf = padString(',f');
  const valueBuf = Buffer.alloc(4);
  valueBuf.writeFloatBE(value, 0);

  return Buffer.concat([addressBuf, typeBuf, valueBuf]);
}

interface SerialOSCState {
  port: SerialPort | null;
  parser: ReadlineParser | null;
  udp: dgram.Socket | null;
  destHost: string;
  destPort: number;
  connected: boolean;
  log: Array<{ type: 'serial' | 'osc' | 'error' | 'info'; message: string; timestamp: number }>;
}

const state: SerialOSCState = {
  port: null,
  parser: null,
  udp: null,
  destHost: '127.0.0.1',
  destPort: 8000,
  connected: false,
  log: [],
};

const MAX_LOG = 100;

function addLog(type: SerialOSCState['log'][0]['type'], message: string) {
  state.log.push({ type, message, timestamp: Date.now() });
  if (state.log.length > MAX_LOG) state.log.shift();
}

export async function listSerialPorts(): Promise<Array<{ path: string; manufacturer?: string }>> {
  const ports = await SerialPort.list();
  return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer || undefined }));
}

export function connectSerial(portPath: string): { success: boolean; error?: string } {
  if (state.connected) {
    disconnectSerial();
  }

  try {
    // Create UDP socket for OSC
    state.udp = dgram.createSocket('udp4');

    // Create serial port
    state.port = new SerialPort({
      path: portPath,
      baudRate: 115200,
    });

    state.parser = new ReadlineParser({ delimiter: '\n' });
    state.port.pipe(state.parser);

    state.parser.on('data', (line: string) => {
      const input = line.trim();
      if (!input) return;

      addLog('serial', input);

      if (input.startsWith('/')) {
        const lastSlash = input.lastIndexOf('/');
        if (lastSlash > 0 && lastSlash < input.length - 1) {
          const address = input.substring(0, lastSlash);
          const valueStr = input.substring(lastSlash + 1);
          const value = parseFloat(valueStr);

          if (!isNaN(value) && state.udp) {
            const oscBuf = encodeOSCMessage(address, value);
            state.udp.send(oscBuf, state.destPort, state.destHost, (err) => {
              if (err) {
                addLog('error', `OSC send error: ${err.message}`);
              }
            });
            // Also forward to p5.js via WebSocket bridge
            forwardToWebSocket(oscBuf);
            addLog('osc', `${address} ${value}`);
          } else {
            addLog('error', `Invalid value: ${valueStr}`);
          }
        } else {
          addLog('error', `Invalid format: ${input}`);
        }
      }
    });

    state.port.on('error', (err) => {
      addLog('error', `Serial error: ${err.message}`);
      state.connected = false;
    });

    state.port.on('close', () => {
      addLog('info', 'Serial port closed');
      state.connected = false;
    });

    state.connected = true;
    addLog('info', `Connected to ${portPath}`);
    return { success: true };
  } catch (e: any) {
    addLog('error', `Failed to connect: ${e.message}`);
    return { success: false, error: e.message };
  }
}

export function disconnectSerial(): void {
  if (state.port && state.port.isOpen) {
    state.port.close();
  }
  state.port = null;
  state.parser = null;

  if (state.udp) {
    state.udp.close();
    state.udp = null;
  }

  state.connected = false;
  addLog('info', 'Disconnected');
}

export function getSerialOSCStatus(): {
  connected: boolean;
  portPath?: string;
  destHost: string;
  destPort: number;
  log: SerialOSCState['log'];
} {
  return {
    connected: state.connected,
    portPath: state.port?.path,
    destHost: state.destHost,
    destPort: state.destPort,
    log: state.log.slice(-20),
  };
}

export function setOSCDestination(host: string, port: number): void {
  state.destHost = host;
  state.destPort = port;
  addLog('info', `OSC destination: ${host}:${port}`);
}
