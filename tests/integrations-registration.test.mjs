import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import {execFileSync} from 'node:child_process';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as config from '../src/config/integrationsConfig.js';
import * as permissions from '../src/utils/permissionUtils.js';
import {INTEGRATION_PAGE,INTEGRATION_PAGES,INTEGRATION_TABS,CONFIG_MASTER_PAGES,resolveIntegrationTab,integrationTabHref} from '../src/config/integrationsConfig.js';
import {getSubItemPermissions,canViewIntegrations,filterVisibleSubTabs} from '../src/utils/permissionUtils.js';
import {integrationReadiness} from '../src/lib/integrations/store.js';
import {ROLE_PRESETS} from '../src/components/UserManagement/utils/rolePresets.js';
import {createClient} from '@supabase/supabase-js';
import * as integrationStore from '../src/lib/integrations/store.js';
async function loadJsx(relative,mocks={}) {
  const require=createRequire(import.meta.url),file=fileURLToPath(new URL('../src/config/modulesConfig.jsx',import.meta.url));
  const target=relative?fileURLToPath(new URL('../'+relative,import.meta.url)):file;
  const {transformSync}=require('next/dist/build/swc');
  const {code}=transformSync(await readFile(target,'utf8'),{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'commonjs'}});
  const compiled=new Module(target);compiled.filename=target;compiled.paths=Module._nodeModulePaths(path.dirname(target));
  const original=compiled.require.bind(compiled);compiled.require=id=>Object.hasOwn(mocks,id)?mocks[id]:original(id);
  compiled._compile(code,target);
  return compiled.exports;
}

