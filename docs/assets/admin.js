(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const config = window.RESULTS_CONFIG || {};
  const apiUrl = String(config.apiUrl || '').replace(/\/+$/, '');
  const status = (s) => { $('status').hidden = false; $('status').textContent = s; };
  function parseCSV(text) {
    const rows=[]; let row=[], field='', quoted=false;
    text = text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if (quoted) {
        if(c==='"'&&text[i+1]==='"') {field+='"';i++;} else if(c==='"') quoted=false; else field+=c;
      } else if(c==='"') {quoted=true;}
      else if(c===',') {row.push(field);field='';}
      else if(c==='\n'||c==='\r') {if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}
      else field+=c;
    }
    if(quoted)throw Error('שגיאה במבנה CSV: גרשיים לא סגורים.');
    row.push(field);if(row.some(v=>v.trim()))rows.push(row);
    if(rows.length<2)throw Error('קובץ ה-CSV ריק או חסר שורות.');
    const headers=rows.shift().map(x=>x.trim().toLowerCase());
    for(const key of ['student_id','student_name','grade','status'])if(!headers.includes(key))throw Error('חסרה עמודה: '+key);
    return rows.map((cells,index)=>{const o={};headers.forEach((h,i)=>o[h]=(cells[i]||'').trim());o.student_id=o.student_id.replace(/\D/g,'').padStart(9,'0');if(!/^\d{9}$/.test(o.student_id))throw Error('מספר זהות שגוי בשורה '+(index+2));return o;});
  }
  $('upload-form').addEventListener('submit',async(e)=>{
    e.preventDefault();
    if(!apiUrl){status('לא הוגדרה כתובת שרת בקובץ assets/config.js');return;}
    const secret=$('secret').value.trim();
    if(!secret){status('יש להזין מפתח ניהול.');return;}
    const file=$('csv').files[0];if(!file)return;
    const btn=$('upload-btn');btn.disabled=true;
    try {
      const rows=parseCSV(await file.text());
      if(rows.length>5000)throw Error('נא לפצל קבצים מעל 5,000 תלמידים.');
      if(!confirm('ייבוא '+rows.length+' רשומות. רשומות עם תעודת זהות זהה יעודכנו. להמשיך?'))return;
      for(let i=0;i<rows.length;i+=25){
        status('מעלה רשומות '+(i+1)+'–'+Math.min(i+25,rows.length)+' מתוך '+rows.length+'...');
        const r=await fetch(apiUrl+'/admin/import',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+secret},body:JSON.stringify({students:rows.slice(i,i+25)})});
        const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'שגיאה בשרת בשורה '+(i+2));
      }
      status('הייבוא הושלם בהצלחה: '+rows.length+' תלמידים.\nהקובץ נשאר במחשב שלך ולא נשמר ב-GitHub.');
      $('csv').value='';
    } catch(err){status('שגיאה: '+err.message);}finally{btn.disabled=false;}
  });
})();
