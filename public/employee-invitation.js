(() => {
  const status = document.getElementById('status');
  let token = '';
  try { token = decodeURIComponent(window.location.hash.slice(1)); } catch { /* Keep the response generic. */ }
  window.history.replaceState(null, '', window.location.pathname);
  const unavailable = 'This invitation is invalid, expired, or already used. Ask your administrator for a new invitation.';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    status.textContent = unavailable;
    status.className = 'error';
    return;
  }

  // A same-origin form navigation can follow the backend's 303 redirect without
  // exposing its Firebase reset URL to JavaScript or putting the token in a URL.
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/v1/auth/employee-invitations/consume';
  form.hidden = true;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'token';
  input.value = token;
  form.appendChild(input);
  document.body.appendChild(form);
  token = '';
  form.submit();
})();
