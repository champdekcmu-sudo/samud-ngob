'use strict';
/* ---------- Shared helpers ---------- */
const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const TH_D = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,'0');
const todayStr = () => {const d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const nowTime = () => {const d = new Date(); return pad(d.getHours())+':'+pad(d.getMinutes());};
const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s||''));
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const dnum = s => {const [y,m,d] = String(s).split('-').map(Number); return Math.round(Date.UTC(y,m-1,d)/864e5);};
const fromNum = n => new Date(n*864e5).toISOString().slice(0,10);
const fmtD = s => {const [,m,d] = s.split('-').map(Number); return d+' '+TH_M[m-1];};
const fmt = n => (Math.round((Number(n)||0)*100)/100).toLocaleString('th-TH', {maximumFractionDigits:2});
const fmt0 = n => Math.round(Number(n)||0).toLocaleString('th-TH');
const sum = a => a.reduce((t,e) => t + (Number(e.amount)||0), 0);
const newId = () => 'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byWhen = (a,b) => (b.time||'').localeCompare(a.time||'') || (b.createdAt||0)-(a.createdAt||0);
let toastT;
function toast(msg){const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800);}

const FIXED_CAT = 'ค่าใช้จ่ายประจำ';
const INCOME_CAT = 'รายรับ';
const CATS = ['อาหาร','เดินทาง','ของใช้','อื่นๆ',FIXED_CAT];
const BUD_CATS = ['อาหาร','เดินทาง','ของใช้','อื่นๆ'];
const CAT_COLORS = {'อาหาร':'var(--c1)', 'เดินทาง':'var(--c2)', 'ของใช้':'var(--c3)', 'อื่นๆ':'var(--c4)'};
const isIncome = e => e.cat === INCOME_CAT;
const countable = e => e.cat !== FIXED_CAT && e.cat !== INCOME_CAT;

/* ---------- State ---------- */
const DEFAULT_PERIODS = [
  {name:'ก่อนเงินเดือนออก', start:'2026-11-11', end:'2026-11-24', mode:'manual', budget:5000},
  {name:'หลังเงินเดือนออก', start:'2026-11-25', end:'2026-12-24', mode:'auto'}
];
const DEFAULT_PLAN = {
  incomes:[{id:'i1', name:'เงินเดือน', amount:22184}, {id:'i2', name:'ค่าเช่ารถ', amount:5000}],
  bills:[{id:'b1', name:'ค่าใช้จ่ายประจำ (รวม)', amount:8061}, {id:'b2', name:'บัตรเครดิตและอื่นๆ', amount:2000}],
  saving:3000, savedStart:1000, months:3
};
const clonePlan = p => ({...p, incomes:p.incomes.map(x => ({...x})), bills:p.bills.map(x => ({...x}))});
const state = {expenses:[], savelog:[], periods:DEFAULT_PERIODS.map(p => ({...p})), plan:clonePlan(DEFAULT_PLAN), autoPay:true};

// Old versions kept a flat "sav" object; turn it into the editable plan.
function planFromLegacy(s){
  const n = k => Math.max(0, Number(s[k])||0);
  return {
    incomes:[{id:'i1', name:'เงินเดือน', amount:n('income')}, {id:'i2', name:'ค่าเช่ารถ', amount:n('car')}].filter(x => x.amount > 0 || x.id === 'i1'),
    bills:[{id:'b1', name:'ค่าใช้จ่ายประจำ (รวม)', amount:n('fixed')}, {id:'b2', name:'บัตรเครดิตและอื่นๆ', amount:n('other')}].filter(x => x.amount > 0),
    saving:n('saving'), savedStart:n('current'), months:Math.max(1, n('months')||3)
  };
}
function normPlan(p){
  const list = a => Array.isArray(a) ? a.filter(x => x && typeof x === 'object').map(x => ({id:String(x.id||newId()), name:String(x.name||'').slice(0,60), amount:Math.max(0, Number(x.amount)||0)})) : [];
  return {incomes:list(p.incomes), bills:list(p.bills), saving:Math.max(0, Number(p.saving)||0), savedStart:Math.max(0, Number(p.savedStart)||0), months:Math.min(24, Math.max(1, Number(p.months)||3))};
}
// Periods saved by older versions have a budget but no mode: keep them as hand-set budgets.
function normPeriods(list){
  return list.filter(p => p && isDate(p.start) && isDate(p.end)).map(p => ({
    name:String(p.name||''), start:p.start, end:p.end,
    mode:p.mode === 'auto' || p.mode === 'manual' ? p.mode : (p.auto ? 'auto' : 'manual'),
    budget:Number(p.budget)||0, ...(p.auto ? {auto:true} : {})
  }));
}

/* ---------- Budget math ---------- */
function planTotals(){
  const p = state.plan, inc = sum(p.incomes), bills = sum(p.bills), saving = Number(p.saving)||0;
  return {inc, bills, saving, spend:inc-bills-saving};
}
const periodBudget = p => p.mode === 'auto' ? planTotals().spend : (Number(p.budget)||0);
function currentPeriod(){
  const ps = [...state.periods].sort((a,b) => dnum(a.start)-dnum(b.start));
  const tn = dnum(todayStr());
  return ps.find(p => dnum(p.start) <= tn && tn <= dnum(p.end)) || (ps.length && tn < dnum(ps[0].start) ? ps[0] : ps[ps.length-1]);
}
function saveBalance(){
  return (Number(state.plan.savedStart)||0) + state.savelog.reduce((t,e) => t + (e.type === 'out' ? -1 : 1)*(Number(e.amount)||0), 0);
}

/* ---------- Government payday (paid in one lump on round 2) ---------- */
// Round-2 dates announced by the Comptroller General's Department. Add new months here when announced: 'YYYY-MM':'YYYY-MM-DD'
const PAYDAYS = {'2026-10':'2026-10-27', '2026-11':'2026-11-25', '2026-12':'2026-12-25'};
function payday(y, m){
  const k = y+'-'+pad(m);
  if(PAYDAYS[k]) return {date:PAYDAYS[k], official:true};
  let n = dnum(k+'-25'); const wd = new Date(n*864e5).getUTCDay();
  if(wd === 6) n += 2; else if(wd === 0) n += 1;
  return {date:fromNum(n), official:false};
}
function nextPayday(afterNum){
  const d = new Date(afterNum*864e5); let y = d.getUTCFullYear(), m = d.getUTCMonth()+1;
  for(let i = 0; i < 3; i++){const p = payday(y, m); if(dnum(p.date) > afterNum) return p; m++; if(m > 12){m = 1; y++;}}
}
function autoExtend(){
  if(state.autoPay === false || !state.periods.length) return false;
  const tn = dnum(todayStr()); let changed = false;
  for(let g = 0; g < 24; g++){
    const last = [...state.periods].sort((a,b) => dnum(a.end)-dnum(b.end)).pop();
    if(dnum(last.end) >= tn) break;
    const s = dnum(last.end)+1;
    let np = nextPayday(s); if(dnum(np.date)-s < 7) np = nextPayday(dnum(np.date));
    const [y, m] = fromNum(s).split('-').map(Number);
    state.periods.push({name:'รอบเงินเดือน '+TH_M[m-1]+' '+String(y+543).slice(2), start:fromNum(s), end:fromNum(dnum(np.date)-1), mode:'auto', budget:0, auto:true});
    changed = true;
  }
  return changed;
}