function componentHarness() {
  const states=[],effects=[],transitions=[];let stateIndex=0,effectIndex=0;
  const react={...React,
    useState:initial=>{const index=stateIndex++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},
    useRef:initial=>{const index=stateIndex++;if(!(index in states))states[index]={current:initial};return states[index];},
    useSyncExternalStore:(_subscribe,getSnapshot,getServerSnapshot)=>typeof window==='undefined'?getServerSnapshot():getSnapshot(),
    useMemo:callback=>callback(),useCallback:callback=>callback,
    useTransition:()=>[false,callback=>{const result=callback();if(result?.then)transitions.push(result);}],
    useEffect:(callback,deps)=>{const index=effectIndex++,previous=effects[index];if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps[i]))){previous?.cleanup?.();effects[index]={callback,deps};}},
  };
  return {react,render:(Component,props)=>{stateIndex=0;effectIndex=0;return Component(props);},
    flush:async()=>{for(const effect of effects)if(effect.callback){const callback=effect.callback;effect.callback=null;effect.cleanup=callback();}while(transitions.length)await transitions.shift();},
    unmount:()=>{for(const effect of effects)effect.cleanup?.();},
  };
}
function elements(tree,predicate) {
  if(Array.isArray(tree))return tree.flatMap(item=>elements(item,predicate));
  if(!React.isValidElement(tree))return [];
  return [...(predicate(tree)?[tree]:[]),...elements(tree.props.children,predicate)];
}
test('one Settings page owns seven tabs and preserves all preset permission IDs',()=>{
  assert.equal(INTEGRATION_PAGE.id,'integrations');assert.deepEqual(INTEGRATION_PAGE.subItems,INTEGRATION_TABS);
  assert.equal(INTEGRATION_TABS.length,7);assert.equal(new Set(INTEGRATION_TABS.map(tab=>tab.id)).size,7);
  for(const preset of ROLE_PRESETS)for(const tab of INTEGRATION_TABS)assert.ok(preset.presetData.settings.sub_items[tab.id],`${preset.key}/${tab.id}`);
});
test('actual registry retains current Settings pages with seven integration tab permissions',async()=>{
  const settings=(await loadJsx()).MODULES_CONFIG.find(module=>module.id==='settings');
  assert.equal(settings.subItems.length,18);assert.equal(new Set(settings.subItems.map(item=>item.id)).size,18);
  assert.deepEqual(settings.subItems.filter(item=>item.id.startsWith('integrations')),INTEGRATION_PAGES);
  assert.deepEqual(settings.subItemGroups,[INTEGRATION_PAGE]);
  assert.equal(settings.subItems.filter(item=>!item.pageId).length+settings.subItemGroups.length,12);
  assert.deepEqual(settings.subItems.filter(item=>item.pageId===INTEGRATION_PAGE.id).map(item=>item.id),INTEGRATION_TABS.map(tab=>tab.id));
});
test('both actual navigation arrays expose only one integration entry',async()=>{
  for(const [file,name] of [['src/components/CRMContainer.jsx','SETTINGS_MODULE_ITEMS'],['src/components/Settings/SettingsContainer.jsx','SETTINGS_TABS']]) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
    const declaration=source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`))?.[0];
    assert.ok(declaration,file);
    const icons=Object.fromEntries([...declaration.matchAll(/(?:icon: |<)([A-Z]\w+)/g)].map(match=>[match[1],()=>null]));
    const {transformSync}=createRequire(import.meta.url)('next/dist/build/swc');
    const {code}=transformSync(declaration+`;globalThis.items=${name};`,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}}});
    const context={React,INTEGRATION_PAGE,...icons};runInNewContext(code,context);
    assert.equal(context.items.length,12,file);
    const integrations=context.items.filter(item=>item.id.startsWith('integrations'));
    assert.equal(integrations.length,1,file);assert.equal(integrations[0].id,'integrations');
  }
});
test('legacy granular Settings access inherits visibility without credential write access',()=>{
  const access={settings:{view:true,add:true,edit:true,sub_items:{business:{view:true}}}};
  for(const page of INTEGRATION_PAGES)assert.deepEqual(getSubItemPermissions(access,'manager','settings',page.id),{view:true,add:false,edit:false,delete:false});
  access.settings.sub_items.integrations_api={view:false};
  assert.equal(getSubItemPermissions(access,'manager','settings','integrations_api').view,false);
  assert.equal(getSubItemPermissions({settings:{view:false}},'manager','settings','integrations').view,false);
});
test('API-only users can open the single page without gaining Overview or other tabs',()=>{
  const access={settings:{view:true,add:true,edit:true,sub_items:Object.fromEntries(INTEGRATION_TABS.map(tab=>[tab.id,{view:false}]))}};
  access.settings.sub_items.integrations_api={view:true,add:false,edit:false};
  assert.equal(canViewIntegrations(access,'executive'),true);
  assert.equal(getSubItemPermissions(access,'executive','settings','integrations').view,false);
  assert.equal(filterVisibleSubTabs(access,'executive','settings',[INTEGRATION_PAGE]).length,1);
  assert.deepEqual(INTEGRATION_TABS.filter(tab=>getSubItemPermissions(access,'executive','settings',tab.id).view).map(tab=>tab.id),['integrations_api']);
  access.settings.sub_items.integrations_api={view:false};
  assert.equal(canViewIntegrations(access,'executive'),false);
  assert.equal(filterVisibleSubTabs(access,'executive','settings',[INTEGRATION_PAGE]).length,0);
});
test('old links and new tab links resolve to the same single-page destination',()=>{
  for(const tab of INTEGRATION_TABS) {
    assert.equal(resolveIntegrationTab(`/settings/${tab.id}`),tab.id);
    const url=new URL(integrationTabHref(tab.id,'?integration_result=connected'), 'https://example.com');
    assert.equal(url.pathname,'/settings/integrations');
    assert.equal(resolveIntegrationTab(url.pathname,url.search),tab.id);
    assert.equal(url.searchParams.get('integration_result'),'connected');
    assert.equal(resolveIntegrationTab('/settings',`?setting=${tab.id}`),tab.id);
  }
  assert.equal(resolveIntegrationTab('/settings/integrations','?integration_tab=unknown'),'integrations');
  assert.equal(integrationTabHref('integrations_api','?setting=integrations_meta'),'/settings/integrations?integration_tab=integrations_api');
});
test('all seven tabs render before any integration database request completes',async()=>{
  const editor=await loadJsx('src/components/Settings/Integrations/MappingEditor.jsx');
  const children=Object.fromEntries(['IntegrationScopeSelector','OverviewPanel','ApiAccessPanel','ConnectionsPanel','IncomingWebhooksPanel','OutgoingWebhooksPanel','MetaLeadAdsPanel','IntegrationLogsPanel'].map(name=>['./'+name,{__esModule:true,default:()=>null}]));
  const {default:Container}=await loadJsx('src/components/Settings/Integrations/IntegrationsContainer.jsx',{'@/config/integrationsConfig':config,'@/utils/permissionUtils':permissions,'./MappingEditor':editor,...children});
  const markup=renderToStaticMarkup(React.createElement(Container,{moduleAccess:{settings:{view:true}},userRole:'admin'}));
  assert.equal((markup.match(/role="tab"/g)||[]).length,7);
  assert.match(markup,/role="tablist"/);assert.match(markup,/Integrations &amp; API/);
  assert.doesNotMatch(markup,/Apply the integration migrations/);
});
test('Meta and connection employee dropdowns retain distinct names sharing the Admin code',async()=>{
  const editor=await loadJsx('src/components/Settings/Integrations/MappingEditor.jsx');
  const bootstrap={setup:{meta:{ready:false},enabled:true},lookups:{stages:[],employees:[{code:'Admin',name:'Admin'},{code:'Admin',name:'Branch Admin'}]}};
  for(const name of ['MetaLeadAdsPanel','ConnectionsPanel']) {
    const harness=componentHarness();
    const {default:Panel}=await loadJsx(`src/components/Settings/Integrations/${name}.jsx`,{react:harness.react,'@/config/integrationsConfig':config,'./MappingEditor':editor,'./IntegrationTable':{__esModule:true,default:()=>null}});
    let tree=harness.render(Panel,{bootstrap,scope:{tenantCode:'TNT00002'},canManage:true});
    if(name==='ConnectionsPanel')tree=harness.render(tree.type,tree.props);
    const employeeField=elements(tree,item=>item.type===editor.Field&&item.props.label==='Default employee')[0];
    const options=elements(employeeField,item=>item.type==='option'&&item.props.value);
    assert.deepEqual(options.map(item=>item.props.value),['Admin','Branch Admin']);
    assert.equal(new Set(options.map(item=>item.key)).size,2,name);
    if(name==='MetaLeadAdsPanel')assert.match(renderToStaticMarkup(tree),/Meta app setup is pending/);
  }
});

test('API key form explains disabled states and submits only permissions currently allowed by Master Admin',async()=>{
  const harness=componentHarness(),editor=await loadJsx('src/components/Settings/Integrations/MappingEditor.jsx');
  const {default:Panel}=await loadJsx('src/components/Settings/Integrations/ApiAccessPanel.jsx',{react:harness.react,'@/config/integrationsConfig':config,'./MappingEditor':editor,'./IntegrationTable':{__esModule:true,default:()=>null}});
  const calls=[],props={scope:{tenantCode:'TNT00002',branchCode:null},bootstrap:{canManage:true,policy:{features:{api_read:true,api_write:true}}},canManage:true,onAction:async input=>{calls.push(input);return {success:true};}};
  const render=()=>harness.render(Panel,props),button=tree=>elements(tree,item=>item.type===editor.Button&&item.props.children==='Create API key')[0];
  let tree=render();
  assert.equal(button(tree).props.disabled,true);assert.match(renderToStaticMarkup(tree),/example, not a filled value/);
  elements(tree,item=>item.type==='input'&&item.props.maxLength===120)[0].props.onChange({target:{value:'  ERP sync  '}});
  tree=render();assert.equal(button(tree).props.disabled,false);
  const days=elements(tree,item=>item.type==='input'&&item.props.type==='number')[0];
  days.props.onChange({target:{value:'1.5'}});tree=render();
  assert.equal(button(tree).props.disabled,true);assert.match(renderToStaticMarkup(tree),/whole days/);
  days.props.onChange({target:{value:'90'}});tree=render();
  elements(tree,item=>item.type==='input'&&item.props.type==='checkbox')[1].props.onChange({target:{checked:true}});
  props.bootstrap.policy.features.api_read=false;
  tree=render();
  const boxes=elements(tree,item=>item.type==='input'&&item.props.type==='checkbox');
  assert.equal(boxes[0].props.disabled,true);assert.equal(boxes[0].props.checked,false);
  assert.equal(boxes[3].props.disabled,true);assert.equal(button(tree).props.disabled,false);
  await button(tree).props.onClick();
  assert.deepEqual(calls,[{command:'create_key',name:'ERP sync',scopes:['leads:create'],expiresInDays:90}]);
  tree=render();assert.equal(button(tree).props.disabled,true);
  props.canManage=false;tree=render();assert.match(renderToStaticMarkup(tree),/access is refreshed/);assert.doesNotMatch(renderToStaticMarkup(tree),/view-only access/);
  props.bootstrap.canManage=false;tree=render();assert.match(renderToStaticMarkup(tree),/view-only access/);
});

test('returning to the integration tab refreshes activation once and separates activation from account permissions',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1793500000000});
  const previousWindow=globalThis.window,previousDocument=globalThis.document;
  const windowEvents=new Map(),documentEvents=new Map();
  globalThis.window={location:{pathname:'/settings/integrations',search:'?integration_tab=integrations_api'},history:{replaceState:()=>{},pushState:()=>{}},addEventListener:(name,callback)=>windowEvents.set(name,callback),removeEventListener:name=>windowEvents.delete(name)};
  globalThis.document={visibilityState:'visible',addEventListener:(name,callback)=>documentEvents.set(name,callback),removeEventListener:name=>documentEvents.delete(name)};
  const harness=componentHarness();
  try {
    let enabled=false,canManage=false;
    const calls=[];
    t.mock.method(globalThis,'fetch',async(url,options)=>{
      calls.push(JSON.parse(options.body));
      return Response.json({success:true,tenantCode:'TNT00002',branchCode:null,tenants:[],branches:[],canManage,
        setup:{databaseReady:true,enabled:true},policy:{enabled,features:{api_read:enabled,api_write:enabled,meta:enabled}}});
    });
    const editor=await loadJsx('src/components/Settings/Integrations/MappingEditor.jsx');
    const children=Object.fromEntries(['IntegrationScopeSelector','OverviewPanel','ApiAccessPanel','ConnectionsPanel','IncomingWebhooksPanel','OutgoingWebhooksPanel','MetaLeadAdsPanel','IntegrationLogsPanel'].map(name=>['./'+name,{__esModule:true,default:()=>null}]));
    const {default:Container}=await loadJsx('src/components/Settings/Integrations/IntegrationsContainer.jsx',{react:harness.react,'@/config/integrationsConfig':config,'@/utils/permissionUtils':permissions,'./MappingEditor':editor,...children});
    const props={moduleAccess:{settings:{view:true}},userRole:'admin'},render=()=>harness.render(Container,props);
    render();await harness.flush();
    let markup=renderToStaticMarkup(render());
    assert.match(markup,/Master Admin has not enabled/);assert.doesNotMatch(markup,/view-only integration access/);assert.equal(calls.length,1);
    globalThis.document.visibilityState='hidden';documentEvents.get('visibilitychange')();windowEvents.get('focus')();t.mock.timers.tick(2000);
    render();await harness.flush();assert.equal(calls.length,1);
    enabled=true;canManage=true;globalThis.document.visibilityState='visible';
    documentEvents.get('visibilitychange')();windowEvents.get('focus')();t.mock.timers.tick(150);
    render();await harness.flush();markup=renderToStaticMarkup(render());
    assert.equal(calls.length,2);assert.match(markup,/Access enabled/);assert.match(markup,/API Read \/ GET/);assert.match(markup,/Meta Lead Ads/);assert.doesNotMatch(markup,/Master Admin has not enabled|view-only integration access/);
    canManage=false;windowEvents.get('focus')();t.mock.timers.tick(1500);render();await harness.flush();
    markup=renderToStaticMarkup(render());assert.equal(calls.length,3);assert.match(markup,/view-only integration access/);
    enabled=false;windowEvents.get('focus')();t.mock.timers.tick(1500);render();await harness.flush();
    markup=renderToStaticMarkup(render());assert.equal(calls.length,4);assert.match(markup,/Master Admin has not enabled/);assert.doesNotMatch(markup,/view-only integration access/);
    windowEvents.get('focus')();harness.unmount();t.mock.timers.tick(2000);
    assert.equal(windowEvents.size,0);assert.equal(documentEvents.size,0);assert.equal(calls.length,4);
  } finally {harness.unmount();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

test('new and replacement key responses survive same-tab sync and focus refresh but clear on scope or tab change',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1793500000000});
  const previousWindow=globalThis.window,previousDocument=globalThis.document,events=new Map();
  globalThis.window={location:{origin:'http://localhost:3000',pathname:'/settings/integrations',search:'?integration_tab=integrations_api'},history:{replaceState:()=>{},pushState:()=>{}},addEventListener:(name,callback)=>events.set(name,callback),removeEventListener:name=>events.delete(name)};
  globalThis.document={visibilityState:'visible',addEventListener:()=>{},removeEventListener:()=>{}};
  const harness=componentHarness();
  try {
    let issued=0,resolveDelayed;
    t.mock.method(globalThis,'fetch',async(url,options)=>{
      const input=JSON.parse(options.body);
      if(input.command==='create_key'&&input.name==='delayed')return new Promise(resolve=>{resolveDelayed=()=>resolve(Response.json({success:true,code:'KEY_delayed',secret:'TEST_ONLY_DELAYED_SECRET'}));});
      if(['create_key','rotate_key'].includes(input.command))return Response.json({success:true,code:`KEY_fixture_${++issued}`,secret:`TEST_ONLY_FULL_SECRET_${issued}`,message:'Copy now'});
      return Response.json({success:true,tenantCode:input.tenantCode || 'TNT00002',branchCode:input.branchCode || null,tenants:[],branches:[],canManage:true,setup:{databaseReady:true,enabled:true},policy:{enabled:true,features:{api_read:true,api_write:true,meta:true}}});
    });
    const editor=await loadJsx('src/components/Settings/Integrations/MappingEditor.jsx'),Panel=()=>null,Scope=()=>null;
    const children=Object.fromEntries(['OverviewPanel','ApiAccessPanel','ConnectionsPanel','IncomingWebhooksPanel','OutgoingWebhooksPanel','MetaLeadAdsPanel','IntegrationLogsPanel'].map(name=>['./'+name,{__esModule:true,default:Panel}]));
    const {default:Container}=await loadJsx('src/components/Settings/Integrations/IntegrationsContainer.jsx',{react:harness.react,'@/config/integrationsConfig':config,'@/utils/permissionUtils':permissions,'./MappingEditor':editor,'./IntegrationScopeSelector':{__esModule:true,default:Scope},...children});
    const props={moduleAccess:{settings:{view:true}},userRole:'admin'},render=()=>harness.render(Container,props),panel=tree=>elements(tree,item=>item.type===Panel)[0];
    render();await harness.flush();let tree=render();
    await panel(tree).props.onAction({command:'create_key',name:'Fixture only',scopes:['leads:read']});
    tree=render();assert.equal(panel(tree).props.apiSecret.value,'TEST_ONLY_FULL_SECRET_1');
    await harness.flush();tree=render();
    for(const event of ['setting_subtab_change','popstate']){events.get(event)();tree=render();await harness.flush();tree=render();assert.equal(panel(tree).props.apiSecret.value,'TEST_ONLY_FULL_SECRET_1');}
    elements(tree,item=>item.props.role==='tab'&&item.props['aria-selected'])[0].props.onClick();
    tree=render();assert.equal(panel(tree).props.apiSecret.value,'TEST_ONLY_FULL_SECRET_1');
    events.get('focus')();t.mock.timers.tick(150);render();await harness.flush();tree=render();assert.equal(panel(tree).props.apiSecret.value,'TEST_ONLY_FULL_SECRET_1');
    panel(tree).props.onDismissSecret();tree=render();assert.equal(panel(tree).props.apiSecret,null);
    await panel(tree).props.onAction({command:'rotate_key',code:'KEY_fixture_1'});tree=render();await harness.flush();tree=render();assert.equal(panel(tree).props.apiSecret.value,'TEST_ONLY_FULL_SECRET_2');
    elements(tree,item=>item.type===Scope)[0].props.onChange({tenantCode:'TNT00002',branchCode:'TNT00002-B0001'});
    render();await harness.flush();tree=render();assert.equal(panel(tree).props.apiSecret,null);
    const delayed=panel(tree).props.onAction({command:'create_key',name:'delayed',scopes:['leads:read']});
    elements(tree,item=>item.type===Scope)[0].props.onChange({tenantCode:'TNT00002',branchCode:'TNT00002-B0002'});
    // Render the new scope while the earlier key request is still in flight.
    render();resolveDelayed();await delayed;await harness.flush();tree=render();assert.equal(panel(tree).props.apiSecret,null);
    await panel(tree).props.onAction({command:'create_key',name:'Fixture only',scopes:['leads:read']});tree=render();await harness.flush();tree=render();assert.ok(panel(tree).props.apiSecret);
    elements(tree,item=>item.props.role==='tab'&&item.props.id==='integration-tab-integrations_meta')[0].props.onClick();
    render();await harness.flush();tree=render();assert.equal(panel(tree).props.apiSecret,null);
  } finally {harness.unmount();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

test('full API key is visible near Create, scrolls into view, copies completely and offers manual copy on failure',async()=>{
  const previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),harness=componentHarness(),copies=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>copies.push(value)}}});
  try {
    const editor=await loadJsx('src/components/Settings/Integrations/MappingEditor.jsx');
    const {default:Panel}=await loadJsx('src/components/Settings/Integrations/ApiAccessPanel.jsx',{react:harness.react,'@/config/integrationsConfig':config,'./MappingEditor':editor,'./IntegrationTable':{__esModule:true,default:()=>null}});
    let closed=0,scrolled=0;const actions=[];
    const value='crm_TEST_ONLY_'+ 'a'.repeat(50),props={scope:{tenantCode:'TNT00002'},bootstrap:{canManage:true,policy:{features:{api_read:true,api_write:true}}},canManage:false,apiSecret:{code:'KEY_fixture',value},onDismissSecret:()=>closed++,onAction:async input=>{actions.push(input);return {success:true};}};
    const render=()=>harness.render(Panel,props);
    let tree=render(),region=elements(tree,item=>item.props['aria-label']==='New API key')[0];
    region.props.ref.current={scrollIntoView:options=>{scrolled++;assert.equal(options.block,'center');}};
    await harness.flush();assert.equal(scrolled,1);
    const textarea=elements(region,item=>item.type==='textarea')[0];assert.equal(textarea.props.value,value);assert.equal(textarea.props.readOnly,true);assert.ok(textarea.props.rows>=3);
    const markup=renderToStaticMarkup(tree);assert.ok(markup.indexOf('Full API key — copy now')>markup.indexOf('Create API key'));assert.ok(markup.indexOf('Full API key — copy now')<markup.indexOf('Saved keys show'));
    await elements(tree,item=>item.type===editor.Button&&item.props.children==='Copy API key')[0].props.onClick();
    assert.deepEqual(copies,[value]);tree=render();assert.match(renderToStaticMarkup(tree),/Full API key copied/);
    await harness.flush();assert.equal(scrolled,1);
    globalThis.navigator.clipboard.writeText=async()=>{throw new Error('Clipboard denied');};
    await elements(tree,item=>item.type===editor.Button&&item.props.children==='Copy API key')[0].props.onClick();tree=render();assert.match(renderToStaticMarkup(tree),/copy it manually/);
    elements(tree,item=>item.type===editor.Button&&item.props.children==='Close key box')[0].props.onClick();assert.equal(closed,1);
    props.apiSecret=null;tree=render();assert.equal(elements(tree,item=>item.type==='textarea'&&item.props['aria-label']==='Full API key').length,0);
    props.canManage=true;tree=render();
    const table=elements(tree,item=>item.props.resource==='keys')[0];
    assert.ok(table.props.columns.findIndex(column=>column.key==='actions')<table.props.columns.findIndex(column=>column.key==='key_prefix'));
    const rowActions=table.props.columns.find(column=>column.key==='actions').render({name:'Saved test key',code:'KEY_saved'});
    elements(rowActions,item=>item.props.children==='Replace key')[0].props.onClick();tree=render();assert.match(renderToStaticMarkup(tree),/current key will stop working immediately/);assert.equal(actions.length,0);
    elements(tree,item=>item.props.children==='Cancel')[0].props.onClick();tree=render();assert.equal(actions.length,0);
    elements(rowActions,item=>item.props.children==='Replace key')[0].props.onClick();tree=render();
    await elements(tree,item=>item.props.children==='Replace and show new key')[0].props.onClick();assert.deepEqual(actions,[{command:'rotate_key',code:'KEY_saved',expiresInDays:90}]);
  } finally {harness.unmount();if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else Object.defineProperty(globalThis,'navigator',{configurable:true,value:undefined});}
});

test('examples contain full scoped URLs, headers and JSON; copied commands work in the selected format',async()=>{
  const previousWindow=globalThis.window,previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),copies=[],harness=componentHarness();
  globalThis.window={location:{origin:'http://localhost:3000'}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>copies.push(value)}}});
  try {
    const editor=await loadJsx('src/components/Settings/Integrations/MappingEditor.jsx');
    const {default:Panel,apiRequestExamples}=await loadJsx('src/components/Settings/Integrations/ApiAccessPanel.jsx',{react:harness.react,'@/config/integrationsConfig':config,'./MappingEditor':editor,'./IntegrationTable':{__esModule:true,default:()=>null}});
    const scope={tenantCode:'TNT00002',branchCode:'TNT00002-B0001'},examples=apiRequestExamples('http://localhost:3000',scope);
    assert.equal(examples.length,5);
    for(const example of examples){const url=new URL(example.url);assert.equal(url.origin,'http://localhost:3000');assert.equal(url.searchParams.get('tenant_code'),scope.tenantCode);assert.equal(url.searchParams.get('branch_code'),scope.branchCode);assert.equal(example.headers.Authorization,'Bearer YOUR_API_KEY');assert.ok(example.powershell.includes(example.url));assert.ok(example.curl.includes(example.url));if(example.body){assert.deepEqual(JSON.parse(example.body),example.id==='create'?{external_id:'website-enquiry-000001',name:'Example enquiry',phone:'9876543210',source:'Website'}:{requirement:'Updated requirement'});assert.ok(example.headers['Idempotency-Key']);assert.match(example.curl,/Content-Type: application\/json/);assert.match(example.powershell,/-ContentType 'application\/json' -Body \$body/);}}
    assert.equal(new URL(examples[0].url).searchParams.get('page_size'),'25');
    for(const example of apiRequestExamples('https://crm.example.com',{tenantCode:'TNT00002'}))assert.equal(new URL(example.url).searchParams.has('branch_code'),false);
    assert.deepEqual(apiRequestExamples('',scope),[]);
    const props={scope,bootstrap:{canManage:true,policy:{features:{api_read:true,api_write:true}}},canManage:true},render=()=>harness.render(Panel,props);
    let tree=render();assert.equal(elements(tree,item=>item.type==='section'&&item.props['aria-label']?.endsWith(' example')).length,5);
    await elements(tree,item=>item.type===editor.Button&&item.props.children==='Copy example')[3].props.onClick();assert.equal(copies.at(-1),examples[3].powershell);
    elements(tree,item=>item.type===editor.Field&&item.props.label==='Example format')[0].props.children.props.onChange({target:{value:'curl'}});tree=render();
    await elements(tree,item=>item.type===editor.Button&&item.props.children==='Copy example')[3].props.onClick();assert.equal(copies.at(-1),examples[3].curl);
    await elements(tree,item=>item.type===editor.Button&&item.props.children==='Copy URL')[3].props.onClick();assert.equal(copies.at(-1),examples[3].url);
    if(process.platform==='win32'){
      const encodedPayload=Buffer.from(JSON.stringify(examples.map(example=>example.powershell))).toString('base64');
      const script=`$ProgressPreference = 'SilentlyContinue'\n$scripts = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPayload}')) | ConvertFrom-Json\nforeach ($source in $scripts) { $tokens = $null; $errors = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors); if ($errors.Count -gt 0) { throw 'Invalid PowerShell example syntax' } }\nWrite-Output $scripts.Count`;
      const parsed=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true});assert.equal(parsed.trim(),'5');
    }
  } finally {harness.unmount();globalThis.window=previousWindow;if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else Object.defineProperty(globalThis,'navigator',{configurable:true,value:undefined});}
});

