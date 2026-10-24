import { randomUUID } from "node:crypto";
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function mountDocuments(app,{repo,store,authenticated,wrap}){
 app.post("/api/documents/upload",authenticated,wrap(async(req,res)=>{
  if(!["driver","passenger"].includes(req.profile.role))throw fail(403,"Solo el titular puede adjuntar documentos.");
  const {base64}=req.body||{};if(typeof base64!=="string"||base64.length>2800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw fail(400,"Adjunta una imagen JPEG de hasta 2 MB.");
  const data=Buffer.from(base64,"base64");if(data.length>2*1024*1024||data.length<100||data[0]!==255||data[1]!==216||data[2]!==255)throw fail(400,"Solo se aceptan fotografías JPEG de hasta 2 MB.");
  if(!repo.uploadDocument)throw fail(503,"El almacenamiento privado no está configurado.");
  const id=randomUUID(),path=`${req.profile.id}/${id}.jpg`;await repo.uploadDocument(path,data);
  store.state.document_files||={};store.state.document_files[id]={owner:req.profile.id,path,created_at:new Date().toISOString()};await store.save();res.status(201).json({file_id:id});
 }));
 app.get("/api/documents/:id",authenticated,wrap(async(req,res)=>{
  const file=store.state.document_files?.[req.params.id];if(!file||(file.owner!==req.profile.id&&req.profile.role!=="admin"))throw fail(404,"Documento no encontrado.");
  const url=await repo.signDocument(file.path);res.json({url});
 }));
}