/* ---------- Tabs ---------- */
const TABS = ['today','month','save','set'];
let curTab = 'today';
function showTab(t, push){
  if(!TABS.includes(t)) t = 'today';
  curTab = t;
  TABS.forEach(k => {$('view-'+k).hidden = k !== t;});
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  if(push !== false) try{history.replaceState(null, '', '#'+t);}catch(e){}
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.addEventListener('click', ev => {const g = ev.target.closest('[data-go]'); if(g) showTab(g.dataset.go);});

/* ---------- Today ---------- */
function renderToday(){
  const p = currentPeriod(); if(!p) return;
  const now = new Date(), tn = dnum(todayStr()), ps = dnum(p.start), pe = dnum(p.end), total = pe-ps+1;
  $('todayDate').textContent = 'วัน'+TH_D[now.getDay()]+' '+now.getDate()+' '+TH_M[now.getMonth()]+' '+(now.getFullYear()+543);
  const ended = tn > pe;
  const eff = Math.min(Math.max(tn,ps),pe);
  const inP = state.expenses.filter(e => {const n = dnum(e.date); return n >= ps && n <= pe;});
  const inB = inP.filter(countable);
  const spent = sum(inB);
  const before = sum(inB.filter(e => dnum(e.date) < eff));
  const todaySpent = sum(inB.filter(e => dnum(e.date) === eff));
  const extra = sum(inP.filter(e => isIncome(e) && dnum(e.date) <= eff));
  const base = periodBudget(p);
  const budget = base + extra;
  const daysLeft = pe-eff+1;
  const allowance = (budget-before)/daysLeft;
  const left = allowance-todaySpent;

  $('periodChip').textContent = (p.name||'งบรอบนี้')+' · '+fmtD(p.start)+' – '+fmtD(p.end);
  $('leftToday').innerHTML = esc(fmt0(ended ? budget-spent : left))+'<small>บาท</small>';
  $('todayH').textContent = ended ? 'รอบนี้จบแล้ว เหลือเงิน' : (tn < ps ? 'วันแรกของรอบใช้ได้' : 'วันนี้ยังใช้ได้อีก');
  $('todayLine').textContent = ended ? 'รอบใหม่จะเริ่มเมื่อเงินเดือนเข้า หรือเพิ่มรอบเองที่หน้า "ตั้งค่า"'
    : 'งบวันนี้ '+fmt(allowance)+' บาท · ใช้ไปแล้ว '+fmt(todaySpent)+' บาท';
  let cls = 'good', txt = 'อยู่ในงบ';
  if(budget-spent <= 0){cls = 'bad'; txt = 'งบรอบนี้หมดแล้ว';}
  else if(left < 0){cls = 'bad'; txt = 'เกินงบวันนี้ '+fmt0(-left);}
  else if(left < allowance*0.25){cls = 'warn'; txt = 'ใกล้หมดงบวันนี้';}
  if(ended){cls = budget-spent >= 0 ? 'good' : 'bad'; txt = budget-spent >= 0 ? 'จบรอบในงบ' : 'จบรอบเกินงบ';}
  const pill = $('statusPill'); pill.className = 'pill '+cls; pill.textContent = txt;
  const used = budget > 0 ? Math.min(1, Math.max(0, spent/budget)) : 1;
  $('meterBar').style.width = (used*100).toFixed(1)+'%';
  $('meterBox').setAttribute('aria-label', 'ใช้ไปแล้ว '+Math.round(used*100)+' เปอร์เซ็นต์ของงบรอบนี้');
  $('meterL').textContent = 'ใช้ไป '+Math.round(used*100)+'%';
  $('meterR').textContent = 'งบ '+fmt0(budget)+' บาท';
  $('sRemain').textContent = fmt0(budget-spent);
  $('sDays').textContent = ended ? 0 : daysLeft;
  $('sSpent').textContent = fmt0(spent);

  // Link card: where this period's budget comes from
  const t = planTotals();
  $('linkTitle').textContent = 'งบรอบนี้ '+fmt0(budget)+' บาท';
  $('linkSub').textContent = (p.mode === 'auto'
    ? 'รายรับ '+fmt0(t.inc)+' − ประจำ '+fmt0(t.bills)+' − ออม '+fmt0(t.saving)
    : 'ตั้งเองสำหรับรอบนี้ '+fmt0(base))+(extra ? ' + รายรับเพิ่ม '+fmt0(extra) : '')+' · แก้ที่งบรายเดือน';

  renderPay();
  renderChart(p, inB, ps, total, tn, budget);
  renderList(inP);
}

function renderPay(){
  const tn = dnum(todayStr()), np = nextPayday(tn-1), days = dnum(np.date)-tn;
  const src = np.official ? 'ตามประกาศกรมบัญชีกลาง' : 'ประมาณการ';
  $('payLine').textContent = (days === 0 ? 'วันนี้เงินเดือนเข้า' : 'เงินเดือนเข้า '+fmtD(np.date)+' · อีก '+days+' วัน')+' ('+src+')';
  const list = []; let a = tn-1;
  for(let i = 0; i < 4; i++){const q = nextPayday(a); list.push('<li>'+esc(fmtD(q.date))+' '+String(Number(q.date.slice(0,4))+543)+(q.official ? '' : ' <span class="muted">(ประมาณการ)</span>')+'</li>'); a = dnum(q.date);}
  $('payList').innerHTML = list.join('');
  $('autoPay').checked = state.autoPay !== false;
}

function renderChart(p, inB, ps, total, tn, budget){
  const by = {}, catTot = {};
  BUD_CATS.forEach(c => catTot[c] = 0);
  inB.forEach(e => {
    const c = BUD_CATS.includes(e.cat) ? e.cat : 'อื่นๆ', a = Number(e.amount)||0;
    (by[e.date] = by[e.date] || {})[c] = (by[e.date][c]||0) + a; catTot[c] += a;
  });
  const avg = budget/total;
  const days = [...Array(total)].map((_,i) => by[fromNum(ps+i)] || {});
  const vals = days.map(d => BUD_CATS.reduce((t,c) => t + (d[c]||0), 0));
  const max = Math.max(avg*1.6, ...vals) || 1;
  const W = 640, H = 180, top = 24, bottom = 26, left = 6, right = 6, ch = H-top-bottom;
  const bw = (W-left-right)/total;
  const y = v => top+ch-(v/max)*ch;
  const step = total > 20 ? 5 : (total > 10 ? 3 : 1);
  let s = '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="กราฟรายจ่ายรายวันแยกตามหมวด">';
  s += '<line x1="'+left+'" x2="'+(W-right)+'" y1="'+(top+ch)+'" y2="'+(top+ch)+'" stroke="var(--line)"/>';
  vals.forEach((v,i) => {
    const n = ps+i, x = left+i*bw+bw*0.15, w = bw*0.7;
    if(n > tn){ s += '<rect x="'+x+'" y="'+(top+ch-3)+'" width="'+w+'" height="3" rx="1" fill="var(--future)"/>'; }
    else{
      if(v > 0){
        const segs = BUD_CATS.filter(c => days[i][c] > 0);
        const tip = fmtD(fromNum(n))+': รวม '+fmt(v)+' บาท'+segs.map(c => '\n'+c+' '+fmt(days[i][c])).join('');
        let base = top+ch;
        s += '<g><title>'+esc(tip)+'</title>';
        segs.forEach((c,k) => {
          const h = Math.max(1.5, (days[i][c]/max)*ch);
          const gap = k < segs.length-1 && h > 3 ? 1 : 0;
          s += '<rect x="'+x+'" y="'+(base-h)+'" width="'+w+'" height="'+(h-gap)+'" fill="'+CAT_COLORS[c]+'"/>';
          base -= h;
        });
        s += '</g>';
        if(v > avg) s += '<circle cx="'+(x+w/2)+'" cy="'+(base-6)+'" r="3" fill="var(--warn)"/>';
      }
      if(n === tn) s += '<circle cx="'+(x+w/2)+'" cy="'+(top+ch+6)+'" r="2.5" fill="var(--accent)"/>';
    }
    if(i%step === 0 || i === total-1) s += '<text x="'+(x+w/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="11" fill="var(--muted)">'+Number(fromNum(n).slice(8))+'</text>';
  });
  s += '<line x1="'+left+'" x2="'+(W-right)+'" y1="'+y(avg)+'" y2="'+y(avg)+'" stroke="var(--accent)" stroke-dasharray="4 4"/>';
  s += '<text x="'+(W-right)+'" y="'+(y(avg)-5)+'" text-anchor="end" font-size="11" fill="var(--accent)">เฉลี่ย '+fmt0(avg)+' บาท/วัน</text></svg>';
  $('chart').innerHTML = s;
  $('chartLegend').innerHTML = BUD_CATS.map(c => '<span><i style="background:'+CAT_COLORS[c]+'"></i>'+esc(c)+' <b class="num" style="color:var(--fg);font-weight:600">'+fmt0(catTot[c])+'</b></span>').join('')
    + '<span><i style="background:var(--future)"></i>วันที่ยังไม่ถึง</span>';
}

const pendingDel = new Set();
function delBtn(kind, id){
  const on = pendingDel.has(kind+id);
  if(Store.readOnly) return '<span></span>';
  return '<button type="button" class="icon'+(on ? ' confirm' : '')+'" data-del="'+esc(kind)+'" data-id="'+esc(id)+'" aria-label="'+(on ? 'ยืนยันลบ' : 'ลบรายการ')+'">'+
    (on ? 'ยืนยันลบ' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>')+'</button>';
}
function renderList(inP){
  const el = $('list');
  if(!inP.length){el.innerHTML = '<div class="empty">ยังไม่มีรายการในรอบนี้ จดได้จากช่อง "จดรายการ" ด้านบน</div>'; return;}
  const groups = {}; inP.forEach(e => (groups[e.date] = groups[e.date] || []).push(e));
  el.innerHTML = Object.keys(groups).sort().reverse().map(d => {
    const items = groups[d].sort(byWhen);
    const fixedSum = sum(items.filter(e => e.cat === FIXED_CAT));
    const incSum = sum(items.filter(isIncome));
    return '<div class="day"><div class="day-head"><span>'+esc(fmtD(d))+'</span><span class="num">นับงบ '+fmt(sum(items.filter(countable)))+' บาท'+(fixedSum ? ' · ประจำ '+fmt(fixedSum) : '')+(incSum ? ' · รายรับ +'+fmt(incSum) : '')+'</span></div>'+
      items.map(e => '<div class="entry'+(isIncome(e) ? ' income' : (countable(e) ? '' : ' fixed'))+'"><span class="tag">'+esc(e.cat||'อื่นๆ')+'</span><span class="what">'+(isTime(e.time) ? '<span class="t">'+esc(e.time)+'</span>' : '')+esc(e.note||'')+'</span><span class="amt">'+(isIncome(e) ? '+' : '')+fmt(e.amount)+'</span>'+delBtn('exp', e.id)+'</div>').join('')+'</div>';
  }).join('');
}

// Two-tap delete for daily entries, savings log entries and plan rows
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-del]'); if(!b) return;
  const kind = b.dataset.del, id = b.dataset.id, key = kind+id;
  if(!pendingDel.has(key)){
    pendingDel.clear(); pendingDel.add(key); rerenderFor(kind);
    setTimeout(() => {if(pendingDel.delete(key)) rerenderFor(kind);}, 4000);
    return;
  }
  pendingDel.delete(key);
  try{
    if(kind === 'exp') await Store.delEntry(id);
    else if(kind === 'sav') await Store.delSave(id);
    else{
      const list = state.plan[kind]; const i = list.findIndex(x => x.id === id);
      if(i >= 0) list.splice(i, 1);
      renderPlanLists(); renderAll(); await Store.savePlan();
    }
    toast('ลบแล้ว');
  }catch(e){toast(Store.errText(e)); rerenderFor(kind);}
});
function rerenderFor(kind){
  if(kind === 'exp') renderToday();
  else if(kind === 'sav') renderSave();
  else renderPlanLists();
}

