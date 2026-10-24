import { createHmac } from "node:crypto";
export function mountNotifications(app,{store,authenticated,wrap}){
 app.post('/api/notifications/register',authenticated,wrap(async(req,res)=>{const token=req.body?.token;if(typeof token!=="string"||!/^ExponentPushToken\[[A-Za-z0-9_-]+\]$|^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(token)||token.length>200)return res.status(400).json({error:"Token de notificación inválido."});store.state.push_tokens||={};for(const tokens of Object.values(store.state.push_tokens)){const i=tokens.indexOf(token);if(i>=0)tokens.splice(i,1);}store.state.push_tokens[req.profile.id]||=[];store.state.push_tokens[req.profile.id].push(token);await store.save();res.json({ok:true});}));
}
export async function flushNotifications(store,repo,send=fetch){
 const state=store.state,events=state.operations.audit;state.outbox||=[];
 const rows=await repo.listRides({role:"admin"}),profiles=await repo.listProfiles();
 for(const event of events.slice(state.notification_cursor||0)){
  const ride=rows.find(r=>r.id===(event.ride_id||event.entity_id));
  if(!ride||!['ASSIGN','AUTO_DISPATCH','ACCEPT','arrived','completed','cancelled','SOS'].includes(event.action))continue;
  const recipients=event.action==='SOS'?profiles.filter(p=>p.role==='admin'||state.operations.staff[p.id]==='dispatcher').map(p=>p.id):[ride.passenger_id,ride.driver_id].filter(Boolean);
  for(const user of new Set(recipients))for(const token of state.push_tokens?.[user]||[])state.outbox.push({id:`${event.id}:${user}:${token}`,channel:'expo',token,title:event.action==='SOS'?'VAI · SOS activo':'VAI · Actualización del viaje',body:event.action==='SOS'?'Revisa Incidencias en el centro de control.':'Abre VAI para consultar el estado del viaje.',ride_id:ride.id,attempts:0,status:'pending',next_at:0});
  if(event.action==='SOS'&&process.env.SOS_WEBHOOK_URL){const incident=state.operations.incidents.find(i=>i.ride_id===ride.id&&i.at===event.at)||state.operations.incidents.find(i=>i.ride_id===ride.id);if(incident)state.outbox.push({id:`sos:${incident.id}`,channel:'sos_webhook',payload:incident,attempts:0,status:'pending',next_at:0});}
 }
 state.notification_cursor=events.length;await store.save();
 for(const job of state.outbox.filter(j=>j.status==='pending'&&j.next_at<=Date.now()).slice(0,20)){
  try{
   let response;
   if(job.channel==='expo'){
    response=await send('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})},body:JSON.stringify({to:job.token,title:job.title,body:job.body,channelId:'trips',data:{ride_id:job.ride_id}}),signal:AbortSignal.timeout(8000)});
    const body=await response.json();if(!response.ok||body.data?.status!=='ok')throw new Error('Push rejected');job.ticket_id=body.data.id;
   }else{
    const url=process.env.SOS_WEBHOOK_URL,secret=process.env.SOS_WEBHOOK_SECRET;if(!url?.startsWith('https://')||!secret)throw new Error('Webhook not configured');const body=JSON.stringify(job.payload);
    response=await send(url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':job.id,'X-VAI-Signature':createHmac('sha256',secret).update(body).digest('hex')},body,signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Webhook rejected');const i=state.operations.incidents.find(i=>i.id===job.payload.id);if(i)i.delivery='accepted_by_provider';
   }
   job.status='accepted';job.accepted_at=new Date().toISOString();
  }catch{job.attempts++;job.next_at=Date.now()+Math.min(3600000,2**Math.min(job.attempts,10)*10000);if(job.attempts>=12)job.status='failed';}
  await store.save();
 }
}
