import experience from "./shared/rider-experience.cjs";
import { ACTIVE_STATUSES, makeRide } from "./ride-utils";
import rules from "./shared/operations.cjs";
export const initialDemoState = () => {
 const ops=rules.initialOperations();
 ops.documents["demo-driver"]=Object.fromEntries(rules.DOCUMENT_TYPES.map(type=>[type,{reference:`MUESTRA-${type}`,expires:"2027-12-31",status:"pending",submitted_at:new Date().toISOString()}]));
 ops.ledger.push({id:"opening-demo",driver_id:"demo-driver",amount_cents:100000,kind:"demo_opening",reference:"Saldo ficticio para la presentación",at:new Date().toISOString()});
 return {version:2,role:"passenger",driver:{id:"demo-driver",full_name:"Andrés",vehicle:"Toyota Corolla blanco",plate:"VAI 123",category:"Estándar",driver_status:"pending",online:false},rides:[],driverLocation:null,operations:ops};
};
export function demoReducer(original, action) {
 const state=JSON.parse(JSON.stringify(original)), ops=state.operations=rules.normalize(state.operations), actor={id:state.role==="driver"?state.driver.id:state.role==="passenger"?"demo-passenger":`demo-${state.role}`,role:state.role};
 const now=new Date().toISOString(), id=action.id||`demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 const current=state.rides.find(r=>ACTIVE_STATUSES.includes(r.status)), ride=state.rides.find(r=>r.id===action.id);
 const update=change=>{Object.assign(ride,change,{updated_at:now});};
 if(action.type==="RESET")return initialDemoState();
 if(action.type==="OPERATION"){
   if(action.operation==="ASSIGN") {
    if(!["admin","dispatcher"].includes(state.role)||!ride||!["searching","accepted"].includes(ride.status))throw new Error("Solo despacho puede asignar viajes pendientes.");
    const problem=rules.eligibility(ops,state.driver);if(problem)throw new Error(problem);if(!state.driver.online)throw new Error("El conductor debe estar conectado.");
    if(state.rides.some(r=>r.id!==ride.id&&rules.active(r)&&r.driver_id===state.driver.id))throw new Error("El conductor ya tiene un viaje activo.");
    update({driver_id:state.driver.id,status:"accepted",phase:"assigned",driver_name:state.driver.full_name,vehicle:state.driver.vehicle,plate:state.driver.plate,pin:String(Math.floor(1000+Math.random()*9000)),commission_percent:ride.commission_percent??ops.settings.commission_percent});
    rules.audit(ops,actor,"ASSIGN",{ride_id:ride.id});return state;
   }
   if(action.operation==="RELEASE_BOOKING"){
    if(!["admin","dispatcher"].includes(state.role))throw new Error("Solo despacho puede activar la reserva.");
    const booking=ops.reservations.find(b=>b.id===action.payload.id&&b.status==="reserved");if(!booking)throw new Error("Reserva no disponible.");
    const r=makeRide({pickup:booking.pickup,destination:booking.destination},id);r.passenger_id=booking.passenger_id||`guest-${booking.id}`;r.passenger_name=booking.customer;r.estimated_fare=rules.quote(r.distance_km,r.duration_minutes,ops.settings,r.category);r.pin=String(Math.floor(1000+Math.random()*9000));r.category=booking.category;
    state.rides.unshift(r);state.operations=rules.operate(ops,actor,"RELEASE_BOOKING",{id:booking.id,ride_id:r.id},{id:action.event_id});return state;
   }
   state.operations=rules.operate(ops,actor,action.operation,action.payload,{id:action.event_id,rides:state.rides,drivers:[state.driver],users:[{id:"demo-passenger"},{id:"demo-driver"}]});
   if(action.operation.startsWith("DOCUMENT")&&rules.eligibility(state.operations,state.driver))state.driver.online=false;
   return state;
 }
 switch(action.type){
 case "ROLE":if(!["passenger","driver","admin","dispatcher"].includes(action.role))throw new Error("Modo inválido.");state.role=action.role;break;
 case "DRIVER":if(!action.driver.full_name?.trim()||!action.driver.vehicle?.trim()||!action.driver.plate?.trim())throw new Error("Completa nombre, vehículo y placa.");Object.assign(state.driver,action.driver,{driver_status:"pending",online:false});break;
 case "REVIEW":if(state.role!=="admin")throw new Error("Solo administración puede aprobar conductores.");Object.assign(state.driver,{driver_status:action.approved?"approved":"rejected",online:false});break;
 case "ONLINE":{if(state.role!=="driver")throw new Error("Solo el conductor puede conectarse.");if(action.online){const problem=rules.eligibility(ops,state.driver);if(problem)throw new Error(problem);}if(!action.online&&current?.driver_id)throw new Error("Finaliza el viaje antes de desconectarte.");state.driver.online=action.online;state.driver.location={latitude:18.475,longitude:-69.89,updated_at:now};break;}
 case "REQUEST":if(state.role!=="passenger")throw new Error("Pide el viaje desde Pasajero.");if(current)throw new Error("Ya tienes un viaje activo.");{if(rules.km(action.draft.pickup,ops.settings.zone)>ops.settings.zone.radius_km)throw new Error("El origen está fuera de la zona piloto de Santo Domingo.");if(!ops.settings.categories.includes(action.draft.category||"Estándar"))throw new Error("Categoría inválida.");const details=experience.rideDetails(action.draft);const r={...makeRide(action.draft,id),...details};r.pin=String(Math.floor(1000+Math.random()*9000));r.category=action.draft.category||"Estándar";r.commission_percent=ops.settings.commission_percent;r.estimated_fare=rules.quote(r.distance_km,r.duration_minutes,ops.settings,r.category);state.rides.unshift(r);if(ops.settings.auto_dispatch&&rules.candidates(ops,[state.driver],r,state.rides).length){Object.assign(r,{driver_id:state.driver.id,status:"accepted",phase:"assigned"});}}break;
 case "ACCEPT":if(state.role!=="driver"||!state.driver.online)throw new Error("Debes estar aprobado y conectado para aceptar.");{const problem=rules.eligibility(ops,state.driver);if(problem)throw new Error(problem);}if(!ride||ride.status!=="searching")throw new Error("Este viaje ya no está disponible.");if(current?.driver_id)throw new Error("Ya tienes un viaje activo.");update({status:"accepted",phase:"assigned",driver_id:state.driver.id,driver_name:state.driver.full_name,vehicle:state.driver.vehicle,plate:state.driver.plate});state.driverLocation={latitude:ride.pickup_lat+.004,longitude:ride.pickup_lng+.004};break;
 case "STATUS":{
  const allowed={en_route:["accepted"],arrived:["accepted"],in_progress:["accepted"],completed:["in_progress"],cancelled:ACTIVE_STATUSES};if(!ride||!allowed[action.status]?.includes(ride.status))throw new Error("El viaje cambió o la transición no es válida.");
  if(action.status!=="cancelled"&&state.role!=="driver")throw new Error("El conductor debe avanzar el viaje.");
  if(action.status==="in_progress"&&(ride.phase!=="arrived"||action.pin!==ride.pin))throw new Error("Confirma la llegada e introduce el PIN del pasajero.");
  if(action.status==="cancelled"&&!action.reason?.trim())throw new Error("Indica el motivo de cancelación.");
  update(action.status==="en_route"||action.status==="arrived"?{phase:action.status}:{status:action.status,cancel_reason:action.reason||null});
  if(action.status==="completed"){rules.commission(ops,ride,actor);ride.receipt={number:`VAI-${ride.id}`,fare:ride.estimated_fare,currency:"DOP",payment:"cash",at:now};if(rules.eligibility(ops,state.driver))state.driver.online=false;}
  break;}
 case "LOCATION":if(state.role!=="driver"||!state.driver.online||!rules.point(action.point))throw new Error("Conéctate y comparte una ubicación válida.");state.driverLocation=action.point;state.driver.location={...action.point,updated_at:now};break;
 case "RATING":if(state.role!=="passenger"||!ride||ride.status!=="completed"||ride.rating||!Number.isInteger(action.score)||action.score<1||action.score>5)throw new Error("Solo puedes calificar una vez cada viaje finalizado.");update({rating:action.score,review:(action.comment||"").slice(0,500)});break;
 default:throw new Error("Acción no disponible.");
 }
 rules.audit(ops,actor,action.type,{ride_id:ride?.id||id});return state;
}