/* Entry form */
$('catChips').innerHTML = CATS.map((c,i) => '<label class="chip"><input type="radio" name="cat" id="cat-'+i+'" value="'+esc(c)+'"'+(i === 0 ? ' checked' : '')+'><span>'+(CAT_COLORS[c] ? '<i style="background:'+CAT_COLORS[c]+'"></i>' : '')+esc(c)+'</span></label>').join('');
const kindIn = () => document.querySelector('input[name=kind]:checked').value === 'in';
function syncKind(){
  const inc = kindIn();
  $('catField').hidden = inc; $('incNote').hidden = !inc;
  $('note').placeholder = inc ? 'เช่น งานเสริม' : 'เช่น ข้าวกลางวัน';
  $('addBtn').textContent = inc ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย';
}
document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', syncKind));
$('addForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const amount = parseFloat($('amount').value);
  if(!(amount > 0)){toast('ใส่จำนวนเงินที่มากกว่า 0'); $('amount').focus(); return;}
  const entry = {date:$('date').value || todayStr(), time:isTime($('time').value) ? $('time').value : '', amount:Math.round(amount*100)/100,
    cat:kindIn() ? INCOME_CAT : document.querySelector('input[name=cat]:checked').value, note:$('note').value.trim().slice(0,80), createdAt:Date.now()};
  $('addBtn').disabled = true;
  try{
    await Store.addEntry(entry);
    $('amount').value = ''; $('note').value = ''; $('time').value = nowTime();
    toast(isIncome(entry) ? 'บันทึกรายรับ +'+fmt(entry.amount)+' บาท งบรอบนี้เพิ่มแล้ว' : 'บันทึกแล้ว '+fmt(entry.amount)+' บาท');
  }catch(e){toast(Store.errText(e));}
  finally{$('addBtn').disabled = !!Store.readOnly;}
});

/* ---------- Slip import review (shared by both slip readers) ---------- */
let importRows = [];
const isDup = r => state.expenses.some(e => e.date === r.date && Math.abs((Number(e.amount)||0)-r.amount) < 0.005 &&
  (!isTime(e.time) || !isTime(r.time) || e.time === r.time));
