import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const child = spawn('/bin/zsh', ['/Users/stevenclarkson/Downloads/Deme/.codex/qase-mcp.zsh'], {
  cwd: '/Users/stevenclarkson/Downloads/Deme',
  env: { ...process.env, NPM_CONFIG_CACHE: '/Users/stevenclarkson/Downloads/Deme/.qase-mcp-cache' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let nextId = 0;
const pending = new Map();
createInterface({ input: child.stdout }).on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id != null && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
function request(method, params = {}) {
  const id = ++nextId;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 60000);
    pending.set(id, (response) => { clearTimeout(timer); resolve(response); });
  });
}
try {
  const init = await request('initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'deme-qase-readonly-probe', version: '1.0.0' },
  });
  if (init.error) throw new Error(JSON.stringify(init.error));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  console.log('MCP initialize:', init.result?.serverInfo);
  const list = await request('tools/list');
  if (list.error) throw new Error(JSON.stringify(list.error));
  if (!process.argv[2]) {
    console.log('Tool names:', list.result.tools.map((tool) => tool.name).join(', '));
    for (const name of ['qase_get', 'qase_project_context', 'qase_api']) {
      const tool = list.result.tools.find((item) => item.name === name);
      console.log(`${name} schema:`, JSON.stringify(tool?.inputSchema));
    }
  }
  const name = process.argv[2];
  if (name) {
    if (!['qase_get', 'qase_project_context', 'qase_api', 'qql_help'].includes(name)) throw new Error('Only read-only probe tools allowed');
    const args = JSON.parse(process.argv[3] || '{}');
    const response = await request('tools/call', { name, arguments: args });
    console.log(`${name} result:`, JSON.stringify(response));
  }
} catch (error) {
  console.error('Probe failed:', error.message);
  console.error('Server diagnostics:', stderr.slice(-3000));
  process.exitCode = 1;
} finally {
  child.kill();
}
