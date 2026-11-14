// FireCensus 3D scene for React — npm i @splinetool/react-spline @splinetool/runtime
import { useRef, useEffect } from 'react';
import Spline from '@splinetool/react-spline';

const SCENE_URL = 'https://prod.spline.design/i6gXDIRfGjWXMnZA/scene.splinecode';

// state: 'Welcome' | 'Focus_Terra' | 'Focus_Aqua' | 'Focus_SNPP' | 'Focus_NOAA20' | 'Focus_NOAA21'
//        | 'Story_Scan' | 'Story_Zoom' | 'Story_Handoff'
export default function FireCensusScene({ state = 'Welcome', onStateChange }) {
  const app = useRef(null);
  const drag = useRef({ on: false, x: 0, y: 0, yaw: 0, pitch: 0 });

  // page -> 3D: switch states
  useEffect(() => {
    app.current?.setVariable('scene', state);
  }, [state]);

  function onLoad(spline) {
    app.current = spline;
    spline.setVariable('scene', state);
    // 3D -> page: clicking a satellite / empty space changes the 'scene' variable
    let last = state;
    const poll = setInterval(() => {
      const v = spline.getVariable('scene');
      if (v !== last) { last = v; onStateChange?.(v); }
    }, 150);
    spline._fcPoll = poll;
  }
  useEffect(() => () => clearInterval(app.current?._fcPoll), []);

  // Test shortcuts: number keys 1–9 switch states, but ONLY with ?debug=1 in the URL
  // and never while the user is typing in a field (e.g. the date inputs).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    const STATES = ['Welcome', 'Focus_Terra', 'Focus_Aqua', 'Focus_SNPP', 'Focus_NOAA20',
      'Focus_NOAA21', 'Story_Scan', 'Story_Zoom', 'Story_Handoff'];
    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const i = '123456789'.indexOf(e.key);
      if (i >= 0) { app.current?.setVariable('scene', STATES[i]); onStateChange?.(STATES[i]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStateChange]);

  // drag to turn the globe (the wheel is left alone so the page can scroll)
  const down = e => { drag.current.on = true; drag.current.x = e.clientX; drag.current.y = e.clientY; };
  const move = e => {
    const d = drag.current;
    if (!d.on || !app.current) return;
    d.yaw += (e.clientX - d.x) * 0.3;
    d.pitch = Math.max(-35, Math.min(35, d.pitch + (e.clientY - d.y) * 0.2));
    d.x = e.clientX; d.y = e.clientY;
    app.current.setVariable('dragYaw', d.yaw);
    app.current.setVariable('dragPitch', d.pitch);
  };
  const up = () => { drag.current.on = false; };

  return (
    <div
      style={{ width: '100%', height: '100vh', touchAction: 'pan-y' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
    >
      <Spline scene={SCENE_URL} onLoad={onLoad} />
    </div>
  );
}
