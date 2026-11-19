import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { setImmediate as settle } from 'node:timers/promises';
import { compile, load, source, harness, billing, TENANT } from './saas-access.test.mjs';

function hooks() {
  const values=[], dependencies=[], pending=[];
  let index=0;
  const mock={...React,
    useState(initial){const i=index++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],next=>{values[i]=typeof next==='function'?next(values[i]):next;}];},
    useRef(initial){const i=index++;if(!(i in values))values[i]={current:initial};return values[i];},
    useCallback(callback){index++;return callback;},
    useEffect(callback,deps){const i=index++;if(!dependencies[i]||deps.some((v,j)=>v!==dependencies[i][j])){dependencies[i]=deps;pending.push(callback);}}
  };
  return {React:mock,render(component,props={}){index=0;return component(props);},async effects(){for(const callback of pending.splice(0))callback();await settle();await settle();}};
}
function nodes(tree){if(!tree||typeof tree!=='object')return [];return [tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];}
function text(tree){if(typeof tree==='string'||typeof tree==='number')return String(tree);if(Array.isArray(tree))return tree.map(text).join('');return tree&&typeof tree==='object'?text(tree.props?.children):'';}
const icons=new Proxy({}, {get:()=>()=>null});
const panelCode=await compile('src/components/SaaS/SuperAdminSaasPanel.jsx');
const calculatorCode=await compile('src/components/SaaS/PlanPricingCalculator.jsx');
function panel(h,extra={}){
  const {actions}=harness();
  return load(panelCode,{
    react:h.React,'next/navigation':{useRouter:()=>({push(){}})},'lucide-react':icons,
    '@/app/actions/saasSubscription':actions,'@/lib/saasBilling':billing,
    '@/components/common/MobileTableView':({children})=>children,
    '@/components/common/StandardTablePagination':function Pagination(){return null;},
    '@/utils/tableColumnResize':{useTableColumnResize:(_id,defaults)=>({colWidths:defaults,resizingCol:null,handleResizeStart(){},resetColWidth(){}}),ColumnResizer:function Resizer(){return null;}},
    './PlanPricingCalculator':function Calculator(){return null;}
  },{localStorage:{getItem:()=>JSON.stringify({defaultPageSize:3})},crypto:{randomUUID:()=> 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},setTimeout(){},clearTimeout(){},window:{history:{pushState(){}},open:()=>({closed:false})},...extra});
}

test('SaaS table paginates before rendering rows and exposes sticky, resizable headers',()=>{
  const h=hooks(),loadedModule=panel(h);
  const table=React.createElement('table',{},React.createElement('thead',{},React.createElement('tr',{},React.createElement('th',{},'Name'))),React.createElement('tbody',{},Array.from({length:8},(_,i)=>React.createElement('tr',{key:i},React.createElement('td',{},'Row '+i)))));
  let tree=h.render(loadedModule.SaasDataTable,{id:'test',children:table});
  assert.equal(nodes(tree).filter(n=>n.type==='tbody').flatMap(n=>React.Children.toArray(n.props.children)).length,3);
  assert.equal(nodes(tree).find(n=>n.type==='th').props.style.position,'sticky');
  assert.ok(nodes(tree).some(n=>n.type?.name==='Resizer'));
  const pager=nodes(tree).find(n=>n.type?.name==='Pagination');
  assert.equal(pager.props.totalRecords,8);
  pager.props.onPageChange(2);
  tree=h.render(loadedModule.SaasDataTable,{id:'test',children:table});
  assert.match(text(tree),/Row 3/);
  assert.doesNotMatch(text(tree),/Row 0/);
  nodes(tree).find(n=>n.type?.name==='Pagination').props.onPageSizeChange(5);
  tree=h.render(loadedModule.SaasDataTable,{id:'test',children:table});
  assert.equal(nodes(tree).find(n=>n.type?.name==='Pagination').props.currentPage,1);
});
test('all three SaaS tabs render with their corresponding table after loading',async()=>{
  for(const [tab,table] of [['pricing','pricing'],['tenants','tenants'],['billing','billing']]){
    const h=hooks(),loadedModule=panel(h);
    h.render(loadedModule.default,{activeSubTab:tab});await h.effects();
    const tree=h.render(loadedModule.default,{activeSubTab:tab});
    assert.ok(nodes(tree).some(n=>n.type===loadedModule.SaasDataTable&&n.props.id===table),tab);
  }
});
test('select-all pricing avoids billing both the combo and standalone CRM modules',async()=>{
  const h=hooks(),{actions}=harness();let selected;
  const Calculator=load(calculatorCode,{react:h.React,'lucide-react':icons,'@/app/actions/saasSubscription':actions,'@/lib/saasBilling':billing}).default;
  const props={onPlanChange:data=>{selected=data;}};
  h.render(Calculator,props);await h.effects();let tree=h.render(Calculator,props);await h.effects();
  const selectAll=nodes(tree).find(n=>n.type==='button'&&n.props.onClick?.name==='selectAll');
  assert.ok(selectAll);
  selectAll.props.onClick();h.render(Calculator,props);await h.effects();
  assert.ok(selected.processCodes.includes('LEADS_WITH_CALLING'));
  assert.equal(selected.processCodes.includes('LEADS_ONLY'),false);
  assert.equal(selected.processCodes.includes('CALLING_STANDALONE'),false);
});
test('SaaS permission registrations are Master Admin only without changing ordinary module access',async()=>{
  const permissions=load(await compile('src/utils/permissionUtils.js'),{
    '../config/integrationsConfig.js':{INTEGRATION_PAGE:{},INTEGRATION_PAGE_IDS:[],INTEGRATION_TABS:[]},
    '../config/whatsappMessageLogsConfig.js':{WHATSAPP_LOG_PAGE_ID:'sent_logs',WHATSAPP_LOG_VIEW_IDS:[]},
    './platformDetection.js':{detectClientPlatform:()=>({}),PLATFORM_LABELS:{}}
  });
  assert.equal(permissions.getModulePermissions({},'admin','saas_master').view,false);
  assert.equal(permissions.getModulePermissions({is_master_admin:true},'agent','saas_master').view,true);
  assert.equal(permissions.getSubItemPermissions({},'telecaller','saas_master','billing').view,false);
  assert.equal(permissions.getModulePermissions({},'admin','leads').view,true);
  assert.equal(permissions.getModulePermissions({attendance:{view:true}},'agent','attendance').view,true);
});
test('invoice closing references valid state and HOLD uses backend user identities',()=>{
  const code=source('src/components/SaaS/SuperAdminSaasPanel.jsx');
  assert.equal(code.includes('setShowGstSplit'),false);
  assert.match(code,/selectedHoldUserIds\.includes\(u\.user_id\)/);
  assert.match(code,/disabled=\{!u\.can_hold\}/);
  assert.match(code,/setActiveInvoiceData\(res\.invoice\)/);
});
