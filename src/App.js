// src/App.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";

/* Fix default marker icon path when using bundlers */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/* ---------- Sample EVs (IIT Bombay area) ---------- */
const initialEVs = [
  { id: 1, title: "Buggy (EV-01)", eta: "5 min", seats: 4, status: "Seats available", route: "Hostel 6 to Main gate", coords: [19.1338, 72.9140] },
  { id: 2, title: "Buggy (EV-02)", eta: "9 min", seats: 2, status: "Little busy", route: "Hostel 6 to Main gate", coords: [19.1345, 72.9128] },
  { id: 3, title: "Buggy (EV-03)", eta: "15 min", seats: 0, status: "No seats", route: "Hostel 6 to Main gate", coords: [19.1329, 72.9152] },
];

/* Fly-to helper */
function FlyToUser({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, 15, { duration: 1.1 });
  }, [position, map]);
  return null;
}

/* Pulsing DivIcon for selected EV (visual halo under the image marker) */
function PulsingMarker({ position, popup }) {
  const icon = L.divIcon({
    className: "pulse-div-icon",
    html: `<span class="pulse-outer"><span class="pulse-inner"></span></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
  return <Marker position={position} icon={icon}><Popup>{popup}</Popup></Marker>;
}

/* Small animated buggy SVG used in lists */
function MovingBuggyIcon({ className = "" }) {
  return (
    <svg className={`buggy-anim ${className}`} width="48" height="20" viewBox="0 0 48 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="0" y="2" width="44" height="12" rx="3" fill="url(#g)" />
      <circle cx="12" cy="16" r="2.4" fill="#fff" />
      <circle cx="34" cy="16" r="2.4" fill="#fff" />
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#6dd3ff"/>
          <stop offset="1" stopColor="#1f6feb"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function App() {
  const [screen, setScreen] = useState("signIn");
  const [language, setLanguage] = useState("English");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRoute, setSelectedRoute] = useState(initialEVs[0].route);
  const [query, setQuery] = useState("");
  const [selectedEV, setSelectedEV] = useState(null);
  const [waitingModal, setWaitingModal] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [evMarkerPos, setEvMarkerPos] = useState(null);

  // dynamic state with persistence
  const [evs, setEvs] = useState(() => {
    try { const raw = localStorage.getItem("wemove_evs"); return raw ? JSON.parse(raw) : initialEVs; } catch { return initialEVs; }
  });
  const [ridesCount, setRidesCount] = useState(() => Number(localStorage.getItem("wemove_rides") || 3));
  const [wallet, setWallet] = useState(() => Number(localStorage.getItem("wemove_wallet") || 150));
  const [ratings, setRatings] = useState(() => { const r = localStorage.getItem("wemove_ratings"); return r ? JSON.parse(r) : [5, 4]; });
  const [feedbacks, setFeedbacks] = useState(() => { const f = localStorage.getItem("wemove_feedbacks"); return f ? JSON.parse(f) : [{ id: 1, text: "Quick ride to the main gate.", date: new Date().toLocaleString() }]; });

  // loading + onboarding + theme
  const [loadingList, setLoadingList] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem("wemove_seen_onboard") !== "1");
  const [theme, setTheme] = useState(() => (localStorage.getItem("wemove_theme") || "light"));

  // persist state
  useEffect(() => localStorage.setItem("wemove_evs", JSON.stringify(evs)), [evs]);
  useEffect(() => localStorage.setItem("wemove_wallet", String(wallet)), [wallet]);
  useEffect(() => localStorage.setItem("wemove_rides", String(ridesCount)), [ridesCount]);
  useEffect(() => localStorage.setItem("wemove_ratings", JSON.stringify(ratings)), [ratings]);
  useEffect(() => localStorage.setItem("wemove_feedbacks", JSON.stringify(feedbacks)), [feedbacks]);
  useEffect(() => { localStorage.setItem("wemove_theme", theme); document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  const evMoveInterval = useRef(null);

  // EV movement simulation (when a selectedEV exists)
  useEffect(() => {
    if (selectedEV) {
      setEvMarkerPos(selectedEV.coords);
      let i = 0;
      evMoveInterval.current = setInterval(() => {
        setEvMarkerPos((p) => {
          if (!p) return selectedEV.coords;
          const next = [p[0] + (Math.random() - 0.5) * 0.0003, p[1] + (Math.random() - 0.5) * 0.0006];
          i++; if (i > 60) { clearInterval(evMoveInterval.current); evMoveInterval.current = null; }
          return next;
        });
      }, 800);
    }
    return () => { if (evMoveInterval.current) clearInterval(evMoveInterval.current); };
  }, [selectedEV]);

  // geolocation fallback
  useEffect(() => {
    if (!("geolocation" in navigator)) { setUserPos([19.1334, 72.9133]); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => setUserPos([19.1334, 72.9133]),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  // run skeleton load whenever user navigates to Home (keeps hooks order valid)
  useEffect(() => {
    if (screen === "home") startListLoad();
  }, [screen]);

  function signIn() { setScreen("home"); }
  function openDetails(ev) { setSelectedEV(ev); setScreen("evDetails"); startListLoad(); }
  function notifyDrivers() { setWaitingModal(false); alert("Drivers notified (mock)."); }

  // skeleton loader helper
  function startListLoad() {
    setLoadingList(true);
    setTimeout(() => setLoadingList(false), 520);
  }

  // Payment & boarding
  const FARE = 20;
  function doPayment(method = "UPI") {
    if (method === "UPI" && wallet >= FARE) { setWallet((w) => Math.max(0, w - FARE)); finalizeBoarding(); }
    else if (method === "UPI" && wallet < FARE) { alert("Low wallet — simulating external UPI (mock)."); finalizeBoarding(); }
    else finalizeBoarding();
  }
  function finalizeBoarding() {
    setEvs((prev) => prev.map((x) => x.id === selectedEV.id ? ({ ...x, seats: Math.max(0, x.seats - 1), status: Math.max(0, x.seats - 1) > 0 ? "Seats available" : "No seats" }) : x ));
    setRidesCount((r) => r + 1);
    setScreen("confirmation");
  }

  // feedback
  function submitFeedback(text, ratingValue) {
    if (text && text.trim().length > 0) setFeedbacks((f) => [{ id: Date.now(), text: text.trim(), date: new Date().toLocaleString() }, ...f]);
    if (ratingValue && ratingValue >= 1 && ratingValue <= 5) setRatings((r) => [...r, ratingValue]);
    alert("Thanks — feedback saved!");
  }
  function averageRating() { if (!ratings || ratings.length === 0) return 0; const sum = ratings.reduce((s, v) => s + v, 0); return (sum / ratings.length).toFixed(1); }

  // filter EVs tolerant
  const filteredEVs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const routeToken = (selectedRoute || "").split(" to ")[0].trim().toLowerCase();
    return evs.filter((e) => (q === "" || e.title.toLowerCase().includes(q) || e.route.toLowerCase().includes(q)) && (!routeToken || e.route.toLowerCase().includes(routeToken)));
  }, [query, selectedRoute, evs]);

  // onboarding dismiss
  function dismissOnboarding() { setShowOnboarding(false); localStorage.setItem("wemove_seen_onboard", "1"); }

  /* -------- prepare custom image icon for EV (uses /ev.png from public/) -------- */
  const evImageIcon = L.icon({
    iconUrl: "/ev.png",
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    className: "ev-image-marker"
  });

  /* ------------------ Render screens ------------------ */

  if (screen === "signIn") {
    return (
      <div className="app-shell">
        <div className="container card elevated">
          <div className="top-row">
            <img src="/logo.png" alt="WeMove" className="header-logo" />
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <div className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? "🌤" : "🌙"}
              </div>
            </div>
          </div>

          <div className="form-row">
            <label className="label">Identity</label>
            <input className="input" value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="Enter your IIT ID" />
          </div>

          <div className="form-row">
            <label className="label">Password</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          </div>

          <button className="btn btn-primary full" onClick={signIn}>Sign in</button>

          <div className="small muted center" style={{marginTop:8}}>Select language</div>
          <div className="lang-row">
            {["English", "Hindi"].map((l) => <button key={l} className={language === l ? "pill active" : "pill"} onClick={() => setLanguage(l)}>{l}</button>)}
          </div>
        </div>
      </div>
    );
  }

  /* HOME */
  if (screen === "home") {
    return (
      <div className="app-shell">
        <div className="container">
          <div className="header-row hero-header">
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <img src="/logo.png" alt="WeMove" className="header-logo" />
              <div>
                <div className="brand-large">WeMove</div>
                <div className="muted tiny">Campus shuttle • IIT Bombay</div>
              </div>
            </div>

            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <div className="muted tiny">Theme</div>
              <div className="theme-toggle" onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}>{theme === "light" ? "🌤" : "🌙"}</div>
            </div>
          </div>

          <div className="hero-card card">
            <img src="/ev-graphic.png" alt="WeMove shuttle" className="hero-graphic" />
            <div className="hero-content">
              <div className="h2">Get moving across campus</div>
              <div className="muted tiny">Quick EV pickups, live tracking and fast payments.</div>
              <div style={{marginTop:12}}>
                <button className="btn btn-primary" onClick={() => { setScreen("evList"); startListLoad(); }}>Find EVs nearby</button>
              </div>
            </div>
          </div>

          <div className="card search-card" style={{marginTop:12}}>
            <div className="small muted">See available EVs for your route</div>
            <input className="input" placeholder="Search (hostel / route / EV)" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="route-grid" style={{marginTop:12}}>
              {["Hostel 6 to Main gate","Hostel 5 to Main gate","Hostel 18 to Main gate","Hostel 17 to LHC"].map((r) => (
                <button key={r} className={selectedRoute === r ? "route-tile selected" : "route-tile"} onClick={() => setSelectedRoute(r)}>{r}</button>
              ))}
            </div>
          </div>

          <div className="section-title" style={{marginTop:12}}>Quick routes</div>

          {loadingList ? (
            <div className="list">
              {[1,2,3].map((k)=>(
                <div key={k} className="ev-row skeleton">
                  <div className="s-left"><div className="s-block s-icon" /><div className="s-block s-text" /></div>
                  <div className="s-right"><div className="s-block s-eta" /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="list">
              {filteredEVs.map((ev) => (
                <div key={ev.id} className="ev-row card-compact">
                  <div className="ev-left">
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <MovingBuggyIcon />
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <div className="ev-title">{ev.title}</div>
                        <div className={ev.seats > 0 ? "seat-badge available" : "seat-badge full"} title={ev.seats <= 2 && ev.seats > 0 ? "low" : ""}>
                          {ev.seats > 0 ? `${ev.seats} seats` : "Full"}
                        </div>
                      </div>
                    </div>
                    <div className="muted tiny">{ev.route}</div>
                  </div>

                  <div className="ev-right">
                    <div className="ev-eta">{ev.eta}</div>
                    <div className="muted tiny">{ev.status}</div>
                    <div className="ev-actions">
                      <button className="btn btn-ghost small" onClick={() => openDetails(ev)}>View</button>
                      <button className="btn btn-primary small" onClick={() => openDetails(ev)}>Track</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        <div className="bottom-nav">
          <div className="nav-inner">
            <button className="nav-btn" onClick={() => setScreen("home")}>Home</button>
            <button className="nav-btn" onClick={() => { setScreen("track"); setSelectedEV(null); }}>Track</button>
            <button className="nav-btn" onClick={() => setScreen("profile")}>Profile</button>
          </div>
        </div>

        {/* Onboarding tooltip (one-time) */}
        {showOnboarding && (
          <div className="onboard-overlay" onClick={dismissOnboarding}>
            <div className="onboard-card">
              <div style={{fontWeight:800, marginBottom:6}}>Welcome to WeMove</div>
              <div className="muted tiny">Tap <strong>Find EVs nearby</strong> to see live campus shuttles. Track and board easily.</div>
              <div style={{marginTop:12}}><button className="btn btn-primary small" onClick={dismissOnboarding}>Got it</button></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* EV List */
  if (screen === "evList") {
    return (
      <div className="app-shell">
        <div className="container">
          <div className="list-header">
            <button className="btn btn-ghost" onClick={() => setScreen("home")}>Back</button>
            <div className="header-title">EVs • {selectedRoute}</div>
            <div style={{ width: 48 }} />
          </div>

          <div className="list">
            {filteredEVs.length > 0 ? filteredEVs.map((ev) => (
              <div key={ev.id} className="ev-row card-compact">
                <div>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <MovingBuggyIcon className="small-buggy" />
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <div className="ev-title">{ev.title}</div>
                      <div className={ev.seats > 0 ? "seat-badge available" : "seat-badge full"}>{ev.seats > 0 ? `${ev.seats} seats` : "Full"}</div>
                    </div>
                  </div>
                  <div className="muted tiny">{ev.route}</div>
                  <div className="muted tiny">Seats: {ev.seats}</div>
                </div>

                <div className="ev-right">
                  <div className="ev-eta">{ev.eta}</div>
                  <div className="muted tiny">{ev.status}</div>
                  <div className="ev-actions">
                    <button className="btn btn-ghost small" onClick={() => openDetails(ev)}>Details</button>
                    <button className="btn btn-primary small" onClick={() => openDetails(ev)}>Track</button>
                  </div>
                </div>
              </div>
            )) : <div className="card-empty">Seems like there are no EVs near you — let drivers know you are waiting</div>}
          </div>
        </div>
      </div>
    );
  }

  /* EV Details + Map */
  if (screen === "evDetails" && selectedEV) {
    const user = userPos || [19.1334, 72.9133];
    const ev = evMarkerPos || selectedEV.coords;
    const destination = [19.1349, 72.9174];
    const polyline = [user, ev, destination];
    const latestEV = evs.find((x) => x.id === selectedEV.id) || selectedEV;

    return (
      <div className="app-shell">
        <div className="container">
          <div className="list-header">
            <button className="btn btn-ghost" onClick={() => setScreen("evList")}>Back</button>
            <div className="header-title">{selectedEV.title}</div>
            <div style={{ width: 48 }} />
          </div>

          <div className="card map-card">
            <div className="map-and-info">
              <div className="map-frame">
                <MapContainer center={user} zoom={15} style={{ height: "260px", borderRadius: 12, overflow: "hidden" }}>
                  <TileLayer attribution='© OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                  <Marker position={user}><Popup>You (approx)</Popup></Marker>

                  {/* base marker at EV's static coords */}
                  <Marker position={selectedEV.coords}><Popup>{selectedEV.title}</Popup></Marker>

                  {/* pulsing halo + image marker for live EV */}
                  {evMarkerPos && <PulsingMarker position={evMarkerPos} popup={"Live EV halo"} />}
                  {evMarkerPos && <Marker position={evMarkerPos} icon={evImageIcon}><Popup>Live EV</Popup></Marker>}

                  <Polyline positions={polyline} color="#1f6feb" />
                  <FlyToUser position={user} />
                </MapContainer>
              </div>

              <div className="map-info">
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <div className="ev-title">{selectedEV.route}</div>
                  <div className={latestEV.seats > 0 ? "seat-badge available" : "seat-badge full"}>{latestEV.seats > 0 ? `${latestEV.seats} seats` : "Full"}</div>
                </div>
                <div className="muted tiny">Approximately {latestEV.seats} passengers • {latestEV.status}</div>
                <div className="muted tiny">Payment: UPI / Cash</div>
                <div className="map-eta-row">
                  <div className="ev-eta">{selectedEV.eta}</div>
                  <div className="muted tiny">Estimated arrival</div>
                </div>
              </div>
            </div>

            <div className="btm-actions">
              <button className="btn btn-ghost full" onClick={() => setWaitingModal(true)}>I am waiting</button>
              <button className="btn btn-primary full" onClick={() => { if (latestEV.seats <= 0) { alert("No seats available."); return; } setScreen("pay"); }}>Board / Pay</button>
            </div>
          </div>
        </div>

        {waitingModal && (
          <div className="sheet-backdrop" onClick={() => setWaitingModal(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontWeight:700}}>Notify drivers</div>
                <div className="muted tiny">ETA {selectedEV.eta}</div>
              </div>
              <div className="muted tiny" style={{marginTop:8}}>Let drivers know you are waiting — they may stop if there is space.</div>
              <div style={{display:'flex',gap:10,marginTop:12}}>
                <button className="btn btn-primary full" onClick={notifyDrivers}>Notify</button>
                <button className="btn btn-ghost full" onClick={() => setWaitingModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* Payment */
  if (screen === "pay") {
    const latestEV = evs.find((x) => x.id === selectedEV.id) || selectedEV;
    const canBoard = latestEV.seats > 0;
    return (
      <div className="app-shell">
        <div className="container">
          <div className="list-header">
            <button className="btn btn-ghost" onClick={() => setScreen("evDetails")}>Back</button>
            <div className="header-title">Payment</div>
            <div style={{ width: 48 }} />
          </div>

          <div className="card">
            <div className="muted small">Choose payment method</div>
            <label className="pay-option"><input type="radio" name="pay" defaultChecked /> <div><div style={{fontWeight:700}}>UPI / Wallet (₹{FARE})</div><div className="muted tiny">Wallet: ₹{wallet}</div></div></label>
            <label className="pay-option"><input type="radio" name="pay" /> <div><div style={{fontWeight:700}}>Cash</div><div className="muted tiny">Pay driver</div></div></label>

            <div style={{marginTop:12}}>
              <button className="btn btn-primary full" onClick={() => { if (!canBoard) { alert("No seats available."); setScreen("evDetails"); return; } doPayment("UPI"); }}>Pay & Board</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* Confirmation */
  if (screen === "confirmation") {
    return (
      <div className="app-shell">
        <div className="container center">
          <div className="card confirmation-card">
            <div className="done-emoji">✔️</div>
            <div className="h2">You are onboard 🎉</div>
            <div className="muted small">Payment and boarding confirmed.</div>
            <div style={{marginTop:12}}><button className="btn btn-primary full" onClick={() => setScreen("profile")}>Go to Profile</button></div>
          </div>
        </div>
      </div>
    );
  }

  /* Profile */
  if (screen === "profile") {
    return (
      <div className="app-shell">
        <div className="container">
          <div className="header-row"><div className="brand-large">Your Profile</div><div style={{width:48}} /></div>

          <div className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div><div style={{fontWeight:800,fontSize:18}}>User: {identity || "Guest"}</div><div className="muted tiny">Language: {language}</div></div>
              <div style={{textAlign:'right'}}><div style={{fontWeight:800}}>Rides</div><div className="muted tiny">{ridesCount}</div></div>
            </div>

            <div style={{display:'flex',gap:10,marginTop:12}}>
              <div className="wallet-card"><div style={{fontWeight:800}}>Wallet</div><div style={{marginTop:6}}>₹{wallet}</div><div className="muted tiny">Tap to add</div><div style={{marginTop:8}}><button className="btn btn-ghost small" onClick={() => setWallet((w)=>w+100)}>Add ₹100</button></div></div>
              <div className="wallet-card"><div style={{fontWeight:800}}>Rating</div><div style={{marginTop:6,fontSize:18}}>{averageRating()} ★</div><div className="muted tiny">based on {ratings.length} ratings</div></div>
            </div>
          </div>

          <div className="card" style={{marginTop:12}}><div style={{fontWeight:800}}>Give feedback & rating</div><FeedbackForm onSubmit={submitFeedback} /></div>

          <div className="section-title" style={{marginTop:12}}>Feedback</div>
          <div className="list" style={{marginTop:8}}>{feedbacks.length===0 && <div className="card-empty">No feedback yet</div>}{feedbacks.map(f=> (<div key={f.id} className="card-compact" style={{padding:12}}><div style={{fontWeight:700}}>{f.text}</div><div className="muted tiny" style={{marginTop:6}}>{f.date}</div></div>))}</div>

        </div>

        <div className="bottom-nav">
          <div className="nav-inner">
            <button className="nav-btn" onClick={() => setScreen("home")}>Home</button>
            <button className="nav-btn" onClick={() => setScreen("track")}>Track</button>
            <button className="nav-btn" onClick={() => setScreen("profile")}>Profile</button>
          </div>
        </div>
      </div>
    );
  }

  /* fallback */
  return (
    <div className="app-shell">
      <div className="container card">
        <div className="h2">Unknown screen</div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => setScreen("home")}>Go Home</button>
        </div>
      </div>
    </div>
  );
}

/* Feedback form */
function FeedbackForm({ onSubmit }) {
  const [text, setText] = useState("");
  const [ratingValue, setRatingValue] = useState(5);
  return (
    <div style={{marginTop:8,display:'grid',gap:8}}>
      <textarea className="input" rows={3} value={text} onChange={(e)=>setText(e.target.value)} placeholder="Share your experience..." />
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <div style={{fontWeight:700}}>Rating</div>
        <select value={ratingValue} onChange={(e)=>setRatingValue(Number(e.target.value))} className="input" style={{width:120,padding:'8px'}}>
          <option value={5}>5 ★</option><option value={4}>4 ★</option><option value={3}>3 ★</option><option value={2}>2 ★</option><option value={1}>1 ★</option>
        </select>
        <div style={{flex:1}} />
        <button className="btn btn-primary small" onClick={()=>{ onSubmit(text, ratingValue); setText(""); setRatingValue(5); }}>Submit</button>
      </div>
    </div>
  );
}
