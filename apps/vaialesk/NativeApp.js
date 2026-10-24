import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Auth0Provider, useAuth0 } from "react-native-auth0";
import { createClient } from "@supabase/supabase-js";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { requestApi } from "./api-request";

const auth0Domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
const auth0ClientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
const auth0Audience = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
const googleConnection =
  process.env.EXPO_PUBLIC_AUTH0_GOOGLE_CONNECTION || "google-oauth2";
const microsoftConnection =
  process.env.EXPO_PUBLIC_AUTH0_MICROSOFT_CONNECTION || "windowslive";
const customScheme = "vaialesk";
const canRenderMap = Platform.OS !== "android" ||
  Constants.expoConfig?.extra?.androidMapsConfigured === true;

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
  return (
    <SafeAreaProvider>
      {!auth0Domain || !auth0ClientId || !auth0Audience || !apiUrl ? (
        <ConfigurationScreen />
      ) : (
        <Auth0Provider
          domain={auth0Domain}
          clientId={auth0ClientId}
          useDPoP={false}
        >
          <AuthenticatedApp />
        </Auth0Provider>
      )}
    </SafeAreaProvider>
  );
}

function AuthenticatedApp() {
  const { authorize, clearSession, getCredentials, isLoading, user } = useAuth0();
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [role, setRole] = useState("passenger");
  const [ride, setRide] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [availableRides, setAvailableRides] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [adminRides, setAdminRides] = useState([]);
  const [rating, setRating] = useState(0);
  const [live, setLive] = useState(false);
  const supabase = useMemo(() => {
    if (!user || !supabaseUrl || !supabaseKey) return null;
    return createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => {
        const credentials = await getCredentials();
        return credentials.idToken;
      }
    });
  }, [getCredentials, user?.sub]);

  const apiRequest = useCallback(
    async (path, options = {}) => {
      if (!apiUrl || !auth0Audience) {
        throw new Error("Configura la URL del API y el audience de Auth0.");
      }
      return requestApi({ apiUrl, path, getCredentials, options });
    },
    [getCredentials]
  );

  const refreshProfile = useCallback(async () => {
    const result = await apiRequest("/api/me");
    setProfile(result.profile);
    setRole(result.profile.role === "admin" ? "admin" : result.profile.role);
    return result.profile;
  }, [apiRequest]);

  const retryProfile = async () => {
    setProfileLoading(true);
    setProfileError("");
    try {
      await refreshProfile();
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setRide(null);
      setProfileError("");
      return undefined;
    }
    let mounted = true;
    setProfileLoading(true);
    setProfileError("");
    apiRequest("/api/me")
      .then(({ profile: currentProfile }) => {
        if (!mounted) return;
        setProfile(currentProfile);
        setRole(currentProfile.role === "admin" ? "admin" : currentProfile.role);
      })
      .catch((error) => {
        if (mounted) setProfileError(error.message);
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [apiRequest, user?.sub]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    let active = true;
    apiRequest("/api/rides/current")
      .then(({ ride: currentRide }) => {
        if (active) setRide(currentRide);
      })
      .catch((error) => {
        if (active) Alert.alert("No se pudo cargar el viaje", error.message);
      });
    return () => {
      active = false;
    };
  }, [apiRequest, profile?.id]);

  useEffect(() => {
    if (profile?.role !== "driver" || profile.driver_status === "approved") {
      return undefined;
    }
    let active = true;
    const refreshDriverStatus = async () => {
      try {
        const result = await apiRequest("/api/me");
        if (active) setProfile(result.profile);
      } catch (error) {
        if (active) console.error("No se pudo actualizar la verificación:", error);
      }
    };
    const polling = setInterval(refreshDriverStatus, 10000);
    return () => {
      active = false;
      clearInterval(polling);
    };
  }, [apiRequest, profile?.driver_status, profile?.role]);

  useEffect(() => {
    if (!ride?.id) {
      setLive(false);
      return undefined;
    }

    let active = true;
    const refreshRide = async () => {
      try {
        const result = await apiRequest(`/api/rides/${ride.id}`);
        if (active) setRide(result.ride);
      } catch (error) {
        if (active) console.error("No se pudo actualizar el viaje:", error);
      }
    };
    const polling = setInterval(refreshRide, 5000);
    const channel = supabase
      ?.channel(`ride-${ride.id}`)
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
      active = false;
      clearInterval(polling);
      if (channel) supabase.removeChannel(channel);
    };
  }, [apiRequest, ride?.id, supabase]);

  useEffect(() => {
    if (
      role !== "driver" ||
      profile?.driver_status !== "approved" ||
      !isOnline ||
      ride?.id
    ) {
      setAvailableRides([]);
      return undefined;
    }
    let active = true;
    const loadAvailableRides = async () => {
      try {
        const result = await apiRequest("/api/rides/available");
        if (active) setAvailableRides(result.rides);
      } catch (error) {
        if (active) console.error("No se pudieron cargar los viajes:", error);
      }
    };
    loadAvailableRides();
    const polling = setInterval(loadAvailableRides, 5000);
    return () => {
      active = false;
      clearInterval(polling);
    };
  }, [apiRequest, isOnline, profile?.driver_status, role, ride?.id]);

  useEffect(() => {
    if (role !== "admin") {
      setPendingDrivers([]);
      setAdminRides([]);
      return undefined;
    }
    let active = true;
    const refreshAdminData = async () => {
      try {
        const [driversResult, ridesResult] = await Promise.all([
          apiRequest("/api/admin/drivers/pending"),
          apiRequest("/api/admin/rides")
        ]);
        if (!active) return;
        setPendingDrivers(driversResult.drivers);
        setAdminRides(ridesResult.rides);
      } catch (error) {
        if (active) console.error("No se pudo actualizar el panel:", error);
      }
    };
    refreshAdminData();
    const polling = setInterval(refreshAdminData, 10000);
    return () => {
      active = false;
      clearInterval(polling);
    };
  }, [apiRequest, role]);

  const signIn = async (connection) => {
    try {
      await authorize(
        {
          audience: auth0Audience,
          scope: "openid profile email offline_access",
          connection
        },
        { customScheme }
      );
    } catch (error) {
      if (error.code !== "a0.session_cancelled") {
        Alert.alert("No se pudo iniciar sesión", error.message);
      }
    }
  };

  const signOut = async () => {
    try {
      await clearSession({}, { customScheme });
      setProfile(null);
      setRole("passenger");
      setRide(null);
    } catch (error) {
      Alert.alert("No se pudo cerrar sesión", error.message);
    }
  };

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

    try {
      const result = await apiRequest("/api/rides", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setRide(result.ride);
      setRating(0);
    } catch (error) {
      Alert.alert("No se pudo pedir el viaje", error.message);
    }
  };

  const acceptRide = async (rideToAccept = ride) => {
    if (!rideToAccept) return;
    try {
      const result = await apiRequest(`/api/rides/${rideToAccept.id}/accept`, {
        method: "POST"
      });
      setRide(result.ride);
      setAvailableRides([]);
    } catch (error) {
      Alert.alert("No se pudo aceptar el viaje", error.message);
    }
  };

  const updateRideStatus = async (status) => {
    if (!ride) return;
    try {
      const result = await apiRequest(`/api/rides/${ride.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setRide(result.ride);
    } catch (error) {
      Alert.alert("No se pudo actualizar el viaje", error.message);
    }
  };

  const applyAsDriver = async () => {
    try {
      const result = await apiRequest("/api/drivers/application", {
        method: "POST"
      });
      setProfile(result.profile);
      setRole("driver");
    } catch (error) {
      Alert.alert("No se pudo enviar la solicitud", error.message);
    }
  };

  const approveDriver = async (driverId) => {
    try {
      await apiRequest(`/api/admin/drivers/${driverId}/approval`, {
        method: "PATCH",
        body: JSON.stringify({ approved: true })
      });
      const [driversResult, ridesResult] = await Promise.all([
        apiRequest("/api/admin/drivers/pending"),
        apiRequest("/api/admin/rides")
      ]);
      setPendingDrivers(driversResult.drivers);
      setAdminRides(ridesResult.rides);
    } catch (error) {
      Alert.alert("No se pudo aprobar al conductor", error.message);
    }
  };

  const submitRating = async (score) => {
    if (!ride) return;
    try {
      await apiRequest(`/api/rides/${ride.id}/rating`, {
        method: "POST",
        body: JSON.stringify({ score })
      });
      setRating(score);
    } catch (error) {
      Alert.alert("No se pudo guardar la calificación", error.message);
    }
  };

  const shareRide = () =>
    Alert.alert(
      "Comparte tu viaje",
      `Código de seguimiento: VAI-${String(ride?.id || "VIAJE").slice(-6).toUpperCase()}`
    );

  const sendSos = () =>
    Alert.alert(
      "Alerta SOS",
      "La alerta SOS aún no está conectada a un servicio de emergencia."
    );

  const driverCanGoOnline = () => {
    if (profile?.driver_status !== "approved") {
      Alert.alert(
        "Verificación pendiente",
        "El equipo de Vaialesk debe aprobar tus documentos antes de conectarte."
      );
      return;
    }
    setIsOnline(!isOnline);
  };

  if (isLoading || (user && (profileLoading || (!profile && !profileError)))) {
    return <LoadingScreen />;
  }
  if (!user) {
    return <LoginScreen onSignIn={signIn} />;
  }
  if (profileError) {
    return (
      <ErrorScreen
        message={profileError}
        onRetry={retryProfile}
        onSignOut={signOut}
      />
    );
  }

  const driverApproved = profile?.driver_status === "approved";
  const driverSubmitted = profile?.role === "driver" && !driverApproved;
  const primaryAvailableRide = availableRides[0] || null;

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>vaialesk</Text>
          <Text style={styles.brandSub}>MUÉVETE A TU MANERA</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Botón de emergencia"
            style={styles.sosButton}
            onPress={sendSos}
          >
            <Text style={styles.sosText}>SOS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            style={styles.profileButton}
            onPress={signOut}
          >
            <Text style={styles.profileButtonText}>
              {(profile?.full_name || user.name || "U").slice(0, 1).toUpperCase()} · Salir
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {profile?.role === "passenger" ? (
        <View style={styles.roleSwitch}>
          <Text style={[styles.roleButton, styles.roleButtonActive, styles.roleTextActive]}>
            Pasajero
          </Text>
          <TouchableOpacity
            style={styles.roleButton}
            onPress={applyAsDriver}
            accessibilityRole="button"
          >
            <Text style={styles.roleText}>Quiero conducir</Text>
          </TouchableOpacity>
        </View>
      ) : profile?.role === "driver" ? (
        <View style={styles.roleSwitch}>
          <Text style={[styles.roleButton, styles.roleButtonActive, styles.roleTextActive]}>
            {roleLabels.driver}
          </Text>
        </View>
      ) : (
        <View style={[styles.roleSwitch, styles.adminMode]}>
          <Text style={[styles.roleButton, styles.roleButtonActive, styles.roleTextActive]}>
            {roleLabels[profile.role] || "Admin"}
          </Text>
        </View>
      )}

      {role === "admin" ? (
        <AdminView
          pendingDrivers={pendingDrivers}
          rides={adminRides}
          onApprove={approveDriver}
        />
      ) : (
        <>
          <View style={styles.mapWrap}>
            {canRenderMap ? <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={initialRegion}
              showsUserLocation
              showsMyLocationButton
            >
              <Marker
                coordinate={{ latitude: ride?.pickup_lat || 4.6767, longitude: ride?.pickup_lng || -74.0486 }}
                title={ride?.pickup_address || "Tu ubicación"}
                pinColor="#19a777"
              />
              {ride && (
                <>
                  <Marker
                    coordinate={{ latitude: ride.destination_lat, longitude: ride.destination_lng }}
                    title={ride.destination_address}
                    pinColor="#f07354"
                  />
                  <Polyline
                    coordinates={[
                      { latitude: ride.pickup_lat, longitude: ride.pickup_lng },
                      { latitude: 4.681, longitude: -74.073 },
                      { latitude: 4.67, longitude: -74.105 },
                      { latitude: ride.destination_lat, longitude: ride.destination_lng }
                    ]}
                    strokeColor="#19a777"
                    strokeWidth={4}
                  />
                </>
              )}
            </MapView> : (
              <View style={styles.authScreen}>
                <Text style={styles.loginTitle}>Mapa no configurado</Text>
                <Text style={styles.authSubtitle}>
                  Puedes probar tu cuenta y los viajes. Para mostrar el mapa,
                  configura Google Maps y reinstala el APK actualizado.
                </Text>
              </View>
            )}
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
              onRate={submitRating}
              onRequest={requestRide}
              onShare={shareRide}
            />
          ) : (
            <DriverView
              ride={ride}
              availableRide={primaryAvailableRide}
              approved={driverApproved}
              submitted={driverSubmitted}
              online={isOnline}
              onToggleOnline={driverCanGoOnline}
              onAccept={acceptRide}
              onAdvance={() => updateRideStatus("in_progress")}
              onComplete={() => updateRideStatus("completed")}
            />
          )}
        </>
      )}
      <Text style={styles.demoNote}>
        {supabase
          ? "Conectado a Auth0 · seguimiento en tiempo real"
          : "Conectado a Auth0 · seguimiento con actualización periódica"}
      </Text>
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.authScreen}>
      <ActivityIndicator size="large" color="#1a7758" />
      <Text style={styles.authSubtitle}>Cargando tu cuenta...</Text>
    </SafeAreaView>
  );
}

function LoginScreen({ onSignIn }) {
  return (
    <SafeAreaView style={styles.authScreen}>
      <ExpoStatusBar style="dark" />
      <View style={styles.loginCard}>
        <Text style={styles.brand}>vaialesk</Text>
        <Text style={styles.brandSub}>MUÉVETE A TU MANERA</Text>
        <Text style={styles.loginTitle}>Tu ciudad, más cerca.</Text>
        <Text style={styles.authSubtitle}>
          Inicia sesión de forma segura para pedir o conducir un viaje.
        </Text>
        <PrimaryButton
          label="Continuar con Google"
          onPress={() => onSignIn(googleConnection)}
        />
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.microsoftButton}
          onPress={() => onSignIn(microsoftConnection)}
        >
          <Text style={styles.microsoftButtonText}>Continuar con Microsoft</Text>
        </TouchableOpacity>
        <Text style={styles.loginFootnote}>
          Inicio de sesión seguro con Auth0 · Pago en efectivo
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ConfigurationScreen() {
  return (
    <SafeAreaView style={styles.authScreen}>
      <View style={styles.loginCard}>
        <Text style={styles.brand}>vaialesk</Text>
        <Text style={styles.loginTitle}>Configura Auth0</Text>
        <Text style={styles.authSubtitle}>
          Configura el dominio, Client ID, audience de Auth0 y la URL del API en
          apps/vaialesk/.env. Después crea un development build: Expo Go no
          admite este SDK de autenticación.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ErrorScreen({ message, onRetry, onSignOut }) {
  return (
    <SafeAreaView style={styles.authScreen}>
      <View style={styles.loginCard}>
        <Text style={styles.loginTitle}>No pudimos cargar tu perfil</Text>
        <Text style={styles.authSubtitle}>{message}</Text>
        <PrimaryButton label="Reintentar" onPress={onRetry} />
        <TouchableOpacity style={styles.microsoftButton} onPress={onSignOut}>
          <Text style={styles.microsoftButtonText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
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
  availableRide,
  approved,
  submitted,
  online,
  onToggleOnline,
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
            <Text style={styles.helperText}>
              Solicitud registrada · soporte te indicará cómo verificar tus documentos
            </Text>
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
          {ride?.status === "accepted" || ride?.status === "in_progress" ? (
            <View style={styles.requestCard}>
              <Text style={styles.newRide}>{rideLabels[ride.status]}</Text>
              <Text style={styles.requestTitle}>{ride.destination_address}</Text>
              <PrimaryButton
                label={ride.status === "accepted" ? "Iniciar navegación" : "Finalizar viaje"}
                onPress={ride.status === "accepted" ? onAdvance : onComplete}
              />
            </View>
          ) : online && availableRide ? (
            <View style={styles.requestCard}>
              <View style={styles.requestTop}>
                <Text style={styles.newRide}>NUEVA SOLICITUD</Text>
                <Text style={styles.requestTime}>Pago en efectivo</Text>
              </View>
              <Text style={styles.requestTitle}>
                {availableRide.pickup_address} → {availableRide.destination_address}
              </Text>
              <Text style={styles.requestDetail}>Solicitud verificada · Pago en efectivo</Text>
              <Text style={styles.requestFare}>
                ${Number(availableRide.estimated_fare || 0).toLocaleString("es-CO")}
              </Text>
              <PrimaryButton label="Aceptar viaje" onPress={() => onAccept(availableRide)} />
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

function AdminView({ pendingDrivers, rides, onApprove }) {
  const activeRides = rides.filter((ride) =>
    ["searching", "accepted", "in_progress"].includes(ride.status)
  ).length;
  return (
    <ScrollView style={styles.adminScroll} contentContainerStyle={styles.adminContent}>
      <Text style={styles.eyebrow}>CENTRO DE CONTROL</Text>
      <Text style={styles.sheetTitle}>Panel de administración</Text>
      <View style={styles.statsRow}>
        <StatCard value={String(rides.length)} label="Viajes recientes" />
        <StatCard value={String(pendingDrivers.length)} label="Por aprobar" />
        <StatCard value={String(activeRides)} label="En curso" />
      </View>
      <View style={styles.adminSection}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Conductores por aprobar</Text>
          <Text style={styles.countBadge}>{pendingDrivers.length}</Text>
        </View>
        {pendingDrivers.length ? pendingDrivers.map((driver) => (
          <View key={driver.id} style={[styles.adminCard, styles.adminCardSpaced]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(driver.full_name || "C").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{driver.full_name || "Conductor"}</Text>
              <Text style={styles.driverCar}>Solicitud de conductor pendiente</Text>
            </View>
            <TouchableOpacity
              style={styles.approveButton}
              onPress={() => onApprove(driver.id)}
              accessibilityRole="button"
            >
              <Text style={styles.approveText}>Aprobar</Text>
            </TouchableOpacity>
          </View>
        )) : (
          <Text style={styles.emptyAdmin}>Todo al día. No hay solicitudes pendientes.</Text>
        )}
      </View>
      <View style={styles.adminSection}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Viajes recientes</Text>
          <Text style={styles.viewAll}>Ver todos</Text>
        </View>
        {rides.slice(0, 5).map((ride) => (
          <View key={ride.id} style={[styles.adminCard, styles.adminCardSpaced]}>
            <View style={styles.rideIcon}>
              <Text style={styles.rideIconText}>↗</Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>
                {ride.pickup_address} → {ride.destination_address}
              </Text>
              <Text style={styles.driverCar}>{rideLabels[ride.status] || ride.status}</Text>
            </View>
            <Text style={styles.adminFare}>
              ${Number(ride.estimated_fare || 0).toLocaleString("es-CO")}
            </Text>
          </View>
        ))}
        {!rides.length && <Text style={styles.emptyAdmin}>Aún no hay viajes.</Text>}
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
        El acceso administrativo lo asigna un administrador del sistema.
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
  authScreen: {
    flex: 1,
    justifyContent: "center",
    padding: 25,
    backgroundColor: "#f5f7f5"
  },
  loginCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#e8eeea"
  },
  loginTitle: {
    color: "#153d33",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 32,
    marginBottom: 8
  },
  authSubtitle: {
    color: "#829088",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 19
  },
  microsoftButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#dce5df",
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10
  },
  microsoftButtonText: { color: "#2e4e3d", fontSize: 12, fontWeight: "800" },
  loginFootnote: {
    color: "#9ba59f",
    fontSize: 9,
    textAlign: "center",
    marginTop: 19
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 7,
    paddingBottom: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  profileButton: {
    backgroundColor: "#edf3ef",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  profileButtonText: { color: "#315842", fontSize: 9, fontWeight: "800" },
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
  adminMode: { justifyContent: "center" },
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
  adminCardSpaced: { marginBottom: 7 },
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

