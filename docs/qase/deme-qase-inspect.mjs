import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const child=spawn('/bin/zsh',['/Users/stevenclarkson/Downloads/Deme/.codex/qase-mcp.zsh'],{cwd:'/Users/stevenclarkson/Downloads/Deme',stdio:['pipe','pipe','pipe']});
let id=0;const pending=new Map();
createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}catch{}});
child.stderr.on('data',()=>{});
function req(method,params={}){const x=++id;child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:x,method,params})+'\n');return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('timeout '+method)),60000);pending.set(x,m=>{clearTimeout(t);resolve(m)})})}
try{
 const init=await req('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'deme-qase-inspect',version:'1'}});if(init.error)throw Error(JSON.stringify(init.error));
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const list=await req('tools/list');
 for(const n of ['qase_discover_tools','qase_project_context','qase_suite_upsert','qase_case_bulk_create','qase_case_upsert','qase_plan_upsert','qase_environment_upsert','qase_run_upsert','qase_api']){const t=list.result.tools.find(t=>t.name===n);if(t)console.log(n,JSON.stringify(t.inputSchema))}
 for(const q of ['suite','bulk create','plan','environment']){const r=await req('tools/call',{name:'qase_discover_tools',arguments:{query:q}});console.log('DISCOVER',q,JSON.stringify(r.result).slice(0,5000))}
 const l2=await req('tools/list');for(const n of ['qase_suite_upsert','qase_case_bulk_create','qase_plan_upsert','qase_environment_upsert','qase_run_upsert']){const t=l2.result.tools.find(t=>t.name===n);if(t)console.log('AFTER',n,JSON.stringify(t.inputSchema))}
}catch(e){console.error(e);process.exitCode=1}finally{child.kill()}
