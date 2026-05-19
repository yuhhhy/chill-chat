async function assertOk(res, label) {
  if (res.ok) return;

  let message = `${label} failed: ${res.status}`;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
  } catch {
    // Keep the status-based fallback.
  }
  throw new Error(message);
}

export async function apiGet(path) {
  const res = await fetch(path);
  await assertOk(res, `GET ${path}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  await assertOk(res, `POST ${path}`);
  return res.json();
}

export async function apiPatch(path, body) {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  await assertOk(res, `PATCH ${path}`);
  return res.json();
}

export async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE', keepalive: true });
  await assertOk(res, `DELETE ${path}`);
  return res.json();
}
