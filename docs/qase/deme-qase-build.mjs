import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { cases, suites } from './deme-qa-catalog.mjs';

const child = spawn('/bin/zsh', ['/Users/stevenclarkson/Downloads/Deme/.codex/qase-mcp.zsh'], {cwd:'/Users/stevenclarkson/Downloads/Deme',stdio:['pipe','pipe','pipe']});
let nextId=0, stderr=''; const pending=new Map();
createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}catch{}});
child.stderr.on('data',x=>{stderr+=x.toString();stderr=stderr.slice(-4000)});
function request(method,params={}){const id=++nextId;child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(`Timeout ${method}`)),120000);pending.set(id,m=>{clearTimeout(t);resolve(m)})})}
function content(r){if(r.error)throw Error(JSON.stringify(r.error));const x=r.result;if(!x)throw Error('Empty MCP response');if(x.isError)throw Error(JSON.stringify(x.content));if(x.structuredContent)return x.structuredContent;const s=x.content?.find(c=>c.type==='text'&&c.text?.startsWith('{'))?.text;if(s)return JSON.parse(s);return x}
async function tool(name,args){return content(await request('tools/call',{name,arguments:args}))}
async function api(path,query){const x=await tool('qase_api',{method:'GET',path,query});if(x.status===false)throw Error(`${path}: ${JSON.stringify(x)}`);return x.result??x}
async function list(path){const out=[];for(let offset=0;offset<10000;offset+=100){const x=await api(path,{limit:'100',offset:String(offset)});const es=x.entities??[];out.push(...es);if(out.length>=(x.total??x.filtered??0)||es.length<100)break}return out}
function idOf(x){return x?.result?.id??x?.id??x?.result?.entity?.id??x?.entity?.id}
function casePayload(c,suiteId){const priority={P0:'high',P1:'high',P2:'medium',P3:'low'}[c.risk];const severity={P0:'blocker',P1:'critical',P2:'normal',P3:'minor'}[c.risk];return {title:`[${c.risk}] ${c.title}`,description:(c.description||'Manual release-regression check derived from the current Deme implementation.')+'\n\nExecution: Record the actual device, OS/version, Deme build, account/role, observed behavior and reproducibility for any failure. Attach evidence and link a Qase defect for a genuine bug.',preconditions:c.preconditions,postconditions:'The final state matches all expected step results; any failed or blocked step is recorded with actual observations.',priority,severity,type:'functional',layer:'e2e',automation:'0',status:'actual',suite_id:suiteId,steps:c.steps.map(([action,expected_result])=>({action,expected_result})),tags:['release-regression',c.risk.toLowerCase()]}}
const stage=process.argv[2]||'all';
try{
 const init=await request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'deme-qase-build',version:'1'}});if(init.error)throw Error(JSON.stringify(init.error));
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 await request('tools/list');
 for(const query of ['suite upsert','case bulk create','plan upsert','environment upsert'])await tool('qase_discover_tools',{query});
 const context=await tool('qase_project_context',{code:'DEME',full:true});
 if(context.project?.code!=='DEME')throw Error('Wrong project');
 console.log('BASELINE',JSON.stringify(context.project.counts));
 const paths=[...new Set(suites.flatMap(s=>s.split('/').map((_,i)=>s.split('/').slice(0,i+1).join('/'))))].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b));
 const ids=new Map();
 const existingSuites=await list('/v1/suite/DEME');
 const byId=new Map(existingSuites.map(s=>[s.id,s]));
 function suitePath(s){const parent=s.parent_id?byId.get(s.parent_id):null;return parent?`${suitePath(parent)}/${s.title}`:s.title}
 for(const s of existingSuites)ids.set(suitePath(s),s.id);
 if(['all','suites'].includes(stage)){
  let created=0;
  for(const path of paths){if(ids.has(path))continue;const pieces=path.split('/');const title=pieces.at(-1);const parent=pieces.length>1?ids.get(pieces.slice(0,-1).join('/')):null;if(pieces.length>1&&!parent)throw Error('Missing parent '+path);
   const args={code:'DEME',title,description:`Deme release-regression tests for ${path}.`};if(parent)args.parent_id=parent;
   const r=await tool('qase_suite_upsert',args);const id=idOf(r);if(!id)throw Error('Suite create response '+path+' '+JSON.stringify(r));ids.set(path,id);created++;if(created%10===0)console.log('SUITES CREATED',created);
  }
  console.log('SUITES TOTAL',ids.size,'CREATED',created);
 }
 if(stage==='suites')process.exit(0);
 if(ids.size!==paths.length)throw Error(`Suite mismatch ${ids.size}/${paths.length}`);
 const existingCases=await list('/v1/case/DEME');
 const caseMap=new Map(existingCases.map(x=>[x.title,x]));
 let created=0,updated=0;
 if(['all','cases'].includes(stage)){
  for(let i=0;i<cases.length;i+=25){const batch=cases.slice(i,i+25);const fresh=batch.filter(c=>!caseMap.has(`[${c.risk}] ${c.title}`));
   if(fresh.length){const result=await tool('qase_case_bulk_create',{code:'DEME',cases:fresh.map(c=>casePayload(c,ids.get(c.suite)))});if(result.status===false)throw Error('Case batch '+i+' '+JSON.stringify(result));console.log('BATCH',i,'CREATED',fresh.length,'RESPONSE',JSON.stringify(result).slice(0,400));created+=fresh.length}
   const seen=await list('/v1/case/DEME');caseMap.clear();for(const x of seen)caseMap.set(x.title,x);
   for(const c of batch){if(!caseMap.has(`[${c.risk}] ${c.title}`))throw Error('Missing after batch: '+c.title)}
   console.log('CASES VERIFIED',Math.min(i+25,cases.length),'REMOTE TOTAL',seen.length);
  }
  console.log('CASES CREATED',created,'UPDATED',updated);
 }
 if(stage==='cases')process.exit(0);
 if(cases.some(c=>!caseMap.has(`[${c.risk}] ${c.title}`)))throw Error('Catalog cases missing remotely');
 const fullIds=cases.map(c=>caseMap.get(`[${c.risk}] ${c.title}`).id);
 const smokeIds=cases.filter(c=>c.suite==='Release Gate Smoke').map(c=>caseMap.get(`[${c.risk}] ${c.title}`).id);
 const environments=await list('/v1/environment/DEME');const envIds={};
 for(const [platform,title] of [['ios','iOS Release Candidate'],['android','Android Release Candidate']]){
  const found=environments.find(x=>x.title===title);if(found){envIds[platform]=found.id;continue}
  const r=await tool('qase_environment_upsert',{code:'DEME',title,slug:`${platform}-release-candidate`,description:`Manual ${platform==='ios'?'iOS':'Android'} release-candidate testing. Tester records actual device, OS version, Deme build, and network condition during execution.`});const id=idOf(r);if(!id)throw Error('Environment '+JSON.stringify(r));envIds[platform]=id;
 }
 console.log('ENVIRONMENTS',JSON.stringify(envIds));
 const plans=await list('/v1/plan/DEME');const planIds={};
 for(const [key,title,idList] of [['full','Deme - Full Release Regression',fullIds],['smoke','Deme - Release Gate Smoke',smokeIds]]){
  const found=plans.find(x=>x.title===title);const args={code:'DEME',title,description:key==='full'?'Reusable comprehensive manual release regression for current Deme iOS and Android implementation. All cases start untested; record device, OS, build and actual evidence.':'Critical build-viability checks only; run before the full regression.',cases:idList};if(found)args.id=found.id;
  const r=await tool('qase_plan_upsert',args);const id=idOf(r)??found?.id;if(!id)throw Error('Plan '+JSON.stringify(r));planIds[key]=id;
 }
 console.log('PLANS',JSON.stringify(planIds));
 const existingRuns=await list('/v1/run/DEME');
 for(const [platform,title] of [['ios','Deme Final QA - iOS'],['android','Deme Final QA - Android']]){
  const found=existingRuns.find(x=>x.title===title);if(found){const desc=`Manual ${platform==='ios'?'iOS':'Android'} release-candidate run from the full regression plan. All results begin untested. Record actual device, OS/version, Deme build and evidence. Platform-specific cases for the other OS are intentionally not executed in this run.`;const r=await tool('qase_run_upsert',{code:'DEME',id:found.id,title,description:desc,environment_id:envIds[platform]});console.log('RUN REUSED',title,found.id,JSON.stringify(r).slice(0,250));continue}
  const selected=cases.filter(c=>!c.suite.startsWith('Cross-Cutting/')||!['Cross-Cutting/iOS','Cross-Cutting/Android'].includes(c.suite)||c.suite===`Cross-Cutting/${platform==='ios'?'iOS':'Android'}`).map(c=>caseMap.get(`[${c.risk}] ${c.title}`).id);
  try{const r=await tool('qase_run_upsert',{code:'DEME',title,description:`Manual ${platform==='ios'?'iOS':'Android'} release-candidate run from the full regression plan. All results begin untested. Record actual device, OS/version, Deme build and evidence. Opposite-platform-only cases excluded.`,environment_id:envIds[platform],plan_id:planIds.full,cases:selected,is_autotest:false});if(r.status===false)throw Error(JSON.stringify(r));console.log('RUN CREATED',title,JSON.stringify(r).slice(0,300))}catch(e){console.log('RUN FAILED',title,e.message.slice(0,600))}
 }
 console.log('DONE');
}catch(e){console.error('BUILD FAILED',e.message);console.error('MCP DIAGNOSTICS',stderr);process.exitCode=1}finally{child.kill()}
