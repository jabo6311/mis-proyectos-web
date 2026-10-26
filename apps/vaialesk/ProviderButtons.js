import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { PROVIDERS } from './auth-flow.cjs';
export default function ProviderButtons({ auth }) {
  return <View style={{ gap: 10 }}>
    {PROVIDERS.map(provider => {
      const enabled = auth.configured && !auth.loading && auth.providers[provider.id] === true;
      return <TouchableOpacity key={provider.id} accessibilityRole="button" accessibilityState={{ disabled: !enabled || auth.busy || auth.checkingProviders }} disabled={!enabled || auth.busy || auth.checkingProviders} onPress={() => auth.signIn(provider.id)} style={{ padding: 17, borderRadius: 16, borderWidth: 1, borderColor: '#cad8cc', backgroundColor: enabled ? '#197652' : '#e7ece5', alignItems: 'center', opacity: auth.busy ? 0.7 : 1 }}>
        <Text style={{ color: enabled ? 'white' : '#526958', fontWeight: '700', fontSize: 15 }}>Continuar con {provider.name}</Text>
        {!enabled && <Text style={{ color: '#526958', fontSize: 12, marginTop: 5 }}>{auth.checkingProviders ? 'Comprobando disponibilidad…' : 'Pendiente de configuración'}</Text>}
      </TouchableOpacity>;
    })}
    {auth.busy && <Text accessibilityLiveRegion="polite" style={{ color: '#526958' }}>Completa el acceso en el navegador…</Text>}
    <TouchableOpacity accessibilityRole="button" disabled={auth.busy || auth.checkingProviders} onPress={auth.refreshProviders} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: '#197652', fontWeight: '600' }}>Actualizar opciones de acceso</Text></TouchableOpacity>
    {!auth.configured && <Text style={{ color: '#6d806e', fontSize: 12 }}>El acceso con cuentas todavía no está configurado en esta instalación. La presentación está disponible.</Text>}
  </View>;
}
