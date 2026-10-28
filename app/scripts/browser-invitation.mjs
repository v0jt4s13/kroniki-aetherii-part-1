export async function invitationUrl(host,code){
 return host.evaluate(async code=>{
  const token=localStorage.getItem(`aetherii:${code}`);
  const response=await fetch(new URL(`api/rooms/${code}/invitations`,document.baseURI),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:'{}'});
  if(!response.ok)throw Error('Could not create test invitation');
  const {secret}=await response.json();const url=new URL(location.href);url.search=`?room=${code}`;url.hash=`invite=${secret}`;return url.href;
 },code);
}
