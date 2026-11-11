'use strict';

/* ---------- Settings and storage ---------- */
const TH_M = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DEFAULT_PERIODS = [
  {name:'ก่อนเงินเดือนออก', start:'2026-11-11', end:'2026-11-26', budget:5000},
  {name:'หลังเงินเดือนออก', start:'2026-11-27', end:'2026-12-25', budget:8232}
];
const DEFAULT_SAV = {income:22184, car:5000, fixed:8061, food:300, other:2000, saving:3000, current:1000, months:3};
const FIXED_CAT = 'ค่าใช้จ่ายประจำ';
const CATS = ['อาหาร','เดินทาง','ของใช้','อื่นๆ',FIXED_CAT];
const countable = e => e.cat !== FIXED_CAT;
const LS = 'slip-ledger-v1';
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

const state = {expenses:[], periods:DEFAULT_PERIODS.map(p => ({...p})), sav:{...DEFAULT_SAV}, settings:{autoSave:false}};

function load(){
  try{
    const s = JSON.parse(localStorage.getItem(LS) || '{}');
    if(Array.isArray(s.expenses)) state.expenses = s.expenses;
    if(Array.isArray(s.periods) && s.periods.length) state.periods = s.periods;
    if(s.sav) state.sav = {...DEFAULT_SAV, ...s.sav};
    if(s.settings) state.settings = s.settings;
  }catch(e){}
}
let askedPersist = false;
function save(){
  try{
    localStorage.setItem(LS, JSON.stringify(state));
    if(!askedPersist && navigator.storage && navigator.storage.persist){askedPersist = true; navigator.storage.persist().catch(()=>{});}
    return true;
  }catch(e){toast('บันทึกไม่สำเร็จ พื้นที่ในเครื่องอาจเต็ม'); return false;}
}

/* ---------- Helpers ---------- */
const $ = id => document.getElementById(id);
const fmt = n => (Math.round(n*100)/100).toLocaleString('th-TH',{maximumFractionDigits:2});
const fmt0 = n => Math.round(n).toLocaleString('th-TH');
const pad = n => String(n).padStart(2,'0');
const todayStr = () => {const d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const nowTime = () => {const d = new Date(); return pad(d.getHours())+':'+pad(d.getMinutes());};
const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s||''));
const byWhen = (a,b) => (b.time||'').localeCompare(a.time||'') || (b.createdAt||0)-(a.createdAt||0);
const dnum = s => {const [y,m,d] = String(s).split('-').map(Number); return Math.round(Date.UTC(y,m-1,d)/864e5);};
const fromNum = n => new Date(n*864e5).toISOString().slice(0,10);
const fmtD = s => {const [,m,d] = s.split('-').map(Number); return d+' '+TH_M[m-1];};
const sum = a => a.reduce((t,e) => t + (Number(e.amount)||0), 0);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
const newId = () => 'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT;
function toast(msg, undo){
  const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT);
  if(undo){
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'ยกเลิก'; b.className = 'toast-undo';
    b.onclick = () => {t.hidden = true; undo();}; t.appendChild(b);
  }
  toastT = setTimeout(() => t.hidden = true, undo ? 7000 : 2800);
}

/* ---------- Daily budget ---------- */
function currentPeriod(){
  const ps = [...state.periods].sort((a,b) => dnum(a.start)-dnum(b.start));
  const tn = dnum(todayStr());
  return ps.find(p => dnum(p.start) <= tn && tn <= dnum(p.end)) || (ps.length && tn < dnum(ps[0].start) ? ps[0] : ps[ps.length-1]);
}

function render(){
  const p = currentPeriod(); if(!p) return;
  const tn = dnum(todayStr()), ps = dnum(p.start), pe = dnum(p.end), total = pe-ps+1;
  const ended = tn > pe;
  const eff = Math.min(Math.max(tn,ps),pe);
  const inP = state.expenses.filter(e => {const n = dnum(e.date); return n >= ps && n <= pe;});
  const inB = inP.filter(countable);
  const spent = sum(inB);
  const before = sum(inB.filter(e => dnum(e.date) < eff));
  const todaySpent = sum(inB.filter(e => dnum(e.date) === eff));
  const daysLeft = pe-eff+1;
  const allowance = (p.budget-before)/daysLeft;
  const left = allowance-todaySpent;

  $('periodName').textContent = (p.name||'งบรอบนี้')+' · '+fmtD(p.start)+' – '+fmtD(p.end)+' · งบ '+fmt0(p.budget)+' บาท';
  $('leftToday').innerHTML = esc(fmt0(ended ? p.budget-spent : left))+'<small>บาท</small>';
  $('todayH').textContent = ended ? 'รอบนี้จบแล้ว เหลือเงิน' : (tn < ps ? 'วันแรกของรอบใช้ได้' : 'วันนี้ยังใช้ได้อีก');
  $('todayLine').textContent = ended ? 'เพิ่มรอบถัดไปได้ที่ "ตั้งค่ารอบงบ" ด้านล่าง'
    : 'งบวันนี้ '+fmt(allowance)+' บาท · ใช้ไปแล้ว '+fmt(todaySpent)+' บาท';
  let cls = 'good', txt = 'อยู่ในงบ';
  if(p.budget-spent <= 0){cls = 'bad'; txt = 'งบรอบนี้หมดแล้ว';}
  else if(left < 0){cls = 'bad'; txt = 'เกินงบวันนี้ '+fmt0(-left)+' บาท';}
  else if(left < allowance*0.25){cls = 'warn'; txt = 'ใกล้หมดงบวันนี้';}
  if(ended){cls = p.budget-spent >= 0 ? 'good' : 'bad'; txt = p.budget-spent >= 0 ? 'จบรอบในงบ' : 'จบรอบเกินงบ';}
  const pill = $('statusPill'); pill.className = 'pill '+cls; pill.textContent = txt;
  $('sRemain').textContent = fmt0(p.budget-spent);
  $('sDays').textContent = ended ? 0 : daysLeft;
  $('sSpent').textContent = fmt0(spent);
  renderChart(p, inB, ps, total, tn);
  renderList(inP);
}

