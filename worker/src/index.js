// Cloudflare Worker + D1. No actual student information in this repository.
const json = (body, status = 200, cors = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', ...cors }
});
const isValidId = (id) => {
  if(!/^\d{9}$/.test(id))return false;
  let sum=0;for(let i=0;i<9;i++){let n=Number(id[i])*(i%2?2:1);sum+=n>9?n-9:n;}return sum%10===0;
};
async function keyedHash(secret, input) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), x=>x.toString(16).padStart(2,'0')).join('');
}
async function rateLimit(db, key) {
  const now = Math.floor(Date.now()/1000), ttl=900;
  await db.prepare(`INSERT INTO attempts (ip_hash,window_start,count) VALUES (?,?,1)
    ON CONFLICT(ip_hash) DO UPDATE SET count = CASE WHEN (? - window_start) >= ? THEN 1 ELSE count + 1 END,
    window_start = CASE WHEN (? - window_start) >= ? THEN ? ELSE window_start END`).bind(key,now,now,now,ttl,now,ttl,now).run();
  const v=await db.prepare('SELECT count FROM attempts WHERE ip_hash=?').bind(key).first();
  return v && v.count > 12;
}
async function readJSON(req) {
  if(Number(req.headers.get('content-length')||0)>130000) throw new Error('TOO_LARGE');
  const body=await req.text();if(body.length>130000)throw new Error('TOO_LARGE');return JSON.parse(body);
}
export default {
  async fetch(request, env) {
    const origin=request.headers.get('Origin');
    const allowed=String(env.ALLOWED_ORIGIN||'');
    const cors= origin===allowed ? {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin'
    } : {'Vary':'Origin'};
    if(origin && origin!==allowed)return json({ok:false,error:'Origin not allowed'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname==='/health')return json({ok:true,service:'results-api'},200,cors);
    if(!env.DB || !env.ID_HMAC_KEY)return json({ok:false,error:'Server not configured'},503,cors);
    if(request.method!=='POST')return json({ok:false,error:'Not found'},404,cors);
    try {
      if(url.pathname==='/lookup') {
        const ip=request.headers.get('CF-Connecting-IP')||'unknown';
        const ipHash=await keyedHash(env.ID_HMAC_KEY,'ip:'+ip);
        if(await rateLimit(env.DB,ipHash))return json({ok:false,error:'יותר מדי ניסיונות. יש לנסות שוב מאוחר יותר.'},429,cors);
        const data=await readJSON(request);
        const id=String(data.id||''),pin=String(data.pin||'');
        if(!isValidId(id))return json({ok:false,error:'מספר תעודת הזהות אינו תקין.'},400,cors);
        if(env.REQUIRE_PIN!=='false' && (pin.length<4||pin.length>64))return json({ok:false,error:'יש להזין קוד אישי תקין.'},400,cors);
        const idHash=await keyedHash(env.ID_HMAC_KEY,'id:'+id);
        const record=await env.DB.prepare('SELECT student_name,grade,status,pin_hash FROM students WHERE id_hash=?').bind(idHash).first();
        const noResult={ok:false,error:'לא נמצאה תוצאה לפרטים שהוזנו. יש לפנות לרכז/ת התכנית.'};
        if(!record)return json(noResult,404,cors);
        if(env.REQUIRE_PIN!=='false') {
          const pinHash=await keyedHash(env.ID_HMAC_KEY,'pin:'+id+':'+pin);
          if(!record.pin_hash || pinHash!==record.pin_hash)return json(noResult,404,cors);
        }
        return json({ok:true,student:{name:record.student_name,grade:record.grade,status:record.status}},200,cors);
      }
      if(url.pathname==='/admin/import') {
        const token=request.headers.get('Authorization')||'';
        if(!env.ADMIN_SECRET || token!==`Bearer ${env.ADMIN_SECRET}`)return json({ok:false,error:'Unauthorized'},401,cors);
        const data=await readJSON(request);
        const rows=data.students;
        if(!Array.isArray(rows)||rows.length<1||rows.length>25)return json({ok:false,error:'Send 1-25 rows per request'},400,cors);
        const requirePin=env.REQUIRE_PIN!=='false';
        const items=[];
        for(const entry of rows) {
          const id=String(entry.student_id||'').trim();
          const name=String(entry.student_name||'').trim();
          const grade=Number(entry.grade);
          const status=String(entry.status||'').trim();
          const pin=String(entry.pin||'').trim();
          if(!isValidId(id)||!name||name.length>120||!Number.isInteger(grade)||grade<0||grade>100||!['B1','NOT_IN_PROGRAM'].includes(status)|| (requirePin && (pin.length<4||pin.length>64)))
            return json({ok:false,error:'Invalid student record (ID, name, grade, status or PIN)'},400,cors);
          const idHash=await keyedHash(env.ID_HMAC_KEY,'id:'+id);
          const pinHash=pin ? await keyedHash(env.ID_HMAC_KEY,'pin:'+id+':'+pin) : null;
          items.push(env.DB.prepare(`INSERT INTO students(id_hash,student_name,grade,status,pin_hash,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(id_hash) DO UPDATE SET student_name=excluded.student_name, grade=excluded.grade,
            status=excluded.status, pin_hash=excluded.pin_hash, updated_at=CURRENT_TIMESTAMP`).bind(idHash,name,grade,status,pinHash));
        }
        // 25 statements per batch fit D1 Workers Free query limits.
        await env.DB.batch(items);
        return json({ok:true,imported:items.length},200,cors);
      }
      return json({ok:false,error:'Not found'},404,cors);
    } catch(error) {
      if(error?.message==='TOO_LARGE')return json({ok:false,error:'Request too large'},413,cors);
      if(error instanceof SyntaxError)return json({ok:false,error:'Invalid JSON'},400,cors);
      console.error('API request failed', error?.message);
      return json({ok:false,error:'Server error'},500,cors);
    }
  }
};
