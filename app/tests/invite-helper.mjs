// Explicitly exercise the new invitation flow in existing positive multiplayer tests.
export async function inviteCookie(base,path,hostToken) {
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${hostToken}`};
  const i=await fetch(base+path+'/invitations',{method:'POST',headers,body:'{}'});
  if(!i.ok)throw Error(`Invitation failed: ${i.status}`);
  const {secret}=await i.json();
  const c=await fetch(base+path+'/invitation-context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret})});
  if(!c.ok)throw Error(`Invitation context failed: ${c.status}`);
  return c.headers.get('set-cookie').split(';')[0];
}
