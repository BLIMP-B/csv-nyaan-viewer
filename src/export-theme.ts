import {createContext,useContext} from 'react';

export type ImageExportTheme='light'|'dark'|'screen';
export type ImageTheme='light'|'dark';
export function resolveImageTheme(setting:ImageExportTheme|undefined,screen:string|undefined):ImageTheme {
  return setting==='dark'||setting==='screen'&&screen==='dark'?'dark':'light';
}
export const ImageExportThemeContext=createContext<ImageTheme>('light');
export const useImageExportTheme=()=>useContext(ImageExportThemeContext);
