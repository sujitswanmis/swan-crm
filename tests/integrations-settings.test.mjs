import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as config from '../src/config/integrationsConfig.js';
import * as store from '../src/lib/integrations/store.js';
import * as policies from '../src/lib/integrations/tenantPolicy.js';
import {hashSecret} from '../src/lib/integrations/security.js';

async function load(relative,mocks={}){
  const require=createRequire(import.meta.url),file=fileURLToPath(new URL('../'+relative,import.meta.url));
  const {code}=require('next/dist/build/swc').transformSync(await readFile(file,'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
  const compiled=new Module(file);compiled.filename=file;compiled.paths=Module._nodeModulePaths(path.dirname(file));
  const original=compiled.require.bind(compiled);compiled.require=id=>Object.hasOwn(mocks,id)?mocks[id]:original(id);compiled._compile(code,file);
  return compiled.exports;
}
const features=Object.fromEntries(config.INTEGRATION_FEATURES.map(feature=>[feature.id,true]));
async function actionsFixture(rows=[]){
  const ranges=[],writes=[],filters=[],context={tenant:{id:'tenant-a',code:'TNT00002'},branchCode:'TNT00002-B0002',user:{id:'user-a'},actorCode:'EMP001'};
  let enabled=true;
  const db={from:table=>{
    const criteria=[];const query={select:()=>query,eq:(key,value)=>{criteria.push([key,value]);return query;},neq:()=>query,gte:()=>query,lt:()=>query,ilike:()=>query,
      order:()=>query,range:async(from,to)=>{filters.push({table,criteria:[...criteria]});ranges.push([from,to]);const matched=rows.filter(row=>criteria.every(([key,value])=>row[key]===value));return {data:matched.slice(from,to+1),count:matched.length};},
      maybeSingle:async()=>({data:rows.find(row=>criteria.every(([key,value])=>row[key]===value))||null})};return query;
  },rpc:async(name,args)=>{writes.push({name,args});return {data:true};}};
  context.db=db;
  const {integrationAction}=await load('src/app/actions/integrations.js',{
    '../../lib/integrations/access.js':{requireSessionAccess:async()=>context},
    '../../lib/integrations/store.js':{...store,consumeRateLimit:async()=>{}},
    '../../lib/integrations/tenantPolicy.js':{...policies,requireTenantFeature:async()=>{const policy={ready:true,enabled,features};policies.assertTenantFeature(policy);return policy;}},
  });
  return {run:integrationAction,ranges,writes,filters,disable:()=>{enabled=false;}};
}
const keyRows=count=>Array.from({length:count},(_,index)=>({code:`KEY_${String(index).padStart(6,'0')}`,tenant_id:'tenant-a',branch_code:'TNT00002-B0002',name:'Fixture',created_at:'2026-11-12T10:00:00+05:30'}));

test('integration lists accept configured page sizes and preserve exact scoped ranges',async()=>{
  for(const size of [3,5,10,15,20,25,37,50,100,500,1000]){
    const fixture=await actionsFixture([...keyRows(1200),{...keyRows(1)[0],tenant_id:'other-tenant'}]);
    const result=await fixture.run({command:'list',resource:'keys',pageSize:String(size),currentPage:2});
    assert.equal(result.success,true,`size ${size}`);assert.equal(result.total,1200);
    assert.deepEqual(fixture.ranges,[[size,2*size-1]]);
    assert.ok(fixture.filters[0].criteria.some(([key,value])=>key==='tenant_id'&&value==='tenant-a'));
    assert.ok(fixture.filters[0].criteria.some(([key,value])=>key==='branch_code'&&value==='TNT00002-B0002'));
  }
});
test('All reads multiple bounded batches with tenant and branch filters on every query',async()=>{
  const fixture=await actionsFixture([...keyRows(2505),{...keyRows(1)[0],branch_code:'TNT00002-B0001'}]);
  const result=await fixture.run({command:'list',resource:'keys',pageSize:100000,currentPage:1});
  assert.equal(result.success,true);assert.equal(result.total,2505);assert.equal(result.rows.length,2505);
  assert.deepEqual(fixture.ranges,[[0,999],[1000,1999],[2000,2504]]);
  assert.equal(new Set(result.rows.map(row=>row.code)).size,2505);
  for(const query of fixture.filters)assert.deepEqual(query.criteria,[['tenant_id','tenant-a'],['branch_code','TNT00002-B0002']]);
});
test('invalid pagination and oversized All results fail clearly without returning partial data',async()=>{
  for(const input of [{pageSize:0},{pageSize:-5},{pageSize:1.5},{pageSize:1001},{pageSize:'invalid'},{pageSize:true},{currentPage:[]},{currentPage:0},{currentPage:1.5},{pageSize:'All',currentPage:2}]){
    const fixture=await actionsFixture(),result=await fixture.run({command:'list',resource:'keys',...input});
    assert.equal(result.success,false,JSON.stringify(input));assert.equal(fixture.ranges.length,0);
  }
  const fixture=await actionsFixture(keyRows(5001)),result=await fixture.run({command:'list',resource:'keys',pageSize:'All'});
  assert.equal(result.success,false);assert.equal(result.code,'all_rows_limit');assert.match(result.error,/5,000/);assert.equal(result.rows,undefined);assert.equal(fixture.ranges.length,1);
});
test('Never expires is explicit, writes a null expiry, and retains hashing and tenant/branch scope',async()=>{
  const fixture=await actionsFixture();
  const result=await fixture.run({command:'create_key',name:'No expiry fixture',scopes:['leads:read'],neverExpires:true});
  assert.equal(result.success,true);
  const row=fixture.writes[0].args.p_row;
  assert.equal(row.expires_at,null);assert.equal(row.tenant_id,'tenant-a');assert.equal(row.branch_code,'TNT00002-B0002');
  assert.equal(row.key_hash,hashSecret(result.secret));assert.equal(row.key_prefix,result.secret.slice(0,12)+'…');assert.notEqual(row.key_hash,result.secret);
  fixture.disable();const denied=await fixture.run({command:'create_key',name:'Blocked',scopes:['leads:read'],neverExpires:true});
  assert.equal(denied.success,false);assert.equal(denied.code,'tenant_integration_disabled');assert.equal(fixture.writes.length,1);
});
test('dated key defaults remain 90 days; Never persists on replacement and can be explicitly changed',async()=>{
  const fixture=await actionsFixture([{...keyRows(1)[0],name:'Existing never key',scopes:['leads:read'],expires_at:null}]);
  const before=Date.now();
  assert.equal((await fixture.run({command:'create_key',name:'Dated default',scopes:['leads:read']})).success,true);
  assert.ok(Math.abs(Date.parse(fixture.writes[0].args.p_row.expires_at)-(before+90*86400000))<5000);
  assert.equal((await fixture.run({command:'rotate_key',code:'KEY_000000'})).success,true);
  assert.equal(fixture.writes[1].args.p_row.expires_at,null);assert.equal(fixture.writes[1].args.p_revoke_code,'KEY_000000');
  assert.equal((await fixture.run({command:'rotate_key',code:'KEY_000000',neverExpires:false,expiresInDays:7})).success,true);
  assert.ok(Math.abs(Date.parse(fixture.writes[2].args.p_row.expires_at)-(before+7*86400000))<5000);
  for(const input of [{expiresInDays:0},{expiresInDays:366},{expiresInDays:1.5},{neverExpires:'true'}])assert.equal((await fixture.run({command:'create_key',name:'Invalid',scopes:['leads:read'],...input})).success,false);
  assert.equal(fixture.writes.length,3);
});

function harness(){
  const states=[],effects=[];let cursor=0,effectIndex=0;
  const react={...React,startTransition:callback=>callback(),useState:initial=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
    useRef:initial=>{const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i];},useMemo:callback=>callback(),useSyncExternalStore:(_subscribe,_client,server)=>server(),
    useEffect:(callback,deps)=>{const i=effectIndex++,old=effects[i];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){old?.cleanup?.();effects[i]={callback,deps};}}};
  return {react,render:(Component,props)=>{cursor=0;effectIndex=0;return Component(props);},flush:async()=>{for(const effect of effects)if(effect.callback){const callback=effect.callback;effect.callback=null;effect.cleanup=callback();}await new Promise(resolve=>setImmediate(resolve));},close:()=>effects.forEach(effect=>effect.cleanup?.())};
}
function find(tree,predicate){if(Array.isArray(tree))return tree.flatMap(node=>find(node,predicate));if(!React.isValidElement(tree))return [];return [...(predicate(tree)?[tree]:[]),...find(tree.props.children,predicate)];}
test('Never selection hides days, preserves the full-key form, and replaces Never keys without an expiry',async()=>{
  const ui=harness(),editor=await load('src/components/Settings/Integrations/MappingEditor.jsx'),Table=()=>null;
  const {default:Panel}=await load('src/components/Settings/Integrations/ApiAccessPanel.jsx',{react:ui.react,'@/config/integrationsConfig':config,'./MappingEditor':editor,'./IntegrationTable':{__esModule:true,default:Table}});
  const actions=[],props={scope:{tenantCode:'TNT00002',branchCode:'TNT00002-B0002'},bootstrap:{canManage:true,policy:{features}},canManage:true,onAction:async input=>{actions.push(input);return {success:true};}};
  const render=()=>ui.render(Panel,props);let tree=render();
  find(tree,node=>node.type==='input'&&node.props.maxLength===120)[0].props.onChange({target:{value:'Never fixture'}});
  find(tree,node=>node.type===editor.Field&&node.props.label==='Expiration')[0].props.children.props.onChange({target:{value:'never'}});
  tree=render();assert.equal(find(tree,node=>node.type==='input'&&node.props.type==='number').length,0);
  await find(tree,node=>node.type===editor.Button&&node.props.children==='Create API key')[0].props.onClick();
  assert.deepEqual(actions[0],{command:'create_key',name:'Never fixture',scopes:['leads:read','lookups:read'],neverExpires:true});
  tree=render();const table=find(tree,node=>node.type===Table)[0];assert.equal(table.props.columns.find(column=>column.key==='expires_at').render({expires_at:null}),'Never');
  const buttons=table.props.columns.find(column=>column.key==='actions').render({name:'Saved never',code:'KEY_saved',expires_at:null});
  find(buttons,node=>node.props.children==='Replace key')[0].props.onClick();tree=render();
  assert.equal(find(tree,node=>node.type===editor.Field&&node.props.label==='Replacement expiration')[0].props.children.props.value,'never');
  await find(tree,node=>node.props.children==='Replace and show new key')[0].props.onClick();assert.deepEqual(actions[1],{command:'rotate_key',code:'KEY_saved',neverExpires:true});ui.close();
});
test('integration table uses configured 15 rows, supports All, and resets after search or scope change',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const oldWindow=globalThis.window,oldStorage=globalThis.localStorage,ui=harness(),Pagination=()=>null,editor=await load('src/components/Settings/Integrations/MappingEditor.jsx');
  globalThis.window={};globalThis.localStorage={getItem:()=>JSON.stringify({defaultPageSize:15})};
  try{
    const resize={useTableColumnResize:()=>({colWidths:{name:180},getTotalTableWidth:()=>180}),ColumnResizer:()=>null};
    const {default:Table,integrationPageSize}=await load('src/components/Settings/Integrations/IntegrationTable.jsx',{react:ui.react,'@/utils/tableColumnResize':resize,'@/components/common/StandardTablePagination':{__esModule:true,default:Pagination},'./MappingEditor':editor});
    assert.equal(integrationPageSize('All'),100000);assert.equal(integrationPageSize(-1),25);assert.equal(integrationPageSize(1001),25);
    const requests=[],props={columns:[{key:'name',label:'Name'}],resource:'keys',scopeKey:'TNT00002:all',loadRows:async query=>{requests.push(query);return {success:true,rows:[],total:200};}};
    const render=()=>ui.render(Table,props),pagination=tree=>find(tree,node=>node.type===Pagination)[0];
    render();await ui.flush();let tree=render();assert.equal(requests[0].pageSize,15);
    pagination(tree).props.onPageChange(3);render();await ui.flush();tree=render();assert.equal(pagination(tree).props.currentPage,3);
    find(tree,node=>node.props['aria-label']==='Search integration records')[0].props.onChange({target:{value:'test'}});t.mock.timers.tick(300);render();await ui.flush();tree=render();assert.equal(pagination(tree).props.currentPage,1);
    pagination(tree).props.onPageSizeChange(100000);render();await ui.flush();tree=render();assert.equal(requests.at(-1).pageSize,100000);
    pagination(tree).props.onPageSizeChange(15);pagination(render()).props.onPageChange(3);render();await ui.flush();render();
    props.scopeKey='TNT00002:TNT00002-B0002';render();await ui.flush();render();await ui.flush();tree=render();assert.equal(pagination(tree).props.currentPage,1);
    assert.match(renderToStaticMarkup(tree),/position:sticky/);
  }finally{ui.close();globalThis.window=oldWindow;globalThis.localStorage=oldStorage;}
});
