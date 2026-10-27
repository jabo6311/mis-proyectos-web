import WelcomeScreen from "./WelcomeScreen";
import React,{useEffect,useState} from "react";
import {View,Text} from "react-native";
import {SafeAreaProvider} from "react-native-safe-area-context";
import useVaiAuth from "./use-vai-auth";
import useDemoEngine from "./use-demo-engine";
import useConnectedEngine from "./use-connected-engine";
import MobilityApp from "./MobilityApp";
function Demo({role,onExit}){const e=useDemoEngine(),[started,setStarted]=useState(false);useEffect(()=>{if(e.ready&&!started){setStarted(true);e.action("ROLE",{role});}},[e.ready]);return <MobilityApp engine={e} onExit={onExit}/>;}
function Connected({auth,onExit}){const e=useConnectedEngine(auth.getCredentials);return <View style={{flex:1}}>{auth.error?<Text accessibilityRole="alert" style={{color:'#a33b2a',padding:12}}>{auth.error}</Text>:null}<MobilityApp engine={e} onExit={onExit} onLogout={async()=>{if(await auth.signOut())onExit();}}/></View>;}
export default function WebApp(){
 const[mode,setMode]=useState(null),[role,setRole]=useState("admin");
 const auth=useVaiAuth();
 useEffect(()=>{if(auth.session)setMode("connected");else setMode(current=>current==="connected"?null:current);},[auth.session]);
 return <SafeAreaProvider>{mode==="demo"?<Demo role={role} onExit={()=>setMode(null)}/>:mode==="connected"?<Connected auth={auth} onExit={()=>setMode(null)}/>:<WelcomeScreen connected={mode==="signin"} auth={auth} error={auth.error} onDemo={key=>{setRole(key);setMode("demo");}} onConnect={()=>setMode("signin")} onBack={()=>setMode(null)}/>}</SafeAreaProvider>;
}
