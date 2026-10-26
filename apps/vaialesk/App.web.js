import AppVersion from "./AppVersion";
import React,{useEffect,useState,useCallback} from "react";
import {View,Text,TouchableOpacity,ScrollView,StyleSheet} from "react-native";
import {SafeAreaProvider} from "react-native-safe-area-context";
import useVaiAuth from "./use-vai-auth";
import ProviderButtons from "./ProviderButtons";
import useDemoEngine from "./use-demo-engine";
import useConnectedEngine from "./use-connected-engine";
import MobilityApp from "./MobilityApp";
function Demo({role,onExit}){const e=useDemoEngine(),[started,setStarted]=useState(false);useEffect(()=>{if(e.ready&&!started){setStarted(true);e.action("ROLE",{role});}},[e.ready]);return <MobilityApp engine={e} onExit={onExit}/>;}
function Connected({auth,onExit}){const e=useConnectedEngine(auth.getCredentials);return <View style={{flex:1}}>{auth.error?<Text accessibilityRole="alert" style={{color:'#a33b2a',padding:12}}>{auth.error}</Text>:null}<MobilityApp engine={e} onExit={onExit} onLogout={async()=>{if(await auth.signOut())onExit();}}/></View>;}
export default function WebApp(){
 const[mode,setMode]=useState(null),[role,setRole]=useState("admin");
 const auth=useVaiAuth();
 useEffect(()=>{if(auth.session)setMode("connected");else setMode(current=>current==="connected"?null:current);},[auth.session]);
 return <SafeAreaProvider>{mode==="demo"?<Demo role={role} onExit={()=>setMode(null)}/>:mode==="connected"?<Connected auth={auth} onExit={()=>setMode(null)}/>:<ScrollView contentContainerStyle={s.page}><View style={s.card}><Text style={s.brand}>VAI.</Text><Text style={s.tag}>SANTO DOMINGO · CENTRO DE OPERACIÓN</Text><AppVersion/><Text style={s.title}>Tu operación, en un solo lugar.</Text><Text style={s.body}>Reservas, despacho, conductores, billeteras e incidencias. Explora cada rol con datos ficticios o entra con una cuenta autorizada.</Text>{[["admin","Probar administración"],["dispatcher","Probar despacho"],["passenger","Probar como usuario"],["driver","Probar como conductor"]].map(([key,label])=><TouchableOpacity key={key} accessibilityRole="button" style={s.button} onPress={()=>{setRole(key);setMode("demo");}}><Text style={s.buttonText}>{label} →</Text></TouchableOpacity>)}<Text style={[s.body,{marginBottom:0}]}>Entrar con mi cuenta</Text><ProviderButtons auth={auth}/>{auth.loading?<Text style={s.note}>Recuperando sesión…</Text>:null}{auth.error?<Text accessibilityRole="alert" style={{color:"#a33b2a"}}>{auth.error}</Text>:null}<Text style={s.note}>La presentación guarda su progreso en este navegador. Los mapas requieren internet. Los importes están en DOP; no se realizan cobros reales.</Text></View></ScrollView>}</SafeAreaProvider>;
}
const s=StyleSheet.create({page:{flexGrow:1,backgroundColor:"#f4f7f3",alignItems:"center",justifyContent:"center",padding:24},card:{maxWidth:620,width:"100%",padding:28,gap:14},brand:{fontSize:48,fontWeight:"900",color:"#153e31"},tag:{fontSize:10,letterSpacing:2,color:"#57745f",fontWeight:"700"},title:{fontSize:38,lineHeight:44,fontWeight:"800",color:"#193d2e",marginTop:12},body:{fontSize:16,lineHeight:25,color:"#607463",marginVertical:14},button:{backgroundColor:"#197652",padding:17,borderRadius:14,alignItems:"center"},buttonText:{color:"white",fontSize:15,fontWeight:"700"},note:{fontSize:12,lineHeight:19,color:"#6d806e"}});