function renderChart(p, inB, ps, total, tn){
  const by = {}; inB.forEach(e => {by[e.date] = (by[e.date]||0) + (Number(e.amount)||0);});
  const avg = p.budget/total;
  const vals = [...Array(total)].map((_,i) => by[fromNum(ps+i)]||0);
  const max = Math.max(avg*1.6, ...vals) || 1;
  const W = 640, H = 170, top = 18, bottom = 26, left = 6, right = 6, ch = H-top-bottom;
  const bw = (W-left-right)/total;
  const y = v => top+ch-(v/max)*ch;
  const step = total > 20 ? 5 : (total > 10 ? 3 : 1);
  let s = '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="กราฟรายจ่ายรายวัน">';
  s += '<line x1="'+left+'" x2="'+(W-right)+'" y1="'+(top+ch)+'" y2="'+(top+ch)+'" stroke="var(--line)"/>';
  vals.forEach((v,i) => {
    const n = ps+i, x = left+i*bw+bw*0.15, w = bw*0.7;
    if(n > tn){ s += '<rect x="'+x+'" y="'+(top+ch-3)+'" width="'+w+'" height="3" rx="1" fill="var(--future)"/>'; }
    else{
      const h = Math.max(v > 0 ? 2 : 0, (v/max)*ch);
      s += '<rect x="'+x+'" y="'+(top+ch-h)+'" width="'+w+'" height="'+h+'" rx="2" fill="'+(v > avg ? 'var(--warn)' : 'var(--bar)')+'"><title>'+fmtD(fromNum(n))+': '+fmt(v)+' บาท</title></rect>';
      if(n === tn) s += '<circle cx="'+(x+w/2)+'" cy="'+(top+ch+6)+'" r="2.5" fill="var(--accent)"/>';
    }
    if(i%step === 0 || i === total-1) s += '<text x="'+(x+w/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="11" fill="var(--muted)">'+Number(fromNum(n).slice(8))+'</text>';
  });
  s += '<line x1="'+left+'" x2="'+(W-right)+'" y1="'+y(avg)+'" y2="'+y(avg)+'" stroke="var(--accent)" stroke-dasharray="4 4"/>';
  s += '<text x="'+(W-right)+'" y="'+(y(avg)-5)+'" text-anchor="end" font-size="11" fill="var(--accent)">เฉลี่ย '+fmt0(avg)+' บาท/วัน</text></svg>';
  $('chart').innerHTML = s;
}

const pendingDel = new Set();
function renderList(inP){
  const el = $('list');
  if(!inP.length){el.innerHTML = '<div class="empty">ยังไม่มีรายจ่ายในรอบนี้ จดเองจากช่อง "จดรายจ่าย" หรือนำเข้าจากสลิปได้</div>'; return;}
  const groups = {}; inP.forEach(e => (groups[e.date] = groups[e.date] || []).push(e));
  el.innerHTML = Object.keys(groups).sort().reverse().map(d => {
    const items = groups[d].sort(byWhen);
    const fixedSum = sum(items.filter(e => !countable(e)));
    return '<div class="day"><div class="day-head"><span>'+esc(fmtD(d))+'</span><span class="num">นับงบ '+fmt(sum(items.filter(countable)))+' บาท'+(fixedSum ? ' · ประจำ '+fmt(fixedSum) : '')+'</span></div>'+
      items.map(e => '<div class="entry'+(countable(e) ? '' : ' fixed')+'"><span class="tag">'+esc(e.cat||'อื่นๆ')+'</span><span class="what">'+(isTime(e.time) ? '<span class="t">'+esc(e.time)+'</span>' : '')+esc(e.note||'')+'</span><span class="amt">'+fmt(e.amount)+'</span>'+
        '<button type="button" class="link'+(pendingDel.has(e.id) ? ' confirm' : '')+'" data-del="'+esc(e.id)+'">'+(pendingDel.has(e.id) ? 'ยืนยันลบ' : 'ลบ')+'</button></div>').join('')+'</div>';
  }).join('');
}

$('list').addEventListener('click', ev => {
  const b = ev.target.closest('[data-del]'); if(!b) return;
  const id = b.dataset.del;
  if(!pendingDel.has(id)){pendingDel.clear(); pendingDel.add(id); render(); setTimeout(() => {if(pendingDel.delete(id)) render();}, 4000); return;}
  pendingDel.delete(id);
  state.expenses = state.expenses.filter(e => e.id !== id);
  save(); render(); toast('ลบรายการแล้ว');
});

/* ---------- Manual entry ---------- */
$('catChips').innerHTML = CATS.map((c,i) => '<label class="chip"><input type="radio" name="cat" id="cat-'+i+'" value="'+esc(c)+'"'+(i === 0 ? ' checked' : '')+'><span>'+esc(c)+'</span></label>').join('');
$('date').value = todayStr();
$('time').value = nowTime();
$('addForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const amount = parseFloat($('amount').value);
  if(!(amount > 0)){toast('ใส่จำนวนเงินที่มากกว่า 0'); $('amount').focus(); return;}
  const entry = {id:newId(), date:$('date').value || todayStr(), time:isTime($('time').value) ? $('time').value : '', amount:Math.round(amount*100)/100,
    cat:document.querySelector('input[name=cat]:checked').value, note:$('note').value.trim(), createdAt:Date.now()};
  state.expenses.push(entry);
  if(save()){$('amount').value = ''; $('note').value = ''; $('time').value = nowTime(); render(); toast('บันทึกแล้ว '+fmt(entry.amount)+' บาท');}
});

