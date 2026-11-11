import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('panning extends the loaded window and preserves the newest viewport timestamp',async()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),a=source.indexOf('function fitSelectedDay('),b=source.indexOf('\nfunction clamp()',a);let complete;const pending=new Promise(resolve=>complete=resolve),calls=[];
 const bar=i=>({t:i,day:'d'+Math.floor(i/10)}),elements={day:{value:'d1'},dataset:{value:'demo'},trendSlopeThreshold:{value:'.005'},trendLookbackMinutes:{value:'5'},trendMethod:{value:'vwap'},candleTrendCount:{value:'3'},chartEmpty:{},chartNote:{}};
 const state={chartSeq:0,tf:60,report:null,start:25,count:10,chart:{continuous:true,sessions:[{day:'d1'},{day:'d2'},{day:'d3'}],hasNext:true,hasPrevious:false,bars:Array.from({length:30},(_,i)=>bar(i))}};
 const context={state,$:id=>elements[id],URLSearchParams,drag:null,api:async url=>{calls.push(url);return pending;},clamp:()=>{},draw:()=>{},renderTrades:()=>{},toast:()=>{}};vm.createContext(context);vm.runInContext(source.slice(a,b),context);
 context.maybeExtendChart();state.start=28;complete({continuous:true,bars:Array.from({length:30},(_,i)=>bar(i+20)),sessions:[{day:'d3',premarketStart:20,close:30},{day:'d4',premarketStart:30,close:40},{day:'d5',premarketStart:40,close:50}],quality:{},hasNext:false});await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(calls.length,1);assert.ok(calls[0].includes('day=d3'));assert.equal(state.chart.sessions.at(-1).day,'d5');assert.equal(state.start,8);assert.equal(state.count,10);assert.equal(state.loadingMore,false);
});
test('chart date dropdown scopes all trading days to the loaded backtest inclusively',()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const a=source.indexOf('function updateChartDays('),b=source.indexOf('\nasync function datasetChanged(',a);
 const select={value:'2026-05-02',options:[],replaceChildren(){this.options=[];this.value='';},append(o){this.options.push(o);if(!this.value)this.value=o.value;}};
 const state={days:['2026-04-30','2026-05-01','2026-05-02','2026-05-04','2026-05-05'].map(day=>({day})),report:{from:'2026-05-01',to:'2026-05-04'}};
 const context={state,$:()=>select,document:{createElement:()=>({})}};vm.createContext(context);vm.runInContext(source.slice(a,b),context);
 context.updateChartDays();assert.deepEqual(select.options.map(o=>o.value),['2026-05-01','2026-05-02','2026-05-04']);assert.equal(select.value,'2026-05-02');
 state.report={from:'2026-05-05',to:'2026-05-05'};context.updateChartDays();assert.deepEqual(select.options.map(o=>o.value),['2026-05-05']);assert.equal(select.value,'2026-05-05');
 state.report=null;context.updateChartDays();assert.equal(select.options.length,5);
 state.report={from:'2027-01-01',to:'2027-01-02'};context.updateChartDays();assert.equal(select.options.length,0);assert.equal(select.disabled,true);
});
test('top controls collapse frees chart height and restores the prior size',()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),a=source.indexOf("let expandedChartHeight='';"),b=source.indexOf('buildFields();initializeExitEditor();',a);
 const classes=new Set(),storage=new Map(),button={setAttribute(key,value){this[key]=value;}},box={style:{height:'620px'},getBoundingClientRect:()=>({top:48})};let selectedTab,scrolled=false;
 const context={document:{body:{classList:{contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}}}},$:()=>button,chartBox:box,window:{innerHeight:1000,scrollTo:()=>{scrolled=true;},addEventListener:()=>{}},tab:name=>{selectedTab=name;},requestAnimationFrame:fn=>fn(),setChartHeight:n=>{box.style.height=Math.max(240,n)+'px';},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 vm.createContext(context);vm.runInContext(source.slice(a,b),context);
 context.setTopControlsCollapsed(true);assert.equal(classes.has('top-controls-collapsed'),true);assert.equal(button['aria-expanded'],'false');assert.equal(box.style.height,'882px');assert.equal(selectedTab,'chart');assert.equal(scrolled,true);assert.equal(storage.get('spy-top-controls-collapsed'),'true');assert.match(button.textContent,/Show top controls/);
 context.setTopControlsCollapsed(false);assert.equal(classes.has('top-controls-collapsed'),false);assert.equal(box.style.height,'620px');assert.equal(button['aria-expanded'],'true');assert.equal(storage.get('spy-top-controls-collapsed'),'false');
});
test('trend selection controls remain enabled independently of the both-directions flag',()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),a=source.indexOf('function updateTrendModeControls(){'),b=source.indexOf('\nfunction setConfig(',a),elements=Object.fromEntries(['allowUptrend','allowDowntrend','allowSideways','direction','tradeBothDirections'].map(k=>['cfg-'+k,{disabled:true,checked:false}]));
 const context={$:id=>elements[id]};vm.createContext(context);vm.runInContext(source.slice(a,b),context);
 for(const both of [false,true]){elements['cfg-tradeBothDirections'].checked=both;context.updateTrendModeControls();for(const key of ['allowUptrend','allowDowntrend','allowSideways','direction'])assert.equal(elements['cfg-'+key].disabled,false);}
});

