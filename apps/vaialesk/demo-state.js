import { ACTIVE_STATUSES, makeRide } from "./ride-utils";
export const initialDemoState = () => ({ version: 1, role: "passenger", driver: {
  id: "demo-driver", full_name: "Andrés", vehicle: "Toyota Corolla blanco", plate: "VAI 123", driver_status: "pending", online: false
}, rides: [], driverLocation: null });
export function demoReducer(state, action) {
  const current = state.rides.find(r => ACTIVE_STATUSES.includes(r.status));
  const update = (id, change) => ({ ...state, rides: state.rides.map(r => r.id === id ? { ...r, ...change, updated_at: new Date().toISOString() } : r) });
  switch (action.type) {
    case "ROLE":
      if (!["passenger", "driver", "admin"].includes(action.role)) throw new Error("Modo inválido.");
      return { ...state, role: action.role };
    case "DRIVER":
      if (!action.driver.full_name?.trim() || !action.driver.vehicle?.trim() || !action.driver.plate?.trim()) throw new Error("Completa nombre, vehículo y placa.");
      return { ...state, driver: { ...state.driver, ...action.driver, driver_status: "pending", online: false } };
    case "REVIEW":
      if (state.role !== "admin") throw new Error("Solo administración puede aprobar conductores.");
      return { ...state, driver: { ...state.driver, driver_status: action.approved ? "approved" : "rejected", online: false } };
    case "ONLINE":
      if (state.role !== "driver" || state.driver.driver_status !== "approved") throw new Error("Primero aprueba al conductor desde Administración.");
      return { ...state, driver: { ...state.driver, online: action.online } };
    case "REQUEST":
      if (state.role !== "passenger") throw new Error("Pide el viaje desde Pasajero.");
      if (current) throw new Error("Ya tienes un viaje activo.");
      return { ...state, rides: [makeRide(action.draft, action.id), ...state.rides] };
    case "ACCEPT":
      if (state.role !== "driver" || !state.driver.online || state.driver.driver_status !== "approved") throw new Error("Debes estar aprobado y conectado para aceptar.");
      if (!current || current.status !== "searching" || current.id !== action.id) throw new Error("Este viaje ya no está disponible.");
      return { ...update(action.id, { status: "accepted", driver_id: state.driver.id, driver_name: state.driver.full_name, vehicle: state.driver.vehicle, plate: state.driver.plate }), driverLocation: { latitude: current.pickup_lat + 0.004, longitude: current.pickup_lng + 0.004 } };
    case "STATUS": {
      const ride = state.rides.find(r => r.id === action.id);
      const allowed = { in_progress: ["accepted"], completed: ["in_progress"], cancelled: ACTIVE_STATUSES };
      if (!ride || !allowed[action.status]?.includes(ride.status)) throw new Error("El viaje cambió. Actualiza e intenta otra vez.");
      if (action.status !== "cancelled" && state.role !== "driver") throw new Error("El conductor debe avanzar el viaje.");
      return update(action.id, { status: action.status });
    }
    case "LOCATION":
      if (state.role !== "driver" || !current?.driver_id) throw new Error("Acepta un viaje antes de simular la ubicación.");
      return { ...state, driverLocation: action.point };
    case "RATING":
      if (state.role !== "passenger" || !Number.isInteger(action.score) || action.score < 1 || action.score > 5) throw new Error("Selecciona una calificación de 1 a 5.");
      if (!state.rides.some(r => r.id === action.id && r.status === "completed")) throw new Error("Solo puedes calificar viajes finalizados.");
      return update(action.id, { rating: action.score });
    case "RESET": return initialDemoState();
    default: return state;
  }
}