function addImportRow(r){
  r.amount = Math.round((Number(r.amount)||0)*100)/100;
  r.missing = !(r.amount > 0);
  if(!isDate(r.date)){r.date = todayStr(); r.dateFound = false;}
  if(r.incoming) r.cat = INCOME_CAT;
  if(!(CATS.includes(r.cat) || r.cat === INCOME_CAT)) r.cat = 'อื่นๆ';
  r.dup = !r.missing && isDup(r);
  r.include = !r.missing && !r.dup;
  importRows.push(r);
}
function renderImport(){
  $('impActions').hidden = !importRows.length;
  $('impList').innerHTML = importRows.map((r,i) => {
    const opts = CATS.concat(INCOME_CAT).map(c => '<option'+(c === r.cat ? ' selected' : '')+'>'+esc(c)+'</option>').join('');
    const badges = (r.missing ? '<span class="badge warn">หาจำนวนเงินไม่เจอ กรอกเองแล้วติ๊กเลือก</span>' : '')+
      (r.dateFound === false ? '<span class="badge warn">หาวันที่ไม่เจอ ใส่วันนี้ไว้ก่อน</span>' : '')+
      (r.thumb && !r.time ? '<span class="badge info">หาเวลาไม่เจอ ใส่เองได้</span>' : '')+
      (r.incoming ? '<span class="badge info">เงินเข้า ตั้งเป็นรายรับไว้ให้</span>' : '')+
      (r.dup ? '<span class="badge warn">อาจซ้ำกับรายการที่จดแล้ว</span>' : '');
    return '<div class="imp-row'+(r.thumb ? ' has-img' : '')+(r.include ? '' : ' off')+'"><input type="checkbox" id="imp'+i+'-inc" data-ii="'+i+'" data-if="include" aria-label="เลือกรายการนี้"'+(r.include ? ' checked' : '')+'>'+
      (r.thumb ? '<img alt="สลิป" src="'+r.thumb+'">' : '')+
      '<div class="imp-fields">'+
      '<div class="field"><label for="imp'+i+'-amount">จำนวนเงิน</label><input type="number" inputmode="decimal" step="0.01" id="imp'+i+'-amount" data-ii="'+i+'" data-if="amount" value="'+(r.amount || '')+'"></div>'+
      '<div class="field"><label for="imp'+i+'-date">วันที่</label><input type="date" id="imp'+i+'-date" data-ii="'+i+'" data-if="date" value="'+esc(r.date)+'"></div>'+
      '<div class="field"><label for="imp'+i+'-time">เวลา</label><input type="time" id="imp'+i+'-time" data-ii="'+i+'" data-if="time" value="'+esc(r.time||'')+'"></div>'+
      '<div class="field"><label for="imp'+i+'-cat">หมวด</label><select id="imp'+i+'-cat" data-ii="'+i+'" data-if="cat">'+opts+'</select></div>'+
      '<div class="field wide"><label for="imp'+i+'-note">รายละเอียด</label><input type="text" maxlength="80" id="imp'+i+'-note" data-ii="'+i+'" data-if="note" value="'+esc(r.note||'')+'"></div>'+
      (badges ? '<div class="badges">'+badges+'</div>' : '')+'</div></div>';
  }).join('');
  updateSaveBtn();
}
function updateSaveBtn(){
  const n = importRows.filter(r => r.include && r.amount > 0).length;
  $('impSave').textContent = 'บันทึก '+n+' รายการที่เลือก';
  $('impSave').disabled = !n || !!Store.readOnly;
}
$('impList').addEventListener('change', ev => {
  const t = ev.target; if(!t.dataset.if) return;
  const r = importRows[+t.dataset.ii]; if(!r) return;
  const f = t.dataset.if;
  if(f === 'include'){r.include = t.checked; renderImport(); return;}
  if(f === 'amount'){
    r.amount = Math.round((parseFloat(t.value)||0)*100)/100;
    if(r.amount > 0 && r.missing && !r.include){r.missing = false; r.include = true; renderImport(); return;}
  } else r[f] = t.value;
  updateSaveBtn();
});
function clearImport(){importRows.forEach(r => {if(r.thumb) URL.revokeObjectURL(r.thumb);}); importRows = []; $('impStatus').textContent = ''; renderImport();}
$('impClear').addEventListener('click', clearImport);
$('impSave').addEventListener('click', async () => {
  const pick = importRows.filter(r => r.include && r.amount > 0);
  if(!pick.length) return;
  $('impSave').disabled = true;
  let ok = 0;
  for(const r of pick){
    const entry = {date:isDate(r.date) ? r.date : todayStr(), time:isTime(r.time) ? r.time : '', amount:r.amount,
      cat:(CATS.includes(r.cat) || r.cat === INCOME_CAT) ? r.cat : 'อื่นๆ', note:String(r.note||'').slice(0,80), createdAt:Date.now(), source:'slip'};
    try{await Store.addEntry(entry); ok++; r.saved = true; if(r.thumb) URL.revokeObjectURL(r.thumb);}
    catch(e){toast(Store.errText(e)); break;}
  }
  importRows = importRows.filter(r => !r.saved);
  renderImport(); $('impStatus').textContent = '';
  if(ok) toast(ok === pick.length ? 'บันทึก '+ok+' รายการแล้ว' : 'บันทึกได้ '+ok+' จาก '+pick.length+' รายการ');
});

/* ---------- Monthly plan ---------- */
function rowHtml(kind, x){
  return '<div class="erow"><input type="text" maxlength="60" id="'+kind+'-'+esc(x.id)+'-name" aria-label="ชื่อรายการ" placeholder="ชื่อรายการ" data-plk="'+kind+'" data-plid="'+esc(x.id)+'" data-plf="name" value="'+esc(x.name)+'"'+(Store.readOnly ? ' disabled' : '')+'>'+
    '<input type="number" inputmode="decimal" min="0" id="'+kind+'-'+esc(x.id)+'-amt" aria-label="จำนวนเงินต่อเดือน" placeholder="0" data-plk="'+kind+'" data-plid="'+esc(x.id)+'" data-plf="amount" value="'+(x.amount || '')+'"'+(Store.readOnly ? ' disabled' : '')+'>'+
    delBtn(kind, x.id)+'</div>';
}
function renderPlanLists(){
  const p = state.plan;
  $('incList').innerHTML = p.incomes.length ? p.incomes.map(x => rowHtml('incomes', x)).join('') : '<div class="empty">ยังไม่มีรายรับ</div>';
  $('billList').innerHTML = p.bills.length ? p.bills.map(x => rowHtml('bills', x)).join('') : '<div class="empty">ยังไม่มีรายจ่ายประจำ</div>';
}
function renderMonth(){
  const t = planTotals(), p = currentPeriod();
  $('incTotal').textContent = fmt0(t.inc)+' บาท';
  $('billTotal').textContent = fmt0(t.bills)+' บาท';
  $('flow').innerHTML =
    '<div class="flow-row"><span>รายรับต่อเดือน</span><span class="v">'+fmt0(t.inc)+'</span></div>'+
    '<div class="flow-row minus"><span>− รายจ่ายประจำ</span><span class="v">'+fmt0(t.bills)+'</span></div>'+
    '<div class="flow-row minus"><span>− เงินออม <button type="button" class="link" data-go="save">แก้</button></span><span class="v">'+fmt0(t.saving)+'</span></div>'+
    '<div class="flow-row total'+(t.spend < 0 ? ' neg' : '')+'"><span>งบใช้จ่ายต่อเดือน</span><span class="v">'+fmt0(t.spend)+' บาท</span></div>';
  const tot = Math.max(t.inc, t.bills+t.saving) || 1;
  const parts = [['รายจ่ายประจำ', t.bills, 'var(--muted)'], ['เงินออม', t.saving, 'var(--save)'], ['ใช้จ่ายรายวัน', Math.max(0,t.spend), 'var(--accent)']];
  $('alloc').innerHTML = parts.map(x => '<div style="width:'+(x[1]/tot*100)+'%;background:'+x[2]+'"></div>').join('');
  $('allocLegend').innerHTML = parts.map(x => '<span><i style="background:'+x[2]+'"></i>'+esc(x[0])+' '+(t.inc ? Math.round(x[1]/t.inc*100) : 0)+'%</span>').join('');
  const days = p ? dnum(p.end)-dnum(p.start)+1 : 30;
  const fn = $('flowNote');
  if(t.spend < 0){fn.className = 'callout bad'; fn.textContent = 'รายจ่ายประจำและเงินออมเกินรายรับ '+fmt0(-t.spend)+' บาท ลองลดเงินออมหรือรายจ่ายประจำลง';}
  else if(p && p.mode === 'auto'){fn.className = 'callout'; fn.textContent = 'รอบ "'+(p.name||'')+'" ('+days+' วัน) ใช้งบนี้อัตโนมัติ เฉลี่ยวันละ '+fmt0(t.spend/days)+' บาท แก้รายการด้านล่างแล้วงบวันนี้จะเปลี่ยนตามทันที';}
  else{fn.className = 'callout warn'; fn.textContent = 'รอบปัจจุบันตั้งงบเองไว้ ('+fmt0(p ? p.budget : 0)+' บาท) งบนี้จะใช้กับรอบถัดไปที่เป็น "อัตโนมัติ" เปลี่ยนได้ที่หน้าตั้งค่า';}
}
let planT = null;
function schedulePlanSave(){clearTimeout(planT); planT = setTimeout(() => {Store.savePlan().catch(e => toast(Store.errText(e)));}, 500);}
document.addEventListener('input', ev => {
  const t = ev.target;
  if(t.dataset.plk){
    const x = state.plan[t.dataset.plk].find(r => r.id === t.dataset.plid); if(!x) return;
    if(t.dataset.plf === 'amount') x.amount = Math.max(0, parseFloat(t.value)||0); else x.name = t.value.slice(0,60);
    renderAll(true); schedulePlanSave();
  } else if(t.dataset.plan){
    const v = parseFloat(t.value);
    state.plan[t.dataset.plan] = t.dataset.plan === 'months' ? Math.min(24, Math.max(1, v||1)) : Math.max(0, v||0);
    renderAll(true); schedulePlanSave();
  }
});
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-addrow]'); if(!b || Store.readOnly) return;
  const kind = b.dataset.addrow, x = {id:newId(), name:'', amount:0};
  state.plan[kind].push(x); renderPlanLists();
  const el = $(kind+'-'+x.id+'-name'); if(el) el.focus();
  schedulePlanSave();
});

