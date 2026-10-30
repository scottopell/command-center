export const root:string;
export const manifest:{engines:{node:string;npm:string};packageManager:string;dependencies:Record<string,string>;devDependencies:Record<string,string>};
export const xcodegen:Readonly<{version:string;url:string;sha256:string}>;
export const nativeToolDirectory:string;
export const nativeToolBinary:string;
export function assertRuntime():void;
export function xcodegenPath():string;
