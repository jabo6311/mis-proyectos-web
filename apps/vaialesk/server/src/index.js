import {createBackup} from "./backup.js";
import {fileURLToPath} from "node:url";
import {flushNotifications} from "./notifications.js";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createTokenVerifier } from "./auth.js";
import { createApp } from "./app.js";
import { createRepository } from "./repository.js";
import { createLocalStore } from "./local-store.js";
for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
if(process.env.NODE_ENV==="production"&&(!process.env.PUBLIC_API_URL?.startsWith("https://")||!process.env.CORS_ORIGINS||!process.env.AUDIT_SIGNING_KEY))throw new Error("Production requires HTTPS PUBLIC_API_URL, CORS_ORIGINS and AUDIT_SIGNING_KEY");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const store = await createLocalStore(process.env.OPERATIONS_FILE || new URL("../.data/operations.json", import.meta.url), {auditKey:process.env.AUDIT_SIGNING_KEY});
const app = createApp({ repository: createRepository(db), store, adminSubjects: (process.env.ADMIN_SUPABASE_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean), verifyToken: createTokenVerifier(db.auth, process.env.SUPABASE_URL) });
await createRepository(db).checkReady();
await app.locals.migrateLegacy();
const server=app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => console.log(`VAI API listening on port ${process.env.PORT || 3000}`));

const dispatchTimer=setInterval(()=>app.locals.tick().catch(error=>console.error("Dispatch failed:",error.code||"unavailable")),5000);
dispatchTimer.unref();

let notifying=false;const notificationTimer=setInterval(async()=>{if(notifying)return;notifying=true;try{await flushNotifications(store,createRepository(db));}catch{console.error("Notification queue unavailable");}finally{notifying=false;}},15000);notificationTimer.unref();

let backingUp=false;const backupTimer=setInterval(async()=>{
 if(!process.env.BACKUP_DIR||!process.env.BACKUP_ENCRYPTION_KEY||backingUp||Date.now()-(store.state.last_backup||0)<86400000)return;
 backingUp=true;try{await store.save();await createBackup({db,operationsFile:process.env.OPERATIONS_FILE||fileURLToPath(new URL("../.data/operations.json",import.meta.url)),directory:process.env.BACKUP_DIR,keyHex:process.env.BACKUP_ENCRYPTION_KEY});store.state.last_backup=Date.now();await store.save();}catch{console.error("Encrypted backup failed");}finally{backingUp=false;}
},60000);backupTimer.unref();
for(const signal of ["SIGTERM","SIGINT"])process.once(signal,()=>{clearInterval(dispatchTimer);clearInterval(notificationTimer);clearInterval(backupTimer);server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
