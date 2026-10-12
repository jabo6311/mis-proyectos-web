import React, { useEffect, useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const initialRegion = {
  latitude: 4.6533,
  longitude: -74.0837,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025
};

const roleLabels = {
  passenger: "Pasajero",
  driver: "Conductor",
  admin: "Admin"
};

const rideLabels = {
  searching: "Buscando conductor",
  accepted: "Conductor en camino",
  in_progress: "Viaje en curso",
  completed: "Viaje completado",
  cancelled: "Viaje cancelado"
};

export default function App() {
  const [role, setRole] = useState("passenger");
  const [ride, setRide] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [driverSubmitted, setDriverSubmitted] = useState(false);
  const [driverApproved, setDriverApproved] = useState(false);
  const [rating, setRating] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!supabase || !ride?.id) {
      setLive(false);
      return undefined;
    }

    const channel = supabase
      .channel(`ride-${ride.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rides",
          filter: `id=eq.${ride.id}`
        },
        ({ new: updatedRide }) => setRide(updatedRide)
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ride?.id]);

  const requestRide = async () => {
    const draft = {
      pickup_address: "Parque de la 93, Bogotá",
      destination_address: "Aeropuerto El Dorado",
      pickup_lat: 4.6767,
      pickup_lng: -74.0486,
      destination_lat: 4.7016,
      destination_lng: -74.1469,
      payment_method: "cash"
    };

    if (apiUrl && supabase) {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert("Inicia sesión", "Configura autenticación para pedir viajes.");
        return;
      }
      try {
        const response = await fetch(`${apiUrl}/api/rides`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify(draft)
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudo pedir el viaje.");
        setRide(body.ride);
      } catch (error) {
        Alert.alert("No se pudo pedir el viaje", error.message);
      }
      return;
    }

    setRide({
      ...draft,
      id: `demo-${Date.now()}`,
      status: "searching",
      estimated_fare: 28500,
      driver_name: null
    });
    setRating(0);
  };

  const acceptRide = async () => {
    if (!ride) return;
    if (apiUrl && supabase && !ride.id.startsWith("demo-")) {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      try {
        const response = await fetch(`${apiUrl}/api/rides/${ride.id}/accept`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudo aceptar.");
        setRide(body.ride);
      } catch (error) {
        Alert.alert("No se pudo aceptar el viaje", error.message);
      }
      return;
    }
    setRide({ ...ride, status: "accepted", driver_name: "Camila R." });
  };

  const advanceRide = () => {
    if (!ride) return;
    const nextStatus = ride.status === "accepted" ? "in_progress" : "completed";
    setRide({ ...ride, status: nextStatus });
  };

  const shareRide = () =>
    Alert.alert(
      "Comparte tu viaje",
      `Código de seguimiento: VAI-${String(ride?.id || "DEMO").slice(-6).toUpperCase()}`
    );

  const sendSos = () =>
    Alert.alert(
      "Alerta SOS",
      "Se notificará a tus contactos de emergencia y al equipo de soporte."
    );

  const driverCanGoOnline = () => {
    if (!driverApproved) {
      Alert.alert(
        "Verificación pendiente",
        "El equipo de Vaialesk debe aprobar tus documentos antes de conectarte."
      );
      return;
    }
    setIsOnline(!isOnline);
  };

  const completeRide = () => {
    if (!ride) return;
    setRide({ ...ride, status: "completed" });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>vaialesk</Text>
          <Text style={styles.brandSub}>MUÉVETE A TU MANERA</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Botón de emergencia"
          style={styles.sosButton}
          onPress={sendSos}
        >
          <Text style={styles.sosText}>SOS</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.roleSwitch}>
        {Object.entries(roleLabels).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.roleButton, role === key && styles.roleButtonActive]}
            onPress={() => setRole(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: role === key }}
          >
            <Text style={[styles.roleText, role === key && styles.roleTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {role === "admin" ? (
        <AdminView
          driverApproved={driverApproved}
          driverSubmitted={driverSubmitted}
          onApprove={() => setDriverApproved(true)}
          ride={ride}
        />
      ) : (
        <>
          <View style={styles.mapWrap}>
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={initialRegion}
              showsUserLocation
              showsMyLocationButton
            >
              <Marker
                coordinate={{ latitude: 4.6767, longitude: -74.0486 }}
                title={ride?.pickup_address || "Tu ubicación"}
                pinColor="#19a777"
              />
              {ride && (
                <>
                  <Marker
                    coordinate={{ latitude: 4.7016, longitude: -74.1469 }}
                    title={ride.destination_address}
                    pinColor="#f07354"
                  />
                  <Polyline
                    coordinates={[
                      { latitude: 4.6767, longitude: -74.0486 },
                      { latitude: 4.681, longitude: -74.073 },
                      { latitude: 4.67, longitude: -74.105 },
                      { latitude: 4.7016, longitude: -74.1469 }
                    ]}
                    strokeColor="#19a777"
                    strokeWidth={4}
                  />
                </>
              )}
            </MapView>
            <View style={styles.mapPill}>
              <View style={styles.liveDot} />
              <Text style={styles.mapPillText}>
                {live ? "EN VIVO" : "BOGOTÁ, CO"}
              </Text>
            </View>
            {role === "driver" && (
              <View style={styles.driverBadge}>
                <Text style={styles.driverBadgeText}>
                  {isOnline ? "● Conectado" : "○ Desconectado"}
                </Text>
              </View>
            )}
          </View>

          {role === "passenger" ? (
            <PassengerView
              ride={ride}
              rating={rating}
              onRate={setRating}
              onRequest={requestRide}
              onShare={shareRide}
            />
          ) : (
            <DriverView
              ride={ride}
              approved={driverApproved}
              submitted={driverSubmitted}
              online={isOnline}
              onToggleOnline={driverCanGoOnline}
              onSubmit={() => setDriverSubmitted(true)}
              onAccept={acceptRide}
              onAdvance={advanceRide}
              onComplete={completeRide}
            />
          )}
        </>
      )}
      <Text style={styles.demoNote}>
        {supabase && apiUrl
          ? "Supabase configurado · autenticación pendiente"
          : "Vista de demostración · conecta Supabase para datos en vivo"}
      </Text>
    </SafeAreaView>
  );
}

function PassengerView({ ride, rating, onRate, onRequest, onShare }) {
  if (ride?.status === "completed") {
    return (
      <View style={styles.sheet}>
        <Text style={styles.eyebrow}>LLEGASTE A TU DESTINO</Text>
        <Text style={styles.sheetTitle}>¿Cómo estuvo tu viaje?</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity key={star} onPress={() => onRate(star)}>
              <Text style={[styles.star, rating >= star && styles.starSelected]}>
                ★
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.muted}>
          {rating ? `Gracias por calificar con ${rating} estrellas` : "Tu opinión nos ayuda"}
        </Text>
        <PrimaryButton label="Pedir otro viaje" onPress={onRequest} />
      </View>
    );
  }

  return (
    <View style={styles.sheet}>
      {ride && (
        <View style={styles.tripStatus}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{rideLabels[ride.status] || ride.status}</Text>
          <Text style={styles.fare}>
            ${Number(ride.estimated_fare || 28500).toLocaleString("es-CO")}
          </Text>
        </View>
      )}
      <Text style={styles.eyebrow}>¿A DÓNDE VAMOS?</Text>
      <Text style={styles.sheetTitle}>Tu próximo destino</Text>
      <View style={styles.locationCard}>
        <View style={styles.locationDots}>
          <View style={styles.pickupDot} />
          <View style={styles.routeDash} />
          <View style={styles.destinationDot} />
        </View>
        <View style={styles.locationNames}>
          <Text style={styles.locationMain}>Parque de la 93</Text>
          <Text style={styles.locationLine}>Bogotá, Colombia</Text>
          <View style={styles.locationDivider} />
          <Text style={styles.locationMain}>Aeropuerto El Dorado</Text>
          <Text style={styles.locationLine}>Terminal de pasajeros</Text>
        </View>
        <Text style={styles.editMark}>⌕</Text>
      </View>
      <View style={styles.tripMeta}>
        <View>
          <Text style={styles.metaLabel}>LLEGADA</Text>
          <Text style={styles.metaValue}>~ 28 min</Text>
        </View>
        <View style={styles.cashBadge}>
          <Text style={styles.cashIcon}>$</Text>
          <Text style={styles.cashText}>Efectivo</Text>
        </View>
        <View style={styles.estimate}>
          <Text style={styles.metaLabel}>ESTIMADO</Text>
          <Text style={styles.metaValue}>$28.500</Text>
        </View>
      </View>
      {ride?.status === "accepted" && (
        <View style={styles.driverCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>CR</Text>
          </View>
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>{ride.driver_name || "Camila R."}</Text>
            <Text style={styles.driverCar}>Kia Picanto · ABC 123</Text>
          </View>
          <Text style={styles.driverRating}>★ 4.9</Text>
        </View>
      )}
      {ride && ride.status !== "completed" && ride.status !== "cancelled" && (
        <TouchableOpacity style={styles.shareButton} onPress={onShare}>
          <Text style={styles.shareButtonText}>↗  Compartir estado de mi viaje</Text>
        </TouchableOpacity>
      )}
      <PrimaryButton
        label={ride?.status === "searching" ? "Buscando conductor..." : "Pedir Vaialesk"}
        onPress={onRequest}
        disabled={ride?.status === "searching" || ride?.status === "accepted"}
      />
      <Text style={styles.helperText}>Pago en efectivo · sin sorpresas</Text>
    </View>
  );
}

function DriverView({
  ride,
  approved,
  submitted,
  online,
  onToggleOnline,
  onSubmit,
  onAccept,
  onAdvance,
  onComplete
}) {
  return (
    <View style={styles.sheet}>
      {!approved ? (
        <>
          <Text style={styles.eyebrow}>TU PRÓXIMO PASO</Text>
          <Text style={styles.sheetTitle}>
            {submitted ? "Verificación en revisión" : "Conduce con Vaialesk"}
          </Text>
          <Text style={styles.bodyCopy}>
            {submitted
              ? "Recibimos tu solicitud. El equipo revisará tu identidad y los documentos del vehículo."
              : "Completa la verificación de identidad y documentos del vehículo para empezar."}
          </Text>
          <View style={styles.checkRow}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkLabel}>Identidad y vehículo</Text>
            <Text style={styles.pending}>{submitted ? "EN REVISIÓN" : "PENDIENTE"}</Text>
          </View>
          {!submitted && (
            <>
              <PrimaryButton label="Enviar documentos" onPress={onSubmit} />
              <Text style={styles.helperText}>Demo: envía una solicitud de aprobación</Text>
            </>
          )}
        </>
      ) : (
        <>
          <View style={styles.earningsHeader}>
            <View>
              <Text style={styles.eyebrow}>GANANCIAS DE HOY</Text>
              <Text style={styles.earnings}>$186.400</Text>
            </View>
            <View style={styles.ridesCount}>
              <Text style={styles.ridesNumber}>8</Text>
              <Text style={styles.ridesLabel}>viajes</Text>
            </View>
          </View>
          {ride?.status === "searching" ? (
            <View style={styles.requestCard}>
              <View style={styles.requestTop}>
                <Text style={styles.newRide}>NUEVA SOLICITUD</Text>
                <Text style={styles.requestTime}>2 min · 4.8 km</Text>
              </View>
              <Text style={styles.requestTitle}>Parque de la 93 → El Dorado</Text>
              <Text style={styles.requestDetail}>Pasajero verificado · Pago en efectivo</Text>
              <Text style={styles.requestFare}>$28.500</Text>
              <PrimaryButton label="Aceptar viaje" onPress={onAccept} />
            </View>
          ) : ride?.status === "accepted" || ride?.status === "in_progress" ? (
            <View style={styles.requestCard}>
              <Text style={styles.newRide}>{rideLabels[ride.status]}</Text>
              <Text style={styles.requestTitle}>{ride.destination_address}</Text>
              <PrimaryButton
                label={ride.status === "accepted" ? "Iniciar navegación" : "Finalizar viaje"}
                onPress={ride.status === "accepted" ? onAdvance : onComplete}
              />
            </View>
          ) : (
            <View style={styles.emptyRequests}>
              <Text style={styles.emptyIcon}>⌁</Text>
              <Text style={styles.emptyTitle}>
                {online ? "Buscando viajes cerca de ti" : "Listo cuando tú lo estés"}
              </Text>
              <Text style={styles.bodyCopy}>
                {online
                  ? "Te avisaremos cuando llegue una solicitud."
                  : "Conéctate para recibir solicitudes de viaje."}
              </Text>
            </View>
          )}
          <PrimaryButton
            label={online ? "Desconectarme" : "Conectarme"}
            onPress={onToggleOnline}
            secondary={online}
          />
        </>
      )}
    </View>
  );
}

function AdminView({ driverApproved, driverSubmitted, onApprove, ride }) {
  return (
    <ScrollView style={styles.adminScroll} contentContainerStyle={styles.adminContent}>
      <Text style={styles.eyebrow}>CENTRO DE CONTROL</Text>
      <Text style={styles.sheetTitle}>Panel de administración</Text>
      <View style={styles.statsRow}>
        <StatCard value="24" label="Viajes hoy" />
        <StatCard value="18" label="Conductores" />
        <StatCard value="3" label="En curso" />
      </View>
      <View style={styles.adminSection}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Conductores por aprobar</Text>
          <Text style={styles.countBadge}>{driverApproved ? "0" : "1"}</Text>
        </View>
        {!driverApproved ? (
          <View style={styles.adminCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>CR</Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>Camila Rodríguez</Text>
              <Text style={styles.driverCar}>
                {driverSubmitted ? "Documentos enviados · hace 12 min" : "Solicitud iniciada · pendiente de documentos"}
              </Text>
            </View>
            <TouchableOpacity style={styles.approveButton} onPress={onApprove}>
              <Text style={styles.approveText}>{driverSubmitted ? "Aprobar" : "Revisar"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.emptyAdmin}>Todo al día. No hay solicitudes pendientes.</Text>
        )}
      </View>
      <View style={styles.adminSection}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Viajes recientes</Text>
          <Text style={styles.viewAll}>Ver todos</Text>
        </View>
        <View style={styles.adminCard}>
          <View style={styles.rideIcon}>
            <Text style={styles.rideIconText}>↗</Text>
          </View>
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>Parque de la 93 → El Dorado</Text>
            <Text style={styles.driverCar}>
              {ride ? rideLabels[ride.status] : "Completado · 10:42 a. m."}
            </Text>
          </View>
          <Text style={styles.adminFare}>$28.500</Text>
        </View>
      </View>
      <View style={styles.supportCard}>
        <Text style={styles.supportIcon}>♡</Text>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>Centro de soporte</Text>
          <Text style={styles.driverCar}>2 conversaciones necesitan atención</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
      <Text style={styles.helperText}>
        Datos de muestra · configura Supabase para operaciones reales
      </Text>
    </ScrollView>
  );
}

function StatCard({ value, label }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, secondary }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.primaryButton,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton
      ]}
    >
      <Text style={[styles.primaryText, secondary && styles.secondaryText]}>{label}</Text>
      {!disabled && !secondary && <Text style={styles.buttonArrow}>→</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7f5" },
  header: {
    paddingHorizontal: 22,
    paddingTop: 7,
    paddingBottom: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  brand: { color: "#123c32", fontSize: 25, fontWeight: "900", letterSpacing: -1.4 },
  brandSub: { color: "#87948e", fontSize: 8, fontWeight: "700", letterSpacing: 1.7 },
  sosButton: {
    backgroundColor: "#fff1ed",
    borderColor: "#f5c8bd",
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 13,
    paddingVertical: 7
  },
  sosText: { color: "#d8543b", fontWeight: "900", fontSize: 11 },
  roleSwitch: {
    marginHorizontal: 20,
    marginBottom: 13,
    backgroundColor: "#e8eeeb",
    borderRadius: 13,
    padding: 4,
    flexDirection: "row"
  },
  roleButton: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  roleButtonActive: { backgroundColor: "#fff", elevation: 2 },
  roleText: { color: "#7c8983", fontSize: 12, fontWeight: "700" },
  roleTextActive: { color: "#153d33" },
  mapWrap: {
    flex: 1,
    marginHorizontal: 15,
    minHeight: 185,
    borderRadius: 21,
    overflow: "hidden",
    backgroundColor: "#e4ece8"
  },
  mapPill: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 7,
    elevation: 2
  },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: "#19a777" },
  mapPillText: { color: "#334c42", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  driverBadge: {
    position: "absolute",
    right: 12,
    top: 12,
    backgroundColor: "#fff",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  driverBadgeText: { color: "#275242", fontSize: 10, fontWeight: "800" },
  sheet: {
    backgroundColor: "#fff",
    marginHorizontal: 15,
    marginTop: 12,
    borderRadius: 23,
    paddingHorizontal: 19,
    paddingTop: 18,
    paddingBottom: 12
  },
  eyebrow: { color: "#84928b", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  sheetTitle: {
    color: "#153d33",
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 4,
    marginBottom: 13
  },
  locationCard: {
    flexDirection: "row",
    backgroundColor: "#f5f8f6",
    borderRadius: 14,
    padding: 11,
    minHeight: 80
  },
  locationDots: { width: 23, alignItems: "center", paddingTop: 5 },
  pickupDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#19a777"
  },
  routeDash: {
    height: 18,
    borderLeftWidth: 1,
    borderStyle: "dashed",
    borderColor: "#aab9b1"
  },
  destinationDot: { width: 8, height: 8, backgroundColor: "#f07354", borderRadius: 2 },
  locationNames: { flex: 1 },
  locationMain: { color: "#253c33", fontSize: 11, fontWeight: "800" },
  locationLine: { color: "#8a9690", fontSize: 9, marginTop: 2 },
  locationDivider: { height: 1, backgroundColor: "#e6ece8", marginVertical: 6 },
  editMark: { color: "#819087", fontSize: 20, paddingHorizontal: 5 },
  tripMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12
  },
  metaLabel: { color: "#98a39d", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  metaValue: { color: "#29473b", fontSize: 11, fontWeight: "800", marginTop: 3 },
  cashBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f2f7f3",
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    gap: 5
  },
  cashIcon: { color: "#16815e", fontSize: 12, fontWeight: "900" },
  cashText: { color: "#426253", fontSize: 10, fontWeight: "700" },
  estimate: { alignItems: "flex-end" },
  primaryButton: {
    backgroundColor: "#1a7758",
    minHeight: 46,
    borderRadius: 13,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 3
  },
  primaryText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  buttonArrow: { position: "absolute", right: 16, color: "#fff", fontSize: 17 },
  secondaryButton: { backgroundColor: "#ecf3ef", marginTop: 9 },
  secondaryText: { color: "#30614c" },
  disabledButton: { backgroundColor: "#a8bdb2" },
  helperText: { color: "#9ba59f", fontSize: 9, textAlign: "center", marginTop: 8 },
  demoNote: {
    color: "#a1aaa5",
    fontSize: 9,
    textAlign: "center",
    paddingVertical: 7
  },
  bodyCopy: { color: "#829088", fontSize: 11, lineHeight: 17, marginBottom: 12 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#eff2f0"
  },
  checkIcon: { color: "#2c9c75", fontSize: 15, fontWeight: "900", width: 25 },
  checkLabel: { flex: 1, color: "#3d5148", fontSize: 11, fontWeight: "700" },
  pending: { color: "#c48736", fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  earningsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12
  },
  earnings: { color: "#1c4939", fontSize: 25, fontWeight: "900", marginTop: 4 },
  ridesCount: {
    alignItems: "center",
    backgroundColor: "#f0f6f2",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 15
  },
  ridesNumber: { color: "#327958", fontSize: 16, fontWeight: "900" },
  ridesLabel: { color: "#829188", fontSize: 9 },
  requestCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9e9df",
    backgroundColor: "#f8fbf8",
    padding: 12,
    marginBottom: 8
  },
  requestTop: { flexDirection: "row", justifyContent: "space-between" },
  newRide: { color: "#1e8a63", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  requestTime: { color: "#718078", fontSize: 9, fontWeight: "700" },
  requestTitle: { color: "#244336", fontSize: 12, fontWeight: "800", marginTop: 7 },
  requestDetail: { color: "#88958e", fontSize: 9, marginTop: 4 },
  requestFare: { color: "#27543e", fontSize: 19, fontWeight: "900", marginVertical: 8 },
  emptyRequests: { alignItems: "center", paddingVertical: 15 },
  emptyIcon: { color: "#82a891", fontSize: 26 },
  emptyTitle: { color: "#325142", fontSize: 12, fontWeight: "800", marginTop: 5 },
  tripStatus: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f7f3",
    borderRadius: 10,
    padding: 9,
    marginBottom: 13
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#1ca777" },
  statusText: { color: "#2e6248", fontSize: 10, fontWeight: "800", flex: 1, marginLeft: 7 },
  fare: { color: "#315b45", fontSize: 11, fontWeight: "900" },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#edf1ee",
    paddingVertical: 10
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#dcece2",
    justifyContent: "center",
    alignItems: "center"
  },
  avatarText: { color: "#347153", fontSize: 10, fontWeight: "900" },
  driverInfo: { flex: 1, marginLeft: 9 },
  driverName: { color: "#33483d", fontSize: 10, fontWeight: "800" },
  driverCar: { color: "#89958f", fontSize: 9, marginTop: 3 },
  driverRating: { color: "#b98633", fontSize: 10, fontWeight: "900" },
  shareButton: { alignItems: "center", paddingVertical: 10 },
  shareButtonText: { color: "#317958", fontSize: 10, fontWeight: "800" },
  stars: { flexDirection: "row", justifyContent: "center", gap: 11, marginVertical: 6 },
  star: { color: "#d8e0da", fontSize: 29 },
  starSelected: { color: "#f0b83e" },
  muted: { color: "#8d9992", fontSize: 10, textAlign: "center", marginBottom: 12 },
  adminScroll: { flex: 1 },
  adminContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 19 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 13,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e8eeea"
  },
  statValue: { color: "#24533d", fontSize: 20, fontWeight: "900" },
  statLabel: { color: "#859189", fontSize: 8, marginTop: 3 },
  adminSection: { marginBottom: 18 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
    gap: 7
  },
  sectionTitle: { color: "#30473b", fontSize: 12, fontWeight: "900", flex: 1 },
  countBadge: {
    overflow: "hidden",
    backgroundColor: "#fff1ec",
    color: "#d66d4f",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 9,
    fontWeight: "900"
  },
  adminCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e8eeea"
  },
  approveButton: { backgroundColor: "#eaf4ed", borderRadius: 8, padding: 8 },
  approveText: { color: "#2a7753", fontSize: 9, fontWeight: "900" },
  emptyAdmin: { color: "#89958f", fontSize: 10, paddingVertical: 8 },
  viewAll: { color: "#27805b", fontSize: 9, fontWeight: "800" },
  rideIcon: {
    width: 33,
    height: 33,
    backgroundColor: "#eff6f1",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  rideIconText: { color: "#40845d", fontSize: 18 },
  adminFare: { color: "#376048", fontSize: 10, fontWeight: "900" },
  supportCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e8eeea"
  },
  supportIcon: { color: "#e27a67", fontSize: 20 },
  chevron: { color: "#9ba69f", fontSize: 21 }
});