/* ---------- Savings ---------- */
function monthLabel(k){const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+k); return TH_M[d.getMonth()]+' '+String(d.getFullYear()+543).slice(2);}
const svIn = () => document.querySelector('input[name=svkind]:checked').value === 'in';
function syncSvKind(){$('svBtn').textContent = svIn() ? 'บันทึกเงินฝาก' : 'บันทึกการถอน'; $('svBtn').className = svIn() ? 'save-btn' : 'primary';}
document.querySelectorAll('input[name=svkind]').forEach(r => r.addEventListener('change', syncSvKind));
async function addSave(entry){
  try{await Store.addSave(entry); toast((entry.type === 'out' ? 'ถอน ' : 'ฝาก ')+fmt(entry.amount)+' บาทแล้ว'); return true;}
  catch(e){toast(Store.errText(e)); return false;}
}
$('saveForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const amount = parseFloat($('svAmount').value);
  if(!(amount > 0)){toast('ใส่จำนวนเงินที่มากกว่า 0'); $('svAmount').focus(); return;}
  if(await addSave({date:$('svDate').value || todayStr(), amount:Math.round(amount*100)/100, type:svIn() ? 'in' : 'out', note:$('svNote').value.trim().slice(0,80), createdAt:Date.now()})){
    $('svAmount').value = ''; $('svNote').value = '';
  }
});
$('svQuick').addEventListener('click', () => {
  const amt = Number(state.plan.saving)||0; if(!(amt > 0)) return;
  addSave({date:todayStr(), amount:amt, type:'in', note:'ออมประจำเดือน', createdAt:Date.now()});
});
function renderSave(){
  const t = planTotals(), s = state.plan, bal = saveBalance();
  const need = t.bills + Math.max(0, t.spend);
  const target = Math.max(1, s.months)*need;
  const monthsTo = n => {const r = n-bal; if(r <= 0) return 0; return s.saving > 0 ? Math.ceil(r/s.saving) : Infinity;};
  const whenTxt = n => {const m = monthsTo(n); return m === 0 ? 'ถึงแล้ว' : (m === Infinity ? 'ยังไม่ได้ตั้งยอดออม' : monthLabel(m)+' ('+m+' เดือน)');};
  $('svBalance').innerHTML = esc(fmt0(bal))+'<small>บาท</small>';
  const pr = target > 0 ? Math.min(1, Math.max(0, bal/target)) : 0;
  $('svMeter').style.width = (pr*100).toFixed(1)+'%';
  $('svMeterL').textContent = Math.round(pr*100)+'% ของเป้า';
  $('svMeterR').textContent = 'เป้า '+fmt0(target)+' บาท ('+s.months+' เดือน)';
  $('svPill').textContent = pr >= 1 ? 'ครบเป้าแล้ว' : 'เงินสำรองฉุกเฉิน';
  $('svMonthly').textContent = fmt0(s.saving);
  const mt = monthsTo(target);
  $('svWhen').textContent = mt === 0 ? 'ถึงแล้ว' : (mt === Infinity ? '-' : monthLabel(mt));
  $('svRate').textContent = t.inc ? Math.round(s.saving/t.inc*100)+'%' : '0%';
  $('svQuick').hidden = !(s.saving > 0) || !!Store.readOnly;
  $('svQuick').textContent = '+ ออมเดือนนี้ '+fmt0(s.saving);
  ['saving','savedStart','months'].forEach(k => {const el = $('pl-'+k); if(document.activeElement !== el) el.value = s[k];});

  const log = [...state.savelog].sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0)).slice(0, 30);
  $('saveLog').innerHTML = log.length ? '<div class="day">'+log.map(e => '<div class="entry '+(e.type === 'out' ? 'save-out' : 'save-in')+'"><span class="tag">'+(e.type === 'out' ? 'ถอน' : 'ฝาก')+'</span><span class="what"><span class="t">'+esc(fmtD(e.date))+'</span>'+esc(e.note||'')+'</span><span class="amt">'+(e.type === 'out' ? '−' : '+')+fmt(e.amount)+'</span>'+delBtn('sav', e.id)+'</div>').join('')+'</div>'
    : '<div class="empty">ยังไม่มีบันทึก เงินออมสะสมนับจาก "เงินออมตั้งต้น" ในแผนออม</div>';

  $('mileBody').innerHTML = [['เงินสำรอง 1 เดือน',need],['เงินสำรอง 3 เดือน',need*3],['เงินสำรอง 6 เดือน',need*6]]
    .map(m => '<tr class="'+(bal >= m[1] ? 'done' : '')+'"><td>'+m[0]+'</td><td class="num">'+fmt0(m[1])+'</td><td class="num">'+esc(whenTxt(m[1]))+'</td></tr>').join('');

  const N = 24, W = 640, H = 200, l = 56, r = 12, tp = 14, b = 28, cw = W-l-r, ch = H-tp-b;
  const pts = [...Array(N+1)].map((_,k) => bal+s.saving*k);
  const max = Math.max(target*1.1, pts[N]) || 1;
  const x = k => l+k/N*cw, y = v => tp+ch-Math.max(0,v)/max*ch;
  let g = '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="กราฟคาดการณ์เงินออม 24 เดือน">';
  [0,.25,.5,.75,1].forEach(f => {const v = max*f; g += '<line x1="'+l+'" x2="'+(W-r)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--line)"/><text x="'+(l-6)+'" y="'+(y(v)+4)+'" text-anchor="end" font-size="11" fill="var(--muted)">'+fmt0(v)+'</text>';});
  [0,6,12,18,24].forEach(k => {g += '<text x="'+x(k)+'" y="'+(H-8)+'" text-anchor="'+(k === 0 ? 'start' : (k === N ? 'end' : 'middle'))+'" font-size="11" fill="var(--muted)">'+(k === 0 ? 'ตอนนี้' : monthLabel(k))+'</text>';});
  const path = pts.map((v,k) => (k ? 'L' : 'M')+x(k).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  g += '<path d="'+path+' L'+x(N)+' '+y(0)+' L'+x(0)+' '+y(0)+' Z" fill="var(--save-soft)"/>';
  g += '<path d="'+path+'" fill="none" stroke="var(--save)" stroke-width="2.5"/>';
  g += '<line x1="'+l+'" x2="'+(W-r)+'" y1="'+y(target)+'" y2="'+y(target)+'" stroke="var(--good)" stroke-dasharray="5 4"/>';
  g += '<text x="'+(l+6)+'" y="'+(y(target)-6)+'" font-size="11" fill="var(--good)">เป้า '+fmt0(target)+' บาท</text>';
  if(mt > 0 && mt <= N) g += '<circle cx="'+x(mt)+'" cy="'+y(pts[mt])+'" r="5" fill="var(--good)" stroke="var(--surface)" stroke-width="2"/>';
  g += '<circle cx="'+x(N)+'" cy="'+y(pts[N])+'" r="4" fill="var(--save)"/>';
  g += '<text x="'+(x(N)-6)+'" y="'+(y(pts[N])+(y(pts[N]) < tp+20 ? 16 : -8))+'" text-anchor="end" font-size="11" font-weight="600" fill="var(--save)">'+fmt0(pts[N])+' บาท</text></svg>';
  $('savChart').innerHTML = g;

  const tips = [];
  if(t.spend < 0) tips.push(['bad','แผนนี้ใช้เงินเกินรายรับเดือนละ '+fmt0(-t.spend)+' บาท ลดรายจ่ายประจำหรือยอดออมลงก่อน']);
  const rate = t.inc ? s.saving/t.inc : 0;
  tips.push([rate < 0.1 ? 'warn' : '', rate < 0.1 ? 'ตอนนี้ออมไม่ถึง 10% ของรายรับ ลองเพิ่มให้ได้ประมาณ '+fmt0(t.inc*0.1)+' บาท/เดือน' : 'ออมได้ '+Math.round(rate*100)+'% ของรายรับ อยู่ในเกณฑ์ดี']);
  const salary = state.plan.incomes[0];
  const other = t.inc-(salary ? Number(salary.amount)||0 : 0);
  if(other > 0) tips.push([other > t.spend*0.3 ? 'warn' : '', 'รายรับนอกจากเงินเดือนมี '+fmt0(other)+' บาท/เดือน ถ้าเดือนไหนไม่ได้ งบใช้จ่ายจะลดลงเท่านั้น เงินสำรองช่วยรองรับกรณีนี้']);
  const np = nextPayday(dnum(todayStr())-1);
  tips.push(['','โอนเงินออมทันทีที่เงินเดือนเข้า ('+fmtD(np.date)+') ก่อนเริ่มใช้จ่าย และเก็บไว้คนละบัญชีกับบัญชีใช้จ่าย']);
  tips.push(['','เมื่อเงินสำรองครบ '+s.months+' เดือนแล้ว ค่อยแบ่งเงินออมส่วนเกินไปออมระยะยาว เช่น กบข. ส่วนเพิ่ม หรือสหกรณ์ออมทรัพย์ของหน่วยงาน']);
  $('tips').innerHTML = tips.map(x => '<li class="'+x[0]+'">'+esc(x[1])+'</li>').join('');
}

/* ---------- Settings: periods ---------- */
function renderPeriods(){
  const auto = planTotals().spend;
  const cur = currentPeriod();
  $('pBody').innerHTML = state.periods.map((p,i) => '<div class="pcard'+(p === cur ? ' cur' : '')+'">'+
    '<div class="wide"><input type="text" id="p'+i+'-name" aria-label="ชื่อรอบ" data-i="'+i+'" data-f="name" value="'+esc(p.name||'')+'"><button type="button" class="link" data-prm="'+i+'"'+(state.periods.length < 2 ? ' disabled' : '')+'>ลบ</button></div>'+
    '<div class="field"><label for="p'+i+'-start">เริ่ม</label><input type="date" id="p'+i+'-start" data-i="'+i+'" data-f="start" value="'+esc(p.start)+'"></div>'+
    '<div class="field"><label for="p'+i+'-end">สิ้นสุด</label><input type="date" id="p'+i+'-end" data-i="'+i+'" data-f="end" value="'+esc(p.end)+'"></div>'+
    '<div class="field"><label for="p'+i+'-mode">งบ</label><select id="p'+i+'-mode" data-i="'+i+'" data-f="mode"><option value="auto"'+(p.mode === 'auto' ? ' selected' : '')+'>อัตโนมัติ</option><option value="manual"'+(p.mode !== 'auto' ? ' selected' : '')+'>ตั้งเอง</option></select></div>'+
    (p.mode === 'auto' ? '<div class="field"><span class="lbl">บาท</span><span class="auto-b">'+fmt0(auto)+' (จากงบรายเดือน)</span></div>' : '<div class="field"><label for="p'+i+'-budget">บาท</label><input type="number" inputmode="decimal" id="p'+i+'-budget" data-i="'+i+'" data-f="budget" value="'+esc(p.budget||0)+'"></div>')+
    '</div>').join('');
}
$('pBody').addEventListener('input', ev => {const t = ev.target; if(!t.dataset.f || t.dataset.f === 'mode') return; const p = state.periods[+t.dataset.i]; p[t.dataset.f] = t.dataset.f === 'budget' ? (parseFloat(t.value)||0) : t.value;});
$('pBody').addEventListener('change', ev => {const t = ev.target; if(t.dataset.f !== 'mode') return; const p = state.periods[+t.dataset.i]; p.mode = t.value; if(p.mode === 'manual' && !p.budget) p.budget = Math.max(0, Math.round(planTotals().spend)); renderPeriods();});
$('pBody').addEventListener('click', ev => {const b = ev.target.closest('[data-prm]'); if(!b) return; state.periods.splice(+b.dataset.prm, 1); renderPeriods();});
$('pAdd').addEventListener('click', () => {
  const last = [...state.periods].sort((a,b) => dnum(a.end)-dnum(b.end)).pop();
  const s = last ? dnum(last.end)+1 : dnum(todayStr());
  const np = nextPayday(s);
  state.periods.push({name:'รอบถัดไป', start:fromNum(s), end:fromNum(Math.max(s, dnum(np.date)-1)), mode:'auto', budget:0}); renderPeriods();
});
$('pSave').addEventListener('click', async () => {
  if(state.periods.find(p => !isDate(p.start) || !isDate(p.end) || dnum(p.end) < dnum(p.start))){toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'); return;}
  try{await Store.savePeriods(); renderAll(); toast('บันทึกรอบงบแล้ว');}catch(e){toast(Store.errText(e));}
});
$('autoPay').addEventListener('change', async () => {
  state.autoPay = $('autoPay').checked;
  if(autoExtend()) renderPeriods();
  try{await Store.savePeriods();}catch(e){toast(Store.errText(e));}
  renderAll(); toast(state.autoPay ? 'เปิดสร้างรอบงบอัตโนมัติแล้ว' : 'ปิดสร้างรอบงบอัตโนมัติแล้ว');
});

/* ---------- Render all ---------- */
function renderAll(fromPlanInput){
  renderToday(); renderMonth(); renderSave();
  if(!fromPlanInput && !$('pBody').contains(document.activeElement)) renderPeriods();
  else if(fromPlanInput) document.querySelectorAll('#pBody .auto-b').forEach(el => {el.textContent = fmt0(planTotals().spend)+' (จากงบรายเดือน)';});
}
function checkDay(){
  if(autoExtend()){Store.savePeriods().catch(() => {}); renderPeriods();}
  renderAll();
}
function startApp(){
  $('date').value = todayStr(); $('time').value = nowTime(); $('svDate').value = todayStr();
  syncKind(); syncSvKind();
  renderPlanLists(); renderPeriods(); renderAll(); renderImport();
  showTab((location.hash||'').slice(1), false);
  document.addEventListener('visibilitychange', () => {if(!document.hidden){$('date').value = todayStr(); checkDay();}});
}

/* ================= Phone storage (GitHub Pages app) ================= */
const LS = 'slip-ledger-v1';
const Store = {
  readOnly:false,
  load(){
    try{
      const s = JSON.parse(localStorage.getItem(LS) || '{}');
      if(Array.isArray(s.expenses)) state.expenses = s.expenses;
      if(Array.isArray(s.savelog)) state.savelog = s.savelog;
      if(Array.isArray(s.periods) && s.periods.length) state.periods = normPeriods(s.periods);
      if(s.plan) state.plan = normPlan(s.plan); else if(s.sav) state.plan = normPlan(planFromLegacy(s.sav));
      if(s.autoPay === false) state.autoPay = false;
    }catch(e){}
  },
  persist(){
    try{
      localStorage.setItem(LS, JSON.stringify({expenses:state.expenses, savelog:state.savelog, periods:state.periods, plan:state.plan, autoPay:state.autoPay !== false}));
      if(!this.asked && navigator.storage && navigator.storage.persist){this.asked = true; navigator.storage.persist().catch(() => {});}
    }catch(e){throw {code:'quota'};}
  },
  async addEntry(e){state.expenses.push({...e, id:newId()}); try{this.persist();}catch(x){state.expenses.pop(); throw x;} renderToday();},
  async delEntry(id){state.expenses = state.expenses.filter(e => e.id !== id); this.persist(); renderToday();},
  async addSave(e){state.savelog.push({...e, id:newId()}); try{this.persist();}catch(x){state.savelog.pop(); throw x;} renderSave();},
  async delSave(id){state.savelog = state.savelog.filter(e => e.id !== id); this.persist(); renderSave();},
  async savePlan(){this.persist();},
  async savePeriods(){this.persist();},
  errText(e){return e && e.code === 'quota' ? 'บันทึกไม่สำเร็จ พื้นที่ในเครื่องอาจเต็ม' : 'บันทึกไม่สำเร็จ ลองอีกครั้ง';}
};

/* ================= Slip reading (on-device OCR) ================= */
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const MONTHS = [
  ['มค','มกราคม','jan'],['กพ','กุมภาพันธ์','feb'],['มีค','มีนาคม','mar'],['เมย','เมษายน','apr'],
  ['พค','พฤษภาคม','may'],['มิย','มิถุนายน','jun'],['กค','กรกฎาคม','jul'],['สค','สิงหาคม','aug'],
  ['กย','กันยายน','sep'],['ตค','ตุลาคม','oct'],['พย','พฤศจิกายน','nov'],['ธค','ธันวาคม','dec']
];
function monthIndex(tok){
  const t = tok.replace(/[.\s]/g,'').toLowerCase();
  for(let i = 0; i < 12; i++){const [ab, full, en] = MONTHS[i]; if(t === ab || t.startsWith(full) || t.startsWith(en)) return i;}
  return -1;
}
function toYear(y){y = Number(y); if(y < 100) y = y >= 60 ? 2500+y : 2000+y; if(y > 2400) y -= 543; return y;}
function plausible(y, m, d){
  if(!(m >= 0 && m < 12 && d >= 1 && d <= 31)) return null;
  const s = y+'-'+pad(m+1)+'-'+pad(d), n = dnum(s), t = dnum(todayStr());
  return (n <= t+1 && n >= t-400) ? s : null;
}
function findDate(text){
  const t = text.replace(/\s+/g,' ');
  const re1 = /(\d{1,2})\s*([ก-๙A-Za-z.]{2,12})\s*(\d{2,4})(?!\d)/g; let m;
  while((m = re1.exec(t))){const mi = monthIndex(m[2]); if(mi >= 0){const s = plausible(toYear(m[3]), mi, Number(m[1])); if(s) return s;}}
  const re2 = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?!\d)/g;
  while((m = re2.exec(t))){const s = plausible(toYear(m[3]), Number(m[2])-1, Number(m[1])); if(s) return s;}
  return null;
}
function findAmount(lines){
  const re = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d.])/g, cands = [];
  lines.forEach((ln, i) => {
    let m; re.lastIndex = 0;
    while((m = re.exec(ln))){
      const v = parseFloat(m[1].replace(/,/g,'')+'.'+m[2]); if(!(v > 0)) continue;
      const ctx = (lines[i-1]||'')+' '+ln; let score = 0;
      if(/จำนวน|amount|ยอดเงิน|ยอดโอน|ยอดชำระ|ชำระเงิน/i.test(ctx)) score += 5;
      if(/บาท|THB|฿/i.test(ln)) score += 2;
      if(/ค่าธรรมเนียม|fee|คงเหลือ|balance|ยอดคงเหลือ/i.test(ctx)) score -= 6;
      cands.push({v, score, i});
    }
  });
  if(!cands.length) return null;
  cands.sort((a,b) => b.score-a.score || a.i-b.i);
  return cands[0].v;
}
function findRecipient(lines){
  const nameRe = /(นาย|นางสาว|นาง|น\.ส\.|บจก|บริษัท|ร้าน|หจก|MR\.?|MRS\.?|MS\.?|CO\.?,?\s*LTD)/i;
  for(let i = 0; i < lines.length; i++){
    if(/ไปยัง|ถึง|ผู้รับ|^to\b|ไป\s*$/i.test(lines[i])){
      const rest = lines[i].replace(/.*(ไปยัง|ถึง|ผู้รับ|to)\s*:?\s*/i,'').trim();
      if(rest.length > 2 && /[ก-๙A-Za-z]/.test(rest)) return rest;
      const nx = lines[i+1]; if(nx && /[ก-๙A-Za-z]{2}/.test(nx)) return nx;
    }
  }
  const names = lines.filter(l => nameRe.test(l) && !/\d{4,}/.test(l));
  return names[1] || names[0] || '';
}
function guessCat(text){
  const t = text.toLowerCase();
  if(/grabfood|grab food|shopee ?food|line ?man|lineman|foodpanda|robinhood|อาหาร|ข้าว|ก๋วยเตี๋ยว|กาแฟ|coffee|cafe|คาเฟ่|ชาบู|หมูกระทะ|bakery|เบเกอรี่|ส้มตำ|kfc|mcdonald|starbucks|amazon/i.test(t)) return 'อาหาร';
  if(/บัตรเครดิต|credit card|ประกัน|insurance|\baia\b|หอพัก|ค่าเช่า|ค่าห้อง|apartment|อพาร์ท|\bais\b|true ?move|dtac|การไฟฟ้า|ไฟฟ้า|การประปา|ประปา|ผ่อน|สินเชื่อ|loan|internet|อินเทอร์เน็ต|3bb/i.test(t)) return FIXED_CAT;
  if(/grab|bolt|ปตท|\bptt\b|บางจาก|bangchak|shell|เชลล์|caltex|คาลเท็กซ์|\bbts\b|\bmrt\b|ทางด่วน|easy ?pass|m-?flow|แท็กซี่|taxi|ที่จอดรถ|parking|น้ำมัน/i.test(t)) return 'เดินทาง';
  if(/7-?eleven|เซเว่น|ซีพี ?ออลล์|cp ?all|lotus|โลตัส|big ?c|บิ๊กซี|makro|แม็คโคร|tops|shopee|lazada|ลาซาด้า|ช้อปปี้|family ?mart|watsons|boots|central|เซ็นทรัล|ห้าง/i.test(t)) return 'ของใช้';
  return 'อื่นๆ';
}
function findTime(lines){
  const colon = /(?<![\d:])([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)(?::[0-5]\d)?(?![\d])/;
  const dotNa = /(?<![\d.])([01]?\d|2[0-3])\.([0-5]\d)\s*น/;
  const skip = /เลขที่|รหัส|ref|อ้างอิง|บัญชี|account/i;
  const ordered = [...lines.filter(l => /\d{1,2}\s*[ก-๙A-Za-z.]{2,12}\s*\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l)), ...lines];
  for(const l of ordered){if(skip.test(l)) continue; const m = l.match(colon) || l.match(dotNa); if(m) return pad(Number(m[1]))+':'+m[2];}
  return '';
}
function parseSlip(raw){
  const lines = raw.split(/\n+/).map(s => s.replace(/[ \t]+/g,' ').trim()).filter(Boolean);
  const date = findDate(raw);
  const incoming = /รับเงิน|เงินเข้า|received|ได้รับ/i.test(raw) && !/โอนเงินสำเร็จ|ชำระเงินสำเร็จ|จ่ายบิล/i.test(raw);
  return {amount:findAmount(lines)||0, date:date || todayStr(), dateFound:!!date, time:findTime(lines), cat:guessCat(raw), note:findRecipient(lines).slice(0,80), incoming};
}
let tessPromise = null, worker = null, progressCb = null;
function loadTess(){
  if(window.Tesseract) return Promise.resolve();
  if(!tessPromise) tessPromise = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = TESS_URL; s.onload = res;
    s.onerror = () => {tessPromise = null; rej(new Error('load'));};
    document.head.appendChild(s);
  });
  return tessPromise;
}
async function getWorker(){await loadTess(); if(!worker) worker = await Tesseract.createWorker(['tha','eng'], 1, {logger:m => progressCb && progressCb(m)}); return worker;}