/* ---------- Slip reading (on-device OCR) ---------- */
const MONTHS = [
  ['มค','มกราคม','jan'],['กพ','กุมภาพันธ์','feb'],['มีค','มีนาคม','mar'],['เมย','เมษายน','apr'],
  ['พค','พฤษภาคม','may'],['มิย','มิถุนายน','jun'],['กค','กรกฎาคม','jul'],['สค','สิงหาคม','aug'],
  ['กย','กันยายน','sep'],['ตค','ตุลาคม','oct'],['พย','พฤศจิกายน','nov'],['ธค','ธันวาคม','dec']
];
function monthIndex(tok){
  const t = tok.replace(/[.\s]/g,'').toLowerCase();
  for(let i = 0; i < 12; i++){
    const [ab, full, en] = MONTHS[i];
    if(t === ab || t.startsWith(full) || t.startsWith(en)) return i;
  }
  return -1;
}
function toYear(y){
  y = Number(y);
  if(y < 100) y = y >= 60 ? 2500+y : 2000+y;
  if(y > 2400) y -= 543;
  return y;
}
function plausible(y, m, d){
  if(!(m >= 0 && m < 12 && d >= 1 && d <= 31)) return null;
  const s = y+'-'+pad(m+1)+'-'+pad(d);
  const n = dnum(s), t = dnum(todayStr());
  return (n <= t+1 && n >= t-400) ? s : null;
}
function findDate(text){
  const t = text.replace(/\s+/g,' ');
  const re1 = /(\d{1,2})\s*([ก-๙A-Za-z.]{2,12})\s*(\d{2,4})(?!\d)/g;
  let m;
  while((m = re1.exec(t))){
    const mi = monthIndex(m[2]);
    if(mi >= 0){const s = plausible(toYear(m[3]), mi, Number(m[1])); if(s) return s;}
  }
  const re2 = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?!\d)/g;
  while((m = re2.exec(t))){
    const s = plausible(toYear(m[3]), Number(m[2])-1, Number(m[1])); if(s) return s;
  }
  return null;
}
function findAmount(lines){
  const re = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d.])/g;
  const cands = [];
  lines.forEach((ln, i) => {
    let m; re.lastIndex = 0;
    while((m = re.exec(ln))){
      const v = parseFloat(m[1].replace(/,/g,'')+'.'+m[2]);
      if(!(v > 0)) continue;
      const ctx = (lines[i-1]||'')+' '+ln;
      let score = 0;
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
  // Prefer a time on the same line as the date, e.g. "10 พ.ย. 69 14:32 น." or "10 Nov 2026 - 14:32"
  const colon = /(?<![\d:])([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)(?::[0-5]\d)?(?![\d])/;
  const dotNa = /(?<![\d.])([01]?\d|2[0-3])\.([0-5]\d)\s*น/;
  const skip = /เลขที่|รหัส|ref|อ้างอิง|บัญชี|account/i;
  const ordered = [...lines.filter(l => /\d{1,2}\s*[ก-๙A-Za-z.]{2,12}\s*\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l)), ...lines];
  for(const l of ordered){
    if(skip.test(l)) continue;
    const m = l.match(colon) || l.match(dotNa);
    if(m) return pad(Number(m[1]))+':'+m[2];
  }
  return '';
}
function parseSlip(raw){
  const lines = raw.split(/\n+/).map(s => s.replace(/[ \t]+/g,' ').trim()).filter(Boolean);
  const amount = findAmount(lines);
  const date = findDate(raw);
  const time = findTime(lines);
  const incoming = /รับเงิน|เงินเข้า|received|ได้รับ/i.test(raw) && !/โอนเงินสำเร็จ|ชำระเงินสำเร็จ|จ่ายบิล/i.test(raw);
  return {amount, date:date || todayStr(), dateFound:!!date, time, cat:guessCat(raw), note:findRecipient(lines).slice(0,80), incoming};
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
async function getWorker(){
  await loadTess();
  if(!worker) worker = await Tesseract.createWorker(['tha','eng'], 1, {logger:m => progressCb && progressCb(m)});
  return worker;
}

let picked = [], importRows = [];
function updatePicked(){
  $('thumbs').innerHTML = picked.map(p => '<img alt="รูปสลิปที่เลือก" src="'+p.url+'">').join('');
  $('pickNote').textContent = picked.length ? 'เลือกแล้ว '+picked.length+' รูป กด "อ่านสลิป" ได้เลย' : 'ยังไม่ได้เลือกรูป';
  $('pickClear').hidden = !picked.length;
  $('impRead').disabled = !picked.length;
}
function addPicked(files){
  files.filter(f => f && f.type && f.type.indexOf('image/') === 0).forEach(f => picked.push({file:f, url:URL.createObjectURL(f)}));
  updatePicked();
}
$('slipFile').addEventListener('change', () => {addPicked([...($('slipFile').files||[])]); $('slipFile').value = '';});
$('pickClear').addEventListener('click', () => {picked.forEach(p => URL.revokeObjectURL(p.url)); picked = []; updatePicked();});

function setProg(frac){const bar = $('impProg'); bar.hidden = frac == null; if(frac != null) bar.firstElementChild.style.width = Math.round(frac*100)+'%';}
const isDup = r => state.expenses.some(e => e.date === r.date && Math.abs((Number(e.amount)||0)-r.amount) < 0.005 &&
  (!isTime(e.time) || !isTime(r.time) || e.time === r.time));

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
      const r = parseSlip(data.text || '');
      r.thumb = batch[cur].url;
      r.missing = !(r.amount > 0);
      if(r.missing) r.amount = 0;
      r.dup = !r.missing && isDup(r);
      r.include = !r.missing && !r.incoming && !r.dup;
      importRows.push(r); if(!r.missing) found++;
      renderImport();
    }
    setProg(null);
    $('impStatus').textContent = 'อ่านเสร็จ '+batch.length+' รูป เจอจำนวนเงิน '+found+' รูป ตรวจหมวดและจำนวนเงินก่อนกดบันทึก';
  }catch(e){
    setProg(null);
    batch.forEach(p => picked.push(p)); updatePicked();
    $('impStatus').textContent = navigator.onLine === false
      ? 'ยังไม่มีอินเทอร์เน็ต ครั้งแรกต้องต่อเน็ตเพื่อดาวน์โหลดตัวอ่านภาษาไทย'
      : 'อ่านสลิปไม่สำเร็จ ลองกด "อ่านสลิป" อีกครั้ง';
  }finally{
    progressCb = null; $('impRead').disabled = !picked.length;
  }
});

