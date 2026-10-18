(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const form = $('result-form');
  const alertBox = $('alert');
  const result = $('result');
  const data = window.ENCRYPTED_RESULTS;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const digits = (value) => String(value || '').replace(/\D/g, '');
  const normalizeCode = (value) => String(value || '').toUpperCase().replace(/[\s-]/g, '');
  const showMessage = (message) => { alertBox.textContent = message; alertBox.hidden = !message; };
  const bytesToHex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const fromBase64 = (value) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const sha256 = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

  $('student-id').addEventListener('input', () => {
    $('student-id').value = digits($('student-id').value).slice(0, 10);
  });

  const lookup = async (id, code) => {
    const indexHash = bytesToHex(await sha256(`HEB-ACA-2026|lookup|${id}|${code}`));
    const match = data.entries[indexHash];
    if (!match) return null;
    const rawKey = await sha256(`HEB-ACA-2026|aes-key|${id}|${code}`);
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(match.iv) },
        key,
        fromBase64(match.ct)
      );
      const student = JSON.parse(decoder.decode(plaintext));
      if (student.id !== id || !['בתכנית','לא בתכנית'].includes(student.status)) return null;
      return student;
    } catch (_) {
      return null;
    }
  };

  const showResult = (student) => {
    $('out-name').textContent = student.name;
    $('out-id').textContent = student.id;
    const enrolled = student.status === 'בתכנית';
    $('out-status').textContent = enrolled ? 'בתכנית' : 'לא בתכנית';
    $('out-status').className = 'status-pill ' + (enrolled ? 'accepted' : 'not-accepted');
    result.hidden = false;
    showMessage('');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  $('reset-btn').addEventListener('click', () => {
    result.hidden = true;
    form.reset();
    $('student-id').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    result.hidden = true;
    showMessage('');
    const id = digits($('student-id').value);
    const code = normalizeCode($('student-pin').value);
    if (!/^\d{9,10}$/.test(id)) {
      showMessage('יש להזין מספר זהות מלא בן 9 או 10 ספרות.');
      return;
    }
    if (!/^[A-HJ-NP-Z2-9]{20}$/.test(code)) {
      showMessage('יש להזין את הקוד האישי בן 20 תווים שקיבלת מבית הספר.');
      return;
    }
    if (!data || data.version !== 1 || !data.entries || !globalThis.crypto?.subtle) {
      showMessage('לא ניתן לפתוח את המידע בדפדפן זה. יש לפתוח את האתר ב-HTTPS בדפדפן עדכני.');
      return;
    }
    const button = $('submit-btn');
    button.disabled = true;
    button.querySelector('span').textContent = 'בודק/ת פרטים...';
    try {
      const student = await lookup(id, code);
      if (!student) {
        showMessage('לא נמצאה תוצאה לפרטים שהוזנו. יש לבדוק את מספר הזהות ואת הקוד האישי או לפנות לבית הספר.');
        return;
      }
      showResult(student);
    } catch (err) {
      showMessage('אירעה תקלה בפתיחת הנתונים. נא לרענן את הדף ולנסות שוב.');
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = 'הצגת התוצאה';
    }
  });
})();
