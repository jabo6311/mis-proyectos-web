import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {join} from 'node:path';
export function encryptBackup(value,keyHex){if(!/^[a-fA-F0-9]{64}$/.test(keyHex||''))throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hex characters');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),iv),data=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([Buffer.from('VAIB1'),iv,cipher.getAuthTag(),data]);}
export function decryptBackup(bytes,keyHex){if(bytes.subarray(0,5).toString()!=='VAIB1')throw new Error('Unknown backup format');const decipher=createDecipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),bytes.subarray(5,17));decipher.setAuthTag(bytes.subarray(17,33));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(33)),decipher.final()]).toString());}
export async function createBackup({db,operationsFile,directory,keyHex}){
 const data={version:1,at:new Date().toISOString(),operations:JSON.parse(await readFile(operationsFile,'utf8')),tables:{}};
 for(const table of ['profiles','rides','ratings']){data.tables[table]=[];for(let from=0;;from+=1000){const r=await db.from(table).select('*').order('id').range(from,from+999);if(r.error)throw r.error;data.tables[table].push(...r.data);if(r.data.length<1000)break;}}
 await mkdir(directory,{recursive:true});const path=join(directory,`vai-${Date.now()}.backup`);await writeFile(path+'.tmp',encryptBackup(data,keyHex),{mode:0o600});await rename(path+'.tmp',path);return path;
}
