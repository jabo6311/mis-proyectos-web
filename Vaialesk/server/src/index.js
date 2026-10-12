import "dotenv/config";
import cors from "cors";
import express from "express";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

const app = express();
const port = Number(process.env.PORT || 3000);
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

app.use(cors());
app.use(express.json({ limit: "32kb" }));

async function requireUser(req, res, next) {
  const authorization = req.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  if (!token) return res.status(401).json({ error: "Se requiere una sesión." });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Sesión inválida o vencida." });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, driver_status")
    .eq("id", data.user.id)
    .single();
  if (profileError) return res.status(403).json({ error: "No se encontró el perfil." });

  req.user = data.user;
  req.profile = profile;
  next();
}

function requireAdmin(req, res, next) {
  if (req.profile.role !== "admin") {
    return res.status(403).json({ error: "Se requiere el rol de administrador." });
  }
  next();
}

function respondWithError(res, error) {
  console.error(error);
  return res.status(500).json({ error: "No se pudo completar la operación." });
}

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/rides", requireUser, async (req, res) => {
  const {
    pickup_address,
    destination_address,
    pickup_lat,
    pickup_lng,
    destination_lat,
    destination_lng,
    payment_method
  } = req.body || {};
  const coordinates = [pickup_lat, pickup_lng, destination_lat, destination_lng];
  if (
    req.profile.role !== "passenger" ||
    !pickup_address ||
    !destination_address ||
    coordinates.some((value) => typeof value !== "number" || !Number.isFinite(value)) ||
    payment_method !== "cash"
  ) {
    return res.status(400).json({ error: "Datos de viaje inválidos. Solo se acepta efectivo." });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("rides")
      .insert({
        passenger_id: req.user.id,
        pickup_address,
        destination_address,
        pickup_lat,
        pickup_lng,
        destination_lat,
        destination_lng,
        payment_method,
        status: "searching"
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json({ ride: data });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.get("/api/rides/available", requireUser, async (req, res) => {
  if (req.profile.role !== "driver" || req.profile.driver_status !== "approved") {
    return res.status(403).json({ error: "Se requiere un conductor aprobado." });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("rides")
      .select("*")
      .eq("status", "searching")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return res.json({ rides: data });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.post("/api/rides/:id/accept", requireUser, async (req, res) => {
  if (req.profile.role !== "driver" || req.profile.driver_status !== "approved") {
    return res.status(403).json({ error: "Se requiere un conductor aprobado." });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("rides")
      .update({ driver_id: req.user.id, status: "accepted" })
      .eq("id", req.params.id)
      .eq("status", "searching")
      .is("driver_id", null)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: "Este viaje ya fue asignado." });
    return res.json({ ride: data });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.patch("/api/rides/:id/status", requireUser, async (req, res) => {
  const { status } = req.body || {};
  const previousStatuses = {
    in_progress: ["accepted"],
    completed: ["in_progress"],
    cancelled: ["accepted", "in_progress"]
  };
  if (!["in_progress", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Estado de viaje inválido." });
  }
  try {
    let query = supabaseAdmin
      .from("rides")
      .update({ status })
      .eq("id", req.params.id)
      .in("status", previousStatuses[status]);

    if (req.profile.role === "driver") {
      if (req.profile.driver_status !== "approved") {
        return res.status(403).json({ error: "Se requiere un conductor aprobado." });
      }
      query = query.eq("driver_id", req.user.id);
    } else if (req.profile.role === "passenger" && status === "cancelled") {
      query = query.eq("passenger_id", req.user.id);
    } else {
      return res.status(403).json({ error: "No puedes cambiar el estado de este viaje." });
    }

    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: "La transición no es válida o el viaje cambió." });
    return res.json({ ride: data });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.post("/api/rides/:id/rating", requireUser, async (req, res) => {
  const { score, comment = "" } = req.body || {};
  if (req.profile.role !== "passenger" || !Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: "La calificación debe ser de 1 a 5 estrellas." });
  }
  try {
    const { data: ride, error: rideError } = await supabaseAdmin
      .from("rides")
      .select("id, passenger_id, driver_id, status")
      .eq("id", req.params.id)
      .eq("passenger_id", req.user.id)
      .eq("status", "completed")
      .single();
    if (rideError) throw rideError;

    const { data, error } = await supabaseAdmin
      .from("ratings")
      .insert({
        ride_id: ride.id,
        passenger_id: ride.passenger_id,
        driver_id: ride.driver_id,
        score,
        comment
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json({ rating: data });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.get("/api/admin/rides", requireUser, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("rides")
      .select("*, passenger:profiles!rides_passenger_id_fkey(full_name), driver:profiles!rides_driver_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return res.json({ rides: data });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.get("/api/admin/drivers/pending", requireUser, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, driver_status, created_at")
      .eq("role", "driver")
      .eq("driver_status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return res.json({ drivers: data });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.patch("/api/admin/drivers/:id/approval", requireUser, requireAdmin, async (req, res) => {
  const { approved } = req.body || {};
  if (typeof approved !== "boolean") {
    return res.status(400).json({ error: "Indica si se aprueba o rechaza al conductor." });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ driver_status: approved ? "approved" : "rejected" })
      .eq("id", req.params.id)
      .eq("role", "driver")
      .select("id, full_name, driver_status")
      .single();
    if (error) throw error;
    return res.json({ driver: data });
  } catch (error) {
    return respondWithError(res, error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  return res.status(400).json({ error: "Solicitud inválida." });
});

app.listen(port, () => console.log(`Vaialesk API listening on port ${port}`));
