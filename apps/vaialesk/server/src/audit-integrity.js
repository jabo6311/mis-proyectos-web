import {createHmac,timingSafeEqual} from 'node:crypto';
function digest(entry,previous,key){const {audit_hash,...body}=entry;return createHmac('sha256',key).update(previous+'\n'+JSON.stringify(body)).digest('hex');}
export function protectAudit(state,key){
 if(!key){if(state.audit_protected_count)throw new Error("Audit key is required to verify existing signatures");return;}if((state.audit_protected_count||0)>(state.operations?.audit?.length||0))throw new Error("Audit log was truncated");if(key.length<32)throw new Error('AUDIT_SIGNING_KEY must have at least 32 characters');
 let previous='VAI-AUDIT-v1';
 for(const entry of state.operations?.audit||[]){const hash=digest(entry,previous,key);if(entry.audit_hash){const actual=Buffer.from(entry.audit_hash,'hex'),expected=Buffer.from(hash,'hex');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('Audit integrity check failed');}else if(state.audit_protected_count && state.operations.audit.indexOf(entry)<state.audit_protected_count)throw new Error('Audit signature missing');entry.audit_hash=hash;previous=hash;}
 state.audit_protected_count=state.operations?.audit?.length||0;
}
