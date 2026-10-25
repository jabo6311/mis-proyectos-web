import React, { useState } from "react";
import { Text, View, TouchableOpacity } from "react-native";
import { checkApi, apiDescription } from "./api-request";
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
export default function ConnectionStatus() {
  const [result,setResult]=useState(""), [checking,setChecking]=useState(false);
  return <View style={{padding:14,borderRadius:14,backgroundColor:"#eef3ed",gap:8,alignSelf:"stretch"}}>
    <Text style={{fontWeight:"700",color:"#214c37"}}>Conexión con el servidor</Text>
    <Text selectable style={{fontSize:12,color:"#526958"}}>{apiDescription(apiUrl)}</Text>
    <Text style={{fontSize:12,color:"#526958"}}>La versión de prueba usa el servidor del computador. Ambos equipos deben poder comunicarse en la red Wi-Fi; una red de invitados o una VPN puede impedirlo.</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:checking}} disabled={checking} style={{padding:12,minHeight:44,borderRadius:12,backgroundColor:"#dce9dc"}} onPress={async()=>{setChecking(true);setResult("");try{const data=await checkApi({apiUrl});setResult(`Servidor accesible${data.version?` · API ${data.version}`:""}. Si tu sesión sigue fallando, vuelve al inicio e inicia sesión de nuevo.`);}catch(error){setResult(error.message);}finally{setChecking(false);}}}>
      <Text style={{fontWeight:"700",textAlign:"center",color:"#197652"}}>{checking?"Comprobando…":"Comprobar conexión"}</Text>
    </TouchableOpacity>
    {result?<Text accessibilityRole="alert" style={{fontSize:13,lineHeight:19,color:"#214c37"}}>{result}</Text>:null}
  </View>;
}
