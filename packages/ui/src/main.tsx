import { mount } from './framework.tsx';
import { functions as registry } from '../../../.generated/ui.ts';
import './style.css';
const params=new URLSearchParams(location.search);
const definition=registry[params.get('function') as keyof typeof registry];
if(definition)mount(definition as any,params.get('tail')||'');
else document.getElementById('root')!.textContent='Unknown function';
