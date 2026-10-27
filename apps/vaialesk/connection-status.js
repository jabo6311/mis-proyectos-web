import React, { useEffect, useState } from "react";
import { Text, TextInput, View, TouchableOpacity } from "react-native";
import { checkApi, apiDescription } from "./api-request";
import useApiEndpoint from './use-api-endpoint';
export default function ConnectionStatus() {
  const {url:apiUrl,ready,save}=useApiEndpoint();
  const [result,setResult]=useState(''),[checking,setChecking]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState('');
  useEffect(()=>setDraft(apiUrl||''),[apiUrl]);
  async function check(change=false){setChecking(true);setResult('');try{
    if(change){await save(draft,url=>checkApi({apiUrl:url}));setEditing(false);setResult('Servidor guardado. Puedes continuar con tu cuenta.');}
    else {const data=await checkApi({apiUrl});setResult(`Servidor accesible${data.version?` · API ${data.version}`:''}.`);}
  }catch(error){setResult(error.message);}finally{setChecking(false);}}
  const button={padding:12,minHeight:44,borderRadius:12,backgroundColor:'#e0ede5'};
  return <View style={{padding:14,borderRadius:14,backgroundColor:'#f0f5f3',gap:8,alignSelf:'stretch'}}>
    <Text style={{fontWeight:'700',color:'#25433d'}}>Conexión con el servidor</Text>
    <Text selectable style={{fontSize:12,color:'#526a74'}}>{apiDescription(apiUrl)}</Text>
    <Text style={{fontSize:12,color:'#526a74'}}>{apiUrl?.includes(".trycloudflare.com")?"Servidor temporal por internet: mantén el Mac encendido y el túnel abierto durante la prueba. Si se reinicia el túnel, actualiza aquí su nueva dirección HTTPS.":apiUrl?.startsWith("https:")?"La conexión usa HTTPS. Puedes entrar desde cualquier red que tenga acceso a internet.":"Para esta prueba local, el teléfono debe poder comunicarse con el computador por Wi-Fi. Si cambia su dirección, puedes actualizarla aquí."}</Text>
    <TouchableOpacity accessibilityRole="button" disabled={checking||!ready} style={button} onPress={()=>check()}><Text style={{fontWeight:'700',textAlign:'center',color:'#0c7557'}}>{checking?'Comprobando…':'Comprobar conexión'}</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={checking} onPress={()=>{setEditing(!editing);setResult('');}} style={{padding:10,minHeight:44}}><Text style={{textAlign:'center',fontWeight:'700',color:'#0c7557'}}>{editing?'Cancelar cambio':'Cambiar servidor'}</Text></TouchableOpacity>
    {editing?<><Text style={{fontSize:13,color:'#25433d'}}>Dirección del servidor de VAI</Text><TextInput accessibilityLabel="Dirección del servidor de VAI" value={draft} onChangeText={setDraft} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!checking} placeholder="https://api.tu-dominio.com" style={{backgroundColor:'white',borderWidth:1,borderColor:'#a7bba9',borderRadius:10,padding:12,color:'#25433d'}}/><Text style={{fontSize:12,color:'#526a74'}}>Usa únicamente tu servidor de VAI. Primero comprobaremos la conexión sin enviar tu sesión. HTTP se admite sólo para direcciones de red local.</Text><TouchableOpacity accessibilityRole="button" disabled={checking||!ready} style={button} onPress={()=>check(true)}><Text style={{fontWeight:'700',textAlign:'center',color:'#0c7557'}}>Guardar y reconectar</Text></TouchableOpacity></>:null}
    {result?<Text accessibilityRole="alert" style={{fontSize:13,lineHeight:19,color:'#25433d'}}>{result}</Text>:null}
  </View>;
}