let picked = [];
function updatePicked(){
  $('thumbs').innerHTML = picked.map(p => '<img alt="รูปสลิปที่เลือก" src="'+p.url+'">').join('');
  $('pickNote').textContent = picked.length ? 'เลือกแล้ว '+picked.length+' รูป กด "อ่านสลิป" ได้เลย' : 'ยังไม่ได้เลือกรูป';
  $('pickClear').hidden = !picked.length;
  $('impRead').disabled = !picked.length;
}
function addPicked(files){files.filter(f => f && f.type && f.type.indexOf('image/') === 0).forEach(f => picked.push({file:f, url:URL.createObjectURL(f)})); updatePicked();}
$('slipFile').addEventListener('change', () => {addPicked([...($('slipFile').files||[])]); $('slipFile').value = '';});
$('pickClear').addEventListener('click', () => {picked.forEach(p => URL.revokeObjectURL(p.url)); picked = []; updatePicked();});
function setProg(frac){const bar = $('impProg'); bar.hidden = frac == null; if(frac != null) bar.firstElementChild.style.width = Math.round(frac*100)+'%';}
$('impRead').addEventListener('click', async () => {
  if(!picked.length) return;
  const batch = picked; picked = []; updatePicked();
  $('impRead').disabled = true;
  let cur = 0;
  try{
    $('impStatus').textContent = 'กำลังเตรียมตัวอ่านภาษาไทย…'; setProg(0);
    progressCb = m => {
      if(m.status && /loading|initializ/i.test(m.status)) $('impStatus').textContent = 'กำลังเตรียมตัวอ่านภาษาไทย (ครั้งแรกอาจใช้เวลาสักครู่)…';
      if(m.status === 'recognizing text' && typeof m.progress === 'number') setProg((cur + m.progress)/batch.length);
    };
    const w = await getWorker();
    let found = 0;
    for(cur = 0; cur < batch.length; cur++){
      $('impStatus').textContent = 'กำลังอ่านรูปที่ '+(cur+1)+' จาก '+batch.length+'…';
      const {data} = await w.recognize(batch[cur].file);
      const r = parseSlip(data.text || ''); r.thumb = batch[cur].url;
      addImportRow(r); if(!r.missing) found++;
      renderImport();
    }
    setProg(null);
    $('impStatus').textContent = 'อ่านเสร็จ '+batch.length+' รูป เจอจำนวนเงิน '+found+' รูป ตรวจหมวดและจำนวนเงินก่อนกดบันทึก';
  }catch(e){
    setProg(null); batch.forEach(p => picked.push(p)); updatePicked();
    $('impStatus').textContent = navigator.onLine === false ? 'ยังไม่มีอินเทอร์เน็ต ครั้งแรกต้องต่อเน็ตเพื่อดาวน์โหลดตัวอ่านภาษาไทย' : 'อ่านสลิปไม่สำเร็จ ลองกด "อ่านสลิป" อีกครั้ง';
  }finally{progressCb = null; $('impRead').disabled = !picked.length;}
});
/* Slips shared from other apps (Android share sheet) */
async function takeShared(){
  if(!('caches' in window)) return;
  try{
    const c = await caches.open('shared-slips'); const keys = await c.keys();
    if(!keys.length) return;
    const files = [];
    for(const k of keys){const r = await c.match(k); if(r){const b = await r.blob(); if((b.type||'').indexOf('image/') === 0) files.push(new File([b], 'slip', {type:b.type}));} await c.delete(k);}
    if(files.length){
      addPicked(files); showTab('today'); $('impFold').open = true;
      $('impSection').scrollIntoView({behavior:'smooth', block:'start'});
      toast('รับรูปสลิป '+files.length+' รูปแล้ว กด "อ่านสลิป"');
    }
  }catch(e){}
  if(location.search) history.replaceState(null, '', location.pathname+location.hash);
}

