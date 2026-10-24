async function result(query) { const { data, error } = await query; if (error) throw error; return data; }
export function createRepository(db) {
  return {
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
