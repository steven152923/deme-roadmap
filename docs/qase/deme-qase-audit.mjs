import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {cases,suites} from './deme-qa-catalog.mjs';
const child=spawn('/bin/zsh',['/Users/stevenclarkson/Downloads/Deme/.codex/qase-mcp.zsh'],{cwd:'/Users/stevenclarkson/Downloads/Deme',stdio:['pipe','pipe','pipe']});let id=0;const p=new Map();
createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(p.has(m.id)){p.get(m.id)(m);p.delete(m.id)}}catch{}});child.stderr.on('data',()=>{});
function req(method,params={}){const n=++id;child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Timeout '+method)),60000);p.set(n,m=>{clearTimeout(t);resolve(m)})})}
async function call(name,args){const r=await req('tools/call',{name,arguments:args});if(r.error||r.result?.isError)throw Error(JSON.stringify(r));return r.result.structuredContent??JSON.parse(r.result.content.find(c=>c.type==='text'&&c.text.startsWith('{')).text)}
async function api(path,query){const r=await call('qase_api',{method:'GET',path,query});if(!r.status)throw Error(JSON.stringify(r));return r.result}
async function list(path){const out=[];for(let offset=0;offset<10000;offset+=100){const r=await api(path,{limit:'100',offset:String(offset)});const rows=r.entities??[];out.push(...rows);if(out.length>=r.total||rows.length<100)break}return out}
try{await req('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'deme-qase-audit',version:'1'}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const [ctx,remoteCases,plans,runs,envs]=await Promise.all([call('qase_project_context',{code:'DEME',full:true}),list('/v1/case/DEME'),list('/v1/plan/DEME'),list('/v1/run/DEME'),list('/v1/environment/DEME')]);
 const titles=remoteCases.map(c=>c.title),dupes=titles.filter((x,i)=>titles.indexOf(x)!==i);const missing=cases.filter(c=>!titles.includes(`[${c.risk}] ${c.title}`));
 const suiteIdSet=new Set(ctx.suites.entities.map(s=>s.id));const bySuite=Object.fromEntries(ctx.suites.entities.map(s=>[s.id,0]));for(const c of remoteCases)bySuite[c.suite_id]=(bySuite[c.suite_id]??0)+1;
 console.log('PROJECT',JSON.stringify(ctx.project));console.log('SUITES',ctx.suites.total,'WITH_CASES',Object.values(bySuite).filter(n=>n>0).length,'ROOTS',ctx.suites.entities.filter(s=>!s.parent_id).length);
 console.log('CASES',remoteCases.length,'MISSING',missing.length,'DUPLICATE_TITLES',dupes.length,'UNMAPPED_SUITE_IDS',remoteCases.filter(c=>!suiteIdSet.has(c.suite_id)).length);
 console.log('PRIORITIES',JSON.stringify(Object.fromEntries(['P0','P1','P2','P3'].map(r=>[r,remoteCases.filter(c=>c.title.startsWith(`[${r}]`)).length]))));
 console.log('ENVIRONMENTS',JSON.stringify(envs.map(e=>({id:e.id,title:e.title}))));
 for(const pl of plans){const detail=await api(`/v1/plan/DEME/${pl.id}`);console.log('PLAN',pl.id,pl.title,'COUNT',detail.cases?.length??detail.cases_count??'unknown')}
 for(const run of runs){const detail=await api(`/v1/run/DEME/${run.id}`);console.log('RUN',run.id,run.title,'ENV',detail.environment?.title,'PLAN',detail.plan_id,'STATUS',detail.status,'STATS',JSON.stringify(detail.stats??{}));try{const results=await api('/v1/result/DEME',{run:String(run.id),limit:'100',offset:'0'});console.log('RESULTS',run.id,'TOTAL',results.total??0,'ROWS',JSON.stringify((results.entities??[]).slice(0,3).map(x=>({status:x.status,case_id:x.case_id}))))}catch(e){console.log('RESULT_READ_ERROR',run.id,e.message.slice(0,300))}}
 for(const n of [1,40,85,115,171]){const c=await api(`/v1/case/DEME/${n}`);console.log('SAMPLE',n,c.title,'STEPS',c.steps?.length,'PRIORITY',c.priority,'SEVERITY',c.severity,'AUTOMATION',c.automation,'SUITE',c.suite_id)}
 if(ctx.suites.total!==67||remoteCases.length!==cases.length||dupes.length||missing.length)process.exitCode=2;
}catch(e){console.error('AUDIT FAILED',e.message);process.exitCode=1}finally{child.kill()}