/* ================= Backup ================= */
$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({app:'slip-ledger', version:2, exportedAt:new Date().toISOString(), expenses:state.expenses, savelog:state.savelog, periods:state.periods, plan:state.plan, autoPay:state.autoPay !== false}, null, 1)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'samud-ngob-'+todayStr()+'.json';
  document.body.appendChild(a); a.click();
  setTimeout(() => {URL.revokeObjectURL(a.href); a.remove();}, 1500);
  toast('ดาวน์โหลดไฟล์สำรองแล้ว');
});
$('importFile').addEventListener('change', async () => {
  const f = $('importFile').files && $('importFile').files[0]; $('importFile').value = '';
  if(!f) return;
  try{
    const d = JSON.parse(await f.text());
    if(!d || !Array.isArray(d.expenses)) throw new Error('shape');
    const merge = (dst, src) => {const have = new Set(dst.map(e => e.id)); let n = 0;
      src.forEach(e => {if(e && isDate(e.date) && Number(e.amount) > 0){const id = e.id || newId(); if(!have.has(id)){dst.push({...e, id, amount:Number(e.amount)}); have.add(id); n++;}}}); return n;};
    const added = merge(state.expenses, d.expenses);
    if(Array.isArray(d.savelog)) merge(state.savelog, d.savelog);
    if(Array.isArray(d.periods) && d.periods.length) state.periods = normPeriods(d.periods);
    if(d.plan) state.plan = normPlan(d.plan); else if(d.sav) state.plan = normPlan(planFromLegacy(d.sav));
    if(typeof d.autoPay === 'boolean') state.autoPay = d.autoPay;
    autoExtend(); Store.persist();
    renderPlanLists(); renderPeriods(); renderAll(); toast('นำเข้าแล้ว เพิ่ม '+added+' รายการ');
  }catch(e){toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของสมุดงบ');}
});

/* ================= Install and offline ================= */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => {e.preventDefault(); installEvt = e; $('installBtn').hidden = false;});
$('installBtn').addEventListener('click', async () => {
  if(!installEvt) return;
  installEvt.prompt(); try{await installEvt.userChoice;}catch(e){}
  installEvt = null; $('installBtn').hidden = true;
});
window.addEventListener('appinstalled', () => {$('installBtn').hidden = true; toast('ติดตั้งแล้ว เปิดได้จากหน้าจอหลัก');});
if('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

/* ================= Start ================= */
Store.load();
try{localStorage.removeItem('slip-ledger-inbox'); localStorage.removeItem('slip-ledger-seen');}catch(e){}
$('storeNote').textContent = 'ข้อมูลเก็บไว้ในมือถือเครื่องนี้';
if(autoExtend()) try{Store.persist();}catch(e){}
startApp(); updatePicked(); takeShared();