function renderImport(){
  $('impActions').hidden = !importRows.length;
  $('impList').innerHTML = importRows.map((r,i) => {
    const opts = CATS.map(c => '<option'+(c === r.cat ? ' selected' : '')+'>'+esc(c)+'</option>').join('');
    const badges = (r.missing ? '<span class="badge warn">หาจำนวนเงินไม่เจอ กรอกเองแล้วติ๊กเลือก</span>' : '')+
      (!r.dateFound ? '<span class="badge warn">หาวันที่ไม่เจอ ใส่วันนี้ไว้ก่อน</span>' : '')+
      (!r.time ? '<span class="badge info">หาเวลาไม่เจอ ใส่เองได้</span>' : '')+
      (r.incoming ? '<span class="badge info">อาจเป็นเงินเข้า</span>' : '')+
      (r.kind === 'topup' ? '<span class="badge info">เติมเงินเข้า wallet ไม่นับเป็นรายจ่าย เพื่อไม่ให้นับซ้ำ</span>' : '')+
      (r.kind === 'unknown' ? '<span class="badge warn">ไม่แน่ใจว่าเป็นรายจ่าย</span>' : '')+
      (r.dup ? '<span class="badge warn">อาจซ้ำกับรายการที่จดแล้ว</span>' : '')+
      (r.raw ? '<span class="badge info raw">'+esc(r.raw.slice(0,120))+'</span>' : '');
    return '<div class="imp-row'+(r.include ? '' : ' off')+'"><input type="checkbox" id="imp'+i+'-inc" data-ii="'+i+'" data-if="include" aria-label="เลือกรายการนี้"'+(r.include ? ' checked' : '')+'>'+
      (r.thumb ? '<img alt="สลิป" src="'+r.thumb+'">' : '<div class="src">แจ้งเตือน'+(r.app ? '<br>'+esc(r.app) : '')+'</div>')+
      '<div class="imp-fields">'+
      '<div class="field"><label for="imp'+i+'-amount">จำนวนเงิน</label><input type="number" inputmode="decimal" step="0.01" id="imp'+i+'-amount" data-ii="'+i+'" data-if="amount" value="'+(r.amount || '')+'"></div>'+
      '<div class="field"><label for="imp'+i+'-date">วันที่</label><input type="date" id="imp'+i+'-date" data-ii="'+i+'" data-if="date" value="'+esc(r.date)+'"></div>'+
      '<div class="field"><label for="imp'+i+'-time">เวลา</label><input type="time" id="imp'+i+'-time" data-ii="'+i+'" data-if="time" value="'+esc(r.time||'')+'"></div>'+
      '<div class="field"><label for="imp'+i+'-cat">หมวด</label><select id="imp'+i+'-cat" data-ii="'+i+'" data-if="cat">'+opts+'</select></div>'+
      '<div class="field wide"><label for="imp'+i+'-note">รายละเอียด</label><input type="text" maxlength="80" id="imp'+i+'-note" data-ii="'+i+'" data-if="note" value="'+esc(r.note)+'"></div>'+
      (badges ? '<div class="badges">'+badges+'</div>' : '')+'</div></div>';
  }).join('');
  updateSaveBtn();
  saveInbox();
}
function updateSaveBtn(){
  const n = importRows.filter(r => r.include && r.amount > 0).length;
  $('impSave').textContent = 'บันทึก '+n+' รายการที่เลือก';
  $('impSave').disabled = !n;
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
$('impClear').addEventListener('click', () => {importRows.forEach(r => {if(r.thumb) URL.revokeObjectURL(r.thumb);}); importRows = []; $('impStatus').textContent = ''; renderImport();});
function toEntry(r){
  return {id:newId(), date:isDate(r.date) ? r.date : todayStr(), time:isTime(r.time) ? r.time : '', amount:r.amount,
    cat:CATS.includes(r.cat) ? r.cat : 'อื่นๆ', note:String(r.note||'').slice(0,80), createdAt:Date.now(), source:r.src === 'text' ? 'notification' : 'slip'};
}
$('impSave').addEventListener('click', () => {
  const pick = importRows.filter(r => r.include && r.amount > 0);
  if(!pick.length) return;
  pick.forEach(r => state.expenses.push(toEntry(r)));
  if(!save()) return;
  pick.forEach(r => {r.saved = true; if(r.thumb) URL.revokeObjectURL(r.thumb);});
  importRows = importRows.filter(r => !r.saved);
  render(); renderImport(); $('impStatus').textContent = '';
  toast('บันทึก '+pick.length+' รายการแล้ว');
});

/* ---------- Bank and wallet notifications (K PLUS, Krungthai NEXT, เป๋าตัง, TrueMoney, ShopeePay) ---------- */
const WALLET_NAMES = /truemoney|ทรูมันนี่|ทรูมันนี|shopee ?pay|ช้อปปี้ ?เพย์|เป๋าตัง|paotang|g-?wallet|วอลเล็ท/i;
function noticeAmount(t){
  const num = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
  const before = new RegExp('(?:฿|THB)\\s*'+num, 'i');
  const after = new RegExp(num+'\\s*(?:บาท|บ\\.|THB|฿)', 'i');
  const bare = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d.])/;
  // Ignore the balance that many banks add after the amount
  const head = t.split(/ยอดเงินคงเหลือ|ยอดคงเหลือ|คงเหลือ|balance|available/i)[0];
  for(const src of [head, t]){
    for(const re of [after, before]){
      const m = src.match(re);
      if(m){const v = parseFloat(m[1].replace(/,/g,'')); if(v > 0) return Math.round(v*100)/100;}
    }
    const m = src.match(bare);
    if(m){const v = parseFloat(m[1].replace(/,/g,'')+'.'+m[2]); if(v > 0) return v;}
  }
  return null;
}
function noticeKind(t){
  const strongOut = /เงินออก|ชำระเงินสำเร็จ|จ่ายเงินสำเร็จ|ชำระค่า|หักบัญชี/i.test(t);
  // Topping up a phone or a game is spending; topping up your own wallet is only moving money
  const phoneTopup = /มือถือ|โทรศัพท์|\bais\b|dtac|ดีแทค|truemove|ทรูมูฟ|เกม|game/i.test(t);
  if(/เติมเงิน|top ?-?up/i.test(t) && !phoneTopup && (WALLET_NAMES.test(t) || /เข้า/.test(t)) && !/ชำระ|จ่าย|ซื้อ/i.test(t)) return 'topup';
  if(/โอน|transfer/i.test(t) && WALLET_NAMES.test(t) && !/ชำระ|จ่าย|ซื้อ|สแกน/i.test(t)) return 'topup';
  const out = /เงินออก|ชำระ|จ่าย|โอนเงิน|โอนออก|ถอน|หักบัญชี|ซื้อ|สแกน|payment|paid|spent|debit/i.test(t) || (phoneTopup && /เติมเงิน|top ?-?up/i.test(t));
  const inn = /เงินเข้า|รับเงิน|ได้รับเงิน|เงินโอนเข้า|คืนเงิน|refund|received|cashback/i.test(t);
  if(out && (!inn || strongOut)) return 'out';
  if(inn) return 'in';
  return 'unknown';
}
function noticeMerchant(t){
  const m = t.match(/(?:ร้านค้า|ร้าน|ให้กับ|ไปยัง|ไปที่|ผู้รับ|ที่|ให้|ถึง|merchant|to|at)\s*:?\s*([^\n,;:()฿|]{2,40}?)(?=\s*(?:จำนวน|ยอด|เมื่อ|วันที่|เวลา|ด้วย|ผ่าน|สำเร็จ|amount|[\d,]+(?:\.\d+)?\s*(?:บาท|฿)|฿|\d{1,2}\/\d{1,2}|$|[,;]))/i);
  const name = m ? m[1].trim() : '';
  return /^[\d\s.-]+$/.test(name) ? '' : name;
}
function textChunks(t){
  const out = [];
  String(t||'').split(/\n\s*\n/).forEach(block => {
    const lines = block.split('\n').map(s => s.trim()).filter(Boolean);
    const withAmt = lines.filter(l => noticeAmount(l));
    if(withAmt.length > 1) lines.forEach(l => out.push(l)); else if(lines.length) out.push(lines.join(' '));
  });
  return out;
}
function noticeRows(text, app){
  const rows = [];
  for(const chunk of textChunks(text)){
    const amount = noticeAmount(chunk); if(!amount) continue;
    const kind = noticeKind(chunk);
    const date = findDate(chunk);
    const r = {src:'text', app:String(app||'').slice(0,30), raw:chunk.slice(0,300), amount, date:date || todayStr(), dateFound:true,
      time:findTime([chunk]) || nowTime(), cat:guessCat(chunk+' '+(app||'')), note:(noticeMerchant(chunk) || app || '').slice(0,80), kind, incoming:kind === 'in'};
    r.dup = isDup(r);
    r.include = kind === 'out' && !r.dup;
    rows.push(r);
  }
  return rows;
}
function receiveText(text, app, how){
  const rows = noticeRows(text, app);
  if(!rows.length){toast('ไม่พบจำนวนเงินในข้อความ'); return 0;}
  const auto = state.settings && state.settings.autoSave;
  const autoRows = auto ? rows.filter(r => r.include) : [];
  const rest = rows.filter(r => !autoRows.includes(r));
  if(autoRows.length){
    const added = autoRows.map(toEntry);
    added.forEach(e => state.expenses.push(e));
    if(save()){
      render();
      toast('บันทึกอัตโนมัติ '+added.map(e => fmt(e.amount)).join(', ')+' บาท', () => {
        const ids = new Set(added.map(e => e.id));
        state.expenses = state.expenses.filter(e => !ids.has(e.id)); save(); render(); toast('ยกเลิกแล้ว');
      });
    }
  }
  if(rest.length){
    importRows = importRows.concat(rest); renderImport();
    $('impSection').scrollIntoView({behavior:'smooth', block:'start'});
    if(!autoRows.length) toast((how === 'notification' ? 'ได้รับแจ้งเตือน ' : 'แยกได้ ')+rest.length+' รายการ ตรวจแล้วกดบันทึก');
  }
  return rows.length;
}
function seenRecently(key){
  try{
    const now = Date.now();
    const list = JSON.parse(localStorage.getItem('slip-ledger-seen') || '[]').filter(x => now-x.t < 10*60*1000);
    const hit = list.some(x => x.k === key);
    if(!hit) list.push({k:key, t:now});
    localStorage.setItem('slip-ledger-seen', JSON.stringify(list.slice(-50)));
    return hit;
  }catch(e){return false;}
}
function handleHash(){
  const h = location.hash;
  if(!h.startsWith('#n=')) return;
  history.replaceState(null, '', location.pathname + location.search);
  if(seenRecently(h)) return;
  let body = h.slice(3);
  try{body = decodeURIComponent(body.replace(/\+/g,' '));}catch(e){}
  const bar = body.indexOf('|');
  const app = bar >= 0 ? body.slice(0, bar).trim() : '';
  const text = bar >= 0 ? body.slice(bar+1) : body;
  receiveText(text, app, 'notification');
}
window.addEventListener('hashchange', handleHash);
$('noticeParse').addEventListener('click', () => {
  const t = $('noticeText').value.trim();
  if(!t){toast('วางข้อความแจ้งเตือนหรือ SMS ก่อน'); return;}
  if(receiveText(t, '', 'paste')) $('noticeText').value = '';
});
$('autoSave').addEventListener('change', () => {
  state.settings = {...(state.settings||{}), autoSave:$('autoSave').checked}; save();
  toast($('autoSave').checked ? 'เปิดบันทึกอัตโนมัติแล้ว' : 'ปิดบันทึกอัตโนมัติแล้ว');
});
function saveInbox(){
  try{localStorage.setItem('slip-ledger-inbox', JSON.stringify(importRows.filter(r => r.src === 'text')));}catch(e){}
}
function loadInbox(){
  try{
    const rows = JSON.parse(localStorage.getItem('slip-ledger-inbox') || '[]');
    if(Array.isArray(rows)) importRows = rows.filter(r => r && r.amount >= 0).map(r => ({...r, dup:isDup(r)}));
  }catch(e){}
}

