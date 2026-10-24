import 'dotenv/config';
import {createClient} from '@supabase/supabase-js';
import {fileURLToPath} from 'node:url';
import {createBackup} from '../src/backup.js';
if(!process.env.BACKUP_DIR||!process.env.BACKUP_ENCRYPTION_KEY)throw new Error('Configure BACKUP_DIR and BACKUP_ENCRYPTION_KEY');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
await createBackup({db,operationsFile:process.env.OPERATIONS_FILE||fileURLToPath(new URL('../.data/operations.json',import.meta.url)),directory:process.env.BACKUP_DIR,keyHex:process.env.BACKUP_ENCRYPTION_KEY});
console.log('Encrypted backup complete. Protect the key separately and replicate the backup off-site.');
