(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const config = window.RESULTS_CONFIG || {};
  const apiUrl = String(config.apiUrl || '').replace(/\/+$/, '');
  const requirePin = config.requirePin !== false;
  const form = $('result-form'), alertBox = $('alert'), result = $('result');
  $('pin-field').hidden = !(apiUrl && requirePin);
  $('demo-row').hidden = Boolean(apiUrl);
  const digits = (v) => String(v || '').replace(/\D/g, '');
  $('student-id').addEventListener('input', () => { $('student-id').value = digits($('student-id').value).slice(0, 10); });
  const alertMessage = (message) => { alertBox.textContent = message; alertBox.hidden = !message; };
  const validIsraeliId = (id) => {
    // The school list has one exceptional 10-digit identifier. Keep it unchanged.
    if (/^\d{10}$/.test(id)) return true;
    if (!/^\d{9}$/.test(id)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let digit = Number(id[i]) * (i % 2 ? 2 : 1);
      sum += digit > 9 ? digit - 9 : digit;
    }
    return sum % 10 === 0;
  };
  const showResult = ({ name, id, status }, isDemo = false) => {
    $('out-name').textContent = String(name);
    $('out-id').textContent = String(id);
    const accepted = status === 'B1' || status === 'בתכנית';
    $('out-status').textContent = accepted ? 'בתכנית' : 'לא בתכנית';
    $('out-status').className = 'status-pill ' + (accepted ? 'accepted' : 'not-accepted');
    $('demo-stamp').hidden = !isDemo;
    result.hidden = false;
    alertMessage('');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  $('demo-btn').addEventListener('click', () => showResult({ name: 'תלמיד/ה לדוגמה', id: '000000000', status: 'בתכנית' }, true));
  $('reset-btn').addEventListener('click', () => { result.hidden = true; form.reset(); $('student-id').focus(); window.scrollTo({top:0, behavior:'smooth'}); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); result.hidden = true; alertMessage('');
    const id = digits($('student-id').value);
    if (!validIsraeliId(id)) { alertMessage('מספר תעודת הזהות אינו תקין. יש להזין את כל ספרות המספר כפי שנמסר מבית הספר (9 או 10 ספרות).'); return; }
    if (!apiUrl) { alertMessage('האתר במצב הדגמה. יש לחבר מאגר תוצאות מאובטח לפני בדיקת תלמידים אמיתיים.'); return; }
    const pin = $('student-pin').value;
    if (requirePin && pin.length < 4) { alertMessage('יש להזין את הקוד האישי שקיבלת מבית הספר.'); return; }
    const btn = $('submit-btn'); btn.disabled = true; btn.querySelector('span').textContent = 'מחפש/ת תוצאה...';
    try {
      const response = await fetch(apiUrl + '/lookup', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id, pin }), cache: 'no-store' });
      const payload = await response.json();
      if (response.status === 429) throw new Error('בוצעו יותר מדי ניסיונות. יש לנסות שוב מאוחר יותר.');
      if (!response.ok || !payload.ok || !payload.student) throw new Error(payload.error || 'לא נמצאה תוצאה לפרטים שהוזנו. יש לפנות לרכז/ת התכנית.');
      showResult({ ...payload.student, id }, false);
    } catch (err) { alertMessage(err instanceof TypeError ? 'לא ניתן להתחבר לשרת התוצאות. נא לנסות שוב מאוחר יותר.' : err.message); }
    finally { btn.disabled = false; btn.querySelector('span').textContent = 'הצגת התוצאה'; }
  });
})();