/* Slips shared from other apps (Android share sheet) */
async function takeShared(){
  if(!('caches' in window)) return;
  try{
    const c = await caches.open('shared-slips');
    const keys = await c.keys();
    if(!keys.length) return;
    const files = [], texts = [];
    for(const k of keys){
      const r = await c.match(k);
      if(r){
        const b = await r.blob();
        if((b.type||'').indexOf('text/') === 0) texts.push(await b.text());
        else files.push(new File([b], 'slip', {type:b.type || 'image/jpeg'}));
      }
      await c.delete(k);
    }
    texts.forEach(t => receiveText(t, '', 'share'));
    if(files.length){
      addPicked(files);
      $('impSection').scrollIntoView({behavior:'smooth', block:'start'});
      toast('รับรูปสลิป '+files.length+' รูปแล้ว กด "อ่านสลิป"');
    }
  }catch(e){}
  if(location.search) history.replaceState(null, '', location.pathname);
}

/* ---------- Period settings ---------- */
function renderPeriods(){
  $('pBody').innerHTML = state.periods.map((p,i) => '<tr>'+
    '<td><input type="text" id="p'+i+'-name" data-i="'+i+'" data-f="name" value="'+esc(p.name||'')+'"></td>'+
    '<td><input type="date" id="p'+i+'-start" data-i="'+i+'" data-f="start" value="'+esc(p.start)+'"></td>'+
    '<td><input type="date" id="p'+i+'-end" data-i="'+i+'" data-f="end" value="'+esc(p.end)+'"></td>'+
    '<td><input type="number" id="p'+i+'-budget" data-i="'+i+'" data-f="budget" value="'+esc(p.budget)+'"></td>'+
    '<td><button type="button" class="link" data-prm="'+i+'"'+(state.periods.length < 2 ? ' disabled' : '')+'>ลบ</button></td></tr>').join('');
}
$('pBody').addEventListener('input', ev => {const t = ev.target; if(!t.dataset.f) return; const p = state.periods[+t.dataset.i]; p[t.dataset.f] = t.dataset.f === 'budget' ? (parseFloat(t.value)||0) : t.value;});
$('pBody').addEventListener('click', ev => {const b = ev.target.closest('[data-prm]'); if(!b) return; state.periods.splice(+b.dataset.prm, 1); renderPeriods();});
$('pAdd').addEventListener('click', () => {
  const last = [...state.periods].sort((a,b) => dnum(a.end)-dnum(b.end)).pop();
  const s = last ? dnum(last.end)+1 : dnum(todayStr());
  state.periods.push({name:'รอบถัดไป', start:fromNum(s), end:fromNum(s+29), budget:8000}); renderPeriods();
});
$('pSave').addEventListener('click', () => {
  if(state.periods.find(p => !isDate(p.start) || !isDate(p.end) || dnum(p.end) < dnum(p.start))){toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'); return;}
  if(save()){render(); toast('บันทึกการตั้งค่าแล้ว');}
});

/* ---------- Savings plan ---------- */
const SAV_KEYS = ['income','car','fixed','food','other','saving','current','months'];
function fillSavInputs(){SAV_KEYS.forEach(k => {$('sv-'+k).value = state.sav[k];});}
document.querySelectorAll('[data-k]').forEach(el => {
  el.addEventListener('input', () => {state.sav[el.dataset.k] = Math.max(0, parseFloat(el.value)||0); renderSav();});
  el.addEventListener('change', save);
});
function monthLabel(k){const m = k-1; return TH_M[m%12]+' '+String(70+Math.floor(m/12));}
function renderSav(){
  const s = state.sav;
  const inc = s.income+s.car, food = s.food*30, spend = s.fixed+food+s.other;
  const left = inc-spend-s.saving;
  const target = Math.max(1, s.months)*spend;
  const monthsTo = n => {const need = n-s.current; if(need <= 0) return 0; return s.saving > 0 ? Math.ceil(need/s.saving) : Infinity;};
  const whenTxt = n => {const m = monthsTo(n); return m === 0 ? 'ถึงแล้ว' : (m === Infinity ? 'ยังไม่ออม' : monthLabel(m)+' ('+m+' เดือน)');};
  const parts = [['ค่าใช้จ่ายประจำ',s.fixed,'var(--muted)'],['ค่ากินใช้',food,'var(--bar)'],['บัตรและอื่นๆ',s.other,'var(--warn)'],['เงินออม',s.saving,'var(--accent)'],['เหลือ',Math.max(0,left),'var(--future)']];
  const tot = Math.max(inc, spend+s.saving) || 1;
  $('alloc').innerHTML = parts.map(p => '<div style="width:'+(p[1]/tot*100)+'%;background:'+p[2]+'"></div>').join('');
  $('allocLegend').innerHTML = parts.map(p => '<span><i style="background:'+p[2]+'"></i>'+esc(p[0])+' '+fmt0(p[1])+'</span>').join('');
  $('svTarget').textContent = fmt0(target);
  const mt = monthsTo(target);
  $('svWhen').textContent = mt === 0 ? 'ถึงแล้ว' : (mt === Infinity ? '-' : monthLabel(mt));
  $('svRate').textContent = inc ? Math.round(s.saving/inc*100)+'%' : '0%';
  $('mileBody').innerHTML = [['เงินสำรอง 1 เดือน',spend],['เงินสำรอง 3 เดือน',spend*3],['เงินสำรอง 6 เดือน',spend*6]]
    .map(m => '<tr><td>'+m[0]+'</td><td class="num">'+fmt0(m[1])+'</td><td class="num">'+esc(whenTxt(m[1]))+'</td></tr>').join('');

  const N = 24, W = 640, H = 200, l = 56, r = 12, t = 14, b = 28, cw = W-l-r, ch = H-t-b;
  const pts = [...Array(N+1)].map((_,k) => s.current+s.saving*k);
  const max = Math.max(target*1.1, pts[N]) || 1;
  const x = k => l+k/N*cw, y = v => t+ch-v/max*ch;
  let g = '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="กราฟเงินออมสะสม">';
  [0,.25,.5,.75,1].forEach(f => {const v = max*f; g += '<line x1="'+l+'" x2="'+(W-r)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--line)"/><text x="'+(l-6)+'" y="'+(y(v)+4)+'" text-anchor="end" font-size="11" fill="var(--muted)">'+fmt0(v)+'</text>';});
  [1,6,12,18,24].forEach(k => {g += '<text x="'+x(k)+'" y="'+(H-8)+'" text-anchor="middle" font-size="11" fill="var(--muted)">'+monthLabel(k)+'</text>';});
  const path = pts.map((v,k) => (k ? 'L' : 'M')+x(k).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  g += '<path d="'+path+' L'+x(N)+' '+y(0)+' L'+x(0)+' '+y(0)+' Z" fill="var(--accent-soft)"/>';
  g += '<path d="'+path+'" fill="none" stroke="var(--accent)" stroke-width="2.5"/>';
  g += '<line x1="'+l+'" x2="'+(W-r)+'" y1="'+y(target)+'" y2="'+y(target)+'" stroke="var(--good)" stroke-dasharray="5 4"/>';
  g += '<text x="'+(l+6)+'" y="'+(y(target)-6)+'" font-size="11" fill="var(--good)">เป้า '+fmt0(target)+' บาท</text>';
  if(mt > 0 && mt <= N) g += '<circle cx="'+x(mt)+'" cy="'+y(pts[mt])+'" r="5" fill="var(--good)" stroke="var(--surface)" stroke-width="2"/>';
  g += '<circle cx="'+x(N)+'" cy="'+y(pts[N])+'" r="4" fill="var(--accent)"/>';
  g += '<text x="'+(x(N)-6)+'" y="'+(y(pts[N])+(y(pts[N]) < t+20 ? 16 : -8))+'" text-anchor="end" font-size="11" font-weight="600" fill="var(--accent)">'+fmt0(pts[N])+' บาท</text></svg>';
  $('savChart').innerHTML = g;

  const tips = [];
  if(left < 0) tips.push(['bad','แผนนี้ใช้เงินเกินรายได้เดือนละ '+fmt0(-left)+' บาท ลดค่ากินใช้หรือลดยอดออมลงก่อน']);
  else tips.push(['','หลังออมแล้วยังเหลือเดือนละ '+fmt0(left)+' บาท ถ้าไม่จำเป็นต้องใช้ ให้โอนเข้าบัญชีออมตอนสิ้นเดือน']);
  const noCar = left-s.car;
  if(s.car > 0) tips.push([noCar < 0 ? 'warn' : '', noCar < 0 ? 'ถ้าเดือนไหนไม่มีคนเช่ารถ เงินจะขาดเดือนละ '+fmt0(-noCar)+' บาท เงินสำรอง 1 เดือนจะช่วยรองรับกรณีนี้' : 'แม้ไม่มีค่าเช่ารถ แผนนี้ยังไม่ขาดเงิน']);
  const rate = inc ? s.saving/inc : 0;
  tips.push([rate < 0.1 ? 'warn' : '', rate < 0.1 ? 'ตอนนี้ออมไม่ถึง 10% ของรายได้ ลองเพิ่มให้ได้ประมาณ '+fmt0(inc*0.1)+' บาท/เดือน' : 'ออมได้ '+Math.round(rate*100)+'% ของรายได้ อยู่ในเกณฑ์ดี']);
  tips.push(['','โอนเงินออมทันทีที่เงินเดือนเข้า (วันที่ 27) ก่อนเริ่มใช้จ่าย และเก็บไว้คนละบัญชีกับบัญชีใช้จ่าย']);
  tips.push(['','เมื่อมีเงินสำรองครบ 3 เดือนแล้ว ค่อยแบ่งเงินออมส่วนเกินไปออมระยะยาว เช่น กบข. ส่วนเพิ่ม หรือสหกรณ์ออมทรัพย์ของหน่วยงาน']);
  $('tips').innerHTML = tips.map(t => '<li class="'+t[0]+'">'+esc(t[1])+'</li>').join('');
}

/* ---------- Backup ---------- */
$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({app:'slip-ledger', version:1, exportedAt:new Date().toISOString(), ...state}, null, 1)], {type:'application/json'});
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
    const have = new Set(state.expenses.map(e => e.id));
    let added = 0;
    d.expenses.forEach(e => {
      if(e && isDate(e.date) && Number(e.amount) > 0){
        const id = e.id || newId();
        if(!have.has(id)){state.expenses.push({...e, id, amount:Number(e.amount)}); have.add(id); added++;}
      }
    });
    if(Array.isArray(d.periods) && d.periods.length) state.periods = d.periods;
    if(d.sav) state.sav = {...DEFAULT_SAV, ...d.sav};
    if(save()){renderPeriods(); fillSavInputs(); renderSav(); render(); toast('นำเข้าแล้ว เพิ่ม '+added+' รายการ');}
  }catch(e){toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของสมุดงบ');}
});

/* ---------- Install and offline ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => {e.preventDefault(); installEvt = e; $('installBtn').hidden = false;});
$('installBtn').addEventListener('click', async () => {
  if(!installEvt) return;
  installEvt.prompt();
  try{await installEvt.userChoice;}catch(e){}
  installEvt = null; $('installBtn').hidden = true;
});
window.addEventListener('appinstalled', () => {$('installBtn').hidden = true; toast('ติดตั้งแล้ว เปิดได้จากหน้าจอหลัก');});
if('serviceWorker' in navigator && location.protocol !== 'file:'){
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- Start ---------- */
load();
loadInbox();
$('autoSave').checked = !!(state.settings && state.settings.autoSave);
renderPeriods(); fillSavInputs(); renderSav(); render(); updatePicked(); renderImport();
takeShared();
handleHash();
document.addEventListener('visibilitychange', () => {if(!document.hidden) render();});
