import {useState} from 'react';
import {defineFunction,useWorkerQuery,useWorkerMutation} from '@command-center/sdk';
import {contract} from './contract.ts';
function NotesView(){
  const [draft,setDraft]=useState(''),query=useWorkerQuery(contract,'read',{}),save=useWorkerMutation(contract,'save');
  return <div className="function"><header className="function-header"><strong>NOTES</strong><span>Installed from an independent folder</span></header><main><form className="editor" onSubmit={async e=>{e.preventDefault();try{const submitted=draft;await save.mutateAsync({text:submitted});setDraft(current=>current===submitted?'':current);}catch{/* The shared handle exposes the error. */}}}><label>Note<textarea data-initial-focus value={draft} onChange={e=>setDraft(e.target.value)}/></label><button disabled={save.isPending||save.isUnknown}>Save note</button>{save.error&&<p role="alert">{save.error.message}</p>}</form>{query.isPending&&<p>Reading notes…</p>}{query.error&&<p role="alert">{query.error.message}</p>}{query.data?.map(note=><p key={note.key} data-nav-item={note.key} className="literal">{note.text}</p>)}</main></div>;
}
export const notes=defineFunction({mnemonic:'NOTES',title:'Independent pack example',prepare({tail}){if(tail.trim())throw new Error('NOTES takes no arguments');return {};},View:NotesView});