test('incomplete setup still renders readiness and prevents branch mapping',async()=>{
  const editor=await loadJsx('src/components/Settings/Integrations/MappingEditor.jsx');
  const {default:Overview}=await loadJsx('src/components/Settings/Integrations/OverviewPanel.jsx',{'./MappingEditor':editor});
  const markup=renderToStaticMarkup(React.createElement(Overview,{bootstrap:{counts:{},tenantWide:true,setup:{databaseReady:false,scheduler:{active:false},meta:{ready:false}}},scope:{branchCode:'TNT00001-B0001'},canManage:false}));
  assert.match(markup,/Connection readiness/);assert.match(markup,/Setup pending/);
  assert.match(markup,/<button[^>]*disabled=""/);assert.match(markup,/<input[^>]*disabled=""/);
  assert.doesNotMatch(markup,/>0<\/strong>/);
});
function readinessDb(tableError,rpcError) {
  const calls=[];
  return {calls,from:table=>({select:()=>({eq:(column,value)=>({limit:async limit=>{calls.push({table,column,value,limit});return {error:tableError};}})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:true,error:rpcError};}};
}
test('readiness uses a tenant-filtered zero-row GET and retains real PostgREST errors',async()=>{
  const requests=[];
  const db=createClient('https://integration-database.example.com','test-service-key',{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(url,options)=>{
      requests.push({url:new URL(url),method:options.method});
      return Response.json({code:'PGRST205',message:'Table is missing from the schema cache'},{status:404});
    }},
  });
  assert.deepEqual(await integrationReadiness(db,'tenant-a','user-a'),{databaseReady:false});
  assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');
  assert.equal(requests[0].url.pathname,'/rest/v1/integration_connections');
  assert.equal(requests[0].url.searchParams.get('tenant_id'),'eq.tenant-a');
  assert.equal(requests[0].url.searchParams.get('limit'),'0');
});
test('missing integration table or required RPC returns setup status without throwing',async()=>{
  const missingTable=readinessDb({code:'42P01'});
  assert.deepEqual(await integrationReadiness(missingTable,'tenant-a','user-a'),{databaseReady:false});
  assert.equal(missingTable.calls.length,1);
  const missingFunction=readinessDb(null,{code:'PGRST202'});
  assert.deepEqual(await integrationReadiness(missingFunction,'tenant-a','user-a'),{databaseReady:false});
  assert.equal(missingFunction.calls[0].value,'tenant-a');
  assert.equal(missingFunction.calls[1].args.p_identity,'management:user-a');
  assert.deepEqual(await integrationReadiness(readinessDb(null,null),'tenant-a','user-a'),{databaseReady:true});
});
test('setup handling preserves database failures and actual rate-limit denial',async()=>{
  await assert.rejects(integrationReadiness(readinessDb({code:'42501'}),'tenant-a','user-a'),error=>error.code==='database_unavailable');
  const denied=readinessDb();denied.rpc=async()=>({data:false});
  await assert.rejects(integrationReadiness(denied,'tenant-a','user-a'),error=>error.status===429);
});
test('the console bootstrap returns an authorized setup screen for partial migrations',async()=>{
  const context={db:readinessDb(null,{code:'PGRST202'}),tenant:{id:'tenant-a',code:'TNT00001'},user:{id:'user-a'},directory:[{code:'TNT00001',name:'Company A'}],branches:[{code:'TNT00001-B0001',name:'HQ'}],branchCode:null,tenantWide:true,canManage:true};
  const {integrationAction}=await loadJsx('src/app/actions/integrations.js',{
    '../../lib/integrations/access.js':{requireSessionAccess:async()=>context},
    '../../lib/integrations/leadAdapter.js':{leadLookups:async()=>({stages:[],employees:[]})},
  });
  const result=await integrationAction({command:'bootstrap',page:'integrations_api'});
  assert.equal(result.success,true);assert.equal(result.setup.databaseReady,false);
  assert.equal(result.tenantCode,'TNT00001');assert.equal(result.tenants[0].code,'TNT00001');
  assert.equal(result.branches[0].code,'TNT00001-B0001');assert.deepEqual(result.counts,{});
  assert.equal(result.error,undefined);
});
test('adding integration subitems preserves the existing Settings pages in admin presets',()=>{
  for(const key of ['master_admin','admin']) {
    const preset=ROLE_PRESETS.find(item=>item.key===key);
    assert.equal(preset.presetData.can_manage_integrations,true);
    for(const id of ['business','products','crm','notifications','departments','targets','sessions','data','media','order_pipeline','complaints_config'])assert.equal(preset.presetData.settings.sub_items[id].view,true);
  }
  for(const preset of ROLE_PRESETS.filter(item=>!['master_admin','admin'].includes(item.key)))assert.equal(preset.presetData.can_manage_integrations,false);
});
test('all eight Config Master pages are registered and unavailable to tenant role presets',async()=>{
  const masterModule=(await loadJsx()).MODULES_CONFIG.find(item=>item.id==='config_master');
  assert.equal(masterModule.masterAdminOnly,true);assert.equal(masterModule.roleAssignable,false);
  assert.deepEqual(masterModule.subItems,CONFIG_MASTER_PAGES);assert.equal(masterModule.subItems.length,8);
  assert.ok(masterModule.subItems.some(item=>item.id==='tenant_integrations'));
  for(const preset of ROLE_PRESETS) {
    for(const page of CONFIG_MASTER_PAGES) assert.equal(preset.presetData.config_master.sub_items[page.id].view,preset.key==='master_admin');
  }
  assert.equal(getSubItemPermissions({config_master:{view:true}},'admin','config_master','tenant_integrations').view,false);
  assert.equal(getSubItemPermissions({},'master_admin','config_master','tenant_integrations').view,true);
  const source=await readFile(new URL('../src/components/MasterAdmin/ConfigMasterPanel.jsx',import.meta.url),'utf8');
  const declaration=source.match(/const CONFIG_TABS = \[([\s\S]*?)\n\];/)?.[0];
  const icons=Object.fromEntries([...declaration.matchAll(/icon:\s*(\w+)/g)].map(match=>[match[1],()=>null]));
  const context={CONFIG_MASTER_PAGES,...icons};runInNewContext(declaration+';globalThis.items=CONFIG_TABS;',context);
  assert.deepEqual(Array.from(context.items,item=>({id:item.id,label:item.label})),CONFIG_MASTER_PAGES);
  const matrix=await readFile(new URL('../src/components/UserManagement/modals/PermissionMatrixModal.jsx',import.meta.url),'utf8');
  assert.match(matrix,/m.id === 'config_master'/);assert.match(matrix,/disabled=\{locked\|\|!mPerms.view\}/);
  const sidebar=await readFile(new URL('../src/components/CRMContainer.jsx',import.meta.url),'utf8');
  assert.match(sidebar,/handleConfigMasterSubTabChange\('tenant_integrations'\)/);
});
test('Master tenant-access commands verify the stored session role and ignore client flags',async()=>{
  const role={role:'admin',is_approved:true,can_read:true,module_access:{}};
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:role})})})})};
  const session={auth:{getUser:async()=>({data:{user:{id:'user-admin',email:'admin@example.com'}}})}};
  const access=await loadJsx('src/lib/integrations/access.js',{
    '../../utils/supabase/server.js':{createClient:async()=>session},
    './store.js':{...integrationStore,integrationDb:()=>db},
  });
  await assert.rejects(access.requireMasterIntegrationAccess({isMasterAdmin:true}),error=>error.code==='master_required');
  const {integrationAction}=await loadJsx('src/app/actions/integrations.js',{'../../lib/integrations/access.js':access});
  for(const command of ['tenant_access_bootstrap','tenant_access_save']) {
    const result=await integrationAction({command,isMasterAdmin:true,tenantCode:'TNT00002',policy:{enabled:true,features:{api_read:true}},revision:0});
    assert.equal(result.success,false);assert.equal(result.code,'master_required');
  }
});