test('trade chart labels include targets without runner or adjustment clutter',()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),a=source.indexOf('function drawTrade('),b=source.indexOf('\nfunction draw(){',a),labels=[];
 const g={measureText:text=>({width:text.length*5}),fillText:text=>labels.push(text)};for(const name of ['save','restore','fillRect','setLineDash','beginPath','moveTo','lineTo','stroke','arc','fill','strokeRect'])g[name]=()=>{};
 const context={state:{tf:60},price:n=>n.toFixed(3)};vm.createContext(context);vm.runInContext(source.slice(a,b),context);
 const trade={id:1,t:60,exitTime:180,entry:100,initialStop:99,stop:101,dir:1,stopHistory:[{t:120,price:101}],exitPlan:[{index:1,target:102,percent:80},{index:2,type:'noLimit',target:null,percent:20,stopHistory:[{t:150,price:101.8}]}],exits:[{index:1,exitTime:120,price:102,percent:80,reason:'TARGET'},{index:2,exitTime:180,price:101.8,percent:20,reason:'STOP'}]};
 context.drawTrade(g,trade,{L:0,R:1000,T:0,B:500,x:t=>t,y:p=>p},false);
 assert.equal(labels.length,5);assert.ok(labels.some(s=>s.includes('TP1 102.000')));assert.ok(labels.some(s=>s.includes('Entry 100.000')));assert.ok(labels.some(s=>s.includes('Stop 99.000')));assert.ok(labels.some(s=>s.includes('Exit 1')));assert.ok(labels.some(s=>s.includes('Exit 2')));assert.ok(labels.every(s=>!s.includes('moved')&&!s.includes('runner')));
});
test('no-entry chart label renders a brief reason',()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),a=source.indexOf('function drawRejectedEntry('),b=source.indexOf('\nfunction draw(){',a),texts=[],g={measureText:t=>({width:t.length*5}),save(){},restore(){},fillRect(){},fillText:t=>texts.push(t)};
 const context={state:{tf:60}};vm.createContext(context);vm.runInContext(source.slice(a,b),context);context.drawRejectedEntry(g,{t:120,price:100,dir:1,message:'R/R below 1.5:1'},{L:0,R:1000,T:0,B:500,x:t=>t,y:p=>p});assert.deepEqual(texts,['No entry: R/R below 1.5:1']);
});

for(const changes of [undefined,null,{}, {text:'Same settings'}, {text:'Changed',items:['Minimum R/R: 1 → 2']}])test('saved runs render missing or older comparison metadata '+JSON.stringify(changes),async()=>{
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');const a=source.indexOf('async function refreshHistory('),b=source.indexOf('\nfunction download(',a);
 const element=()=>({children:[],append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}}),history=element();
 const context={api:async()=>[{id:'run',created:'2026-01-01',dataset:{synthetic:false},from:'2025-01-01',to:'2025-12-31',qualityIssues:0,summary:{net:1,trades:1},changes}],$:()=>history,document:{createElement:element},money:String,pct:String,sign:()=>'',guard:f=>f};
 vm.createContext(context);vm.runInContext(source.slice(a,b),context);await context.refreshHistory();
 assert.equal(history.children.length,1);const card=history.children[0];assert.equal(card.children[1].children.length,8);assert.match(card.children[2].textContent,/Changed since previous run:/);
});
