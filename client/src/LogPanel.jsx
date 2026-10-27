import React, { useEffect, useRef } from 'react';

// Лог событий: автопрокрутка вниз.
export default function LogPanel({ log }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log]);
  return (
    <div className="card log">
      <h3>Журнал</h3>
      <div className="logbody" ref={ref}>
        {log.map((l, i) => <div key={i} className="lrow"><span className="lturn">{l.t}</span> {l.text}</div>)}
      </div>
    </div>
  );
}
