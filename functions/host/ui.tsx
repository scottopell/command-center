import {drqsContract,hostContract} from '../../packages/contracts/src/builtins.ts';
import {useState} from 'react';
import {defineFunction} from '../../packages/sdk/src/framework.tsx';
import {useWorkerQuery} from '../../packages/sdk/src/queries.tsx';
// REQ-HO-001..006, REQ-HO-005, REQ-QL-004: query snapshot is authoritative; selection/filter remain local UI state.
function HostView(){
  const query=useWorkerQuery(hostContract,'snapshot',{}),snapshot=query.data;
  const [selected,setSelected]=useState(''),[filter,setFilter]=useState('');
  const service=snapshot?.services.find(s=>s.label===selected),stale=Boolean(snapshot?.sources.some(source=>source.state==='stale'));
  const value=(v:unknown)=>v===null||v===undefined?'—':typeof v==='object'?JSON.stringify(v):String(v);
  return <div className="function host" aria-busy={query.isFetching} data-initial-focus tabIndex={0}><header className="function-header"><strong>HOST</strong><span>Local machine and user services</span><button aria-disabled={query.isFetching} onClick={()=>{if(!query.isFetching)void query.refetch();}}>{query.isFetching?'Reading…':'Refresh'}</button></header><main>
    {query.error&&<p role="alert" className="error">{snapshot?'Stale snapshot retained. ':''}{query.error.message}</p>}
    {snapshot?<><div className="section-heading">{stale?'STALE HOST SNAPSHOT':'HOST SNAPSHOT'} <span>{new Date(snapshot.observedAt).toLocaleString()} · Checked {query.dataUpdatedAt?new Date(query.dataUpdatedAt).toLocaleString():'—'}</span></div>
    {stale&&<p className="error" role="status">The latest source observation failed. The last complete snapshot remains visible; its original collection time is preserved.</p>}
    <div className="host-basics"><section><h2>Machine · backend process</h2><dl>{Object.entries(snapshot.machine).map(([key,v])=><div key={key}><dt>{key}</dt><dd>{value(v)}</dd></div>)}</dl></section><section><h2>Backend environment · allowlisted values</h2><dl>{Object.entries(snapshot.environment).map(([key,v])=><div key={key}><dt>{key}</dt><dd>{value(v)}</dd></div>)}</dl></section></div>
    <h2>Observation sources</h2><div className="sources">{snapshot.sources.map((s,i)=><div key={i} className={s.state==='unavailable'||s.state==='discovery error'?'error':'muted'}>{value(s.path||s.source)} · {value(s.state)} {s.error||s.message?value(s.error||s.message):''}</div>)}</div>
    <div className="section-heading">USER SERVICES <span>Read-only · reachability is not application health</span></div><label className="filter-label">Filter<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Service label"/></label>
    <div className="service-layout"><table><thead><tr><th>Service label</th><th>Runtime</th><th>PID</th><th>Last exit</th></tr></thead><tbody>{snapshot.services.filter(s=>String(s.label).toLowerCase().includes(filter.toLowerCase())).map(s=><tr key={String(s.label)} data-nav-item={String(s.label)} className={selected===s.label?'selected':''}><td><button className="link" onClick={()=>setSelected(String(s.label))}>{String(s.label)}</button></td><td>{value(s.state)}</td><td>{value(s.pid)}</td><td>{value(s.lastExit)}</td></tr>)}</tbody></table><aside>{service?<><h2>{String(service.label)}</h2><dl>{Object.entries(service).filter(([k])=>k!=='label').map(([k,v])=><div key={k}><dt>{k}</dt><dd>{value(v)}</dd></div>)}</dl></>:<p className="muted">{selected?'The selected service is not in this snapshot. ':''}Select a service to inspect its definitions, declared paths, logs, and port observations.</p>}</aside></div></>:!query.error&&<p className="muted">Reading host observations…</p>}
  </main><footer>No service controls · Toolkit declarations + user LaunchAgents + launchctl runtime</footer></div>;
}
export const host=defineFunction({mnemonic:'HOST',title:'Host and user service inspection',prepare({tail}){if(tail.trim())throw new Error('HOST takes no tail arguments');return {};},View:HostView});
