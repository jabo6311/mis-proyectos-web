import {useEffect,useState} from 'react';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createEndpointStore} from './api-endpoint-store.cjs';
const endpoint=createEndpointStore({storage:AsyncStorage,defaultUrl:process.env.EXPO_PUBLIC_API_URL,allowLocalhost:Platform.OS==='web'});
export default function useApiEndpoint(){
  const [value,setValue]=useState(()=>endpoint.snapshot());
  useEffect(()=>{let live=true;const unsubscribe=endpoint.subscribe(setValue);endpoint.load().then(value=>{if(live)setValue(value);});return()=>{live=false;unsubscribe();};},[]);
  return {...value,save:(url,verify)=>endpoint.save(url,verify)};
}
