async function result(query) { const { data, error } = await query; if (error) throw error; return data; }
export function createRepository(db) {
  let bucketReady;
  async function privateBucket(){ if(!bucketReady)bucketReady=(async()=>{const {data,error}=await db.storage.getBucket("vai-driver-documents");if(data){if(data.public)throw new Error("Document bucket must be private");return;}if(error&&error.statusCode!=="404"&&error.statusCode!==404&&!/not found/i.test(error.message))throw error;const created=await db.storage.createBucket("vai-driver-documents",{public:false,fileSizeLimit:2097152,allowedMimeTypes:["image/jpeg"]});if(created.error)throw created.error;})();return bucketReady; }
  return {
    uploadDocument:async(path,data)=>{await privateBucket();const r=await db.storage.from("vai-driver-documents").upload(path,data,{contentType:"image/jpeg",upsert:false});if(r.error)throw r.error;},
    signDocument:async path=>{await privateBucket();const r=await db.storage.from("vai-driver-documents").createSignedUrl(path,60);if(r.error)throw r.error;return r.data.signedUrl;},
    getProfile: sub => result(db.from("profiles").select("*").eq("auth0_sub", sub).maybeSingle()),
    getProfileById: id => result(db.from("profiles").select("*").eq("id", id).maybeSingle()),
    createProfile: data => result(db.from("profiles").insert(data).select().single()),
    updateProfile: (id, data) => result(db.from("profiles").update(data).eq("id", id).select().single()),
    listProfiles: () => result(db.from("profiles").select("id,full_name,role,driver_status,created_at").order("created_at", { ascending: false }).limit(200)),
    listRides: async (profile, available = false) => {
      let q = db.from("rides").select("*").order("created_at", { ascending: false }).limit(100);
      if (profile.role !== "admin") q = q.or(`passenger_id.eq.${profile.id},driver_id.eq.${profile.id}${available ? ",status.eq.searching" : ""}`);
      return result(q);
    },
    getRide: id => result(db.from("rides").select("*").eq("id", id).maybeSingle()),
    insertRide: data => result(db.from("rides").insert(data).select().single()),
    updateRide: (id, data, expected) => {
      let q = db.from("rides").update(data).eq("id", id);
      if (expected?.status) q = q.in("status", expected.status);
      if (expected?.unassigned) q = q.is("driver_id", null);
      return result(q.select().maybeSingle());
    },
    addRating: data => result(db.from("ratings").insert(data).select().single())
  };
}
